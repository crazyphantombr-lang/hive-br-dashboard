/**
 * Script: Fetch Data (Hybrid/Restored)
 * Version: 3.1.0 (Back to HAF)
 * Description: Restaura o núcleo robusto da v2.21.0 (API HAF) e adiciona o enriquecimento de dados em lotes para o novo Frontend.
 */

const fs = require("fs");
const path = require("path");

// Tenta usar fetch nativo (Node 18+) ou node-fetch se disponível
let fetch;
try { fetch = global.fetch || require("node-fetch"); } catch (e) { }

// --- CONFIGURAÇÕES DO SISTEMA ANTIGO (v2.21.0) ---
const HIVE_ACCOUNT = "hive-br";
// Aumentado limit para 1000 conforme sua observação sobre a capacidade da API
const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${HIVE_ACCOUNT}/incoming?limit=1000`; 
const RPC_NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network"];
const IGNORE_LIST = ["ptgram-power", "tipu", "bdvoter.cur"];

// --- CONFIGURAÇÃO DE CAMINHOS (Robustez) ---
// Garante que roda certo seja via root ou pasta scripts
const DATA_DIR = fs.existsSync("data") ? "data" : path.join(__dirname, "..", "data");
const LISTS_FILE = path.join(DATA_DIR, "lists.json");
const OUTPUT_FILE = path.join(DATA_DIR, "current.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- FUNÇÕES AUXILIARES (Baseadas na v2.21) ---

async function hiveRpc(method, params) {
    for (const node of RPC_NODES) {
        try {
            // AbortController para evitar travamentos infinitos
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
    if (!props) return 0.0005; // Fallback seguro
    return parseFloat(props.total_vesting_fund_hive) / parseFloat(props.total_vesting_shares);
}

// Nova Função Necessária: Data do Último Post (Individual)
async function fetchLastPostDate(username) {
    const posts = await hiveRpc("condenser_api.get_discussions_by_author_before_date", [username, "", "2030-01-01T00:00:00", 1]);
    if (posts && posts.length > 0) return posts[0].created;
    return "1970-01-01T00:00:00";
}

// Nova Solução: Batching para Detalhes de Conta (Evita o bug da v3.0.0)
async function fetchAccountDetailsBatch(usernames) {
    let details = {};
    const BATCH_SIZE = 50; // Tamanho seguro para condenser_api.get_accounts
    
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
        // Pequena pausa para não engasgar o nó público
        await new Promise(r => setTimeout(r, 100));
    }
    return details;
}

// --- EXECUÇÃO PRINCIPAL ---

async function run() {
    console.log("🔄 Iniciando Coleta (v3.1.0 - Sistema Híbrido)...");
    
    if (!fetch) {
        console.error("❌ Erro: Fetch API não disponível. Use Node 18+ ou instale node-fetch.");
        process.exit(1);
    }

    try {
        // 1. Coleta Fator Global (Vests -> HP)
        const vestToHp = await fetchGlobalProps();

        // 2. Coleta Lista de Delegações via HAF (Baseado na v2.21.0 - Estável)
        console.log("📡 Consultando API HAF (Mahdiyari)...");
        const hafRes = await fetch(HAF_API);
        let rawDelegations = [];
        
        if (hafRes.ok) {
            rawDelegations = await hafRes.json();
        } else {
            console.warn("⚠️ API HAF indisponível. Tentando RPC padrão...");
            // Fallback para RPC se HAF falhar (Limitado a 1000)
            rawDelegations = await hiveRpc("condenser_api.get_vesting_delegations", [HIVE_ACCOUNT, "", 1000]);
        }

        if (!Array.isArray(rawDelegations)) throw new Error("Falha crítica ao obter lista de delegações.");

        // Filtra ignorados
        const validDelegations = rawDelegations.filter(d => !IGNORE_LIST.includes(d.delegator));
        console.log(`✅ ${validDelegations.length} delegações válidas encontradas.`);

        // 3. Prepara Enriquecimento de Dados
        let lists = { verificado_br: [], curation_trail: [] };
        if (fs.existsSync(LISTS_FILE)) lists = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));

        const delegatorNames = validDelegations.map(d => d.delegator);
        
        // 4. Busca Detalhes Pesados em Lotes (Solução Nova)
        const accountsData = await fetchAccountDetailsBatch(delegatorNames);

        // 5. Monta o Ranking (Compatível com main.js v2.18.3)
        let ranking = [];
        let totalHpProject = 0;

        for (const d of validDelegations) {
            const username = d.delegator;
            // HAF retorna 'vesting_shares', RPC também.
            const delegatedHp = parseFloat(d.vesting_shares) * vestToHp;
            
            const accInfo = accountsData[username] || { total_vests: 0, next_withdrawal: "1969-12-31" };
            const totalAccountHp = accInfo.total_vests * vestToHp;

            // Busca Last Post (Individual é leve se a lista já existe)
            const lastPost = await fetchLastPostDate(username);
            
            // Lógica de País
            let country = null;
            if (lists.verificado_br.includes(username)) country = "BR_CERT";
            else if (lists.pendente_br?.includes(username)) country = "BR";
            else if (lists.verificado_pt?.includes(username)) country = "PT_CERT";

            ranking.push({
                delegator: username,
                delegated_hp: delegatedHp,
                timestamp: d.timestamp || d.min_delegation_time || new Date().toISOString(),
                total_account_hp: totalAccountHp,
                token_balance: 0, // Placeholder para token customizado se necessário futuramente
                next_withdrawal: accInfo.next_withdrawal,
                country_code: country,
                in_curation_trail: lists.curation_trail.includes(username),
                last_user_post: lastPost,
                last_vote_date: null, // Deixamos nulo para economizar requests, o frontend lida bem
                votes_month: 0
            });
            
            totalHpProject += delegatedHp;
        }

        ranking.sort((a, b) => b.delegated_hp - a.delegated_hp);

        // --- TRAVA DE SEGURANÇA (Safety Gate) ---
        if (ranking.length === 0 || totalHpProject < 100) {
            console.error("❌ ERRO CRÍTICO: Dados inconsistentes detectados (HP zerado).");
            console.error("   O arquivo current.json NÃO será salvo para proteger o site.");
            process.exit(1);
        }

        // 6. Salvar Arquivo
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
