-- 0153: counsel round-4 ruling 7.5 (docs/legal/counsel-handoff-round-4-2026-08-02.md
-- §7.5), answering the §3.3 question this repo raised against itself.
--
-- THE QUESTION. The Connect pointer purge is conditioned on teardown
-- completing (0148), and teardown requires a zero balance across every
-- bucket. An account with a permanently non-zero balance therefore NEVER
-- completes and its pointer is NEVER purged, so the stated seven-year
-- retention period is not actually a maximum.
--
-- THE RULING, verbatim on the part that shapes this file: "No blind deletion
-- deadline: force-deleting a Connect account with a non-zero balance orphans
-- money and forecloses refunds -- a worse outcome than retention, and the
-- retention has a lawful basis while the balance is unresolved (Art. 17(3)(e);
-- the balance *is* the legal claim). What is not acceptable is **silent**
-- indefinite retention. Backstop: at the seven-year mark, an uncompleted
-- teardown raises an **operator escalation** -- an alert and a case -- and the
-- continued retention becomes a documented, per-account decision reviewed
-- **annually** with the reason recorded (unresolved balance, amount, what
-- resolution requires). The stated period then remains honest: seven years, or
-- documented cause."
--
-- So this migration is NOT a deletion backstop. It is the record that turns
-- indefinite retention into DOCUMENTED retention. The acceptance criterion is
-- counsel's own summary: "seven years, or documented cause". `documented`
-- is the load-bearing word, and a documented cause has to live somewhere that
-- outlives a Sentry retention window and an operator's memory.
--
-- WHAT ALREADY EXISTED, AND WHY IT IS NOT ENOUGH. `runConnectAccountTeardown`
-- already raised one AGGREGATE Sentry warning per cycle ("N archived
-- account(s) past window-end could not be deleted"). That is an alert, and it
-- is not a case: it is per-run not per-account, it carries no amount, no
-- reason and no statement of what resolution requires, it is gone when Sentry
-- ages it out, and nothing in it ever comes up for review. A weekly warning
-- naming a count is exactly the "silent indefinite retention" counsel refused,
-- with a number attached.
--
-- ===========================================================================
-- WHY TWO TABLES, AND WHY NOT THE FOUR ALTERNATIVES
-- ===========================================================================
--
-- (A) MORE COLUMNS ON `deleted_account_records`. Rejected. An annual review is
--     a REPEATING event; one set of columns holds only the most recent one, so
--     by year 9 the year-8 decision is overwritten and "reviewed annually"
--     cannot be evidenced for any year but the last. Counsel asked for a
--     review cycle, and a cycle with no history is a timestamp.
--
-- (B) REUSE `withdrawal_cases` (0106). Rejected, and not narrowly: that table
--     is `artist_id uuid NOT NULL references profiles(id) ON DELETE CASCADE`.
--     Every subject here is an account that has ALREADY been deleted, so the
--     profiles row is gone by construction and the FK makes the row physically
--     impossible to insert. It is also a consumer-withdrawal workflow with its
--     own unrelated state vocabulary, and it is authored-schema-only.
--
-- (C) REUSE `retention_purge_runs` (0149). Rejected. That is per-RUN evidence.
--     Counsel's words are "a documented, PER-ACCOUNT decision". A run log can
--     say twelve accounts were blocked; it cannot carry one account's reason,
--     its amount, or the decision someone took about it.
--
-- (D) A GENERAL CASE-MANAGEMENT SYSTEM. Deliberately not built. There is no
--     case or ticket mechanism in this codebase to extend (`withdrawal_cases`
--     is the only thing shaped like one and (B) rules it out), and inventing
--     assignment, priority, SLAs and comment threads to satisfy one control
--     that first fires in 2033 is how a backstop becomes a project.
--
-- WHAT IS BUILT: the smallest pair that satisfies "a case" plus "reviewed
-- annually with the reason recorded".
--
--   `connect_teardown_escalations`        -- the case. One per archive row.
--                                            Current reason, current amount,
--                                            what resolution requires, when
--                                            the next annual review is due.
--   `connect_teardown_escalation_reviews` -- the review log. Append-only, one
--                                            row per annual review, so year 8
--                                            survives year 9.
--
-- The case row is MUTABLE on purpose (the balance moves, so the recorded
-- amount must stay current or the alert lies). The review rows are IMMUTABLE
-- on purpose (they are the evidence that the documented decision was actually
-- taken, on a date). Mutable current state + immutable history is the only
-- split that lets both of those be true at once.
--
-- ===========================================================================
-- THE POINTER IS DELIBERATELY NOT COPIED ONTO THE CASE
-- ===========================================================================
--
-- `stripe_account_id` stays on `deleted_account_records` alone and is reached
-- by joining `record_id`. Copying it here would create a SECOND retained
-- pointer to a living Connected Account, in a table with no purge rule of its
-- own -- which is the precise failure 0148 exists to prevent, rebuilt one
-- table over. The operator gets the id from the join, and there is exactly one
-- copy to reason about.
--
-- The FK is `ON DELETE CASCADE`, which means the case and its reviews die when
-- the archive row is finally purged. That is intended, and it is the reason
-- the pointer is not copied: the purge only ever happens once the teardown
-- COMPLETED, i.e. once the extended retention has genuinely ended, and keeping
-- an operator dossier about a person whose financial record was just lawfully
-- destroyed would re-open storage limitation on the way out. The
-- non-personal fact that escalations existed and were worked survives in
-- `retention_purge_runs.step_counts` (0149), which is aggregate and carries no
-- account reference. Recorded as a deliberate trade rather than an oversight.
--
-- ===========================================================================
-- CONVERGENCE (AGENTS.md: "a migration that RE-RUNS without erroring has not
-- necessarily CONVERGED"). Nothing below is declared inline in a
-- `create table if not exists` column list -- every constraint, including both
-- foreign keys and the unique key, is an existence-guarded `do $$` block, the
-- shape 0122 was rewritten into after inline FKs were proven non-convergent.
-- Indexes are `drop index if exists` + `create index` (never
-- `create index if not exists`, which skips a same-named index of the WRONG
-- shape). Functions are `create or replace`; triggers are `drop trigger if
-- exists` + `create trigger`. No object is renamed, so the "a rename must drop
-- BOTH names" rule does not apply here.
--
-- Proven, not asserted: executed twice under ON_ERROR_STOP=1 against the local
-- already-migrated database, then with each constraint, index and trigger
-- dropped by hand and the file re-run, confirming every one of them returns.

-- ---------------------------------------------------------------------------
-- 1. The case.
-- ---------------------------------------------------------------------------
create table if not exists connect_teardown_escalations (
  id                  uuid primary key default gen_random_uuid(),
  record_id           uuid not null,
  -- When the seven-year mark was crossed with the teardown still incomplete,
  -- i.e. when the documented-cause clock started. Never moved by a refresh.
  opened_at           timestamptz not null default now(),
  state               text not null default 'open',
  resolved_at         timestamptz,
  -- Counsel's three mandated contents. `reason` and `balance_*` are refreshed
  -- every cycle so the case never states a stale amount.
  reason              text not null,
  resolution_requires text not null,
  -- THE AMOUNT. `balance_detail` is authoritative and is the full list of
  -- non-zero buckets, because a Stripe balance is a list per bucket AND per
  -- currency: a single scalar cannot honestly represent an account holding
  -- money in two currencies. `balance_minor`/`balance_currency` are the
  -- convenience summary and are populated ONLY when exactly one currency is
  -- non-zero; otherwise they stay null rather than silently picking one.
  balance_detail      jsonb not null default '[]'::jsonb,
  balance_minor       bigint,
  balance_currency    text,
  -- When the reason/amount above were last observed from Stripe. Distinct from
  -- the review clock: the machine refreshes weekly, the human reviews yearly.
  observed_at         timestamptz not null default now(),
  -- The annual review clock (counsel: "reviewed annually").
  next_review_due_at  timestamptz not null,
  last_reviewed_at    timestamptz,
  review_count        integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table connect_teardown_escalations is
  'Counsel ruling 7.5 (2026-08-02): one case per archived account whose Connect '
  'teardown was still incomplete at the seven-year mark. Turns indefinite '
  'retention into documented retention -- "seven years, or documented cause". '
  'Carries the reason, the unresolved amount, what resolution requires, and the '
  'annual review clock. The Stripe account id is NOT copied here; join '
  'deleted_account_records via record_id.';

-- One case per archive row. Guarded, not inline: an inline `unique` in the
-- create-table list above is skipped entirely once the table exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connect_teardown_escalations_record_key'
  ) then
    alter table connect_teardown_escalations
      add constraint connect_teardown_escalations_record_key unique (record_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connect_teardown_escalations_record_fk'
  ) then
    alter table connect_teardown_escalations
      add constraint connect_teardown_escalations_record_fk
      foreign key (record_id) references deleted_account_records(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connect_teardown_escalations_state_check'
  ) then
    alter table connect_teardown_escalations
      add constraint connect_teardown_escalations_state_check
      check (state in ('open', 'resolved'));
  end if;
end $$;

-- A resolved case must say when, and an open one must not claim it. Without
-- this a case can be closed with no closing date, which is the one field that
-- makes "the retention ended here" provable.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connect_teardown_escalations_resolved_at_check'
  ) then
    alter table connect_teardown_escalations
      add constraint connect_teardown_escalations_resolved_at_check
      check (
        (state = 'resolved' and resolved_at is not null)
        or (state = 'open' and resolved_at is null)
      );
  end if;
end $$;

-- The summary amount is all-or-nothing: an amount with no currency is not an
-- amount, and a currency with no amount is noise.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connect_teardown_escalations_balance_summary_check'
  ) then
    alter table connect_teardown_escalations
      add constraint connect_teardown_escalations_balance_summary_check
      check (
        (balance_minor is null and balance_currency is null)
        or (balance_minor is not null and balance_currency is not null)
      );
  end if;
