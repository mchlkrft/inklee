-- 0088: Inklee 2.0 - country coverage orchestrator
--
-- The layer ABOVE the seeding lanes (0082 manual, 0087 automated): a durable
-- country-wide coverage ledger. The orchestrator owns coverage planning and
-- discovery only; candidate processing and import stay in the 0087 pipeline
-- untouched. SoT: docs/product/inklee-2-country-coverage.md.
--
-- RLS posture: admin/worker surface only -> RLS enabled, zero policies (the
-- 0082 convention). Admin stamps reference auth.users (allowlist admins may
-- have no profiles row).

-- ---------------------------------------------------------------------------
-- Geographic dataset versions (refreshable without losing coverage history).

create table if not exists map_coverage_datasets (
  id             uuid primary key default gen_random_uuid(),
  country_code   text not null,
  source         text not null,
  source_version text not null,
  unit_count     int not null default 0,
  attribution    text,
  imported_at    timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  unique (country_code, source, source_version)
);
alter table map_coverage_datasets enable row level security;

-- ---------------------------------------------------------------------------
-- Coverage units: the smallest independently trackable search areas.
-- Identity = (country, level, external id) so a dataset refresh UPDATES rows
-- in place and historical tasks keep their unit references.

create table if not exists map_coverage_units (
  id                  uuid primary key default gen_random_uuid(),
  country_code        text not null,
  level               text not null check (level in (
                        'country', 'state', 'district', 'municipality',
                        'subarea', 'cluster')),
  external_id         text not null,
  parent_external_id  text,
  name                text not null,
  aliases             text[] not null default '{}',
  state_code          text,
  state_name          text,
  district_code       text,
  district_name       text,
  population          int,
  area_km2            double precision,
  centroid_lat        double precision,
  centroid_lng        double precision,
  bbox                jsonb,
  postal_code         text,
  settlement_class    text,
  strategy            text,
  priority_score      double precision not null default 0,
  cluster_external_id text,
  member_external_ids text[] not null default '{}',
  source_version      text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (country_code, level, external_id)
);
alter table map_coverage_units enable row level security;

create index if not exists map_coverage_units_level_idx
  on map_coverage_units (country_code, level);
create index if not exists map_coverage_units_cluster_idx
  on map_coverage_units (country_code, cluster_external_id)
  where cluster_external_id is not null;

-- ---------------------------------------------------------------------------
-- Country runs. mode = the three dry-run levels (planning / discovery / import).

create table if not exists map_coverage_runs (
  id               uuid primary key default gen_random_uuid(),
  country_code     text not null,
  scope            text not null check (scope in (
                     'pilot', 'regional', 'nationwide', 'gap_fill')),
  mode             text not null check (mode in (
                     'planning', 'discovery', 'import')),
  status           text not null default 'created' check (status in (
                     'created', 'planning', 'planned', 'discovering',
                     'processing_candidates', 'paused', 'paused_budget',
                     'paused_rate_limit', 'blocked', 'verifying_coverage',
                     'completed', 'completed_with_gaps', 'failed',
                     'cancelled')),
  region_filter    text,
  policy_version   text not null,
  dataset_version  text not null,
  ruleset_version  text not null,
  pipeline_version text not null,
  config           jsonb,
  pilot_selection  jsonb,
  counters         jsonb,
  gaps             jsonb,
  seed_area_id     uuid references map_seed_areas(id) on delete set null,
  auto_advance     boolean not null default false,
  error_summary    text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz
);
alter table map_coverage_runs enable row level security;

create index if not exists map_coverage_runs_country_idx
  on map_coverage_runs (country_code, created_at desc);

-- ---------------------------------------------------------------------------
-- Per-run, per-unit tasks: the coverage ledger itself.

create table if not exists map_coverage_tasks (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references map_coverage_runs(id)
                       on delete cascade,
  unit_id            uuid not null references map_coverage_units(id)
                       on delete cascade,
  status             text not null default 'queued' check (status in (
                       'unplanned', 'queued', 'discovering', 'discovered',
                       'processing', 'complete', 'complete_no_results',
                       'partial', 'retry_required', 'blocked',
                       'skipped_by_policy', 'stale')),
  strategy           text not null,
  priority           double precision not null default 0,
  attempt            int not null default 0,
  claimed_by         text,
  claimed_at         timestamptz,
  provider_state     jsonb,
  raw_count          int not null default 0,
  novel_count        int not null default 0,
  error_class        text,
  last_error         text,
  next_retry_at      timestamptz,
  covered_by_task_id uuid,
  first_scanned_at   timestamptz,
  last_scanned_at    timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (run_id, unit_id)
);
alter table map_coverage_tasks enable row level security;

