// File: scripts/fetch_delegations.js
/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.25.0 (Global History + Versioning)
 * Author: Hive BR
 * License: MIT
 * Description: Coleta dados, gera ranking, salva histórico diário e informa versões.
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// --- VERSÃO DO SISTEMA ---
const SCRIPT_VERSION = "2.25.0";

// --- CONFIGURAÇÕES ---
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

// --- SISTEMA DE VOTOS (Smart Scan - Limit 1000 Safe) ---
async function fetchSmartVoteHistory() {
    console.log("🗳️ Iniciando varredura inteligente de votos...");
    
    let lastVotesMap = {}; 
    let historyNamed = {}; 
    let votes24h = 0;
    
    const now = new Date();
    const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const limitDate = new Date(); 
    limitDate.setDate(limitDate.getDate() - 90); 

    let start = -1;
    let limit = 1000; // Limite seguro
    let active = true;
    let totalScanned = 0;
    const MAX_SCAN = 50000; 

    while (active && totalScanned < MAX_SCAN) {
        const history = await hiveRpc("condenser_api.get_account_history", [VOTER_ACCOUNT, start, limit]);
        
        if (!history || history.length === 0) break;

        for (let i = history.length - 1; i >= 0; i--) {
            const tx = history[i];
            const op = tx[1].op;
            const ts = new Date(tx[1].timestamp + "Z");

            if (ts < limitDate) {
                active = false;
                break;
            }

            if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
                const votedUser = op[1].author;
                
                if (!lastVotesMap[votedUser]) {
                    lastVotesMap[votedUser] = tx[1].timestamp + "Z";
                }

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
            if (totalScanned % 5000 === 0) console.log(`... ${totalScanned} txs analisadas`);
        }
    }
    
    console.log(`✅ Scan concluído: ${totalScanned} txs analisadas.`);
    return { lastVotesMap, historyNamed, votes24h };
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
        active_members: metaData.active_community_members
    };

    const index = history.findIndex(h => h.date === monthKey);
    if (index >= 0) history[index] = currentStats;
    else history.push(currentStats);

    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// --- SALVA HISTÓRICO GLOBAL (NOVA FEATURE) ---
function updateGlobalHistory(data) {
    let globalData = {};
    try {
        if (fs.existsSync(GLOBAL_HISTORY_FILE)) {
            globalData = JSON.parse(fs.readFileSync(GLOBAL_HISTORY_FILE));
        }
    } catch (e) { console.warn("Criando novo arquivo de histórico global."); }

    // Chave do dia (YYYY-MM-DD)
    const todayKey = new Date().toISOString().split('T')[0];

    globalData[todayKey] = {
        total_votes: data.votes_24h,
        trail_count: data.curation_trail_count,
        active_brazilians: data.active_brazilians,
        total_hp: parseFloat((data.total_hp + data.project_account_hp).toFixed(2)),
        total_delegated_hp: parseFloat(data.total_hp.toFixed(2)),
        active_members: data.active_community_members,
        script_version: SCRIPT_VERSION
    };

    // Ordena chaves por data
    const sorted = {};
    Object.keys(globalData).sort().forEach(key => sorted[key] = globalData[key]);

    fs.writeFileSync(GLOBAL_HISTORY_FILE, JSON.stringify(sorted, null, 2));
    console.log(`📅 Histórico Global atualizado para ${todayKey}`);
}

