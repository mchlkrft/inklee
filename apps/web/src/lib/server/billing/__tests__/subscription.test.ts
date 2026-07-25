import { describe, it, expect, vi, beforeEach } from "vitest";

// createSubscriptionCheckout interval mechanics (yearly counsel-approved
// 2026-07-25): the yearly path must auto-apply the first-year coupon, stamp
// billing_interval into both metadata namespaces, and state the yearly renewal
// cadence in the Art. 8(2) pre-pay text; the monthly path must carry no
// discount and keep the monthly wording. The activation gate stays asserted
// before any Stripe object either way.

const h = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  customersCreate: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  assertGate: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }),
      upsert: h.upsert,
    }),
  },
}));
vi.mock("@/lib/server/billing/client", () => ({
  requireStripe: () => ({
    checkout: { sessions: { create: h.sessionsCreate } },
    customers: { create: h.customersCreate },
  }),
}));
vi.mock("@/lib/server/billing/activation", () => ({
  assertLiveBillingAllowedFor: (g: unknown) => h.assertGate(g),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import {
  createSubscriptionCheckout,
  lookupKeyForInterval,
  PLUS_PRICE_LOOKUP,
  PLUS_YEARLY_PRICE_LOOKUP,
  PLUS_YEARLY_FIRST_YEAR_COUPON,
} from "../subscription";

beforeEach(() => {
  h.sessionsCreate
    .mockReset()
    .mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe/x" });
  h.customersCreate.mockReset();
  // An existing billing customer: the checkout path skips customer creation.
  h.maybeSingle
    .mockReset()
    .mockResolvedValue({ data: { stripe_customer_id: "cus_1" } });
  h.upsert.mockReset().mockResolvedValue({ error: null });
  h.assertGate.mockReset().mockResolvedValue(undefined);
});

const baseInput = {
  artistId: "artist_1",
  email: "a@b.co",
  priceId: "price_x",
  contractCustomerType: "consumer" as const,
  successUrl: "https://inklee.app/ok",
  cancelUrl: "https://inklee.app/no",
};

describe("lookupKeyForInterval", () => {
  it("maps the two intervals onto the two stable lookup keys", () => {
    expect(lookupKeyForInterval("monthly")).toBe(PLUS_PRICE_LOOKUP);
    expect(lookupKeyForInterval("yearly")).toBe(PLUS_YEARLY_PRICE_LOOKUP);
  });
});

describe("createSubscriptionCheckout intervals", () => {
  it("monthly (default): no discount, monthly renewal wording, monthly metadata", async () => {
    await createSubscriptionCheckout(baseInput);
    expect(h.assertGate).toHaveBeenCalledWith("b2c");
    const args = h.sessionsCreate.mock.calls[0][0];
    expect(args.discounts).toBeUndefined();
    expect(args.metadata.billing_interval).toBe("monthly");
    expect(args.subscription_data.metadata.billing_interval).toBe("monthly");
    expect(args.custom_text.submit.message).toContain("each month");
  });

  it("yearly: auto-applies the first-year coupon and states yearly renewal", async () => {
    await createSubscriptionCheckout({
      ...baseInput,
      billingInterval: "yearly",
    });
    const args = h.sessionsCreate.mock.calls[0][0];
    expect(args.discounts).toEqual([{ coupon: PLUS_YEARLY_FIRST_YEAR_COUPON }]);
    expect(args.metadata.billing_interval).toBe("yearly");
    expect(args.subscription_data.metadata.billing_interval).toBe("yearly");
    expect(args.custom_text.submit.message).toContain("each year");
    expect(args.custom_text.submit.message).not.toContain("each month");
  });

  it("the gate is asserted before any Stripe object is created", async () => {
    h.assertGate.mockRejectedValue(new Error("gate closed"));
    await expect(
      createSubscriptionCheckout({ ...baseInput, billingInterval: "yearly" }),
    ).rejects.toThrow("gate closed");
    expect(h.sessionsCreate).not.toHaveBeenCalled();
    expect(h.customersCreate).not.toHaveBeenCalled();
  });
});
