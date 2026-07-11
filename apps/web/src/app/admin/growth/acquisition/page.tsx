import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getAcquisitionData,
  type AcquisitionRow,
} from "@/lib/growth-queries";
import { rate } from "@/lib/growth/metrics";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from "@/components/admin/growth/metric-card";

/** "–" is the standing placeholder for a rate with no denominator. */
function pctCell(value: number | null): string {
  return value === null ? "–" : `${value}%`;
}

function DimensionTable({
  title,
  rows,
  accountsHref,
}: {
  title: string;
  rows: AcquisitionRow[];
  /** When set, each row's accounts count links into the user explorer. */
  accountsHref?: (key: string) => string;
}) {
  const onlyUnknown = rows.length === 1 && rows[0].key === "unknown";
  if (rows.length === 0 || onlyUnknown) {
    return (
      <section className="space-y-3">
        <SectionHeading>{title}</SectionHeading>
        <EmptyState
          text={
            rows.length === 0
              ? "No accounts to attribute yet."
              : `${title} is unknown for every account so far.`
          }
        />
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <SectionHeading>{title}</SectionHeading>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">{title}</th>
              <th className="px-3 py-2 text-right font-medium">Accounts</th>
              <th className="px-3 py-2 text-right font-medium">
                Onboarding completed
              </th>
              <th className="px-3 py-2 text-right font-medium">Activated</th>
              <th className="px-3 py-2 text-right font-medium">
                First request
              </th>
              <th className="px-3 py-2 text-right font-medium">
                First approval
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Retained (active)
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Deposits paid
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">
                  <span className="break-all">
                    {row.key === "unknown" ? "Unknown" : row.key}
                  </span>
                  {row.smallSample && (
                    <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 align-middle text-[10px] text-muted-foreground">
                      Small sample
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {accountsHref ? (
                    <Link
                      href={accountsHref(row.key)}
                      className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                    >
                      {row.accounts}
                    </Link>
                  ) : (
                    row.accounts
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pctCell(row.onboardingCompletedPct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pctCell(row.activationPct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pctCell(row.firstRequestPct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pctCell(row.firstApprovalPct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pctCell(row.retainedPct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.depositsPaid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function GrowthAcquisitionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const data = await getAcquisitionData(context);

  // Keep the selected range in cross-section links so the cockpit stays on
  // one time window while navigating.
  const rangeQuery = new URLSearchParams();
  if (params.range) rangeQuery.set("range", params.range);
  if (params.from) rangeQuery.set("from", params.from);
  if (params.to) rangeQuery.set("to", params.to);
  const rangeSuffix = rangeQuery.toString() ? `&${rangeQuery.toString()}` : "";
  const sourceHref = (key: string) =>
    `/admin/growth/users?source=${encodeURIComponent(key)}${rangeSuffix}`;

  const mobilePct = rate(data.mobileAdoption.withDevices, data.coverage.total);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <RangePicker />
        <p className="text-xs text-muted-foreground">
          Acquisition tables are lifetime cohorts, the selected range does not
          filter them yet.
        </p>
      </div>

      <div className="rounded-md border border-brand-mustard/40 bg-brand-mustard/10 px-4 py-3">
        <p className="text-sm text-foreground">{data.coverage.note}</p>
      </div>

      <DimensionTable
        title="Source"
        rows={data.bySource}
        accountsHref={sourceHref}
      />
      <DimensionTable title="Medium" rows={data.byMedium} />
      <DimensionTable title="Campaign" rows={data.byCampaign} />
      <DimensionTable title="Landing page" rows={data.byLandingPage} />
      <DimensionTable title="Referrer" rows={data.byReferrer} />
      <DimensionTable title="Signup platform" rows={data.bySignupPlatform} />

      <section className="space-y-3">
        <SectionHeading>Mobile adoption</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard
            label="With the mobile app"
            value={data.mobileAdoption.withDevices}
            sub={mobilePct !== null ? `${mobilePct}% of artists` : undefined}
          />
          <MetricCard label="iOS" value={data.mobileAdoption.ios} />
          <MetricCard label="Android" value={data.mobileAdoption.android} />
        </div>
        <p className="text-xs text-muted-foreground">
          Artists seen on both platforms count in both columns.
        </p>
      </section>
    </div>
  );
}
