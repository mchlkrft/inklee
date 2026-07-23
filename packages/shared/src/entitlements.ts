// Slice 81 — entitlement + fee-sponsorship engine (PURE: no DB import, so this
// is safe to import from client components for the feature list + types). The
// service-role read lives in `entitlements-server.ts`. Derives what an artist
// can access + whether their deposit fees are currently sponsored by Inklee.
//
// BM-2.0 (2026-07-23) extended this engine, without changing any existing
// behaviour, for the account-tier work (docs/product/account-and-entitlement-
// system.md): numeric LIMITS alongside boolean features, an entitlement SCOPE
// type (personal vs studio) for the ratified multi-studio model, and a
// tier-widening guard so a future `studio` tier value is a deliberate addition
// rather than a silent downgrade. Storage for per-account limit overrides and
// studio-scoped holders is a later phase; the engine is ready for them.

export type PlanTier = "free" | "plus";

// The known plan tiers, so wire/boundary code can detect an UNKNOWN (future)
// value (e.g. "studio" arriving at an old build) and handle it deliberately
// instead of silently resolving it to free. See `isKnownPlanTier`.
export const KNOWN_PLAN_TIERS: readonly PlanTier[] = ["free", "plus"];

/** True when `value` is a plan tier this build understands. A false result on a
 *  non-empty string means a newer tier reached older code: the caller should
 *  decide (usually: treat as the closest known tier, or prompt for an update),
 *  NOT assume free. `effectivePlanTier` still fails safe to free, but this lets
 *  a caller notice the widening rather than absorb it. */
export function isKnownPlanTier(value: unknown): value is PlanTier {
  return (
    typeof value === "string" && KNOWN_PLAN_TIERS.includes(value as PlanTier)
  );
}

// The scope an entitlement is resolved against. Ratified D3 (2026-07-23): a
// studio is an organization + entitlement scope reached through individual user
// accounts, not a separate account type; a user may own, administer, join, or
// visit one or more studios. Personal and studio subscriptions, roles, and
// entitlements stay separate, so they resolve against separate holders through
// this SAME engine: an `AccountOverrides` object represents ONE scope's state.
// Studio-scoped storage is greenfield (migration plan Phase 6+); the type is
// defined now so callers and the resolver are shaped for it.
export type EntitlementScope =
  | { kind: "personal" }
  | { kind: "studio"; studioId: string };

export const PERSONAL_SCOPE: EntitlementScope = { kind: "personal" };

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

// Numeric limit keys. Unlike boolean features these express "how many", so a
// generous Free cap can lift on Plus without crippling the free tier (the
// business-model.md §3.1/§3.2 model). `limitFor` returns the cap; nothing
// enforces it yet (migration plan Phase 3 wires create-time checks). The
// NUMBERS below are the business-model.md suggestions and are PROVISIONAL
// pending the founder's final free-cap decision (register D14) — because
// nothing reads them yet, changing them is a one-line, zero-risk edit.
export const ENTITLEMENT_LIMITS = [
  "custom_fields",
  "active_trips",
  "studio_library",
] as const;
export type EntitlementLimit = (typeof ENTITLEMENT_LIMITS)[number];

// Baseline features granted by each plan tier (before per-account overrides).
const PLAN_FEATURES: Record<PlanTier, readonly EntitlementFeature[]> = {
  free: [],
  plus: ENTITLEMENT_FEATURES,
};

// Baseline numeric limits per tier. `null` = unlimited. Free caps DECIDED by the
// founder 2026-07-23 (3 / 3 active trips / 5). Plus: active_trips = 100 DECIDED;
// custom_fields = 30 and studio_library = 50 are PROPOSED pending confirm. Still
// enforced nowhere (Stage 2 wires create-time checks), so changing a number is a
// one-line, zero-risk edit.
const PLAN_LIMITS: Record<PlanTier, Record<EntitlementLimit, number | null>> = {
  free: {
    custom_fields: 3,
    active_trips: 3,
    studio_library: 5,
  },
  plus: {
    custom_fields: 30, // proposed, pending confirm
    active_trips: 100, // decided
    studio_library: 50, // proposed, pending confirm
  },
};

