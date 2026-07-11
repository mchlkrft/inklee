import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getGscConnectionState,
  gscDimensionAgg,
  gscWindowFor,
  waOrganicLanding,
  type GscAggRow,
} from "@/lib/public-analytics/queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import SearchNav from "../search-nav";
import GscReconnectBanner from "../gsc-reconnect-banner";
import {
  joinOrganicLandingPages,
  parseOrganicSort,
  sortOrganicRows,
  type OrganicJoinRow,
  type OrganicSortKey,
} from "./join";

const MAX_TABLE_ROWS = 200;

/** "–" is the standing placeholder for a side that was not measured. */
function numCell(value: number | null): string {
  return value === null ? "–" : String(value);
}

function pctCell(value: number | null): string {
  return value === null ? "–" : `${value}%`;
}

function gscTitle(row: OrganicJoinRow): string | undefined {
  if (!row.gscPageUrl) return undefined;
  const extra = row.gscUrlCount - 1;
  return extra > 0
    ? `${row.gscPageUrl} and ${extra} more source ${extra === 1 ? "URL" : "URLs"}`
    : row.gscPageUrl;
}

export default async function GrowthSearchOrganicPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "search_organic" },
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const sort = parseOrganicSort(params.sort);
  const gsc = await getGscConnectionState();

  const gscWindow = gsc.activeProperty
    ? gscWindowFor(context, gsc.latestSourceDate)
    : null;
  const [gscPages, waRows] = await Promise.all([
    gsc.activeProperty && gscWindow
      ? gscDimensionAgg(
          gsc.activeProperty.id,
          "page",
          gscWindow.fromDay,
          gscWindow.toDay,
          500,
        )
      : Promise.resolve([] as GscAggRow[]),
    waOrganicLanding(context.range.from, context.range.to),
  ]);

  const rows = sortOrganicRows(joinOrganicLandingPages(gscPages, waRows), sort);
  const shown = rows.slice(0, MAX_TABLE_ROWS);

  // Cross-link and header hrefs keep the shared range selection; the default
  // sort (impressions) stays out of the URL.
  const carried = new URLSearchParams();
  if (params.range) carried.set("range", params.range);
  if (params.from) carried.set("from", params.from);
  if (params.to) carried.set("to", params.to);
  const sortHref = (key: OrganicSortKey) => {
    const next = new URLSearchParams(carried);
    if (key !== "impressions") next.set("sort", key);
    const qs = next.toString();
    return qs
      ? `/admin/growth/search/organic?${qs}`
      : "/admin/growth/search/organic";
  };
  const exportQuery = new URLSearchParams(carried);
  if (sort !== "impressions") exportQuery.set("sort", sort);
  const exportHref = `/admin/growth/search/organic/export${
    exportQuery.toString() ? `?${exportQuery.toString()}` : ""
  }`;

  let gscNote: React.ReactNode = null;
  if (!gsc.connected) {
    gscNote = (
      <>
        Search Console is not connected, so the Google columns stay empty.
        Connect it on the{" "}
        <Link
          href="/admin/growth/search"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Search Console tab
        </Link>
        .
      </>
    );
  } else if (!gsc.activeProperty) {
    gscNote = (
      <>
        No Search Console property is selected yet, so the Google columns stay
        empty. Pick one on the{" "}
        <Link
          href="/admin/growth/search"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Search Console tab
        </Link>
        .
      </>
    );
  } else if (!gscWindow) {
    gscNote = (
      <>
        Search Console has no synced days inside this range yet, so the Google
        columns stay empty.
      </>
    );
  }

  const sortableHeader = (label: string, key: OrganicSortKey) => (
    <Link
      href={sortHref(key)}
      className={
        sort === key
          ? "text-foreground"
          : "transition-colors hover:text-foreground"
      }
    >
      {label}
      {sort === key ? " ↓" : ""}
    </Link>
  );

  return (
    <div className="space-y-6">
      <SearchNav active="organic" params={params} />
      <RangePicker />
      <GscReconnectBanner needsReconnect={gsc.needsReconnect} />

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Google clicks and first-party organic visits are different
          measurements and are never merged. Search Console reports by source
          date on Google&apos;s side (delayed about two days); the first-party
          collector counts organic-search visits in reporting-timezone days. The
          two sides will not match exactly, and no multi-touch attribution is
          attempted: a visit counts once, against its landing page.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionHeading>Organic landing pages</SectionHeading>
          <a
            href={exportHref}
            className="text-xs text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
          >
            Download CSV
          </a>
        </div>

        {gscNote && <p className="text-xs text-muted-foreground">{gscNote}</p>}
        {gscWindow && (
          <p className="text-xs text-muted-foreground">
            Search Console window: {gscWindow.fromDay} to {gscWindow.toDay}{" "}
            (source dates). First-party visits cover the selected range in the
            reporting timezone.
          </p>
        )}

        {rows.length === 0 ? (
          <EmptyState text="No organic search data recorded in this range yet. First-party organic visits start with the collector deploy, and Google rows appear once Search Console is connected and synced." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th
                      rowSpan={2}
                      className="px-3 py-2 text-left align-bottom text-xs font-medium normal-case tracking-normal"
                    >
                      Page
                    </th>
                    <th
                      colSpan={4}
                      className="border-l border-border px-3 pt-2 text-left font-medium"
                    >
                      Search Console (delayed, source dates)
                    </th>
                    <th
                      colSpan={5}
                      className="border-l border-border px-3 pt-2 text-left font-medium"
                    >
                      First-party organic (reporting-timezone days)
                    </th>
                  </tr>
                  <tr className="text-xs text-muted-foreground">
                    <th className="border-l border-border px-3 py-2 text-right font-medium">
                      {sortableHeader("Impressions", "impressions")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {sortableHeader("Clicks", "clicks")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">CTR</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Avg position
                    </th>
                    <th className="border-l border-border px-3 py-2 text-right font-medium">
                      {sortableHeader("Visitors", "visitors")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Visits</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Signup starts
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {sortableHeader("Signups", "signups")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {sortableHeader("Conversion", "conversion")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.path} className="border-t border-border">
                      <td className="px-3 py-2 text-foreground">
                        <span className="break-all" title={gscTitle(row)}>
                          {row.path}
                        </span>
                      </td>
                      <td className="border-l border-border px-3 py-2 text-right tabular-nums text-foreground">
                        {numCell(row.impressions)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {numCell(row.clicks)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {pctCell(row.ctrPct)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.avgPosition === null
                          ? "–"
                          : row.avgPosition.toFixed(1)}
                      </td>
                      <td className="border-l border-border px-3 py-2 text-right tabular-nums text-foreground">
                        {numCell(row.visitors)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {numCell(row.visits)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {numCell(row.signupStarts)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {numCell(row.signupCompletions)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {pctCell(row.conversionPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > MAX_TABLE_ROWS && (
              <p className="text-xs text-muted-foreground">
                Showing the top {MAX_TABLE_ROWS} of {rows.length} pages by the
                current sort. The CSV export contains every row.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              A page can rank on Google without recorded visits, and take
              organic visits without a Search Console row; the missing side
              shows – instead of a fake zero. Conversion is signup completions
              out of first-party organic visits. Google columns cover the top
              500 pages by impressions in the window; hover a path to see the
              full Search Console URL.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
