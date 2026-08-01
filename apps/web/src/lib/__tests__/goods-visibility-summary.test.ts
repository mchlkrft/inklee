import { describe, it, expect } from "vitest";
import { deriveGoodsVisibilitySummary } from "../goods-visibility-summary";
import { parseBioPageSettings } from "../bio-page-settings";
import type { BioGoodsBlock } from "@inklee/shared/bio-page";

// FD7 (founder ruling, 2026-08-01): the /goods visibility summary must
// derive each surface's state honestly, including the platform-wide
// GOODS_COMMERCE_ENABLED dark flag ("not the artist's fault") and the
// "published nowhere" overall state.

const goods = (
  destination: "standalone_shop" | "booking_page",
): BioGoodsBlock => ({
  id: "g1",
  type: "goods",
  destination,
});

function derive(
  over: {
    settings?: unknown;
    hidden?: string[];
    blocks?: BioGoodsBlock[];
    goodsCommerceEnabled?: boolean;
    connectReady?: boolean;
  } = {},
) {
  const bioPage = parseBioPageSettings({ hidden: over.hidden ?? [] });
  return deriveGoodsVisibilitySummary({
    settings: over.settings ?? {},
    bioPage,
    blocks: over.blocks ?? [],
    goodsCommerceEnabled: over.goodsCommerceEnabled ?? false,
    connectReady: over.connectReady ?? false,
  });
}

describe("deriveGoodsVisibilitySummary — bookingPage", () => {
  it("visible by default", () => {
    expect(derive().bookingPage.visible).toBe(true);
  });

  it("hidden when the shop teaser is hidden", () => {
    expect(derive({ hidden: ["shop"] }).bookingPage.visible).toBe(false);
  });
});

describe("deriveGoodsVisibilitySummary — standaloneShop", () => {
  it("toggleOn reflects the artist's own flag, independent of the platform flag", () => {
    const summary = derive({
      settings: { features: { shop_checkout: false } },
      goodsCommerceEnabled: true,
      connectReady: true,
    });
    expect(summary.standaloneShop.toggleOn).toBe(false);
    expect(summary.standaloneShop.showingProducts).toBe(false);
  });

  it("commerceLive mirrors the platform dark flag verbatim (not the artist's fault)", () => {
    expect(
      derive({ goodsCommerceEnabled: false }).standaloneShop.commerceLive,
    ).toBe(false);
    expect(
      derive({ goodsCommerceEnabled: true }).standaloneShop.commerceLive,
    ).toBe(true);
  });

  it("showingProducts requires ALL THREE: toggle, platform flag, and Connect readiness", () => {
    const allThree = derive({ goodsCommerceEnabled: true, connectReady: true });
    expect(allThree.standaloneShop.showingProducts).toBe(true);

    expect(
      derive({ goodsCommerceEnabled: false, connectReady: true }).standaloneShop
        .showingProducts,
    ).toBe(false);
    expect(
      derive({ goodsCommerceEnabled: true, connectReady: false }).standaloneShop
        .showingProducts,
    ).toBe(false);
    expect(
      derive({
        settings: { features: { shop_checkout: false } },
        goodsCommerceEnabled: true,
        connectReady: true,
      }).standaloneShop.showingProducts,
    ).toBe(false);
  });
});

