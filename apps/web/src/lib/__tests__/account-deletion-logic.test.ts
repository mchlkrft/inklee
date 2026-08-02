import { describe, it, expect } from "vitest";
import {
  buildFinancialSnapshot,
  categorizeDepositBookings,
  pseudonymizeOrder,
  pseudonymizePaymentRequest,
  pseudonymizePaymentRequestLine,
  pseudonymizePaymentCollection,
  pseudonymizePaymentAllocation,
  type BillingSnapshot,
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

  // G2 (FEE-STP-001): the retained snapshot must use what Stripe ACTUALLY
  // took, not a recomputation, because the two disagree whenever the deposit
  // was sponsored (waived to 0) or settled at a tier other than v1's flat 3%.
  it("prefers the ACTUAL settled fee over the 3% computation when stamped", () => {
    const snap = buildFinancialSnapshot(
      [
        row({
          id: "b1",
          deposit_amount: "200.00",
          // Sponsored: Stripe actually took 0, not the computed 3% (6.00).
          platform_fee_collected_cents: 0,
        }),
      ],
      new Set(),
      [],
    );
    expect(snap.deposits[0].platformFeeAmount).toBe(0);
  });

  it("falls back to the 3% computation when no fee was stamped (pre-0116 row)", () => {
    const snap = buildFinancialSnapshot(
      [row({ id: "b1", deposit_amount: "200.00" })],
      new Set(),
      [],
    );
    expect(snap.deposits[0].platformFeeAmount).toBe(6);
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
    expect(snap.schemaVersion).toBe(3);
  });

  it("includes billing snapshot when provided", () => {
    const billing: BillingSnapshot = {
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_456",
      status: "active",
      contractCustomerType: "consumer",
      canceledForDeletion: true,
    };
    const snap = buildFinancialSnapshot([], new Set(), [], billing);
    expect(snap.billing).toEqual(billing);
    expect(snap.schemaVersion).toBe(3);
  });

  it("sets billing to null when no subscription exists", () => {
    const snap = buildFinancialSnapshot([], new Set(), []);
    expect(snap.billing).toBeNull();
  });

  it("defaults appointmentPayments to the empty snapshot when omitted", () => {
    const snap = buildFinancialSnapshot([], new Set(), []);
    expect(snap.appointmentPayments).toEqual({
      requests: [],
      lines: [],
      collections: [],
      allocations: [],
    });
  });

  it("embeds the pseudonymised P9 subset verbatim when provided", () => {
    const appointmentPayments = {
      requests: [{ id: "pr1", status: "sent", total_minor: 5000 }],
      lines: [{ id: "l1", request_id: "pr1", name: "Session" }],
      collections: [{ payment_intent_id: "pi_1", booking_id: "b1" }],
      allocations: [
        { id: "a1", payment_intent_id: "pi_1", amount_minor: 5000 },
      ],
    };
    const snap = buildFinancialSnapshot(
      [],
      new Set(),
      [],
      null,
      appointmentPayments,
    );
    expect(snap.appointmentPayments).toEqual(appointmentPayments);
  });
});

describe("P9 pseudonymize* functions", () => {
  it("payment request: keeps money/status fields, drops artist_id and any client token", () => {
    const out = pseudonymizePaymentRequest({
      id: "pr1",
      artist_id: "artist-uuid",
      booking_id: "b1",
      status: "sent",
      currency: "eur",
      total_minor: 5000,
      client_token: "supersecrettoken",
    });
    expect(out).toEqual({
      id: "pr1",
      booking_id: "b1",
      status: "sent",
      currency: "eur",
      total_minor: 5000,
    });
    expect(JSON.stringify(out)).not.toMatch(/artist_id|token/i);
  });

  it("payment request line: keeps the descriptor, drops free-text description and artist_id", () => {
    const out = pseudonymizePaymentRequestLine({
      id: "l1",
      request_id: "pr1",
      artist_id: "artist-uuid",
      name: "Full sleeve, session 2",
      description: "As discussed with the client on Instagram",
      quantity: 1,
      unit_amount_minor: 5000,
      line_total_minor: 5000,
      classification: "tattoo_service",
    });
    expect(out.name).toBe("Full sleeve, session 2");
    expect(out).not.toHaveProperty("description");
    expect(out).not.toHaveProperty("artist_id");
  });

  it("payment collection and allocation: keep only money/Stripe identifiers", () => {
    const collection = pseudonymizePaymentCollection({
      payment_intent_id: "pi_1",
      artist_id: "artist-uuid",
      booking_id: "b1",
      currency: "eur",
    });
    expect(collection).toEqual({
      payment_intent_id: "pi_1",
      booking_id: "b1",
      currency: "eur",
    });
    const allocation = pseudonymizePaymentAllocation({
      id: "a1",
      artist_id: "artist-uuid",
      payment_intent_id: "pi_1",
      component: "deposit",
      amount_minor: 5000,
      collected_total_minor: 5000,
      status: "succeeded",
    });
    expect(allocation).toEqual({
      id: "a1",
      payment_intent_id: "pi_1",
      component: "deposit",
      amount_minor: 5000,
      collected_total_minor: 5000,
      status: "succeeded",
    });
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
