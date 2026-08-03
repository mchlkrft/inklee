import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { financialYearRetentionCutoff } from "@/lib/server/retention-cutoffs";
import {
  type BalanceBucket,
  type EscalationReason,
  balanceBlockReason,
  deletionRefusedReason,
  findEscalationsDueForReview,
  nextAnnualReview,
  nonZeroBuckets,
  openOrRefreshEscalation,
  resolveEscalation,
  UNREADABLE_BALANCE_REASON,
} from "@/lib/server/connect-teardown-escalation";

/**
 * Counsel Q13 (docs/legal/counsel-handoff-2026-08-02.md §5.3), clause 2 of the
 * ratified Connected-Account decision (docs/account-deletion-handoff.md §7,
 * §11 row 7). Clauses 1 and 3 were already implemented; clause 2 did not exist
 * anywhere in the codebase, and deletion performed no balance check of any
 * kind, so the zero-balance precondition was unenforced.
 *
 * Counsel's answer, in three parts, and each maps to something here:
 *
 *  (a) "Stripe's independent-controller status covers STRIPE's retention of
 *      KYC data; it does not justify Inklee leaving a live, open account
 *      indefinitely. The affirmative action owed at window-end is the one
 *      already ratified: request deletion/deauthorisation of the connected
 *      account."  -> `runConnectAccountTeardown` below.
 *
 *  (b) "'Window-end' means the SEVEN-YEAR FINANCIAL WINDOW -- same clock as
 *      the retained records, deliberately, so the refund-foreclosure risk
 *      dies with the records."  -> `financialYearRetentionCutoff(now, 7)`,
 *      the identical helper the record purges use, keyed to the archive row's
 *      own `deleted_at`.
 *
 *  (c) "Condition the pointer purge on the Stripe-side action having
 *      completed; a purge that can outrun the deletion it enables is a design
 *      fault."  -> enforced in the DATABASE (0148's `dar_no_premature_purge`
 *      trigger), not here. This module can only ever move a row TOWARD
 *      `completed`; it is the trigger that makes the ordering unbreakable for
 *      callers that do not go through this module.
 *
 * TIMING. Counsel: "the scheduled deletion job itself is not launch-blocking
 * (first window-end ~2033) but must exist before the first archive row ages
 * out." It is built now because the alternative is a control that first
 * executes, unattended and in bulk, seven years after anyone looked at it --
 * the exact Q14 objection. Until 2033 every run matches zero rows, which the
 * cron reports as an evidenced zero rather than silence.
 *
 * WHY NOT AT DELETION TIME. Clause 3 of the same ratified decision is "do not
 * force-disconnect at deletion time", and it is deliberate: an artist may
 * still have a balance, a pending payout, or a client refund route running
 * through that account. The teardown is what happens once the whole financial
 * window has closed.
 *
 * ROUND-4 RULING 7.5 (docs/legal/counsel-handoff-round-4-2026-08-02.md §7.5),
 * migration 0153. The above raised its own problem, recorded as §3.3: teardown
 * requires a zero balance, so an account with a permanently non-zero balance
 * never completes and its pointer is never purged, which means the stated
 * seven-year period was not a maximum. Counsel REFUSED a hard deletion
 * deadline, because "force-deleting a Connect account with a non-zero balance
 * orphans money and forecloses refunds", and "the balance *is* the legal
 * claim" (Art. 17(3)(e)). What was refused instead is SILENT indefinite
 * retention. So at the seven-year mark an uncompleted teardown now raises an
 * operator escalation, "an alert and a case", and the continued retention
 * becomes a per-account decision reviewed annually with the reason, the amount
 * and what resolution requires all recorded. Counsel's acceptance criterion is
 * the sentence to hold this to: "the stated period then remains honest: seven
 * years, or documented cause."
 *
 * The case lives in ./connect-teardown-escalation.ts; the alert is raised
 * here, where the outcome is decided.
 */

export type ConnectTeardownRow = {
  id: string;
  stripe_account_id: string;
  connect_teardown_state: string;
};

