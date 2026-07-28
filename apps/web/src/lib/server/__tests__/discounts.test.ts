import { describe, it, expect, vi, beforeEach } from "vitest";

// The discount server boundary (Plus build P5b). What matters: a bad code
// never fails a checkout, the entitlement is checked on APPLY as well as on
// create, and a redemption is counted from rows rather than a counter.

const getAccountOverrides = vi.fn();
const goodsDiscountsAllowed = vi.fn();

let codeRow: Record<string, unknown> | null = null;
let redemptionCount = 0;
const redemptionInsert = vi.fn(
  (): Promise<{ error: { code: string } | null }> =>
    Promise.resolve({ error: null }),
);
let codeLookupThrows = false;

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  goodsDiscountsAllowed: (...a: unknown[]) => goodsDiscountsAllowed(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => {
      if (table === "discount_codes") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  codeLookupThrows
                    ? Promise.reject(new Error("db down"))
                    : Promise.resolve({ data: codeRow }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => Promise.resolve({ count: redemptionCount }),
        }),
        insert: redemptionInsert,
      };
    },
  },
}));

import {
  resolveDiscount,
  recordDiscountRedemption,
} from "@/lib/server/discounts";

const ROW = {
  id: "d1",
  code: "SUMMER25",
  kind: "percent",
  value: 1000,
  currency: "eur",
  min_subtotal_minor: 0,
  max_redemptions: null,
  starts_at: null,
  ends_at: null,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
  goodsDiscountsAllowed.mockReturnValue(true);
  codeRow = { ...ROW };
  redemptionCount = 0;
  codeLookupThrows = false;
});

describe("resolveDiscount", () => {
  it("applies a valid code to the goods subtotal", async () => {
    const r = await resolveDiscount({
      artistId: "a1",
      rawCode: "summer25",
      subtotalMinor: 10000,
      currency: "eur",
    });
    expect(r).toEqual({ codeId: "d1", discountMinor: 1000, error: null });
  });

  it("does nothing, silently, when no code was supplied", async () => {
    const r = await resolveDiscount({
      artistId: "a1",
      rawCode: "",
      subtotalMinor: 10000,
      currency: "eur",
    });
    expect(r).toEqual({ codeId: null, discountMinor: 0, error: null });
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });

  // The gate is on APPLY too, not only on create: an artist who downgrades
  // keeps their codes but they stop taking money off.
  it("stops applying when the artist is not entitled", async () => {
    goodsDiscountsAllowed.mockReturnValue(false);
    const r = await resolveDiscount({
      artistId: "a1",
      rawCode: "SUMMER25",
      subtotalMinor: 10000,
      currency: "eur",
    });
    expect(r.discountMinor).toBe(0);
    expect(r.error).toBeTruthy();
  });

  it("reports an unknown code without revealing whether it exists", async () => {
    codeRow = null;
    const r = await resolveDiscount({
      artistId: "a1",
      rawCode: "NOPE",
      subtotalMinor: 10000,
      currency: "eur",
    });
    expect(r.discountMinor).toBe(0);
    expect(r.error).toBe("That code isn't valid for this order.");
  });

  it("counts redemptions from rows when the code caps them", async () => {
    codeRow = { ...ROW, max_redemptions: 2 };
    redemptionCount = 2;
    const r = await resolveDiscount({
      artistId: "a1",
      rawCode: "SUMMER25",
      subtotalMinor: 10000,
      currency: "eur",
    });
    expect(r.discountMinor).toBe(0);
    expect(r.error).toBeTruthy();
  });

  // Losing the sale over a database blip is worse than losing the discount.
  it("fails OPEN to full price when the lookup throws", async () => {
    codeLookupThrows = true;
    const r = await resolveDiscount({
      artistId: "a1",
      rawCode: "SUMMER25",
      subtotalMinor: 10000,
      currency: "eur",
    });
    expect(r).toEqual({ codeId: null, discountMinor: 0, error: null });
  });
});

describe("recordDiscountRedemption", () => {
  it("inserts one row per order", async () => {
    await recordDiscountRedemption({
      discountCodeId: "d1",
      artistId: "a1",
      orderId: "o1",
      amountMinor: 1000,
    });
    expect(redemptionInsert).toHaveBeenCalledWith(
      expect.objectContaining({ discount_code_id: "d1", order_id: "o1" }),
    );
  });

  // A Stripe redelivery hits the unique constraint, which is the expected
  // outcome and not a problem worth reporting.
  it("swallows the duplicate a redelivery produces", async () => {
    redemptionInsert.mockResolvedValueOnce({ error: { code: "23505" } });
    await expect(
      recordDiscountRedemption({
        discountCodeId: "d1",
        artistId: "a1",
        orderId: "o1",
        amountMinor: 1000,
      }),
    ).resolves.toBeUndefined();
  });

  it("never records a negative amount", async () => {
    await recordDiscountRedemption({
      discountCodeId: "d1",
      artistId: "a1",
      orderId: "o1",
      amountMinor: -500,
    });
    expect(redemptionInsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount_minor: 0 }),
    );
  });
});
