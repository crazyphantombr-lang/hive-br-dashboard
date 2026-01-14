/**
 * Script: Hive BR Data Fetcher
 * Version: 2.25.8 (Real HP & Incoming Delegation Correction)
 * Author: Hive BR
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
        console.log("🚀 Iniciando Coleta v2.25.8 com Conversão de HP...");

        // 1. Cálculo dinâmico do fator de conversão de HP
        const props = await callHive('condenser_api.get_dynamic_global_properties', []);
        const tvf = parseFloat(props.total_vesting_fund_hive);
        const tvs = parseFloat(props.total_vesting_shares);
        const hp_per_vest = tvf / tvs;

        const lists = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));
        const verified = lists.verificado_br || [];

        // 2. Capturar delegações RECEBIDAS
        // Para este dashboard, precisamos saber quem delegou PARA @hive-br.voter
        // Usamos database_api para listar delegações de entrada.
        const delegationsRes = await callHive('database_api.list_vesting_delegations', {
            start: ["hive-br.voter", ""],
            limit: 1000,
            order: "by_received"
        });
        
        const incomingDelegations = delegationsRes.delegations || [];
        const delegatorNames = incomingDelegations.map(d => d.delegator);

        // 3. Unificar usuários para coleta de perfis
        const allUsernames = [...new Set([...verified, ...delegatorNames])];
        const userDetails = [];
        for (let i = 0; i < allUsernames.length; i += 50) {
            const batch = allUsernames.slice(i, i + 50);
            const accounts = await callHive('condenser_api.get_accounts', [batch]);
            userDetails.push(...accounts);
        }

        const ranking = userDetails.map(acc => {
            const delEntry = incomingDelegations.find(d => d.delegator === acc.name);
            
            // Conversão Correta: Vests * Fator = HP
            const delegatedVests = delEntry ? parseFloat(delEntry.vesting_shares) : 0;
            const delegatedHp = delegatedVests * hp_per_vest;
            const accountVests = parseFloat(acc.vesting_shares);
            const accountHp = accountVests * hp_per_vest;

            return {
                delegator: acc.name,
                delegated_hp: delegatedHp,
                timestamp: delEntry ? delEntry.min_delegation_time : null,
                total_account_hp: accountHp,
                next_withdrawal: acc.next_vesting_withdrawal,
                token_balance: parseFloat(acc.balance), // Placeholder para HBR
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
            total_delegators: delegatorNames.length,
            project_account_hp: parseFloat(mainAcc.vesting_shares) * hp_per_vest,
            total_hp: (parseFloat(mainAcc.vesting_shares) + parseFloat(mainAcc.received_vesting_shares)) * hp_per_vest
        }, null, 2));

        console.log(`✅ Coleta v2.25.8 finalizada: ${ranking.length} perfis.`);
    } catch (error) {
        console.error("❌ Falha crítica na coleta:", error);
        process.exit(1);
    }
}
run();