export type ConnectTeardownResult = {
  /** Rows whose connected account is now deleted (or was already gone). */
  completed: number;
  /** Rows that reached window-end but could not be torn down yet. */
  blocked: number;
  /** Counsel 7.5: cases raised for the FIRST time by this run. */
  escalationsOpened: number;
  /** Counsel 7.5: open cases whose annual review is due or overdue. */
  reviewsDue: number;
};

/**
 * Archive rows that have reached window-end and still owe the Stripe-side
 * action. `blocked` rows are retried every cycle by design: the usual reason
 * is a non-zero balance, which can resolve on its own.
 */
export async function findConnectTeardownDue(
  now: Date = new Date(),
): Promise<ConnectTeardownRow[]> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const { data, error } = await serviceClient
    .from("deleted_account_records")
    .select("id, stripe_account_id, connect_teardown_state")
    .not("stripe_account_id", "is", null)
    .in("connect_teardown_state", ["pending", "blocked"])
    .lt("deleted_at", cutoff);
  if (error) throw error;
  return (data ?? []) as ConnectTeardownRow[];
}

/**
 * Zero balance across EVERY bucket Stripe reports, not just `available`.
 * A pending balance is money still in flight and an in-flight payout is
 * exactly the case the zero-balance precondition exists for; treating only
 * `available` as authoritative would delete an account with money moving
 * through it. Unknown future buckets are handled by iterating whatever
 * arrays Stripe returns rather than naming the two we know about today.
 *
 * ONE TRAVERSAL, shared with the escalation record (counsel 7.5): the
 * gate and the amount the case documents are derived from the same
 * `nonZeroBuckets` call, so the case can never report an amount the gate did
 * not act on, or vice versa. `null` from `nonZeroBuckets` means the balance
 * was unreadable, which is NOT zero: an unevaluated precondition must not
 * read as a satisfied one.
 */
export function balanceIsZero(balance: unknown): boolean {
  const buckets = nonZeroBuckets(balance);
  return buckets !== null && buckets.length === 0;
}

/** Stripe's "this account no longer exists" shape. Already gone == done. */
function isAlreadyGone(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  return (
    code === "resource_missing" ||
    code === "account_invalid" ||
    /no such account|does not (?:exist|have access)/i.test(message)
  );
}

