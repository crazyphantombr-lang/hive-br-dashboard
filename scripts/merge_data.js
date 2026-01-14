/**
 * Script: Merge Data & Vaccine
 * Version: 2.25.10 (Healing: Hard Expunge 14/01)
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
        console.log("🔄 Executando Sanitização v2.25.10...");

        const ranking = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
        const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
        const lists = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : {};

        // --- VACINA: REMOVER DEFINITIVAMENTE O DIA CORROMPIDO ---
        const poisonDate = "2026-01-14";
        let cleanedCount = 0;
        Object.keys(history).forEach(user => {
            if (history[user][poisonDate] !== undefined) {
                delete history[user][poisonDate];
                cleanedCount++;
            }
        });
        console.log(`🧹 Sanitização: ${cleanedCount} entradas de ${poisonDate} removidas.`);

        const todayKey = new Date().toISOString().split('T')[0];
        
        // Registrar novo snapshot se houver dados reais
        const currentTotalHp = ranking.reduce((acc, u) => acc + (u.delegated_hp || 0), 0);
        if (currentTotalHp > 0 && todayKey !== poisonDate) {
            ranking.forEach(user => {
                if (!history[user.delegator]) history[user.delegator] = {};
                history[user.delegator][todayKey] = user.delegated_hp;
            });
        }

        // Contagem de Brasileiros Ativos
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
        const brList = new Set([...(lists.verificado_br || []), ...(lists.pendente_br || []), ...(lists.watchlist || [])]);

        let activeBrCount = 0;
        ranking.forEach(user => {
            if (brList.has(user.delegator) && user.last_user_post && new Date(user.last_user_post) >= oneMonthAgo) {
                activeBrCount++;
            }
        });

        meta.active_brazilians = activeBrCount;
        meta.total_hp = currentTotalHp + meta.project_account_hp;

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

        console.log(`✅ Integridade restaurada. Brasileiros ativos: ${activeBrCount}`);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
