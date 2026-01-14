/**
 * Script: Merge Data & History
 * Version: 2.25.8 (History Healing & Safety Traps)
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
        console.log("🔄 Executando Fusão e Limpeza de Histórico v2.25.8...");

        const ranking = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
        const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
        const lists = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        
        let history = {};
        if (fs.existsSync(HISTORY_FILE)) {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        }

        // --- FUNÇÃO DE LIMPEZA (DELETAR ENTRADA PREMATURA/CORROMPIDA) ---
        const badDate = "2026-01-14";
        Object.keys(history).forEach(user => {
            if (history[user] && history[user][badDate] !== undefined) {
                delete history[user][badDate];
            }
        });

        // --- TRAVA DE SEGURANÇA ---
        // Só salva o snapshot de hoje se o HP total for significativo (evita apagar histórico por erro de RPC)
        const currentTotalHp = ranking.reduce((acc, u) => acc + (u.delegated_hp || 0), 0);
        
        if (currentTotalHp > 0) {
            const todayKey = new Date().toISOString().split('T')[0];
            ranking.forEach(user => {
                if (!history[user.delegator]) history[user.delegator] = {};
                history[user.delegator][todayKey] = user.delegated_hp;
            });
            console.log(`✅ Snapshot de ${todayKey} registrado com ${Math.floor(currentTotalHp)} HP.`);
        } else {
            console.warn("⚠️ Coleta retornou ZERO HP. Snapshot ignorado para proteger o histórico.");
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
        meta.curation_trail_count = (lists.curation_trail || []).length;
        meta.total_hp = currentTotalHp > 0 ? (currentTotalHp + meta.project_account_hp) : meta.total_hp;

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

        console.log(`✅ Restauração finalizada. Histórico limpo.`);
    } catch (e) {
        console.error("Erro no Merge:", e);
        process.exit(1);
    }
}
run();
