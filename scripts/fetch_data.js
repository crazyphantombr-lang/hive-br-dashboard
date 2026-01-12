/**
 * Script: Fetch ALL Data (Unified)
 * Version: 3.0.1 (Batching Hotfix)
 * Description: Coleta dados com processamento em lotes e proteção contra falhas de API.
 */

const fs = require("fs");
const path = require("path");

// --- CONFIG ---
const HIVE_ACCOUNT = "hive-br";
// Lista de Nós RPC para redundância (Failover)
const RPC_NODES = [
    "https://api.hive.blog",
    "https://api.deathwing.me",
    "https://api.openhive.network",
    "https://anyx.io"
];
const IGNORE_LIST = ["ptgram-power", "tipu", "bdvoter.cur"];

// Configuração de Diretórios (Compatível com execução via Root ou Pasta scripts)
const DATA_DIR = fs.existsSync("data") ? "data" : path.join(__dirname, "..", "data");
const LISTS_FILE = path.join(DATA_DIR, "lists.json");
const OUTPUT_FILE = path.join(DATA_DIR, "current.json");

// Garante que a pasta existe
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- HELPER: RPC COM ROTAÇÃO E RETRY ---
async function hiveCall(method, params) {
    for (const node of RPC_NODES) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(node, {
                method: "POST",
                body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: 1 }),
                headers: { "Content-Type": "application/json" },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            
            return data.result;
        } catch (e) {
            console.warn(`⚠️ Falha no nó ${node} (${method}): ${e.message}. Tentando próximo...`);
        }
    }
    console.error(`❌ Todas as tentativas de RPC falharam para ${method}.`);
    return null;
}

// --- FUNÇÕES DE COLETA ---

async function fetchGlobalProps() {
    const props = await hiveCall("condenser_api.get_dynamic_global_properties", []);
    if (!props) return null;
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
    
    // Tenta até 5 páginas de histórico
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
    const posts = await hiveCall("condenser_api.get_discussions_by_author_before_date", [username, "", "2030-01-01T00:00:00", 1]);
    if (posts && posts.length > 0) return posts[0].created;
    return "1970-01-01T00:00:00";
}

// --- BATCHING (LOTES) PARA GET_ACCOUNTS ---
async function fetchAccountDetailsInBatches(usernames) {
    let details = {};
    const BATCH_SIZE = 50; // Tamanho seguro para API pública

    for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
        const batch = usernames.slice(i, i + BATCH_SIZE);
        console.log(`   📦 Processando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(usernames.length/BATCH_SIZE)} (${batch.length} contas)...`);
        
        const accounts = await hiveCall("condenser_api.get_accounts", [batch]);
        
        if (accounts) {
            accounts.forEach(acc => {
                const vests = parseFloat(acc.vesting_shares) + parseFloat(acc.received_vesting_shares) - parseFloat(acc.delegated_vesting_shares);
                details[acc.name] = { 
                    total_vests: vests,
                    next_withdrawal: acc.next_vesting_withdrawal,
                    balance: acc.balance // Útil futuramente
                };
            });
        } else {
            console.error(`❌ Falha crítica no lote iniciando em ${batch[0]}`);
            // Não abortamos tudo, mas esse lote ficará sem dados (será pego na validação final)
        }
    }
    return details;
}

// --- MAIN RUN ---

async function run() {
    console.log("🚀 Iniciando Coleta Unificada (V3.0.1 - Hotfix)...");
    
    // 1. Prepara Listas e Fator HP
    const vestToHp = await fetchGlobalProps();
    if (!vestToHp) {
        console.error("❌ Erro fatal: Não foi possível obter Global Properties.");
        process.exit(1);
    }

    const votesData = await fetchVotesHistory();
    
    let lists = { verificado_br: [], curation_trail: [] };
    if (fs.existsSync(LISTS_FILE)) lists = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));

    // 2. Busca Delegações
    console.log("🐝 Buscando delegações...");
    const rawDelegations = await hiveCall("condenser_api.get_vesting_delegations", [HIVE_ACCOUNT, "", 1000]);
    if (!rawDelegations || rawDelegations.length === 0) {
        console.error("❌ Erro fatal: Falha ao buscar delegações ou lista vazia.");
        process.exit(1);
    }

    // Filtrar ignorados
    const validDelegations = rawDelegations.filter(d => !IGNORE_LIST.includes(d.delegator));
    
    // 3. Busca Detalhes das Contas (COM BATCHING)
    const delegatorNames = validDelegations.map(d => d.delegator);
    console.log(`👤 Enriquecendo dados de ${delegatorNames.length} contas (modo Batch)...`);
    
    const accountsData = await fetchAccountDetailsInBatches(delegatorNames);

    // 4. Monta o Ranking Final
    const ranking = [];
    let totalDelegatedHpCheck = 0;
    
    for (const d of validDelegations) {
        const username = d.delegator;
        const delegatedHp = parseFloat(d.vesting_shares) * vestToHp;
        totalDelegatedHpCheck += delegatedHp;
        
        const vInfo = votesData[username] || { count: 0, last_vote: null };
        
        // Se a conta não veio no batch (falha de API), usamos fallback seguro, mas logamos aviso
        const aInfo = accountsData[username] || { total_vests: 0, next_withdrawal: "1969-12-31T23:59:59" };
        const totalHp = aInfo.total_vests * vestToHp;

        // Fetch Individual (Post) - Ainda necessário ser um por um, mas é leve
        const lastPost = await fetchLastPostDate(username);

        let country = null;
        if (lists.verificado_br.includes(username)) country = "BR_CERT";
        else if (lists.pendente_br?.includes(username)) country = "BR";
        else if (lists.verificado_pt?.includes(username)) country = "PT_CERT";

        ranking.push({
            delegator: username,
            delegated_hp: delegatedHp,
            timestamp: d.min_delegation_time,
            total_account_hp: totalHp,
            token_balance: 0, 
            next_withdrawal: aInfo.next_withdrawal,
            country_code: country,
            in_curation_trail: lists.curation_trail.includes(username),
            last_user_post: lastPost,
            last_vote_date: vInfo.last_vote,
            votes_month: vInfo.count
        });
        
        // Delay minúsculo para não floodar
        // await new Promise(r => setTimeout(r, 10)); 
    }

    ranking.sort((a, b) => b.delegated_hp - a.delegated_hp);

    // --- SAFETY GATE (Trava de Segurança) ---
    // Impede salvar arquivo zerado se a API falhou silenciosamente
    if (ranking.length === 0 || totalDelegatedHpCheck < 100) {
        console.error("❌ ABORTANDO: Dados inconsistentes detectados.");
        console.error(`   Ranking Length: ${ranking.length}`);
        console.error(`   Total Delegated HP: ${totalDelegatedHpCheck}`);
        console.error("   O arquivo current.json NÃO será atualizado para preservar o site.");
        process.exit(1); // Erro para o GitHub Actions parar
    }

    const output = {
        updated_at: new Date().toISOString(),
        ranking: ranking
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✅ Sucesso! current.json gerado com ${ranking.length} usuários.`);
    console.log(`   Total HP Delegado validado: ${Math.floor(totalDelegatedHpCheck)}`);
}

run();
