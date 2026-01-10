/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.24.1 (Hotfix)
 * Update: Restores 'timestamp' for accurate delegation time. Fixes 'Last Curation' logic.
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
let listConfig = { verificado_br: [], curation_trail: [], br: [], watchlist: [] };
try { if (fs.existsSync(CONFIG_PATH)) listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH)); } catch (e) {}
const CURATION_TRAIL_USERS = listConfig.curation_trail || [];
const FIXED_USERS = listConfig.watchlist || [];

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

function getCountryCode(username) {
    if ((listConfig.verificado_br || []).includes(username)) return "BR_CERT";
    if ((listConfig.br || []).includes(username)) return "BR";
    return null;
}

// --- BUSCA PROFUNDA DE VOTOS E CURADORIA ---
async function fetchVoteHistory() {
  const now = new Date();
  let historyMap = {}; 
  let lastCurationMap = {}; // Mapa: Quem recebeu voto -> Data
  let votes24h = 0;
  
  const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const limitDate = new Date(now);
  limitDate.setDate(limitDate.getDate() - 90); // Scan de 90 dias

  let limit = 50000; 
  let start = -1; 
  let count = 1000;

  console.log(`🔍 Iniciando varredura de votos do projeto (90 dias)...`);

  while (limit > 0) {
    const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, start, count]);
    if (!history || history.length === 0) break;

    let stopScan = false;
    for (let i = history.length - 1; i >= 0; i--) {
      const tx = history[i];
      const op = tx[1].op;
      const ts = new Date(tx[1].timestamp + "Z");

      if (ts < limitDate) { stopScan = true; break; }

      if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
          // Estatísticas
          if (ts >= time24h) votes24h++;
          const label = getMonthLabel(ts);
          if (!historyMap[label]) historyMap[label] = 0;
          historyMap[label]++;

          // Mapeamento de Curadoria (author = quem recebeu)
          const author = op[1].author;
          if (!lastCurationMap[author]) {
              lastCurationMap[author] = ts.toISOString(); // Pega o mais recente
          }
      }
    }
    if (stopScan) break;
    const firstTxId = history[0][0]; 
    if (firstTxId === 0) break;
    start = firstTxId - 1;
    if (start < count) count = start; 
    limit -= 1000;
    await new Promise(r => setTimeout(r, 100));
  }
  return { votes24h, historyMap, lastCurationMap };
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
        monthly_votes: metaData.votes_month_current,
        trail_count: metaData.curation_trail_count,
        hbr_staked_total: metaData.total_hbr_staked,
        active_members: metaData.active_community_members,
        active_brazilians: metaData.active_brazilians
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
        console.log("🔄 Coletando dados (v2.24.1)...");
        
        // 1. Delegações (HAF)
        const res = await fetch(HAF_API);
        let delegations = await res.json();
        if (!Array.isArray(delegations)) delegations = [];

        const currentDelegators = new Set(delegations.map(d => d.delegator));
        FIXED_USERS.forEach(u => {
            if (!currentDelegators.has(u)) delegations.push({ delegator: u, hp_equivalent: 0, timestamp: new Date().toISOString() });
        });

        // 2. Globais
        const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
        const vestToHp = parseFloat(globals.total_vesting_fund_hive) / parseFloat(globals.total_vesting_shares);
        
        // 3. Histórico de Votos do Projeto (Scan)
        const { votes24h, historyMap, lastCurationMap } = await fetchVoteHistory();

        // 4. Dados das Contas (Atividade Geral)
        const allKnownBrs = new Set([...(listConfig.verificado_br || []), ...(listConfig.br || [])]);
        const accountsToFetch = new Set([...currentDelegators, PROJECT_ACCOUNT, ...allKnownBrs]);
        const accountsList = Array.from(accountsToFetch);
        let allAccountsData = [];
        
        for (let i = 0; i < accountsList.length; i += 50) {
            const batch = accountsList.slice(i, i + 50);
            const batchData = await hiveRpc("condenser_api.get_accounts", [batch]);
            if (batchData) allAccountsData = allAccountsData.concat(batchData);
        }

        // 5. Tokens (Hive Engine)
        const heBalances = await fetchHiveEngineBalances(Array.from(accountsToFetch));

        // --- PROCESSAMENTO ---
        let projectHp = 0;
        let activeBraziliansCount = 0;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const accMap = new Map(allAccountsData.map(a => [a.name, a]));
        const heMap = new Map(heBalances.map(b => [b.account, parseFloat(b.stake || 0)]));

        // Cálculo de Brasileiros Ativos (Apenas Post/Comentário)
        allAccountsData.forEach(acc => {
            if (acc.name === PROJECT_ACCOUNT) projectHp = parseFloat(acc.vesting_shares) * vestToHp;
            if (allKnownBrs.has(acc.name)) {
                const lastPost = new Date(acc.last_post + "Z");
                if (lastPost >= thirtyDaysAgo) activeBraziliansCount++;
            }
        });

        // Montagem Final do Ranking
        const enrichedRanking = delegations.map(d => {
            const acc = accMap.get(d.delegator);
            
            // CORREÇÃO: last_vote_date vem do nosso mapa de curadoria
            const realLastCuration = lastCurationMap[d.delegator] || null;

            return {
                delegator: d.delegator,
                delegated_hp: parseFloat(d.hp_equivalent || 0),
                // CORREÇÃO: timestamp mantido da API HAF para cálculo correto de fidelidade
                timestamp: d.timestamp, 
                total_account_hp: acc ? (parseFloat(acc.vesting_shares) * vestToHp) : 0,
                token_balance: heMap.get(d.delegator) || 0,
                last_user_post: acc ? acc.last_post : null,
                last_vote_date: realLastCuration,
                next_withdrawal: acc ? acc.next_vesting_withdrawal : null,
                country_code: getCountryCode(d.delegator),
                in_curation_trail: CURATION_TRAIL_USERS.includes(d.delegator)
            };
        });

        enrichedRanking.sort((a, b) => b.delegated_hp - a.delegated_hp);

        // Labels
        const now = new Date();
        const curLabel = getMonthLabel(now);
        const d1 = new Date(); d1.setMonth(d1.getMonth() - 1); const prev1Label = getMonthLabel(d1);
        const d2 = new Date(); d2.setMonth(d2.getMonth() - 2); const prev2Label = getMonthLabel(d2);

        const uniqueMembers = new Set([...delegations.map(d => d.delegator), ...CURATION_TRAIL_USERS]);
        const totalHpDelegated = enrichedRanking.reduce((acc, curr) => acc + curr.delegated_hp, 0);
        const totalHbr = enrichedRanking.reduce((acc, curr) => acc + curr.token_balance, 0);

        // --- SALVAMENTO ---
        const metaData = {
            last_updated: new Date().toISOString(),
            total_delegators: delegations.filter(d => d.hp_equivalent > 0).length,
            total_hp: totalHpDelegated,
            project_account_hp: projectHp,
            total_hbr_staked: totalHbr,
            curation_trail_count: CURATION_TRAIL_USERS.length,
            active_community_members: uniqueMembers.size,
            active_brazilians: activeBraziliansCount,
            votes_24h: votes24h,
            vote_history_named: historyMap,
            votes_month_current: historyMap[curLabel] || 0,
            votes_month_prev1: historyMap[prev1Label] || 0,
            votes_month_prev2: historyMap[prev2Label] || 0
        };
        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

        updateMonthlyStats(metaData);

        fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify({
            updated_at: new Date().toISOString(),
            ranking: enrichedRanking
        }, null, 2));

        console.log("✅ Dados atualizados com sucesso!");

    } catch (err) {
        console.error("❌ Erro Fatal:", err.message);
        process.exit(1);
    }
}

run();
