import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { getGrowthContext, getEmailData } from "@/lib/growth-queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from "@/components/admin/growth/metric-card";

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function StatusChip({ status }: { status: "draft" | "active" }) {
  return status === "active" ? (
    <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[11px] font-medium text-brand-green">
      Active
    </span>
  ) : (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      Draft
    </span>
  );
}

export default async function GrowthEmailPage({
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
  const data = await getEmailData(context);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <RangePicker />
        <p className="text-xs text-muted-foreground">
          Lifecycle email stats on this page are lifetime totals. The selected
          range still carries over to the other tabs.
        </p>
      </div>

      <section className="space-y-3">
        <SectionHeading>Email event health</SectionHeading>
        {data.eventHealth.healthy ? (
          <>
            <p className="text-xs text-muted-foreground">
              Resend webhook events received in the last 30 days.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <MetricCard
                label="Delivered"
                value={data.eventHealth.last30Days.delivered}
              />
              <MetricCard
                label="Opened"
                value={data.eventHealth.last30Days.opened}
              />
              <MetricCard
                label="Clicked"
                value={data.eventHealth.last30Days.clicked}
              />
              <MetricCard
                label="Bounced"
                value={data.eventHealth.last30Days.bounced}
              />
              <MetricCard
                label="Unsubscribed"
                value={data.eventHealth.last30Days.unsubscribed}
              />
            </div>
          </>
        ) : (
          <div className="rounded-md border border-brand-red/50 bg-brand-red/10 px-4 py-3">
            <p className="text-sm font-medium text-brand-red">
              Email events are not arriving.
            </p>
            {data.eventHealth.note && (
              <p className="mt-1 text-sm text-foreground">
                {data.eventHealth.note}
              </p>
            )}
          </div>
        )}
      </section>

      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {data.attributionNote} The attribution window is currently{" "}
        {data.conversionWindowDays} days.
      </p>

      <section className="space-y-3">
        <SectionHeading>Lifecycle definitions</SectionHeading>
        {data.definitions.length === 0 ? (
          <EmptyState text="No lifecycle definitions are imported." />
        ) : (
          <div className="space-y-4">
            {data.definitions.map((definition) => {
              const engagement = definition.engagement;
              const hasEngagement =
                engagement !== null &&
                (engagement.delivered > 0 ||
                  engagement.opened > 0 ||
                  engagement.clicked > 0);
              return (
                <div
                  key={definition.key}
                  className="rounded-md border border-border p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {definition.name}
                    </p>
                    <StatusChip status={definition.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Audience segment{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                      {definition.audienceKey}
                    </code>{" "}
                    · throttle {definition.throttleDays} days between lifecycle
                    sends
                  </p>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MetricCard
                      label="Eligible now"
                      value={definition.eligibleNow ?? "n/a"}
                    />
                    <MetricCard label="Sent" value={definition.sent} />
                    <MetricCard
                      label="Blocked"
                      value={definition.blockedPendingOrFailed}
                      sub="pending or failed markers"
                    />
                    <MetricCard
                      label="Last sent"
                      value={
                        definition.lastSentAt
                          ? definition.lastSentAt.slice(0, 10)
                          : "–"
                      }
                    />
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      {hasEngagement
                        ? `Engagement: delivered ${engagement.delivered}, opened ${engagement.opened}, clicked ${engagement.clicked}${
                            engagement.bounced > 0
                              ? `, bounced ${engagement.bounced}`
                              : ""
                          }.`
                        : "Engagement: no data."}
                    </p>
                    <p>
                      {definition.conversion
                        ? `Conversion: ${definition.conversion.convertedWithinWindow} of ${definition.conversion.sent} sends showed ${lowerFirst(definition.conversion.outcomeLabel)} within ${data.conversionWindowDays} days.`
                        : "Conversion: no sends yet."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading>Lifecycle gaps</SectionHeading>
        {data.gaps.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {data.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        ) : (
          <EmptyState text="No lifecycle coverage gaps detected right now." />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading>Recent runs</SectionHeading>
        {data.runs.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Definition</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Audience</th>
                  <th className="px-3 py-2 font-medium text-right">Eligible</th>
                  <th className="px-3 py-2 font-medium text-right">Sent</th>
                  <th className="px-3 py-2 font-medium text-right">Failed</th>
                  <th className="px-3 py-2 font-medium text-right">Skipped</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run, index) => (
                  <tr
                    key={`${run.definition_key}-${run.created_at}-${index}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 font-medium text-foreground">
                      {run.definition_key}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {run.status}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {run.audience_size}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {run.eligible}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {run.sent_count}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        run.failed_count > 0
                          ? "text-brand-red"
                          : "text-foreground"
                      }`}
                    >
                      {run.failed_count}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {run.skipped_count}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {run.created_at ? run.created_at.slice(0, 10) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="The lifecycle cron has not run yet." />
        )}
      </section>
    </div>
  );
}
