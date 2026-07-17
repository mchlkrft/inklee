-- 0077: Inklee 2.0 Phase 1 follow-on - duplicate studio suggestions
--
-- The duplicate studio detector (scope 4.10, extension 2026-07-18) runs at
-- admin create/update now and at owner creation + claim when those ship.
-- Detection itself is app-side (shared name-similarity math + coordinate
-- proximity + exact link/address matches; the schema addendum's "pg_trgm or
-- equivalent" at founder scale). This table stores the ADMIN REVIEW
-- SUGGESTIONS it produces. Nothing is ever auto-merged: a suggestion is
-- reviewed by a human, dismissed, or resolved by manually editing or
-- removing one of the pair (CASCADE cleans the suggestion up).

create table if not exists map_duplicate_suggestions (
  id           uuid primary key default gen_random_uuid(),
  -- Ordered pair (location_a < location_b by uuid) so one pair can never
  -- produce two suggestions in opposite directions.
  location_a   uuid not null references map_locations(id) on delete cascade,
  location_b   uuid not null references map_locations(id) on delete cascade,
  confidence   text not null check (confidence in ('clear', 'likely', 'possible')),
  -- Which signals matched: e.g. {"name_similarity": 0.91, "distance_m": 18,
  -- "same_instagram": true}. Admin context only.
  signals      jsonb not null default '{}',
  status       text not null default 'open' check (status in ('open', 'dismissed')),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (location_a, location_b),
  constraint map_duplicate_pair_ordered check (location_a < location_b)
);
alter table map_duplicate_suggestions enable row level security;

create index if not exists map_duplicate_suggestions_status_idx
  on map_duplicate_suggestions (status, confidence, created_at desc);
