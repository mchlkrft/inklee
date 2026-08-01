import {
  canUseGoods,
  shopCheckoutEnabled,
  isGoodsCommerceEnabled,
} from "@/lib/features";
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
 * to the teaser can only be as available as the teaser itself.
 *
 * "standalone_shop" is the artist's own toggle AND the platform park switch.
 * The park switch belongs here, correcting the FD8 brief's literal formula
 * (gap found by the implementing worker and fixed the same day): the
 * standalone route calls `notFound()` while `GOODS_COMMERCE_ENABLED` is off,
 * so a block whose destination is "available" without it links every visitor
 * to a 404 — and since a NEW block defaults to standalone_shop, that is the
 * default state, with no editor warning, for as long as the flag stays dark.
 * "Available" has to mean a visitor can actually land on it.
 *
 * Connect readiness is deliberately NOT here: an artist who is not
 * charge-ready still has a real, browsable shop page (it renders the products
 * and explains it cannot take card orders yet), so hiding the hub link would
 * hide a working surface. The FD7 summary reports charge-readiness separately.
 *
 * The park switch is INJECTED with a defaulted read, the same shape as
 * `productAvailability(..., nowMs = Date.now())`: the function stays pure and
 * testable, the summary passes the value it already holds so both agree by
 * construction, and the three server callers get the env read for free. It is
 * a non-public env var, so a client caller would read undefined and fail SAFE
 * to unavailable rather than over-promising.
 */
export function goodsDestinationAvailability(
  settings: unknown,
  bioPage: BioPageSettings,
  goodsCommerceEnabled: boolean = isGoodsCommerceEnabled(),
): Record<BioGoodsDestination, boolean> {
  return {
    standalone_shop: shopCheckoutEnabled(settings) && goodsCommerceEnabled,
    booking_page: canUseGoods(settings) && isModuleVisible(bioPage, "shop"),
  };
}
