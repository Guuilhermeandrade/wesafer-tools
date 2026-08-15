const AUTH_KEY = "wesaferAuth"


const STORAGE_PRE_AUTORIZADOS = "preAutorizadosWesafer"

function normalizarNomePreAutorizado(valor){
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .replace(/\s+/g," ")
        .trim()
        .toUpperCase()
}

function normalizarCpfPreAutorizado(valor){
    return String(valor || "").replace(/\D/g,"")
}

function obterBasePreAutorizados(){
    try{
        const dados = JSON.parse(localStorage.getItem(STORAGE_PRE_AUTORIZADOS) || "null")
        return dados && Array.isArray(dados.itens) ? dados : null
    }catch(erro){
        return null
    }
}


async function carregarBasePreAutorizadosSupabase(){
    const resposta = await fetch(
        `${SUPABASE_REST_URL}/pre_autorizados?select=nome,nome_normalizado,empresa,regional,area,arquivo_origem,atualizado_em&order=atualizado_em.desc`,
        {headers:supabaseHeaders()}
    )

    if(!resposta.ok){
        const erro = await resposta.text()
        throw new Error(`Falha ao carregar pré-autorizados: ${resposta.status} ${erro}`)
    }

    const dados = await resposta.json()

    if(!Array.isArray(dados) || !dados.length){
        return obterBasePreAutorizados()
    }

    const recente = dados[0]

    const base = {
        versao:3,
        criterio:"nome_completo",
        arquivo:recente.arquivo_origem || "Lista salva no Supabase",
        atualizadoEm:recente.atualizado_em || "",
        total:dados.length,
        ignorados:0,
        abasLidas:0,
        itens:dados.map(item => ({
            nome:item.nome || "",
            nomeNormalizado:item.nome_normalizado || normalizarNomePreAutorizado(item.nome),
            empresa:item.empresa || "",
            regional:item.regional || "",
            area:item.area || ""
        }))
    }

    // Cache local apenas para uso rápido na página Acessos.
    localStorage.setItem(STORAGE_PRE_AUTORIZADOS, JSON.stringify(base))

    return base
}




