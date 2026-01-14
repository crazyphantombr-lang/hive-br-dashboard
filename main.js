/**
 * Script: Hive BR Dashboard Frontend
 * Version: 2.25.4 (New HBR Rules & Data Transparency)
 * Author: Hive BR
 * Description: Gerencia o ranking com nova regra HBR: +1% a cada 10 tokens (max 20%).
 */

const FRONTEND_VERSION = "2.25.4";
let globalRankingData = [];
let globalHistoryData = {};
let currentSort = { column: 'delegated_hp', dir: 'desc' };

document.addEventListener("DOMContentLoaded", () => {
    loadData();
    setupSearch();
});

async function loadData() {
    try {
        const [metaRes, currentRes, historyRes] = await Promise.all([
            fetch('data/meta.json'),
            fetch('data/current.json'),
            fetch('data/ranking_history.json')
        ]);
        if (!metaRes.ok || !currentRes.ok) throw new Error("Carga de dados falhou");
        const meta = await metaRes.json();
        const ranking = await currentRes.json();
        globalRankingData = ranking;
        globalHistoryData = historyRes.ok ? await historyRes.json() : {};
        renderMeta(meta);
        applySort();
        calculateTopGainer30d(ranking, globalHistoryData);
    } catch (err) {
        console.error(err);
        document.getElementById('last-updated').textContent = "Erro na carga de dados.";
    }
}

function renderMeta(meta) {
    const now = new Date();
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const voteLabel = `VOTOS DISTRIBUÍDOS EM ${months[now.getMonth()].toUpperCase()} ${now.getFullYear()}`;
    
    document.getElementById('lbl-votes-current').textContent = voteLabel;
    document.getElementById('last-updated').innerHTML = `Atualizado: ${now.toLocaleString('pt-BR')}<br><small>v${FRONTEND_VERSION}</small>`;
    
    updateSafe('stat-community-power', formatNumber(meta.total_hp) + " HP");
    updateSafe('stat-own-hp', formatNumber(meta.project_account_hp) + " HP");
    updateSafe('stat-delegated-hp', formatNumber(meta.total_hp - meta.project_account_hp) + " HP");
    updateSafe('stat-count', meta.total_delegators);
    updateSafe('stat-active-br', meta.active_brazilians || 0);
    updateSafe('stat-votes-current', meta.votes_month_current || 0);
    updateSafe('stat-trail-count', meta.curation_trail_count || 0);
}

function calculateTopGainer30d(ranking, historyData) {
    let topUser = { name: "—", delta: 0 };
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 30);
    const targetKey = targetDate.toISOString().split('T')[0];
    ranking.forEach(user => {
        const hist = historyData[user.delegator];
        if (hist) {
            const dates = Object.keys(hist).sort();
            const pastDateKey = dates.reduce((prev, curr) => Math.abs(new Date(curr) - new Date(targetKey)) < Math.abs(new Date(prev) - new Date(targetKey)) ? curr : prev);
            const delta = (user.delegated_hp || 0) - (hist[pastDateKey] || 0);
            if (delta > topUser.delta) topUser = { name: user.delegator, delta: delta };
        }
    });
    const displayEl = document.getElementById('stat-growth');
    if (displayEl) displayEl.innerHTML = topUser.delta > 0 ? `<span style="color:#4dff91;">@${topUser.name}</span> <small>(+${Math.floor(topUser.delta)})</small>` : "—";
}

