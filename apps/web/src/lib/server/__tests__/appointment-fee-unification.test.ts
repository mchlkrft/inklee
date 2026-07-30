import { describe, it, expect, vi, beforeEach } from "vitest";

// THE V1 INVARIANT, AND THE FEE DIVERGENCE A3 HAS TO CLOSE (Plus build P9).
//
// WRITTEN BEFORE THE UNIFICATION, ON PURPOSE. A characterization test written
// after a refactor pins whatever the refactor produced, which is circular: the
// same author decides both the new number and the expectation. These literals
// were taken from the code that is charging real artists today, so a unified
// fee path is measured against something it cannot edit into agreeing with
// itself. Every expected value below is a LITERAL, never a re-derivation of the
// formula under test.
//
// TWO SOURCES COMPUTE THE SAME LANE (appointment / tattoo-service value):
//
//   INTENT CREATION    apps/web/src/lib/server/bookings.ts:853
//                      `platformFeeCents(amountCents)`, a hardcoded 300 bps
//                      (packages/shared/src/platform-fee.ts) that no schedule
//                      version can move. Its result is the deposit
//                      PaymentIntent's `application_fee_amount`, both at create
//                      (bookings.ts:697) and at re-request (bookings.ts:914).
//
//   BASKET RE-PREPARE  apps/web/src/app/request/[token]/actions.ts:394 and :504
//                      `resolveOrderFee` -> `computeOrderFees` -> the fee
//                      SCHEDULE's appointment_payment rate for the artist's
//                      tier. Same intent, same lane, recomputed from a
//                      different source and written back with
//                      `paymentIntents.update`.
//
// Under v1 the schedule says 300 bps for both tiers, so the two agree on every
// live number and the divergence is invisible. Under v2 the schedule says 50
// bps for Plus and "cannot transact this lane" for Free, while the hardcode
// still says 300. That is the 600 vs 100 vs 0 that
// docs/product/plus-remaining-work-plan.md Stage 4 refuses to flip into until
// A3 has unified the two.
//
// WHAT EACH BLOCK IS FOR:
//   1. the golden table    no live number may move, ever
//   2. rate identity       the hardcode and the v1 schedule rate are one number
//   3. the real paths      resolveOrderFee agrees with platformFeeCents today
//   4. v1 vs v2            parameterized; block 4b is a pre-registered tripwire

const getAccountOverrides = vi.fn();
const effectivePlanTier = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/entitlements", () => ({
  effectivePlanTier: (...a: unknown[]) => effectivePlanTier(...a),
}));

import { resolveOrderFee } from "@/lib/server/order-fee-sync";
import { computeOrderFees } from "@inklee/shared/order-fees";
import {
  PLATFORM_FEE_BPS,
  platformFeeCents,
} from "@inklee/shared/platform-fee";
import {
  ACTIVE_FEE_SCHEDULE_VERSION,
  FEE_SCHEDULE_V1,
  FEE_SCHEDULE_V2,
} from "@inklee/shared/fee-schedule";

