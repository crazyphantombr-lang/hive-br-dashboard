/**
 * Script: Fetch Data (Hybrid/Restored)
 * Version: 3.1.1 (Config Fix)
 * Description: Correção da conta alvo para hive-br.voter (onde estão as delegações reais).
 */

const fs = require("fs");
const path = require("path");

// Tenta usar fetch nativo (Node 18+) ou node-fetch se disponível
let fetch;
try { fetch = global.fetch || require("node-fetch"); } catch (e) { }

// --- CONFIGURAÇÕES ---
// CORREÇÃO CRÍTICA: A conta que recebe delegações é a .voter
const HIVE_ACCOUNT = "hive-br.voter"; 

// Aumentado limit para 1000 (Capacidade real da API)
const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${HIVE_ACCOUNT}/incoming?limit=1000`; 
const RPC_NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network"];
const IGNORE_LIST = ["ptgram-power", "tipu", "bdvoter.cur"];

// --- CONFIGURAÇÃO DE CAMINHOS ---
const DATA_DIR = fs.existsSync("data") ? "data" : path.join(__dirname, "..", "data");
const LISTS_FILE = path.join(DATA_DIR, "lists.json");
const OUTPUT_FILE = path.join(DATA_DIR, "current.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- FUNÇÕES AUXILIARES ---

async function hiveRpc(method, params) {
    for (const node of RPC_NODES) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

            const response = await fetch(node, {
                method: "POST", 
                body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
                headers: { "Content-Type": "application/json" },
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (!response.ok) continue;

            const json = await response.json();
            if (json.result) return json.result;
        } catch (e) { 
            // Falha silenciosa no nó, tenta o próximo
        }
    }
    console.warn(`⚠️ Aviso: Falha RPC para método ${method}`);
    return null;
}

async function fetchGlobalProps() {
    const props = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
    if (!props) return 0.0005; 
    return parseFloat(props.total_vesting_fund_hive) / parseFloat(props.total_vesting_shares);
}

// Data do Último Post
async function fetchLastPostDate(username) {
    const posts = await hiveRpc("condenser_api.get_discussions_by_author_before_date", [username, "", "2030-01-01T00:00:00", 1]);
    if (posts && posts.length > 0) return posts[0].created;
    return "1970-01-01T00:00:00";
}

// Batching para Detalhes de Conta
async function fetchAccountDetailsBatch(usernames) {
    let details = {};
    const BATCH_SIZE = 50; 
    
    console.log(`📦 Processando detalhes de ${usernames.length} contas em lotes...`);

    for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
        const batch = usernames.slice(i, i + BATCH_SIZE);
        const accounts = await hiveRpc("condenser_api.get_accounts", [batch]);
        
        if (accounts) {
            accounts.forEach(acc => {
                const vests = parseFloat(acc.vesting_shares) + parseFloat(acc.received_vesting_shares) - parseFloat(acc.delegated_vesting_shares);
                details[acc.name] = { 
                    total_vests: vests,
                    next_withdrawal: acc.next_vesting_withdrawal,
                    balance: acc.balance 
                };
            });
        }
        await new Promise(r => setTimeout(r, 100));
    }
    return details;
}

// --- EXECUÇÃO PRINCIPAL ---

async function run() {
    console.log(`🔄 Iniciando Coleta para @${HIVE_ACCOUNT} (v3.1.1)...`);
    
    if (!fetch) {
        console.error("❌ Erro: Fetch API não disponível.");
        process.exit(1);
    }

    try {
        // 1. Coleta Fator Global
        const vestToHp = await fetchGlobalProps();

        // 2. Coleta Lista de Delegações via HAF (Conta Correta agora)
        console.log("📡 Consultando API HAF (Mahdiyari)...");
        const hafRes = await fetch(HAF_API);
        let rawDelegations = [];
        
        if (hafRes.ok) {
            rawDelegations = await hafRes.json();
        } else {
            console.warn("⚠️ API HAF indisponível. Tentando RPC padrão...");
            rawDelegations = await hiveRpc("condenser_api.get_vesting_delegations", [HIVE_ACCOUNT, "", 1000]);
        }

        if (!Array.isArray(rawDelegations)) throw new Error("Falha crítica ao obter lista de delegações.");

        const validDelegations = rawDelegations.filter(d => !IGNORE_LIST.includes(d.delegator));
        console.log(`✅ ${validDelegations.length} delegações válidas encontradas.`);

        // 3. Prepara Enriquecimento
        let lists = { verificado_br: [], curation_trail: [] };
        if (fs.existsSync(LISTS_FILE)) lists = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));

        const delegatorNames = validDelegations.map(d => d.delegator);
        
        // 4. Busca Detalhes em Lotes
        const accountsData = await fetchAccountDetailsBatch(delegatorNames);

        // 5. Monta o Ranking
        let ranking = [];
        let totalHpProject = 0;

        for (const d of validDelegations) {
            const username = d.delegator;
            const delegatedHp = parseFloat(d.vesting_shares) * vestToHp;
            
            const accInfo = accountsData[username] || { total_vests: 0, next_withdrawal: "1969-12-31" };
            const totalAccountHp = accInfo.total_vests * vestToHp;

            const lastPost = await fetchLastPostDate(username);
            
            let country = null;
            if (lists.verificado_br.includes(username)) country = "BR_CERT";
            else if (lists.pendente_br?.includes(username)) country = "BR";
            else if (lists.verificado_pt?.includes(username)) country = "PT_CERT";

            ranking.push({
                delegator: username,
                delegated_hp: delegatedHp,
                timestamp: d.timestamp || d.min_delegation_time || new Date().toISOString(),
                total_account_hp: totalAccountHp,
                token_balance: 0,
                next_withdrawal: accInfo.next_withdrawal,
                country_code: country,
                in_curation_trail: lists.curation_trail.includes(username),
                last_user_post: lastPost,
                last_vote_date: null,
                votes_month: 0
            });
            
            totalHpProject += delegatedHp;
        }

        ranking.sort((a, b) => b.delegated_hp - a.delegated_hp);

        // --- TRAVA DE SEGURANÇA ---
        if (ranking.length === 0 || totalHpProject < 100) {
            console.error("❌ ERRO CRÍTICO: Dados inconsistentes detectados (HP zerado).");
            process.exit(1);
        }

        const output = {
            updated_at: new Date().toISOString(),
            ranking: ranking
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log(`💾 Arquivo salvo: ${OUTPUT_FILE}`);
        console.log(`📊 Stats Finais: ${ranking.length} contas | Total HP: ${Math.floor(totalHpProject)}`);

    } catch (err) {
        console.error("❌ Erro Fatal:", err.message);
        process.exit(1);
    }
}

run();
