/**
 * Script: Main Frontend Logic
 * Version: 1.9.4
 * Description: Diagnóstico de Inatividade (Se não votou, checa se postou)
 */

async function loadDashboard() {
  const BASE_URL = "https://crazyphantombr-lang.github.io/hive-br-voter-ranking/data";
  
  try {
    const [resCurrent, resHistory, resMeta] = await Promise.all([
      fetch(`${BASE_URL}/current.json`),
      fetch(`${BASE_URL}/ranking_history.json`),
      fetch(`${BASE_URL}/meta.json`)
    ]);

    if (!resCurrent.ok) throw new Error("Erro ao carregar dados.");

    const delegations = await resCurrent.json();
    const historyData = resHistory.ok ? await resHistory.json() : {};
    const metaData = resMeta.ok ? await resMeta.json() : null;

    updateStats(delegations, metaData, historyData);
    renderRecentActivity(delegations, historyData);
    renderTable(delegations, historyData);
    setupSearch();

  } catch (err) {
    console.error("Erro no dashboard:", err);
    document.getElementById("last-updated").innerText = "Erro ao carregar dados.";
  }
}

function updateStats(delegations, meta, historyData) {
  const dateEl = document.getElementById("last-updated");
  if (meta && meta.last_updated) {
    const dateObj = new Date(meta.last_updated);
    dateEl.innerText = `Atualizado em: ${dateObj.toLocaleString("pt-BR")}`;
  }

  const totalHP = delegations.reduce((acc, curr) => acc + curr.delegated_hp, 0);
  document.getElementById("stat-total-hp").innerText = 
    totalHP.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " HP";
  document.getElementById("stat-count").innerText = delegations.length;

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
    document.getElementById("stat-growth").innerHTML = 
      `@${bestGrower.name} <span style="font-size:0.6em; color:#4dff91">(+${bestGrower.val.toFixed(0)})</span>`;
  }
}

function renderRecentActivity(delegations, historyData) {
  const container = document.getElementById("activity-panel");
  const tbody = document.getElementById("activity-body");
  const changes = [];
  const NOISE_THRESHOLD = 2.0; 

  delegations.forEach(user => {
    const hist = historyData[user.delegator];
    if (hist) {
      const dates = Object.keys(hist).sort();
      if (dates.length >= 2) {
        const todayHP = hist[dates[dates.length - 1]];
        const yesterdayHP = hist[dates[dates.length - 2]];
        const diff = todayHP - yesterdayHP;
        if (Math.abs(diff) >= NOISE_THRESHOLD) {
          changes.push({
            name: user.delegator,
            old: yesterdayHP,
            new: todayHP,
            diff: diff
          });
        }
      }
    }
  });

  if (changes.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  changes.slice(0, 5).forEach(change => {
    const tr = document.createElement("tr");
    const diffClass = change.diff > 0 ? "diff-positive" : "diff-negative";
    const signal = change.diff > 0 ? "+" : "";
    tr.innerHTML = `
      <td><a href="https://peakd.com/@${change.name}" target="_blank">@${change.name}</a></td>
      <td class="val-muted">${change.old.toFixed(0)}</td>
      <td style="font-weight:bold">${change.new.toFixed(0)}</td>
      <td class="${diffClass}">${signal}${change.diff.toFixed(0)} HP</td>
    `;
    tbody.appendChild(tr);
  });
}

function calculateDuration(dateString) {
  if (!dateString || dateString.startsWith("1970")) return null; // Hive retorna 1970 se nunca postou
  const start = new Date(dateString.endsWith("Z") ? dateString : dateString + "Z");
  const now = new Date();
  const diffTime = Math.abs(now - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
      } else {
        startDate = localFirstSeen;
      }
    }
  } else if (apiTimestamp) {
    startDate = new Date(apiTimestamp);
  }
  const now = new Date();
  const diffTime = Math.abs(now - startDate);
  return { days: Math.ceil(diffTime / (1000 * 60 * 60 * 24)), text: `${Math.ceil(diffTime / (1000 * 60 * 60 * 24))} dias` };
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

