# 🐝 Hive BR • Dashboard de Delegação

![Hive BR](https://img.shields.io/badge/Hive-BR-red) ![Status](https://img.shields.io/badge/Status-Active-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

Painel de controle analítico desenvolvido para monitorar os delegadores do projeto de curadoria **@hive-br.voter**. O sistema oferece transparência total sobre a distribuição de votos, fidelidade dos usuários e cálculo de bônus.

🔗 **Acesse o Dashboard:** [https://crazyphantombr-lang.github.io/hive-br-dashboard/](https://crazyphantombr-lang.github.io/hive-br-dashboard/)

---

## 📊 Funcionalidades

### 1. Monitoramento de Delegação
* Rastreamento em tempo real do **Hive Power (HP)** delegado.
* **Sistema de Lealdade:** Calcula há quanto tempo a delegação está ativa (Hoje, 1 dia, X dias).
* Histórico visual (Sparkline) mostrando a evolução da delegação (Verde = Aumento, Vermelho = Queda, Cinza = Estável).

### 2. Auditoria de Curadoria
* **Rastreamento de Votos:** Verifica se o delegador recebeu votos do bot `@hive-br.voter` nos últimos 30 dias.
* **Lógica de "Dias Únicos":** O sistema filtra múltiplos votos no mesmo dia, garantindo uma contagem justa (Máx 1 voto/dia) para evitar distorções estatísticas.
* **Status de Atividade:** Monitora a última vez que o usuário postou ou comentou na blockchain para identificar contas inativas/abandonadas.

### 3. Sistema de Bônus e Gamificação
O dashboard calcula automaticamente os bônus aplicáveis para maximizar a curadoria:

| Tipo de Bônus | Critério | Recompensa Visual |
| :--- | :--- | :--- |
| **Ranking** | Top 10 / 20 / 30 / 40 | Etiquetas Ouro, Prata, Bronze, Honra (+20% a +5%) |
| **HBR Stake** | Tokens HBR em Stake | +10% a cada 10 tokens (Máx +20%) |
| **Trilha** | Seguidor na HiveVote | **+5% Fixo** (Cor Magenta) |
| **Veterano** | Delegação > 1 Ano | Medalha de Honra 🎖️ |

---

## 🛠️ Tecnologia

O projeto opera em uma arquitetura *Serverless* utilizando a infraestrutura do GitHub:

* **Backend (Node.js):** Scripts automatizados que coletam dados da API Hive (HAFSQL e Condenser API) e Hive-Engine.
* **Automação (GitHub Actions):** Workflow agendado (`cron`) que executa a cada 6 horas para atualizar os dados JSON.
* **Frontend (Vanilla JS):** Interface leve, responsiva e sem frameworks pesados, hospedada no GitHub Pages.

---

## 🚀 Como Executar Localmente

Se desejar contribuir ou testar modificações:

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/crazyphantombr-lang/hive-br-dashboard.git](https://github.com/crazyphantombr-lang/hive-br-dashboard.git)
   cd hive-br-dashboard
