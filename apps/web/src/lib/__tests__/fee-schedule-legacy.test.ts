import { describe, it, expect } from "vitest";
import {
  FEE_SCHEDULE_V1,
  FEE_SCHEDULE_V2,
  canTransactLane,
  feeMinorUnits,
  laneRateBps,
  resolveAppointmentTier,
  type PaymentTier,
} from "@inklee/shared/fee-schedule";
import { computeOrderFees } from "@inklee/shared/order-fees";

// THE LEGACY BRANCH (founder ruling 2026-07-31): fee schedule v2 must have NO
// undefined cell. A grandfathered `legacy_free_v1` artist keeps the historical
// 3% on the APPOINTMENT lane, rather than being blocked (v2 free = null) or
// handed the Plus 0.5%. On the GOODS lane there is nothing to grandfather, so
// legacy pays the Free goods rate. This pins that encoding at the pure-data
// level, independent of any call site, so the schedule itself carries the
// decision. v1 stays active; nothing here is a live number.

const V1 = FEE_SCHEDULE_V1.version;
const V2 = FEE_SCHEDULE_V2.version;

describe("resolveAppointmentTier", () => {
  it("Plus is always plus, regardless of grandfathering", () => {
    expect(
      resolveAppointmentTier({
        planTier: "plus",
        grandfatheredAppointmentAccess: false,
      }),
    ).toBe("plus");
    expect(
      resolveAppointmentTier({
        planTier: "plus",
        grandfatheredAppointmentAccess: true,
      }),
    ).toBe("plus");
  });

  it("Free WITH grandfathered access is legacy; WITHOUT it is free", () => {
    expect(
      resolveAppointmentTier({
        planTier: "free",
        grandfatheredAppointmentAccess: true,
      }),
    ).toBe("legacy");
    expect(
      resolveAppointmentTier({
        planTier: "free",
        grandfatheredAppointmentAccess: false,
      }),
    ).toBe("free");
  });
});

describe("v2 has no undefined cell for the legacy cohort", () => {
  it("legacy can transact the appointment lane under v2 (free cannot)", () => {
    expect(canTransactLane("appointment_payment", "legacy", V2)).toBe(true);
    expect(canTransactLane("appointment_payment", "free", V2)).toBe(false);
    expect(canTransactLane("appointment_payment", "plus", V2)).toBe(true);
  });

  it("the legacy appointment rate is the historical 3% under v2", () => {
    expect(laneRateBps("appointment_payment", "legacy", V2)).toBe(300);
    // Not the Plus 0.5% and not null.
    expect(laneRateBps("appointment_payment", "plus", V2)).toBe(50);
    expect(laneRateBps("appointment_payment", "free", V2)).toBeNull();
  });

  it("legacy pays the Free goods rate: nothing to grandfather on goods", () => {
    expect(laneRateBps("goods", "legacy", V2)).toBe(
      laneRateBps("goods", "free", V2),
    );
    expect(laneRateBps("goods", "legacy", V2)).toBe(500);
  });

  it("under v1 every tier including legacy is the flat 3% / 0% goods", () => {
    expect(laneRateBps("appointment_payment", "legacy", V1)).toBe(300);
    expect(laneRateBps("appointment_payment", "free", V1)).toBe(300);
    expect(laneRateBps("appointment_payment", "plus", V1)).toBe(300);
    expect(laneRateBps("goods", "legacy", V1)).toBe(0);
  });
});

describe("feeMinorUnits for legacy", () => {
  it("charges 3% on a 200.00 appointment collection under v2", () => {
    expect(
      feeMinorUnits({
        baseMinor: 20000,
        lane: "appointment_payment",
        tier: "legacy",
        version: V2,
      }),
    ).toBe(600);
  });

  it("charges the Free 5% goods rate for legacy under v2", () => {
    expect(
      feeMinorUnits({
        baseMinor: 20000,
        lane: "goods",
        tier: "legacy",
        version: V2,
      }),
    ).toBe(1000);
  });
});

describe("computeOrderFees carries the legacy tier through both lanes", () => {
  it("a grandfathered artist: 3% appointment + 5% goods under v2, both lanes at once", () => {
    const r = computeOrderFees({
      appointmentBaseMinor: 20000, // 200.00 deposit
      goodsBaseMinor: 10000, // 100.00 goods
      tier: "legacy",
      version: V2,
    });
    expect(r.appointmentFeeMinor).toBe(600); // 3% legacy
    expect(r.goodsFeeMinor).toBe(500); // 5% free goods rate
    expect(r.totalMinor).toBe(1100);
    expect(r.appointmentLaneAvailable).toBe(true);
  });

  it("every tier the resolver can produce is priceable under v2 (no undefined outcome)", () => {
    // Exhaustive over the resolver's outputs: the only appointment-lane refusal
    // is a plain Free artist, which is a DECISION (cannot collect), not an
    // undefined cell. legacy and plus both price; free refuses by design.
    const tiers: PaymentTier[] = ["free", "plus", "legacy"];
    for (const tier of tiers) {
      const r = computeOrderFees({
        appointmentBaseMinor: 20000,
        goodsBaseMinor: 0,
        tier,
        version: V2,
      });
      // The number is always defined; availability distinguishes the free refusal.
      expect(Number.isFinite(r.appointmentFeeMinor)).toBe(true);
      expect(r.appointmentLaneAvailable).toBe(tier !== "free");
    }
  });
});
