async function loadCurrent() {
  try {
    const res = await fetch("data/current.json");
    return await res.json();
  } catch (e) {
    console.error("Erro ao carregar current.json:", e);
    return [];
  }
}

async function loadHistory() {
  try {
    const res = await fetch("data/history.json");
    return await res.json();
  } catch (e) {
    console.error("Erro ao carregar history.json:", e);
    return {};
  }
}

async function render() {
  const ranking = await loadCurrent();
  const history = await loadHistory();
  const tbody = document.getElementById("ranking-body");

  tbody.innerHTML = ""; // Limpa antes de renderizar

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
        data: {
          labels,
          datasets: [
            {
              data,
              borderWidth: 1
            }
          ]
        },
        options: {
          scales: {
            x: { display: false },
            y: { display: false }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  });
}

render();
