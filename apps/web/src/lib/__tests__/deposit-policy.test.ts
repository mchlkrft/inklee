import { describe, it, expect } from "vitest";
import {
  DEPOSIT_POLICY_DEFAULT,
  parseDepositPolicy,
  isDraftDefaultPolicy,
  depositPolicyLines,
  renderDepositPolicyText,
  formatPolicyWindow,
  type DepositPolicy,
} from "../deposit-policy";

describe("parseDepositPolicy", () => {
  it("returns the conservative draft default for empty/invalid input", () => {
    expect(parseDepositPolicy(null)).toEqual(DEPOSIT_POLICY_DEFAULT);
    expect(parseDepositPolicy("nope")).toEqual(DEPOSIT_POLICY_DEFAULT);
    expect(parseDepositPolicy({})).toEqual(DEPOSIT_POLICY_DEFAULT);
  });

  it("clamps the refund window and rejects out-of-list forfeit %", () => {
    const p = parseDepositPolicy({
      refundWindow: { value: 9999, unit: "days" },
      lateCancelForfeitPct: 33, // not in {25,50,100}
    });
    expect(p.refundWindow.value).toBe(365); // clamped to max days
    expect(p.lateCancelForfeitPct).toBe(50); // falls back to default
  });

  it("accepts a valid custom policy incl. last-minute window", () => {
    const p = parseDepositPolicy({
      refundWindow: { value: 48, unit: "hours" },
      lateCancelForfeitPct: 100,
      lastMinute: { value: 12, unit: "hours" },
    });
    expect(p).toEqual({
      refundWindow: { value: 48, unit: "hours" },
      lateCancelForfeitPct: 100,
      lastMinute: { value: 12, unit: "hours" },
    });
  });
});

describe("isDraftDefaultPolicy", () => {
  it("is true only for the untouched default", () => {
    expect(isDraftDefaultPolicy(DEPOSIT_POLICY_DEFAULT)).toBe(true);
    expect(
      isDraftDefaultPolicy({
        ...DEPOSIT_POLICY_DEFAULT,
        lateCancelForfeitPct: 25,
      }),
    ).toBe(false);
  });
});

describe("formatPolicyWindow", () => {
  it("singularises units", () => {
    expect(formatPolicyWindow({ value: 1, unit: "days" })).toBe("1 day");
    expect(formatPolicyWindow({ value: 7, unit: "days" })).toBe("7 days");
    expect(formatPolicyWindow({ value: 1, unit: "hours" })).toBe("1 hour");
  });
});

describe("depositPolicyLines", () => {
  it("always states reciprocity, no-surcharge, and cooling-off", () => {
    const text = renderDepositPolicyText(DEPOSIT_POLICY_DEFAULT);
    expect(text).toContain(
      "If the artist cancels, your full deposit is returned.",
    );
    expect(text).toContain("You pay exactly the deposit amount.");
    expect(text).toContain("14-day right of withdrawal");
  });

  it("renders a partial forfeit vs full forfeit correctly", () => {
    const partial: DepositPolicy = {
      refundWindow: { value: 7, unit: "days" },
      lateCancelForfeitPct: 50,
      lastMinute: null,
    };
    expect(depositPolicyLines(partial)).toContain(
      "If you cancel after that, 50% of the deposit is kept.",
    );

    const full: DepositPolicy = { ...partial, lateCancelForfeitPct: 100 };
    expect(depositPolicyLines(full)).toContain(
      "If you cancel after that, the full deposit is kept.",
    );
  });

  it("includes the last-minute line only when set", () => {
    const withLm: DepositPolicy = {
      refundWindow: { value: 7, unit: "days" },
      lateCancelForfeitPct: 50,
      lastMinute: { value: 24, unit: "hours" },
    };
    expect(
      depositPolicyLines(withLm).some((l) => l.includes("within 24 hours")),
    ).toBe(true);
  });
});
