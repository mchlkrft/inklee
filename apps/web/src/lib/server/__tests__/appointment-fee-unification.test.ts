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
//
// ===========================================================================
// A3 LANDED (2026-07-30). WHAT CHANGED IN THIS FILE, AND WHAT DID NOT.
//
// THE GOLDEN TABLE IS BYTE-FOR-BYTE UNTOUCHED. Not one expected literal moved,
// which is the whole claim: the unification charges the same cent it charged
// before, at every amount pinned here.
//
// Block 4b was the pre-registered falsification and it is DELETED, following
// the three-line handover it carried. v2 is now asserted in 4a alongside v1, so
// agreement is required under BOTH versions and the Stage 4 flip is guarded
// rather than merely unblocked.
//
// ONE THING HAD TO CHANGE AND IT IS NOT A RE-BASELINE. `depositPathFee` was a
// MODEL of the deposit path, written as `platformFeeCents(cents)` because that
// is what bookings.ts:853 called. After A3 that call site is gone: the deposit
// path computes its `application_fee_amount` through
// `appointmentApplicationFee`, which takes a tier and a version. Leaving the
// helper pointing at `platformFeeCents` would have left this file asserting
// things about a function no charge flows through, which is a worse failure
// than a moved literal because it looks green. It now calls the real production
// function, and it takes the tier and version that function takes, which is
// also what makes 4a expressible under v2 at all.
//
// WHAT THAT WOULD HAVE COST, AND HOW IT IS PAID BACK. `platformFeeCents` is
// still live: it is the ARTIST-FACING display number on the deposit request
// surfaces ("Processing fee (3%)", `artistNetEur`). Re-pointing the helper
// would have dropped the golden table's pin on it, so the displayed deduction
// could drift from the charged fee with nothing failing. Block 2 gains one test
// that holds it to the same 21 literals. Nothing else about it changed: it
// still takes one argument and still reads 300 bps.
//
// ===========================================================================
// READ THIS BEFORE TRUSTING BLOCK 4a ON THE FREE TIER UNDER v2.
//
// 4a's `has no divergence on the free tier under fees-v2-plus-payments` PASSES
// BY MUTUAL ZERO, not by rate agreement. `depositPathFee` reports a refusal as
// 0 (see its docstring) and `schedulePathFee` returns `totalMinor`, which is
// also 0 because `feeMinorUnits` computes 0 from a null rate. Both sides are 0
// for different reasons and the divergence list is empty. Agreeing at zero is
// not agreeing.
//
// That is deliberate, because it is the only footing on which the two sources
// are comparable under v2 at all, but it means the free/v2 row of 4a carries
// almost no information on its own. The load is carried by the refusal test at
// the end of 4a, which asserts on the QUOTE OBJECT rather than the number, and
// which now covers BOTH wrappers over the engine. `resolveOrderFee` was added
// to it after it was caught returning `applicationFeeMinor: 0` with an ignored
// `appointmentLaneAvailable: false` on exactly this case, while its sibling
// refused: one engine, two wrappers, opposite answers, and the mutual-zero row
// above green throughout.
//
// The golden literals are untouched by all of this. Block 3 gained `.ok &&`
// narrowing on two assertions because `resolveOrderFee` now returns a
// discriminated result; the expected values are the same objects they were.

const getAccountOverrides = vi.fn();
const effectivePlanTier = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/entitlements", () => ({
  effectivePlanTier: (...a: unknown[]) => effectivePlanTier(...a),
}));

import {
  appointmentApplicationFee,
  resolveOrderFee,
} from "@/lib/server/order-fee-sync";
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
 * THE LIVE FUNCTION, imported rather than reimplemented, so this cannot drift
 * from what bookings.ts charges. Before A3 that was `platformFeeCents(cents)`;
 * it is now `appointmentApplicationFee`, which is the one implementation both
 * the deposit path and the payment-request path call.
 *
 * A REFUSAL IS REPORTED AS 0 rather than thrown, because that is what the
 * amount collected on that lane is: under v2 a Free artist has no appointment
 * rate, the deposit path refuses the collection outright, and no
 * `application_fee_amount` is set on anything. Reporting it as 0 is what lets
 * 4a compare the two sources under v2 on the same footing, since the schedule
 * reports the same absence the same way (`feeMinorUnits` returns 0 for a null
 * rate). The DIFFERENCE between "no rate" and "a 0 rate" is asserted where it
 * matters, on the quote object itself, in the refusal test at the end of 4a.
 */
function depositPathFee(
  cents: number,
  sponsored = false,
  tier: "free" | "plus" = "plus",
  version: string = FEE_SCHEDULE_V1.version,
): number {
  const quote = appointmentApplicationFee({
    appointmentBaseMinor: cents,
    goodsBaseMinor: 0,
    tier,
    sponsored,
    version,
  });
  return quote.ok ? quote.applicationFeeMinor : 0;
}

