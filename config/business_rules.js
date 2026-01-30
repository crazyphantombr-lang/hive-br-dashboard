/**
 * ARQUIVO MESTRE DE REGRAS DE NEGÓCIO (Business Rules Manifest)
 * Projeto: Hive BR Dashboard
 * Última Validação: 30/01/2026
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
            "FEATURE: Novas funcionalidades estáveis (ex: Modal, ISO Universal Flags).",
            "PATCH: Correções de bugs, ajustes de lógica ou compilações de desenvolvimento."
        ]
    },

    // 2. DEFINIÇÃO DE ENTIDADES E LISTAS
    lists: {
        file_path: "config/lists.json",
        // Opção 2 (30/01/2026): Listas de países agora são fontes ativas de monitoramento.
        // Se o usuário está em verificado_XX, ele é monitorado mesmo sem delegação.
        parsing_logic: {
            "verificado_{ISO}": { status: "CERT" },
            "pendente_{ISO}": { status: "PENDING" },
            "watchlist": { description: "Lista legada. Mantida para compatibilidade." }
        }
    },

    // 3. REGRAS DE CÁLCULO DE MÉTRICAS (KPIs)
    metrics: {
        // Regra v2.30.2: Contagem de Ativos
        active_brazilians: {
            definition: "Usuários brasileiros que participaram da rede recentemente.",
            logic: (user) => {
                const is_brazilian = user.country_code.startsWith("BR"); 
                const days_since_post = (new Date() - new Date(user.last_post)) / (1000 * 60 * 60 * 24);
                return is_brazilian && days_since_post <= 30;
            }
        }
    },

    // 4. REGRAS DE INTERFACE (Frontend)
    ui: {
        flags: {
            method: "UNIVERSAL DETECTION (v2.30.0+)",
            description: "O sistema converte automaticamente qualquer código ISO 3166-1 alpha-2 (ex: BR, GR, VE) em Emoji e Nome (via Intl API). Não requer dicionário manual."
        }
    },

    // 5. PROTOCOLOS DE OPERAÇÃO
    agent_protocol: {
        compilation: "PROIBIDO compilar sem solicitação explícita.",
        data_integrity: "Nunca inventar dados."
    },

    // 6. PROTOCOLOS DE DESCOBERTA (Inbox)
    discovery: {
        file_path: "data/discovery.json",
        integrity_rule: "LOG IMUTÁVEL (Append-Only). Adiciona apenas novos nomes.",
        sanitization: "A comparação de nomes deve ser sempre insensitive (lowercase + trim) para evitar duplicatas."
    }
};

module.exports = BUSINESS_RULES;
