/**
 * Script: Fetch Delegations + Wealth + Hive-Engine Tokens
 * Version: 1.7.0
 * Update: Integração com Hive-Engine para buscar saldo de HBR
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const ACCOUNT = "hive-br.voter";
const TOKEN_SYMBOL = "HBR"; // Token alvo

const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${ACCOUNT}/incoming?limit=300`;
const HIVE_RPC = "https://api.deathwing.me";
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const DATA_DIR = "data";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Layer 1: Hive RPC
async function hiveRpc(method, params) {
  const response = await fetch(HIVE_RPC, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: 1 }),
    headers: { "Content-Type": "application/json" }
  });
  const json = await response.json();
  return json.result;
}

// Layer 2: Hive-Engine RPC
async function fetchHiveEngineBalances(accounts, symbol) {
  // A Hive-Engine aceita buscar vários usuários de uma vez usando $in
  const query = {
    symbol: symbol,
    account: { "$in": accounts }
  };

  const response = await fetch(HE_RPC, {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "find",
      params: {
        contract: "tokens",
        table: "balances",
        query: query,
        limit: 1000
      },
      id: 1
    }),
    headers: { "Content-Type": "application/json" }
  });

  const json = await response.json();
  return json.result || [];
}

async function run() {
  try {
    console.log(`1. 🔄 Buscando delegações (Layer 1)...`);
    const res = await fetch(HAF_API);
    const delegationsData = await res.json();

    if (!Array.isArray(delegationsData) || delegationsData.length === 0) {
      console.log("⚠️ Nenhum dado retornado da API.");
      return;
    }

    const userNames = delegationsData.map(d => d.delegator);

    console.log(`2. 🌍 Buscando Cotação e Saldos Globais...`);
    const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
    const totalVestFund = parseFloat(globals.total_vesting_fund_hive);
    const totalVestShares = parseFloat(globals.total_vesting_shares);
    const vestToHp = totalVestFund / totalVestShares;

    const accounts = await hiveRpc("condenser_api.get_accounts", [userNames]);
    const wealthMap = {};
    accounts.forEach(acc => {
      const ownVests = parseFloat(acc.vesting_shares);
      wealthMap[acc.name] = ownVests * vestToHp;
    });

    console.log(`3. 🪙 Buscando saldos de ${TOKEN_SYMBOL} na Hive-Engine...`);
    const heBalances = await fetchHiveEngineBalances(userNames, TOKEN_SYMBOL);
    
    // Cria mapa { usuario: saldo }
    const tokenMap = {};
    heBalances.forEach(b => {
      tokenMap[b.account] = parseFloat(b.balance);
    });

    // 4. Fusão de Dados
    const finalData = delegationsData
      .map(item => ({
        delegator: item.delegator,
        delegated_hp: parseFloat(item.hp_equivalent),
        total_account_hp: wealthMap[item.delegator] || 0,
        token_balance: tokenMap[item.delegator] || 0, // Novo Campo HBR
        timestamp: item.timestamp
      }))
      .sort((a, b) => b.delegated_hp - a.delegated_hp);

    fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(finalData, null, 2));
    
    // Metadados
    const metaData = {
      last_updated: new Date().toISOString(),
      total_delegators: finalData.length,
      total_hp: finalData.reduce((acc, curr) => acc + curr.delegated_hp, 0),
      total_hbr_circulating: finalData.reduce((acc, curr) => acc + curr.token_balance, 0)
    };
    fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

    console.log("✅ Dados salvos com Sucesso (HP + HBR)!");

  } catch (err) {
    console.error("❌ Erro fatal:", err.message);
    process.exit(1);
  }
}

run();
