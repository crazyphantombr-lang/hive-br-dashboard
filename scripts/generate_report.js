// File: scripts/generate_report.js
/**
 * Script: AI Report Generator
 * Version: 2.21.0 (Feature: Rich Data & Enthusiastic Prompt)
 * Description: Gera relatórios mensais narrativos usando dados granulares de histórico (30 dias).
 * Calcula Top Movers, Novos Delegadores e fornece contexto rico para a IA.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// --- CONFIGURAÇÕES ---
const COVER_IMAGE_URL = "https://files.peakd.com/file/peakd-hive/crazyphantombr/23tknNzYZVr2stDGwN8Sv9BpmnRmeRgcZNaC1ZhHFB1U99MTAe5qfGrcsZd4a51PPnRkZ.png";
const DISCORD_LINK = "https://discord.gg/NgfkeVJT5w";
const MODEL_NAME = "gemini-2.5-flash"; // Usando modelo mais recente se disponível, ou fallback

const DATA_DIR = "data";
const REPORT_DIR = "reports";
const META_FILE = path.join(DATA_DIR, "meta.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json"); 
// monthly_stats.json foi removido da lógica de cálculo individual para evitar erros

if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// --- FUNÇÃO DE LEITURA BLINDADA ---
function readJsonSafe(filepath, fallbackValue) {
    if (!fs.existsSync(filepath)) return fallbackValue;
    try {
        const raw = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.warn(`⚠️ AVISO: Arquivo corrompido ignorado: ${path.basename(filepath)}`);
        return fallbackValue;
    }
}

// --- UTILITÁRIOS DE DATA ---
function getPastDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
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
        console.log("📂 Carregando e processando dados ricos...");

        const meta = readJsonSafe(META_FILE, { total_hp: 0, active_community_members: 0 });
        const rawCurrent = readJsonSafe(CURRENT_FILE, []);
        const historyData = readJsonSafe(HISTORY_FILE, {}); // Histórico diário: { "user": { "date": hp } }

        let currentList = Array.isArray(rawCurrent) ? rawCurrent : (rawCurrent.ranking || []);
        
        // --- 2. CÁLCULOS AVANÇADOS (Regra de 30 Dias) ---
        // Alinhado com a lógica do Frontend v2.23.3
        
        const targetDateStr = getPastDate(30);
        const movers = [];      // Quem cresceu
        const newJoiners = [];  // Quem entrou (0 -> X)
        const droppers = [];    // Quem saiu (X -> 0 ou reduziu muito)

        currentList.forEach(user => {
            const name = user.delegator;
            const currentHP = user.delegated_hp || 0;
            
            // Busca histórico
            let pastHP = 0;
            const userHist = historyData[name];
            
            if (userHist) {
                // Encontra a data mais próxima no passado (<= 30 dias atrás)
                const dates = Object.keys(userHist).sort();
                let foundDate = null;
                for (const d of dates) {
                    if (d <= targetDateStr) foundDate = d;
                    else break;
                }
                if (foundDate) pastHP = userHist[foundDate];
            }

            const diff = currentHP - pastHP;

            // Classificação
            if (pastHP === 0 && currentHP > 0) {
                newJoiners.push({ name, hp: currentHP });
                movers.push({ name, diff: currentHP, total: currentHP, type: "NEW" });
            } else if (diff > 0.1) {
                movers.push({ name, diff: diff, total: currentHP, type: "GROWTH" });
            } else if (diff < -0.1) {
                droppers.push({ name, diff: diff, total: currentHP });
            }
        });

        // Ordenações
        movers.sort((a, b) => b.diff - a.diff);
        const topGainer = movers.length > 0 ? movers[0] : { name: "Ninguém", diff: 0 };
        const totalGrowth30d = movers.reduce((acc, cur) => acc + cur.diff, 0) + droppers.reduce((acc, cur) => acc + cur.diff, 0);

        // --- 3. PAYLOAD PARA A IA ---
        const dataPayload = {
            date: now.toLocaleDateString("pt-BR"),
            community_stats: {
                total_hp: Math.floor(meta.total_hp || 0),
                members_count: meta.active_community_members || 0,
                growth_30d_hp: Math.floor(totalGrowth30d),
                growth_30d_percent: ((totalGrowth30d / (meta.total_hp - totalGrowth30d)) * 100).toFixed(2) + "%"
            },
            mvp: {
                name: topGainer.name,
                growth_amount: Math.floor(topGainer.diff),
                total_delegated: Math.floor(topGainer.total)
            },
            top_movers_5: movers.slice(0, 5).map(m => ({ 
                name: m.name, 
                added: Math.floor(m.diff), 
                status: m.type === "NEW" ? "Novo Membro!" : "Aumentou aposta"
            })),
            new_members: newJoiners.slice(0, 10).map(u => u.name), // Top 10 novos
            top_ranking_10: currentList.slice(0, 10).map((u, i) => ({
                rank: i + 1,
                name: u.delegator,
                hp: Math.floor(u.delegated_hp),
                is_br: u.country_code === "BR_CERT"
            }))
        };

        // --- 4. PROMPT ENGENHADO ---
        const prompt = `
ATUE COMO: "Hiver", o mascote digital entusiasta, otimista e analítico da comunidade Hive BR.
OBJETIVO: Escrever o Relatório Mensal da Hive BR (Markdown).

DADOS DO MÊS (ANÁLISE PROFUNDA):
${JSON.stringify(dataPayload, null, 2)}

DIRETRIZES DE TOM E ESTILO:
- Tom: Vibrante, celebrativo, cheio de energia, mas profissional nos dados.
- Use emojis estrategicamente (🚀, 🐝, 🍯, 📈).
- Linguagem: Português Brasileiro (PT-BR). Use termos da Hive (HP, Power Up, Delegação).

ESTRUTURA DO RELATÓRIO:

1. CAPA VISUAL
   - Insira esta imagem no topo: ![Capa](${COVER_IMAGE_URL})

2. TÍTULO CRIATIVO
   - Crie um título chamativo com a data (${now.toLocaleDateString()}). Ex: "O Mel Está Pingando!", "Explosão de HP!".

3. INTRODUÇÃO: O PULSO DA COLMEIA
   - Comente sobre o Total de HP (${dataPayload.community_stats.total_hp}) e o crescimento líquido (${dataPayload.community_stats.growth_30d_hp} HP).
   - Se o crescimento for positivo, celebre a força da união.

4. 🏆 DESTAQUE DO MÊS (MVP)
   - Conte uma mini-história sobre @${topGainer.name}. 
   - Ele(a) adicionou +${Math.floor(topGainer.diff)} HP. Diga que ele é a "Abelha Rainha" deste ciclo.

5. 🚀 QUEM ESTÁ TURBINANDO (TOP MOVERS)
   - Não mostre apenas uma tabela chata. Liste os Top 5 Movers de forma dinâmica.
   - Exalte quem está na lista "top_movers_5".

6. 👋 BOAS-VINDAS AOS NOVATOS
   - Se houver "new_members", cite-os nominalmente. Diga "Bem-vindos ao enxame!".
   - Se a lista for vazia, incentive novos usuários a entrar.

7. O TOP 10 (A ELITE)
   - Apresente a tabela do Top 10 Ranking.
   - Faça um breve comentário sobre a disputa entre o 2º e o 3º lugar (se os números forem próximos).

8. CHAMADA PARA AÇÃO (CTA)
   - Convide para o Discord: ${DISCORD_LINK}
   - Encerre com uma frase de efeito motivacional sobre Web3 e comunidade.
`;

        console.log(`🤖 Gerando Relatório Narrativo v2.21.0...`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const suffix = isForced ? "_MANUAL" : `_${now.toISOString().slice(0, 7)}`;
        const filename = `relatorio${suffix}.md`;
        
        fs.writeFileSync(path.join(REPORT_DIR, filename), text);
        console.log(`✅ Relatório narrativo salvo: ${filename}`);

    } catch (error) {
        console.error("❌ Falha Crítica na IA:", error.message);
        process.exit(1);
    }
}

run();
