/**
 * Script: Merge Data & Vaccine
 * Version: 2.25.14 (Healing: Hard Expunge 14/01)
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");

async function run() {
    try {
        if (!fs.existsSync(CURRENT_FILE)) return;
        const ranking = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
        let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : {};

        // VACINA: Deletar 14/01 corrompido em todos os usuários
        const poisonDate = "2026-01-14";
        Object.keys(history).forEach(user => {
            if (history[user][poisonDate] !== undefined) delete history[user][poisonDate];
        });

        const todayKey = new Date().toISOString().split('T')[0];
        const currentTotalHp = ranking.reduce((acc, u) => acc + (u.delegated_hp || 0), 0);

        // Snapshot individual: Só grava se HP total for real e não for a data proibida (UTC)
        if (currentTotalHp > 1000 && todayKey !== poisonDate) {
            ranking.forEach(user => {
                if (!history[user.delegator]) history[user.delegator] = {};
                history[user.delegator][todayKey] = user.delegated_hp;
            });
        }

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`✅ Histórico Individual limpo e atualizado.`);
    } catch (e) {
        console.error("Erro no Merge:", e);
        process.exit(1);
    }
}
run();
