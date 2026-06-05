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

export type PaidOrderItem = {
  product_id: string | null;
  variant_id: string | null;
  quantity: number | string;
  type: string;
  title_snapshot: string;
  variant_snapshot: string | null;
  total_amount: number | string;
};

export async function decrementInventory(
  items: PaidOrderItem[],
): Promise<void> {
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
        await serviceClient
          .from("products")
          .update({ quantity: Math.max(0, Number(p.quantity) - qty) })
          .eq("id", item.product_id);
      }
    }
  }
}
