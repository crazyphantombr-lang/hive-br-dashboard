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

    // 1. Carrega dados atuais (com suporte a formatos antigo/novo)
    const rawCurrent = JSON.parse(fs.readFileSync(CURRENT_FILE, "utf8"));
    let currentList = [];

    if (Array.isArray(rawCurrent)) {
        // Formato Legado: [...]
        currentList = rawCurrent;
    } else if (rawCurrent.ranking && Array.isArray(rawCurrent.ranking)) {
        // Novo Formato v2.23.0: { "ranking": [...], "updated_at": "..." }
        currentList = rawCurrent.ranking;
    } else {
        console.error("❌ Erro: Formato de current.json inválido.");
        process.exit(1);
    }

    // 2. Carrega histórico existente
    let history = {};
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
        } catch (e) {
            console.warn("⚠️ Histórico corrompido, reiniciando...");
            history = {};
        }
    }

    // 3. Define a data de hoje (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];

    // 4. Mescla os dados
    // Para cada usuário no ranking atual, adiciona/atualiza a entrada de hoje no histórico dele
    currentList.forEach(entry => {
        const username = entry.delegator || entry.username;
        const hp = entry.delegated_hp || entry.hp_equivalent || 0;

        // Se o usuário não tem histórico, cria objeto vazio
        if (!history[username]) {
            history[username] = {};
        }

        // Grava o HP de hoje
        history[username][today] = parseFloat(hp.toFixed(3));
    });

    // 5. Limpeza (Opcional): Remove usuários que não delegam nada há muito tempo?
    // Por enquanto, mantemos tudo para preservar a história.

    // 6. Salva
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    console.log(`✅ Histórico atualizado para ${today}.`);
}

run();
