# Inklee 2.0 — Country coverage orchestrator

Status: built 2026-07-19, behind `AUTOMATED_SEED_IMPORT_ENABLED` (the one
seeding flag). The layer ABOVE both seeding workflows: it plans a whole
country, discovers area by area, and hands candidate batches to the 0087
automated pipeline. It never creates map locations itself, never touches the
manual workflow (`inklee-2-map-seeding-tool.md`), and never bypasses the
relevance filter, dedup, claimed-profile protection, or import rules
(`inklee-2-seed-automation.md`).

## Responsibility split

| Responsibility | Owner |
|---|---|
| Coverage planning (where to search) | This orchestrator (`@inklee/shared/seed-coverage` + `lib/server/seed-coverage.ts`) |
| Discovery (find possible studios per unit) | This orchestrator (structured ingest + Brave gap search) |
| Candidate processing (authenticity, beauty exclusion, dedup, decisions) | The 0087 pipeline (`runCountrySeed`), unchanged |
| Import (create unclaimed seed entries) | `createMapLocationCore`, unchanged |

## Data flow

```text
countryCode DE
→ geography import (scripts/germany-geo-import.cjs, AGS-keyed upsert)
→ planCoverage: strategies + priorities + rural clusters (deterministic)
→ run created (pilot | regional | nationwide | gap_fill × planning | discovery | import)
→ structured extractions ingested (Overture country bbox, one OSM Overpass query)
→ spatial assignment to municipalities (centroid+radius, city-name fallback, never guesses between duplicate names)
→ cross-source merge (identity keys: instagram > domain > phone > email > provider id > name+geo)
→ cron worker ticks: claim tasks (FOR UPDATE SKIP LOCKED) → bounded Brave gap queries with saturation stop
→ batches (≤200) → runCountrySeed (dry_run or import) with honest per-source provenance
→ coordinate-less web leads → the EXISTING manual review queue
→ coverage report: unit/population/area/provider rates + enumerated gaps
```

## Germany geography

- Source 1: OpenDataSoft `georef-germany-gemeinde` (BKG/Destatis register,
  dl-de/by-2-0): 10,981 municipalities, 12-digit ARS → 8-digit AGS derived
  (`state(2)+region(1)+district(2)+municipality(3)`), state/district
  hierarchy, centroids.
- Source 2: Wikidata (CC0): population (P1082) + area (P2046) by AGS (P439);
  10,776/10,981 matched (98.1%).
- Identity = `(country, level, AGS)`; dataset refreshes UPSERT in place so
  historical coverage tasks never lose their unit. Versions recorded in
  `map_coverage_datasets`.
- Municipalities are NEVER identified by display name alone (duplicate names
  exist; the spatial assigner refuses to guess between them without
  coordinates).

## Strategy tiers (policy `2026-07-19.1`, thresholds founder-tunable)

| Tier | Rule | Paid queries | Real DE count |
|---|---|---|---|
| metro_deep | pop ≥ 400k | 5 | 15 |
| city_standard | pop ≥ 90k | 2 | 78 |
| town_light | pop ≥ 20k | 1 | 623 |
| rural_cluster | pop < 20k, clustered ≤12 members within 12 km, same state | 1 per cluster | 1,647 clusters over 10,265 municipalities |
| structured_only | clustered members | 0 | — |

