import { describe, it, expect } from "vitest";
import { fallbackTier } from "@/lib/server/fee-savings-query";

// G1 (FEE-DSP-001): the fee-savings counterfactual used to flip a binary
// free/plus tier (`tier === "plus" ? "free" : "plus"`), which collapses a
// grandfathered artist's downgrade fallback to `free`. Under v2 the Free
// appointment rate is null (cannot transact the lane at all), so
// `feeMinorUnits` reports that as 0 — a legacy_free_v1 artist's real downgrade
// fallback (the historical 3%) would silently price as nothing owed. This
// pins the corrected three-way resolution directly, independent of the DB
// read the full query performs.
describe("fallbackTier", () => {
  it("a Plus artist without the grandfather falls back to free", () => {
    expect(fallbackTier("plus", false)).toBe("free");
  });

  it("a Plus artist who holds the grandfather falls back to legacy, never free", () => {
    expect(fallbackTier("plus", true)).toBe("legacy");
  });

  it("a plain Free artist's counterfactual is plus (upgrading)", () => {
    expect(fallbackTier("free", false)).toBe("plus");
  });

  it("a legacy (grandfathered Free) artist's counterfactual is plus", () => {
    // The grandfathered flag doesn't matter on this side: whatever tier they
    // hold today, the "what if" is always the other paid option.
    expect(fallbackTier("legacy", true)).toBe("plus");
    expect(fallbackTier("legacy", false)).toBe("plus");
  });
});
