import { NextResponse } from "next/server";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getUserExplorerRows,
  parseExplorerFilters,
} from "@/lib/growth-queries";

export const runtime = "nodejs";

// GET /admin/growth/users/export?<explorer query string>
//
// CSV export of the User explorer with the SAME filters as the page (the page
// links here with its current query string). Admin-gated via getAdminId (route
// handlers must not use requireAdmin, which redirects instead of failing the
// request). Deliberately exports operational metrics only: no artist emails
// and no customer data ever go into this file.

const MAX_EXPORT_ROWS = 10_000;

/** RFC-4180 style escaping plus formula-injection hardening: fields starting
 *  with =, +, - or @ (artist-controlled display names) get a leading
 *  apostrophe so spreadsheet apps treat them as text, never as formulas. */
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
  const params: Record<string, string | undefined> = Object.fromEntries(
    url.searchParams.entries(),
  );
  const context = await getGrowthContext(params);
  const filters = parseExplorerFilters(params);

  // Unpaginated core: one dataset fetch for the whole export (React cache()
  // does not dedupe across calls in a route handler, so looping the paged
  // variant would refetch everything per 50-row page).
  const { mapped } = await getUserExplorerRows(context, filters);
  const limited = mapped.slice(0, MAX_EXPORT_ROWS);

  await writeAudit({
    action: "admin_growth_export",
    actor: adminId,
    category: "admin",
  });

  const header = [
    "id",
    "slug",
    "display_name",
    "claimed_at",
    "stage",
    "retention",
    "activated",
    "source",
    "total_requests",
    "approved_requests",
    "deposits_paid",
    "lifecycle_sends",
    "support_tickets",
    "last_activity_days_ago",
    "mobile",
    "is_tester",
  ].join(",");

  const lines = limited.map((row) =>
    [
      row.id,
      row.slug,
      row.displayName,
      row.claimedAt,
      row.stage,
      row.retention,
      row.activated ? "true" : "false",
      row.source,
      String(row.totalRequests),
      String(row.approvedRequests),
      String(row.depositsPaid),
      String(row.lifecycleSends),
      String(row.supportTickets),
      row.lastActivityDaysAgo === null ? "" : String(row.lastActivityDaysAgo),
      row.mobile ? "true" : "false",
      row.isTester ? "true" : "false",
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [header, ...lines].join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="growth-users.csv"',
      "Cache-Control": "no-store",
    },
  });
}
