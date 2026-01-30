// File: public/main.js
/**
 * Hive BR Dashboard - Main Script
 * Version: 2.30.1 (Fix: Restored Missing Functions)
 * Author: Hive BR
 * License: MIT
 */

// Configurações Globais
const CONFIG = {
    API_URL: './data/current.json',
    META_URL: './data/meta.json',
    UI_VERSION: "2.30.1" 
};

// Cache para nomes de países
const regionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' });

// --- LÓGICA UNIVERSAL DE BANDEIRAS ---
function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🏳️';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

function getCountryInfo(rawCode) {
    let cleanCode = rawCode ? rawCode.replace("_CERT", "").toUpperCase() : "GLOBAL";
    
    if (cleanCode === "GLOBAL" || cleanCode === "NULL") {
        return { flag: "🏳️", name: "Global / Não Identificado" };
    }

    try {
        const flag = getFlagEmoji(cleanCode);
        const name = regionNames.of(cleanCode);
        return { flag, name };
    } catch (e) {
        return { flag: "🏳️", name: cleanCode };
    }
}

// Formatação de Números
const formatVal = (val) => new Intl.NumberFormat('pt-BR').format(val);
const formatHP = (val) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(val);

// Referências DOM
const els = {
    lastUpdated: document.getElementById('last-updated'),
    communityPower: document.getElementById('stat-community-power'),
    ownHp: document.getElementById('stat-own-hp'),
    delegatedHp: document.getElementById('stat-delegated-hp'),
    delegatorsCount: document.getElementById('stat-count'),
    growth: document.getElementById('stat-growth'),
    rankingBody: document.getElementById('ranking-body'),
    searchInput: document.getElementById('search-input'),
    activeBr: document.getElementById('stat-active-br'),
    votes24h: document.getElementById('stat-votes-24h'),
    votesCurrent: document.getElementById('stat-votes-current'),
    votesM1: document.getElementById('stat-votes-m1'),
    votesM2: document.getElementById('stat-votes-m2'),
    labelCurrent: document.getElementById('lbl-votes-current'),
    labelM1: document.getElementById('lbl-votes-m1'),
    labelM2: document.getElementById('lbl-votes-m2'),
    trailCount: document.getElementById('stat-trail-count'),
    activityPanel: document.getElementById('activity-panel'),
    activityBody: document.getElementById('activity-body')
};

let globalData = [];

// --- INICIALIZAÇÃO ---
async function init() {
    try {
        await loadMeta();
        await loadData();
        setupSearch();
    } catch (e) {
        console.error("Erro na inicialização:", e);
        if(els.lastUpdated) els.lastUpdated.innerHTML = `<span style="color:#ff4d4d">Erro ao carregar dados. Verifique o console.</span>`;
    }
}

async function loadMeta() {
    const res = await fetch(CONFIG.META_URL);
    const meta = await res.json();
    
    const date = new Date(meta.last_updated);
    els.lastUpdated.innerHTML = `
        Atualizado em: ${date.toLocaleString('pt-BR')}<br>
        <span style="font-size: 0.75em; opacity: 0.6; font-weight: normal;">
            Core: v${meta.versions?.backend || '?'} | UI: v${CONFIG.UI_VERSION}
        </span>
    `;

    els.communityPower.innerText = `${formatHP(meta.project_account_hp + meta.total_hp)} HP`;
    els.ownHp.innerText = `${formatHP(meta.project_account_hp)} HP`;
    els.delegatedHp.innerText = `${formatHP(meta.total_hp)} HP`;
    els.delegatorsCount.innerText = meta.total_delegators;
    els.activeBr.innerText = meta.active_brazilians || 0;
    els.trailCount.innerText = meta.curation_trail_count || 0;

    els.votes24h.innerText = meta.votes_24h || 0;
    
    // Labels Meses
    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const now = new Date();
    
    const currentMonth = monthNames[now.getMonth()];
    const m1Date = new Date(); m1Date.setMonth(now.getMonth() - 1);
    const m2Date = new Date(); m2Date.setMonth(now.getMonth() - 2);
    
    els.labelCurrent.innerText = `Votos em ${currentMonth} ${now.getFullYear()}`;
    els.labelM1.innerText = `Votos em ${monthNames[m1Date.getMonth()]} ${m1Date.getFullYear()}`;
    els.labelM2.innerText = `Votos em ${monthNames[m2Date.getMonth()]} ${m2Date.getFullYear()}`;

    els.votesCurrent.innerText = meta.votes_month_current || 0;
    els.votesM1.innerText = meta.votes_month_prev1 || 0;
    els.votesM2.innerText = meta.votes_month_prev2 || 0;

    // AQUI ESTAVA O ERRO: Chamada sem definição
    // Agora a função existe abaixo
    if (meta.activity_log) {
        renderActivityTable(meta.activity_log);
    } else {
        els.activityPanel.style.display = 'none';
    }
}

