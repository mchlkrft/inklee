// Presentation + cache helpers for the goods screens (domain constants come
// from @inklee/shared/goods — one source of truth with the web editor and the
// /api/mobile routes; response types are shared via @inklee/shared/mobile-api).
import type { QueryClient } from "@tanstack/react-query";
import { apiPatch, invalidateByPathPrefix } from "./api";

import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  parsePriceInput,
} from "@inklee/shared/goods";

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

// Picker options derived from the shared enums + labels (one source of truth;
// the value/label pairs were previously re-declared here and could drift).
export const PRODUCT_CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((value) => ({
  value,
  label: PRODUCT_CATEGORY_LABELS[value],
}));

export const PRODUCT_STATUS_OPTIONS = PRODUCT_STATUSES.map((value) => ({
  value,
  label: PRODUCT_STATUS_LABELS[value],
}));

export function productStatusLabel(s: string): string {
  return PRODUCT_STATUS_LABELS[s as keyof typeof PRODUCT_STATUS_LABELS] ?? s;
}

/** Parse a price typed with EU formatting (comma decimal, dot/space grouping)
 *  into a non-negative number, or null when blank/invalid. Thin adapter over the
 *  shared parsePriceInput so web + mobile parse prices identically (it also now
 *  rounds to 2 dp and caps at MAX_PRICE, previously enforced only server-side). */
export function parseEuAmount(raw: string): number | null {
  const r = parsePriceInput(raw);
  return "value" in r ? r.value : null;
}
