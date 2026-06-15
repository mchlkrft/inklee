import { describe, it, expect } from "vitest";
import {
  buildFinancialSnapshot,
  categorizeDepositBookings,
  pseudonymizeOrder,
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

  it("classifies an intent without paid_at as live-unpaid (cancellable)", () => {
    const rows = [row({ id: "a", deposit_payment_intent_id: "pi_1" })];
    const r = categorizeDepositBookings(rows, new Set());
    expect(r.liveUnpaid.map((x) => x.id)).toEqual(["a"]);
    expect(r.paidUnresolved).toHaveLength(0);
  });

  it("a paid + refunded deposit is resolved (not unresolved)", () => {
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

  it("a paid + NOT-refunded deposit is unresolved (record retained for refund route)", () => {
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
  it("keeps money + Stripe ids + fee + resolved (no client PII)", () => {
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
      new Set(),
      [],
    );
    expect(snap.deposits).toEqual([
      {
        bookingId: "b1",
        paymentIntentId: "pi_1",
        amount: 200,
        platformFeeAmount: 6, // standard 3% of the 200 basis
        currency: "eur",
        paidAt: "2026-01-01T00:00:00Z",
        resolved: false, // not in the resolved set
      },
    ]);
    // No customer fields ever appear in the snapshot.
    expect(JSON.stringify(snap)).not.toMatch(
      /customer|email|handle|form_data/i,
    );
  });

  it("flags a refunded/forfeited deposit as resolved (preserves vs not)", () => {
    const snap = buildFinancialSnapshot(
      [
        row({ id: "done", deposit_amount: 100 }),
        row({ id: "open", deposit_amount: 100 }),
      ],
      new Set(["done"]),
      [],
    );
    expect(snap.deposits[0].resolved).toBe(true);
    expect(snap.deposits[1].resolved).toBe(false);
  });

  it("coerces a numeric-string amount and tolerates a null amount", () => {
    const snap = buildFinancialSnapshot(
      [
        row({ id: "b1", deposit_amount: "49.5" }),
        row({ id: "b2", deposit_amount: null }),
      ],
      new Set(),
      [],
    );
    expect(snap.deposits[0].amount).toBe(49.5);
    expect(snap.deposits[1].amount).toBeNull();
    expect(snap.deposits[1].platformFeeAmount).toBeNull();
  });

  it("embeds pseudonymised orders verbatim", () => {
    const orders = [
      { id: "o1", stripe_payment_intent_id: "pi_o", status: "paid" },
    ];
    const snap = buildFinancialSnapshot([], new Set(), orders);
    expect(snap.orders).toEqual(orders);
    expect(snap.schemaVersion).toBe(1);
  });
});

describe("pseudonymizeOrder", () => {
  it("keeps only allowlisted financial fields and drops any PII column", () => {
    const out = pseudonymizeOrder({
      id: "o1",
      booking_id: "b1",
      stripe_payment_intent_id: "pi_o",
      status: "paid",
      deposit_amount: 200,
      currency: "eur",
      // PII that must NOT survive — current + hypothetical future columns:
      client_email: "client@example.com",
      client_name: "Jane Client",
      client_phone: "+37212345678",
      shipping_address: "Somewhere 1",
    });
    expect(out.id).toBe("o1");
    expect(out.stripe_payment_intent_id).toBe("pi_o");
    expect(out.deposit_amount).toBe(200);
    // Allowlist is additive-safe: no client/PII key survives, present or future.
    expect(JSON.stringify(out)).not.toMatch(/client|email|phone|address|name/i);
  });
});
