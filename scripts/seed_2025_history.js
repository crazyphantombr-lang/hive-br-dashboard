/**
 * Script: Seed 2025 History (Time Machine)
 * Version: 1.0.2 (Hotfix)
 * Description: Scans 2025 history. Auto-repairs Git Merge Conflicts in JSON files.
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const ACCOUNT = "hive-br.voter";
const RPC_NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network"];
const DATA_DIR = "data";
const TARGET_FILE = path.join(DATA_DIR, "monthly_stats.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// --- FUNÇÃO DE AUTO-REPARO DE GIT ---
function loadAndRepairStats() {
    if (!fs.existsSync(TARGET_FILE)) return [];
    
    let raw = fs.readFileSync(TARGET_FILE, 'utf8');
    
    // Verifica se há marcadores de conflito
    if (raw.includes("<<<<<<<")) {
        console.warn("⚠️ Detectado conflito de Git no arquivo JSON. Iniciando auto-reparo...");
        
        // Estratégia: Manter a versão "Stashed/Incoming" (parte de baixo do conflito)
        // Remove tudo entre <<<<<<< e =======
        raw = raw.replace(/<<<<<<<[\s\S]+?=======/g, "");
        // Remove a linha >>>>>>>
        raw = raw.replace(/>>>>>>>[\s\S]+?(\r\n|\n|$)/g, "");
        
        console.log("🔧 Marcadores removidos. Tentando interpretar JSON limpo...");
    }

    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error("❌ Falha crítica ao ler JSON mesmo após reparo.", e.message);
        // Fallback: Retorna array vazio para não travar o script, mas avisa
        return []; 
    }
}

async function hiveRpc(method, params) {
  for (const node of RPC_NODES) {
    try {
      const response = await fetch(node, {
        method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        headers: { "Content-Type": "application/json" }, timeout: 15000 
      });
      const json = await response.json();
      if (json.result) return json.result;
    } catch (e) {}
  }
  return null;
}

async function run() {
    console.log(`⏳ Iniciando varredura histórica de 2025 para @${ACCOUNT}...`);
    
    // 1. Carrega dados existentes (com reparo automático)
    let existingStats = loadAndRepairStats();
    console.log(`📂 Arquivo carregado: ${existingStats.length} entradas encontradas.`);

    // 2. Coleta dados da Blockchain
    const timeline = {};
    const limitDate = new Date("2025-01-01T00:00:00Z");
    let start = -1;
    let count = 1000; 
    let active = true;
    let totalScanned = 0;

    while (active) {
        const history = await hiveRpc("condenser_api.get_account_history", [ACCOUNT, start, count]);
        
        if (!history || history.length === 0) break;

        for (let i = history.length - 1; i >= 0; i--) {
            const tx = history[i];
            const op = tx[1].op;
            const ts = new Date(tx[1].timestamp + "Z");

            if (ts < limitDate) {
                active = false;
                break;
            }

            const monthKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
            if (!timeline[monthKey]) {
                timeline[monthKey] = { votes: 0, new_delegators: 0 };
            }

            if (op[0] === 'vote' && op[1].voter === ACCOUNT) {
                timeline[monthKey].votes++;
            }

            if (op[0] === 'delegate_vesting_shares' && op[1].delegatee === ACCOUNT) {
                const amount = parseFloat(op[1].vesting_shares);
                if (amount > 0) {
                    timeline[monthKey].new_delegators++;
                }
            }
        }

        totalScanned += history.length;
        if (totalScanned % 5000 === 0) console.log(`... ${totalScanned} txs analisadas`);

        const firstTxId = history[0][0];
        if (firstTxId === 0) break;
        start = firstTxId - 1;
        if (start < count) count = start;
    }

    console.log("\n✅ Varredura concluída!");

    // 3. Mesclar dados novos com os existentes
    Object.keys(timeline).sort().forEach(key => {
        const data = timeline[key];
        const statDate = `${key}-01`; // Ex: 2025-12-01

        console.log(`   📅 ${key}: ${data.votes} Votos | ${data.new_delegators} Novas Delegações`);

        const index = existingStats.findIndex(e => e.date === statDate);
        if (index >= 0) {
            // Atualiza registros existentes
            existingStats[index].monthly_votes = data.votes;
        } else {
            // Cria novos registros
            existingStats.push({
                date: statDate,
                total_power: 0, 
                monthly_votes: data.votes,
                active_members: 0 
            });
        }
    });

    // 4. Salvar arquivo limpo e atualizado
    existingStats.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(TARGET_FILE, JSON.stringify(existingStats, null, 2));
    console.log(`💾 Histórico reparado e salvo em ${TARGET_FILE}`);
}

run();