async function atualizarIndicadoresPreAutorizadosSupabase(){
    const campoArquivo = document.getElementById("nomeArquivoPreAutorizados")
    const campoQtd = document.getElementById("qtdPreAutorizados")
    const campoData = document.getElementById("dataPreAutorizados")
    const campoInfo = document.getElementById("infoImportacaoPreAutorizados")

    const sessao = obterSessao()

    if(!sessao?.access_token){
        console.warn("Sessão não disponível para atualizar indicadores de pré-autorizados.")
        return
    }

    try{
        const resposta = await fetch(
            `${SUPABASE_REST_URL}/pre_autorizados?select=arquivo_origem,atualizado_em&order=atualizado_em.desc`,
            {
                headers:{
                    "apikey":SUPABASE_KEY,
                    "Authorization":`Bearer ${sessao.access_token}`,
                    "Content-Type":"application/json"
                }
            }
        )

        if(!resposta.ok){
            throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`)
        }

        const dados = await resposta.json()

        if(!Array.isArray(dados) || dados.length === 0){
            if(campoArquivo) campoArquivo.innerText = "Nenhuma lista salva no Supabase"
            if(campoQtd) campoQtd.innerText = "0"
            if(campoData) campoData.innerText = "—"
            if(campoInfo) campoInfo.innerText = "Nenhum técnico disponível na lista mensal."
            return
        }

        const maisRecente = dados[0]

        if(campoArquivo){
            campoArquivo.innerText = maisRecente.arquivo_origem || "Lista salva no Supabase"
        }

        if(campoQtd){
            campoQtd.innerText = String(dados.length)
        }

        if(campoData){
            const valor = maisRecente.atualizado_em
            if(valor){
                const dataAtualizacao = new Date(valor)
                campoData.innerText = Number.isNaN(dataAtualizacao.getTime())
                    ? valor
                    : dataAtualizacao.toLocaleString("pt-BR")
            }else{
                campoData.innerText = "Salva no Supabase"
            }
        }

        if(campoInfo){
            campoInfo.innerText = `${dados.length} técnico(s) disponíveis • validação por nome completo`
        }
    }catch(erro){
        console.error("Erro ao atualizar indicadores de pré-autorizados:", erro)

        // Importante: não sobrescreve os indicadores com "Nenhuma lista".
        // Mantém na tela o último valor válido já renderizado.
    }
}

function atualizarResumoPreAutorizados(base){
    const nome = document.getElementById("nomeArquivoPreAutorizados")
    const qtd = document.getElementById("qtdPreAutorizados")
    const data = document.getElementById("dataPreAutorizados")
    const info = document.getElementById("infoImportacaoPreAutorizados")

    if(!base || !Array.isArray(base.itens) || !base.itens.length){
        if(nome) nome.innerText = "Nenhuma lista carregada"
        if(qtd) qtd.innerText = "0"
        if(data) data.innerText = "—"
        if(info) info.innerText = "Nenhuma lista mensal disponível no Supabase."
        return
    }

    if(nome) nome.innerText = base.arquivo || "Lista salva no Supabase"
    if(qtd) qtd.innerText = String(base.total || base.itens.length)

    if(data){
        if(base.atualizadoEm){
            const d = new Date(base.atualizadoEm)
            data.innerText = Number.isNaN(d.getTime()) ? base.atualizadoEm : d.toLocaleString("pt-BR")
        }else{
            data.innerText = "Salva no Supabase"
        }
    }

    if(info){
        info.innerText = `${base.total || base.itens.length} técnico(s) disponíveis • validação por nome completo`
    }
}

function localizarColunaCabecalho(celulas, candidatos){
    const normalizadas = celulas.map(normalizarNomePreAutorizado)
    return normalizadas.findIndex(valor =>
        candidatos.some(candidato => valor === candidato || valor.includes(candidato))
    )
}

async function importarPlanilhaPreAutorizados(evento){
    const arquivo = evento?.target?.files?.[0]
    if(!arquivo) return
    if(typeof XLSX === "undefined"){
        mostrarToast("Não foi possível carregar o leitor de Excel. Verifique a conexão e tente novamente.", "erro", "Excel indisponível")
        evento.target.value = ""
        return
    }
    try{
        const buffer = await arquivo.arrayBuffer()
        const workbook = XLSX.read(buffer, {type:"array"})
        const mapa = new Map()
        let ignorados = 0
        let abasLidas = 0
        workbook.SheetNames.forEach(nomeAba => {
            const sheet = workbook.Sheets[nomeAba]
            const linhas = XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:""})
            let indiceCabecalho=-1,colunaNome=-1,colunaEmpresa=-1,colunaRegional=-1,colunaArea=-1
            for(let i=0;i<Math.min(linhas.length,25);i++){
                const linha=Array.isArray(linhas[i])?linhas[i]:[]
                const nomeIdx=localizarColunaCabecalho(linha,["NOME DO TECNICO","NOME DO TÉCNICO","NOME TECNICO","NOME TÉCNICO","NOME COMPLETO","NOME"])
                if(nomeIdx>=0){
                    indiceCabecalho=i; colunaNome=nomeIdx
                    colunaEmpresa=localizarColunaCabecalho(linha,["EMPRESA"])
                    colunaRegional=localizarColunaCabecalho(linha,["REGIONAL"])
                    colunaArea=localizarColunaCabecalho(linha,["AREA","ÁREA"])
                    break
                }
            }
            if(indiceCabecalho<0) return
            abasLidas++
            for(let i=indiceCabecalho+1;i<linhas.length;i++){
                const linha=Array.isArray(linhas[i])?linhas[i]:[]
                const nomeOriginal=String(linha[colunaNome]||"").trim()
                const nomeNormalizado=normalizarNomePreAutorizado(nomeOriginal)
                if(!nomeNormalizado||nomeNormalizado.length<5){ignorados++;continue}
                if(!mapa.has(nomeNormalizado)){
                    mapa.set(nomeNormalizado,{nome:nomeOriginal,nomeNormalizado,
                        empresa:colunaEmpresa>=0?String(linha[colunaEmpresa]||"").trim():"",
                        regional:colunaRegional>=0?String(linha[colunaRegional]||"").trim():"",
                        area:colunaArea>=0?String(linha[colunaArea]||"").trim():"",aba:nomeAba})
                }
            }
        })
        const itens=Array.from(mapa.values()).sort((a,b)=>a.nomeNormalizado.localeCompare(b.nomeNormalizado,"pt-BR"))
        if(!itens.length){mostrarToast("Nenhum nome de técnico válido foi encontrado na planilha.","aviso","Lista não atualizada");evento.target.value="";return}
        const base={versao:2,criterio:"nome_completo",arquivo:arquivo.name,atualizadoEm:new Date().toISOString(),total:itens.length,ignorados,abasLidas,itens}
        const atualizadoEm=new Date().toISOString()
        const registros=itens.map(item=>({
            nome:item.nome||"",
            nome_normalizado:item.nomeNormalizado||normalizarNomePreAutorizado(item.nome),
            empresa:item.empresa||"",
            regional:item.regional||"",
            area:item.area||"",
            arquivo_origem:arquivo.name,
            atualizado_em:atualizadoEm
        }))

        const respostaBackup=await fetch(`${SUPABASE_REST_URL}/pre_autorizados?select=nome,nome_normalizado,empresa,regional,area,arquivo_origem,atualizado_em`,{headers:supabaseHeaders()})
        const backup=respostaBackup.ok?await respostaBackup.json():[]

        const limpar=await fetch(`${SUPABASE_REST_URL}/pre_autorizados?id=not.is.null`,{
            method:"DELETE",headers:supabaseHeaders("return=minimal")
        })
        if(!limpar.ok) throw new Error("Não foi possível substituir a lista: "+await limpar.text())

        try{
            for(let inicio=0;inicio<registros.length;inicio+=500){
                const resposta=await fetch(`${SUPABASE_REST_URL}/pre_autorizados`,{
                    method:"POST",headers:supabaseHeaders("return=minimal"),
                    body:JSON.stringify(registros.slice(inicio,inicio+500))
                })
                if(!resposta.ok) throw new Error(await resposta.text())
            }
        }catch(erroGravacao){
            await fetch(`${SUPABASE_REST_URL}/pre_autorizados?id=not.is.null`,{method:"DELETE",headers:supabaseHeaders("return=minimal")})
            if(backup.length){
                await fetch(`${SUPABASE_REST_URL}/pre_autorizados`,{
                    method:"POST",headers:supabaseHeaders("return=minimal"),body:JSON.stringify(backup)
                })
            }
            throw erroGravacao
        }

        const baseSalva={...base,versao:3,atualizadoEm,total:itens.length}
        localStorage.setItem(STORAGE_PRE_AUTORIZADOS,JSON.stringify(baseSalva))
        atualizarResumoPreAutorizados(baseSalva)
        mostrarToast(`${itens.length} pré-autorizado(s) salvos no Supabase. A lista agora fica disponível nos outros computadores.`,"sucesso","Lista sincronizada")
        await atualizarIndicadoresPreAutorizadosSupabase()
    }catch(erro){
        console.error("Erro ao importar pré-autorizados:",erro)
        mostrarToast("Não foi possível ler essa planilha Excel.","erro","Falha na importação")
    }finally{if(evento?.target) evento.target.value=""}
}

function obterSessao(){
    try{
        return JSON.parse(localStorage.getItem(AUTH_KEY) || "null")
    }catch(erro){
        console.error("Erro ao ler sessão:", erro)
        return null
    }
}

function salvarSessao(dados){
    const sessaoAtual = obterSessao() || {}

    localStorage.setItem(AUTH_KEY, JSON.stringify({
        access_token: dados.access_token || sessaoAtual.access_token,
        refresh_token: dados.refresh_token || sessaoAtual.refresh_token,
        user: dados.user || sessaoAtual.user,
        logado_em: sessaoAtual.logado_em || new Date().toISOString(),
        renovado_em: new Date().toISOString()
    }))
}

async function renovarSessao(){
    const sessao = obterSessao()

    if(!sessao || !sessao.refresh_token){
        return false
    }

    try{
        const resposta = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method:"POST",
            headers:{
                apikey: SUPABASE_ANON_KEY,
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                refresh_token:sessao.refresh_token
            })
        })

        const dados = await resposta.json()

        if(!resposta.ok || !dados.access_token){
            return false
        }

        salvarSessao(dados)
        return true
    }catch(erro){
        console.error("Erro ao renovar sessão:", erro)
        return false
    }
}

async function validarAccessToken(){
    const sessao = obterSessao()

    if(!sessao || !sessao.access_token){
        return false
    }

    try{
        const resposta = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers:{
                apikey: SUPABASE_ANON_KEY,
                Authorization:`Bearer ${sessao.access_token}`
            }
        })

        return resposta.ok
    }catch(erro){
        return false
    }
}

async function verificarLogin(){
    const sessao = obterSessao()

    if(!sessao || !sessao.access_token){
        window.location.href = "login.html"
        return false
    }

    if(await validarAccessToken()){
        return true
    }

    if(await renovarSessao()){
        return true
    }

    localStorage.removeItem(AUTH_KEY)
    window.location.href = "login.html"
    return false
}

function sairSistema(){
    localStorage.removeItem(AUTH_KEY)
    window.location.href = "login.html"
}


function atualizarDataPlantao(){
    const campo = document.getElementById("dataPlantao")
    if(!campo) return

    const agora = new Date()
    const dias = ["DOMINGO","SEGUNDA-FEIRA","TERÇA-FEIRA","QUARTA-FEIRA","QUINTA-FEIRA","SEXTA-FEIRA","SÁBADO"]
    const diaSemana = dias[agora.getDay()]
    const dia = String(agora.getDate()).padStart(2,"0")
    const mes = String(agora.getMonth() + 1).padStart(2,"0")
    const ano = agora.getFullYear()

    campo.textContent = `▣ ${diaSemana}, ${dia}/${mes}/${ano}`
}


function toggleMenuUsuarioAutorizados(evento){
    if(evento){
        evento.preventDefault()
        evento.stopPropagation()
    }

    const menu = document.getElementById("menuUsuario")
    if(!menu) return

    const aberto = menu.classList.toggle("aberto")

    // Garantia adicional contra CSS antigo da página.
    menu.style.display = aberto ? "block" : "none"
}

document.addEventListener("click", function(evento){
    const menu = document.getElementById("menuUsuario")
    const botao = document.getElementById("btnMenuUsuario")

    if(!menu || !botao) return

    if(!menu.contains(evento.target) && evento.target !== botao){
        menu.classList.remove("aberto")
        menu.style.display = "none"
    }
})


function configurarMenuUsuario(){
    const btnMenuUsuario = document.getElementById("btnMenuUsuario")
    const menuUsuario = document.getElementById("menuUsuario")

    if(!btnMenuUsuario || !menuUsuario){
        return
    }

    btnMenuUsuario.addEventListener("click", evento => {
        evento.stopPropagation()
        menuUsuario.classList.toggle("aberto")
    })

    menuUsuario.addEventListener("click", evento => {
        evento.stopPropagation()
    })

    document.addEventListener("click", () => {
        menuUsuario.classList.remove("aberto")
    })
}



function textoStatusRelatorio(status){
    const mapa = {
        aguardando:"AGUARDANDO LIBERAÇÃO",
        liberado:"LIBERADO",
        entrada:"ENTRADA",
        saida:"SAÍDA",
        arquivado:"ARQUIVADO"
    }

    return mapa[String(status || "").toLowerCase()] || String(status || "").toUpperCase()
}

function tipoAtividadeRelatorio(acesso){
    if(acesso?.operacao === true){ return "OPERAÇÃO" }
    if(acesso?.implantacao === true){ return "IMPLANTAÇÃO" }

    const texto = `${acesso?.acao || ""}`.toUpperCase()
    if(texto.includes("OPERA")){ return "OPERAÇÃO" }
    if(texto.includes("IMPLANTA")){ return "IMPLANTAÇÃO" }

    return "-"
}

function usuarioSessaoRelatorio(){
    const sessao = obterSessao ? obterSessao() : null
    return sessao?.user?.email || sessao?.user?.user_metadata?.name || "WESAFER TOOLS"
}

async function registrarHistoricoAcesso(acesso, status, origem = "autorizados"){
    if(!acesso || !acesso.tecnico || !acesso.site || !acesso.ticket){ return }

    const registro = {
        data_hora:dataISOAgora(),
        tecnico:acesso.tecnico || "",
        site:acesso.site || "",
        ticket:String(acesso.ticket || ""),
        empresa:acesso.empresa || "",
        solicitante:acesso.solicitante || "",
        acao:acesso.acao || "",
        tipo_atividade:tipoAtividadeRelatorio(acesso),
        status:textoStatusRelatorio(status || acesso.status),
        origem:origem,
        usuario:usuarioSessaoRelatorio(),
        acesso_id:acesso.id ? Number(acesso.id) : null
    }

    try{
        const resposta = await fetch(`${SUPABASE_REST_URL}/historico_acessos`, {
            method:"POST",
            headers:supabaseHeaders("return=minimal"),
            body:JSON.stringify(registro)
        })

        if(!resposta.ok){
            console.error("Erro ao registrar histórico:", await resposta.text())
        }
    }catch(erro){
        console.error("Erro ao registrar histórico:", erro)
    }
}

async function limparHistoricoAntigo(){
    try{
        const limite = new Date()
        limite.setDate(limite.getDate() - 30)

        await fetch(`${SUPABASE_REST_URL}/historico_acessos?data_hora=lt.${encodeURIComponent(limite.toISOString())}`, {
            method:"DELETE",
            headers:supabaseHeaders("return=minimal")
        })
    }catch(erro){
        console.error("Erro ao limpar histórico antigo:", erro)
    }
}


const STORAGE_BASE = "baseAutorizadosWesafer"
const STORAGE_ACESSOS = "acessosWesaferKanban"

let baseAutorizados = []
let acessosExpiramHoje = []

async function supabaseListarAutorizados(){
    const resposta = await fetch(`${SUPABASE_REST_URL}/autorizados?select=*&order=created_at.desc`, {
        headers:supabaseHeaders()
    });
    if(!resposta.ok){ throw new Error("Não foi possível carregar autorizados do Supabase"); }
    const dados = await resposta.json();
    return dados.map(item => ({
        id: item.id,
        tecnico: item.tecnico || "",
        site: item.site || "",
        ticket: item.ticket || "",
        periodo: item.periodo || "",
        statusBase: (item.status_base || "autorizado").toString().trim().toLowerCase(),
        solicitante: item.solicitante || "",
        empresa: item.empresa || "",
        acao: item.acao || "",
        origem: item.origem || "",
        atualizadoEm: item.atualizado_em || "",
        criadoEm: item.created_at || ""
    }));
}

async function supabaseListarAcessosExpiramHoje(){
    const resposta = await fetch(`${SUPABASE_REST_URL}/acessos?select=*&status=neq.arquivado&order=created_at.desc`, {
        headers:supabaseHeaders()
    });

    if(!resposta.ok){
        console.error("Erro ao carregar acessos para expiram hoje:", await resposta.text())
        return []
    }

    const dados = await resposta.json()

    return dados.map(item => ({
        idAcesso: item.id,
        tecnico: item.tecnico || "",
        site: item.site || "",
        ticket: item.ticket || "",
        periodo: item.periodo || "",
        statusBase: "expira_hoje",
        solicitante: item.solicitante || "",
        empresa: item.empresa || "",
        acao: item.acao || "",
        origem: "acessos",
        atualizadoEm: item.atualizado_em || "",
        criadoEm: item.created_at || ""
    })).filter(expiraHoje)
}

function listaUnicaPorChave(lista){
    const mapa = new Map()

    lista.forEach(item => {
        if(item && item.tecnico && item.site && item.ticket){
            mapa.set(chaveBase(item), item)
        }
    })

    return Array.from(mapa.values())
}

function autorizadoParaSupabase(item){
    return {
        tecnico: item.tecnico || "",
        site: item.site || "",
        ticket: item.ticket || "",
        periodo: item.periodo || "",
        status_base: item.statusBase || "autorizado",
        solicitante: item.solicitante || "",
        empresa: item.empresa || "",
        acao: item.acao || "",
        origem: item.origem || "autorizados",
        atualizado_em: dataISOAgora()
    };
}

function deduplicarBaseAutorizados(){
    const mapa = new Map()

    baseAutorizados.forEach(item => {
        if(item && item.tecnico && item.site && item.ticket){
            const chave = chaveBase(item)
            const atual = mapa.get(chave)

            if(!atual || timestampItem(item) >= timestampItem(atual)){
                mapa.set(chave, item)
            }
        }
    })

    baseAutorizados = Array.from(mapa.values())
        .sort((a,b) => timestampItem(b) - timestampItem(a))

    localStorage.setItem(STORAGE_BASE, JSON.stringify(baseAutorizados))
}


async function supabaseSalvarAutorizadoItem(item){
    const registro = autorizadoParaSupabase(item)
    const filtro = `tecnico=eq.${encodeURIComponent(registro.tecnico)}&site=eq.${encodeURIComponent(registro.site)}&ticket=eq.${encodeURIComponent(registro.ticket)}`
    const consulta = await fetch(`${SUPABASE_REST_URL}/autorizados?select=id&${filtro}&order=atualizado_em.desc`, {
        headers:supabaseHeaders()
    })

    if(!consulta.ok){
        console.error("Erro ao consultar autorizado:", await consulta.text())
        return
    }

    const encontrados = await consulta.json()

    if(encontrados.length){
        const resposta = await fetch(`${SUPABASE_REST_URL}/autorizados?${filtro}`, {
            method:"PATCH",
            headers:supabaseHeaders("return=minimal"),
            body:JSON.stringify(registro)
        })

        if(!resposta.ok){
            console.error("Erro ao atualizar autorizado:", await resposta.text())
        }
    }else{
        const resposta = await fetch(`${SUPABASE_REST_URL}/autorizados`, {
            method:"POST",
            headers:supabaseHeaders("return=minimal"),
            body:JSON.stringify(registro)
        })

        if(!resposta.ok){
            console.error("Erro ao inserir autorizado:", await resposta.text())
        }
    }
}


async function supabaseSalvarBaseAutorizados(){
    deduplicarBaseAutorizados()
    for(const item of baseAutorizados){
        await supabaseSalvarAutorizadoItem(item)
    }
}

function acessoParaSupabase(acesso){
    return {
        id: Number(acesso.id),
        tecnico: acesso.tecnico || "",
        site: acesso.site || "",
        ticket: acesso.ticket || "",
        solicitante: acesso.solicitante || "",
        empresa: acesso.empresa || "",
        periodo: acesso.periodo || "",
        acao: acesso.acao || "",
        status: acesso.status || "aguardando",
        origem: acesso.origem || "base_autorizados",
        atualizado_em: dataISOAgora()
    };
}

async function supabaseSalvarAcesso(acesso){
    if(!acesso || !acesso.tecnico || !acesso.site || !acesso.ticket){
        return acesso
    }

    const filtro = filtroNaturalAcesso(acesso)
    const consulta = await fetch(`${SUPABASE_REST_URL}/acessos?select=id,created_at&${filtro}&order=created_at.desc`, {
        headers:supabaseHeaders()
    })

    if(!consulta.ok){
        console.error("Erro ao consultar acesso:", await consulta.text())
        return acesso
    }

    const existentes = await consulta.json()
    const registro = acessoParaSupabase(acesso)

    if(existentes.length){
        registro.id = Number(existentes[0].id)
        acesso.id = Number(existentes[0].id)

        const resposta = await fetch(`${SUPABASE_REST_URL}/acessos?id=eq.${existentes[0].id}`, {
            method:"PATCH",
            headers:supabaseHeaders("return=minimal"),
            body:JSON.stringify(registro)
        })

        if(!resposta.ok){
            console.error("Erro ao atualizar acesso:", await resposta.text())
        }

        if(existentes.length > 1){
            const idsDuplicados = existentes.slice(1).map(item => item.id).join(",")
            await fetch(`${SUPABASE_REST_URL}/acessos?id=in.(${idsDuplicados})`, {
                method:"PATCH",
                headers:supabaseHeaders("return=minimal"),
                body:JSON.stringify({
                    status:"arquivado",
                    atualizado_em:dataISOAgora()
                })
            })
        }
    }else{
        const resposta = await fetch(`${SUPABASE_REST_URL}/acessos?on_conflict=id`, {
            method:"POST",
            headers:supabaseHeaders("resolution=merge-duplicates,return=minimal"),
            body:JSON.stringify([registro])
        })

        if(!resposta.ok){
            console.error("Erro ao salvar acesso:", await resposta.text())
        }
    }

    return acesso
}



async function supabaseRemoverAutorizadoItem(item){
    if(!item){
        return false
    }

    let url = ""

    if(item.id){
        url = `${SUPABASE_REST_URL}/autorizados?id=eq.${item.id}`
    }else{
        url = `${SUPABASE_REST_URL}/autorizados?tecnico=eq.${encodeURIComponent(item.tecnico)}&site=eq.${encodeURIComponent(item.site)}&ticket=eq.${encodeURIComponent(item.ticket)}`
    }

    const resposta = await fetch(url, {
        method:"DELETE",
        headers:supabaseHeaders("return=minimal")
    })

    if(!resposta.ok){
        console.error("Erro ao remover autorizado:", await resposta.text())
        return false
    }

    return true
}

async function supabaseRemoverAutorizadoPorChave(chave){
    const item = baseAutorizados.find(x => chaveBase(x) === chave)
    return await supabaseRemoverAutorizadoItem(item)
}

async function supabaseLimparAutorizados(){
    const resposta = await fetch(`${SUPABASE_REST_URL}/autorizados?id=not.is.null`, {
        method:"DELETE",
        headers:supabaseHeaders("return=minimal")
    })
    if(!resposta.ok){ console.error("Erro ao limpar autorizados:", await resposta.text()) }
}

async function supabaseAtualizarAcessoPorBase(item){
    const filtro = filtroNaturalAcesso(item)
    const agoraIso = dataISOAgora()

    const resposta = await fetch(`${SUPABASE_REST_URL}/acessos?${filtro}`, {
        method:"PATCH",
        headers:supabaseHeaders("return=minimal"),
        body:JSON.stringify({
            status:item.statusBase === "aguardando" ? "aguardando" : "liberado",
            ordem_coluna:Date.now(),
            data_ultimo_movimento:agoraIso,
            atualizado_em:agoraIso
        })
    });

    if(!resposta.ok){
        console.error("Erro ao atualizar acesso pelo autorizado:", await resposta.text());
    }
}




function chaveNaturalAcesso(acesso){
    return [
        normalizar(acesso?.tecnico || ""),
        normalizar(acesso?.site || ""),
        String(acesso?.ticket || "").trim()
    ].join("|")
}

function mesmoAcessoNatural(a,b){
    return chaveNaturalAcesso(a) === chaveNaturalAcesso(b)
}

function filtroNaturalAcesso(acesso){
    return `tecnico=eq.${encodeURIComponent(acesso.tecnico || "")}&site=eq.${encodeURIComponent(acesso.site || "")}&ticket=eq.${encodeURIComponent(acesso.ticket || "")}`
}

function timestampItem(item){
    const valores = [
        item?.dataUltimoMovimento,
        item?.atualizadoEm,
        item?.atualizado_em,
        item?.criadoEm,
        item?.created_at
    ].filter(Boolean)

    const tempo = valores.length ? Date.parse(valores[0]) : 0
    return Number.isNaN(tempo) ? 0 : tempo
}

function normalizar(texto){
    return (texto || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .toUpperCase()
}

function hojeZerado(){
    const hoje = new Date()
    return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
}

function dataFinalPeriodo(periodo){
    if(!periodo) return null

    const match = periodo.match(/(\d{2})\/(\d{2})\s*(?:À|A|a|á|Á)\s*(\d{2})\/(\d{2})/)
    if(!match) return null

    const hoje = new Date()
    let ano = hoje.getFullYear()
    const diaFim = Number(match[3])
    const mesFim = Number(match[4]) - 1

    return new Date(ano, mesFim, diaFim)
}

function estaExpiradoAntesDeHoje(item){
    const fim = dataFinalPeriodo(item.periodo)
    if(!fim) return false
    return fim < hojeZerado()
}

function expiraHoje(item){
    const fim = dataFinalPeriodo(item.periodo)
    if(!fim) return false
    return fim.getTime() === hojeZerado().getTime()
}

function limparExpiradosAutomaticamente(){
    baseAutorizados = baseAutorizados.filter(item => !estaExpiradoAntesDeHoje(item))
    localStorage.setItem(STORAGE_BASE, JSON.stringify(baseAutorizados))
}


function mostrarPopupOperacao(mensagem, tipo = "sucesso", titulo = ""){
    let container = document.getElementById("toastContainerOperacao")

    if(!container){
        container = document.createElement("div")
        container.id = "toastContainerOperacao"
        container.className = "toast-container-operacao"
        document.body.appendChild(container)
    }

    const mapa = {
        carregando:["⏳","Processando"],
        sucesso:["✅","Sucesso"],
        erro:["❌","Erro"],
        aviso:["⚠️","Atenção"]
    }

    const config = mapa[tipo] || mapa.sucesso

    // Se estiver em carregamento, reutiliza o mesmo toast.
    let toast = document.getElementById("toastOperacaoAtual")
    if(!toast){
        toast = document.createElement("div")
        toast.id = "toastOperacaoAtual"
        toast.className = `toast-operacao ${tipo}`
        container.appendChild(toast)
    }

    toast.className = `toast-operacao ${tipo}`
    toast.innerHTML = `
        <div class="toast-operacao-icone">${config[0]}</div>
        <div class="toast-operacao-texto">
            <strong>${titulo || config[1]}</strong>
            <span>${mensagem}</span>
        </div>
    `

    toast.style.opacity = "1"
    toast.style.transform = "translateX(0)"
    toast.style.display = "flex"

    clearTimeout(window.__wsPopupOperacaoTimer)

    if(tipo !== "carregando"){
        window.__wsPopupOperacaoTimer = setTimeout(() => {
            toast.style.transition = "opacity .22s ease, transform .22s ease"
            toast.style.opacity = "0"
            toast.style.transform = "translateX(16px)"

            setTimeout(() => {
                if(toast?.isConnected) toast.remove()
            }, 230)
        }, 2600)
    }
}


function mostrarToast(mensagem, tipo = "sucesso", titulo = ""){
    let container = document.getElementById("toastContainer")

    if(!container){
        container = document.createElement("div")
        container.id = "toastContainer"
        container.className = "toast-container"
        document.body.appendChild(container)
    }

    // Garantias de exibição independentes do CSS da página.
    Object.assign(container.style, {
        position:"fixed",
        top:"14px",
        right:"18px",
        zIndex:"2147483647",
        display:"grid",
        gap:"10px",
        width:"min(360px, calc(100vw - 32px))",
        pointerEvents:"none",
        visibility:"visible",
        opacity:"1"
    })

    const mapa = {
        sucesso:["✅","Sucesso","#22c55e"],
        info:["ℹ️","Informação","#38bdf8"],
        aviso:["⚠️","Atenção","#eab308"],
        erro:["❌","Erro","#ef4444"]
    }

    const config = mapa[tipo] || mapa.sucesso
    const toast = document.createElement("div")
    toast.className = `toast-msg ${tipo}`

    Object.assign(toast.style, {
        pointerEvents:"auto",
        display:"flex",
        alignItems:"flex-start",
        gap:"10px",
        padding:"13px 15px",
        borderRadius:"14px",
        color:"#e5e7eb",
        background:"linear-gradient(180deg,#0f172a,#020617)",
        border:"1px solid rgba(147,197,253,.22)",
        borderLeft:`4px solid ${config[2]}`,
        boxShadow:"0 20px 45px rgba(0,0,0,.38)",
        fontSize:"12px",
        fontWeight:"800",
        lineHeight:"1.35",
        visibility:"visible",
        opacity:"1"
    })

    toast.innerHTML = `
        <div class="toast-icone">${config[0]}</div>
        <div>
            <strong style="display:block;color:#fff;font-size:12px;margin-bottom:2px">${titulo || config[1]}</strong>
            <span style="display:block;color:#cbd5e1;font-weight:700">${mensagem}</span>
        </div>
    `

    container.appendChild(toast)

    setTimeout(() => {
        toast.style.opacity = "0"
        toast.style.transform = "translateX(18px)"
        toast.style.transition = "opacity .22s ease, transform .22s ease"
        setTimeout(() => toast.remove(), 230)
    }, 2800)
}

function extrairLinha(linha){
    const texto = linha.trim()

    const match = texto.match(/^(.*?)\s*-\s*([A-Z0-9]{4,6})\s*:\s*(\d+)\s+(\d{2}\/\d{2})\s*(?:À|A|a|á|Á)\s*(\d{2}\/\d{2})/i)

    if(!match){
        return null
    }

    let tecnicoOriginal = match[1].trim().toUpperCase()
    let statusBase = "autorizado"

    if(
        tecnicoOriginal.includes("AGUARDANDO LIBERAÇÃO") ||
        tecnicoOriginal.includes("AGUARDANDO LIBERACAO") ||
        tecnicoOriginal.includes("AGUARDANDO AUTORIZAÇÃO") ||
        tecnicoOriginal.includes("AGUARDANDO AUTORIZACAO")
    ){
        statusBase = "aguardando"
        tecnicoOriginal = tecnicoOriginal
            .replace(/\(?\s*AGUARDANDO LIBERAÇÃO\s*\)?/gi,"")
            .replace(/\(?\s*AGUARDANDO LIBERACAO\s*\)?/gi,"")
            .replace(/\(?\s*AGUARDANDO AUTORIZAÇÃO\s*\)?/gi,"")
            .replace(/\(?\s*AGUARDANDO AUTORIZACAO\s*\)?/gi,"")
            .replace(/\s+/g," ")
            .trim()
    }

    return {
        tecnico: tecnicoOriginal,
        site: match[2].trim().toUpperCase(),
        ticket: match[3].trim(),
        periodo: `${match[4].trim()} À ${match[5].trim()}`,
        solicitante: "",
        empresa: "",
        acao: "",
        portaOperadora: true,
        implantacao: true,
        operacao: false,
        origem: "importacao_manual",
        statusBase,
        linha: texto,
        criadoEm: new Date().toLocaleString("pt-BR")
    }
}

function chaveBase(item){
    return `${normalizar(item.tecnico)}|${normalizar(item.site)}|${item.ticket}`
}

function importarBase(){
    const texto = document.getElementById("listaBrutaAutorizados").value.trim()

    if(!texto){
        mostrarToast("Cole a lista antes de salvar.", "aviso", "Atenção")
        return
    }

    const linhas = texto.split("\n").filter(l => l.trim())
    const extraidos = linhas.map(extrairLinha).filter(Boolean)

    if(extraidos.length === 0){
        mostrarToast("Nenhum registro válido encontrado. Confira o padrão da lista.", "aviso", "Atenção")
        return
    }

    const mapa = new Map()
    ;[...baseAutorizados, ...extraidos].forEach(item => {
        mapa.set(chaveBase(item), item)
    })

    baseAutorizados = Array.from(mapa.values())
    limparExpiradosAutomaticamente()
    supabaseSalvarBaseAutorizados()

    atualizarResumo()
    document.getElementById("listaResultados").innerHTML = ""
    document.getElementById("buscaAutorizado").value = ""
    document.getElementById("resultadoInfo").innerText = `Base salva com ${baseAutorizados.length} registro(s). Digite para pesquisar.`
    document.getElementById("previewTeams").style.display = "none"

    mostrarToast("Base salva com sucesso.")
}

function limparBase(){
    mostrarToast("A base não pode ser apagada. Para atualizar, envie a nova planilha mensal.", "aviso", "Ação bloqueada")
}

function pesquisarAutorizados(){
    painelTeamsAberto = null
    const termo = normalizar(document.getElementById("buscaAutorizado").value.trim())
    const lista = document.getElementById("listaResultados")
    const info = document.getElementById("resultadoInfo")

    lista.innerHTML = ""
    document.getElementById("previewTeams").style.display = "none"

    if(!termo){
        info.innerText = "Digite para pesquisar. Nenhum resultado é exibido antes da busca."
        return
    }

    const encontrados = baseAutorizados.filter(item => {
        if(estaExpiradoAntesDeHoje(item)){
            return false
        }

        return normalizar(item.tecnico).includes(termo) ||
               normalizar(item.site).includes(termo) ||
               normalizar(item.ticket).includes(termo) ||
               normalizar(item.periodo).includes(termo)
    })

    info.innerText = encontrados.length
        ? `${encontrados.length} resultado(s) encontrado(s).`
        : "Nenhum autorizado encontrado para essa pesquisa."

    encontrados.slice(0,80).forEach(item => {
        const card = document.createElement("div")
        card.className = "card-autorizado"

        const expiraNoDia = expiraHoje(item)
        const statusRealItem = String(item.statusBase || item.status_base || "autorizado").trim().toLowerCase()
        const textoStatus = statusRealItem === "aguardando" ? "AGUARDANDO LIBERAÇÃO" : "AUTORIZADO"
        const classeStatus = statusRealItem === "aguardando" ? "status-aguardando" : "status-autorizado"
        const textoBotaoStatus = statusRealItem === "aguardando" ? "→ AUTORIZADO" : "→ AGUARDANDO"

        card.innerHTML = `
            <div class="status-card-linha">
                <span class="status-base ${classeStatus}">${textoStatus}</span>
                ${expiraNoDia ? `<span class="status-base status-expira-hoje">EXPIRA HOJE</span>` : ""}
            </div>
            <h3>${item.tecnico}</h3>
            <div class="meta">
                <div><strong>SITE:</strong> ${item.site}</div>
                <div><strong>TICKET:</strong> ${item.ticket}</div>
                <div><strong>PERÍODO:</strong> ${item.periodo}</div>
                ${item.acao ? `<div><strong>AÇÃO:</strong> ${item.acao}</div>` : ""}
            </div>
            <div class="card-botoes-autorizado">
                <button type="button" onclick="gerarAcessoAutorizadoPelaChave('${chaveBase(item)}', this)">➕ GERAR</button>
                <button class="btn-status-base" onclick="alternarStatusBase('${chaveBase(item)}')">${textoBotaoStatus}</button>
                <button class="btn-glpi-autorizado" title="Ir para o chamado no GLPI" aria-label="Ir para o chamado no GLPI" onclick="abrirChamadoGLPIAutorizados('${item.ticket}')">↗</button>
                <button class="btn-limpar" title="Remover" aria-label="Remover" onclick="removerAutorizado('${chaveBase(item)}')">×</button>
            </div>
        `

        lista.appendChild(card)
    })
}


function abrirChamadoGLPIAutorizados(ticket){
    const numero = String(ticket || "").replace(/\D/g,"")
    if(!numero){
        mostrarToast("Ticket inválido.", "aviso", "GLPI")
        return
    }

    const url = `https://glpimecs.grupomoura.com/front/ticket.form.php?id=${numero}`
    window.open(url, "_blank", "noopener,noreferrer")
}

async function gerarAcessoAutorizadoPelaChave(chave, botao = null){
    const item = baseAutorizados.find(x => chaveBase(x) === chave)

    if(!item){
        mostrarPopupOperacao("Não foi possível localizar esse autorizado.", "erro")
        return
    }

    const textoOriginal = botao?.innerHTML || ""

    if(botao){
        botao.disabled = true
        botao.innerHTML = "⏳ GERANDO..."
    }

    // O aviso é disparado imediatamente no clique.
    mostrarPopupOperacao(`Gerando acesso de ${item.tecnico}...`, "carregando")

    try{
        const resultado = await gerarAcessoAutorizado(item)

        if(resultado === false){
            const toast = document.getElementById("toastOperacaoAtual")
            if(toast) toast.remove()
            return
        }

        mostrarPopupOperacao("Acesso gerado com sucesso.", "sucesso", "Sucesso")
    }catch(erro){
        console.error("Erro ao gerar acesso autorizado:", erro)
        mostrarPopupOperacao(
            erro?.message ? `Não foi possível gerar o acesso: ${erro.message}` : "Não foi possível gerar o acesso.",
            "erro",
            "Erro"
        )
    }finally{
        if(botao){
            botao.disabled = false
            botao.innerHTML = textoOriginal || "➕ GERAR"
        }
    }
}

async function gerarAcessoAutorizado(item){
    let acessos = JSON.parse(localStorage.getItem(STORAGE_ACESSOS) || "[]")

    const existente = acessos.find(acesso => mesmoAcessoNatural(acesso, item))

    if(existente && !confirm("Esse acesso já existe no Kanban. Deseja atualizar e trazer para o topo?")){
        return false
    }

    const agoraIso = dataISOAgora()

    const acessoNovo = {
        id: existente?.id || Date.now(),
        tecnico: item.tecnico,
        site: item.site,
        ticket: item.ticket,
        solicitante: item.solicitante || "",
        empresa: item.empresa || "",
        periodo: item.periodo,
        acao: item.acao || "",
        portaMoura: item.portaMoura === true,
        portaOperadora: item.portaOperadora !== false,
        implantacao: item.implantacao !== false,
        operacao: item.operacao === true,
        status: item.statusBase === "aguardando" ? "aguardando" : "liberado",
        origem: "base_autorizados",
        ordemColuna: Date.now(),
        dataUltimoMovimento: agoraIso,
        criadoEm: existente?.criadoEm || agoraIso,
        atualizadoEm: agoraIso
    }

    await supabaseSalvarAcesso(acessoNovo)
    await registrarHistoricoAcesso(acessoNovo, acessoNovo.status, "gerado_autorizados")

    acessos = acessos.filter(acesso => !mesmoAcessoNatural(acesso, acessoNovo))
    acessos.unshift(acessoNovo)

    localStorage.setItem(STORAGE_ACESSOS, JSON.stringify(acessos))
    return true
}




async function comTimeout(promise, ms = 8000, mensagem = "Tempo excedido ao comunicar com o Supabase."){
    let timer

    try{
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(mensagem)), ms)
            })
        ])
    }finally{
        clearTimeout(timer)
    }
}

