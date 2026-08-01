import { describe, it, expect } from "vitest";
import { bundleGoodsLine, bundlePriceMinor } from "@inklee/shared/bundles";
import {
  goodsBaseMinorFromLines,
  computeOrderFees,
} from "@inklee/shared/order-fees";
import { FEE_SCHEDULE_V1, FEE_SCHEDULE_V2 } from "@inklee/shared/fee-schedule";

// PAY / bundles: the payable-checkout DECOMPOSITION (decision B1/B2/B5). The one
// real money surface a bundle introduces is "bundle price -> order line -> goods
// fee base". This pins it against BOTH the active (v1, 0%) and approved (v2,
// 5%/1%) goods rates, using the REAL computeOrderFees / goodsBaseMinorFromLines,
// so a fee-base bug cannot ship green and lie dormant until P7 flips the rates.
//
// The invariant that matters: the goods fee is charged on the BUNDLE PRICE, never
// on the sum of the components' list prices. A bundle is deliberately priced
// BELOW its parts here, so the two are different numbers and the wrong base would
// be caught.

const V1 = FEE_SCHEDULE_V1.version;
const V2 = FEE_SCHEDULE_V2.version;

const BUNDLE = { id: "b1", name: "Starter kit", priceAmount: 40 }; // 40.00

describe("bundlePriceMinor", () => {
  it("converts major to integer minor units, matching the checkout's rounding", () => {
    expect(bundlePriceMinor(40)).toBe(4000);
    expect(bundlePriceMinor(39.999)).toBe(4000);
    expect(bundlePriceMinor(0)).toBe(0);
  });
  it("never goes negative or NaN", () => {
    expect(bundlePriceMinor(-5)).toBe(0);
    expect(bundlePriceMinor(Number.NaN)).toBe(0);
  });
});

describe("bundleGoodsLine", () => {
  it("is ONE first-class bundle line at the bundle price (GC6)", () => {
    expect(bundleGoodsLine(BUNDLE)).toEqual({
      type: "bundle",
      name: "Starter kit",
      bundleId: "b1",
      totalMinor: 4000,
    });
  });

  it("feeds a goods base equal to the bundle price, NOT the components' sum", () => {
    // The bundle is 40.00; its parts would total 52.00 separately. The base is
    // the bundle price (4000), because only the single bundle line is present.
    // FAILS IF goodsBaseMinorFromLines stops counting `bundle` lines (e.g. the
    // GC6 widening is reverted while the line type stays 'bundle'): the base
    // silently drops to 0, which v1's 0% goods rate would otherwise hide until
    // the P7 v2 flip. That mutant is exactly why this asserts 4000, not >0.
    const base = goodsBaseMinorFromLines([bundleGoodsLine(BUNDLE)]);
    expect(base).toBe(4000);
    expect(base).not.toBe(5200);
  });
});

describe("goods fee on a bundle sale, real schedules", () => {
  const base = goodsBaseMinorFromLines([bundleGoodsLine(BUNDLE)]);

  it("v1 (active): goods fee is 0 on the bundle, so wiring changes no live number", () => {
    const plus = computeOrderFees({
      appointmentBaseMinor: 0,
      goodsBaseMinor: base,
      tier: "plus",
      version: V1,
    });
    expect(plus.goodsFeeMinor).toBe(0);
    expect(plus.totalMinor).toBe(0);
  });

  it("v2 Plus: 1% of the BUNDLE price (0.40 on 40.00), not 1% of the parts", () => {
    const r = computeOrderFees({
      appointmentBaseMinor: 0,
      goodsBaseMinor: base,
      tier: "plus",
      version: V2,
    });
    expect(r.goodsFeeMinor).toBe(40); // round(4000 * 100 / 10000) = 40
    expect(r.goodsFeeMinor).not.toBe(52); // 1% of the 52.00 parts would be wrong
  });

  it("v2 Free: 5% of the BUNDLE price (2.00 on 40.00), not 5% of the parts", () => {
    const r = computeOrderFees({
      appointmentBaseMinor: 0,
      goodsBaseMinor: base,
      tier: "free",
      version: V2,
    });
    expect(r.goodsFeeMinor).toBe(200); // round(4000 * 500 / 10000) = 200
    expect(r.goodsFeeMinor).not.toBe(260); // 5% of the 52.00 parts would be wrong
  });

  it("a bundle sold ALONGSIDE a deposit: the deposit is excluded from the goods base", () => {
    // A single PaymentIntent can carry the deposit (appointment lane) AND a
    // bundle (goods lane). goodsBaseMinorFromLines counts product and bundle
    // lines, so the deposit line never inflates the goods base.
    const lines = [
      { type: "deposit", totalMinor: 10000 }, // 100.00 deposit
      bundleGoodsLine(BUNDLE), // 40.00 bundle
    ];
    const goodsBase = goodsBaseMinorFromLines(lines);
    expect(goodsBase).toBe(4000);

    // v2 Plus: appointment 0.5% of the deposit + goods 1% of the bundle.
    const r = computeOrderFees({
      appointmentBaseMinor: 10000,
      goodsBaseMinor: goodsBase,
      tier: "plus",
      version: V2,
    });
    expect(r.appointmentFeeMinor).toBe(50); // round(10000 * 50 / 10000) = 50
    expect(r.goodsFeeMinor).toBe(40); // round(4000 * 100 / 10000) = 40
    expect(r.totalMinor).toBe(90); // the two lanes summed, never one rate on the total
  });
});
