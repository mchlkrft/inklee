import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { financialYearRetentionCutoff } from "@/lib/server/retention-cutoffs";

/**
 * BDEL-RET-002 (docs/audit/findings.yaml): migration 0129 moved five billing
 * tables from CASCADE to ON DELETE SET NULL so a deleted account's
 * financial/tax/consent records survive the deletion, which was the correct
 * fix for the retention promise. But nothing then gave those records an END
 * date, so they survived INDEFINITELY once de-identified — counsel §8:
 * indefinite retention is not applied. A record kept forever because it was
 * fixed from being deleted too early is the same compliance failure
 * pointing the other way.
 *
 * SCOPE: only rows already de-identified by 0129 (`artist_id IS NULL`, i.e.
 * belonging to a DELETED account). A row still attached to a live artist is
 * ordinary ongoing billing history for an active customer, not part of this
 * gap — purging a live artist's own subscription/tax history is a separate,
 * much bigger product and legal question this function does not answer.
 *
 * ANCHOR + CUTOFF: 7 years from the end of the financial year (the same
 * arithmetic the guest-shop purges use — `financialYearRetentionCutoff`),
 * keyed to each table's own natural event timestamp:
 *   billing_consent_records        -> consented_at
 *   billing_subscriptions          -> created_at
 *   billing_contract_confirmations -> generated_at
 *   withdrawal_cases               -> created_at
 *
 * ONE OF THE FIVE IS DELIBERATELY EXCLUDED: `transaction_tax_snapshots` has
 * an append-only trigger (`tts_no_mutation`/`tts_block_mutation()`, 0106/
 * 0129) that raises on EVERY delete unconditionally — "transaction_tax_
 * snapshots is append-only; corrections are new rows." This is an
 * accounting-ledger immutability control, not an oversight, and this file
 * does not touch it: whether tax snapshots should ever become deletable is
 * a separate decision (it would mean weakening a deliberate invariant,
 * likely with its own counsel/accountant review), not something to fold
 * into closing this gap. Reported back rather than decided unilaterally.
 *
 * ORDER MATTERS for the four tables this file DOES purge. None of the FKs
 * among them carry ON DELETE CASCADE/SET NULL (only the artist_id FK to
 * profiles does, per 0129) — deleting a row still referenced by another
 * EXISTING row throws 23503. `withdrawal_cases` and
 * `billing_contract_confirmations` are leaves (nothing references them) and
 * purge first, unconditionally past their own cutoff. `billing_consent_
 * records` can be referenced by `withdrawal_cases.immediate_performance_
 * consent_id`, so it excludes any id a REMAINING (not-yet-purged, because
 * not yet past ITS OWN cutoff) withdrawal_case still points to — a
 * dependent still inside its own retention window legitimately keeps its
 * parent alive. `billing_subscriptions` purges last, excluding anything
 * still referenced by a remaining `billing_contract_confirmations` or
 * `withdrawal_cases` row, OR by ANY `transaction_tax_snapshots` row
 * (permanent, since that table is never purged) — in practice this means a
 * subscription that ever had a real tax event stays retained indefinitely
 * too, which is the CORRECT knock-on consequence of tax records being
 * permanent by design, not a bug in this exclusion logic.
 */

export type PurgeResult = { count: number };

async function fetchReferencedIds(
  table: string,
  column: string,
): Promise<Set<string>> {
  const { data, error } = await serviceClient
    .from(table)
    .select(column)
    .not(column, "is", null);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return new Set(rows.map((row) => row[column] as string));
}

/** Leaf table: nothing references `withdrawal_cases`. */
export async function purgeDeletedAccountWithdrawalCases(
  now: Date = new Date(),
): Promise<PurgeResult> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const { data, error } = await serviceClient
    .from("withdrawal_cases")
    .delete()
    .is("artist_id", null)
    .lt("created_at", cutoff)
    .select("id");
  if (error) throw error;
  return { count: data?.length ?? 0 };
}

/** Leaf table: nothing references `billing_contract_confirmations`. */
export async function purgeDeletedAccountBillingContractConfirmations(
  now: Date = new Date(),
): Promise<PurgeResult> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const { data, error } = await serviceClient
    .from("billing_contract_confirmations")
    .delete()
    .is("artist_id", null)
    .lt("generated_at", cutoff)
    .select("id");
  if (error) throw error;
  return { count: data?.length ?? 0 };
}

