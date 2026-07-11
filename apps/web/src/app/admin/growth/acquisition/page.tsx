import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getAcquisitionKpis,
  waTimeseries,
  waBreakdown,
  getWaDiagnostics,
  type WaBreakdownRow,
} from "@/lib/public-analytics/queries";
import { compare } from "@/lib/growth/metrics";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import { BarSeries } from "@/components/admin/growth/sparkline";
import AcquisitionNav, { acquisitionRangeSuffix } from "./acquisition-nav";

/** Human labels for the channel vocabulary (src/lib/public-analytics/channels.ts). */
const CHANNEL_LABELS: Record<string, string> = {
  direct: "Direct",
  organic_search: "Organic search",
  paid_search: "Paid search",
  organic_social: "Organic social",
  paid_social: "Paid social",
  email: "Email",
  referral: "Referral",
  other: "Other",
};

/** Raw ratio, or null when the denominator is 0 (never a fake 0). */
function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Delta between two derived ratios; hidden unless both sides are real. */
function ratioDelta(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "–" is the standing placeholder for a rate with no denominator. */
function pctCell(value: number | null): string {
  return value === null ? "–" : `${(value * 100).toFixed(1)}%`;
}

function formatUtc(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

export default async function AcquisitionOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "acquisition" },
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const [kpis, series, channels, landingPages, diagnostics] = await Promise.all(
    [
      getAcquisitionKpis(context),
      waTimeseries(context),
      waBreakdown(context, "channel"),
      waBreakdown(context, "landing_path", 10),
      getWaDiagnostics(),
    ],
  );

  const rangeSuffix = acquisitionRangeSuffix(params);
  const current = kpis.current;
  const previous = kpis.previous;

  const pagesPerVisit = ratio(current.pageviews, current.visits);
  const previousPagesPerVisit = previous
    ? ratio(previous.pageviews, previous.visits)
    : null;
  const signupRate = ratio(current.signup_completions, current.visits);
  const previousSignupRate = previous
    ? ratio(previous.signup_completions, previous.visits)
    : null;

  const rejections = diagnostics.rejectionsToday;
  const rejectionLine = rejections
    ? `Bots ${rejections.bot_rejected}, invalid payloads ${rejections.invalid_payload}, internal traffic ${rejections.internal_rejected}, unsupported hostnames ${rejections.unsupported_hostname}.`
    : "No rejections recorded today.";

  const hasSeries = series.some((row) => row.visitors > 0 || row.pageviews > 0);
  const conversionCell = (row: WaBreakdownRow): string =>
    pctCell(ratio(row.signup_completions, row.visits));

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <AcquisitionNav active="overview" rangeSuffix={rangeSuffix} />
        <RangePicker />
      </div>

      {!diagnostics.collectorConfigured ? (
        <div className="rounded-md border border-brand-mustard/40 bg-brand-mustard/10 px-4 py-3">
          <p className="text-sm text-foreground">
            The collector is not configured yet (WA_VISITOR_HASH_SECRET
            missing). No public traffic is being recorded.
          </p>
        </div>
      ) : diagnostics.lastEventAt === null ? (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm text-foreground">
            No public traffic recorded yet. The collector went live with this
            deploy.
          </p>
        </div>
      ) : null}

      <section className="space-y-3">
        <SectionHeading>
          {context.range.label} vs previous period
        </SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Unique visitors"
            value={current.visitors}
            deltaPct={
              compare(current.visitors, previous?.visitors ?? null).deltaPct
            }
            sub="daily anonymous visitors"
          />
          <MetricCard
            label="Visits"
            value={current.visits}
            deltaPct={
              compare(current.visits, previous?.visits ?? null).deltaPct
            }
          />
          <MetricCard
            label="Pageviews"
            value={current.pageviews}
            deltaPct={
              compare(current.pageviews, previous?.pageviews ?? null).deltaPct
            }
          />
          <MetricCard
            label="Pages per visit"
            value={pagesPerVisit === null ? "–" : pagesPerVisit.toFixed(1)}
            deltaPct={ratioDelta(pagesPerVisit, previousPagesPerVisit)}
          />
          <MetricCard
            label="Signup starts"
            value={current.signup_starts}
            deltaPct={
              compare(current.signup_starts, previous?.signup_starts ?? null)
                .deltaPct
            }
          />
          <MetricCard
            label="Signup completions"
            value={current.signup_completions}
            deltaPct={
              compare(
                current.signup_completions,
                previous?.signup_completions ?? null,
              ).deltaPct
            }
          />
          <MetricCard
            label="Signup conversion"
            value={pctCell(signupRate)}
            deltaPct={ratioDelta(signupRate, previousSignupRate)}
            sub="completions out of visits"
          />
          <MetricCard
            label="Booking requests completed"
            value={current.booking_completions}
            deltaPct={
              compare(
                current.booking_completions,
                previous?.booking_completions ?? null,
              ).deltaPct
            }
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Visitors per {context.range.bucket}</SectionHeading>
          {hasSeries ? (
            <BarSeries
              values={series.map((row) => row.visitors)}
              labels={series.map((row) => row.bucket.slice(0, 10))}
            />
          ) : (
            <EmptyState text="No public traffic in this period." />
          )}
        </div>
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Pageviews per {context.range.bucket}</SectionHeading>
          {hasSeries ? (
            <BarSeries
              values={series.map((row) => row.pageviews)}
              labels={series.map((row) => row.bucket.slice(0, 10))}
            />
          ) : (
            <EmptyState text="No public traffic in this period." />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Top channels</SectionHeading>
          <Link
            href={`/admin/growth/acquisition/sources${rangeSuffix}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Sources and campaigns →
          </Link>
        </div>
        {channels.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Channel</th>
                  <th className="px-3 py-2 text-right font-medium">Visitors</th>
                  <th className="px-3 py-2 text-right font-medium">Visits</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Signup completions
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Conversion
                  </th>
                </tr>
              </thead>
              <tbody>
                {channels.map((row) => (
                  <tr
                    key={row.dimension_value}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2 text-foreground">
                      {CHANNEL_LABELS[row.dimension_value] ??
                        row.dimension_value}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.visitors}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.visits}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.signup_completions}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {conversionCell(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="No public traffic in this period." />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Top landing pages</SectionHeading>
          <Link
            href={`/admin/growth/acquisition/pages${rangeSuffix}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            All pages →
          </Link>
        </div>
        {landingPages.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">
                    Landing page
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Visitors</th>
                  <th className="px-3 py-2 text-right font-medium">Visits</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Signup completions
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Conversion
                  </th>
                </tr>
              </thead>
              <tbody>
                {landingPages.map((row) => (
                  <tr
                    key={row.dimension_value}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2 text-foreground">
                      <span className="break-all">{row.dimension_value}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.visitors}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.visits}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.signup_completions}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {conversionCell(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="No public traffic in this period." />
        )}
      </section>

      <section className="rounded-md border border-border bg-muted/30 p-4 space-y-1.5">
        <SectionHeading>Collector diagnostics</SectionHeading>
        <p className="text-xs text-muted-foreground">
          Last event received:{" "}
          <span className="tabular-nums text-foreground">
            {diagnostics.lastEventAt
              ? formatUtc(diagnostics.lastEventAt)
              : "none yet"}
          </span>
          . Events today (UTC):{" "}
          <span className="tabular-nums text-foreground">
            {diagnostics.eventsToday}
          </span>
          .
        </p>
        <p className="text-xs text-muted-foreground">
          Rejections today: {rejectionLine}
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Visitors are daily anonymous visitors: the same person counts again each
        day and on each device. Treat them as approximate traffic, not
        persistent people.{" "}
        <Link
          href="/admin/growth/definitions"
          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
        >
          See definitions
        </Link>
        .
      </p>
    </div>
  );
}