// ---------------------------------------------------------------------------
// The golden table.
//
// `v1Fee` is what production sets as `application_fee_amount` on a deposit
// PaymentIntent for that amount today, for EVERY artist and every tier: the
// deposit path takes no tier argument at all. `v2PlusFee` is what the approved
// (defined, inactive) v2 schedule says the same collection should cost a Plus
// artist; under v2 a Free artist cannot transact this lane at all, so their
// fee is 0 rather than a reduced rate.
//
// Chosen for where rounding bites, not for round numbers:
//   1, 16    the fee rounds DOWN to zero. Inklee earns nothing and Stripe still
//            charges its own fee. `platformFeeCents` returning 0 here is not a
//            bug to fix silently in a refactor; it is the current behaviour and
//            moving it is a money decision.
//   17       the first amount whose fee rounds up to a whole cent.
//   50, 150, 250
//            exact .5 ties. `Math.round` goes half away from zero, so these are
//            2, 5 and 8 rather than 2, 4 and 8. A refactor that reached for
//            `Math.floor`, `toFixed` or a banker's rounding helper moves every
//            one of them and nothing else in the suite would notice.
//   5017     the historical rounding case already pinned in platform-fee.test.
//   10000000 the ceiling: MAX_DEPOSIT_AMOUNT is 100_000 major units
//            (bookings.ts:652), so this is the largest deposit that path takes.
const GOLDEN: readonly {
  cents: number;
  v1Fee: number;
  v2PlusFee: number;
  note: string;
}[] = [
  { cents: 1, v1Fee: 0, v2PlusFee: 0, note: "rounds down to nothing" },
  { cents: 16, v1Fee: 0, v2PlusFee: 0, note: "last amount with a zero fee" },
  { cents: 17, v1Fee: 1, v2PlusFee: 0, note: "first non-zero fee" },
  { cents: 33, v1Fee: 1, v2PlusFee: 0, note: "0.99 rounds up" },
  { cents: 34, v1Fee: 1, v2PlusFee: 0, note: "1.02 rounds down" },
  { cents: 50, v1Fee: 2, v2PlusFee: 0, note: "exact .5 tie, half away from 0" },
  { cents: 100, v1Fee: 3, v2PlusFee: 1, note: "one major unit" },
  { cents: 150, v1Fee: 5, v2PlusFee: 1, note: "exact .5 tie" },
  { cents: 250, v1Fee: 8, v2PlusFee: 1, note: "exact .5 tie" },
  { cents: 333, v1Fee: 10, v2PlusFee: 2, note: "" },
  { cents: 999, v1Fee: 30, v2PlusFee: 5, note: "29.97 rounds up" },
  { cents: 1000, v1Fee: 30, v2PlusFee: 5, note: "" },
  { cents: 2500, v1Fee: 75, v2PlusFee: 13, note: "12.5 tie on the v2 side" },
  { cents: 4999, v1Fee: 150, v2PlusFee: 25, note: "" },
  { cents: 5000, v1Fee: 150, v2PlusFee: 25, note: "" },
  { cents: 5017, v1Fee: 151, v2PlusFee: 25, note: "150.51 rounds up" },
  { cents: 10000, v1Fee: 300, v2PlusFee: 50, note: "" },
  { cents: 20000, v1Fee: 600, v2PlusFee: 100, note: "the reference deposit" },
  { cents: 33333, v1Fee: 1000, v2PlusFee: 167, note: "999.99 rounds up" },
  { cents: 99999, v1Fee: 3000, v2PlusFee: 500, note: "2999.97 rounds up" },
  { cents: 10000000, v1Fee: 300000, v2PlusFee: 50000, note: "MAX_DEPOSIT" },
];

/**
 * What the deposit path sets as `application_fee_amount`.
 *
 * `platformFeeCents` is imported rather than reimplemented, so this is the live
 * function and not a copy that could drift from it. The only mirrored line is
 * the sponsorship branch (`bookings.ts:857-858`), which is
 * `feeSponsored ? 0 : standardFeeCents` and has nothing in it to get wrong.
 */
function depositPathFee(cents: number, sponsored = false): number {
  return sponsored ? 0 : platformFeeCents(cents);
}

/** What the schedule path computes for the same collection, no goods. */
function schedulePathFee(
  cents: number,
  tier: "free" | "plus",
  version: string,
  sponsored = false,
): number {
  return computeOrderFees({
    appointmentBaseMinor: cents,
    goodsBaseMinor: 0,
    tier,
    appointmentFeeSponsored: sponsored,
    version,
  }).totalMinor;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
  effectivePlanTier.mockReturnValue("plus");
});

// ---------------------------------------------------------------------------
// 1. THE V1 INVARIANT. No live number may move.

