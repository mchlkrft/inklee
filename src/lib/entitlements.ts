// Slice 81 — entitlement + fee-sponsorship engine (PURE: no DB import, so this
// is safe to import from client components for the feature list + types). The
// service-role read lives in `entitlements-server.ts`. Derives what an artist
// can access + whether their deposit fees are currently sponsored by Inklee.

export type PlanTier = "free" | "plus";

// Feature keys gated by plan/entitlement. `deposits` (in-app Stripe-connected
// card deposit collection) is the one enforced today; the rest are the Solo
// Plus feature set that lands with the paid billing slice (placeholders so the
// override UI + canAccess() are ready for them).
export const ENTITLEMENT_FEATURES = [
  "deposits",
  "branding",
  "custom_templates",
  "extra_fields",
  "extra_trips",
  "analytics",
] as const;
export type EntitlementFeature = (typeof ENTITLEMENT_FEATURES)[number];

// Baseline features granted by each plan tier (before per-account overrides).
const PLAN_FEATURES: Record<PlanTier, readonly EntitlementFeature[]> = {
  free: [],
  plus: ENTITLEMENT_FEATURES,
};

export type AccountOverrides = {
  planTier: PlanTier;
  planSource: "comp" | "paid" | null;
  planExpiresAt: string | null;
  entitlementOverrides: Partial<Record<EntitlementFeature, boolean>>;
  feeSponsored: boolean;
  feeSponsorExpiresAt: string | null;
  feeSponsorCapCents: number | null;
  feeSponsoredUsedCents: number;
  adminNotes: string | null;
};

export const DEFAULT_OVERRIDES: AccountOverrides = {
  planTier: "free",
  planSource: null,
  planExpiresAt: null,
  entitlementOverrides: {},
  feeSponsored: false,
  feeSponsorExpiresAt: null,
  feeSponsorCapCents: null,
  feeSponsoredUsedCents: 0,
  adminNotes: null,
};

function notExpired(iso: string | null): boolean {
  return !iso || new Date(iso).getTime() > Date.now();
}

/** The plan that's actually in effect right now (an expired comp falls to free). */
export function effectivePlanTier(o: AccountOverrides): PlanTier {
  if (o.planTier === "plus" && notExpired(o.planExpiresAt)) return "plus";
  return "free";
}

/** An explicit per-feature override always wins; otherwise the plan baseline. */
export function canAccess(
  o: AccountOverrides,
  feature: EntitlementFeature,
): boolean {
  const override = o.entitlementOverrides[feature];
  if (typeof override === "boolean") return override;
  return PLAN_FEATURES[effectivePlanTier(o)].includes(feature);
}

/** True when Inklee is currently covering this artist's deposit fee (active,
 *  not expired, and under the optional spend cap). */
export function isFeeSponsorshipActive(o: AccountOverrides): boolean {
  if (!o.feeSponsored) return false;
  if (!notExpired(o.feeSponsorExpiresAt)) return false;
  if (
    o.feeSponsorCapCents !== null &&
    o.feeSponsoredUsedCents >= o.feeSponsorCapCents
  ) {
    return false;
  }
  return true;
}

/** Remaining sponsorship budget in cents (null = unlimited). */
export function sponsorshipRemainingCents(o: AccountOverrides): number | null {
  if (o.feeSponsorCapCents === null) return null;
  return Math.max(0, o.feeSponsorCapCents - o.feeSponsoredUsedCents);
}
