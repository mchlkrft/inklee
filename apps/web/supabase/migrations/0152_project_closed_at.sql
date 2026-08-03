-- 0152: LO-5 DPIA §7 mitigation R6 -- the intake retention clock.
--
-- R6 (DPIA §4): "Intake images have no retention rule. The purge is designed
-- but unbuilt. It cannot cause harm today because nothing has been submitted;
-- it becomes live the moment something is." The controller adopted the 90-day
-- intake purge as a precondition of BOTH the goods and gallery gates.
--
-- This migration is the CLOCK the purge keys off. The purge itself lives in
-- apps/web/src/lib/server/intake-retention.ts and runs inside the existing
-- weekly retention cron.
--
-- =========================================================================
-- WHY THE TRIGGER IS NOT "90 DAYS FROM created_at"
--
-- The intake's own copy sells multi-session work: `SESSION_COMMITMENTS`
-- offers "Many sessions over months" and "Open-ended, however long it takes",
-- and `PROJECT_SCALES` offers sleeves, back pieces and bodysuits
-- (packages/shared/src/projects.ts). A blanket 90-day-from-creation purge
-- would delete the reference and body photographs of an artist's LIVE
-- in-progress work, mid-bodysuit. So the clock runs from an event that means
-- the images are no longer working material:
--
--   * `submitted`  -- the artist has never acted on it. The enquiry never
--                     converted past its initial state. Anchored on
--                     `created_at`, which IS the submission event: it is set
--                     by the column default and no writer in the codebase
--                     ever updates it (every update sets `updated_at`
--                     instead). Event-anchored by construction, so it needs
--                     no column of its own.
--   * closed       -- `completed`, `declined` or `archived`. Anchored on
--                     `closed_at`, which this migration adds.
--   * everything else (`under_review`, `consultation`, `active`) is
--                     DELIBERATELY EXEMPT. That is the artist's live work.
--
-- =========================================================================
-- WHY A NEW COLUMN AND NOT `projects.decided_at`
--
-- `decided_at` already exists (0115) and looks like the anchor. It is not,
-- for three reasons, each visible in `setProjectStatusCore`
-- (apps/web/src/lib/server/projects.ts):
--
--   1. IT IS NEVER STAMPED FOR `archived`. The call site reads
--      `const terminal = next === "completed" || next === "declined"`.
--      `archived` is reachable from EVERY state, including straight from
--      `submitted` (the natural way to dismiss a spam enquiry). Anchoring on
--      `decided_at` would leave every archived project's images unpurgeable
--      forever, and the failure would be silent: a null never matches
--      `< cutoff`, so it looks exactly like "there was nothing to purge".
--   2. IT IS NEVER CLEARED. The guard is `!project.decided_at`, and the
--      comment says re-opening deliberately keeps the original decision time.
--      `completed -> active -> completed` is a legal transition sequence
--      (PROJECT_TRANSITIONS), and it leaves the clock reading the FIRST
--      close. The second close would already be expired, so the purge would
--      take the images of work that closed seconds ago.
--   3. It records a DECISION, not a STATE. It cannot answer "how long has
--      this been closed", which is the only question the retention rule asks.
--
-- =========================================================================
-- WHY A TRIGGER AND NOT "SET IT AT THE CALL SITES" (counsel D4, migration
-- 0149 Part A). Identical reasoning, restated because it is the reason this
-- file exists in this shape: a column only the call sites remember to set is
-- a column a future writer silently forgets, and the failure mode is SILENT
-- over-retention. Counsel's D4 ruling: "Retention runs from the event, not
-- from `updated_at`. A clock any later touch can restart is not the specified
-- rule and will drift silently." `updated_at` on this table is written by
-- every artist note edit and every status change, so it is exactly the clock
-- D4 forbids.
--
-- The trigger does the same four things 0149's does, each a real case:
--   1. INSERT already closed              -> stamp now().
--   2. UPDATE into closed from open       -> stamp now().
--   3. UPDATE while ALREADY closed        -> leave the value alone. This
--      covers `declined -> archived` and `completed -> archived`, which are
--      filing actions, not new closures. Re-stamping would rebuild exactly
--      the restartable clock D4 is about.
--   4. UPDATE out of closed (a re-open)   -> clear it, so a later re-close is
--      stamped fresh by case 2 instead of inheriting an expired clock. This
--      is the specific defect `decided_at` has.
-- `coalesce(new.closed_at, now())` lets an explicit value win, which the
-- backfill, data corrections and the retention test fixtures all need;
-- without it no test could construct a 91-day-old closure.
--
-- THE STATUS LIST IS DUPLICATED FROM packages/shared/src/projects.ts on
-- purpose, the same way 0115's CHECK constraints are: the shared module is
-- what the product reads, the SQL is the backstop. `intake-retention.test.ts`
-- reads THIS FILE and asserts the two lists agree, so the duplication cannot
-- drift unnoticed.
--
-- =========================================================================
-- CONVERGENCE (AGENTS.md: a migration that re-runs without erroring has not
-- necessarily converged). Every object below is existence-guarded per item or
-- unconditionally replaced:
--   - `add column if not exists`
--   - `create or replace function`
--   - `drop trigger if exists` + `create trigger`
--   - `drop index if exists` + `create index` (NOT `create index if not
--     exists`, which skips a same-named index of the wrong shape). Each drop
--     names exactly the index the next statement creates.
-- Nothing here is declared inline in a `create table`, which is the
-- non-convergent shape.
-- Proven by execution: the column, the function, the trigger and both indexes
-- dropped by hand against an already-migrated database, the file re-run, all
-- five back. Re-run twice under ON_ERROR_STOP=1, exit 0 both times.

