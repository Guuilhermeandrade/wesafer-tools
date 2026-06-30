let acessos = []
let modoCompacto = false

const STORAGE_KEY = "acessosWesaferKanban"


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




async function supabaseListarAcessos(){
    const resposta = await fetch(`${SUPABASE_REST_URL}/acessos?select=*&order=created_at.desc`, {
        headers: supabaseHeaders()
    });
    if(!resposta.ok){ throw new Error("Não foi possível carregar acessos do Supabase"); }
    const dados = await resposta.json();
    return dados
        .filter(item => item.status !== "arquivado")
        .map(item => ({
            id: Number(item.id),
            tecnico: item.tecnico || "",
            site: item.site || "",
            ticket: item.ticket || "",
            solicitante: item.solicitante || "",
            empresa: item.empresa || "",
            periodo: item.periodo || "",
            acao: item.acao || "",
            portaMoura: item.porta_moura === true,
            portaOperadora: item.porta_operadora === true,
            implantacao: item.implantacao === true,
            operacao: item.operacao === true,
            status: item.status || "aguardando",
            origem: item.origem || "",
            criadoEm: item.created_at || "",
            atualizadoEm: item.atualizado_em || "",
            ordemColuna: Number(item.ordem_coluna || 0) || Number(item.id || 0),
            dataUltimoMovimento: item.data_ultimo_movimento || item.atualizado_em || item.created_at || ""
        }));
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
        porta_moura: acesso.portaMoura === true,
        porta_operadora: acesso.portaOperadora === true,
        implantacao: acesso.implantacao === true,
        operacao: acesso.operacao === true,
        status: acesso.status || "aguardando",
        ordem_coluna: Number(acesso.ordemColuna || acesso.id || Date.now()),
        data_ultimo_movimento: acesso.dataUltimoMovimento || dataISOAgora(),
        origem: acesso.origem || "index",
        atualizado_em: dataISOAgora()
    };
}

async function supabaseSalvarAcessoNatural(acesso){
    if(!acesso || !acesso.tecnico || !acesso.site || !acesso.ticket){
        return acesso
    }

    const filtro = filtroNaturalAcesso(acesso)
    const consulta = await fetch(`${SUPABASE_REST_URL}/acessos?select=id,created_at&${filtro}&order=created_at.desc`, {
        headers:supabaseHeaders()
    })

    if(!consulta.ok){
        console.error("Erro ao consultar acesso por chave natural:", await consulta.text())
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
            console.error("Erro ao atualizar acesso por chave natural:", await resposta.text())
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
            console.error("Erro ao inserir acesso por chave natural:", await resposta.text())
        }
    }

    return acesso
}

async function supabaseSalvarAcessos(){
    if(!acessos.length){ return; }

    for(const acesso of acessos){
        await supabaseSalvarAcessoNatural(acesso)
    }
}



async function supabaseAtualizarMovimento(acesso){
    if(!acesso || !acesso.id){
        return false
    }

    const resposta = await fetch(`${SUPABASE_REST_URL}/acessos?id=eq.${acesso.id}`, {
        method:"PATCH",
        headers:supabaseHeaders("return=minimal"),
        body:JSON.stringify({
            status: acesso.status || "aguardando",
            ordem_coluna: Number(acesso.ordemColuna || Date.now()),
            data_ultimo_movimento: acesso.dataUltimoMovimento || dataISOAgora(),
            atualizado_em: acesso.atualizadoEm || dataISOAgora()
        })
    })

    if(!resposta.ok){
        console.error("Erro ao atualizar movimento do acesso:", await resposta.text())
        return false
    }

    return true
}

async function supabaseExcluirAcesso(id){
    const resposta = await fetch(`${SUPABASE_REST_URL}/acessos?id=eq.${id}`, {
        method:"DELETE",
        headers:supabaseHeaders("return=minimal")
    });
    if(!resposta.ok){ console.error("Erro ao excluir acesso no Supabase:", await resposta.text()); }
}

async function supabaseArquivarTodosAcessos(){
    const resposta = await fetch(`${SUPABASE_REST_URL}/acessos?status=neq.arquivado`, {
        method:"PATCH",
        headers:supabaseHeaders("return=minimal"),
        body:JSON.stringify({
            status:"arquivado",
            atualizado_em:dataISOAgora()
        })
    });

    if(!resposta.ok){
        console.error("Erro ao arquivar plantão no Supabase:", await resposta.text());
        return false;
    }

    return true;
}

