/**
 * Script: AI Report Generator
 * Version: 2.19.7
 * Description: Generates blog post using the available Gemini 2.5 Flash model.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Configurações
const DATA_DIR = "data";
const REPORT_DIR = "reports";
const META_FILE = path.join(DATA_DIR, "meta.json");
const HISTORY_FILE = path.join(DATA_DIR, "monthly_stats.json");
const MODEL_NAME = "gemini-2.5-flash"; // Modelo confirmado via diagnóstico

// Garante que a pasta de relatórios existe
if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ Erro: GEMINI_API_KEY ausente.");
        process.exit(1);
    }

    try {
        console.log("📂 Lendo dados do dashboard...");
        const meta = JSON.parse(fs.readFileSync(META_FILE));
        
        let history = [];
        if (fs.existsSync(HISTORY_FILE)) {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE));
        }

        const today = new Date().toLocaleDateString("pt-BR");
        
        // Lógica de comparação histórica
        const lastMonthData = history.length >= 2 ? history[history.length - 2] : null;
        const comparisonText = lastMonthData 
            ? `Comparação com mês anterior: Antes tínhamos ${lastMonthData.total_power.toFixed(0)} HP e ${lastMonthData.delegators_count} delegadores.` 
            : "Sem dados históricos suficientes para comparação direta.";

        const prompt = `
        Você é o **Analista de Dados e Redator Oficial da Comunidade Hive BR** (ano atual: 2026).
        Sua tarefa é escrever um relatório de performance (post para blog) com base nos dados abaixo.

        --- DADOS ATUAIS (${today}) ---
        - Total de Poder (Comunidade): ${meta.total_hp.toFixed(0)} HP
        - HP Próprio do Projeto: ${meta.project_account_hp.toFixed(0)} HP
        - Total de Delegadores Ativos: ${meta.total_delegators}
        - Seguidores da Trilha de Curadoria: ${meta.curation_trail_count}
        - Votos distribuídos neste mês: ${meta.votes_month_current}
        - Total de HBR em Stake: ${meta.total_hbr_staked.toFixed(0)}
        
        --- CONTEXTO HISTÓRICO ---
        ${comparisonText}

        --- DIRETRIZES DE ESTILO ---
        1. **Tom de Voz:** Profissional, motivador, entusiasta e comunitário.
        2. **Formatação:** Use Markdown (Títulos ##, negrito **, listas -).
        3. **Estrutura:**
           - Título criativo para o relatório (Ex: "Relatório Hive BR - Janeiro 2026").
           - Introdução celebrando o crescimento.
           - Destaques dos números (HP, Delegadores, Trilha).
           - Breve análise sobre a curadoria (votos).
           - Chamada para ação (Call to Action): Convide para delegar para @hive-br.voter e seguir a trilha.
        4. **Idioma:** Português do Brasil.
        
        Escreva o relatório agora.
        `;

        console.log(`🤖 Gerando texto com ${MODEL_NAME}...`);
        
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Salva o arquivo
        const filename = `relatorio_${new Date().toISOString().slice(0, 10)}.md`;
        const filepath = path.join(REPORT_DIR, filename);
        
        fs.writeFileSync(filepath, text);
        console.log(`✅ SUCESSO! Relatório gerado em: ${filepath}`);

    } catch (error) {
        console.error("❌ Falha na geração:", error.message);
        process.exit(1);
    }
}

run();
