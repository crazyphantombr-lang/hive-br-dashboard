/**
 * Script: Hive BR Dashboard Frontend
 * Version: 2.25.6 (Emergency Recovery & Date Shield)
 */

const FRONTEND_VERSION = "2.25.6";
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
        if (!metaRes.ok || !currentRes.ok) throw new Error("Erro de carga");
        const meta = await metaRes.json();
        const ranking = await currentRes.json();
        globalRankingData = ranking;
        globalHistoryData = historyRes.ok ? await historyRes.json() : {};
        renderMeta(meta);
        applySort();
        calculateTopGainer30d(ranking, globalHistoryData);
    } catch (err) {
        console.error("Falha ao iniciar dashboard:", err);
    }
}

function renderMeta(meta) {
    const now = new Date();
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const voteLabel = `VOTOS DISTRIBUÍDOS EM ${months[now.getMonth()].toUpperCase()} ${now.getFullYear()}`;
    
    const lblVotes = document.getElementById('lbl-votes-current');
    if (lblVotes) lblVotes.textContent = voteLabel;
    
    document.getElementById('last-updated').innerHTML = `Atualizado: ${now.toLocaleString('pt-BR')}<br><small>v${FRONTEND_VERSION}</small>`;
    
    updateSafe('stat-community-power', formatNumber(meta.total_hp) + " HP");
    updateSafe('stat-own-hp', formatNumber(meta.project_account_hp) + " HP");
    updateSafe('stat-delegated-hp', formatNumber(meta.total_hp - meta.project_account_hp) + " HP");
    updateSafe('stat-count', meta.total_delegators);
    updateSafe('stat-active-br', meta.active_brazilians || 0);
    updateSafe('stat-votes-current', meta.votes_month_current || 0);
    updateSafe('stat-trail-count', meta.curation_trail_count || 0);
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
        
        // Bônus
        let bonusRank = rank <= 10 ? '+20%' : rank <= 20 ? '+15%' : rank <= 30 ? '+10%' : rank <= 40 ? '+5%' : '—';
        let bonusHbr = Math.min(20, Math.floor((user.token_balance || 0) / 10));
        let pdHtml = '—';
        
        // Proteção 31/12: Só exibe se houver data válida e futura
        if (user.next_withdrawal) {
            const pdDate = new Date(user.next_withdrawal);
            if (!isNaN(pdDate) && pdDate > new Date()) {
                const days = calculateDaysUntil(user.next_withdrawal);
                pdHtml = `<span class="pd-active">📉 ${pdDate.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})} (${days}d)</span>`;
            }
        }

        row.innerHTML = `
            <td class="sticky-col">#${rank} @${user.delegator}</td>
            <td style="color:#4dff91; font-weight:bold;">${formatNumber(user.delegated_hp)}</td>
            <td>${calculateDaysSince(user.timestamp)}d</td>
            <td>${formatNumber(user.total_account_hp)}</td>
            <td>${pdHtml}</td>
            <td>${formatNumber(user.token_balance)}</td>
            <td>${timeAgo(user.last_user_post)}</td>
            <td>${timeAgo(user.last_vote_date)}</td>
            <td><span class="bonus-tag">${bonusRank}</span></td>
            <td><span class="bonus-tag">${bonusHbr > 0 ? '+' + bonusHbr + '%' : '—'}</span></td>
            <td><span class="bonus-tag">${user.in_curation_trail ? '+5%' : '—'}</span></td>
            <td><canvas id="chart-${user.delegator}" width="80" height="25"></canvas></td>
        `;
        tbody.appendChild(row);
    });
}

function timeAgo(ts) {
    if (!ts || ts.startsWith("1970")) return "—";
    const diff = new Date() - new Date(ts);
    if (diff < 0) return "Agora"; // Proteção contra o erro -1
    const days = Math.floor(diff / 86400000);
    return days === 0 ? "Hoje" : days === 1 ? "Ontem" : `${days}d`;
}

function updateSafe(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function formatNumber(n) { return Math.floor(n || 0).toLocaleString('pt-BR'); }
function calculateDaysSince(ts) { if (!ts) return 0; return Math.floor((new Date() - new Date(ts)) / 86400000); }
function calculateDaysUntil(ts) { const d = Math.ceil((new Date(ts) - new Date()) / 86400000); return d < 0 ? 0 : d; }

function handleSort(column) {
    currentSort.dir = (currentSort.column === column && currentSort.dir === 'desc') ? 'asc' : 'desc';
    currentSort.column = column;
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
    document.getElementById('search-input').addEventListener('keyup', e => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.delegator-row').forEach(row => row.style.display = row.dataset.name.toLowerCase().includes(term) ? '' : 'none');
    });
}
