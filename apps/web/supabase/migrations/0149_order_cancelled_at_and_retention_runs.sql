-- 0149: counsel deviation D4 (retention clock runs from the EVENT) and Q14
-- element 2 (a retention run must leave durable evidence of its per-block
-- counts).
--
-- =========================================================================
-- PART A -- D4: orders.cancelled_at
--
-- WHAT WAS WRONG. `purgeCancelledStandaloneOrderEmails` (shop-retention.ts)
-- measured counsel's "pseudonymise the guest email 30 days after
-- cancellation" from `orders.updated_at`. `updated_at` is written by every
-- writer of the row, not by the cancellation, so ANY later touch restarts
-- the clock. Counsel's ruling (docs/legal/counsel-handoff-2026-08-02.md
-- Part 5, D4): "Retention runs from the event (cancellation), not from
-- `updated_at`. Add a `cancelled_at` timestamp (or use the status-change
-- event) and key the purge to it. A clock any later touch can restart is not
-- the specified rule and will drift silently."
--
-- WHY A TRIGGER AND NOT "SET IT AT THE CALL SITES". There are already two
-- distinct writers that flip a standalone order to `cancelled`
-- (`cancelStandalonePendingOrder` and `sweepStalePendingStandaloneOrders`,
-- both in goods-checkout.ts), both on the service role, and the shop build
-- is still growing. A column that only the call sites remember to set is a
-- column that a third writer silently forgets, and the failure mode is
-- SILENT over-retention: a null `cancelled_at` never matches `< cutoff`, so
-- the row is simply never purged and nothing errors. The trigger makes the
-- stamp a property of the status transition itself, which is what counsel's
-- "or use the status-change event" alternative asks for.
--
-- THE TRIGGER DELIBERATELY DOES FOUR THINGS, each of which is a real case:
--   1. INSERT with status='cancelled'  -> stamp now() (an order created
--      already-cancelled would otherwise be unpurgeable forever).
--   2. UPDATE into 'cancelled' from anything else -> stamp now().
--   3. UPDATE while ALREADY 'cancelled' -> leave the existing value alone.
--      Re-stamping on every subsequent touch would rebuild exactly the
--      restartable clock D4 is about.
--   4. UPDATE out of 'cancelled' (an un-cancel / re-open) -> clear it, so a
--      later re-cancellation is stamped fresh by case 2 rather than
--      inheriting a stale, already-expired clock.
-- `coalesce(new.cancelled_at, now())` in cases 1 and 2 lets an explicit
-- value win, which is what backfills, data corrections and the retention DB
-- fixtures need; without it no test could construct a 31-day-old
-- cancellation.
--
-- BACKFILL HONESTY. Existing cancelled rows have no cancellation timestamp
-- anywhere -- `updated_at` is the only evidence that exists, so that is what
-- the backfill uses. It is the conservative direction: `updated_at >= the
-- true cancellation instant`, so a backfilled row can only ever be retained
-- LONGER than the rule requires, never purged early. New rows do not depend
-- on it. (Production currently holds zero standalone orders; the backfill is
-- for the local/dev stacks and for correctness if that changes before this
-- is applied.)
--
-- =========================================================================
-- PART B -- Q14: retention_purge_runs
--
-- Counsel's Q14 answer asks for "a production dry-run/report mode each cycle
-- logging matched-row counts per block (zero is then an evidenced result,
-- not silence)". An HTTP 200 with a JSON body satisfies nobody a year later:
-- Vercel function logs age out, and "the job ran and matched nothing" has to
-- be provable, not remembered. This table is that evidence. One row per
-- invocation, per-block counts in `step_counts`, per-block failures in
-- `step_errors`, and `mode` distinguishing a real purge from a counts-only
-- dry-run so a dry-run can never be mistaken for proof that rows were
-- actually deleted.
--
-- It is a platform operations log with no artist scope at all, so it gets the
-- 0146 treatment: RLS on, no policy, and the client-role table grants
-- revoked. Only the service role reads or writes it.
--
-- =========================================================================
-- CONVERGENCE (AGENTS.md: a migration that re-runs without erroring has not
-- necessarily converged). Every object below is either existence-guarded per
-- item or unconditionally replaced:
--   - `add column if not exists` / `create table if not exists`
--   - `create or replace function`, `drop trigger if exists` + `create trigger`
--   - `drop index if exists` + `create index` (NOT `create index if not
--     exists`, which would skip a same-named index of the wrong shape)
--   - the check constraint and the grants use `if not exists` / `revoke`,
--     both of which repair rather than skip.
-- Proven by dropping the trigger, the function, the index and the constraint
-- by hand against an already-migrated database and re-running the file: all
-- four come back. Re-running twice under ON_ERROR_STOP=1 exits 0 both times.