describe("V1 INVARIANT: the deposit application_fee_amount, pinned to the cent", () => {
  it("charges exactly the pinned fee at every amount, for every tier", () => {
    // Collected rather than asserted one at a time, so a failure names EVERY
    // amount that moved instead of stopping at the first. A refactor that
    // changes the rounding mode moves several at once, and seeing one of them
    // invites the conclusion that it is an isolated edge case.
    const moved: string[] = [];
    for (const row of GOLDEN) {
      const live = depositPathFee(row.cents);
      if (live !== row.v1Fee) {
        moved.push(`${row.cents} minor: pinned ${row.v1Fee}, now ${live}`);
      }
    }
    expect(moved).toEqual([]);
  });

  it("the schedule computes the same cent under v1, for free and for plus", () => {
    const disagreed: string[] = [];
    for (const row of GOLDEN) {
      for (const tier of ["free", "plus"] as const) {
        const viaSchedule = schedulePathFee(
          row.cents,
          tier,
          FEE_SCHEDULE_V1.version,
        );
        if (viaSchedule !== row.v1Fee) {
          disagreed.push(
            `${row.cents} minor, ${tier}: pinned ${row.v1Fee}, schedule ${viaSchedule}`,
          );
        }
      }
    }
    expect(disagreed).toEqual([]);
  });

  // A sponsored deposit is created with application_fee_amount 0 and carries
  // `sponsored_fee_cents` so the waiver can be reported against a real number.
  // AGENTS.md: that metadata records what Inklee INTENDED to waive and is never
  // what a release is booked against. Pinned here because a unified path that
  // waived by lowering the RATE instead of zeroing the fee would produce the
  // same 0 on the intent and a wrong number in `appointmentFeeBeforeSponsorship`.
  it("a sponsored deposit is zero on both paths, and both still report the full fee", () => {
    for (const row of GOLDEN) {
      expect(depositPathFee(row.cents, true)).toBe(0);

      const sponsored = computeOrderFees({
        appointmentBaseMinor: row.cents,
        goodsBaseMinor: 0,
        tier: "plus",
        appointmentFeeSponsored: true,
        version: FEE_SCHEDULE_V1.version,
      });
      expect(sponsored.totalMinor).toBe(0);
      expect(sponsored.appointmentFeeMinor).toBe(0);
      // The waived amount, which is what gets stamped as `sponsored_fee_cents`.
      expect(sponsored.appointmentFeeBeforeSponsorshipMinor).toBe(row.v1Fee);
    }
  });

  it("the active schedule is still v1, so these literals are the live numbers", () => {
    expect(ACTIVE_FEE_SCHEDULE_VERSION).toBe(FEE_SCHEDULE_V1.version);
  });
});

// ---------------------------------------------------------------------------
// 2. Rate identity and rounding, swept rather than sampled.

