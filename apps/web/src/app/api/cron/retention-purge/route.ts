import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Retention purge (counsel docs/account-deletion-handoff.md §4 + §8). Enforces
// the time-boxes counsel set so retention is never indefinite:
//   • deleted_account_records (pseudonymised financial snapshot): 7 years from
//     the end of the relevant financial year. Financial year = calendar year
//     (founder decision 2026-06-10), so a record is purgeable once 31 Dec of
//     (its year + 7) has passed. We key off deleted_at; since the transaction
//     always precedes deletion this never under-retains (it can over-retain by
//     the account's lifetime, the legally safe direction — if exact
//     transaction-date keying is ever required, parse record.paidAt instead).
//   • audit_log security/tombstone rows (booking_id IS NULL — auth events, the
//     account_deleted tombstone, delivery logs): 24 months. Booking-linked rows
//     (booking_id set) are the financial/booking audit and follow the booking's
//     own lifecycle, so they are left untouched here (§8 "except where linked to
//     a retained financial record").
//   • admin_action_log (moderation log): 24 months.
//   • analytics_events + artist_activity_days (growth cockpit, migration 0067):
//     24 months, matching the audit convention. Account deletion already
//     cascades both via their profiles FK; this bounds retention for accounts
//     that stay.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // 7y-from-financial-year-end (calendar year): purge records whose deletion
  // year is <= currentYear - 8, i.e. deleted_at before 1 Jan of (currentYear-7).
  const financialCutoff = new Date(
    Date.UTC(now.getUTCFullYear() - 7, 0, 1),
  ).toISOString();

  // 24 months ago (calendar months, exact).
  const m24 = new Date(now);
  m24.setUTCMonth(m24.getUTCMonth() - 24);
  const auditCutoff = m24.toISOString();

  const { data: purgedFinancial, error: financialError } = await serviceClient
    .from("deleted_account_records")
    .delete()
    .lt("deleted_at", financialCutoff)
    .select("id");
  if (financialError) {
    return NextResponse.json(
      { error: financialError.message },
      { status: 500 },
    );
  }

  const { data: purgedAudit, error: auditError } = await serviceClient
    .from("audit_log")
    .delete()
    .is("booking_id", null)
    .lt("timestamp", auditCutoff)
    .select("id");
  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  const { data: purgedAdmin, error: adminError } = await serviceClient
    .from("admin_action_log")
    .delete()
    .lt("created_at", auditCutoff)
    .select("id");
  if (adminError) {
    return NextResponse.json({ error: adminError.message }, { status: 500 });
  }

  const { data: purgedEvents, error: eventsError } = await serviceClient
    .from("analytics_events")
    .delete()
    .lt("occurred_at", auditCutoff)
    .select("id");
  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const auditCutoffDay = auditCutoff.slice(0, 10);
  const { data: purgedActivity, error: activityError } = await serviceClient
    .from("artist_activity_days")
    .delete()
    .lt("day", auditCutoffDay)
    .select("artist_id");
  if (activityError) {
    return NextResponse.json({ error: activityError.message }, { status: 500 });
  }

  // Public web analytics rows are anonymous by construction (daily-rotating
  // visitor hash) but still follow the same 24-month bound. The sessionized
  // daily rollup (migration 0073) carries the same visit rows, so it is
  // purged on the same clock, along with its coverage bookkeeping.
  const { data: purgedWebEvents, error: webEventsError } = await serviceClient
    .from("web_analytics_events")
    .delete()
    .lt("occurred_at", auditCutoff)
    .select("id");
  if (webEventsError) {
    return NextResponse.json(
      { error: webEventsError.message },
      { status: 500 },
    );
  }

  const { data: purgedWaVisits, error: waVisitsError } = await serviceClient
    .from("wa_visits_daily")
    .delete()
    .lt("day", auditCutoffDay)
    .select("day");
  if (waVisitsError) {
    return NextResponse.json({ error: waVisitsError.message }, { status: 500 });
  }
  const { error: waRollupDaysError } = await serviceClient
    .from("wa_visit_rollup_days")
    .delete()
    .lt("day", auditCutoffDay);
  if (waRollupDaysError) {
    return NextResponse.json(
      { error: waRollupDaysError.message },
      { status: 500 },
    );
  }

  // Map reports (DSA register, migration 0075): keep 24 months, same clock as
  // the audit rows. Statements of reasons (moderation_statements) are kept
  // 5 years and deliberately NOT purged here yet; their purge lands with the
  // Phase 7 threshold machinery that starts creating them.
  const { data: purgedMapReports, error: mapReportsError } = await serviceClient
    .from("map_reports")
    .delete()
    .lt("created_at", auditCutoff)
    .select("id");
  if (mapReportsError) {
    return NextResponse.json(
      { error: mapReportsError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    purged_financial_records: purgedFinancial?.length ?? 0,
    purged_audit_rows: purgedAudit?.length ?? 0,
    purged_admin_rows: purgedAdmin?.length ?? 0,
    purged_analytics_events: purgedEvents?.length ?? 0,
    purged_activity_days: purgedActivity?.length ?? 0,
    purged_web_analytics_events: purgedWebEvents?.length ?? 0,
    purged_wa_visits: purgedWaVisits?.length ?? 0,
    purged_map_reports: purgedMapReports?.length ?? 0,
  });
}
