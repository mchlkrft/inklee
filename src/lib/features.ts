// Paywall readiness (Slice 76). Per-artist feature flags stored in
// profiles.settings.features JSONB. Everything defaults ON in launch mode —
// these are the single gate points a future plan tier (see docs/business-model.md
// + docs/bio-page-goods-plan.md §8) will flip. NO billing, NO plan enforcement
// here: this only gives us one place to read a flag from.

export type FeatureKey =
  | "bio_page_modules"
  | "goods_module"
  | "checkout_addons";

export type Features = Record<FeatureKey, boolean>;

export const DEFAULT_FEATURES: Features = {
  bio_page_modules: true,
  goods_module: true,
  checkout_addons: true,
};

const KEYS: FeatureKey[] = [
  "bio_page_modules",
  "goods_module",
  "checkout_addons",
];

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

export function canUseBioModules(settings: unknown): boolean {
  return featuresFromSettings(settings).bio_page_modules;
}
