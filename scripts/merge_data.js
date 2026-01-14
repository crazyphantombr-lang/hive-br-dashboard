/**
 * Script: Merge Data & History
 * Version: 2.25.4 (Inclusive Active BR Rule) - ESTÁVEL
 * Author: Hive BR
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CONFIG_PATH = path.join("config", "lists.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");
const META_FILE = path.join(DATA_DIR, "meta.json");
const GLOBAL_HISTORY_FILE = path.join(DATA_DIR, "global_history.json");

function readJsonSafe(filepath, fallbackValue) {
    if (!fs.existsSync(filepath)) return fallbackValue;
    try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); } 
    catch (e) { return fallbackValue; }
}

async function run() {
    try {
        console.log("🔄 Fusão de Dados v2.25.4...");
        const ranking = readJsonSafe(CURRENT_FILE, []);
        let history = readJsonSafe(HISTORY_FILE, {});
        let meta = readJsonSafe(META_FILE, {});
        const lists = readJsonSafe(CONFIG_PATH, { verificado_br: [], pendente_br: [], watchlist: [] });

        const todayKey = new Date().toISOString().split('T')[0];
        ranking.forEach(user => {
            if (!history[user.delegator]) history[user.delegator] = {};
            history[user.delegator][todayKey] = user.delegated_hp || 0;
        });

        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
        const allBrUsernames = new Set([...(lists.verificado_br || []), ...(lists.pendente_br || []), ...(lists.watchlist || [])]);

        let activeBrCount = 0;
        ranking.forEach(user => {
            if (allBrUsernames.has(user.delegator) && user.last_user_post) {
                if (new Date(user.last_user_post) >= oneMonthAgo) activeBrCount++;
            }
        });

        const totalHp = ranking.reduce((acc, u) => acc + (u.delegated_hp || 0), 0);
        meta.total_hp = totalHp + (meta.project_account_hp || 0);
        meta.active_brazilians = activeBrCount;
        meta.curation_trail_count = (lists.curation_trail || []).length;

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
        console.log(`✅ Sucesso. ${activeBrCount} brasileiros ativos detectados.`);
    } catch (error) {
        console.error("Erro no merge:", error);
        process.exit(1);
    }
}
run();
