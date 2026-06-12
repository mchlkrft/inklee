// Presentation + cache helpers for the goods screens (domain constants come
// from @inklee/shared/goods — one source of truth with the web editor and the
// /api/mobile routes; response types are shared via @inklee/shared/mobile-api).
import type { QueryClient } from "@tanstack/react-query";
import { apiPatch, invalidateByPathPrefix } from "./api";

export {
  CURRENCIES,
  DEFAULT_CURRENCY,
  MAX_PRODUCT_TITLE,
  MAX_VARIANT_NAME,
  MAX_VARIANTS,
  maxProductImages,
  formatPrice as formatProductPrice,
} from "@inklee/shared/goods";

// Every /goods view (list + details). Lives here so screens share one
// definition instead of re-inlining the predicate.
export function invalidateGoods(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, ["/goods"]);
}

/**
 * Drop the cached `/goods/<id>` detail. The edit form seeds its state from the
 * cached detail ONCE on mount, so any mutation that changes seeded fields
 * (status toggle, image add/remove, variant save) must REMOVE the entry — a
 * merely-invalidated stale entry can still seed a remount and let a follow-up
 * Save silently revert the change (the round-4 footgun).
 */
export function dropProductDetail(client: QueryClient, id: string): void {
  client.removeQueries({ queryKey: ["api", `/goods/${id}`] });
}

/** Flip a product's sold-out/active status (the list tile's quick toggle). */
export async function setProductStatus(
  client: QueryClient,
  id: string,
  status: string,
): Promise<void> {
  await apiPatch(`/goods/${id}/status`, { status });
  dropProductDetail(client, id);
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

/** Parse a price typed with EU formatting (comma decimal, dot/space grouping)
 *  into a non-negative number, or null when blank/invalid. */
export function parseEuAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
