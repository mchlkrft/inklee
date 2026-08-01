import { canUseGoods, shopCheckoutEnabled } from "@/lib/features";
import { isModuleVisible, type BioPageSettings } from "@/lib/bio-page-settings";
import type { BioGoodsDestination } from "@inklee/shared/bio-page";

/**
 * Per-destination availability for the hub's "goods" feature block (founder
 * ruling FD8, 2026-08-01). Independent of which destination the ARTIST has
 * selected: this only answers whether EACH one could currently take a
 * visitor, so:
 *  - the public render (hub-feature-data.ts) can decide whether the block's
 *    OWN selection is available, without re-deriving the two ANDs itself;
 *  - the editor (web link-hub form + native) can warn when the artist's
 *    saved selection is not currently available, and the visibility summary
 *    (/goods) can report the same state, all from one place.
 *
 * "booking_page" reuses EXACTLY the booking-page shop teaser's own gate
 * (`isModuleVisible(bioPage, "shop") && canUseGoods`) — the pre-FD8 S4
 * cascade this replaces used the same condition, since a block deep-linking
 * to the teaser can only be as available as the teaser itself. "standalone_shop"
 * is the artist's own toggle (`shopCheckoutEnabled`); this does NOT factor in
 * the platform-wide `GOODS_COMMERCE_ENABLED` dark flag or Stripe Connect
 * readiness, both of which govern whether the standalone shop can take an
 * ORDER, not whether it is the artist's chosen surface to show products on
 * (the FD7 visibility summary reports those separately).
 */
export function goodsDestinationAvailability(
  settings: unknown,
  bioPage: BioPageSettings,
): Record<BioGoodsDestination, boolean> {
  return {
    standalone_shop: shopCheckoutEnabled(settings),
    booking_page: canUseGoods(settings) && isModuleVisible(bioPage, "shop"),
  };
}
