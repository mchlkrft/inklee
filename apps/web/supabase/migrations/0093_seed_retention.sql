-- 0093: seed working-data retention
--
-- The seeding scaffolding outgrew the product it builds: after the US
-- rollout the database sat at 279 MB, of which map_coverage_discoveries
-- (117 MB) and candidate evidence blobs (86 MB) were working data around
-- 15 MB of actual map entries. Left alone, three more countries would hit
-- the 500 MB plan ceiling and writes would stop.
--
-- What retention removes, once a country run is TERMINAL:
--   * its raw discoveries - they have already become candidates and map
--     entries, and the extraction files can regenerate them.
--   * the bulk of decided candidates' evidence: the full signal arrays
--     collapse to counts, while the human-readable explanation, the fired
--     rule ids and the duplicate verdict stay, so every decision remains
--     auditable.
--
-- What it NEVER touches: map_locations, map_coverage_tasks (the coverage
-- ledger and its per-unit evidence), run rows and counters, candidates
-- themselves, or anything belonging to a run that is still open.
--
-- Service-role only; the functions are invoked from the admin lane.

create or replace function seed_retention_plan()
returns jsonb
language sql
security invoker
as $$
  select jsonb_build_object(
    'terminalRuns', (
      select count(*) from map_coverage_runs
      where status in ('completed', 'completed_with_gaps', 'cancelled', 'failed')
    ),
    'openRuns', (
      select count(*) from map_coverage_runs
      where status not in ('completed', 'completed_with_gaps', 'cancelled', 'failed')
    ),
    'discoveriesPrunable', (
      select count(*) from map_coverage_discoveries d
      join map_coverage_runs r on r.id = d.run_id
      where r.status in ('completed', 'completed_with_gaps', 'cancelled', 'failed')
    ),
    'discoveriesProtected', (
      select count(*) from map_coverage_discoveries d
      join map_coverage_runs r on r.id = d.run_id
      where r.status not in ('completed', 'completed_with_gaps', 'cancelled', 'failed')
    ),
    'evidenceCompactable', (
      select count(*) from map_seed_candidates
      where decision_evidence ? 'positive'
        and status in ('converted', 'rejected')
    ),
    'evidenceProtected', (
      select count(*) from map_seed_candidates
      where decision_evidence ? 'positive'
        and status not in ('converted', 'rejected')
    ),
    'mapLocations', (select count(*) from map_locations),
    'coverageTasks', (select count(*) from map_coverage_tasks),
    'discoveriesBytes', pg_total_relation_size('public.map_coverage_discoveries'),
    'candidatesBytes', pg_total_relation_size('public.map_seed_candidates'),
    'databaseBytes', pg_database_size(current_database())
  );
$$;

-- Deletes at most p_limit raw discoveries belonging to terminal runs.
create or replace function prune_coverage_discoveries(p_limit int default 5000)
returns int
language plpgsql
security invoker
as $$
declare
  removed int;
begin
  delete from map_coverage_discoveries
  where id in (
    select d.id
    from map_coverage_discoveries d
    join map_coverage_runs r on r.id = d.run_id
    where r.status in ('completed', 'completed_with_gaps', 'cancelled', 'failed')
    limit greatest(1, least(p_limit, 20000))
  );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Collapses the signal arrays on decided candidates, keeping the parts a
-- human needs to understand the decision.
create or replace function compact_seed_evidence(p_limit int default 5000)
returns int
language plpgsql
security invoker
as $$
declare
  updated int;
begin
  update map_seed_candidates c
  set decision_evidence = jsonb_strip_nulls(jsonb_build_object(
        'explanation', c.decision_evidence -> 'explanation',
        'firedRules', c.decision_evidence -> 'firedRules',
        'duplicate', c.decision_evidence -> 'duplicate',
        'positiveCount', to_jsonb(jsonb_array_length(
          coalesce(c.decision_evidence -> 'positive', '[]'::jsonb))),
        'negativeCount', to_jsonb(jsonb_array_length(
          coalesce(c.decision_evidence -> 'negative', '[]'::jsonb))),
        'compacted', to_jsonb(true)
      ))
  where c.id in (
    select id from map_seed_candidates
    where decision_evidence ? 'positive'
      and status in ('converted', 'rejected')
    limit greatest(1, least(p_limit, 20000))
  );
  get diagnostics updated = row_count;
  return updated;
end;
$$;

revoke all on function seed_retention_plan() from public, anon, authenticated;
revoke all on function prune_coverage_discoveries(int) from public, anon, authenticated;
revoke all on function compact_seed_evidence(int) from public, anon, authenticated;
