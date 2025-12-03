# 🐝 Hive BR • Delegator Dashboard

![Status](https://img.shields.io/badge/Status-Active-success)
![Version](https://img.shields.io/badge/Version-1.3.0-blueviolet)
![License](https://img.shields.io/badge/License-MIT-blue)
![Platform](https://img.shields.io/badge/Platform-Hive%20Blockchain-red)

Um painel analítico interativo para monitorar, classificar e incentivar delegações de Hive Power (HP) para a conta de curadoria **@hive-br.voter**.

O projeto utiliza **GitHub Actions** para automação de dados sem servidor (serverless) e **GitHub Pages** para hospedagem estática.

🔗 **Acesse o Dashboard:** [Clique aqui para visualizar](https://crazyphantombr-lang.github.io/hive-br-voter-ranking/)

---

## 🚀 Funcionalidades (v1.3.0)

### 📊 Dashboard Interativo
- **Cards de Estatísticas:** Visualização rápida do Total de HP, Contagem de Delegadores e Maior Crescimento (24h).
- **Gráficos Sparkline:** Cada usuário possui um mini-gráfico histórico na própria tabela, mostrando a tendência de sua delegação.
- **Badges de Bônus:** Classificação automática com faixas de recompensa visual (Ouro +20%, Prata +15%, etc.).

### 🤖 Automação Inteligente
- **Atualização Contínua:** Um robô (workflow) roda a cada **6 horas** para buscar novos dados na Blockchain.
- **Histórico Persistente:** O sistema mantém um registro histórico (`ranking_history.json`) para comparações temporais, mesmo sendo um site estático.
- **Metadados:** Gera carimbos de data/hora para transparência na atualização.

### ⚡ Performance & UX
- **Busca em Tempo Real:** Filtro instantâneo de delegadores sem recarregar a página.
- **Tema Cyberpunk/Dark:** Interface moderna focada em legibilidade e estética crypto.
- **Cache-Busting:** Lógica de scripts para garantir que os dados novos sejam carregados.

---

## 🛠️ Arquitetura Técnica

O projeto opera em um ciclo automatizado de 3 etapas:

### 1. Coleta (`fetch_delegations.js`)
Conecta-se à API SQL da Hive (HAF) para buscar todas as delegações ativas para `@hive-br.voter`.
- Gera: `data/current.json` (Estado atual)
- Gera: `data/meta.json` (Estatísticas globais e timestamp)

### 2. Processamento (`merge_history.js`)
Cruza os dados recém-coletados com o arquivo de histórico existente.
- Detecta novas entradas.
- Atualiza valores existentes.
- Registra saídas (zera o valor de quem removeu a delegação).
- Gera: `data/ranking_history.json` (Base de dados temporal)

### 3. Visualização (`Frontend`)
O site estático (`index.html` + `main.js`) consome os 3 arquivos JSON gerados e renderiza a interface utilizando:
- **Vanilla JS:** Para lógica de DOM e Fetch.
- **Chart.js:** Para renderização dos gráficos vetoriais.

---

## 📂 Estrutura de Arquivos

```text
├── .github/workflows
│   └── update-history.yml  # O "Cérebro" da automação (Cron Job)
├── data/
│   ├── current.json        # Snapshot mais recente
│   ├── meta.json           # Dados do cabeçalho
│   └── ranking_history.json # Banco de dados histórico
├── scripts/
│   ├── fetch_delegations.js
│   └── merge_history.js
├── index.html              # Estrutura
├── style.css               # Tema Cyberpunk v1.3
├── main.js                 # Lógica do Dashboard
└── README.md               # Documentação
