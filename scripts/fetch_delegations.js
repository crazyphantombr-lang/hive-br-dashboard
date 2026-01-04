/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.20.2 (Development)
 * Update: Implements 90-Day Deep Scan to recover vote history (24h, Current, Prev Months).
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

// --- BUSCA PROFUNDA DE VOTOS (90 DIAS) ---
async function fetchVoteHistory() {
  const now = new Date();
  
  // Definição das janelas de tempo
  const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const prevMonth1Date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth1End = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); // Último dia do mês passado
  
  const prevMonth2Date = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const prevMonth2End = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59);

  // Contadores
  let stats = {
      v24h: 0,
      vCurrent: 0,
      vPrev1: 0, // Mês passado (ex: Dezembro)
      vPrev2: 0  // Retrasado (ex: Novembro)
  };

  // Data limite (90 dias atrás para garantir cobertura)
  const limitDate = new Date(now);
  limitDate.setDate(limitDate.getDate() - 90);

  let limit = 50000; // Limite de segurança (txs)
  let start = -1; 
  let count = 1000;

  console.log(`🔍 Iniciando varredura profunda de votos (Limite: ${limitDate.toISOString().split('T')[0]})...`);

  while (limit > 0) {
    const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, start, count]);
    
    if (!history || history.length === 0) break;

    let stopScan = false;

    // Itera do mais recente para o mais antigo
    for (let i = history.length - 1; i >= 0; i--) {
      const tx = history[i];
      const op = tx[1].op;
      const ts = new Date(tx[1].timestamp + "Z");

      // Se passou da data limite de 90 dias, para tudo.
      if (ts < limitDate) {
        stopScan = true;
        break;
      }

      if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
          // Lógica de Contagem
          if (ts >= time24h) stats.v24h++;
          
          if (ts >= currentMonthStart) {
              stats.vCurrent++;
          } else if (ts >= prevMonth1Date && ts <= prevMonth1End) {
              stats.vPrev1++;
          } else if (ts >= prevMonth2Date && ts <= prevMonth2End) {
              stats.vPrev2++;
          }
      }
    }

    if (stopScan) break;

    // Paginação
    const firstTxId = history[0][0]; 
    if (firstTxId === 0) break;
    
    start = firstTxId - 1;
    if (start < count) count = start; 
    limit -= 1000;
    
    await new Promise(r => setTimeout(r, 150)); // Delay suave
  }

  console.log(`✅ Deep Scan Completo: 24h: ${stats.v24h} | Atual: ${stats.vCurrent} | M-1: ${stats.vPrev1} | M-2: ${stats.vPrev2}`);
  return stats;
}

function updateMonthlyStats(metaData) {
    const historyFile = path.join(DATA_DIR, "monthly_stats.json");
    let history = [];
    try { if (fs.existsSync(historyFile)) history = JSON.parse(fs.readFileSync(historyFile)); } catch (e) {}

    const today = new Date();
    // Chave do mês atual
    const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    
    // Atualiza ou Cria entrada do mês atual
    const currentStats = {
        date: currentKey,
        total_power: (metaData.total_hp + metaData.project_account_hp),
        own_hp: metaData.project_account_hp,
        delegators_count: metaData.total_delegators,
        monthly_votes: metaData.votes_month_current,
        trail_count: metaData.curation_trail_count,
        hbr_staked_total: metaData.total_hbr_staked,
        active_members: metaData.active_community_members 
    };

    const index = history.findIndex(h => h.date === currentKey);
    if (index >= 0) history[index] = currentStats;
    else history.push(currentStats);

    // Tenta atualizar meses anteriores retroativamente se os dados existirem e estiverem zerados no arquivo
    if (metaData.votes_month_prev1 > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        const prevKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const idxPrev = history.findIndex(h => h.date === prevKey);
        if (idxPrev >= 0) history[idxPrev].monthly_votes = metaData.votes_month_prev1;
    }

    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// --- MAIN ---
async function run() {
    try {
        console.log("🔄 Coletando dados (v2.20.2 - Deep Scan)...");
        
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

        // 4. Votos (Deep Scan)
        const voteStats = await fetchVoteHistory();

        // 5. Membros Únicos
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
            
            // Novos campos para o Frontend
            votes_24h: voteStats.v24h,
            votes_month_current: voteStats.vCurrent,
            votes_month_prev1: voteStats.vPrev1,
            votes_month_prev2: voteStats.vPrev2
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
