// File: main.js
/**
 * Script: Hive BR Dashboard Frontend
 * Version: 2.24.1 (Doc: Critical Rules & Safety Comments)
 * Author: Hive BR
 * License: MIT
 * Description: Versão idêntica à 2.24.0 em funcionalidade.
 * ADICIONADO: Comentários de "Auto-Recuperação" e Travas de Segurança para Regras de Negócio Críticas.
 * Use estes comentários para reaprender o contexto em caso de perda de memória.
 */

const FRONTEND_VERSION = "2.24.1";

/* * [ARCHITECTURAL NOTE - GLOBAL STATE]
 * Mantemos os dados em memória (globalRankingData) para permitir ordenação (sort)
 * instantânea no cliente sem necessidade de recarregar o JSON (fetch).
 * O 'currentSort' rastreia o estado da UI.
 */
let globalRankingData = [];
let globalHistoryData = {};
let currentSort = { column: 'delegated_hp', dir: 'desc' };

document.addEventListener("DOMContentLoaded", () => {
    loadData();
    setupSearch();
});

async function loadData() {
    try {
        /*
         * [DEPENDENCY NOTE]
         * O sistema requer 3 arquivos:
         * 1. meta.json: Cabeçalhos, totais e versão do backend.
         * 2. current.json: O snapshot atual dos delegadores.
         * 3. ranking_history.json: Dados históricos (time-series) para os gráficos.
         */
        const [metaRes, currentRes, historyRes] = await Promise.all([
            fetch('data/meta.json'),
            fetch('data/current.json'),
            fetch('data/ranking_history.json')
        ]);

        if (!metaRes.ok || !currentRes.ok) throw new Error("Falha ao carregar dados essenciais");

        const meta = await metaRes.json();
        const ranking = await currentRes.json();
        
        // Armazena dados globalmente para manipulação (sort/search)
        globalRankingData = ranking;
        // Histórico é opcional para o funcionamento da tabela, mas vital para o gráfico
        globalHistoryData = historyRes.ok ? await historyRes.json() : {};

        renderMeta(meta);
        
        // Inicializa com a ordenação padrão e desenha o painel de atividade
        applySort(); 
        renderRecentActivity(ranking, globalHistoryData);

    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        const updateEl = document.getElementById('last-updated');
        if (updateEl) updateEl.textContent = "Erro ao carregar dados. Tente recarregar.";
    }
}

function renderMeta(meta) {
    const dateStr = new Date(meta.last_updated).toLocaleString('pt-BR');
    // Exibe versão do Backend para facilitar debug de incompatibilidade entre Core/UI
    const backendVer = meta.versions ? meta.versions.backend : "vLegacy";
    
    const updateEl = document.getElementById('last-updated');
    if (updateEl) {
        updateEl.innerHTML = `
            Atualizado em: ${dateStr}<br>
            <span style="font-size: 0.75em; opacity: 0.6; font-weight: normal;">
                Core: v${backendVer} | UI: v${FRONTEND_VERSION}
            </span>
        `;
    }

    updateSafe('stat-community-power', formatNumber(meta.total_hp) + " HP");
    updateSafe('stat-own-hp', formatNumber(meta.project_account_hp) + " HP");
    updateSafe('stat-delegated-hp', formatNumber(meta.total_hp - meta.project_account_hp) + " HP");
    updateSafe('stat-count', meta.total_delegators);
    updateSafe('stat-active-br', meta.active_brazilians || 0);

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const now = new Date();
    
    updateSafe('lbl-votes-current', (monthNames[now.getMonth()] + " " + now.getFullYear()).toUpperCase());
    updateSafe('stat-votes-current', meta.votes_month_current || 0);
    updateSafe('stat-trail-count', meta.curation_trail_count || 0);

    const d1 = new Date(); d1.setMonth(d1.getMonth() - 1);
    const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);
    
    updateSafe('lbl-votes-m1', `${monthNames[d1.getMonth()]} ${d1.getFullYear()}`);
    updateSafe('lbl-votes-m2', `${monthNames[d2.getMonth()]} ${d2.getFullYear()}`);
    
    updateSafe('stat-votes-m1', meta.votes_month_prev1 || 0);
    updateSafe('stat-votes-m2', meta.votes_month_prev2 || 0);
    updateSafe('stat-votes-24h', meta.votes_24h || 0); 
}

