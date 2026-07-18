-- 0087: Inklee 2.0 - automated seed import lane
--
-- Extends the seeding tool (0082) with a second, automated execution lane.
-- The manual lanes and their tables stay untouched; this adds the country-
-- level run model, per-candidate filter decisions with evidence, and a
-- run-mode stamp on manual intake runs. SoT:
-- docs/product/inklee-2-seed-automation.md.
--
-- RLS posture: admin surface only -> RLS enabled, zero policies (the 0082
-- convention). Admin stamps reference auth.users (the 0082 lesson: allowlist
-- admins may have no profiles row).

create table if not exists map_seed_country_runs (
  id                    uuid primary key default gen_random_uuid(),
  mode                  text not null check (mode in ('dry_run', 'import')),
  country_code          text not null,
  country_name          text not null,
  seed_area_id          uuid references map_seed_areas(id) on delete set null,
  input_label           text,
  input_checksum        text not null,
  schema_version        text not null,
  ruleset_version       text not null,
  pipeline_version      text not null,
  status                text not null default 'received'
                        check (status in (
                          'received', 'validating', 'filtered', 'planned',
                          'blocked', 'importing', 'imported', 'verifying',
                          'completed', 'completed_with_review', 'failed',
                          'cancelled')),
  total_count           int not null default 0,
  accepted_count        int not null default 0,
  beauty_rejected_count int not null default 0,
  not_tattoo_count      int not null default 0,
  insufficient_count    int not null default 0,
  mixed_business_count  int not null default 0,
  ambiguous_count       int not null default 0,
  possible_dup_count    int not null default 0,
  duplicate_count       int not null default 0,
  failed_count          int not null default 0,
  created_count         int not null default 0,
  skipped_count         int not null default 0,
  conversion_plan       jsonb,
  gate_failures         jsonb,
  verification          jsonb,
  error_summary         text,
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table map_seed_country_runs enable row level security;

create index if not exists map_seed_country_runs_area_idx
  on map_seed_country_runs (seed_area_id, created_at desc);
create index if not exists map_seed_country_runs_country_idx
  on map_seed_country_runs (country_code, created_at desc);
-- Idempotency: the same input can only be IMPORTED once (dry runs repeat
-- freely; failed/cancelled/blocked imports may retry).
create unique index if not exists map_seed_country_runs_import_once_idx
  on map_seed_country_runs (input_checksum)
  where mode = 'import'
    and status in ('importing', 'imported', 'verifying', 'completed',
                   'completed_with_review');

-- Per-candidate filter decision + explainable evidence. NULL decision =
-- candidate predates the automated lane or came through a manual lane.
alter table map_seed_candidates
  add column if not exists country_run_id uuid
    references map_seed_country_runs(id) on delete set null,
  add column if not exists decision text
    check (decision is null or decision in (
      'accept_automated', 'reject_beauty', 'reject_not_tattoo',
      'reject_insufficient_evidence', 'review_mixed_business',
      'review_ambiguous', 'possible_duplicate', 'duplicate',
      'failed_validation')),
  add column if not exists decision_confidence int
    check (decision_confidence is null
           or (decision_confidence between 0 and 100)),
  add column if not exists decision_evidence jsonb,
  add column if not exists ruleset_version text,
  add column if not exists decision_override jsonb;

create index if not exists map_seed_candidates_run_decision_idx
  on map_seed_candidates (country_run_id, decision);

-- Manual intake runs become distinguishable from automated ones in audit
-- records; every historical row is manual by definition (safe default).
alter table map_seed_runs
  add column if not exists run_mode text not null default 'manual'
    check (run_mode in ('manual', 'automated'));
