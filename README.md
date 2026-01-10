# 🐝 Hive BR • Dashboard de Delegação

![Hive BR](https://img.shields.io/badge/Hive-BR-red) ![Status](https://img.shields.io/badge/Status-Active-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue) ![AI Powered](https://img.shields.io/badge/AI-Gemini-orange)

Painel de controle analítico desenvolvido para monitorar os delegadores do projeto de curadoria **@hive-br.voter**. O sistema oferece transparência total sobre a distribuição de votos, fidelidade dos usuários, cálculo de bônus e gera relatórios de performance automatizados.

🔗 **Acesse o Dashboard:** [https://crazyphantombr-lang.github.io/hive-br-dashboard/](https://crazyphantombr-lang.github.io/hive-br-dashboard/)

---

## 📊 Funcionalidades

### 1. Monitoramento de Delegação
* Rastreamento em tempo real do **Hive Power (HP)** delegado.
* **Sistema de Lealdade:** Calcula o tempo exato desde a última atualização da delegação na blockchain.
* Histórico visual (Sparkline) mostrando a evolução da delegação (Verde = Aumento, Vermelho = Queda, Cinza = Estável).

### 2. Auditoria de Curadoria & Atividade
* **Última Curadoria Real:** Exibe a data exata do último voto que o delegador **recebeu** da conta `@hive-br.voter`.
* **Rastreamento de Votos:** Contabiliza o volume de votos recebidos nos últimos 30 dias.
* **Status de Atividade:** Monitora a última vez que o usuário postou ou comentou na blockchain para identificar contas inativas.

### 3. Relatórios Inteligentes (IA) 🤖
O sistema integra a API do **Google Gemini** para atuar como um "Gerente de Comunidade Virtual".
* **Relatórios Mensais:** Gera automaticamente um post em Markdown no último dia do mês.
* **Análise de Dados:** Interpreta o crescimento do HP, destaca o "Delegador do Mês" (maior aumento de delegação) e compara estatísticas com meses anteriores.
* **Modo Manual:** Permite a geração forçada de relatórios para inspeção via GitHub Actions.

### 4. Novas Métricas de Comunidade
Monitoramos a saúde do ecossistema brasileiro através de métricas exclusivas:
* **Membros Ativos do Projeto:** Soma de Delegadores + Seguidores da Trilha de Curadoria (deduplicados).
* **Brasileiros Ativos na Hive:** Contagem de usuários identificados como brasileiros (verificados ou pendentes) que registraram atividade de **escrita** (postagem ou comentário) nos últimos 30 dias.

### 5. Sistema de Bônus e Gamificação
O dashboard calcula automaticamente os bônus aplicáveis para maximizar a curadoria:

| Tipo de Bônus | Critério | Recompensa Visual |
| :--- | :--- | :--- |
| **Ranking** | Top 10 / 20 / 30 / 40 | Etiquetas Ouro, Prata, Bronze, Honra (+20% a +5%) |
| **HBR Stake** | Tokens HBR em Stake | +10% a cada 10 tokens (Máx +20%) |
| **Trilha** | Seguidor na HiveVote | **+5% Fixo** (Cor Magenta) |
| **Veterano** | Delegação > 1 Ano | Medalha de Honra 🎖️ |

---

## 🛠️ Tecnologia

O projeto opera em uma arquitetura *Serverless* com Pipeline Unificada:

* **Backend (Node.js):** Scripts que coletam dados da API Hive (HAFSQL/Condenser) e Hive-Engine, enriquecidos com lógica de negócio customizada.
* **AI Engine:** Integração com **Google Gemini Pro** para análise de dados e redação de conteúdo.
* **Automação (GitHub Actions):** * **Pipeline Unificada:** Um único workflow (`Main Data Pipeline`) executa a cada 6 horas a sequência: *Coleta de Dados* ➔ *Atualização de Histórico* ➔ *Geração de Relatório* ➔ *Commit*. Isso evita conflitos de dados e garante integridade.
* **Frontend (Vanilla JS):** Interface leve, responsiva e sem frameworks pesados, hospedada no GitHub Pages.

---

## 🚀 Como Executar Localmente

Se desejar contribuir ou testar modificações:

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/crazyphantombr-lang/hive-br-dashboard.git](https://github.com/crazyphantombr-lang/hive-br-dashboard.git)
   cd hive-br-dashboard