async function loadData() {
    const res = await fetch(CONFIG.API_URL);
    globalData = await res.json();
    
    if (globalData.length > 0) {
        const topUser = globalData[0];
        els.growth.innerHTML = `
            <a href="https://peakd.com/@${topUser.delegator}" target="_blank" style="color:inherit; text-decoration:none;">
                @${topUser.delegator}
            </a>
            <div style="font-size:0.6em; color:var(--accent-green); margin-top:2px;">
                Top Delegador
            </div>
        `;
    }

    renderTable(globalData);
}

// --- FUNÇÃO RESTAURADA (ACTIVITY TABLE) ---
function renderActivityTable(logs) {
    if (!logs || logs.length === 0) {
        els.activityPanel.style.display = 'none';
        return;
    }
    
    els.activityPanel.style.display = 'block';
    els.activityBody.innerHTML = '';
    
    logs.forEach(log => {
        const tr = document.createElement('tr');
        const diff = log.diff || (log.new_val - log.old_val);
        const isPos = diff > 0;
        
        tr.innerHTML = `
            <td>
                <a href="https://peakd.com/@${log.user}" target="_blank" style="color:inherit; text-decoration:none;">
                    @${log.user}
                </a>
            </td>
            <td style="color:#888;">${formatVal(log.old_val)}</td>
            <td style="font-weight:bold">${formatVal(log.new_val)}</td>
            <td style="color:${isPos ? '#4dff91' : '#ff4d4d'}; font-weight:bold;">
                ${isPos ? '+' : ''}${formatVal(diff)} HP
            </td>
        `;
        els.activityBody.appendChild(tr);
    });
}