async function supabaseSalvarAutorizado(acesso, statusBase = "autorizado"){
    const itemNovo = {
        tecnico: acesso.tecnico || "",
        site: acesso.site || "",
        ticket: acesso.ticket || "",
        periodo: acesso.periodo || "",
        status_base: statusBase,
        solicitante: acesso.solicitante || "",
        empresa: acesso.empresa || "",
        acao: acesso.acao || "",
        origem: "acessos",
        atualizado_em: dataISOAgora()
    };

    const filtro = `tecnico=eq.${encodeURIComponent(itemNovo.tecnico)}&site=eq.${encodeURIComponent(itemNovo.site)}&ticket=eq.${encodeURIComponent(itemNovo.ticket)}`
    const consulta = await fetch(`${SUPABASE_REST_URL}/autorizados?select=id&${filtro}&order=atualizado_em.desc`, {
        headers:supabaseHeaders()
    })

    if(!consulta.ok){
        console.error("Erro ao consultar autorizado:", await consulta.text())
        return
    }

    const existentes = await consulta.json()

    if(existentes.length){
        const resposta = await fetch(`${SUPABASE_REST_URL}/autorizados?${filtro}`, {
            method:"PATCH",
            headers:supabaseHeaders("return=minimal"),
            body:JSON.stringify(itemNovo)
        })

        if(!resposta.ok){
            console.error("Erro ao atualizar autorizado:", await resposta.text())
        }
    }else{
        const resposta = await fetch(`${SUPABASE_REST_URL}/autorizados`, {
            method:"POST",
            headers:supabaseHeaders("return=minimal"),
            body:JSON.stringify(itemNovo)
        })

        if(!resposta.ok){
            console.error("Erro ao inserir autorizado:", await resposta.text())
        }
    }
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

function pegar(regex,texto){
    const match = texto.match(regex)
    return match ? match[1].trim() : ""
}

function formatarData(data){
    if(!data) return ""
    const partes = data.split("-")
    return `${partes[2]}/${partes[1]}`
}

function ajustarSite(site){
    if(!site) return ""
    site = site.trim()

    if(site.includes("_")){
        const [sigla,estado] = site.split("_")
        return `${estado}${sigla}`.replace(/[^A-Z0-9]/gi,"").toUpperCase()
    }

    if(site.includes("-")){
        const partes = site.split("-")
        if(partes.length === 2){
            return `${partes[1]}${partes[0]}`.replace(/[^A-Z0-9]/gi,"").toUpperCase()
        }
    }

    return site.replace(/[^A-Z0-9]/gi,"").toUpperCase()
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
    if(acesso?.operacao === true){
        return "OPERAÇÃO"
    }

    if(acesso?.implantacao === true){
        return "IMPLANTAÇÃO"
    }

    const texto = `${acesso?.acao || ""}`.toUpperCase()

    if(texto.includes("OPERA")){
        return "OPERAÇÃO"
    }

    if(texto.includes("IMPLANTA")){
        return "IMPLANTAÇÃO"
    }

    return "-"
}

function usuarioSessaoRelatorio(){
    const sessao = obterSessao ? obterSessao() : null
    return sessao?.user?.email || sessao?.user?.user_metadata?.name || "WESAFER TOOLS"
}

function dataLocalInicioFimHoje(){
    const inicio = new Date()
    inicio.setHours(0,0,0,0)

    const fim = new Date()
    fim.setHours(23,59,59,999)

    return {
        inicio,
        fim,
        inicioISO: inicio.toISOString(),
        fimISO: fim.toISOString()
    }
}


function escaparHtmlRelatorio(valor){
    return String(valor ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;")
}

function statusClasseRelatorio(status){
    const texto = textoStatusRelatorio(status)
    if(texto === "AGUARDANDO LIBERAÇÃO"){ return "status-aguardando" }
    if(texto === "LIBERADO"){ return "status-liberado" }
    if(texto === "ENTRADA"){ return "status-entrada" }
    if(texto === "SAÍDA"){ return "status-saida" }
    return ""
}

function completarAcessoHistorico(acesso){
    if(!acesso || !Array.isArray(acessos)){
        return acesso
    }

    const encontrado = acessos.find(item =>
        String(item.id) === String(acesso.id) ||
        (
            String(item.ticket || "") === String(acesso.ticket || "") &&
            String(item.site || "") === String(acesso.site || "") &&
            normalizarBaseAutorizado(item.tecnico || "") === normalizarBaseAutorizado(acesso.tecnico || "")
        )
    )

    if(!encontrado){
        return acesso
    }

    return {
        ...encontrado,
        ...acesso,
        tecnico:acesso.tecnico || encontrado.tecnico || "",
        site:acesso.site || encontrado.site || "",
        ticket:acesso.ticket || encontrado.ticket || "",
        empresa:acesso.empresa || encontrado.empresa || "",
        solicitante:acesso.solicitante || encontrado.solicitante || "",
        acao:acesso.acao || encontrado.acao || "",
        portaMoura:acesso.portaMoura ?? encontrado.portaMoura,
        portaOperadora:acesso.portaOperadora ?? encontrado.portaOperadora,
        implantacao:acesso.implantacao ?? encontrado.implantacao,
        operacao:acesso.operacao ?? encontrado.operacao
    }
}

function gerarHtmlExcelRelatorio(registros, periodo, incluirResumo, incluirUsuario){
    const contadores = {
        "AGUARDANDO LIBERAÇÃO":0,
        "LIBERADO":0,
        "ENTRADA":0,
        "SAÍDA":0
    }

    registros.forEach(item => {
        const status = textoStatusRelatorio(item.status)
        if(contadores[status] !== undefined){
            contadores[status]++
        }
    })

    const totalPorTicket = new Set(registros.map(item => `${item.ticket}|${item.site}|${item.tecnico}`)).size

    const colunas = [
        "DATA/HORA","TÉCNICO","SITE","TICKET","EMPRESA","SOLICITANTE",
        "AÇÃO","TIPO DE ATIVIDADE","STATUS"
    ]

    if(incluirUsuario){
        colunas.push("USUÁRIO")
    }

    colunas.push("ORIGEM")

    const linhasTabela = registros.map(item => {
        const status = textoStatusRelatorio(item.status)
        const dados = [
            dataHoraBrasil(item.data_hora),
            item.tecnico || "",
            item.site || "",
            item.ticket || "",
            item.empresa || "",
            item.solicitante || "",
            item.acao || "",
            item.tipo_atividade || "",
            status
        ]

        if(incluirUsuario){
            dados.push(item.usuario || "")
        }

        dados.push(item.origem || "")

        return `<tr>${dados.map((valor, indice) => {
            const classe = indice === 8 ? statusClasseRelatorio(valor) : ""
            return `<td class="${classe}">${escaparHtmlRelatorio(valor)}</td>`
        }).join("")}</tr>`
    }).join("")

    const resumoHtml = incluirResumo ? `
        <table class="resumo">
            <tr>
                <th>Total de movimentações</th>
                <th>Acessos únicos</th>
                <th>Aguardando liberação</th>
                <th>Liberado</th>
                <th>Entrada</th>
                <th>Saída</th>
            </tr>
            <tr>
                <td>${registros.length}</td>
                <td>${totalPorTicket}</td>
                <td>${contadores["AGUARDANDO LIBERAÇÃO"]}</td>
                <td>${contadores["LIBERADO"]}</td>
                <td>${contadores["ENTRADA"]}</td>
                <td>${contadores["SAÍDA"]}</td>
            </tr>
        </table>
    ` : ""

    return `<html>
<head>
<meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;color:#0f172a;}
.titulo{background:#0f172a;color:#fff;font-size:20px;font-weight:bold;text-align:center;padding:14px;}
.subtitulo{background:#dbeafe;color:#1e3a8a;font-size:13px;font-weight:bold;text-align:center;padding:8px;}
table{border-collapse:collapse;width:100%;}
th{background:#2563eb;color:#fff;font-weight:bold;text-align:left;border:1px solid #93c5fd;padding:8px;font-size:12px;white-space:nowrap;}
td{border:1px solid #cbd5e1;padding:7px;font-size:12px;vertical-align:top;mso-number-format:"\\@";}
.resumo{margin:14px 0 18px 0;}
.resumo th{background:#1e293b;text-align:center;}
.resumo td{text-align:center;font-size:16px;font-weight:bold;background:#f8fafc;}
.status-aguardando{background:#facc15;color:#422006;font-weight:bold;text-align:center;}
.status-liberado{background:#22c55e;color:#052e16;font-weight:bold;text-align:center;}
.status-entrada{background:#3b82f6;color:#fff;font-weight:bold;text-align:center;}
.status-saida{background:#94a3b8;color:#0f172a;font-weight:bold;text-align:center;}
.detalhes tr:nth-child(even) td{background:#f8fafc;}
</style>
</head>
<body>
<div class="titulo">RELATÓRIO DE ACESSOS - WESAFER TOOLS</div>
<div class="subtitulo">PERÍODO: ${escaparHtmlRelatorio(periodo.inicioBr)} ATÉ ${escaparHtmlRelatorio(periodo.fimBr)}</div>
${resumoHtml}
<table class="detalhes">
<colgroup>
<col style="width:145px"><col style="width:260px"><col style="width:90px"><col style="width:90px">
<col style="width:170px"><col style="width:260px"><col style="width:330px"><col style="width:160px">
<col style="width:160px">${incluirUsuario ? '<col style="width:220px">' : ''}<col style="width:150px">
</colgroup>
<thead><tr>${colunas.map(coluna => `<th>${escaparHtmlRelatorio(coluna)}</th>`).join("")}</tr></thead>
<tbody>${linhasTabela}</tbody>
</table>
</body>
</html>`
}

function baixarRelatorioExcel(nome, html){
    const blob = new Blob(["\ufeff" + html], {type:"application/vnd.ms-excel;charset=utf-8;"})
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = nome
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
}


async function registrarHistoricoAcesso(acesso, status, origem = "acessos"){
    acesso = completarAcessoHistorico(acesso)
    if(!acesso || !acesso.tecnico || !acesso.site || !acesso.ticket){
        return
    }

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

        const resposta = await fetch(`${SUPABASE_REST_URL}/historico_acessos?data_hora=lt.${encodeURIComponent(limite.toISOString())}`, {
            method:"DELETE",
            headers:supabaseHeaders("return=minimal")
        })

        if(!resposta.ok){
            console.error("Erro ao limpar histórico antigo:", await resposta.text())
        }
    }catch(erro){
        console.error("Erro ao limpar histórico antigo:", erro)
    }
}

async function listarHistoricoDoDia(){
    const periodo = dataLocalInicioFimHoje()

    const resposta = await fetch(
        `${SUPABASE_REST_URL}/historico_acessos?select=*&data_hora=gte.${encodeURIComponent(periodo.inicioISO)}&data_hora=lte.${encodeURIComponent(periodo.fimISO)}&order=data_hora.asc`,
        {headers:supabaseHeaders()}
    )

    if(!resposta.ok){
        throw new Error(await resposta.text())
    }

    return await resposta.json()
}

function escaparCsv(valor){
    const texto = String(valor ?? "").replace(/"/g,'""')
    return `"${texto}"`
}

function dataHoraBrasil(valor){
    if(!valor){
        return "-"
    }

    const data = new Date(valor)

    if(Number.isNaN(data.getTime())){
        return valor
    }

    return data.toLocaleString("pt-BR")
}

function baixarArquivoTexto(nome, conteudo, tipo = "text/csv;charset=utf-8;"){
    const blob = new Blob([conteudo], {type:tipo})
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = nome
    document.body.appendChild(link)
    link.click()
    link.remove()

    URL.revokeObjectURL(url)
}


function dataInputHoje(){
    const hoje = new Date()
    const ano = hoje.getFullYear()
    const mes = String(hoje.getMonth() + 1).padStart(2,"0")
    const dia = String(hoje.getDate()).padStart(2,"0")
    return `${ano}-${mes}-${dia}`
}

function abrirModalExportacao(){
    const modal = document.getElementById("modalExportacao")
    const inicio = document.getElementById("dataInicioExportacao")
    const fim = document.getElementById("dataFimExportacao")

    if(inicio && !inicio.value){
        inicio.value = dataInputHoje()
    }

    if(fim && !fim.value){
        fim.value = dataInputHoje()
    }

    if(modal){
        modal.classList.add("aberto")
    }
}

function fecharModalExportacao(){
    const modal = document.getElementById("modalExportacao")
    if(modal){
        modal.classList.remove("aberto")
    }
}

function periodoExportacaoSelecionado(){
    const inicioValor = document.getElementById("dataInicioExportacao")?.value
    const fimValor = document.getElementById("dataFimExportacao")?.value

    if(!inicioValor || !fimValor){
        throw new Error("Selecione a data inicial e a data final.")
    }

    const inicio = new Date(`${inicioValor}T00:00:00`)
    const fim = new Date(`${fimValor}T23:59:59.999`)

    if(Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())){
        throw new Error("Período inválido.")
    }

    if(inicio > fim){
        throw new Error("A data inicial não pode ser maior que a data final.")
    }

    const limite = new Date()
    limite.setDate(limite.getDate() - 31)
    limite.setHours(0,0,0,0)

    if(inicio < limite){
        throw new Error("O relatório só permite consultar o histórico dos últimos 30 dias.")
    }

    return {
        inicio,
        fim,
        inicioISO:inicio.toISOString(),
        fimISO:fim.toISOString(),
        inicioBr:inicio.toLocaleDateString("pt-BR"),
        fimBr:fim.toLocaleDateString("pt-BR"),
        inicioArquivo:inicio.toLocaleDateString("pt-BR").replaceAll("/","-"),
        fimArquivo:fim.toLocaleDateString("pt-BR").replaceAll("/","-")
    }
}

async function listarHistoricoPorPeriodo(inicioISO,fimISO){
    const resposta = await fetch(
        `${SUPABASE_REST_URL}/historico_acessos?select=*&data_hora=gte.${encodeURIComponent(inicioISO)}&data_hora=lte.${encodeURIComponent(fimISO)}&order=data_hora.asc`,
        {headers:supabaseHeaders()}
    )

    if(!resposta.ok){
        throw new Error(await resposta.text())
    }

    return await resposta.json()
}



function chaveRelatorioAcesso(item){
    return [
        String(item.tecnico || "").trim().toUpperCase(),
        String(item.site || "").trim().toUpperCase(),
        String(item.ticket || "").trim().toUpperCase()
    ].join("|")
}

function registrosUnicosPorAcesso(registros){
    const mapa = new Map()

    registros.forEach(item => {
        const chave = chaveRelatorioAcesso(item)
        const atual = mapa.get(chave)

        const dataItem = new Date(item.data_hora || item.criado_em || 0).getTime()
        const dataAtual = atual ? new Date(atual.data_hora || atual.criado_em || 0).getTime() : 0

        if(!atual || dataItem >= dataAtual){
            mapa.set(chave, item)
        }
    })

    return Array.from(mapa.values()).sort((a,b) => {
        return new Date(b.data_hora || 0).getTime() - new Date(a.data_hora || 0).getTime()
    })
}

function gerarHtmlExcelRelatorioUnico(registros, periodo, incluirResumo, incluirUsuario){
    const acessosUnicos = registrosUnicosPorAcesso(registros)

    const contadores = {
        "AGUARDANDO LIBERAÇÃO":0,
        "LIBERADO":0,
        "ENTRADA":0,
        "SAÍDA":0
    }

    acessosUnicos.forEach(item => {
        const status = textoStatusRelatorio(item.status)
        if(contadores[status] !== undefined){
            contadores[status]++
        }
    })

    const colunas = [
        "ÚLTIMA MOVIMENTAÇÃO",
        "TÉCNICO",
        "SITE",
        "TICKET",
        "EMPRESA",
        "SOLICITANTE",
        "AÇÃO",
        "TIPO",
        "STATUS ATUAL"
    ]

    if(incluirUsuario){
        colunas.push("USUÁRIO")
    }

    const linhasTabela = acessosUnicos.map(item => {
        const status = textoStatusRelatorio(item.status)
        const dados = [
            dataHoraBrasil(item.data_hora),
            item.tecnico || "",
            item.site || "",
            item.ticket || "",
            item.empresa || "",
            item.solicitante || "",
            item.acao || "",
            item.tipo_atividade || "",
            status
        ]

        if(incluirUsuario){
            dados.push(item.usuario || "")
        }

        return `<tr>${dados.map((valor, indice) => {
            const classe = indice === 8 ? statusClasseRelatorio(valor) : ""
            return `<td class="${classe}">${escaparHtmlRelatorio(valor)}</td>`
        }).join("")}</tr>`
    }).join("")

    const resumoHtml = incluirResumo ? `
        <table class="resumo">
            <tr>
                <th>Total de acessos únicos</th>
                <th>Aguardando liberação</th>
                <th>Liberado</th>
                <th>Entrada</th>
                <th>Saída</th>
            </tr>
            <tr>
                <td>${acessosUnicos.length}</td>
                <td>${contadores["AGUARDANDO LIBERAÇÃO"]}</td>
                <td>${contadores["LIBERADO"]}</td>
                <td>${contadores["ENTRADA"]}</td>
                <td>${contadores["SAÍDA"]}</td>
            </tr>
        </table>
    ` : ""

    return `<html>
<head>
<meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;color:#0f172a;background:#ffffff;}
.titulo{background:#0f172a;color:#fff;font-size:22px;font-weight:bold;text-align:center;padding:16px;}
.subtitulo{background:#dbeafe;color:#1e3a8a;font-size:14px;font-weight:bold;text-align:center;padding:10px;}
.aviso{background:#f8fafc;color:#475569;font-size:12px;text-align:center;padding:8px;border-bottom:1px solid #cbd5e1;}
table{border-collapse:collapse;width:100%;}
th{background:#2563eb;color:#fff;font-weight:bold;text-align:center;border:1px solid #93c5fd;padding:9px;font-size:12px;white-space:nowrap;}
td{border:1px solid #cbd5e1;padding:8px;font-size:12px;vertical-align:top;mso-number-format:"\\@";}
.resumo{margin:16px 0 20px 0;}
.resumo th{background:#1e293b;text-align:center;}
.resumo td{text-align:center;font-size:18px;font-weight:bold;background:#f8fafc;}
.status-aguardando{background:#facc15;color:#422006;font-weight:bold;text-align:center;}
.status-liberado{background:#22c55e;color:#052e16;font-weight:bold;text-align:center;}
.status-entrada{background:#3b82f6;color:#fff;font-weight:bold;text-align:center;}
.status-saida{background:#94a3b8;color:#0f172a;font-weight:bold;text-align:center;}
.detalhes tr:nth-child(even) td{background:#f8fafc;}
.detalhes td:nth-child(2){font-weight:bold;}
</style>
</head>
<body>
<div class="titulo">RELATÓRIO DE ACESSOS - WESAFER TOOLS</div>
<div class="subtitulo">PERÍODO: ${escaparHtmlRelatorio(periodo.inicioBr)} ATÉ ${escaparHtmlRelatorio(periodo.fimBr)}</div>
<div class="aviso">Relatório principal com 1 linha por acesso. O status exibido é a última movimentação registrada dentro do período.</div>
${resumoHtml}
<table class="detalhes">
<colgroup>
<col style="width:155px"><col style="width:270px"><col style="width:90px"><col style="width:90px">
<col style="width:170px"><col style="width:260px"><col style="width:360px"><col style="width:130px">
<col style="width:165px">${incluirUsuario ? '<col style="width:220px">' : ''}
</colgroup>
<thead><tr>${colunas.map(coluna => `<th>${escaparHtmlRelatorio(coluna)}</th>`).join("")}</tr></thead>
<tbody>${linhasTabela}</tbody>
</table>
</body>
</html>`
}



async function exportarRelatorioPeriodo(){
    try{
        const periodo = periodoExportacaoSelecionado()
        const incluirResumo = document.getElementById("incluirResumoExportacao")?.checked !== false
        const incluirUsuario = document.getElementById("incluirUsuarioExportacao")?.checked !== false

        mostrarToast("Gerando relatório de acessos únicos...", "info", "Exportação")

        const registros = await listarHistoricoPorPeriodo(periodo.inicioISO, periodo.fimISO)

        if(!registros.length){
            mostrarToast("Nenhuma movimentação encontrada nesse período.", "aviso", "Relatório vazio")
            return
        }

        const html = gerarHtmlExcelRelatorioUnico(registros, periodo, incluirResumo, incluirUsuario)
        baixarRelatorioExcel(`Relatorio_Acessos_Unicos_${periodo.inicioArquivo}_a_${periodo.fimArquivo}.xls`, html)

        fecharModalExportacao()
        mostrarToast("Relatório exportado com sucesso.", "sucesso", "Exportado")
    }catch(erro){
        console.error("Erro ao exportar relatório:", erro)
        mostrarToast(erro.message || "Não foi possível exportar o relatório.", "erro", "Erro")
    }
}



function exportarRelatorioDiario(){
    abrirModalExportacao()
}

document.addEventListener("keydown", evento => {
    if(evento.key === "Escape"){
        fecharModalExportacao()
    }
})



function chaveNaturalAcesso(acesso){
    return [
        normalizarBaseAutorizado(acesso?.tecnico || ""),
        normalizarBaseAutorizado(acesso?.site || ""),
        String(acesso?.ticket || "").trim()
    ].join("|")
}

function mesmoAcessoNatural(a,b){
    return chaveNaturalAcesso(a) === chaveNaturalAcesso(b)
}

function filtroNaturalAcesso(acesso){
    return `tecnico=eq.${encodeURIComponent(acesso.tecnico || "")}&site=eq.${encodeURIComponent(acesso.site || "")}&ticket=eq.${encodeURIComponent(acesso.ticket || "")}`
}

function salvar(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acessos));
    supabaseSalvarAcessos();
}



