/**
 * Script: Fetch Delegations & Account Wealth
 * Version: 1.6.0
 * Update: Busca saldo total (HP Próprio) de cada delegador na Hive RPC
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const ACCOUNT = "hive-br.voter";
const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${ACCOUNT}/incoming?limit=300`;
const HIVE_RPC = "https://api.deathwing.me"; // API Pública Robusta
const DATA_DIR = "data";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Função auxiliar para chamar Hive RPC
async function hiveRpc(method, params) {
  const response = await fetch(HIVE_RPC, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: 1 }),
    headers: { "Content-Type": "application/json" }
  });
  const json = await response.json();
  return json.result;
}

async function run() {
  try {
    console.log(`1. 🔄 Buscando delegações HAFSQL...`);
    const res = await fetch(HAF_API);
    const delegationsData = await res.json();

    if (!Array.isArray(delegationsData) || delegationsData.length === 0) {
      console.log("⚠️ Nenhum dado retornado da API.");
      return;
    }

    console.log(`2. 🌍 Buscando Cotação Global (VESTS -> HP)...`);
    const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
    const totalVestFund = parseFloat(globals.total_vesting_fund_hive);
    const totalVestShares = parseFloat(globals.total_vesting_shares);
    const vestToHp = totalVestFund / totalVestShares;

    console.log(`3. 💰 Buscando saldo total dos usuários...`);
    const userNames = delegationsData.map(d => d.delegator);
    
    // A API suporta muitos nomes, mas por segurança vamos pedir em lote único pois são menos de 1000
    const accounts = await hiveRpc("condenser_api.get_accounts", [userNames]);
    
    // Cria um mapa para acesso rápido: { 'usuario': hp_total }
    const wealthMap = {};
    accounts.forEach(acc => {
      const ownVests = parseFloat(acc.vesting_shares);
      // const receivedVests = parseFloat(acc.received_vesting_shares);
      // const delegatedVests = parseFloat(acc.delegated_vesting_shares);
      
      // HP Total = (Vests Próprios) * Cotação
      // Se quiser "HP Efetivo" (Poder de voto), some received e subtraia delegated.
      // Aqui usaremos HP PRÓPRIO (Riqueza da conta)
      const totalHp = ownVests * vestToHp;
      wealthMap[acc.name] = totalHp;
    });

    // 4. Mesclagem Final
    const finalData = delegationsData
      .map(item => ({
        delegator: item.delegator,
        delegated_hp: parseFloat(item.hp_equivalent), // O quanto ele doou para nós
        total_account_hp: wealthMap[item.delegator] || 0, // O quanto ele tem no total
        timestamp: item.timestamp
      }))
      .sort((a, b) => b.delegated_hp - a.delegated_hp); // Ordena pelo valor doado

    fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(finalData, null, 2));
    
    // Metadados
    const metaData = {
      last_updated: new Date().toISOString(),
      total_delegators: finalData.length,
      total_hp: finalData.reduce((acc, curr) => acc + curr.delegated_hp, 0)
    };
    fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

    console.log("✅ Dados completos (Delegação + Riqueza) salvos!");

  } catch (err) {
    console.error("❌ Erro fatal:", err.message);
    process.exit(1);
  }
}

run();
