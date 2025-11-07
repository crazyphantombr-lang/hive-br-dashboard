const fs = require("fs");
const fetch = require("node-fetch");

const TARGET = "hive-br.voter";

async function getDelegations() {
  const response = await fetch("https://api.peakd.com/raw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "bridge.get_account",
      params: { account: TARGET },
      id: 1
    })
  });

  const json = await response.json();
  if (!json.result || !json.result.delegations_in) return [];

  return json.result.delegations_in.map(d => ({
    delegator: d.delegator,
    hp: d.amount / 1000 // converte de VEST para HP aproximado
  })).sort((a, b) => b.hp - a.hp);
}

async function run() {
  try {
    const delegs = await getDelegations();
    fs.writeFileSync("data/current.json", JSON.stringify(delegs, null, 2));
    console.log("✅ current.json atualizado com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao buscar delegações:", err.message);
    fs.writeFileSync("data/current.json", "[]");
  }
}

run();
