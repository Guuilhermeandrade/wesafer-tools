const AUTH_KEY = "wesaferAuth"

function mostrarErro(mensagem){
    const erro = document.getElementById("erroLogin")
    erro.innerText = mensagem
    erro.style.display = "block"
}

function obterSessao(){
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null")
}

function salvarSessao(dados){
    const sessaoAtual = obterSessao() || {}

    localStorage.setItem(AUTH_KEY, JSON.stringify({
        access_token:dados.access_token || sessaoAtual.access_token,
        refresh_token:dados.refresh_token || sessaoAtual.refresh_token,
        user:dados.user || sessaoAtual.user,
        logado_em:sessaoAtual.logado_em || new Date().toISOString(),
        renovado_em:new Date().toISOString()
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

async function validarSessaoExistente(){
    const sessao = obterSessao()

    if(!sessao || !sessao.access_token){
        return
    }

    if(await validarAccessToken()){
        window.location.href = "index.html"
        return
    }

    if(await renovarSessao()){
        window.location.href = "index.html"
        return
    }

    localStorage.removeItem(AUTH_KEY)
}

async function entrar(){
    const email = document.getElementById("email").value.trim()
    const senha = document.getElementById("senha").value
    const botao = document.getElementById("btnEntrar")

    document.getElementById("erroLogin").style.display = "none"

    if(!email || !senha){
        mostrarErro("Informe o usuário e a senha.")
        return
    }

    botao.disabled = true
    botao.innerText = "ENTRANDO..."

    try{
        const resposta = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method:"POST",
            headers:{
                apikey: SUPABASE_ANON_KEY,
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                email:email,
                password:senha
            })
        })

        const dados = await resposta.json()

        if(!resposta.ok){
            mostrarErro("Usuário ou senha inválidos.")
            botao.disabled = false
            botao.innerText = "ENTRAR NO SISTEMA"
            return
        }

        salvarSessao(dados)

        window.location.href = "index.html"
    }catch(erro){
        mostrarErro("Não foi possível conectar ao Supabase.")
        botao.disabled = false
        botao.innerText = "ENTRAR NO SISTEMA"
    }
}

document.addEventListener("keydown", evento => {
    if(evento.key === "Enter"){
        entrar()
    }
})

validarSessaoExistente()
