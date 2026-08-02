import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  financialYearRetentionCutoff,
  monthsAgoCutoff,
} from "@/lib/server/retention-cutoffs";
import { runShopRetentionPurges } from "@/lib/server/shop-retention";
import { runBillingRecordRetentionPurges } from "@/lib/server/billing-record-retention";
import { runTaxThresholdRollup } from "@/lib/server/tax-threshold-rollup";

export const runtime = "nodejs";

// Retention purge (counsel docs/account-deletion-handoff.md §4 + §8, plus
// docs/legal/counsel-accountant-handoff-2026-08.md PART 4 C1.4 for the
// guest-shop steps added below). Enforces the time-boxes counsel set so
// retention is never indefinite:
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
//   • guest-shop rows (C1.4, standalone-order buyers who never have an
//     account): erase a cancelled standalone order's email 30 days after
//     cancellation, erase a completed standalone order's email 7 years from
//     the end of its financial year, delete an abandoned cart 30 days after
//     last activity, delete an inactive wishlist item after 12 months —
//     delegated to shop-retention.ts, which is unit- and DB-tested on its
//     own.
//   • BDEL-RET-002: four of the five billing tables migration 0129 moved to
//     ON DELETE SET NULL (so they survive account deletion) — a DELETED
//     account's (artist_id IS NULL) withdrawal_cases, billing_contract_
//     confirmations, billing_consent_records and billing_subscriptions rows,
//     7 years from the end of the financial year, dependency-ordered so a
//     row is never purged while another still-retained row references it.
//     `transaction_tax_snapshots` (the fifth) is deliberately NOT purged
//     here — see billing-record-retention.ts for why. Delegated to
//     billing-record-retention.ts, which is DB-tested on its own.
//   • A2 tax-threshold rollup (counsel-accountant-handoff-2026-08.md PART 4
//     A2, tax-threshold-rollup.ts): NOT a purge, but reuses this SAME monthly
//     schedule deliberately rather than registering a new vercel.json cron
//     entry (Vercel cron slots are a scarce resource on this plan). Sums
//     every platform-fee-revenue source since 1 Jan and writes
//     tax_thresholds.current_minor/status under the accountant's conservative
//     counting rule.
//
// SEQUENCING: every step below runs independently via `runStep`/
// `runShopRetentionPurges`. This used to be eight sequential blocks that each
// `return`ed a 500 on its own error, which meant a failure in block 3 left
// blocks 4-8 unexecuted with NO retry until the next scheduled run (found
// 2026-08-02 reviewing this file for the C1.4 addition — the file had zero
// tests before this change). A failed step is now reported per-step in the
// response body and the route still 500s if any step failed (so cron
// monitoring still alerts), but every OTHER step still runs and its count is
// still reported.
async function runStep(
  name: string,
  run: () => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const { data, error } = await run();
    if (error) throw new Error(error.message);
    return { ok: true, count: data?.length ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { action: "retention_purge", step: name },
    });
    return { ok: false, error: message };
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const financialCutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const auditCutoff = monthsAgoCutoff(now, 24).toISOString();
  const auditCutoffDay = auditCutoff.slice(0, 10);

  const steps: Record<
    string,
    { ok: true; count: number } | { ok: false; error: string }
  > = {};

  steps.purged_financial_records = await runStep(
    "deleted_account_records",
    () =>
      serviceClient
        .from("deleted_account_records")
        .delete()
        .lt("deleted_at", financialCutoff)
        .select("id"),
  );

  steps.purged_audit_rows = await runStep("audit_log", () =>
    serviceClient
      .from("audit_log")
      .delete()
      .is("booking_id", null)
      .lt("timestamp", auditCutoff)
      .select("id"),
  );

  steps.purged_admin_rows = await runStep("admin_action_log", () =>
    serviceClient
      .from("admin_action_log")
      .delete()
      .lt("created_at", auditCutoff)
      .select("id"),
  );

  steps.purged_analytics_events = await runStep("analytics_events", () =>
    serviceClient
      .from("analytics_events")
      .delete()
      .lt("occurred_at", auditCutoff)
      .select("id"),
  );

  steps.purged_activity_days = await runStep("artist_activity_days", () =>
    serviceClient
      .from("artist_activity_days")
      .delete()
      .lt("day", auditCutoffDay)
      .select("artist_id"),
  );

  // Public web analytics rows are anonymous by construction (daily-rotating
  // visitor hash) but still follow the same 24-month bound. The sessionized
  // daily rollup (migration 0073) carries the same visit rows, so it is
  // purged on the same clock, along with its coverage bookkeeping.
  steps.purged_web_analytics_events = await runStep(
    "web_analytics_events",
    () =>
      serviceClient
        .from("web_analytics_events")
        .delete()
        .lt("occurred_at", auditCutoff)
        .select("id"),
  );

  steps.purged_wa_visits = await runStep("wa_visits_daily", () =>
    serviceClient
      .from("wa_visits_daily")
      .delete()
      .lt("day", auditCutoffDay)
      .select("day"),
  );

  steps.purged_wa_rollup_days = await runStep("wa_visit_rollup_days", () =>
    serviceClient
      .from("wa_visit_rollup_days")
      .delete()
      .lt("day", auditCutoffDay)
      .select("day"),
  );

  // Map reports (DSA register, migration 0075): keep 24 months, same clock as
  // the audit rows. Statements of reasons (moderation_statements) are kept
  // 5 years and deliberately NOT purged here yet; their purge lands with the
  // Phase 7 threshold machinery that starts creating them.
  steps.purged_map_reports = await runStep("map_reports", () =>
    serviceClient
      .from("map_reports")
      .delete()
      .lt("created_at", auditCutoff)
      .select("id"),
  );

  const shopSteps = await runShopRetentionPurges(now);
  for (const [name, result] of Object.entries(shopSteps)) {
    steps[name] = result;
  }

  const billingSteps = await runBillingRecordRetentionPurges(now);
  for (const [name, result] of Object.entries(billingSteps)) {
    steps[name] = result;
  }

  const thresholdSteps = await runTaxThresholdRollup(now);
  for (const [name, result] of Object.entries(thresholdSteps)) {
    steps[name] = result;
  }

  const body: Record<string, number> = {};
  const errors: { step: string; error: string }[] = [];
  for (const [name, result] of Object.entries(steps)) {
    if (result.ok) body[name] = result.count;
    else errors.push({ step: name, error: result.error });
  }

  return NextResponse.json(errors.length > 0 ? { ...body, errors } : body, {
    status: errors.length > 0 ? 500 : 200,
  });
}
