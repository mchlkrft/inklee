import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getGscConnectionState,
  gscDimensionAgg,
  gscWindowFor,
} from "@/lib/public-analytics/queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import SearchNav from "../search-nav";
import GscDimensionTable from "../gsc-dimension-table";
import GscReconnectBanner from "../gsc-reconnect-banner";

// Google pages: which Inklee URLs appear (and get clicked) in Google search.
// Search Console data only; first-party landing-page visits live on the
// acquisition tabs and are a different measurement.

export default async function SearchPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "search-pages" },
  });

  const params = await searchParams;
  const [context, state] = await Promise.all([
    getGrowthContext(params),
    getGscConnectionState(),
  ]);

  const setupLink = (
    <p className="text-sm">
      <Link
        href="/admin/growth/search"
        className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
      >
        Open Search Console setup →
      </Link>
    </p>
  );

  if (!state.connected || !state.activeProperty) {
    return (
      <div className="space-y-6">
        <SearchNav active="pages" params={params} />
        <EmptyState
          text={
            state.connected
              ? "Search Console is connected but no property is selected yet."
              : "Search Console is not connected yet."
          }
        />
        {setupLink}
      </div>
    );
  }

  const window = gscWindowFor(context, state.latestSourceDate);
  if (!window) {
    return (
      <div className="space-y-6">
        <SearchNav active="pages" params={params} />
        <RangePicker />
        <EmptyState text="No Search Console data for this range yet. Google delivers search data with a delay of about two days." />
        {setupLink}
      </div>
    );
  }

  const propertyId = state.activeProperty.id;
  const [current, previous] = await Promise.all([
    gscDimensionAgg(propertyId, "page", window.fromDay, window.toDay, 250),
    gscDimensionAgg(
      propertyId,
      "page",
      window.previousFromDay,
      window.previousToDay,
      250,
    ),
  ]);

  const exportQuery = new URLSearchParams({ view: "pages" });
  if (params.range) exportQuery.set("range", params.range);
  if (params.from) exportQuery.set("from", params.from);
  if (params.to) exportQuery.set("to", params.to);

  return (
    <div className="space-y-8">
      <SearchNav active="pages" params={params} />
      <RangePicker />
      <GscReconnectBanner needsReconnect={state.needsReconnect} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionHeading>Google pages</SectionHeading>
          <a
            href={`/admin/growth/search/export?${exportQuery.toString()}`}
            className="text-xs text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
          >
            Download CSV
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Search Console (delayed, source dates). Top 250 pages by impressions,{" "}
          {window.fromDay} to {window.toDay}, compared with{" "}
          {window.previousFromDay} to {window.previousToDay}.
        </p>
        {current.length > 0 ? (
          <>
            <GscDimensionTable
              variant="page"
              current={current}
              previous={previous}
            />
            <p className="text-xs text-muted-foreground">
              Position change is previous minus current, so a positive number
              means the page moved up. Query and page rows may not sum to the
              property totals; Google omits some low-volume rows.
            </p>
          </>
        ) : (
          <EmptyState text="No page rows synced for this window yet." />
        )}
      </section>
    </div>
  );
}