async function alternarStatusBase(chave){
    const item = baseAutorizados.find(x => chaveBase(x) === chave)

    if(!item){
        mostrarPopupOperacao("Não foi possível localizar esse autorizado.", "erro", "Erro")
        return
    }

    const statusAnterior = item.statusBase || "autorizado"
    const novoStatus = statusAnterior === "aguardando" ? "autorizado" : "aguardando"
    const agoraIso = dataISOAgora()

    // Troca imediatamente o status na base da tela.
    item.statusBase = novoStatus
    item.atualizadoEm = agoraIso
    item.dataUltimoMovimento = agoraIso

    // Salva localmente e redesenha imediatamente.
    localStorage.setItem(STORAGE_BASE, JSON.stringify(baseAutorizados))
    atualizarResumo()
    pesquisarAutorizados()

    try{
        // Persiste SOMENTE o pré-autorizado alterado.
        await supabaseSalvarAutorizadoItem(item)

        mostrarPopupOperacao(
            novoStatus === "autorizado"
                ? "Alterado para Autorizado."
                : "Alterado para Aguardando Liberação.",
            "sucesso",
            "Sucesso"
        )
    }catch(erro){
        console.error("Erro ao salvar status do pré-autorizado:", erro)

        // Reverte para não mostrar um estado que não foi salvo.
        item.statusBase = statusAnterior
        localStorage.setItem(STORAGE_BASE, JSON.stringify(baseAutorizados))
        atualizarResumo()
        pesquisarAutorizados()

        mostrarPopupOperacao(
            erro?.message
                ? `Não foi possível alterar o status: ${erro.message}`
                : "Não foi possível alterar o status.",
            "erro",
            "Erro"
        )
    }
}