// --- MAIN ---
async function run() {
    try {
        console.log(`🚀 Iniciando Hive BR Dashboard (v${SCRIPT_VERSION})...`);
        
        // 1. Dados Globais
        const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
        const totalVests = parseFloat(globals.total_vesting_shares);
        const totalFund = parseFloat(globals.total_vesting_fund_hive);
        const vestToHp = (val) => {
            let vests = (typeof val === 'string') ? parseFloat(val.replace(' VESTS', '')) : parseFloat(val);
            return (vests * totalFund / totalVests);
        };

        // 2. Delegações
        const res = await fetch(HAF_API);
        let delegations = await res.json();
        if (!Array.isArray(delegations)) delegations = [];

        const currentDelegators = new Set(delegations.map(d => d.delegator));
        FIXED_USERS.forEach(u => {
            if (!currentDelegators.has(u)) delegations.push({ delegator: u, vesting_shares: 0, hp_equivalent: 0 });
        });

        // 3. Histórico de Votos
        const voteData = await fetchSmartVoteHistory();

        // 4. Contas e Tokens
        const accounts = await hiveRpc("condenser_api.get_accounts", [[...currentDelegators, PROJECT_ACCOUNT]]);
        let projectHp = 0;
        let accountsMap = {};
        
        accounts.forEach(acc => {
            if (acc.name === PROJECT_ACCOUNT) projectHp = parseFloat(acc.vesting_shares) * totalFund / totalVests;
            accountsMap[acc.name] = acc;
        });

        const heBalances = await fetchHiveEngineBalances([...currentDelegators]);
        let tokenMap = {};
        heBalances.forEach(b => { tokenMap[b.account] = parseFloat(b.stake || 0); });
        const tokenSum = heBalances.reduce((acc, curr) => acc + parseFloat(curr.stake || 0), 0);

        // 5. Ranking & Contagem de Brasileiros
        let activeBraziliansCount = 0;

        const ranking = delegations.map(d => {
            let finalHp = 0;
            if (d.hp_equivalent) finalHp = parseFloat(d.hp_equivalent);
            else if (d.vesting_shares) finalHp = vestToHp(d.vesting_shares);

            const acc = accountsMap[d.delegator] || {};
            const totalAccountHp = acc.vesting_shares ? vestToHp(acc.vesting_shares) + vestToHp(acc.received_vesting_shares) : 0;
            const isBr = listConfig.verificado_br.includes(d.delegator);
            
            // Contagem de Brasileiros Ativos (Com HP > 0)
            if ((isBr || d.delegator === 'hive-br') && finalHp > 0) {
                activeBraziliansCount++;
            }

            const lastVote = voteData.lastVotesMap[d.delegator] || null;

            return {
                delegator: d.delegator,
                delegated_hp: finalHp,
                total_account_hp: totalAccountHp,
                token_balance: tokenMap[d.delegator] || 0,
                country_code: isBr ? "BR_CERT" : "BR",
                last_user_post: acc.last_post || null,
                next_withdrawal: acc.next_vesting_withdrawal || null,
                timestamp: d.timestamp,
                in_curation_trail: CURATION_TRAIL_USERS.includes(d.delegator),
                last_vote_date: lastVote, 
                votes_month: 0 
            };
        });

        ranking.sort((a, b) => b.delegated_hp - a.delegated_hp);
        fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(ranking, null, 2));

        // 6. Meta Data e Versionamento
        const now = new Date();
        const curLabel = getMonthLabel(now);
        const d1 = new Date(); d1.setMonth(d1.getMonth() - 1);
        const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);

        const uniqueMembers = new Set([...delegations.map(d => d.delegator), ...CURATION_TRAIL_USERS]);
        const totalDelegatedHp = ranking.reduce((acc, curr) => acc + curr.delegated_hp, 0);

        const metaData = {
            last_updated: new Date().toISOString(),
            versions: {
                backend: SCRIPT_VERSION,
                node_env: process.version
            },
            total_delegators: ranking.filter(d => d.delegated_hp > 0).length,
            total_hp: totalDelegatedHp,
            project_account_hp: projectHp,
            total_hbr_staked: tokenSum,
            curation_trail_count: CURATION_TRAIL_USERS.length,
            active_community_members: uniqueMembers.size,
            active_brazilians: activeBraziliansCount, // Campo recuperado
            
            votes_24h: voteData.votes24h,
            vote_history_named: voteData.historyNamed,
            votes_month_current: voteData.historyNamed[curLabel] || 0,
            votes_month_prev1: voteData.historyNamed[getMonthLabel(d1)] || 0,
            votes_month_prev2: voteData.historyNamed[getMonthLabel(d2)] || 0
        };

        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));
        
        // 7. Atualizar Históricos
        updateMonthlyStats(metaData);
        updateGlobalHistory(metaData); // Salva o histórico diário novo
        
        console.log(`✅ Sucesso! Dados globais e ranking atualizados.`);

    } catch (err) {
        console.error("❌ Erro fatal:", err.message);
        process.exit(1);
    }
}

run();
