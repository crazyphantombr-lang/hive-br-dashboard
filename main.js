// File: main.js
/**
 * Script: Hive BR Dashboard Frontend
 * Version: 2.22.0 (Version Display & Traceability)
 * Author: Hive BR
 * License: MIT
 */

const FRONTEND_VERSION = "2.22.0";

document.addEventListener("DOMContentLoaded", () => {
    loadData();
    setupSearch();
});

async function loadData() {
    try {
        // Carrega metadados e ranking em paralelo
        const [metaRes, currentRes] = await Promise.all([
            fetch('data/meta.json'),
            fetch('data/current.json')
        ]);

        if (!metaRes.ok || !currentRes.ok) throw new Error("Falha ao carregar JSONs");

        const meta = await metaRes.json();
        const ranking = await currentRes.json();

        renderMeta(meta);
        renderTable(ranking);
        renderGraphs(ranking);

    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        document.getElementById('last-updated').textContent = "Erro ao carregar dados. Tente recarregar.";
    }
}

function renderMeta(meta) {
    // 1. Atualiza Data e Versões (Traceability)
    const dateStr = new Date(meta.last_updated).toLocaleString('pt-BR');
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

    // 2. Cards Superiores (HP e Delegadores)
    updateSafe('stat-community-power', formatNumber(meta.total_hp) + " HP");
    updateSafe('stat-own-hp', formatNumber(meta.project_account_hp) + " HP");
    updateSafe('stat-delegated-hp', formatNumber(meta.total_hp - meta.project_account_hp) + " HP");
    updateSafe('stat-count', meta.total_delegators);

    // 3. Cards de Destaque (Votos e Trail)
    // Se existir histórico nomeado, usa-o. Senão, usa os campos legados.
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const now = new Date();
    
    // Label Mês Atual
    const curMonthName = monthNames[now.getMonth()] + " " + now.getFullYear();
    updateSafe('lbl-votes-current', curMonthName.toUpperCase());
    
    // Valores de Votos
    updateSafe('stat-votes-current', meta.votes_month_current || 0);
    updateSafe('stat-trail-count', meta.curation_trail_count || 0);

    // 4. Cards Inferiores (Histórico Recente)
    // Calcula datas anteriores para labels corretos
    const d1 = new Date(); d1.setMonth(d1.getMonth() - 1);
    const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);
    
    updateSafe('lbl-votes-m1', `${monthNames[d1.getMonth()]} ${d1.getFullYear()}`);
    updateSafe('lbl-votes-m2', `${monthNames[d2.getMonth()]} ${d2.getFullYear()}`);
    
    updateSafe('stat-votes-m1', meta.votes_month_prev1 || 0);
    updateSafe('stat-votes-m2', meta.votes_month_prev2 || 0);
    updateSafe('stat-votes-24h', meta.votes_24h || 0); // Novo campo v2.24+

    // 5. Destaque (Lógica Simples Frontend - Pode ser aprimorada no backend futuramente)
    // Por enquanto, apenas placeholder ou lógica visual se tivermos o dado
    if (meta.featured_user) {
        // Futuro: se o backend calcular o destaque, mostramos aqui
        // updateSafe('stat-growth', `@${meta.featured_user.name} (+${meta.featured_user.diff})`);
    }
}

