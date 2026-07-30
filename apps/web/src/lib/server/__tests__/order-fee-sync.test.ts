import { describe, it, expect, vi, beforeEach } from "vitest";

// The fee-sync boundary (Plus build P5a). Two properties matter here and both
// are about not surprising anyone with money: the APPOINTMENT lane is
// preserved from the request-time decision rather than re-derived, and a
// plan-read blip can never under-charge.
//
// THIRD PROPERTY, ADDED AFTER A3 (2026-07-30): NEITHER FAILURE MAY RETURN A
// NUMBER. `resolveOrderFee` used to answer an unresolvable case with 0 and a
// flag, and a 0 written onto a live intent is a decision nobody made. Both
// failures now refuse, and the block at the bottom holds them to it under the
// schedule where they are reachable.

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
import { FEE_SCHEDULE_V1, FEE_SCHEDULE_V2 } from "@inklee/shared/fee-schedule";

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
    expect(r.ok).toBe(true);
    expect(r.ok && r.appointmentFeeMinor).toBe(600); // v1 flat 3%
    expect(r.ok && r.goodsFeeMinor).toBe(0); // v1 goods rate is 0%
    expect(r.ok && r.applicationFeeMinor).toBe(600);
    expect(r.ok && r.scheduleVersion).toBe(FEE_SCHEDULE_V1.version);
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
    // A WAIVED fee is 0 and the lane is still available, which is exactly the
    // distinction the refusal shape exists to keep: `ok` stays true.
    expect(r.ok).toBe(true);
    expect(r.ok && r.appointmentFeeMinor).toBe(0);
    expect(r.ok && r.applicationFeeMinor).toBe(0);
  });

  it("treats a blank sponsorship marker as not sponsored", async () => {
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 0,
      intent: intent({ sponsored_fee_cents: "   " }),
    });
    expect(r.ok && r.appointmentFeeMinor).toBe(600);
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
    expect(first.ok && second.ok).toBe(true);
    expect(second.ok && second.applicationFeeMinor).toBe(
      first.ok && first.applicationFeeMinor,
    );
  });

  it("returns the deposit-only fee when the basket is emptied", async () => {
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 0,
      intent: intent(),
    });
    expect(r.ok && r.goodsFeeMinor).toBe(0);
    expect(r.ok && r.applicationFeeMinor).toBe(600);
  });

  // WAS "falls back to the free tier when the plan read throws", asserting 600.
  // The fallback was justified as never under-charging Inklee, which holds for
  // the GOODS lane (free is the higher rate, 5% against 1%) and is false for
  // the APPOINTMENT lane, where free is not a higher rate but no rate at all.
  // Under v1 both tiers are 300 bps so the default was invisible; the v2 block
  // below is where it did damage. A read that failed knows nothing about the
  // artist, so it prices nothing.
  it("refuses when the plan read throws rather than assuming a tier", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 10000,
      intent: intent(),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("plan_read_failed");
    expect(effectivePlanTier).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The approved v2 schedule, which is what P7 flips on.
//
// `resolveOrderFee` takes no version argument and should not: it re-prepares a
// LIVE intent, so it prices at whatever is active. Making v2 active for one
// import is therefore the only way to execute what the flip will ask of it.
// `computeOrderFees` defaults `version` to the active schedule, so filling
// that default is precisely the edit P7 makes, seen from this call.

async function resolveUnder(
  version: string,
  args: Parameters<typeof resolveOrderFee>[0],
) {
  vi.resetModules();
  vi.doMock("@inklee/shared/order-fees", async () => {
    const real = await vi.importActual<
      typeof import("@inklee/shared/order-fees")
    >("@inklee/shared/order-fees");
    return {
      ...real,
      computeOrderFees: (input: Parameters<typeof real.computeOrderFees>[0]) =>
        real.computeOrderFees({ ...input, version: input.version ?? version }),
    };
  });
  try {
    const mod = await import("@/lib/server/order-fee-sync");
    return await mod.resolveOrderFee(args);
  } finally {
    vi.doUnmock("@inklee/shared/order-fees");
    vi.resetModules();
  }
}

describe("resolveOrderFee under the approved v2 schedule", () => {
  // THE F1 TRIPWIRE. Executed against the pre-fix code this returned
  // `{ appointmentLaneAvailable: false, applicationFeeMinor: 0 }`, and
  // actions.ts wrote that 0 onto the intent as `application_fee_amount`,
  // because nothing in production read the flag. `ok` is the assertion that
  // cannot be satisfied by an arithmetic zero.
  it("REFUSES a tier with no appointment rate instead of pricing it at zero", async () => {
    effectivePlanTier.mockReturnValue("free");
    const r = await resolveUnder(FEE_SCHEDULE_V2.version, {
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 0,
      intent: intent(),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("appointment_lane_unavailable");
  });

  // The positive control for the test above: same schedule, same amount, a
  // tier that HAS a rate. Without this, a wrapper that refused everything
  // under v2 would look correct.
  it("prices a Plus artist under v2, so the refusal is about the rate", async () => {
    const r = await resolveUnder(FEE_SCHEDULE_V2.version, {
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 10000,
      intent: intent(),
    });
    expect(r.ok).toBe(true);
    // 0.5% of 200.00 plus 1% of 100.00.
    expect(r.ok && r.appointmentFeeMinor).toBe(100);
    expect(r.ok && r.goodsFeeMinor).toBe(100);
    expect(r.ok && r.applicationFeeMinor).toBe(200);
    expect(r.ok && r.scheduleVersion).toBe(FEE_SCHEDULE_V2.version);
  });

  // THE F2 TRIPWIRE. The old `catch { tier = "free" }` produced 0 / 500 / 500
  // here for a PLUS artist whose plan read blipped, against the 100 / 100 / 200
  // the test above pins: the appointment fee zeroed and the goods fee
  // quintupled, off one failed read, on a live intent.
  it("refuses a plan-read failure rather than zeroing a Plus artist's fee", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const r = await resolveUnder(FEE_SCHEDULE_V2.version, {
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 10000,
      intent: intent(),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("plan_read_failed");
  });

  // v1 is still what is active, so nothing above describes a live number.
  it("is still not the active schedule", async () => {
    const r = await resolveOrderFee({
      artistId: "a1",
      depositMinor: 20000,
      goodsBaseMinor: 10000,
      intent: intent(),
    });
    expect(r.ok && r.scheduleVersion).toBe(FEE_SCHEDULE_V1.version);
  });
});
