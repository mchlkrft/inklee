-- 0099: index the map_seed_candidates foreign keys that back ON DELETE SET NULL
--
-- Deleting a map_location (or a candidate) fires the SET NULL cascade on these
-- candidate columns; without an index each delete seq-scans the 100k-row
-- candidates table, which is O(n^2) and timed out the 2026-07-22 space
-- cleanup (DB had hit 90% of the 500 MB plan). Same pattern as 0096 for
-- discoveries.map_coverage_discoveries.merged_into.
--
-- Created CONCURRENTLY against prod on 2026-07-22; IF NOT EXISTS keeps a
-- fresh apply idempotent.

create index if not exists idx_map_seed_candidates_dup_of
  on public.map_seed_candidates (duplicate_of_candidate_id)
  where duplicate_of_candidate_id is not null;

create index if not exists idx_map_seed_candidates_converted_location_id
  on public.map_seed_candidates (converted_location_id)
  where converted_location_id is not null;

create index if not exists idx_map_seed_candidates_duplicate_location_id
  on public.map_seed_candidates (duplicate_location_id)
  where duplicate_location_id is not null;
