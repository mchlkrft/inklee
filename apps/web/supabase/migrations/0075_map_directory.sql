-- 0075: Inklee 2.0 Phase 1 - map/directory core
--
-- First schema slice of the guest spot map track (docs/product/
-- inklee-2-schema-proposal.md sections 2.1 + 2.6; build plan Phase 1).
-- Admin-only at this stage: every table is RLS-enabled with ZERO policies
-- (service-role only, the account_overrides house pattern). Client-facing
-- policies arrive with the phases that ship their surfaces (claims in
-- Phase 3, none of these tables ever get anon SELECT).
--
-- Landing notes:
--   - map_locations ships WITHOUT studio_profile_id / shop_profile_id;
--     those FK columns arrive by ALTER in Phases 3 and 8 with their targets.
--   - map_reports targets only artists and map locations for now; studio and
--     shop target columns arrive by ALTER with their tables, replacing the
--     exactly-one-target CHECK each time.
--   - The style vocabulary seeded here mirrors packages/shared/src/
--     map-directory.ts (STYLE_SEED). Keep the two in sync.
--   - The seed density cap (max 5 seeded studios per ~300 square km bucket)
--     is enforced in the admin insert path using seed_region_bucket, which is
--     computed by the shared seedRegionBucket() helper. The bucket function is
--     unit-tested to approximate 300 square km per cell.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Canonical tattoo style vocabulary (map filters + studio/artist styles).
create table if not exists styles (
  key         text primary key,
  label       text not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);
alter table styles enable row level security;

insert into styles (key, label, position) values
  ('blackwork',       'Blackwork',        1),
  ('fine_line',       'Fine line',        2),
  ('traditional',     'Traditional',      3),
  ('neo_traditional', 'Neo traditional',  4),
  ('realism',         'Realism',          5),
  ('japanese',        'Japanese',         6),
  ('tribal',          'Tribal',           7),
  ('dotwork',         'Dotwork',          8),
  ('geometric',       'Geometric',        9),
  ('watercolor',      'Watercolor',      10),
  ('new_school',      'New school',      11),
  ('lettering',       'Lettering',       12),
  ('portrait',        'Portrait',        13),
  ('ornamental',      'Ornamental',      14),
  ('trash_polka',     'Trash polka',     15)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The shared map object: every point rendered on the tattoo map.
