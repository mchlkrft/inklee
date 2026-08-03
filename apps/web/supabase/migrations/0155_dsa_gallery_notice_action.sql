-- 0155: DSA notice-and-action for gallery images (counsel round-2 Q16, adopted
-- as DPIA mitigation R1). Two schema objects behind #79 element 2:
--   PART A: content_reports, a DURABLE moderation queue for /legal/report
--           submissions (email alone is not "a queued item in the moderation
--           workflow").
--   PART B: moderation_statements gains 'gallery_image' as a target and a
--           back-link to the queue row, so the ARTIST (the service recipient)
--           can be given the Art. 17 statement of reasons when their image is
--           removed.
--
-- DELIBERATELY NOT HERE: the DSA Section 4 micro/small threshold row (counsel
-- round-2 Q20 second half / B2). It needs a statutory small-enterprise ceiling
-- figure that is a counsel determination (round-6 Q1), and the "a statutory
-- figure is never invented in engineering" rule (see 0145) forbids seeding a
-- guessed number. It lands in its own migration once counsel confirms the
-- figure, so the Q16 schema is not blocked on it. Logged as a build-first
-- decision.

-- ---------------------------------------------------------------------------
-- PART A: content_reports -- the durable moderation queue
-- ---------------------------------------------------------------------------
-- Mirrors map_reports (0075): the ONLY writer is the public /legal/report
-- server action running as serviceClient, and the ONLY reader is an operator
-- surface running as serviceClient, so RLS is ENABLED with ZERO POLICIES
-- (service-role-only). No user-scoped client ever touches it, so per the
-- RLS-write-policy rule NO `to authenticated ... with check` policy is
-- warranted and none is added -- a policy would imply a client path that does
-- not exist. Brand-new table, so inline constraints are acceptable on first
-- apply; any LATER change to a constraint here must use a guarded ALTER, not an
-- edit to the inline list (which `create table if not exists` would skip).
create table if not exists content_reports (
  id                       uuid primary key default gen_random_uuid(),
  category                 text not null,
  url                      text not null,
  description              text not null,
  reporter_name            text not null,
  reporter_email           text not null,
  reference                text not null,
  status                   text not null default 'new'
                           check (status in ('new', 'reviewed', 'actioned', 'dismissed')),
  -- The hosting artist, resolved when the report is triaged/actioned. Null at
  -- intake (the reporter is a third party who does not know the artist's id).
  target_artist_id         uuid references profiles(id) on delete set null,
  -- The Art. 17 statement issued for the takedown, back-linked so the queue row
  -- and its statement stay joined (mirrors map_reports.statement_of_reasons_id).
  statement_of_reasons_id  uuid references moderation_statements(id) on delete set null,
  reviewed_by              uuid references auth.users(id) on delete set null,
  reviewed_at              timestamptz,
  created_at               timestamptz not null default now()
);
alter table content_reports enable row level security; -- zero policies = service-role only

-- Operator queue read pattern: newest unresolved first. Convergent
-- (drop-then-create, never `create index if not exists`, which tests the NAME
-- not the SHAPE -- AGENTS.md).
drop index if exists content_reports_status_created_idx;
create index content_reports_status_created_idx
  on content_reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- PART B: moderation_statements can target a removed gallery image
-- ---------------------------------------------------------------------------
-- The target_type check at 0075:112-113 is an ANONYMOUS inline check that
-- Postgres named `moderation_statements_target_type_check`; an inline edit
-- would be SKIPPED once the table exists (AGENTS.md), so extend it CONVERGENTLY
-- with drop-then-create. The action vocab already includes 'removed' (0075:117),
-- so no change is needed there. Verify after apply with
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'moderation_statements'::regclass;
-- rather than trusting a clean re-run.
alter table moderation_statements
  drop constraint if exists moderation_statements_target_type_check;
alter table moderation_statements
  add constraint moderation_statements_target_type_check
  check (target_type in ('studio', 'artist', 'shop', 'location', 'gallery_image'));

-- Back-link a statement to the content_reports row that triggered it. Guarded
-- add so a re-run converges rather than erroring. content_reports already
-- exists (PART A above), so the reference resolves.
alter table moderation_statements
  add column if not exists target_content_report_id uuid
    references content_reports(id) on delete set null;