describe("V1 INVARIANT: the hardcode and the schedule are the same rate", () => {
  it("300 bps is one number written in two files, not two that agree", () => {
    expect(PLATFORM_FEE_BPS).toBe(
      FEE_SCHEDULE_V1.rates.appointmentPayment.plus,
    );
    expect(PLATFORM_FEE_BPS).toBe(
      FEE_SCHEDULE_V1.rates.appointmentPayment.free,
    );
  });

  // The golden table samples 21 amounts. This sweeps a contiguous range so a
  // rounding change cannot hide between two of them: at 3% every hundredth
  // amount is a .5 tie, and a sampled table can miss all of them.
  it("agrees at every minor unit from 1 to 3000, on both tiers", () => {
    const disagreed: string[] = [];
    for (let cents = 1; cents <= 3000; cents += 1) {
      const live = depositPathFee(cents);
      for (const tier of ["free", "plus"] as const) {
        const viaSchedule = schedulePathFee(
          cents,
          tier,
          FEE_SCHEDULE_V1.version,
        );
        if (live !== viaSchedule) {
          disagreed.push(`${cents} minor, ${tier}: ${live} vs ${viaSchedule}`);
        }
      }
    }
    expect(disagreed.slice(0, 5)).toEqual([]);
    expect(disagreed.length).toBe(0);
  });

  it("both refuse a non-positive or non-finite base rather than signing it", () => {
    for (const bad of [0, -1, -20000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(depositPathFee(bad)).toBe(0);
      expect(schedulePathFee(bad, "plus", FEE_SCHEDULE_V1.version)).toBe(0);
      expect(schedulePathFee(bad, "free", FEE_SCHEDULE_V1.version)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The two REAL entry points, not just the primitives underneath them.

describe("V1 INVARIANT: intent creation and basket re-prepare land on one number", () => {
  it("resolveOrderFee returns the deposit path's fee when there are no goods", async () => {
    const disagreed: string[] = [];
    for (const row of GOLDEN) {
      for (const tier of ["free", "plus"] as const) {
        effectivePlanTier.mockReturnValue(tier);
        const resolved = await resolveOrderFee({
          artistId: "artist-1",
          depositMinor: row.cents,
          goodsBaseMinor: 0,
          intent: { metadata: {}, application_fee_amount: 0 } as never,
        });
        if (resolved.applicationFeeMinor !== row.v1Fee) {
          disagreed.push(
            `${row.cents} minor, ${tier}: deposit path ${row.v1Fee}, re-prepare ${resolved.applicationFeeMinor}`,
          );
        }
      }
    }
    expect(disagreed).toEqual([]);
  });

  // The re-prepare path reads the request-time waiver decision off the intent's
  // metadata. If it stopped honouring it, a client emptying their basket would
  // have the artist's waived fee silently reinstated mid-checkout.
  it("re-prepare honours the waiver the deposit path recorded, at every amount", async () => {
    for (const row of GOLDEN) {
      const resolved = await resolveOrderFee({
        artistId: "artist-1",
        depositMinor: row.cents,
        goodsBaseMinor: 0,
        intent: {
          metadata: { sponsored_fee_cents: String(row.v1Fee) },
          application_fee_amount: 0,
        } as never,
      });
      expect(resolved.applicationFeeMinor).toBe(
        depositPathFee(row.cents, true),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Parameterized over v1 AND v2. 4a holds now and must keep holding; 4b is
//    the pre-registered falsification that A3 is expected to break.

/** Every golden amount where the two sources disagree under `version`. */
function divergenceUnder(version: string, tier: "free" | "plus"): string[] {
  const out: string[] = [];
  for (const row of GOLDEN) {
    const live = depositPathFee(row.cents);
    const viaSchedule = schedulePathFee(row.cents, tier, version);
    if (live !== viaSchedule) {
      out.push(`${row.cents}: deposit ${live} vs schedule ${viaSchedule}`);
    }
  }
  return out;
}

describe("4a. the two sources agree under v1, which is why nothing is visibly broken", () => {
  it("has no divergence on the free tier", () => {
    expect(divergenceUnder(FEE_SCHEDULE_V1.version, "free")).toEqual([]);
  });
  it("has no divergence on the plus tier", () => {
    expect(divergenceUnder(FEE_SCHEDULE_V1.version, "plus")).toEqual([]);
  });
});

describe("4b. PRE-REGISTERED TRIPWIRE: under v2 the two sources still disagree", () => {
  // ====================================================================
  // THIS BLOCK IS EXPECTED TO GO RED WHEN A3 LANDS. That is its job.
  //
  // It asserts that the divergence is STILL PRESENT, so it cannot pass by
  // accident and cannot be satisfied by a partial unification: any amount that
  // starts agreeing shrinks the list, and a full unification empties it.
  //
  // WHEN IT FAILS, the fix is three lines, not a re-baseline:
  //   1. delete this describe block,
  //   2. add v2 to 4a, so agreement is asserted under BOTH versions,
  //   3. keep the golden table exactly as it is. It pins the live v1 numbers
  //      and A3 must not move one of them.
  //
  // Deleting it WITHOUT doing 2 would leave the v2 flip (Stage 4) unguarded,
  // which is the state this file exists to end.
  // ====================================================================

  it("a Plus artist would be charged 6x the approved v2 rate by the deposit path", () => {
    // 19 of the 21 golden amounts. The two that agree (1 and 16 minor) do so
    // because both rates round them to a zero fee, which is not evidence of
    // anything.
    const diverged = divergenceUnder(FEE_SCHEDULE_V2.version, "plus");
    expect(diverged.length).toBe(19);
    expect(diverged).toContain("20000: deposit 600 vs schedule 100");
    // The concrete unification target, written down now so the flip cannot
    // quietly keep 300 bps: a 200.00 collection costs a Plus artist 1.00.
    expect(schedulePathFee(20000, "plus", FEE_SCHEDULE_V2.version)).toBe(100);
  });

  it("a Free artist would be charged a fee for a lane v2 says they cannot use", () => {
    const diverged = divergenceUnder(FEE_SCHEDULE_V2.version, "free");
    expect(diverged.length).toBe(19);
    expect(diverged).toContain("20000: deposit 600 vs schedule 0");
    // v2 says `appointmentPayment.free` is null, "cannot transact this lane",
    // which the engine reports as 0. Spec section 1: there is no Free card
    // rate, and any Free 3% found anywhere is stale rather than reconcilable.
    expect(FEE_SCHEDULE_V2.rates.appointmentPayment.free).toBeNull();
    expect(schedulePathFee(20000, "free", FEE_SCHEDULE_V2.version)).toBe(0);
  });

  it("the deposit path takes no version and no tier, which is the whole defect", () => {
    // Not a style complaint. `platformFeeCents(cents)` has one argument, so
    // there is no call site anywhere that could pass v2 or a tier even if it
    // wanted to. Flipping ACTIVE_FEE_SCHEDULE_VERSION would change the basket
    // path and leave this one at 300 bps, on the same PaymentIntent.
    expect(platformFeeCents.length).toBe(1);
    expect(PLATFORM_FEE_BPS).not.toBe(
      FEE_SCHEDULE_V2.rates.appointmentPayment.plus,
    );
  });
});
