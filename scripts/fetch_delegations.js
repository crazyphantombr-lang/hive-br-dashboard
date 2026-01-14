/**
 * Script: Hive BR Data Fetcher
 * Version: 2.25.5 (Bugfix: Power Down Mapping)
 * Author: Hive BR
 * Description: Captura delegadores, stake e o campo correto de Power Down da API Condenser.
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
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: 1
        })
    });
    const json = await response.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    return json.result;
}

async function run() {
    try {
        console.log("🚀 Iniciando Coleta v2.25.5...");

        if (!fs.existsSync(LISTS_FILE)) {
            console.error("ERRO: config/lists.json não encontrado.");
            process.exit(1);
        }
        const lists = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));
        const targetAccounts = lists.verificado_br || [];

        const [mainAccount] = await callHive('condenser_api.get_accounts', [['hive-br.voter']]);
        const delegations = await callHive('condenser_api.get_vesting_delegations', ['hive-br.voter', '', 1000]);
        const delegatorNames = delegations.map(d => d.delegator);

        const allUsernames = [...new Set([...targetAccounts, ...delegatorNames])];
        const userDetails = [];
        
        for (let i = 0; i < allUsernames.length; i += 50) {
            const batch = allUsernames.slice(i, i + 50);
            const accounts = await callHive('condenser_api.get_accounts', [batch]);
            userDetails.push(...accounts);
        }

        const ranking = userDetails.map(acc => {
            const del = delegations.find(d => d.delegator === acc.name);
            
            /**
             * [FIELD FIX v2.25.5]
             * O campo next_vesting_withdrawal retorna '1970-01-01T00:00:00' quando inativo.
             */
            const rawPD = acc.next_vesting_withdrawal;
            const isPDActive = rawPD && !rawPD.startsWith("1970");

            return {
                delegator: acc.name,
                delegated_hp: del ? parseFloat(del.vesting_shares) : 0,
                timestamp: del ? del.min_delegation_time : null,
                total_account_hp: parseFloat(acc.vesting_shares),
                next_withdrawal: isPDActive ? rawPD : null, // Mapeado para o frontend
                token_balance: parseFloat(acc.balance), 
                last_user_post: acc.last_post,
                last_vote_date: acc.last_vote_time,
                in_curation_trail: (lists.curation_trail || []).includes(acc.name)
            };
        });

        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        fs.writeFileSync(CURRENT_FILE, JSON.stringify(ranking, null, 2));

        const meta = {
            last_updated: new Date().toISOString(),
            total_delegators: delegatorNames.length,
            project_account_hp: parseFloat(mainAccount.vesting_shares),
            active_brazilians: 0 // Será populado pelo script de merge
        };
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

        console.log(`✅ Coleta v2.25.5 finalizada.`);

    } catch (error) {
        console.error("Falha Crítica:", error);
        process.exit(1);
    }
}

run();
