import { NextResponse } from "next/server";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getGscConnectionState,
  gscDimensionAgg,
  gscWindowFor,
  waOrganicLanding,
  type GscAggRow,
} from "@/lib/public-analytics/queries";
import {
  joinOrganicLandingPages,
  parseOrganicSort,
  sortOrganicRows,
} from "../join";

export const runtime = "nodejs";

// GET /admin/growth/search/organic/export?<page query string>
//
// CSV export of the combined organic landing-pages view with the SAME range
// and sort as the page (the page links here with its current query string).
// Admin-gated via getAdminId (route handlers must not use requireAdmin, which
// redirects instead of failing the request). GSC metrics and first-party
// metrics stay in separate columns: they are different measurements with
// different reporting boundaries and are never merged. Empty cells mean the
// side was not measured, not zero.

const MAX_EXPORT_ROWS = 10_000;

/** RFC-4180 style escaping plus formula-injection hardening: fields starting
 *  with =, +, - or @ (URL/path values come from external data) get a leading
 *  apostrophe so spreadsheet apps treat them as text, never as formulas. */
function csvEscape(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

function cell(value: number | null): string {
  return value === null ? "" : String(value);
}

export async function GET(request: Request) {
  const adminId = await getAdminId();
  if (!adminId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const params: Record<string, string | undefined> = Object.fromEntries(
    url.searchParams.entries(),
  );
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

  const rows = sortOrganicRows(
    joinOrganicLandingPages(gscPages, waRows),
    sort,
  ).slice(0, MAX_EXPORT_ROWS);

  await writeAudit({
    action: "admin_growth_export",
    actor: adminId,
    category: "admin",
    details: { view: "search_organic" },
  });

  const header = [
    "path",
    "gsc_page_url",
    "gsc_impressions",
    "gsc_clicks",
    "gsc_ctr_pct",
    "gsc_avg_position",
    "organic_visitors",
    "organic_visits",
    "signup_starts",
    "signup_completions",
    "visit_to_signup_pct",
  ].join(",");

  const lines = rows.map((row) =>
    [
      row.path,
      row.gscPageUrl ?? "",
      cell(row.impressions),
      cell(row.clicks),
      cell(row.ctrPct),
      cell(row.avgPosition),
      cell(row.visitors),
      cell(row.visits),
      cell(row.signupStarts),
      cell(row.signupCompletions),
      cell(row.conversionPct),
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [header, ...lines].join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="growth-search-organic.csv"',
      "Cache-Control": "no-store",
    },
  });
}
