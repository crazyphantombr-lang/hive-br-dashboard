/**
 * Script: Main Frontend Logic
 * Version: 2.4.0
 * Description: Community Power Calculation (Own + Delegated)
 */

let globalDelegations = [];
let globalHistory = {};
let currentSort = { column: 'delegated_hp', direction: 'desc' };

async function loadDashboard() {
  const BASE_URL = "https://crazyphantombr-lang.github.io/hive-br-voter-ranking/data";
  
  try {
    const [resCurrent, resHistory, resMeta] = await Promise.all([
      fetch(`${BASE_URL}/current.json`),
      fetch(`${BASE_URL}/ranking_history.json`),
      fetch(`${BASE_URL}/meta.json`)
    ]);

    if (!resCurrent.ok) throw new Error("Erro ao carregar dados.");

    globalDelegations = await resCurrent.json();
    globalHistory = resHistory.ok ? await resHistory.json() : {};
    const metaData = resMeta.ok ? await resMeta.json() : null;

    updateStats(globalDelegations, metaData, globalHistory);
    renderRecentActivity(globalDelegations, globalHistory);
    renderTable(); 
    setupSearch();

  } catch (err) {
    console.error("Erro no dashboard:", err);
    document.getElementById("last-updated").innerText = "Erro ao carregar dados.";
  }
}

// --- FUNÇÃO DE ESTATÍSTICAS ATUALIZADA (V2.4.0) ---
function updateStats(delegations, meta, historyData) {
  const dateEl = document.getElementById("last-updated");
  if (meta && meta.last_updated) {
    const dateObj = new Date(meta.last_updated);
    dateEl.innerText = `Atualizado em: ${dateObj.toLocaleString("pt-BR")}`;
  }

  // 1. Captura os valores brutos
  const projectHp = meta && meta.project_account_hp ? meta.project_account_hp : 0;
  const delegatedHp = delegations.reduce((acc, curr) => acc + curr.delegated_hp, 0);
  
  // 2. Calcula a Soma (Poder da Comunidade)
  const communityPower = projectHp + delegatedHp;

  // 3. Renderiza Card Principal (Topo)
  document.getElementById("stat-community-power").innerText = 
    communityPower.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " HP";

  // 4. Renderiza Grid de Detalhes
  document.getElementById("stat-own-hp").innerText = 
    projectHp.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " HP";

  document.getElementById("stat-delegated-hp").innerText = 
    delegatedHp.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " HP";
  
  // Contagem de ativos
  const activeDelegators = delegations.filter(d => d.delegated_hp > 0).length;
  document.getElementById("stat-count").innerText = activeDelegators;

  // Destaque do Mês
  let bestGrower = { name: "—", val: 0 };
  delegations.forEach(user => {
    const hist = historyData[user.delegator];
    if (hist) {
      const dates = Object.keys(hist).sort();
      const firstDate = dates[0]; 
      const lastDate = dates[dates.length - 1];
      if (firstDate && lastDate && firstDate !== lastDate) {
        const growth = hist[lastDate] - hist[firstDate];
        if (growth > bestGrower.val) bestGrower = { name: user.delegator, val: growth };
      }
    }
  });
  if (bestGrower.val > 0) {
    document.getElementById("stat-growth").innerHTML = `@${bestGrower.name} <span style="font-size:0.6em; color:#4dff91">(+${bestGrower.val.toFixed(0)})</span>`;
  }
}

// --- RESTO DO CÓDIGO PERMANECE IGUAL ---

function handleSort(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
  } else {
    currentSort.column = column;
    currentSort.direction = column === 'delegator' ? 'asc' : 'desc';
  }
  updateSortIcons(column, currentSort.direction);

  globalDelegations.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    if (column === 'timestamp') {
        const loyaltyA = calculateLoyalty(a.delegator, a.timestamp, globalHistory).days;
        const loyaltyB = calculateLoyalty(b.delegator, b.timestamp, globalHistory).days;
        valA = loyaltyA;
        valB = loyaltyB;
    } 
    else if (column === 'last_user_post') {
        valA = a.last_user_post ? new Date(a.last_user_post).getTime() : 0;
        valB = b.last_user_post ? new Date(b.last_user_post).getTime() : 0;
    }
    else if (column === 'delegator') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
    }
    else {
        valA = valA || 0;
        valB = valB || 0;
    }

    if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
    if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
  renderTable();
}

function updateSortIcons(column, direction) {
  document.querySelectorAll('th').forEach(th => { th.classList.remove('asc', 'desc'); });
  const headers = document.querySelectorAll('th.sortable');
  headers.forEach(th => {
    if (th.getAttribute('onclick').includes(`'${column}'`)) { th.classList.add(direction); }
  });
}