async function removerAutorizado(chave){
    const item = baseAutorizados.find(x => chaveBase(x) === chave)
    if(!item) return

    if(!confirm(`Remover ${item.tecnico} - ${item.site} da Base de Autorizados?`)){
        return
    }

    const removido = await supabaseRemoverAutorizadoItem(item)

    if(!removido){
        mostrarToast("Não foi possível remover do Supabase. Abra o Console para ver o erro.", "erro", "Erro")
        return
    }

    baseAutorizados = baseAutorizados.filter(x => chaveBase(x) !== chave)
    localStorage.setItem(STORAGE_BASE, JSON.stringify(baseAutorizados))

    atualizarResumo()
    pesquisarAutorizados()
    mostrarPopupOperacao("Registro removido da base.", "sucesso")
}


function obterAguardandoLiberacao(){
    return baseAutorizados.filter(item => {
        const status = String(item.statusBase || item.status_base || "").trim().toLowerCase()
        return status === "aguardando" && !expiraHoje(item) && !estaExpiradoAntesDeHoje(item)
    })
}

function tituloListaTeams(tipo){
    const hoje = new Date().toLocaleDateString("pt-BR")

    if(tipo === "total"){
        return `SEGUE A LISTA ATUALIZADA DE ACESSOS AUTORIZADOS - ${hoje}`
    }

    if(tipo === "aguardando"){
        return `SEGUE A LISTA DE ACESSOS AGUARDANDO LIBERAÇÃO - ${hoje}`
    }

    return `SEGUE A LISTA DE ACESSOS QUE EXPIRAM HOJE - ${hoje}`
}

