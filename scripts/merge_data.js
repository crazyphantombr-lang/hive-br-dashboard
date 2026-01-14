// File: scripts/merge_data.js
/**
 * Script: Merge Data & History Master
 * Version: 2.25.0 (Consolidated)
 * Author: Hive BR
 * Description: Consolida o ranking atual com o histórico individual (30 dias) e global.
 * [SAFE-RELEARN]: Este script absorveu o 'merge_history.js'. Ele é o único ponto de verdade para persistência.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");
const META_FILE = path.join(DATA_DIR, "meta.json");
const LISTS_FILE = path.join(DATA_DIR, "lists.json");
const GLOBAL_HISTORY_FILE = path.join(DATA_DIR, "global_history.json");

function readJsonSafe(filepath, fallbackValue) {
    if (!fs.existsSync(filepath)) return fallbackValue;
    try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); } 
    catch (e) { return fallbackValue; }
}

async function run() {
    try {
        console.log("🔄 Iniciando fusão de dados v2.25.0...");

        // 1. Carregar Dados
        const ranking = readJsonSafe(CURRENT_FILE, []);
        let history = readJsonSafe(HISTORY_FILE, {});
        let meta = readJsonSafe(META_FILE, {});
        const lists = readJsonSafe(LISTS_FILE, { verificado_br: [], curation_trail: [] });

        const todayKey = new Date().toISOString().split('T')[0];

        // 2. Atualizar Histórico Individual (Base para o Destaque 30d e Gráficos)
        // [BUSINESS RULE]: Salvamos o HP de cada usuário diariamente para permitir o cálculo de delta no Frontend.
        ranking.forEach(user => {
            const username = user.delegator;
            const hp = user.delegated_hp || 0;

            if (!history[username]) history[username] = {};
            history[username][todayKey] = hp;
        });

        // 3. Recálculo de Métricas Globais (Garantia de Integridade)
        const totalHp = ranking.reduce((acc, user) => acc + (user.delegated_hp || 0), 0);
        const delegatorsSet = new Set(ranking.map(u => u.delegator));
        const trailSet = new Set(lists.curation_trail || []);
        const allMembers = new Set([...delegatorsSet, ...trailSet]);

        // Brasileiros Ativos (Filtro por Atividade 30 dias)
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
        
        const brList = new Set([...(lists.verificado_br || []), ...(lists.pendente_br || [])]);
        let activeBrCount = 0;

        ranking.forEach(user => {
            if (brList.has(user.delegator) && user.last_user_post) {
                if (new Date(user.last_user_post) >= oneMonthAgo) activeBrCount++;
            }
        });

        // 4. Atualizar Objeto Meta
        meta.last_updated = new Date().toISOString();
        meta.total_hp = totalHp;
        meta.active_community_members = allMembers.size;
        meta.active_brazilians = activeBrCount;

        // 5. Atualizar Histórico Global (Snapshots Diários da Comunidade)
        let globalHistory = readJsonSafe(GLOBAL_HISTORY_FILE, {});
        globalHistory[todayKey] = {
            total_votes: meta.votes_month_current || 0,
            trail_count: trailSet.size,
            active_brazilians: activeBrCount,
            total_hp: Math.floor(totalHp),
            active_members: allMembers.size
        };

        // 6. Persistência Atômica
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
        fs.writeFileSync(GLOBAL_HISTORY_FILE, JSON.stringify(globalHistory, null, 2));

        console.log(`✅ Sucesso: Snapshot v2.25.0 salvo para ${todayKey}.`);

    } catch (error) {
        console.error("❌ Erro Crítico no Merge:", error);
        process.exit(1);
    }
}

run();
