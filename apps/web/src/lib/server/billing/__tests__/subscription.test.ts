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
  assertLaunch: vi.fn(),
  assertGate: vi.fn(),
  resolveOffer: vi.fn(),
  recordOffer: vi.fn(),
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
  assertSalesLaunchApproved: (t: unknown) => h.assertLaunch(t),
  assertLiveBillingAllowedFor: (g: unknown) => h.assertGate(g),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/server/billing/founder-offer", () => ({
  resolveFounderOffer: (...a: unknown[]) => h.resolveOffer(...a),
  recordFounderOfferRedemption: (...a: unknown[]) => h.recordOffer(...a),
}));

import {
  createSubscriptionCheckout,
  lookupKeyForInterval,
  PLUS_PRICE_LOOKUP,
  PLUS_YEARLY_PRICE_LOOKUP,
  PLUS_YEARLY_FIRST_YEAR_COUPON,
} from "../subscription";
import { BillingActivationError } from "@/lib/billing";

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
  h.assertLaunch.mockReset().mockResolvedValue(undefined);
  h.assertGate.mockReset().mockResolvedValue(undefined);
  // Default: NOT founder-eligible. The offer is capped and windowed, so the
  // ordinary yearly checkout carries no discount.
  h.resolveOffer.mockReset().mockResolvedValue({
    eligible: false,
    reason: "cohort_full",
    cohortPosition: null,
  });
  h.recordOffer.mockReset().mockResolvedValue(true);
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

  it("yearly WITHOUT founder eligibility: NO discount, yearly renewal wording", async () => {
    // Corrected 2026-07-28. This test previously asserted the coupon was
    // applied to every yearly checkout, which was the defect: the founder
    // offer is capped at 100, windowed, and one per account.
    await createSubscriptionCheckout({
      ...baseInput,
      billingInterval: "yearly",
    });
    const args = h.sessionsCreate.mock.calls[0][0];
    expect(args.discounts).toBeUndefined();
    expect(args.metadata.billing_interval).toBe("yearly");
    expect(args.subscription_data.metadata.billing_interval).toBe("yearly");
    expect(args.custom_text.submit.message).toContain("each year");
    expect(args.custom_text.submit.message).not.toContain("each month");
  });

  it("yearly WITH founder eligibility: applies the coupon and records the redemption", async () => {
    h.resolveOffer.mockResolvedValue({
      eligible: true,
      reason: "eligible",
      cohortPosition: 1,
    });
    await createSubscriptionCheckout({
      ...baseInput,
      billingInterval: "yearly",
    });
    expect(h.recordOffer).toHaveBeenCalledWith(
      expect.objectContaining({ artistId: "artist_1", cohortPosition: 1 }),
    );
    expect(h.sessionsCreate.mock.calls[0][0].discounts).toEqual([
      { coupon: PLUS_YEARLY_FIRST_YEAR_COUPON },
    ]);
  });

  it("losing the concurrency race for the last slot applies NO discount", async () => {
    // Two simultaneous 100th checkouts both read the same count; the unique
    // cohort position lets exactly one insert win. The loser must not be
    // charged the founder price.
    h.resolveOffer.mockResolvedValue({
      eligible: true,
      reason: "eligible",
      cohortPosition: 100,
    });
    h.recordOffer.mockResolvedValue(false);
    await createSubscriptionCheckout({
      ...baseInput,
      billingInterval: "yearly",
    });
    expect(h.sessionsCreate.mock.calls[0][0].discounts).toBeUndefined();
  });

  it("monthly never consults the founder offer as eligible", async () => {
    h.resolveOffer.mockResolvedValue({
      eligible: false,
      reason: "not_yearly",
      cohortPosition: null,
    });
    await createSubscriptionCheckout({ ...baseInput });
    expect(h.sessionsCreate.mock.calls[0][0].discounts).toBeUndefined();
    expect(h.recordOffer).not.toHaveBeenCalled();
  });

  it("the compliance gate is asserted before any Stripe object is created", async () => {
    h.assertGate.mockRejectedValue(new Error("gate closed"));
    await expect(
      createSubscriptionCheckout({ ...baseInput, billingInterval: "yearly" }),
    ).rejects.toThrow("gate closed");
    expect(h.sessionsCreate).not.toHaveBeenCalled();
    expect(h.customersCreate).not.toHaveBeenCalled();
  });

  it("the launch-key gate rejects before compliance and before any Stripe object", async () => {
    h.assertLaunch.mockRejectedValue(
      new BillingActivationError(
        "b2c",
        ["consumer_sales_launch_approved"],
        "not launched",
      ),
    );
    await expect(createSubscriptionCheckout(baseInput)).rejects.toBeInstanceOf(
      BillingActivationError,
    );
    expect(h.assertLaunch).toHaveBeenCalledWith("consumer");
    expect(h.assertGate).not.toHaveBeenCalled();
    expect(h.sessionsCreate).not.toHaveBeenCalled();
    expect(h.customersCreate).not.toHaveBeenCalled();
  });

  it("maps business contractCustomerType to the business launch key", async () => {
    await createSubscriptionCheckout({
      ...baseInput,
      contractCustomerType: "business",
    });
    expect(h.assertLaunch).toHaveBeenCalledWith("business");
    expect(h.assertGate).toHaveBeenCalledWith("b2b");
  });
});
