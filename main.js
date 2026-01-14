/**
 * Script: Hive BR Dashboard Frontend
 * Version: 2.25.12 (Resilient Restoration)
 */

const FRONTEND_VERSION = "2.25.12";
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
        if (!metaRes.ok || !currentRes.ok) throw new Error("Falha na carga dos arquivos JSON");
        const meta = await metaRes.json();
        const ranking = await currentRes.json();
        globalRankingData = ranking;
        globalHistoryData = historyRes.ok ? await historyRes.json() : {};
        renderMeta(meta);
        applySort(); 
        renderRecentActivity(ranking, globalHistoryData);
        calculateTopGainer30d(ranking, globalHistoryData);
    } catch (err) {
        console.error(err);
        document.getElementById('last-updated').textContent = "Erro ao carregar dados.";
    }
}

function renderMeta(meta) {
    const updateEl = document.getElementById('last-updated');
    if (updateEl) {
        updateEl.innerHTML = `Atualizado: ${new Date(meta.last_updated).toLocaleString('pt-BR')}<br><small>v${FRONTEND_VERSION}</small>`;
    }
    updateSafe('stat-community-power', formatNumber(meta.total_hp) + " HP");
    updateSafe('stat-own-hp', formatNumber(meta.project_account_hp) + " HP");
    updateSafe('stat-delegated-hp', formatNumber(meta.total_hp - meta.project_account_hp) + " HP");
    updateSafe('stat-count', meta.total_delegators);
    updateSafe('stat-active-br', meta.active_brazilians || 0);
    updateSafe('stat-trail-count', meta.curation_trail_count || 0);
    updateSafe('stat-votes-current', meta.votes_month_current || 0);
}

function calculateTopGainer30d(ranking, historyData) {
    let topUser = { name: "—", delta: 0 };
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 30);
    const targetKey = targetDate.toISOString().split('T')[0];
    ranking.forEach(user => {
        const hist = historyData[user.delegator];
        if (hist) {
            const dates = Object.keys(hist).filter(d => d !== "2026-01-14").sort();
            if (dates.length > 0) {
                const pastDateKey = dates.reduce((prev, curr) => Math.abs(new Date(curr) - new Date(targetKey)) < Math.abs(new Date(prev) - new Date(targetKey)) ? curr : prev);
                const delta = (user.delegated_hp || 0) - (hist[pastDateKey] || 0);
                if (delta > topUser.delta) topUser = { name: user.delegator, delta: delta };
            }
        }
    });
    const displayEl = document.getElementById('stat-growth');
    if (displayEl) displayEl.innerHTML = topUser.delta > 0 ? `<span style="color:#4dff91; font-weight:bold;">@${topUser.name}</span> <small>(+${Math.floor(topUser.delta)} HP)</small>` : "—";
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
        
        let bonusRank = rank <= 10 ? '+20%' : rank <= 20 ? '+15%' : rank <= 30 ? '+10%' : rank <= 40 ? '+5%' : '—';
        let bonusHbrVal = Math.min(20, Math.floor((user.token_balance || 0) / 10));
        let bonusHbr = bonusHbrVal > 0 ? `+${bonusHbrVal}%` : '—';
        
        let pdHtml = '<span style="opacity:0.2">—</span>';
        if (user.next_withdrawal && !user.next_withdrawal.startsWith("1969") && !user.next_withdrawal.startsWith("1970")) {
            pdHtml = `<span style="color:#ff4d4d; font-size:0.85em;">📉 ${new Date(user.next_withdrawal).toLocaleDateString("pt-BR")}</span>`;
        }

        row.innerHTML = `
            <td class="sticky-col">#${rank} @${user.delegator}</td>
            <td style="color:#4dff91; font-weight:bold;">${formatNumber(user.delegated_hp)}</td>
            <td>${calculateDays(user.timestamp) || 0}d</td>
            <td style="color:#888;">${formatNumber(user.total_account_hp)}</td>
            <td>${pdHtml}</td>
            <td>${formatNumber(user.token_balance)}</td>
            <td>${timeAgo(user.last_user_post)}</td>
            <td>${timeAgo(user.last_vote_date)}</td>
            <td><span class="bonus-tag">${bonusRank}</span></td>
            <td><span class="bonus-tag">${bonusHbr}</span></td>
            <td>${user.in_curation_trail ? '<span class="bonus-tag bonus-trail">+5%</span>' : '—'}</td>
            <td><canvas id="chart-${user.delegator}" width="120" height="40"></canvas></td>
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
            const points = Object.keys(hist).filter(d => d !== "2026-01-14").sort().slice(-7).map(d => hist[d]);
            new Chart(ctx, { type: 'line', data: { labels: points.map((_,i)=>i), datasets: [{ data: points, borderColor: '#4da6ff', borderWidth: 1.5, pointRadius: 0, fill: false }]}, options: { responsive: false, plugins: { legend: { display: false }}, scales: { x: { display: false }, y: { display: false }}, animation: false }});
        }
    });
}

function renderRecentActivity(delegations, historyData) {
    const container = document.getElementById("activity-panel");
    const tbody = document.getElementById("activity-body");
    if(!container || !tbody) return;
    const changes = [];
    delegations.forEach(user => {
        const hist = historyData[user.delegator];
        if (hist) {
            const dates = Object.keys(hist).filter(d => d !== "2026-01-14").sort();
            if (dates.length >= 2) {
                const diff = (user.delegated_hp || 0) - (hist[dates[dates.length-1]] || 0);
                if (Math.abs(diff) >= 5) changes.push({ name: user.delegator, old: hist[dates[dates.length-1]], new: user.delegated_hp, diff });
            }
        }
    });
    if (changes.length > 0) {
        container.style.display = "block";
        tbody.innerHTML = changes.slice(0, 10).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)).map(c => `<tr><td>@${c.name}</td><td>${Math.floor(c.old)}</td><td>${Math.floor(c.new)}</td><td style="color:${c.diff>0?'#4dff91':'#ff4d4d'}">${c.diff>0?'+':''}${Math.floor(c.diff)} HP</td></tr>`).join('');
    }
}

function handleSort(column) {
    if (currentSort.column === column) currentSort.dir = currentSort.dir === 'desc' ? 'asc' : 'desc';
    else { currentSort.column = column; currentSort.dir = 'desc'; }
    applySort();
}

function applySort() {
    globalRankingData.sort((a, b) => {
        let vA = a[currentSort.column] || 0;
        let vB = b[currentSort.column] || 0;
        return currentSort.dir === 'asc' ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
    });
    renderTable(globalRankingData);
}

function setupSearch() {
    const input = document.getElementById('search-input');
    if(input) input.addEventListener('keyup', e => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.delegator-row').forEach(row => row.style.display = row.dataset.name.toLowerCase().includes(term) ? '' : 'none');
    });
}

function updateSafe(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }
function formatNumber(n) { return Math.floor(n || 0).toLocaleString('pt-BR'); }
function calculateDays(ts) { if (!ts) return null; return Math.floor((new Date() - new Date(ts)) / 86400000); }
function timeAgo(ts) { if (!ts || ts.startsWith("1970")) return "—"; const d = Math.floor((new Date() - new Date(ts)) / 86400000); return d === 0 ? "Hoje" : d === 1 ? "Ontem" : `${d}d`; }
