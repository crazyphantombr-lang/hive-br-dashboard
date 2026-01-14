/**
 * Script: Hive BR Data Fetcher
 * Version: 2.25.6 (Emergency Recovery: Full User Mapping)
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
        console.log("🚀 Iniciando Recuperação de Dados v2.25.6...");

        const lists = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));
        
        // 1. Capturar Delegadores Reais
        const delegations = await callHive('condenser_api.get_vesting_delegations', ['hive-br.voter', '', 1000]);
        
        // 2. Unificar TODOS os nomes (Delegadores + Config)
        const allUsernames = [...new Set([
            ...delegations.map(d => d.delegator),
            ...(lists.verificado_br || []),
            ...(lists.pendente_br || []),
            ...(lists.watchlist || [])
        ])];

        console.log(`📊 Processando ${allUsernames.length} usuários totais...`);

        // 3. Coleta de Detalhes da Conta
        const userDetails = [];
        for (let i = 0; i < allUsernames.length; i += 50) {
            const batch = allUsernames.slice(i, i + 50);
            const accounts = await callHive('condenser_api.get_accounts', [batch]);
            userDetails.push(...accounts);
        }

        const ranking = userDetails.map(acc => {
            const del = delegations.find(d => d.delegator === acc.name);
            const rawPD = acc.next_vesting_withdrawal;
            
            return {
                delegator: acc.name,
                delegated_hp: del ? parseFloat(del.vesting_shares) : 0,
                timestamp: del ? del.min_delegation_time : null,
                total_account_hp: parseFloat(acc.vesting_shares),
                next_withdrawal: (rawPD && !rawPD.startsWith("1970")) ? rawPD : null,
                token_balance: parseFloat(acc.balance),
                last_user_post: acc.last_post,
                last_vote_date: acc.last_vote_time,
                in_curation_trail: (lists.curation_trail || []).includes(acc.name)
            };
        });

        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        fs.writeFileSync(CURRENT_FILE, JSON.stringify(ranking, null, 2));

        const [mainAcc] = await callHive('condenser_api.get_accounts', [['hive-br.voter']]);
        fs.writeFileSync(META_FILE, JSON.stringify({
            last_updated: new Date().toISOString(),
            total_delegators: delegations.length,
            project_account_hp: parseFloat(mainAcc.vesting_shares)
        }, null, 2));

        console.log("✅ Sistema Restaurado com Sucesso.");
    } catch (e) {
        console.error("❌ Falha Crítica:", e);
        process.exit(1);
    }
}

run();
