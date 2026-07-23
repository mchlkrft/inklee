// Paywall readiness (Slice 76). Per-artist feature flags stored in
// profiles.settings.features JSONB. Everything defaults ON in launch mode —
// these are the single gate points a future plan tier (see docs/business-model.md
// + docs/bio-page-goods-plan.md §8) will flip. NO billing, NO plan enforcement
// here: this only gives us one place to read a flag from.

export type FeatureKey = "goods_module" | "checkout_addons";

export type Features = Record<FeatureKey, boolean>;

export const DEFAULT_FEATURES: Features = {
  goods_module: true,
  checkout_addons: true,
};

const KEYS: FeatureKey[] = ["goods_module", "checkout_addons"];

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
