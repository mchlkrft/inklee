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
  bundlePurchasable,
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

// ---------------------------------------------------------------------------
// bundlePurchasable (GC6): the SALE rule, which is deliberately stricter than
// the display rule. Display may omit a hidden component and understate the
// saving; the checkout must refuse to charge for a bundle it cannot fulfil
// whole. Everything below is arithmetic the money path depends on, so each test
// names the source change that turns it red.

/** A component as the caller hands it over: the bundle-declared per-bundle
 *  count, plus the product AS RESOLVED against the sellable catalog (null when
 *  it did not resolve). */
function comp(quantity: number, stock: number | null) {
  return { quantity, product: { stock } };
}
const MISSING = { quantity: 1, product: null };

describe("bundlePurchasable (sale rule, GC6)", () => {
  it("refuses a hidden or archived bundle, and the SAME components sell on a public one", () => {
    const components = [comp(1, 10)];
    // Positive control first: without it, every assertion below would also pass
    // on a function that refused everything.
    expect(bundlePurchasable(bundle(), components)).toEqual({ ok: true });

    // FAILS IF the `isBundlePublic` guard is dropped: a bundle the artist has
    // hidden, or archived, becomes sellable to anyone who crafts its id into
    // the selections payload.
    expect(
      bundlePurchasable(bundle({ isPublicVisible: false }), components),
    ).toEqual({ ok: false, reason: "not_public" });
    expect(
      bundlePurchasable(bundle({ archivedAt: "2026-07-31" }), components),
    ).toEqual({ ok: false, reason: "not_public" });
  });

  it("refuses a bundle with no components", () => {
    // FAILS IF the `components.length === 0` guard is dropped: the loop over an
    // empty list finds nothing to object to and the bundle sells for its price
    // while shipping nothing.
    expect(bundlePurchasable(bundle(), [])).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("refuses when a component did not resolve against the sellable catalog", () => {
    // The caller passes product:null for a component that is missing, archived,
    // hidden or otherwise unsellable. FAILS IF the `!c.product` guard is
    // dropped: `c.product.stock` would throw, or (with optional chaining) a
    // hidden product would read as unlimited stock and sell.
    expect(bundlePurchasable(bundle(), [comp(1, 10), MISSING])).toEqual({
      ok: false,
      reason: "component_unavailable",
    });
    // Unavailability is decided before stock: a null product has no stock to
    // compare, so the reason must be the specific one.
    expect(bundlePurchasable(bundle(), [MISSING, comp(1, 0)])).toEqual({
      ok: false,
      reason: "component_unavailable",
    });
  });

  it("stock boundary: exactly enough sells, one less refuses", () => {
    // Two per bundle, one bundle wanted.
    expect(bundlePurchasable(bundle(), [comp(2, 2)], 1)).toEqual({ ok: true });
    // FAILS IF the comparison loosens to `stock <= perBundle * wanted` or the
    // whole stock check goes: the shop oversells a component it does not have.
    expect(bundlePurchasable(bundle(), [comp(2, 1)], 1)).toEqual({
      ok: false,
      reason: "component_out_of_stock",
    });
  });

  it("the LINE quantity multiplies the per-bundle requirement", () => {
    // Two per bundle x three bundles = six needed.
    expect(bundlePurchasable(bundle(), [comp(2, 6)], 3)).toEqual({ ok: true });
    // FAILS IF the `* wanted` multiplication is dropped from the stock
    // comparison. That mutant is invisible at lineQuantity 1, which is why the
    // boundary test above cannot catch it and this one exists: a buyer ordering
    // three bundles would clear a stock check sized for one.
    expect(bundlePurchasable(bundle(), [comp(2, 5)], 3)).toEqual({
      ok: false,
      reason: "component_out_of_stock",
    });
  });

  it("null stock is UNLIMITED and never blocks a sale", () => {
    // FAILS IF null stock is coerced to 0 (`(stock ?? 0) < ...`): every
    // untracked product, which is the default for a product with no inventory
    // management, would report its bundle permanently out of stock.
    expect(bundlePurchasable(bundle(), [comp(5, null)], 10)).toEqual({
      ok: true,
    });
  });

  it("sanitises a hostile or absent line quantity to 1", () => {
    // Stock 0 against a per-bundle count of 1: the sanitised answer is always
    // "out of stock". FAILS IF `Math.max(1, ...)` / the finite check is dropped
    // — `0 < 1 * NaN`, `0 < 1 * 0` and `0 < 1 * -3` are all false, so each of
    // these payloads would sell a component with zero stock.
    for (const q of [Number.NaN, 0, -3]) {
      expect(bundlePurchasable(bundle(), [comp(1, 0)], q)).toEqual({
        ok: false,
        reason: "component_out_of_stock",
      });
    }
    // Infinity clamps DOWN to 1 rather than propagating: with five in stock the
    // sale stands. Fails if the non-finite branch is removed, because
    // `5 < Infinity` would refuse a perfectly good order.
    expect(bundlePurchasable(bundle(), [comp(1, 5)], Infinity)).toEqual({
      ok: true,
    });
    // The default is 1, not 0 (a 0 default would make every stock check pass).
    expect(bundlePurchasable(bundle(), [comp(1, 0)])).toEqual({
      ok: false,
      reason: "component_out_of_stock",
    });
  });

  it("sanitises a non-finite or non-positive COMPONENT quantity to 1", () => {
    // Same shape one level down: a corrupt product_bundle_items.quantity must
    // not disable the stock check for that component. FAILS IF the per-component
    // `Math.max(1, ...)` / finite guard is dropped: `0 < NaN` and `0 < 0` are
    // both false, so a zero-stock component would sell.
    for (const q of [Number.NaN, 0, -2]) {
      expect(
        bundlePurchasable(bundle(), [{ quantity: q, product: { stock: 0 } }]),
      ).toEqual({ ok: false, reason: "component_out_of_stock" });
    }
  });
});

describe("MAX_BUNDLE_ITEMS", () => {
  it("is a sane payload bound", () => {
    expect(MAX_BUNDLE_ITEMS).toBeGreaterThan(0);
    expect(MAX_BUNDLE_ITEMS).toBeLessThanOrEqual(100);
  });
});
