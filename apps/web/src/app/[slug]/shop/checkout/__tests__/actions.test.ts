import { describe, it, expect, vi, beforeEach } from "vitest";

// startShopCheckoutAction (GC1 C3): the thin public entry — park-switch double
// gate, slug resolution, its OWN rate-limit bucket, then the core.

const { mockCore, mockLimit, mockProfile, flags } = vi.hoisted(() => ({
  mockCore: vi.fn(),
  mockLimit: vi.fn(),
  mockProfile: vi.fn(),
  flags: { goodsCommerce: true },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.9, 10.0.0.1" }),
}));
vi.mock("@/lib/features", () => ({
  isGoodsCommerceEnabled: () => flags.goodsCommerce,
}));
vi.mock("@/lib/ratelimit", () => ({
  checkShopCheckoutRateLimit: (...a: unknown[]) => mockLimit(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve(mockProfile()) }),
      }),
    }),
  },
}));
vi.mock("@/lib/server/goods-checkout", () => ({
  createStandaloneGoodsCheckoutCore: (...a: unknown[]) => mockCore(...a),
}));

import { startShopCheckoutAction } from "../actions";

const INPUT = {
  slug: "mika",
  email: "buyer@example.com",
  selections: [{ productId: "p1", variantId: null, quantity: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  flags.goodsCommerce = true;
  mockProfile.mockReturnValue({ data: { id: "a1" } });
  mockLimit.mockResolvedValue({ allowed: true });
  mockCore.mockResolvedValue({
    ok: true,
    orderId: "o1",
    clientSecret: "sec",
    totalMinor: 3000,
    currency: "eur",
  });
});

describe("startShopCheckoutAction", () => {
  it("resolves the slug, rate-limits per artist+IP, and returns the core result", async () => {
    const r = await startShopCheckoutAction(INPUT);
    expect(r).toMatchObject({ ok: true, orderId: "o1", clientSecret: "sec" });
    // The first x-forwarded-for entry only, per getClientIp.
    expect(mockLimit).toHaveBeenCalledWith("203.0.113.9", "a1");
    expect(mockCore).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: "a1",
        clientEmail: "buyer@example.com",
        selections: INPUT.selections,
      }),
    );
  });

  it("fails closed when the park switch is off, before any read", async () => {
    flags.goodsCommerce = false;
    const r = await startShopCheckoutAction(INPUT);
    expect(r.ok).toBe(false);
    expect(mockProfile).not.toHaveBeenCalled();
    expect(mockCore).not.toHaveBeenCalled();
  });

  it("refuses an unknown slug without reaching the core", async () => {
    mockProfile.mockReturnValue({ data: null });
    const r = await startShopCheckoutAction(INPUT);
    expect(r).toEqual({ ok: false, error: "This shop could not be found." });
    expect(mockCore).not.toHaveBeenCalled();
  });

  it("refuses when rate-limited, without reaching the core", async () => {
    mockLimit.mockResolvedValue({ allowed: false });
    const r = await startShopCheckoutAction(INPUT);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Too many attempts");
    expect(mockCore).not.toHaveBeenCalled();
  });
});
