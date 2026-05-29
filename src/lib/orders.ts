// Orders (Slice 74). Pure helpers for the pre-checkout add-ons flow: validate a
// client's product selections against the artist's current goods and compute the
// authoritative line items + totals server-side. The Stripe PaymentIntent amount
// and the webhook both derive from these numbers — never trust client totals.

import type { ProductStatus } from "@/lib/goods";

export const MAX_ADDON_QUANTITY = 10;
export const DEPOSIT_LINE_TITLE = "Tattoo deposit";

export type AddonVariant = {
  id: string;
  name: string;
  priceOverride: number | null;
  stock: number | null;
  status: ProductStatus;
};

export type AddonProduct = {
  id: string;
  title: string;
  price: number;
  currency: string;
  status: ProductStatus;
  isCheckoutAddon: boolean;
  quantity: number | null; // product-level stock, null = unlimited
  variants: AddonVariant[];
};

export type AddonSelection = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

export type OrderLine = {
  productId: string;
  variantId: string | null;
  titleSnapshot: string;
  variantSnapshot: string | null;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
};

export type ComputedAddons =
  | { ok: true; lines: OrderLine[]; goodsAmount: number }
  | { ok: false; error: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Validate the selected add-ons against the artist's products and compute the
 * line items + goods subtotal. Drops zero-quantity selections. Rejects products
 * that are missing, not active, not a checkout add-on, out of stock, or where a
 * variant is required/invalid.
 */
export function computeAddonLines(
  products: AddonProduct[],
  selections: AddonSelection[],
): ComputedAddons {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: OrderLine[] = [];

  // Aggregate duplicate (product, variant) selections so stock + max-quantity
  // checks apply to the combined quantity and the order gets one line per
  // product/variant. Prevents a crafted client from splitting a quantity across
  // entries to oversell or slip past MAX_ADDON_QUANTITY.
  const aggregated = new Map<string, AddonSelection>();
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
    if (!Number.isFinite(qty) || qty <= 0) continue; // skip / ignore unselected
    if (qty > MAX_ADDON_QUANTITY) {
      return {
        ok: false,
        error: `You can add at most ${MAX_ADDON_QUANTITY} of an item.`,
      };
    }

    const product = byId.get(sel.productId);
    if (!product)
      return { ok: false, error: "One of the items is no longer available." };
    if (!product.isCheckoutAddon || product.status !== "active") {
      return { ok: false, error: `"${product.title}" is no longer available.` };
    }

    const activeVariants = product.variants.filter(
      (v) => v.status === "active",
    );

    let unitAmount = product.price;
    let variantId: string | null = null;
    let variantSnapshot: string | null = null;

    if (activeVariants.length > 0) {
      // A product with variants requires choosing one.
      if (!sel.variantId) {
        return { ok: false, error: `Choose an option for "${product.title}".` };
      }
      const variant = activeVariants.find((v) => v.id === sel.variantId);
      if (!variant) {
        return {
          ok: false,
          error: `That option for "${product.title}" is no longer available.`,
        };
      }
      if (variant.stock !== null && qty > variant.stock) {
        return {
          ok: false,
          error: `Only ${variant.stock} of "${product.title} ${variant.name}" left.`,
        };
      }
      unitAmount = variant.priceOverride ?? product.price;
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

    const totalAmount = round2(unitAmount * qty);
    lines.push({
      productId: product.id,
      variantId,
      titleSnapshot: product.title,
      variantSnapshot,
      quantity: qty,
      unitAmount: round2(unitAmount),
      totalAmount,
    });
  }

  const goodsAmount = round2(lines.reduce((sum, l) => sum + l.totalAmount, 0));
  return { ok: true, lines, goodsAmount };
}
