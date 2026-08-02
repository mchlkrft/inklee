import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { financialYearRetentionCutoff } from "@/lib/server/retention-cutoffs";

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
 */
export function balanceIsZero(balance: unknown): boolean {
  const buckets = balance as Record<string, unknown> | null;
  if (!buckets) return false;
  for (const [key, value] of Object.entries(buckets)) {
    if (key === "object" || key === "livemode") continue;
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const amount = (entry as { amount?: unknown } | null)?.amount;
      if (typeof amount === "number" && amount !== 0) return false;
    }
  }
  return true;
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
 * Request deletion of one connected account, gated on a zero balance.
 * Never throws: a per-row failure is recorded on the row and reported, so one
 * unreachable account cannot stop the rest of the batch (the same
 * continue-on-error shape counsel asked for in Q14).
 */
export async function tearDownConnectAccount(
  row: ConnectTeardownRow,
  now: Date = new Date(),
): Promise<"completed" | "blocked"> {
  if (!stripe) return "blocked";
  const at = now.toISOString();

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
    balanceOk = balanceIsZero(balance);
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
      return "completed";
    }
    await markRow(row.id, {
      connect_teardown_state: "blocked",
      connect_teardown_attempted_at: at,
      connect_teardown_last_error: `balance check failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return "blocked";
  }

  if (!balanceOk) {
    await markRow(row.id, {
      connect_teardown_state: "blocked",
      connect_teardown_attempted_at: at,
      connect_teardown_last_error:
        "non-zero balance; deletion requires a zero balance",
    });
    return "blocked";
  }

  try {
    await stripe.accounts.del(row.stripe_account_id);
  } catch (err) {
    if (!isAlreadyGone(err)) {
      await markRow(row.id, {
        connect_teardown_state: "blocked",
        connect_teardown_attempted_at: at,
        connect_teardown_last_error: `account deletion failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      return "blocked";
    }
  }

  await markRow(row.id, {
    connect_teardown_state: "completed",
    connect_teardown_attempted_at: at,
    connect_teardown_completed_at: at,
    connect_teardown_last_error: null,
  });
  return "completed";
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
  if (mode === "dry-run") return { completed: 0, blocked: due.length };
  if (due.length === 0) return { completed: 0, blocked: 0 };

  if (!stripe) {
    // Rows stay `pending`/`blocked` and are retried next cycle. Silence here
    // would be the failure: the window has closed and the action is owed.
    Sentry.captureMessage(
      `Connect teardown due for ${due.length} archived account(s) but Stripe is not configured`,
      { level: "error", tags: { action: "connect_account_teardown" } },
    );
    return { completed: 0, blocked: due.length };
  }

  let completed = 0;
  let blocked = 0;
  for (const row of due) {
    try {
      const outcome = await tearDownConnectAccount(row, now);
      if (outcome === "completed") completed += 1;
      else blocked += 1;
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
  return { completed, blocked };
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
