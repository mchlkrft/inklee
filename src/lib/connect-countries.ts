// Countries offered at Stripe Connect onboarding (F9 / RS-5). A connected
// account's country is fixed at creation and cannot be changed later, so we
// collect it up front instead of letting Stripe default to the PLATFORM
// country (which surfaced as US in the sandbox — wrong for EU artists).
//
// Scoped to the EEA + a few common Stripe-Connect-Express countries; expand as
// the artist base grows. Codes are ISO 3166-1 alpha-2, as Stripe expects.

export type ConnectCountry = { code: string; name: string };

export const CONNECT_COUNTRIES: ConnectCountry[] = [
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "GB", name: "United Kingdom" },
  { code: "CH", name: "Switzerland" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
];

// Sensible default for the picker — Inklee's first market is German-speaking.
export const DEFAULT_CONNECT_COUNTRY = "DE";

const CODES = new Set(CONNECT_COUNTRIES.map((c) => c.code));

export function isSupportedConnectCountry(code: unknown): code is string {
  return typeof code === "string" && CODES.has(code);
}

// Default payout (bank-account) currency per country. Stripe needs the
// currency explicitly when we attach a bank account via the API. Everything
// not listed here is in the eurozone (or treated as such) → EUR.
const NON_EUR_CURRENCY: Record<string, string> = {
  BG: "bgn",
  CZ: "czk",
  DK: "dkk",
  HU: "huf",
  NO: "nok",
  PL: "pln",
  RO: "ron",
  SE: "sek",
  GB: "gbp",
  CH: "chf",
  US: "usd",
  CA: "cad",
};

export function payoutCurrencyForCountry(code: string): string {
  return NON_EUR_CURRENCY[code] ?? "eur";
}
