/**
 * Script: Merge Data & Vaccine
 * Version: 2.25.12 (Healing & Integrity Guard)
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");
const META_FILE = path.join(DATA_DIR, "meta.json");

async function run() {
    try {
        console.log("🔄 Executando Sanitização v2.25.12...");

        const ranking = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
        const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
        let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : {};

        // --- VACINA: REMOVER DIA CORROMPIDO (14/01) ---
        const poisonDate = "2026-01-14";
        Object.keys(history).forEach(user => {
            if (history[user][poisonDate] !== undefined) delete history[user][poisonDate];
        });
        console.log(`🧹 Sanitização concluída para ${poisonDate}.`);

        // --- GRAVAR NOVO SNAPSHOT ---
        // Apenas se o HP total detectado for maior que 0
        if (meta.total_hp > 0) {
            const todayKey = new Date().toISOString().split('T')[0];
            // Impedir que o servidor salve zeros se estiver em UTC e for dia 14
            if (todayKey !== poisonDate) {
                ranking.forEach(user => {
                    if (!history[user.delegator]) history[user.delegator] = {};
                    history[user.delegator][todayKey] = user.delegated_hp;
                });
                console.log(`✅ Snapshot salvo para ${todayKey}.`);
            }
        } else {
            console.warn("⚠️ HP total é ZERO. Snapshot ignorado para proteger o histórico.");
        }

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

        console.log("✅ Fusão de dados finalizada.");
    } catch (e) {
        console.error("❌ Erro no Merge:", e.message);
        process.exit(1);
    }
}
run();