function renderRecentActivity(delegations, historyData) {
    const container = document.getElementById("activity-panel");
    const tbody = document.getElementById("activity-body");
    if(!container || !tbody) return;

    const changes = [];
    // Filtro de Ruído: Mudanças menores que 5 HP são ignoradas para limpar a visualização
    const NOISE_THRESHOLD = 5.0; 
    const DAYS_BACK = 7; 

    delegations.forEach(user => {
        const hist = historyData[user.delegator];
        if (hist) {
            const dates = Object.keys(hist).sort();
            if (dates.length >= 2) {
                const latestIndex = dates.length - 1;
                // Busca o registro de 7 dias atrás ou o mais antigo disponível
                let compareIndex = latestIndex - DAYS_BACK;
                if (compareIndex < 0) compareIndex = 0;
                
                if (compareIndex === latestIndex) return;

                const todayHP = hist[dates[latestIndex]];
                const pastHP = hist[dates[compareIndex]];
                const diff = todayHP - pastHP;

                if (Math.abs(diff) >= NOISE_THRESHOLD) {
                    changes.push({ name: user.delegator, old: pastHP, new: todayHP, diff: diff });
                }
            }
        }
    });

    if (changes.length === 0) { 
        container.style.display = "none"; 
        return; 
    }

    container.style.display = "block";
    // Ordena visualmente pelas maiores mudanças (magnitude)
    changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    tbody.innerHTML = "";

    changes.slice(0, 10).forEach(change => {
        const tr = document.createElement("tr");
        const signal = change.diff > 0 ? "+" : "";
        const color = change.diff > 0 ? "#4dff91" : "#ff4d4d";

        tr.innerHTML = `
            <td>
                <a href="https://peakd.com/@${change.name}" target="_blank" style="color:inherit; text-decoration:none;">
                    @${change.name}
                </a>
            </td>
            <td style="color:#888;">${Math.floor(change.old)}</td>
            <td style="font-weight:bold">${Math.floor(change.new)}</td>
            <td style="color:${color}; font-weight:bold;">${signal}${Math.floor(change.diff)} HP</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTable(data) {
    const tbody = document.getElementById('ranking-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    /* * [LOGIC RELEARN TRACE - RANKING CALCULATION]
     * Precisamos calcular o Rank REAL baseado estritamente no HP Delegado.
     * Motivo: Se o usuário ordenar a tabela por Nome ou Data, o bônus dele
     * NÃO pode mudar. O bônus é atrelado à posição de poder, não à visualização.
     * Por isso criamos o 'rankMap' antes de iterar a tabela ordenada.
     */
    const rankMap = new Map();
    const sortedByHp = [...data].sort((a, b) => b.delegated_hp - a.delegated_hp);
    sortedByHp.forEach((u, i) => rankMap.set(u.delegator, i + 1));

    data.forEach((user, index) => {
        const row = document.createElement('tr');
        row.className = 'delegator-row';
        row.dataset.name = user.delegator;

        const days = calculateDays(user.timestamp);
        const daysLabel = days === null ? '<span style="opacity:0.5">-</span>' : `${days} dias`;
        
        const isBr = user.country_code === 'BR_CERT';
        const flag = isBr ? '<span title="Brasileiro Verificado" style="margin-left:5px; font-size:1.1em; cursor:help;">🇧🇷</span>' : '<span class="flag-bw" title="Pendente" style="margin-left:5px; font-size:1.1em; cursor:help;">🇧🇷</span>';
        const veteranBadge = (days > 365) ? ' <span class="veteran-badge" title="Estabilidade > 1 ano">🎖️</span>' : '';

        const lastVote = user.last_vote_date ? timeAgo(user.last_vote_date) : '<span style="color:#666; font-size:0.8em; opacity:0.5; font-weight:bold;">SEM DADOS</span>';
        const lastActivity = user.last_user_post ? timeAgo(user.last_user_post) : '<span style="color:#444; font-size:0.85em">Sem posts</span>';

        const pdDate = user.next_withdrawal;
        let pdHtml = '<span style="opacity:0.2">—</span>';
        // Filtra datas de epoch (1970) que indicam null/undefined no backend
        if (pdDate && !pdDate.startsWith("1969") && !pdDate.startsWith("1970")) {
             const dateObj = new Date(pdDate);
             pdHtml = `<span style="color:#ff4d4d; font-size:0.85em;">📉 ${dateObj.toLocaleDateString("pt-BR")}</span>`;
        }

        const hpVal = user.delegated_hp;
        
        // Recupera o rank real calculado anteriormente
        const rank = rankMap.get(user.delegator) || 999;
        
        /* * [CRITICAL BUSINESS RULE - DELEGATION BONUS]
         * =================================================================
         * TIPO: Ranking Posicional (Não usar faixas fixas de HP)
         * LÓGICA:
         * - 1º ao 10º:  +20% (Gold)
         * - 11º ao 20º: +15% (Silver)
         * - 21º ao 30º: +10% (Bronze)
         * - 31º ao 40º: +5%  (Honor)
         *
         * PROTOCOLO DE SEGURANÇA:
         * Esta lógica é IMUTÁVEL. Qualquer alteração nestes valores ou lógica
         * requer:
         * 1. Solicitação explícita do usuário.
         * 2. Confirmação em DUAS ETAPAS ("Você tem certeza? Isso altera regras principais.").
         * =================================================================
         */
        let bonusBadge = '<span style="opacity:0.3; font-size:0.8em">—</span>';
        
        if (rank <= 10) bonusBadge = '<span class="bonus-tag bonus-gold">+20%</span>';
        else if (rank <= 20) bonusBadge = '<span class="bonus-tag bonus-silver">+15%</span>';
        else if (rank <= 30) bonusBadge = '<span class="bonus-tag bonus-bronze">+10%</span>';
        else if (rank <= 40) bonusBadge = '<span class="bonus-tag bonus-honor">+5%</span>';

        let hbrBadge = '<span style="opacity:0.3; font-size:0.8em">—</span>';
        if (user.token_balance > 0) {
             const hbrTier = Math.min(20, Math.floor(user.token_balance / 1000)); 
             if (hbrTier > 0) hbrBadge = `<span class="bonus-tag bonus-hbr">+${hbrTier}%</span>`;
        }

        row.innerHTML = `
            <td class="sticky-col">
                <span style="color:#666; margin-right:8px; font-weight:bold;">#${rank}</span>
                <img src="https://images.hive.blog/u/${user.delegator}/avatar/small" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
                <a href="https://peakd.com/@${user.delegator}" target="_blank">@${user.delegator}</a>
                ${flag}
            </td>
            <td style="font-weight:bold; font-family:monospace; font-size:1.1em; color:${hpVal > 0 ? '#4dff91' : '#666'};">
                ${formatNumber(hpVal)}
            </td>
            <td style="font-size:0.9em;">${daysLabel}${veteranBadge}</td>
            <td style="font-family:monospace; color:#888;">${formatNumber(user.total_account_hp)} HP</td>
            <td style="text-align:center;">${pdHtml}</td>
            <td style="font-family:monospace; color:${user.token_balance > 0 ? '#4da6ff' : '#444'}; ${user.token_balance > 0 ? 'font-weight:bold;' : ''}">
                ${formatNumber(user.token_balance)}
            </td>
            <td>${lastActivity}</td>
            <td>${lastVote}</td>
            <td>${bonusBadge}</td>
            <td>${hbrBadge}</td>
            <td>${user.in_curation_trail ? '<span class="bonus-tag bonus-trail">+5%</span>' : '<span style="opacity:0.3; font-size:0.8em">—</span>'}</td>
            <td style="width:140px;">
                <canvas id="chart-${user.delegator}" width="120" height="40"></canvas>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Renderiza gráficos após montar o DOM
    renderGraphs(data, globalHistoryData);
}

function renderGraphs(data, historyData) {
    data.forEach(user => {
        const ctx = document.getElementById(`chart-${user.delegator}`);
        if (ctx) {
            let points = [];
            
            // [LOGIC] Usa dados reais do ranking_history.json
            if (historyData[user.delegator]) {
                const dates = Object.keys(historyData[user.delegator]).sort();
                // Pega os últimos 7 dias
                const recentDates = dates.slice(-7);
                points = recentDates.map(d => historyData[user.delegator][d]);
            }

            // Fallback: Se o usuário for novo, preenche com o valor atual para a linha não quebrar
            if (points.length === 0) {
                points = Array(7).fill(user.delegated_hp);
            } else if (points.length < 7) {
                // Preenchimento à esquerda (left-pad) com o dado mais antigo para completar 7 pontos
                const missing = 7 - points.length;
                const firstVal = points[0];
                points = [...Array(missing).fill(firstVal), ...points];
            }

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [1,2,3,4,5,6,7],
                    datasets: [{
                        data: points,
                        borderColor: user.delegated_hp > 0 ? '#4da6ff' : '#333',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.2,
                        fill: false
                    }]
                },
                options: {
                    responsive: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: { x: { display: false }, y: { display: false } },
                    layout: { padding: 0 },
                    animation: false
                }
            });
        }
    });
}

