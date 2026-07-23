import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  DEFAULT_OVERRIDES,
  type AccountOverrides,
  type EntitlementFeature,
  type EntitlementLimit,
  type GrantPackage,
  type GrantSource,
  type PlanTier,
} from "@/lib/entitlements";

// Slice 81 — server-only read of the service-role `account_overrides` table.
// Kept separate from the pure `entitlements.ts` so the feature list + helpers
// can be imported by client components without pulling the service client (and
// the service-role key) into the browser bundle.
//
// Reads the full row including the Stage 2 billing + grandfather columns
// (migration 0105, applied 2026-07-23), so the engine's limit, grandfather, and
// provenance helpers resolve correctly. Every added column is optional on
// AccountOverrides, so mapping them is non-breaking.

/** Load an artist's overrides (defaults when no row exists). Service-role read.
 *
 *  THROWS when the read itself fails. A failed query is NOT the same thing as
 *  "this artist has no overrides row": swallowing it would resolve a comped
 *  Plus artist to the free plan, and `requestDeposit` would then quietly issue
 *  a MANUAL deposit to their client with no card payment and no trace of why.
 *  Callers that only display state may let this reach their error boundary
 *  (every one of those pages does other service-role reads that would fail on
 *  the same blip); the money path catches it and asks the artist to retry. */
export async function getAccountOverrides(
  artistId: string,
): Promise<AccountOverrides> {
  const { data, error } = await serviceClient
    .from("account_overrides")
    .select(
      "plan_tier, plan_source, plan_expires_at, entitlement_overrides, limit_overrides, subscription_status, current_period_end, cancel_at_period_end, policy_id, granted_at, cutover_ts, grant_expires_at, grant_reason, grant_package, fee_sponsored, fee_sponsor_expires_at, fee_sponsor_cap_cents, fee_sponsored_used_cents, admin_notes",
    )
    .eq("artist_id", artistId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "get_account_overrides" },
      extra: { artistId },
    });
    throw new Error(`Failed to read account overrides: ${error.message}`);
  }

  // maybeSingle() returns data:null with error:null for a genuinely absent
  // row, which is the real "no overrides yet, free plan" case.
  if (!data) return { ...DEFAULT_OVERRIDES };

  return {
    planTier: (data.plan_tier as PlanTier) ?? "free",
    planSource: (data.plan_source as GrantSource | null) ?? null,
    planExpiresAt: (data.plan_expires_at as string | null) ?? null,
    entitlementOverrides:
      (data.entitlement_overrides as Partial<
        Record<EntitlementFeature, boolean>
      >) ?? {},
    limitOverrides:
      (data.limit_overrides as Partial<
        Record<EntitlementLimit, number | null>
      >) ?? {},
    feeSponsored: (data.fee_sponsored as boolean) ?? false,
    feeSponsorExpiresAt: (data.fee_sponsor_expires_at as string | null) ?? null,
    feeSponsorCapCents: (data.fee_sponsor_cap_cents as number | null) ?? null,
    feeSponsoredUsedCents: (data.fee_sponsored_used_cents as number) ?? 0,
    adminNotes: (data.admin_notes as string | null) ?? null,
    // Stage 2 billing state (0105).
    subscriptionStatus: (data.subscription_status as string | null) ?? null,
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: (data.cancel_at_period_end as boolean) ?? false,
    // Stage 2 grandfather / grant provenance (0105).
    policyId: (data.policy_id as string | null) ?? null,
    grantedAt: (data.granted_at as string | null) ?? null,
    cutoverTs: (data.cutover_ts as string | null) ?? null,
    grantExpiresAt: (data.grant_expires_at as string | null) ?? null,
    grantReason: (data.grant_reason as string | null) ?? null,
    grantPackage: (data.grant_package as GrantPackage | null) ?? null,
  };
}
