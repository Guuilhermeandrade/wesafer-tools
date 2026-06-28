const AUTH_KEY = "wesaferAuth"

function obterSessao(){
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null")
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
    if(!campo){
        return
    }

    const hoje = new Date()
    const data = hoje.toLocaleDateString("pt-BR", {
        weekday:"long",
        day:"2-digit",
        month:"2-digit",
        year:"numeric"
    })

    campo.innerText = `📅 ${data.toUpperCase()}`
}

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

function mostrarToast(mensagem, tipo = "sucesso", titulo = ""){
    let container = document.getElementById("toastContainer")

    if(!container){
        container = document.createElement("div")
        container.id = "toastContainer"
        container.className = "toast-container"
        document.body.appendChild(container)
    }

    const mapa = {
        sucesso:["✅","Sucesso"],
        info:["ℹ️","Informação"],
        aviso:["⚠️","Atenção"],
        erro:["❌","Erro"]
    }

    const config = mapa[tipo] || mapa.sucesso
    const toast = document.createElement("div")
    toast.className = `toast-msg ${tipo}`

    toast.innerHTML = `
        <div class="toast-icone">${config[0]}</div>
        <div>
            <strong>${titulo || config[1]}</strong>
            <span>${mensagem}</span>
        </div>
    `

    container.appendChild(toast)

    setTimeout(() => {
        toast.style.animation = "toastSaida .22s ease-in forwards"
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
    if(!confirm("Deseja limpar toda a base de autorizados?")){
        return
    }

    baseAutorizados = []
    supabaseLimparAutorizados()
    document.getElementById("listaBrutaAutorizados").value = ""
    document.getElementById("buscaAutorizado").value = ""
    document.getElementById("listaResultados").innerHTML = ""
    document.getElementById("resultadoInfo").innerText = "Base limpa. Cole uma nova lista para importar."
    document.getElementById("previewTeams").style.display = "none"
    atualizarResumo()
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
        const statusBase = expiraNoDia ? "expira_hoje" : (item.statusBase === "aguardando" ? "aguardando" : "autorizado")
        const textoStatus = expiraNoDia ? "EXPIRA HOJE" : (statusBase === "aguardando" ? "AGUARDANDO LIBERAÇÃO" : "AUTORIZADO")
        const classeStatus = expiraNoDia ? "status-expira-hoje" : (statusBase === "aguardando" ? "status-aguardando" : "status-autorizado")
        const textoBotaoStatus = statusBase === "aguardando" ? "→ AUTORIZADO" : "→ AGUARDANDO"

        card.innerHTML = `
            <span class="status-base ${classeStatus}">${textoStatus}</span>
            <h3>${item.tecnico}</h3>
            <div class="meta">
                <div><strong>SITE:</strong> ${item.site}</div>
                <div><strong>TICKET:</strong> ${item.ticket}</div>
                <div><strong>PERÍODO:</strong> ${item.periodo}</div>
                ${item.acao ? `<div><strong>AÇÃO:</strong> ${item.acao}</div>` : ""}
            </div>
            <div class="card-botoes-autorizado">
                <button onclick="gerarAcessoAutorizadoPelaChave('${chaveBase(item)}')">➕ GERAR</button>
                <button class="btn-status-base" onclick="alternarStatusBase('${chaveBase(item)}')">${textoBotaoStatus}</button>
                <button class="btn-limpar" onclick="removerAutorizado('${chaveBase(item)}')">REMOVER</button>
            </div>
        `

        lista.appendChild(card)
    })
}

function gerarAcessoAutorizadoPelaChave(chave){
    const item = baseAutorizados.find(x => chaveBase(x) === chave)
    if(item){
        gerarAcessoAutorizado(item)
    }
}

async function gerarAcessoAutorizado(item){
    let acessos = JSON.parse(localStorage.getItem(STORAGE_ACESSOS) || "[]")

    const existente = acessos.find(acesso => mesmoAcessoNatural(acesso, item))

    if(existente && !confirm("Esse acesso já existe no Kanban. Deseja atualizar e trazer para o topo?")){
        return
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

    acessos = acessos.filter(acesso => !mesmoAcessoNatural(acesso, acessoNovo))
    acessos.unshift(acessoNovo)

    localStorage.setItem(STORAGE_ACESSOS, JSON.stringify(acessos))
    mostrarToast("Acesso gerado com sucesso.")
}



async function alternarStatusBase(chave){
    const item = baseAutorizados.find(x => chaveBase(x) === chave)
    if(!item) return

    const agoraIso = dataISOAgora()

    item.statusBase = item.statusBase === "aguardando" ? "autorizado" : "aguardando"
    item.atualizadoEm = agoraIso
    item.dataUltimoMovimento = agoraIso

    let acessos = JSON.parse(localStorage.getItem(STORAGE_ACESSOS) || "[]")
    acessos = acessos.map(acesso => {
        if(mesmoAcessoNatural(acesso, item)){
            acesso.status = item.statusBase === "aguardando" ? "aguardando" : "liberado"
            acesso.ordemColuna = Date.now()
            acesso.dataUltimoMovimento = agoraIso
            acesso.atualizadoEm = agoraIso
        }

        return acesso
    })

    localStorage.setItem(STORAGE_ACESSOS, JSON.stringify(acessos))
    await supabaseAtualizarAcessoPorBase(item)
    await supabaseSalvarBaseAutorizados()

    atualizarResumo()
    pesquisarAutorizados()
    mostrarToast("Status atualizado com sucesso.")
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
    mostrarToast("Registro removido da base.")
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
}

function toggleTabelaTeams(tipo){
    if(painelTeamsAberto === tipo){
        limparPainelTeams()
        return
    }

    painelTeamsAberto = tipo
    gerarTabelaTeams(tipo)
}


function gerarTabelaTeams(tipo){
    const {lista, html} = montarTabelaTeams(tipo)
    const preview = document.getElementById("previewTeams")

    preview.innerHTML = `
        <button class="btn-copiar-preview" onclick="copiarPreviewTeams()">📋 COPIAR PARA TEAMS</button>
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
    carregarTela()
})

async function atualizarAutorizadosAutomaticamente(){
    const importador = document.querySelector(".importador-discreto")
    if(importador && importador.open){ return }

    await carregarTela()
}

setInterval(atualizarAutorizadosAutomaticamente, 5000)
