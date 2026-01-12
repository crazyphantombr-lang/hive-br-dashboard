/**
 * Script: Fetch Delegations & Merge Data
 * Version: 2.10.1 (Vote Count Fix)
 * Description: Fetches delegations and CORRECTLY maps 'votes_month' count to the final JSON.
 */

const fs = require("fs");
const path = require("path");

// --- CONFIG ---
const HIVE_ACCOUNT = "hive-br"; 
const HIVE_API_URL = "https://api.hive.blog";
const IGNORE_LIST = ["ptgram-power", "tipu", "bdvoter.cur"]; 

// --- PATHS ---
const DATA_DIR = "data";
const LISTS_FILE = path.join(DATA_DIR, "lists.json");
const VOTES_FILE = path.join(DATA_DIR, "votes_stats.json"); // Arquivo gerado pelo fetch_votes.js
const POSTS_FILE = path.join(DATA_DIR, "posts_stats.json"); // Arquivo gerado pelo fetch_posts.js
const OUTPUT_FILE = path.join(DATA_DIR, "current.json");

// Helper: Read JSON safely
function readJsonSafe(filepath, fallbackValue) {
    if (!fs.existsSync(filepath)) return fallbackValue;
    try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); } 
    catch (e) { return fallbackValue; }
}

async function fetchDelegations() {
    console.log(`🐝 Buscando delegações para @${HIVE_ACCOUNT}...`);
    
    const payload = {
        jsonrpc: "2.0",
        method: "condenser_api.get_vesting_delegations",
        params: [HIVE_ACCOUNT, "", 1000],
        id: 1
    };

    try {
        const response = await fetch(HIVE_API_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();
        if (!data.result) throw new Error("Falha na API Hive");

        // 1. Carregar bases locais
        const lists = readJsonSafe(LISTS_FILE, { verificado_br: [], watchlist: [], curation_trail: [] });
        const votesData = readJsonSafe(VOTES_FILE, {}); // { username: { last_vote: 'date', count: 5 } }
        const postsData = readJsonSafe(POSTS_FILE, {}); // { username: { last_post: 'date' } }

        // 2. Processar Delegações
        const delegations = data.result
            .filter(d => !IGNORE_LIST.includes(d.delegator))
            .map(d => {
                const vestingShares = parseFloat(d.vesting_shares);
                // Conversão aproximada VESTS -> HP (Idealmente buscar global_properties, mas hardcoded para estabilidade do script simples)
                // 1 MHV (Million Hive Vests) ~= 530 HP (Valor flutuante, ajustável)
                // Melhor: Usar um fator fixo ou buscar dinamicamente. Vamos manter a lógica crua dos Vests por enquanto ou converter se tivermos o fator.
                // Para simplificar e não quebrar o layout que espera HP:
                // Vamos assumir que o script anterior já fazia a conversão ou usar um fator médio atual (~2000 vests = 1 HP aprox, precisa checar).
                // *Nota:* O script antigo usava uma API auxiliar ou fator fixo? 
                // Vamos usar a API 'get_dynamic_global_properties' para ser preciso.
                return { ...d, vests: vestingShares };
            });

        // 2.1 Buscar Fator de Conversão VESTS -> HP
        const propsRes = await fetch(HIVE_API_URL, {
            method: "POST",
            body: JSON.stringify({ jsonrpc: "2.0", method: "condenser_api.get_dynamic_global_properties", params: [], id: 2 }),
            headers: { "Content-Type": "application/json" }
        });
        const propsData = await propsRes.json();
        const totalVestingFund = parseFloat(propsData.result.total_vesting_fund_hive);
        const totalVestingShares = parseFloat(propsData.result.total_vesting_shares);
        const vestToHp = totalVestingFund / totalVestingShares;

        // 3. Montar Ranking Final
        const ranking = delegations.map(user => {
            const hp = user.vests * vestToHp;
            const username = user.delegator;
            
            // Cruzamento de Dados
            let countryCode = null;
            if (lists.verificado_br.includes(username)) countryCode = "BR_CERT";
            else if (lists.pendente_br && lists.pendente_br.includes(username)) countryCode = "BR";
            else if (lists.verificado_pt && lists.verificado_pt.includes(username)) countryCode = "PT_CERT";

            // Dados de Votos (A CORREÇÃO ESTÁ AQUI)
            const voteInfo = votesData[username] || {};
            
            // Dados de Posts
            const postInfo = postsData[username] || {};

            return {
                delegator: username,
                delegated_hp: hp, // Valor exato
                timestamp: user.min_delegation_time, // Data da delegação
                total_account_hp: 0, // O script fetch_accounts.js preenche isso depois
                token_balance: 0,    // O script fetch_accounts.js preenche isso depois
                next_withdrawal: "1969-12-31T23:59:59", // Placeholder
                
                // --- DADOS ENRIQUECIDOS ---
                country_code: countryCode,
                in_curation_trail: lists.curation_trail.includes(username),
                last_user_post: postInfo.last_post || "1970-01-01T00:00:00",
                
                // --- FIX DE VOTOS ---
                last_vote_date: voteInfo.last_vote || null,
                votes_month: voteInfo.count || 0 // <--- CAMPO NOVO ESSENCIAL
            };
        });

        // Ordenar por HP
        ranking.sort((a, b) => b.delegated_hp - a.delegated_hp);

        const output = {
            updated_at: new Date().toISOString(),
            ranking: ranking
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log(`✅ ${ranking.length} delegações processadas e salvas em current.json`);

    } catch (error) {
        console.error("❌ Erro fatal:", error);
        process.exit(1);
    }
}

fetchDelegations();
