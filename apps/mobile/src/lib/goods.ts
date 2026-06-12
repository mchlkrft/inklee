// Presentation + cache helpers for the goods screens (mirrors web @/lib/goods
// labels; response types are shared via @inklee/shared/mobile-api).
import type { QueryClient } from "@tanstack/react-query";
import { apiPatch, invalidateByPathPrefix } from "./api";

// Every /goods view (list + details). Lives here so screens share one
// definition instead of re-inlining the predicate.
export function invalidateGoods(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, ["/goods"]);
}

/**
 * Flip a product's sold-out/active status. Owns the cache footgun: the cached
 * `/goods/<id>` detail must be DROPPED (not just invalidated) because the edit
 * form seeds its status from the cached detail once on mount — a stale entry
 * would let a follow-up Save silently revert this toggle.
 */
export async function setProductStatus(
  client: QueryClient,
  id: string,
  status: string,
): Promise<void> {
  await apiPatch(`/goods/${id}/status`, { status });
  client.removeQueries({ queryKey: ["api", `/goods/${id}`] });
}

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

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  PRODUCT_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export function productStatusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
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