describe("deriveGoodsVisibilitySummary — hubBlock", () => {
  it("absent when there is no goods block", () => {
    const h = derive().hubBlock;
    expect(h).toEqual({ present: false, destination: null, available: false });
  });

  it("present + available when its destination is reachable", () => {
    const h = derive({ blocks: [goods("booking_page")] }).hubBlock;
    expect(h).toEqual({
      present: true,
      destination: "booking_page",
      available: true,
    });
  });

  it("present but unavailable when its selected destination is hidden — reports that destination, not the other one", () => {
    const h = derive({
      hidden: ["shop"],
      blocks: [goods("booking_page")],
    }).hubBlock;
    expect(h.present).toBe(true);
    expect(h.destination).toBe("booking_page");
    expect(h.available).toBe(false);
  });

  it("a standalone_shop block is NOT available while the park switch is off (the link would 404)", () => {
    // Supervisor fix on this slice, replacing a test that pinned the opposite
    // and documented it as a known gap. hubBlock.available must mean "a
    // visitor can land on it": the standalone route notFound()s while
    // GOODS_COMMERCE_ENABLED is off. Connect readiness is deliberately still
    // NOT folded in (a not-charge-ready artist has a real, browsable shop
    // page that explains it cannot take card orders yet), so this asserts
    // BOTH halves of that distinction in one test.
    expect(
      derive({
        blocks: [goods("standalone_shop")],
        goodsCommerceEnabled: false,
        connectReady: false,
      }).hubBlock.available,
    ).toBe(false);
    expect(
      derive({
        blocks: [goods("standalone_shop")],
        goodsCommerceEnabled: true,
        connectReady: false,
      }).hubBlock.available,
    ).toBe(true);
  });

  it("the artist's own toggle line still reports the toggle alone, not the composed availability", () => {
    // standaloneShop.toggleOn exists to tell the artist WHICH condition is
    // holding their shop back; folding the park switch into it would report
    // "you turned it off" when they did not. Fails if toggleOn is ever wired
    // to the composed availability.
    const s = derive({ goodsCommerceEnabled: false }).standaloneShop;
    expect(s.toggleOn).toBe(true);
    expect(s.commerceLive).toBe(false);
    expect(s.showingProducts).toBe(false);
  });
});

describe("deriveGoodsVisibilitySummary — publishedNowhere", () => {
  it("true when nothing is visible anywhere", () => {
    expect(
      derive({ hidden: ["shop"], goodsCommerceEnabled: false })
        .publishedNowhere,
    ).toBe(true);
  });

  it("false when the booking page alone is visible", () => {
    expect(derive().publishedNowhere).toBe(false);
  });

  it("false when only the standalone shop is fully live", () => {
    const summary = derive({
      hidden: ["shop"], // booking-page teaser off; goods_module stays on so
      // the standalone toggle (which requires it too) is unaffected
      goodsCommerceEnabled: true,
      connectReady: true,
    });
    expect(summary.bookingPage.visible).toBe(false);
    expect(summary.standaloneShop.showingProducts).toBe(true);
    expect(summary.publishedNowhere).toBe(false);
  });

  it("TRUE when the only surface is a hub block whose target is parked (nothing a visitor can reach)", () => {
    // This replaces a test that asserted publishedNowhere:false here and
    // documented the wrongness in a comment. With the park switch folded into
    // availability, the honest answer is that the artist is published
    // NOWHERE: the teaser is hidden and the block's standalone target 404s.
    // Telling them "you are published" while every route is dead is the exact
    // failure the FD7 summary exists to prevent.
    const summary = derive({
      hidden: ["shop"],
      blocks: [goods("standalone_shop")],
      goodsCommerceEnabled: false,
    });
    expect(summary.bookingPage.visible).toBe(false);
    expect(summary.standaloneShop.showingProducts).toBe(false);
    expect(summary.hubBlock.available).toBe(false);
    expect(summary.publishedNowhere).toBe(true);
  });

  it("false once the park switch is on and the hub block's target is reachable", () => {
    const summary = derive({
      hidden: ["shop"],
      blocks: [goods("standalone_shop")],
      goodsCommerceEnabled: true,
    });
    expect(summary.hubBlock.available).toBe(true);
    expect(summary.publishedNowhere).toBe(false);
  });

  it("a present but UNAVAILABLE hub block does not count as published", () => {
    const summary = derive({
      hidden: ["shop"],
      settings: { features: { goods_module: false } },
      blocks: [goods("booking_page")],
      goodsCommerceEnabled: false,
    });
    expect(summary.hubBlock.present).toBe(true);
    expect(summary.hubBlock.available).toBe(false);
    expect(summary.publishedNowhere).toBe(true);
  });
});
