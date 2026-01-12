/**
 * Script: Fetch ALL Data (Unified)
 * Version: 3.0.0 (Monolith)
 * Description: Coleta Votos, Posts, Contas e Delegações em um único fluxo seguro.
 */

const fs = require("fs");
const path = require("path");

// --- CONFIG ---
const HIVE_ACCOUNT = "hive-br";
const HIVE_API_URL = "https://api.hive.blog";
const IGNORE_LIST = ["ptgram-power", "tipu", "bdvoter.cur"];
const DATA_DIR = "data";
const LISTS_FILE = path.join(DATA_DIR, "lists.json");
const OUTPUT_FILE = path.join(DATA_DIR, "current.json");

// --- HELPER FETCH ---
async function hiveCall(method, params) {
    try {
        const response = await fetch(HIVE_API_URL, {
            method: "POST",
            body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: 1 }),
            headers: { "Content-Type": "application/json" }
        });
        const data = await response.json();
        return data.result;
    } catch (e) {
        console.error(`❌ Erro na API (${method}):`, e.message);
        return null;
    }
}

// --- FUNÇÕES DE COLETA ---

async function fetchGlobalProps() {
    const props = await hiveCall("condenser_api.get_dynamic_global_properties", []);
    if (!props) return 0.0005; // Fallback seguro
    const totalVestFund = parseFloat(props.total_vesting_fund_hive);
    const totalVestShares = parseFloat(props.total_vesting_shares);
    return totalVestFund / totalVestShares;
}

async function fetchVotesHistory() {
    console.log("📊 Coletando histórico de votos...");
    let voteCounts = {}; 
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let start = -1;
    let limit = 1000;
    
    // Coleta até achar data antiga (limite seguro de 3 loops para não travar)
    for (let i = 0; i < 5; i++) {
        const history = await hiveCall("condenser_api.get_account_history", [HIVE_ACCOUNT, start, limit]);
        if (!history || history.length === 0) break;
        
        history.reverse();
        start = history[history.length - 1][0] - 1;

        let stop = false;
        for (const tx of history) {
            const timestamp = tx[1].timestamp + "Z";
            if (new Date(timestamp) < thirtyDaysAgo) { stop = true; break; }

            const op = tx[1].op;
            if (op[0] === "vote" && op[1].voter === HIVE_ACCOUNT) {
                const author = op[1].author;
                if (!voteCounts[author]) voteCounts[author] = { count: 0, last_vote: timestamp };
                voteCounts[author].count++;
                if (timestamp > voteCounts[author].last_vote) voteCounts[author].last_vote = timestamp;
            }
        }
        if (stop || start < 0) break;
    }
    return voteCounts;
}

async function fetchLastPostDate(username) {
    // Busca apenas o último post do usuário
    const posts = await hiveCall("condenser_api.get_discussions_by_author_before_date", [username, "", "2030-01-01T00:00:00", 1]);
    if (posts && posts.length > 0) return posts[0].created;
    return "1970-01-01T00:00:00";
}

async function fetchAccountDetails(usernames) {
    const accounts = await hiveCall("condenser_api.get_accounts", [usernames]);
    let details = {};
    if (accounts) {
        accounts.forEach(acc => {
            // Saldo HBR teria que vir de outra API (Hive Engine), por enquanto deixamos 0 ou implementamos depois
            // Aqui focamos no HP total e Power Down
            const vests = parseFloat(acc.vesting_shares) + parseFloat(acc.received_vesting_shares) - parseFloat(acc.delegated_vesting_shares);
            details[acc.name] = { 
                total_vests: vests,
                next_withdrawal: acc.next_vesting_withdrawal 
            };
        });
    }
    return details;
}

// --- MAIN RUN ---

async function run() {
    console.log("🚀 Iniciando Coleta Unificada (V3.0)...");
    
    // 1. Prepara Listas e Fator HP
    const vestToHp = await fetchGlobalProps();
    const votesData = await fetchVotesHistory();
    
    let lists = { verificado_br: [], curation_trail: [] };
    if (fs.existsSync(LISTS_FILE)) lists = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));

    // 2. Busca Delegações
    console.log("🐝 Buscando delegações...");
    const rawDelegations = await hiveCall("condenser_api.get_vesting_delegations", [HIVE_ACCOUNT, "", 1000]);
    if (!rawDelegations) throw new Error("Falha crítica ao buscar delegações.");

    // Filtrar ignorados
    const validDelegations = rawDelegations.filter(d => !IGNORE_LIST.includes(d.delegator));
    
    // Lista de nomes para buscar detalhes em lote
    const delegatorNames = validDelegations.map(d => d.delegator);
    
    // 3. Busca Detalhes das Contas (HP Total, Power Down) - Em Lote
    console.log(`👤 Enriquecendo dados de ${delegatorNames.length} contas...`);
    const accountsData = await fetchAccountDetails(delegatorNames);

    // 4. Monta o Ranking Final
    // (Busca posts individualmente com delay leve para não estourar API pública)
    const ranking = [];
    
    for (const d of validDelegations) {
        const username = d.delegator;
        const delegatedHp = parseFloat(d.vesting_shares) * vestToHp;
        
        // Dados de Voto
        const vInfo = votesData[username] || { count: 0, last_vote: null };
        
        // Dados de Conta
        const aInfo = accountsData[username] || { total_vests: 0, next_withdrawal: "1969-12-31T23:59:59" };
        const totalHp = aInfo.total_vests * vestToHp;

        // Dados de Post (Await no loop é lento mas seguro para script simples)
        const lastPost = await fetchLastPostDate(username);

        // Bandeira
        let country = null;
        if (lists.verificado_br.includes(username)) country = "BR_CERT";
        else if (lists.pendente_br?.includes(username)) country = "BR";
        else if (lists.verificado_pt?.includes(username)) country = "PT_CERT";

        ranking.push({
            delegator: username,
            delegated_hp: delegatedHp,
            timestamp: d.min_delegation_time,
            total_account_hp: totalHp,
            token_balance: 0, // Placeholder para HBR
            next_withdrawal: aInfo.next_withdrawal,
            country_code: country,
            in_curation_trail: lists.curation_trail.includes(username),
            last_user_post: lastPost,
            last_vote_date: vInfo.last_vote,
            votes_month: vInfo.count
        });
        
        // Pequeno delay para não sobrecarregar
        // await new Promise(r => setTimeout(r, 50)); 
    }

    ranking.sort((a, b) => b.delegated_hp - a.delegated_hp);

    const output = {
        updated_at: new Date().toISOString(),
        ranking: ranking
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✅ Sucesso! current.json gerado com ${ranking.length} usuários.`);
}

run();
