/**
 * Script: AI Report Generator
 * Version: 2.19.3
 * Description: Reads stats and uses Gemini API to write a blog post.
 * Fix: Uses specific stable model version (gemini-1.5-flash-001)
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Configurações
const DATA_DIR = "data";
const REPORT_DIR = "reports";
const META_FILE = path.join(DATA_DIR, "meta.json");
const HISTORY_FILE = path.join(DATA_DIR, "monthly_stats.json");

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
        // 2. Lê os dados
        console.log("📂 Lendo dados do dashboard...");
        const meta = JSON.parse(fs.readFileSync(META_FILE));
        
        let history = [];
        if (fs.existsSync(HISTORY_FILE)) {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE));
        }

        // 3. Prepara o contexto para a IA
        const today = new Date().toLocaleDateString("pt-BR");
        
        // Pega o mês anterior para comparação (se existir)
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

        // 4. Chama o Gemini (CORRIGIDO PARA VERSÃO ESTÁVEL)
        console.log("🤖 Consultando a IA (Gemini 1.5 Flash 001)...");
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // USANDO O NOME ESPECÍFICO DA VERSÃO
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001"});
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 5. Salva o arquivo
        const filename = `relatorio_${new Date().toISOString().slice(0, 10)}.md`;
        const filepath = path.join(REPORT_DIR, filename);
        
        fs.writeFileSync(filepath, text);
        console.log(`✅ Relatório gerado com sucesso: ${filepath}`);

    } catch (error) {
        console.error("❌ Falha ao gerar relatório:", error);
        // Em caso de erro, lista os modelos disponíveis para debug
        console.log("Dica: Verifique se a API Key tem permissão para 'gemini-1.5-flash-001'");
        process.exit(1);
    }
}

run();
