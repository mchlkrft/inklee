import { describe, it, expect } from "vitest";
import {
  CONNECT_FEE_PAYER_IS_APPLICATION,
  STRIPE_PROCESSING_RATE_REFERENCE_BPS,
  feeRateCoversProcessingCost,
  noSeparateCardProcessingFeesClaimVisible,
} from "@inklee/shared/platform-fee";

// A7 (docs/legal/counsel-accountant-handoff-2026-08.md PART 4): "no separate
// card-processing fees" binds to WHO PAYS STRIPE, not to the deposit rate.
//
// D6 (docs/legal/counsel-handoff-2026-08-02.md §5.1, corrected 2026-08-03):
// the A7 build made the founder's subsidy approval a second REQUIRED condition
// at every rate, which suppressed the claim everywhere and so withdrew a true,
// live claim from the 3% cohort. Counsel: "re-scope, don't withdraw." The
// binding is now one AND over an OR:
//
//   payerIsApplication AND (rate covers cost OR founder approved the subsidy)
//
// The two cohorts counsel named:
const THREE_PERCENT_BPS = 300; // margin: Stripe's ~1.5% + 0.25 is covered
const PLUS_SUBSIDY_BPS = 50; // subsidy: the fee is below Stripe's own cost

describe("feeRateCoversProcessingCost", () => {
  it("is true for the 3% cohort and false for the 0.5% cohort", () => {
    expect(feeRateCoversProcessingCost(THREE_PERCENT_BPS)).toBe(true);
    expect(feeRateCoversProcessingCost(PLUS_SUBSIDY_BPS)).toBe(false);
  });

  it("does not cover cost at exactly Stripe's own variable rate", () => {
    // Strictly greater, not >=: at parity on the variable component the fixed
    // ~0.25 per charge is still unrecovered, so the rate is not covering cost.
    expect(
      feeRateCoversProcessingCost(STRIPE_PROCESSING_RATE_REFERENCE_BPS),
    ).toBe(false);
    expect(
      feeRateCoversProcessingCost(STRIPE_PROCESSING_RATE_REFERENCE_BPS + 1),
    ).toBe(true);
  });

  it("treats an absent rate as covering nothing", () => {
    // `null` is the v2 Free tier, which cannot transact the appointment lane
    // at all (fee-schedule.ts: presence, not magnitude). An absent rate is not
    // a covering rate.
    expect(feeRateCoversProcessingCost(null)).toBe(false);
    expect(feeRateCoversProcessingCost(Number.NaN)).toBe(false);
  });
});

describe("noSeparateCardProcessingFeesClaimVisible", () => {
  // ---------------------------------------------------------------------
  // The four-way matrix: payer yes/no x each cohort, with and without the
  // founder's approval row.
  // ---------------------------------------------------------------------

  describe("payer is the application (every account this codebase creates)", () => {
    it("3% cohort WITHOUT an approval row: VISIBLE — this is the claim D6 restored", () => {
      // The regression D6 was raised about. This case rendered nothing after
      // the A7 build and is live in production today; the accountant called it
      // a straightforward margin and plainly true.
      expect(
        noSeparateCardProcessingFeesClaimVisible({
          payerIsApplication: true,
          feeBps: THREE_PERCENT_BPS,
          founderApprovedSubsidyClaim: false,
        }),
      ).toBe(true);
    });

    it("3% cohort WITH an approval row: visible (the approval is not needed, and does not hurt)", () => {
      expect(
        noSeparateCardProcessingFeesClaimVisible({
          payerIsApplication: true,
          feeBps: THREE_PERCENT_BPS,
          founderApprovedSubsidyClaim: true,
        }),
      ).toBe(true);
    });

    it("0.5% cohort WITHOUT an approval row: SUPPRESSED — the case the condition exists for", () => {
      // THE DISTINCTION TEST. A re-scope that also let this case through would
      // pass every other assertion in this file while destroying the only
      // thing the accountant actually asked to be gated: absorbing Stripe's
      // cost at a rate below that cost is a subsidy, and the founder must
      // record it as intended policy before it may be advertised.
      expect(
        noSeparateCardProcessingFeesClaimVisible({
          payerIsApplication: true,
          feeBps: PLUS_SUBSIDY_BPS,
          founderApprovedSubsidyClaim: false,
        }),
      ).toBe(false);
    });

    it("0.5% cohort WITH an approval row: visible (the founder's flip is the switch)", () => {
      expect(
        noSeparateCardProcessingFeesClaimVisible({
          payerIsApplication: true,
          feeBps: PLUS_SUBSIDY_BPS,
          founderApprovedSubsidyClaim: true,
        }),
      ).toBe(true);
    });
  });

  describe("payer is NOT the application (a hypothetical future model change)", () => {
    // An unconditional veto: if the artist's own account ever bore Stripe's
    // cost, the sentence is false and neither a covering rate nor a founder
    // row may resurrect it.
    it.each([
      ["3% cohort, no approval", THREE_PERCENT_BPS, false],
      ["3% cohort, approved", THREE_PERCENT_BPS, true],
      ["0.5% cohort, no approval", PLUS_SUBSIDY_BPS, false],
      ["0.5% cohort, approved", PLUS_SUBSIDY_BPS, true],
    ] as const)("hidden: %s", (_label, feeBps, founderApprovedSubsidyClaim) => {
      expect(
        noSeparateCardProcessingFeesClaimVisible({
          payerIsApplication: false,
          feeBps,
          founderApprovedSubsidyClaim,
        }),
      ).toBe(false);
    });
  });

  it("a tier that cannot transact the lane at all gets nothing without an approval", () => {
    expect(
      noSeparateCardProcessingFeesClaimVisible({
        payerIsApplication: true,
        feeBps: null,
        founderApprovedSubsidyClaim: false,
      }),
    ).toBe(false);
  });

  it("today's actual wiring (v1 = 300 bps every tier, no approval row) SHOWS the claim", () => {
    // The real call shape. Under the active v1 schedule every tier is 300 bps,
    // so the claim renders for every artist without any approval row existing
    // — which is exactly the production behaviour D6 said must be preserved.
    expect(
      noSeparateCardProcessingFeesClaimVisible({
        payerIsApplication: CONNECT_FEE_PAYER_IS_APPLICATION,
        feeBps: THREE_PERCENT_BPS,
        founderApprovedSubsidyClaim: false,
      }),
    ).toBe(true);
  });
});
