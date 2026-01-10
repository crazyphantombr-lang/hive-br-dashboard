/**
 * Script: AI Report Generator
 * Version: 2.20.5 (Hotfix)
 * Description: Robust JSON loading. Ignores corrupted files (HTML) instead of crashing.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// --- CONFIGURAÇÕES ---
const COVER_IMAGE_URL = "https://files.peakd.com/file/peakd-hive/crazyphantombr/23tknNzYZVr2stDGwN8Sv9BpmnRmeRgcZNaC1ZhHFB1U99MTAe5qfGrcsZd4a51PPnRkZ.png";
const DISCORD_LINK = "https://discord.gg/NgfkeVJT5w";
const MODEL_NAME = "gemini-2.5-flash";

const DATA_DIR = "data";
const REPORT_DIR = "reports";
const META_FILE = path.join(DATA_DIR, "meta.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json"); 
const MONTHLY_FILE = path.join(DATA_DIR, "monthly_stats.json");   
const LISTS_FILE = path.join(DATA_DIR, "lists.json");

if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// --- FUNÇÃO DE LEITURA BLINDADA ---
function readJsonSafe(filepath, fallbackValue) {
    if (!fs.existsSync(filepath)) return fallbackValue;
    try {
        const raw = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.warn(`⚠️ AVISO: Arquivo corrompido ignorado: ${path.basename(filepath)}`);
        console.warn(`   Erro: ${e.message.slice(0, 50)}...`);
        return fallbackValue;
    }
}

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error("❌ Erro: GEMINI_API_KEY ausente."); process.exit(1); }

    // --- 1. VERIFICAÇÃO DE EXECUÇÃO ---
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isLastDay = now.getMonth() !== tomorrow.getMonth();
    const isAfternoon = now.getHours() >= 12;
    const isForced = process.env.FORCE_REPORT === "true";

    if (!isForced && (!isLastDay || !isAfternoon)) {
        console.log(`[SKIP] Script abortado. Hoje não é fechamento mensal.`);
        return;
    }

    if (isForced) console.log("⚠️ MODO MANUAL ATIVADO.");

    try {
        console.log("📂 Carregando dados de forma segura...");

        // Leitura com Fallbacks (evita crash por HTML/JSON inválido)
        const meta = readJsonSafe(META_FILE, { 
            active_community_members: 0, total_hp: 0, votes_month_current: 0, curation_trail_count: 0 
        });
        
        const rawCurrent = readJsonSafe(CURRENT_FILE, []);
        const listsData = readJsonSafe(LISTS_FILE, { new_delegators: [] });
        const dailyHistory = readJsonSafe(HISTORY_FILE, []);
        const monthlyHistory = readJsonSafe(MONTHLY_FILE, []);

        // Tratamento do Current (Array vs Objeto)
        let currentList = [];
        if (Array.isArray(rawCurrent)) {
            currentList = rawCurrent;
        } else if (rawCurrent.ranking && Array.isArray(rawCurrent.ranking)) {
            currentList = rawCurrent.ranking;
        }
        
        // Ordenação de Segurança
        currentList.sort((a, b) => (b.delegated_hp || 0) - (a.delegated_hp || 0));

        // --- 2. CÁLCULOS ANALÍTICOS ---

        // A. Comparação de 15 Dias
        let stats15DaysAgo = null;
        if (Array.isArray(dailyHistory) && dailyHistory.length >= 15) {
            stats15DaysAgo = dailyHistory[dailyHistory.length - 15];
        }

        // B. Comparação Mês Anterior
        const lastMonthStats = (Array.isArray(monthlyHistory) && monthlyHistory.length >= 2) 
            ? monthlyHistory[monthlyHistory.length - 2] 
            : null;

        // C. Delegador Destaque (MVP)
        let topGainer = { name: "N/A", increase: 0 };
        let lastRankingMap = new Map();
        
        if (lastMonthStats && lastMonthStats.ranking) {
             lastRankingMap = new Map(lastMonthStats.ranking.map(u => [u.username, u.hp]));
        }

        currentList.forEach(user => {
            const name = user.delegator || user.username;
            const currentHp = user.delegated_hp || user.hp || 0;
            const lastHp = lastRankingMap.get(name) || 0;
            const diff = currentHp - lastHp;
            
            if (diff > topGainer.increase) {
                topGainer = { name: name, increase: diff, total: currentHp };
            }
        });

        // --- 3. GERAÇÃO ---
        const dataPayload = {
            date: now.toLocaleDateString("pt-BR"),
            stats: {
                active_members: meta.active_community_members || 0,
                total_hp: Math.floor(meta.total_hp || 0),
                votes_month: meta.votes_month_current || 0,
                trail_followers: meta.curation_trail_count || 0
            },
            comparison: {
                last_month: lastMonthStats ? {
                    total_hp: lastMonthStats.total_power,
                } : "Sem dados",
            },
            highlight: {
                delegator_of_month: topGainer.increase > 0 ? topGainer : null,
                new_delegators: listsData.new_delegators || []
            },
            top_ranking: currentList.slice(0, 10) 
        };

        const prompt = `
ATUE COMO: O Gerente de Comunidade da Hive BR.
OBJETIVO: Escrever o "Relatório Mensal" (Markdown).

DADOS:
${JSON.stringify(dataPayload)}

ESTRUTURA:
1. Capa: ![Capa](${COVER_IMAGE_URL})
2. Título Criativo (${now.toLocaleDateString()}).
3. Destaque do Mês: ${topGainer.name} (+${Math.floor(topGainer.increase)} HP).
4. Dados Gerais: Total HP ${Math.floor(meta.total_hp || 0)}, Membros ${meta.active_community_members || 0}.
5. Ranking Top 10 (Tabela).
6. CTA para Discord: ${DISCORD_LINK}

TOM: Celebrativo e Profissional. PT-BR.
`;

        console.log(`🤖 Gerando Relatório v2.20.5...`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const suffix = isForced ? "_MANUAL_INSPECTION" : "_MENSAL";
        const filename = `relatorio_${now.toISOString().slice(0, 7)}${suffix}.md`;
        
        fs.writeFileSync(path.join(REPORT_DIR, filename), text);
        console.log(`✅ Relatório salvo: ${filename}`);

    } catch (error) {
        console.error("❌ Falha Crítica:", error.message);
        process.exit(1);
    }
}

run();
