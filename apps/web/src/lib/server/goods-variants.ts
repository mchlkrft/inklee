// Variant reconcile core — the single server-side implementation behind BOTH
// the web goods actions and PUT /api/mobile/goods/:id/variants, so the two
// platforms cannot drift (the lib/server/slots.ts pattern). Runs on the
// service client: the referenced-variant check counts booking_interests /
// order_items rows that are not all readable under the artist's RLS, and a
// miscount would hard-delete a variant history still points at. Callers MUST
// verify product ownership with an RLS-scoped read first.

import { serviceClient } from "@/lib/supabase/service";

export type VariantInput = {
  id: string | null;
  name: string;
  priceOverride: number | null;
  stock: number | null;
};

// Non-destructive variant reconcile. `booking_interests.variant_id` and
// `order_items.variant_id` both reference `product_variants(id)` with
// ON DELETE SET NULL, so a delete-then-insert path would null every
// historical pointer on every product edit. This function:
//
//   • UPDATEs existing rows whose id was round-tripped through the form —
//     including resurrecting from `hidden` back to `active` so a previously
//     archived variant the artist re-adds keeps its historical pointers.
//   • INSERTs rows whose id is null (genuinely new).
//   • For rows the artist removed: looks for any FK reference in
//     booking_interests / order_items; if found, soft-archives to
//     status='hidden' so the link survives. Otherwise hard deletes.
//
// Ownership: the incoming `id` is scoped to `product_id = productId`, so a
// crafted variant id from another product fails the `.eq("product_id",
// productId)` filter and silently no-ops (no cross-product hijack).
export async function reconcileVariants(
  productId: string,
  variants: VariantInput[],
) {
  const { data: existingRows } = await serviceClient
    .from("product_variants")
    .select("id, status")
    .eq("product_id", productId);
  const existing = (existingRows ?? []) as { id: string; status: string }[];
  const existingById = new Map(existing.map((v) => [String(v.id), v]));

  const keptIds = new Set<string>();
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (v.id && existingById.has(v.id)) {
      keptIds.add(v.id);
      await serviceClient
        .from("product_variants")
        .update({
          name: v.name,
          price_amount_override: v.priceOverride,
          stock_quantity: v.stock,
          // Resurrect a previously-archived variant when the artist edits it
          // back into the active list. Sold-out / hidden become active again
          // unless the artist also flipped per-product status (separate flow).
          status: "active",
          sort_order: i,
        })
        .eq("id", v.id)
        .eq("product_id", productId);
    } else {
      await serviceClient.from("product_variants").insert({
        product_id: productId,
        name: v.name,
        price_amount_override: v.priceOverride,
        stock_quantity: v.stock,
        sort_order: i,
      });
    }
  }

  // Removed variants: check for any FK references before deletion. Hide
  // when referenced so booking_interests + order_items keep their pointer.
  for (const ex of existing) {
    if (keptIds.has(ex.id)) continue;
    const [{ count: interestRefs }, { count: orderRefs }] = await Promise.all([
      serviceClient
        .from("booking_interests")
        .select("id", { count: "exact", head: true })
        .eq("variant_id", ex.id),
      serviceClient
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("variant_id", ex.id),
    ]);
    if ((interestRefs ?? 0) + (orderRefs ?? 0) > 0) {
      // Keep the row; hide it so it doesn't surface in the public shop or
      // checkout, and the FK link survives for historical reads.
      await serviceClient
        .from("product_variants")
        .update({ status: "hidden" })
        .eq("id", ex.id)
        .eq("product_id", productId);
    } else {
      await serviceClient
        .from("product_variants")
        .delete()
        .eq("id", ex.id)
        .eq("product_id", productId);
    }
  }
}
