// The Inklee fee schedule, as VERSIONED DATA (founder direction 2026-07-28).
//
// Two independent fee lanes, never applied to the same value:
//   APPOINTMENT PAYMENTS (tattoo-service value collected through Inklee)
//   GOODS (product subtotal after discounts, ex VAT and shipping)
//
// NOT ACTIVE YET. This module DEFINES the approved schedule so the payment
// architecture, tests and documentation share one source; the live deposit
// path still charges the current rate until P7 switches it deliberately, under
// the money-path rules and with accountant approval of the final fee and tax
// treatment. `ACTIVE_FEE_SCHEDULE_VERSION` is what a transaction stamps, and
// it moves only when that switch happens.
//
// Card payment collection is PLUS-ONLY, so there is no Free appointment-payment
// rate: Free is "not applicable", not "3%". Any Free card rate found anywhere
// is stale and must be removed rather than reconciled.

export type FeeLane = "appointment_payment" | "goods";

/**
 * The fee tier for a transaction.
 *
 * `legacy` is the grandfathered `legacy_free_v1` cohort: a Free artist who held
 * card-payment collection access before it became Plus-only and keeps it. On the
 * APPOINTMENT lane they pay the historical flat rate rather than being blocked
 * (the v2 Free rate is `null` = cannot transact) or being handed the Plus rate
 * they never paid for. On the GOODS lane there is nothing to grandfather, so
 * `legacy` resolves to the Free goods rate (see `laneRateBps`). Resolve it with
 * `resolveAppointmentTier`, never by hand.
 */
export type PaymentTier = "free" | "plus" | "legacy";

export type FeeScheduleVersion = {
  version: string;
  effectiveFrom: string;
  /** Basis points (100 bps = 1%). `null` = the tier cannot transact this lane. */
  rates: {
    appointmentPayment: { free: number | null; plus: number; legacy: number };
    goods: { free: number; plus: number };
  };
  notes: string;
};

/** The schedule in force TODAY for the live deposit path. */
export const FEE_SCHEDULE_V1: FeeScheduleVersion = {
  version: "fees-v1-2026-07-04",
  effectiveFrom: "2026-07-04",
  rates: {
    // The historical flat 3% on card deposits, all tiers. `legacy` matches
    // `free`/`plus` here: v1 never distinguished the grandfathered cohort.
    appointmentPayment: { free: 300, plus: 300, legacy: 300 },
    // Goods checkout is parked and was coded at 0% take.
    goods: { free: 0, plus: 0 },
  },
  notes:
    "Live since the Stripe cutover. Flat 3% deposits; goods parked at 0%. Superseded by v2 but still ACTIVE until P7.",
};

/** The APPROVED schedule (founder 2026-07-28). Defined, not yet active. */
export const FEE_SCHEDULE_V2: FeeScheduleVersion = {
  version: "fees-v2-plus-payments",
  effectiveFrom: "", // set when P7 activates it
  rates: {
    // Free cannot collect card payments at all, so there is no Free rate.
    // `legacy` = the grandfathered `legacy_free_v1` cohort keeps the historical
    // flat 3% (founder ruling 2026-07-31), rather than being blocked (free=null)
    // or handed the Plus 0.5% they never paid for. Encoded now so v2 has NO
    // undefined cell when it activates; zero accounts hold this today.
    appointmentPayment: { free: null, plus: 50, legacy: 300 },
    goods: { free: 500, plus: 100 },
  },
  notes:
    "Plus appointment payments 0.5% on eligible tattoo-service value; grandfathered legacy_free_v1 appointment access stays at 3%; goods 5% free / 1% Plus on subtotal after discounts ex VAT and shipping. Requires accountant approval of fee and tax treatment before activation.",
};

export const FEE_SCHEDULES: Record<string, FeeScheduleVersion> = {
  [FEE_SCHEDULE_V1.version]: FEE_SCHEDULE_V1,
  [FEE_SCHEDULE_V2.version]: FEE_SCHEDULE_V2,
};

/**
 * The version stamped on every transaction. Still v1: the approved rates are
 * defined above but NOT in force, because activating them is a money-path
 * change gated on P7 and accountant sign-off.
 */
