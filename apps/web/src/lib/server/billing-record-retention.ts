import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { financialYearRetentionCutoff } from "@/lib/server/retention-cutoffs";
import {
  deleteOrListMatchingRows,
  type RetentionMode,
  type RetentionStepResult,
} from "@/lib/server/retention-run";

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
 *   transaction_tax_snapshots      -> created_at (via an RPC, see below)
 *
 * THE FIFTH TABLE, AMENDED 2026-08-03 (counsel Q1, docs/legal/counsel-
 * handoff-2026-08-02.md §5.2). This file used to exclude
 * `transaction_tax_snapshots` because its append-only trigger
 * (`tts_no_mutation`/`tts_block_mutation()`, 0106/0129) refused EVERY delete
 * unconditionally, and it reported that back rather than weakening a
 * deliberate invariant unilaterally. Counsel's answer: permanent retention
 * is NOT the intended exception — "append-only immutability is a control,
 * not a lawful basis for indefinite retention. Storage limitation wins at
 * the horizon." The control is therefore amended, not removed (0148): the
 * ledger stays immutable against edits and corrections (corrections are
 * still new rows) and becomes deletable by exactly one path, the retention
 * purge at the horizon.
 *
 * That path is an RPC, not a `.delete()`. The trigger only stands down for a
 * transaction-local marker that solely `purge_expired_tax_snapshots()` sets,
 * and it independently re-derives the 7-year horizon from `now()` — so a
 * PostgREST delete (which cannot set the marker) is still refused, and a row
 * inside its retention window is still undeletable even by a caller that
 * forges the marker. See 0148's header for why the exemption has three
 * conditions rather than one.
 *
 * ORDER MATTERS for all five. None of the FKs among them carry ON DELETE
 * CASCADE/SET NULL (only the artist_id FK to profiles does, per 0129) —
 * deleting a row still referenced by another EXISTING row throws 23503.
 * `withdrawal_cases` and `billing_contract_confirmations` are leaves
 * (nothing references them) and purge first, unconditionally past their own
 * cutoff. `billing_consent_records` can be referenced by
 * `withdrawal_cases.immediate_performance_consent_id`, so it excludes any id
 * a REMAINING (not-yet-purged, because not yet past ITS OWN cutoff)
 * withdrawal_case still points to — a dependent still inside its own
 * retention window legitimately keeps its parent alive.
 * `transaction_tax_snapshots` purges FOURTH, and it must run BEFORE
 * subscriptions: it references `billing_subscriptions` and nothing but
 * itself references it (`corrects_snapshot_id`, handled inside the RPC).
 * `billing_subscriptions` purges last, excluding anything still referenced
 * by a remaining `billing_contract_confirmations`, `withdrawal_cases` or
 * `transaction_tax_snapshots` row. That exclusion is unchanged and still
 * correct; what changed is that it is no longer PERMANENT. A subscription
 * whose tax snapshots have themselves aged past the horizon is freed in the
 * same run (snapshots first), or in the next one.
 */

export type PurgeResult = { count: number };

/**
 * Ids of rows an EARLIER step in the same run has removed (purge) or would
 * remove (dry-run). In a real purge the earlier deletes have already landed,
 * so `fetchReferencedIds` naturally sees only survivors and this set is
 * empty. In a DRY-RUN nothing is deleted, so without it the later steps would
 * treat rows the run is about to remove as live dependants, over-protect
 * their parents, and report a count LOWER than a real run would delete —
 * a dry-run that understates the purge is not evidence, it is a different
 * number wearing the same label.
 */
type AlreadyRemoved = {
  withdrawalCaseIds: Set<string>;
  contractConfirmationIds: Set<string>;
  taxSnapshotIds: Set<string>;
};

const NOTHING_REMOVED: AlreadyRemoved = {
  withdrawalCaseIds: new Set(),
  contractConfirmationIds: new Set(),
  taxSnapshotIds: new Set(),
};

