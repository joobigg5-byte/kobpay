export const translations = {
  en: {
    dashboard: "Dashboard",
    explorer: "Explorer",
    wallet: "Wallet",
    markets: "Markets",
    send: "Send",
    pay: "Pay with KPC",
    trade: "Trade",
    ecosystem: "Ecosystem",
    infrastructure: "Sovereign Infrastructure",
    connect: "Connect"
  },
  es: {
    dashboard: "Panel",
    explorer: "Explorador",
    wallet: "Billetera",
    markets: "Mercados",
    send: "Enviar",
    pay: "Pagar con KPC",
    trade: "Comerciar",
    ecosystem: "Ecosistema",
    infrastructure: "Infraestructura Soberana",
    connect: "Conectar"
  },
  fr: {
    dashboard: "Tableau de Bord",
    explorer: "Explorateur",
    wallet: "Portefeuille",
    markets: "Marchés",
    send: "Envoyer",
    pay: "Payer avec KPC",
    trade: "Échanger",
    ecosystem: "Écosystème",
    infrastructure: "Infrastructure Souveraine",
    connect: "Connecter"
  },
  pt: {
    dashboard: "Painel",
    explorer: "Explorador",
    wallet: "Carteira",
    markets: "Mercados",
    send: "Enviar",
    pay: "Pagar com KPC",
    trade: "Negociar",
    ecosystem: "Ecossistema",
    infrastructure: "Infraestrutura Soberana",
    connect: "Conectar"
  },
  zh: {
    dashboard: "仪表板",
    explorer: "区块链浏览器",
    wallet: "钱包",
    markets: "市场",
    send: "发送",
    pay: "使用 KPC 支付",
    trade: "交易",
    ecosystem: "生态系统",
    infrastructure: "主权基础设施",
    connect: "连接"
  },
  ja: {
    dashboard: "ダッシュボード",
    explorer: "エクスプローラー",
    wallet: "ウォレット",
    markets: "市場",
    send: "送信",
    pay: "KPCで支払う",
    trade: "トレード",
    ecosystem: "エコシステム",
    infrastructure: "ソブリンインフラストラクチャ",
    connect: "接続する"
  }
} as const;

export type LanguageCode = keyof typeof translations;