import "server-only";
import { serviceClient } from "@/lib/supabase/service";

/**
 * Counsel round-4 ruling 7.5 (docs/legal/counsel-handoff-round-4-2026-08-02.md
 * §7.5), migration 0153.
 *
 * THE RULING. "No blind deletion deadline: force-deleting a Connect account
 * with a non-zero balance orphans money and forecloses refunds ... the
 * retention has a lawful basis while the balance is unresolved (Art. 17(3)(e);
 * the balance *is* the legal claim). What is not acceptable is **silent**
 * indefinite retention. Backstop: at the seven-year mark, an uncompleted
 * teardown raises an **operator escalation** -- an alert and a case -- and the
 * continued retention becomes a documented, per-account decision reviewed
 * **annually** with the reason recorded (unresolved balance, amount, what
 * resolution requires). The stated period then remains honest: seven years, or
 * documented cause."
 *
 * This module is the CASE half. The alert half stays in
 * connect-account-teardown.ts, where the outcome is decided.
 *
 * WHAT COUNTS AS SATISFYING IT. Three things have to be true at once, and the
 * third is the one that is easy to miss:
 *   1. the case exists, per account, and says WHY (reason + amount + what
 *      resolution requires);
 *   2. the amount stays CURRENT, or the case documents a 2033 balance in 2039
 *      and the "documented cause" is fiction;
 *   3. the annual review clock is NOT restarted by (2). The weekly cron
 *      refreshes the amount; only a human review moves the review date. Those
 *      are deliberately two different clocks on the same row, because
 *      collapsing them is the D4 failure (0149 PART A) rebuilt: a clock any
 *      later touch restarts never comes due, so the review never happens and
 *      nothing errors.
 */

/** One non-zero Stripe balance bucket. `bucket` is Stripe's own array name. */
export type BalanceBucket = {
  bucket: string;
  amount: number;
  currency: string;
};

export type EscalationReason = {
  reason: string;
  resolutionRequires: string;
};

/**
 * Every non-zero entry across every bucket Stripe reports.
 *
 * Returns `null` for a balance that could not be read at all, which is NOT the
 * same as a zero balance and must never collapse into one: an unreadable
 * balance means the zero-balance precondition is unevaluated, and treating
 * that as "nothing owed" would delete an account holding money.
 *
 * Buckets are discovered by iterating whatever arrays Stripe returns rather
 * than naming `available`/`pending`, so a bucket introduced after this was
 * written still blocks the teardown and still gets reported in the amount.
 */
export function nonZeroBuckets(balance: unknown): BalanceBucket[] | null {
  const buckets = balance as Record<string, unknown> | null;
  if (!buckets || typeof buckets !== "object") return null;
  const found: BalanceBucket[] = [];
  for (const [bucket, value] of Object.entries(buckets)) {
    if (bucket === "object" || bucket === "livemode") continue;
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const amount = (entry as { amount?: unknown } | null)?.amount;
      if (typeof amount !== "number" || amount === 0) continue;
      const currency = (entry as { currency?: unknown } | null)?.currency;
      found.push({
        bucket,
        amount,
        currency: typeof currency === "string" ? currency : "unknown",
      });
    }
  }
  return found;
}

/**
 * The single-scalar summary of an amount, or `null` when there isn't an honest
 * one. A Stripe balance is per bucket AND per currency, so an account holding
 * money in two currencies has no single "the amount". Rather than pick one and
 * understate the claim, the summary is left null and `balance_detail` carries
 * the truth. Migration 0153's `..._balance_summary_check` enforces that the
 * minor unit and the currency are written together or not at all.
 */
export function summariseBalance(
  buckets: BalanceBucket[],
): { minor: number; currency: string } | null {
  if (buckets.length === 0) return null;
  const currencies = new Set(buckets.map((b) => b.currency));
  if (currencies.size !== 1) return null;
  return {
    minor: buckets.reduce((sum, b) => sum + b.amount, 0),
    currency: buckets[0].currency,
  };
}

/** Counsel's "reviewed annually", as one calendar year from the given instant. */
export function nextAnnualReview(from: Date): Date {
  const due = new Date(from.getTime());
  due.setUTCFullYear(due.getUTCFullYear() + 1);
  return due;
}

