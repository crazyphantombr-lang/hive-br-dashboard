/**
 * Script: AI Report Generator
 * Version: 2.20.3 (Development)
 * Description: Generates blog post. Supports MANUAL EXECUTION via env var FORCE_REPORT.
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

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error("❌ Erro: GEMINI_API_KEY ausente."); process.exit(1); }

    // --- 1. VERIFICAÇÃO DE EXECUÇÃO (MENSAL & MANUAL) ---
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Verificações de Data
    const isLastDay = now.getMonth() !== tomorrow.getMonth();
    const isAfternoon = now.getHours() >= 12;
    
    // Verifica se há um comando forçado via Variável de Ambiente (Do GitHub Actions Manual)
    const isForced = process.env.FORCE_REPORT === "true";

    // A lógica: Se NÃO for forçado E (não for último dia OU for de manhã) -> PULA
    if (!isForced && (!isLastDay || !isAfternoon)) {
        console.log(`[SKIP] Script abortado. Hoje (${now.toLocaleDateString()}) não é fechamento mensal.`);
        console.log(`ℹ️ Dica: Para testar, use o workflow 'Manual Report Inspection' no GitHub.`);
        return;
    }

    if (isForced) console.log("⚠️ MODO MANUAL ATIVADO: Ignorando verificação de data.");

    try {
        console.log("📂 Carregando dados para Relatório...");

        const meta = JSON.parse(fs.readFileSync(META_FILE));
        const currentData = fs.existsSync(CURRENT_FILE) ? JSON.parse(fs.readFileSync(CURRENT_FILE)) : { ranking: [] };
        const listsData = fs.existsSync(LISTS_FILE) ? JSON.parse(fs.readFileSync(LISTS_FILE)) : { new_delegators: [] };
        
        let dailyHistory = [];
        try { dailyHistory = JSON.parse(fs.readFileSync(HISTORY_FILE)); } catch (e) {}

        let monthlyHistory = [];
        try { monthlyHistory = JSON.parse(fs.readFileSync(MONTHLY_FILE)); } catch (e) {}

        // --- 2. CÁLCULOS ANALÍTICOS ---

        // A. Comparação de 15 Dias
        let stats15DaysAgo = null;
        if (dailyHistory.length >= 15) {
            stats15DaysAgo = dailyHistory[dailyHistory.length - 15];
        }

        // B. Comparação Mês Anterior
        const lastMonthStats = monthlyHistory.length >= 2 ? monthlyHistory[monthlyHistory.length - 2] : null;

        // C. Identificar o "DELEGADOR DESTAQUE" (MVP)
        let topGainer = { name: "N/A", increase: 0 };
        
        if (lastMonthStats && lastMonthStats.ranking) {
            const lastRankingMap = new Map(lastMonthStats.ranking.map(u => [u.username, u.hp]));
            currentData.ranking.forEach(user => {
                const lastHp = lastRankingMap.get(user.username) || 0;
                const diff = user.hp - lastHp;
                if (diff > topGainer.increase) {
                    topGainer = { name: user.username, increase: diff, total: user.hp };
                }
            });
        }

        // --- 3. PAYLOAD PARA AI ---
        const dataPayload = {
            date: now.toLocaleDateString("pt-BR"),
            is_manual_run: isForced,
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
                delegator_of_month: topGainer.increase > 0 ? topGainer : null,
                new_delegators: listsData.new_delegators || []
            },
            top_ranking: currentData.ranking.slice(0, 10) 
        };

        const prompt = `
ATUE COMO: O Gerente de Comunidade e Analista de Dados da Hive BR.
OBJETIVO: Escrever o "Relatório Mensal de Performance" em Markdown.

DADOS REAIS (JSON):
${JSON.stringify(dataPayload)}

DIRETRIZES ESTRUTURAIS:
1. **Cabeçalho:** Use a imagem de capa: ![Capa](${COVER_IMAGE_URL})
2. **Título:** "Relatório Hive BR: [Mês/Ano] - [Frase de Impacto]" ${isForced ? "(Prévia Manual)" : ""}.
3. **Introdução:** Resumo executivo.
4. **🏆 DESTAQUE DO MÊS:**
   - Crie um parágrafo especial celebrando **${topGainer.name}** pelo maior aumento (+${Math.floor(topGainer.increase)} HP). Use emojis.
5. **📊 Análise de Crescimento:**
   - Compare o HP Atual (${Math.floor(meta.total_hp)}) com o Mês Anterior.
   - Cite a evolução dos últimos 15 dias (se houver).
6. **Ranking TOP 10:** Tabela (Posição | Usuário | HP Total).
7. **Boas-vindas:** Novos delegadores.
8. **Conclusão e CTA:** Link Discord: ${DISCORD_LINK}

TOM: Profissional, analítico, mas vibrante.
IDIOMA: Português Brasileiro.
`;

        console.log(`🤖 Gerando Relatório v2.20.3 (Manual: ${isForced})...`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Se for manual, adiciona sufixo para não sobrescrever o oficial se rodar no dia errado
        const suffix = isForced ? "_MANUAL_INSPECTION" : "_MENSAL";
        const filename = `relatorio_${now.toISOString().slice(0, 7)}${suffix}.md`;
        
        fs.writeFileSync(path.join(REPORT_DIR, filename), text);
        console.log(`✅ Relatório salvo: ${filename}`);

    } catch (error) {
        console.error("❌ Falha:", error.message);
        process.exit(1);
    }
}

run();