function obterListaPorTipo(tipo){
    if(tipo === "total"){
        return baseAutorizados.filter(item => {
            const status = String(item.statusBase || item.status_base || "").trim().toLowerCase()
            return status !== "aguardando" && !expiraHoje(item) && !estaExpiradoAntesDeHoje(item)
        })
    }

    if(tipo === "aguardando"){
        return obterAguardandoLiberacao()
    }

    const expiramBase = baseAutorizados.filter(item => expiraHoje(item))
    return listaUnicaPorChave([...expiramBase, ...acessosExpiramHoje])
}

function nomeBlocoTeams(tipo){
    if(tipo === "total") return "🟢 AUTORIZADOS"
    if(tipo === "aguardando") return "🟡 AGUARDANDO LIBERAÇÃO"
    return "🔴 EXPIRAM HOJE"
}

function montarTabelaTeams(tipo){
    const lista = obterListaPorTipo(tipo)

    if(lista.length === 0){
        return {
            lista,
            html:`<div id="conteudoCopiavelTeams"><p>Nenhum registro encontrado.</p></div>`
        }
    }

    const linhas = lista
        .sort((a,b)=>Number(a.ticket)-Number(b.ticket))
        .map(item => `
            <tr>
                <td>${item.tecnico || ""}</td>
                <td>${item.ticket || ""}</td>
                <td>${item.site || ""}</td>
                <td>${item.periodo || ""}</td>
            </tr>
        `).join("")

    const html = `
    <div id="conteudoCopiavelTeams">
        <div style="margin-bottom:25px;font-weight:700;font-size:15px;line-height:1.7;">
            Boa noite,<br><br>
            ${tituloListaTeams(tipo)}
        </div>

        <div class="bloco ativos">
            <h2>${nomeBlocoTeams(tipo)}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Nome do Técnico</th>
                        <th>Nº do Chamado</th>
                        <th>Site</th>
                        <th>Período</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas}
                </tbody>
            </table>
        </div>
    </div>
    `

    return {lista, html}
}