Nationwide projection: **~2,501 paid searches total** (63 days at the
coverage lane's 40/day share of the 60/day Brave ledger cap) — not one query
per municipality. Unknown population → treated as small (cheap), never
guessed into a paid tier. Structured yield ≥3 in a unit adaptively reduces
its paid bundle to one confirmation query (recorded in `provider_state.adaptation`).

## Lifecycles

Run: `created → planning/planned → discovering → processing_candidates →
paused/paused_budget/paused_rate_limit/blocked → verifying_coverage →
completed | completed_with_gaps | failed | cancelled`.
Unit task: `queued → discovering → discovered/processing → complete |
complete_no_results | partial | retry_required | blocked | skipped_by_policy | stale`.
`complete_no_results` requires every strategy-required action to have
SUCCEEDED; a failed search is `retry_required`/`partial`, never emptiness.
Cluster execution completes members individually with `covered_by_task_id`
evidence.

## Autonomy, checkpoints, safety

- Cron worker (`/api/cron/coverage-worker`, CRON_SECRET) claims ≤5 tasks per
  tick via the `claim_coverage_tasks` SQL function (FOR UPDATE SKIP LOCKED,
  service-role only) — two workers can never scan the same unit. Claims
  carry a 15-minute lease: tasks stranded in `discovering` by a killed
  worker are requeued automatically. A crashed finalization
  (`verifying_coverage`) reruns on the next tick.
- Budget exhaustion checkpoints the task (executed queries + novel history in
  `provider_state`) and sets `paused_budget`; the next tick after the window
  resets resumes automatically (the resume gate checks the coverage share
  AND the global Brave ledger headroom, and run totals are capped by
  `maxRunSearchRequests`). Paused ≠ failed — budget pauses restore the
  attempt they charged. A budget-paused head run still hands off batches
  (free work) and never starves newer runs of the tick.
- Handoff chunks at `min(maxBatchSize, maxImportPerBatch)`, ≤4 batches per
  tick; a batch is stamped handled ONLY on pipeline success (or the
  idempotency refusal of an already-imported input) — failed batches stay
  pending and retry. Coordinate-less discoveries route to the manual queue;
  the run cannot finalize while any discovery is unbatched.
- Retries: exponential backoff with jitter, max 3 attempts, only for
  `transient_provider_error`/`rate_limited`/`invalid_provider_response`.
  Permanent classes block the unit visibly.
- Idempotency: discoveries unique per (run, provider, provider id); batches
  ride the 0087 checksum ("an input imports once"); re-ingest of the same
  extraction is a silent no-op.
- Claimed profiles: the orchestrator has no write path to `map_locations` at
  all; the 0087 lane's claimed-hit hard-stop and insert-only design stand.
- Website enrichment: ≤10/tick, https-only, SSRF-guarded (no IP literals/
  localhost/internal TLDs, revalidated per redirect hop, 8 s timeout, 200 KB
  cap), homepage title+meta only, stored as bounded `description` evidence
  for the filter (schema v2).
- The one flag `AUTOMATED_SEED_IMPORT_ENABLED` gates the routes, the worker,
  and every server core. `AUTO_ADVANCE_AFTER_PILOT` equivalent: the run-level
  `auto_advance` flag, default **false** — a nationwide paid run never starts
  itself unless the founder set it at run creation.

## Completion

Separate metrics (never one number): unit completion, population-weighted,
area-weighted, provider-action completion, plus discovery/quality counts on
the run. Policy gates (98% units, 95% population, 95% provider actions, ≤25
blocked, ≤50 partial, ≤2% unresolved failures) decide `completed` vs
`completed_with_gaps`; gaps are enumerated on the run row and in
`seed-coverage gaps`.

## Pilot (deterministic, no founder city list)

Selection from the real dataset: Berlin (largest metro), Paderborn (median
medium city, state diversity), Villingen-Schwenningen (median town tier),
Albersdorf area (largest rural cluster, 12 municipalities,
Schleswig-Holstein) — four federal states, each with a recorded reason.

## Commands

```bash
# 1. Geography (once, or on refresh):
node scripts/germany-geo-import.cjs --post --base=https://inklee.app

# 2. Planning dry run (no external calls, no writes beyond the run row):
node scripts/seed-coverage.cjs plan --country=DE --base=https://inklee.app

# 3. Structured extractions (local, free):
node scripts/overture-tattoo-extract.cjs --lat 51.163 --lng 10.447 --radius-km 450 --release <current> --max 20000 --out overture-de.json
node scripts/osm-tattoo-extract.cjs --country=DE --out osm-tattoo-de.json

# 4. Pilot discovery dry run:
node scripts/seed-coverage.cjs run --country=DE --scope=pilot --mode=dry-run --base=...
node scripts/seed-coverage.cjs ingest --run=<id> --provider=overture --file=overture-de.json --base=...
node scripts/seed-coverage.cjs ingest --run=<id> --provider=osm --file=osm-tattoo-de.json --base=...
node scripts/seed-coverage.cjs tick --base=...        # or wait for the cron

# 5. Pilot production, then nationwide:
node scripts/seed-coverage.cjs run --country=DE --scope=pilot --mode=import ...
node scripts/seed-coverage.cjs run --country=DE --scope=nationwide --mode=import ...
node scripts/seed-coverage.cjs gaps --run=<id>
node scripts/seed-coverage.cjs retry --run=<id>
```

Admin equivalent: `/admin/map/seeding/coverage` (start/pause/resume/cancel/
retry/tick, geographic drill-down by state, gaps, pilot reasons, link into
the handoff area's candidate queue).

Vercel cron to add when the founder activates the lane:
`/api/cron/coverage-worker` every 10 minutes (CRON_SECRET bearer, same as
the other crons).

## Adding a country / provider

Country: a geography import script producing `CoverageUnitInput[]` (official
IDs, hierarchy, population, centroids) + a `CoveragePolicy` entry in
`seed-coverage.ts` (`COVERAGE_POLICIES`) + a `seed-countries.ts` filter
config. No orchestrator changes; German terms never leak into core code.
Provider: implement discovery → `RawDiscovery[]`, ingest via the route (bulk
extractions) or wire into the worker (per-unit queries), extend the ledger
provider CHECK, declare a retention class.

## Licensing and retention

- Overture places: CDLA-Permissive-2.0 (attribution stamped on candidates).
- OSM: ODbL, attribution "OpenStreetMap contributors (ODbL)", provenance on
  every discovery; one bounded country Overpass query for the pilot,
  Geofabrik extract or self-hosted Overpass documented for recurring use.
- Brave: leads only (URL + title), no snippets/cached content (the 0082 Q17
  rule), `retention_class=lead_only`.
- Municipality register dl-de/by-2-0, Wikidata CC0.

## Known limitations (v1)

- Population source is Wikidata (98.1% coverage); an official GV100AD
  adapter can replace it via the same upsert path.
- No polygon geometries: spatial assignment is centroid+radius with a
  25 km fallback; border candidates get `low` confidence instead of a
  boundary test. Foreign-country strays are caught by the 0087
  P-COUNTRY-MISMATCH rule.
- Large-city subdivision (districts/H3) is designed for in the schema
  (`level='subarea'`) but not built; the pilot must show municipality-level
  truncation first (per the brief).
- Staleness/refresh scheduling exists as data (`last_scanned_at`,
  `gap_fill` scope) but no automatic recurring rescan is configured — by
  design.
- OSM contact fields may contain personal data; only business contact tags
  are stored, and logs never include them.

## Tests

`apps/web/src/lib/__tests__/seed-coverage.test.ts` — 28 tests: planning
(tiers, unknown population, dedup, determinism, refresh identity),
clustering (state boundary, member sums), query generation (umlaut/alias
dedup, duplicate-name disambiguation, zero paid queries for structured
units), saturation, identity/merge (Overture+OSM, Instagram, umlaut twins,
same-name-different-city stays separate, platform hosts excluded), spatial
assignment (coordinates, boundary, city fallback, duplicate-name refusal),
deterministic pilot, backoff bounds, completion math (failed ≠ no-results,
separate rates, gap enumeration).
