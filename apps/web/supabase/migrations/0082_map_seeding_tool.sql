-- 0082: Inklee 2.0 - map seeding tool (lead collector)
--
-- SoT: docs/product/inklee-2-map-seeding-tool.md. External sources create
-- candidate LEADS; Inklee map entries come only from admin review and the
-- existing create pipeline (which owns the locked 5-per-300-square-km bucket
-- cap). Candidates are deliberately uncapped: collect more leads than slots,
-- curate the best. Claim state never lives here (map_locations/location_claims
-- own it, migration 0079).
--
-- RLS posture: all four tables are admin-surface only -> RLS enabled with
-- ZERO policies (service-role only), the 0075 map-table convention.

-- Planning entity: one row per city/region the founder works. No cap columns
-- on purpose; density enforcement stays in the map_locations insert path.
create table if not exists map_seed_areas (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  city        text,
  country     text,
  center_lat  double precision not null check (center_lat between -90 and 90),
  center_lng  double precision not null check (center_lng between -180 and 180),
  radius_km   numeric not null check (radius_km > 0 and radius_km <= 500),
  status      text not null default 'active'
              check (status in ('active', 'done', 'archived')),
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table map_seed_areas enable row level security;

-- One row per persisted intake event (committed Overture import, stored Brave
-- selection). Manual entries do not create runs; previews are never persisted.
create table if not exists map_seed_runs (
  id              uuid primary key default gen_random_uuid(),
  seed_area_id    uuid references map_seed_areas(id) on delete set null,
  provider        text not null check (provider in ('overture_maps', 'brave_search')),
  query           text,
  result_count    int not null default 0,
  stored_count    int not null default 0,
  duplicate_count int not null default 0,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table map_seed_runs enable row level security;

create index if not exists map_seed_runs_area_idx
  on map_seed_runs (seed_area_id, created_at desc);

-- The leads. source_payload_minimal stays minimal by rule: never scraped
-- pages, never third-party photos/reviews/ratings, never copied map data.
create table if not exists map_seed_candidates (
  id                        uuid primary key default gen_random_uuid(),
  seed_run_id               uuid references map_seed_runs(id) on delete set null,
  seed_area_id              uuid references map_seed_areas(id) on delete set null,
  source_type               text not null check (source_type in (
                              'overture_maps', 'brave_search',
                              'manual_instagram', 'artist_suggestion')),
  source_url                text,
  source_provider_id        text,
  source_payload_minimal    jsonb,
  candidate_type            text not null default 'uncertain'
                            check (candidate_type in (
                              'tattoo_studio', 'private_studio',
                              'piercing_studio', 'supply_shop', 'other',
                              'tattoo_artist', 'uncertain')),
  name                      text not null,
  city                      text,
  country                   text,
  latitude                  double precision check (latitude is null or (latitude between -90 and 90)),
  longitude                 double precision check (longitude is null or (longitude between -180 and 180)),
  social_url                text,
  website_url               text,
  confidence_score          int check (confidence_score is null or (confidence_score between 0 and 100)),
  provenance_notes          text,
  attribution               text,
  status                    text not null default 'new'
                            check (status in (
                              'new', 'likely_duplicate',
                              'approved_for_enrichment', 'rejected',
                              'converted')),
  duplicate_confidence      text check (duplicate_confidence is null
                              or duplicate_confidence in ('clear', 'likely', 'possible')),
  duplicate_of_candidate_id uuid references map_seed_candidates(id) on delete set null,
  duplicate_location_id     uuid references map_locations(id) on delete set null,
  converted_location_id     uuid references map_locations(id) on delete set null,
  admin_notes               text,
  reviewed_by               uuid references auth.users(id) on delete set null,
  reviewed_at               timestamptz,
  created_by                uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
alter table map_seed_candidates enable row level security;

create index if not exists map_seed_candidates_area_status_idx
  on map_seed_candidates (seed_area_id, status, created_at desc);
-- Exact-lead dedupe: the same URL or the same Overture entity is the same
-- lead no matter which run found it.
create unique index if not exists map_seed_candidates_source_url_idx
  on map_seed_candidates (lower(source_url))
  where source_url is not null;
create unique index if not exists map_seed_candidates_provider_id_idx
  on map_seed_candidates (source_type, source_provider_id)
  where source_provider_id is not null;

-- The zero-expense ledger: one row per automated provider request, including
-- refused ones. Counting non-blocked rows per day/month key enforces the hard
-- caps BEFORE any request leaves the server.
create table if not exists map_seed_provider_usage (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('brave_search')),
  query        text,
  seed_run_id  uuid references map_seed_runs(id) on delete set null,
  day_key      text not null,
  month_key    text not null,
  blocked      boolean not null default false,
  block_reason text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table map_seed_provider_usage enable row level security;

create index if not exists map_seed_provider_usage_month_idx
  on map_seed_provider_usage (provider, month_key, blocked);
create index if not exists map_seed_provider_usage_day_idx
  on map_seed_provider_usage (provider, day_key, blocked);
