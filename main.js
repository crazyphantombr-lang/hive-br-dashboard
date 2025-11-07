import { fetchDelegationData } from "./scripts/fetch_delegations.js";

async function loadHistory() {
  const res = await fetch("data/history.json");
  return await res.json();
}

async function render() {
  const ranking = await fetchDelegationData();
  const history = await loadHistory();
  const tbody = document.getElementById("ranking-body");

  ranking.forEach((entry) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${entry.delegator}</td>
      <td class="hp-value">${entry.hp.toFixed(2)}</td>
      <td><canvas id="chart-${entry.delegator}"></canvas></td>
    `;
    tbody.appendChild(row);

    const userHistory = history[entry.delegator] || {};
    const labels = Object.keys(userHistory);
    const data = Object.values(userHistory);

    if (labels.length > 1) {
      new Chart(document.getElementById(`chart-${entry.delegator}`), {
        type: "line",
        data: { labels, datasets: [{ data, fill: false }] },
        options: { scales: { x: { display: false }, y: { display: false } }, plugins: { legend: { display: false } } }
      });
    }
  });
}

render();