function renderRecentActivity(delegations, historyData) {
  const container = document.getElementById("activity-panel");
  const tbody = document.getElementById("activity-body");
  const changes = [];
  const NOISE_THRESHOLD = 2.0; 
  const DAYS_BACK = 7; 

  delegations.forEach(user => {
    const hist = historyData[user.delegator];
    if (hist) {
      const dates = Object.keys(hist).sort();
      if (dates.length >= 2) {
        const latestIndex = dates.length - 1;
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

  if (changes.length === 0) { container.style.display = "none"; return; }
  container.style.display = "block";
  changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  changes.slice(0, 5).forEach(change => {
    const tr = document.createElement("tr");
    const diffClass = change.diff > 0 ? "diff-positive" : "diff-negative";
    const signal = change.diff > 0 ? "+" : "";
    tr.innerHTML = `<td><a href="https://peakd.com/@${change.name}" target="_blank">@${change.name}</a></td><td class="val-muted">${change.old.toFixed(0)}</td><td style="font-weight:bold">${change.new.toFixed(0)}</td><td class="${diffClass}">${signal}${change.diff.toFixed(0)} HP</td>`;
    tbody.appendChild(tr);
  });
}

function calculateLoyalty(username, apiTimestamp, historyData) {
  let startDate = new Date(); 
  if (historyData[username]) {
    const dates = Object.keys(historyData[username]).sort();
    if (dates.length > 0) {
      const localFirstSeen = new Date(dates[0]);
      if (apiTimestamp) {
        const apiDate = new Date(apiTimestamp);
        startDate = localFirstSeen < apiDate ? localFirstSeen : apiDate;
      } else { startDate = localFirstSeen; }
    }
  } else if (apiTimestamp) { startDate = new Date(apiTimestamp); }
  const now = new Date();
  const diffTime = Math.abs(now - startDate);
  return { days: Math.ceil(diffTime / (1000 * 60 * 60 * 24)), text: `${Math.ceil(diffTime / (1000 * 60 * 60 * 24))} dias` };
}

function calculateDuration(dateString) {
  if (!dateString || dateString.startsWith("1970")) return null; 
  const start = new Date(dateString.endsWith("Z") ? dateString : dateString + "Z");
  const now = new Date();
  const diffTime = Math.abs(now - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getDelegationBonus(rank) {
  if (rank <= 10) return `<span class="bonus-tag bonus-gold">+20%</span>`;
  if (rank <= 20) return `<span class="bonus-tag bonus-silver">+15%</span>`;
  if (rank <= 30) return `<span class="bonus-tag bonus-bronze">+10%</span>`;
  if (rank <= 40) return `<span class="bonus-tag bonus-honor">+5%</span>`;
  return `<span style="opacity:0.3; font-size:0.8em">—</span>`;
}

function getHbrBonus(stakeBalance) {
  if (!stakeBalance || stakeBalance < 10) return `<span style="opacity:0.3; font-size:0.8em">—</span>`;
  let bonus = Math.floor(stakeBalance / 10);
  if (bonus > 20) bonus = 20;
  return `<span class="bonus-tag bonus-hbr">+${bonus}%</span>`;
}

function getCurationStatus(lastVoteDate, count30d, lastPostDate) {
  if (lastVoteDate) {
    const daysAgo = calculateDuration(lastVoteDate);
    let color = "#666";
    let icon = "";
    if (daysAgo <= 3) { color = "#4dff91"; icon = "⚡"; } 
    else if (daysAgo <= 15) { color = "#e6e6ff"; } 
    else { color = "#ffcc00"; icon = "⚠️"; }
    const daysText = daysAgo === 0 ? "Hoje" : daysAgo === 1 ? "Ontem" : `${daysAgo}d atrás`;
    return `<div style="line-height:1.2;"><span style="color:${color}; font-weight:bold;">${icon} ${daysText}</span><br><span style="font-size:0.8em; color:#888;">(${count30d} votos/mês)</span></div>`;
  }
  const postDaysAgo = calculateDuration(lastPostDate);
  if (postDaysAgo === null) return `<span style="color:#666; font-size:0.8em;">(Sem Posts)</span>`;
  if (postDaysAgo > 30) return `<span style="color:#666; font-size:0.85em;">💤 Inativo (${postDaysAgo}d)</span>`;
  return `<span style="color:#ff4d4d; font-weight:bold; font-size:0.85em;">⚠️ Pendente</span><br><span style="font-size:0.7em; color:#888;">(Post: ${postDaysAgo}d atrás)</span>`;
}

function getLastPostStatus(dateString) {
    if (!dateString || dateString.startsWith("1970")) {
        return `<span style="color:#444; font-size:0.85em">Sem posts</span>`;
    }
    const daysAgo = calculateDuration(dateString);
    if (daysAgo === 0) return `<span style="color:#4dff91; font-weight:bold;">Hoje</span>`;
    if (daysAgo === 1) return `<span style="color:#4dff91;">Ontem</span>`;
    
    let color = "#fff";
    if (daysAgo > 7) color = "#ccc";
    if (daysAgo > 30) color = "#666";
    return `<span style="color:${color}; font-size:0.9em;">${daysAgo} dias atrás</span>`;
}

function getTrueRank(username) {
    const sortedByHp = [...globalDelegations].sort((a, b) => b.delegated_hp - a.delegated_hp);
    return sortedByHp.findIndex(u => u.delegator === username) + 1;
}

function renderTable() {
  const tbody = document.getElementById("ranking-body");
  tbody.innerHTML = "";

  globalDelegations.forEach((user, index) => {
    const rank = index + 1;
    const tr = document.createElement("tr");
    tr.classList.add("delegator-row");
    tr.dataset.name = user.delegator.toLowerCase();

    const canvasId = `chart-${user.delegator}`;
    const loyalty = calculateLoyalty(user.delegator, user.timestamp, globalHistory);
    let durationHtml = loyalty.text;
    if (loyalty.days > 365) durationHtml += ` <span class="veteran-badge" title="Veterano (+1 ano)">🎖️</span>`;

    const trueRank = getTrueRank(user.delegator);
    const ownHp = user.total_account_hp || 0;
    const hbrStake = user.token_balance || 0;
    
    const delegationBonusHtml = getDelegationBonus(trueRank);
    const hbrBonusHtml = getHbrBonus(hbrStake);
    const curationHtml = getCurationStatus(user.last_vote_date, user.votes_month, user.last_user_post);
    const lastPostHtml = getLastPostStatus(user.last_user_post);
    const hbrStyle = hbrStake > 0 ? "color:#4da6ff; font-weight:bold;" : "color:#444;"; 

    tr.innerHTML = `
      <td class="sticky-col">
        <span style="color:#666; margin-right:8px; font-weight:bold;">#${trueRank}</span>
        <img src="https://images.hive.blog/u/${user.delegator}/avatar/small" 
             style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
        <a href="https://peakd.com/@${user.delegator}" target="_blank">@${user.delegator}</a>
      </td>
      <td style="font-weight:bold; font-family:monospace; font-size:1.1em; color:#4dff91;">
          ${user.delegated_hp.toLocaleString("pt-BR", { minimumFractionDigits: 3 })}
      </td>
      <td style="font-size:0.9em;">${durationHtml}</td>
      <td style="font-family:monospace; color:#888;">${ownHp.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} HP</td>
      <td style="font-family:monospace; ${hbrStyle}">${hbrStake.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
      <td>${lastPostHtml}</td>
      <td>${curationHtml}</td>
      <td>${delegationBonusHtml}</td>
      <td>${hbrBonusHtml}</td>
      <td style="width:140px;">
          <canvas id="${canvasId}" width="120" height="40"></canvas>
      </td>
    `;
    tbody.appendChild(tr);

    let userHistory = globalHistory[user.delegator] || {};
    if (Object.keys(userHistory).length === 0) {
       const today = new Date().toISOString().slice(0, 10);
       userHistory = { [today]: user.delegated_hp };
    }
    renderSparkline(canvasId, userHistory);
  });
}

function setupSearch() {
  const input = document.getElementById("search-input");
  input.addEventListener("keyup", (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll(".delegator-row");
    rows.forEach(row => {
      row.style.display = row.dataset.name.includes(term) ? "" : "none";
    });
  });
}

function renderSparkline(canvasId, userHistoryObj) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  const sortedDates = Object.keys(userHistoryObj).sort();
  const values = sortedDates.map(date => userHistoryObj[date]);
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : last;
  const color = last >= prev ? '#4dff91' : '#ff4d4d';

  if (window.myCharts && window.myCharts[canvasId]) window.myCharts[canvasId].destroy();

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: sortedDates,
      datasets: [{
        data: values,
        borderColor: color,
        borderWidth: 2,
        pointRadius: values.length === 1 ? 3 : 0,
        tension: 0.2,
        fill: false
      }]
    },
    options: {
      responsive: false,
      plugins: { legend: {display:false}, tooltip: {enabled: true} },
      scales: { x: {display:false}, y: {display:false} }
    }
  });
}

document.addEventListener("DOMContentLoaded", loadDashboard);
