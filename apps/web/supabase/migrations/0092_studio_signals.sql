-- 0092: temporary studio signals (the last Phase 3 slice; Q7 resolved
-- 2026-07-19: ring on the marker zoomed-in only, silent expiry, watcher
-- in-app notifications only, map filter toggle, detail page section).
--
-- One short-lived typed signal per owner per month (the locked cap; counted
-- against created_at, so withdrawing does not free a repost). RLS enabled,
-- zero policies: writes go through owner-gated server cores, public reads
-- through the pins API shaper.

create table if not exists studio_signals (
  id                uuid primary key default gen_random_uuid(),
  studio_profile_id uuid not null references studio_profiles(id)
                      on delete cascade,
  map_location_id   uuid references map_locations(id) on delete cascade,
  signal_type       text not null check (signal_type in (
                      'guest_chair_open', 'flash_day_planned',
                      'looking_for_guest_artist', 'convention_week',
                      'walk_in_day', 'new_resident_artist',
                      'studio_relocation', 'private_room_available')),
  created_by        uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  -- Calendar-month bucket: the DB-level race backstop for the posting cap.
  -- The core additionally enforces the rolling 30-day reading; the stricter
  -- of the two applies. Concurrent posts cannot both land.
  month_bucket      date not null default date_trunc('month', now())::date,
  expires_at        timestamptz not null,
  withdrawn_at      timestamptz
);
alter table studio_signals enable row level security;

create unique index if not exists studio_signals_month_cap_idx
  on studio_signals (created_by, month_bucket);
create index if not exists studio_signals_location_active_idx
  on studio_signals (map_location_id, expires_at)
  where withdrawn_at is null;
create index if not exists studio_signals_owner_cap_idx
  on studio_signals (created_by, created_at desc);