function renderTable(data) {
    els.rankingBody.innerHTML = '';
    
    data.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = 'delegator-row';
        tr.dataset.name = item.delegator.toLowerCase();
        
        const countryInfo = getCountryInfo(item.country_code);
        const isCert = item.country_code && item.country_code.includes("_CERT");
        
        let flagHtml = '';
        if (isCert) {
            flagHtml = `<span title="${countryInfo.name} Verificado" style="margin-left:5px; font-size:1.1em; cursor:help;">${countryInfo.flag}</span>`;
        } else {
            flagHtml = `<span class="flag-bw" title="Pendente de apresentação" style="margin-left:5px; font-size:1.1em; cursor:help;">${countryInfo.flag}</span>`;
        }

        // Tempo
        const days = Math.floor((new Date() - new Date(item.timestamp)) / (1000 * 60 * 60 * 24));
        let timeLabel = `${days} dias`;
        if (days > 365) timeLabel = `${Math.floor(days/365)} anos atrás`;
        if (days < 1) timeLabel = "Hoje";

        const veteranBadge = days > 365 ? '<span class="veteran-badge" title="Estabilidade > 1 ano">🎖️</span>' : '';

        // Atividade
        const daysSincePost = item.last_user_post 
            ? Math.floor((new Date() - new Date(item.last_user_post + "Z")) / (1000 * 60 * 60 * 24))
            : 999;
        
        let activityHtml = `<span style="color:#666; font-size:0.8em; opacity:0.5; font-weight:bold;">SEM DADOS</span>`;
        if (item.last_user_post) {
            if (daysSincePost === 0) activityHtml = `<span style="color:var(--accent-green); font-weight:bold;">Hoje</span>`;
            else if (daysSincePost === 1) activityHtml = `<span style="color:var(--accent-green);">Ontem</span>`;
            else if (daysSincePost < 30) activityHtml = `<span style="color:#ccc; font-size:0.9em;">${daysSincePost} dias atrás</span>`;
            else if (daysSincePost < 365) activityHtml = `${Math.floor(daysSincePost/30)} meses atrás`;
            else activityHtml = `${Math.floor(daysSincePost/365)} anos atrás`;
        }

        // Votos
        let voteHtml = `<span style="color:#666; font-size:0.8em; opacity:0.5; font-weight:bold;">SEM DADOS</span>`;
        if (item.last_vote_date) {
             const daysSinceVote = Math.floor((new Date() - new Date(item.last_vote_date)) / (1000 * 60 * 60 * 24));
             if (daysSinceVote === 0) voteHtml = `<span style="color:var(--accent-green); font-weight:bold;">Hoje</span>`;
             else if (daysSinceVote === 1) voteHtml = `<span style="color:var(--accent-green);">Ontem</span>`;
             else voteHtml = `<span style="color:#ccc; font-size:0.9em;">${daysSinceVote} dias atrás</span>`;
        }

        // Tags
        let bonusTag = `<span style="opacity:0.3; font-size:0.8em">—</span>`;
        const hp = item.delegated_hp;
        if (hp >= 5000) bonusTag = `<span class="bonus-tag bonus-gold">+20%</span>`;
        else if (hp >= 1000) bonusTag = `<span class="bonus-tag bonus-silver">+15%</span>`;
        else if (hp >= 100) bonusTag = `<span class="bonus-tag bonus-bronze">+10%</span>`;
        else if (hp >= 10) bonusTag = `<span class="bonus-tag bonus-honor">+5%</span>`;

        let tokenBonus = `<span style="opacity:0.3; font-size:0.8em">—</span>`;
        if (item.token_balance >= 1000) tokenBonus = `<span class="bonus-tag bonus-hbr">+2%</span>`;

        let trailBonus = `<span style="opacity:0.3; font-size:0.8em">—</span>`;
        if (item.in_curation_trail) trailBonus = `<span class="bonus-tag bonus-trail">+5%</span>`;

        let pdHtml = `<span style="opacity:0.2">—</span>`;
        if (item.next_withdrawal) {
            const pdDate = new Date(item.next_withdrawal);
            pdHtml = `<span style="color:#ff4d4d; font-size:0.85em;">📉 ${pdDate.toLocaleDateString('pt-BR')}</span>`;
        }

        tr.innerHTML = `
            <td class="sticky-col">
                <span style="color:#666; margin-right:8px; font-weight:bold;">#${index + 1}</span>
                <img src="https://images.hive.blog/u/${item.delegator}/avatar/small" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
                <a href="https://peakd.com/@${item.delegator}" target="_blank">@${item.delegator}</a>
                ${flagHtml}
            </td>
            
            <td style="font-weight:bold; font-family:monospace; font-size:1.1em; color:${item.delegated_hp > 0 ? '#4dff91' : '#666'};">
                ${formatVal(item.delegated_hp)}
            </td>
            <td style="font-size:0.9em;">${timeLabel} ${veteranBadge}</td>
            <td style="font-family:monospace; color:#888;">${formatVal(item.total_account_hp)} HP</td>
            
            <td style="text-align:center;">${pdHtml}</td>

            <td style="font-family:monospace; color:${item.token_balance > 0 ? '#4da6ff' : '#444'}; font-weight:bold;">
                ${formatVal(item.token_balance)}
            </td>
            <td>${activityHtml}</td>
            <td>${voteHtml}</td>
            
            <td>${bonusTag}</td>
            <td>${tokenBonus}</td>
            <td>${trailBonus}</td>
        `;
        
        els.rankingBody.appendChild(tr);
    });
}

function setupSearch() {
    els.searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('.delegator-row');
        
        rows.forEach(row => {
            const name = row.dataset.name;
            if (name.includes(term)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
}

window.handleSort = (key) => {
    console.log("Ordenação dinâmica em desenvolvimento.");
};

window.openModal = () => { document.getElementById('news-modal').style.display = 'flex'; }
window.closeModal = () => { document.getElementById('news-modal').style.display = 'none'; }
window.closeModalOnOverlay = (event) => {
    if (event.target === document.getElementById('news-modal')) closeModal();
}

// Inicia
init();
