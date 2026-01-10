/**
 * Script: AI Report Generator
 * Version: 2.21.1 (Prompt Tuning)
 * Description: Updates AI prompt with validated definitions and strict formatting rules for Ranking/MVP.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

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

function readJsonSafe(filepath, fallbackValue) {
    if (!fs.existsSync(filepath)) return fallbackValue;
    try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); } 
    catch (e) { return fallbackValue; }
}

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error("❌ Erro: GEMINI_API_KEY ausente."); process.exit(1); }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isLastDay = now.getMonth() !== tomorrow.getMonth();
    const isAfternoon = now.getHours() >= 12;
    const isForced = process.env.FORCE_REPORT === "true";

    if (!isForced && (!isLastDay || !isAfternoon)) {
        console.log(`[SKIP] Script abortado.`);
        return;
    }
    if (isForced) console.log("⚠️ MODO MANUAL ATIVADO.");

    try {
        console.log("📂 Carregando dados...");
        // Carrega metadados com fallback
        const meta = readJsonSafe(META_FILE, { 
            active_community_members: 0, total_hp: 0, votes_month_current: 0, curation_trail_count: 0, active_brazilians: 0 
        });
        
        // Carrega ranking atual (suporta Array ou Objeto)
        const rawCurrent = readJsonSafe(CURRENT_FILE, []);
        let currentList = [];
        if (Array.isArray(rawCurrent)) currentList = rawCurrent;
        else if (rawCurrent.ranking && Array.isArray(rawCurrent.ranking)) currentList = rawCurrent.ranking;
        
        currentList.sort((a, b) => (b.delegated_hp || 0) - (a.delegated_hp || 0));

        const listsData = readJsonSafe(LISTS_FILE, { new_delegators: [] });
        const dailyHistory = readJsonSafe(HISTORY_FILE, []);
        const monthlyHistory = readJsonSafe(MONTHLY_FILE, []);

        // Comparativos
        const lastMonthStats = (Array.isArray(monthlyHistory) && monthlyHistory.length >= 2) ? monthlyHistory[monthlyHistory.length - 2] : null;

        // Cálculo do MVP (Top Gainer)
        let topGainer = { name: "N/A", increase: 0 };
        let lastRankingMap = new Map();
        if (lastMonthStats && lastMonthStats.ranking) lastRankingMap = new Map(lastMonthStats.ranking.map(u => [u.username, u.hp]));

        currentList.forEach(user => {
            const name = user.delegator || user.username;
            const currentHp = user.delegated_hp || user.hp || 0;
            const lastHp = lastRankingMap.get(name) || 0;
            const diff = currentHp - lastHp;
            if (diff > topGainer.increase) topGainer = { name: name, increase: diff, total: currentHp };
        });

        // Payload para a IA
        const dataPayload = {
            date: now.toLocaleDateString("pt-BR"),
            stats: {
                active_members: meta.active_community_members || 0,
                active_brazilians: meta.active_brazilians || 0,
                total_hp: Math.floor(meta.total_hp || 0),
                votes_month: meta.votes_month_current || 0,
                trail_followers: meta.curation_trail_count || 0
            },
            comparison: {
                last_month: lastMonthStats ? { total_hp: lastMonthStats.total_power } : "Sem dados",
            },
            highlight: {
                delegator_of_month: topGainer.increase > 0 ? topGainer : null,
                new_delegators: listsData.new_delegators || []
            },
            top_ranking: currentList.slice(0, 10) 
        };

        // --- PROMPT REFINADO ---
        const prompt = `
ATUE COMO: O Gerente de Comunidade da Hive BR.
OBJETIVO: Escrever o "Relatório Mensal" (Markdown).

DADOS:
${JSON.stringify(dataPayload)}

### DEFINIÇÕES OFICIAIS (Glossário Obrigatório)
Use estas definições exatas para explicar os números à comunidade na seção de "Saúde da Comunidade":
1. **Membros Ativos do Projeto (${dataPayload.stats.active_members}):** "Total de contas únicas que participam diretamente da economia do projeto. Inclui todos os delegadores de Hive Power e todos os seguidores da trilha de curadoria (Curation Trail), removendo duplicatas."
2. **Brasileiros Ativos na Hive (${dataPayload.stats.active_brazilians}):** "Contagem de usuários identificados como brasileiros em nossa base de dados (verificados ou pendentes) que registraram atividade de escrita (postagem ou comentário) nos últimos 30 dias. Esta métrica mede a retenção e a voz ativa da comunidade brasileira na rede."

ESTRUTURA OBRIGATÓRIA DO POST:
1. Capa: ![Capa](${COVER_IMAGE_URL})
2. Título Criativo (${now.toLocaleDateString()}).
3. 🏆 **DELEGADOR DESTAQUE DO MÊS:** Escreva um parágrafo dedicado ao usuário **${topGainer.name}**, celebrando seu apoio. Você DEVE mencionar explicitamente o incremento de **+${Math.floor(topGainer.increase)} HP** realizado neste mês.
4. **Saúde da Comunidade:** Apresente os números de "Membros Ativos" vs "Brasileiros Ativos" usando as definições oficiais acima.
5. Dados Gerais: Total HP ${Math.floor(meta.total_hp || 0)}.
6. **Ranking Delegadores TOP 10:** Crie uma tabela Markdown com estritamente estas 3 colunas: "Posição", "Usuário" e "HP Delegado".
7. CTA para Discord: ${DISCORD_LINK}

TOM: Celebrativo, Profissional e Vibrante. PT-BR.
`;

        console.log(`🤖 Gerando Relatório v2.21.1...`);
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