let painelTeamsAberto = null


function abrirFormularioTeams(tipo = null){
    const modal = document.getElementById("modalTeams")
    if(!modal) return

    // Se ainda não houver uma lista gerada, abre TOTAL por padrão.
    if(tipo){
        painelTeamsAberto = tipo
        gerarTabelaTeams(tipo)
    }else{
        const preview = document.getElementById("previewTeams")
        if(!preview || !preview.innerHTML.trim()){
            painelTeamsAberto = "total"
            gerarTabelaTeams("total")
        }
    }

    modal.classList.add("aberto")
    modal.setAttribute("aria-hidden","false")
    document.body.classList.add("modal-aberto")
}

function fecharFormularioTeams(){
    const modal = document.getElementById("modalTeams")
    if(!modal) return

    modal.classList.remove("aberto")
    modal.setAttribute("aria-hidden","true")
    document.body.classList.remove("modal-aberto")
}

function limparPainelTeams(){
    painelTeamsAberto = null

    const lista = document.getElementById("listaResultados")
    const info = document.getElementById("resultadoInfo")
    const preview = document.getElementById("previewTeams")

    if(lista) lista.innerHTML = ""
    if(preview){
        preview.innerHTML = ""
        preview.style.display = "none"
    }
    if(info) info.innerText = "Digite para pesquisar. Nenhum resultado é exibido antes da busca."

    fecharFormularioTeams()
}

