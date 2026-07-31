import { serviceClient } from "@/lib/supabase/service";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { canSeeAdvancedAnalytics } from "@/lib/server/entitlement-gates";
import { feeMinorUnits, type FeeLane } from "@inklee/shared/fee-schedule";
import type { FeeSavingsResult } from "@inklee/shared/fee-savings";

export async function getArtistFeeSavings(
  artistId: string,
  rangeDays: number | null = 90,
): Promise<FeeSavingsResult | null> {
  const overrides = await getAccountOverrides(artistId);
  if (!canSeeAdvancedAnalytics(overrides)) return null;

  const tier = overrides.planTier;
  const otherTier = tier === "plus" ? "free" : "plus";

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
      "deposit_amount, platform_fee_collected_cents, fee_schedule_version",
    )
    .eq("artist_id", artistId)
    .not("platform_fee_collected_cents", "is", null);

  if (from) {
    depositQuery = depositQuery.gte("deposit_paid_at", `${from}T00:00:00Z`);
  }

  const { data: deposits } = await depositQuery;

  let goodsQuery = serviceClient
    .from("orders")
    .select("subtotal, platform_fee_amount, fee_schedule_version")
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

    const base = ((d.deposit_amount as number) ?? 0) * 100;
    depositHypothetical += feeMinorUnits({
      baseMinor: base,
      lane: "appointment_payment" as FeeLane,
      tier: otherTier,
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

    const base = Math.round(((g.subtotal as number) ?? 0) * 100);
    goodsHypothetical += feeMinorUnits({
      baseMinor: base,
      lane: "goods" as FeeLane,
      tier: otherTier,
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