create index if not exists map_coverage_tasks_claim_idx
  on map_coverage_tasks (run_id, status, priority desc);

-- ---------------------------------------------------------------------------
-- Raw discoveries, stored BEFORE filtering. Retry-idempotent per provider id.

create table if not exists map_coverage_discoveries (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references map_coverage_runs(id)
                          on delete cascade,
  task_id               uuid references map_coverage_tasks(id)
                          on delete set null,
  unit_id               uuid references map_coverage_units(id)
                          on delete set null,
  provider              text not null check (provider in (
                          'overture', 'osm', 'brave_search')),
  provider_result_id    text,
  name                  text not null,
  category              text,
  latitude              double precision,
  longitude             double precision,
  address               text,
  city                  text,
  postal_code           text,
  website_url           text,
  social_url            text,
  phone                 text,
  email                 text,
  source_url            text,
  payload_minimal       jsonb,
  identity_key          text,
  merged_into           uuid references map_coverage_discoveries(id)
                          on delete set null,
  discovered_by         jsonb,
  assignment_method     text,
  assignment_confidence text,
  batch_run_id          uuid references map_seed_country_runs(id)
                          on delete set null,
  candidate_status      text,
  retention_class       text,
  discovered_at         timestamptz not null default now()
);
alter table map_coverage_discoveries enable row level security;

create unique index if not exists map_coverage_discoveries_provider_idx
  on map_coverage_discoveries (run_id, provider, provider_result_id)
  where provider_result_id is not null;
create index if not exists map_coverage_discoveries_identity_idx
  on map_coverage_discoveries (run_id, identity_key)
  where identity_key is not null;
create index if not exists map_coverage_discoveries_unit_idx
  on map_coverage_discoveries (run_id, unit_id);

-- ---------------------------------------------------------------------------
-- Ledger extension: coverage context + yield on every external request, and
-- OSM Overpass joins the allowed providers (bounded pilot queries only).

alter table map_seed_provider_usage
  drop constraint if exists map_seed_provider_usage_provider_check;
alter table map_seed_provider_usage
  add constraint map_seed_provider_usage_provider_check
    check (provider in ('brave_search', 'osm_overpass'));
alter table map_seed_provider_usage
  add column if not exists coverage_run_id uuid
    references map_coverage_runs(id) on delete set null,
  add column if not exists coverage_unit_id uuid
    references map_coverage_units(id) on delete set null,
  add column if not exists result_count int,
  add column if not exists novel_count int,
  add column if not exists error_class text;

-- Coverage batches carry OSM- and search-origin candidates into the 0087
-- pipeline with honest provenance.
alter table map_seed_candidates
  drop constraint if exists map_seed_candidates_source_type_check;
alter table map_seed_candidates
  add constraint map_seed_candidates_source_type_check
    check (source_type in (
      'overture_maps', 'brave_search', 'manual_instagram',
      'artist_suggestion', 'osm'));
alter table map_seed_runs
  drop constraint if exists map_seed_runs_provider_check;
alter table map_seed_runs
  add constraint map_seed_runs_provider_check
    check (provider in ('overture_maps', 'brave_search', 'osm'));

-- ---------------------------------------------------------------------------
-- Safe task claiming: FOR UPDATE SKIP LOCKED so two workers can never claim
-- the same unit. Service-role only (revoked from every client-facing role).

create or replace function claim_coverage_tasks(
  p_run uuid,
  p_worker text,
  p_max int
) returns setof map_coverage_tasks
language sql
security invoker
as $$
  update map_coverage_tasks t
  set status = 'discovering',
      claimed_by = p_worker,
      claimed_at = now(),
      attempt = t.attempt + 1,
      updated_at = now()
  where t.id in (
    select c.id from map_coverage_tasks c
    where c.run_id = p_run
      and c.status in ('queued', 'retry_required')
      and (c.next_retry_at is null or c.next_retry_at <= now())
    order by c.priority desc, c.created_at asc
    limit greatest(1, least(p_max, 50))
    for update skip locked
  )
  returning t.*;
$$;

revoke all on function claim_coverage_tasks(uuid, text, int)
  from public, anon, authenticated;
