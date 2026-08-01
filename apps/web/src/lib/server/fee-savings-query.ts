import { serviceClient } from "@/lib/supabase/service";
import { getAccountOverrides } from "@/lib/entitlements-server";
import {
  appointmentTierFromOverrides,
  isGrandfathered,
} from "@/lib/entitlements";
import { canSeeAdvancedAnalytics } from "@/lib/server/entitlement-gates";
import {
  feeMinorUnits,
  type FeeLane,
  type PaymentTier,
} from "@inklee/shared/fee-schedule";
import type { FeeSavingsResult } from "@inklee/shared/fee-savings";

// The tier this artist would resolve to on the OTHER side of a plan change
// (G1, FEE-DSP-001): a Plus artist without a grandfather falls to `free`; one
// who holds the `legacy_free_v1` grant falls to `legacy`, never `free`. Never
// collapse a grandfathered downgrade to `free`: under v2 the Free appointment
// rate is null (cannot transact the lane at all), so `feeMinorUnits` reports 0
// for it, and a legacy artist's real downgrade fallback (the historical 3%)
// would silently price as nothing owed.
export function fallbackTier(
  tier: PaymentTier,
  grandfathered: boolean,
): PaymentTier {
  return tier === "plus" ? (grandfathered ? "legacy" : "free") : "plus";
}

export async function getArtistFeeSavings(
  artistId: string,
  rangeDays: number | null = 90,
): Promise<FeeSavingsResult | null> {
  const overrides = await getAccountOverrides(artistId);
  if (!canSeeAdvancedAnalytics(overrides)) return null;

  // G1: the artist's CURRENT resolved appointment tier, not the raw stored
  // `planTier`. A raw read ignores comp expiry (an expired Plus comp reads
  // `planTier: "plus"` long after `effectivePlanTier` has fallen back to
  // free) and, combined with the old binary free/plus flip below, collapsed a
  // grandfathered artist's downgrade counterfactual to the v2 Free rate
  // (null -> 0) instead of the historical 3% they would actually still owe.
  const tier = appointmentTierFromOverrides(overrides);
  const grandfathered = isGrandfathered(overrides);

  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = rangeDays
    ? new Date(now.getTime() - rangeDays * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;

  let depositQuery = serviceClient
    .from("booking_requests")
    .select(
      "deposit_amount, platform_fee_collected_cents, fee_schedule_version, fee_tier",
    )
    .eq("artist_id", artistId)
    .not("platform_fee_collected_cents", "is", null);

  if (from) {
    depositQuery = depositQuery.gte("deposit_paid_at", `${from}T00:00:00Z`);
  }

  const { data: deposits } = await depositQuery;

  let goodsQuery = serviceClient
    .from("orders")
    .select("subtotal, platform_fee_amount, fee_schedule_version, fee_tier")
    .eq("artist_id", artistId)
    .eq("status", "paid")
    .not("platform_fee_amount", "is", null);

  if (from) {
    goodsQuery = goodsQuery.gte("created_at", `${from}T00:00:00Z`);
  }

  const { data: goods } = await goodsQuery;

  let depositFeesPaid = 0;
  let depositHypothetical = 0;
  let depositTxCount = 0;

  for (const d of deposits ?? []) {
    const fee = (d.platform_fee_collected_cents as number) ?? 0;
    depositFeesPaid += fee;
    depositTxCount++;

    // G2: prefer the tier actually STAMPED on the row at settlement over the
    // artist's current reconstruction (`tier`), so a row settled under a
    // different plan than the artist holds today still gets the right
    // counterfactual. Falls back to `tier` for pre-G2 rows (fee_tier null).
    const rowTier = (d.fee_tier as PaymentTier | null) ?? tier;
    const base = ((d.deposit_amount as number) ?? 0) * 100;
    depositHypothetical += feeMinorUnits({
      baseMinor: base,
      lane: "appointment_payment" as FeeLane,
      tier: fallbackTier(rowTier, grandfathered),
      version: (d.fee_schedule_version as string) ?? undefined,
    });
  }

  let goodsFeesPaid = 0;
  let goodsHypothetical = 0;
  let goodsTxCount = 0;

  for (const g of goods ?? []) {
    const fee = Math.round(((g.platform_fee_amount as number) ?? 0) * 100);
    goodsFeesPaid += fee;
    goodsTxCount++;

    const rowTier = (g.fee_tier as PaymentTier | null) ?? tier;
    const base = Math.round(((g.subtotal as number) ?? 0) * 100);
    goodsHypothetical += feeMinorUnits({
      baseMinor: base,
      lane: "goods" as FeeLane,
      tier: fallbackTier(rowTier, grandfathered),
      version: (g.fee_schedule_version as string) ?? undefined,
    });
  }

  const totalFeesPaid = depositFeesPaid + goodsFeesPaid;
  const hypotheticalTotal = depositHypothetical + goodsHypothetical;
  const feeSaved =
    tier === "plus"
      ? hypotheticalTotal - totalFeesPaid
      : totalFeesPaid - hypotheticalTotal;

  let subscriptionCostCents = 0;
  if (tier === "plus") {
    const { data: sub } = await serviceClient
      .from("billing_subscriptions")
      .select("created_at, current_period_end")
      .eq("artist_id", artistId)
      .eq("status", "active")
      .maybeSingle();

    if (sub) {
      const subStart = new Date(sub.created_at as string);
      const periodStart = from ? new Date(`${from}T00:00:00Z`) : subStart;
      const effectiveStart = subStart > periodStart ? subStart : periodStart;
      const monthsActive = Math.max(
        1,
        Math.ceil(
          (now.getTime() - effectiveStart.getTime()) / (30 * 86_400_000),
        ),
      );
      subscriptionCostCents = monthsActive * 300;
    }
  }

  const { data: earliest } = await serviceClient
    .from("booking_requests")
    .select("deposit_paid_at")
    .eq("artist_id", artistId)
    .not("platform_fee_collected_cents", "is", null)
    .order("deposit_paid_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const dataAvailableSince = earliest
    ? ((earliest.deposit_paid_at as string)?.slice(0, 10) ?? null)
    : null;

  return {
    depositFeesPaidCents: depositFeesPaid,
    goodsFeesPaidCents: goodsFeesPaid,
    totalFeesPaidCents: totalFeesPaid,
    hypotheticalTotalCents: hypotheticalTotal,
    feeSavedCents: feeSaved,
    subscriptionCostCents,
    netBenefitCents: feeSaved - subscriptionCostCents,
    transactionCount: depositTxCount + goodsTxCount,
    period: { from: from ?? dataAvailableSince ?? to, to },
    dataAvailableSince,
  };
}
