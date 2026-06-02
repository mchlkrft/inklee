import { describe, it, expect, afterEach, vi } from "vitest";
import {
  parseFeatures,
  featuresFromSettings,
  canUseGoods,
  canUseCheckoutAddons,
  canChargeCheckoutAddons,
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

describe("canChargeCheckoutAddons", () => {
  // Vitest runs with NODE_ENV='test', so the production gate is bypassed by
  // default and the per-artist flag is the sole signal. vi.stubEnv lets us
  // flip NODE_ENV per test without fighting the read-only declared type.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when the per-artist flag is off, regardless of env", () => {
    const off = { features: { checkout_addons: false } };
    vi.stubEnv("NODE_ENV", "development");
    expect(canChargeCheckoutAddons(off)).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHECKOUT_ADDONS_PROD_READY", "true");
    expect(canChargeCheckoutAddons(off)).toBe(false);
  });

  it("trusts the per-artist flag in non-production environments", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(canChargeCheckoutAddons({})).toBe(true);
    vi.stubEnv("NODE_ENV", "test");
    expect(canChargeCheckoutAddons({})).toBe(true);
  });

  it("fails closed in production unless CHECKOUT_ADDONS_PROD_READY=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHECKOUT_ADDONS_PROD_READY", "");
    expect(canChargeCheckoutAddons({})).toBe(false);
    vi.stubEnv("CHECKOUT_ADDONS_PROD_READY", "false");
    expect(canChargeCheckoutAddons({})).toBe(false);
    vi.stubEnv("CHECKOUT_ADDONS_PROD_READY", "true");
    expect(canChargeCheckoutAddons({})).toBe(true);
  });
});
