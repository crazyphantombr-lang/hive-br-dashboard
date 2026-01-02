/**
 * Script: AI Report Generator
 * Version: 2.19.5
 * Description: Debug Mode - Shows FULL error details.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const REPORT_DIR = "reports";
const META_FILE = path.join(DATA_DIR, "meta.json");
const HISTORY_FILE = path.join(DATA_DIR, "monthly_stats.json");

// Apenas um modelo para teste de conexão agora
const MODEL_NAME = "gemini-1.5-flash";

if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ ERRO CRÍTICO: GEMINI_API_KEY não encontrada/vazia.");
        process.exit(1);
    }
    
    // Debug da chave (mostra apenas os 4 primeiros caracteres por segurança)
    console.log(`🔑 Chave detectada: ${apiKey.substring(0, 4)}... (Total chars: ${apiKey.length})`);

    try {
        console.log("📂 Lendo dados...");
        const meta = JSON.parse(fs.readFileSync(META_FILE));
        
        const prompt = `Escreva um 'Olá Mundo' para testar a conexão.`;

        console.log(`🤖 Testando conexão com modelo: ${MODEL_NAME}...`);
        
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log("✅ SUCESSO! A API RESPONDEU:");
        console.log(text);
        
        // Se chegou aqui, a chave funciona. Pode salvar o arquivo de teste.
        fs.writeFileSync(path.join(REPORT_DIR, "teste_api.md"), text);

    } catch (error) {
        console.error("\n❌❌❌ ERRO DETALHADO DA API ❌❌❌");
        console.error("Tipo:", error.name);
        console.error("Mensagem:", error.message);
        if (error.status) console.error("Status HTTP:", error.status);
        if (error.statusText) console.error("Texto Status:", error.statusText);
        console.error("------------------------------------------------");
        process.exit(1);
    }
}

run();
