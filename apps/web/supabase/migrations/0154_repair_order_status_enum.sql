-- 0154: repair the production order_status enum's mangled 'cancelled' label
-- (DRIFT-ENUM-001).
--
-- WHAT IS WRONG IN PRODUCTION. The order_status enum defined in 0036 as
-- ('pending','paid','cancelled','refunded','partially_refunded') has, in the
-- production database, a THIRD label of E'cancel\r\n  led' (a carriage return,
-- a line feed and two spaces spliced into the middle) instead of 'cancelled'.
-- Confirmed by direct catalog read on 2026-08-03: pg_enum.enumlabel at
-- enumsortorder 3 is 13 bytes and matches '[\r\n]'. How the corruption was
-- written is not known and is tracked separately; this migration only repairs
-- the label.
--
-- WHY THIS BLOCKS THE 0125-0153 RELEASE. Migration 0149 runs a top-level
-- backfill `update orders set cancelled_at = updated_at where status =
-- 'cancelled' ...`. Postgres coerces the literal 'cancelled' to order_status at
-- PLAN time, before any row is examined and regardless of how many rows match.
-- Against the mangled enum (which has no clean 'cancelled' label) that raises
-- 22P02 invalid_text_representation and ABORTS 0149, halting the batch. The
-- zero cancelled rows in production do not save it: the failure is at literal
-- coercion, not at row evaluation. 0149's stamping trigger compares status to
-- 'cancelled' too, so a mangled enum is also a latent runtime failure on the
-- first real order cancellation.
--
-- APPLICATION ORDER (release-sequencer, READ THIS). Production is at 0124. This
-- migration touches ONLY the pre-existing order_status type (0036) and depends
-- on nothing in 0125-0153, so it MUST be applied FIRST, ahead of the batch, so
-- that the enum is clean before 0149 runs. A naive `supabase db push` would
-- apply 0125..0149 in version order and abort at 0149 before ever reaching
-- 0154; the release must apply and record 0154 first, then apply 0125-0153.
-- After applying, verify with:
--   select enumlabel, length(enumlabel) from pg_enum e
--     join pg_type t on t.oid = e.enumtypid
--    where t.typname = 'order_status' order by enumsortorder;
-- and confirm the third label is exactly 'cancelled' (length 9) with no CR/LF.
--
-- CONVERGENCE (AGENTS.md: a migration that re-runs without erroring has not
-- necessarily converged). The guard below acts ONLY when exactly one mangled
-- label exists AND a clean 'cancelled' does not, so:
--   * on an already-repaired or fresh database (the local dev db, which has the
--     clean label) it is a silent no-op;
--   * it never creates a duplicate 'cancelled';
--   * it refuses to guess if more than one mangled label is present, raising a
--     warning instead of renaming an arbitrary one.
-- ALTER TYPE ... RENAME VALUE is metadata-only: existing rows reference the
-- label by oid, so no row is rewritten and no table is locked for a scan.

do $$
declare
  _bad text;
  _n   int;
begin
  select count(*), max(e.enumlabel)
    into _n, _bad
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'order_status'
     and e.enumlabel ~ '[\r\n]';

  if _n = 1
     and not exists (
       select 1
         from pg_enum e2
         join pg_type t2 on t2.oid = e2.enumtypid
        where t2.typname = 'order_status'
          and e2.enumlabel = 'cancelled')
  then
    execute format('alter type order_status rename value %L to %L', _bad, 'cancelled');
    raise notice 'DRIFT-ENUM-001: repaired mangled order_status label to cancelled';
  elsif _n > 1 then
    raise warning 'order_status has % labels containing CR/LF; refusing to guess which is cancelled. Repair manually.', _n;
  end if;
end $$;
