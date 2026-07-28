import { describe, it, expect } from "vitest";
import {
  normalizeDiscountCode,
  validateDiscountCode,
  evaluateDiscount,
  clientRejectionMessage,
  discountLabel,
  DISCOUNT_REJECTION_LABELS,
  type DiscountCode,
} from "@inklee/shared/discounts";

const code = (over: Partial<DiscountCode> = {}): DiscountCode => ({
  id: "d1",
  code: "SUMMER25",
  kind: "percent",
  value: 1000, // 10%
  currency: "eur",
  minSubtotalMinor: 0,
  maxRedemptions: null,
  startsAt: null,
  endsAt: null,
  active: true,
  ...over,
});

const NOW = Date.parse("2026-07-15T12:00:00Z");
const evalWith = (over: Partial<Parameters<typeof evaluateDiscount>[0]> = {}) =>
  evaluateDiscount({
    code: code(),
    subtotalMinor: 10000,
    currency: "eur",
    nowMs: NOW,
    redemptionsUsed: 0,
    ...over,
  });

describe("normalizeDiscountCode", () => {
  it("uppercases and strips the spaces people paste in", () => {
    expect(normalizeDiscountCode("  sum mer25 ")).toBe("SUMMER25");
  });
  it("returns empty for non-strings", () => {
    expect(normalizeDiscountCode(null)).toBe("");
    expect(normalizeDiscountCode(42)).toBe("");
  });
});

describe("validateDiscountCode", () => {
  it("accepts letters and digits", () => {
    expect(validateDiscountCode("SUMMER25")).toBeNull();
  });
  it("rejects punctuation, which nobody wants to retype off a story", () => {
    expect(validateDiscountCode("SUMMER-25")).toBeTruthy();
    expect(validateDiscountCode("SUM MER")).toBeTruthy();
  });
  it("rejects too short and too long", () => {
    expect(validateDiscountCode("AB")).toBeTruthy();
    expect(validateDiscountCode("A".repeat(25))).toBeTruthy();
  });
});

describe("evaluateDiscount", () => {
  it("takes a percentage off", () => {
    expect(evalWith()).toEqual({ ok: true, discountMinor: 1000 });
  });

  it("takes a fixed amount off", () => {
    expect(evalWith({ code: code({ kind: "fixed", value: 500 }) })).toEqual({
      ok: true,
      discountMinor: 500,
    });
  });

  // A EUR 50 code on a EUR 30 basket takes off 30, not 50. The alternative is
  // a negative subtotal, which becomes a negative payable amount and a
  // negative fee base, which Stripe rejects outright.
  it("never exceeds the goods subtotal", () => {
    expect(
      evalWith({
        code: code({ kind: "fixed", value: 5000 }),
        subtotalMinor: 3000,
      }),
    ).toEqual({ ok: true, discountMinor: 3000 });
  });

  it("rejects an unknown code", () => {
    expect(evalWith({ code: null })).toEqual({ ok: false, reason: "unknown" });
  });

  it("rejects a switched-off code", () => {
    expect(evalWith({ code: code({ active: false }) })).toMatchObject({
      reason: "inactive",
    });
  });

  it("respects the start and end window", () => {
    expect(
      evalWith({ code: code({ startsAt: "2026-08-01T00:00:00Z" }) }),
    ).toMatchObject({ reason: "not_started" });
    expect(
      evalWith({ code: code({ endsAt: "2026-07-01T00:00:00Z" }) }),
    ).toMatchObject({ reason: "expired" });
  });

  it("treats the end instant as already expired", () => {
    expect(
      evalWith({
        code: code({ endsAt: "2026-07-15T12:00:00Z" }),
      }),
    ).toMatchObject({ reason: "expired" });
  });

  it("rejects once the redemption cap is reached", () => {
    expect(
      evalWith({ code: code({ maxRedemptions: 5 }), redemptionsUsed: 5 }),
    ).toMatchObject({ reason: "used_up" });
    expect(
      evalWith({ code: code({ maxRedemptions: 5 }), redemptionsUsed: 4 }),
    ).toMatchObject({ ok: true });
  });

  it("rejects below the minimum order", () => {
    expect(
      evalWith({
        code: code({ minSubtotalMinor: 5000 }),
        subtotalMinor: 4999,
      }),
    ).toMatchObject({ reason: "below_minimum" });
  });

  // A EUR code against a CZK basket has no meaningful conversion, and guessing
  // one would silently change the amount taken off.
  it("rejects a currency mismatch rather than converting", () => {
    expect(evalWith({ currency: "czk" })).toMatchObject({
      reason: "currency_mismatch",
    });
  });

  it("is case-insensitive about currency", () => {
    expect(evalWith({ currency: "EUR" })).toMatchObject({ ok: true });
  });

  it("returns zero rather than an error on an empty basket", () => {
    expect(evalWith({ subtotalMinor: 0 })).toEqual({
      ok: true,
      discountMinor: 0,
    });
  });

  it("handles a nonsense subtotal without producing a negative discount", () => {
    for (const subtotalMinor of [-100, NaN]) {
      const r = evalWith({ subtotalMinor });
      expect(r.ok && r.discountMinor >= 0).toBe(true);
    }
  });
});

describe("what the client is told", () => {
  // Distinguishing expired from used-up from switched-off tells someone
  // probing codes which strings are real.
  it("collapses every existence-revealing reason into one message", () => {
    const messages = new Set(
      (
        [
          "unknown",
          "inactive",
          "not_started",
          "expired",
          "used_up",
          "currency_mismatch",
        ] as const
      ).map(clientRejectionMessage),
    );
    expect(messages.size).toBe(1);
  });

  it("keeps the minimum separate, because it is the one they can act on", () => {
    expect(clientRejectionMessage("below_minimum")).not.toBe(
      clientRejectionMessage("expired"),
    );
    expect(clientRejectionMessage("below_minimum")).toContain("minimum");
  });

  it("gives the artist the specific reason instead", () => {
    expect(DISCOUNT_REJECTION_LABELS.used_up).toContain("maximum");
    expect(DISCOUNT_REJECTION_LABELS.expired).toContain("expired");
  });

  it("keeps every message free of em-dashes (founder copy rule)", () => {
    for (const m of Object.values(DISCOUNT_REJECTION_LABELS)) {
      expect(m).not.toContain("—");
    }
  });
});

describe("discountLabel", () => {
  const eur = (m: number) => `€${(m / 100).toFixed(2)}`;
  it("reads percentages back as humans wrote them", () => {
    expect(discountLabel({ kind: "percent", value: 1000 }, eur)).toBe(
      "10% off",
    );
    expect(discountLabel({ kind: "percent", value: 1250 }, eur)).toBe(
      "12.5% off",
    );
  });
  it("formats a fixed amount through the caller's formatter", () => {
    expect(discountLabel({ kind: "fixed", value: 500 }, eur)).toBe("€5.00 off");
  });
});