function mesclarOrdemLocal(dadosSupabase){
    const backup = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
    const mapaLocal = new Map()

    backup.forEach(item => {
        mapaLocal.set(Number(item.id), item)
    })

    return dadosSupabase.map(item => {
        const local = mapaLocal.get(Number(item.id))

        if(!local){
            return item
        }

        const ordemSupabase = Number(item.ordemColuna || 0)
        const ordemLocal = Number(local.ordemColuna || 0)

        if(ordemLocal > ordemSupabase){
            return {
                ...item,
                ordemColuna: ordemLocal,
                dataUltimoMovimento: local.dataUltimoMovimento || item.dataUltimoMovimento || "",
                atualizadoEm: local.atualizadoEm || item.atualizadoEm || ""
            }
        }

        return item
    })
}

async function carregar(){
    try{
        const dadosSupabase = await supabaseListarAcessos();
        acessos = mesclarOrdemLocal(dadosSupabase);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(acessos));
    }catch(erro){
        console.warn("Carregando acessos do backup local:", erro);
        const salvo = localStorage.getItem(STORAGE_KEY);
        acessos = salvo ? JSON.parse(salvo) : [];
    }

    renderizar();
}

function abrirFormatador(){
    const box = document.getElementById("boxFormatador")

    if(box){
        box.open = true
        box.setAttribute("open", "")
    }

    document.getElementById("chamadoBruto").focus()
}

