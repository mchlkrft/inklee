import "server-only";
import type Stripe from "stripe";
import { computeOrderFees } from "@inklee/shared/order-fees";
import { type PaymentTier } from "@inklee/shared/fee-schedule";
import {
  appointmentTierFromOverrides,
  type AccountOverrides,
} from "@/lib/entitlements";
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

// =========================================================================
// SLICE A3 UNIFIED THE TWO FEE SOURCES HERE.
//
// Until A3 there were two implementations of the same intent's fee:
//
//   bookings.ts:853        `platformFeeCents(amountCents)`, a hardcoded 300 bps
//                          that takes NEITHER a tier NOR a schedule version, so
//                          no call site could have passed one even if it wanted
//                          to. Its result became `application_fee_amount` at
//                          create and at re-request.
//   this file              `computeOrderFees`, which takes both.
//
// Under v1 the schedule says 300 bps for both tiers, so the two agreed on every
// live number and the split was invisible. Under v2 they disagree at 19 of the
// 21 amounts pinned in `__tests__/appointment-fee-unification.test.ts`: at
// 20000 minor the hardcode says 600 while the schedule says 100 for Plus and
// "cannot transact this lane" for Free. Flipping the active schedule with both
// alive would have changed the basket path and left the deposit path at 300
// bps, on the same PaymentIntent.
//
// `appointmentApplicationFee` below is now the ONE implementation. Both the
// deposit path and A3's payment-request path call it, and it is what the
// unification test measures. `platformFeeCents` stays, unchanged and still
// pinned, because it remains the ARTIST-FACING DISPLAY number ("Processing fee
// (3%)", `artistNetEur`) on the surfaces that quote the deduction before a
// deposit is requested. It is no longer the source of any charge.

/**
 * THE ONE PLACE that turns an artist's overrides into the appointment-lane fee
 * tier. Every appointment `application_fee_amount` uses this so the grandfather
 * rule is one decision, not three.
 *
 * A THIN DELEGATE (G1, FEE-DSP-001): the composition itself moved to
 * `@inklee/shared/entitlements` (`appointmentTierFromOverrides`) because it is
 * PURE and this module is `server-only` — a client component pricing a
 * display (the accept dialog, the payouts page) needs the same resolution
 * without importing a server module. Kept here, unchanged in shape, because
 * every server call site already imports it from `order-fee-sync`.
 */
export function appointmentFeeTier(overrides: AccountOverrides): PaymentTier {
  return appointmentTierFromOverrides(overrides);
}

/** A re-prepare that produced a fee. The only shape carrying a number. */
export type FeeSyncOk = {
  ok: true;
  /** The absolute value to set on the intent. */
  applicationFeeMinor: number;
  appointmentFeeMinor: number;
  goodsFeeMinor: number;
  scheduleVersion: string;
  /** The tier this fee was priced at (G2, FEE-STP-001), so a caller writing
   *  an order row can stamp `fee_tier` alongside `fee_schedule_version`
   *  without re-resolving it from the artist's (possibly since-changed)
   *  overrides. */
  tier: PaymentTier;
};

/**
 * WHY THIS IS A DISCRIMINATED RESULT AND NOT A NUMBER PLUS A FLAG.
 *
 * It used to be `{ applicationFeeMinor, ..., appointmentLaneAvailable }`, and
 * on an unavailable lane it returned `applicationFeeMinor: 0` with the flag
 * false. Executed with the active schedule mocked to v2, a Free artist's
 * re-prepare returned `{ appointmentLaneAvailable: false, applicationFeeMinor:
 * 0 }` and the only caller wrote that 0 straight onto the intent, because no
 * production code read the flag: the sole readers were this file and its
 * tests. A refusal nobody is obliged to read is a zero.
 *
 * The sibling `appointmentApplicationFee` already refused the same case. Two
 * wrappers over one engine disagreeing about whether an unavailable lane is a
 * refusal or a zero is the split A3 exists to end, so this one refuses too, in
 * the shape that makes the caller narrow before it can reach a number.
 */
export type FeeSyncResult =
  | FeeSyncOk
  | {
      ok: false;
      /** The resolved tier has no appointment rate under this schedule, so it
       *  may not collect on that lane at all. Same meaning, and the same
       *  string, as `AppointmentFeeQuote`'s refusal. */
      reason: "appointment_lane_unavailable";
      tier: PaymentTier;
      scheduleVersion: string;
    }
  | {
      ok: false;
      /** The artist's plan could not be read, so no tier is known and no rate
       *  can be chosen. See the refusal in `resolveOrderFee`. */
      reason: "plan_read_failed";
    };

export type AppointmentFeeInput = {
  /** Tattoo-service value in minor units: a deposit, a balance, or a full
   *  price. Spec section 6's appointment-lane base, composed by the caller. */
  appointmentBaseMinor: number;
  /** Goods value in minor units, already net of discounts and already
   *  excluding VAT and shipping. Zero on a pure appointment collection. */
  goodsBaseMinor?: number;
  /** Resolve with `appointmentFeeTier`. `legacy` is the grandfathered cohort. */
  tier: PaymentTier;
  /** Inklee is waiving the APPOINTMENT lane fee for this transaction. */
  sponsored?: boolean;
  /** Defaults to the active schedule. Pass a stored version to recompute an old
   *  transaction exactly as it was charged. */
  version?: string;
};