end $$;

-- The operator query is "which open cases are due for review", so the index
-- is partial on `open` and ordered by the due date.
drop index if exists connect_teardown_escalations_review_due_idx;
create index connect_teardown_escalations_review_due_idx
  on connect_teardown_escalations (next_review_due_at)
  where state = 'open';

-- ---------------------------------------------------------------------------
-- 2. The annual review log. Append-only.
-- ---------------------------------------------------------------------------
create table if not exists connect_teardown_escalation_reviews (
  id                  uuid primary key default gen_random_uuid(),
  escalation_id       uuid not null,
  reviewed_at         timestamptz not null default now(),
  -- Who took the decision. Free text rather than an FK to profiles: the
  -- reviewer is an operator/admin, and an FK would make the evidence row
  -- deletable by that person's own account deletion.
  reviewed_by         text not null,
  decision            text not null,
  -- The documented cause AS AT this review, copied rather than referenced, so
  -- the year-8 record still says what was true in year 8 after the case row
  -- has moved on.
  reason              text not null,
  resolution_requires text not null,
  balance_detail      jsonb not null default '[]'::jsonb,
  balance_minor       bigint,
  balance_currency    text,
  note                text,
  created_at          timestamptz not null default now()
);

comment on table connect_teardown_escalation_reviews is
  'Counsel ruling 7.5: the annual review of one escalation, append-only. '
  'A case row holds only the current position; this is what makes "reviewed '
  'annually" evidenceable for every year rather than only the latest.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connect_teardown_escalation_reviews_case_fk'
  ) then
    alter table connect_teardown_escalation_reviews
      add constraint connect_teardown_escalation_reviews_case_fk
      foreign key (escalation_id) references connect_teardown_escalations(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connect_teardown_escalation_reviews_decision_check'
  ) then
    alter table connect_teardown_escalation_reviews
      add constraint connect_teardown_escalation_reviews_decision_check
      check (decision in ('continue_retention', 'resolved'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connect_teardown_escalation_reviews_balance_summary_check'
  ) then
    alter table connect_teardown_escalation_reviews
      add constraint connect_teardown_escalation_reviews_balance_summary_check
      check (
        (balance_minor is null and balance_currency is null)
        or (balance_minor is not null and balance_currency is not null)
      );
  end if;
end $$;

drop index if exists connect_teardown_escalation_reviews_case_idx;
create index connect_teardown_escalation_reviews_case_idx
  on connect_teardown_escalation_reviews (escalation_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- 3. The review log is evidence, so it is append-only.
--
-- UPDATE is refused outright: a review that can be edited after the fact
-- cannot evidence what was decided on the day. Corrections are new review
-- rows, the same doctrine `tts_no_mutation` (0106/0129/0148) applies to the
-- tax ledger.
--
-- DELETE is refused too, with ONE exemption that is not forgeable by the
-- caller: the parent case no longer exists. Under `ON DELETE CASCADE` Postgres
-- removes the parent row first and then fires the referential action against
-- the children, so by the time this BEFORE DELETE trigger runs the case is
-- already gone from the statement's snapshot. A DIRECT delete of a review row
-- still sees its case present. That difference is what separates "the archive
-- row was lawfully purged, take the dossier with it" from "someone is deleting
-- an inconvenient review", and it is asserted in tests/db rather than assumed
-- from the documentation.
create or replace function ctesc_review_block_mutation() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    raise exception 'connect_teardown_escalation_reviews is append-only; a correction is a new review row';
  end if;
  if exists (
    select 1 from connect_teardown_escalations e where e.id = OLD.escalation_id
  ) then
    raise exception 'connect_teardown_escalation_reviews: a review cannot be deleted while its case exists; it is the evidence that the annual review happened';
  end if;
  return OLD;
end $$;

drop trigger if exists ctesc_review_no_mutation on connect_teardown_escalation_reviews;
create trigger ctesc_review_no_mutation
  before update or delete on connect_teardown_escalation_reviews
  for each row execute function ctesc_review_block_mutation();

-- `updated_at` on the case is maintained by the DB, not by each writer: the
-- refresh path runs weekly from the cron and the review path from an operator
-- action, and a column only the call sites remember to set is the silent-drift
-- failure 0149 PART A documents.
create or replace function ctesc_touch_updated_at() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ctesc_set_updated_at on connect_teardown_escalations;
create trigger ctesc_set_updated_at
  before update on connect_teardown_escalations
  for each row execute function ctesc_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Platform operations tables with no artist scope, so they get the 0146 /
--    0149 treatment: RLS on, NO policy (which denies every non-service role by
--    default), and the default anon/authenticated table grants revoked. The
--    revoke is the half that actually matters -- Supabase grants those roles
--    table privileges by default, and RLS with no policy would otherwise still
--    be sitting behind a live grant.
alter table connect_teardown_escalations enable row level security;
alter table connect_teardown_escalation_reviews enable row level security;

revoke insert, update, delete, truncate, select
  on connect_teardown_escalations from anon, authenticated;
revoke insert, update, delete, truncate, select
  on connect_teardown_escalation_reviews from anon, authenticated;
