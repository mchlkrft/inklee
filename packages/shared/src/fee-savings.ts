export type FeeSavingsResult = {
  depositFeesPaidCents: number;
  goodsFeesPaidCents: number;
  totalFeesPaidCents: number;
  hypotheticalTotalCents: number;
  feeSavedCents: number;
  subscriptionCostCents: number;
  netBenefitCents: number;
  transactionCount: number;
  period: { from: string; to: string };
  dataAvailableSince: string | null;
};

export function formatCentsEur(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toFixed(2);
  return cents < 0 ? `-€${formatted}` : `€${formatted}`;
}