async function fetchReferencedIds(
  table: string,
  column: string,
  ignoreRowIds: Set<string> = new Set(),
): Promise<Set<string>> {
  const { data, error } = await serviceClient
    .from(table)
    .select(`id, ${column}`)
    .not(column, "is", null);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return new Set(
    rows
      .filter((row) => !ignoreRowIds.has(row.id as string))
      .map((row) => row[column] as string),
  );
}

/** Leaf table: nothing references `withdrawal_cases`. */
export async function purgeDeletedAccountWithdrawalCases(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult & { ids: string[] }> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  return deleteOrListMatchingRows(mode, "withdrawal_cases", "id", (q) =>
    q.is("artist_id", null).lt("created_at", cutoff),
  );
}

/** Leaf table: nothing references `billing_contract_confirmations`. */
export async function purgeDeletedAccountBillingContractConfirmations(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult & { ids: string[] }> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  return deleteOrListMatchingRows(
    mode,
    "billing_contract_confirmations",
    "id",
    (q) => q.is("artist_id", null).lt("generated_at", cutoff),
  );
}

/**
 * Excludes any id still pointed to by a REMAINING `withdrawal_cases` row
 * (one that hasn't reached its own cutoff yet, since purgeable ones were
 * already removed by `purgeDeletedAccountWithdrawalCases` earlier in the
 * same run — see `runBillingRecordRetentionPurges`'s ordering).
 */
