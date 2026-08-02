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
  bundleMixesCustomMade,
  validateBundleCustomMadeMix,
  MIXED_CUSTOM_MADE_BUNDLE_ERROR,
  resolveBundleComponent,
  type Bundle,
  type BundleComponentResolution,
  type BundleComponentCatalogInfo,
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
 *  count, plus the RESOLVED sellable unit (null when it did not resolve). No
 *  variant in play for these fixtures — `productHasActiveVariants: false`, so
 *  `component_needs_variant` never fires and every existing assertion below
 *  exercises exactly the pre-FD6 behaviour. */
function comp(
  quantity: number,
  stock: number | null,
  customMade = false,
): BundleComponentResolution {
  return {
    quantity,
    variantId: null,
    productHasActiveVariants: false,
    resolved: { stock },
    customMade,
  };
}
const MISSING: BundleComponentResolution = {
  quantity: 1,
  variantId: null,
  productHasActiveVariants: false,
  resolved: null,
  customMade: false,
};

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
      expect(bundlePurchasable(bundle(), [comp(q, 0)])).toEqual({
        ok: false,
        reason: "component_out_of_stock",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// FD6: variant-aware bundles, supersedes GC7's blanket refusal of any
// variant-bearing component. A bundle slot now carries the ARTIST's fixed
// variant choice; the rule narrows from "any active variant on the product
// refuses the whole bundle" to "a product that NEEDS a choice and got none".

function variantComp(
  over: Partial<BundleComponentResolution> = {},
): BundleComponentResolution {
  return {
    quantity: 1,
    variantId: "v1",
    productHasActiveVariants: true,
    resolved: { stock: 10 },
    customMade: false,
    ...over,
  };
}

describe("bundlePurchasable: variant-aware components (FD6)", () => {
  it("sells a variant-bearing product when a variant IS selected and its stock suffices", () => {
    // Positive control: without it, every refusal below could also be a
    // function that refuses every variant-bearing product outright (GC7's
    // old, now-superseded behaviour).
    expect(bundlePurchasable(bundle(), [variantComp()])).toEqual({ ok: true });
  });

  it("refuses component_needs_variant when the product needs a choice and the slot has none", () => {
    // FAILS IF this check is dropped: an un-selectable slot would fall through
    // to the stock check below, which (with resolved stock null->unlimited or
    // a stale parent quantity) can pass and sell an ambiguous good.
    expect(
      bundlePurchasable(
        bundle(),
        [variantComp({ variantId: null, resolved: null })],
        1,
      ),
    ).toEqual({ ok: false, reason: "component_needs_variant" });
  });

  it("null variant on a product with NO active variants is fine (product-level stock)", () => {
    // FAILS IF `component_needs_variant` fires whenever variantId is null,
    // rather than only when the product actually requires a choice: every
    // pre-FD6 no-variant bundle would break.
    expect(
      bundlePurchasable(bundle(), [
        variantComp({
          variantId: null,
          productHasActiveVariants: false,
          resolved: { stock: 3 },
        }),
      ]),
    ).toEqual({ ok: true });
  });

  it("consults the VARIANT's stock, not some other number, for the boundary", () => {
    // Two per bundle, one bundle wanted, variant stock exactly enough.
    expect(
      bundlePurchasable(bundle(), [
        variantComp({ quantity: 2, resolved: { stock: 2 } }),
      ]),
    ).toEqual({ ok: true });
    // FAILS IF the stock check is skipped for variant-selected components (a
    // regression a blanket-refuse-then-remove-the-check rewrite could
    // introduce): one short must still refuse.
    expect(
      bundlePurchasable(bundle(), [
        variantComp({ quantity: 2, resolved: { stock: 1 } }),
      ]),
    ).toEqual({ ok: false, reason: "component_out_of_stock" });
  });

  it("component_needs_variant is checked BEFORE component_unavailable", () => {
    // An un-selectable slot with resolved: null must report the specific
    // reason, not the generic "unavailable" one — a later reader debugging a
    // "why won't my bundle sell" report needs to see WHICH gate fired.
    expect(
      bundlePurchasable(bundle(), [
        variantComp({ variantId: null, resolved: null }),
      ]),
    ).toEqual({ ok: false, reason: "component_needs_variant" });
  });
});

// ---------------------------------------------------------------------------
// Counsel Q2 (2026-08-02): a bundle is ALL custom-made or ALL standard. This
// REPLACES the withdrawn engineering rule "any custom-made component makes the
// whole bundle non-returnable" — that rule suppressed a real return right on
// the standard components, which is the Art. 10 direction to avoid.

describe("bundleMixesCustomMade (counsel Q2)", () => {
  it("allows an all-standard and an all-custom-made bundle", () => {
    // The DISTINCTION control, first: a rule that refused every composition
    // would pass every refusal test below and ship a bundle feature that can
    // never save anything.
    expect(bundleMixesCustomMade([{ customMade: false }])).toBe(false);
    expect(
      bundleMixesCustomMade([{ customMade: false }, { customMade: false }]),
    ).toBe(false);
    expect(
      bundleMixesCustomMade([{ customMade: true }, { customMade: true }]),
    ).toBe(false);
    expect(validateBundleCustomMadeMix([{ customMade: true }])).toBeNull();
  });

  it("refuses a mix, in either order", () => {
    // FAILS IF the rule degrades to "any custom-made component" (the
    // withdrawn one): that predicate is true for [custom, custom] too, so the
    // all-custom case above would start refusing.
    expect(
      bundleMixesCustomMade([{ customMade: true }, { customMade: false }]),
    ).toBe(true);
    expect(
      bundleMixesCustomMade([{ customMade: false }, { customMade: true }]),
    ).toBe(true);
    expect(
      validateBundleCustomMadeMix([
        { customMade: true },
        { customMade: false },
      ]),
    ).toBe(MIXED_CUSTOM_MADE_BUNDLE_ERROR);
  });

  it("an empty component list does not mix", () => {
    expect(bundleMixesCustomMade([])).toBe(false);
    expect(validateBundleCustomMadeMix([])).toBeNull();
  });

  it("the artist-facing message obeys the house copy rules", () => {
    // FAILS IF someone reintroduces an em-dash while rewording it.
    expect(MIXED_CUSTOM_MADE_BUNDLE_ERROR).not.toContain("—");
    expect(MIXED_CUSTOM_MADE_BUNDLE_ERROR.endsWith(".")).toBe(true);
  });
});

describe("bundlePurchasable refuses a mixed bundle (counsel Q2)", () => {
  it("sells an all-custom-made bundle and an all-standard one", () => {
    // Positive control: without it, the refusal below is also satisfied by a
    // gate that refuses every custom-made bundle, which would silently make
    // custom-made products unbundleable.
    expect(
      bundlePurchasable(bundle(), [comp(1, 5, true), comp(1, 5, true)]),
    ).toEqual({ ok: true });
    expect(
      bundlePurchasable(bundle(), [comp(1, 5, false), comp(1, 5, false)]),
    ).toEqual({ ok: true });
  });

  it("refuses a bundle whose components disagree, even when everything is in stock", () => {
    // FAILS IF the composition check is dropped: every other gate passes here
    // (public, non-empty, no variants needed, stock ample), so the bundle
    // would sell under the withdrawn "whole bundle non-returnable" rule.
    expect(
      bundlePurchasable(bundle(), [comp(1, 5, true), comp(1, 5, false)]),
    ).toEqual({ ok: false, reason: "component_mixed_custom_made" });
  });

  it("reports the AVAILABILITY reason first when a component also did not resolve", () => {
    // An unresolved component reads as standard (there is no catalog row to
    // read a flag from), so checking composition first would report a mix
    // that is really an availability problem and hide the useful reason.
    expect(bundlePurchasable(bundle(), [comp(1, 5, true), MISSING])).toEqual({
      ok: false,
      reason: "component_unavailable",
    });
  });
});

describe("resolveBundleComponent (FD6)", () => {
  const TWO_VARIANTS: BundleComponentCatalogInfo = {
    available: true,
    activeVariants: [
      { id: "v1", stock: 5 },
      { id: "v2", stock: 0 },
    ],
    productStock: null,
  };
  const NO_VARIANTS: BundleComponentCatalogInfo = {
    available: true,
    activeVariants: [],
    productStock: 7,
  };

  it("resolves the SPECIFIC variant's stock when the id matches this product's own list", () => {
    expect(resolveBundleComponent("v1", TWO_VARIANTS)).toEqual({
      productHasActiveVariants: true,
      resolved: { stock: 5 },
    });
  });

  it("refuses (resolved: null) a variant id that is not in THIS product's active list", () => {
    // Covers both the cross-product case (an id that belongs to some other
    // product entirely) and the "exists but not active" case (hidden /
    // sold-out variants are pre-filtered out of activeVariants by the
    // caller) — either way the lookup is scoped to `info.activeVariants` and
    // a non-member id simply does not match. FAILS IF this becomes a global
    // lookup instead of a scoped `.find` over THIS product's own list, which
    // would let a bundle slot resolve against another product's variant.
    expect(
      resolveBundleComponent("unknown-or-foreign-variant", TWO_VARIANTS),
    ).toEqual({ productHasActiveVariants: true, resolved: null });
  });

  it("null variant + product HAS active variants -> un-selectable, not product-level stock", () => {
    // FAILS IF this falls back to `info.productStock`: a variant-stocked
    // parent's own quantity is null/stale by design (0035), so this branch
    // existing is exactly what GC7 existed to prevent — selling the ambiguous
    // parent as if picking a variant were optional.
    expect(resolveBundleComponent(null, TWO_VARIANTS)).toEqual({
      productHasActiveVariants: true,
      resolved: null,
    });
  });

  it("null variant + product has NO active variants -> product-level stock", () => {
    expect(resolveBundleComponent(null, NO_VARIANTS)).toEqual({
      productHasActiveVariants: false,
      resolved: { stock: 7 },
    });
  });

  it("an unavailable product resolves to null regardless of variant selection", () => {
    const unavailable: BundleComponentCatalogInfo = {
      ...TWO_VARIANTS,
      available: false,
    };
    // Drops (SHOP-DROP-001) and status gates apply before variant resolution
    // even matters. FAILS IF `available` is not checked first: an undropped
    // or archived product's variant would still resolve and sell.
    expect(resolveBundleComponent("v1", unavailable)).toEqual({
      productHasActiveVariants: true,
      resolved: null,
    });
  });

  it("a missing component product (info: null) resolves to null with no active variants", () => {
    expect(resolveBundleComponent("v1", null)).toEqual({
      productHasActiveVariants: false,
      resolved: null,
    });
  });
});

describe("MAX_BUNDLE_ITEMS", () => {
  it("is a sane payload bound", () => {
    expect(MAX_BUNDLE_ITEMS).toBeGreaterThan(0);
    expect(MAX_BUNDLE_ITEMS).toBeLessThanOrEqual(100);
  });
});
