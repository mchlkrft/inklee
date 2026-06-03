import { describe, it, expect } from "vitest";
import {
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_PERCENT,
  platformFeeCents,
  applicationFeeCents,
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

describe("applicationFeeCents (what Inklee keeps after absorbing Stripe)", () => {
  it("is 3% minus the standard Stripe fee (1.5% + €0.25)", () => {
    // €200: gross 600 − (300 + 25) = 275 → Inklee keeps €2.75
    expect(applicationFeeCents(20000)).toBe(275);
    // €100: gross 300 − (150 + 25) = 125 → €1.25
    expect(applicationFeeCents(10000)).toBe(125);
  });

  it("clamps to 0 on tiny deposits where Stripe's fee exceeds the whole 3%", () => {
    // €10: gross 30 − (15 + 25) = −10 → clamps to 0
    expect(applicationFeeCents(1000)).toBe(0);
    // ~break-even €16.67: gross 50 − (25 + 25) = 0
    expect(applicationFeeCents(1667)).toBe(0);
    // just above break-even €20: gross 60 − (30 + 25) = 5 → €0.05
    expect(applicationFeeCents(2000)).toBe(5);
  });

  it("on a standard card, kept fee + standard Stripe fee = the all-in 3%", () => {
    // The artist's all-in deduction (platformFeeCents) should equal what
    // Inklee keeps plus the standard Stripe fee we sized against, whenever the
    // application fee hasn't clamped.
    for (const cents of [2000, 5000, 10000, 20000, 50000]) {
      const stripeStandard = Math.round((cents * 150) / 10000) + 25;
      expect(applicationFeeCents(cents) + stripeStandard).toBe(
        platformFeeCents(cents),
      );
    }
  });

  it("never exceeds the all-in 3% and is never negative", () => {
    for (const cents of [100, 1000, 5017, 20000, 999999]) {
      expect(applicationFeeCents(cents)).toBeGreaterThanOrEqual(0);
      expect(applicationFeeCents(cents)).toBeLessThanOrEqual(
        platformFeeCents(cents),
      );
    }
  });

  it("returns 0 for non-positive / invalid input", () => {
    expect(applicationFeeCents(0)).toBe(0);
    expect(applicationFeeCents(-100)).toBe(0);
    expect(applicationFeeCents(Number.NaN)).toBe(0);
  });
});

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
