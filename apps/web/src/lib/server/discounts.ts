import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsDiscountsAllowed } from "./entitlement-gates";
import {
  evaluateDiscount,
  normalizeDiscountCode,
  clientRejectionMessage,
  type DiscountCode,
  type DiscountResult,
} from "@inklee/shared/discounts";

// Server side of discount codes (Plus build P5b).
//
// The redemption cap is enforced by the DATABASE, not by a counter read here.
// A counter would be a read-modify-write: two clients checking out with the
// last remaining redemption would both read "1 left" and both succeed. The
// unique constraint on (discount_code_id, order_id) plus a count read makes
// the cap real, and makes the webhook's redemption write idempotent under
// Stripe redelivery at the same time.

type DiscountRow = {
  id: string;
  code: string;
  kind: string;
  value: number;
  currency: string;
  min_subtotal_minor: number;
  max_redemptions: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
};

function toModel(row: DiscountRow): DiscountCode {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind === "fixed" ? "fixed" : "percent",
    value: row.value,
    currency: row.currency,
    minSubtotalMinor: row.min_subtotal_minor,
    maxRedemptions: row.max_redemptions,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    active: row.active,
  };
}

export type ResolvedDiscount = {
  /** Null when no code was supplied or it did not apply. */
  codeId: string | null;
  discountMinor: number;
  /** Client-facing message when a supplied code was rejected. */
  error: string | null;
};

/**
 * Resolve a client-supplied code against a goods subtotal.
 *
 * `subtotalMinor` is GOODS ONLY: a discount must never reach the deposit,
 * which is tattoo-service value the artist quoted.
 *
 * A code that fails NEVER fails the checkout. The client is told it did not
 * apply and pays the undiscounted amount, because refusing the whole payment
 * over a mistyped promo code would cost the artist a booking.
 */
export async function resolveDiscount(args: {
  artistId: string;
  rawCode: unknown;
  subtotalMinor: number;
  currency: string;
}): Promise<ResolvedDiscount> {
  const code = normalizeDiscountCode(args.rawCode);
  if (!code) return { codeId: null, discountMinor: 0, error: null };

  try {
    // The gate is checked on APPLY, not only on create: an artist who
    // downgrades keeps their codes (deleting a promise they made publicly
    // would be worse) but the codes stop taking money off.
    if (!goodsDiscountsAllowed(await getAccountOverrides(args.artistId))) {
      return {
        codeId: null,
        discountMinor: 0,
        error: clientRejectionMessage("inactive"),
      };
    }

    const { data: row } = await serviceClient
      .from("discount_codes")
      .select(
        "id, code, kind, value, currency, min_subtotal_minor, max_redemptions, starts_at, ends_at, active",
      )
      .eq("artist_id", args.artistId)
      .eq("code", code)
      .maybeSingle();

    const model = row ? toModel(row as DiscountRow) : null;

    // Only counted when the code caps redemptions, so the common uncapped
    // code costs no extra query.
    let used = 0;
    if (model?.maxRedemptions !== null && model?.maxRedemptions !== undefined) {
      const { count } = await serviceClient
        .from("discount_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("discount_code_id", model.id);
      used = count ?? 0;
    }

    const result: DiscountResult = evaluateDiscount({
      code: model,
      subtotalMinor: args.subtotalMinor,
      currency: args.currency,
      nowMs: Date.now(),
      redemptionsUsed: used,
    });

    if (!result.ok) {
      return {
        codeId: null,
        discountMinor: 0,
        error: clientRejectionMessage(result.reason),
      };
    }
    return {
      codeId: model?.id ?? null,
      discountMinor: result.discountMinor,
      error: null,
    };
  } catch (err) {
    // A lookup failure must not fail the checkout. The client pays full price
    // and can retry the code; losing the sale over a database blip is worse
    // than losing the discount.
    Sentry.captureException(err, {
      tags: { action: "discount_resolve" },
      extra: { artistId: args.artistId },
    });
    return { codeId: null, discountMinor: 0, error: null };
  }
}

/**
 * Record a redemption, once per order.
 *
 * Called from the webhook when an order is confirmed paid. The unique
 * constraint makes a redelivery a no-op rather than a double count, so this
 * needs no idempotency gate of its own.
 */
export async function recordDiscountRedemption(args: {
  discountCodeId: string;
  artistId: string;
  orderId: string;
  amountMinor: number;
}): Promise<void> {
  const { error } = await serviceClient.from("discount_redemptions").insert({
    discount_code_id: args.discountCodeId,
    artist_id: args.artistId,
    order_id: args.orderId,
    amount_minor: Math.max(0, Math.round(args.amountMinor)),
  });
  // 23505 is the expected outcome of a Stripe redelivery, not a problem.
  if (error && error.code !== "23505") {
    Sentry.captureException(error, {
      tags: { action: "discount_redemption_record" },
      extra: { orderId: args.orderId },
    });
  }
}
