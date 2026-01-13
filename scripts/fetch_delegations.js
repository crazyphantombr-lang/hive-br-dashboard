/**
 * Script: Fetch Delegations & Community Stats
 * Version: 2.22.0 (Feature: Global History + Unfreeze Fix)
 * Author: Hive BR
 * License: MIT
 * * Changelog:
 * - Adicionado salvamento de histórico global diário (data/global_history.json).
 * - Hotfix: Forçada atualização de 'last_vote_date' cruzando dados em tempo real.
 * - Adicionado contador de 'active_brazilians'.
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// --- CONFIGURAÇÕES ---
const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";
// Aumentei o limite para garantir que pegamos votos recentes mesmo em dias movimentados
const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming?limit=500`; 
const RPC_NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network"];
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
                timeout: 5000
            });
            const json = await response.json();
            if (json.result) return json.result;
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
    console.log(`🚀 Iniciando Hive BR Dashboard Backend v2.22.0...`);
    
    try {
        // 1. Obter Cotação VESTS -> HP
        const props = await hiveCall("condenser_api.get_dynamic_global_properties", []);
        const totalVests = parseFloat(props.total_vesting_shares);
        const totalFund = parseFloat(props.total_vesting_fund_hive);
        const vestsToHp = (vests) => (parseFloat(vests) * totalFund / totalVests).toFixed(3);

        // 2. Obter Delegações (HAFSQL)
        const res = await fetch(HAF_API);
        const hafdata = await res.json();
        let delegations = hafdata || [];

        // Adiciona usuários da watchlist se não estiverem na lista
        FIXED_USERS.forEach(u => {
            if (!delegations.find(d => d.delegator === u)) {
                delegations.push({ delegator: u, vesting_shares: 0, timestamp: null });
            }
        });

        // 3. Obter Histórico de Votos RECENTES (Para corrigir o 'last_vote_date')
        // Buscamos o histórico da conta votante para saber quem ela votou recentemente
        const voterHistory = await hiveCall("condenser_api.get_account_history", [VOTER_ACCOUNT, -1, 1000]);
        const lastVotesMap = {}; // Mapa: usuario -> data_ultimo_voto
        const now = new Date();
        const oneMonthAgo = new Date(); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        let votes24h = 0;
        let historyMap = {}; 

        // Inicializa chaves de histórico (Mês Atual e Anteriores)
        const curLabel = getMonthLabel(new Date());
        historyMap[curLabel] = 0;
        const d1 = new Date(); d1.setMonth(d1.getMonth() - 1);
        historyMap[getMonthLabel(d1)] = 0;
        const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);
        historyMap[getMonthLabel(d2)] = 0;

        const time24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        // Processa histórico de votos
        voterHistory.forEach(tx => {
            const op = tx[1].op;
            const timestamp = tx[1].timestamp + "Z"; // UTC
            const txDate = new Date(timestamp);

            if (op[0] === 'vote' && op[1].voter === VOTER_ACCOUNT) {
                const votedUser = op[1].author;
                
                // Mapeia o último voto para cada usuário
                if (!lastVotesMap[votedUser] || new Date(lastVotesMap[votedUser]) < txDate) {
                    lastVotesMap[votedUser] = timestamp;
                }

                // Estatísticas
                if (txDate >= time24h) votes24h++;
                
                // Agrupa por Mês (Janeiro 2026, etc)
                const label = getMonthLabel(txDate);
                if (!historyMap[label]) historyMap[label] = 0;
                historyMap[label]++;
            }
        });

        // 4. Detalhes das Contas (Batch RPC) e Construção do JSON
        const accounts = await hiveCall("condenser_api.get_accounts", [delegations.map(d => d.delegator)]);
        let tokenSum = 0;
        let activeBraziliansCount = 0; // Novo contador

        const processedList = await Promise.all(delegations.map(async (d) => {
            const acc = accounts.find(a => a.name === d.delegator);
            const hp = vestsToHp(d.vesting_shares || 0);
            
            // Saldo HBR
            const tokenBal = await getHiveEngineBalance(d.delegator);
            tokenSum += tokenBal;

            // Flags
            const isBr = listConfig.verificado_br.includes(d.delegator);
            const isTrail = CURATION_TRAIL_USERS.includes(d.delegator);
            
            // Contagem de Brasileiros Ativos (Com delegação > 0 ou na lista fixa)
            if ((isBr || d.delegator === 'hive-br') && parseFloat(hp) > 0) {
                activeBraziliansCount++;
            }

            // --- CRÍTICO: Correção de Datas ---
            // Usa o mapa criado acima para garantir a data real do último voto
            const realLastVote = lastVotesMap[d.delegator] || null;

            return {
                delegator: d.delegator,
                delegated_hp: parseFloat(hp),
                total_account_hp: acc ? parseFloat(vestsToHp(acc.vesting_shares)) + parseFloat(vestsToHp(acc.received_vesting_shares)) : 0,
                last_user_post: acc ? acc.last_post : null, // Data nativa da blockchain
                next_withdrawal: acc ? acc.next_vesting_withdrawal : null,
                country_code: isBr ? "BR_CERT" : "BR",
                token_balance: tokenBal,
                timestamp: d.timestamp, // Data da delegação
                last_vote_date: realLastVote, // Data corrigida do voto
                votes_month: 0, // Depreciado, mantido para compatibilidade
                in_curation_trail: isTrail
            };
        }));

        // Ordena por HP Delegado
        processedList.sort((a, b) => b.delegated_hp - a.delegated_hp);

        // Salva current.json
        fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(processedList, null, 2));

        // 5. Dados do Projeto (HP Próprio)
        const projectAcc = await hiveCall("condenser_api.get_accounts", [[PROJECT_ACCOUNT]]);
        const projectHp = projectAcc.length ? parseFloat(vestsToHp(projectAcc[0].vesting_shares)) : 0;

        // 6. Meta Data
        const totalDelegatedHp = processedList.reduce((acc, curr) => acc + curr.delegated_hp, 0);
        
        // Contagem de membros ativos (exclui contas zeradas que não são especiais)
        const activeMembers = processedList.filter(d => d.delegated_hp > 0).length;

        const metaData = {
            last_updated: new Date().toISOString(),
            total_delegators: activeMembers,
            total_hp: totalDelegatedHp,
            project_account_hp: projectHp,
            total_hbr_staked: tokenSum,
            curation_trail_count: CURATION_TRAIL_USERS.length,
            active_community_members: new Set([...delegations.map(d => d.delegator), ...CURATION_TRAIL_USERS]).size,
            
            votes_24h: votes24h,
            vote_history_named: historyMap, // "Janeiro 2026": 142
            
            // Legado
            votes_month_current: historyMap[curLabel] || 0,
            votes_month_prev1: historyMap[getMonthLabel(d1)] || 0,
            votes_month_prev2: historyMap[getMonthLabel(d2)] || 0
        };

        fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

        // --- 7. GLOBAL HISTORY (Novo Recurso) ---
        // Salva estatísticas diárias em formato de série temporal
        let globalHistory = {};
        if (fs.existsSync(GLOBAL_HISTORY_FILE)) {
            try {
                globalHistory = JSON.parse(fs.readFileSync(GLOBAL_HISTORY_FILE));
            } catch (e) { console.warn("Erro ao ler histórico global, criando novo."); }
        }

        // Chave do dia (YYYY-MM-DD local ou UTC, aqui usando UTC simplificado)
        const todayKey = new Date().toISOString().split('T')[0];

        globalHistory[todayKey] = {
            total_votes: historyMap[curLabel] || 0, // Votos acumulados do mês atual
            trail_count: CURATION_TRAIL_USERS.length,
            active_brazilians: activeBraziliansCount,
            total_hp: parseFloat((totalDelegatedHp + projectHp).toFixed(2)),
            active_members: activeMembers
        };

        // Mantém ordem cronológica (opcional, mas bom para JSON)
        const sortedHistory = Object.keys(globalHistory).sort().reduce((obj, key) => { 
            obj[key] = globalHistory[key]; 
            return obj;
        }, {});

        fs.writeFileSync(GLOBAL_HISTORY_FILE, JSON.stringify(sortedHistory, null, 2));
        console.log(`📅 Histórico Global salvo para: ${todayKey}`);

        console.log("✅ Dados atualizados com sucesso!");

    } catch (err) {
        console.error("❌ Erro fatal:", err);
        process.exit(1);
    }
})();
