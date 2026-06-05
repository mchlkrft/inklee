import { describe, it, expect } from "vitest";
import {
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_PERCENT,
  platformFeeCents,
  platformFeeEur,
  artistNetEur,
} from "../platform-fee";

describe("platform fee constants", () => {
  it("is 3% (300 bps)", () => {
    expect(PLATFORM_FEE_BPS).toBe(300);
    expect(PLATFORM_FEE_PERCENT).toBe(3);
  });
});

describe("platformFeeCents", () => {
  it("takes 3% of the deposit, rounded to the nearest cent", () => {
    expect(platformFeeCents(20000)).toBe(600); // €200 -> €6.00
    expect(platformFeeCents(10000)).toBe(300); // €100 -> €3.00
    expect(platformFeeCents(100)).toBe(3); // €1 -> €0.03
  });

  it("rounds half-cent fees to the nearest integer cent", () => {
    // €50.17 -> 5017 cents * 0.03 = 150.51 -> 151
    expect(platformFeeCents(5017)).toBe(151);
    // €0.50 -> 50 * 0.03 = 1.5 -> 2 (round half up)
    expect(platformFeeCents(50)).toBe(2);
  });

  it("stays strictly below the charge amount (Stripe requirement)", () => {
    for (const cents of [100, 333, 5017, 20000, 999999]) {
      expect(platformFeeCents(cents)).toBeLessThan(cents);
      expect(platformFeeCents(cents)).toBeGreaterThan(0);
    }
  });

  it("returns 0 for non-positive / invalid input", () => {
    expect(platformFeeCents(0)).toBe(0);
    expect(platformFeeCents(-100)).toBe(0);
    expect(platformFeeCents(Number.NaN)).toBe(0);
  });
});

// Under Custom Connect the Stripe `application_fee_amount` IS the full 3%
// (= platformFeeCents) — Stripe bills its processing fee to Inklee's platform
// balance separately, so there is no longer a reduced "absorb" amount. The
// platformFeeCents "stays strictly below the charge amount" test above is what
// guards the Stripe `application_fee_amount < charge` requirement.

describe("platformFeeEur + artistNetEur", () => {
  it("fee + net reconstruct the deposit exactly", () => {
    for (const eur of [1, 50, 100, 200, 49.99, 123.45]) {
      const fee = platformFeeEur(eur);
      const net = artistNetEur(eur);
      expect(Math.round((fee + net) * 100)).toBe(Math.round(eur * 100));
    }
  });

  it("computes the artist net after the fee", () => {
    expect(platformFeeEur(200)).toBeCloseTo(6, 5);
    expect(artistNetEur(200)).toBeCloseTo(194, 5);
  });

  it("returns 0 for non-positive input", () => {
    expect(platformFeeEur(0)).toBe(0);
    expect(artistNetEur(0)).toBe(0);
    expect(artistNetEur(-5)).toBe(0);
  });
});
