// File: scripts/fetch_delegations.js
/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.30.2 (Feature: Universal List Scanning + Sanitization)
 * Author: Hive BR
 * License: MIT
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// --- VERSÃO DO SISTEMA ---
const SCRIPT_VERSION = "2.30.2";

// --- CONFIGURAÇÕES ---
const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";
const TRAIL_API_URL = "https://hive.vote/api.php?i=1&user=hive-br.voter";

const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming?limit=1000`;
const RPC_NODES = ["https://api.deathwing.me", "https://api.hive.blog", "https://api.openhive.network"];
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const CONFIG_PATH = path.join("config", "lists.json");
const DATA_DIR = "data";
const HISTORY_DIR = path.join(DATA_DIR, "history");
const GLOBAL_HISTORY_FILE = path.join(DATA_DIR, "global_history.json");
const DISCOVERY_FILE = path.join(DATA_DIR, "discovery.json");

// Carrega listas
let listConfig = { watchlist: [] };
try { 
    if (fs.existsSync(CONFIG_PATH)) {
        listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH)); 
    }
} catch (e) {
    console.warn("⚠️ lists.json não encontrado. Usando padrões vazios.");
}

// --- LÓGICA OPÇÃO 2: SCANNER UNIVERSAL ---
// Coleta usuários de TODAS as listas (watchlist + países) para garantir monitoramento
// mesmo sem delegação financeira.
const monitoredSet = new Set(listConfig.watchlist || []);
Object.keys(listConfig).forEach(key => {
    // Pega verificado_XX e pendente_XX
    if ((key.startsWith("verificado_") || key.startsWith("pendente_")) && Array.isArray(listConfig[key])) {
        listConfig[key].forEach(u => {
            if(u) monitoredSet.add(u);
        });
    }
});
const FIXED_USERS = [...monitoredSet]; 
// ----------------------------------------

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

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

async function fetchCurationTrail() {
    console.log("👣 Buscando dados da Curation Trail...");
    try {
        const response = await fetch(TRAIL_API_URL, { timeout: 8000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data)) return data.map(item => item.follower);
    } catch (e) {
        console.error(`❌ Erro API Hive.vote: ${e.message}. Retornando lista vazia.`);
        return [];
    }
    return [];
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

// --- LÓGICA DE DETECÇÃO DE PAÍS DINÂMICA ---
function detectCountryAndStatus(username, config) {
    let country = "BR"; 
    let isCert = false;
    
    // Normalização para busca (lowercase)
    const target = String(username).toLowerCase().trim();

    for (const [key, list] of Object.entries(config)) {
        if (Array.isArray(list)) {
            // Verifica se existe na lista ignorando case
            const exists = list.some(u => String(u).toLowerCase().trim() === target);
            
            if (exists) {
                if (key.startsWith("verificado_")) {
                    country = key.replace("verificado_", "").toUpperCase();
                    isCert = true;
                    break; 
                } else if (key.startsWith("pendente_")) {
                    country = key.replace("pendente_", "").toUpperCase();
                    isCert = false;
                }
            }
        }
    }

    if (isCert) return `${country}_CERT`;
    return country; 
}

async function fetchSmartVoteHistory() {
    console.log("🗳️ Iniciando varredura inteligente de votos...");
    let lastVotesMap = {}; 
    let historyNamed = {}; 
    let votes24h = 0;
    
    const now = new Date();
    const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const limitDate = new Date(); 
    limitDate.setDate(limitDate.getDate() - 90); 

    let start = -1; let limit = 1000; let active = true; let totalScanned = 0;
    
    while (active && totalScanned < 50000) {
        const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, start, limit]);
        if (!history || history.length === 0) break;

        for (let i = history.length - 1; i >= 0; i--) {
            const tx = history[i];
            const op = tx[1].op;
            const ts = new Date(tx[1].timestamp + "Z");

            if (ts < limitDate) { active = false; break; }

            if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
                const votedUser = op[1].author;
                if (!lastVotesMap[votedUser]) lastVotesMap[votedUser] = tx[1].timestamp + "Z";
                if (ts >= time24h) votes24h++;
                const label = getMonthLabel(ts);
                historyNamed[label] = (historyNamed[label] || 0) + 1;
            }
        }
        totalScanned += history.length;
        if (active) {
            const firstId = history[0][0];
            if (firstId <= 0) break;
            start = firstId - 1;
            limit = Math.min(1000, start);
        }
    }
    return { lastVotesMap, historyNamed, votes24h };
}

// --- PROTOCOLO DE DESCOBERTA (Inbox) BLINDADO ---
function updateDiscoveryLog(delegations, config) {
    let discoveryData = {};
    try { 
        if (fs.existsSync(DISCOVERY_FILE)) {
            discoveryData = JSON.parse(fs.readFileSync(DISCOVERY_FILE));
        }
    } catch (e) {
        console.warn("⚠️ discovery.json vazio ou inválido. Criando novo.");
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!discoveryData[monthKey]) {
        discoveryData[monthKey] = { unknown_delegators: [], last_scan: now.toISOString() };
    }

    // 1. NORMALIZAÇÃO: Cria conjunto de usuários conhecidos (lowercase + trim)
    const allKnownUsers = new Set();
    Object.values(config).forEach(list => {
        if (Array.isArray(list)) {
            list.forEach(u => {
                if (u) allKnownUsers.add(String(u).toLowerCase().trim());
            });
        }
    });

    let newFinds = 0;

    delegations.forEach(d => {
        // 2. NORMALIZAÇÃO DO CANDIDATO
        const normalizedDelegator = String(d.delegator).toLowerCase().trim();

        if (d.hp_equivalent > 0 && !allKnownUsers.has(normalizedDelegator)) {
            
            // Verifica duplicidade no log mensal
            const alreadyLogged = discoveryData[monthKey].unknown_delegators.some(
                entry => String(entry.user).toLowerCase().trim() === normalizedDelegator
            );
            
            if (!alreadyLogged) {
                discoveryData[monthKey].unknown_delegators.push({
                    user: d.delegator, // Mantém nome original para display
                    hp: parseFloat(d.hp_equivalent).toFixed(2),
                    first_seen: now.toISOString()
                });
                console.log(`⚠️ [NOVO DELEGADOR DESCONHECIDO]: @${d.delegator}`);
                newFinds++;
            }
        }
    });

    if (newFinds > 0) {
        fs.writeFileSync(DISCOVERY_FILE, JSON.stringify(discoveryData, null, 2));
        console.log(`💾 Salvos ${newFinds} novos delegadores desconhecidos em discovery.json`);
    }
}

function updateRankingHistory(ranking) {
    const historyFile = path.join(DATA_DIR, "ranking_history.json");
    let history = {};
    try { if (fs.existsSync(historyFile)) history = JSON.parse(fs.readFileSync(historyFile)); } catch (e) {}

    const today = new Date().toISOString().split('T')[0];

    ranking.forEach(user => {
        if (!history[user.delegator]) history[user.delegator] = {};
        history[user.delegator][today] = {
            hp: parseFloat(user.delegated_hp.toFixed(2)),
            trail: user.in_curation_trail,
            own: parseFloat(user.total_account_hp.toFixed(2)),
            hbr: parseFloat(user.token_balance.toFixed(2))
        };
    });

    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

function updateMonthlyStats(metaData) {
    const historyFile = path.join(DATA_DIR, "monthly_stats.json");
    let history = [];
    try { if (fs.existsSync(historyFile)) history = JSON.parse(fs.readFileSync(historyFile)); } catch (e) {}

    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

    const currentStats = { date: monthKey, ...metaData };
    delete currentStats.vote_history_named; 
    delete currentStats.versions;

    const index = history.findIndex(h => h.date === monthKey);
    if (index >= 0) history[index] = currentStats;
    else history.push(currentStats);

    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

function updateGlobalHistory(data) {
    let globalData = {};
    try { if (fs.existsSync(GLOBAL_HISTORY_FILE)) globalData = JSON.parse(fs.readFileSync(GLOBAL_HISTORY_FILE)); } catch (e) {}
    const todayKey = new Date().toISOString().split('T')[0];
    globalData[todayKey] = {
        total_votes: data.votes_24h,
        trail_count: data.curation_trail_count,
        active_brazilians: data.active_brazilians,
        total_hp: parseFloat(data.total_hp.toFixed(2)),
        active_members: data.active_community_members
    };
    fs.writeFileSync(GLOBAL_HISTORY_FILE, JSON.stringify(globalData, null, 2));
}

function manageSnapshots(ranking, metaData) {
    const now = new Date();
    const yearDir = path.join(HISTORY_DIR, String(now.getFullYear()));
    if (!fs.existsSync(yearDir)) fs.mkdirSync(yearDir, { recursive: true });

    if (now.getDate() === 1) {
        const filename = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01_snapshot.json`;
        const filepath = path.join(yearDir, filename);
        if (!fs.existsSync(filepath)) {
            fs.writeFileSync(filepath, JSON.stringify({ meta: metaData, ranking: ranking, date: now.toISOString() }, null, 2));
        }
    }
}