function fecharFormatador(){
    const box = document.getElementById("boxFormatador")

    if(box){
        box.open = false
        box.removeAttribute("open")
    }
}

function extrairChamado(){
    const texto = document.getElementById("chamadoBruto").value

    if(!texto.trim()){
        mostrarToast("Cole o chamado bruto primeiro.", "aviso", "Atenção")
        return
    }

    const ticket = pegar(/\((\d+)\)/,texto)
    const tecnico = pegar(/ome completo\s+([^\n]+)/i,texto).toUpperCase()
    const supervisor = pegar(/Supervisor\s+([^\n]+)/i,texto).toUpperCase()

    let empresa = pegar(/Empresa Solicitante\s+Empresa Solicitante\s+([^\n]+)/i,texto).toUpperCase()
    if(!empresa){
        empresa = pegar(/Empresa Solicitante\s+([^\n]+)/i,texto).toUpperCase()
    }

    const siteOriginal = pegar(/Site a ser Acessado\s+([^\n]+)/i,texto)
    const siteAjustado = ajustarSite(siteOriginal)

    const dataInicial = formatarData(pegar(/data inicial\s+(\d{4}-\d{2}-\d{2})/i,texto))
    const dataFinal = formatarData(pegar(/data final\s+(\d{4}-\d{2}-\d{2})/i,texto))
    const periodo = dataInicial && dataFinal ? `${dataInicial} À ${dataFinal}` : ""

    let acao = ""
    const linhas = texto.split("\n")
    const indice = linhas.findIndex(l => l.toLowerCase().includes("ação a ser realizada"))

    if(indice !== -1 && linhas[indice + 1]){
        acao = linhas[indice + 1].trim()
    }

    acao = acao.toUpperCase()

    if(acao && !acao.endsWith(".")){
        acao += "."
    }

    const textoNormalizado = texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")

    // Leitura específica dos campos do GLPI
    const portaMoura =
        /porta de acesso moura[\s\S]{0,50}porta moura/i.test(textoNormalizado)

    const portaOperadora =
        /porta de acesso operadora[\s\S]{0,50}porta operadora/i.test(textoNormalizado)

    const implantacao =
        /atividade[\s\S]{0,30}implantacao/i.test(textoNormalizado)

    const operacao =
        /atividade[\s\S]{0,30}operacao/i.test(textoNormalizado)

    document.getElementById("tecnico").value = tecnico
    document.getElementById("site").value = siteAjustado
    document.getElementById("ticket").value = ticket
    document.getElementById("solicitante").value = supervisor
    document.getElementById("empresa").value = empresa
    document.getElementById("periodo").value = periodo
    document.getElementById("acao").value = acao

    document.getElementById("portaMoura").checked = portaMoura
    document.getElementById("portaOperadora").checked = portaOperadora || !portaMoura
    document.getElementById("implantacao").checked = implantacao || !operacao
    document.getElementById("operacao").checked = operacao
}

