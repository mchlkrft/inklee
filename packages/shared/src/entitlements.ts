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
 *  not expired, and the budget is not already exhausted).
 *
 *  NOTE: this answers "is sponsorship switched on", not "can it pay for a
 *  specific deposit". Use `canSponsorFeeCents` at the point where a fee is
 *  actually waived. */
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

/** Whether the remaining budget can cover THIS fee in full.
 *
 *  Sponsorship is all-or-nothing per deposit: `application_fee_amount` is fixed
 *  when the PaymentIntent is created and Stripe cannot partially waive it
 *  afterwards. Gating only on "the budget is not exhausted yet"
 *  (`isFeeSponsorshipActive`) therefore lets a single deposit blow past the cap
 *  by almost its entire fee: with a 50.00 cap and 49.50 already used, a deposit
 *  carrying a 10.00 fee would still be fully sponsored. Deciding against the
 *  actual fee keeps every individual waiver inside the budget.
 *
 *  Residual, accepted: the counter only moves at settlement, so deposits that
 *  are requested before earlier ones settle are each measured against the same
 *  remaining budget and can collectively overshoot. Bounded by the fees of
 *  the sponsored deposits outstanding at one time, and visible in the admin
 *  panel, which reports the overshoot rather than hiding it. */
export function canSponsorFeeCents(
  o: AccountOverrides,
  feeCents: number,
): boolean {
  if (!isFeeSponsorshipActive(o)) return false;
  const remaining = sponsorshipRemainingCents(o);
  if (remaining === null) return true; // no cap set = unlimited budget
  return remaining >= feeCents;
}

/** Remaining sponsorship budget in cents (null = unlimited). Never negative;
 *  use `sponsorshipOverspentCents` to see a cap that was exceeded. */
export function sponsorshipRemainingCents(o: AccountOverrides): number | null {
  if (o.feeSponsorCapCents === null) return null;
  return Math.max(0, o.feeSponsorCapCents - o.feeSponsoredUsedCents);
}

/** How far past the cap this artist's sponsorship has actually settled, in
 *  cents. 0 when inside budget or uncapped. Surfaced in admin so a cap that was
 *  overshot by concurrent settlements is visible rather than silently clamped. */
export function sponsorshipOverspentCents(o: AccountOverrides): number {
  if (o.feeSponsorCapCents === null) return 0;
  return Math.max(0, o.feeSponsoredUsedCents - o.feeSponsorCapCents);
}

/** Whole days until a plan with an expiry lapses: negative once expired, null
 *  when the plan is open-ended or the account is not on Plus. Source-agnostic
 *  on purpose (an expiry lapses a plan whatever paid for it), so callers must
 *  word their copy from `planSource` rather than assuming a comp. Drives the
 *  admin expiry warnings, so the roster and the account page agree on one
 *  rule. */
export function daysUntilPlanExpiry(o: AccountOverrides): number | null {
  if (o.planTier !== "plus" || !o.planExpiresAt) return null;
  const ms = new Date(o.planExpiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}
