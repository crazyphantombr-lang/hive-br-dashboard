/**
 * Script: Fetch Delegations (Stability Fix)
 * Version: 1.9.1
 * Update: Troca de RPC Node para OpenHive e aumento de limite de histórico (5000)
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const ACCOUNT = "hive-br.voter";
const TOKEN_SYMBOL = "HBR";

const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${ACCOUNT}/incoming?limit=300`;
// MUDANÇA: Node mais estável para chamadas de histórico pesado
const HIVE_RPC = "https://api.openhive.network"; 
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const DATA_DIR = "data";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function hiveRpc(method, params) {
  try {
    const response = await fetch(HIVE_RPC, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: 1 }),
      headers: { "Content-Type": "application/json" }
    });
    const json = await response.json();
    return json.result;
  } catch (err) {
    console.error(`❌ Erro no RPC (${method}):`, err.message);
    return null;
  }
}

async function fetchHiveEngineBalances(accounts, symbol) {
  try {
    const query = { symbol: symbol, account: { "$in": accounts } };
    const response = await fetch(HE_RPC, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0", method: "find",
        params: { contract: "tokens", table: "balances", query: query, limit: 1000 },
        id: 1
      }),
      headers: { "Content-Type": "application/json" }
    });
    const json = await response.json();
    return json.result || [];
  } catch (err) {
    console.error("❌ Erro na Hive-Engine:", err.message);
    return [];
  }
}

async function fetchVoteHistory(voterAccount) {
  console.log(`🔎 Analisando histórico de @${voterAccount} (via OpenHive)...`);
  
  // Aumentado para 5000 operações para pegar mais dias de histórico
  const history = await hiveRpc("condenser_api.get_account_history", [voterAccount, -1, 5000]);
  
  if (!history || !Array.isArray(history)) {
    console.warn("⚠️ Histórico vazio ou falha na API. Dados de curadoria ficarão vazios.");
    return {};
  }

  console.log(`✅ Histórico recebido: ${history.length} operações.`);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const voteStats = {}; 

  history.forEach(tx => {
    const op = tx[1].op;
    const timestamp = tx[1].timestamp;
    
    if (op[0] === 'vote' && op[1].voter === voterAccount) {
      const author = op[1].author;
      const voteDate = new Date(timestamp + "Z");

      if (!voteStats[author]) {
        voteStats[author] = { count_30d: 0, last_vote_ts: null };
      }

      // O histórico vem do antigo para o novo, então sempre sobrescrevemos com o mais recente
      voteStats[author].last_vote_ts = timestamp;

      if (voteDate >= thirtyDaysAgo) {
        voteStats[author].count_30d += 1;
      }
    }
  });
  
  console.log(`📊 Curadoria detectada para ${Object.keys(voteStats).length} usuários únicos.`);
  return voteStats;
}

async function run() {
  try {
    console.log(`1. 🔄 Buscando delegações...`);
    const res = await fetch(HAF_API);
    const delegationsData = await res.json();

    if (!Array.isArray(delegationsData)) return;

    const userNames = delegationsData.map(d => d.delegator);

    console.log(`2. 🌍 Buscando Dados Globais...`);
    const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
    const vestToHp = parseFloat(globals.total_vesting_fund_hive) / parseFloat(globals.total_vesting_shares);

    const accounts = await hiveRpc("condenser_api.get_accounts", [userNames]);
    const wealthMap = {};
    if (accounts) {
        accounts.forEach(acc => {
        wealthMap[acc.name] = parseFloat(acc.vesting_shares) * vestToHp;
        });
    }

    console.log(`3. 🪙 Buscando Tokens HBR...`);
    const heBalances = await fetchHiveEngineBalances(userNames, TOKEN_SYMBOL);
    const tokenMap = {};
    heBalances.forEach(b => { 
        // Pega STAKE
        tokenMap[b.account] = parseFloat(b.stake || 0); 
    });

    console.log(`4. 🗳️ Processando Votos...`);
    const curationMap = await fetchVoteHistory(ACCOUNT);

    const finalData = delegationsData
      .map(item => {
        const voteInfo = curationMap[item.delegator] || { count_30d: 0, last_vote_ts: null };
        return {
          delegator: item.delegator,
          delegated_hp: parseFloat(item.hp_equivalent),
          total_account_hp: wealthMap[item.delegator] || 0,
          token_balance: tokenMap[item.delegator] || 0,
          timestamp: item.timestamp,
          last_vote_date: voteInfo.last_vote_ts,
          votes_month: voteInfo.count_30d
        };
      })
      .sort((a, b) => b.delegated_hp - a.delegated_hp);

    fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(finalData, null, 2));
    
    const metaData = {
      last_updated: new Date().toISOString(),
      total_delegators: finalData.length,
      total_hp: finalData.reduce((acc, curr) => acc + curr.delegated_hp, 0),
      total_hbr_staked: finalData.reduce((acc, curr) => acc + curr.token_balance, 0)
    };
    fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

    console.log("✅ Dados salvos com sucesso!");

  } catch (err) {
    console.error("❌ Erro fatal:", err.message);
    process.exit(1);
  }
}

run();
