// Presentation helpers for the goods screens (mirrors web @/lib/goods labels;
// response types are shared via @inklee/shared/mobile-api).

export const PRODUCT_CATEGORY_OPTIONS = [
  { value: "print", label: "Print" },
  { value: "shirt", label: "Shirt" },
  { value: "sticker", label: "Sticker" },
  { value: "zine", label: "Zine" },
  { value: "flash_sheet", label: "Flash sheet" },
  { value: "original", label: "Original" },
  { value: "patch", label: "Patch" },
  { value: "other", label: "Other" },
] as const;

export const PRODUCT_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "hidden", label: "Hidden" },
  { value: "sold_out", label: "Sold out" },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  PRODUCT_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  PRODUCT_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export function productCategoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? c;
}

export function productStatusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

export function productStatusTone(s: string): string {
  if (s === "active") return "text-success";
  if (s === "sold_out") return "text-mustard";
  return "text-shell-dim"; // hidden
}

export function formatProductPrice(amount: number, currency: string): string {
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

// Supported pricing currencies (mirrors web @/lib/goods CURRENCIES).
export const CURRENCIES = [
  "eur",
  "usd",
  "gbp",
  "thb",
  "aud",
  "cad",
  "chf",
  "jpy",
  "sek",
  "nok",
  "dkk",
  "pln",
  "czk",
  "sgd",
  "nzd",
  "mxn",
  "brl",
] as const;

export function isSupportedCurrency(code: string): boolean {
  return (CURRENCIES as readonly string[]).includes(code.trim().toLowerCase());
}

/** Parse a price typed with EU formatting (comma decimal, dot/space grouping)
 *  into a non-negative number, or null when blank/invalid. */
export function parseEuAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
