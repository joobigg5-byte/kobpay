"use client";

import { useEffect, useState, useCallback } from "react";
import { readLang, writeLang, onLangChange } from "./lang";
import type { LanguageCode } from "../translations";

// THE LANGUAGE PICKER CHANGED TWELVE WORDS.
//
// translations.ts held seventeen keys, all of them sidebar labels, and every
// other string in the app was written in English inside the JSX. So someone
// choosing Español got a Spanish sidebar wrapped around an English product.
// Worse than no picker: it promises something it does not do.
//
// THE SHAPE, AND WHY
//
//   t("sendAbroad.title", "Send Abroad")
//
// The English sits at the call site, not in a file. Three things follow.
//
// The code stays readable — you can see what a screen says without opening
// a dictionary.
//
// An untranslated string renders English. Never a blank, never a raw key,
// never "sendAbroad.title" shown to a customer. That matters most for a
// product adding languages over time: a half-translated page in English is
// usable, and a half-translated page full of dotted keys is broken.
//
// And there is no English dictionary to drift. The usual failure is the
// copy changing in the JSX while en.json keeps the old wording, and then
// English speakers see something nobody wrote. Here there is one copy.
//
// WHAT IS NOT HERE
//
// Right-to-left. Arabic, Hebrew, Farsi and Urdu need the whole layout
// mirrored — every ml-, pl-, text-left and absolute position — which is a
// real piece of work and not something to half-do. None of the six
// languages below is RTL, so nothing is broken today; adding Arabic means
// doing that work, not adding a column to this file.
//
// Machine translation is also not here. These strings are small, they are
// about money, and a wrong word in a payment confirmation costs more than
// it saves. Each one below was written deliberately; a language with gaps
// falls back to English rather than being filled in by a machine.

type Dict = Record<string, string>;

