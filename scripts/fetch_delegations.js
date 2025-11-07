const fs = require("fs");
const fetch = require("node-fetch");
const dhive = require("@hiveio/dhive");

// Lista de RPCs para testar automaticamente
const RPCS = [
  "https://anyx.io",
  "https://api.c0ff33a.uk",
  "https://hive-api.arcange.eu",
  "https://api.deathwing.me",
  "https://api.openhive.network",
  "https://api.hive.blog"
];

// Testa RPC até achar um com bridge ativa
async function findWorkingRPC() {
  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "bridge.get_account",
          params: { account: "hive-br.voter" },
          id: 1
        })
      });
      const json = await res.json();
      if (json.result) {
        console.log("✅ Bridge encontrada em:", rpc);
        return rpc;
      }
    } catch (_) {}
  }
  throw new Error("❌ Nenhum RPC com bridge está respondendo.");
}

async function getGlobalProps(client) {
  const props = await client.call("database_api", "get_dynamic_global_properties", {});
  return {
    totalVestingFundHive: parseFloat(props.total_vesting_fund_hive),
    totalVestingShares: parseFloat(props.total_vesting_shares)
  };
}

async function vestToHP(client, vest) {
  const g = await getGlobalProps(client);
  return vest * (g.totalVestingFundHive / g.totalVestingShares);
}

async function run() {
  const rpc = await findWorkingRPC();
  const hive = new dhive.Client(rpc);

  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "bridge.get_account",
      params: { account: "hive-br.voter" },
      id: 1
    })
  });

  const json = await res.json();
  const delegs = json.result.delegations_in || [];

  const result = [];
  for (const d of delegs) {
    const hp = await vestToHP(hive, parseFloat(d.vesting_shares));
    result.push({ delegator: d.delegator, hp });
  }

  result.sort((a,b) => b.hp - a.hp);

  fs.writeFileSync("data/current.json", JSON.stringify(result, null, 2));
  console.log("✅ current.json atualizado com sucesso.");
}

run();
