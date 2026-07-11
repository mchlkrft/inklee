import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { getGrowthContext, getRetentionData } from "@/lib/growth-queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import { CohortHeatmap } from "@/components/admin/growth/cohort-heatmap";
import type { RetentionState } from "@/lib/growth/types";

/** "–" is the standing placeholder for a rate with no denominator. */
function pctCell(value: number | null): string {
  return value === null ? "–" : `${value}%`;
}

export default async function GrowthRetentionPage({
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
  const data = await getRetentionData(context);
  const t = data.thresholds;

  // Keep the selected range in cross-section links so the cockpit stays on
  // one time window while navigating.
  const rangeQuery = new URLSearchParams();
  if (params.range) rangeQuery.set("range", params.range);
  if (params.from) rangeQuery.set("from", params.from);
  if (params.to) rangeQuery.set("to", params.to);
  const rangeQS = rangeQuery.toString();
  const rangeSuffix = rangeQS ? `&${rangeQS}` : "";

  // Definitions mirror classifyRetention in src/lib/growth/retention.ts;
  // the numbers come from the configurable thresholds, never hardcoded.
  const stateCards: {
    state: RetentionState;
    label: string;
    definition: string;
  }[] = [
    {
      state: "active",
      label: "Active",
      definition: `Activated, with activity in the last ${t.activeDays} days. Quiet spells up to ${t.churnRiskDays} days still count as active.`,
    },
    {
      state: "churn_risk",
      label: "Churn risk",
      definition: `Activated, silent for more than ${t.churnRiskDays} days but fewer than ${t.dormantDays}.`,
    },
    {
      state: "dormant",
      label: "Dormant",
      definition: `Activated, silent for at least ${t.dormantDays} days but fewer than ${t.churnedDays}.`,
    },
    {
      state: "churned",
      label: "Churned",
      definition: `Activated, silent for ${t.churnedDays} days or more.`,
    },
    {
      state: "pre_activation",
      label: "Pre-activation",
      definition:
        "Never activated. Silence before first value does not count as churn.",
    },
  ];

  const sourceRows = [...data.bySource].sort((a, b) => b.artists - a.artists);
  const onlyUnknownSource =
    sourceRows.length === 1 && sourceRows[0].source === "unknown";

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <RangePicker />
        <p className="text-xs text-muted-foreground">
          Retention reads from a trailing lookback ending today; the selected
          range carries into links but does not filter this page.
        </p>
      </div>

      <section className="space-y-3">
        <SectionHeading>Retention states</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {stateCards.map((card) => (
            <Link
              key={card.state}
              href={`/admin/growth/users?retention=${card.state}${rangeSuffix}`}
              className="rounded-md border border-border p-4 transition-colors hover:bg-muted/30"
            >
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {data.stateCounts[card.state]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {card.definition}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="rounded-md border border-brand-mustard/40 bg-brand-mustard/10 px-4 py-3">
        <p className="text-sm text-foreground">{data.historyNote}</p>
      </div>

      <section className="space-y-6">
        <div className="rounded-md border border-border p-5 space-y-4">
          <SectionHeading>All artists by claim month</SectionHeading>
          <CohortHeatmap
            cohorts={data.cohortsAll}
            caption="Each cell currently shows the share of the cohort with meaningful activity in the 7 days from that checkpoint after the claim date. Dash cells are checkpoint windows not reached yet, not zeros."
          />
        </div>
        <div className="rounded-md border border-border p-5 space-y-4">
          <SectionHeading>Activated artists only</SectionHeading>
          <CohortHeatmap
            cohorts={data.cohortsActivated}
            caption="Same reading, restricted to artists who reached activation: share with meaningful activity in the 7 days from each checkpoint. Dash cells are checkpoint windows not reached yet, not zeros."
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Recently reactivated</SectionHeading>
          <p className="text-xs text-muted-foreground">
            Artists with a meaningful-activity day after at least{" "}
            {t.reactivationGapDays} quiet days.
          </p>
          {data.reactivated.length > 0 ? (
            <ul className="divide-y divide-border">
              {data.reactivated.map((artist) => (
                <li key={artist.id}>
                  <Link
                    href={`/admin/accounts/${artist.id}`}
                    className="flex items-baseline justify-between gap-3 py-2.5 transition-colors hover:bg-muted/30"
                  >
                    <span className="text-sm text-foreground">
                      {artist.displayName}
                      {artist.slug && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          /{artist.slug}
                        </span>
                      )}
                    </span>
                    <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {artist.reactivatedOn
                        ? `Returned ${artist.reactivatedOn}`
                        : "Return date unknown"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="No artists have reactivated in the recent lookback window." />
          )}
        </div>

        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Retention by acquisition source</SectionHeading>
          {sourceRows.length === 0 || onlyUnknownSource ? (
            <EmptyState
              text={
                sourceRows.length === 0
                  ? "No artists to group by source yet."
                  : "Acquisition source is unknown for every artist so far."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Artists
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Currently active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((row) => (
                    <tr key={row.source} className="border-t border-border">
                      <td className="px-3 py-2 text-foreground">
                        <span className="break-all">
                          {row.source === "unknown" ? "Unknown" : row.source}
                        </span>
                        {row.smallSample && (
                          <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 align-middle text-[10px] text-muted-foreground">
                            Small sample
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Link
                          href={`/admin/growth/users?source=${encodeURIComponent(row.source)}${rangeSuffix}`}
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                        >
                          {row.artists}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pctCell(row.activePct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Differences between sources are associations, not evidence that a
            source causes retention.
          </p>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Retention thresholds (active, churn risk, dormant, churned, reactivation
        gap) are configurable on{" "}
        <Link
          href={`/admin/growth/settings${rangeQS ? `?${rangeQS}` : ""}`}
          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
        >
          growth settings
        </Link>
        .
      </p>
    </div>
  );
}
