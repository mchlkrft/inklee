import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { getGrowthContext, getOverviewData } from "@/lib/growth-queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SampleWarning,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import { FunnelBars } from "@/components/admin/growth/funnel-bars";
import { BarSeries } from "@/components/admin/growth/sparkline";

export default async function GrowthOverviewPage({
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
  const data = await getOverviewData(context);

  const currencyLabel = data.period.depositTotals
    .map(
      (row) =>
        `${(Number(row.paid_sum) || 0).toFixed(0)} ${row.currency.toUpperCase()} (${row.paid_count})`,
    )
    .join(" · ");

  return (
    <div className="space-y-10">
      <RangePicker />

      <section className="space-y-3">
        <SectionHeading>State of the platform</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard label="Artists" value={data.totals.totalArtists} />
          <MetricCard
            label="Activated"
            value={data.totals.activatedArtists}
            sub={
              data.totals.activationRate !== null
                ? `${data.totals.activationRate}% of artists`
                : undefined
            }
          />
          <MetricCard label="Pages live" value={data.totals.pagesPublished} />
          <MetricCard
            label="Received a request"
            value={data.totals.receivedFirstRequest}
          />
          <MetricCard
            label="Approved a request"
            value={data.totals.approvedFirstRequest}
          />
          <MetricCard
            label="Active now"
            value={data.retention.active}
            sub={`${data.retention.churn_risk} at churn risk`}
          />
          <MetricCard
            label="Dormant"
            value={data.retention.dormant + data.retention.churned}
            sub={`${data.retention.reactivatedRecently} reactivated recently`}
          />
          <MetricCard
            label="Signed up, never claimed"
            value={data.totals.authUsersWithoutProfile ?? "n/a"}
            sub="accounts without a booking page"
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading>
          {context.range.label} vs previous period
        </SectionHeading>
        <SampleWarning text={data.sampleGuard.warning} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="New accounts"
            value={data.period.newAccounts.current}
            deltaPct={data.period.newAccounts.deltaPct}
          />
          <MetricCard
            label="Pages claimed"
            value={data.period.newClaims.current}
            deltaPct={data.period.newClaims.deltaPct}
          />
          <MetricCard
            label="Cohort activated"
            value={data.period.cohortActivated}
            sub={
              data.period.cohortActivationRate !== null
                ? `${data.period.cohortActivationRate}% of the cohort`
                : undefined
            }
          />
          <MetricCard
            label="Requests"
            value={data.period.requests.current}
            deltaPct={data.period.requests.deltaPct}
          />
          <MetricCard
            label="Approvals"
            value={data.period.approvals.current}
            deltaPct={data.period.approvals.deltaPct}
            sub={
              data.period.approvalRate !== null
                ? `${data.period.approvalRate}% approval rate`
                : undefined
            }
          />
          <MetricCard
            label="Deposits paid"
            value={data.period.depositsPaid.current}
            deltaPct={data.period.depositsPaid.deltaPct}
            sub={currencyLabel || undefined}
          />
          <MetricCard
            label="Median days to first request"
            value={data.velocity.medianDaysToFirstRequest ?? "n/a"}
            sub="claim to first request, all time"
          />
          <MetricCard
            label="Median days to activation"
            value={data.velocity.medianDaysToActivation ?? "n/a"}
            sub="recorded from 2026-07 onward"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <SectionHeading>Activation funnel (all time)</SectionHeading>
            <Link
              href="/admin/growth/activation"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Open activation →
            </Link>
          </div>
          <FunnelBars stages={data.funnel} />
        </div>
        <div className="rounded-md border border-border p-5 space-y-4">
          <SectionHeading>
            Activation funnel ({context.range.label.toLowerCase()} cohort)
          </SectionHeading>
          {data.cohortFunnel.some((stage) => stage.count > 0) ? (
            <FunnelBars stages={data.cohortFunnel} />
          ) : (
            <EmptyState text="No signups in this period." />
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>
            New accounts per {context.range.bucket}
          </SectionHeading>
          {data.signupSeries.length > 0 ? (
            <BarSeries
              values={data.signupSeries.map((row) => row.auth_signups)}
              labels={data.signupSeries.map((row) => row.bucket.slice(0, 10))}
            />
          ) : (
            <EmptyState text="No signups in this period." />
          )}
        </div>
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>
            Booking requests per {context.range.bucket}
          </SectionHeading>
          {data.bookingSeries.length > 0 ? (
            <BarSeries
              values={data.bookingSeries.map((row) => row.requests)}
              labels={data.bookingSeries.map((row) => row.bucket.slice(0, 10))}
            />
          ) : (
            <EmptyState text="No requests in this period." />
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/growth/insights"
          className="rounded-md border border-border p-4 transition-colors hover:bg-muted/30"
        >
          <p className="text-sm font-medium text-foreground">Insights</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rule-based changes worth investigating, with links into the data.
          </p>
        </Link>
        <Link
          href="/admin/support"
          className="rounded-md border border-border p-4 transition-colors hover:bg-muted/30"
        >
          <p className="text-sm font-medium text-foreground">
            Support: {data.support.needsAttention} awaiting reply
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.support.total} tickets total.
          </p>
        </Link>
      </section>
    </div>
  );
}
