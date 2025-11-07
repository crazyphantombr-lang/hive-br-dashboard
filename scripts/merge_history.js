const fs = require("fs");

// Carrega histórico existente (se existir)
function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync("data/history.json", "utf-8"));
  } catch {
    return {};
  }
}

// Carrega delegações coletadas agora
function loadCurrent() {
  try {
    return JSON.parse(fs.readFileSync("data/current.json", "utf-8"));
  } catch {
    return [];
  }
}

// Salva histórico atualizado
function saveHistory(history) {
  fs.writeFileSync("data/history.json", JSON.stringify(history, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function run() {
  const history = loadHistory();
  const current = loadCurrent();
  const date = today();

  current.forEach(entry => {
    if (!history[entry.delegator]) history[entry.delegator] = {};
    history[entry.delegator][date] = entry.hp;
  });

  saveHistory(history);
  console.log("✅ history.json atualizado.");
}

run();
