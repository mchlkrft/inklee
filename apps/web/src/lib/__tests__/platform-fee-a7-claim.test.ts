import { describe, it, expect } from "vitest";
import {
  CONNECT_FEE_PAYER_IS_APPLICATION,
  noSeparateCardProcessingFeesClaimVisible,
} from "@inklee/shared/platform-fee";

// A7 (docs/legal/counsel-accountant-handoff-2026-08.md PART 4): "no separate
// card-processing fees" binds to WHO PAYS STRIPE, not to the deposit rate.
// Both conditions are independently required — this pins both halves of that,
// so neither one alone can silently make the claim visible.

describe("noSeparateCardProcessingFeesClaimVisible", () => {
  it("visible only when BOTH the payer is the application AND the founder approved the subsidy claim", () => {
    expect(
      noSeparateCardProcessingFeesClaimVisible({
        payerIsApplication: true,
        founderApprovedSubsidyClaim: true,
      }),
    ).toBe(true);
  });

  it("hidden when the founder has not approved it, even though Inklee absorbs the processing cost", () => {
    expect(
      noSeparateCardProcessingFeesClaimVisible({
        payerIsApplication: true,
        founderApprovedSubsidyClaim: false,
      }),
    ).toBe(false);
  });

  it("hidden when the payer is not the application, even if the founder flag were somehow set", () => {
    expect(
      noSeparateCardProcessingFeesClaimVisible({
        payerIsApplication: false,
        founderApprovedSubsidyClaim: true,
      }),
    ).toBe(false);
  });

  it("hidden when neither condition holds", () => {
    expect(
      noSeparateCardProcessingFeesClaimVisible({
        payerIsApplication: false,
        founderApprovedSubsidyClaim: false,
      }),
    ).toBe(false);
  });

  it("today's actual wiring (CONNECT_FEE_PAYER_IS_APPLICATION, no approval row) suppresses the claim", () => {
    // This is the real call shape the payouts page uses: the structural
    // constant is always true, so visibility today is decided entirely by
    // the founder flag — which defaults to unset.
    expect(
      noSeparateCardProcessingFeesClaimVisible({
        payerIsApplication: CONNECT_FEE_PAYER_IS_APPLICATION,
        founderApprovedSubsidyClaim: false,
      }),
    ).toBe(false);
  });
});