export const ACTIVE_FEE_SCHEDULE_VERSION = FEE_SCHEDULE_V1.version;

export function feeScheduleFor(version: string): FeeScheduleVersion {
  return FEE_SCHEDULES[version] ?? FEE_SCHEDULE_V1;
}

/**
 * The rate for one lane and tier, or `null` when the tier cannot transact it.
 *
 * ADDED BY SLICE A3, and the reason it exists is that `feeMinorUnits` erases
 * exactly the distinction the unified fee path has to act on: it answers 0 both
 * for "the rate is 0%" (v1 goods) and for "this tier cannot transact this lane
 * at all" (v2 appointment payments on Free). Those are the same arithmetic and
 * two different decisions. A caller that only has the number computes a 0 fee
 * and lets the charge through, which is spec section 1's "there is no Free card
 * rate" turned into an invented Free card rate of 0.
 */
export function laneRateBps(
  lane: FeeLane,
  tier: PaymentTier,
  version?: string,
): number | null {
  const schedule = feeScheduleFor(version ?? ACTIVE_FEE_SCHEDULE_VERSION);
  if (lane === "goods") {
    // Nothing to grandfather on goods: legacy pays the Free goods rate. This is
    // the one place that mapping lives, so a caller can pass a single resolved
    // tier for both lanes (appointment=legacy, goods=free) without splitting it.
    const goodsTier = tier === "legacy" ? "free" : tier;
    return schedule.rates.goods[goodsTier];
  }
  return schedule.rates.appointmentPayment[tier];
}

/**
 * Resolve the fee tier for the APPOINTMENT lane from the artist's plan and
 * grandfathering state.
 *
 * Plus is always `plus`. A Free artist is `legacy` when they were grandfathered
 * card-payment access (the `legacy_free_v1` cohort holds `card_deposit_collection`
 * as an override), otherwise `free` (which is `null` = cannot transact under v2).
 * This is the ONLY sanctioned way to decide `legacy`; do not infer it at a call
 * site. The same resolved tier is safe to pass to the goods lane, which maps it
 * back to `free`.
 */
export function resolveAppointmentTier(input: {
  planTier: "free" | "plus";
  grandfatheredAppointmentAccess: boolean;
}): PaymentTier {
  if (input.planTier === "plus") return "plus";
  return input.grandfatheredAppointmentAccess ? "legacy" : "free";
}

/**
 * Whether this tier may transact this lane at all under `version`.
 *
 * PRESENCE, NOT MAGNITUDE. A 0 bps rate is a rate (v1 prices goods at 0% for
 * both tiers and those sales are legitimate); `null` is an absence of one. So
 * this is `!== null` rather than `> 0`, and reading it the other way would park
 * every v1 goods sale as un-transactable.
 */
export function canTransactLane(
  lane: FeeLane,
  tier: PaymentTier,
  version?: string,
): boolean {
  return laneRateBps(lane, tier, version) !== null;
}

/**
 * The fee in integer minor units for one lane, tier and base amount.
 *
 * The BASE is the caller's responsibility and is deliberately not computed
 * here, because each lane excludes different things (see the exclusion lists
 * in plus-payments-architecture.md): VAT, tips, shipping, refunded value,
 * failed and cancelled payments, pure pass-through charges, and — critically —
 * the OTHER lane's value. A payment containing both tattoo service and goods
 * has two bases and two fees; it must never be charged both fees on one
 * amount.
 *
 * Returns 0 when the tier cannot transact the lane (Free appointment
 * payments), which is the same arithmetic outcome as "no fee" while keeping
 * the "cannot" distinct in the schedule.
 */
export function feeMinorUnits(input: {
  baseMinor: number;
  lane: FeeLane;
  tier: PaymentTier;
  version?: string;
}): number {
  if (!Number.isFinite(input.baseMinor) || input.baseMinor <= 0) return 0;
  // Via laneRateBps so the goods legacy->free mapping is not duplicated here.
  const bps = laneRateBps(input.lane, input.tier, input.version);
  if (bps === null || bps <= 0) return 0;
  return Math.round((input.baseMinor * bps) / 10000);
}
