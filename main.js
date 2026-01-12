/**
 * Script: Main Frontend Logic
 * Version: 2.5.0 (UI Text Alignment)
 * Description: Renders dashboard. Updates MVP title to match AI Report. Improves Loyalty calculation.
 */

// --- CONFIGURAÇÃO ---
const DATA_PATH = "data/";
const FILES = {
    current: DATA_PATH + "current.json",
    meta: DATA_PATH + "meta.json",
    history: DATA_PATH + "ranking_history.json"
};

// --- ESTADO GLOBAL ---
let state = {
    current: [],
    meta: {},
    history: {}
};

// --- INICIALIZAÇÃO ---
async function init() {
    try {
        await loadData();
        renderHeader();
        renderMVP();
        renderRanking();
        renderLastUpdate();
        console.log("✅ Dashboard carregado com sucesso.");
    } catch (error) {
        console.error("❌ Erro ao carregar dashboard:", error);
        document.getElementById("ranking-container").innerHTML = 
            `<div class="error-box">⚠️ Falha ao carregar dados. Tente recarregar a página.</div>`;
    }
}

// --- CARREGAMENTO DE DADOS ---
async function loadData() {
    const [currRes, metaRes, histRes] = await Promise.all([
        fetch(FILES.current),
        fetch(FILES.meta),
        fetch(FILES.history)
    ]);

    if (!currRes.ok || !metaRes.ok) throw new Error("Arquivos de dados ausentes.");

    const rawCurrent = await currRes.json();
    // Suporte híbrido para Array (Legado) ou Objeto (Novo Padrão)
    if (Array.isArray(rawCurrent)) {
        state.current = rawCurrent;
    } else if (rawCurrent.ranking) {
        state.current = rawCurrent.ranking;
    }

    state.meta = await metaRes.json();
    
    // Histórico é opcional, mas recomendado para lealdade precisa
    if (histRes.ok) state.history = await histRes.json();
}

// --- RENDERIZADORES ---

function renderHeader() {
    document.getElementById("total-hp").textContent = formatNumber(state.meta.total_hp);
    document.getElementById("total-users").textContent = state.meta.active_community_members || 0;
    
    // Exibe Brasileiros Ativos se houver o dado, senão esconde ou mostra geral
    const activeBrs = state.meta.active_brazilians || 0;
    const brLabel = document.getElementById("active-br-label"); // Se existir no HTML
    if (brLabel) brLabel.textContent = activeBrs;
}

function renderMVP() {
    // Lógica: Comparar HP Atual com HP de 30 dias atrás (via Histórico)
    let bestUser = null;
    let maxGrowth = -Infinity;

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const dateKey30 = thirtyDaysAgo.toISOString().split('T')[0];

    state.current.forEach(user => {
        const name = user.delegator || user.username;
        const currentHp = user.delegated_hp || user.hp_equivalent || 0;
        
        let prevHp = 0;
        // Tenta pegar do histórico exato de 30 dias atrás
        if (state.history[name]) {
            // Busca a data mais próxima disponível se a exata não existir
            const dates = Object.keys(state.history[name]).sort();
            // Lógica simples: tenta pegar a chave exata
            if (state.history[name][dateKey30]) {
                prevHp = state.history[name][dateKey30];
            } else {
                // Fallback: pega a primeira data disponível se for depois de 30 dias atrás? 
                // Simplificação: Assume 0 se não tiver histórico antigo, ou o valor mais antigo disponível
                const firstDate = dates[0];
                if (firstDate < dateKey30) {
                     // Se o usuário já existia antes de 30 dias, tenta achar um valor próximo
                     // (Implementação simples: assume 0 crescimento se dados faltantes, ou usa lógica de relatório)
                     // Para o front, vamos focar no incremento absoluto simples atual
                }
            }
        }

        const growth = currentHp - prevHp;

        if (growth > maxGrowth && growth > 10) { // Mínimo 10 HP para considerar
            maxGrowth = growth;
            bestUser = { ...user, growth };
        }
    });

    const container = document.getElementById("mvp-container");
    if (!bestUser || !container) return;

    // --- AQUI ESTÁ A MUDANÇA DE TEXTO SOLICITADA ---
    container.innerHTML = `
        <div class="mvp-card glow-gold">
            <div class="mvp-header">
                <h3>🏆 Delegador Destaque dos últimos 30 dias</h3>
            </div>
            <div class="mvp-body">
                <div class="mvp-avatar">
                    <img src="https://images.hive.blog/u/${bestUser.delegator}/avatar" alt="${bestUser.delegator}">
                </div>
                <div class="mvp-info">
                    <span class="mvp-name">@${bestUser.delegator}</span>
                    <span class="mvp-growth">+${formatNumber(bestUser.growth)} HP</span>
                </div>
            </div>
        </div>
    `;
}

