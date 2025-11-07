const dhive = require("@hiveio/dhive");
const fs = require("fs");

const client = new dhive.Client("https://api.hive.blog");

// API mais estável: bridge.list_delegators
async function getDelegators(delegatee) {
  return await client.call("bridge", "list_delegators", {
    account: delegatee,
    limit: 1000
  });
}

// Conversão VESTS → HP
async function getGlobalProps() {
  const props = await client.call("database_api", "get_dynamic_global_properties", {});
  return {
    totalVestingFundHive: parseFloat(props.total_vesting_fund_hive),
    totalVestingShares: parseFloat(props.total_vesting_shares),
  };
}

async function vestToHP(vest) {
  const globals = await getGlobalProps();
  return vest * (globals.totalVestingFundHive / globals.totalVestingShares);
}

async function run() {
  const delegations = await getDelegators("hive-br.voter");
  const list = [];

  for (const d of delegations) {
    const hp = await vestToHP(parseFloat(d.vesting_shares));
    list.push({ delegator: d.delegator, hp });
  }

  list.sort((a, b) => b.hp - a.hp);

  fs.writeFileSync("data/current.json", JSON.stringify(list, null, 2));
  console.log("✅ current.json atualizado com sucesso.");
}

run();
