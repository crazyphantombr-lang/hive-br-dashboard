/**
 * Script: Seed 2025 History (Time Machine)
 * Version: 1.0.0
 * Description: Scans entire 2025 history to populate monthly_stats.json with Votes & New Delegators.
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const ACCOUNT = "hive-br.voter";
const RPC_NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network"];
const DATA_DIR = "data";
const TARGET_FILE = path.join(DATA_DIR, "monthly_stats.json");

// Garante que o diretório existe
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

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
    
    // Estrutura para armazenar dados mês a mês
    // Chave: "2025-01", "2025-02", etc.
    const timeline = {};

    const limitDate = new Date("2025-01-01T00:00:00Z");
    let start = -1;
    let count = 1000; // Máximo por lote
    let active = true;
    let totalScanned = 0;

    while (active) {
        const history = await hiveRpc("condenser_api.get_account_history", [ACCOUNT, start, count]);
        
        if (!history || history.length === 0) break;

        // Processa de trás para frente (mais recente -> mais antigo)
        for (let i = history.length - 1; i >= 0; i--) {
            const tx = history[i];
            const op = tx[1].op;
            const ts = new Date(tx[1].timestamp + "Z");

            if (ts < limitDate) {
                active = false;
                break;
            }

            // Chave do Mês (Ex: 2025-12)
            const monthKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
            if (!timeline[monthKey]) {
                timeline[monthKey] = { votes: 0, new_delegators: 0, delegator_names: new Set() };
            }

            // 1. Contagem de Votos
            if (op[0] === 'vote' && op[1].voter === ACCOUNT) {
                timeline[monthKey].votes++;
            }

            // 2. Novas Delegações (delegate_vesting_shares)
            // Lógica: Se alguém delegou para nós e a quantidade > 0
            if (op[0] === 'delegate_vesting_shares' && op[1].delegatee === ACCOUNT) {
                const amount = parseFloat(op[1].vesting_shares);
                if (amount > 0) {
                    timeline[monthKey].new_delegators++;
                    timeline[monthKey].delegator_names.add(op[1].delegator);
                }
            }
        }

        totalScanned += history.length;
        if (totalScanned % 5000 === 0) process.stdout.write("."); // Barra de progresso visual

        // Paginação
        const firstTxId = history[0][0];
        if (firstTxId === 0) break;
        start = firstTxId - 1;
        if (start < count) count = start;
    }

    console.log("\n✅ Varredura concluída!");
    console.log("📊 Resultados encontrados:");

    // Carregar arquivo existente para não perder dados atuais
    let existingStats = [];
    if (fs.existsSync(TARGET_FILE)) {
        existingStats = JSON.parse(fs.readFileSync(TARGET_FILE));
    }

    // Mesclar dados
    Object.keys(timeline).sort().forEach(key => {
        const data = timeline[key];
        const statDate = `${key}-01`; // Formato YYYY-MM-01

        console.log(`   📅 ${key}: ${data.votes} Votos | ${data.new_delegators} Movimentações de Delegação`);

        const index = existingStats.findIndex(e => e.date === statDate);
        if (index >= 0) {
            // Atualiza apenas os campos que recalculamos
            existingStats[index].monthly_votes = data.votes;
            // Nota: Não sobrescrevemos Total HP pois não temos como calcular retroativo fácil
        } else {
            // Cria nova entrada (HP ficará 0 pois não sabemos, mas Votos estarão lá)
            existingStats.push({
                date: statDate,
                total_power: 0, // Desconhecido
                monthly_votes: data.votes,
                active_members: 0 // Desconhecido
            });
        }
    });

    // Ordenar e Salvar
    existingStats.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(TARGET_FILE, JSON.stringify(existingStats, null, 2));
    
    console.log(`💾 Arquivo ${TARGET_FILE} atualizado com sucesso.`);
}

run();