function renderTable(data) {
    const tbody = document.getElementById('ranking-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rankMap = new Map();
    [...data].sort((a, b) => b.delegated_hp - a.delegated_hp).forEach((u, i) => rankMap.set(u.delegator, i + 1));
    
    data.forEach(user => {
        const rank = rankMap.get(user.delegator);
        const row = document.createElement('tr');
        row.className = 'delegator-row';
        row.dataset.name = user.delegator;
        
        // Bônus Posicional
        let bonusRankHtml = '<span style="opacity:0.2">—</span>';
        if (rank <= 10) bonusRankHtml = '<span class="bonus-tag bonus-gold">+20%</span>';
        else if (rank <= 20) bonusRankHtml = '<span class="bonus-tag bonus-silver">+15%</span>';
        else if (rank <= 30) bonusRankHtml = '<span class="bonus-tag bonus-bronze">+10%</span>';
        else if (rank <= 40) bonusRankHtml = '<span class="bonus-tag bonus-honor">+5%</span>';

        /**
         * [BUSINESS RULE v2.25.4 - NEW HBR RATIO]
         * Formula: $$Bonus = \min(20, \lfloor \text{Stake} / 10 \rfloor)$$
         */
        let bonusHbrHtml = '<span style="opacity:0.2">—</span>';
        const hbrValue = Math.min(20, Math.floor((user.token_balance || 0) / 10));
        if (hbrValue > 0) {
            bonusHbrHtml = `<span class="bonus-tag bonus-hbr">+${hbrValue}%</span>`;
        }

        let bonusTrailHtml = '<span style="opacity:0.2">—</span>';
        if (user.in_curation_trail) {
            bonusTrailHtml = '<span class="bonus-tag bonus-trail">+5%</span>';
        }

        row.innerHTML = `
            <td class="sticky-col">
                <span style="color:#666; font-weight:bold; width:25px; display:inline-block;">#${rank}</span>
                <img src="https://images.hive.blog/u/${user.delegator}/avatar/small" style="width:20px; border-radius:50%; margin-right:5px;">
                <a href="https://peakd.com/@${user.delegator}" target="_blank">@${user.delegator}</a>
            </td>
            <td style="font-weight:bold; color:#4dff91;">${formatNumber(user.delegated_hp)}</td>
            <td>${calculateDays(user.timestamp) || 0}d</td>
            <td style="color:#888;">${formatNumber(user.total_account_hp)}</td>
            <td>${user.next_withdrawal && !user.next_withdrawal.startsWith("19") ? '📉' : '—'}</td>
            <td>${formatNumber(user.token_balance)}</td>
            <td>${timeAgo(user.last_user_post)}</td>
            <td>${timeAgo(user.last_vote_date)}</td>
            <td>${bonusRankHtml}</td>
            <td>${bonusHbrHtml}</td>
            <td>${bonusTrailHtml}</td>
            <td><canvas id="chart-${user.delegator}" width="100" height="30"></canvas></td>
        `;
        tbody.appendChild(row);
    });
    renderGraphs(data, globalHistoryData);
}

function renderGraphs(data, historyData) {
    data.forEach(user => {
        const ctx = document.getElementById(`chart-${user.delegator}`);
        if (ctx) {
            const hist = historyData[user.delegator] || {};
            const points = Object.values(hist).slice(-7);
            new Chart(ctx, { type: 'line', data: { labels: points.map((_,i)=>i), datasets: [{ data: points, borderColor: '#4da6ff', borderWidth: 1, pointRadius: 0, fill: false }]}, options: { responsive: false, plugins: { legend: { display: false }}, scales: { x: { display: false }, y: { display: false }}, animation: false }});
        }
    });
}

function handleSort(column) {
    if (currentSort.column === column) currentSort.dir = currentSort.dir === 'desc' ? 'asc' : 'desc';
    else { currentSort.column = column; currentSort.dir = 'desc'; }
    applySort();
}

function applySort() {
    globalRankingData.sort((a, b) => {
        let vA = getSortValue(a, currentSort.column);
        let vB = getSortValue(b, currentSort.column);
        return currentSort.dir === 'asc' ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
    });
    renderTable(globalRankingData);
}

function getSortValue(obj, col) {
    if (['timestamp', 'last_user_post', 'last_vote_date'].includes(col)) return new Date(obj[col] || 0).getTime();
    return obj[col] || 0;
}

function setupSearch() {
    document.getElementById('search-input').addEventListener('keyup', e => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.delegator-row').forEach(row => row.style.display = row.dataset.name.toLowerCase().includes(term) ? '' : 'none');
    });
}

function updateSafe(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function formatNumber(n) { return Math.floor(n || 0).toLocaleString('pt-BR'); }
function calculateDays(ts) { if (!ts) return 0; return Math.floor((new Date() - new Date(ts)) / 86400000); }
function timeAgo(ts) { if (!ts) return "—"; const d = Math.floor((new Date() - new Date(ts)) / 86400000); return d === 0 ? "Hoje" : d === 1 ? "Ontem" : `${d}d`; }