// Why an account is on its current plan. `paid` = a Stripe subscription (written
// by the billing workstream); `comp` = an admin grant; `grandfathered` = the
// legacy_free_v1 cohort (durably anchored by policyId, NOT by this label, which
// billing overwrites on upgrade); `beta` = a beta cohort; `store` reserved for a
// future in-app-purchase source (not built; billing is web-only, D17).
export type GrantSource = "comp" | "paid" | "store" | "grandfathered" | "beta";

// The declarative manifest of what a policy grant (e.g. legacy_free_v1)
// preserved. The APPLIED values live in entitlementOverrides + limitOverrides;
// this is the audit/restore record so a downgrade can re-apply the exact package.
export type GrantPackage = {
  features?: Partial<Record<EntitlementFeature, boolean>>;
  limits?: Partial<Record<EntitlementLimit, number | null>>;
};

export type AccountOverrides = {
  planTier: PlanTier;
  planSource: GrantSource | null;
  planExpiresAt: string | null;
  entitlementOverrides: Partial<Record<EntitlementFeature, boolean>>;
  // Per-account numeric limit overrides (beat the tier baseline). A value of
  // `null` means "unlimited for this account". Storage lands in migration 0105
  // (account_overrides.limit_overrides).
  limitOverrides?: Partial<Record<EntitlementLimit, number | null>>;
  feeSponsored: boolean;
  feeSponsorExpiresAt: string | null;
  feeSponsorCapCents: number | null;
  feeSponsoredUsedCents: number;
  adminNotes: string | null;
  // Stage 2 billing state (migration 0105). Read-only in the engine; written by
  // the billing workstream's Stripe webhook. Optional so adding them is
  // non-breaking (undefined before the reader is extended). The engine resolves
  // access from planTier/planExpiresAt, which the webhook keeps current, so it
  // never needs to inspect these directly.
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  // Stage 2 grandfather / grant provenance (migration 0105). policyId is the
  // durable cohort anchor (survives an upgrade to Plus).
  policyId?: string | null;
  grantedAt?: string | null;
  cutoverTs?: string | null;
  grantExpiresAt?: string | null;
  grantReason?: string | null;
  grantPackage?: GrantPackage | null;
};

