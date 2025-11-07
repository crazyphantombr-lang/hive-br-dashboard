const dhive = require("@hiveio/dhive");
const fs = require("fs");

// NÓ que suporta API "bridge"
const client = new dhive.Client("https://rpc.ecency.com");

// Converte vest → HP
async function getGlobalProps() {
  const props = await client.call("database_api", "get_dynamic_global_properties", {});
  return {
    totalVestingFundHive: parseFloat(props.total_vesting_fund_hive),
    totalVestingShares: parseFloat(props.total_vesting_shares),
  };
}

async function vestToHP(vest) {
  const g = await getGlobalProps();
  return vest * (g.totalVestingFundHive / g.totalVestingShares);
}

// AQUI: pegamos delegações recebidas (igual o Hivetasks faz)
async function getDelegations(delegatee) {
  const acc = await client.call("bridge", "get_account", { account: delegatee });

  // Se a conta não tem delegações
  if (!acc.delegations_in) return [];

  const list = [];

  for (const d of acc.delegations_in) {
    const hp = await vestToHP(parseFloat(d.vesting_shares));
    list.push({ delegator: d.delegator, hp });
  }

  // Ordena maior → menor
  return list.sort((a, b) => b.hp - a.hp);
}

async function run() {
  const data = await getDelegations("hive-br.voter");

  fs.writeFileSync("data/current.json", JSON.stringify(data, null, 2));
  console.log("✅ current.json atualizado.");
}

run();
