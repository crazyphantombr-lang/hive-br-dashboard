/**
 * ARQUIVO MESTRE DE REGRAS DE NEGÓCIO (Business Rules Manifest)
 * Projeto: Hive BR Dashboard
 * Última Validação: 30/01/2026
 * * INSTRUÇÃO PARA A IA:
 * Antes de qualquer refatoração ou cálculo de métricas, consulte este objeto.
 * Este arquivo sobrepõe qualquer inferência probabilística.
 */

const BUSINESS_RULES = {
    meta: {
        project_name: "Hive BR Dashboard",
        primary_account: "hive-br",
        voter_account: "hive-br.voter",
        token_symbol: "HBR"
    },

    // 1. POLÍTICA DE VERSIONAMENTO (Estrita)
    versioning: {
        schema: "MAJOR.FEATURE.PATCH",
        rules: [
            "Nunca reutilizar números de versão.",
            "MAJOR: Mudanças estruturais grandes ou quebras de compatibilidade.",
            "FEATURE: Novas funcionalidades estáveis (ex: Modal, ISO Flags).",
            "PATCH: Correções de bugs, ajustes de lógica ou compilações de desenvolvimento."
        ],
        license_header: "O texto da licença MIT deve constar apenas no cabeçalho dos scripts, nunca no rodapé."
    },

    // 2. DEFINIÇÃO DE ENTIDADES E LISTAS (lists.json)
    lists: {
        file_path: "config/lists.json",
        // Lógica de Parsing para chaves do JSON
        parsing_logic: {
            "verificado_{ISO}": { 
                status: "CERT", 
                description: "Membro verificado, exibe bandeira colorida e título oficial." 
            },
            "pendente_{ISO}": { 
                status: "PENDING", 
                description: "Membro pendente, exibe bandeira P&B e título de aviso." 
            },
            "watchlist": {
                description: "Lista de monitoramento silencioso. Garante que os dados sejam baixados mesmo sem delegação."
            }
        },
        supported_standards: "ISO 3166-1 alpha-2 (ex: BR, PT, CU, VE, US)"
    },

    // 3. REGRAS DE CÁLCULO DE MÉTRICAS (KPIs)
    metrics: {
        
        // REGRA CRÍTICA: BRASILEIROS ATIVOS
        // Contexto: Corrigido na v2.29.1 após erro de inflação de números.
        active_brazilians: {
            definition: "Usuários brasileiros que participaram da rede recentemente.",
            logic: (user) => {
                const is_brazilian = user.country_code.startsWith("BR"); // Aceita 'BR' e 'BR_CERT'
                const days_since_post = (new Date() - new Date(user.last_post)) / (1000 * 60 * 60 * 24);
                
                // O valor da delegação (delegated_hp) É IRRELEVANTE para esta métrica específica.
                // Apenas nacionalidade e atividade contam.
                return is_brazilian && days_since_post <= 30;
            }
        },

        // Definição de Membros da Comunidade (Geral)
        community_members: {
            definition: "Total de usuários únicos rastreados (Delegadores + Trail + Watchlist).",
            logic: "Union(Delegators, Trail_Followers, Watchlist_Users).size"
        },

        // Definição de HP Delegado
        delegated_hp: {
            definition: "Saldo de Vesting Shares convertido para Hive Power vindo de terceiros.",
            logic: "Total_Incoming_Vests - Project_Account_Vests"
        }
    },

    // 4. REGRAS DE INTERFACE (Frontend)
    ui: {
        flags: {
            verified: "Exibe emoji colorido. Tooltip: '{Gentílico} Verificado'",
            pending: "Exibe emoji com filtro grayscale(100%). Tooltip: 'Pendente de apresentação...'",
            new_countries: "Deve suportar dinamicamente novos códigos ISO vindos do backend sem alteração no HTML."
        },
        graphs: {
            status: "DISABLED",
            reason: "Removidos na v2.29.0 por imprecisão histórica e poluição visual."
        },
        modal: {
            trigger: "Botão '🔔 Novidades' no header.",
            content: "Deve conter a data e os bullet points da versão atual."
        }
    },

    // 5. PROTOCOLOS DE OPERAÇÃO DA IA (Diretrizes para o Agente)
    agent_protocol: {
        compilation: "PROIBIDO compilar sem solicitação explícita do usuário ('Compile', 'Gere os arquivos').",
        autonomy: "Nível Baixo. Não assumir simplificações de regras de negócio. Em caso de dúvida, perguntar.",
        data_integrity: "Nunca inventar dados. Se o 'global_history.json' estiver errado, corrigir via script ou instrução manual, nunca alucinar valores.",
        correction_log: "Manter registro mental de que a simplificação de 'Ativos = HP > 0' foi um erro grave na v2.28.0."
    }
};

module.exports = BUSINESS_RULES;
