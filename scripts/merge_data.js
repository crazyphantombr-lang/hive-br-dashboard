/**
 * Script: Merge Data & History
 * Version: 2.25.6 (Integrity Sync)
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CONFIG_PATH = path.join("config", "lists.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const META_FILE = path.join(DATA_DIR, "meta.json");

async function run() {
    try {
        const ranking = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
        const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
        const lists = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

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

        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
        console.log(`✅ Fusão v2.25.6 concluída: ${activeBrCount} ativos.`);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
