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

    // ... (Seções 2 e 3 mantidas) ...

    // 4. REGRAS DE INTERFACE (Frontend)
    ui: {
        flags: {
            method: "UNIVERSAL DETECTION (v2.30.0+)",
            description: "O sistema converte automaticamente qualquer código ISO 3166-1 alpha-2 (ex: BR, GR, VE) em Emoji e Nome (via Intl API). Não requer dicionário manual.",
            verified: "Exibe emoji colorido.",
            pending: "Exibe emoji com filtro grayscale(100%)."
        },
        columns: {
            sticky_col: "Deve ter largura automática (width: auto) para não cortar a bandeira."
        }
    },

    // ... (Seções 5 e 6 mantidas) ...
};

module.exports = BUSINESS_RULES;