/**
 * The documented cause, in counsel's own three-part shape. Operator-facing
 * (the case row and the Sentry alert), never shown to an artist or a visitor.
 */
export function balanceBlockReason(buckets: BalanceBucket[]): EscalationReason {
  const amounts = buckets
    .map((b) => `${b.amount} ${b.currency.toUpperCase()} in ${b.bucket}`)
    .join(", ");
  return {
    reason: `Unresolved balance on the connected account (${amounts}). The balance is the legal claim, so the retention has a lawful basis while it stands (Art. 17(3)(e)).`,
    resolutionRequires:
      "Stripe will not delete a connected account holding a balance. Resolution requires every bucket to reach zero: settle or reverse the outstanding payouts, refunds and disputes on the account, after which the next retention cycle completes the teardown and the pointer is purged automatically.",
  };
}

export const UNREADABLE_BALANCE_REASON: EscalationReason = {
  reason:
    "The connected account's balance could not be read, so the zero-balance precondition cannot be evaluated and the account cannot be deleted.",
  resolutionRequires:
    "Restore platform access to the connected account at Stripe (the account may be restricted, or the platform key may no longer reach it). The balance check reruns on every retention cycle and needs no manual step once access is back. If the balance stays unreadable across retention cycles (persistently, beyond the retry window), raise it as an operational incident with Stripe support at escalation time: an unreadable balance is an evidentiary failure, not a legal claim (unlike a real outstanding balance), and must not be carried silently into annual review (counsel round-6 §1E).",
};

export function deletionRefusedReason(message: string): EscalationReason {
  return {
    reason: `Stripe refused the connected account deletion: ${message}`,
    resolutionRequires:
      "Investigate the refusal at Stripe. The balance was zero at the time of the attempt, so this is not a balance block; the deletion is retried on every retention cycle.",
  };
}

export type EscalationRow = {
  id: string;
  record_id: string;
  opened_at: string;
  reason: string;
  resolution_requires: string;
  balance_detail: BalanceBucket[];
  balance_minor: number | null;
  balance_currency: string | null;
  next_review_due_at: string;
  last_reviewed_at: string | null;
  review_count: number;
};

/**
 * Raise the case if this account has not got one, then refresh what it says.
 *
 * TWO STATEMENTS, DELIBERATELY, and not an upsert. supabase-js `upsert` writes
 * the whole payload on conflict, which would rewrite `opened_at` and
 * `next_review_due_at` on every weekly cycle and so guarantee the annual
 * review NEVER comes due. That is point (3) in this module's header and it is
 * the exact silent-drift shape counsel deviation D4 was raised about. So:
 *
 *   1. insert-if-absent (`ON CONFLICT DO NOTHING`), which sets both clocks
 *      exactly once, at the moment the seven-year mark was crossed;
 *   2. update the refreshable fields only, which never touches either clock.
 *
 * Both statements are idempotent and the order is race-safe: if a concurrent
 * run wins the insert, ours is ignored and the update still applies.
 *
 * Returns whether THIS call opened the case, so the caller can alert loudly on
 * a new escalation and quietly on the hundredth refresh of a known one.
 */
export async function openOrRefreshEscalation(input: {
  recordId: string;
  reason: string;
  resolutionRequires: string;
  buckets: BalanceBucket[];
  now: Date;
}): Promise<{ opened: boolean }> {
  const at = input.now.toISOString();
  const summary = summariseBalance(input.buckets);

  const { data: inserted, error: insertError } = await serviceClient
    .from("connect_teardown_escalations")
    .upsert(
      {
        record_id: input.recordId,
        opened_at: at,
        state: "open",
        reason: input.reason,
        resolution_requires: input.resolutionRequires,
        balance_detail: input.buckets,
        balance_minor: summary?.minor ?? null,
        balance_currency: summary?.currency ?? null,
        observed_at: at,
        next_review_due_at: nextAnnualReview(input.now).toISOString(),
      },
      { onConflict: "record_id", ignoreDuplicates: true },
    )
    .select("id");
  if (insertError) throw new Error(insertError.message);

  const opened = (inserted ?? []).length > 0;
  if (opened) return { opened };

  // Refresh only. `opened_at`, `next_review_due_at`, `last_reviewed_at` and
  // `review_count` are all absent from this patch on purpose.
  const { error: updateError } = await serviceClient
    .from("connect_teardown_escalations")
    .update({
      state: "open",
      resolved_at: null,
      reason: input.reason,
      resolution_requires: input.resolutionRequires,
      balance_detail: input.buckets,
      balance_minor: summary?.minor ?? null,
      balance_currency: summary?.currency ?? null,
      observed_at: at,
    })
    .eq("record_id", input.recordId);
  if (updateError) throw new Error(updateError.message);
  return { opened };
}

