/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.20.0
 * Update: Adds 'Active Community Member' counting logic.
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// --- CONFIGURAÇÕES ---
const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";
const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming?limit=300`;
const RPC_NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network"];
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const CONFIG_PATH = path.join("config", "lists.json");
const DATA_DIR = "data";

// Carrega listas
let listConfig = { verificado_br: [], curation_trail: [] };
try { if (fs.existsSync(CONFIG_PATH)) listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH)); } catch (e) {}
const CURATION_TRAIL_USERS = listConfig.curation_trail || [];
const FIXED_USERS = listConfig.watchlist || [];

// Garante pasta de dados
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- FUNÇÕES AUXILIARES ---
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

async function fetchVoteHistory() {
  // Simplificado para pegar apenas estatísticas de votos recentes
  const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, -1, 1000]);
  let votes_month = 0;
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (history) {
    history.forEach(tx => {
      const op = tx[1].op;
      const ts = new Date(tx[1].timestamp + "Z");
      if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT && ts >= firstDayOfMonth) {
        votes_month++;
      }
    });
  }
  return votes_month;
}

function updateMonthlyStats(metaData) {
    const historyFile = path.join(DATA_DIR, "monthly_stats.json");
    let history = [];
    try { if (fs.existsSync(historyFile)) history = JSON.parse(fs.readFileSync(historyFile)); } catch (e) {}

    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

    const currentStats = {
        date: monthKey,
        total_power: (metaData.total_hp + metaData.project_account_hp),
        own_hp: metaData.project_account_hp,
        delegators_count: metaData.total_delegators,
        monthly_votes: metaData.votes_month_current,
        trail_count: metaData.curation_trail_count,
        hbr_staked_total: metaData.total_hbr_staked,
        active_members: metaData.active_community_members // Nova métrica histórica
    };

    const index = history.findIndex(h => h.date === monthKey);
    if (index >= 0) history[index] = currentStats;
    else history.push(currentStats);

    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// --- MAIN ---
async function run() {
    try {
        console.log("🔄 Coletando dados...");
        
        // 1. Delegações
        const res = await fetch(HAF_API);
        let delegations = await res.json();
        if (!Array.isArray(delegations)) delegations = [];

        // Adiciona watchlist se não estiverem delegando
        const currentDelegators = new Set(delegations.map(d => d.delegator));
        FIXED_USERS.forEach(u => {
            if (!currentDelegators.has(u)) delegations.push({ delegator: u, hp_equivalent: 0 });
        });

        // 2. Dados globais e Contas
        const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
        const vestToHp = parseFloat(globals.total_vesting_fund_hive) / parseFloat(globals.total_vesting_shares);
        
        const accounts = await hiveRpc("condenser_api.get_accounts", [[...currentDelegators, PROJECT_ACCOUNT]]);
        let projectHp = 0;
        accounts.forEach(acc => {
            if (acc.name === PROJECT_ACCOUNT) projectHp = parseFloat(acc.vesting_shares) * vestToHp;
        });

        // 3. Tokens
        const heBalances = await fetchHiveEngineBalances([...currentDelegators]);
        const tokenSum = heBalances.reduce((acc, curr) => acc + parseFloat(curr.stake || 0), 0);

        // 4. Votos
        const votesMonth = await fetchVoteHistory();

        // 5. Métrica de Membros Únicos (Nova)
        // Une Delegadores + Quem segue a trilha
        const uniqueMembers = new Set([
            ...delegations.map(d => d.delegator),
            ...CURATION_TRAIL_USERS
        ]);

        const metaData = {
            last_updated: new Date().toISOString(),
            total_delegators: delegations.filter(d => d.hp_equivalent > 0).length,
            total_hp: delegations.reduce((acc, curr) => acc + parseFloat(curr.hp_equivalent || 0), 0),
            project_account_hp: projectHp,
            total_hbr_staked: tokenSum,
            votes_month_current: votesMonth,
            curation_trail_count: CURATION_TRAIL_USERS.length,
            active_community_members: uniqueMembers.size // Total de brasileiros envolvidos
        };

        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));
        updateMonthlyStats(metaData);
        
        console.log("✅ Dados atualizados (v2.20.0)");

    } catch (err) {
        console.error("❌ Erro:", err.message);
        process.exit(1);
    }
}

run();
