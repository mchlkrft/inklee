import { describe, it, expect, vi, beforeEach } from "vitest";

// The fee-sync boundary (Plus build P5a). Two properties matter here and both
// are about not surprising anyone with money: the APPOINTMENT lane is
// preserved from the request-time decision rather than re-derived, and a
// plan-read blip can never under-charge.

const getAccountOverrides = vi.fn();
const effectivePlanTier = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/entitlements", () => ({
  effectivePlanTier: (...a: unknown[]) => effectivePlanTier(...a),
}));

import { resolveOrderFee } from "@/lib/server/order-fee-sync";
import { FEE_SCHEDULE_V1 } from "@inklee/shared/fee-schedule";

const intent = (metadata: Record<string, string> = {}) =>
  ({ metadata, application_fee_amount: 600 }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
  effectivePlanTier.mockReturnValue("plus");
});

describe("resolveOrderFee", () => {
  it("charges the deposit lane and stamps the active schedule", async () => {
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 10000,
      intent: intent(),
    });
    expect(r.appointmentFeeMinor).toBe(600); // v1 flat 3%
    expect(r.goodsFeeMinor).toBe(0); // v1 goods rate is 0%
    expect(r.applicationFeeMinor).toBe(600);
    expect(r.scheduleVersion).toBe(FEE_SCHEDULE_V1.version);
  });

  // The artist was told what their deposit fee would be when they requested
  // it. A sponsorship budget that moved in between must not silently change it
  // while a client is standing at the checkout.
  it("honours a sponsored deposit recorded on the intent", async () => {
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 0,
      intent: intent({ sponsored_fee_cents: "600" }),
    });
    expect(r.appointmentFeeMinor).toBe(0);
    expect(r.applicationFeeMinor).toBe(0);
  });

  it("treats a blank sponsorship marker as not sponsored", async () => {
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 0,
      intent: intent({ sponsored_fee_cents: "   " }),
    });
    expect(r.appointmentFeeMinor).toBe(600);
  });

  // Converge, never accumulate: the value returned depends only on the bases,
  // not on what the intent currently carries. Re-preparing a basket any number
  // of times must land on the same number.
  it("is idempotent across repeated prepares", async () => {
    const first = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 10000,
      intent: intent(),
    });
    const second = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 10000,
      // An intent that already carries the raised fee from the first prepare.
      intent: { metadata: {}, application_fee_amount: 9999 } as never,
    });
    expect(second.applicationFeeMinor).toBe(first.applicationFeeMinor);
  });

  it("returns the deposit-only fee when the basket is emptied", async () => {
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 0,
      intent: intent(),
    });
    expect(r.goodsFeeMinor).toBe(0);
    expect(r.applicationFeeMinor).toBe(600);
  });

  // A blip must not silently reprice downward. Free carries the HIGHER goods
  // rate, so defaulting there can never under-charge Inklee.
  it("falls back to the free tier when the plan read throws", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 10000,
      intent: intent(),
    });
    expect(r.applicationFeeMinor).toBe(600);
    expect(effectivePlanTier).not.toHaveBeenCalled();
  });
});
