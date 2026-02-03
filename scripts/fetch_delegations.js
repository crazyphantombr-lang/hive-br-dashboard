// File: scripts/fetch_delegations.js
/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.30.3 (Features: Growth Logic + Activity Log Restoration)
 * Author: Hive BR
 * License: MIT
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// --- VERSÃO ---
const SCRIPT_VERSION = "2.30.3";

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
const RANKING_HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");

// Carrega listas
let listConfig = { watchlist: [] };
try { 
    if (fs.existsSync(CONFIG_PATH)) {
        listConfig = JSON.parse(fs.readFileSync(CONFIG_PATH)); 
    }
} catch (e) {
    console.warn("⚠️ lists.json com erro ou inexistente.");
}

// Scanner Universal (Opção 2)
const monitoredSet = new Set(listConfig.watchlist || []);
Object.keys(listConfig).forEach(key => {
    if ((key.startsWith("verificado_") || key.startsWith("pendente_")) && Array.isArray(listConfig[key])) {
        listConfig[key].forEach(u => { if(u) monitoredSet.add(u); });
    }
});
const FIXED_USERS = [...monitoredSet]; 

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// --- AUXILIARES ---
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
    try {
        const response = await fetch(TRAIL_API_URL, { timeout: 8000 });
        const data = await response.json();
        if (Array.isArray(data)) return data.map(item => item.follower);
    } catch (e) { return []; }
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

function detectCountryAndStatus(username, config) {
    let country = "BR"; let isCert = false;
    const target = String(username).toLowerCase().trim();
    for (const [key, list] of Object.entries(config)) {
        if (Array.isArray(list)) {
            if (list.some(u => String(u).toLowerCase().trim() === target)) {
                if (key.startsWith("verificado_")) { country = key.replace("verificado_", "").toUpperCase(); isCert = true; break; }
                else if (key.startsWith("pendente_")) { country = key.replace("pendente_", "").toUpperCase(); isCert = false; }
            }
        }
    }
    return isCert ? `${country}_CERT` : country; 
}

// --- LOGIC: DISCOVERY ---
function updateDiscoveryLog(delegations, config) {
    let discoveryData = {};
    try { if (fs.existsSync(DISCOVERY_FILE)) discoveryData = JSON.parse(fs.readFileSync(DISCOVERY_FILE)); } catch (e) {}

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!discoveryData[monthKey]) discoveryData[monthKey] = { unknown_delegators: [], last_scan: now.toISOString() };

    const allKnownUsers = new Set();
    Object.values(config).forEach(list => { if (Array.isArray(list)) list.forEach(u => allKnownUsers.add(String(u).toLowerCase().trim())); });

    let newFinds = 0;
    delegations.forEach(d => {
        const normalized = String(d.delegator).toLowerCase().trim();
        if (d.hp_equivalent > 0 && !allKnownUsers.has(normalized)) {
            const alreadyLogged = discoveryData[monthKey].unknown_delegators.some(entry => String(entry.user).toLowerCase().trim() === normalized);
            if (!alreadyLogged) {
                discoveryData[monthKey].unknown_delegators.push({ user: d.delegator, hp: parseFloat(d.hp_equivalent).toFixed(2), first_seen: now.toISOString() });
                console.log(`⚠️ [NOVO]: @${d.delegator}`);
                newFinds++;
            }
        }
    });
    if (newFinds > 0) fs.writeFileSync(DISCOVERY_FILE, JSON.stringify(discoveryData, null, 2));
}

// --- LOGIC: ACTIVITY LOG (COMPARISON) ---
function generateActivityLog(currentRanking) {
    let oldRanking = [];
    try {
        if (fs.existsSync(CURRENT_FILE)) {
            oldRanking = JSON.parse(fs.readFileSync(CURRENT_FILE));
        }
    } catch (e) { return []; }

    const changes = [];
    currentRanking.forEach(curr => {
        const prev = oldRanking.find(p => p.delegator === curr.delegator);
        const oldVal = prev ? prev.delegated_hp : 0;
        const newVal = curr.delegated_hp;
        const diff = newVal - oldVal;

        // Registra apenas mudanças relevantes (> 1 HP)
        if (Math.abs(diff) > 1) {
            changes.push({
                user: curr.delegator,
                old_val: parseFloat(oldVal.toFixed(2)),
                new_val: parseFloat(newVal.toFixed(2)),
                diff: parseFloat(diff.toFixed(2))
            });
        }
    });
    
    // Ordena por maior mudança (absoluta)
    return changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10);
}

