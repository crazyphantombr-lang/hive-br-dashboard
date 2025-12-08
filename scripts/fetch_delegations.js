/**
 * Script: Fetch Delegations (Active Check Update)
 * Version: 1.9.4
 * Update: Histórico 4000 ops + Captura de data do último post
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const ACCOUNT = "hive-br.voter";
const TOKEN_SYMBOL = "HBR";

const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${ACCOUNT}/incoming?limit=300`;
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const RPC_NODES = [
  "https://api.hive.blog",
  "https://api.deathwing.me",
  "https://api.openhive.network"
];

const DATA_DIR = "data";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function hiveRpc(method, params) {
  for (const node of RPC_NODES) {
    try {
      const response = await fetch(node, {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: 1 }),
        headers: { "Content-Type": "application/json" },
        timeout: 8000 
      });
      
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const json = await response.json();
      if (json.error) throw new Error(json.error.message);
      return json.result; 
    } catch (err) {
      console.warn(`⚠️ Node ${node} falhou: ${err.message}.`);
    }
  }
  return null;
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
    console.error("❌ Erro Hive-Engine:", err.message);
    return [];
  }
}

async function fetchVoteHistory(voterAccount) {
  console.log(`🔎 Buscando 4.000 ops de histórico...`);
  
  let fullHistory = [];
  let start = -1; 
  const batchSize = 1000; 
  const maxBatches = 4; // AUMENTADO PARA 4000

  for (let i = 0; i < maxBatches; i++) {
    const batch = await hiveRpc("condenser_api.get_account_history", [voterAccount, start, batchSize]);
    if (!batch || batch.length === 0) break;

    fullHistory = fullHistory.concat(batch);
    const firstItem = batch[0];
    const firstId = firstItem[0];
    start = firstId - 1;
    if (start < 0) break;
    
    console.log(`   Batch ${i+1}: ${batch.length} itens.`);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const voteStats = {}; 

  fullHistory.forEach(tx => {
    const op = tx[1].op;
    const timestamp = tx[1].timestamp;
    
    if (op[0] === 'vote' && op[1].voter === voterAccount) {
      const author = op[1].author;
      if (!voteStats[author]) voteStats[author] = { count_30d: 0, last_vote_ts: null };
      
      // Timestamp mais recente vence
      if (!voteStats[author].last_vote_ts || timestamp > voteStats[author].last_vote_ts) {
        voteStats[author].last_vote_ts = timestamp;
      }

      const voteDate = new Date(timestamp + (timestamp.endsWith("Z") ? "" : "Z"));
      if (voteDate >= thirtyDaysAgo) {
        voteStats[author].count_30d += 1;
      }
    }
  });
  
  return voteStats;
}

async function run() {
  try {
    console.log(`1. 🔄 HAFSQL...`);
    const res = await fetch(HAF_API);
    const delegationsData = await res.json();
    if (!Array.isArray(delegationsData)) return;

    const userNames = delegationsData.map(d => d.delegator);

    console.log(`2. 🌍 Hive RPC (Dados)...`);
    const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
    let vestToHp = 0.0005; 
    if (globals) vestToHp = parseFloat(globals.total_vesting_fund_hive) / parseFloat(globals.total_vesting_shares);

    const accounts = await hiveRpc("condenser_api.get_accounts", [userNames]);
    
    // Mapa enriquecido: HP Total + Data do Último Post
    const accountDetails = {};
    if (accounts) {
        accounts.forEach(acc => {
            accountDetails[acc.name] = {
                hp: parseFloat(acc.vesting_shares) * vestToHp,
                last_post: acc.last_post // NOVO CAMPO
            };
        });
    }

    console.log(`3. 🪙 Hive-Engine...`);
    const heBalances = await fetchHiveEngineBalances(userNames, TOKEN_SYMBOL);
    const tokenMap = {};
    heBalances.forEach(b => { tokenMap[b.account] = parseFloat(b.stake || 0); });

    console.log(`4. 🗳️ Curadoria...`);
    const curationMap = await fetchVoteHistory(ACCOUNT);

    const finalData = delegationsData
      .map(item => {
        const voteInfo = curationMap[item.delegator] || { count_30d: 0, last_vote_ts: null };
        const accInfo = accountDetails[item.delegator] || { hp: 0, last_post: null };

        return {
          delegator: item.delegator,
          delegated_hp: parseFloat(item.hp_equivalent),
          total_account_hp: accInfo.hp,
          last_user_post: accInfo.last_post, // Salva data do último post do usuário
          token_balance: tokenMap[item.delegator] || 0,
          timestamp: item.timestamp,
          last_vote_date: voteInfo.last_vote_ts,
          votes_month: voteInfo.count_30d
        };
      })
      .sort((a, b) => b.delegated_hp - a.delegated_hp);

    fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(finalData, null, 2));
    
    // Metadados
    const metaData = {
      last_updated: new Date().toISOString(),
      total_delegators: finalData.length,
      total_hp: finalData.reduce((acc, curr) => acc + curr.delegated_hp, 0),
      total_hbr_staked: finalData.reduce((acc, curr) => acc + curr.token_balance, 0)
    };
    fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

    console.log("✅ Dados salvos com verificação de inatividade!");

  } catch (err) {
    console.error("❌ Erro fatal:", err.message);
    process.exit(1);
  }
}

run();
