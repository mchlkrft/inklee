-- 0096: index map_coverage_discoveries.merged_into
--
-- prune_coverage_discoveries (0093) deletes raw discoveries from terminal
-- runs. The table carries a self-referential merged_into FK from dedup, and
-- with no index on it every delete forced a full-table scan to null out
-- referencing rows - O(n^2), which timed out the first apply on 71k rows.
--
-- A partial index on the non-null values makes the cascade check a lookup.
-- It was created with CREATE INDEX CONCURRENTLY against prod on 2026-07-20
-- (outside a migration, so this is the bookkeeping catch-up); IF NOT EXISTS
-- keeps a fresh apply idempotent.
create index if not exists idx_map_coverage_discoveries_merged_into
  on public.map_coverage_discoveries (merged_into)
  where merged_into is not null;