function toggleTabelaTeams(tipo){
    painelTeamsAberto = tipo
    gerarTabelaTeams(tipo)
    abrirFormularioTeams()
}


function gerarTabelaTeams(tipo){
    const {lista, html} = montarTabelaTeams(tipo)
    const preview = document.getElementById("previewTeams")

    preview.innerHTML = `
        <div class="acoes-preview-teams">
            <button class="btn-copiar-preview" onclick="copiarPreviewTeams()">COPIAR PARA TEAMS</button>
            <button class="btn-fechar-preview-teams" title="Fechar tabela" aria-label="Fechar tabela" onclick="fecharFormularioTeams()">×</button>
        </div>
        ${html}
    `
    preview.style.display = "block"

    if(lista.length === 0){
        mostrarToast("✅ Nenhum registro encontrado")
    }
}

function copiarPreviewTeams(){
    const conteudo = document.getElementById("conteudoCopiavelTeams")

    if(!conteudo){
        alert("Gere uma lista primeiro.")
        return
    }

    copiarElemento(conteudo)
    mostrarToast("✅ Lista copiada para Teams")
}

function copiarExpiramHojeTeams(){
    gerarTabelaTeams("expiram")
    copiarPreviewTeams()
}


function tabelaExpiramHojeHTML(){
    const lista = baseAutorizados.filter(expiraHoje)

    const hoje = new Date()
    const dataFormatada = hoje.toLocaleDateString("pt-BR")

    if(lista.length === 0){
        return {
            lista,
            html:`<div id="conteudoCopiavelExpiram"><p>Nenhum acesso expira hoje.</p></div>`
        }
    }

    const linhas = lista
        .sort((a,b)=>Number(a.ticket)-Number(b.ticket))
        .map(item => `
            <tr>
                <td>${item.tecnico}</td>
                <td>${item.ticket}</td>
                <td>${item.site}</td>
                <td>${item.periodo}</td>
            </tr>
        `).join("")

    const html = `
    <div id="conteudoCopiavelExpiram">
        <div style="margin-bottom:25px;font-weight:700;font-size:15px;line-height:1.7;">
            Boa noite,<br><br>
            SEGUE A LISTA DE ACESSOS QUE EXPIRAM HOJE - ${dataFormatada}
        </div>

        <div class="bloco ativos">
            <h2>🟡 EXPIRAM HOJE</h2>
            <table>
                <thead>
                    <tr>
                        <th>Nome do Técnico</th>
                        <th>Nº do Chamado</th>
                        <th>Site</th>
                        <th>Período</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas}
                </tbody>
            </table>
        </div>
    </div>
    `

    return {lista, html}
}

