// File: scripts/generate_report.js
/**
 * Script: AI Report Generator
 * Version: 2.32.0
 * Author: Hive BR
 * License: MIT
 * Description: Gera relatórios narrativos usando dados pré-calculados exatos e cita novatos.
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
const GLOBAL_HISTORY_FILE = path.join(DATA_DIR, "global_history.json");

if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// --- FUNÇÕES AUXILIARES ---
function readJsonSafe(filepath, fallbackValue) {
    if (!fs.existsSync(filepath)) return fallbackValue;
    try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); } 
    catch (e) { return fallbackValue; }
}

function getHpFromHistory(entry) {
    if (entry === undefined || entry === null) return null;
    if (typeof entry === 'number') return entry;
    if (typeof entry === 'object' && entry.hp !== undefined) return entry.hp;
    return 0;
}

async function generateReport() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ Erro: GEMINI_API_KEY não definida.");
        process.exit(1);
    }

    const isForced = process.env.FORCE_REPORT === 'true';
    const now = new Date();
    
    // Identificação inteligente do "Mês Alvo" do relatório
    let targetDate = new Date(now);
    if (now.getDate() <= 5) {
        targetDate.setMonth(now.getMonth() - 1);
    }
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const reportMonthName = `${monthNames[targetDate.getMonth()]} de ${targetDate.getFullYear()}`;
    
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isLastDay = tomorrow.getDate() === 1 || now.getDate() === 1;

    if (!isLastDay && !isForced) {
        console.log("⏭️ Hoje não é fechamento do mês. Pulando relatório automático.");
        return;
    }

    console.log(`📊 Preparando Payload Matemático para o mês: ${reportMonthName}...`);

    const currentData = readJsonSafe(CURRENT_FILE, []);
    const metaData = readJsonSafe(META_FILE, {});
    const historyData = readJsonSafe(HISTORY_FILE, {});
    const globalHistory = readJsonSafe(GLOBAL_HISTORY_FILE, {});

    // 1. CÁLCULO DA COMUNIDADE (30 dias exatos)
    const date30 = new Date(now);
    date30.setDate(date30.getDate() - 30);
    const targetStr = date30.toISOString().split('T')[0];

    let startHp = metaData.total_hp || 0;
    const globalDates = Object.keys(globalHistory).sort();
    if (globalDates.length > 0) {
        const compareDate = globalDates.find(d => d >= targetStr) || globalDates[0];
        startHp = globalHistory[compareDate].total_delegated_hp || globalHistory[compareDate].total_hp || 0;
    }
    const endHp = metaData.total_hp || 0;
    const netGrowth = endHp - startHp;

    // 2. CÁLCULO DE TOP MOVERS (Lógica Polimórfica Antialucinação)
    const changes = [];
    currentData.forEach(curr => {
        const userHist = historyData[curr.delegator];
        if (userHist) {
            const dates = Object.keys(userHist).sort();
            if (dates.length > 0) {
                const compareDate = dates.find(d => d >= targetStr) || dates[0];
                const oldHp = getHpFromHistory(userHist[compareDate]);
                const diff = curr.delegated_hp - oldHp;
                
                if (diff >= 1 && dates.length > 3) { 
                    changes.push({ 
                        name: curr.delegator, 
                        old: oldHp, 
                        new: curr.delegated_hp, 
                        diff: diff 
                    });
                }
            }
        }
    });

    changes.sort((a, b) => b.diff - a.diff);
    const topMovers = changes.slice(0, 5);

    // 3. AUDITORIA DE NOVATOS
    const firstDayOfMonthStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-01`;
    const newDelegators = [];
    const newBrazilians = [];

    currentData.forEach(user => {
        if (user.delegated_hp <= 0) return;

        const hist = historyData[user.delegator];
        let isNew = false;

        if (!hist) {
            isNew = true;
        } else {
            const datesBeforeThisMonth = Object.keys(hist).filter(d => d < firstDayOfMonthStr);
            const hadHpBefore = datesBeforeThisMonth.some(d => getHpFromHistory(hist[d]) > 0);
            if (!hadHpBefore) isNew = true;
        }

        if (isNew) {
            newDelegators.push({ user: user.delegator, hp: user.delegated_hp });
            if (user.country_code.startsWith("BR")) {
                const status = user.country_code.includes("CERT") ? "Verificada" : "Pendente";
                newBrazilians.push({ user: user.delegator, hp: user.delegated_hp, status: status });
            }
        }
    });

    // 4. TOP 10 RANKING (Removida a coluna BR)
    const top10 = currentData.slice(0, 10).map((u, i) => {
        return `| ${i + 1} | @${u.delegator} | ${Math.floor(u.delegated_hp)} HP |`;
    }).join("\n");

    const formatMovers = topMovers.map(u => `- @${u.name}: +${Math.floor(u.diff)} HP`).join("\n") || "- Nenhum movimento relevante mapeado.";
    const formatNewcomers = newDelegators.map(u => `- @${u.user}: +${Math.floor(u.hp)} HP`).join("\n") || "- Nenhum novo membro este mês.";
    const formatNewBR = newBrazilians.map(u => `- @${u.user} (${u.status})`).join("\n") || "- Nenhuma nova conta brasileira mapeada.";

    // --- PROMPT BLINDADO ---
    const prompt = `
Você é Hiver, o mascote entusiasmado da comunidade Hive BR.
Sua missão é gerar um post oficial em Markdown (estilo blog) resumindo o mês de ${reportMonthName}.

REGRAS ESTABELECIDAS:
- Mantenha um tom otimista, focado na força da comunidade e da Web3.
- NÃO INVENTE NÚMEROS. Use EXATAMENTE os dados fornecidos abaixo. Se a diferença for zero ou negativa, não diga que é "0" ou cite o "@Ninguém", apenas fale que foi um mês de "consolidação" e foque nos usuários que subiram.
- O título deve conter "Hive BR: [Mês/Ano] - [Frase de efeito]"
- Inclua a imagem de capa no topo: ![Capa](${COVER_IMAGE_URL})
- Sem chamadas para ação (CTAs) agressivas ou forçadas no final, apenas uma assinatura suave.

DADOS ESTATÍSTICOS OFICIAIS DE ${reportMonthName.toUpperCase()}:
- HP Total da Comunidade: ${Math.floor(endHp)} HP
- HP no início do mês: ${Math.floor(startHp)} HP
- Crescimento Líquido no mês: ${Math.floor(netGrowth)} HP
- Delegadores Ativos na Comunidade: ${metaData.total_delegators || currentData.length}
- Contas Brasileiras Ativas (últimos 30 dias na blockchain): ${metaData.active_brazilians || 0}

ESTRUTURA DO POST:
1. INTRODUÇÃO
   - Saudações do Hiver.
   - Resumo rápido de como foi o mês. Utilize os números de HP Total, Crescimento Líquido, total de delegadores e a força das Contas Brasileiras Ativas na blockchain.

2. 🚀 QUEM ESTÁ TURBINANDO (TOP MOVERS)
   - Liste os usuários que mais subiram suas delegações:
${formatMovers}
   - Exalte quem está no topo dessa lista.

3. 👋 BOAS-VINDAS AOS NOVATOS
   - Celebre nominalmente os novos membros que enviaram delegações:
${formatNewcomers}
   - Dê um destaque especial para novas contas BRASILEIRAS informando seu status de verificação:
${formatNewBR}

4. O TOP 10 (A ELITE)
   - Apresente a tabela abaixo com o Top 10.
| Rank | Usuário | HP Delegado |
|---|---|---|
${top10}
   - Elogie a dedicação destes líderes.

5. ENCERRAMENTO
   - Reforce a união da comunidade.
   - Deixe o link do Discord (${DISCORD_LINK}) de forma natural, como um ponto de encontro.
`;

    console.log(`🤖 Disparando Prompt Blindado para Gemini...`);
    
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const suffix = isForced ? "_MANUAL" : `_${targetDate.toISOString().slice(0, 7)}`;
        const filename = path.join(REPORT_DIR, `report${suffix}.md`);
        
        fs.writeFileSync(filename, text);
        console.log(`✅ Relatório salvo com sucesso em: ${filename}`);

    } catch (err) {
        console.error("❌ Falha na geração do relatório:", err);
    }
}

generateReport();