alter table projects add column if not exists closed_at timestamptz;

comment on column projects.closed_at is
  'Instant the project entered a closed status (completed/declined/archived). '
  'Stamped and cleared by projects_stamp_closed_at(); the LO-5 DPIA R6 intake '
  'purge keys its 90-day rule to THIS column, never to updated_at (which any '
  'later touch restarts) and never to decided_at (which is never stamped for '
  'archived and never cleared on re-open).';

create or replace function projects_stamp_closed_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- Mirrors PROJECT_STATUS_META[...].terminal in packages/shared/src/projects.ts.
  closed_now boolean := new.status in ('completed', 'declined', 'archived');
  closed_before boolean := tg_op = 'UPDATE'
    and old.status in ('completed', 'declined', 'archived');
begin
  if closed_now then
    -- Cases 1 and 2: entering the closed set. An explicitly supplied value
    -- wins (backfill, corrections, retention test fixtures).
    if not closed_before then
      new.closed_at := coalesce(new.closed_at, now());
    end if;
    -- Case 3 (already closed, something else changing, including a move to
    -- another closed status): fall through untouched. This is the whole
    -- point of D4, and it is also what lets the backfill below write an
    -- explicit value straight through.
  else
    -- Case 4: not closed (any more). No closure clock should exist.
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_stamp_closed_at_trg on projects;
create trigger projects_stamp_closed_at_trg
  before insert or update on projects
  for each row execute function projects_stamp_closed_at();

-- Backfill: only rows already closed with no stamp yet. Naturally convergent
-- (`closed_at is null` stops matching once it has run) and inert on a second
-- run. Runs AFTER the trigger exists on purpose: status is unchanged by this
-- update, so case 3 applies and the explicit value passes straight through.
--
-- BACKFILL HONESTY. `decided_at` is the true closure instant for a project
-- that was completed or declined and never re-opened, so it is preferred
-- where present. `archived` rows have no decision stamp at all, so
-- `updated_at` is the only evidence that exists; it is >= the true closure
-- instant, which can only ever OVER-retain, the safe direction. The one case
-- this gets wrong is a completed -> active -> completed row, whose stale
-- `decided_at` would under-retain; new rows do not depend on the backfill,
-- and production holds zero projects at the time of writing, so the backfill
-- exists for local and dev stacks.
update projects
   set closed_at = coalesce(decided_at, updated_at)
 where status in ('completed', 'declined', 'archived')
   and closed_at is null;

-- The closed-project purge filters `status in (closed) and closed_at <
-- cutoff`. Partial so the index stays the size of the closed population.
drop index if exists projects_closed_at_idx;
create index projects_closed_at_idx
  on projects (closed_at)
  where closed_at is not null;

-- The never-converted purge filters `status = 'submitted' and created_at <
-- cutoff`. `projects_artist_idx` (0115) leads on artist_id and cannot serve a
-- platform-wide sweep.
drop index if exists projects_unconverted_created_at_idx;
create index projects_unconverted_created_at_idx
  on projects (created_at)
  where status = 'submitted';
