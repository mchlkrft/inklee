import { describe, it, expect } from "vitest";
import {
  buildFinancialSnapshot,
  categorizeDepositBookings,
  type DepositBookingRow,
} from "@/lib/server/account-deletion-logic";

function row(over: Partial<DepositBookingRow>): DepositBookingRow {
  return {
    id: "b1",
    deposit_payment_intent_id: null,
    deposit_paid_at: null,
    deposit_amount: null,
    deposit_currency: null,
    ...over,
  };
}

describe("categorizeDepositBookings", () => {
  it("ignores bookings with no payment intent", () => {
    const rows = [row({ id: "a", deposit_payment_intent_id: null })];
    const r = categorizeDepositBookings(rows, new Set());
    expect(r.liveUnpaid).toHaveLength(0);
    expect(r.paid).toHaveLength(0);
    expect(r.paidUnresolved).toHaveLength(0);
  });

  it("classifies an intent without paid_at as live-unpaid (cancellable, not blocking)", () => {
    const rows = [row({ id: "a", deposit_payment_intent_id: "pi_1" })];
    const r = categorizeDepositBookings(rows, new Set());
    expect(r.liveUnpaid.map((x) => x.id)).toEqual(["a"]);
    expect(r.paidUnresolved).toHaveLength(0);
  });

  it("a paid + refunded deposit is paid but NOT blocking", () => {
    const rows = [
      row({
        id: "a",
        deposit_payment_intent_id: "pi_1",
        deposit_paid_at: "2026-01-01T00:00:00Z",
      }),
    ];
    const r = categorizeDepositBookings(rows, new Set(["a"]));
    expect(r.paid.map((x) => x.id)).toEqual(["a"]);
    expect(r.paidUnresolved).toHaveLength(0);
  });

  it("a paid + NOT-refunded deposit blocks deletion (client money in flight)", () => {
    const rows = [
      row({
        id: "a",
        deposit_payment_intent_id: "pi_1",
        deposit_paid_at: "2026-01-01T00:00:00Z",
      }),
    ];
    const r = categorizeDepositBookings(rows, new Set());
    expect(r.paidUnresolved.map((x) => x.id)).toEqual(["a"]);
  });

  it("handles a mix: live-unpaid + refunded-paid + unresolved-paid + no-intent", () => {
    const rows = [
      row({ id: "live", deposit_payment_intent_id: "pi_live" }),
      row({
        id: "refunded",
        deposit_payment_intent_id: "pi_r",
        deposit_paid_at: "t",
      }),
      row({
        id: "unresolved",
        deposit_payment_intent_id: "pi_u",
        deposit_paid_at: "t",
      }),
      row({
        id: "none",
        deposit_payment_intent_id: null,
        deposit_paid_at: "t",
      }),
    ];
    const r = categorizeDepositBookings(rows, new Set(["refunded"]));
    expect(r.liveUnpaid.map((x) => x.id)).toEqual(["live"]);
    expect(r.paid.map((x) => x.id).sort()).toEqual(["refunded", "unresolved"]);
    expect(r.paidUnresolved.map((x) => x.id)).toEqual(["unresolved"]);
  });
});

describe("buildFinancialSnapshot", () => {
  it("keeps only money + Stripe identifiers from deposits (no client PII)", () => {
    const snap = buildFinancialSnapshot(
      [
        row({
          id: "b1",
          deposit_payment_intent_id: "pi_1",
          deposit_paid_at: "2026-01-01T00:00:00Z",
          deposit_amount: "200.00",
          deposit_currency: "eur",
        }),
      ],
      [],
    );
    expect(snap.deposits).toEqual([
      {
        bookingId: "b1",
        paymentIntentId: "pi_1",
        amount: 200,
        currency: "eur",
        paidAt: "2026-01-01T00:00:00Z",
      },
    ]);
    // No customer fields ever appear in the snapshot.
    expect(JSON.stringify(snap)).not.toMatch(
      /customer|email|handle|form_data/i,
    );
  });

  it("coerces a numeric-string amount and tolerates a null amount", () => {
    const snap = buildFinancialSnapshot(
      [
        row({ id: "b1", deposit_amount: "49.5" }),
        row({ id: "b2", deposit_amount: null }),
      ],
      [],
    );
    expect(snap.deposits[0].amount).toBe(49.5);
    expect(snap.deposits[1].amount).toBeNull();
  });

  it("embeds anonymized orders verbatim", () => {
    const orders = [
      { id: "o1", stripe_payment_intent_id: "pi_o", status: "paid" },
    ];
    const snap = buildFinancialSnapshot([], orders);
    expect(snap.orders).toEqual(orders);
    expect(snap.schemaVersion).toBe(1);
  });
});
