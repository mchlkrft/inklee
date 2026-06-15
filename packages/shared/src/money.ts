// Compact money formatting, Intl-FREE on purpose: Hermes ships no Intl on iOS
// (see apps/mobile/src/lib/date.ts), so anything the mobile app imports must
// avoid Intl. This is the ONE money formatter for the deposits chase overview,
// imported by both the web page and the mobile screen so identical amounts
// render as identical strings (the founder one-source-of-truth rule). Output is
// deterministic (en-style: comma thousands, dot decimal) rather than
// locale-driven, so the two surfaces can never drift.

export const CURRENCY_SYMBOLS: Record<string, string> = {
  eur: "€",
  usd: "$",
  gbp: "£",
  chf: "CHF ",
  sek: "kr ",
  nok: "kr ",
  dkk: "kr ",
  pln: "zł ",
  czk: "Kč ",
  cad: "$",
  aud: "$",
};

function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Compact money: symbol-prefixed, comma-grouped thousands, the `.00` dropped on
 * whole amounts (e.g. "€1,250", "€1,250.50", "CZK 1,200"). Rounds to whole cents
 * first to avoid float drift, then splits, so 99.005 -> "99.01" and 1.999 ->
 * "2". Unknown currencies fall back to an uppercase code prefix.
 */
export function formatMoneyShort(amount: number, currency: string): string {
  const code = (currency || "eur").toLowerCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? `${code.toUpperCase()} `;
  const negative = amount < 0;
  const totalCents = Math.round(Math.abs(amount) * 100);
  const whole = Math.trunc(totalCents / 100);
  const cents = totalCents % 100;
  const intPart = groupThousands(String(whole));
  const body = cents === 0 ? intPart : `${intPart}.${String(cents).padStart(2, "0")}`;
  return `${negative ? "-" : ""}${symbol}${body}`;
}