// English is deliberately absent: it is at the call sites. A language only
// lists what it has, and anything missing falls through.
const DICT: Partial<Record<LanguageCode, Dict>> = {
  es: {
    "common.back": "Atrás",
    "common.continue": "Continuar",
    "common.cancel": "Cancelar",
    "common.confirm": "Confirmar",
    "common.amount": "Importe",
    "common.signIn": "Iniciar sesión",
    "common.loading": "Cargando…",
    "common.pricing": "Calculando…",
    "common.available": "Disponible",
    "common.country": "País",
    "common.chooseCountry": "Elige un país",
    "common.openNow": "Disponible ahora",
    "common.notOpenYet": "Aún no disponible — dinos y lo priorizaremos",
    "sendAbroad.title": "Enviar al extranjero",
    "sendAbroad.lead":
      "Efectivo a un móvil o a un banco en otro país. Quien lo recibe no necesita KobPay.",
    "sendAbroad.where": "¿Dónde están?",
    "sendAbroad.who": "¿Para quién es?",
    "sendAbroad.theirName": "Su nombre",
    "sendAbroad.how": "¿Cómo lo recibirán?",
    "sendAbroad.howMuch": "¿Cuánto vas a enviar?",
    "sendAbroad.theyReceive": "Recibirán",
    "sendAbroad.rate": "Tipo de cambio",
    "sendAbroad.fee": "Comisión",
    "sendAbroad.send": "Enviar dinero",
    "sendAbroad.sent": "Enviado",
    "sendAbroad.cardComing": "Pago a tarjeta en",
    "sendAbroad.cardLead":
      "Directo a su tarjeta de débito — sin datos bancarios, sin número de cuenta, sin que tengan que configurar nada. Estamos cerrando el acuerdo con el socio de pagos.",
    "sendAbroad.theirCard": "Su número de tarjeta",
    "sendAbroad.wouldSend": "¿Cuánto enviarías?",
    "sendAbroad.tellUs": "Dinos que necesitas",
    "sendAbroad.noted": "Anotado",
    "sendAbroad.nothingCharged":
      "No se cobra nada y no se piden datos de tarjeta. Tus KPC no se tocan.",
    "crypto.buy": "Comprar",
    "crypto.sell": "Vender",
    "crypto.buyTitle": "Comprar cripto",
    "crypto.sellTitle": "Vender cripto",
    "crypto.coin": "Moneda",
    "crypto.network": "Red",
    "crypto.youSend": "Envías",
    "crypto.youReceive": "Recibes",
    "crypto.theirAddress": "Dirección de destino",
    "crypto.sendOnly": "Envía solo",
    "crypto.getAddress": "Obtener la dirección de depósito",
    "wallet.user": "Billetera",
    "wallet.agent": "Portal de agente",
    "wallet.admin": "Panel de administración",
    "wallet.send": "Enviar",
    "wallet.receive": "Recibir",
    "wallet.topUp": "Recargar",
    "wallet.pay": "Pagar",
    "wallet.sentThisMonth": "Enviado este mes",
    "wallet.received": "Recibido",
    "wallet.interestEarned": "Intereses ganados",
    "wallet.businessesPaid": "Comercios pagados",
    "wallet.limits": "Límites y verificación",
    "wallet.activity": "Actividad",
    "wallet.openSavings": "Abre un plan de ahorro para ganar",
    "greeting.morning": "Buenos días",
    "greeting.afternoon": "Buenas tardes",
    "greeting.evening": "Buenas noches",
    "send.title": "Enviar KPC",
    "send.yourBalance": "Tu saldo",
    "send.success": "¡Transferencia realizada!",
    "send.holdIt": "Guárdalo hasta que llegue →",
    "auth.title": "Entrar en KobPay",
    "auth.tooShort": "Ese número parece demasiado corto",
    "auth.couldNotFinish": "No pudimos completar tu inicio de sesión. Inténtalo de nuevo.",
    "auth.didNotGoThrough": "No se ha podido. Revisa los datos e inténtalo otra vez.",
    "auth.country": "País",
    "auth.phone": "Número de teléfono",
    "auth.sendCode": "Enviar código",
    "auth.verify": "Verificar y continuar",
    "auth.wrongNumber": "¿Número incorrecto? Volver",
    "nav.home": "Inicio",
    "nav.send": "Enviar",
    "nav.pay": "Pagar",
    "nav.wallet": "Billetera",
  },
  fr: {
    "common.back": "Retour",
    "common.continue": "Continuer",
    "common.cancel": "Annuler",
    "common.confirm": "Confirmer",
    "common.amount": "Montant",
    "common.signIn": "Se connecter",
    "common.loading": "Chargement…",
    "common.pricing": "Calcul en cours…",
    "common.available": "Disponible",
    "common.country": "Pays",
    "common.chooseCountry": "Choisissez un pays",
    "common.openNow": "Disponible maintenant",
    "common.notOpenYet": "Pas encore disponible — dites-le-nous et nous le prioriserons",
    "sendAbroad.title": "Envoyer à l'étranger",
    "sendAbroad.lead":
      "De l'argent vers un mobile ou une banque dans un autre pays. Le destinataire n'a pas besoin de KobPay.",
    "sendAbroad.where": "Où se trouvent-ils ?",
    "sendAbroad.who": "Pour qui est-ce ?",
    "sendAbroad.theirName": "Leur nom",
    "sendAbroad.how": "Comment vont-ils le recevoir ?",
    "sendAbroad.howMuch": "Combien envoyez-vous ?",
    "sendAbroad.theyReceive": "Ils recevront",
    "sendAbroad.rate": "Taux",
    "sendAbroad.fee": "Frais",
    "sendAbroad.send": "Envoyer l'argent",
    "sendAbroad.sent": "Envoyé",
    "sendAbroad.cardComing": "Paiement par carte vers",
    "sendAbroad.cardLead":
      "Directement sur leur carte de débit — pas de coordonnées bancaires, pas de numéro de compte, rien à configurer. Nous finalisons le partenaire de paiement.",
    "sendAbroad.theirCard": "Leur numéro de carte",
    "sendAbroad.wouldSend": "Combien enverriez-vous ?",
    "sendAbroad.tellUs": "Dites-nous qu'il vous faut",
    "sendAbroad.noted": "C'est noté",
    "sendAbroad.nothingCharged":
      "Rien n'est débité et aucune donnée de carte n'est demandée. Vos KPC ne sont pas touchés.",
    "crypto.buy": "Acheter",
    "crypto.sell": "Vendre",
    "crypto.buyTitle": "Acheter des cryptos",
    "crypto.sellTitle": "Vendre des cryptos",
    "crypto.coin": "Monnaie",
    "crypto.network": "Réseau",
    "crypto.youSend": "Vous envoyez",
    "crypto.youReceive": "Vous recevez",
    "crypto.theirAddress": "Adresse de destination",
    "crypto.sendOnly": "N'envoyez que",
    "crypto.getAddress": "Obtenir l'adresse de dépôt",
    "wallet.user": "Portefeuille",
    "wallet.agent": "Espace agent",
    "wallet.admin": "Administration",
    "wallet.send": "Envoyer",
    "wallet.receive": "Recevoir",
    "wallet.topUp": "Recharger",
    "wallet.pay": "Payer",
    "wallet.sentThisMonth": "Envoyé ce mois-ci",
    "wallet.received": "Reçu",
    "wallet.interestEarned": "Intérêts perçus",
    "wallet.businessesPaid": "Commerçants payés",
    "wallet.limits": "Plafonds et vérification",
    "wallet.activity": "Activité",
    "wallet.openSavings": "Ouvrez un plan d'épargne pour gagner",
    "greeting.morning": "Bonjour",
    "greeting.afternoon": "Bon après-midi",
    "greeting.evening": "Bonsoir",
    "send.title": "Envoyer des KPC",
    "send.yourBalance": "Votre solde",
    "send.success": "Transfert effectué !",
    "send.holdIt": "Gardez-le jusqu'à réception →",
    "auth.title": "Se connecter à KobPay",
    "auth.tooShort": "Ce numéro semble trop court",
    "auth.couldNotFinish": "Nous n'avons pas pu finaliser votre connexion. Réessayez.",
    "auth.didNotGoThrough": "Cela n'a pas fonctionné. Vérifiez les informations et réessayez.",
    "auth.country": "Pays",
    "auth.phone": "Numéro de téléphone",
    "auth.sendCode": "Envoyer le code",
    "auth.verify": "Vérifier et continuer",
    "auth.wrongNumber": "Mauvais numéro ? Retour",
    "nav.home": "Accueil",
    "nav.send": "Envoyer",
    "nav.pay": "Payer",
    "nav.wallet": "Portefeuille",
  },
  pt: {
    "common.back": "Voltar",
    "common.continue": "Continuar",
    "common.cancel": "Cancelar",
    "common.confirm": "Confirmar",
    "common.amount": "Valor",
    "common.signIn": "Entrar",
    "common.loading": "A carregar…",
    "common.pricing": "A calcular…",
    "common.available": "Disponível",
    "common.country": "País",
    "common.chooseCountry": "Escolha um país",
    "common.openNow": "Disponível agora",
    "common.notOpenYet": "Ainda não disponível — diga-nos e damos prioridade",
    "sendAbroad.title": "Enviar para o estrangeiro",
    "sendAbroad.lead":
      "Dinheiro para um telemóvel ou um banco noutro país. Quem recebe não precisa de KobPay.",
    "sendAbroad.where": "Onde estão?",
    "sendAbroad.who": "Para quem é?",
    "sendAbroad.theirName": "O nome da pessoa",
    "sendAbroad.how": "Como vão receber?",
    "sendAbroad.howMuch": "Quanto vai enviar?",
    "sendAbroad.theyReceive": "Vão receber",
    "sendAbroad.rate": "Taxa",
    "sendAbroad.fee": "Comissão",
    "sendAbroad.send": "Enviar dinheiro",
    "sendAbroad.sent": "Enviado",
    "sendAbroad.cardComing": "Pagamento por cartão para",
    "sendAbroad.cardLead":
      "Directo para o cartão de débito — sem dados bancários, sem número de conta, sem nada para configurar. Estamos a fechar o parceiro de pagamentos.",
    "sendAbroad.theirCard": "O número do cartão",
    "sendAbroad.wouldSend": "Quanto enviaria?",
    "sendAbroad.tellUs": "Diga-nos que precisa de",
    "sendAbroad.noted": "Registado",
    "sendAbroad.nothingCharged":
      "Nada é cobrado e não pedimos dados do cartão. Os seus KPC ficam intactos.",
    "crypto.buy": "Comprar",
    "crypto.sell": "Vender",
    "crypto.buyTitle": "Comprar cripto",
    "crypto.sellTitle": "Vender cripto",
    "crypto.coin": "Moeda",
    "crypto.network": "Rede",
    "crypto.youSend": "Envia",
    "crypto.youReceive": "Recebe",
    "crypto.theirAddress": "Endereço de destino",
    "crypto.sendOnly": "Envie apenas",
    "crypto.getAddress": "Obter o endereço de depósito",
    "wallet.user": "Carteira",
    "wallet.agent": "Portal do agente",
    "wallet.admin": "Administração",
    "wallet.send": "Enviar",
    "wallet.receive": "Receber",
    "wallet.topUp": "Carregar",
    "wallet.pay": "Pagar",
    "wallet.sentThisMonth": "Enviado este mês",
    "wallet.received": "Recebido",
    "wallet.interestEarned": "Juros ganhos",
    "wallet.businessesPaid": "Comerciantes pagos",
    "wallet.limits": "Limites e verificação",
    "wallet.activity": "Actividade",
    "wallet.openSavings": "Abra um plano de poupança para ganhar",
    "greeting.morning": "Bom dia",
    "greeting.afternoon": "Boa tarde",
    "greeting.evening": "Boa noite",
    "send.title": "Enviar KPC",
    "send.yourBalance": "O seu saldo",
    "send.success": "Transferência concluída!",
    "send.holdIt": "Guarde até chegar →",
    "auth.title": "Entrar no KobPay",
    "auth.tooShort": "Esse número parece curto demais",
    "auth.couldNotFinish": "Não conseguimos concluir a sua entrada. Tente novamente.",
    "auth.didNotGoThrough": "Não resultou. Verifique os dados e tente outra vez.",
    "auth.country": "País",
    "auth.phone": "Número de telemóvel",
    "auth.sendCode": "Enviar código",
    "auth.verify": "Verificar e continuar",
    "auth.wrongNumber": "Número errado? Voltar",
    "nav.home": "Início",
    "nav.send": "Enviar",
    "nav.pay": "Pagar",
    "nav.wallet": "Carteira",
  },
  zh: {
    "common.back": "返回",
    "common.continue": "继续",
    "common.cancel": "取消",
    "common.confirm": "确认",
    "common.amount": "金额",
    "common.signIn": "登录",
    "common.loading": "加载中…",
    "common.pricing": "计算中…",
    "common.available": "可用",
    "common.country": "国家或地区",
    "common.chooseCountry": "请选择国家或地区",
    "common.openNow": "现已开通",
    "common.notOpenYet": "尚未开通 — 告诉我们，我们会优先处理",
    "sendAbroad.title": "跨境汇款",
    "sendAbroad.lead": "将现金汇入他国的手机钱包或银行账户。收款人无需注册 KobPay。",
    "sendAbroad.where": "收款人在哪里？",
    "sendAbroad.who": "汇给谁？",
    "sendAbroad.theirName": "收款人姓名",
    "sendAbroad.how": "以何种方式收款？",
    "sendAbroad.howMuch": "汇款金额？",
    "sendAbroad.theyReceive": "收款人将收到",
    "sendAbroad.rate": "汇率",
    "sendAbroad.fee": "手续费",
    "sendAbroad.send": "汇出",
    "sendAbroad.sent": "已汇出",
    "sendAbroad.cardComing": "银行卡入账 —",
    "sendAbroad.cardLead":
      "直接汇入对方的借记卡，无需银行信息、账号，也无需对方做任何设置。我们正在敲定当地的付款合作方。",
    "sendAbroad.theirCard": "对方的卡号",
    "sendAbroad.wouldSend": "您打算汇多少？",
    "sendAbroad.tellUs": "告诉我们您需要",
    "sendAbroad.noted": "已记录",
    "sendAbroad.nothingCharged": "不会扣款，也不会收集卡片信息。您的 KPC 不受影响。",
    "crypto.buy": "买入",
    "crypto.sell": "卖出",
    "crypto.buyTitle": "买入加密货币",
    "crypto.sellTitle": "卖出加密货币",
    "crypto.coin": "币种",
    "crypto.network": "网络",
    "crypto.youSend": "您支付",
    "crypto.youReceive": "您收到",
    "crypto.theirAddress": "收款地址",
    "crypto.sendOnly": "仅可发送",
    "crypto.getAddress": "获取充值地址",
    "wallet.user": "钱包",
    "wallet.agent": "代理端",
    "wallet.admin": "管理后台",
    "wallet.send": "转账",
    "wallet.receive": "收款",
    "wallet.topUp": "充值",
    "wallet.pay": "支付",
    "wallet.sentThisMonth": "本月转出",
    "wallet.received": "已收到",
    "wallet.interestEarned": "已得利息",
    "wallet.businessesPaid": "已付商户",
    "wallet.limits": "限额与认证",
    "wallet.activity": "交易记录",
    "wallet.openSavings": "开通储蓄计划即可获得收益",
    "greeting.morning": "早上好",
    "greeting.afternoon": "下午好",
    "greeting.evening": "晚上好",
    "send.title": "转出 KPC",
    "send.yourBalance": "您的余额",
    "send.success": "转账成功！",
    "send.holdIt": "到账前请保留 →",
    "auth.title": "登录 KobPay",
    "auth.tooShort": "这个号码似乎太短了",
    "auth.couldNotFinish": "登录未能完成，请重试。",
    "auth.didNotGoThrough": "操作未成功。请检查信息后重试。",
    "auth.country": "国家或地区",
    "auth.phone": "手机号码",
    "auth.sendCode": "发送验证码",
    "auth.verify": "验证并继续",
    "auth.wrongNumber": "号码有误？返回",
    "nav.home": "首页",
    "nav.send": "转账",
    "nav.pay": "支付",
    "nav.wallet": "钱包",
  },
  ja: {
    "common.back": "戻る",
    "common.continue": "続ける",
    "common.cancel": "キャンセル",
    "common.confirm": "確認",
    "common.amount": "金額",
    "common.signIn": "ログイン",
    "common.loading": "読み込み中…",
    "common.pricing": "計算中…",
    "common.available": "利用可能",
    "common.country": "国・地域",
    "common.chooseCountry": "国・地域を選択",
    "common.openNow": "対応中",
    "common.notOpenYet": "まだ未対応です — ご要望をお知らせください",
    "sendAbroad.title": "海外へ送金",
    "sendAbroad.lead":
      "海外のモバイルウォレットや銀行口座へ現金を送ります。受取人に KobPay は不要です。",
    "sendAbroad.where": "受取人はどちらに？",
    "sendAbroad.who": "どなたへ？",
    "sendAbroad.theirName": "受取人のお名前",
    "sendAbroad.how": "受け取り方法",
    "sendAbroad.howMuch": "送金額",
    "sendAbroad.theyReceive": "受取額",
    "sendAbroad.rate": "レート",
    "sendAbroad.fee": "手数料",
    "sendAbroad.send": "送金する",
    "sendAbroad.sent": "送金しました",
    "sendAbroad.cardComing": "カードへの送金 —",
    "sendAbroad.cardLead":
      "受取人のデビットカードへ直接。銀行情報も口座番号も不要で、相手側の設定もいりません。現在、送金パートナーとの調整を進めています。",
    "sendAbroad.theirCard": "カード番号",
    "sendAbroad.wouldSend": "いくら送金されますか？",
    "sendAbroad.tellUs": "ご希望をお知らせください：",
    "sendAbroad.noted": "承りました",
    "sendAbroad.nothingCharged":
      "請求は発生せず、カード情報もお預かりしません。KPC 残高はそのままです。",
    "crypto.buy": "購入",
    "crypto.sell": "売却",
    "crypto.buyTitle": "暗号資産を購入",
    "crypto.sellTitle": "暗号資産を売却",
    "crypto.coin": "銘柄",
    "crypto.network": "ネットワーク",
    "crypto.youSend": "送付額",
    "crypto.youReceive": "受取額",
    "crypto.theirAddress": "送付先アドレス",
    "crypto.sendOnly": "送付できるのは",
    "crypto.getAddress": "入金アドレスを取得",
    "wallet.user": "ウォレット",
    "wallet.agent": "エージェント",
    "wallet.admin": "管理画面",
    "wallet.send": "送る",
    "wallet.receive": "受け取る",
    "wallet.topUp": "チャージ",
    "wallet.pay": "支払う",
    "wallet.sentThisMonth": "今月の送金額",
    "wallet.received": "受取額",
    "wallet.interestEarned": "受取利息",
    "wallet.businessesPaid": "支払った店舗",
    "wallet.limits": "上限と本人確認",
    "wallet.activity": "履歴",
    "wallet.openSavings": "積立プランを始めると利息がつきます",
    "greeting.morning": "おはようございます",
    "greeting.afternoon": "こんにちは",
    "greeting.evening": "こんばんは",
    "send.title": "KPC を送る",
    "send.yourBalance": "残高",
    "send.success": "送金が完了しました",
    "send.holdIt": "着金までお待ちください →",
    "auth.title": "KobPay にログイン",
    "auth.tooShort": "番号が短すぎるようです",
    "auth.couldNotFinish": "ログインを完了できませんでした。もう一度お試しください。",
    "auth.didNotGoThrough": "うまくいきませんでした。入力内容をご確認ください。",
    "auth.country": "国・地域",
    "auth.phone": "電話番号",
    "auth.sendCode": "コードを送信",
    "auth.verify": "確認して続ける",
    "auth.wrongNumber": "番号が違う場合は戻る",
    "nav.home": "ホーム",
    "nav.send": "送る",
    "nav.pay": "支払う",
    "nav.wallet": "ウォレット",
  },
};

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  // Each in its own language. A Spanish speaker scanning a list looks for
  // "Español", not for "Spanish" — and will not find it if they do not read
  // English, which is the whole point of the list.
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  zh: "中文",
  ja: "日本語",
} as Record<LanguageCode, string>;

