import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  financialYearRetentionCutoff,
  monthsAgoCutoff,
} from "@/lib/server/retention-cutoffs";
import { runShopRetentionPurges } from "@/lib/server/shop-retention";
import { runBillingRecordRetentionPurges } from "@/lib/server/billing-record-retention";
import { runIntakeRetentionPurges } from "@/lib/server/intake-retention";
import { runTaxThresholdRollup } from "@/lib/server/tax-threshold-rollup";
import { runConnectAccountTeardown } from "@/lib/server/connect-account-teardown";
import {
  alertOnRetentionStepFailures,
  deleteMatchingRows,
  recordRetentionRun,
  retentionModeFromRequest,
  type RetentionFilter,
  type RetentionMode,
  type RetentionStepResult,
} from "@/lib/server/retention-run";

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
//     AND, since counsel Q13, only once the Connected Account that row points
//     at has actually been deleted at Stripe — see the step's own comment.
//   • Connected Accounts at window-end (counsel Q13 clause 2, migration
//     0148 + connect-account-teardown.ts): request deletion of the artist's
//     Connect account, zero balance required, on the same 7-year clock. Runs
//     BEFORE the archive purge because the purge is conditioned on it.
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
//     `transaction_tax_snapshots` (the fifth) used to be excluded because its
//     append-only trigger refused every delete; counsel Q1 amended that
//     control (migration 0148) so the ledger stays immutable against EDITS
//     and becomes deletable by exactly one path, this purge. Delegated to
//     billing-record-retention.ts, which is DB-tested on its own.
//   • LO-5 DPIA §7 mitigation R6 (intake-retention.ts): the 90-day intake
//     retention purge, a precondition of BOTH activation gates. Deletes the
//     `project_media` rows AND their storage objects for intakes that never
//     converted past `submitted`, and for projects 90 days closed. Live work
//     (`under_review`/`consultation`/`active`) is deliberately exempt,
//     because the intake sells sleeves and bodysuits "over months" and a
//     90-day-from-creation rule would delete an artist's working references
//     mid-project. Both clocks run from an EVENT (D4). The module also
//     reports two non-purging health counts: closed projects with no
//     `closed_at` (unpurgeable, would otherwise be silent) and the size of
//     the exempt set.
//   • A2 tax-threshold rollup (counsel-accountant-handoff-2026-08.md PART 4
//     A2, tax-threshold-rollup.ts): NOT a purge, but reuses this SAME weekly
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
// still reported. Counsel ratified that shape as Q14 element (3) and added
// "every block failure alerts": each step captures its own exception, and
// `alertOnRetentionStepFailures` raises one more event naming the whole set.
//
// CADENCE (counsel deviation D3, 2026-08-02): the schedule in vercel.json is
// WEEKLY, not monthly. A monthly cron turned counsel's 30-day rules into up
// to ~60 days in practice, and "a stated retention period must be honest."
// See vercel.json for the plan constraint that makes weekly the finest
// cadence worth choosing here.
//
// MODES (counsel Q14 element 2). `?mode=dry-run` reports the row count every
// block MATCHES and writes nothing, so the control's reach can be evidenced
// in production before it has ever deleted anything. Every step builds its
// counting query and its mutating query from ONE predicate
// (`lib/server/retention-run.ts`), so the dry-run number cannot drift from
// what a real run would touch. Absence of the parameter, or any unrecognised
// value, means a real purge — a typo must never silently turn the scheduled
// run into a no-op that reports success.
async function runStep(
  name: string,
  run: () => Promise<number>,
): Promise<RetentionStepResult> {
  try {
    return { ok: true, count: await run() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { action: "retention_purge", step: name },
    });
    return { ok: false, error: message };
  }
}

/**
 * One block: a table, the column counted/returned, and its retention
 * predicate written exactly once. `deleteMatchingRows` builds either the
 * DELETE or the exact head-count from that same predicate.
 */
type TableStep = {
  /** Response-body / run-log key. Historic names, deliberately unchanged. */
  key: string;
  /** Sentry tag, and the table it purges. */
  table: string;
  column: string;
  filter: RetentionFilter;
};

