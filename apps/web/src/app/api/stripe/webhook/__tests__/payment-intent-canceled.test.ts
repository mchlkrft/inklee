import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// `payment_intent.canceled` DISPATCH (SHOP-ORD-001 half 1).
//
// This file exists because branch ORDER and the branch CONDITIONS live in the
// route and nowhere else, and both are the actual defect surface here: an
// appointment payment intent also carries order-ish metadata, and a booking's
// ADD-ON order carries `order_id` exactly like a standalone one does. A
// function-level test of cancelStandalonePendingOrder cannot see either
// mistake, because by then the routing decision has already been made.
//
// The route builds its own Stripe client from env and verifies the signature
// itself, so the `stripe` package is replaced with a double whose
// constructEvent simply parses the body. Everything the route module imports is
// mocked: the unit under test is the dispatch, not the settlement bodies.

const {
  mockCancelStandalone,
  mockSettleStandalone,
  mockSettlePaymentRequestFailure,
} = vi.hoisted(() => ({
  mockCancelStandalone: vi.fn(),
  mockSettleStandalone: vi.fn(),
  mockSettlePaymentRequestFailure: vi.fn(),
}));

vi.mock("stripe", () => {
  class FakeStripe {
    webhooks = {
      // Signature verification is Stripe's, not ours; the route's own tests
      // for it are separate. Here the event is taken at face value.
      constructEvent: (body: string) => JSON.parse(body) as Stripe.Event,
    };
  }
  return { default: FakeStripe };
});

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: () => {
      throw new Error(
        "no database access is expected on a payment_intent.canceled dispatch",
      );
    },
  },
}));
vi.mock("@/lib/server/goods-checkout", () => ({
  settleStandaloneGoodsOrder: (...a: unknown[]) => mockSettleStandalone(...a),
  cancelStandalonePendingOrder: (...a: unknown[]) => mockCancelStandalone(...a),
}));
vi.mock("@/lib/server/appointment-payment-settlement", () => ({
  settlePaymentRequestSuccess: vi.fn(),
  settlePaymentRequestRefund: vi.fn(),
  settlePaymentRequestDispute: vi.fn(),
  settlePaymentRequestFailure: (...a: unknown[]) =>
    mockSettlePaymentRequestFailure(...a),
}));
vi.mock("@/lib/server/goods-refund", () => ({
  settleGoodsOrderRefund: vi.fn(),
  resolveDepositRefundAmountMinor: vi.fn(),
}));
vi.mock("@/lib/booking-schema", () => ({ formatSize: vi.fn() }));
vi.mock("@/lib/email/send-booking-email", () => ({
  sendBookingEmail: vi.fn(),
  sendGoodsOrderConfirmation: vi.fn(),
  sendArtistDepositPaidEmail: vi.fn(),
  sendClientDepositReceiptEmail: vi.fn(),
}));
vi.mock("@/lib/order-fulfillment", () => ({ decrementInventory: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/server/discounts", () => ({
  recordDiscountRedemption: vi.fn(),
}));
vi.mock("@/lib/revalidate-bookings", () => ({
  revalidateBookingViews: vi.fn(),
}));
vi.mock("@/lib/booking-domain", () => ({ customerLabel: vi.fn() }));
vi.mock("@/lib/booking-studio", () => ({ resolveStudioForBooking: vi.fn() }));
vi.mock("@/lib/stripe-connect", () => ({
  clearConnectAccountByExternalId: vi.fn(),
  persistConnectAccountFromEvent: vi.fn(),
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_dispatch";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dispatch";
  mockCancelStandalone.mockResolvedValue(true);
  mockSettlePaymentRequestFailure.mockResolvedValue(true);
});

/** POST a `payment_intent.canceled` carrying exactly this metadata. */
async function postCanceled(metadata: Record<string, string>) {
  const event = {
    id: "evt_1",
    type: "payment_intent.canceled",
    data: { object: { id: "pi_1", metadata } },
  };
  const res = await POST(
    new Request("https://inkl.ee/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify(event),
      headers: { "stripe-signature": "t=1,v1=whatever" },
    }),
  );
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

describe("payment_intent.canceled dispatch", () => {
  it("an appointment payment wins over the standalone branch even carrying an order_id", async () => {
    // Both discriminators present. payment_request_id is checked FIRST in the
    // route, and must stay first.
    const { status, body } = await postCanceled({
      payment_request_id: "pr_1",
      order_id: "o1",
    });

    expect(status).toBe(200);
    expect(body).toEqual({ received: true, recorded: true });
    expect(mockSettlePaymentRequestFailure).toHaveBeenCalledTimes(1);
    expect(mockSettlePaymentRequestFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pi_1" }),
      "canceled",
    );
    // Fails if the standalone branch is ever moved ABOVE the payment-request
    // branch: an appointment payment would then be routed into the goods
    // order cancel, the payment request would never move to `failed`, and the
    // artist would be left with a request stuck in payment_processing.
    expect(mockCancelStandalone).not.toHaveBeenCalled();
  });

  it("a standalone dead intent (order_id, no booking_id) cancels its pending order", async () => {
    const { status, body } = await postCanceled({
      order_id: "o1",
      standalone_goods: "1",
    });

    expect(status).toBe(200);
    expect(body).toEqual({ received: true, cancelled: true });
    // Fails if the standalone branch is deleted, which is the SHOP-ORD-001
    // defect itself: the pending order and its guest email survive forever.
    expect(mockCancelStandalone).toHaveBeenCalledTimes(1);
    expect(mockCancelStandalone).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pi_1" }),
    );
    expect(mockSettlePaymentRequestFailure).not.toHaveBeenCalled();
  });

  it("the response reports a cancel that did NOT happen as false", async () => {
    mockCancelStandalone.mockResolvedValue(false);

    const { body } = await postCanceled({ order_id: "o1" });
    // Fails if the route hardcodes `cancelled: true` instead of forwarding the
    // function's answer: Stripe's event log would then claim every dead intent
    // reaped an order.
    expect(body).toEqual({ received: true, cancelled: false });
  });

  it("a booking's add-on order (order_id WITH booking_id) is NOT swept into the standalone cancel", async () => {
    const { status, body } = await postCanceled({
      order_id: "o1",
      booking_id: "b1",
    });

    expect(status).toBe(200);
    expect(body).toEqual({ received: true });
    // Fails if the `&& !intent.metadata?.booking_id` conjunct is dropped. An
    // add-on order rides the BOOKING's deposit intent and is owned by the
    // booking lifecycle; cancelling a deposit intent would silently cancel the
    // goods order attached to a live booking.
    expect(mockCancelStandalone).not.toHaveBeenCalled();
  });

  it("a deposit intent with neither id is acknowledged and moves nothing", async () => {
    const { status, body } = await postCanceled({ booking_id: "b1" });

    expect(status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockCancelStandalone).not.toHaveBeenCalled();
    expect(mockSettlePaymentRequestFailure).not.toHaveBeenCalled();
    expect(mockSettleStandalone).not.toHaveBeenCalled();
  });
});
