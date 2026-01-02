/**
 * Script: AI Report Generator
 * Version: 2.19.4
 * Description: Robust Model Hunter - Tries multiple model names until one works.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Configurações
const DATA_DIR = "data";
const REPORT_DIR = "reports";
const META_FILE = path.join(DATA_DIR, "meta.json");
const HISTORY_FILE = path.join(DATA_DIR, "monthly_stats.json");

// Lista de modelos para tentar (em ordem de preferência)
const CANDIDATE_MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
    "gemini-pro"
];

// Garante que a pasta de relatórios existe
if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function run() {
    // 1. Verifica API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ Erro: GEMINI_API_KEY não encontrada nas variáveis de ambiente.");
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
        const lastMonthData = history.length >= 2 ? history[history.length - 2] : null;
        const comparisonText = lastMonthData 
            ? `Comparação com mês anterior: Antes tínhamos ${lastMonthData.total_power.toFixed(0)} HP e ${lastMonthData.delegators_count} delegadores.` 
            : "Sem dados históricos suficientes para comparação direta.";

        const prompt = `
        Você é o **Analista de Dados e Redator Oficial da Comunidade Hive BR**.
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
           - Título criativo para o relatório.
           - Introdução celebrando o crescimento.
           - Destaques dos números (HP, Delegadores, Trilha).
           - Breve análise sobre a curadoria (votos).
           - Chamada para ação (Call to Action): Convide para delegar para @hive-br.voter e seguir a trilha.
        4. **Idioma:** Português do Brasil.
        
        Escreva o relatório agora.
        `;

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // --- LOOP DE TENTATIVAS (MODEL HUNTER) ---
        let generatedText = null;
        
        for (const modelName of CANDIDATE_MODELS) {
            console.log(`🤖 Tentando modelo: ${modelName}...`);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                generatedText = response.text();
                
                console.log(`✨ SUCESSO com o modelo: ${modelName}`);
                break; // Sai do loop se der certo
            } catch (err) {
                console.warn(`⚠️ Falha com ${modelName}: ${err.message.split('[')[0]}... (Tentando próximo)`);
            }
        }

        if (!generatedText) {
            throw new Error("Todos os modelos falharam. Verifique se a API Key tem a API 'Generative Language' habilitada no Google Cloud Console.");
        }

        // 5. Salva o arquivo
        const filename = `relatorio_${new Date().toISOString().slice(0, 10)}.md`;
        const filepath = path.join(REPORT_DIR, filename);
        
        fs.writeFileSync(filepath, generatedText);
        console.log(`✅ Relatório salvo em: ${filepath}`);

    } catch (error) {
        console.error("❌ Erro fatal:", error.message);
        process.exit(1);
    }
}

run();