function renderTable(data) {
    const tbody = document.getElementById('ranking-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Ordena por HP Delegado (Decrescente)
    data.sort((a, b) => b.delegated_hp - a.delegated_hp);

    data.forEach((user, index) => {
        const row = document.createElement('tr');
        row.className = 'delegator-row';
        row.dataset.name = user.delegator;

        // Cálculos de Tempo
        const days = calculateDays(user.timestamp);
        const daysLabel = days === null ? '<span style="opacity:0.5">-</span>' : `${days} dias`;
        
        // Flags e Badges
        const isBr = user.country_code === 'BR_CERT';
        const flag = isBr ? '<span title="Brasileiro Verificado" style="margin-left:5px; font-size:1.1em; cursor:help;">🇧🇷</span>' : '<span class="flag-bw" title="Pendente" style="margin-left:5px; font-size:1.1em; cursor:help;">🇧🇷</span>';
        
        // Badge Veterano (>1 ano)
        const veteranBadge = (days > 365) ? ' <span class="veteran-badge" title="Estabilidade > 1 ano">🎖️</span>' : '';

        // Formatação de Datas
        const lastVote = user.last_vote_date ? timeAgo(user.last_vote_date) : '<span style="color:#666; font-size:0.8em; opacity:0.5; font-weight:bold;">SEM DADOS</span>';
        const lastActivity = user.last_user_post ? timeAgo(user.last_user_post) : '<span style="color:#444; font-size:0.85em">Sem posts</span>';

        // Bônus (Visual)
        const hpVal = user.delegated_hp;
        let bonusBadge = '<span style="opacity:0.3; font-size:0.8em">—</span>';
        if (hpVal >= 1000) bonusBadge = '<span class="bonus-tag bonus-gold">+20%</span>';
        else if (hpVal >= 500) bonusBadge = '<span class="bonus-tag bonus-silver">+15%</span>';
        else if (hpVal >= 100) bonusBadge = '<span class="bonus-tag bonus-bronze">+10%</span>';
        else if (hpVal >= 50) bonusBadge = '<span class="bonus-tag bonus-honor">+5%</span>';

        // HBR Bonus (Exemplo Lógico)
        let hbrBadge = '<span style="opacity:0.3; font-size:0.8em">—</span>';
        if (user.token_balance > 0) {
             // Simulação simples de tier
             const hbrTier = Math.min(20, Math.floor(user.token_balance / 1000)); 
             if (hbrTier > 0) hbrBadge = `<span class="bonus-tag bonus-hbr">+${hbrTier}%</span>`;
        }

        row.innerHTML = `
            <td class="sticky-col">
                <span style="color:#666; margin-right:8px; font-weight:bold;">#${index + 1}</span>
                <img src="https://images.hive.blog/u/${user.delegator}/avatar/small" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
                <a href="https://peakd.com/@${user.delegator}" target="_blank">@${user.delegator}</a>
                ${flag}
            </td>
            <td style="font-weight:bold; font-family:monospace; font-size:1.1em; color:${hpVal > 0 ? '#4dff91' : '#666'};">
                ${formatNumber(hpVal)}
            </td>
            <td style="font-size:0.9em;">${daysLabel}${veteranBadge}</td>
            <td style="font-family:monospace; color:#888;">${formatNumber(user.total_account_hp)} HP</td>
            
            <td style="text-align:center;">${user.next_withdrawal ? '<span style="color:#ff4d4d; font-size:0.8em;">⚠️ Ativo</span>' : '<span style="opacity:0.2">—</span>'}</td>

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
}

// --- Funções Auxiliares de Renderização ---

function renderGraphs(data) {
    // Renderiza mini-sparklines para cada usuário (Exemplo estático ou aleatório por enquanto)
    // No futuro, isso pode vir de 'history' real se disponível
    data.forEach(user => {
        const ctx = document.getElementById(`chart-${user.delegator}`);
        if (ctx) {
            // Gera dados fictícios suaves para estética (já que não temos histórico diário individual detalhado ainda)
            // Se o HP for 0, linha reta flat
            const points = user.delegated_hp > 0 ? Array.from({length: 7}, () => user.delegated_hp * (0.95 + Math.random() * 0.1)) : [0,0,0,0,0,0,0];
            
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [1,2,3,4,5,6,7],
                    datasets: [{
                        data: points,
                        borderColor: user.delegated_hp > 0 ? '#4da6ff' : '#333',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false
                    }]
                },
                options: {
                    responsive: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: { x: { display: false }, y: { display: false } },
                    layout: { padding: 0 }
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
    
    // Tratamento especial para "Agora"
    if (seconds < 86400 && date.getDate() === now.getDate()) {
        return '<span style="color:#4dff91; font-weight:bold;">Hoje</span>';
    }
    if (seconds < 172800) { // 48h
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
    console.log("Ordenação por", column, "implementada na v2.23+");
    // Lógica de ordenação pode ser reativada se necessário, 
    // mas por padrão o script já entrega ordenado por HP.
}

function setupSearch() {
    const input = document.getElementById('search-input');
    if(!input) return;
    
    input.addEventListener('keyup', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('.delegator-row');
        
        rows.forEach(row => {
            const name = row.dataset.name.toLowerCase();
            if(name.includes(term)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
}