export type AppointmentFeeQuote =
  | {
      ok: true;
      /** What to set as Stripe's `application_fee_amount`. */
      applicationFeeMinor: number;
      appointmentFeeMinor: number;
      goodsFeeMinor: number;
      /**
       * What the appointment fee would have been without sponsorship. This is
       * the number stamped as `sponsored_fee_cents`.
       *
       * SPONSORSHIP ZEROES THE FEE, IT NEVER LOWERS THE RATE. A waiver
       * implemented as a reduced rate would produce the same 0 on the intent
       * and a WRONG number here, so the waiver would be reported against
       * something Inklee never intended to waive. And per the money-path rules
       * this number is evidence of INTENT only: a release is booked against
       * what settlement actually recorded, never against intent metadata.
       */
      appointmentFeeBeforeSponsorshipMinor: number;
      scheduleVersion: string;
    }
  | {
      ok: false;
      /** The tier has no rate for the appointment lane under this schedule, so
       *  it may not collect on it at all. Spec section 1: there is no Free card
       *  rate, and "not applicable" is not "0%". */
      reason: "appointment_lane_unavailable";
      tier: PaymentTier;
      scheduleVersion: string;
    };

/**
 * THE ONE appointment-lane fee computation. Every `application_fee_amount` on
 * a tattoo-service collection comes from here.
 *
 * REFUSES RATHER THAN INVENTING A ZERO. Under v2 `appointmentPayment.free` is
 * `null`, meaning "cannot transact this lane", and `feeMinorUnits` reports that
 * as 0 because 0 is the arithmetic. A caller that took the number would set a 0
 * application fee and let a Free artist collect a card payment Inklee does not
 * sell them. That is why this returns a discriminated result instead of a
 * number: the refusal has to be un-ignorable at the call site.
 *
 * Under the ACTIVE schedule (v1) both tiers have a 300 bps appointment rate, so
 * `ok` is always true today and this moves no live number. The unification test
 * pins that to the cent at 21 amounts and sweeps 1..3000.
 */
export function appointmentApplicationFee(
  input: AppointmentFeeInput,
): AppointmentFeeQuote {
  const fees = computeOrderFees({
    appointmentBaseMinor: input.appointmentBaseMinor,
    goodsBaseMinor: input.goodsBaseMinor ?? 0,
    tier: input.tier,
    appointmentFeeSponsored: input.sponsored ?? false,
    version: input.version,
  });

  if (!fees.appointmentLaneAvailable) {
    return {
      ok: false,
      reason: "appointment_lane_unavailable",
      tier: input.tier,
      scheduleVersion: fees.scheduleVersion,
    };
  }

  return {
    ok: true,
    applicationFeeMinor: fees.totalMinor,
    appointmentFeeMinor: fees.appointmentFeeMinor,
    goodsFeeMinor: fees.goodsFeeMinor,
    appointmentFeeBeforeSponsorshipMinor:
      fees.appointmentFeeBeforeSponsorshipMinor,
    scheduleVersion: fees.scheduleVersion,
  };
}

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

  // A PLAN-READ FAILURE REFUSES. IT DOES NOT PICK A TIER.
  //
  // This used to default to `free`, on the reasoning that Free carries the
  // HIGHER goods rate so a blip could never under-charge Inklee. That is true
  // of the goods lane and false of the appointment lane, where Free is not a
  // higher rate but no rate: under v1 both tiers are 300 bps so the default is
  // invisible, and executed with the active schedule mocked to v2 and the
  // overrides read rejecting, a PLUS artist's live intent resolved to
  // appointmentFeeMinor 0, goodsFeeMinor 500, applicationFeeMinor 500 where
  // the correct answer was 100 / 100 / 200. One blip, both lanes wrong, in
  // opposite directions.
  //
  // `bookings.ts` already refuses on this same read for the same reason (a
  // failed read must not read as "free plan"), so this follows that shape.
  //
  // Resolved through `appointmentFeeTier`, so a grandfathered Free artist
  // (legacy_free_v1, holding card_deposit_collection) re-prepares at the legacy
  // 3% rather than being refused under v2 the way a genuinely downgraded Free
  // artist is. Under the active schedule this changes nothing: every tier is
  // 300 bps.
  let tier: PaymentTier;
  try {
    tier = appointmentFeeTier(await getAccountOverrides(args.artistId));
  } catch {
    return { ok: false, reason: "plan_read_failed" };
  }

  const fees = computeOrderFees({
    appointmentBaseMinor: args.depositMinor,
    goodsBaseMinor: args.goodsBaseMinor,
    tier,
    appointmentFeeSponsored,
  });

  // THE RESIDUAL, AND WHAT IS AND IS NOT DECIDED HERE. This path re-prepares
  // an intent that ALREADY EXISTS: the client is standing at a checkout for a
  // deposit created while the artist could collect it. Under the active
  // schedule the case is unreachable, both v1 tiers have a rate. It becomes
  // reachable two ways under v2: an artist who downgraded between the request
  // and the checkout resolves to `free`, whose appointment rate is null, and
  // any Free artist holding an intent created before the flip does too.
  //
  // Refusing is not the same as answering the commercial question. What the
  // checkout should DO about a deposit that can no longer be collected on
  // (preserve the request-time fee, or send the client away) is P7's to
  // decide, and it is not a computation. What A3 settles is narrower: this
  // function will not hand back a number for a lane the tier cannot transact,
  // so whatever P7 decides has to be written down rather than inherited from
  // an arithmetic 0 nobody chose.
  if (!fees.appointmentLaneAvailable) {
    return {
      ok: false,
      reason: "appointment_lane_unavailable",
      tier,
      scheduleVersion: fees.scheduleVersion,
    };
  }

  return {
    ok: true,
    applicationFeeMinor: fees.totalMinor,
    appointmentFeeMinor: fees.appointmentFeeMinor,
    goodsFeeMinor: fees.goodsFeeMinor,
    scheduleVersion: fees.scheduleVersion,
    tier,
  };
}
