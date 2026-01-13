/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.23.0 (Hybrid Failover Architecture)
 * Author: Hive BR
 * License: MIT
 * Changelog:
 * - Implementada estratégia de Tripla Camada para Delegações:
 * 1. HafSQL (1000) -> 2. HafSQL (300) -> 3. Native RPC.
 * - Mantida correção de datas de votos (Unfreeze) com paginação segura.
 * - Mantido Histórico Global e Contador de Brasileiros.
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// --- CONFIGURAÇÕES ---
const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";

// Endpoints
const HAF_BASE = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming`;
const RPC_NODES = [
    "https://api.deathwing.me",
    "https://api.hive.blog", 
    "https://api.openhive.network",
    "https://hive-api.arcange.eu"
];
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
async function hiveCall(method, params) {
    for (const node of RPC_NODES) {
        try {
            const response = await fetch(node, {
                method: "POST",
                body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
                headers: { "Content-Type": "application/json" },
                timeout: 10000 
            });
            const json = await response.json();
            if (json.result !== undefined) return json.result;
        } catch (e) { continue; }
    }
    throw new Error(`Falha em todos os nós RPC para ${method}`);
}

async function getHiveEngineBalance(account) {
    try {
        const response = await fetch(HE_RPC, {
            method: "POST",
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "find",
                params: {
                    contract: "tokens",
                    table: "balances",
                    query: { account, symbol: TOKEN_SYMBOL }
                },
                id: 1
            }),
            headers: { "Content-Type": "application/json" }
        });
        const json = await response.json();
        return json.result && json.result.length > 0 ? parseFloat(json.result[0].balance) : 0;
    } catch (e) { return 0; }
}

function getMonthLabel(dateObj) {
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

// --- FUNÇÃO PRINCIPAL ---
(async () => {
    console.log(`🚀 Iniciando Hive BR Dashboard Backend v2.23.0...`);
    
    try {
        // 1. Obter Cotação VESTS -> HP
        const props = await hiveCall("condenser_api.get_dynamic_global_properties", []);
        const totalVests = parseFloat(props.total_vesting_shares);
        const totalFund = parseFloat(props.total_vesting_fund_hive);
        
        const vestsToHp = (val) => {
            let vestValue = (typeof val === 'string') ? parseFloat(val.replace(' VESTS', '')) : parseFloat(val);
            return (vestValue * totalFund / totalVests).toFixed(3);
        };

        // 2. Obter Delegações (SISTEMA HÍBRIDO DE FAILOVER)
        let delegations = [];
        let sourceUsed = "NONE";

        // --> TENTATIVA 1: HafSQL Full (Limit 1000)
        try {
            console.log("📡 [1/3] Tentando HafSQL (Limit 1000)...");
            const res = await fetch(`${HAF_BASE}?limit=1000`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                delegations = data;
                sourceUsed = "HAFSQL_1000";
            } else { throw new Error("Vazio"); }
        } catch (e1) {
            console.warn(`⚠️ Falha Tentativa 1: ${e1.message}`);
            
            // --> TENTATIVA 2: HafSQL Lite (Limit 300 - Igual v2.20.0)
            try {
                console.log("📡 [2/3] Tentando HafSQL (Limit 300)...");
                const res = await fetch(`${HAF_BASE}?limit=300`);
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    delegations = data;
                    sourceUsed = "HAFSQL_300";
                } else { throw new Error("Vazio"); }
            } catch (e2) {
                console.warn(`⚠️ Falha Tentativa 2: ${e2.message}`);

                // --> TENTATIVA 3: RPC Nativo (Último Recurso)
                try {
                    console.log("🔄 [3/3] Ativando RPC Nativo...");
                    const nativeData = await hiveCall("condenser_api.get_vesting_delegations", [VOTER_ACCOUNT, "", 1000]);
                    delegations = nativeData.map(d => ({
                        delegator: d.delegator,
                        vesting_shares: d.vesting_shares,
                        timestamp: d.min_delegation_time
                    }));
                    sourceUsed = "NATIVE_RPC";
                } catch (fatal) {
                    throw new Error("❌ CRÍTICO: Todas as fontes falharam.");
                }
            }
        }

        console.log(`✅ Fonte de Dados Definida: ${sourceUsed} (${delegations.length} registros)`);

        // Adiciona watchlist
        FIXED_USERS.forEach(u => {
            if (!delegations.find(d => d.delegator === u)) {
                delegations.push({ delegator: u, vesting_shares: 0, timestamp: null });
            }
        });

        // 3. Histórico de Votos (Paginação Segura: 2000 txs)
        console.log("🗳️ Analisando histórico de votos...");
        let voterHistory = await hiveCall("condenser_api.get_account_history", [VOTER_ACCOUNT, -1, 1000]);
        
        if (voterHistory.length > 0) {
            const firstId = voterHistory[0][0];
            if (firstId > 0) {
                try {
                    const limit2 = Math.min(1000, firstId);
                    const batch2 = await hiveCall("condenser_api.get_account_history", [VOTER_ACCOUNT, firstId - 1, limit2]);
                    voterHistory = [...batch2, ...voterHistory];
                } catch (e) { console.warn("⚠️ Aviso: Histórico antigo parcial."); }
            }
        }

        const lastVotesMap = {}; 
        const now = new Date();
        let votes24h = 0;
        let historyMap = {}; 
        const curLabel = getMonthLabel(new Date());
        const d1 = new Date(); d1.setMonth(d1.getMonth() - 1);
        const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);

        // Inicializa contadores
        historyMap[curLabel] = 0;
        historyMap[getMonthLabel(d1)] = 0;
        historyMap[getMonthLabel(d2)] = 0;

        const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        voterHistory.forEach(tx => {
            const op = tx[1].op;
            const timestamp = tx[1].timestamp + "Z";
            const txDate = new Date(timestamp);

            if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
                const votedUser = op[1].author;
                if (!lastVotesMap[votedUser] || new Date(lastVotesMap[votedUser]) < txDate) {
                    lastVotesMap[votedUser] = timestamp;
                }
                if (txDate >= time24h) votes24h++;
                const label = getMonthLabel(txDate);
                if (!historyMap[label]) historyMap[label] = 0;
                historyMap[label]++;
            }
        });

        // 4. Detalhes das Contas
        const delegatorNames = delegations.map(d => d.delegator);
        let accounts = [];
        const chunkSize = 50;
        for (let i = 0; i < delegatorNames.length; i += chunkSize) {
            const chunk = delegatorNames.slice(i, i + chunkSize);
            const chunkResult = await hiveCall("condenser_api.get_accounts", [chunk]);
            accounts = accounts.concat(chunkResult);
        }

        let tokenSum = 0;
        let activeBraziliansCount = 0;

        const processedList = await Promise.all(delegations.map(async (d) => {
            const acc = accounts.find(a => a.name === d.delegator);
            const hp = vestsToHp(d.vesting_shares || 0);
            
            const tokenBal = await getHiveEngineBalance(d.delegator);
            tokenSum += tokenBal;

            const isBr = listConfig.verificado_br.includes(d.delegator);
            const isTrail = CURATION_TRAIL_USERS.includes(d.delegator);
            
            if ((isBr || d.delegator === 'hive-br') && parseFloat(hp) > 0) {
                activeBraziliansCount++;
            }

            return {
                delegator: d.delegator,
                delegated_hp: parseFloat(hp),
                total_account_hp: acc ? parseFloat(vestsToHp(acc.vesting_shares)) + parseFloat(vestsToHp(acc.received_vesting_shares)) : 0,
                last_user_post: acc ? acc.last_post : null,
                next_withdrawal: acc ? acc.next_vesting_withdrawal : null,
                country_code: isBr ? "BR_CERT" : "BR",
                token_balance: tokenBal,
                timestamp: d.timestamp,
                last_vote_date: lastVotesMap[d.delegator] || null,
                votes_month: 0,
                in_curation_trail: isTrail
            };
        }));

        processedList.sort((a, b) => b.delegated_hp - a.delegated_hp);
        fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(processedList, null, 2));

        // 5. Meta Data
        const projectAcc = accounts.find(a => a.name === PROJECT_ACCOUNT) || await hiveCall("condenser_api.get_accounts", [[PROJECT_ACCOUNT]]).then(r => r[0]);
        const projectHp = projectAcc ? parseFloat(vestsToHp(projectAcc.vesting_shares)) : 0;
        const totalDelegatedHp = processedList.reduce((acc, curr) => acc + curr.delegated_hp, 0);
        const activeMembers = processedList.filter(d => d.delegated_hp > 0).length;

        const metaData = {
            last_updated: new Date().toISOString(),
            data_source: sourceUsed,
            total_delegators: activeMembers,
            total_hp: totalDelegatedHp,
            project_account_hp: projectHp,
            total_hbr_staked: tokenSum,
            curation_trail_count: CURATION_TRAIL_USERS.length,
            active_community_members: new Set([...delegations.map(d => d.delegator), ...CURATION_TRAIL_USERS]).size,
            votes_24h: votes24h,
            vote_history_named: historyMap,
            votes_month_current: historyMap[curLabel] || 0,
            votes_month_prev1: historyMap[getMonthLabel(d1)] || 0,
            votes_month_prev2: historyMap[getMonthLabel(d2)] || 0
        };

        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

        // 6. Global History
        let globalHistory = {};
        if (fs.existsSync(GLOBAL_HISTORY_FILE)) {
            try { globalHistory = JSON.parse(fs.readFileSync(GLOBAL_HISTORY_FILE)); } catch (e) {}
        }
        
        const todayKey = new Date().toISOString().split('T')[0];
        globalHistory[todayKey] = {
            total_votes: historyMap[curLabel] || 0,
            trail_count: CURATION_TRAIL_USERS.length,
            active_brazilians: activeBraziliansCount,
            total_hp: parseFloat((totalDelegatedHp + projectHp).toFixed(2)),
            active_members: activeMembers
        };
        const sortedHistory = Object.keys(globalHistory).sort().reduce((obj, key) => { obj[key] = globalHistory[key]; return obj; }, {});
        fs.writeFileSync(GLOBAL_HISTORY_FILE, JSON.stringify(sortedHistory, null, 2));
        
        console.log("✅ Dados atualizados com sucesso!");
    } catch (err) {
        console.error("❌ Erro fatal:", err);
        process.exit(1);
    }
})();
