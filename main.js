/**
 * Script: Main Frontend Logic
 * Version: 1.5.0
 * Description: Adiciona painel de alterações recentes e corrige fidelidade via histórico local
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

// Stats agora foca no Mês (ou máximo disponível)
function updateStats(delegations, meta, historyData) {
  const dateEl = document.getElementById("last-updated");
  if (meta && meta.last_updated) {
    const dateObj = new Date(meta.last_updated);
    dateEl.innerText = `Atualizado em: ${dateObj.toLocaleString("pt-BR")}`;
  }

  const totalHP = delegations.reduce((acc, curr) => acc + curr.hp, 0);
  document.getElementById("stat-total-hp").innerText = 
    totalHP.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " HP";
  document.getElementById("stat-count").innerText = delegations.length;

  // Lógica "Destaque do Mês"
  let bestGrower = { name: "—", val: 0 };
  
  delegations.forEach(user => {
    const hist = historyData[user.delegator];
    if (hist) {
      const dates = Object.keys(hist).sort();
      // Pega o dado mais antigo possível (idealmente 30 dias atrás)
      // Como o histórico é novo, ele vai pegar o primeiro dia que tiver.
      const firstDate = dates[0]; 
      const lastDate = dates[dates.length - 1];
      
      if (firstDate && lastDate && firstDate !== lastDate) {
        const growth = hist[lastDate] - hist[firstDate];
        if (growth > bestGrower.val) {
          bestGrower = { name: user.delegator, val: growth };
        }
      }
    }
  });

  if (bestGrower.val > 0) {
    document.getElementById("stat-growth").innerHTML = 
      `@${bestGrower.name} <span style="font-size:0.6em; color:#4dff91">(+${bestGrower.val.toFixed(0)})</span>`;
  }
}

// NOVA FUNÇÃO: Renderiza quem mudou o saldo recentemente
function renderRecentActivity(delegations, historyData) {
  const container = document.getElementById("activity-panel");
  const tbody = document.getElementById("activity-body");
  const changes = [];

  delegations.forEach(user => {
    const hist = historyData[user.delegator];
    if (hist) {
      const dates = Object.keys(hist).sort();
      // Precisamos de pelo menos 2 pontos para comparar
      if (dates.length >= 2) {
        const todayHP = hist[dates[dates.length - 1]];
        const yesterdayHP = hist[dates[dates.length - 2]];
        const diff = todayHP - yesterdayHP;

        // Só mostra se houve mudança real (> 1 HP para evitar ruído de arredondamento)
        if (Math.abs(diff) >= 1) {
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

  // Se não houver mudanças, esconde o painel
  if (changes.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  // Ordena pelas maiores mudanças (seja positiva ou negativa)
  changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // Pega apenas top 5 para não poluir
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

// Cálculo de Fidelidade CORRIGIDO (Usa histórico local)
function calculateLoyalty(username, apiTimestamp, historyData) {
  let startDate = new Date(); // Default hoje

  // 1. Tenta pegar a data mais antiga do NOSSO histórico (Mais confiável)
  if (historyData[username]) {
    const dates = Object.keys(historyData[username]).sort();
    if (dates.length > 0) {
      const localFirstSeen = new Date(dates[0]);
      // Se a data do histórico local for mais antiga que a da API (que resetou), usa a local
      if (apiTimestamp) {
        const apiDate = new Date(apiTimestamp);
        startDate = localFirstSeen < apiDate ? localFirstSeen : apiDate;
      } else {
        startDate = localFirstSeen;
      }
    }
  } else if (apiTimestamp) {
    // Se não tem histórico local, usa API (usuário novo)
    startDate = new Date(apiTimestamp);
  }

  const now = new Date();
  const diffTime = Math.abs(now - startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

  return { days: diffDays, text: `${diffDays} dias` };
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
    const bonusHtml = getBonusBadge(rank);
    
    // Usa a nova função de lealdade híbrida
    const loyalty = calculateLoyalty(user.delegator, user.timestamp, historyData);
    let durationHtml = loyalty.text;
    
    if (loyalty.days > 365) {
      durationHtml += ` <span class="veteran-badge" title="Veterano (+1 ano)">🎖️</span>`;
    }

    tr.innerHTML = `
      <td>
        <span style="color:#666; margin-right:8px; font-weight:bold;">#${rank}</span>
        <img src="https://images.hive.blog/u/${user.delegator}/avatar/small" 
             style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
        <a href="https://peakd.com/@${user.delegator}" target="_blank">@${user.delegator}</a>
      </td>
      <td style="font-weight:bold; font-family:monospace; font-size:1.1em;">
          ${user.hp.toLocaleString("pt-BR", { minimumFractionDigits: 3 })}
      </td>
      <td style="font-size:0.9em;">
          ${durationHtml}
      </td>
      <td>${bonusHtml}</td>
      <td style="width:140px;">
          <canvas id="${canvasId}" width="120" height="40"></canvas>
      </td>
    `;
    tbody.appendChild(tr);

    let userHistory = historyData[user.delegator] || {};
    if (Object.keys(userHistory).length === 0) {
       const today = new Date().toISOString().slice(0, 10);
       userHistory = { [today]: user.hp };
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

function getBonusBadge(rank) {
  if (rank <= 10) return `<span class="bonus-tag bonus-gold">Ouro (+20%)</span>`;
  if (rank <= 20) return `<span class="bonus-tag bonus-silver">Prata (+15%)</span>`;
  if (rank <= 30) return `<span class="bonus-tag bonus-bronze">Bronze (+10%)</span>`;
  if (rank <= 40) return `<span class="bonus-tag bonus-honor">Honra (+5%)</span>`;
  return `<span style="opacity:0.3">—</span>`;
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
