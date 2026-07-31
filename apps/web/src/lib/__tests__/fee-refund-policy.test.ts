import { describe, it, expect } from "vitest";
import {
  FEE_REFUND_CASES,
  FEE_REFUND_POLICY_V0,
  FEE_REFUND_POLICY_V1,
  ACTIVE_FEE_REFUND_POLICY_VERSION,
  feeRefundPolicyFor,
  feeRefundOutcome,
  resolveActiveFeeRefundPolicyVersion,
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

  it("partitions the fee: retainMinor + returnMinor equals the fee touched", () => {
    // Invariant for every computable treatment.
    const full = feeRefundOutcome({
      case: "voluntary_full",
      feeChargedMinor: 450,
      paymentMinor: 20000,
      refundedMinor: 20000,
    });
    expect((full.retainMinor ?? 0) + (full.returnMinor ?? 0)).toBe(450);
  });
});

// PAY-RFD-002 remediation: the v1 retain_non_recoverable math. The retained
// amount must be the ACTUAL processor cost supplied, never the whole fee and
// never a percentage. All exercised on the approved (v1) policy.
describe("feeRefundOutcome retain_non_recoverable (v1)", () => {
  const V1 = FEE_REFUND_POLICY_V1.version;
  const base = {
    case: "artist_cancellation" as const,
    feeChargedMinor: 450,
    paymentMinor: 20000,
    version: V1,
  };

  it("retains ONLY the actual non-recoverable cost and returns the margin", () => {
    const r = feeRefundOutcome({
      ...base,
      refundedMinor: 20000,
      nonRecoverableCostMinor: 200,
    });
    expect(r.treatment).toBe("retain_non_recoverable");
    expect(r.retainMinor).toBe(200); // the real Stripe cost, not 450
    expect(r.returnMinor).toBe(250); // the margin is returned, not retained
  });

  it("retains zero when the processor cost is zero", () => {
    const r = feeRefundOutcome({
      ...base,
      refundedMinor: 20000,
      nonRecoverableCostMinor: 0,
    });
    expect(r.retainMinor).toBe(0);
    expect(r.returnMinor).toBe(450);
  });

  it("never retains more than the application fee when cost exceeds it", () => {
    const r = feeRefundOutcome({
      ...base,
      refundedMinor: 20000,
      nonRecoverableCostMinor: 900, // exceeds the 450 fee
    });
    expect(r.retainMinor).toBe(450); // capped at the fee, never above
    expect(r.returnMinor).toBe(0);
  });

  it("allocates retained cost proportionally on a partial refund", () => {
    const r = feeRefundOutcome({
      ...base,
      refundedMinor: 10000, // half the 20000 payment
      nonRecoverableCostMinor: 200,
    });
    // feeShare = 225; costShare = 100; retain 100, return 125.
    expect(r.retainMinor).toBe(100);
    expect(r.returnMinor).toBe(125);
  });

  it("does not retain the same cost twice across repeated refunds", () => {
    const second = feeRefundOutcome({
      ...base,
      refundedMinor: 10000, // the second half
      nonRecoverableCostMinor: 200,
      alreadyRetainedMinor: 100, // the first half already retained
    });
    expect(second.retainMinor).toBe(100); // brings cumulative to 200 = cost
    const third = feeRefundOutcome({
      ...base,
      refundedMinor: 10000,
      nonRecoverableCostMinor: 200,
      alreadyRetainedMinor: 200, // the whole cost is already retained
    });
    expect(third.retainMinor).toBe(0); // nothing left to retain
    expect(third.returnMinor).toBe(225); // the whole fee share is returned
  });

  it("is NOT computable (both null) when the processor cost is unavailable", () => {
    const r = feeRefundOutcome({
      ...base,
      refundedMinor: 20000,
      // nonRecoverableCostMinor omitted -> cannot prove the cost
    });
    expect(r.returnMinor).toBeNull();
    expect(r.retainMinor).toBeNull();
  });
});

describe("resolveActiveFeeRefundPolicyVersion", () => {
  it("stays on v0 unless activation is explicitly enabled", () => {
    expect(resolveActiveFeeRefundPolicyVersion(false)).toBe(
      FEE_REFUND_POLICY_V0.version,
    );
    expect(resolveActiveFeeRefundPolicyVersion(true)).toBe(
      FEE_REFUND_POLICY_V1.version,
    );
  });
});
