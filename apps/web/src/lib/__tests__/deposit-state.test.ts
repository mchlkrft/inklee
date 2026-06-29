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
  it("refunded wins over paid, regardless of booking status", () => {
    expect(depositState(PAID_CARD, true, NOW, "cancelled")).toBe("refunded");
  });

  it("paid when there's a paid timestamp and no refund (forfeited deposit stays paid)", () => {
    // A paid deposit forfeited on a client-cancel: the artist kept the money, so
    // it must read as collected, not "cancelled".
    expect(depositState(PAID_CARD, false, NOW, "cancelled")).toBe("paid");
  });

  it("overdue when unpaid, awaiting the deposit, and the due date has passed", () => {
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
        "deposit_pending",
      ),
    ).toBe("overdue");
  });

  it("awaiting when unpaid, awaiting the deposit, and not yet due", () => {
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
        "deposit_pending",
      ),
    ).toBe("awaiting");
  });

  it("awaiting when unpaid, awaiting the deposit, with no due date", () => {
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
        "deposit_pending",
      ),
    ).toBe("awaiting");
  });

  it("cancelled (not overdue) when the client cancelled an unpaid card deposit", () => {
    // The founder bug: a past-due unpaid card deposit on a cancelled booking
    // must NOT read as overdue.
    expect(
      depositState(
        {
          ...PAID_CARD,
          deposit_paid_at: null,
          deposit_due_at: "2026-06-01",
        },
        false,
        NOW,
        "cancelled",
      ),
    ).toBe("cancelled");
  });

  it("cancelled when the artist passed an unpaid deposit booking", () => {
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
        "rejected",
      ),
    ).toBe("cancelled");
  });

  it("cancelled when the booking was approved without the deposit ever being paid", () => {
    expect(
      depositState(
        {
          ...PAID_CARD,
          deposit_paid_at: null,
          deposit_due_at: "2026-12-31",
        },
        false,
        NOW,
        "approved",
      ),
    ).toBe("cancelled");
  });
});
