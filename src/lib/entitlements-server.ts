import { serviceClient } from "@/lib/supabase/service";
import {
  DEFAULT_OVERRIDES,
  type AccountOverrides,
  type EntitlementFeature,
  type PlanTier,
} from "@/lib/entitlements";

// Slice 81 — server-only read of the service-role `account_overrides` table.
// Kept separate from the pure `entitlements.ts` so the feature list + helpers
// can be imported by client components without pulling the service client (and
// the service-role key) into the browser bundle.

/** Load an artist's overrides (defaults when no row exists). Service-role read. */
export async function getAccountOverrides(
  artistId: string,
): Promise<AccountOverrides> {
  const { data } = await serviceClient
    .from("account_overrides")
    .select(
      "plan_tier, plan_source, plan_expires_at, entitlement_overrides, fee_sponsored, fee_sponsor_expires_at, fee_sponsor_cap_cents, fee_sponsored_used_cents, admin_notes",
    )
    .eq("artist_id", artistId)
    .maybeSingle();

  if (!data) return { ...DEFAULT_OVERRIDES };

  return {
    planTier: (data.plan_tier as PlanTier) ?? "free",
    planSource: (data.plan_source as "comp" | "paid" | null) ?? null,
    planExpiresAt: (data.plan_expires_at as string | null) ?? null,
    entitlementOverrides:
      (data.entitlement_overrides as Partial<
        Record<EntitlementFeature, boolean>
      >) ?? {},
    feeSponsored: (data.fee_sponsored as boolean) ?? false,
    feeSponsorExpiresAt: (data.fee_sponsor_expires_at as string | null) ?? null,
    feeSponsorCapCents: (data.fee_sponsor_cap_cents as number | null) ?? null,
    feeSponsoredUsedCents: (data.fee_sponsored_used_cents as number) ?? 0,
    adminNotes: (data.admin_notes as string | null) ?? null,
  };
}
