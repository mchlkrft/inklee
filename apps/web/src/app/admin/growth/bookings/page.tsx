import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getBookingPerformanceData,
  getGrowthContext,
} from "@/lib/growth-queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SampleWarning,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import { BarSeries } from "@/components/admin/growth/sparkline";

/** Median response time arrives in hours; show minutes / hours / days. */
function formatResponseTime(hours: number | null): string {
  if (hours === null) return "n/a";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

function pctCell(pct: number | null): string {
  return pct === null ? "–" : `${pct}%`;
}

export default async function GrowthBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "bookings" },
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const data = await getBookingPerformanceData(context);

  const minSample = context.settings.min_sample_size;
  const requestCount = data.counts.requests.current;

  const throughputWarning =
    requestCount > 0 && requestCount < minSample
      ? `Only ${requestCount} ${requestCount === 1 ? "request" : "requests"} in this period, below the minimum sample of ${minSample}. Rates and medians here are anecdote, not signal.`
      : null;
  const depositWarning =
    data.deposits.requested > 0 && data.deposits.requested < minSample
      ? `The conversion rate rests on ${data.deposits.requested} deposit ${data.deposits.requested === 1 ? "request" : "requests"}, below the minimum sample of ${minSample}. Treat it as anecdote, not signal.`
      : null;

  const methodRows = [
    {
      key: "preferred_date",
      label: "Preferred date",
      count: data.methods.preferredDate,
    },
    { key: "slot_based", label: "Slot based", count: data.methods.slotBased },
    {
      key: "flash",
      label: "Flash originated",
      count: data.methods.flashOriginated,
    },
    { key: "guest_spot", label: "Guest spot", count: data.methods.guestSpot },
    {
      key: "artist_created",
      label: "Artist created",
      count: data.methods.artistCreated,
    },
  ];
  const methodPct = (count: number): number | null =>
    data.methods.total > 0
      ? Math.round((count / data.methods.total) * 100)
      : null;

  return (
    <div className="space-y-10">
      <RangePicker />

      <section className="space-y-3">
        <SectionHeading>
          {context.range.label} vs previous period
        </SectionHeading>
        <SampleWarning text={throughputWarning} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Requests"
            value={data.counts.requests.current}
            deltaPct={data.counts.requests.deltaPct}
          />
          <MetricCard
            label="Reviewed"
            value={data.counts.reviewed}
            sub="requests with a first decision recorded"
          />
          <MetricCard
            label="Approvals"
            value={data.counts.approvals.current}
            deltaPct={data.counts.approvals.deltaPct}
            sub={
              data.rates.approvalRate !== null
                ? `${data.rates.approvalRate}% approval rate`
                : undefined
            }
          />
          <MetricCard label="Declines" value={data.counts.declines} />
          <MetricCard
            label="Cancellations"
            value={data.counts.cancellations}
            sub={`${data.counts.customerCancellations} by clients, ${data.counts.artistCancellations} by artists`}
          />
          <MetricCard
            label="Pending now"
            value={data.counts.stalePending}
            sub="all requests currently awaiting a decision"
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading>Response and per-artist load</SectionHeading>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Median first response"
            value={formatResponseTime(data.latency.medianResponseHours)}
            sub={`first decision from the audit trail, n=${data.latency.decidedCount}`}
          />
          <MetricCard
            label="Requests per active artist"
            value={data.perArtist.requestsPerActiveArtist ?? "n/a"}
            sub="artists with a request in this period"
          />
          <MetricCard
            label="Approved per activated artist"
            value={data.perArtist.approvedPerActivatedArtist ?? "n/a"}
            sub="across all activated artists"
          />
          <MetricCard
            label="Waitlist conversions"
            value={data.waitlistConversions}
            sub="waitlist entries turned into requests"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <SectionHeading>How requests arrive</SectionHeading>
            <p className="text-xs tabular-nums text-muted-foreground">
              {data.methods.total} total
            </p>
          </div>
          {data.methods.total > 0 ? (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1 text-left font-medium">Method</th>
                    <th className="py-1 text-right font-medium">Requests</th>
                    <th className="py-1 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {methodRows.map((row) => (
                    <tr key={row.key} className="border-t border-border">
                      <td className="py-1.5 text-foreground">{row.label}</td>
                      <td className="py-1.5 text-right tabular-nums text-foreground">
                        {row.count}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {pctCell(methodPct(row.count))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">
                Preferred date and slot based split the total. Flash, guest
                spot, and artist created overlap them, so shares do not sum to
                100%.
              </p>
            </>
          ) : (
            <EmptyState text="No requests in this period." />
          )}
        </div>
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>
            Booking requests per {context.range.bucket}
          </SectionHeading>
          {data.series.length > 0 ? (
            <BarSeries
              values={data.series.map((row) => row.requests)}
              labels={data.series.map((row) => row.bucket.slice(0, 10))}
            />
          ) : (
            <EmptyState text="No requests in this period." />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading>Deposits</SectionHeading>
        <SampleWarning text={depositWarning} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Requested" value={data.deposits.requested} />
          <MetricCard label="Paid" value={data.deposits.paid} />
          <MetricCard
            label="Conversion"
            value={
              data.rates.depositConversionRate !== null
                ? `${data.rates.depositConversionRate}%`
                : "n/a"
            }
            sub="paid out of requested"
          />
          <MetricCard
            label="Failed"
            value={data.deposits.failed}
            sub="payment attempts that failed"
          />
          <MetricCard label="Refunded" value={data.deposits.refunded} />
          <MetricCard label="Forfeited" value={data.deposits.forfeited} />
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-xs text-muted-foreground">
            Paid volume by currency
          </p>
          {data.deposits.totals.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {data.deposits.totals.map((row) => (
                <li
                  key={row.currency}
                  className="text-sm tabular-nums text-foreground"
                >
                  {(Number(row.paid_sum) || 0).toFixed(0)}{" "}
                  {row.currency.toUpperCase()} from {row.paid_count}{" "}
                  {row.paid_count === 1 ? "deposit" : "deposits"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No deposits paid in this period.
            </p>
          )}
        </div>
      </section>

      <p className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        {data.expiryNote}
      </p>
    </div>
  );
}
