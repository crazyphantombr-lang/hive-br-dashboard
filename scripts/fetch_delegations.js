const fs = require("fs");
const fetch = require("node-fetch");

const TARGET = "hive-br.voter";

async function run() {
  try {
    const url = `https://rpc.mahdiyari.info/hafsql/delegations/${TARGET}/incoming?limit=500`;
    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error("Resposta inesperada do servidor");
    }

    const delegations = data
      .map(d => ({
        delegator: d.delegator,
        hp: Number(parseFloat(d.hp_equivalent).toFixed(3))
      }))
      .sort((a, b) => b.hp - a.hp);

    fs.writeFileSync("data/current.json", JSON.stringify(delegations, null, 2));
// Não imprimir nada no arquivo do GitHub Pages
  } catch (err) {
    console.error("❌ Erro ao buscar delegações:", err.message);
    fs.writeFileSync("data/current.json", "[]");
  }
}

run();
