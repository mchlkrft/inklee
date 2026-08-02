-- 0148: counsel Q1 + Q13 (docs/legal/counsel-handoff-2026-08-02.md §5.2/§5.3).
--
-- Two independent controls land together because both are "a retention
-- deadline that could not previously be reached", and both are enforced at
-- the DATABASE, not in the purge caller. A control that lives only in the
-- purge function is not a control: the next ad-hoc `delete` through
-- PostgREST bypasses it.
--
-- ===========================================================================
-- PART 1 (Q1) -- the tax ledger becomes DELETABLE at the horizon while
--                staying immutable against EDITS.
-- ===========================================================================
--
-- Counsel: "Permanent retention is not the intended exception... append-only
-- immutability is a CONTROL, not a lawful basis for indefinite retention.
-- Storage limitation wins at the horizon. Amend the control so it is
-- immutable against *edits and corrections* (corrections stay new rows) but
-- deletable by exactly one path -- the retention purge at 7 years from
-- financial-year end."
--
-- The trigger `tts_no_mutation` (0106, amended by 0129) currently refuses
-- EVERY delete unconditionally. It is NOT removed. It gains one exemption,
-- and the exemption is deliberately over-determined: THREE conditions must
-- hold simultaneously, and the two that matter are ones the caller cannot
-- forge.
--
--   (1) A transaction-local marker (`inklee.tts_retention_purge`) is set.
--       Only `purge_expired_tax_snapshots()` sets it. PostgREST cannot issue
--       `set_config` alongside a DELETE, so EVERY delete arriving over the
--       API -- ad-hoc, accidental, or malicious -- still hits the raise. This
--       condition alone is intent-signalling, not access control (any session
--       with raw SQL can set a custom GUC), which is why it is not alone.
--
--   (2) The row is de-identified (`artist_id is null`), i.e. it belongs to a
--       DELETED account. SCOPE DECISION, reported to the supervisor as an
--       ambiguity rather than resolved silently: counsel's answer says "the
--       retention purge at 7 years", and the retention purge under discussion
--       (Q1's own framing, BDEL-RET-002, billing-record-retention.ts) is the
--       DELETED-ACCOUNT purge, whose every other block is scoped
--       `artist_id IS NULL`. Whether a LIVE artist's own 8-year-old tax
--       snapshot must also purge is a larger question that
--       billing-record-retention.ts already flags as separate and that
--       counsel was not asked. The narrow reading retains more, which is the
--       conservative direction for a tax ledger; widening it later is one
--       `alter` away, un-deleting is not.
--
--   (3) The row is genuinely past the horizon, RE-DERIVED IN THE TRIGGER from
--       `now()` -- never from anything the caller passed. This is the load-
--       bearing one. Even a session that sets the marker by hand cannot
--       delete a row that is inside its retention period.
--
-- What is deliberately NOT done: `revoke delete on transaction_tax_snapshots
-- from service_role`. It would be a genuine fourth layer, but
-- `apps/web/supabase/seed.sql` re-runs `GRANT ALL ON ALL TABLES` AFTER
-- migrations on every local `db reset`, so the revoke would be silently
-- clobbered locally and could only be proven on production -- i.e. a control
-- whose test can never go red locally, which is the shape this repo has
-- already been burned by. Recorded as a follow-up (mirror it into seed.sql's
-- "re-apply deliberate hardenings" block, then add it), not skipped silently.
--
-- ===========================================================================
-- PART 2 (Q13) -- the Connected Account pointer purge is CONDITIONED ON THE
--                 ACCOUNT ACTION, not on the timer alone.
-- ===========================================================================
--
-- Counsel: "(c) Yes: condition the pointer purge on the Stripe-side action
-- having completed; a purge that can outrun the deletion it enables is a
-- design fault. Build order: the balance check and purge-ordering constraint
-- now (cheap, prevents the orphan class)."
--
-- `deleted_account_records` is purged at 7 years by the retention cron. That
-- row carries `stripe_account_id`, and it is the ONLY thing that can ever
-- find the Connected Account again. Purging it before the account has been
-- deleted or deauthorised leaves a live account at Stripe that Inklee can no
-- longer identify -- permanently. The trigger below makes that physically
-- impossible rather than merely unlikely: a row with a retained pointer and
-- an incomplete teardown cannot be deleted by ANY caller.
--
-- The cron ALSO filters those rows out of its delete (so the step reports a
-- clean count instead of erroring); the trigger is the backstop for every
-- other path, including a future one nobody has written yet.
--
-- CONVERGENCE (AGENTS.md, and this session's two specific traps). Everything
-- below is either `create or replace`, `drop ... if exists` + unconditional
-- create, `add column if not exists`, or an idempotent `update`. No object is
-- renamed, so the "drop BOTH names" rule from 0146 does not apply. Proven by
-- executing the whole file twice under ON_ERROR_STOP=1 against the local
-- already-migrated database, not by reading it.

-- ---------------------------------------------------------------------------
-- 0. Shared cutoff arithmetic, in SQL, matching
--    `apps/web/src/lib/server/retention-cutoffs.ts::financialYearRetentionCutoff`
--    exactly: 1 Jan of (the UTC year of `_now` minus `_retain_years`).
--    Financial year = calendar year (founder decision 2026-06-10).
--
--    It exists in SQL because the trigger must derive the horizon ITSELF. A
--    horizon supplied by the caller is not a horizon.
create or replace function financial_year_retention_cutoff(
  _now timestamptz,
  _retain_years integer
) returns timestamptz
language sql
immutable
as $$
  select (
    date_trunc('year', _now at time zone 'UTC')
      - make_interval(years => _retain_years)
  ) at time zone 'UTC';
$$;

comment on function financial_year_retention_cutoff(timestamptz, integer) is
  'Retention cutoff: 1 Jan (UTC year of _now - _retain_years). Mirrors financialYearRetentionCutoff in retention-cutoffs.ts. A row is purgeable once its own timestamp is strictly before this instant.';

-- ---------------------------------------------------------------------------
-- 1. The amended append-only control (Q1).
--
-- Unchanged from 0129: every UPDATE is still refused except the single FK
-- `ON DELETE SET NULL` action (artist_id -> null, nothing else changed).
-- Corrections are still new rows. The ONLY new behaviour is the DELETE
-- exemption described in the header.
create or replace function tts_block_mutation() returns trigger language plpgsql as $$
declare
  _check transaction_tax_snapshots;
begin
  if TG_OP = 'DELETE' then
    -- Counsel Q1 (2026-08-02): the retention purge at the 7-year horizon is
    -- the one path that may delete. All three conditions must hold; (3) is
    -- re-derived here from now() and is NOT taken from the caller.
    if coalesce(current_setting('inklee.tts_retention_purge', true), '') = 'on'
       and OLD.artist_id is null
       and OLD.created_at < financial_year_retention_cutoff(now(), 7)
    then
      return OLD;
    end if;
    raise exception 'transaction_tax_snapshots is append-only; corrections are new rows';
  end if;
  -- Allow ONLY the FK ON DELETE SET NULL action: artist_id → NULL, all other
  -- columns unchanged. Verified by temporarily restoring artist_id on the new
  -- row and comparing the full composite; IS NOT DISTINCT FROM treats NULLs in
  -- corresponding columns as equal.
  if NEW.artist_id is null and OLD.artist_id is not null then
    _check := NEW;
    _check.artist_id := OLD.artist_id;
    if _check is not distinct from OLD then
      return NEW;
    end if;
  end if;
  raise exception 'transaction_tax_snapshots is append-only; corrections are new rows';
end $$;

-- The trigger definition itself is unchanged from 0106/0129; re-asserted here
-- (drop-then-create, the convergent shape) so a database whose trigger was
-- dropped by hand is repaired by re-running this file rather than silently
-- left with an immutability control that no longer exists.
drop trigger if exists tts_no_mutation on transaction_tax_snapshots;
create trigger tts_no_mutation before update or delete on transaction_tax_snapshots
  for each row execute function tts_block_mutation();

-- ---------------------------------------------------------------------------
-- 2. The one path that may delete (Q1).
--
-- SECURITY DEFINER so it is the only thing that can set the marker, and so a
-- future tightening of table privileges does not have to be re-plumbed.
--
-- `_now` exists for testability and is CLAMPED to `least(_now, now())`: a
-- caller can only ever move the horizon BACKWARD (retain more), never
-- forward. Passing `_now => '2200-01-01'` therefore deletes exactly what
-- passing nothing would. The clamp is why a test-visible time parameter is
-- not also a production hole.
--
-- SELF-REFERENCE: `corrects_snapshot_id` points at the snapshot a correction
-- corrects. An original is only purged when every correction referencing it
-- is ALSO being purged in the same statement (both rows go, and the NO ACTION
-- FK is satisfied at end-of-statement because the referencing row is gone
-- too). A correction still inside its own retention window keeps its original
-- alive -- the same "a dependent inside its own window keeps its parent"
-- rule billing-record-retention.ts already applies to consent records.
-- `_dry_run` exists so counsel's Q14 report mode ("zero is then an evidenced
-- result, not silence") can count what WOULD be purged without purging, from
-- the SAME predicate. It is a parameter of this function rather than a
-- PostgREST-side filter because the self-reference exclusion below cannot be
-- expressed in PostgREST, and a dry-run whose predicate has drifted from the
-- purge's predicate produces a number that looks like evidence and is not
-- (retention-run.ts's own doctrine: "there is no second copy to diverge").
--
-- RETURNS JSONB, not a count and not `setof uuid`. The dependent step
-- (`purgeDeletedAccountBillingSubscriptions`) needs the IDS, not just how
-- many: in dry-run mode nothing is actually deleted, so without them it
-- would treat snapshots this run is about to remove as live dependants,
-- over-protect their subscriptions, and report fewer rows than a real purge
-- deletes. `setof uuid` would expose that list to PostgREST's `db-max-rows`
-- cap and could be silently truncated; a single jsonb row cannot be. The
-- payload carries its own `count` so the caller can cross-check.
--
-- The drop below removes a ONE-ARGUMENT `(timestamptz)` version. `create or
-- replace` matches on the full argument list, so adding `_dry_run` creates a
-- SECOND overload rather than replacing the first, and a defaulted call
-- (`purge_expired_tax_snapshots()`) against both would fail as ambiguous.
-- That single-argument shape existed only on a development database mid-
-- authoring and was never shipped, but the drop is kept: it costs one line
-- and it makes this file converge from that state too.
drop function if exists purge_expired_tax_snapshots(timestamptz);
drop function if exists purge_expired_tax_snapshots(timestamptz, boolean);

create function purge_expired_tax_snapshots(
  _now timestamptz default now(),
  _dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _cutoff timestamptz;
  _ids uuid[];
begin
  _cutoff := financial_year_retention_cutoff(least(_now, now()), 7);

  -- ONE predicate, used by both branches. Written once, here.
  select coalesce(array_agg(s.id), '{}'::uuid[])
    into _ids
  from transaction_tax_snapshots s
  where s.artist_id is null
    and s.created_at < _cutoff
    and not exists (
      select 1
      from transaction_tax_snapshots c
      where c.corrects_snapshot_id = s.id
        and c.id <> s.id
        and not (c.artist_id is null and c.created_at < _cutoff)
    );

  -- The select and the delete are two statements, so under READ COMMITTED a
  -- correction inserted between them against a doomed original would make the
  -- delete fail with 23503. That is the fail-closed direction and it is why
  -- the split is acceptable: the ids were verified de-identified and past the
  -- horizon at select time, AND the trigger re-verifies both properties for
  -- every row at delete time, so the race cannot delete a row that should
  -- have been kept -- it can only abort the run, which the caller reports and
  -- the next cycle retries. Keeping one predicate (used by both branches)
  -- was worth that; a second copy for the dry-run is the failure mode
  -- retention-run.ts exists to prevent.
  if not _dry_run and array_length(_ids, 1) is not null then
    perform set_config('inklee.tts_retention_purge', 'on', true);
    delete from transaction_tax_snapshots t where t.id = any(_ids);
    -- Close the window explicitly rather than relying on the transaction
    -- end: a caller that wraps this in a larger transaction must not inherit
    -- a live delete permit for the statements that follow.
    perform set_config('inklee.tts_retention_purge', 'off', true);
  end if;

  return jsonb_build_object(
    'count', coalesce(array_length(_ids, 1), 0),
    'ids', to_jsonb(_ids)
  );
end $$;

comment on function purge_expired_tax_snapshots(timestamptz, boolean) is
  'Counsel Q1 (2026-08-02): the ONLY path that may delete transaction_tax_snapshots. De-identified rows (artist_id IS NULL) 7 years past financial-year end. The trigger re-derives the horizon independently, so this function cannot widen it.';

-- Supabase applies `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS
-- TO anon, authenticated`, so a new function is callable with the PUBLIC anon
-- key unless explicitly revoked (the 0060 lesson: revoking from PUBLIC alone
-- does NOT remove those explicit grants).
revoke execute on function purge_expired_tax_snapshots(timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function purge_expired_tax_snapshots(timestamptz, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Connected-Account teardown bookkeeping (Q13).
--
-- `not_applicable` = no pointer was retained. `pending` = pointer retained,
-- window-end not reached or not yet attempted. `blocked` = attempted and
-- refused (non-zero balance is the expected reason; counsel's zero-balance
-- precondition). `completed` = Stripe confirmed the account is deleted or
-- already gone, which is the ONLY state in which the pointer may be purged.
alter table deleted_account_records
  add column if not exists connect_teardown_state text not null default 'pending';
alter table deleted_account_records
  add column if not exists connect_teardown_attempted_at timestamptz;
alter table deleted_account_records
  add column if not exists connect_teardown_completed_at timestamptz;
alter table deleted_account_records
  add column if not exists connect_teardown_last_error text;
alter table deleted_account_records
  add column if not exists connect_balance_checked_at timestamptz;

alter table deleted_account_records
  drop constraint if exists dar_connect_teardown_state_check;
alter table deleted_account_records
  add constraint dar_connect_teardown_state_check
  check (connect_teardown_state in ('not_applicable','pending','blocked','completed'));

-- Existing rows: the `not null default 'pending'` above stamped every one of
-- them `pending`, including rows that never carried a pointer and so have no
-- teardown owed. Correct those. Idempotent: after the first run the predicate
-- matches nothing.
update deleted_account_records
   set connect_teardown_state = 'not_applicable'
 where stripe_account_id is null
   and connect_teardown_state = 'pending';

create index if not exists deleted_account_records_connect_teardown_idx
  on deleted_account_records (connect_teardown_state, deleted_at)
  where stripe_account_id is not null;

-- ---------------------------------------------------------------------------
-- 4. The purge-ordering constraint (Q13(c)).
--
-- Not advisory. A row whose Connected Account is still live cannot be
-- deleted, because deleting it destroys the last means of ever finding that
-- account. The retention cron filters these rows out of its DELETE so its
-- step still reports a clean count; this trigger is what makes the guarantee
-- hold for every other caller.
create or replace function dar_block_premature_purge() returns trigger language plpgsql as $$
begin
  if OLD.stripe_account_id is not null
     and OLD.connect_teardown_state <> 'completed' then
    raise exception 'deleted_account_records: the retained Connect pointer cannot be purged before the connected account is deleted or deauthorised (connect_teardown_state=%)', OLD.connect_teardown_state;
  end if;
  return OLD;
end $$;

drop trigger if exists dar_no_premature_purge on deleted_account_records;
create trigger dar_no_premature_purge before delete on deleted_account_records
  for each row execute function dar_block_premature_purge();
