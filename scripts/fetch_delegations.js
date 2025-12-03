/**
 * Script: Fetch Delegations
 * Version: 1.4.0
 * Update: Captura campo 'timestamp' para cálculo de fidelidade
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const ACCOUNT = "hive-br.voter";
const API = `https://rpc.mahdiyari.info/hafsql/delegations/${ACCOUNT}/incoming?limit=300`;
const DATA_DIR = "data";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function run() {
  try {
    console.log(`🔄 Buscando dados (com timestamps) para @${ACCOUNT}...`);
    const res = await fetch(API);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.log("⚠️ Nenhum dado retornado da API.");
      return;
    }

    // Processamento dos dados incluindo DATA DA DELEGAÇÃO
    const delegators = data
      .map(item => ({
        delegator: item.delegator,
        hp: parseFloat(item.hp_equivalent),
        timestamp: item.timestamp // Novo campo capturado
      }))
      .sort((a, b) => b.hp - a.hp);

    fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(delegators, null, 2));
    
    // Metadados
    const metaData = {
      last_updated: new Date().toISOString(),
      total_delegators: delegators.length,
      total_hp: delegators.reduce((acc, curr) => acc + curr.hp, 0)
    };
    fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

    console.log("✅ Dados de fidelidade capturados com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao buscar delegações:", err.message);
    process.exit(1);
  }
}


run();
