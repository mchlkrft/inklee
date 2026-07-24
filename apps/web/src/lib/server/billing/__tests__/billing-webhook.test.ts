import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Billing-webhook route test (earns `webhook_tested`). Verifies signature
// gating, that subscription + invoice events route to the converge-to-target
// reconcile with event.created (the ordering guard), that unknown events are
// acknowledged (never retried), and that a reconcile failure 500s so Stripe
// redelivers. Stripe's signature verification is mocked; the point under test is
// the route's own event handling, not Stripe's HMAC.

const h = vi.hoisted(() => ({
  reconcile: vi.fn(),
  constructEvent: vi.fn(),
  recordConf: vi.fn(),
}));

vi.mock("@/lib/server/billing/reconcile", () => ({
  reconcileSubscriptionById: (id: string, created: number) =>
    h.reconcile(id, created),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "bsub_1" } }) }),
      }),
    }),
  },
}));
vi.mock("@/lib/server/billing/withdrawal", () => ({
  recordDurableConfirmation: (a: unknown) => h.recordConf(a),
}));
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: h.constructEvent };
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/stripe/billing-webhook/route";

const ORIG = { ...process.env };

function req(body = "{}", signature: string | null = "sig") {
  return {
    text: async () => body,
    headers: { get: (_k: string) => signature },
  } as unknown as Request;
}

beforeEach(() => {
  h.reconcile
    .mockReset()
    .mockResolvedValue({ artistId: "artist_1", planTier: "plus" });
  h.recordConf.mockReset();
  h.constructEvent.mockReset();
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = "whsec_x";
});
afterEach(() => {
  process.env = { ...ORIG };
});

describe("billing-webhook route", () => {
  it("400s when the webhook secret is not configured", async () => {
    delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(h.reconcile).not.toHaveBeenCalled();
  });

  it("400s on a missing signature", async () => {
    const res = await POST(req("{}", null));
    expect(res.status).toBe(400);
  });

  it("400s on an invalid signature and never reconciles", async () => {
    h.constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(h.reconcile).not.toHaveBeenCalled();
  });

  it("routes a subscription event to reconcile with event.created", async () => {
    h.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      id: "evt_1",
      created: 1710000000,
      data: { object: { id: "sub_123" } },
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.reconcile).toHaveBeenCalledWith("sub_123", 1710000000);
  });

  it("extracts the subscription id from an invoice event (dahlia parent path)", async () => {
    h.constructEvent.mockReturnValue({
      type: "invoice.paid",
      id: "evt_2",
      created: 1710000001,
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_456" } },
        },
      },
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.reconcile).toHaveBeenCalledWith("sub_456", 1710000001);
  });

  it("acknowledges an unrelated event without reconciling (no retry storm)", async () => {
    h.constructEvent.mockReturnValue({
      type: "payment_intent.succeeded", // a deposit-side event this endpoint ignores
      id: "evt_3",
      created: 1710000002,
      data: { object: {} },
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe("payment_intent.succeeded");
    expect(h.reconcile).not.toHaveBeenCalled();
  });

  it("ignores a deposit-side charge.refunded (subscription state stays isolated)", async () => {
    // Refund isolation: a deposit refund event reaching the billing webhook is
    // acknowledged and ignored; it never touches subscription/access state.
    h.constructEvent.mockReturnValue({
      type: "charge.refunded",
      id: "evt_5",
      created: 1710000004,
      data: { object: {} },
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe("charge.refunded");
    expect(h.reconcile).not.toHaveBeenCalled();
  });

  it("sends a durable purchase confirmation on the first paid invoice", async () => {
    h.constructEvent.mockReturnValue({
      type: "invoice.paid",
      id: "evt_p",
      created: 1710000010,
      data: {
        object: {
          id: "in_1",
          billing_reason: "subscription_create",
          parent: { subscription_details: { subscription: "sub_p" } },
        },
      },
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.recordConf).toHaveBeenCalledTimes(1);
    expect(h.recordConf.mock.calls[0][0]).toMatchObject({
      artistId: "artist_1",
      kind: "purchase",
      stripeInvoiceId: "in_1",
    });
  });

  it("does NOT send a purchase confirmation on a renewal invoice", async () => {
    h.constructEvent.mockReturnValue({
      type: "invoice.paid",
      id: "evt_r",
      created: 1710000011,
      data: {
        object: {
          id: "in_2",
          billing_reason: "subscription_cycle",
          parent: { subscription_details: { subscription: "sub_p" } },
        },
      },
    });
    await POST(req());
    expect(h.recordConf).not.toHaveBeenCalled();
  });

  it("does NOT send a confirmation on payment_failed (still reconciles)", async () => {
    h.constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      id: "evt_f",
      created: 1710000012,
      data: {
        object: {
          id: "in_3",
          billing_reason: "subscription_create",
          parent: { subscription_details: { subscription: "sub_p" } },
        },
      },
    });
    await POST(req());
    expect(h.reconcile).toHaveBeenCalledTimes(1);
    expect(h.recordConf).not.toHaveBeenCalled();
  });

  it("500s when reconcile throws so Stripe redelivers", async () => {
    h.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      id: "evt_4",
      created: 1710000003,
      data: { object: { id: "sub_789" } },
    });
    h.reconcile.mockRejectedValue(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});
