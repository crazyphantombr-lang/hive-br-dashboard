/**
 * Script: Fetch Delegations (Refined Lists)
 * Version: 2.14.0
 * Update: Estrutura Verificado/Pendente
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";

const CONFIG_PATH = path.join("config", "lists.json");
const DATA_DIR = "data";

let listConfig = { verificado_br: [], pendente_br: [], verificado_pt: [], pendente_pt: [], watchlist: [], curation_trail: [] };
try {
  if (fs.existsSync(CONFIG_PATH)) {
    listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH));
  }
} catch (err) { console.error(err); }

// Novas Constantes de Lista
const VERIFICADO_BR = listConfig.verificado_br || [];
const PENDENTE_BR = listConfig.pendente_br || [];
const VERIFICADO_PT = listConfig.verificado_pt || [];
const PENDENTE_PT = listConfig.pendente_pt || [];
const FIXED_USERS = listConfig.watchlist || [];
const CURATION_TRAIL_USERS = listConfig.curation_trail || [];

const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming?limit=300`;
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";
const RPC_NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network"];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function hiveRpc(method, params) {
  for (const node of RPC_NODES) {
    try {
      const response = await fetch(node, {
        method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: 1 }),
        headers: { "Content-Type": "application/json" }, timeout: 15000 
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const json = await response.json();
      if (json.error) throw new Error(json.error.message);
      return json.result; 
    } catch (err) { console.warn(`⚠️ Node ${node} falhou: ${err.message}.`); }
  }
  return null;
}

async function fetchHiveEngineBalances(accounts, symbol) {
  try {
    const query = { symbol: symbol, account: { "$in": accounts } };
    const response = await fetch(HE_RPC, {
      method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "find", params: { contract: "tokens", table: "balances", query: query, limit: 1000 }, id: 1 }),
      headers: { "Content-Type": "application/json" }
    });
    const json = await response.json();
    return json.result || [];
  } catch (err) { return []; }
}

function detectNationality(username, jsonMetadata) {
    // 1. Verificados (Colorido)
    if (VERIFICADO_BR.includes(username)) return "BR_CERT";
    if (VERIFICADO_PT.includes(username)) return "PT_CERT";

    // 2. Pendentes Manuais (Cinza)
    if (PENDENTE_BR.includes(username)) return "BR";
    if (PENDENTE_PT.includes(username)) return "PT";

    // 3. Detecção Automática (Cinza)
    let location = "";
    if (jsonMetadata) { 
        try { 
            const meta = JSON.parse(jsonMetadata);
            if (meta && meta.profile && meta.profile.location) {
                location = meta.profile.location.toLowerCase(); 
            }
        } catch (e) {} 
    }
    if (!location) return null;

    if (location.includes("portugal") || location.includes("lisboa") || location.includes("lisbon") || 
        location.includes("porto") || location.includes("coimbra") || location.includes("braga") || 
        location.includes("algarve") || location.includes("madeira") || location.includes("açores")) {
        return "PT";
    }

    const brTerms = ["brasil", "brazil", "são paulo", "rio de janeiro", "minas gerais", "paraná", "sul", "bahia", "curitiba", "floripa", "brasilia", "salvador", "recife", "fortaleza", "manaus", "goiania"];
    for (const term of brTerms) { if (location.includes(term)) return "BR"; }

    const stateSiglas = ["sp", "rj", "mg", "pr", "sc", "rs", "ba", "pe", "ce", "df", "go", "es"];
    for (const sigla of stateSiglas) { 
        if (new RegExp(`\\b${sigla}\\b`, 'i').test(location)) return "BR"; 
    }
    
    return null;
}

async function fetchVoteHistory(voterAccount) {
  let fullHistory = [];
  let start = -1; 
  const batchSize = 1000; 
  const maxBatches = 20; 

  for (let i = 0; i < maxBatches; i++) {
    const batch = await hiveRpc("condenser_api.get_account_history", [voterAccount, start, batchSize]);
    if (!batch || batch.length === 0) break;
    fullHistory = fullHistory.concat(batch);
    const firstItem = batch[0];
    const firstId = firstItem[0];
    start = firstId - 1;
    if (start < 0) break;
  }

  const now = new Date();
  const oneDayAgo = new Date(); oneDayAgo.setDate(now.getDate() - 1);
  const month0_Start = new Date(now.getFullYear(), now.getMonth(), 1);
  const month1_Start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month2_Start = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  const voteStats = {};
  let votes_24h = 0, votes_month0 = 0, votes_month1 = 0, votes_month2 = 0;
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(now.getDate() - 30);

  fullHistory.forEach(tx => {
    const op = tx[1].op;
    const timestamp = tx[1].timestamp;
    
    if (op[0] === 'vote' && op[1].voter === voterAccount) {
      const voteDate = new Date(timestamp + (timestamp.endsWith("Z") ? "" : "Z"));
      if (voteDate >= oneDayAgo) votes_24h++;
      if (voteDate >= month0_Start) votes_month0++;
      else if (voteDate >= month1_Start) votes_month1++;
      else if (voteDate >= month2_Start) votes_month2++;

      const author = op[1].author;
      if (!voteStats[author]) { voteStats[author] = { count_30d: 0, last_vote_ts: null, unique_days: new Set() }; }
      if (!voteStats[author].last_vote_ts || timestamp > voteStats[author].last_vote_ts) { voteStats[author].last_vote_ts = timestamp; }
      
      if (voteDate >= thirtyDaysAgo) {
          const dayKey = voteDate.toISOString().slice(0, 10);
          if (!voteStats[author].unique_days.has(dayKey)) {
              voteStats[author].unique_days.add(dayKey);
              voteStats[author].count_30d += 1;
          }
      }
    }
  });
  
  return { stats: voteStats, votes_24h, votes_month0, votes_month1, votes_month2 };
}

async function run() {
  try {
    console.log(`1. 🔄 HAFSQL + Watchlist...`);
    const res = await fetch(HAF_API);
    let delegationsData = await res.json();
    if (!Array.isArray(delegationsData)) delegationsData = [];

    const currentDelegators = new Set(delegationsData.map(d => d.delegator));
    FIXED_USERS.forEach(fixedUser => {
      if (!currentDelegators.has(fixedUser)) delegationsData.push({ delegator: fixedUser, hp_equivalent: 0, timestamp: null });
    });

    const userNames = delegationsData.map(d => d.delegator);

    console.log(`2. 🌍 Hive RPC...`);
    const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
    let vestToHp = 0.0005; 
    if (globals) vestToHp = parseFloat(globals.total_vesting_fund_hive) / parseFloat(globals.total_vesting_shares);

    const accounts = await hiveRpc("condenser_api.get_accounts", [[...userNames, PROJECT_ACCOUNT]]);
    const accountDetails = {};
    let projectHp = 0;

    if (accounts) {
        accounts.forEach(acc => {
            const hp = parseFloat(acc.vesting_shares) * vestToHp;
            const isPowerDown = parseFloat(acc.to_withdraw) > parseFloat(acc.withdrawn);
            const country = detectNationality(acc.name, acc.posting_json_metadata);
            if (acc.name === PROJECT_ACCOUNT) projectHp = hp;
            accountDetails[acc.name] = { hp, last_post: acc.last_post, next_withdrawal: isPowerDown ? acc.next_vesting_withdrawal : null, country_code: country };
        });
    }

    console.log(`3. 🪙 Hive-Engine...`);
    const heBalances = await fetchHiveEngineBalances(userNames, TOKEN_SYMBOL);
    const tokenMap = {};
    heBalances.forEach(b => { tokenMap[b.account] = parseFloat(b.stake || 0); });

    console.log(`4. 🗳️ Curadoria...`);
    const voteData = await fetchVoteHistory(VOTER_ACCOUNT);
    const curationMap = voteData.stats;

    const finalData = delegationsData.map(item => {
        const voteInfo = curationMap[item.delegator] || { count_30d: 0, last_vote_ts: null };
        const accInfo = accountDetails[item.delegator] || { hp: 0, last_post: null, next_withdrawal: null, country_code: null };
        return {
          delegator: item.delegator,
          delegated_hp: parseFloat(item.hp_equivalent),
          total_account_hp: accInfo.hp,
          last_user_post: accInfo.last_post,
          next_withdrawal: accInfo.next_withdrawal,
          country_code: accInfo.country_code,
          token_balance: tokenMap[item.delegator] || 0,
          timestamp: item.timestamp,
          last_vote_date: voteInfo.last_vote_ts,
          votes_month: voteInfo.count_30d,
          in_curation_trail: CURATION_TRAIL_USERS.includes(item.delegator)
        };
      }).sort((a, b) => b.delegated_hp - a.delegated_hp);

    fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(finalData, null, 2));
    
    const metaData = {
      last_updated: new Date().toISOString(),
      total_delegators: finalData.filter(d => d.delegated_hp > 0).length,
      total_hp: finalData.reduce((acc, curr) => acc + curr.delegated_hp, 0),
      total_hbr_staked: finalData.reduce((acc, curr) => acc + curr.token_balance, 0),
      project_account_hp: projectHp,
      votes_24h: voteData.votes_24h,
      votes_month_current: voteData.votes_month0,
      votes_month_prev1: voteData.votes_month1,
      votes_month_prev2: voteData.votes_month2
    };
    fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));
    console.log("✅ Dados salvos (Versão 2.14.0)!");
  } catch (err) {
    console.error("❌ Erro fatal:", err.message);
    process.exit(1);
  }
}

run();
