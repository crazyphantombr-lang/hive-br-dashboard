/**
 * Script: Fetch Delegations (Curation Trail Update)
 * Version: 2.6.0
 * Update: Adiciona verificação de seguidores da Trilha de Curadoria (HiveVote)
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const VOTER_ACCOUNT = "hive-br.voter";
const PROJECT_ACCOUNT = "hive-br";
const TOKEN_SYMBOL = "HBR";

// --- LISTA DE USUÁRIOS FIXOS (WATCHLIST) ---
const FIXED_USERS = [
  "abandeira", "aiuna", "aiyumi", "ale-rio", "alexandrefeliz", "alina97", "alinequeiroz", "alucardy", "alyxmijaresda",
  "anacvv05", "anafenalli", "anazn", "aphiel", "avedorada", "avel692", "ayummi", "badge-182654", "barizon", "bastter",
  "bergmannadv", "bernardonassar", "blessskateshop", "boba1961", "bodhi.rio", "borajogar", "brancarosamel", "brazilians",
  "caaio", "canellov", "capuah-iruet", "carlosro", "carolramos", "casagrande", "christiantatsch", "claytonlins", "cleateles1",
  "coiotes", "coyote.sports", "coyotelation", "crazyphantombr", "cril692003", "crisciacm", "cryptoshaman007", "david0808",
  "deividluchi", "diegoguerra", "diogenesrm", "discernente", "disruptivas", "doblershiva", "dolandoteiro", "donamona",
  "dreloop07", "dstampede", "dudutaulois", "dunatos", "edufecchio", "edvamfilho", "ehvinho", "eijibr", "elcoachjesus",
  "elderdark", "emanueledornelas", "emviagem", "endrius", "ericpso", "escadas", "estourefugiado", "eujotave", "f0rtunate",
  "fabiocola", "fabiosoares", "felipefortes", "feliperochatv", "fernandosoder", "fireguardian", "fireguardian.spt",
  "floressenciarte", "fmajuniorphoto", "frankrey11", "fredsilva007", "g4tzbr", "gabrielmilego", "game3x3", "greengineer",
  "gtpacheko17", "handrehermann", "hevelyn.jeeh", "hive-br", "hive-br.leo", "hivebr.spt", "hive-br.voter", "hranhuk",
  "imagemvirtual", "ismaelrd04", "iuriomagico", "j377e", "jacalf", "jaopalas", "jaquevital", "jarmeson", "jeffparajiujitsu",
  "jkatrina", "jklio123", "joaophelip", "joaoprobst", "jontv", "jose.music", "josiva", "jsaez", "jsantana", "jucabala",
  "juliasantos", "jullyette", "kaibagt", "kat.eli", "kaveira", "kelday666", "kevbest", "kingforceblack", "kojiri", "laribf",
  "laurasoares", "legalizabrazil", "leo.marques", "lesulzbacher", "lincemarrom", "lipe100dedos", "liquideity", "litekoiner",
  "lobaobh", "luanaecard", "ludgero", "luidimarg", "luizeba", "luizhadad", "maismau", "marianaemilia", "markitoelias",
  "marzukiali", "matheusggr", "matheusggr.leo", "matheusluciano", "mathfb", "mauriciolimax", "megamariano", "meinickenutri",
  "mengao", "michupa", "micloop", "milery", "mrprofessor", "mrprofessordaily", "nane-qts", "naoebemumcanal", "nascimentoab",
  "nascimentocb", "nathylieth", "nayha23", "nichollasrdo", "norseland", "officialjag", "oficialversatil", "orozcorobetson",
  "pablito.saldo", "papoprodutivo", "paradaleticia", "pataty69", "pedagogia", "pedrocanella", "perfilbrasil", "phgnomo",
  "phsaeta", "pirulito.zoado", "pythomaster", "qyses", "raistling", "rdabrasil", "reas63", "renatacristiane", "rhommar",
  "rimasx", "robspiercer", "rodrigojmelo", "rounan.soares", "rphspinheiro", "sandranunes", "santana37", "santinhos", "seabet",
  "selhomarlopes", "shiftrox", "silviamaria", "sintropia", "sistemabusiness", "skaters", "sktbr", "sousafrc", "splinter100dedos",
  "surfgurupro", "surflimpo", "tankulo", "tatianest", "tatylayla", "teteuzinho", "teu", "thaliaperez", "thomashnblum",
  "totomusic", "triptamine555", "tucacheias", "ukyron3", "underlock", "unhurried", "unten1995", "usergabs", "vaipraonde",
  "vanessabarrostec", "vcorioh", "vempromundo", "ventrinidad", "vicvondoom", "vini0", "vitoragnelli", "vonlecram",
  "wagnertamanaha", "wallabra", "wallabra-wallet", "wasye", "wellingt556", "wilkersk8zn", "wiseagent", "wlfreitas",
  "xgoivo", "xlety", "xtryhard", "yungbresciani", "zallin", "zombialien"
];

// --- LISTA DA TRILHA DE CURADORIA (Extraída do HiveVote) ---
const CURATION_TRAIL_USERS = [
  "hive-br", "kaibagt", "matheusggr.leo", "matheusggr", "elderdark", "shiftrox", "zallin", "vempromundo", 
  "syel25", "arthursiq5", "lucasqz", "luizeba", "crazyphantombr", "nane-qts", "us3incanada", "lilico", 
  "kedleona", "adamferrari", "ayummi", "fireguardian", "portugalzin", "wlffreitas", "lincemarrom", 
  "thomashnblum", "hive-182654", "badge-182654", "lobaobh", "rafasete", "d35tr0", "casagrande", "mariale07", 
  "jarmeson", "underlock", "vempromundo.pob", "pablito.saldo", "thayavlis", "emviagem", "tfranzini", 
  "preciousplastes", "claytonlins", "rimurutempest", "ativosgarantem", "cassia.nails", "dwarven", "ifhy", 
  "jkatrina", "josiva", "kaveira", "abreusplinter", "spidersilk", "lucianaabrao", "xlety", "blackleg", 
  "coyotelation", "lemurians", "captainman", "joaophelip", "blessskateshop", "devferri", "vortac", 
  "xeraifuma", "michupa", "bradleyarrow", "game3x3", "pixbee", "wlfreitas", "ricestrela", "treasure.hoard", 
  "coiotes", "alinequeiroz", "preciouz-01", "kevbest", "jsantana", "cheryl291021", "jaopalas", "jhonpa5808", 
  "chuchochucho", "sofia.perola", "scumflowerboy", "itznur", "luizvitao", "reibar", "geovanna-gg", 
  "xeraixupa", "skaters"
];
// ------------------------------------------------------------

const HAF_API = `https://rpc.mahdiyari.info/hafsql/delegations/${VOTER_ACCOUNT}/incoming?limit=300`;
const HE_RPC = "https://api.hive-engine.com/rpc/contracts";

const RPC_NODES = [
  "https://api.hive.blog",
  "https://api.deathwing.me",
  "https://api.openhive.network"
];

const DATA_DIR = "data";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function hiveRpc(method, params) {
  for (const node of RPC_NODES) {
    try {
      const response = await fetch(node, {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: 1 }),
        headers: { "Content-Type": "application/json" },
        timeout: 15000 
      });
      
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const json = await response.json();
      if (json.error) throw new Error(json.error.message);
      return json.result; 
    } catch (err) {
      console.warn(`⚠️ Node ${node} falhou: ${err.message}.`);
    }
  }
  return null;
}

async function fetchHiveEngineBalances(accounts, symbol) {
  try {
    const query = { symbol: symbol, account: { "$in": accounts } };
    const response = await fetch(HE_RPC, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0", method: "find",
        params: { contract: "tokens", table: "balances", query: query, limit: 1000 },
        id: 1
      }),
      headers: { "Content-Type": "application/json" }
    });
    const json = await response.json();
    return json.result || [];
  } catch (err) {
    console.error("❌ Erro Hive-Engine:", err.message);
    return [];
  }
}

async function fetchVoteHistory(voterAccount) {
  console.log(`🔎 Buscando histórico profundo (12.000 ops)...`);
  
  let fullHistory = [];
  let start = -1; 
  const batchSize = 1000; 
  const maxBatches = 12;

  for (let i = 0; i < maxBatches; i++) {
    const batch = await hiveRpc("condenser_api.get_account_history", [voterAccount, start, batchSize]);
    if (!batch || batch.length === 0) break;

    fullHistory = fullHistory.concat(batch);
    const firstItem = batch[0];
    const firstId = firstItem[0];
    start = firstId - 1;
    console.log(`   Batch ${i+1}/${maxBatches}: Recebidos ${batch.length}. Próximo ID: ${start}`);
    if (start < 0) break;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const voteStats = {}; 

  fullHistory.forEach(tx => {
    const op = tx[1].op;
    const timestamp = tx[1].timestamp;
    
    if (op[0] === 'vote' && op[1].voter === voterAccount) {
      const author = op[1].author;
      if (!voteStats[author]) voteStats[author] = { count_30d: 0, last_vote_ts: null };
      
      if (!voteStats[author].last_vote_ts || timestamp > voteStats[author].last_vote_ts) {
        voteStats[author].last_vote_ts = timestamp;
      }

      const voteDate = new Date(timestamp + (timestamp.endsWith("Z") ? "" : "Z"));
      if (voteDate >= thirtyDaysAgo) {
        voteStats[author].count_30d += 1;
      }
    }
  });
  
  return voteStats;
}

async function run() {
  try {
    console.log(`1. 🔄 HAFSQL + Watchlist...`);
    const res = await fetch(HAF_API);
    let delegationsData = await res.json();
    if (!Array.isArray(delegationsData)) delegationsData = [];

    const currentDelegators = new Set(delegationsData.map(d => d.delegator));
    FIXED_USERS.forEach(fixedUser => {
      if (!currentDelegators.has(fixedUser)) {
        delegationsData.push({ delegator: fixedUser, hp_equivalent: 0, timestamp: null }); // Timestamp null para fixos
      }
    });

    const userNames = delegationsData.map(d => d.delegator);

    console.log(`2. 🌍 Hive RPC (Dados Globais)...`);
    const globals = await hiveRpc("condenser_api.get_dynamic_global_properties", []);
    let vestToHp = 0.0005; 
    if (globals) vestToHp = parseFloat(globals.total_vesting_fund_hive) / parseFloat(globals.total_vesting_shares);

    const allAccountsToFetch = [...userNames, PROJECT_ACCOUNT];
    const accounts = await hiveRpc("condenser_api.get_accounts", [allAccountsToFetch]);
    
    const accountDetails = {};
    let projectHp = 0;

    if (accounts) {
        accounts.forEach(acc => {
            const hp = parseFloat(acc.vesting_shares) * vestToHp;
            if (acc.name === PROJECT_ACCOUNT) projectHp = hp;
            accountDetails[acc.name] = { hp: hp, last_post: acc.last_post };
        });
    }

    console.log(`3. 🪙 Hive-Engine (Tokens)...`);
    const heBalances = await fetchHiveEngineBalances(userNames, TOKEN_SYMBOL);
    const tokenMap = {};
    heBalances.forEach(b => { tokenMap[b.account] = parseFloat(b.stake || 0); });

    console.log(`4. 🗳️ Histórico de Curadoria...`);
    const curationMap = await fetchVoteHistory(VOTER_ACCOUNT);

    const finalData = delegationsData
      .map(item => {
        const voteInfo = curationMap[item.delegator] || { count_30d: 0, last_vote_ts: null };
        const accInfo = accountDetails[item.delegator] || { hp: 0, last_post: null };

        return {
          delegator: item.delegator,
          delegated_hp: parseFloat(item.hp_equivalent),
          total_account_hp: accInfo.hp,
          last_user_post: accInfo.last_post, 
          token_balance: tokenMap[item.delegator] || 0,
          timestamp: item.timestamp,
          last_vote_date: voteInfo.last_vote_ts,
          votes_month: voteInfo.count_30d,
          // Verifica se está na lista de curadoria (TRILHA)
          in_curation_trail: CURATION_TRAIL_USERS.includes(item.delegator)
        };
      })
      .sort((a, b) => b.delegated_hp - a.delegated_hp);

    fs.writeFileSync(path.join(DATA_DIR, "current.json"), JSON.stringify(finalData, null, 2));
    
    const metaData = {
      last_updated: new Date().toISOString(),
      total_delegators: finalData.filter(d => d.delegated_hp > 0).length,
      total_hp: finalData.reduce((acc, curr) => acc + curr.delegated_hp, 0),
      total_hbr_staked: finalData.reduce((acc, curr) => acc + curr.token_balance, 0),
      project_account_hp: projectHp
    };
    fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(metaData, null, 2));

    console.log("✅ Dados salvos (Trilha de Curadoria atualizada)!");

  } catch (err) {
    console.error("❌ Erro fatal:", err.message);
    process.exit(1);
  }
}

run();
