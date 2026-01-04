/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.21.0 (Feature: Named History)
 * Update: Saves vote history with explicit Month/Year names (e.g., "Dezembro 2025").
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

function getMonthLabel(dateObj) {
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

// --- BUSCA PROFUNDA DE VOTOS COM NOMES ---
async function fetchVoteHistory() {
  const now = new Date();
  
  // Estrutura para nomes explícitos
  let historyMap = {}; 
  let votes24h = 0;
  
  // Janela de 24h
  const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  
  // Janela de 90 dias para garantir cobertura
  const limitDate = new Date(now);
  limitDate.setDate(limitDate.getDate() - 90);

  let limit = 50000; 
  let start = -1; 
  let count = 1000;

  console.log(`🔍 Iniciando varredura nominal (90 dias)...`);

  while (limit > 0) {
    const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, start, count]);
    
    if (!history || history.length === 0) break;

    let stopScan = false;

    for (let i = history.length - 1; i >= 0; i--) {
      const tx = history[i];
      const op = tx[1].op;
      const ts = new Date(tx[1].timestamp + "Z");

      if (ts < limitDate) {
        stopScan = true;
        break;
      }

      if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
          // Contagem 24h
          if (ts >= time24h) votes24h++;

          // Contagem Nominal (Ex: "Dezembro 2025")
          const label = getMonthLabel(ts);
          if (!historyMap[label]) historyMap[label] = 0;
          historyMap[label]++;
      }
    }

    if (stopScan) break;

    const firstTxId = history[0][0]; 
    if (firstTxId === 0) break;
    
    start = firstTxId - 1;
    if (start < count) count = start; 
    limit -= 1000;
    
    await new Promise(r => setTimeout(r, 150));
  }

  return { votes24h, historyMap };
}

function updateMonthlyStats(metaData) {
    const historyFile = path.join(DATA_DIR, "monthly_stats.json");
    let history = [];
    try { if (fs.existsSync(historyFile)) history = JSON.parse(fs.readFileSync(historyFile)); } catch (e) {}

    const today = new Date();
    const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    
    const currentStats = {
        date: currentKey,
        total_power: (metaData.total_hp + metaData.project_account_hp),
        own_hp: metaData.project_account_hp,
        delegators_count: metaData.total_delegators,
        monthly_votes: metaData.votes_month_current, // Usa o dado calculado nominalmente
        trail_count: metaData.curation_trail_count,
        hbr_staked_total: metaData.total_hbr_staked,
        active_members: metaData.active_community_members 
    };

    const index = history.findIndex(h => h.date === currentKey);
    if (index >= 0) history[index] = currentStats;
    else history.push(currentStats);

    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// --- MAIN ---
async function run() {
    try {
        console.log("🔄 Coletando dados (v2.21.0 - Named History)...");
        
        // 1. Delegações
        const res = await fetch(HAF_API);
        let delegations = await res.json();
        if (!Array.isArray(delegations)) delegations = [];

        const currentDelegators = new Set(delegations.map(d => d.delegator));
        FIXED_USERS.forEach(u => {
            if (!currentDelegators.has(u)) delegations.push({ delegator: u, hp_equivalent: 0 });
        });

        // 2. Globais
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

        // 4. Votos Nominais
        const { votes24h, historyMap } = await fetchVoteHistory();
        console.log("📊 Histórico Nominal Identificado:", historyMap);

        // Mapeamento para garantir retrocompatibilidade com Frontend
        // Identifica Mês Atual, M-1 e M-2 dinamicamente
        const now = new Date();
        const curLabel = getMonthLabel(now);
        
        const d1 = new Date(); d1.setMonth(d1.getMonth() - 1);
        const prev1Label = getMonthLabel(d1);

        const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);
        const prev2Label = getMonthLabel(d2);

        // 5. Membros
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
            curation_trail_count: CURATION_TRAIL_USERS.length,
            active_community_members: uniqueMembers.size,
            
            // --- DADOS DE VOTOS ---
            votes_24h: votes24h,
            
            // Novo Campo Explícito
            vote_history_named: historyMap,

            // Campos Legados (Mantidos para o Frontend não quebrar)
            votes_month_current: historyMap[curLabel] || 0,
            votes_month_prev1: historyMap[prev1Label] || 0,
            votes_month_prev2: historyMap[prev2Label] || 0
        };

        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));
        updateMonthlyStats(metaData);
        
        console.log("✅ Dados atualizados com sucesso!");

    } catch (err) {
        console.error("❌ Erro:", err.message);
        process.exit(1);
    }
}

run();
