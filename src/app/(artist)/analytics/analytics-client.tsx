"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Metrics = {
  total: number;
  conversionRate: number;
  rejectionRate: number;
  returnRate: number;
  depositRate: number | null;
};

type MonthBar = { label: string; count: number };

type Calendar = {
  label: string;
  leadingBlanks: number;
  cells: { day: number; count: number }[];
  maxDay: number;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Heatmap bucket → literal Tailwind classes (dynamic `bg-brand-mustard/${n}`
// would not be detected by the JIT, so the buckets must be spelled out).
function heatClass(count: number, max: number): string {
  if (count === 0) return "border border-border";
  const ratio = count / max;
  if (ratio > 0.66) return "bg-brand-mustard/90 text-brand-charcoal";
  if (ratio > 0.33) return "bg-brand-mustard/60 text-brand-charcoal";
  return "bg-brand-mustard/30 text-brand-charcoal";
}

const RANGES = [
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "All time", value: "all" },
];

export default function AnalyticsClient({
  range,
  metrics,
  months,
  calendar,
}: {
  range: string;
  metrics: Metrics;
  months: MonthBar[];
  calendar: Calendar;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setRange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    router.push(`/analytics?${params.toString()}`);
  }

  const maxCount = Math.max(...months.map((m) => m.count), 1);
  const empty = metrics.total === 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                range === r.value
                  ? "bg-brand-mustard text-brand-charcoal"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <div className="rounded-md border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No bookings yet in this period — data will appear once requests come
            in.
          </p>
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Total requests"
              value={metrics.total}
              suffix=""
            />
            <MetricCard
              label="Conversion rate"
              value={metrics.conversionRate}
              suffix="%"
              hint="approved ÷ submitted"
            />
            <MetricCard
              label="Rejection rate"
              value={metrics.rejectionRate}
              suffix="%"
              hint="rejected ÷ submitted"
            />
            <MetricCard
              label="Unique clients"
              value={metrics.total > 0 ? undefined : 0}
              rawLabel={
                metrics.returnRate > 0
                  ? `${metrics.returnRate}% return`
                  : "first-time only"
              }
              hint="clients with 2+ bookings"
            />
            {metrics.depositRate !== null && (
              <MetricCard
                label="Deposit collection"
                value={metrics.depositRate}
                suffix="%"
                hint="paid ÷ requested"
              />
            )}
          </div>

          {/* Volume chart */}
          {months.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Requests per month
              </p>
              <div className="flex items-end gap-2 h-32">
                {months.map((m) => (
                  <div
                    key={m.label}
                    className="flex-1 flex flex-col items-center justify-end gap-1"
                  >
                    <span className="text-xs text-muted-foreground">
                      {m.count}
                    </span>
                    <div
                      className="w-full rounded-t bg-foreground/20 hover:bg-foreground/30 transition-colors"
                      style={{
                        height: `${Math.round((m.count / maxCount) * 100)}%`,
                        minHeight: "4px",
                      }}
                      title={`${m.label}: ${m.count}`}
                    />
                    <span className="text-[10px] text-muted-foreground leading-none">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-day calendar (DT-4) — each day shows its request count,
              shaded by volume. Most recent active month. */}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Requests per day · {calendar.label}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="text-center text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {Array.from({ length: calendar.leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} aria-hidden />
              ))}
              {calendar.cells.map((c) => (
                <div
                  key={c.day}
                  title={`${calendar.label} ${c.day}: ${c.count} request${c.count === 1 ? "" : "s"}`}
                  className={`flex aspect-square flex-col items-center justify-center rounded-md ${heatClass(c.count, calendar.maxDay)}`}
                >
                  <span
                    className={`text-[10px] leading-none ${c.count > 0 ? "text-brand-charcoal/70" : "text-muted-foreground"}`}
                  >
                    {c.day}
                  </span>
                  {c.count > 0 && (
                    <span className="text-xs font-semibold leading-tight">
                      {c.count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix = "",
  hint,
  rawLabel,
}: {
  label: string;
  value?: number;
  suffix?: string;
  hint?: string;
  rawLabel?: string;
}) {
  return (
    <div className="rounded-md border border-border p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground tabular-nums">
        {rawLabel ?? `${value ?? 0}${suffix}`}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
