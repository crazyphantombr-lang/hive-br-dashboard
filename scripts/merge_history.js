/**
 * Script: Merge History
 * Version: 1.1.1
 * Description: Unifica dados atuais com o histórico, registrando entradas e saídas.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const HISTORY_FILE = path.join(DATA_DIR, "ranking_history.json");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");

// Garante que o diretório exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Carrega histórico existente (se existir)
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

// Carrega delegações coletadas agora
function loadCurrent() {
  try {
    if (fs.existsSync(CURRENT_FILE)) {
      return JSON.parse(fs.readFileSync(CURRENT_FILE, "utf-8"));
    }
    throw new Error("Arquivo current.json não encontrado.");
  } catch (err) {
    console.error("❌ Erro fatal:", err.message);
    process.exit(1); // Falha explícita para o GitHub Actions saber
  }
}

// Salva histórico atualizado
function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function run() {
  console.log("🔄 Iniciando fusão de histórico...");
  
  const history = loadHistory();
  const currentList = loadCurrent();
  const date = today();

  // Cria um mapa para acesso rápido aos dados atuais
  // Formato: { "usuario": hp }
  const currentMap = new Map();
  currentList.forEach(entry => {
    currentMap.set(entry.delegator, entry.hp);
  });

  // Lista unificada de todos os usuários (Histórico + Atuais)
  // Isso garante que detectemos quem saiu (estava no histórico, mas não no atual)
  const allUsers = new Set([
    ...Object.keys(history),
    ...currentMap.keys()
  ]);

  let updatesCount = 0;

  allUsers.forEach(user => {
    // Se o usuário não existe no histórico, inicializa
    if (!history[user]) {
      history[user] = {};
    }

    const currentHP = currentMap.get(user);
    const lastDate = Object.keys(history[user]).sort().pop();
    const lastHP = lastDate ? history[user][lastDate] : 0;

    // Lógica de Registro:
    // 1. Se o usuário está na lista atual, grava o valor.
    // 2. Se NÃO está na lista atual, mas tinha valor > 0 antes, grava 0 (Saída).
    
    if (currentHP !== undefined) {
      // Usuário ativo: atualiza apenas se mudou ou se é a primeira entrada do dia
      if (history[user][date] !== currentHP) {
        history[user][date] = currentHP;
        updatesCount++;
      }
    } else if (lastHP > 0) {
      // Usuário saiu (não está no currentMap, mas tinha saldo): marca como 0
      if (history[user][date] !== 0) {
        history[user][date] = 0;
        updatesCount++;
      }
    }
  });

  saveHistory(history);
  console.log(`✅ history.json atualizado com ${updatesCount} alterações.`);
}

run();
