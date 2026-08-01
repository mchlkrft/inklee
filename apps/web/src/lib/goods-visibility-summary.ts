import type { BioBlock, BioPageSettings } from "@/lib/bio-page-settings";
import type { BioGoodsDestination } from "@inklee/shared/bio-page";
import { goodsDestinationAvailability } from "@/lib/goods-visibility";

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
  const availability = goodsDestinationAvailability(
    input.settings,
    input.bioPage,
  );
  const goods = input.blocks.find(
    (b): b is Extract<BioBlock, { type: "goods" }> => b.type === "goods",
  );

  const bookingPage = { visible: availability.booking_page };

  const toggleOn = availability.standalone_shop;
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
