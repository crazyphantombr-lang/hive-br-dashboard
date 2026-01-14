/**
 * Script: Merge Data & History
 * Version: 2.25.7 (Healing: History Cleanup)
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CONFIG_PATH = path.join("config", "lists.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");
const META_FILE = path.join(DATA_DIR, "meta.json");

async function run() {
    try {
        console.log("🔄 Executando Fusão e Limpeza de Histórico v2.25.7...");

        const ranking = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
        let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : {};
        const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
        const lists = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

        // --- FUNÇÃO DE LIMPEZA EMERGENCIAL ---
        // Remove a entrada "2026-01-14" que foi corrompida com zeros
        const corruptedDate = "2026-01-14";
        Object.keys(history).forEach(user => {
            if (history[user][corruptedDate] !== undefined) {
                delete history[user][corruptedDate];
            }
        });
        console.log(`🧹 Histórico limpo: Entrada ${corruptedDate} removida.`);

        const todayKey = new Date().toISOString().split('T')[0];
        
        // Atualizar histórico com valores válidos
        ranking.forEach(user => {
            if (!history[user.delegator]) history[user.delegator] = {};
            history[user.delegator][todayKey] = user.delegated_hp;
        });

        // Contagem de Brasileiros Ativos
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
        const brList = new Set([
            ...(lists.verificado_br || []), 
            ...(lists.pendente_br || []),
            ...(lists.watchlist || [])
        ]);

        let activeBrCount = 0;
        ranking.forEach(user => {
            if (brList.has(user.delegator) && user.last_user_post) {
                if (new Date(user.last_user_post) >= oneMonthAgo) activeBrCount++;
            }
        });

        meta.total_hp = ranking.reduce((acc, u) => acc + (u.delegated_hp || 0), 0) + meta.project_account_hp;
        meta.active_brazilians = activeBrCount;
        meta.curation_trail_count = (lists.curation_trail || []).length;

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

        console.log(`✅ Restauração Completa. Ativos: ${activeBrCount}`);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
