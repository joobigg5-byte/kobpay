import { translations, LanguageCode } from "../translations";

// THE LANGUAGE CHOICE DID NOT SURVIVE A PAGE CHANGE.
//
// It lived in a useState inside ClientDashboard and was written nowhere else,
// so picking Español lasted until the next navigation and no other page —
// including the slide-over menu, which carries the same links — could know
// about it. That made the menu permanently English while the dashboard
// sidebar beside it was translated.
//
// localStorage rather than a cookie or a provider: it is a display preference
// with no server side to it, and wrapping the two calls is enough. Both are
// guarded because storage throws outright in a private window and in an
// iframe with site data blocked, and a thrown read here would take the whole
// menu down with it.

const KEY = "kobpay.lang";

export const LANGS = Object.keys(translations) as LanguageCode[];

export function readLang(): LanguageCode {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v && (LANGS as string[]).includes(v)) return v as LanguageCode;
  } catch {
    /* no storage — English, same as before this existed */
  }
  return "en";
}

export function writeLang(lang: LanguageCode): void {
  try {
    window.localStorage.setItem(KEY, lang);
    // Same tab gets no storage event, so the menu beside the picker would
    // keep its old labels until a reload without this.
    window.dispatchEvent(new CustomEvent("kobpay:lang", { detail: lang }));
  } catch {
    /* the choice still applies to the page that set it */
  }
}

/** Calls back whenever the language changes, in this tab or another. */
export function onLangChange(fn: (lang: LanguageCode) => void): () => void {
  const local = (e: Event) => fn((e as CustomEvent<LanguageCode>).detail);
  const cross = (e: StorageEvent) => {
    if (e.key === KEY) fn(readLang());
  };
  window.addEventListener("kobpay:lang", local);
  window.addEventListener("storage", cross);
  return () => {
    window.removeEventListener("kobpay:lang", local);
    window.removeEventListener("storage", cross);
  };
}
