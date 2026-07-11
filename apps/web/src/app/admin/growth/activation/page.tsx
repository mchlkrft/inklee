import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { getGrowthContext, getActivationData } from "@/lib/growth-queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SampleWarning,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import { FunnelBars } from "@/components/admin/growth/funnel-bars";

/** Small-sample marker for rate cells resting on too few artists. */
function SmallSampleChip() {
  return (
    <span className="ml-2 inline-block rounded-full border border-brand-mustard/40 bg-brand-mustard/10 px-2 py-0.5 text-[10px] text-muted-foreground">
      Small sample
    </span>
  );
}

export default async function GrowthActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "activation" },
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const data = await getActivationData(context);

  // Keep the selected range in cross-section links so the picker state
  // survives navigation.
  const rangeParams = new URLSearchParams();
  if (params.range) rangeParams.set("range", params.range);
  if (params.from) rangeParams.set("from", params.from);
  if (params.to) rangeParams.set("to", params.to);
  const rangeSuffix = rangeParams.toString();
  const withRange = (href: string) =>
    rangeSuffix
      ? `${href}${href.includes("?") ? "&" : "?"}${rangeSuffix}`
      : href;

  const byAge = data.byAge;
  const bySource = [...data.bySource].sort((a, b) => b.artists - a.artists);

  return (
    <div className="space-y-10">
      <RangePicker />

      <section className="rounded-md border border-border p-5 space-y-2">
        <SectionHeading>What counts as activated</SectionHeading>
        <p className="text-sm text-foreground">{data.definition}</p>
        <Link
          href={withRange("/admin/growth/definitions")}
          className="inline-block text-xs text-muted-foreground hover:text-foreground"
        >
          Open definitions →
        </Link>
      </section>

      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Median days to activation"
            value={data.medianDaysToActivation ?? "n/a"}
            sub="recorded from 2026-07 onward"
          />
          <MetricCard
            label="Pages claimed this period"
            value={data.cohortSize}
            sub={context.range.label.toLowerCase()}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5 space-y-4">
          <SectionHeading>Activation funnel (all time)</SectionHeading>
          {data.funnel.some((stage) => stage.count > 0) ? (
            <FunnelBars stages={data.funnel} />
          ) : (
            <EmptyState text="No artists yet." />
          )}
        </div>
        <div className="rounded-md border border-border p-5 space-y-4">
          <SectionHeading>
            Activation funnel ({context.range.label.toLowerCase()} cohort)
          </SectionHeading>
          <SampleWarning text={data.sampleGuard.warning} />
          {data.cohortFunnel.some((stage) => stage.count > 0) ? (
            <FunnelBars stages={data.cohortFunnel} />
          ) : (
            <EmptyState text="No signups in this period." />
          )}
        </div>
      </section>

      {data.mainAbandonment && (
        <section className="rounded-md border border-brand-mustard/40 bg-brand-mustard/10 px-4 py-3 space-y-1">
          <p className="text-sm text-foreground">
            Biggest drop: &quot;{data.mainAbandonment.from}&quot; to &quot;
            {data.mainAbandonment.to}&quot;, {data.mainAbandonment.lostPct}%
            lost.
          </p>
          <p className="text-xs text-muted-foreground">
            Measured between adjacent stages of the all-time funnel, up to the
            activated stage.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading>Where artists are stuck</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.segments.map((segment) =>
            segment.href ? (
              <Link
                key={segment.key}
                href={withRange(segment.href)}
                className="rounded-md border border-border p-4 transition-colors hover:bg-muted/30"
              >
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {segment.count}
                </p>
                <p className="mt-0.5 text-sm text-foreground">
                  {segment.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  View these artists →
                </p>
              </Link>
            ) : (
              <div
                key={segment.key}
                className="rounded-md border border-border p-4"
              >
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {segment.count}
                </p>
                <p className="mt-0.5 text-sm text-foreground">
                  {segment.label}
                </p>
                {segment.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {segment.description}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Activation rate by account age</SectionHeading>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Account age</th>
                  <th className="py-2 pr-3 font-medium">Artists</th>
                  <th className="py-2 font-medium">Activated</th>
                </tr>
              </thead>
              <tbody>
                {byAge.map((row) => (
                  <tr key={row.label} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-foreground">{row.label}</td>
                    <td className="py-2 pr-3 tabular-nums text-foreground">
                      {row.artists}
                    </td>
                    <td className="py-2 tabular-nums text-foreground">
                      {row.activationPct !== null
                        ? `${row.activationPct}%`
                        : "–"}
                      {row.smallSample && row.artists > 0 && (
                        <SmallSampleChip />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Age is measured from the claim date to today. Older buckets have had
            more time to activate; the buckets are not comparable cohorts.
          </p>
        </div>
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Activation rate by source</SectionHeading>
          {bySource.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Artists</th>
                    <th className="py-2 font-medium">Activated</th>
                  </tr>
                </thead>
                <tbody>
                  {bySource.map((row) => (
                    <tr key={row.source} className="border-b border-border/50">
                      <td className="py-2 pr-3 text-foreground">
                        {row.source}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-foreground">
                        {row.artists}
                      </td>
                      <td className="py-2 tabular-nums text-foreground">
                        {row.activationPct !== null
                          ? `${row.activationPct}%`
                          : "–"}
                        {row.smallSample && <SmallSampleChip />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="No artists with a claimed page yet." />
          )}
          <p className="text-xs text-muted-foreground">
            First-touch attribution capture began 2026-07 with the cockpit
            release; accounts created earlier show as unknown. Differences
            between sources are associations, not proof a source causes
            activation.
          </p>
        </div>
      </section>
    </div>
  );
}
