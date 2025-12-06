/**
 * Script: Merge History
 * Version: 1.6.1
 * Description: Hotfix - Ajuste para ler 'delegated_hp' em vez de 'hp'
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    }
  } catch (err) {
    console.warn("⚠️ Arquivo de histórico não encontrado ou inválido. Criando novo.");
  }
  return {};
}

function loadCurrent() {
  try {
    if (fs.existsSync(CURRENT_FILE)) {
      return JSON.parse(fs.readFileSync(CURRENT_FILE, "utf-8"));
    }
    throw new Error("Arquivo current.json não encontrado.");
  } catch (err) {
    console.error("❌ Erro fatal:", err.message);
    process.exit(1);
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function run() {
  console.log("🔄 Iniciando fusão de histórico (v1.6.1)...");
  
  const history = loadHistory();
  const currentList = loadCurrent();
  const date = today();

  const currentMap = new Map();
  currentList.forEach(entry => {
    // CORREÇÃO AQUI: Mudamos de entry.hp para entry.delegated_hp
    currentMap.set(entry.delegator, entry.delegated_hp);
  });

  const allUsers = new Set([
    ...Object.keys(history),
    ...currentMap.keys()
  ]);

  let updatesCount = 0;

  allUsers.forEach(user => {
    if (!history[user]) {
      history[user] = {};
    }

    const currentHP = currentMap.get(user);
    const lastDate = Object.keys(history[user]).sort().pop();
    const lastHP = lastDate ? history[user][lastDate] : 0;

    if (currentHP !== undefined) {
      // Se o valor mudou ou se é a primeira vez rodando hoje (corrige o zero anterior)
      if (history[user][date] !== currentHP) {
        history[user][date] = currentHP;
        updatesCount++;
      }
    } else if (lastHP > 0) {
      // Saída real (não está na lista atual)
      if (history[user][date] !== 0) {
        history[user][date] = 0;
        updatesCount++;
      }
    }
  });

  saveHistory(history);
  console.log(`✅ history.json corrigido e atualizado com ${updatesCount} alterações.`);
}

run();
