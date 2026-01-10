/**
 * Script: AI Report Generator
 * Version: 2.23.0 (Logic Match: Debug MVP)
 * Description: Uses proven logic from debug script to calculate MVP based on 2025-12-31 history.
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
        const meta = readJsonSafe(META_FILE, { 
            active_community_members: 0, total_hp: 0, votes_month_current: 0, curation_trail_count: 0, active_brazilians: 0 
        });
        
        const rawCurrent = readJsonSafe(CURRENT_FILE, []);
        let currentList = [];
        if (Array.isArray(rawCurrent)) currentList = rawCurrent;
        else if (rawCurrent.ranking && Array.isArray(rawCurrent.ranking)) currentList = rawCurrent.ranking;
        
        currentList.sort((a, b) => (b.delegated_hp || 0) - (a.delegated_hp || 0));

        const listsData = readJsonSafe(LISTS_FILE, { new_delegators: [] });
        const monthlyHistory = readJsonSafe(MONTHLY_FILE, []);
        const historyData = readJsonSafe(HISTORY_FILE, {}); // Carrega Histórico Completo
        const lastMonthStats = (Array.isArray(monthlyHistory) && monthlyHistory.length >= 2) ? monthlyHistory[monthlyHistory.length - 2] : null;

        // --- CÁLCULO DE MVP (Lógica Validada pelo Debug) ---
        const dateCalc = new Date(now.getFullYear(), now.getMonth(), 0); 
        const targetDateKey = dateCalc.toISOString().split('T')[0]; // Ex: 2025-12-31
        
        console.log(`📊 Calculando MVP baseando-se em: ${targetDateKey}`);

        let topGainer = { name: "Ninguém", increase: 0 };

        currentList.forEach(user => {
            const name = user.delegator || user.username;
            const currentHp = parseFloat(user.delegated_hp || user.hp || 0);
            
            let previousHp = 0;
            // Verifica se existe histórico na data exata
            if (historyData[name] && historyData[name][targetDateKey]) {
                previousHp = parseFloat(historyData[name][targetDateKey]);
            } else {
                // Se não achar histórico exato, ignora (evita falso positivo de "novo usuário")
                // Ou podemos definir previousHp = currentHp para que o aumento seja 0
                previousHp = currentHp; 
            }

            const diff = currentHp - previousHp;
            
            // Filtra apenas crescimento positivo real (> 1 HP)
            if (diff > 1 && diff > topGainer.increase) {
                topGainer = { name: name, increase: diff, total: currentHp };
            }
        });
        
        console.log(`🏆 Vencedor Identificado: ${topGainer.name} (+${topGainer.increase.toFixed(2)})`);

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
            },
            top_ranking: currentList.slice(0, 10) 
        };

        const prompt = `
ATUE COMO: O Gerente de Comunidade da Hive BR.
OBJETIVO: Escrever o "Relatório Mensal" (Markdown).

DADOS:
${JSON.stringify(dataPayload)}

### DEFINIÇÕES OFICIAIS (Glossário Obrigatório)
1. **Membros Ativos do Projeto:** "Total de contas únicas que participam diretamente da economia do projeto. Inclui todos os delegadores de Hive Power e todos os seguidores da trilha de curadoria (Curation Trail), removendo duplicatas."
2. **Brasileiros Ativos na Hive:** "Contagem de usuários identificados como brasileiros em nossa base de dados (verificados ou pendentes) que registraram atividade de escrita (postagem ou comentário) nos últimos 30 dias. Esta métrica mede a retenção e a voz ativa da comunidade brasileira na rede."

ESTRUTURA OBRIGATÓRIA DO POST:
1. Capa: ![Capa](${COVER_IMAGE_URL})
2. Título Criativo (${now.toLocaleDateString()}).
3. 🏆 **DELEGADOR DESTAQUE DO MÊS:** Escreva um parágrafo dedicado ao usuário **${topGainer.name}**, celebrando seu apoio. Mencione explicitamente o incremento de **+${Math.floor(topGainer.increase)} HP** realizado neste mês.
4. **Saúde da Comunidade:** Apresente os números de "Membros Ativos" vs "Brasileiros Ativos" usando as definições oficiais acima.
5. Dados Gerais: Total HP ${Math.floor(meta.total_hp || 0)}.
6. **Ranking Delegadores TOP 10:** Crie uma tabela Markdown com estritamente estas 3 colunas: "Posição", "Usuário" e "HP Delegado".
7. 📞 **Canais de Comunicação (CTA):** Crie uma seção de encerramento vibrante e bem formatada. Convide os usuários para entrar no nosso Discord usando uma lista ou destaque visual.
   - Link Obrigatório: [**Junte-se ao Discord Hive BR**](${DISCORD_LINK})
   - Encerre com uma mensagem motivadora sobre a construção da comunidade.

TOM: Celebrativo, Profissional e Vibrante. PT-BR.
`;

        console.log(`🤖 Gerando Relatório v2.23.0...`);
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
