/**
 * Script: Fetch Delegations & Global Sync
 * Version: 2.25.14 (Stable HAFSQL Restoration)
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const SCRIPT_VERSION = "2.25.14";
const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";
const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming?limit=1000`;
const RPC_NODES = ["https://api.deathwing.me", "https://api.hive.blog", "https://api.openhive.network"];
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const CONFIG_PATH = path.join("config", "lists.json");
const DATA_DIR = "data";
const GLOBAL_HISTORY_FILE = path.join(DATA_DIR, "global_history.json");

// Carrega listas
let listConfig = { verificado_br: [], curation_trail: [], watchlist: [] };
try { if (fs.existsSync(CONFIG_PATH)) listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH)); } catch (e) {}

async function hiveRpc(method, params) {
  for (const node of RPC_NODES) {
    try {
      const response = await fetch(node, {
        method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        headers: { "Content-Type": "application/json" }, timeout: 10000 
      });
      const json = await response.json();
      if (json.result) return json.result;
    } catch (e) {}
  }
  return null;
}

async function fetchHiveEngineBalances(accounts) {
  try {
    const response = await fetch(HE_RPC, {
      method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "find", params: { contract: "tokens", table: "balances", query: { symbol: TOKEN_SYMBOL, account: { "$in": accounts } } }, id: 1 }),
      headers: { "Content-Type": "application/json" }
    });
    const json = await response.json();
    return json.result || [];
  } catch (e) { return []; }
}

async function fetchSmartVoteHistory() {
    let lastVotesMap = {}; 
    let historyNamed = {}; 
    let votes24h = 0;
    const now = new Date();
    const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, -1, 1000]);
    if (history) {
        history.reverse().forEach(tx => {
            const op = tx[1].op;
            const ts = new Date(tx[1].timestamp + "Z");
            if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
                const votedUser = op[1].author;
                if (!lastVotesMap[votedUser]) lastVotesMap[votedUser] = tx[1].timestamp + "Z";
                if (ts >= time24h) votes24h++;
                const month = ts.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                historyNamed[month] = (historyNamed[month] || 0) + 1;
            }
        });
    }
    return { lastVotesMap, historyNamed, votes24h };
}

function updateGlobalHistory(data) {
    let globalData = {};
    if (fs.existsSync(GLOBAL_HISTORY_FILE)) {
        try { globalData = JSON.parse(fs.readFileSync(GLOBAL_HISTORY_FILE)); } catch (e) {}
    }

    // VACINA GLOBAL: Deletar 14/01 envenenado
    delete globalData["2026-01-14"];

    const todayKey = new Date().toISOString().split('T')[0];
    if (data.total_hp > 1000 && todayKey !== "2026-01-14") {
        globalData[todayKey] = {
            total_votes: data.votes_24h,
            trail_count: data.curation_trail_count,
            active_brazilians: data.active_brazilians,
            total_hp: parseFloat((data.total_hp + data.project_account_hp).toFixed(2)),
            total_delegated_hp: parseFloat(data.total_hp.toFixed(2)),
            active_members: data.active_community_members,
            script_version: SCRIPT_VERSION
        };
    }
    fs.writeFileSync(GLOBAL_HISTORY_FILE, JSON.stringify(globalData, null, 2));
}

async function run() {
    try {
        const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
        const hp_ratio = parseFloat(globals.total_vesting_fund_hive) / parseFloat(globals.total_vesting_shares);

        const res = await fetch(HAF_API);
        const incoming = await res.json();
        const delegators = Array.isArray(incoming) ? incoming : [];

        const allUsers = [...new Set([...delegators.map(d => d.delegator), ...(listConfig.verificado_br || []), ...(listConfig.watchlist || [])])];
        const accounts = await hiveRpc("condenser_api.get_accounts", [allUsers]);
        const [voterAcc] = await hiveRpc("condenser_api.get_accounts", [[VOTER_ACCOUNT]]);
        const heBalances = await fetchHiveEngineBalances(allUsers);
        const voteData = await fetchSmartVoteHistory();

        const ranking = allUsers.map(name => {
            const acc = accounts.find(a => a.name === name) || {};
            const del = delegators.find(d => d.delegator === name);
            const he = heBalances.find(b => b.account === name);
            const ownHp = acc.vesting_shares ? (parseFloat(acc.vesting_shares) * hp_ratio) + (parseFloat(acc.received_vesting_shares) * hp_ratio) : 0;

            return {
                delegator: name,
                delegated_hp: del ? parseFloat(del.vesting_shares) * hp_ratio : 0,
                total_account_hp: ownHp,
                token_balance: he ? parseFloat(he.stake || 0) : 0,
                last_user_post: acc.last_post || null,
                next_withdrawal: acc.next_vesting_withdrawal || null,
                timestamp: del ? del.timestamp : null,
                in_curation_trail: listConfig.curation_trail.includes(name),
                last_vote_date: voteData.lastVotesMap[name] || null
            };
        });

        fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(ranking, null, 2));

        const now = new Date();
        const metaData = {
            last_updated: now.toISOString(),
            total_hp: ranking.reduce((acc, curr) => acc + curr.delegated_hp, 0),
            project_account_hp: parseFloat(voterAcc.vesting_shares) * hp_ratio,
            total_delegators: ranking.filter(r => r.delegated_hp > 0).length,
            curation_trail_count: listConfig.curation_trail.length,
            active_brazilians: ranking.filter(u => listConfig.verificado_br.includes(u.delegator) && u.delegated_hp > 0).length,
            active_community_members: allUsers.length,
            votes_24h: voteData.votes24h,
            votes_month_current: voteData.historyNamed[now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })] || 0
        };

        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));
        updateGlobalHistory(metaData);
        console.log("✅ Coleta v2.25.14 concluída com HAFSQL.");
    } catch (e) {
        console.error("❌ Erro fatal:", e.message);
        process.exit(1);
    }
}
run();
