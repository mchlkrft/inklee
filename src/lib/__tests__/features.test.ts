import { describe, it, expect } from "vitest";
import {
  parseFeatures,
  featuresFromSettings,
  canUseGoods,
  canUseCheckoutAddons,
  canUseBioModules,
  DEFAULT_FEATURES,
} from "../features";

describe("parseFeatures", () => {
  it("defaults everything on for empty / invalid input", () => {
    expect(parseFeatures(null)).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures(undefined)).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures("nope")).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures({})).toEqual(DEFAULT_FEATURES);
  });

  it("honors explicit boolean overrides and ignores junk", () => {
    expect(parseFeatures({ goods_module: false })).toEqual({
      ...DEFAULT_FEATURES,
      goods_module: false,
    });
    expect(parseFeatures({ checkout_addons: "no" })).toEqual(DEFAULT_FEATURES);
  });
});

describe("featuresFromSettings + helpers", () => {
  it("reads the nested features object out of settings", () => {
    const settings = {
      features: { checkout_addons: false },
      cover_color: "rosa",
    };
    expect(featuresFromSettings(settings).checkout_addons).toBe(false);
    expect(canUseCheckoutAddons(settings)).toBe(false);
    expect(canUseGoods(settings)).toBe(true);
  });

  it("defaults to enabled when settings or features are absent", () => {
    expect(canUseGoods(null)).toBe(true);
    expect(canUseGoods({})).toBe(true);
    expect(canUseCheckoutAddons({})).toBe(true);
    expect(canUseBioModules({})).toBe(true);
  });
});
