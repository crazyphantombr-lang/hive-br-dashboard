/**
 * ARQUIVO MESTRE DE REGRAS DE NEGÓCIO (Business Rules Manifest)
 * Projeto: Hive BR Dashboard
 * Versão da Regra: 2.31.0
 * Última Validação: 24/02/2026
 */

const BUSINESS_RULES = {
    meta: {
        project_name: "Hive BR Dashboard",
        primary_account: "hive-br",
        voter_account: "hive-br.voter",
        token_symbol: "HBR"
    },

    // 1. POLÍTICA DE VERSIONAMENTO
    versioning: {
        schema: "MAJOR.FEATURE.PATCH",
        rules: [
            "Nunca reutilizar números de versão.",
            "MAJOR: Mudanças estruturais grandes ou quebras de compatibilidade.",
            "FEATURE: Novas funcionalidades estáveis.",
            "PATCH: Correções de bugs, ajustes de lógica ou compilações de desenvolvimento."
        ]
    },

    // 2. DEFINIÇÃO DE ENTIDADES E LISTAS
    lists: {
        file_path: "config/lists.json",
        parsing_logic: {
            "verificado_{ISO}": { status: "CERT" },
            "pendente_{ISO}": { status: "PENDING" },
            "watchlist": { description: "Lista legada. Mantida para compatibilidade." }
        }
    },

    // 3. REGRAS DE CÁLCULO DE MÉTRICAS (KPIs)
    metrics: {
        active_brazilians: {
            definition: "Usuários brasileiros que participaram da rede recentemente.",
            logic: (user) => {
                const is_brazilian = user.country_code.startsWith("BR"); 
                const days_since_post = (new Date() - new Date(user.last_post)) / (1000 * 60 * 60 * 24);
                return is_brazilian && days_since_post <= 30;
            }
        },
        highlight_card: {
            strategy: "GROWTH_FIRST",
            primary_logic: "Top Grower (Maior Crescimento Absoluto em 30 dias).",
            integrity_check: "Se o usuário delega há >30 dias e não tem histórico local, crescimento = NULL (Ignorar). Não assumir 0.",
            fallback_logic: "Top Delegator (Maior Saldo Total) se não houver grower validado.",
            ui_requirement: "O título do card é ESTÁTICO (definido no HTML). O script deve apenas injetar o valor (@usuario + HP), jamais alterar o rótulo."
        },
        activity_log: {
            definition: "Monitoramento das maiores alterações de delegação da comunidade.",
            lookback_period: "15 dias",
            logic: "O backend DEVE cruzar o HP atual com o dado histórico de 15 dias atrás usando 'ranking_history.json' (usando Leitura Polimórfica). Não usar variação de 'current.json'.",
            threshold: "Ignorar ruídos (alterações menores que 1 HP)."
        }
    },

    // 4. REGRAS DE INTERFACE (Frontend)
    ui: {
        flags: {
            method: "UNIVERSAL DETECTION",
            description: "O sistema converte automaticamente qualquer código ISO 3166-1 alpha-2."
        },
        tables: {
            sorting: "Deve permitir ordenação bidirecional (ASC/DESC) em todas as colunas numéricas e de texto.",
            sanitization: "Datas de 'Placeholder' da blockchain (ex: 1969/1970) DEVEM ser ocultadas.",
            formatting: "Remover redundâncias visuais (ex: não repetir 'HP' em todas as células da coluna HP Próprio)."
        }
    },

    // 5. PROTOCOLOS DE OPERAÇÃO
    agent_protocol: {
        compilation: "PROIBIDO compilar sem solicitação explícita (Comando 'compile').",
        data_integrity: "Nunca inventar dados. Ler polimorficamente arquivos históricos (Numbers vs Objects)."
    },

    // 6. RETENÇÃO DE DADOS E HISTÓRICO
    data_retention: {
        ranking_history: "Salva o estado diário de cada usuário (HP, Trail, Own HP).",
        global_history: "OBRIGATÓRIO: Salvar o 'snapshot' diário da comunidade (Total HP, Membros, Votos) em 'global_history.json'.",
        discovery: "Log imutável (Append-Only) de novos delegadores.",
        market_data: {
            requirement: "O sistema DEVE iniciar o rastreio diário do valor de mercado.",
            targets: ["HIVE (USD)", "USD (BRL)"],
            storage: "As cotações devem ser salvas diariamente dentro do 'global_history.json'."
        }
    },

    // 7. RESTRIÇÕES TÉCNICAS E API 
    api_constraints: {
        vote_history_scan: {
            problem: "A API 'get_account_history' tem limite hardcoded de 1000 itens.",
            solution: "PAGINAÇÃO OBRIGATÓRIA (Loop 'while').",
            rule: "O script deve buscar transações em lotes até cobrir 90 dias ou 50.000 txs. Jamais confiar em uma única chamada."
        }
    },

    // 8. RESILIÊNCIA E FALHAS 
    resilience: {
        external_apis: {
            target: "hive.vote (Curation Trail)",
            failure_protocol: "Se a API falhar ou retornar vazio/zero, o sistema DEVE manter o valor do último dia conhecido (Last Known Good Configuration). Jamais sobrescrever com 0."
        }
    }
};

module.exports = BUSINESS_RULES;