function limparFormulario(){
    ["chamadoBruto","tecnico","site","ticket","solicitante","empresa","periodo","acao"].forEach(id => {
        document.getElementById(id).value = ""
    })

    ;["portaMoura","portaOperadora","implantacao","operacao"].forEach(id => {
        const campo = document.getElementById(id)
        if(campo){ campo.checked = false }
    })
}


function dataFinalDoPeriodo(periodo){
    if(!periodo) return null

    const match = periodo.match(/(\d{2})\/(\d{2})\s*(?:À|A|a|á|Á)\s*(\d{2})\/(\d{2})/)
    if(!match) return null

    const hoje = new Date()
    return new Date(hoje.getFullYear(), Number(match[4]) - 1, Number(match[3]))
}

function periodoAindaValido(periodo){
    const fim = dataFinalDoPeriodo(periodo)
    if(!fim) return false

    const hoje = new Date()
    const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())

    return fim > hojeZerado
}

function normalizarBaseAutorizado(texto){
    return (texto || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .toUpperCase()
}

function salvarNaBaseAutorizados(acesso, statusBase = "autorizado"){
    if(!acesso || !acesso.tecnico || !acesso.site || !acesso.ticket || !acesso.periodo){
        return
    }

    if(!periodoAindaValido(acesso.periodo)){
        return
    }

    const STORAGE_BASE = "baseAutorizadosWesafer"
    let base = JSON.parse(localStorage.getItem(STORAGE_BASE) || "[]")

    const chaveNova =
        normalizarBaseAutorizado(acesso.tecnico) + "|" +
        normalizarBaseAutorizado(acesso.site) + "|" +
        acesso.ticket

    const itemBase = {
        tecnico: acesso.tecnico,
        site: acesso.site,
        ticket: acesso.ticket,
        solicitante: acesso.solicitante || "",
        empresa: acesso.empresa || "",
        periodo: acesso.periodo || "",
        acao: acesso.acao || "",
        portaMoura: acesso.portaMoura === true,
        portaOperadora: acesso.portaOperadora !== false,
        implantacao: acesso.implantacao !== false,
        operacao: acesso.operacao === true,
        origem: "acessos",
        statusBase: statusBase,
        ordemColuna: acesso.ordemColuna || Date.now(),
        dataUltimoMovimento: acesso.dataUltimoMovimento || dataISOAgora(),
        criadoEm: new Date().toLocaleString("pt-BR"),
        atualizadoEm: new Date().toLocaleString("pt-BR")
    }

    const index = base.findIndex(item => {
        const chaveExistente =
            normalizarBaseAutorizado(item.tecnico) + "|" +
            normalizarBaseAutorizado(item.site) + "|" +
            item.ticket

        return chaveExistente === chaveNova
    })

    if(index >= 0){
        base[index] = {...base[index], ...itemBase}
    }else{
        base.unshift(itemBase)
    }

    localStorage.setItem(STORAGE_BASE, JSON.stringify(base))
    supabaseSalvarAutorizado(acesso, statusBase)
}


async function adicionarCartao(){
    const tecnico = document.getElementById("tecnico").value.trim().toUpperCase()
    const site = document.getElementById("site").value.trim().toUpperCase()
    const ticket = document.getElementById("ticket").value.trim()
    const solicitante = document.getElementById("solicitante").value.trim().toUpperCase()
    const empresa = document.getElementById("empresa").value.trim().toUpperCase()
    const periodo = document.getElementById("periodo").value.trim().toUpperCase()
    const acao = document.getElementById("acao").value.trim().toUpperCase()

    if(!tecnico || !site || !ticket){
        alert("Preencha pelo menos Técnico, Site e Ticket.")
        return
    }

    const existente = acessos.find(item => item.ticket === ticket && item.site === site && item.tecnico === tecnico)

    if(existente && !confirm("Esse acesso já existe. Deseja atualizar e trazer para o topo?")){
        return
    }

    if(!document.getElementById("portaMoura").checked && !document.getElementById("portaOperadora").checked){
        document.getElementById("portaOperadora").checked = true
    }

    if(!document.getElementById("implantacao").checked && !document.getElementById("operacao").checked){
        document.getElementById("implantacao").checked = true
    }

    const novoAcesso = {
        id: existente?.id || Date.now(),
        tecnico,
        site,
        ticket,
        solicitante,
        empresa,
        periodo,
        acao,
        portaMoura: document.getElementById("portaMoura").checked,
        portaOperadora: document.getElementById("portaOperadora").checked,
        implantacao: document.getElementById("implantacao").checked,
        operacao: document.getElementById("operacao").checked,
        status: "aguardando",
        criadoEm: dataISOAgora(),
        atualizadoEm: dataISOAgora(),
        ordemColuna: Date.now(),
        dataUltimoMovimento: dataISOAgora()
    }
    novoAcesso.status = "aguardando"

    acessos = acessos.filter(item => !mesmoAcessoNatural(item, novoAcesso))
    acessos.unshift(novoAcesso)

    await supabaseSalvarAcessoNatural(novoAcesso)
    await registrarHistoricoAcesso(novoAcesso, "aguardando", "novo_acesso")
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acessos))
    renderizar()

    salvarNaBaseAutorizados(novoAcesso, "aguardando")

    limparFormulario()
    fecharFormatador()
}

