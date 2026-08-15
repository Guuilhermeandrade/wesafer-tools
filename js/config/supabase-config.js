// CONFIGURAÇÃO SUPABASE - WESAFER TOOLS
// Use somente a Publishable Key. Nunca use a Secret Key no site.

const SUPABASE_REST_URL = "https://bjisiynwvizmmhjmvhka.supabase.co/rest/v1";
const SUPABASE_KEY = "sb_publishable_JfiY1F_p2bkws8v6Rvfr_w_bOMSqn6b";

const SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json"
};

function supabaseHeaders(prefer = ""){
    const headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
    };

    try{
        const sessao = JSON.parse(localStorage.getItem("wesaferAuth") || "null");
        const accessToken = sessao?.access_token;

        headers["Authorization"] = `Bearer ${accessToken || SUPABASE_KEY}`;
    }catch(erro){
        headers["Authorization"] = `Bearer ${SUPABASE_KEY}`;
    }

    if(prefer){
        headers["Prefer"] = prefer;
    }

    return headers;
}

function dataISOAgora(){
    return new Date().toISOString();
}
const SUPABASE_URL = SUPABASE_REST_URL.replace("/rest/v1", "");
const SUPABASE_ANON_KEY = SUPABASE_KEY;