// --- LOGIC: TOP GROWER (30 DAYS) ---
function calculateTopGrower(currentRanking) {
    let history = {};
    try { 
        if (fs.existsSync(RANKING_HISTORY_FILE)) history = JSON.parse(fs.readFileSync(RANKING_HISTORY_FILE)); 
    } catch (e) { return null; }

    // Calcula data 30 dias atrás
    const date30 = new Date();
    date30.setDate(date30.getDate() - 30);
    const dateStr = date30.toISOString().split('T')[0];

    // Busca a data mais próxima disponível no histórico (se a exata não existir)
    let validDate = null;
    // Pega um usuário de exemplo para checar as datas
    const sampleUser = Object.keys(history)[0];
    if (!sampleUser) return null;
    
    const availableDates = Object.keys(history[sampleUser]).sort();
    // Encontra a data mais próxima de 30 dias atrás
    validDate = availableDates.find(d => d >= dateStr); 

    if (!validDate) return null;

    let bestGrower = null;
    let maxGrowth = -1;

    currentRanking.forEach(user => {
        const userData = history[user.delegator];
        if (userData && userData[validDate]) {
            const oldHp = userData[validDate].hp || 0;
            const currentHp = user.delegated_hp;
            const growth = currentHp - oldHp;

            if (growth > maxGrowth && growth > 10) { // Mínimo 10 HP para considerar
                maxGrowth = growth;
                bestGrower = {
                    delegator: user.delegator,
                    growth: growth,
                    old_hp: oldHp,
                    current_hp: currentHp,
                    days_analyzed: Math.floor((new Date() - new Date(validDate)) / (1000 * 60 * 60 * 24))
                };
            }
        } else if (!userData && user.delegated_hp > 10) {
            // Usuário novo (não existia 30 dias atrás) = Crescimento Total
             if (user.delegated_hp > maxGrowth) {
                maxGrowth = user.delegated_hp;
                bestGrower = {
                    delegator: user.delegator,
                    growth: user.delegated_hp,
                    old_hp: 0,
                    current_hp: user.delegated_hp,
                    is_new: true
                };
             }
        }
    });

    return bestGrower;
}

