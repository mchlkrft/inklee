import { getLocales } from "expo-localization";

// Minimal i18n scaffold. The web app is en+de; this routes the device locale to
// one of those and looks strings up in a catalog. `en` is the source of truth;
// `de` is partial and falls back to `en`, which falls back to the key.
//
// This establishes the mechanism + device-locale routing. Converting the rest
// of the ~screens' hardcoded strings to t() is the remaining incremental work —
// add the key to both catalogs as you convert each string.

export type Locale = "en" | "de";

function resolveLocale(): Locale {
  const code = getLocales()[0]?.languageCode?.toLowerCase();
  return code === "de" ? "de" : "en";
}

export const LOCALE: Locale = resolveLocale();

const en = {
  "common.tryAgain": "Try again",
  "error.title": "Something went wrong",
  "error.body": "An unexpected error occurred.",
  "tab.home": "Home",
  "tab.requests": "Requests",
  "tab.calendar": "Calendar",
  "tab.clients": "Clients",
  "tab.more": "More",
} as const;

type Key = keyof typeof en;

const de: Partial<Record<Key, string>> = {
  "common.tryAgain": "Erneut versuchen",
  "error.title": "Etwas ist schiefgelaufen",
  "error.body": "Ein unerwarteter Fehler ist aufgetreten.",
  "tab.home": "Start",
  "tab.requests": "Anfragen",
  "tab.calendar": "Kalender",
  "tab.clients": "Kund:innen",
  "tab.more": "Mehr",
};

export function t(key: Key): string {
  if (LOCALE === "de" && de[key]) return de[key];
  return en[key];
}