create table if not exists map_locations (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null default 'inklee_seed'
                     check (source in ('inklee_seed', 'owner_created', 'claim_converted')),
  category           text not null
                     check (category in ('tattoo_studio', 'private_studio', 'piercing_studio', 'supply_shop', 'other')),
  name               text not null,
  -- True position (private plane; never rendered directly for approximate rows).
  latitude           double precision not null check (latitude between -90 and 90),
  longitude          double precision not null check (longitude between -180 and 180),
  -- Rendered position: equals the true position unless the studio is
  -- approximate-only, then a coarse offset written by the app layer.
  display_latitude   double precision not null check (display_latitude between -90 and 90),
  display_longitude  double precision not null check (display_longitude between -180 and 180),
  address            text,
  city               text,
  country            text,
  postal_code        text,
  google_place_id    text,
  website_url        text,
  instagram_handle   text,
  claim_status       text not null default 'unclaimed'
                     check (claim_status in ('unclaimed', 'claim_pending', 'claimed')),
  -- Fail closed: nothing renders publicly unless explicitly approved.
  moderation_status  text not null default 'pending'
                     check (moderation_status in ('pending', 'approved', 'hidden', 'removed')),
  is_seed            boolean not null default false,
  -- ~300 square km grid cell, computed by the shared seedRegionBucket()
  -- helper at write time; backs the 5-seeds-per-bucket density cap.
  seed_region_bucket text,
  last_confirmed_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table map_locations enable row level security;

create index if not exists map_locations_moderation_category_idx
  on map_locations (moderation_status, category);
create index if not exists map_locations_city_idx
  on map_locations (city);
create index if not exists map_locations_seed_bucket_idx
  on map_locations (seed_region_bucket)
  where is_seed;
-- Dedupe: one directory row per Google place (seeded and owner-created rows
-- both resolve through Places where available).
create unique index if not exists map_locations_google_place_idx
  on map_locations (google_place_id)
  where google_place_id is not null;
-- Spatial index on the RENDERED position for the Phase 2 bbox/radius API.
create index if not exists map_locations_display_geo_idx
  on map_locations
  using gist ((extensions.st_setsrid(extensions.st_makepoint(display_longitude, display_latitude), 4326)::extensions.geography));

-- ---------------------------------------------------------------------------
-- Art. 17 statement-of-reasons register (DSA duty; retention 5 years).
create table if not exists moderation_statements (
  id                      uuid primary key default gen_random_uuid(),
  target_type             text not null
                          check (target_type in ('studio', 'artist', 'shop', 'location')),
  target_artist_id        uuid references profiles(id) on delete set null,
  target_map_location_id  uuid references map_locations(id) on delete set null,
  action                  text not null
                          check (action in ('report_threshold_flag', 'warning_shown', 'hidden', 'removed', 'suspended', 'other')),
  grounds                 text not null,
  automated               boolean not null,
  delivered_to            uuid references profiles(id) on delete set null,
  delivered_at            timestamptz,
  created_at              timestamptz not null default now()
);
alter table moderation_statements enable row level security;

-- ---------------------------------------------------------------------------
-- Map reports (anonymous toward the target, never toward the platform;
-- the in-product register the DSA procedure needs; retention 24 months).
create table if not exists map_reports (
  id                       uuid primary key default gen_random_uuid(),
  -- Stored for abuse control (rate limits, dedupe); NEVER exposed to the target.
  reporter_user_id         uuid references profiles(id) on delete set null,
  target_type              text not null
                           check (target_type in ('artist', 'location')),
  target_artist_id         uuid references profiles(id) on delete set null,
  target_map_location_id   uuid references map_locations(id) on delete set null,
  reason                   text not null
                           check (reason in ('wrong_location', 'fake_studio', 'spam', 'scam', 'behavior', 'other')),
  detail                   text,
  status                   text not null default 'new'
                           check (status in ('new', 'reviewed', 'actioned', 'dismissed')),
  statement_of_reasons_id  uuid references moderation_statements(id) on delete set null,
  reviewed_by              uuid references auth.users(id) on delete set null,
  reviewed_at              timestamptz,
  created_at               timestamptz not null default now(),
  -- Exactly one target. Replaced by later ALTERs when studio/shop target
  -- columns (and their target_type values) arrive in Phases 3 and 8.
  constraint map_reports_one_target
    check (num_nonnulls(target_artist_id, target_map_location_id) = 1)
);
alter table map_reports enable row level security;

create index if not exists map_reports_status_idx on map_reports (status, created_at desc);
create index if not exists map_reports_target_location_idx on map_reports (target_map_location_id);
create index if not exists map_reports_target_artist_idx on map_reports (target_artist_id);

-- ---------------------------------------------------------------------------
-- Studio claims (reviewed in admin; the claimant-facing flow ships in
-- Phase 3, which adds the claimant self-insert/select policies plus its
-- rate-limited server action. Zero policies until then.)
create table if not exists location_claims (
  id                    uuid primary key default gen_random_uuid(),
  map_location_id       uuid not null references map_locations(id) on delete cascade,
  claimant_user_id      uuid not null references profiles(id) on delete cascade,
  claimant_role         text not null
                        check (claimant_role in ('artist', 'receptionist', 'manager', 'business_owner')),
  social_link           text not null,
  address_confirmation  text,
  status                text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected', 'revoked')),
  evidence_note         text,
  -- Admin accounts may have no profiles row (support_ticket_messages precedent),
  -- so the reviewer references auth.users.
  reviewed_by           uuid references auth.users(id) on delete set null,
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now()
);
alter table location_claims enable row level security;

create index if not exists location_claims_status_idx on location_claims (status, created_at desc);
create index if not exists location_claims_location_idx on location_claims (map_location_id);
