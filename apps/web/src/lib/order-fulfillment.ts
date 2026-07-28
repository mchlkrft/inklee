// Server-only: inventory effects when an order is paid (Slice 75). Decrements
// per-variant stock (or product-level quantity for variant-less products) for
// each product line. Null stock = unlimited (skipped). Called once, from the
// webhook, only by the request that actually flipped the order to paid — so it
// is idempotent against Stripe's webhook retries.
//
// No reservation/expiry system in v1: stock is only ever reduced after a
// successful payment, never on selection. Concurrent oversell is possible and
// accepted for v1 (documented in docs/bio-page-goods-plan.md).

import { serviceClient } from "@/lib/supabase/service";
import { shouldAlertLowStock } from "@inklee/shared/product-availability";

export type PaidOrderItem = {
  product_id: string | null;
  variant_id: string | null;
  quantity: number | string;
  type: string;
  title_snapshot: string;
  variant_snapshot: string | null;
  total_amount: number | string;
};

/**
 * Low-stock alerts (P5c).
 *
 * Returns the products whose stock CROSSED their threshold on this sale, so
 * the caller can notify once. Crossing, not "is below": an artist selling ten
 * of a low-stocked item wants one notification, not ten. `low_stock_alerted_at`
 * is what makes that true, and it is cleared on restock so a later run-down
 * alerts again.
 */
export type LowStockHit = {
  productId: string;
  title: string;
  stockLeft: number;
};

async function checkLowStock(
  productId: string,
  stockAfter: number,
): Promise<LowStockHit | null> {
  const { data: p } = await serviceClient
    .from("products")
    .select("title, low_stock_threshold, low_stock_alerted_at")
    .eq("id", productId)
    .single();
  if (!p) return null;

  const hit = shouldAlertLowStock({
    threshold: (p.low_stock_threshold as number | null) ?? null,
    stockAfter,
    alreadyAlerted: p.low_stock_alerted_at !== null,
  });
  if (!hit) return null;

  // Stamped BEFORE returning, so a redelivered webhook (or a second line for
  // the same product in one order) cannot produce a second notification.
  await serviceClient
    .from("products")
    .update({ low_stock_alerted_at: new Date().toISOString() })
    .eq("id", productId)
    .is("low_stock_alerted_at", null);

  return {
    productId,
    title: (p.title as string) ?? "A product",
    stockLeft: stockAfter,
  };
}

export async function decrementInventory(
  items: PaidOrderItem[],
): Promise<LowStockHit[]> {
  const lowStock: LowStockHit[] = [];
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;

    if (item.variant_id) {
      const { data: v } = await serviceClient
        .from("product_variants")
        .select("stock_quantity")
        .eq("id", item.variant_id)
        .single();
      if (v && v.stock_quantity !== null && v.stock_quantity !== undefined) {
        await serviceClient
          .from("product_variants")
          .update({
            stock_quantity: Math.max(0, Number(v.stock_quantity) - qty),
          })
          .eq("id", item.variant_id);
      }
    } else if (item.product_id) {
      const { data: p } = await serviceClient
        .from("products")
        .select("quantity")
        .eq("id", item.product_id)
        .single();
      if (p && p.quantity !== null && p.quantity !== undefined) {
        const left = Math.max(0, Number(p.quantity) - qty);
        await serviceClient
          .from("products")
          .update({ quantity: left })
          .eq("id", item.product_id);
        const hit = await checkLowStock(item.product_id, left);
        if (hit) lowStock.push(hit);
      }
    }
  }
  return lowStock;
}
