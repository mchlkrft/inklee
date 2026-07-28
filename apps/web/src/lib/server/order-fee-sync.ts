import "server-only";
import type Stripe from "stripe";
import { computeOrderFees } from "@inklee/shared/order-fees";
import { effectivePlanTier } from "@/lib/entitlements";
import { getAccountOverrides } from "@/lib/entitlements-server";

// Keeping a PaymentIntent's `application_fee_amount` correct when goods are
// added to or removed from a deposit (Plus build P5a).
//
// MONEY RULE, converge to a target: this computes the fee the intent SHOULD
// carry and sets it absolutely. It never adds a delta. The client can re-run
// the prepare step any number of times (change the basket, reload, come back
// tomorrow), and Stripe re-delivers nothing here, but an incremental fee would
// still drift on the second prepare, which is exactly the failure mode the
// webhook rule exists to prevent.
//
// The APPOINTMENT lane is preserved, never re-derived. The artist was told
// what their deposit fee would be when they requested it, and a sponsorship
// budget that moved in between must not silently change it while a client is
// at the checkout. The only durable record of that request-time decision is
// the intent's own metadata, which is why it is read here. Note this is
// reading the waiver DECISION in order to price correctly; it is not releasing
// a waiver, which the money rules require to happen only against what
// settlement actually booked.

export type FeeSyncResult = {
  /** The absolute value to set on the intent. */
  applicationFeeMinor: number;
  appointmentFeeMinor: number;
  goodsFeeMinor: number;
  scheduleVersion: string;
};

/**
 * Work out the application fee for a deposit-plus-goods intent.
 *
 * `depositMinor` is the tattoo-service value on the intent; `goodsBaseMinor`
 * is the goods value after discounts and excluding VAT and shipping (composed
 * by the caller, which owns the line semantics).
 */
export async function resolveOrderFee(args: {
  artistId: string;
  depositMinor: number;
  goodsBaseMinor: number;
  intent: Pick<Stripe.PaymentIntent, "metadata" | "application_fee_amount">;
}): Promise<FeeSyncResult> {
  // A sponsored deposit carries `sponsored_fee_cents` in its metadata and was
  // created with application_fee_amount = 0.
  const sponsoredRaw = args.intent.metadata?.sponsored_fee_cents;
  const appointmentFeeSponsored =
    typeof sponsoredRaw === "string" && sponsoredRaw.trim() !== "";

  // A plan-read failure must NOT silently reprice: default to the tier that
  // charges the HIGHER goods rate rather than the lower one, so a blip can
  // never under-charge Inklee, and never over-charge the artist relative to
  // what Free would pay.
  let tier: "free" | "plus" = "free";
  try {
    tier = effectivePlanTier(await getAccountOverrides(args.artistId));
  } catch {
    tier = "free";
  }

  const fees = computeOrderFees({
    appointmentBaseMinor: args.depositMinor,
    goodsBaseMinor: args.goodsBaseMinor,
    tier,
    appointmentFeeSponsored,
  });

  return {
    applicationFeeMinor: fees.totalMinor,
    appointmentFeeMinor: fees.appointmentFeeMinor,
    goodsFeeMinor: fees.goodsFeeMinor,
    scheduleVersion: fees.scheduleVersion,
  };
}
