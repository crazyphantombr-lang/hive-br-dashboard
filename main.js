// File: main.js
/**
 * Script: Hive BR Dashboard Frontend
 * Version: 2.23.2 (Feature: Destaque 30 dias)
 * Author: Hive BR
 * License: MIT
 * Description: Implementa lógica de cálculo para o 'Delegador Destaque' (maior crescimento líquido de delegação em 30 dias).
 */

const FRONTEND_VERSION = "2.23.2";

document.addEventListener("DOMContentLoaded", () => {
    loadData();
    setupSearch();
});

async function loadData() {
    try {
        // 1. Carrega TODOS os arquivos necessários (incluindo histórico)
        const [metaRes, currentRes, historyRes] = await Promise.all([
            fetch('data/meta.json'),
            fetch('data/current.json'),
            fetch('data/ranking_history.json')
        ]);

        if (!metaRes.ok || !currentRes.ok) throw new Error("Falha ao carregar dados essenciais");

        const meta = await metaRes.json();
        const ranking = await currentRes.json();
        
        // Histórico é opcional (se falhar, o site ainda abre, só não mostra o painel)
        const historyData = historyRes.ok ? await historyRes.json() : {};

        renderMeta(meta);
        renderTable(ranking);
        renderGraphs(ranking);
        renderRecentActivity(ranking, historyData); 
        renderHighlight30d(ranking, historyData); // <-- Nova Função

    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        document.getElementById('last-updated').textContent = "Erro ao carregar dados. Tente recarregar.";
    }
}

function renderMeta(meta) {
    // Traceability
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

// --- FUNÇÃO: DELEGADOR DESTAQUE (30 DIAS) ---
function renderHighlight30d(ranking, historyData) {
    const el = document.getElementById('stat-growth');
    if (!el) return;

    let bestUser = null;
    let maxGrowth = -Infinity;
    const DAYS_TARGET = 30;

    // Calcula a data alvo (30 dias atrás)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - DAYS_TARGET);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    ranking.forEach(user => {
        const currentHP = user.delegated_hp || 0;
        let pastHP = 0; // Assume 0 para novos usuários

        const hist = historyData[user.delegator];
        if (hist) {
            // Obtém datas ordenadas
            const dates = Object.keys(hist).sort();
            
            // Encontra a data mais próxima (mas não futura em relação ao target) de 30 dias atrás
            let foundDate = null;
            for (const dateStr of dates) {
                if (dateStr <= targetDateStr) {
                    foundDate = dateStr;
                } else {
                    break; // Passou da data alvo
                }
            }

            if (foundDate) {
                pastHP = hist[foundDate];
            }
            // Se não encontrou data <= 30 dias atrás, significa que o usuário
            // entrou a menos de 30 dias, logo pastHP continua 0.
        }

        const growth = currentHP - pastHP;

        // Regra de Negócio: Maior crescimento LÍQUIDO positivo
        if (growth > maxGrowth) {
            maxGrowth = growth;
            bestUser = user.delegator;
        }
    });

    if (bestUser && maxGrowth > 0) {
        // Renderiza com formatação
        el.innerHTML = `
            <a href="https://peakd.com/@${bestUser}" target="_blank" style="color:inherit; text-decoration:none;">
                @${bestUser}
            </a>
            <div style="font-size:0.6em; color:#4dff91; margin-top:2px;">
                +${formatNumber(maxGrowth)} HP (30d)
            </div>
        `;
    } else {
        el.innerHTML = '<span style="opacity:0.5; font-size:0.8em;">—</span>';
    }
}

// --- ATIVIDADE RECENTE (7 DIAS) ---
function renderRecentActivity(delegations, historyData) {
    const container = document.getElementById("activity-panel");
    const tbody = document.getElementById("activity-body");
    if(!container || !tbody) return;

    const changes = [];
    const NOISE_THRESHOLD = 5.0; // Mínimo de mudança para aparecer (5 HP)
    const DAYS_BACK = 7; 

    delegations.forEach(user => {
      const hist = historyData[user.delegator];
      if (hist) {
        const dates = Object.keys(hist).sort();
        if (dates.length >= 2) {
          const latestIndex = dates.length - 1;
          // Pega o registro de X dias atrás (ou o mais antigo disponível)
          let compareIndex = latestIndex - DAYS_BACK;
          if (compareIndex < 0) compareIndex = 0;
          
          // Se só tem 1 dia de registro, não tem como comparar
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
    changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)); // Ordena por magnitude
    tbody.innerHTML = "";

    // Mostra Top 10 mudanças
    changes.slice(0, 10).forEach(change => {
      const tr = document.createElement("tr");
      const diffClass = change.diff > 0 ? "diff-positive" : "diff-negative"; // CSS precisa ter essas classes
      const signal = change.diff > 0 ? "+" : "";
      
      // Estilo inline para garantir funcionamento imediato
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

    data.sort((a, b) => b.delegated_hp - a.delegated_hp);

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
        if (pdDate && !pdDate.startsWith("1969") && !pdDate.startsWith("1970")) {
             const dateObj = new Date(pdDate);
             pdHtml = `<span style="color:#ff4d4d; font-size:0.85em;">📉 ${dateObj.toLocaleDateString("pt-BR")}</span>`;
        }

        const hpVal = user.delegated_hp;
        let bonusBadge = '<span style="opacity:0.3; font-size:0.8em">—</span>';
        if (hpVal >= 1000) bonusBadge = '<span class="bonus-tag bonus-gold">+20%</span>';
        else if (hpVal >= 500) bonusBadge = '<span class="bonus-tag bonus-silver">+15%</span>';
        else if (hpVal >= 100) bonusBadge = '<span class="bonus-tag bonus-bronze">+10%</span>';
        else if (hpVal >= 50) bonusBadge = '<span class="bonus-tag bonus-honor">+5%</span>';

        let hbrBadge = '<span style="opacity:0.3; font-size:0.8em">—</span>';
        if (user.token_balance > 0) {
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
}

function renderGraphs(data) {
    data.forEach(user => {
        const ctx = document.getElementById(`chart-${user.delegator}`);
        if (ctx) {
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

function handleSort(column) { console.log("Sort logic ready"); }

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
