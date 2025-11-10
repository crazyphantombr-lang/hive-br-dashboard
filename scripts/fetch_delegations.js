const fs = require("fs");
const fetch = require("node-fetch");

const TARGET = "hive-br.voter";

async function getGlobalProps() {
  const res = await fetch("https://api.hive.blog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "condenser_api.get_dynamic_global_properties",
      params: [],
      id: 1
    })
  });

  const json = await res.json();
  const gp = json.result;

  const totalVestingFund = parseFloat(gp.total_vesting_fund_hive.split(" ")[0]);
  const totalVestingShares = parseFloat(gp.total_vesting_shares.split(" ")[0]);

  return totalVestingFund / totalVestingShares;
}

async function getDelegations() {
  const url = `https://rpc.mahdiyari.info/hafsql/delegations/${TARGET}/incoming?limit=500`;
  const res = await fetch(url);
  return await res.json();
}

async function run() {
  try {
    const ratio = await getGlobalProps();
    const delegations = await getDelegations();

    const formatted = delegations.map(d => {
      const vests = parseFloat(d.vesting_shares.split(" ")[0]);
      const hp = vests * ratio;
      return {
        delegator: d.delegator,
        hp: Number(hp.toFixed(3))
      };
    }).sort((a, b) => b.hp - a.hp);

    fs.writeFileSync("data/current.json", JSON.stringify(formatted, null, 2));
    console.log("✅ Delegações atualizadas com sucesso!");
  } catch (err) {
    console.error("❌ Erro:", err.message);
    fs.writeFileSync("data/current.json", "[]");
  }
}

run();
