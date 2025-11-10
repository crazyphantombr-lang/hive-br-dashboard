async function loadRanking() {
  try {
    // Busca o arquivo gerado pelo GitHub Actions
    const res = await fetch("./data/current.json");
    const delegations = await res.json();

    const tbody = document.getElementById("ranking-body");
    tbody.innerHTML = "";

    delegations.forEach(({ delegator, hp }) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>
          <img src="https://images.hive.blog/u/${delegator}/avatar/small" 
               style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:6px;">
          <a href="https://peakd.com/@${delegator}" target="_blank">@${delegator}</a>
        </td>
        <td>${hp.toLocaleString("pt-BR", { minimumFractionDigits: 3 })}</td>
        <td>—</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Erro ao carregar ranking:", err);
  }
}

loadRanking();
