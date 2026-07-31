import { describe, it, expect } from "vitest";
import {
  BUNDLE_NAME_MAX,
  MAX_BUNDLE_ITEMS,
  normalizeBundleName,
  validateBundleName,
  validateBundlePrice,
  isBundlePublic,
  liveBundles,
  archivedBundles,
  canDeleteBundle,
  bundleSavings,
  type Bundle,
} from "@inklee/shared/bundles";

function bundle(over: Partial<Bundle> = {}): Bundle {
  return {
    id: "b1",
    name: "Starter kit",
    priceAmount: 40,
    currency: "eur",
    position: 0,
    isPublicVisible: true,
    archivedAt: null,
    ...over,
  };
}

describe("bundle name", () => {
  it("normalises whitespace and caps length", () => {
    expect(normalizeBundleName("  Winter   drop  ")).toBe("Winter drop");
    expect(normalizeBundleName("x".repeat(BUNDLE_NAME_MAX + 20))).toHaveLength(
      BUNDLE_NAME_MAX,
    );
    expect(normalizeBundleName(42)).toBe("");
  });

  it("rejects too-short names", () => {
    expect(validateBundleName("")).toBeTruthy();
    expect(validateBundleName("a")).toBeTruthy();
    expect(validateBundleName("Kit")).toBeNull();
  });
});

describe("bundle price", () => {
  it("accepts non-negative finite amounts, rejects the rest", () => {
    expect(validateBundlePrice(0)).toBeNull();
    expect(validateBundlePrice(40)).toBeNull();
    expect(validateBundlePrice(-1)).toBeTruthy();
    expect(validateBundlePrice(Number.NaN)).toBeTruthy();
    expect(validateBundlePrice(Infinity)).toBeTruthy();
  });
});

describe("bundle visibility + lists", () => {
  it("is public only when visible AND not archived", () => {
    expect(isBundlePublic(bundle())).toBe(true);
    expect(isBundlePublic(bundle({ isPublicVisible: false }))).toBe(false);
    expect(isBundlePublic(bundle({ archivedAt: "2026-07-31" }))).toBe(false);
  });

  it("splits live vs archived and sorts by position", () => {
    const list = [
      bundle({ id: "b", position: 2 }),
      bundle({ id: "a", position: 1 }),
      bundle({ id: "z", position: 0, archivedAt: "2026-07-31" }),
    ];
    expect(liveBundles(list).map((b) => b.id)).toEqual(["a", "b"]);
    expect(archivedBundles(list).map((b) => b.id)).toEqual(["z"]);
  });
});

describe("canDeleteBundle (archive-first, B4)", () => {
  it("allows delete only once archived, regardless of item count", () => {
    expect(canDeleteBundle(bundle(), 0)).toBe(false); // empty but LIVE -> no
    expect(canDeleteBundle(bundle(), 3)).toBe(false); // live -> no
    expect(canDeleteBundle(bundle({ archivedAt: "2026-07-31" }), 3)).toBe(true);
    expect(canDeleteBundle(bundle({ archivedAt: "2026-07-31" }))).toBe(true);
  });
});

describe("bundleSavings (display only)", () => {
  it("computes the saving vs the component list-price sum", () => {
    const s = bundleSavings(40, [
      { priceAmount: 20, quantity: 1 },
      { priceAmount: 16, quantity: 2 }, // 32
    ]);
    expect(s.componentTotal).toBe(52);
    expect(s.savingsAmount).toBe(12);
    expect(s.savingsPercent).toBe(23); // round(12/52*100)
    expect(s.isSaving).toBe(true);
  });

  it("never shows a negative saving when the bundle costs more than the parts", () => {
    const s = bundleSavings(60, [{ priceAmount: 20, quantity: 1 }]);
    expect(s.savingsAmount).toBe(0);
    expect(s.savingsPercent).toBe(0);
    expect(s.isSaving).toBe(false);
  });

  it("handles zero component total and non-finite inputs safely", () => {
    const s = bundleSavings(40, []);
    expect(s).toEqual({
      componentTotal: 0,
      savingsAmount: 0,
      savingsPercent: 0,
      isSaving: false,
    });
    const t = bundleSavings(Number.NaN, [
      { priceAmount: Number.NaN, quantity: 2 },
      { priceAmount: 10, quantity: Number.NaN },
    ]);
    expect(t.componentTotal).toBe(0);
    expect(t.savingsAmount).toBe(0);
  });
});

describe("MAX_BUNDLE_ITEMS", () => {
  it("is a sane payload bound", () => {
    expect(MAX_BUNDLE_ITEMS).toBeGreaterThan(0);
    expect(MAX_BUNDLE_ITEMS).toBeLessThanOrEqual(100);
  });
});