function copiarExpiramHojeTeams(){
    gerarTabelaTeams("expiram")
    copiarPreviewTeams()
}

function copiarElemento(elemento){
    const clone = elemento.cloneNode(true)

    const areaTemporaria = document.createElement("div")
    areaTemporaria.style.position = "fixed"
    areaTemporaria.style.left = "-9999px"
    areaTemporaria.appendChild(clone)

    document.body.appendChild(areaTemporaria)

    const range = document.createRange()
    range.selectNode(clone)

    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    document.execCommand("copy")

    selection.removeAllRanges()
    document.body.removeChild(areaTemporaria)
}

function atualizarResumo(){
    const aguardando = obterAguardandoLiberacao()

    const autorizados = baseAutorizados.filter(item => {
        const status = String(item.statusBase || item.status_base || "").trim().toLowerCase()
        return status !== "aguardando" && !expiraHoje(item) && !estaExpiradoAntesDeHoje(item)
    })

    const expiramBase = baseAutorizados.filter(item => expiraHoje(item))
    const expiramHoje = listaUnicaPorChave([...expiramBase, ...acessosExpiramHoje])

    document.getElementById("qtdBase").innerText = autorizados.length
    document.getElementById("qtdExpiramHoje").innerText = expiramHoje.length

    const campoAguardando = document.getElementById("qtdAguardandoBase")
    if(campoAguardando){
        campoAguardando.innerText = aguardando.length
    }
}

function focarBusca(){
    document.getElementById("buscaAutorizado").focus()
}


async function carregarTela(){
    try{
        baseAutorizados = await supabaseListarAutorizados();
        acessosExpiramHoje = await supabaseListarAcessosExpiramHoje();
        localStorage.setItem(STORAGE_BASE, JSON.stringify(baseAutorizados));
    }catch(erro){
        console.warn("Carregando autorizados do backup local:", erro);
        const backup = localStorage.getItem(STORAGE_BASE);
        baseAutorizados = backup ? JSON.parse(backup) : [];
        acessosExpiramHoje = [];
    }

    deduplicarBaseAutorizados();
    atualizarResumo();

    const termo = document.getElementById("buscaAutorizado")?.value.trim()
    if(termo){
        pesquisarAutorizados()
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    const logado = await verificarLogin()

    if(!logado){
        return
    }

    configurarMenuUsuario()
    atualizarDataPlantao()
    limparHistoricoAntigo()

    try{
        await atualizarIndicadoresPreAutorizadosSupabase()
    }catch(erro){
        console.error("Erro ao atualizar indicadores de pré-autorizados:", erro)
    }

    carregarTela()
})

async function atualizarAutorizadosAutomaticamente(){
    const importador = document.querySelector(".importador-discreto")
    if(importador && importador.open){ return }

    await carregarTela()
}

setInterval(atualizarAutorizadosAutomaticamente, 5000)


document.addEventListener("click", evento => {
    const modalTeams = document.getElementById("modalTeams")
    if(modalTeams && evento.target === modalTeams){
        fecharFormularioTeams()
    }
})


/* WESAFER_DATA_AUTORIZADOS_FIX_V2
   Inicialização independente: não depende do restante da página. */
(function(){
    function iniciarDataAutorizados(){
        try{
            atualizarDataPlantao()
        }catch(erro){
            console.error("Falha ao atualizar data em Autorizados:", erro)
        }
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", iniciarDataAutorizados, {once:true})
    }else{
        iniciarDataAutorizados()
    }

    // Segunda tentativa após load para proteger contra renderizações tardias.
    window.addEventListener("load", iniciarDataAutorizados, {once:true})
})()

