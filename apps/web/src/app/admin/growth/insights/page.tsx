import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { getGrowthContext, getInsightsData } from "@/lib/growth-queries";
import type { Insight } from "@/lib/growth/types";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  SampleWarning,
  SectionHeading,
} from "@/components/admin/growth/metric-card";

const SEVERITY_CHIP: Record<
  Insight["severity"],
  { label: string; className: string }
> = {
  attention: {
    label: "Attention",
    className: "border-brand-red/40 bg-brand-red/10 text-brand-red",
  },
  watch: {
    label: "Watch",
    className: "border-brand-mustard/50 bg-brand-mustard/15 text-foreground",
  },
  info: {
    label: "Info",
    className: "border-border bg-muted text-muted-foreground",
  },
};

/** Formats the generation timestamp in the cockpit's reporting timezone. */
function formatGeneratedAt(iso: string, timeZone: string): string {
  const date = new Date(iso);
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
    return `${formatted} (${timeZone})`;
  } catch {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
    return `${formatted} (UTC)`;
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label}:{" "}
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const chip = SEVERITY_CHIP[insight.severity];
  return (
    <div className="rounded-md border border-border p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${chip.className}`}
        >
          {chip.label}
        </span>
        <p className="text-sm font-medium text-foreground">{insight.title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{insight.body}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <Fact label="Current" value={insight.currentValue} />
        {insight.comparisonValue !== null && (
          <Fact label="Comparison" value={insight.comparisonValue} />
        )}
        <Fact label="Period" value={insight.period} />
        {insight.segment !== null && (
          <Fact label="Segment" value={insight.segment} />
        )}
      </div>
      <SampleWarning text={insight.sampleWarning} />
      <p className="text-xs text-muted-foreground">
        Suggested investigation: {insight.suggestion}
      </p>
      <Link
        href={insight.href}
        className="inline-block text-xs text-muted-foreground hover:text-foreground"
      >
        View data →
      </Link>
    </div>
  );
}

export default async function GrowthInsightsPage({
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
  const data = await getInsightsData(context);

  return (
    <div className="space-y-10">
      <RangePicker />

      <section className="space-y-3">
        <SectionHeading>
          Rule-based insights ({context.range.label.toLowerCase()})
        </SectionHeading>
        {data.insights.length === 0 ? (
          <EmptyState text="No rule-based insights for this period. Either the data is quiet or the samples are too small to trust." />
        ) : (
          <div className="space-y-4">
            {data.insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Generated{" "}
        {formatGeneratedAt(
          data.generatedAt,
          context.settings.reporting_timezone,
        )}{" "}
        from deterministic rules. Thresholds are configurable in{" "}
        <Link
          href="/admin/growth/settings"
          className="underline underline-offset-2 hover:text-foreground"
        >
          settings
        </Link>
        .
      </p>
    </div>
  );
}
