/**
 * Script: Main Frontend Logic
 * Version: 1.1.1
 * Description: Carrega ranking e desenha gráficos históricos com Chart.js
 */

async function loadRanking() {
  try {
    const BASE_URL = "https://crazyphantombr-lang.github.io/hive-br-voter-ranking/data";
    
    // Busca paralela para performance
    const [resCurrent, resHistory] = await Promise.all([
      fetch(`${BASE_URL}/current.json`),
      fetch(`${BASE_URL}/history.json`)
    ]);

    if (!resCurrent.ok) throw new Error("Erro ao carregar current.json");
    
    const delegations = await resCurrent.json();
    // Se o history falhar (ex: primeira vez), usa objeto vazio
    const historyData = resHistory.ok ? await resHistory.json() : {};

    const tbody = document.getElementById("ranking-body");
    tbody.innerHTML = "";

    delegations.forEach((user, index) => {
      const delegator = user.delegator;
      const hp = user.hp;
      
      const tr = document.createElement("tr");

      // Prepara célula do gráfico
      // Usamos um ID único para o canvas baseada no nome do usuário
      const canvasId = `chart-${delegator}`;

      tr.innerHTML = `
        <td>
          <span style="margin-right:10px; font-weight:bold; color:#666;">#${index + 1}</span>
          <img src="https://images.hive.blog/u/${delegator}/avatar/small" 
               style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:6px;">
          <a href="https://peakd.com/@${delegator}" target="_blank">@${delegator}</a>
        </td>
        <td style="font-weight:bold;">
            ${hp.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} HP
        </td>
        <td style="width: 150px; height: 60px;">
            <canvas id="${canvasId}" width="140" height="50"></canvas>
        </td>
      `;

      tbody.appendChild(tr);

      // Renderiza o gráfico se houver histórico para este usuário
      if (historyData[delegator]) {
        renderSparkline(canvasId, historyData[delegator]);
      }
    });

  } catch (err) {
    console.error("Erro fatal na aplicação:", err);
  }
}

/**
 * Função auxiliar para desenhar o gráfico Sparkline
 * Remove eixos e legendas para caber na tabela limpa
 */
function renderSparkline(canvasId, userHistoryObj) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  
  // Transforma objeto {"2023-01-01": 100, ...} em arrays ordenados
  const sortedDates = Object.keys(userHistoryObj).sort();
  const values = sortedDates.map(date => userHistoryObj[date]);

  // Cor da linha baseada na tendência (Subiu ou desceu no último dia?)
  const lastValue = values[values.length - 1];
  const penLastValue = values.length > 1 ? values[values.length - 2] : lastValue;
  const color = lastValue >= penLastValue ? '#28a745' : '#dc3545'; // Verde ou Vermelho

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: sortedDates, // Necessário para o eixo X, mesmo oculto
      datasets: [{
        data: values,
        borderColor: color,
        borderWidth: 2,
        fill: false,
        pointRadius: 0, // Remove bolinhas dos pontos para visual limpo
        pointHoverRadius: 4,
        tension: 0.1 // Suavização leve da linha
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true } // Mantém tooltip para ver valores ao passar mouse
      },
      scales: {
        x: { display: false }, // Oculta eixo X
        y: { display: false }  // Oculta eixo Y
      },
      layout: {
        padding: 5
      }
    }
  });
}

// Inicia aplicação
document.addEventListener("DOMContentLoaded", loadRanking);
