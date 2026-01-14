/**
 * Script: Hive BR Data Fetcher
 * Version: 2.25.12 (Strict HAFSQL Restoration)
 * Author: Hive BR
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const SCRIPT_VERSION = "2.25.12";
const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";
const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming?limit=1000`;
const RPC_NODES = ["https://api.deathwing.me", "https://api.hive.blog", "https://api.openhive.network"];
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const CONFIG_PATH = path.join("config", "lists.json");
const DATA_DIR = "data";

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
    console.log("🗳️ Iniciando varredura inteligente de votos...");
    let lastVotesMap = {}; 
    let historyNamed = {}; 
    let votes24h = 0;
    const now = new Date();
    const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const limitDate = new Date(); 
    limitDate.setDate(limitDate.getDate() - 60); 

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

async function run() {
    try {
        console.log(`🚀 Iniciando Hive BR Dashboard (v${SCRIPT_VERSION})...`);
        
        const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
        const totalVests = parseFloat(globals.total_vesting_shares);
        const totalFund = parseFloat(globals.total_vesting_fund_hive);
        const vestToHp = (val) => {
            let vests = (typeof val === 'string') ? parseFloat(val.replace(' VESTS', '')) : parseFloat(val);
            return (vests * totalFund / totalVests);
        };

        const res = await fetch(HAF_API);
        const delegations = await res.json();
        if (!Array.isArray(delegations)) throw new Error("HAF API falhou");

        const listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const currentDelegators = delegations.map(d => d.delegator);
        const allUsers = [...new Set([...currentDelegators, ...(listConfig.verificado_br || [])])];

        const accounts = await hiveRpc("condenser_api.get_accounts", [allUsers]);
        const projectAcc = await hiveRpc("condenser_api.get_accounts", [[VOTER_ACCOUNT]]);
        const heBalances = await fetchHiveEngineBalances(allUsers);
        const voteData = await fetchSmartVoteHistory();

        const ranking = allUsers.map(name => {
            const acc = accounts.find(a => a.name === name) || {};
            const del = delegations.find(d => d.delegator === name);
            const he = heBalances.find(b => b.account === name);
            const totalAccountHp = acc.vesting_shares ? vestToHp(acc.vesting_shares) + vestToHp(acc.received_vesting_shares) : 0;

            return {
                delegator: name,
                delegated_hp: del ? vestToHp(del.vesting_shares) : 0,
                total_account_hp: totalAccountHp,
                token_balance: he ? parseFloat(he.stake || 0) : 0,
                last_user_post: acc.last_post || null,
                next_withdrawal: acc.next_vesting_withdrawal || null,
                timestamp: del ? del.timestamp : null,
                in_curation_trail: (listConfig.curation_trail || []).includes(name),
                last_vote_date: voteData.lastVotesMap[name] || null
            };
        });

        fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(ranking, null, 2));

        const now = new Date();
        const curLabel = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify({
            last_updated: now.toISOString(),
            total_hp: ranking.reduce((acc, curr) => acc + curr.delegated_hp, 0),
            project_account_hp: vestToHp(projectAcc[0].vesting_shares),
            total_delegators: ranking.filter(r => r.delegated_hp > 0).length,
            curation_trail_count: (listConfig.curation_trail || []).length,
            active_brazilians: ranking.filter(u => listConfig.verificado_br.includes(u.delegator) && u.delegated_hp > 0).length,
            votes_24h: voteData.votes24h,
            votes_month_current: voteData.historyNamed[curLabel] || 0
        }, null, 2));

        console.log("✅ Coleta v2.25.12 concluída.");
    } catch (e) {
        console.error("❌ Erro fatal:", e.message);
        process.exit(1);
    }
}
run();
