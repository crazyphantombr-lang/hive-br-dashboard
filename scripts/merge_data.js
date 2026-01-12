/**
 * Script: Merge Data & update Meta
 * Version: 2.24.2 (Global History)
 * Description: Merges current ranking with history and SAVES daily global stats (votes, trail, active BRs) for future reports.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");
const META_FILE = path.join(DATA_DIR, "meta.json");
const LISTS_FILE = path.join(DATA_DIR, "lists.json");
const GLOBAL_HISTORY_FILE = path.join(DATA_DIR, "global_history.json"); // Novo Arquivo

function readJsonSafe(filepath, fallbackValue) {
    if (!fs.existsSync(filepath)) return fallbackValue;
    try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); } 
    catch (e) { return fallbackValue; }
}

async function run() {
    try {
        console.log("🔄 Iniciando fusão de dados e histórico global...");

        // 1. Carregar Dados
        const currentData = readJsonSafe(CURRENT_FILE, { ranking: [] });
        let history = readJsonSafe(HISTORY_FILE, {});
        let meta = readJsonSafe(META_FILE, {});
        const lists = readJsonSafe(LISTS_FILE, { 
            verificado_br: [], watchlist: [], curation_trail: [] 
        });

        const ranking = Array.isArray(currentData) ? currentData : (currentData.ranking || []);
        const todayKey = new Date().toISOString().split('T')[0];

        // 2. Atualizar Histórico Individual (HP por usuário)
        ranking.forEach(user => {
            const username = user.delegator;
            const hp = user.delegated_hp;

            if (!history[username]) history[username] = {};
            
            // Otimização: Salva apenas se mudar ou se for dia 1º ou 15 (para economizar espaço)
            // Mas para o MVP de 30 dias funcionar perfeito, idealmente salvamos todo dia se tiver mudança
            history[username][todayKey] = hp;
        });

        // 3. Calcular Métricas Globais (Recálculo fresco)
        const totalHp = ranking.reduce((acc, user) => acc + (user.delegated_hp || 0), 0);
        
        // Membros Ativos = Delegadores + Trilha (sem duplicatas)
        const delegatorsSet = new Set(ranking.map(u => u.delegator));
        const trailSet = new Set(lists.curation_trail || []);
        const allMembers = new Set([...delegatorsSet, ...trailSet]);
        
        // Brasileiros Ativos (Intersecção: (Delegadores OU Trilha OU Watchlist) E (Postou nos últimos 30d))
        // Nota: O script fetch_delegations.js já deve ter populado 'last_user_post' no ranking.
        // Se o usuário está na Watchlist mas não é delegador, ele não aparece no ranking.json normalmente.
        // *Melhoria Futura*: Ter um arquivo separado de 'atividade_social'. 
        // Por hora, contamos Brasileiros que são Delegadores E postaram.
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
        
        // Lista oficial de BRs (Verificados + Pendentes + Watchlist)
        const allBrazilians = new Set([
            ...(lists.verificado_br || []), 
            ...(lists.pendente_br || []),
            ...(lists.watchlist || []) // Watchlist assume interesse/potencial BR
        ]);

        let activeBrasiliansCount = 0;
        
        // Verifica atividade no Ranking (Delegadores)
        ranking.forEach(user => {
            if (allBrazilians.has(user.delegator)) {
                if (user.last_user_post) {
                    const lastPostDate = new Date(user.last_user_post);
                    if (lastPostDate >= oneMonthAgo) {
                        activeBrasiliansCount++;
                    }
                }
            }
        });

        // Atualiza Meta
        meta.last_updated = new Date().toISOString();
        meta.total_hp = totalHp;
        meta.active_community_members = allMembers.size;
        meta.curation_trail_count = trailSet.size;
        meta.active_brazilians = activeBrasiliansCount; 
        // votes_month_current e votes_24h vêm do script de votos (fetch_votes.js), não alteramos aqui

        // 4. SALVAR HISTÓRICO GLOBAL (NOVIDADE)
        let globalHistory = readJsonSafe(GLOBAL_HISTORY_FILE, {});
        
        globalHistory[todayKey] = {
            total_votes: meta.votes_month_current || 0,
            trail_count: meta.curation_trail_count || 0,
            active_brazilians: meta.active_brazilians || 0,
            total_hp: Math.floor(meta.total_hp || 0),
            active_members: meta.active_community_members || 0
        };

        // 5. Escrever Arquivos
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2)); // Histórico Individual
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));       // Meta Atual
        fs.writeFileSync(GLOBAL_HISTORY_FILE, JSON.stringify(globalHistory, null, 2)); // Histórico Global

        console.log(`✅ Dados fundidos com sucesso.`);
        console.log(`📊 Snapshot Global salvo para ${todayKey}: ${meta.active_brazilians} BRs Ativos, ${meta.curation_trail_count} na Trilha.`);

    } catch (error) {
        console.error("❌ Erro no merge:", error);
        process.exit(1);
    }
}

run();
