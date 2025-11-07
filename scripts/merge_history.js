import fs from "fs";

const current = JSON.parse(fs.readFileSync("data/current.json", "utf-8"));
const history = JSON.parse(fs.readFileSync("data/history.json", "utf-8"));

const today = new Date().toISOString().slice(0, 10);

for (const entry of current) {
  if (!history[entry.delegator]) history[entry.delegator] = {};
  history[entry.delegator][today] = entry.hp;
}

fs.writeFileSync("data/history.json", JSON.stringify(history, null, 2));
