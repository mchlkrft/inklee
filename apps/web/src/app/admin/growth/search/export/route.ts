import { NextResponse } from "next/server";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getGscConnectionState,
  gscDimensionAgg,
  gscWindowFor,
} from "@/lib/public-analytics/queries";

export const runtime = "nodejs";

// GET /admin/growth/search/export?view=queries|pages|countries|devices&<range query string>
//
// CSV export of a Search Console dimension over the SAME window as the page
// linking here (the range params travel in the query string; the window is
// re-derived server-side via gscWindowFor). Admin-gated via getAdminId (route
// handlers must not use requireAdmin, which redirects instead of failing the
// request). Search Console rows are aggregate search statistics; no personal
// data is ever in this file.

const VIEWS = {
  queries: "query",
  pages: "page",
  countries: "country",
  devices: "device",
} as const;

type ViewName = keyof typeof VIEWS;

const MAX_EXPORT_ROWS = 1000;

/** RFC-4180 style escaping plus formula-injection hardening: fields starting
 *  with =, +, - or @ (Google queries are searcher-controlled text) get a
 *  leading apostrophe so spreadsheet apps treat them as text, never as
 *  formulas. */
function csvEscape(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

export async function GET(request: Request) {
  const adminId = await getAdminId();
  if (!adminId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "";
  if (!Object.prototype.hasOwnProperty.call(VIEWS, view)) {
    return NextResponse.json({ error: "unknown_view" }, { status: 400 });
  }
  const dimension = VIEWS[view as ViewName];

  const params: Record<string, string | undefined> = Object.fromEntries(
    url.searchParams.entries(),
  );
  const [context, state] = await Promise.all([
    getGrowthContext(params),
    getGscConnectionState(),
  ]);
  if (!state.connected || !state.activeProperty) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }

  // No synced data in the selected window: export an empty (header-only) CSV
  // rather than failing the download.
  const window = gscWindowFor(context, state.latestSourceDate);
  const rows = window
    ? await gscDimensionAgg(
        state.activeProperty.id,
        dimension,
        window.fromDay,
        window.toDay,
        MAX_EXPORT_ROWS,
      )
    : [];

  await writeAudit({
    action: "admin_growth_export",
    actor: adminId,
    category: "admin",
    details: { section: "search", view },
  });

  const header = [
    dimension,
    "clicks",
    "impressions",
    "ctr",
    "average_position",
  ].join(",");
  const lines = rows.map((row) =>
    [
      row.dimension_value,
      String(row.clicks),
      String(row.impressions),
      String(Math.round(row.ctr * 10_000) / 10_000),
      String(Math.round(row.average_position * 100) / 100),
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [header, ...lines].join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="search-${view}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