// --- HISTÓRICOS ---
function updateRankingHistory(ranking) {
    const historyFile = RANKING_HISTORY_FILE;
    let history = {};
    try { if (fs.existsSync(historyFile)) history = JSON.parse(fs.readFileSync(historyFile)); } catch (e) {}
    const today = new Date().toISOString().split('T')[0];
    ranking.forEach(user => {
        if (!history[user.delegator]) history[user.delegator] = {};
        history[user.delegator][today] = {
            hp: parseFloat(user.delegated_hp.toFixed(2)),
            trail: user.in_curation_trail
        };
    });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// --- MAIN ---
async function run() {
    try {
        console.log(`🚀 Hive BR Dashboard v${SCRIPT_VERSION}`);
        
        const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
        const totalVests = parseFloat(globals.total_vesting_shares);
        const totalFund = parseFloat(globals.total_vesting_fund_hive);
        const vestToHp = (val) => (parseFloat(val) * totalFund / totalVests);

        // Fetch
        const res = await fetch(HAF_API);
        let delegations = await res.json();
        if (!Array.isArray(delegations)) delegations = [];
        delegations.forEach(d => { d.hp_equivalent = d.hp_equivalent ? parseFloat(d.hp_equivalent) : vestToHp(d.vesting_shares); });

        updateDiscoveryLog(delegations, listConfig);

        const curationTrailUsers = await fetchCurationTrail();
        
        // Merge monitored users
        const currentDelegators = new Set(delegations.map(d => d.delegator));
        FIXED_USERS.forEach(u => {
            if (!currentDelegators.has(u)) delegations.push({ delegator: u, vesting_shares: 0, hp_equivalent: 0 });
        });

        // Fetch Accounts & Votes (Simplified for brevity)
        const allAccounts = [...new Set([...delegations.map(d => d.delegator), ...curationTrailUsers, PROJECT_ACCOUNT, VOTER_ACCOUNT])];
        let accounts = [];
        for (let i = 0; i < allAccounts.length; i += 100) {
            const batch = allAccounts.slice(i, i + 100);
            const batchRes = await hiveRpc("condenser_api.get_accounts", [batch]);
            if (batchRes) accounts = accounts.concat(batchRes);
        }
        let accountsMap = {};
        let projectHp = 0;
        let lastVotesMap = {}; 
        let votes24h = 0;
        
        accounts.forEach(acc => {
            if (acc.name === PROJECT_ACCOUNT) projectHp = vestToHp(acc.vesting_shares);
            accountsMap[acc.name] = acc;
        });

        // Vote History (Fast Scan)
        const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, -1, 1000]);
        let historyNamed = {};
        if (history) {
            const now = new Date();
            history.reverse().forEach(tx => {
                const op = tx[1].op;
                const ts = new Date(tx[1].timestamp + "Z");
                if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
                    if (!lastVotesMap[op[1].author]) lastVotesMap[op[1].author] = tx[1].timestamp + "Z";
                    if ((now - ts) < 86400000) votes24h++;
                    historyNamed[getMonthLabel(ts)] = (historyNamed[getMonthLabel(ts)] || 0) + 1;
                }
            });
        }

        const heBalances = await fetchHiveEngineBalances(allAccounts);
        let tokenMap = {};
        heBalances.forEach(b => { tokenMap[b.account] = parseFloat(b.stake || 0); });
        const tokenSum = heBalances.reduce((acc, curr) => acc + parseFloat(curr.stake || 0), 0);

        let activeMembersCount = 0;

        const ranking = delegations.map(d => {
            let finalHp = d.hp_equivalent; 
            const acc = accountsMap[d.delegator] || {};
            const totalAccountHp = acc.vesting_shares ? vestToHp(acc.vesting_shares) + vestToHp(acc.received_vesting_shares) : 0;
            const countryCode = detectCountryAndStatus(d.delegator, listConfig);
            
            const lastPostDate = acc.last_post ? new Date(acc.last_post + "Z") : null;
            const daysSincePost = lastPostDate ? (new Date() - lastPostDate) / (1000 * 60 * 60 * 24) : 999;
            if (countryCode.startsWith("BR") && daysSincePost <= 30) activeMembersCount++;

            return {
                delegator: d.delegator,
                delegated_hp: finalHp,
                total_account_hp: totalAccountHp,
                token_balance: tokenMap[d.delegator] || 0,
                country_code: countryCode, 
                last_user_post: acc.last_post || null,
                next_withdrawal: acc.next_vesting_withdrawal || null,
                timestamp: d.timestamp,
                in_curation_trail: curationTrailUsers.includes(d.delegator),
                last_vote_date: lastVotesMap[d.delegator] || null
            };
        });

        ranking.sort((a, b) => b.delegated_hp - a.delegated_hp);

        // --- RECURSOS RESTAURADOS E NOVOS ---
        const activityLog = generateActivityLog(ranking);
        const topGrower = calculateTopGrower(ranking);
        
        fs.writeFileSync(CURRENT_FILE, JSON.stringify(ranking, null, 2));

        const now = new Date();
        const curLabel = getMonthLabel(now);
        const d1 = new Date(); d1.setMonth(d1.getMonth() - 1);
        const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);

        const metaData = {
            last_updated: new Date().toISOString(),
            versions: { backend: SCRIPT_VERSION, node_env: process.version },
            total_delegators: ranking.filter(d => d.delegated_hp > 0).length,
            total_hp: ranking.reduce((acc, curr) => acc + curr.delegated_hp, 0),
            project_account_hp: projectHp,
            total_hbr_staked: tokenSum,
            curation_trail_count: curationTrailUsers.length,
            active_community_members: ranking.length,
            active_brazilians: activeMembersCount,
            votes_24h: votes24h,
            votes_month_current: historyNamed[curLabel] || 0,
            votes_month_prev1: historyNamed[getMonthLabel(d1)] || 0,
            votes_month_prev2: historyNamed[getMonthLabel(d2)] || 0,
            
            // Dados Injetados
            activity_log: activityLog,
            top_grower: topGrower
        };

        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));
        
        updateRankingHistory(ranking);
        
        console.log(`✅ Ciclo concluído. Logs: ${activityLog.length}, Grower: ${topGrower ? topGrower.delegator : 'N/A'}`);

    } catch (err) {
        console.error("❌ Falha:", err.message);
        process.exit(1);
    }
}

run();
