/**
 * Script: Merge History
 * Version: 1.9.1
 * Description: Garante leitura correta de 'delegated_hp'
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
    console.warn("⚠️ Histórico novo criado.");
  }
  return {};
}

function loadCurrent() {
  try {
    if (fs.existsSync(CURRENT_FILE)) {
      return JSON.parse(fs.readFileSync(CURRENT_FILE, "utf-8"));
    }
    throw new Error("current.json não encontrado.");
  } catch (err) {
    console.error("❌ Erro:", err.message);
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
  console.log("🔄 Atualizando histórico...");
  
  const history = loadHistory();
  const currentList = loadCurrent();
  const date = today();

  const currentMap = new Map();
  currentList.forEach(entry => {
    // CRÍTICO: Usa delegated_hp. Se for undefined, usa 0.
    const val = entry.delegated_hp !== undefined ? entry.delegated_hp : entry.hp;
    currentMap.set(entry.delegator, val || 0);
  });

  const allUsers = new Set([
    ...Object.keys(history),
    ...currentMap.keys()
  ]);

  let updatesCount = 0;

  allUsers.forEach(user => {
    if (!history[user]) history[user] = {};

    const currentHP = currentMap.get(user);
    const lastDate = Object.keys(history[user]).sort().pop();
    const lastHP = lastDate ? history[user][lastDate] : 0;

    if (currentHP !== undefined) {
      if (history[user][date] !== currentHP) {
        history[user][date] = currentHP;
        updatesCount++;
      }
    } else if (lastHP > 0) {
      if (history[user][date] !== 0) {
        history[user][date] = 0;
        updatesCount++;
      }
    }
  });

  saveHistory(history);
  console.log(`✅ Histórico salvo (${updatesCount} updates).`);
}

run();
