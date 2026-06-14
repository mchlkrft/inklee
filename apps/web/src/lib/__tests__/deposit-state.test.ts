import { describe, it, expect } from "vitest";
import { isDepositRefunded, depositState } from "../deposit-state";

const PAID_CARD = {
  deposit_amount: 200,
  deposit_currency: "eur",
  deposit_due_at: null,
  deposit_paid_at: "2026-06-01T00:00:00Z",
  deposit_payment_intent_id: "pi_123",
};

const NOW = Date.UTC(2026, 5, 14); // 2026-06-14

describe("isDepositRefunded", () => {
  it("is true only for a paid card deposit with a refund row", () => {
    expect(isDepositRefunded(PAID_CARD, true)).toBe(true);
  });

  it("is false without a refund audit row", () => {
    expect(isDepositRefunded(PAID_CARD, false)).toBe(false);
  });

  it("never marks a manual (no-intent) deposit refunded, even with a stray row", () => {
    expect(
      isDepositRefunded(
        {
          deposit_payment_intent_id: null,
          deposit_paid_at: "2026-06-01T00:00:00Z",
        },
        true,
      ),
    ).toBe(false);
  });

  it("never marks an unpaid deposit refunded", () => {
    expect(
      isDepositRefunded(
        { deposit_payment_intent_id: "pi_123", deposit_paid_at: null },
        true,
      ),
    ).toBe(false);
  });
});

describe("depositState", () => {
  it("refunded wins over paid", () => {
    expect(depositState(PAID_CARD, true, NOW)).toBe("refunded");
  });

  it("paid when there's a paid timestamp and no refund", () => {
    expect(depositState(PAID_CARD, false, NOW)).toBe("paid");
  });

  it("overdue when unpaid and the due date has passed", () => {
    expect(
      depositState(
        {
          ...PAID_CARD,
          deposit_paid_at: null,
          deposit_payment_intent_id: null,
          deposit_due_at: "2026-06-01",
        },
        false,
        NOW,
      ),
    ).toBe("overdue");
  });

  it("awaiting when unpaid and not yet due", () => {
    expect(
      depositState(
        {
          ...PAID_CARD,
          deposit_paid_at: null,
          deposit_payment_intent_id: null,
          deposit_due_at: "2026-12-31",
        },
        false,
        NOW,
      ),
    ).toBe("awaiting");
  });

  it("awaiting when unpaid with no due date", () => {
    expect(
      depositState(
        {
          ...PAID_CARD,
          deposit_paid_at: null,
          deposit_payment_intent_id: null,
          deposit_due_at: null,
        },
        false,
        NOW,
      ),
    ).toBe("awaiting");
  });
});
