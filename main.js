/**
 * Script: Main Frontend Logic
 * Version: 2.18.3 (Relative Path Fix)
 * Description: Uses relative paths for data fetching to prevent CORS/URL mismatches.
 */

;(function() { 
  "use strict";

  var dashboardData = []; 
  var dashboardHistory = {};
  var dashboardSort = { column: 'delegated_hp', direction: 'desc' };

  async function loadDashboard() {
    // --- CORREÇÃO AQUI: Caminho relativo simples ---
    const BASE_URL = "data"; 
    
    try {
      // Adiciona timestamp para evitar cache agressivo do JSON
      const antiCache = `?t=${new Date().getTime()}`;

      const [resCurrent, resHistory, resMeta] = await Promise.all([
        fetch(`${BASE_URL}/current.json${antiCache}`),
        fetch(`${BASE_URL}/ranking_history.json${antiCache}`),
        fetch(`${BASE_URL}/meta.json${antiCache}`)
      ]);

      if (!resCurrent.ok) throw new Error("Erro ao carregar current.json");
      if (!resMeta.ok) throw new Error("Erro ao carregar meta.json");

      const rawCurrent = await resCurrent.json();
      dashboardData = Array.isArray(rawCurrent) ? rawCurrent : (rawCurrent.ranking || []);
      
      dashboardHistory = resHistory.ok ? await resHistory.json() : {};
      const metaData = resMeta.ok ? await resMeta.json() : null;

      updateStats(dashboardData, metaData, dashboardHistory);
      renderRecentActivity(dashboardData, dashboardHistory);
      renderTable(); 
      setupSearch();

      console.log("✅ Dados carregados com sucesso via caminho relativo.");

    } catch (err) {
      console.error("❌ Erro fatal no dashboard:", err);
      const el = document.getElementById("last-updated");
      if (el) el.innerText = "Erro: Verifique o Console (F12)";
    }
  }

  // ... (MANTENHA O RESTANTE DO CÓDIGO EXATAMENTE IGUAL ABAIXO) ...
  
  function getMonthName(subtractMonths) {
      const d = new Date();
      d.setMonth(d.getMonth() - subtractMonths);
      const monthName = d.toLocaleString('pt-BR', { month: 'long' });
      return monthName.charAt(0).toUpperCase() + monthName.slice(1);
  }

  function updateStats(delegations, meta, historyData) {
    const dateEl = document.getElementById("last-updated");
    if (meta && meta.last_updated) {
      const dateObj = new Date(meta.last_updated);
      dateEl.innerText = `Atualizado em: ${dateObj.toLocaleString("pt-BR")}`;
    }

    const projectHp = meta && meta.project_account_hp ? meta.project_account_hp : 0;
    const delegatedHp = delegations.reduce((acc, curr) => acc + (curr.delegated_hp || 0), 0);
    const communityPower = projectHp + delegatedHp;

    document.getElementById("stat-community-power").innerText = 
      Math.floor(communityPower).toLocaleString("pt-BR") + " HP";

    document.getElementById("stat-own-hp").innerText = 
      Math.floor(projectHp).toLocaleString("pt-BR") + " HP";

    document.getElementById("stat-delegated-hp").innerText = 
      Math.floor(delegatedHp).toLocaleString("pt-BR") + " HP";
    
    const activeDelegators = delegations.filter(d => d.delegated_hp > 0).length;
    document.getElementById("stat-count").innerText = activeDelegators;

    const activeBrs = meta && meta.active_brazilians ? meta.active_brazilians : 0;
    const brLabel = document.getElementById("active-br-label");
    if (brLabel) brLabel.innerText = activeBrs;

    const v24h = meta && meta.votes_24h ? meta.votes_24h : 0;
    const vCurr = meta && meta.votes_month_current ? meta.votes_month_current : 0;
    const vM1   = meta && meta.votes_month_prev1 ? meta.votes_month_prev1 : 0;
    const vM2   = meta && meta.votes_month_prev2 ? meta.votes_month_prev2 : 0;
    const trailCount = meta && meta.curation_trail_count ? meta.curation_trail_count : 0;

    const lblVotes = document.getElementById("lbl-votes-current");
    if (lblVotes) lblVotes.innerText = `VOTOS DISTRIBUÍDOS EM ${getMonthName(0).toUpperCase()}`;
    
    const lblM1 = document.getElementById("lbl-votes-m1");
    if (lblM1) lblM1.innerText = `Votos distribuídos em ${getMonthName(1)}`; 
    
    const lblM2 = document.getElementById("lbl-votes-m2");
    if (lblM2) lblM2.innerText = `Votos distribuídos em ${getMonthName(2)}`; 

    if(document.getElementById("stat-votes-current")) document.getElementById("stat-votes-current").innerText = vCurr;
    if(document.getElementById("stat-votes-24h")) document.getElementById("stat-votes-24h").innerText = v24h;
    if(document.getElementById("stat-votes-m1")) document.getElementById("stat-votes-m1").innerText = vM1;
    if(document.getElementById("stat-votes-m2")) document.getElementById("stat-votes-m2").innerText = vM2;
    if(document.getElementById("stat-trail-count")) document.getElementById("stat-trail-count").innerText = trailCount;

    // MVP Calculation (Last 30 Days)
    let bestGrower = { name: "—", val: 0 };
    const today = new Date();
    const targetDate = new Date();
    targetDate.setDate(today.getDate() - 30);
    const targetKey = targetDate.toISOString().split('T')[0];

    delegations.forEach(user => {
      const name = user.delegator;
      const currentVal = user.delegated_hp || 0;
      let prevVal = 0;

      if (historyData[name]) {
          if (historyData[name][targetKey]) {
              prevVal = historyData[name][targetKey];
          } else {
              const dates = Object.keys(historyData[name]).sort();
              if (dates.length > 0 && dates[0] < targetKey) {
                 prevVal = currentVal; 
              } else {
                 prevVal = 0;
              }
          }
      } else {
          prevVal = 0;
      }

      const growth = currentVal - prevVal;
      if (growth > bestGrower.val && growth > 10) {
         bestGrower = { name: name, val: growth };
      }
    });

    const mvpEl = document.getElementById("stat-growth");
    if (mvpEl) {
       if (bestGrower.val > 0) {
          mvpEl.innerHTML = `
            <a href="https://peakd.com/@${bestGrower.name}" target="_blank" style="color:inherit;text-decoration:none;">
              @${bestGrower.name} 
              <span style="font-size:0.8em; color:#4dff91; font-weight:bold;">(+${Math.floor(bestGrower.val)})</span>
            </a>`;
       } else {
          mvpEl.innerText = "—";
       }
    }
  }

  function calculateLoyalty(username, apiTimestamp, historyData) {
    if (apiTimestamp && !apiTimestamp.startsWith("1970")) {
        const lastChange = new Date(apiTimestamp);
        const now = new Date();
        const diffDays = Math.floor(Math.abs(now - lastChange) / (1000 * 60 * 60 * 24));
        return { days: diffDays, text: diffDays === 0 ? "Hoje" : diffDays === 1 ? "1 dia" : `${diffDays} dias` };
    }
    if (historyData[username]) {
        const dates = Object.keys(historyData[username]).sort();
        if (dates.length > 0) {
            const first = new Date(dates[0]);
            const now = new Date();
            const diffDays = Math.floor((now - first) / (1000 * 60 * 60 * 24));
            return { days: diffDays, text: `${diffDays} dias*` };
        }
    }
    return { days: 0, text: "—" };
  }

  function getTrailBonus(inTrail) {
      if (inTrail) return `<span class="bonus-tag bonus-trail">+5%</span>`;
      return `<span style="opacity:0.3; font-size:0.8em">—</span>`;
  }

  function renderTable() {
    const tbody = document.getElementById("ranking-body");
    tbody.innerHTML = "";

    dashboardData.forEach((user, index) => {
      const rank = index + 1;
      const tr = document.createElement("tr");
      tr.classList.add("delegator-row");
      tr.dataset.name = (user.delegator || "").toLowerCase();

      const canvasId = `chart-${user.delegator}`;
      const loyalty = calculateLoyalty(user.delegator, user.timestamp, dashboardHistory);
      let durationHtml = loyalty.text;
      if (loyalty.days > 365) durationHtml += ` <span class="veteran-badge" title="Estabilidade > 1 ano">🎖️</span>`;

      const trueRank = getTrueRank(user.delegator);
      const ownHp = user.total_account_hp || 0;
      const hbrStake = user.token_balance || 0;
      
      const pdDate = user.next_withdrawal;
      let ownHpStyle = "font-family:monospace; color:#888;";
      let pdHtml = `<span style="opacity:0.2">—</span>`;
      if (pdDate && !pdDate.startsWith("1969") && !pdDate.startsWith("1970")) {
          ownHpStyle = "font-family:monospace; color:#ff4d4d; font-weight:bold;"; 
          const dateObj = new Date(pdDate);
          pdHtml = `<span style="color:#ff4d4d; font-size:0.85em;">📉 ${dateObj.toLocaleDateString("pt-BR")}</span>`;
      }

      let flagHtml = "";
      if (user.country_code === "BR_CERT") flagHtml = `<span title="Brasileiro Verificado" style="margin-left:5px;cursor:help;">🇧🇷</span>`;
      else if (user.country_code === "BR") flagHtml = `<span class="flag-bw" title="Brasileiro Pendente" style="margin-left:5px;cursor:help;">🇧🇷</span>`;
      else if (user.country_code === "PT_CERT") flagHtml = `<span title="Português Verificado" style="margin-left:5px;cursor:help;">🇵🇹</span>`;
      else if (user.country_code === "PT") flagHtml = `<span class="flag-bw" title="Português Pendente" style="margin-left:5px;cursor:help;">🇵🇹</span>`;

      const delegationBonusHtml = getDelegationBonus(trueRank);
      const hbrBonusHtml = getHbrBonus(hbrStake);
      const trailBonusHtml = getTrailBonus(user.in_curation_trail);
      const curationHtml = getCurationStatus(user.last_vote_date, user.votes_month);
      const lastPostHtml = getLastPostStatus(user.last_user_post);
      const hbrStyle = hbrStake > 0 ? "color:#4da6ff; font-weight:bold;" : "color:#444;"; 

      tr.innerHTML = `
        <td class="sticky-col">
          <span style="color:#666; margin-right:8px; font-weight:bold;">#${trueRank}</span>
          <img src="https://images.hive.blog/u/${user.delegator}/avatar/small" 
               style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
          <a href="https://peakd.com/@${user.delegator}" target="_blank">@${user.delegator}</a>
          ${flagHtml}
        </td>
        <td style="font-weight:bold; font-family:monospace; font-size:1.1em; color:#4dff91;">
            ${Math.floor(user.delegated_hp).toLocaleString("pt-BR")}
        </td>
        <td style="font-size:0.9em;">${durationHtml}</td>
        <td style="${ownHpStyle}">${Math.floor(ownHp).toLocaleString("pt-BR")} HP</td>
        <td style="text-align:center;">${pdHtml}</td>
        <td style="font-family:monospace; ${hbrStyle}">${hbrStake.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
        <td>${lastPostHtml}</td>
        <td>${curationHtml}</td>
        <td>${delegationBonusHtml}</td>
        <td>${hbrBonusHtml}</td>
        <td>${trailBonusHtml}</td>
        <td style="width:140px;">
            <canvas id="${canvasId}" width="120" height="40"></canvas>
        </td>
      `;
      tbody.appendChild(tr);

      let userHistory = dashboardHistory[user.delegator] || {};
      if (Object.keys(userHistory).length === 0) {
         const today = new Date().toISOString().slice(0, 10);
         userHistory = { [today]: user.delegated_hp };
      }
      renderSparkline(canvasId, userHistory);
    });
  }

  function calculateDuration(dateString) {
    if (!dateString || dateString.startsWith("1970")) return null; 
    const start = new Date(dateString.endsWith("Z") ? dateString : dateString + "Z");
    const now = new Date();
    const diffTime = Math.abs(now - start);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
  }

  function getCurationStatus(lastVoteDate, count30d) {
    if (lastVoteDate && !lastVoteDate.startsWith("1970")) {
      const daysAgo = calculateDuration(lastVoteDate);
      let color = "#666";
      let icon = "";
      if (daysAgo <= 3) { color = "#4dff91"; icon = "⚡"; } 
      else if (daysAgo <= 15) { color = "#e6e6ff"; } 
      else { color = "#ffcc00"; icon = "⚠️"; }
      const daysText = daysAgo === 0 ? "Hoje" : daysAgo === 1 ? "Ontem" : `${daysAgo}d atrás`;
      return `<div style="line-height:1.2;"><span style="color:${color}; font-weight:bold;">${icon} ${daysText}</span><br><span style="font-size:0.8em; color:#888;">(${count30d || 0} votos/mês)</span></div>`;
    }
    return `<span style="color:#666; font-size:0.8em; opacity:0.5; font-weight:bold;">SEM DADOS</span>`;
  }

  function getLastPostStatus(dateString) {
      if (!dateString || dateString.startsWith("1970")) return `<span style="color:#444; font-size:0.85em">Sem posts</span>`;
      const daysAgo = calculateDuration(dateString);
      if (daysAgo === 0) return `<span style="color:#4dff91; font-weight:bold;">Hoje</span>`;
      if (daysAgo === 1) return `<span style="color:#4dff91;">Ontem</span>`;
      let color = "#fff";
      if (daysAgo > 7) color = "#ccc";
      if (daysAgo > 30) color = "#666";
      return `<span style="color:${color}; font-size:0.9em;">${daysAgo} dias atrás</span>`;
  }

  window.handleSort = function(column) {
    if (dashboardSort.column === column) {
      dashboardSort.direction = dashboardSort.direction === 'desc' ? 'asc' : 'desc';
    } else {
      dashboardSort.column = column;
      dashboardSort.direction = column === 'delegator' ? 'asc' : 'desc';
    }
    updateSortIcons(column, dashboardSort.direction);

    dashboardData.sort((a, b) => {
      let valA = a[column];
      let valB = b[column];
      if (column === 'timestamp') {
          valA = calculateLoyalty(a.delegator, a.timestamp, dashboardHistory).days;
          valB = calculateLoyalty(b.delegator, b.timestamp, dashboardHistory).days;
      } 
      else if (column === 'last_user_post' || column === 'last_vote_date' || column === 'next_withdrawal') {
          valA = valA ? new Date(valA).getTime() : 0;
          valB = valB ? new Date(valB).getTime() : 0;
      }
      else if (column === 'delegator') {
          valA = String(valA).toLowerCase();
          valB = String(valB).toLowerCase();
      }
      else {
          valA = parseFloat(valA) || 0;
          valB = parseFloat(valB) || 0;
      }
      if (valA < valB) return dashboardSort.direction === 'asc' ? -1 : 1;
      if (valA > valB) return dashboardSort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    renderTable();
  };

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
    if(!container || !tbody) return;

    const changes = [];
    const NOISE_THRESHOLD = 5.0; 
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
    tbody.innerHTML = "";
    changes.slice(0, 5).forEach(change => {
      const tr = document.createElement("tr");
      const diffClass = change.diff > 0 ? "diff-positive" : "diff-negative";
      const signal = change.diff > 0 ? "+" : "";
      tr.innerHTML = `<td><a href="https://peakd.com/@${change.name}" target="_blank">@${change.name}</a></td><td class="val-muted">${Math.floor(change.old)}</td><td style="font-weight:bold">${Math.floor(change.new)}</td><td class="${diffClass}">${signal}${Math.floor(change.diff)} HP</td>`;
      tbody.appendChild(tr);
    });
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

  function getTrueRank(username) {
      const sortedByHp = [...dashboardData].sort((a, b) => (b.delegated_hp || 0) - (a.delegated_hp || 0));
      return sortedByHp.findIndex(u => u.delegator === username) + 1;
  }

  function setupSearch() {
    const input = document.getElementById("search-input");
    if(!input) return;
    input.addEventListener("keyup", (e) => {
      const term = e.target.value.toLowerCase();
      const rows = document.querySelectorAll(".delegator-row");
      rows.forEach(row => {
        row.style.display = row.dataset.name.includes(term) ? "" : "none";
      });
    });
  }

  function renderSparkline(canvasId, userHistoryObj) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    const sortedDates = Object.keys(userHistoryObj).sort();
    const values = sortedDates.map(date => userHistoryObj[date]);
    const last = values[values.length - 1];
    const prev = values.length > 1 ? values[values.length - 2] : last;
    let color = '#888'; 
    if (last > prev) color = '#4dff91'; 
    if (last < prev) color = '#ff4d4d'; 
    if (window.myCharts && window.myCharts[canvasId]) window.myCharts[canvasId].destroy();
    if (!window.myCharts) window.myCharts = {};
    window.myCharts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: sortedDates, datasets: [{ data: values, borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.2, fill: false }] },
      options: { responsive: false, plugins: { legend: {display:false}, tooltip: {enabled: false} }, scales: { x: {display:false}, y: {display:false} }, elements: { point: { radius: 0 } } }
    });
  }
  document.addEventListener("DOMContentLoaded", loadDashboard);
})();