async function markRow(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceClient
    .from("deleted_account_records")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

/**
 * The outcome of one attempt, carrying WHY when it was blocked.
 *
 * The reason and the observed amount are returned rather than only logged
 * because counsel 7.5 requires them to be recorded on a per-account case, and
 * this function is the only place that knows them. Returning them keeps the
 * decision and the record derived from a single observation: a second balance
 * read for the case could disagree with the one the gate acted on.
 */
export type TeardownAttempt = {
  outcome: "completed" | "blocked";
  /** Present only when blocked. The documented cause for the escalation. */
  escalation?: EscalationReason;
  /** Non-zero buckets observed. Empty when the balance was unreadable. */
  buckets?: BalanceBucket[];
};

/**
 * Request deletion of one connected account, gated on a zero balance.
 * Never throws: a per-row failure is recorded on the row and reported, so one
 * unreachable account cannot stop the rest of the batch (the same
 * continue-on-error shape counsel asked for in Q14).
 */
export async function tearDownConnectAccount(
  row: ConnectTeardownRow,
  now: Date = new Date(),
): Promise<TeardownAttempt> {
  if (!stripe) {
    return { outcome: "blocked", escalation: UNREADABLE_BALANCE_REASON };
  }
  const at = now.toISOString();

  let observed: BalanceBucket[] = [];
  let balanceOk = false;
  try {
    // `stripeAccount` is a REQUEST OPTION (second argument), not a param: it
    // is the Stripe-Account header that scopes the read to the connected
    // account. Passing it in the first argument type-errors, and a version
    // that silently accepted it would read the PLATFORM's balance instead —
    // which is never zero, so every teardown would block forever.
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: row.stripe_account_id },
    );
    const buckets = nonZeroBuckets(balance);
    observed = buckets ?? [];
    balanceOk = buckets !== null && buckets.length === 0;
    await markRow(row.id, { connect_balance_checked_at: at });
  } catch (err) {
    // An account Stripe no longer knows about has nothing left to tear down,
    // and nothing left to hold a balance either.
    if (isAlreadyGone(err)) {
      await markRow(row.id, {
        connect_teardown_state: "completed",
        connect_teardown_attempted_at: at,
        connect_teardown_completed_at: at,
        connect_teardown_last_error: null,
      });
      return { outcome: "completed" };
    }
    await markRow(row.id, {
      connect_teardown_state: "blocked",
      connect_teardown_attempted_at: at,
      connect_teardown_last_error: `balance check failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return {
      outcome: "blocked",
      escalation: UNREADABLE_BALANCE_REASON,
      buckets: [],
    };
  }

  if (!balanceOk) {
    await markRow(row.id, {
      connect_teardown_state: "blocked",
      connect_teardown_attempted_at: at,
      connect_teardown_last_error:
        "non-zero balance; deletion requires a zero balance",
    });
    return {
      outcome: "blocked",
      escalation: balanceBlockReason(observed),
      buckets: observed,
    };
  }

  try {
    await stripe.accounts.del(row.stripe_account_id);
  } catch (err) {
    if (!isAlreadyGone(err)) {
      const message = err instanceof Error ? err.message : String(err);
      await markRow(row.id, {
        connect_teardown_state: "blocked",
        connect_teardown_attempted_at: at,
        connect_teardown_last_error: `account deletion failed: ${message}`,
      });
      return {
        outcome: "blocked",
        escalation: deletionRefusedReason(message),
        buckets: observed,
      };
    }
  }

  await markRow(row.id, {
    connect_teardown_state: "completed",
    connect_teardown_attempted_at: at,
    connect_teardown_completed_at: at,
    connect_teardown_last_error: null,
  });
  return { outcome: "completed" };
}

/**
 * The scheduled job. Runs BEFORE the archive purge in the same cron cycle, so
 * a row that completes its teardown is purgeable in the same pass rather than
 * waiting another month.
 *
 * `dry-run` reports what is due without contacting Stripe or writing anything
 * — deleting a payment-processor account is not a rehearsable operation, so
 * the report mode reports and does nothing else.
 */
export async function runConnectAccountTeardown(
  now: Date = new Date(),
  mode: "purge" | "dry-run" = "purge",
): Promise<ConnectTeardownResult> {
  const due = await findConnectTeardownDue(now);

  // The review sweep is a pure read, so it runs in BOTH modes and even when
  // nothing is due for teardown. It must not be conditioned on `due` being
  // non-empty or on Stripe being configured: an overdue annual review is a
  // failure of the documented-cause regime itself, not of this cycle's Stripe
  // work, and it is exactly the thing that would otherwise go quiet.
  const reviewsDue = await reportReviewsDue(now, mode);

  if (mode === "dry-run") {
    return {
      completed: 0,
      blocked: due.length,
      escalationsOpened: 0,
      reviewsDue,
    };
  }
  if (due.length === 0) {
    return { completed: 0, blocked: 0, escalationsOpened: 0, reviewsDue };
  }

  if (!stripe) {
    // Rows stay `pending`/`blocked` and are retried next cycle. Silence here
    // would be the failure: the window has closed and the action is owed.
    //
    // NO CASE IS OPENED on this path, on purpose. A missing Stripe key is a
    // PLATFORM fault affecting every account at once, not a per-account
    // documented cause, and writing "the balance is unresolved" against every
    // archived artist because a key was rotated would fill counsel's evidence
    // ledger with a claim that was never observed. It already alerts at error
    // level, which is the correct response to a platform fault.
    Sentry.captureMessage(
      `Connect teardown due for ${due.length} archived account(s) but Stripe is not configured`,
      { level: "error", tags: { action: "connect_account_teardown" } },
    );
    return {
      completed: 0,
      blocked: due.length,
      escalationsOpened: 0,
      reviewsDue,
    };
  }

  let completed = 0;
  let blocked = 0;
  let escalationsOpened = 0;
  for (const row of due) {
    try {
      const attempt = await tearDownConnectAccount(row, now);
      if (attempt.outcome === "completed") {
        completed += 1;
        // The documented-cause episode ends here. Normally the archive purge
        // later in this same cron pass then removes the row and cascades the
        // case away.
        await resolveEscalation(row.id, now);
        continue;
      }

      blocked += 1;
      // COUNSEL 7.5. Every row reaching this point is past the seven-year
      // mark by construction (`findConnectTeardownDue` filters on the cutoff)
      // and its teardown did not complete. That is precisely the trigger
      // condition: raise the case, record the reason and the amount, and let
      // the retention become a documented decision instead of a silent one.
      const escalation = attempt.escalation ?? UNREADABLE_BALANCE_REASON;
      const { opened } = await openOrRefreshEscalation({
        recordId: row.id,
        reason: escalation.reason,
        resolutionRequires: escalation.resolutionRequires,
        buckets: attempt.buckets ?? [],
        now,
      });
      if (!opened) continue;

      escalationsOpened += 1;
      // The ALERT half of "an alert and a case". Raised once, when the case is
      // first opened, and carrying everything an operator needs to act without
      // querying the database.
      Sentry.captureMessage(
        `Connect teardown escalation opened: archived account past the seven-year mark cannot be torn down`,
        {
          level: "error",
          tags: {
            action: "connect_account_teardown",
            escalation: "opened",
          },
          extra: {
            recordId: row.id,
            stripeAccountId: row.stripe_account_id,
            reason: escalation.reason,
            resolutionRequires: escalation.resolutionRequires,
            balance: attempt.buckets ?? [],
            nextReviewDue: nextAnnualReview(now).toISOString(),
          },
        },
      );
    } catch (err) {
      blocked += 1;
      Sentry.captureException(err, {
        tags: { action: "connect_account_teardown" },
        extra: { recordId: row.id },
      });
    }
  }

  if (blocked > 0) {
    // A blocked row is an owed erasure action that did not happen. It is not
    // an outage, but it must not accumulate unseen.
    Sentry.captureMessage(
      `Connect teardown: ${blocked} archived account(s) past window-end could not be deleted`,
      { level: "warning", tags: { action: "connect_account_teardown" } },
    );
  }
  return { completed, blocked, escalationsOpened, reviewsDue };
}

/**
 * Counsel 7.5's "reviewed **annually**". A case whose review date has passed
 * is retention that has stopped being documented, so it alerts at error level
 * rather than as a warning: the whole regime rests on the review actually
 * happening, and an unanswered case is indistinguishable from the silent
 * indefinite retention counsel refused.
 *
 * Read-only, so the count is computed in dry-run too and only the alert is
 * mode-gated (a dry-run that pages someone is not a dry-run).
 */
async function reportReviewsDue(
  now: Date,
  mode: "purge" | "dry-run",
): Promise<number> {
  const overdue = await findEscalationsDueForReview(now);
  if (overdue.length === 0) return 0;
  if (mode === "purge") {
    Sentry.captureMessage(
      `Connect teardown: ${overdue.length} escalation case(s) are due or overdue for their annual retention review`,
      {
        level: "error",
        tags: { action: "connect_account_teardown", escalation: "review_due" },
        extra: {
          cases: overdue.map((c) => ({
            escalationId: c.id,
            recordId: c.record_id,
            openedAt: c.opened_at,
            reviewDueAt: c.next_review_due_at,
            lastReviewedAt: c.last_reviewed_at,
            reviewCount: c.review_count,
            reason: c.reason,
            resolutionRequires: c.resolution_requires,
            balance: c.balance_detail,
          })),
        },
      },
    );
  }
  return overdue.length;
}

/**
 * True when the archive row may be purged. Deliberately the SAME predicate as
 * 0148's `dar_block_premature_purge` trigger, in the same words: no retained
 * pointer, or a teardown that actually completed. `not_applicable` is NOT a
 * pass with a live pointer — a row carrying an account id and claiming no
 * teardown is owed is a contradiction, and the safe reading of a
 * contradiction on this path is "keep the pointer".
 */
export function connectPointerPurgeable(row: {
  stripe_account_id: string | null;
  connect_teardown_state: string;
}): boolean {
  return (
    row.stripe_account_id === null || row.connect_teardown_state === "completed"
  );
}
