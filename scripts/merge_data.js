/**
 * Script: Merge Data & History
 * Version: 2.25.5 (Stability Sync)
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
        console.log("🔄 Executando Fusão de Dados v2.25.5...");

        const ranking = readJsonSafe(CURRENT_FILE, []);
        let history = readJsonSafe(HISTORY_FILE, {});
        let meta = readJsonSafe(META_FILE, {});
        const lists = readJsonSafe(CONFIG_PATH, { verificado_br: [], pendente_br: [], watchlist: [] });

        const todayKey = new Date().toISOString().split('T')[0];

        // 1. Snapshot Histórico
        ranking.forEach(user => {
            const username = user.delegator;
            const hp = user.delegated_hp || 0;
            if (!history[username]) history[username] = {};
            history[username][todayKey] = hp;
        });

        // 2. Contagem de Brasileiros Ativos (Regra 30 dias)
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

        // 3. Atualizar Meta Global
        const totalHp = ranking.reduce((acc, u) => acc + (u.delegated_hp || 0), 0);
        meta.last_updated = new Date().toISOString();
        meta.total_hp = totalHp;
        meta.active_brazilians = activeBrCount;

        // 4. Salvar Snapshots
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
        
        let globalHistory = readJsonSafe(GLOBAL_HISTORY_FILE, {});
        globalHistory[todayKey] = {
            active_brazilians: activeBrCount,
            total_hp: Math.floor(totalHp)
        };
        fs.writeFileSync(GLOBAL_HISTORY_FILE, JSON.stringify(globalHistory, null, 2));

        console.log(`✅ Sucesso. Versão 2.25.5 estável.`);

    } catch (error) {
        console.error("Erro no Merge:", error);
        process.exit(1);
    }
}

run();
