-- 0076: Inklee 2.0 Phase 2 - artist map presence + watches + blocks
--
-- Second schema slice of the guest spot map track (docs/product/
-- inklee-2-schema-proposal.md sections 2.1, 2.2, 2.8, 2.9; build plan Phase 2).
--
-- Adds:
--   1. Artist map-presence columns on profiles: explicit consent-gated
--      visibility (founder decision 2026-07-17: only artists with
--      map_visibility != 'off' are ever counted or listed), the
--      looking-for-guest-spots signal, passport privacy, a structured
--      geocoded city, and a travel-map consent flag that is deliberately
--      SEPARATE from trips.show_on_booking_form (that flag is consent to
--      show travel to the artist's own clients, never to the map).
--   2. artist_styles: the artist half of the canonical style taxonomy.
--   3. watched_studios: private bookmarks on map locations.
--   4. account_blocks: the locked every-account-can-block capability
--      (enforcement is in read paths; no UI ships in this slice).
--   5. A btree index on map_locations display coordinates for the Phase 2
--      viewport (bbox) query API.
--
-- ⚠️ 0074 rule: profiles gained columns written via user-scoped clients, so
-- the column grants are extended HERE in the same migration, and the local
-- seed.sql mirror is updated in the same commit.

-- 1. Profiles map-presence columns -----------------------------------------
-- CHECKs matter here because these columns are authenticated-writable: the
-- server action validates, but direct PostgREST with the artist's own JWT
-- bypasses it (the 0074 lesson), so ranges and lengths are enforced at the
-- database too, and being on the map requires a city.
alter table profiles
  add column if not exists map_visibility text not null default 'off'
    check (map_visibility in ('off', 'city_only', 'listed')),
  add column if not exists looking_for_guest_spots boolean not null default false,
  add column if not exists passport_public boolean not null default false,
  add column if not exists map_city_label text
    check (map_city_label is null or char_length(map_city_label) <= 120),
  add column if not exists map_city_place_id text
    check (map_city_place_id is null or char_length(map_city_place_id) <= 256),
  add column if not exists map_city_lat double precision
    check (map_city_lat is null or (map_city_lat between -90 and 90)),
  add column if not exists map_city_lng double precision
    check (map_city_lng is null or (map_city_lng between -180 and 180)),
  add column if not exists travel_map_consent boolean not null default false;

alter table profiles
  add constraint profiles_map_visibility_needs_city
  check (map_visibility = 'off' or map_city_lat is not null);

-- Only opted-in rows are ever aggregated; keep that scan cheap.
create index if not exists profiles_map_visibility_idx
  on profiles (map_visibility)
  where map_visibility <> 'off';

-- Extend the 0074 column grants (additive; the 0074 REVOKE stays in force
-- for everything not explicitly granted). passport_public is deliberately
-- NOT granted: no authenticated write site exists yet, so per the 0074
-- enumeration rule its grant arrives with the passport surface (Phase 4).
grant update (
  map_visibility,
  looking_for_guest_spots,
  map_city_label,
  map_city_place_id,
  map_city_lat,
  map_city_lng,
  travel_map_consent
) on public.profiles to authenticated;

-- 2. Artist styles ----------------------------------------------------------
create table if not exists artist_styles (
  artist_user_id uuid not null references profiles(id) on delete cascade,
  style_key      text not null references styles(key) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (artist_user_id, style_key)
);
alter table artist_styles enable row level security;

create policy "artist manages own styles" on artist_styles
  for all
  using (artist_user_id = auth.uid())
  with check (artist_user_id = auth.uid());

-- 3. Watched studios (private plane; never exposed to the studio) -----------
create table if not exists watched_studios (
  id               uuid primary key default gen_random_uuid(),
  artist_user_id   uuid not null references profiles(id) on delete cascade,
  map_location_id  uuid not null references map_locations(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (artist_user_id, map_location_id)
);
alter table watched_studios enable row level security;

create policy "artist manages own watches" on watched_studios
  for all
  using (artist_user_id = auth.uid())
  with check (artist_user_id = auth.uid());

-- 4. Account blocks (private plane; blocker-only) ---------------------------
create table if not exists account_blocks (
  id               uuid primary key default gen_random_uuid(),
  blocker_user_id  uuid not null references profiles(id) on delete cascade,
  blocked_user_id  uuid not null references profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (blocker_user_id, blocked_user_id),
  constraint account_blocks_not_self check (blocker_user_id <> blocked_user_id)
);
alter table account_blocks enable row level security;

create policy "blocker manages own blocks" on account_blocks
  for all
  using (blocker_user_id = auth.uid())
  with check (blocker_user_id = auth.uid());

-- 5. Viewport query index ---------------------------------------------------
create index if not exists map_locations_display_lat_lng_idx
  on map_locations (display_latitude, display_longitude);
