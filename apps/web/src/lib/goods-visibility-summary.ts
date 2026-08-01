import type { BioBlock, BioPageSettings } from "@/lib/bio-page-settings";
import type { BioGoodsDestination } from "@inklee/shared/bio-page";
import { goodsDestinationAvailability } from "@/lib/goods-visibility";
import { shopCheckoutEnabled } from "@/lib/features";

/**
 * The artist's at-a-glance visibility state across every surface goods can
 * appear on (founder ruling FD7, 2026-08-01, CONFIRMS S2's non-cascading
 * model and adds this required summary). Pure state derivation only — the
 * /goods page reads it and a .tsx card renders it; this file carries no
 * copy, so the summary's WORDING can change without touching this logic
 * (and this logic stays covered by vitest, whose include, src/**\/*.test.ts,
 * does not run .tsx render code in this project).
 */
export type GoodsVisibilitySummary = {
  /** The booking page's shop teaser (`hidden:["shop"]` + `canUseGoods`). */
  bookingPage: { visible: boolean };
  standaloneShop: {
    /** The artist's own toggle (`features.shop_checkout` && `goods_module`). */
    toggleOn: boolean;
    /** The platform-wide `GOODS_COMMERCE_ENABLED` dark flag. False here is
     *  never the artist's fault — the summary must say so plainly. */
    commerceLive: boolean;
    /** Stripe Connect charge-readiness (`deriveConnectRouting.routeCharges`). */
    connectReady: boolean;
    /** Whether the standalone shop page currently shows anything to a
     *  visitor at all: the artist's toggle, the platform flag, AND Connect
     *  readiness all gate the page's own render (shop/checkout/page.tsx
     *  404s on the first two, shows no products without the third). */
    showingProducts: boolean;
  };
  hubBlock: {
    present: boolean;
    destination: BioGoodsDestination | null;
    /** Whether the block's SELECTED destination is currently reachable. */
    available: boolean;
  };
  /** True when NONE of the three surfaces would currently show a product to
   *  a visitor — the artist's goods are not published anywhere. */
  publishedNowhere: boolean;
};

export function deriveGoodsVisibilitySummary(input: {
  settings: unknown;
  bioPage: BioPageSettings;
  blocks: BioBlock[];
  /** `isGoodsCommerceEnabled()` — read by the caller, kept out of this pure
   *  function so it stays testable without touching `process.env`. */
  goodsCommerceEnabled: boolean;
  /** `deriveConnectRouting(...).routeCharges` — same reasoning: caller reads
   *  Stripe state, this function only combines booleans. */
  connectReady: boolean;
}): GoodsVisibilitySummary {
  // The flag is threaded in rather than re-read, so the summary and the hub
  // render can never disagree about whether standalone_shop is available
  // (supervisor fix on the FD8 slice: "available" must mean a visitor can
  // actually land on it, and the standalone route 404s while the park switch
  // is off).
  const availability = goodsDestinationAvailability(
    input.settings,
    input.bioPage,
    input.goodsCommerceEnabled,
  );
  const goods = input.blocks.find(
    (b): b is Extract<BioBlock, { type: "goods" }> => b.type === "goods",
  );

  const bookingPage = { visible: availability.booking_page };

  // `toggleOn` reports the ARTIST's own switch alone, deliberately NOT the
  // composed availability: the summary's job is telling the artist which of
  // the three conditions is the one holding their shop back, so the platform
  // flag and Connect readiness stay separate lines below.
  const toggleOn = shopCheckoutEnabled(input.settings);
  const showingProducts =
    toggleOn && input.goodsCommerceEnabled && input.connectReady;
  const standaloneShop = {
    toggleOn,
    commerceLive: input.goodsCommerceEnabled,
    connectReady: input.connectReady,
    showingProducts,
  };

  const hubBlock = {
    present: !!goods,
    destination: goods?.destination ?? null,
    available: goods ? availability[goods.destination] : false,
  };

  const publishedNowhere =
    !bookingPage.visible &&
    !standaloneShop.showingProducts &&
    !(hubBlock.present && hubBlock.available);

  return { bookingPage, standaloneShop, hubBlock, publishedNowhere };
}
