import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { getGrowthContext, getEngagementData } from "@/lib/growth-queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import { BarSeries } from "@/components/admin/growth/sparkline";

/** "audit:request_approved" -> "Request approved" (data slugs, humanized). */
function humanizeKind(kind: string): string {
  const plain = kind.replace(/^(audit|event):/, "").replace(/_/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** Medians can be fractional (even counts); one decimal is enough. */
function medianLabel(value: number | null): string {
  return value === null ? "n/a" : String(Math.round(value * 10) / 10);
}

function daysSinceLabel(days: number | null): string {
  if (days === null) return "no recorded activity";
  if (days === 1) return "1 day since last activity";
  return `${days} days since last activity`;
}

export default async function GrowthEngagementPage({
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
  const data = await getEngagementData(context);

  const latestWau = data.summary.wau.at(-1) ?? null;
  const latestMau = data.summary.mau.at(-1) ?? null;

  return (
    <div className="space-y-10">
      <RangePicker />

      <div className="rounded-md border border-brand-mustard/40 bg-brand-mustard/10 px-4 py-3">
        <p className="text-sm text-foreground">{data.presenceNote}</p>
      </div>

      <section className="space-y-3">
        <SectionHeading>
          Active artists ({context.range.label.toLowerCase()})
        </SectionHeading>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Weekly active artists"
            value={latestWau?.count ?? "n/a"}
            sub={
              latestWau
                ? `week of ${latestWau.week}, may be partial`
                : undefined
            }
          />
          <MetricCard
            label="Monthly active artists"
            value={latestMau?.count ?? "n/a"}
            sub={
              latestMau
                ? `month of ${latestMau.month.slice(0, 7)}, may be partial`
                : undefined
            }
          />
          <MetricCard
            label="Stickiness"
            value={
              data.summary.stickiness !== null
                ? `${data.summary.stickiness}%`
                : "n/a"
            }
            sub="last full week over the trailing 28 days"
          />
          <MetricCard
            label="Median actions per active artist"
            value={medianLabel(data.medianActionsPerActiveArtist)}
            sub="meaningful actions in the selected range"
          />
        </div>
      </section>

      <section className="rounded-md border border-border p-5 space-y-3">
        <SectionHeading>Daily active artists</SectionHeading>
        {data.summary.dau.length > 0 ? (
          <BarSeries
            values={data.summary.dau.map((row) => row.count)}
            labels={data.summary.dau.map((row) => row.day)}
          />
        ) : (
          <EmptyState text="No recorded activity in this period." />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading>Most common meaningful actions</SectionHeading>
        {data.kindCounts.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Occurrences
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Distinct artists
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.kindCounts.map((row) => (
                  <tr key={row.kind} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">
                      {humanizeKind(row.kind)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.occurrences}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.artists}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="No meaningful actions recorded in this period." />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading>Activated vs not yet activated</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <MetricCard
            label="Activated artists"
            value={medianLabel(data.activatedVsNot.activatedMedian)}
            sub="median actions per artist"
          />
          <MetricCard
            label="Not yet activated"
            value={medianLabel(data.activatedVsNot.nonActivatedMedian)}
            sub="median actions per artist"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Medians cover artists with recorded activity in the selected range.
          Activation and activity currently show together; this comparison is an
          association, not proof that one causes the other.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <SectionHeading>Top artists by active days</SectionHeading>
          {data.topArtists.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Artist</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Active days
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topArtists.map((artist) => (
                    <tr
                      key={artist.artistId}
                      className="border-t border-border"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/accounts/${artist.artistId}`}
                          className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                        >
                          {artist.displayName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {artist.days}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="No recorded activity in this period." />
          )}
        </div>

        <div className="space-y-3">
          <SectionHeading>Declining engagement</SectionHeading>
          <p className="text-xs text-muted-foreground">
            Activated artists at churn risk, ordered by days since last
            activity.
          </p>
          {data.declining.length > 0 ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {data.declining.map((artist) => (
                <li
                  key={artist.id}
                  className="flex items-baseline justify-between gap-3 px-3 py-2"
                >
                  <Link
                    href={`/admin/accounts/${artist.id}`}
                    className="text-sm text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                  >
                    {artist.displayName}
                  </Link>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {daysSinceLabel(artist.daysSince)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="No artists are currently at churn risk." />
          )}
        </div>
      </section>
    </div>
  );
}
