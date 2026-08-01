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

/** A raw order_items row as read for inventory purposes: PaidOrderItem plus
 *  the columns bundle expansion needs (0135). */
export type InventoryOrderItem = PaidOrderItem & {
  id?: string | null;
  bundle_id?: string | null;
};

/**
 * ONE rule for which order lines move inventory, in ONE place (SHOP-FUL-001).
 *
 * Settlement and refund previously each decided for themselves which lines
 * reach the stock movers: settle passed everything, refund filtered
 * type='product' in its query. That asymmetry was latent while every line was
 * a product; the 'bundle' type (GC6, migration 0135) is exactly the shape the
 * two sides would have classified differently, producing one-way stock drift.
 * Both directions now expand through here.
 *
 * - `product` lines pass through UNCHANGED (same object, so callers' own
 *   bookkeeping keeps working).
 * - `bundle` lines expand to their components from the sale-time SNAPSHOT
 *   (order_item_bundle_components), never the live product_bundle_items join,
 *   which mutates with the artist's edits and cascades away on product
 *   delete. Snapshot quantity is per ONE bundle; it is multiplied by the
 *   line's own quantity here, so decrement and restock cannot multiply
 *   differently. Components whose product_id was SET NULL by a deletion are
 *   skipped (nothing left to move).
 * - Everything else (deposit, future types) moves NOTHING, explicitly.
 */
export async function expandInventoryMovements(
  items: InventoryOrderItem[],
): Promise<PaidOrderItem[]> {
  const movements: PaidOrderItem[] = [];
  for (const item of items) {
    if (item.type === "product") {
      movements.push(item);
      continue;
    }
    if (item.type !== "bundle" || !item.id) continue;

    const lineQty = Math.max(0, Number(item.quantity) || 0);
    if (lineQty <= 0) continue;

    const { data: components, error } = await serviceClient
      .from("order_item_bundle_components")
      .select("product_id, title_snapshot, quantity")
      .eq("order_item_id", item.id);
    if (error) {
      // Fail loud to the caller's Sentry path is not available here; skipping
      // silently would be the exact defect this function exists to prevent, so
      // throw and let the (already best-effort) inventory caller capture it.
      throw new Error(
        `bundle component snapshot read failed for order item ${item.id}: ${error.message}`,
      );
    }
    for (const c of components ?? []) {
      if (!c.product_id) continue;
      movements.push({
        product_id: c.product_id as string,
        variant_id: null,
        quantity: Math.max(0, Number(c.quantity) || 0) * lineQty,
        type: "product",
        title_snapshot: (c.title_snapshot as string) ?? "",
        variant_snapshot: null,
        total_amount: 0,
      });
    }
  }
  return movements;
}

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

/**
 * RESTOCK on a goods refund: the inverse of `decrementInventory`. Adds the
 * refunded quantities back to per-variant stock (or product-level quantity), and
 * CLEARS `low_stock_alerted_at` on any product-level item it restocks so a later
 * run-down alerts again (the contract stated at the top of this file: "cleared on
 * restock"). Null stock = unlimited, skipped, same as decrement.
 *
 * NOT internally idempotent, exactly like `decrementInventory`: the caller MUST
 * invoke it once per refund, gated on the order actually transitioning to a
 * refunded state (the same `.eq("status", ...).select()` pattern the paid-flip
 * uses), so a redelivered `charge.refunded` webhook cannot restock twice.
 * `partial` restocks (a by-line or partial-amount refund) pass only the items
 * being returned; a full refund passes all product lines.
 */
export async function restockInventory(items: PaidOrderItem[]): Promise<void> {
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
          .update({ stock_quantity: Number(v.stock_quantity) + qty })
          .eq("id", item.variant_id);
      }
    } else if (item.product_id) {
      const { data: p } = await serviceClient
        .from("products")
        .select("quantity")
        .eq("id", item.product_id)
        .single();
      if (p && p.quantity !== null && p.quantity !== undefined) {
        await serviceClient
          .from("products")
          .update({
            quantity: Number(p.quantity) + qty,
            // Cleared so a later run-down re-alerts (decrement's contract).
            low_stock_alerted_at: null,
          })
          .eq("id", item.product_id);
      }
    }
  }
}
