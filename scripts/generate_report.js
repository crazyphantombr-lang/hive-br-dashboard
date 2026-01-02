/**
 * Script: AI Report Diagnostic
 * Version: 2.19.6
 * Description: Lists available models directly via HTTP Request to debug 404 errors.
 */

const fetch = require("node-fetch"); // Usando fetch direto para pular o SDK
const fs = require("fs");
const path = require("path");

const REPORT_DIR = "reports";
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        console.error("❌ ERRO: Sem API Key.");
        process.exit(1);
    }

    console.log(`🔑 Chave detectada (início): ${apiKey.substring(0, 4)}...`);
    console.log("📡 Consultando catálogo de modelos do Google via HTTP...");

    try {
        // Endpoint oficial para listar modelos
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("❌ O Google retornou um erro:");
            console.error(JSON.stringify(data.error, null, 2));
            
            // Dica baseada no erro comum
            if (data.error.message && data.error.message.includes("API has not been used")) {
                console.log("\n💡 DICA DE SOLUÇÃO: A API 'Generative Language API' não está ativada no seu console.");
                console.log("   Acesse o link que aparece na mensagem de erro acima e clique em 'ENABLE'.");
            }
        } else if (data.models) {
            console.log("\n✅ SUCESSO! Modelos disponíveis para sua chave:");
            console.log("------------------------------------------------");
            data.models.forEach(m => {
                // Filtra apenas os modelos de geração de texto (gemini)
                if (m.name.includes("gemini")) {
                    console.log(`- ${m.name} (Versão: ${m.version})`);
                }
            });
            console.log("------------------------------------------------");
            console.log("Se a lista acima estiver vazia, sua chave não tem acesso aos modelos Gemini.");
        } else {
            console.log("⚠️ Resposta estranha (sem erro, mas sem modelos):");
            console.log(JSON.stringify(data, null, 2));
        }

    } catch (err) {
        console.error("❌ Erro de conexão:", err.message);
    }
}

run();