function updateSafe(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function formatNumber(num) {
    if (num === null || num === undefined) return "0";
    return parseFloat(num).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function calculateDays(timestamp) {
    if (!timestamp) return null;
    const start = new Date(timestamp);
    const now = new Date();
    const diff = now - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function timeAgo(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 86400 && date.getDate() === now.getDate()) {
        return '<span style="color:#4dff91; font-weight:bold;">Hoje</span>';
    }
    if (seconds < 172800) { 
         return '<span style="color:#4dff91;">Ontem</span>';
    }

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " anos atrás";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses atrás";
    interval = seconds / 86400;
    if (interval > 1) return `<span style="color:#ccc; font-size:0.9em;">${Math.floor(interval)} dias atrás</span>`;
    return "Recentemente";
}

function handleSort(column) { 
    // Lógica toggle: Se clicar na mesma coluna, inverte. Se mudar, reseta para descendente.
    if (currentSort.column === column) {
        currentSort.dir = currentSort.dir === 'desc' ? 'asc' : 'desc';
    } else {
        currentSort.column = column;
        currentSort.dir = 'desc';
    }

    // Gerenciamento visual das setas de ordenação
    document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
    const activeHeader = document.querySelector(`th[onclick="handleSort('${column}')"] .sort-icon`);
    if (activeHeader) {
        activeHeader.textContent = currentSort.dir === 'desc' ? ' ▼' : ' ▲';
    }

    applySort();
}

function applySort() {
    if (!globalRankingData.length) return;

    const col = currentSort.column;
    const dir = currentSort.dir;

    globalRankingData.sort((a, b) => {
        let valA = getSortValue(a, col);
        let valB = getSortValue(b, col);

        if (typeof valA === 'string') {
            return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return dir === 'asc' ? valA - valB : valB - valA;
        }
    });

    renderTable(globalRankingData);
}

function getSortValue(obj, col) {
    // [HELPER] Normaliza os valores para garantir que a ordenação funcione
    // independentemente de o dado vir como string numérica ou data.
    switch(col) {
        case 'delegator': return obj.delegator.toLowerCase();
        case 'timestamp': return new Date(obj.timestamp || 0).getTime();
        case 'last_vote_date': return new Date(obj.last_vote_date || 0).getTime();
        case 'last_user_post': return new Date(obj.last_user_post || 0).getTime();
        case 'next_withdrawal': return new Date(obj.next_withdrawal || 0).getTime();
        default: return obj[col] || 0;
    }
}

function setupSearch() {
    const input = document.getElementById('search-input');
    if(!input) return;
    input.addEventListener('keyup', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('.delegator-row');
        rows.forEach(row => {
            row.style.display = row.dataset.name.toLowerCase().includes(term) ? '' : 'none';
        });
    });
}
