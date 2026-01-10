/**
 * Script: Merge History
 * Version: 1.3.0 (Compatibility Update)
 * Description: Merges current ranking data into historical registry. Supports new object format.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");

function run() {
    console.log("🔄 Atualizando histórico...");

    if (!fs.existsSync(CURRENT_FILE)) {
        console.error("❌ Erro: current.json não encontrado.");
        process.exit(1);
    }

    const rawCurrent = JSON.parse(fs.readFileSync(CURRENT_FILE, "utf8"));
    let currentList = [];

    // Detecção Inteligente de Formato
    if (Array.isArray(rawCurrent)) {
        currentList = rawCurrent;
    } else if (rawCurrent.ranking && Array.isArray(rawCurrent.ranking)) {
        currentList = rawCurrent.ranking;
    } else {
        console.error("❌ Erro: Formato de current.json inválido.");
        process.exit(1);
    }

    let history = {};
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
        } catch (e) {
            console.warn("⚠️ Histórico corrompido, reiniciando...");
            history = {};
        }
    }

    const today = new Date().toISOString().split("T")[0];

    currentList.forEach(entry => {
        const username = entry.delegator || entry.username;
        const hp = entry.delegated_hp || entry.hp_equivalent || 0;

        if (!history[username]) {
            history[username] = {};
        }
        history[username][today] = parseFloat(hp.toFixed(3));
    });

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    console.log(`✅ Histórico atualizado para ${today}.`);
}

run();