/**
 * Excludes any id still pointed to by a REMAINING `withdrawal_cases` row
 * (one that hasn't reached its own cutoff yet, since purgeable ones were
 * already removed by `purgeDeletedAccountWithdrawalCases` earlier in the
 * same run — see `runBillingRecordRetentionPurges`'s ordering).
 */
export async function purgeDeletedAccountBillingConsentRecords(
  now: Date = new Date(),
): Promise<PurgeResult> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const protectedIds = await fetchReferencedIds(
    "withdrawal_cases",
    "immediate_performance_consent_id",
  );

  const { data: candidates, error: candidateError } = await serviceClient
    .from("billing_consent_records")
    .select("id")
    .is("artist_id", null)
    .lt("consented_at", cutoff);
  if (candidateError) throw candidateError;
  const idsToDelete = (candidates ?? [])
    .map((r) => r.id as string)
    .filter((id) => !protectedIds.has(id));
  if (idsToDelete.length === 0) return { count: 0 };

  const { data: deleted, error: deleteError } = await serviceClient
    .from("billing_consent_records")
    .delete()
    .in("id", idsToDelete)
    .select("id");
  if (deleteError) throw deleteError;
  return { count: deleted?.length ?? 0 };
}

/**
 * Excludes ids still referenced by a REMAINING `billing_contract_
 * confirmations` or `withdrawal_cases` row, and by ANY
 * `transaction_tax_snapshots` row (permanent — that table is never purged,
 * see the file-level comment).
 */
export async function purgeDeletedAccountBillingSubscriptions(
  now: Date = new Date(),
): Promise<PurgeResult> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const [byConfirmation, byWithdrawal, byTaxSnapshot] = await Promise.all([
    fetchReferencedIds(
      "billing_contract_confirmations",
      "billing_subscription_id",
    ),
    fetchReferencedIds("withdrawal_cases", "billing_subscription_id"),
    fetchReferencedIds("transaction_tax_snapshots", "billing_subscription_id"),
  ]);
  const protectedIds = new Set([
    ...byConfirmation,
    ...byWithdrawal,
    ...byTaxSnapshot,
  ]);

  const { data: candidates, error: candidateError } = await serviceClient
    .from("billing_subscriptions")
    .select("id")
    .is("artist_id", null)
    .lt("created_at", cutoff);
  if (candidateError) throw candidateError;
  const idsToDelete = (candidates ?? [])
    .map((r) => r.id as string)
    .filter((id) => !protectedIds.has(id));
  if (idsToDelete.length === 0) return { count: 0 };

  const { data: deleted, error: deleteError } = await serviceClient
    .from("billing_subscriptions")
    .delete()
    .in("id", idsToDelete)
    .select("id");
  if (deleteError) throw deleteError;
  return { count: deleted?.length ?? 0 };
}

export type BillingRetentionStepResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Runs the four steps in dependency order (leaves first), each independent:
 * one step's failure is captured and reported but never blocks the others,
 * matching the same pattern `shop-retention.ts` and the cron route use.
 */
export async function runBillingRecordRetentionPurges(
  now: Date = new Date(),
): Promise<Record<string, BillingRetentionStepResult>> {
  const steps: [string, () => Promise<PurgeResult>][] = [
    [
      "purged_deleted_account_withdrawal_cases",
      () => purgeDeletedAccountWithdrawalCases(now),
    ],
    [
      "purged_deleted_account_billing_contract_confirmations",
      () => purgeDeletedAccountBillingContractConfirmations(now),
    ],
    [
      "purged_deleted_account_billing_consent_records",
      () => purgeDeletedAccountBillingConsentRecords(now),
    ],
    [
      "purged_deleted_account_billing_subscriptions",
      () => purgeDeletedAccountBillingSubscriptions(now),
    ],
  ];

  const results: Record<string, BillingRetentionStepResult> = {};
  for (const [name, fn] of steps) {
    try {
      const { count } = await fn();
      results[name] = { ok: true, count };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[name] = { ok: false, error: message };
      Sentry.captureException(err, {
        tags: { action: "billing_record_retention_purge", step: name },
      });
    }
  }
  return results;
}
