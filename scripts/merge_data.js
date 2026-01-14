/**
 * Script: Merge Data & Vaccine
 * Version: 2.25.13 (Healing: Hard Expunge 14/01)
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CONFIG_PATH = path.join("config", "lists.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");

async function run() {
    try {
        console.log("🔄 Executando Sanitização v2.25.13...");

        const ranking = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
        let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : {};

        // --- VACINA: REMOVER DEFINITIVAMENTE O DIA CORROMPIDO DO RANKING ---
        const poisonDate = "2026-01-14";
        let cleanedCount = 0;
        Object.keys(history).forEach(user => {
            if (history[user][poisonDate] !== undefined) {
                delete history[user][poisonDate];
                cleanedCount++;
            }
        });
        console.log(`🧹 Sanitização: ${cleanedCount} entradas de delegadores para ${poisonDate} removidas.`);

        const todayKey = new Date().toISOString().split('T')[0];
        const currentTotalHp = ranking.reduce((acc, u) => acc + (u.delegated_hp || 0), 0);

        // Snapshot individual: Só grava se HP total > 0 e se não for a data proibida (UTC)
        if (currentTotalHp > 0 && todayKey !== poisonDate) {
            ranking.forEach(user => {
                if (!history[user.delegator]) history[user.delegator] = {};
                history[user.delegator][todayKey] = user.delegated_hp;
            });
            console.log(`✅ Snapshots individuais atualizados para ${todayKey}.`);
        }

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`✅ Ranking History restaurado.`);
    } catch (e) {
        console.error("Erro no Merge:", e);
        process.exit(1);
    }
}
run();
