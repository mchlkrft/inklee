-- 0150: counsel round 4 §7.4 (docs/legal/counsel-handoff-round-4-2026-08-02.md).
--
-- THE RULING, in counsel's words: "The retention basis for a tax snapshot is
-- the accounting obligation, which is time-bound -- seven years from
-- financial-year end -- and indifferent to whether the account still exists.
-- A live artist's eight-year-old snapshot has exhausted its Art. 6(1)(c)
-- basis and storage limitation applies. Extend the purge to all snapshots
-- past the horizon regardless of account status, with one carve-out: rows
-- subject to an open dispute, audit, or litigation hold are excluded
-- case-by-case (Art. 17(3)(e)), flagged rather than silently skipped."
--
-- This is the direct answer to the scope question 0148 raised rather than
-- resolved. 0148's header recorded it as an open ambiguity and took the
-- narrow reading (`artist_id IS NULL`, i.e. de-identified rows only) on the
-- grounds that "widening it later is one `alter` away, un-deleting is not."
-- This is that widening.
--
-- ===========================================================================
-- WHAT CHANGES
-- ===========================================================================
--
-- 1. `artist_id IS NULL` is REMOVED as a purge condition, from BOTH the
--    trigger exemption and `purge_expired_tax_snapshots()`. Account status no
--    longer bears on whether the accounting obligation has expired, because
--    counsel has ruled it does not.
--
-- 2. A legal hold replaces it as the third condition. The delete exemption is
--    still over-determined by three conditions, and the two that matter are
--    still ones the caller cannot forge:
--
--      (1) the transaction-local marker `inklee.tts_retention_purge`, which
--          only `purge_expired_tax_snapshots()` sets and which PostgREST
--          cannot send alongside a DELETE (unchanged from 0148);
--      (2) the row is genuinely past the horizon, RE-DERIVED in the trigger
--          from `now()`, never taken from the caller (unchanged from 0148);
--      (3) NEW -- no active legal hold covers the row.
--
--    Condition (3) is deliberately a database condition and not a filter in
--    the purge caller. A hold enforced only in the caller is not a hold: the
--    next path that deletes a tax snapshot (a future admin tool, a data
--    correction script) would sail straight past it. Same reasoning 0148 gave
--    for putting the horizon in the trigger.
--
-- 3. `retention_legal_holds`, the record of the carve-out. Counsel requires
--    the exclusion be "flagged rather than silently skipped", so a held row
--    is not merely absent from the purge: the purge RETURNS the ids it held
--    back, the retention run reports them as their own counted block, and
--    `billing-record-retention.ts` raises an alert whenever the count is
--    non-zero. A silent skip is the thing counsel is ruling against.
--
--    WHY A SEPARATE TABLE rather than a column on the snapshot. The ledger is
--    append-only: `tts_block_mutation()` refuses every UPDATE except the FK's
--    `artist_id -> NULL` action. Placing or releasing a hold would therefore
--    require weakening the update guard, which is the control counsel
--    explicitly kept ("immutable against edits and corrections"). A hold is
--    also not a property of the transaction; it is a property of an open
--    dispute, and it comes and goes on its own clock.
--
-- ===========================================================================
-- WHAT DOES NOT CHANGE
-- ===========================================================================
--
-- The append-only guard against EDITS. Corrections are still new rows. The
-- Q13 Connect-teardown machinery from 0148 part 3/4 is untouched.
--
-- Nor does the SUBSCRIPTION purge widen. `billing_subscriptions`,
-- `withdrawal_cases`, `billing_consent_records` and
-- `billing_contract_confirmations` are all still scoped to `artist_id IS
-- NULL` in billing-record-retention.ts. Counsel ruled on the tax snapshot,
-- whose basis is the accounting obligation specifically; a live customer's
-- own subscription history is ordinary ongoing contract data and was not
-- asked about. Recorded here so the asymmetry reads as deliberate rather than
-- as a step someone forgot.
--
-- ===========================================================================
-- ONE DEFECT FOUND WHILE REWRITING THE PREDICATE, AND FIXED HERE
-- ===========================================================================
--
-- 0148's self-reference exclusion is one level deep. It asks "does a
-- correction of `s` exist that is not itself purgeable?", and it answers that
-- by testing the correction's OWN age and account status -- not whether that
-- correction is in turn blocked by a correction of its own. So for a chain
-- A corrects B corrects C, where A is recent and B and C are both past the
-- horizon: B is correctly excluded (A blocks it), but C's test looks at B,
-- sees an old de-identified row, concludes B is going too, and selects C for
-- deletion. B still references C, the FK is NO ACTION, and the DELETE fails
-- with 23503 -- aborting the whole purge step, every cycle, until someone
-- intervenes.
--
-- That is reachable on 0148 as shipped (nothing about it needs a legal hold),
-- but this migration makes it materially MORE reachable: placing a hold on a
-- mid-chain correction would newly trigger it, so an operator exercising
-- exactly the carve-out counsel just granted could break the retention run.
-- The fix is the `retained` recursive CTE below, which propagates "this row
-- stays" upward through the whole correction chain instead of looking one
-- link ahead. Reported to the supervisor as a finding against 0148, not
-- folded silently into this change.
--
-- ===========================================================================
-- CONVERGENCE (AGENTS.md, and this session's two traps)
-- ===========================================================================
--
-- Every object below is `create table if not exists` with NOTHING load-
-- bearing inline, `create or replace function`, `drop ... if exists` +
-- unconditional create, or an existence-guarded `alter`. No object is
-- renamed, so the "a rename must drop BOTH names" rule does not apply here.
-- The check constraint and both indexes use drop-then-create rather than
-- `if not exists`, because an existence guard skips a present-but-WRONG-
-- shaped object and drop-then-create repairs it. Every `drop constraint`
-- carries `if exists`, because a bare one aborts the entire ALTER on re-run.
--
-- Proven by executing this file twice under ON_ERROR_STOP=1 against the local
-- already-migrated database, and then by dropping the table's constraint, its
-- indexes, both functions and the trigger by hand and re-running -- not by
-- reading it.

-- ---------------------------------------------------------------------------
-- 1. The carve-out record (Art. 17(3)(e)).
--
-- Deliberately NOT unique per record: a row can be under a dispute hold and
-- an audit hold at the same time, opened by different people for different
-- reasons and released independently. The row is purgeable when the LAST of
-- them is released, which `retention_legal_hold_active()` expresses as
-- "no unreleased row exists" rather than as a single flag someone has to
-- remember to clear.
create table if not exists retention_legal_holds (
  id             uuid primary key default gen_random_uuid(),
  record_table   text not null,
  record_id      uuid not null,
  reason         text not null,
  case_reference text not null,
  detail         text,
  opened_at      timestamptz not null default now(),
  opened_by      text not null,
  released_at    timestamptz,
  released_by    text,
  release_note   text
);

comment on table retention_legal_holds is
  'Counsel round 4 §7.4: the Art. 17(3)(e) carve-out from the tax-snapshot '
  'retention horizon. One row per open dispute, audit or litigation hold, '
  'placed and released case by case. An unreleased row makes its target '
  'undeletable by the retention purge AND by the append-only trigger, and '
  'makes the retention run report it as held rather than skip it silently.';

comment on column retention_legal_holds.record_table is
  'The table the held row lives in. CHECK-restricted to tables that actually '
  'consult this ledger: a hold recorded against a table nobody checks is a '
  'hold that silently does nothing, which is the failure counsel ruled out.';

-- Existence-guarded shape, not inline in the create table above: an inline
-- constraint is skipped entirely once the table exists (AGENTS.md), so it
-- would not converge. Drop-then-create rather than `if not exists`, so a
-- constraint of the WRONG shape is repaired instead of skipped.
alter table retention_legal_holds
  drop constraint if exists retention_legal_holds_record_table_check;
alter table retention_legal_holds
  add constraint retention_legal_holds_record_table_check
  check (record_table in ('transaction_tax_snapshots'));

alter table retention_legal_holds
  drop constraint if exists retention_legal_holds_reason_check;
alter table retention_legal_holds
  add constraint retention_legal_holds_reason_check
  check (reason in ('dispute', 'audit', 'litigation'));

-- A release must be complete: a released_at with no released_by is an
-- unattributable release of a legal hold, which is not evidence of anything.
alter table retention_legal_holds
  drop constraint if exists retention_legal_holds_release_complete_check;
alter table retention_legal_holds
  add constraint retention_legal_holds_release_complete_check
  check (
    (released_at is null and released_by is null)
    or (released_at is not null and released_by is not null)
  );

-- The lookup the trigger performs once per deleted row.
drop index if exists retention_legal_holds_active_idx;
create index retention_legal_holds_active_idx
  on retention_legal_holds (record_table, record_id)
  where released_at is null;

drop index if exists retention_legal_holds_opened_idx;
create index retention_legal_holds_opened_idx
  on retention_legal_holds (opened_at desc);

alter table retention_legal_holds enable row level security;

-- No policy on purpose (0146/0149 precedent): RLS on with no policy denies
-- every non-service role. The REVOKE is the half that actually matters, since
-- Supabase's default table grants to anon/authenticated would otherwise still
-- be there.
revoke insert, update, delete, truncate, select
  on retention_legal_holds from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. ONE definition of "is this row held", used by the trigger AND the purge.
--
-- Written once for the same reason retention-run.ts writes each retention
-- predicate once: a second copy is a copy that drifts, and here the two
-- copies would be the guard and the thing it guards.
--
-- SECURITY DEFINER is not decoration. `retention_legal_holds` has RLS enabled
-- and no policy, so a caller that does not bypass RLS reads ZERO rows from it
-- -- and a hold check that reads zero rows concludes "not held" and lets the
-- delete through. That is a guard that fails OPEN, and it would fail open
-- silently. Running as the owner means the answer does not depend on who is
-- asking.
create or replace function retention_legal_hold_active(
  _record_table text,
  _record_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from retention_legal_holds h
    where h.record_table = _record_table
      and h.record_id = _record_id
      and h.released_at is null
  );
$$;

comment on function retention_legal_hold_active(text, uuid) is
  'True while an unreleased retention_legal_holds row covers the record. The '
  'single definition of the Art. 17(3)(e) carve-out, consulted by both '
  'tts_block_mutation() and purge_expired_tax_snapshots().';

-- Supabase applies `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS
-- TO anon, authenticated`, so a new function is callable with the PUBLIC anon
-- key unless explicitly revoked (the 0060 lesson, restated in 0148: revoking
-- from PUBLIC alone does NOT remove those explicit grants).
revoke execute on function retention_legal_hold_active(text, uuid)
  from public, anon, authenticated;
grant execute on function retention_legal_hold_active(text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. The amended append-only control.
--
-- The UPDATE half is byte-for-byte 0148's and stays that way: every update is
-- refused except the single FK `ON DELETE SET NULL` action. What changes is
-- the DELETE exemption's second condition -- `OLD.artist_id is null` becomes
-- "no active legal hold" -- because counsel has ruled account status
-- irrelevant to the accounting obligation.
--
-- Short-circuit order matters for cost, not for correctness: `and` stops at
-- the first false, so the overwhelmingly common case (an ad-hoc delete with
-- no marker) never reaches the hold lookup. If the lookup were somehow
-- unreachable to the caller it would raise, and the DELETE would fail, which
-- is the fail-closed direction.
create or replace function tts_block_mutation() returns trigger language plpgsql as $$
declare
  _check transaction_tax_snapshots;
begin
  if TG_OP = 'DELETE' then
    -- Counsel round 4 §7.4: the retention purge at the 7-year horizon is the
    -- one path that may delete, now for LIVE accounts too. All three
    -- conditions must hold. (2) is re-derived here from now() and is never
    -- taken from the caller; (3) is the Art. 17(3)(e) carve-out.
    if coalesce(current_setting('inklee.tts_retention_purge', true), '') = 'on'
       and OLD.created_at < financial_year_retention_cutoff(now(), 7)
       and not retention_legal_hold_active('transaction_tax_snapshots', OLD.id)
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

-- Re-asserted (drop-then-create, the convergent shape) so a database whose
-- trigger was dropped by hand is repaired by re-running this file rather than
-- silently left with an immutability control that no longer exists.
drop trigger if exists tts_no_mutation on transaction_tax_snapshots;
create trigger tts_no_mutation before update or delete on transaction_tax_snapshots
  for each row execute function tts_block_mutation();

-- ---------------------------------------------------------------------------
-- 4. The one path that may delete, widened to all accounts.
--
-- Signature, clamp, dry-run semantics, SECURITY DEFINER and grants are
-- 0148's and unchanged. `create or replace` rather than drop-then-create
-- precisely BECAUSE the signature is identical: replace preserves the grants
-- 0148 set, where a drop would reset them and let Supabase's default
-- privileges hand EXECUTE back to anon and authenticated. The revoke/grant
-- pair is re-asserted below anyway, so the file converges from either state.
--
-- THREE THINGS THE PAYLOAD NOW CARRIES. `count`/`ids` are as before (the
-- dependent subscription step needs the ids, not just how many, or a dry-run
-- over-protects). `held_count`/`held_ids` are counsel's "flagged rather than
-- silently skipped": every row the horizon has reached and the carve-out has
-- kept back, so the caller can report it as its own block instead of the row
-- vanishing into the difference between two numbers nobody compares.
--
-- WHAT COUNTS AS HELD. A row directly covered by an unreleased hold, and any
-- row kept alive only because such a row references it up the correction
-- chain. The second half matters: if a correction is held, the original it
-- corrects cannot go either (the FK is NO ACTION), so its retention is just
-- as attributable to the hold and reporting only the directly-held row would
-- understate the carve-out's reach.
create or replace function purge_expired_tax_snapshots(
  _now timestamptz default now(),
  _dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _cutoff timestamptz;
  _held_chain uuid[];
  _held uuid[];
  _ids uuid[];
begin
  _cutoff := financial_year_retention_cutoff(least(_now, now()), 7);

  -- (a) Everything whose retention is attributable to an active hold: the
  --     held rows themselves, plus every ancestor they pin through
  --     `corrects_snapshot_id`. Not restricted to the horizon here on
  --     purpose; a hold on a row that is still inside its window is
  --     perfectly ordinary and its ancestors are still pinned by it.
  with recursive held_chain as (
    select s.id, s.corrects_snapshot_id
      from transaction_tax_snapshots s
     where retention_legal_hold_active('transaction_tax_snapshots', s.id)
    union
    select p.id, p.corrects_snapshot_id
      from held_chain h
      join transaction_tax_snapshots p
        on p.id = h.corrects_snapshot_id
       and p.id <> h.id
  )
  select coalesce(array_agg(h.id), '{}'::uuid[])
    into _held_chain
    from held_chain h;

  -- (b) The reportable carve-out: of those, the ones the horizon has actually
  --     reached, i.e. the rows that WOULD have been purged today and were
  --     not. A held row still inside its window is not being "held back" from
  --     anything yet, so counting it would inflate the flag.
  select coalesce(array_agg(s.id), '{}'::uuid[])
    into _held
    from transaction_tax_snapshots s
   where s.id = any(_held_chain)
     and s.created_at < _cutoff;

  -- (c) Everything that REMAINS, for any reason, propagated up the correction
  --     chain. This is the fix for 0148's one-level-deep self-reference test
  --     described in the header: a row stays if it is inside its window, or
  --     held, or referenced by anything that stays. Termination is by UNION's
  --     deduplication; `p.id <> h.id` keeps a self-referencing row from
  --     seeding an infinite step.
  with recursive retained as (
    select s.id, s.corrects_snapshot_id
      from transaction_tax_snapshots s
     where s.created_at >= _cutoff
        or s.id = any(_held_chain)
    union
    select p.id, p.corrects_snapshot_id
      from retained r
      join transaction_tax_snapshots p
        on p.id = r.corrects_snapshot_id
       and p.id <> r.id
  )
  select coalesce(array_agg(s.id), '{}'::uuid[])
    into _ids
    from transaction_tax_snapshots s
   where s.created_at < _cutoff
     and not exists (select 1 from retained k where k.id = s.id);

  -- The selects and the delete are separate statements, so under READ
  -- COMMITTED a correction inserted between them against a doomed original
  -- would make the delete fail with 23503, and a hold placed between them
  -- would be missed by the select. Both are the fail-closed direction, and
  -- the trigger re-verifies BOTH the horizon and the hold for every row at
  -- delete time -- so the race cannot delete a row that should have been
  -- kept. It can only abort the run, which the caller reports and the next
  -- cycle retries.
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
    'ids', to_jsonb(_ids),
    'held_count', coalesce(array_length(_held, 1), 0),
    'held_ids', to_jsonb(_held)
  );
end $$;

comment on function purge_expired_tax_snapshots(timestamptz, boolean) is
  'Counsel round 4 §7.4 (2026-08-02): the ONLY path that may delete '
  'transaction_tax_snapshots. ALL rows 7 years past financial-year end, '
  'regardless of account status, except rows under an unreleased '
  'retention_legal_holds entry, which are returned as held_ids rather than '
  'silently skipped. The trigger re-derives both the horizon and the hold '
  'independently, so this function cannot widen either.';

-- Re-asserted so the file converges even from a state where the function was
-- dropped and recreated by hand (which resets grants and lets Supabase's
-- default privileges hand EXECUTE back to anon/authenticated).
revoke execute on function purge_expired_tax_snapshots(timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function purge_expired_tax_snapshots(timestamptz, boolean)
  to service_role;
