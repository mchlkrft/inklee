import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// A4 / OT-12 connected-account delivery: the webhook route verifies against
// BOTH the platform deposit endpoint's secret (STRIPE_WEBHOOK_SECRET) and the
// connect endpoint's secret (STRIPE_CONNECT_WEBHOOK_SECRET). This file is the
// only place the multi-secret verification is exercised, and it is
// security-sensitive: the properties are (1) an event signed by EITHER of our
// endpoints is accepted, (2) an event signed by a secret we do NOT hold is
// rejected, and (3) with the connect secret unset the behaviour is exactly the
// single-secret behaviour it replaced.
//
// The `stripe` double's constructEvent is SECRET-AWARE here (unlike the other
// route tests, which take the event at face value): the signature header names
// the secret that validly signed the event, and any other secret throws,
// reproducing what a real HMAC mismatch does. That is what lets the loop be
// tested at all.

const { mockPersist, mockClear } = vi.hoisted(() => ({
  mockPersist: vi.fn(),
  mockClear: vi.fn(),
}));

vi.mock("stripe", () => {
  class FakeStripe {
    webhooks = {
      constructEvent: (body: string, signature: string, secret: string) => {
        // The signature header carries `signed_by:<secret>`; a real Stripe
        // verification only succeeds against the exact secret that signed the
        // payload, so every other secret must throw exactly as constructEvent
        // does on a signature mismatch.
        if (signature !== `signed_by:${secret}`) {
          throw new Error(
            "No signatures found matching the expected signature for payload",
          );
        }
        return JSON.parse(body) as Stripe.Event;
      },
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
      throw new Error("no direct db access is expected in this dispatch");
    },
  },
}));
vi.mock("@/lib/server/goods-checkout", () => ({
  settleStandaloneGoodsOrder: vi.fn(),
  cancelStandalonePendingOrder: vi.fn(),
}));
vi.mock("@/lib/server/appointment-payment-settlement", () => ({
  settlePaymentRequestSuccess: vi.fn(),
  settlePaymentRequestRefund: vi.fn(),
  settlePaymentRequestDispute: vi.fn(),
  settlePaymentRequestFailure: vi.fn(),
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
  clearConnectAccountByExternalId: (...a: unknown[]) => mockClear(...a),
  persistConnectAccountFromEvent: (...a: unknown[]) => mockPersist(...a),
}));

import { POST } from "../route";

const PLATFORM = "whsec_platform_deposit";
const CONNECT = "whsec_connect_account";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_dispatch";
  process.env.STRIPE_WEBHOOK_SECRET = PLATFORM;
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  // account.updated's handler reads `"error" in result`, so the persist double
  // must resolve to an object without an `error` key for the success path.
  mockPersist.mockResolvedValue({});
  mockClear.mockResolvedValue({});
});

/** POST a connected-account `account.updated` signed by `signedBy`. */
async function postAccountUpdated(signedBy: string) {
  const event = {
    id: "evt_acct_1",
    type: "account.updated",
    account: "acct_connected_1",
    data: { object: { id: "acct_connected_1" } },
  };
  const res = await POST(
    new Request("https://inklee.app/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify(event),
      headers: { "stripe-signature": `signed_by:${signedBy}` },
    }),
  );
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

describe("webhook multi-secret verification (connected-account delivery)", () => {
  it("THE NEW BEHAVIOUR: an event signed by the CONNECT secret is accepted and handled", async () => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT;
    const { status, body } = await postAccountUpdated(CONNECT);
    // Platform secret is tried first and fails; the connect secret validates.
    expect(status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockPersist).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acct_connected_1" }),
    );
  });

  it("the platform deposit secret still verifies when the connect secret is also set (no regression)", async () => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT;
    const { status, body } = await postAccountUpdated(PLATFORM);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockPersist).toHaveBeenCalledTimes(1);
  });

  it("SECURITY: an event signed by a secret we do NOT hold is rejected 400", async () => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT;
    const { status, body } = await postAccountUpdated("whsec_attacker_unknown");
    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid signature" });
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("with the connect secret UNSET, a platform-signed event still verifies (byte-for-byte the old behaviour)", async () => {
    // STRIPE_CONNECT_WEBHOOK_SECRET is deleted in beforeEach.
    const { status, body } = await postAccountUpdated(PLATFORM);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true });
  });

  it("SECURITY: with the connect secret UNSET, a connect-signed event is rejected (we only accept configured secrets)", async () => {
    // The whole reason the env var must be provisioned: until it is, the
    // connect endpoint's events are not trusted.
    const { status } = await postAccountUpdated(CONNECT);
    expect(status).toBe(400);
    expect(mockPersist).not.toHaveBeenCalled();
  });
});
