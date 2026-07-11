import { NextResponse } from "next/server";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  waBreakdown,
  waCampaigns,
  type WaDimension,
} from "@/lib/public-analytics/queries";

export const runtime = "nodejs";

// GET /admin/growth/acquisition/export?view=<view>&range=...
//
// CSV export of the public-analytics acquisition tables, reusing the SAME
// query functions as the pages (never a parallel query path). Admin-gated via
// getAdminId (route handlers must not use requireAdmin, which redirects
// instead of failing the request). First-party collector data only: Search
// Console metrics are a different measurement and never appear here.

const EXPORT_LIMIT = 500;

/** Exportable views mapped onto the wa_breakdown dimensions; "campaigns"
 *  goes through waCampaigns instead. */
const VIEW_DIMENSIONS: Record<string, WaDimension> = {
  pages: "landing_path",
  channels: "channel",
  referrers: "referrer_domain",
  geo: "country_code",
  devices: "device_type",
};

/** RFC-4180 style escaping plus formula-injection hardening: fields starting
 *  with =, +, - or @ (visitor-controlled landing paths, referrer domains and
 *  UTM tags) get a leading apostrophe so spreadsheet apps treat them as text,
 *  never as formulas. */
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
  const dimension = Object.prototype.hasOwnProperty.call(VIEW_DIMENSIONS, view)
    ? VIEW_DIMENSIONS[view]
    : null;
  if (view !== "campaigns" && dimension === null) {
    return NextResponse.json({ error: "unknown view" }, { status: 400 });
  }

  const params: Record<string, string | undefined> = Object.fromEntries(
    url.searchParams.entries(),
  );
  const context = await getGrowthContext(params);

  let header: string[];
  let rows: string[][];
  if (view === "campaigns") {
    const campaigns = await waCampaigns(context, EXPORT_LIMIT);
    header = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "visitors",
      "visits",
      "signup_starts",
      "signup_completions",
      "booking_completions",
    ];
    rows = campaigns.map((row) => [
      row.utm_source ?? "",
      row.utm_medium ?? "",
      row.utm_campaign ?? "",
      String(row.visitors),
      String(row.visits),
      String(row.signup_starts),
      String(row.signup_completions),
      String(row.booking_completions),
    ]);
  } else {
    // Non-null here: the guard above rejected every other case, but TS cannot
    // correlate the two variables across the branch.
    const dim = dimension as WaDimension;
    const breakdown = await waBreakdown(context, dim, EXPORT_LIMIT);
    header = [
      dim,
      "visitors",
      "visits",
      "pageviews",
      "signup_starts",
      "signup_completions",
      "booking_completions",
    ];
    rows = breakdown.map((row) => [
      row.dimension_value ?? "",
      String(row.visitors),
      String(row.visits),
      String(row.pageviews),
      String(row.signup_starts),
      String(row.signup_completions),
      String(row.booking_completions),
    ]);
  }

  await writeAudit({
    action: "admin_growth_export",
    actor: adminId,
    category: "admin",
    details: { section: "acquisition", view },
  });

  const lines = rows.map((row) => row.map(csvEscape).join(","));
  const csv = [header.join(","), ...lines].join("\r\n") + "\r\n";

  // The filename interpolation is safe: view was validated against the fixed
  // set above.
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="acquisition-${view}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
