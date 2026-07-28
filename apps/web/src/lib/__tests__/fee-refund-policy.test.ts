import { describe, it, expect } from "vitest";
import {
  FEE_REFUND_CASES,
  FEE_REFUND_POLICY_V0,
  FEE_REFUND_POLICY_V1,
  ACTIVE_FEE_REFUND_POLICY_VERSION,
  feeRefundPolicyFor,
  feeRefundOutcome,
} from "@inklee/shared/fee-refund-policy";

describe("fee refund policy versions", () => {
  it("covers every confirmed case in both versions", () => {
    for (const c of FEE_REFUND_CASES) {
      expect(FEE_REFUND_POLICY_V0.cases[c], c).toBeTruthy();
      expect(FEE_REFUND_POLICY_V1.cases[c], c).toBeTruthy();
    }
  });

  it("is still on v0, so activating the approved policy stays a P7 act", () => {
    expect(ACTIVE_FEE_REFUND_POLICY_VERSION).toBe(FEE_REFUND_POLICY_V0.version);
  });

  // The delta that matters, recorded rather than assumed: today an artist
  // cancellation returns the fee in full; the approved policy retains only
  // non-recoverable costs.
  it("records the artist-cancellation delta between today and the approval", () => {
    expect(FEE_REFUND_POLICY_V0.cases.artist_cancellation).toBe("return_full");
    expect(FEE_REFUND_POLICY_V1.cases.artist_cancellation).toBe(
      "retain_non_recoverable",
    );
  });

  it("falls back to v0 for an unknown version", () => {
    expect(feeRefundPolicyFor("nope").version).toBe(
      FEE_REFUND_POLICY_V0.version,
    );
  });
});

describe("feeRefundOutcome", () => {
  const base = { feeChargedMinor: 600, paymentMinor: 20000 };

  it("returns the whole fee on a full voluntary refund", () => {
    const r = feeRefundOutcome({
      ...base,
      case: "voluntary_full",
      refundedMinor: 20000,
    });
    expect(r.returnMinor).toBe(600);
  });

  it("returns the fee in proportion to a partial refund", () => {
    const r = feeRefundOutcome({
      ...base,
      case: "voluntary_partial",
      refundedMinor: 5000, // a quarter
    });
    expect(r.returnMinor).toBe(150);
  });

  // An over-refund, or a payment amended after the fact, must never return
  // more fee than was ever taken.
  it("never returns more than the fee actually charged", () => {
    const r = feeRefundOutcome({
      ...base,
      case: "voluntary_partial",
      refundedMinor: 999999,
    });
    expect(r.returnMinor).toBe(600);
  });

  it("returns nothing for a zero or nonsense refund amount", () => {
    for (const refundedMinor of [0, -100]) {
      const r = feeRefundOutcome({
        ...base,
        case: "voluntary_partial",
        refundedMinor,
      });
      expect(r.returnMinor).toBe(0);
    }
  });

  // Null is NOT zero. Zero means "return nothing"; null means "a human has to
  // decide". Collapsing the two would quietly retain fees nobody chose to
  // retain.
  it("returns null, not zero, where the outcome is not computable", () => {
    for (const c of ["dispute", "fraud"] as const) {
      const r = feeRefundOutcome({ ...base, case: c, refundedMinor: 20000 });
      expect(r.returnMinor, c).toBeNull();
      expect(r.treatment, c).toBe("retain_where_permitted");
    }
  });

  it("marks an artist cancellation as needing a decision under the approved policy", () => {
    const r = feeRefundOutcome({
      ...base,
      case: "artist_cancellation",
      refundedMinor: 20000,
      version: FEE_REFUND_POLICY_V1.version,
    });
    expect(r.returnMinor).toBeNull();
    expect(r.treatment).toBe("retain_non_recoverable");
  });

  it("still returns it in full under the CURRENT policy", () => {
    const r = feeRefundOutcome({
      ...base,
      case: "artist_cancellation",
      refundedMinor: 20000,
    });
    expect(r.returnMinor).toBe(600);
  });

  it("returns the fee on an Inklee system error under both versions", () => {
    for (const v of [FEE_REFUND_POLICY_V0, FEE_REFUND_POLICY_V1]) {
      const r = feeRefundOutcome({
        ...base,
        case: "inklee_error",
        refundedMinor: 20000,
        version: v.version,
      });
      expect(r.returnMinor, v.version).toBe(600);
    }
  });

  it("handles a missing fee without producing a negative return", () => {
    const r = feeRefundOutcome({
      case: "voluntary_full",
      feeChargedMinor: -50,
      paymentMinor: 20000,
      refundedMinor: 20000,
    });
    expect(r.returnMinor).toBe(0);
  });
});