// --- MAIN ---
async function run() {
    try {
        console.log(`🚀 Hive BR Dashboard v${SCRIPT_VERSION}`);
        
        const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
        const totalVests = parseFloat(globals.total_vesting_shares);
        const totalFund = parseFloat(globals.total_vesting_fund_hive);
        const vestToHp = (val) => (parseFloat(val) * totalFund / totalVests);

        const res = await fetch(HAF_API);
        let delegations = await res.json();
        if (!Array.isArray(delegations)) delegations = [];

        // Pré-cálculo HP
        delegations.forEach(d => {
            d.hp_equivalent = d.hp_equivalent ? parseFloat(d.hp_equivalent) : vestToHp(d.vesting_shares);
        });

        // 1. Atualiza Log de Descoberta (Sanitizado)
        updateDiscoveryLog(delegations, listConfig);

        const curationTrailUsers = await fetchCurationTrail();
        
        // 2. Monta Lista Final de Monitoramento (Delegadores + Watchlist + Listas de Países)
        const currentDelegators = new Set(delegations.map(d => d.delegator));
        
        // Adiciona quem falta (quem está nas listas mas não delega)
        FIXED_USERS.forEach(u => {
            if (!currentDelegators.has(u)) {
                delegations.push({ delegator: u, vesting_shares: 0, hp_equivalent: 0 });
            }
        });

        const voteData = await fetchSmartVoteHistory();

        // Busca dados de todas as contas únicas
        const allAccountsToFetch = new Set([...delegations.map(d => d.delegator), ...curationTrailUsers, PROJECT_ACCOUNT, VOTER_ACCOUNT]);
        const allAccountsArray = [...allAccountsToFetch];
        let accounts = [];
        
        console.log(`📡 Detalhando ${allAccountsArray.length} contas...`);
        for (let i = 0; i < allAccountsArray.length; i += 100) {
            const batch = allAccountsArray.slice(i, i + 100);
            const batchRes = await hiveRpc("condenser_api.get_accounts", [batch]);
            if (batchRes) accounts = accounts.concat(batchRes);
        }
        
        let accountsMap = {};
        let projectHp = 0;
        accounts.forEach(acc => {
            if (acc.name === PROJECT_ACCOUNT) projectHp = vestToHp(acc.vesting_shares);
            accountsMap[acc.name] = acc;
        });

        const heBalances = await fetchHiveEngineBalances([...allAccountsToFetch]);
        let tokenMap = {};
        heBalances.forEach(b => { tokenMap[b.account] = parseFloat(b.stake || 0); });
        const tokenSum = heBalances.reduce((acc, curr) => acc + parseFloat(curr.stake || 0), 0);

        let activeMembersCount = 0;

        const ranking = delegations.map(d => {
            let finalHp = d.hp_equivalent; 
            const acc = accountsMap[d.delegator] || {};
            const totalAccountHp = acc.vesting_shares ? vestToHp(acc.vesting_shares) + vestToHp(acc.received_vesting_shares) : 0;
            
            // Detecção de país (Sanitizada dentro da função)
            const countryCode = detectCountryAndStatus(d.delegator, listConfig);
            
            // --- REGRA DE NEGÓCIO: BRASILEIROS ATIVOS (v2.30.2) ---
            // Graças à Opção 2, agora a lista 'delegations' contém também os não-delegadores
            // que estão nas listas de países. Logo, a contagem funcionará corretamente.
            const lastPostDate = acc.last_post ? new Date(acc.last_post + "Z") : null;
            const daysSincePost = lastPostDate ? (new Date() - lastPostDate) / (1000 * 60 * 60 * 24) : 999;
            
            if (countryCode.startsWith("BR") && daysSincePost <= 30) {
                activeMembersCount++;
            }
            // --------------------------------------------

            let pdDate = null;
            if (parseFloat(acc.vesting_withdraw_rate) > 0 && acc.next_vesting_withdrawal) pdDate = acc.next_vesting_withdrawal;

            return {
                delegator: d.delegator,
                delegated_hp: finalHp,
                total_account_hp: totalAccountHp,
                token_balance: tokenMap[d.delegator] || 0,
                country_code: countryCode, 
                last_user_post: acc.last_post || null,
                next_withdrawal: pdDate,
                timestamp: d.timestamp,
                in_curation_trail: curationTrailUsers.includes(d.delegator),
                last_vote_date: voteData.lastVotesMap[d.delegator] || null
            };
        });

        ranking.sort((a, b) => b.delegated_hp - a.delegated_hp);
        fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(ranking, null, 2));

        const now = new Date();
        const curLabel = getMonthLabel(now);
        const d1 = new Date(); d1.setMonth(d1.getMonth() - 1);
        const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);

        const uniqueMembers = new Set([...ranking.map(r => r.delegator), ...curationTrailUsers]);
        
        const metaData = {
            last_updated: new Date().toISOString(),
            versions: { backend: SCRIPT_VERSION, node_env: process.version },
            total_delegators: ranking.filter(d => d.delegated_hp > 0).length,
            total_hp: ranking.reduce((acc, curr) => acc + curr.delegated_hp, 0),
            project_account_hp: projectHp,
            total_hbr_staked: tokenSum,
            curation_trail_count: curationTrailUsers.length,
            active_community_members: uniqueMembers.size,
            active_brazilians: activeMembersCount,
            votes_24h: voteData.votes24h,
            vote_history_named: voteData.historyNamed,
            votes_month_current: voteData.historyNamed[curLabel] || 0,
            votes_month_prev1: voteData.historyNamed[getMonthLabel(d1)] || 0,
            votes_month_prev2: voteData.historyNamed[getMonthLabel(d2)] || 0
        };

        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));
        
        updateRankingHistory(ranking);
        updateMonthlyStats(metaData);
        updateGlobalHistory(metaData);
        manageSnapshots(ranking, metaData);
        
        console.log(`✅ Ciclo concluído com sucesso.`);

    } catch (err) {
        console.error("❌ Falha:", err.message);
        process.exit(1);
    }
}

run();
