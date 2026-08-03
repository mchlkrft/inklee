# Retention purge: operating procedure

Operating procedure for `/api/cron/retention-purge`. Written 2026-08-03 to
satisfy counsel's Q14 answer (`docs/legal/counsel-handoff-2026-08-02.md`
Part 5), which asked for a proving path rather than patience:

> Accountability does not require waiting until 2028; it requires demonstrable
> capability and monitored execution. Three elements: (1) a staging run against
> real-schema synthetic expiring data covering every block, recorded; (2) a
> production dry-run/report mode each cycle logging matched-row counts per
> block (zero is then an evidenced result, not silence); (3) fix the
> sequential-halt design — blocks continue on error and every block failure
> alerts. With those, describe the schedule as "implemented with monitored
> execution"; without them, do not describe it as implemented.

## What exists now

| Counsel's element                                           | Status                                                                                                                                           | Where                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (1) real-schema run over expiring data, every block         | Partial. Every block backed by a purge module has a real-Postgres boundary test; the run has never been executed against a deployed environment. | `apps/web/tests/db/shop-retention-purge.test.ts`, `apps/web/tests/db/retention-purge-dry-run.test.ts`, `apps/web/tests/db/billing-record-retention-purge.test.ts`, `apps/web/tests/db/account-deletion-retention.test.ts` |
| (2) dry-run / report mode, counts per block, durably logged | Built. `?mode=dry-run` counts and writes nothing; every run of either mode writes one `retention_purge_runs` row.                                | `apps/web/src/lib/server/retention-run.ts`, migration `0149`                                                                                                                                                        |
| (3) blocks continue on error, every failure alerts          | Built. Per-block `captureException` plus one aggregated `captureMessage` naming the whole failed set.                                            | `apps/web/src/app/api/cron/retention-purge/route.ts`                                                                                                                                                                |

**The remaining gap is deliberate and is the founder's to close: nobody has run
this against a deployed database.** Until step 2 below has been executed and
its `retention_purge_runs` row exists, the honest description is "implemented,
monitored, never executed in production", not "implemented with monitored
execution".

## Cadence

Weekly, Mondays 05:00 UTC (`vercel.json`, `0 5 * * 1`). Raised from monthly
(`0 5 1 * *`) on 2026-08-03 for counsel deviation D3: a monthly purge turned
every 30-day retention rule into up to roughly 60 days, and a stated retention
period has to be honest.

Weekly is comfortably inside the Vercel plan limit. Hobby caps cron
**frequency** at once per day and allows 100 cron jobs per project; a weekly
schedule runs less often than daily, so it needs no plan change, and the
project already ran a monthly schedule on this plan. Daily (`0 5 * * *`) is
equally permitted and would tighten worst-case latency from about 7 days to
about 1; it was not adopted because counsel named weekly specifically. Raising
it is a one-line change to `vercel.json` if the extra six days ever matter.

## The two things you can run

Both require the `CRON_SECRET` value from Vercel Production (mirrored in the
Control Tower vault). Both are plain authenticated GETs.

### 1. Dry-run: counts, no deletions

```
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://inklee.app/api/cron/retention-purge?mode=dry-run" | jq
```

Returns `{"mode":"dry-run", "<block>": <matched rows>, ...}`. It writes nothing
except its own evidence row. The A2 tax-threshold rollup is the one step that
is skipped rather than counted, because it recomputes and stores rather than
deleting, and a dry-run that mutates is not a dry-run; it is listed in
`skipped` so its absence is explicit rather than a zero it did not earn.

Anything other than the exact string `dry-run` is treated as a REAL PURGE,
including `dryrun`, `DRY-RUN` and an empty value. That is deliberate: a typo
must never turn the scheduled run into a no-op that reports success. If you
are hand-typing this against production, copy the line above.

### 2. Purge: the real thing, off-schedule

```
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://inklee.app/api/cron/retention-purge" | jq
```

Identical to what the weekly cron invokes. HTTP 500 with an `errors` array
means at least one block failed; every other block still ran, and their counts
are still in the body and in the evidence row.

## Reading the evidence

```sql
select ran_at, mode, ok, duration_ms, step_counts, step_errors
  from retention_purge_runs
 order by ran_at desc
 limit 20;
```

One row per invocation. A run that matched nothing still writes a row of
zeroes, which is the point: `ok = true` with all-zero `step_counts` is an
evidenced result, and NO ROW AT ALL is the thing that means the control did
not run. Reachable only by the service role (RLS on, no policy, client-role
grants revoked).

Three entries deserve attention when reading a run:

- **`transaction_tax_snapshots_held_by_legal_hold`** is not a purge count
  either. It is the number of tax snapshots the 7-year horizon has come due on
  and that an active legal hold is deliberately withholding (counsel round 4
  §7.4, Art. 17(3)(e)). Zero is the normal reading. A non-zero value is lawful
  but it is an open obligation somebody owns: each held row needs its hold
  reviewed and released once the dispute, audit or litigation that justified
  it closes. It raises its own Sentry warning on a real purge, naming the ids.
  See "Legal holds" below.