function tableSteps(now: Date): TableStep[] {
  const financialCutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const auditCutoff = monthsAgoCutoff(now, 24).toISOString();
  const auditCutoffDay = auditCutoff.slice(0, 10);

  return [
    // CONDITIONED ON THE ACCOUNT ACTION, not on the timer alone (counsel Q13,
    // migration 0148). The archive row carries `stripe_account_id`, the only
    // thing that can ever find the artist's Connected Account again; purging
    // it while that account is still live at Stripe orphans the account
    // permanently. The disjunction below is the SAME predicate as 0148's
    // `dar_no_premature_purge` trigger — the filter is what keeps this step
    // reporting a clean count, the trigger is what makes the ordering hold
    // for every other caller. `connect_account_teardown` runs before this
    // loop, so a row that completes its teardown is purged in the same pass.
    {
      key: "purged_financial_records",
      table: "deleted_account_records",
      column: "id",
      filter: (q) =>
        q
          .lt("deleted_at", financialCutoff)
          .or("stripe_account_id.is.null,connect_teardown_state.eq.completed"),
    },
    {
      key: "purged_audit_rows",
      table: "audit_log",
      column: "id",
      filter: (q) => q.is("booking_id", null).lt("timestamp", auditCutoff),
    },
    {
      key: "purged_admin_rows",
      table: "admin_action_log",
      column: "id",
      filter: (q) => q.lt("created_at", auditCutoff),
    },
    {
      key: "purged_analytics_events",
      table: "analytics_events",
      column: "id",
      filter: (q) => q.lt("occurred_at", auditCutoff),
    },
    {
      key: "purged_activity_days",
      table: "artist_activity_days",
      column: "artist_id",
      filter: (q) => q.lt("day", auditCutoffDay),
    },
    // Public web analytics rows are anonymous by construction (daily-rotating
    // visitor hash) but still follow the same 24-month bound. The sessionized
    // daily rollup (migration 0073) carries the same visit rows, so it is
    // purged on the same clock, along with its coverage bookkeeping.
    {
      key: "purged_web_analytics_events",
      table: "web_analytics_events",
      column: "id",
      filter: (q) => q.lt("occurred_at", auditCutoff),
    },
    {
      key: "purged_wa_visits",
      table: "wa_visits_daily",
      column: "day",
      filter: (q) => q.lt("day", auditCutoffDay),
    },
    {
      key: "purged_wa_rollup_days",
      table: "wa_visit_rollup_days",
      column: "day",
      filter: (q) => q.lt("day", auditCutoffDay),
    },
    // Map reports (DSA register, migration 0075): keep 24 months, same clock
    // as the audit rows. Statements of reasons (moderation_statements) are
    // kept 5 years and deliberately NOT purged here yet; their purge lands
    // with the Phase 7 threshold machinery that starts creating them.
    {
      key: "purged_map_reports",
      table: "map_reports",
      column: "id",
      filter: (q) => q.lt("created_at", auditCutoff),
    },
  ];
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const mode: RetentionMode = retentionModeFromRequest(request);
  const startedAt = Date.now();
  const now = new Date();

  const steps: Record<string, RetentionStepResult> = {};

  // FIRST, and before the archive purge below: counsel Q13 clause 2. At
  // window-end (the same 7-year financial window as the records) Inklee owes
  // an affirmative action on the artist's Connected Account — request its
  // deletion, zero balance required. Only once that has completed may the
  // pointer be purged, so this runs first and a row that completes here is
  // purgeable in the SAME cycle. Until ~2033 it matches zero rows, which is
  // reported as an evidenced zero rather than left silent (Q14).
  const teardown = await runStep("connect_account_teardown", async () => {
    const result = await runConnectAccountTeardown(now, mode);
    steps.connect_teardowns_blocked = { ok: true, count: result.blocked };
    return result.completed;
  });
  steps.connect_accounts_torn_down = teardown;

  for (const step of tableSteps(now)) {
    steps[step.key] = await runStep(step.table, () =>
      deleteMatchingRows(mode, step.table, step.column, step.filter),
    );
  }

  const shopSteps = await runShopRetentionPurges(now, mode);
  for (const [name, result] of Object.entries(shopSteps)) {
    steps[name] = result;
  }

  const billingSteps = await runBillingRecordRetentionPurges(now, mode);
  for (const [name, result] of Object.entries(billingSteps)) {
    steps[name] = result;
  }

  // LO-5 DPIA R6. The only block here that deletes STORAGE OBJECTS as well as
  // rows, which is why it lives in its own module with its own fail-loud
  // ordering rather than as a `tableSteps` entry.
  const intakeSteps = await runIntakeRetentionPurges(now, mode);
  for (const [name, result] of Object.entries(intakeSteps)) {
    steps[name] = result;
  }

  // The A2 tax-threshold rollup is the one step here that is not a purge: it
  // WRITES tax_thresholds.current_minor/status. A dry-run that mutates is not
  // a dry-run, and there is no counts-only version of a recompute-and-store,
  // so it is skipped outright and named in `skipped` rather than reported as
  // a zero it never earned.
  const skipped: string[] = [];
  if (mode === "dry-run") {
    skipped.push("tax_threshold_rollup");
  } else {
    const thresholdSteps = await runTaxThresholdRollup(now);
    for (const [name, result] of Object.entries(thresholdSteps)) {
      steps[name] = result;
    }
  }

  const counts: Record<string, number> = {};
  const errors: { step: string; error: string }[] = [];
  for (const [name, result] of Object.entries(steps)) {
    if (result.ok) counts[name] = result.count;
    else errors.push({ step: name, error: result.error });
  }

  alertOnRetentionStepFailures(mode, errors);

  // The durable evidence row (migration 0149). Written for BOTH modes and for
  // failed runs: counsel's "zero is then an evidenced result, not silence"
  // only holds if the record exists whatever the outcome was.
  const runLogError = await recordRetentionRun({
    mode,
    ok: errors.length === 0,
    stepCounts: counts,
    stepErrors: errors,
    durationMs: Date.now() - startedAt,
    now,
  });

  return NextResponse.json(
    {
      mode,
      ...counts,
      ...(skipped.length > 0 ? { skipped } : {}),
      ...(errors.length > 0 ? { errors } : {}),
      ...(runLogError ? { run_log_error: runLogError } : {}),
    },
    { status: errors.length > 0 ? 500 : 200 },
  );
}