async function alterarStatus(id,status){
    let acessoMovido = null
    const agoraOrdem = Date.now()
    const agoraIso = dataISOAgora()

    acessos = acessos.map(acesso => {
        if(acesso.id === id){
            acesso.status = status
            acesso.atualizadoEm = agoraIso
            acesso.ordemColuna = agoraOrdem
            acesso.dataUltimoMovimento = agoraIso
            acessoMovido = acesso

            if(status === "aguardando"){
                salvarNaBaseAutorizados(acesso, "aguardando")
            }

            if(status === "liberado" || status === "entrada" || status === "saida"){
                salvarNaBaseAutorizados(acesso, "autorizado")
            }
        }

        return acesso
    })

    localStorage.setItem(STORAGE_KEY, JSON.stringify(acessos))
    renderizar()

    if(acessoMovido){
        await supabaseAtualizarMovimento(acessoMovido)
        await registrarHistoricoAcesso(acessoMovido, status, "movimento_kanban")
    }
}

async function remover(id){
    if(!confirm("Deseja remover este cartão do Kanban de Acessos?")){
        return;
    }

    acessos = acessos.filter(acesso => acesso.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acessos));

    await supabaseExcluirAcesso(id);

    renderizar();
}

async function limparPlantao(){
    if(!confirm("Deseja limpar a tela de Acessos para iniciar um novo plantão? Os registros continuarão salvos no Supabase como histórico.")){
        return;
    }

    const arquivado = await supabaseArquivarTodosAcessos();

    if(!arquivado){
        mostrarToast("Não consegui limpar o plantão. Verifique o Console.", "erro", "Erro");
        return;
    }

    acessos = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acessos));
    renderizar();
    mostrarToast("Plantão limpo com sucesso.");
}

