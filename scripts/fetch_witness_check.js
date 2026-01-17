// File: scripts/fetch_witness_check.js
/**
 * Script: Witness Vote Checker
 * Version: 1.0.0 (Principal)
 * Author: Hive BR
 * License: MIT
 * Description: Verifica se membros da comunidade votam nas Witness Brasileiras listadas.
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// --- CONFIGURAÇÕES ---
const TARGET_WITNESSES = ["igormuba", "nexo.witness", "mengao", "fernandosoder", "perfilbrasil"];
const RPC_NODES = ["https://api.deathwing.me", "https://api.hive.blog", "https://api.openhive.network"];

const CONFIG_PATH = path.join("config", "lists.json");
const DATA_DIR = "data";
const OUTPUT_FILE = path.join(DATA_DIR, "witness_votes.json");
const HISTORY_FILE = path.join(DATA_DIR, "witness_history.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- FUNÇÕES ---
async function hiveRpc(method, params) {
  for (const node of RPC_NODES) {
    try {
      const response = await fetch(node, {
        method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        headers: { "Content-Type": "application/json" }, timeout: 10000 
      });
      const json = await response.json();
      if (json.result) return json.result;
    } catch (e) {
        console.warn(`Node error ${node}: ${e.message}`);
    }
  }
  return null;
}

function loadUsers() {
    let users = new Set();
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH));
            // Adiciona todos os usuários conhecidos
            (listConfig.verificado_br || []).forEach(u => users.add(u));
            (listConfig.verificado_pt || []).forEach(u => users.add(u));
            (listConfig.watchlist || []).forEach(u => users.add(u));
            (listConfig.curation_trail || []).forEach(u => users.add(u));
        }
    } catch (e) {
        console.warn("⚠️ lists.json não encontrado ou inválido.");
    }
    return [...users];
}

async function run() {
    console.log("🕵️ Iniciando verificação de Witness Votes...");
    const users = loadUsers();
    
    if (users.length === 0) {
        console.log("Nenhum usuário para verificar.");
        return;
    }

    console.log(`Analisando ${users.length} usuários para ${TARGET_WITNESSES.length} witnesses alvo.`);

    let results = {};

    // Batch Process (Hive RPC suporta múltiplos usuários no get_accounts)
    // Processar em lotes de 50 para não sobrecarregar
    for (let i = 0; i < users.length; i += 50) {
        const batch = users.slice(i, i + 50);
        const accounts = await hiveRpc("condenser_api.get_accounts", [batch]);
        
        if (accounts) {
            accounts.forEach(acc => {
                let userVotes = {};
                // acc.witness_votes é um array de strings com os nomes das witnesses votadas
                TARGET_WITNESSES.forEach(target => {
                    userVotes[target] = acc.witness_votes.includes(target);
                });
                results[acc.name] = userVotes;
            });
        }
        process.stdout.write(`.`); // Progresso visual
    }
    console.log("\nProcessamento concluído.");

    // Salva estado atual
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
        last_updated: new Date().toISOString(),
        targets: TARGET_WITNESSES,
        data: results
    }, null, 2));

    // Salva histórico diário (Append-only logic)
    let history = {};
    try { if (fs.existsSync(HISTORY_FILE)) history = JSON.parse(fs.readFileSync(HISTORY_FILE)); } catch (e) {}
    
    const today = new Date().toISOString().split('T')[0];
    
    // Simplificando o histórico para economizar espaço:
    // Salva apenas um sumário ou os dados brutos?
    // Vamos salvar os dados brutos por enquanto conforme sua preferência por dados.
    history[today] = results;

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

    console.log(`✅ Dados salvos em ${OUTPUT_FILE}`);
    console.log(`✅ Histórico atualizado em ${HISTORY_FILE}`);
}

run();