/**
 * The teardown finally completed, so the documented-cause episode is over.
 *
 * The case row is normally destroyed moments later by the archive purge in the
 * same cron pass (0153's `ON DELETE CASCADE`), so this is mostly bookkeeping
 * for the window in between and for the case where the purge step fails. It is
 * still written rather than skipped: a case left `open` on a record that is no
 * longer blocked would make the overdue-review alert fire forever about
 * something already resolved.
 */
export async function resolveEscalation(
  recordId: string,
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  const { error } = await serviceClient
    .from("connect_teardown_escalations")
    .update({ state: "resolved", resolved_at: at })
    .eq("record_id", recordId)
    .eq("state", "open");
  if (error) throw new Error(error.message);
}

/**
 * Open cases whose annual review is due or overdue. This is a pure read, so it
 * runs in dry-run mode too; only the alerting is mode-gated.
 */
export async function findEscalationsDueForReview(
  now: Date,
): Promise<EscalationRow[]> {
  const { data, error } = await serviceClient
    .from("connect_teardown_escalations")
    .select(
      "id, record_id, opened_at, reason, resolution_requires, balance_detail, balance_minor, balance_currency, next_review_due_at, last_reviewed_at, review_count",
    )
    .eq("state", "open")
    .lte("next_review_due_at", now.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []) as EscalationRow[];
}

/**
 * Record one annual review. THIS IS THE OPERATOR'S WRITE PATH, and it is the
 * thing that makes "seven years, or documented cause" true rather than
 * aspirational: without a review row, a case is an alert nobody answered.
 *
 * The reason and the amount are copied from the case AS AT the review rather
 * than referenced, so the year-8 record still states the year-8 position after
 * the case row has moved on. The review row is immutable once written
 * (0153's `ctesc_review_no_mutation`); a correction is a new review.
 *
 * `review_count` is recomputed from the append-only review rows rather than
 * incremented, so it cannot drift from the evidence it summarises.
 */
export async function recordEscalationReview(input: {
  escalationId: string;
  reviewedBy: string;
  decision: "continue_retention" | "resolved";
  note?: string;
  now: Date;
}): Promise<void> {
  const at = input.now.toISOString();

  const { data: escalation, error: readError } = await serviceClient
    .from("connect_teardown_escalations")
    .select(
      "id, reason, resolution_requires, balance_detail, balance_minor, balance_currency",
    )
    .eq("id", input.escalationId)
    .single();
  if (readError) throw new Error(readError.message);

  const { error: reviewError } = await serviceClient
    .from("connect_teardown_escalation_reviews")
    .insert({
      escalation_id: input.escalationId,
      reviewed_at: at,
      reviewed_by: input.reviewedBy,
      decision: input.decision,
      reason: escalation.reason,
      resolution_requires: escalation.resolution_requires,
      balance_detail: escalation.balance_detail,
      balance_minor: escalation.balance_minor,
      balance_currency: escalation.balance_currency,
      note: input.note ?? null,
    });
  if (reviewError) throw new Error(reviewError.message);

  const { count, error: countError } = await serviceClient
    .from("connect_teardown_escalation_reviews")
    .select("id", { count: "exact", head: true })
    .eq("escalation_id", input.escalationId);
  if (countError) throw new Error(countError.message);

  const resolved = input.decision === "resolved";
  const { error: caseError } = await serviceClient
    .from("connect_teardown_escalations")
    .update({
      last_reviewed_at: at,
      review_count: count ?? 0,
      next_review_due_at: nextAnnualReview(input.now).toISOString(),
      ...(resolved ? { state: "resolved", resolved_at: at } : {}),
    })
    .eq("id", input.escalationId);
  if (caseError) throw new Error(caseError.message);
}
