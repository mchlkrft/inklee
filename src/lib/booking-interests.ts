// Booking interests (commerce-layer extension): pure helpers for the
// request-time interest-marking flow. The client picks goods they'd like to
// buy at the appointment when submitting the booking; the server validates the
// selection against the artist's current goods catalogue and writes one row
// per (product, variant) into `booking_interests`. The artist then confirms or
// declines each row on Accept.
//
// Same "never trust the client" rules as the addons flow: title + variant +
// unit price are recomputed from the products table and snapshotted on the
// row so the artist still sees what was picked even if the product is later
// edited or removed.

import type { AddonProduct } from "@/lib/orders";

export const MAX_INTEREST_QUANTITY = 10;

export type InterestSelection = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

export type InterestRow = {
  productId: string;
  variantId: string | null;
  titleSnapshot: string;
  variantSnapshot: string | null;
  unitPrice: number;
  quantity: number;
};

export type ComputedInterests =
  | { ok: true; rows: InterestRow[] }
  | { ok: false; error: string };

/**
 * Parse the JSON payload the public form posts. Lenient: anything that can't
 * be coerced into a selection is dropped silently (it'll either turn into a
 * validation error downstream or simply not appear). Zero-quantity entries
 * are filtered out.
 */
export function parseInterestSelections(raw: unknown): InterestSelection[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      productId: String(s.productId ?? ""),
      variantId: s.variantId ? String(s.variantId) : null,
      quantity: Number(s.quantity ?? 0),
    }))
    .filter((s) => s.productId && s.quantity > 0);
}

/**
 * Validate the selections against the artist's addon-eligible catalogue and
 * compute the rows to insert. Aggregates duplicate (product, variant) lines
 * so combined-quantity stock + max-quantity rules apply to the total; rejects
 * unknown / non-active / non-addon products, missing variant when required,
 * stale variant, oversold stock, or quantity past MAX_INTEREST_QUANTITY.
 */
export function computeInterestRows(
  products: AddonProduct[],
  selections: InterestSelection[],
): ComputedInterests {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows: InterestRow[] = [];

  // Aggregate duplicate (product, variant) lines first so quantity caps and
  // stock validation see the combined total — same hardening as orders.ts.
  const aggregated = new Map<string, InterestSelection>();
  for (const s of selections) {
    const key = `${s.productId}::${s.variantId ?? ""}`;
    const add = Math.max(0, Math.trunc(Number(s.quantity) || 0));
    const existing = aggregated.get(key);
    if (existing) existing.quantity += add;
    else
      aggregated.set(key, {
        productId: s.productId,
        variantId: s.variantId,
        quantity: add,
      });
  }

  for (const sel of aggregated.values()) {
    const qty = Math.trunc(sel.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (qty > MAX_INTEREST_QUANTITY) {
      return {
        ok: false,
        error: `You can mark at most ${MAX_INTEREST_QUANTITY} of any item.`,
      };
    }

    const product = byId.get(sel.productId);
    if (!product) {
      return {
        ok: false,
        error: "One of the items you picked is no longer available.",
      };
    }
    if (!product.isCheckoutAddon || product.status !== "active") {
      return {
        ok: false,
        error: `"${product.title}" isn't available right now.`,
      };
    }

    const activeVariants = product.variants.filter(
      (v) => v.status === "active",
    );

    let unitPrice = product.price;
    let variantId: string | null = null;
    let variantSnapshot: string | null = null;

    if (activeVariants.length > 0) {
      if (!sel.variantId) {
        return { ok: false, error: `Choose an option for "${product.title}".` };
      }
      const variant = activeVariants.find((v) => v.id === sel.variantId);
      if (!variant) {
        return {
          ok: false,
          error: `That option for "${product.title}" isn't available right now.`,
        };
      }
      if (variant.stock !== null && qty > variant.stock) {
        return {
          ok: false,
          error: `Only ${variant.stock} of "${product.title} ${variant.name}" left.`,
        };
      }
      unitPrice = variant.priceOverride ?? product.price;
      variantId = variant.id;
      variantSnapshot = variant.name;
    } else {
      if (sel.variantId) {
        return {
          ok: false,
          error: `"${product.title}" has no options to choose.`,
        };
      }
      if (product.quantity !== null && qty > product.quantity) {
        return {
          ok: false,
          error: `Only ${product.quantity} of "${product.title}" left.`,
        };
      }
    }

    rows.push({
      productId: product.id,
      variantId,
      titleSnapshot: product.title,
      variantSnapshot,
      unitPrice: Math.round(unitPrice * 100) / 100,
      quantity: qty,
    });
  }

  return { ok: true, rows };
}