export async function purgeDeletedAccountBillingConsentRecords(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
  alreadyRemoved: AlreadyRemoved = NOTHING_REMOVED,
): Promise<PurgeResult> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const protectedIds = await fetchReferencedIds(
    "withdrawal_cases",
    "immediate_performance_consent_id",
    alreadyRemoved.withdrawalCaseIds,
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
  if (mode === "dry-run") return { count: idsToDelete.length };
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
 * The amended tax ledger (counsel Q1, migration 0148). Unlike every other
 * step here this is an RPC, not a `.delete()`, and that is the whole design:
 * `tts_no_mutation` only stands down for a transaction-local marker that
 * `purge_expired_tax_snapshots()` alone can set, so the append-only control
 * still refuses every delete that arrives over PostgREST — including this
 * module's own, if someone later "simplifies" it into a `.delete()`.
 *
 * `now` is passed for symmetry with the other steps and for tests, but the
 * function CLAMPS it to `least(_now, now())` and the trigger re-derives the
 * horizon from `now()` independently, so it can only ever retain more, never
 * delete more. The self-reference exclusion (a correction still inside its
 * own window keeps the snapshot it corrects alive) lives in the RPC because
 * PostgREST cannot express it; that is also why `dry-run` is a parameter of
 * the RPC rather than a second predicate on this side.
 */
export async function purgeDeletedAccountTransactionTaxSnapshots(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult & { ids: string[] }> {
  const { data, error } = await serviceClient.rpc(
    "purge_expired_tax_snapshots",
    { _now: now.toISOString(), _dry_run: mode === "dry-run" },
  );
  if (error) throw error;
  const payload = (data ?? {}) as { count?: number; ids?: string[] };
  const ids = payload.ids ?? [];
  const count = payload.count ?? 0;
  // The RPC returns one jsonb row carrying both, so these cannot disagree
  // through truncation the way a `setof uuid` could. If they ever do, the
  // shape has changed underneath us and the dependent step's exclusion set
  // would be silently wrong — louder is better than a quietly low number.
  if (count !== ids.length) {
    throw new Error(
      `purge_expired_tax_snapshots returned count=${count} but ${ids.length} ids`,
    );
  }
  return { count, ids };
}

/**
 * Excludes ids still referenced by a REMAINING `billing_contract_
 * confirmations`, `withdrawal_cases` or `transaction_tax_snapshots` row.
 *
 * The tax-snapshot exclusion is no longer PERMANENT (counsel Q1, 0148): a
 * snapshot past its own horizon is purged by the step above, which runs
 * FIRST, so the subscription it was protecting is freed in the same run.
 * A snapshot still inside its window legitimately keeps its subscription
 * alive, exactly as a young withdrawal_case keeps its consent record alive.
 */
export async function purgeDeletedAccountBillingSubscriptions(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
  alreadyRemoved: AlreadyRemoved = NOTHING_REMOVED,
): Promise<PurgeResult> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const [byConfirmation, byWithdrawal, byTaxSnapshot] = await Promise.all([
    fetchReferencedIds(
      "billing_contract_confirmations",
      "billing_subscription_id",
      alreadyRemoved.contractConfirmationIds,
    ),
    fetchReferencedIds(
      "withdrawal_cases",
      "billing_subscription_id",
      alreadyRemoved.withdrawalCaseIds,
    ),
    // Since counsel Q1 (0148) this table IS purged, by the step immediately
    // before this one, so it gets an exclusion set exactly like the other
    // two. `purge_expired_tax_snapshots()` returns the ids it removed (purge)
    // or would remove (dry-run) alongside the count, precisely so the dry-run
    // here is exact rather than one-sidedly low.
    fetchReferencedIds(
      "transaction_tax_snapshots",
      "billing_subscription_id",
      alreadyRemoved.taxSnapshotIds,
    ),
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
  if (mode === "dry-run") return { count: idsToDelete.length };
  if (idsToDelete.length === 0) return { count: 0 };

  const { data: deleted, error: deleteError } = await serviceClient
    .from("billing_subscriptions")
    .delete()
    .in("id", idsToDelete)
    .select("id");
  if (deleteError) throw deleteError;
  return { count: deleted?.length ?? 0 };
}

export type BillingRetentionStepResult = RetentionStepResult;

/**
 * Runs the five steps in dependency order (leaves first), each independent:
 * one step's failure is captured and reported but never blocks the others,
 * matching the same pattern `shop-retention.ts` and the cron route use.
 *
 * THE ORDERING IS ALSO A DRY-RUN PROBLEM (counsel Q14). In `purge` mode the
 * two leaf deletes have physically happened by the time the dependent steps
 * read their referencing tables, which is what makes "exclude ids a REMAINING
 * row still points at" correct. In `dry-run` nothing is deleted, so the two
 * leaf ids are threaded forward explicitly and the dependent steps ignore
 * them — otherwise the dry-run would protect parents whose only dependant the
 * run is about to remove, and report fewer rows than the purge would actually
 * delete. A leaf step that FAILED contributes no ids, which is also correct:
 * its rows are still there. The tax-snapshot step (Q1, 0148) threads its ids
 * the same way, which is why its RPC returns them and not just a count.
 */
export async function runBillingRecordRetentionPurges(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<Record<string, BillingRetentionStepResult>> {
  const removed: AlreadyRemoved = {
    withdrawalCaseIds: new Set(),
    contractConfirmationIds: new Set(),
    taxSnapshotIds: new Set(),
  };

  const steps: [string, () => Promise<PurgeResult>][] = [
    [
      "purged_deleted_account_withdrawal_cases",
      async () => {
        const result = await purgeDeletedAccountWithdrawalCases(now, mode);
        for (const id of result.ids) removed.withdrawalCaseIds.add(id);
        return result;
      },
    ],
    [
      "purged_deleted_account_billing_contract_confirmations",
      async () => {
        const result = await purgeDeletedAccountBillingContractConfirmations(
          now,
          mode,
        );
        for (const id of result.ids) removed.contractConfirmationIds.add(id);
        return result;
      },
    ],
    [
      "purged_deleted_account_billing_consent_records",
      () => purgeDeletedAccountBillingConsentRecords(now, mode, removed),
    ],
    // FOURTH, and it must stay before subscriptions: a snapshot references
    // billing_subscriptions, so purging snapshots first is what frees the
    // subscription in the same run (counsel Q1, 0148).
    [
      "purged_deleted_account_transaction_tax_snapshots",
      async () => {
        const result = await purgeDeletedAccountTransactionTaxSnapshots(
          now,
          mode,
        );
        for (const id of result.ids) removed.taxSnapshotIds.add(id);
        return result;
      },
    ],
    [
      "purged_deleted_account_billing_subscriptions",
      () => purgeDeletedAccountBillingSubscriptions(now, mode, removed),
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