/**
 * What the ARTIST is shown before they request a deposit.
 *
 * Still `platformFeeCents`, which after A3 is a display helper and no longer
 * the source of any charge. Pinned to the same golden literals as the charge,
 * because the number quoted to the artist and the number deducted from them
 * being the same is a promise, and the refactor that separated them is exactly
 * the one that could break it without anything else noticing.
 */
function artistFacingFee(cents: number): number {
  return platformFeeCents(cents);
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
      // Both tiers, which the name always claimed and the pre-A3 helper could
      // not express: `platformFeeCents(cents)` took no tier, so "for every
      // tier" was true by the argument list rather than by assertion. The
      // unified path takes one, so the claim is now checked.
      for (const tier of ["free", "plus"] as const) {
        const live = depositPathFee(row.cents, false, tier);
        if (live !== row.v1Fee) {
          moved.push(
            `${row.cents} minor, ${tier}: pinned ${row.v1Fee}, now ${live}`,
          );
        }
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

  // ADDED WHEN A3 RE-POINTED `depositPathFee`. Before the unification the
  // golden table pinned `platformFeeCents` directly, because that WAS the
  // charge. It is now only the artist-facing display number, and the two
  // drifting apart would show an artist a 3% deduction while charging them
  // something else. Same 21 literals, so this costs nothing and keeps the pin.
  it("the artist-facing display fee still matches the charged fee, to the cent", () => {
    const drifted: string[] = [];
    for (const row of GOLDEN) {
      const shown = artistFacingFee(row.cents);
      if (shown !== row.v1Fee) {
        drifted.push(`${row.cents} minor: pinned ${row.v1Fee}, shown ${shown}`);
      }
      if (shown !== depositPathFee(row.cents)) {
        drifted.push(
          `${row.cents} minor: shown ${shown}, charged ${depositPathFee(row.cents)}`,
        );
      }
    }
    expect(drifted).toEqual([]);
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
        // `.ok &&` because the re-prepare returns a discriminated result; a
        // refusal here would report as `false` and be listed, which is right:
        // under the active schedule it must never refuse.
        if ((resolved.ok && resolved.applicationFeeMinor) !== row.v1Fee) {
          disagreed.push(
            `${row.cents} minor, ${tier}: deposit path ${row.v1Fee}, re-prepare ${resolved.ok ? resolved.applicationFeeMinor : resolved.reason}`,
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
      // A waived fee is 0 with the lane still AVAILABLE, so `ok` stays true
      // and this reads the number. A refusal would report as `false` here.
      expect(resolved.ok && resolved.applicationFeeMinor).toBe(
        depositPathFee(row.cents, true),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Parameterized over v1 AND v2. Block 4b, the pre-registered tripwire, was
//    DELETED when A3 emptied it: see the header. Its handover is discharged here.

/** Every golden amount where the two sources disagree under `version`. */
function divergenceUnder(version: string, tier: "free" | "plus"): string[] {
  const out: string[] = [];
  for (const row of GOLDEN) {
    const live = depositPathFee(row.cents, false, tier, version);
    const viaSchedule = schedulePathFee(row.cents, tier, version);
    if (live !== viaSchedule) {
      out.push(`${row.cents}: deposit ${live} vs schedule ${viaSchedule}`);
    }
  }
  return out;
}

describe("4a. the two sources agree, under v1 AND under the approved v2", () => {
  // v2 WAS ADDED HERE WHEN A3 LANDED, which is step 2 of the handover block 4b
  // carried. Deleting 4b without this would have removed the only assertion
  // that says anything about v2 and left the Stage 4 flip unguarded, which is
  // the state this file exists to end. Parameterized rather than duplicated so
  // a v3 is one entry.
  const VERSIONS = [FEE_SCHEDULE_V1, FEE_SCHEDULE_V2] as const;

  for (const schedule of VERSIONS) {
    for (const tier of ["free", "plus"] as const) {
      it(`has no divergence on the ${tier} tier under ${schedule.version}`, () => {
        expect(divergenceUnder(schedule.version, tier)).toEqual([]);
      });
    }
  }

  // The concrete unification target, kept verbatim from the tripwire that
  // demanded it: a 200.00 collection costs a Plus artist 1.00 under v2, and now
  // BOTH sources say so. Before A3 the deposit path said 600 here.
  it("a 200.00 collection costs a Plus artist 1.00 under v2, on both paths", () => {
    expect(schedulePathFee(20000, "plus", FEE_SCHEDULE_V2.version)).toBe(100);
    expect(depositPathFee(20000, false, "plus", FEE_SCHEDULE_V2.version)).toBe(
      100,
    );
  });

  /**
   * `resolveOrderFee` with the ACTIVE schedule swapped for `version`.
   *
   * It takes no version argument and should not: it re-prepares a LIVE intent,
   * so it prices at whatever is active. Making v2 active for one import is
   * therefore the only way to execute what P7's flip will ask of it.
   * `computeOrderFees` defaults `version` to the active schedule, so filling
   * that default is precisely the edit P7 makes, seen from this call. The
   * statically imported bindings the rest of this file uses are untouched.
   */
  async function resolveOrderFeeUnder(version: string, tier: "free" | "plus") {
    vi.resetModules();
    vi.doMock("@inklee/shared/order-fees", async () => {
      const real = await vi.importActual<
        typeof import("@inklee/shared/order-fees")
      >("@inklee/shared/order-fees");
      return {
        ...real,
        computeOrderFees: (i: Parameters<typeof real.computeOrderFees>[0]) =>
          real.computeOrderFees({ ...i, version: i.version ?? version }),
      };
    });
    try {
      const mod = await import("@/lib/server/order-fee-sync");
      effectivePlanTier.mockReturnValue(tier);
      return await mod.resolveOrderFee({
        artistId: "artist-1",
        depositMinor: 20000,
        goodsBaseMinor: 0,
        intent: { metadata: {}, application_fee_amount: 600 } as never,
      });
    } finally {
      vi.doUnmock("@inklee/shared/order-fees");
      vi.resetModules();
    }
  }

  // AGREEING AT 0 IS NOT THE SAME AS AGREEING ON A RATE, and this is the test
  // that keeps the unification from having been satisfied the cheap way. Under
  // v2 `appointmentPayment.free` is null, "cannot transact this lane", and both
  // sources report the ARITHMETIC as 0. A unified path that read that 0 as a
  // Free card rate would pass every assertion above while letting a Free artist
  // collect a card payment at no take. So the refusal is asserted on the quote
  // object rather than on the number.
  //
  // BOTH WRAPPERS, because holding one of them to this while the other returns
  // a number is the same split A3 closed, one level up. `resolveOrderFee`
  // failed this when it was added: it answered the identical case with
  // `applicationFeeMinor: 0` and a flag no caller read.
  it("v2 REFUSES the free tier rather than pricing it at zero", async () => {
    expect(FEE_SCHEDULE_V2.rates.appointmentPayment.free).toBeNull();

    const refused = appointmentApplicationFee({
      appointmentBaseMinor: 20000,
      goodsBaseMinor: 0,
      tier: "free",
      version: FEE_SCHEDULE_V2.version,
    });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toBe(
      "appointment_lane_unavailable",
    );

    // Same tier, same amount, the ACTIVE schedule: allowed, at the live 3%.
    // Free is refused because v2 has no rate for it, not because it is Free.
    const allowed = appointmentApplicationFee({
      appointmentBaseMinor: 20000,
      goodsBaseMinor: 0,
      tier: "free",
      version: FEE_SCHEDULE_V1.version,
    });
    expect(allowed.ok).toBe(true);
    expect(allowed.ok && allowed.applicationFeeMinor).toBe(600);

    // THE SECOND WRAPPER, held to the same standard. Same tier, same amount,
    // same schedule, through the basket re-prepare instead of the deposit
    // path.
    const reprepare = await resolveOrderFeeUnder(
      FEE_SCHEDULE_V2.version,
      "free",
    );
    expect(reprepare.ok).toBe(false);
    expect(reprepare.ok === false && reprepare.reason).toBe(
      "appointment_lane_unavailable",
    );

    // The positive control, without which "refuses" could mean "refuses
    // everything under v2": a Plus artist is priced, at the v2 rate, and 100
    // is not what v1 would have said (600).
    const priced = await resolveOrderFeeUnder(FEE_SCHEDULE_V2.version, "plus");
    expect(priced.ok).toBe(true);
    expect(priced.ok && priced.applicationFeeMinor).toBe(100);
  });

  // What 4b's third test asserted, inverted. It said "the deposit path takes no
  // version and no tier, which is the whole defect": `platformFeeCents(cents)`
  // has one argument, so no call site could have passed either. That is now
  // false in the good direction, and it is checked BEHAVIOURALLY rather than by
  // counting parameters, because an argument a function ignores is the same
  // defect wearing a longer signature.
  it("the unified path actually reads the tier and the version it is given", () => {
    const plusV2 = depositPathFee(
      20000,
      false,
      "plus",
      FEE_SCHEDULE_V2.version,
    );
    const plusV1 = depositPathFee(
      20000,
      false,
      "plus",
      FEE_SCHEDULE_V1.version,
    );
    const freeV2 = depositPathFee(
      20000,
      false,
      "free",
      FEE_SCHEDULE_V2.version,
    );
    // The version moves the answer.
    expect(plusV2).not.toBe(plusV1);
    // The tier moves the answer.
    expect(freeV2).not.toBe(plusV2);
    // And the hardcode is still not the v2 rate, so nothing has quietly
    // reconciled the two by moving PLATFORM_FEE_BPS.
    expect(PLATFORM_FEE_BPS).not.toBe(
      FEE_SCHEDULE_V2.rates.appointmentPayment.plus,
    );
    expect(platformFeeCents.length).toBe(1);
  });
});
