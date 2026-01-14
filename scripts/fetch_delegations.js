/**
 * Script: Hive BR Data Fetcher
 * Version: 2.25.7 (Restoration: Vest-to-HP Conversion)
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const DATA_DIR = 'data';
const CURRENT_FILE = path.join(DATA_DIR, 'current.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const LISTS_FILE = path.join('config', 'lists.json');
const HIVE_RPC = 'https://api.hive.blog';

async function callHive(method, params) {
    const response = await fetch(HIVE_RPC, {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
    });
    const json = await response.json();
    return json.result;
}

async function run() {
    try {
        console.log("🚀 Iniciando Coleta e Conversão v2.25.7...");

        // 1. Obter propriedades globais para conversão de HP
        const props = await callHive('condenser_api.get_dynamic_global_properties', []);
        const tvf = parseFloat(props.total_vesting_fund_hive);
        const tvs = parseFloat(props.total_vesting_shares);
        const hp_per_vest = tvf / tvs;

        const lists = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));

        // 2. Obter delegações RECEBIDAS (Scanning account history ou usando lista conhecida)
        // Para garantir restauração, usamos a lista de delegadores e verificados
        const [mainAcc] = await callHive('condenser_api.get_accounts', [['hive-br.voter']]);
        
        // Captura delegadores via API de forma segura
        const delegationsRaw = await callHive('condenser_api.get_vesting_delegations', ['hive-br.voter', '', 1000]);
        // Nota: No dashboard HiveBR, iteramos sobre os nomes conhecidos para verificar quem delegou PARA nós.
        
        const allUsernames = [...new Set([
            ...(lists.verificado_br || []),
            ...(lists.pendente_br || []),
            ...(lists.watchlist || [])
        ])];

        const userDetails = [];
        for (let i = 0; i < allUsernames.length; i += 50) {
            const batch = allUsernames.slice(i, i + 50);
            const accounts = await callHive('condenser_api.get_accounts', [batch]);
            userDetails.push(...accounts);
        }

        const ranking = userDetails.map(acc => {
            // Conversão de Vests para HP real
            const ownHp = parseFloat(acc.vesting_shares) * hp_per_vest;
            
            // Simulação de delegação recebida (aqui deve ser integrada a lógica de quem delegou PARA @hive-br.voter)
            // Para esta restauração, mapeamos o campo da API corretamente
            const rawPD = acc.next_vesting_withdrawal;

            return {
                delegator: acc.name,
                delegated_hp: 0, // Será recalculado via histórico ou API de delegadores recebidos
                timestamp: acc.created,
                total_account_hp: ownHp,
                next_withdrawal: (rawPD && !rawPD.startsWith("1970")) ? rawPD : null,
                token_balance: parseFloat(acc.balance), 
                last_user_post: acc.last_post,
                last_vote_date: acc.last_vote_time,
                in_curation_trail: (lists.curation_trail || []).includes(acc.name)
            };
        });

        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        fs.writeFileSync(CURRENT_FILE, JSON.stringify(ranking, null, 2));

        fs.writeFileSync(META_FILE, JSON.stringify({
            last_updated: new Date().toISOString(),
            project_account_hp: parseFloat(mainAcc.vesting_shares) * hp_per_vest
        }, null, 2));

        console.log("✅ Dados brutos coletados e convertidos.");
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
