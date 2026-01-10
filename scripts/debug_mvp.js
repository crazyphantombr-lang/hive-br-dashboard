const fs = require("fs");
const path = require("path");

const CURRENT_FILE = path.join("data", "current.json");
const HISTORY_FILE = path.join("data", "ranking_history.json");

function run() {
    console.log("🕵️‍♂️ DIAGNÓSTICO DO MVP (DELEGADOR DESTAQUE)");
    console.log("-------------------------------------------");

    // 1. Carregar Dados
    if (!fs.existsSync(CURRENT_FILE) || !fs.existsSync(HISTORY_FILE)) {
        console.log("❌ Arquivos de dados não encontrados.");
        return;
    }

    const rawCurrent = JSON.parse(fs.readFileSync(CURRENT_FILE, "utf8"));
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    
    let currentList = [];
    if (Array.isArray(rawCurrent)) currentList = rawCurrent;
    else if (rawCurrent.ranking) currentList = rawCurrent.ranking;

    // 2. Definir Data Alvo (Último dia do mês anterior)
    const now = new Date();
    const dateCalc = new Date(now.getFullYear(), now.getMonth(), 0);
    const targetDateKey = dateCalc.toISOString().split('T')[0];

    console.log(`📅 Hoje: ${now.toLocaleDateString()}`);
    console.log(`🎯 Buscando histórico de: ${targetDateKey} (Fim do mês passado)`);
    console.log("-------------------------------------------");

    // 3. Simular Cálculo
    let topGainer = { name: "Ninguém", increase: -999999 };
    let foundHistoryCount = 0;

    // Pega os Top 5 atuais para amostra
    const sample = currentList.sort((a,b) => b.delegated_hp - a.delegated_hp).slice(0, 5);

    console.log("🔍 AMOSTRA (Top 5 Atuais):");
    
    sample.forEach(user => {
        const name = user.delegator || user.username;
        const currentHp = parseFloat(user.delegated_hp || 0);
        let prevHp = 0;
        let status = "❌ SEM DADOS";

        if (history[name]) {
            // Tenta achar a data exata
            if (history[name][targetDateKey]) {
                prevHp = parseFloat(history[name][targetDateKey]);
                status = "✅ DATA EXATA";
                foundHistoryCount++;
            } else {
                // Se não achar, mostra quais datas existem
                const dates = Object.keys(history[name]).sort();
                const lastAvailable = dates[dates.length - 1];
                status = `⚠️ MISING (Última: ${lastAvailable})`;
            }
        } else {
            status = "❌ USER NOVO/SEM HIST";
        }

        const diff = currentHp - prevHp;
        console.log(`   👤 ${name.padEnd(15)} | Atual: ${currentHp.toFixed(0)} | Antigo: ${prevHp.toFixed(0)} | Diff: ${diff.toFixed(0)} | ${status}`);
    });

    console.log("-------------------------------------------");
    
    // Cálculo Real Global
    currentList.forEach(user => {
        const name = user.delegator || user.username;
        const currentHp = parseFloat(user.delegated_hp || 0);
        let prevHp = 0;
        if (history[name] && history[name][targetDateKey]) {
            prevHp = parseFloat(history[name][targetDateKey]);
        }
        const diff = currentHp - prevHp;
        if (diff > topGainer.increase) {
            topGainer = { name, increase: diff, current: currentHp, prev: prevHp };
        }
    });

    console.log(`🏆 VENCEDOR CALCULADO: ${topGainer.name}`);
    console.log(`   Aumento: +${topGainer.increase.toFixed(3)} HP`);
    console.log(`   (De ${topGainer.prev.toFixed(0)} para ${topGainer.current.toFixed(0)})`);
    
    if (foundHistoryCount === 0) {
        console.log("\n⚠️ ALERTA CRÍTICO: Nenhum usuário tem histórico na data alvo.");
        console.log("   O sistema está considerando HP Anterior = 0 para todos.");
        console.log("   Por isso o 'Destaque' é apenas quem tem mais HP Total.");
    }
}

run();