// LÓGICA DE CURADORIA INTELIGENTE (1.9.4)
function getCurationStatus(lastVoteDate, count30d, lastPostDate) {
  
  // 1. Cenário: Recebeu Voto
  if (lastVoteDate) {
    const daysAgo = calculateDuration(lastVoteDate);
    let color = "#666";
    let icon = "";

    if (daysAgo <= 3) {
      color = "#4dff91"; // Verde
      icon = "⚡";
    } else if (daysAgo <= 15) {
      color = "#e6e6ff"; // Normal
    } else {
      color = "#ffcc00"; // Alerta
      icon = "⚠️";
    }
    const daysText = daysAgo === 0 ? "Hoje" : daysAgo === 1 ? "Ontem" : `${daysAgo}d atrás`;
    
    return `
      <div style="line-height:1.2;">
        <span style="color:${color}; font-weight:bold;">${icon} ${daysText}</span><br>
        <span style="font-size:0.8em; color:#888;">(${count30d} votos/mês)</span>
      </div>
    `;
  }

  // 2. Cenário: Nunca recebeu voto (ou não está no histórico)
  // Vamos checar se o usuário é INATIVO
  const postDaysAgo = calculateDuration(lastPostDate);
  
  if (postDaysAgo === null) {
    return `<span style="color:#666; font-size:0.8em;">(Sem Posts)</span>`;
  }

  if (postDaysAgo > 30) {
    return `<span style="color:#666; font-size:0.85em;">💤 Inativo (${postDaysAgo}d)</span>`;
  } else {
    // Postou recentemente (<30d) mas não recebeu voto = ALERTA PARA O CURADOR
    return `<span style="color:#ff4d4d; font-weight:bold; font-size:0.85em;">⚠️ Pendente</span><br><span style="font-size:0.7em; color:#888;">(Post: ${postDaysAgo}d atrás)</span>`;
  }
}

function renderTable(delegations, historyData) {
  const tbody = document.getElementById("ranking-body");
  tbody.innerHTML = "";

  delegations.forEach((user, index) => {
    const rank = index + 1;
    const tr = document.createElement("tr");
    tr.classList.add("delegator-row");
    tr.dataset.name = user.delegator.toLowerCase();

    const canvasId = `chart-${user.delegator}`;
    const loyalty = calculateLoyalty(user.delegator, user.timestamp, historyData);
    let durationHtml = loyalty.text;
    if (loyalty.days > 365) durationHtml += ` <span class="veteran-badge" title="Veterano (+1 ano)">🎖️</span>`;

    const ownHp = user.total_account_hp || 0;
    const hbrStake = user.token_balance || 0;
    
    const delegationBonusHtml = getDelegationBonus(rank);
    const hbrBonusHtml = getHbrBonus(hbrStake);
    
    // Passamos também a data do último post para o diagnóstico
    const curationHtml = getCurationStatus(user.last_vote_date, user.votes_month, user.last_user_post);

    const hbrStyle = hbrStake > 0 ? "color:#4da6ff; font-weight:bold;" : "color:#444;"; 

    tr.innerHTML = `
      <td class="sticky-col">
        <span style="color:#666; margin-right:8px; font-weight:bold;">#${rank}</span>
        <img src="https://images.hive.blog/u/${user.delegator}/avatar/small" 
             style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
        <a href="https://peakd.com/@${user.delegator}" target="_blank">@${user.delegator}</a>
      </td>
      <td style="font-weight:bold; font-family:monospace; font-size:1.1em; color:#4dff91;">
          ${user.delegated_hp.toLocaleString("pt-BR", { minimumFractionDigits: 3 })}
      </td>
      <td style="font-family:monospace; color:#888;">
          ${ownHp.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} HP
      </td>
      <td style="font-family:monospace; ${hbrStyle}">
          ${hbrStake.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
      </td>
      <td>${curationHtml}</td>
      <td style="font-size:0.9em;">
          ${durationHtml}
      </td>
      <td>${delegationBonusHtml}</td>
      <td>${hbrBonusHtml}</td>
      <td style="width:140px;">
          <canvas id="${canvasId}" width="120" height="40"></canvas>
      </td>
    `;
    tbody.appendChild(tr);

    let userHistory = historyData[user.delegator] || {};
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
