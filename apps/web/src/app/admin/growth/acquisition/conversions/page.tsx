import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  waCampaigns,
  waKpis,
} from "@/lib/public-analytics/queries";
import { PUBLIC_EVENTS } from "@/lib/public-analytics/event-registry";
import { getAllArtistStats } from "@/lib/growth-queries";
import { isActivated, isCountedArtist } from "@/lib/growth/metrics";
import type { ArtistStatsRow } from "@/lib/growth/types";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import AcquisitionNav, { acquisitionRangeSuffix } from "../acquisition-nav";

/** "â€“" is the standing placeholder for a rate with no denominator. */
function pctCell(numerator: number, denominator: number): string {
  if (denominator <= 0) return "â€“";
  const value = (numerator / denominator) * 100;
  // One decimal below 10% so small-but-real conversion rates never show as 0%.
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}%`;
}

/** MetricCard sub line for a rate; hidden entirely with no denominator. */
function rateSub(
  numerator: number,
  denominator: number,
  label: string,
): string | undefined {
  return denominator > 0
    ? `${pctCell(numerator, denominator)} ${label}`
    : undefined;
}

type AccountCampaignRow = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  accounts: number;
  activated: number;
};

/** Counted artists grouped by their lifetime signup attribution triple.
 *  Rows without any of the three fields are skipped (they belong to the
 *  coverage note on the attribution page, not to a campaign table). */
function groupAccountsByCampaign(rows: ArtistStatsRow[]): AccountCampaignRow[] {
  const groups = new Map<string, AccountCampaignRow>();
  for (const row of rows) {
    if (!isCountedArtist(row)) continue;
    if (
      !row.attribution_source &&
      !row.attribution_medium &&
      !row.attribution_campaign
    ) {
      continue;
    }
    const key = JSON.stringify([
      row.attribution_source,
      row.attribution_medium,
      row.attribution_campaign,
    ]);
    const entry = groups.get(key) ?? {
      source: row.attribution_source,
      medium: row.attribution_medium,
      campaign: row.attribution_campaign,
      accounts: 0,
      activated: 0,
    };
    entry.accounts += 1;
    if (isActivated(row)) entry.activated += 1;
    groups.set(key, entry);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.accounts - a.accounts || (a.source ?? "").localeCompare(b.source ?? ""),
  );
}

const thLeft = "px-3 py-2 text-left font-medium";
const thRight = "px-3 py-2 text-right font-medium";
const tdNum = "px-3 py-2 text-right tabular-nums";

export default async function AcquisitionConversionsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "acquisition-conversions" },
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const [kpis, campaigns, artistRows] = await Promise.all([
    waKpis(context.range.from, context.range.to),
    waCampaigns(context, 100),
    getAllArtistStats(),
  ]);
  const accountRows = groupAccountsByCampaign(artistRows);

  const noTraffic =
    kpis.visitors === 0 &&
    kpis.visits === 0 &&
    kpis.pageviews === 0 &&
    kpis.signup_starts === 0 &&
    kpis.signup_completions === 0 &&
    kpis.booking_completions === 0;

  const rangeSuffix = acquisitionRangeSuffix(params);
  const exportQuery = new URLSearchParams();
  if (params.range) exportQuery.set("range", params.range);
  if (params.from) exportQuery.set("from", params.from);
  if (params.to) exportQuery.set("to", params.to);
  exportQuery.set("view", "campaigns");
  const exportHref = `/admin/growth/acquisition/export?${exportQuery.toString()}`;

  const eventRows = Object.entries(PUBLIC_EVENTS).map(([name, definition]) => ({
    name,
    ...definition,
    reserved: definition.emitter.startsWith("RESERVED"),
  }));

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <AcquisitionNav active="conversions" rangeSuffix={rangeSuffix} />
        <RangePicker />
      </div>

      <section className="space-y-3">
        <SectionHeading>
          Public conversions ({context.range.label.toLowerCase()})
        </SectionHeading>
        {noTraffic ? (
          <EmptyState text="No public traffic recorded in this period." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard label="Visitors" value={kpis.visitors} />
            <MetricCard label="Visits" value={kpis.visits} />
            <MetricCard
              label="Signup starts"
              value={kpis.signup_starts}
              sub={rateSub(kpis.signup_starts, kpis.visitors, "of visitors")}
            />
            <MetricCard
              label="Signups completed"
              value={kpis.signup_completions}
              sub={rateSub(
                kpis.signup_completions,
                kpis.signup_starts,
                "of starts",
              )}
            />
            <MetricCard
              label="Booking requests"
              value={kpis.booking_completions}
              sub={rateSub(
                kpis.booking_completions,
                kpis.visitors,
                "of visitors",
              )}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          First-party visits measured by the on-site collector. Google clicks
          from Search Console are a different measurement and live on the Search
          tab.
        </p>
      </section>

      <section className="space-y-3">
        <SectionHeading>Event registry</SectionHeading>
        <p className="text-xs text-muted-foreground">
          Every event the public collector may record. Reserved events are
          defined but have no live emitter yet.
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className={thLeft}>Event</th>
                <th className={thLeft}>Category</th>
                <th className={thLeft}>Conversion</th>
                <th className={thLeft}>Description</th>
                <th className={thLeft}>Emitter</th>
              </tr>
            </thead>
            <tbody>
              {eventRows.map((row) => (
                <tr key={row.name} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs text-foreground">
                    {row.name}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.category}
                  </td>
                  <td className="px-3 py-2">
                    {row.isConversion ? (
                      <span className="font-medium text-foreground">Yes</span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.description}
                  </td>
                  <td className="px-3 py-2">
                    {row.reserved ? (
                      <span className="italic text-muted-foreground/70">
                        {row.emitter}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {row.emitter}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>
            Campaign conversions ({context.range.label.toLowerCase()})
          </SectionHeading>
          <a
            href={exportHref}
            className="text-xs text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground"
          >
            Download CSV
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Visits that arrived with UTM tags in the selected range, with the
          conversion events those visits produced.
        </p>
        {campaigns.length === 0 ? (
          <EmptyState text="No campaign-tagged visits in this period." />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className={thLeft}>Source</th>
                  <th className={thLeft}>Medium</th>
                  <th className={thLeft}>Campaign</th>
                  <th className={thRight}>Visitors</th>
                  <th className={thRight}>Visits</th>
                  <th className={thRight}>Signup starts</th>
                  <th className={thRight}>Signups</th>
                  <th className={thRight}>Bookings</th>
                  <th className={thRight}>Visitor to signup</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr
                    key={JSON.stringify([
                      row.utm_source,
                      row.utm_medium,
                      row.utm_campaign,
                    ])}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2 break-all text-foreground">
                      {row.utm_source || "â€“"}
                    </td>
                    <td className="px-3 py-2 break-all text-foreground">
                      {row.utm_medium || "â€“"}
                    </td>
                    <td className="px-3 py-2 break-all text-foreground">
                      {row.utm_campaign || "â€“"}
                    </td>
                    <td className={tdNum}>{row.visitors}</td>
                    <td className={tdNum}>{row.visits}</td>
                    <td className={tdNum}>{row.signup_starts}</td>
                    <td className={tdNum}>{row.signup_completions}</td>
                    <td className={tdNum}>{row.booking_completions}</td>
                    <td className={`${tdNum} text-muted-foreground`}>
                      {pctCell(row.signup_completions, row.visitors)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading>Campaign to account</SectionHeading>
        <p className="text-xs text-muted-foreground">
          Accounts keep the attribution captured at signup for life, so this
          table is lifetime and ignores the selected range. The visitor counts
          above are period-scoped; the windows differ, so no rate is computed
          between the two tables.
        </p>
        {accountRows.length === 0 ? (
          <EmptyState text="No accounts carry signup attribution yet." />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className={thLeft}>Source</th>
                  <th className={thLeft}>Medium</th>
                  <th className={thLeft}>Campaign</th>
                  <th className={thRight}>Accounts created</th>
                  <th className={thRight}>Activated accounts</th>
                </tr>
              </thead>
              <tbody>
                {accountRows.map((row) => (
                  <tr
                    key={JSON.stringify([row.source, row.medium, row.campaign])}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2 break-all text-foreground">
                      {row.source ?? "â€“"}
                    </td>
                    <td className="px-3 py-2 break-all text-foreground">
                      {row.medium ?? "â€“"}
                    </td>
                    <td className="px-3 py-2 break-all text-foreground">
                      {row.campaign ?? "â€“"}
                    </td>
                    <td className={tdNum}>{row.accounts}</td>
                    <td className={tdNum}>{row.activated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