- **`unstamped_cancelled_standalone_orders`** is not a purge count. It is the
  number of cancelled standalone orders with a NULL `cancelled_at`, which the
  D4 clock can never purge. It should always be 0; a non-zero value means some
  writer reached `status='cancelled'` without `orders_stamp_cancelled_at_trg`
  and those rows are being retained indefinitely without erroring. It raises
  its own Sentry error when non-zero.
- **`run_log_error`** in the response body means the purge ran but its evidence
  row could not be written. The status stays 200 in that case, on purpose: the
  deletions already happened and flipping to 500 would invite a re-run of work
  that succeeded. The missing evidence is reported and captured to Sentry
  rather than swallowed.

## Legal holds on tax snapshots

Counsel round 4 §7.4 extended the tax-snapshot purge to LIVE accounts as well
as deleted ones: the retention basis is the accounting obligation, which is
time-bound at seven years from financial-year end and indifferent to whether
the account still exists. The one carve-out is that rows "subject to an open
dispute, audit, or litigation hold are excluded case-by-case (Art. 17(3)(e)),
flagged rather than silently skipped."

`retention_legal_holds` (migration `0150`) is that carve-out. It is
service-role only, has no UI, and is meant to be used deliberately and rarely.

**Place a hold** (one row per distinct reason; two holds on the same snapshot
are fine and it stays held until the last is released):

```sql
insert into retention_legal_holds
  (record_table, record_id, reason, case_reference, detail, opened_by)
values
  ('transaction_tax_snapshots', '<snapshot uuid>', 'dispute',
   '<your case reference>', '<what this is about>', '<who authorised it>');
```

`reason` is one of `dispute`, `audit`, `litigation`. `record_table` is
CHECK-restricted to `transaction_tax_snapshots`, because that is the only
table whose purge consults this ledger. A hold recorded against a table nobody
checks would do nothing while looking like protection, so the constraint
refuses it rather than letting you believe otherwise.

**Release a hold** once the matter closes. `released_by` is required: an
unattributable release of a legal hold is not evidence of anything, and the
CHECK constraint enforces it.

```sql
update retention_legal_holds
   set released_at = now(),
       released_by = '<who authorised the release>',
       release_note = '<why it is closed>'
 where id = '<hold uuid>';
```

Rows are never deleted from this table on release. The history is the point.

**What a hold actually does.** Two independent things, which is deliberate:
the purge function excludes the row and returns it in `held_ids`, and the
append-only trigger on `transaction_tax_snapshots` refuses the DELETE outright
even if some other path ever tries. The second is the one that matters, since
a hold enforced only in the caller would be bypassed by the next tool anyone
writes.

A hold also pins anything the held row corrects: the `corrects_snapshot_id`
foreign key is NO ACTION, so an original cannot be purged while a held
correction still references it. Those pinned ancestors are reported as held
too, so the count reflects the carve-out's real reach rather than only its
direct targets.

## The production proof, step by step

This is the sequence that closes counsel's Q14 for production. Steps 1 and 3
are already done in code; step 2 requires deployed credentials and is the
founder's to run.

1. **Staging / local proof over real schema.** Already automated. Run it with:

   ```
   cd apps/web
   npx vitest run --config vitest.db.config.ts tests/db/shop-retention-purge.test.ts
   npx vitest run --config vitest.db.config.ts tests/db/retention-purge-dry-run.test.ts
   npx vitest run --config vitest.db.config.ts tests/db/billing-record-retention-purge.test.ts
   ```

   These execute the real purge modules against a real Postgres with synthetic
   expiring fixtures at each rule's exact boundary, and assert both that the
   dry-run count matches what the purge then does and that the dry-run writes
   nothing.

2. **Production dry-run, producing counts.** Run command 1 above against
   production after `0149` is applied. Expect every count to be 0 today: the
   platform's history begins 2026-04 and every cutoff is older than the oldest
   data. **That zero is the deliverable**, because it is now recorded in
   `retention_purge_runs` with a timestamp rather than being an absence.
   Capture the response body and the `retention_purge_runs` row id in the
   compliance record.

3. **Monitored execution from then on.** The weekly cron writes an evidence row
   every Monday. A failed block raises a per-block Sentry exception and one
   aggregated Sentry error naming the whole failed set. A run that does not
   happen at all leaves a visible gap in `retention_purge_runs`.

## Known gap: a run that never starts is silent

Every alert above fires from inside the handler, so none of them fire if the
handler is never reached. An unset or rotated `CRON_SECRET` makes every
invocation a 401, and a 401 raises nothing. The gap is detectable after the
fact (no row for that week in `retention_purge_runs`) but nothing watches for
it. A staleness check over `max(ran_at)` would close it and is not built.
Recorded here rather than left for a later reviewer to rediscover.

## Prerequisite

Migration `0149_order_cancelled_at_and_retention_runs.sql` must be applied
before any of the above: it creates `retention_purge_runs`, and without it
every run reports `run_log_error` and leaves no evidence. It also adds
`orders.cancelled_at` and the trigger that stamps it, which is the D4 fix the
cancelled-order rule depends on.