/**
 * Translate, with the English at the call site.
 *
 *   const { t } = useT();
 *   t("sendAbroad.where", "Where are they?")
 *
 * A missing key renders the English. That is the behaviour, not a fallback
 * of last resort: it means a page can be converted a string at a time and
 * is never broken part-way.
 */
export function useT() {
  const [lang, setLangState] = useState<LanguageCode>("en");

  // Client only. Reading storage during the initial state would run in the
  // server render, where there is no window, and would hand React a first
  // client render that disagrees with the markup it hydrates.
  useEffect(() => {
    setLangState(readLang());
    return onLangChange(setLangState);
  }, []);

  const t = useCallback(
    (key: string, english: string) => DICT[lang]?.[key] ?? english,
    [lang],
  );

  const setLang = useCallback((next: LanguageCode) => {
    setLangState(next);
    writeLang(next);
  }, []);

  return { t, lang, setLang };
}

/** How much of a language is written, for deciding what to work on next. */
export function translationCoverage(): Record<string, number> {
  const keys = new Set<string>();
  for (const d of Object.values(DICT)) for (const k of Object.keys(d ?? {})) keys.add(k);
  const out: Record<string, number> = { en: 100 };
  for (const [code, d] of Object.entries(DICT)) {
    out[code] = Math.round(((Object.keys(d ?? {}).length / keys.size) * 100));
  }
  return out;
}