export const DEFAULT_OVERRIDES: AccountOverrides = {
  planTier: "free",
  planSource: null,
  planExpiresAt: null,
  entitlementOverrides: {},
  limitOverrides: {},
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

/** The numeric cap for a limited feature (null = unlimited). A per-account
 *  override wins over the tier baseline. Returns the cap only; the create-time
 *  enforcement (block-new, keep-existing-read-only on downgrade) lives at the
 *  server core that owns the resource (migration plan Phase 3). */
export function limitFor(
  o: AccountOverrides,
  key: EntitlementLimit,
): number | null {
  const override = o.limitOverrides?.[key];
  if (override !== undefined) return override;
  return PLAN_LIMITS[effectivePlanTier(o)][key];
}

/** True when `count` is still under the cap for `key` (an unlimited cap always
 *  passes). Convenience for the eventual create-time gate; nothing calls it yet. */
export function withinLimit(
  o: AccountOverrides,
  key: EntitlementLimit,
  count: number,
): boolean {
  const cap = limitFor(o, key);
  return cap === null || count < cap;
}

// --- Provenance: why a feature/limit is (not) granted. Pure, so admin server
// code and any UI share one answer. Lets the admin panel render, e.g.,
// "custom templates available because grandfathered under legacy_free_v1". ---

export type GrantVia = "override" | "grandfather" | "plan" | "none";

export type FeatureProvenance = {
  granted: boolean;
  via: GrantVia;
  policyId?: string;
};

/** Why `feature` is (or is not) granted, mirroring canAccess precedence: an
 *  explicit admin override wins; an override that came FROM a policy package
 *  (present in grantPackage.features with a policyId set) is attributed to the
 *  grandfather; otherwise the plan baseline. */
export function explainFeature(
  o: AccountOverrides,
  feature: EntitlementFeature,
): FeatureProvenance {
  const override = o.entitlementOverrides[feature];
  if (typeof override === "boolean") {
    const fromPolicy =
      override === true &&
      !!o.policyId &&
      o.grantPackage?.features?.[feature] === true;
    return {
      granted: override,
      via: fromPolicy ? "grandfather" : "override",
      ...(fromPolicy ? { policyId: o.policyId ?? undefined } : {}),
    };
  }
  const byPlan = PLAN_FEATURES[effectivePlanTier(o)].includes(feature);
  return { granted: byPlan, via: byPlan ? "plan" : "none" };
}

export type LimitProvenance = {
  cap: number | null;
  via: "override" | "grandfather" | "plan";
  policyId?: string;
};

/** Why `key` has its cap: a per-account override wins; an override equal to the
 *  grant-package value with a policyId set is a grandfather cap; else the plan
 *  baseline. */
export function explainLimit(
  o: AccountOverrides,
  key: EntitlementLimit,
): LimitProvenance {
  const override = o.limitOverrides?.[key];
  if (override !== undefined) {
    const pkg = o.grantPackage?.limits?.[key];
    const fromPolicy = !!o.policyId && pkg !== undefined && pkg === override;
    return {
      cap: override,
      via: fromPolicy ? "grandfather" : "override",
      ...(fromPolicy ? { policyId: o.policyId ?? undefined } : {}),
    };
  }
  return { cap: PLAN_LIMITS[effectivePlanTier(o)][key], via: "plan" };
}

/** True when the account belongs to any grandfather cohort (a policy grant). */
export function isGrandfathered(o: AccountOverrides): boolean {
  return !!o.policyId;
}

/** The override fields to write when a grandfathered account leaves a paid plan
 *  (subscription downgrade). Restores the cohort's `grantPackage` so the account
 *  returns to its grandfather state, not bare Free. Returns null for a
 *  non-grandfathered account (the caller then does a plain Free downgrade).
 *
 *  `planSource` reverts to 'grandfathered' (billing overwrites it to 'paid' on
 *  upgrade; policyId, the DURABLE anchor, is what survives and drives this).
 *
 *  The overrides MERGE the package (base) with the account's LIVE overrides
 *  (winning on key conflict). entitlement_overrides / limit_overrides are a
 *  SHARED column also written by admin actions, so a wholesale replace would
 *  silently reverse an audited admin grant or suppression. Merging restores any
 *  package key that was genuinely cleared while on Plus, while preserving admin
 *  decisions. Pass the live values in; omit them and it behaves as a plain
 *  package restore. */
export function restoreGrandfatherPackage(o: {
  policyId?: string | null;
  grantPackage?: GrantPackage | null;
  /** The account's LIVE overrides (admin decisions), merged over the package. */
  entitlementOverrides?: Partial<Record<EntitlementFeature, boolean>>;
  limitOverrides?: Partial<Record<EntitlementLimit, number | null>>;
}): {
  planSource: GrantSource;
  entitlementOverrides: Partial<Record<EntitlementFeature, boolean>>;
  limitOverrides: Partial<Record<EntitlementLimit, number | null>>;
} | null {
  if (!o.policyId) return null;
  const pkg = o.grantPackage ?? {};
  return {
    planSource: "grandfathered",
    entitlementOverrides: {
      ...(pkg.features ?? {}),
      ...(o.entitlementOverrides ?? {}),
    },
    limitOverrides: { ...(pkg.limits ?? {}), ...(o.limitOverrides ?? {}) },
  };
}

/** The durable grandfather policy identifier for the launch-cutover Free cohort. */
export const LEGACY_FREE_V1 = "legacy_free_v1";

/** Compute the `legacy_free_v1` grandfather package from an artist's cutover-era
 *  usage. The cohort keeps custom-template EDITING (genuinely available to free
 *  artists before enforcement) and any per-limit count that EXCEEDS the Free cap
 *  (so an existing over-cap count stays usable and replaceable; a count within
 *  the cap needs no override, as the Free baseline already covers it). `branding`
 *  (a new Plus perk) and `analytics` (gated for all, no grandfather) are NOT
 *  granted. This is the manifest stored in account_overrides.grant_package and
 *  applied to entitlement_overrides / limit_overrides at backfill. */
export function computeLegacyFreeV1Grant(
  counts: Partial<Record<EntitlementLimit, number>>,
): GrantPackage {
  const limits: Partial<Record<EntitlementLimit, number | null>> = {};
  for (const key of ENTITLEMENT_LIMITS) {
    const cap = PLAN_LIMITS.free[key];
    const count = counts[key] ?? 0;
    if (cap !== null && count > cap) limits[key] = count;
  }
  return { features: { custom_templates: true }, limits };
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
