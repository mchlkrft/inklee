import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { capState } from "./entitlement-gates";
import { MOBILE_PLAN_LIMIT_MESSAGES } from "./plan-limit-messages";
import { CAP_COUNTED_PRODUCT_STATUSES } from "@inklee/shared/goods";

// Plus build P0 (plus-build-plan.md): the two goods guards, shared by the web
// actions and the mobile routes so the two surfaces enforce the identical
// truth (the deposits-gate drift lesson, same as travel-caps.ts).
//
// 1. The active-product cap (Free 3 / Plus 25, spec section 9). Counted =
//    everything except archived; enforced at create AND at any transition out
//    of archived, else unarchiving would bypass the create gate.
// 2. The order-reference guard: a product that any order line references is
//    ARCHIVED, never deleted. order_items.product_id is ON DELETE SET NULL
//    (0036), so a hard delete strands paid order rows with a null product;
//    the guard the Slice-75 comment promised never landed until now.

/** Count the artist's cap-counted (non-archived) products. Callers pass their
 *  own client so RLS scoping stays whatever the surface already has. */
export async function countCapCountedProducts(
  supabase: SupabaseClient,
  artistId: string,
): Promise<number> {
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)
    .in("status", CAP_COUNTED_PRODUCT_STATUSES as unknown as string[]);
  return count ?? 0;
}

/**
 * The active-product cap check. Returns the block message, or null when the
 * add (or unarchive) may proceed. Fails OPEN on a read blip like every cap
 * gate (deliberate soft-cap posture; Sentry captures the blip).
 */
export async function checkProductCap(
  supabase: SupabaseClient,
  artistId: string,
): Promise<string | null> {
  try {
    const overrides = await getAccountOverrides(artistId);
    const count = await countCapCountedProducts(supabase, artistId);
    const gate = capState(overrides, "active_products", count);
    if (gate.blocked) {
      // Single-sourced and steering-free: this string is served to the app
      // verbatim (see plan-limit-messages.ts for the surface policy).
      return MOBILE_PLAN_LIMIT_MESSAGES.activeProducts(gate.cap);
    }
    return null;
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "product_cap_check" },
      extra: { artistId },
    });
    return null; // fail open
  }
}

/**
 * True when any order line references this product or one of its variants.
 * Reads through the service client: order rows do not belong to the artist's
 * RLS surface, and the caller has already verified product ownership.
 */
export async function productHasOrderReferences(
  productId: string,
): Promise<boolean> {
  const { data: direct, error: directErr } = await serviceClient
    .from("order_items")
    .select("id")
    .eq("product_id", productId)
    .limit(1);
  if (directErr) {
    // Fail SAFE toward archiving: if the reference check cannot run, deleting
    // would risk stranding an order row, archiving risks nothing.
    Sentry.captureException(directErr, {
      tags: { action: "product_order_ref_check" },
      extra: { productId },
    });
    return true;
  }
  if ((direct ?? []).length > 0) return true;

  // Sold INSIDE a bundle counts too (GC6, migration 0135). A bundle sale is
  // one order line with product_id NULL; the components live only in the
  // snapshot table. Without this check a product sold exclusively via bundles
  // looks unreferenced, gets hard-deleted, and product_bundle_items' ON
  // DELETE CASCADE then erases it from the live bundle as well.
  const { data: bundleSold, error: bundleSoldErr } = await serviceClient
    .from("order_item_bundle_components")
    .select("id")
    .eq("product_id", productId)
    .limit(1);
  if (bundleSoldErr) {
    Sentry.captureException(bundleSoldErr, {
      tags: { action: "product_bundle_ref_check" },
      extra: { productId },
    });
    return true; // same fail-safe direction as the direct check
  }
  if ((bundleSold ?? []).length > 0) return true;

  // Booking interests count too (P5 decision, carried from the P0 review).
  //
  // The two levels disagreed: the variant reconcile already counted interests,
  // while this product-level guard counted only paid order lines. So deleting
  // a product that a client had picked and the artist had APPROVED silently
  // dropped that line from checkout composition. The client sees an item they
  // were told they could add simply vanish, with nothing explaining it.
  //
  // Counted at every status, like the variant reconcile, rather than only
  // `available`: a pending interest is one artist click from being approved,
  // and archiving instead of deleting costs the artist nothing (archived
  // products do not count against the active-product cap, migration 0112).
  const { data: interest, error: interestErr } = await serviceClient
    .from("booking_interests")
    .select("id")
    .eq("product_id", productId)
    .limit(1);
  if (interestErr) {
    Sentry.captureException(interestErr, {
      tags: { action: "product_interest_ref_check" },
      extra: { productId },
    });
    return true; // fail SAFE toward archiving, like every other leg here
  }
  if ((interest ?? []).length > 0) return true;

  const { data: variantIds, error: variantListErr } = await serviceClient
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  if (variantListErr) {
    // Same fail-SAFE direction as the two order_items legs (review finding
    // 2026-07-28): an unreadable variant list must archive, not delete.
    Sentry.captureException(variantListErr, {
      tags: { action: "product_order_ref_check_variant_list" },
      extra: { productId },
    });
    return true;
  }
  const ids = (variantIds ?? []).map((v) => v.id as string);
  if (ids.length === 0) return false;

  const { data: viaVariant, error: variantErr } = await serviceClient
    .from("order_items")
    .select("id")
    .in("variant_id", ids)
    .limit(1);
  if (variantErr) {
    Sentry.captureException(variantErr, {
      tags: { action: "product_order_ref_check_variant" },
      extra: { productId },
    });
    return true;
  }
  if ((viaVariant ?? []).length > 0) return true;

  // The interest check by variant as well. The product-level check above
  // catches the normal case, but `booking_interests.product_id` is nullable
  // (the checkout allowlist skips rows without one), so a row that names only
  // a variant would otherwise slip through both.
  const { data: interestViaVariant, error: interestVariantErr } =
    await serviceClient
      .from("booking_interests")
      .select("id")
      .in("variant_id", ids)
      .limit(1);
  if (interestVariantErr) {
    Sentry.captureException(interestVariantErr, {
      tags: { action: "product_interest_ref_check_variant" },
      extra: { productId },
    });
    return true;
  }
  return (interestViaVariant ?? []).length > 0;
}