function alternarCompacto(){
    modoCompacto = !modoCompacto
    renderizar()
}

function statusNormalizadoAcesso(acesso){
    return (acesso?.status || "aguardando").toString().trim().toLowerCase()
}

function etiqueta(status){
    const mapa = {
        aguardando: ["e-aguardando","AGUARDANDO LIBERAÇÃO"],
        liberado: ["e-liberado","AGUARDANDO ENTRADA"],
        entrada: ["e-entrada","EM ATENDIMENTO"],
        saida: ["e-saida","CONCLUÍDO"]
    }

    return mapa[status]
}


function executarAcaoCard(id,tipo,statusDestino){
    copiarTexto(id,tipo)

    if(statusDestino){
        alterarStatus(id,statusDestino)
    }
}

function copiarTexto(id,tipo){
    const acesso = acessos.find(item => item.id === id)

    if(!acesso){
        return
    }

    const portaMoura = acesso.portaMoura ? "X" : (acesso.portaOperadora ? " " : "X")
    const operadora = acesso.portaOperadora ? "X" : " "
    const implantacao = acesso.implantacao === true ? "X" : " "
    const operacao = acesso.operacao === true ? "X" : " "

    let texto = ""

    if(tipo === "liberacao"){
        texto =
`Site: ${acesso.site}
Solicitante: ${acesso.solicitante || ""}
Técnico: ${acesso.tecnico}
Empresa: ${acesso.empresa || ""}
Período: ${acesso.periodo || ""}
Porta Moura (${portaMoura}) Operadora (${operadora})
Implantação (${implantacao}) Operação (${operacao})`
    }

    if(tipo === "entrada"){
        texto =
`ENTRADA 🔓
SITE: ${acesso.site}
TICKET: ${acesso.ticket}
TÉCNICO: ${acesso.tecnico}
AÇÃO: ${acesso.acao || ""}`
    }

    if(tipo === "saida"){
        texto =
`SAÍDA 🔒
SITE: ${acesso.site}
TICKET: ${acesso.ticket}
TÉCNICO: ${acesso.tecnico}
AÇÃO: ${acesso.acao || ""}`
    }

    navigator.clipboard.writeText(texto)
    mostrarToast("✅ Copiado")
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


function copiarRespostaPadrao(tipo){

    let texto = ""

    if(tipo === "acesso"){
        texto = `📢 LEIA COM ATENÇÃO

✅ ACESSO LIBERADO!

SITE:

Por gentileza, ao acessar o gabinete pelo aplicativo RedSquare, siga os passos abaixo:

📸 ABERTURA: Envie uma foto mostrando o gabinete aberto.

🎥 FECHAMENTO: Após concluir o serviço, envie uma foto do interior do gabinete antes de fechá-lo. Grave um vídeo curto mostrando o fechamento completo do gabinete.

⚠️ Esses registros são obrigatórios e servem para comprovar que o procedimento foi realizado corretamente.

⚠️ IMPORTANTE:
Ao realizar a abertura ou o fechamento do gabinete, é obrigatório aguardar que o ciclo no aplicativo RedSquare seja concluído até o final, antes de fechar o aplicativo.

🔑 App RedSquare
USUÁRIO:
SENHA:

Esse procedimento acima é indispensável. Qualquer dúvida pode me chamar.

📝 Observação: Informo que, a pedido da equipe Moura, o preenchimento do gabinete deverá ser realizado de cima para baixo.`
    }

    if(tipo === "fechamento"){
        texto = `🎥 FECHAMENTO:

Após concluir o serviço, envie uma foto do interior do gabinete antes de fechá-lo e grave um vídeo curto mostrando o fechamento completo.

Por favor, não esqueça de realizar o procedimento informado ao sair e aguardar a liberação do local. Obrigado.`
    }

    if(tipo === "formulario"){
        texto = `Liberação de Acesso – Cadeado do Site

Para que possamos realizar a liberação, é necessário preencher o formulário no link abaixo.

🔗 https://glpimecs.grupomoura.com/marketplace/formcreator/front/formdisplay.php?id=1`
    }

    navigator.clipboard.writeText(texto)
    mostrarToast("✅ Copiado")
}

function copiarTextoLivre(texto){
    navigator.clipboard.writeText(texto)
    mostrarToast("✅ Copiado")
}

const anotacoesRapidas = [
    {
        titulo:"💬 Bom dia - técnico",
        texto:"Bom dia, posso prosseguir com a liberação do técnico mencionado acima?"
    },
    {
        titulo:"💬 Boa tarde - técnico",
        texto:"Boa tarde, posso prosseguir com a liberação do técnico mencionado acima?"
    },
    {
        titulo:"💬 Bom dia - técnicos",
        texto:"Bom dia, posso prosseguir com a liberação dos técnicos mencionados acima?"
    },
    {
        titulo:"🔓 Liberado manutenção",
        texto:"Bom dia! Liberado para manutenção, conforme aprovação pré-validada."
    },
    {
        titulo:"👤 Renato César",
        texto:"A liberação do técnico foi efetuada conforme autorização prévia do Srº Renato César."
    },
    {
        titulo:"👤 Tarcísio Guerra",
        texto:"A liberação do técnico foi realizada conforme autorização prévia do Srº Tarcísio Gil Guerra."
    },
    {
        titulo:"🏢 Somos da Wesafer",
        texto:"Somos da Wesafer, responsável pela liberação dos gabinetes MOURA"
    },
    {
        titulo:"🚫 Sem autonomia",
        texto:"Entendi. Infelizmente, não tenho autonomia para realizar a liberação, apenas técnicos da Moura possuem acesso."
    },
    {
        titulo:"🚪 Segunda porta",
        texto:"Não é necessário abrir a segunda porta, pois já existem eletrodutos de interligação destinados exclusivamente à passagem de todos os cabos da operadora."
    },
    {
        titulo:"🔌 Eletrodutos",
        texto:"Os eletrodutos destacados na foto apenas atravessam nossa área, conectando diretamente o ambiente do cliente ao rodapé do gabinete."
    }
]

let anotacaoSelecionada = null

function montarAnotacoes(){
    const lista = document.getElementById("listaAnotacoes")

    if(!lista){
        return
    }

    lista.innerHTML = ""

    anotacoesRapidas.forEach((item,index) => {
        const botao = document.createElement("button")
        botao.className = "item-anotacao"
        botao.innerText = item.titulo
        botao.onclick = () => selecionarAnotacao(index)
        lista.appendChild(botao)
    })
}

function selecionarAnotacao(index){
    anotacaoSelecionada = anotacoesRapidas[index]

    document.getElementById("tituloPreviewAnotacao").innerText = anotacaoSelecionada.titulo
    document.getElementById("textoPreviewAnotacao").value = anotacaoSelecionada.texto

    document.querySelectorAll(".item-anotacao").forEach((btn,i) => {
        btn.classList.toggle("ativo", i === index)
    })
}

function abrirAnotacoes(){
    montarAnotacoes()

    const painel = document.getElementById("painelAnotacoes")

    if(painel){
        painel.classList.add("aberto")
    }

    if(anotacaoSelecionada === null && anotacoesRapidas.length){
        selecionarAnotacao(0)
    }
}

function fecharAnotacoes(){
    const painel = document.getElementById("painelAnotacoes")

    if(painel){
        painel.classList.remove("aberto")
    }
}

function copiarAnotacaoSelecionada(){
    if(!anotacaoSelecionada){
        alert("Selecione uma anotação primeiro.")
        return
    }

    navigator.clipboard.writeText(anotacaoSelecionada.texto)
    mostrarToast("✅ Copiado")
}



function valorOrdemColuna(acesso){
    return Number(acesso.ordemColuna || acesso.id || 0)
}

function passaFiltro(acesso){
    const busca = document.getElementById("busca").value.trim().toUpperCase()

    if(!busca){
        return true
    }

    return [
        acesso.tecnico,
        acesso.site,
        acesso.ticket,
        acesso.solicitante,
        acesso.empresa,
        acesso.periodo,
        acesso.acao
    ].join(" ").toUpperCase().includes(busca)
}

function renderizar(){
    const listas = {
        aguardando: document.getElementById("listaAguardando"),
        liberado: document.getElementById("listaLiberado"),
        entrada: document.getElementById("listaEntrada"),
        saida: document.getElementById("listaSaida")
    }

    Object.values(listas).forEach(lista => lista.innerHTML = "")

    const contadores = {
        aguardando: 0,
        liberado: 0,
        entrada: 0,
        saida: 0
    }

    acessos
        .filter(acesso => acesso.status !== "arquivado")
        .sort((a,b) => valorOrdemColuna(b) - valorOrdemColuna(a))
        .forEach(acesso => {
        contadores[acesso.status]++

        if(!passaFiltro(acesso)){
            return
        }

        const [classeEtiqueta, textoEtiqueta] = etiqueta(acesso.status)

        const card = document.createElement("div")
        card.className = "card-acesso"
        card.draggable = true
        card.dataset.id = acesso.id

        card.innerHTML = `
            <span class="etiqueta ${classeEtiqueta}">${textoEtiqueta}</span>

            <h3>${acesso.tecnico}</h3>

            <div class="card-meta">
                <div><strong>${acesso.site}</strong> • ${acesso.ticket}</div>
                ${modoCompacto ? "" : `
                <div><strong>PERÍODO:</strong> ${acesso.periodo || "-"}</div>
                <div><strong>SOLICITANTE:</strong> ${acesso.solicitante || "-"}</div>
                <div><strong>EMPRESA:</strong> ${acesso.empresa || "-"}</div>
                `}
            </div>

            <div class="card-botoes">
                <button class="btn-amarelo" onclick="copiarTexto(${acesso.id}, 'liberacao')">SOLICITAR ACESSO</button>
                <button onclick="executarAcaoCard(${acesso.id}, 'entrada', 'entrada')">ENTRADA</button>
                <button onclick="executarAcaoCard(${acesso.id}, 'saida', 'saida')">SAÍDA</button>
                <button class="btn-cinza" onclick="remover(${acesso.id})">REMOVER</button>
            </div>
        `

        card.addEventListener("dragstart", evento => {
            evento.dataTransfer.setData("text/plain", acesso.id)

            const clone = card.cloneNode(true)
            clone.classList.add("drag-clone-card")
            clone.style.width = `${card.offsetWidth}px`
            document.body.appendChild(clone)

            evento.dataTransfer.effectAllowed = "move"
            const rect = card.getBoundingClientRect()
            const deslocamentoX = evento.clientX - rect.left
            const deslocamentoY = evento.clientY - rect.top

            evento.dataTransfer.setDragImage(clone, deslocamentoX, deslocamentoY)

            card.classList.add("arrastando")

            setTimeout(() => {
                if(clone && clone.parentNode){
                    clone.parentNode.removeChild(clone)
                }
            }, 0)
        })

        card.addEventListener("dragend", () => {
            card.classList.remove("arrastando")
        })

        listas[acesso.status].appendChild(card)
    })

    document.getElementById("qtdAguardando").innerText = contadores.aguardando
    document.getElementById("qtdLiberado").innerText = contadores.liberado
    document.getElementById("qtdEntrada").innerText = contadores.entrada
    document.getElementById("qtdSaida").innerText = contadores.saida

    document.getElementById("colAguardando").innerText = contadores.aguardando
    document.getElementById("colLiberado").innerText = contadores.liberado
    document.getElementById("colEntrada").innerText = contadores.entrada
    document.getElementById("colSaida").innerText = contadores.saida
}

document.querySelectorAll(".kanban-coluna").forEach(coluna => {
    coluna.addEventListener("dragover", evento => {
        evento.preventDefault()
        coluna.classList.add("drag-over")
    })

    coluna.addEventListener("dragleave", () => {
        coluna.classList.remove("drag-over")
    })

    coluna.addEventListener("drop", evento => {
        evento.preventDefault()
        coluna.classList.remove("drag-over")

        const id = Number(evento.dataTransfer.getData("text/plain"))
        const status = coluna.dataset.status

        alterarStatus(id,status)
    })
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

window.addEventListener("DOMContentLoaded", async () => {
    const logado = await verificarLogin()

    if(!logado){
        return
    }

    configurarMenuUsuario()
    atualizarDataPlantao()
    limparHistoricoAntigo()
    carregar()
})

async function atualizarAcessosAutomaticamente(){
    const box = document.getElementById("boxFormatador")
    if(box && box.open){ return }

    await carregar()
}

setInterval(atualizarAcessosAutomaticamente, 5000)
