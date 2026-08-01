// Paywall readiness (Slice 76). Per-artist feature flags stored in
// profiles.settings.features JSONB. Everything defaults ON in launch mode —
// these are the single gate points a future plan tier (see docs/business-model.md
// + docs/bio-page-goods-plan.md §8) will flip. NO billing, NO plan enforcement
// here: this only gives us one place to read a flag from.

export type FeatureKey = "goods_module" | "checkout_addons" | "shop_checkout";

export type Features = Record<FeatureKey, boolean>;

export const DEFAULT_FEATURES: Features = {
  goods_module: true,
  checkout_addons: true,
  // Standalone shop checkout (decision S2, Plus build C5). Joins the existing
  // features keys rather than becoming a bio-page module: it gates the
  // STANDALONE /[slug]/shop/checkout page, not anything rendered inside the
  // booking page. Default ON while goods_module is on, matching every other
  // key here — visibility hygiene, not a paywall.
  shop_checkout: true,
};

const KEYS: FeatureKey[] = ["goods_module", "checkout_addons", "shop_checkout"];

export function parseFeatures(raw: unknown): Features {
  const out: Features = { ...DEFAULT_FEATURES };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of KEYS) {
      if (typeof o[k] === "boolean") out[k] = o[k];
    }
  }
  return out;
}

/** Read flags out of a profile.settings JSONB blob (where `.features` lives). */
export function featuresFromSettings(settings: unknown): Features {
  if (settings && typeof settings === "object") {
    return parseFeatures((settings as Record<string, unknown>).features);
  }
  return { ...DEFAULT_FEATURES };
}

export function canUseGoods(settings: unknown): boolean {
  return featuresFromSettings(settings).goods_module;
}

export function canUseCheckoutAddons(settings: unknown): boolean {
  return featuresFromSettings(settings).checkout_addons;
}

/**
 * Whether the artist's STANDALONE shop (`/[slug]/shop/checkout`) may take
 * orders (decision S2, Plus build C5). Distinct from `canUseGoods`, which
 * gates the booking-page shop teaser and product display generally: an
 * artist can keep the goods module on (products still show on their booking
 * page and Hub) while turning the standalone, no-appointment-needed checkout
 * off. Requires goods_module on AND shop_checkout not explicitly false, so
 * turning the whole goods module off also turns the standalone shop off
 * without needing two flags flipped.
 *
 * This is visibility, not the money park switch: `isGoodsCommerceEnabled()`
 * still gates whether the standalone path can charge at all. Both must be
 * checked at every money-path entry point (page, action, core) per the
 * SHOP-VIS-001 lesson: a page-only filter never protects the money path.
 */
export function shopCheckoutEnabled(settings: unknown): boolean {
  const f = featuresFromSettings(settings);
  return f.goods_module && f.shop_checkout;
}

/**
 * Production money gate. The per-artist `checkout_addons` flag is the first
 * layer; the second is a deployment-wide opt-in that has to be set explicitly
 * once Stripe Connect (OT-12) ships per locked decision D3. Without that
 * server-side signal, production fails closed regardless of the artist's
 * own toggle. Non-production environments (dev, preview, vitest) trust the
 * per-artist flag alone so the goods checkout flow stays exercisable.
 *
 * Set `CHECKOUT_ADDONS_PROD_READY=true` in the production environment to
 * lift the second layer.
 */
export function canChargeCheckoutAddons(settings: unknown): boolean {
  if (!canUseCheckoutAddons(settings)) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.CHECKOUT_ADDONS_PROD_READY === "true";
}

// There is intentionally NO bio-page / Linklee-hub feature flag here. The bio
// hub is a PERMANENTLY FREE feature by founder decision (docs/product/
// account-and-entitlement-system.md; the inklee-hub-feature decision), not a
// future paywall gate. The former `bio_page_modules` flag + `canUseBioModules`
// helper were dead placeholders (read nowhere in web, mobile, or shared code)
// and were removed in BM-2.0 so nothing implies a bio paywall exists. Do not
// reintroduce a bio flag unless a real, server-enforced bio entitlement ships.
//
// RECONCILED 2026-07-28 with the confirmed Plus package (plus-product-spec.md
// section 3), which defines a Free AND a Plus Inklee page. The two decisions do
// not conflict: the HUB ITSELF stays permanently free and fully functional
// (unlimited links, custom text sections, a professionally designed default
// layout, and the spec's explicit "do not deliberately make the Free page
// visually poor"). What Plus adds is CUSTOMIZATION on top: layout templates,
// the custom appearance layer, and the rich blocks. That is gated by the
// server-enforced `appearance_custom` / `page_templates` entitlements, which is
// exactly the "real, server-enforced entitlement" this note asked for. Still no
// flag gating the hub's existence, and there must never be one.

/**
 * RS-3 master park switch (money-scope reset 2026-06-03). Parks the PAYABLE
 * goods path: the appointment add-on checkout (customer-portal payable list)
 * and goods `orders` are gated behind this single deployment flag, default
 * OFF. Bio-page product *display* (the Shop overlay showcase, dashboard goods
 * CRUD) stays on regardless.
 *
 * 78a/DT-11 (2026-06-04): goods INTEREST-marking was decoupled out of this
 * switch. Add-to-cart on the showcase, `booking_interests` capture, the
 * artist's interest view, and the Accept-time availability popup now ride on
 * the per-artist goods module (`canUseGoods`), NOT this flag — they carry no
 * money. Only the payable add-on checkout + orders remain parked here.
 *
 * Set `GOODS_COMMERCE_ENABLED=true` to un-park the in-app goods-sales flow.
 * Kept as a flag rather than deleted so the commerce layer can be restored
 * without rebuilding it from git history (founder decision D-c, 2026-06-03).
 */
export function isGoodsCommerceEnabled(): boolean {
  return process.env.GOODS_COMMERCE_ENABLED === "true";
}

/**
 * Inklee 2.0 automated seed import (the second lane of the map seeding tool).
 * Default OFF: with the flag unset, the automated lane refuses to run and the
 * admin panel hides its trigger; the manual seeding workflow is unaffected
 * either way. One flag gates the whole lane (run trigger, API route, CLI).
 */
export function isAutomatedSeedImportEnabled(): boolean {
  return process.env.AUTOMATED_SEED_IMPORT_ENABLED === "true";
}
