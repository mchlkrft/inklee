// Order fee composition (Plus build P5a).
//
// One function that turns a payable order into the Stripe
// `application_fee_amount` and the per-lane breakdown worth persisting.
//
// It exists because a single PaymentIntent can carry BOTH lanes: the deposit
// (tattoo-service value) and checkout add-on goods. The two lanes have
// different rates and different exclusion rules, so the fee is the SUM of two
// independently computed bases, never one rate applied to the combined amount.
//
// The defect this closes (found in the 2026-07-28 audit, fixed here): the
// add-on path raised the PaymentIntent's amount to deposit + goods but never
// touched `application_fee_amount`, so every goods sale rode along at a 0%
// take while the artist's own deposit fee stayed correct. `platform_fee_amount`
// on the order row was likewise never written, so nothing recorded what had
// been charged.
//
// UNDER THE ACTIVE SCHEDULE (v1) THE GOODS RATE IS 0%, so wiring this in
// changes no live number. That is deliberate: the engine, the persistence and
// the snapshot land first, and P7 flips the rates once the accountant has
// approved the fee and tax treatment.

import {
  ACTIVE_FEE_SCHEDULE_VERSION,
  canTransactLane,
  feeMinorUnits,
  feeScheduleFor,
} from "./fee-schedule";

export type OrderFeeInput = {
  /** Tattoo-service value in minor units (the deposit, or a later balance). */
  appointmentBaseMinor: number;
  /**
   * Goods value in minor units, ALREADY reduced by discounts and ALREADY
   * excluding VAT and shipping. Passed in rather than derived, because those
   * three exclusions belong to whoever composed the order lines, and a fee
   * engine quietly guessing at a tax-exclusive base is how a fee ends up
   * charged on VAT.
   */
  goodsBaseMinor: number;
  tier: "free" | "plus";
  /**
   * True when Inklee is waiving the fee on the APPOINTMENT lane for this
   * transaction (the fee-sponsorship programme). It never waives the goods
   * lane: sponsorship is an onboarding subsidy on the artist's own earnings,
   * not on a product sale.
   */
  appointmentFeeSponsored?: boolean;
  /** Defaults to the active schedule. Pass a stored version to RECOMPUTE an
   *  old transaction exactly as it was charged. */
  version?: string;
};

export type OrderFeeBreakdown = {
  /** What to set as Stripe's `application_fee_amount`. */
  totalMinor: number;
  appointmentFeeMinor: number;
  goodsFeeMinor: number;
  /** What the appointment fee WOULD have been without sponsorship. Recorded so
   *  a waiver can be reported and reconciled against a real number rather than
   *  inferred from an absence. */
  appointmentFeeBeforeSponsorshipMinor: number;
  /** Stamped on the transaction. A rate change must never silently rewrite
   *  what an old order was charged. */
  scheduleVersion: string;
  /**
   * Whether this tier may transact the APPOINTMENT lane at all under this
   * schedule. ADDED BY SLICE A3.
   *
   * `appointmentFeeMinor` is 0 both when the rate rounds a small amount to
   * nothing and when the tier has no rate at all, so the fee alone cannot tell
   * a caller which it is looking at. Under v2 the Free appointment rate is
   * `null`, which spec section 1 means as "cannot collect card payments", and a
   * caller that read the 0 as a rate would charge nothing and let the
   * collection through. Reported alongside the arithmetic so the refusal is
   * available without re-reading the schedule.
   *
   * The GOODS lane has no equivalent because no tier is excluded from it: both
   * rates are numbers in both schedules.
   */
  appointmentLaneAvailable: boolean;
};

export function computeOrderFees(input: OrderFeeInput): OrderFeeBreakdown {
  const version = input.version ?? ACTIVE_FEE_SCHEDULE_VERSION;
  // Resolve the schedule once so an unknown version falls back consistently
  // for both lanes rather than half-resolving.
  const scheduleVersion = feeScheduleFor(version).version;

  const appointmentFeeBeforeSponsorshipMinor = feeMinorUnits({
    baseMinor: input.appointmentBaseMinor,
    lane: "appointment_payment",
    tier: input.tier,
    version: scheduleVersion,
  });
  const appointmentFeeMinor = input.appointmentFeeSponsored
    ? 0
    : appointmentFeeBeforeSponsorshipMinor;

  const goodsFeeMinor = feeMinorUnits({
    baseMinor: input.goodsBaseMinor,
    lane: "goods",
    tier: input.tier,
    version: scheduleVersion,
  });

  return {
    totalMinor: appointmentFeeMinor + goodsFeeMinor,
    appointmentFeeMinor,
    goodsFeeMinor,
    appointmentFeeBeforeSponsorshipMinor,
    scheduleVersion,
    appointmentLaneAvailable: canTransactLane(
      "appointment_payment",
      input.tier,
      scheduleVersion,
    ),
  };
}

/**
 * The goods fee BASE from a set of order lines.
 *
 * Separate from the fee maths on purpose: this is the one place that decides
 * what counts as goods value, and it is the place discounts, VAT and shipping
 * will be subtracted from when those exist. Today an order has neither, so the
 * base is the sum of product lines and the deposit line is excluded by type.
 */
export function goodsBaseMinorFromLines(
  lines: { type: string; totalMinor: number }[],
  deductions: { discountsMinor?: number; vatMinor?: number; shippingMinor?: number } = {},
): number {
  const gross = lines
    .filter((l) => l.type === "product")
    .reduce((sum, l) => sum + (Number.isFinite(l.totalMinor) ? l.totalMinor : 0), 0);
  const net =
    gross -
    (deductions.discountsMinor ?? 0) -
    (deductions.vatMinor ?? 0) -
    (deductions.shippingMinor ?? 0);
  // Never negative: an over-large discount is a composition bug, and a
  // negative base would turn into a negative application fee, which Stripe
  // rejects and which would fail the whole payment.
  return Math.max(0, net);
}
