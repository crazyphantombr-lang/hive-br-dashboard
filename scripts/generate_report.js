/**
 * Script: AI Report Generator
 * Version: 2.20.2 (Development)
 * Description: Monthly report generator with 15-day history and MVP Delegator highlight.
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
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json"); // Fonte para 15 dias
const MONTHLY_FILE = path.join(DATA_DIR, "monthly_stats.json");   // Fonte para mês anterior
const LISTS_FILE = path.join(DATA_DIR, "lists.json");

if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error("❌ Erro: GEMINI_API_KEY ausente."); process.exit(1); }

    // --- 1. VERIFICAÇÃO DE EXECUÇÃO (MENSAL) ---
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Lógica: É último dia se o mês de amanhã for diferente do de hoje
    const isLastDay = now.getMonth() !== tomorrow.getMonth();
    // Lógica: Só roda à tarde para garantir que pegou os dados do dia inteiro
    const isAfternoon = now.getHours() >= 12;

    if (!isLastDay || !isAfternoon) {
        console.log(`[SKIP] Script abortado. Hoje (${now.toLocaleDateString()}) não é o fechamento mensal (Último dia, pós-12h).`);
        return;
    }

    try {
        console.log("📂 Carregando dados para Relatório Mensal...");

        // Leitura de Arquivos com Fallback
        const meta = JSON.parse(fs.readFileSync(META_FILE));
        const currentData = fs.existsSync(CURRENT_FILE) ? JSON.parse(fs.readFileSync(CURRENT_FILE)) : { ranking: [] };
        const listsData = fs.existsSync(LISTS_FILE) ? JSON.parse(fs.readFileSync(LISTS_FILE)) : { new_delegators: [] };
        
        let dailyHistory = [];
        try { dailyHistory = JSON.parse(fs.readFileSync(HISTORY_FILE)); } catch (e) {}

        let monthlyHistory = [];
        try { monthlyHistory = JSON.parse(fs.readFileSync(MONTHLY_FILE)); } catch (e) {}

        // --- 2. CÁLCULOS ANALÍTICOS ---

        // A. Comparação de 15 Dias (Tendência Recente)
        let stats15DaysAgo = null;
        if (dailyHistory.length >= 15) {
            stats15DaysAgo = dailyHistory[dailyHistory.length - 15];
        }

        // B. Comparação Mês Anterior (Crescimento Mensal)
        const lastMonthStats = monthlyHistory.length >= 2 ? monthlyHistory[monthlyHistory.length - 2] : null;

        // C. Identificar o "DELEGADOR DESTAQUE" (Maior aumento absoluto de HP)
        let topGainer = { name: "N/A", increase: 0 };
        
        // Se tivermos histórico do mês passado, cruzamos os dados
        if (lastMonthStats && lastMonthStats.ranking) {
            const lastRankingMap = new Map(lastMonthStats.ranking.map(u => [u.username, u.hp]));
            
            currentData.ranking.forEach(user => {
                const lastHp = lastRankingMap.get(user.username) || 0;
                const diff = user.hp - lastHp;
                // Filtra apenas quem aumentou
                if (diff > topGainer.increase) {
                    topGainer = { name: user.username, increase: diff, total: user.hp };
                }
            });
        }

        // --- 3. MONTAGEM DO PAYLOAD ---
        const dataPayload = {
            date: now.toLocaleDateString("pt-BR"),
            stats: {
                active_members: meta.active_community_members,
                total_hp: Math.floor(meta.total_hp),
                votes_month: meta.votes_month_current,
                trail_followers: meta.curation_trail_count
            },
            comparison: {
                last_month: lastMonthStats ? {
                    total_hp: lastMonthStats.total_power,
                    members: lastMonthStats.active_members
                } : "Sem dados anteriores",
                days_15_ago: stats15DaysAgo ? {
                    total_hp: stats15DaysAgo.total_hp,
                    date: stats15DaysAgo.date
                } : "Sem histórico de 15 dias"
            },
            highlight: {
                // Só envia se o aumento for significativo (> 10 HP por exemplo, ou apenas > 0)
                delegator_of_month: topGainer.increase > 0 ? topGainer : null,
                new_delegators: listsData.new_delegators || []
            },
            top_ranking: currentData.ranking.slice(0, 10) // Top 10 para tabela
        };

        const prompt = `
ATUE COMO: O Gerente de Comunidade e Analista de Dados da Hive BR.
OBJETIVO: Escrever o "Relatório Mensal de Performance e Transparência" em Markdown.

DADOS REAIS (JSON):
${JSON.stringify(dataPayload)}

DIRETRIZES ESTRUTURAIS (Post Blog):

1. **Cabeçalho:** Use a imagem de capa: ![Capa](${COVER_IMAGE_URL})
2. **Título:** "Relatório Hive BR: Fechamento de [Mês/Ano] - [Frase de Impacto sobre o HP Total]".
3. **Introdução:** Resumo executivo. Agradeça o apoio.
4. **🏆 DESTAQUE DO MÊS:**
   - Se 'highlight.delegator_of_month' existir: Crie um parágrafo especial celebrando **${topGainer.name}** pelo maior aumento de delegação (+${Math.floor(topGainer.increase)} HP). Use emojis (🚀, 👑).
5. **📊 Análise de Crescimento:**
   - Compare o HP Atual (${Math.floor(meta.total_hp)}) com o Mês Anterior.
   - Se houver dados de 'days_15_ago', comente a evolução na última quinzena.
6. **Ranking TOP 10:** Apresente em Tabela (Posição | Usuário | HP Total).
7. **Boas-vindas:** Liste novos delegadores (se houver).
8. **Conclusão e Call to Action:**
   - Explique por que delegar é bom (ROI em votos).
   - Link Discord: ${DISCORD_LINK}

TOM DE VOZ: Profissional, analítico (data-driven), mas comunitário e entusiasmado.
IDIOMA: Português Brasileiro (PT-BR).
`;

        console.log(`🤖 Gerando Relatório Mensal v2.20.2 (Modelo: ${MODEL_NAME})...`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Nome do arquivo: relatorio_YYYY-MM_MENSAL.md
        const filename = `relatorio_${now.toISOString().slice(0, 7)}_MENSAL.md`;
        fs.writeFileSync(path.join(REPORT_DIR, filename), text);
        console.log(`✅ Relatório compilado com sucesso: ${filename}`);

    } catch (error) {
        console.error("❌ Falha Crítica:", error.message);
        process.exit(1);
    }
}

run();
