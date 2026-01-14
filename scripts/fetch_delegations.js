/**
 * Script: Hive BR Data Fetcher
 * Version: 2.25.10 (HAFSQL API Only)
 * Author: Hive BR
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const SCRIPT_VERSION = "2.25.10";
const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";
const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming?limit=1000`;
const RPC_NODES = ["https://api.deathwing.me", "https://api.hive.blog"];
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const DATA_DIR = "data";
const CONFIG_PATH = path.join("config", "lists.json");

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
    const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, -1, 1000]);
    if (history) {
        history.reverse().forEach(tx => {
            const op = tx[1].op;
            if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
                if (!lastVotesMap[op[1].author]) lastVotesMap[op[1].author] = tx[1].timestamp + "Z";
            }
        });
    }
    return lastVotesMap;
}

async function run() {
    try {
        console.log(`🚀 Iniciando Coleta v${SCRIPT_VERSION} via HAFSQL...`);
        
        const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
        const hp_ratio = parseFloat(globals.total_vesting_fund_hive) / parseFloat(globals.total_vesting_shares);

        const res = await fetch(HAF_API);
        const incoming = await res.json();
        const delegators = Array.isArray(incoming) ? incoming : [];

        const listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const allUsers = [...new Set([...delegators.map(d => d.delegator), ...(listConfig.verificado_br || [])])];

        const accounts = await hiveRpc("condenser_api.get_accounts", [allUsers]);
        const heBalances = await fetchHiveEngineBalances(allUsers);
        const voteMap = await fetchSmartVoteHistory();

        const ranking = allUsers.map(name => {
            const acc = accounts.find(a => a.name === name) || {};
            const del = delegators.find(d => d.delegator === name);
            const he = heBalances.find(b => b.account === name);

            return {
                delegator: name,
                delegated_hp: del ? (parseFloat(d.vesting_shares || 0) * hp_ratio) : 0,
                total_account_hp: acc.vesting_shares ? (parseFloat(acc.vesting_shares) * hp_ratio) : 0,
                token_balance: he ? parseFloat(he.stake || 0) : 0,
                last_user_post: acc.last_post || null,
                next_withdrawal: acc.next_vesting_withdrawal || null,
                timestamp: del ? del.timestamp : null,
                in_curation_trail: (listConfig.curation_trail || []).includes(name),
                last_vote_date: voteMap[name] || null
            };
        });

        fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(ranking, null, 2));

        const [voterAcc] = await hiveRpc("condenser_api.get_accounts", [[VOTER_ACCOUNT]]);
        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify({
            last_updated: new Date().toISOString(),
            total_hp: ranking.reduce((acc, curr) => acc + curr.delegated_hp, 0),
            project_account_hp: parseFloat(voterAcc.vesting_shares) * hp_ratio,
            total_delegators: ranking.filter(r => r.delegated_hp > 0).length,
            curation_trail_count: (listConfig.curation_trail || []).length
        }, null, 2));

        console.log("✅ Dados capturados com sucesso.");
    } catch (e) {
        console.error("❌ Erro:", e.message);
        process.exit(1);
    }
}
run();