-- ---------------------------------------------------------------------------
-- PART A
-- ---------------------------------------------------------------------------

alter table orders add column if not exists cancelled_at timestamptz;

comment on column orders.cancelled_at is
  'Instant the order entered status=cancelled (counsel D4). Stamped and '
  'cleared by orders_stamp_cancelled_at(); the retention purge keys the '
  '30-day guest-email rule to THIS column, never to updated_at, which any '
  'later row touch would restart.';

create or replace function orders_stamp_cancelled_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'cancelled' then
    -- Cases 1 and 2: entering the cancelled state. An explicitly supplied
    -- value wins (backfills, corrections, retention test fixtures).
    if tg_op = 'INSERT' or old.status is distinct from 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;
    -- Case 3 (already cancelled, some other column changing): fall through,
    -- leaving cancelled_at exactly as it was. This is the whole point of D4.
  else
    -- Case 4: not cancelled (any more). No cancellation clock should exist.
    new.cancelled_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_cancelled_at_trg on orders;
create trigger orders_stamp_cancelled_at_trg
  before insert or update on orders
  for each row execute function orders_stamp_cancelled_at();

-- Backfill: only rows that are cancelled and have no stamp yet. Naturally
-- convergent (`cancelled_at is null` stops matching once it has run) and
-- inert on a second run. Runs AFTER the trigger exists on purpose: status is
-- unchanged by this update, so case 3 applies and the explicit value passes
-- straight through.
update orders
   set cancelled_at = updated_at
 where status = 'cancelled'
   and cancelled_at is null;

-- The purge filters `booking_id is null and status='cancelled' and
-- cancelled_at < cutoff`. Partial on the two constant predicates so the index
-- stays the size of the cancelled standalone population rather than the whole
-- orders table.
drop index if exists orders_cancelled_at_idx;
create index orders_cancelled_at_idx
  on orders (cancelled_at)
  where cancelled_at is not null and booking_id is null;

-- ---------------------------------------------------------------------------
-- PART B
-- ---------------------------------------------------------------------------

create table if not exists retention_purge_runs (
  id          uuid primary key default gen_random_uuid(),
  ran_at      timestamptz not null default now(),
  mode        text not null,
  ok          boolean not null,
  step_counts jsonb not null default '{}'::jsonb,
  step_errors jsonb not null default '[]'::jsonb,
  duration_ms integer
);

comment on table retention_purge_runs is
  'Q14 evidence ledger: one row per /api/cron/retention-purge invocation, '
  'carrying the matched-row count for every block. A zero here is an '
  'evidenced result; no row at all means the control did not run.';

-- Existence-guarded, not inline in the create table above: an inline check
-- constraint is the exact non-convergent shape AGENTS.md documents (once the
-- table exists, `create table if not exists` skips the whole column list and
-- restores nothing).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'retention_purge_runs_mode_check'
  ) then
    alter table retention_purge_runs
      add constraint retention_purge_runs_mode_check
      check (mode in ('purge', 'dry-run'));
  end if;
end $$;

drop index if exists retention_purge_runs_ran_at_idx;
create index retention_purge_runs_ran_at_idx
  on retention_purge_runs (ran_at desc);

alter table retention_purge_runs enable row level security;

-- No policy on purpose (0146 precedent): with RLS enabled and no policy, every
-- non-service role is denied by default. The REVOKE is the half that actually
-- matters, since the default anon/authenticated table grants would otherwise
-- still be present.
revoke insert, update, delete, truncate, select
  on retention_purge_runs from anon, authenticated;
