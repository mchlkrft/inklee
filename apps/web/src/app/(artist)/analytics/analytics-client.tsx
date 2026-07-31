"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ArtistAnalyticsResult } from "@inklee/shared/artist-analytics";
import type { FeeSavingsResult } from "@inklee/shared/fee-savings";
import { formatCentsEur } from "@inklee/shared/fee-savings";

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
  activeTab,
  metrics,
  months,
  calendar,
  hubAnalytics,
  feeSavings,
}: {
  range: string;
  activeTab: string;
  metrics: Metrics;
  months: MonthBar[];
  calendar: Calendar;
  hubAnalytics: ArtistAnalyticsResult | null;
  feeSavings: FeeSavingsResult | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setRange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    router.push(`/analytics?${params.toString()}`);
  }

  function setTab(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`/analytics?${params.toString()}`);
  }

  const tabs = [
    { key: "bookings", label: "Bookings" },
    ...(hubAnalytics ? [{ key: "hub", label: "Hub" }] : []),
    ...(feeSavings ? [{ key: "savings", label: "Savings" }] : []),
  ];

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

      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                activeTab === t.key
                  ? "border-brand-mustard text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === "bookings" && (
        <BookingsTab metrics={metrics} months={months} calendar={calendar} />
      )}

      {activeTab === "hub" && hubAnalytics && <HubTab data={hubAnalytics} />}

      {activeTab === "savings" && feeSavings && (
        <SavingsTab data={feeSavings} />
      )}
    </div>
  );
}

function BookingsTab({
  metrics,
  months,
  calendar,
}: {
  metrics: Metrics;
  months: MonthBar[];
  calendar: Calendar;
}) {
  const maxCount = Math.max(...months.map((m) => m.count), 1);
  const empty = metrics.total === 0;

  if (empty) {
    return (
      <div className="rounded-md border border-border px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No bookings yet in this period.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard label="Total requests" value={metrics.total} suffix="" />
        <MetricCard
          label="Conversion rate"
          value={metrics.conversionRate}
          suffix="%"
          hint="approved / submitted"
        />
        <MetricCard
          label="Rejection rate"
          value={metrics.rejectionRate}
          suffix="%"
          hint="rejected / submitted"
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
            hint="paid / requested"
          />
        )}
      </div>

      {months.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Requests per month</p>
          <div className="flex items-end gap-2 h-32">
            {months.map((m) => (
              <div
                key={m.label}
                className="flex-1 flex flex-col items-center justify-end gap-1"
              >
                <span className="text-xs text-muted-foreground">{m.count}</span>
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
  );
}

function HubTab({ data }: { data: ArtistAnalyticsResult }) {
  const { hub, daily, topLinks, sources, period } = data;
  const hasData = hub.pageViews > 0 || hub.linkClicks > 0;

  if (!hasData) {
    return (
      <div className="rounded-md border border-border px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No hub activity yet in this period. Share your hub link to start
          collecting insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Page views" value={hub.pageViews} />
        <MetricCard label="Unique visitors" value={hub.uniqueVisitors} />
        <MetricCard label="Link clicks" value={hub.linkClicks} />
        <MetricCard
          label="Click-through rate"
          value={Math.round(hub.clickThroughRate * 10) / 10}
          suffix="%"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="Booking conversions"
          value={hub.bookingConversions}
        />
        <MetricCard
          label="Conversion rate"
          value={Math.round(hub.conversionRate * 10) / 10}
          suffix="%"
          hint="conversions / unique visitors"
        />
      </div>

      {daily.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Daily views · {period.from} to {period.to}
          </p>
          <div className="flex items-end gap-px h-24 overflow-x-auto">
            {daily.map((d) => {
              const maxViews = Math.max(...daily.map((x) => x.pageViews), 1);
              return (
                <div
                  key={d.date}
                  className="flex-1 min-w-[3px] max-w-[12px]"
                  title={`${d.date}: ${d.pageViews} views, ${d.linkClicks} clicks`}
                >
                  <div
                    className="w-full rounded-t bg-foreground/25 hover:bg-foreground/40 transition-colors"
                    style={{
                      height: `${Math.round((d.pageViews / maxViews) * 100)}%`,
                      minHeight: d.pageViews > 0 ? "2px" : "0px",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {topLinks.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Top links</p>
          <div className="space-y-2">
            {topLinks.map((link) => (
              <div
                key={link.targetKey}
                className="flex items-center justify-between rounded-md border border-border px-4 py-3"
              >
                <span className="text-sm text-foreground truncate">
                  {link.targetKey}
                </span>
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {link.clicks} click{link.clicks !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Traffic sources</p>
          <div className="space-y-2">
            {sources.map((s) => (
              <div
                key={s.channel}
                className="flex items-center justify-between rounded-md border border-border px-4 py-3"
              >
                <span className="text-sm text-foreground capitalize">
                  {s.channel.replace(/_/g, " ")}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {Math.round(s.percentage)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SavingsTab({ data }: { data: FeeSavingsResult }) {
  const hasTransactions = data.transactionCount > 0;

  if (!hasTransactions) {
    return (
      <div className="rounded-md border border-border px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No fee data yet. Fee tracking starts when your first card payment
          settles.
        </p>
        {data.dataAvailableSince && (
          <p className="text-xs text-muted-foreground mt-2">
            Data available since {data.dataAvailableSince}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Deposit fees"
          rawLabel={formatCentsEur(data.depositFeesPaidCents)}
          hint={`${data.period.from} to ${data.period.to}`}
        />
        <MetricCard
          label="Goods fees"
          rawLabel={formatCentsEur(data.goodsFeesPaidCents)}
        />
        <MetricCard
          label="Total fees"
          rawLabel={formatCentsEur(data.totalFeesPaidCents)}
          hint={`${data.transactionCount} transaction${data.transactionCount !== 1 ? "s" : ""}`}
        />
      </div>

      {data.feeSavedCents > 0 && (
        <div className="rounded-md border border-brand-mustard/40 bg-brand-mustard/5 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">
            Fees saved with Plus: {formatCentsEur(data.feeSavedCents)}
          </p>
          {data.subscriptionCostCents > 0 && (
            <p className="text-xs text-muted-foreground">
              Subscription cost: {formatCentsEur(data.subscriptionCostCents)}.
              Net benefit: {formatCentsEur(data.netBenefitCents)}.
            </p>
          )}
        </div>
      )}

      {data.feeSavedCents === 0 && (
        <div className="rounded-md border border-border p-4">
          <p className="text-xs text-muted-foreground">
            Fee rates are currently the same across tiers. When differentiated
            rates take effect, your savings will appear here.
          </p>
        </div>
      )}

      {data.dataAvailableSince && (
        <p className="text-xs text-muted-foreground">
          Fee data available since {data.dataAvailableSince}. Earlier
          transactions were not recorded.
        </p>
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
