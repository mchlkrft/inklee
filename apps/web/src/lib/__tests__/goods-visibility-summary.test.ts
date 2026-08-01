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

  it("standalone_shop destination's availability does not depend on the platform dark flag or Connect", () => {
    // hubBlock.available tracks the ARTIST's own toggle only (matches
    // goodsDestinationAvailability); the dark-flag / Connect state is
    // reported separately under standaloneShop, never folded into this.
    const h = derive({
      blocks: [goods("standalone_shop")],
      goodsCommerceEnabled: false,
      connectReady: false,
    }).hubBlock;
    expect(h.available).toBe(true);
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

  it("false when only an AVAILABLE hub block is present, everything else hidden", () => {
    // hubBlock.available is the FD8 render gate (artist toggle + module
    // only), deliberately NOT the platform dark flag / Connect readiness —
    // those are reported separately under standaloneShop. So this fixture
    // is a real, if narrow, edge case: the block counts as "published" here
    // even though goodsCommerceEnabled is false and its standalone_shop
    // target would actually 404 for a visitor today. Documented rather than
    // silently papered over — see the FD7/FD8 implementation note.
    const summary = derive({
      hidden: ["shop"],
      blocks: [goods("standalone_shop")],
      goodsCommerceEnabled: false,
    });
    expect(summary.bookingPage.visible).toBe(false);
    expect(summary.standaloneShop.showingProducts).toBe(false);
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
