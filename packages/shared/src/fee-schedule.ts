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

export type FeeScheduleVersion = {
  version: string;
  effectiveFrom: string;
  /** Basis points (100 bps = 1%). `null` = the tier cannot transact this lane. */
  rates: {
    appointmentPayment: { free: number | null; plus: number };
    goods: { free: number; plus: number };
  };
  notes: string;
};

/** The schedule in force TODAY for the live deposit path. */
export const FEE_SCHEDULE_V1: FeeScheduleVersion = {
  version: "fees-v1-2026-07-04",
  effectiveFrom: "2026-07-04",
  rates: {
    // The historical flat 3% on card deposits, all tiers.
    appointmentPayment: { free: 300, plus: 300 },
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
    appointmentPayment: { free: null, plus: 50 },
    goods: { free: 500, plus: 100 },
  },
  notes:
    "Plus appointment payments 0.5% on eligible tattoo-service value; goods 5% free / 1% Plus on subtotal after discounts ex VAT and shipping. Requires accountant approval of fee and tax treatment before activation.",
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
  tier: "free" | "plus",
  version?: string,
): number | null {
  const schedule = feeScheduleFor(version ?? ACTIVE_FEE_SCHEDULE_VERSION);
  return lane === "goods"
    ? schedule.rates.goods[tier]
    : schedule.rates.appointmentPayment[tier];
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
  tier: "free" | "plus",
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
  tier: "free" | "plus";
  version?: string;
}): number {
  if (!Number.isFinite(input.baseMinor) || input.baseMinor <= 0) return 0;
  const schedule = feeScheduleFor(
    input.version ?? ACTIVE_FEE_SCHEDULE_VERSION,
  );
  const bps =
    input.lane === "goods"
      ? schedule.rates.goods[input.tier]
      : schedule.rates.appointmentPayment[input.tier];
  if (bps === null || bps <= 0) return 0;
  return Math.round((input.baseMinor * bps) / 10000);
}
