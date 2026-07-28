import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";

// The founder offer: first 100 eligible Plus subscribers, six-month enrollment
// window, yearly only, non-transferable (founder decision 2026-07-25,
// re-affirmed 2026-07-28).
//
// WHY THIS EXISTS: the first implementation attached the first-year coupon to
// EVERY yearly checkout, which is not the approved offer. It had no cohort cap,
// no window, and no eligibility record, so the discount was universal and
// unbounded. This module is the smallest private server-side eligibility
// mechanism that fixes that; it is deliberately NOT a general promotion-code
// admin, and there is no publicly enterable founder code.
//
// The FRONTEND NEVER DECIDES. Checkout calls resolveFounderOffer() and applies
// the coupon only when it returns eligible, and the decision is recorded with
// its reason so a later dispute can be answered from data.

/** The policy version stamped on every decision, so a later change to the
 *  offer is distinguishable from an earlier one in the record. */
export const FOUNDER_OFFER_POLICY_VERSION = "founder-offer-v1";

/** Cohort cap and window. Commercial terms: founder-only, never adjusted here
 *  without an explicit decision (DECISIONS.md). */
export const FOUNDER_OFFER_MAX_REDEMPTIONS = 100;
export const FOUNDER_OFFER_WINDOW_MONTHS = 6;

export type FounderOfferDecision = {
  eligible: boolean;
  /** Machine-readable reason, recorded and used in tests. */
  reason:
    | "eligible"
    | "not_yearly"
    | "window_closed"
    | "cohort_full"
    | "already_subscribed"
    | "window_not_started"
    | "lookup_failed";
  /** 1-based position in the cohort when eligible; null otherwise. */
  cohortPosition: number | null;
};

/**
 * Decide whether this artist may take the founder offer, server-side.
 *
 * Fails CLOSED: any lookup problem returns ineligible, because wrongly
 * granting a capped lifetime-priced discount is unrecoverable, while wrongly
 * withholding it is a support conversation. That is the opposite posture to
 * the render-path gates, and deliberately so.
 */
export async function resolveFounderOffer(input: {
  artistId: string;
  billingInterval: "monthly" | "yearly";
}): Promise<FounderOfferDecision> {
  const deny = (reason: FounderOfferDecision["reason"]) => ({
    eligible: false,
    reason,
    cohortPosition: null,
  });

  // Yearly only.
  if (input.billingInterval !== "yearly") return deny("not_yearly");

  try {
    const { data: policy, error: policyErr } = await serviceClient
      .from("founder_offer_policy")
      .select("starts_at, ends_at, max_redemptions")
      .eq("policy_version", FOUNDER_OFFER_POLICY_VERSION)
      .maybeSingle();
    if (policyErr) return deny("lookup_failed");
    // No policy row = the offer has not been opened. Fail closed.
    if (!policy) return deny("window_not_started");

    const now = Date.now();
    const startsAt = policy.starts_at
      ? Date.parse(policy.starts_at as string)
      : null;
    const endsAt = policy.ends_at ? Date.parse(policy.ends_at as string) : null;
    if (startsAt !== null && now < startsAt) return deny("window_not_started");
    if (endsAt !== null && now > endsAt) return deny("window_closed");

    // One per account, ever: a cancelled founder subscription does not free a
    // slot and does not let the same account requalify (non-transferable).
    const { data: existing, error: existingErr } = await serviceClient
      .from("founder_offer_redemptions")
      .select("id")
      .eq("artist_id", input.artistId)
      .limit(1);
    if (existingErr) return deny("lookup_failed");
    if ((existing ?? []).length > 0) return deny("already_subscribed");

    const cap =
      (policy.max_redemptions as number | null) ??
      FOUNDER_OFFER_MAX_REDEMPTIONS;
    const { count, error: countErr } = await serviceClient
      .from("founder_offer_redemptions")
      .select("id", { count: "exact", head: true });
    if (countErr) return deny("lookup_failed");
    const taken = count ?? 0;
    if (taken >= cap) return deny("cohort_full");

    return { eligible: true, reason: "eligible", cohortPosition: taken + 1 };
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "founder_offer_resolve" },
      extra: { artistId: input.artistId },
    });
    return deny("lookup_failed");
  }
}

/**
 * Record a redemption. The UNIQUE constraint on the cohort position (migration)
 * is what actually enforces the cap under concurrency: two simultaneous 100th
 * checkouts both read `taken = 99`, both try position 100, and exactly one
 * insert survives. Returns false when this caller lost that race, so the
 * caller must not apply the discount.
 */
export async function recordFounderOfferRedemption(input: {
  artistId: string;
  stripeCustomerId: string | null;
  cohortPosition: number;
  reason: string;
}): Promise<boolean> {
  const { error } = await serviceClient
    .from("founder_offer_redemptions")
    .insert({
      artist_id: input.artistId,
      stripe_customer_id: input.stripeCustomerId,
      cohort_position: input.cohortPosition,
      eligibility_reason: input.reason,
      policy_version: FOUNDER_OFFER_POLICY_VERSION,
    });
  if (!error) return true;
  // 23505 = the position (or the artist) was taken between our read and write.
  if ((error as { code?: string }).code === "23505") return false;
  Sentry.captureException(error, {
    tags: { action: "founder_offer_record" },
    extra: { artistId: input.artistId },
  });
  return false;
}
