import { describe, it, expect } from "vitest";
import {
  computeOrderFees,
  goodsBaseMinorFromLines,
} from "@inklee/shared/order-fees";
import {
  ACTIVE_FEE_SCHEDULE_VERSION,
  FEE_SCHEDULE_V1,
  FEE_SCHEDULE_V2,
} from "@inklee/shared/fee-schedule";

// Money-path tests. What matters: the two lanes never share a base, the
// schedule version is stamped and honoured, a sponsored deposit waives only
// the appointment lane, and no input can produce a negative fee (Stripe
// rejects one, which would fail the whole payment).

describe("computeOrderFees under the ACTIVE schedule", () => {
  it("is still v1, so activating v2 stays a deliberate P7 act", () => {
    expect(ACTIVE_FEE_SCHEDULE_VERSION).toBe(FEE_SCHEDULE_V1.version);
  });

  it("charges 3% on the deposit and nothing on goods today", () => {
    const f = computeOrderFees({
      appointmentBaseMinor: 20000,
      goodsBaseMinor: 5000,
      tier: "free",
    });
    expect(f.appointmentFeeMinor).toBe(600);
    expect(f.goodsFeeMinor).toBe(0); // v1 goods rate is 0%
    expect(f.totalMinor).toBe(600);
    expect(f.scheduleVersion).toBe(FEE_SCHEDULE_V1.version);
  });

  // The whole point of the engine: wiring it in must not move a live number.
  it("matches the deposit-only fee when there are no goods", () => {
    const f = computeOrderFees({
      appointmentBaseMinor: 20000,
      goodsBaseMinor: 0,
      tier: "plus",
    });
    expect(f.totalMinor).toBe(600);
  });
});

describe("the two lanes never share a base", () => {
  it("computes each lane from its own base under v2", () => {
    const f = computeOrderFees({
      appointmentBaseMinor: 20000, // €200 deposit
      goodsBaseMinor: 10000, // €100 goods
      tier: "plus",
      version: FEE_SCHEDULE_V2.version,
    });
    // Plus: 0.5% appointment, 1% goods.
    expect(f.appointmentFeeMinor).toBe(100);
    expect(f.goodsFeeMinor).toBe(100);
    expect(f.totalMinor).toBe(200);
  });

  it("never applies one rate to the combined amount", () => {
    const combined = computeOrderFees({
      appointmentBaseMinor: 20000,
      goodsBaseMinor: 10000,
      tier: "free",
      version: FEE_SCHEDULE_V2.version,
    });
    // Free cannot collect card appointment payments at all (rate null => 0),
    // and goods are 5%. A single blended rate over €300 would be neither.
    expect(combined.appointmentFeeMinor).toBe(0);
    expect(combined.goodsFeeMinor).toBe(500);
    expect(combined.totalMinor).toBe(500);
  });

  it("keeps Free's appointment lane at zero rather than inventing a rate", () => {
    const f = computeOrderFees({
      appointmentBaseMinor: 50000,
      goodsBaseMinor: 0,
      tier: "free",
      version: FEE_SCHEDULE_V2.version,
    });
    expect(f.appointmentFeeMinor).toBe(0);
  });
});

describe("sponsorship", () => {
  it("waives the appointment lane only, and records what it would have been", () => {
    const f = computeOrderFees({
      appointmentBaseMinor: 20000,
      goodsBaseMinor: 10000,
      tier: "plus",
      appointmentFeeSponsored: true,
      version: FEE_SCHEDULE_V2.version,
    });
    expect(f.appointmentFeeMinor).toBe(0);
    expect(f.appointmentFeeBeforeSponsorshipMinor).toBe(100);
    // Goods are a product sale, not the artist's own earnings: never waived.
    expect(f.goodsFeeMinor).toBe(100);
    expect(f.totalMinor).toBe(100);
  });
});

describe("versioning", () => {
  it("reproduces an old charge from its stored version", () => {
    const asCharged = computeOrderFees({
      appointmentBaseMinor: 20000,
      goodsBaseMinor: 10000,
      tier: "plus",
      version: FEE_SCHEDULE_V1.version,
    });
    expect(asCharged.totalMinor).toBe(600); // v1 rates, not today's
  });

  it("falls back to v1 for an unknown version rather than throwing", () => {
    const f = computeOrderFees({
      appointmentBaseMinor: 20000,
      goodsBaseMinor: 0,
      tier: "plus",
      version: "fees-vX-does-not-exist",
    });
    expect(f.scheduleVersion).toBe(FEE_SCHEDULE_V1.version);
    expect(f.totalMinor).toBe(600);
  });
});

describe("degenerate inputs never produce a negative or NaN fee", () => {
  it("handles zero and negative bases", () => {
    for (const base of [0, -1, -99999]) {
      const f = computeOrderFees({
        appointmentBaseMinor: base,
        goodsBaseMinor: base,
        tier: "plus",
        version: FEE_SCHEDULE_V2.version,
      });
      expect(f.totalMinor).toBe(0);
    }
  });

  it("handles non-finite bases", () => {
    const f = computeOrderFees({
      appointmentBaseMinor: NaN,
      goodsBaseMinor: Infinity,
      tier: "plus",
      version: FEE_SCHEDULE_V2.version,
    });
    expect(Number.isFinite(f.totalMinor)).toBe(true);
    expect(f.totalMinor).toBe(0);
  });
});

describe("goodsBaseMinorFromLines", () => {
  const lines = [
    { type: "deposit", totalMinor: 20000 },
    { type: "product", totalMinor: 6000 },
    { type: "product", totalMinor: 4000 },
  ];

  it("excludes the deposit line, which belongs to the other lane", () => {
    expect(goodsBaseMinorFromLines(lines)).toBe(10000);
  });

  it("subtracts discounts, VAT and shipping when they exist", () => {
    expect(
      goodsBaseMinorFromLines(lines, {
        discountsMinor: 1000,
        vatMinor: 1900,
        shippingMinor: 500,
      }),
    ).toBe(6600);
  });

  // An over-large discount is a composition bug, but a negative base would
  // become a negative application fee, which Stripe rejects outright and would
  // fail the entire payment rather than just mis-pricing it.
  it("floors at zero rather than going negative", () => {
    expect(goodsBaseMinorFromLines(lines, { discountsMinor: 999999 })).toBe(0);
  });

  it("ignores non-finite line totals", () => {
    expect(
      goodsBaseMinorFromLines([
        { type: "product", totalMinor: NaN },
        { type: "product", totalMinor: 5000 },
      ]),
    ).toBe(5000);
  });
});