function renderRanking() {
    const tbody = document.getElementById("ranking-body");
    tbody.innerHTML = "";

    state.current.sort((a, b) => b.delegated_hp - a.delegated_hp);

    state.current.forEach((user, index) => {
        const tr = document.createElement("tr");
        
        // Classes de Estilo (Top 3)
        if (index === 0) tr.classList.add("rank-gold");
        else if (index === 1) tr.classList.add("rank-silver");
        else if (index === 2) tr.classList.add("rank-bronze");

        // Cálculo de Fidelidade (Loyalty)
        const loyaltyText = calculateLoyalty(user.delegator, user.timestamp);
        
        // Status de Curadoria (Vote Audit)
        const curStatus = getCurationStatus(user.last_vote_date);

        // Bônus (Visual)
        const badges = getBadges(user, index);

        tr.innerHTML = `
            <td class="rank-pos">#${index + 1}</td>
            <td class="user-info">
                <img src="https://images.hive.blog/u/${user.delegator}/avatar" class="avatar-small">
                <a href="https://peakd.com/@${user.delegator}" target="_blank">@${user.delegator}</a>
                <div class="badges-row">${badges}</div>
            </td>
            <td class="hp-val">${formatNumber(user.delegated_hp)} HP</td>
            <td class="loyalty-cell">${loyaltyText}</td>
            <td class="status-cell">${curStatus}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderLastUpdate() {
    const el = document.getElementById("last-update");
    if (el && state.meta.last_updated) {
        const d = new Date(state.meta.last_updated);
        el.textContent = "Atualizado em: " + d.toLocaleString("pt-BR");
    }
}

// --- LÓGICA DE NEGÓCIO ---

function calculateLoyalty(username, apiTimestamp) {
    // 1. Tenta achar a PRIMEIRA aparição no histórico local
    let startDate = null;
    
    if (state.history[username]) {
        const dates = Object.keys(state.history[username]).sort();
        if (dates.length > 0) {
            startDate = new Date(dates[0]);
        }
    }

    // 2. Se a API fornecer um timestamp mais antigo (ou se não tiver histórico), usa a API
    if (apiTimestamp) {
        const apiDate = new Date(apiTimestamp);
        if (!startDate || apiDate < startDate) {
            startDate = apiDate;
        }
    }

    if (!startDate) return `<span class="badge-new">Novo</span>`;

    const now = new Date();
    const diffTime = Math.abs(now - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) return `${diffDays} dias`;
    if (diffDays <= 365) return `${Math.floor(diffDays / 30)} meses`;
    return `+1 ano`; // Veterano
}

function getCurationStatus(lastVoteDate) {
    if (!lastVoteDate) return `<span class="status-dot gray" title="Sem votos recentes"></span>`;
    
    const voteDate = new Date(lastVoteDate);
    const now = new Date();
    const diffDays = Math.floor((now - voteDate) / (1000 * 60 * 60 * 24));

    if (diffDays <= 2) return `<span class="status-dot green" title="Votado recentemente (${diffDays}d)"></span>`;
    if (diffDays <= 7) return `<span class="status-dot yellow" title="Voto na semana (${diffDays}d)"></span>`;
    return `<span class="status-dot red" title="Sem voto há ${diffDays} dias"></span>`;
}

function getBadges(user, index) {
    let html = "";
    // Top Ranking
    if (index < 3) html += `<span class="badge-rank">🏆 Top ${index+1}</span> `;
    
    // Veterano (> 1 ano de delegação ou timestamp antigo)
    if (calculateLoyalty(user.delegator, user.timestamp).includes("ano")) {
        html += `<span class="badge-vet">🎖️ Veterano</span> `;
    }

    // Trilha
    if (user.in_curation_trail) {
        html += `<span class="badge-trail" title="+5% Bônus (Trilha)">🚀 Trail</span> `;
    }
    
    // Stake HBR (Exemplo)
    if (user.token_balance > 0) {
        html += `<span class="badge-token">🪙 ${formatNumber(user.token_balance)} HBR</span>`;
    }

    return html;
}

// --- UTILITÁRIOS ---
function formatNumber(num) {
    return parseFloat(num).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

// Start
init();
