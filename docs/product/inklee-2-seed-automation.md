# Inklee 2.0 — Automated seed import (the second lane)

Status: built 2026-07-19, behind `AUTOMATED_SEED_IMPORT_ENABLED` (default OFF).
Extends the map seeding tool (`docs/product/inklee-2-map-seeding-tool.md`,
migration 0082) with an automated execution lane. **The manual workflow is
untouched and remains fully functional with the flag on or off.**

## Two lanes, one pipeline

| | Workflow A (manual, existing) | Workflow B (automated, new) |
|---|---|---|
| Intake | Brave search / Overture paste / manual Instagram | Same Overture-extract JSON, via admin panel or CLI |
| Filtering | Admin eyes | Deterministic two-layer ruleset (below) |
| Review | Admin queue on the area page | Only `accept_automated` skips it; everything uncertain lands in the SAME queue |
| Conversion | Convert form → `createMapLocationAction` | `runCountrySeed` → same core |
| Conversion rules | `createMapLocationCore` (`apps/web/src/lib/server/map-locations.ts`) | The very same function |

The conversion core was **extracted, not duplicated**: `createMapLocationAction`
now delegates to `createMapLocationCore`, and the automated executor calls the
same core with an automation actor. Validation, the locked density cap
(5 per ~300 km² bucket), duplicate scanning, and audit logging are one code
path for both lanes and cannot diverge.

## Module map

- `packages/shared/src/seed-filtering.ts` — the two-layer relevance filter:
  vocabularies (EN + DE + Thai), normalization (umlauts, accents, punctuation),
  deterministic rules with IDs, `evaluateSeedCandidate`, decision→status
  mapping, duplicate-decision merge. Versioned: `SEED_RULESET_VERSION`,
  `SEED_PIPELINE_VERSION`, `SEED_SCHEMA_VERSION`.
- `packages/shared/src/seed-countries.ts` — per-country config (extra
  vocabulary, postal pattern). Country specifics live HERE, never scattered
  in pipeline code. Currently DE + TH.
- `apps/web/src/lib/server/map-locations.ts` — the ONE map-location creation
  core (extracted from the admin action).
- `apps/web/src/lib/server/seed-automation.ts` — the orchestrator:
  validate → intake → filter → dedup → persist decisions → plan → gates →
  import → verify → audit. Plus `listCountryRuns` for the admin panel.
- `apps/web/src/app/api/admin/seed-country/route.ts` — CRON_SECRET-protected
  trigger (no browser automation anywhere).
- `scripts/seed-country.cjs` — the CLI:
  `node scripts/seed-country.cjs --country=DE --area=<uuid> --mode=dry-run --file=x.json [--max=N] [--base=https://inklee.app]`
- Admin panel: the area page gains an "Automated import" card (flag-gated)
  plus decision chips with evidence in the existing candidate queue.
- Migration `0087_automated_seed_runs.sql` — `map_seed_country_runs` (run
  journal, RLS zero-policy), decision columns on `map_seed_candidates`,
  `run_mode` on `map_seed_runs`.

## The filter

Layer 1 (tattoo relevance) requires corroborating evidence: a strong phrase
("tattoo studio", "Tätowierer", "sak yant", …) or a tattoo provider category.
Weak hints alone ("ink", "flash", "walk ins") reject as
`reject_insufficient_evidence` — presence in a discovery result is never
enough. Layer 2 (beauty/PMU exclusion) carries a wide EN+DE vocabulary (PMU,
microblading, brows, lips/eyeliner, SMP, paramedical, beauty categories) with
strength tiers so one weak mention (scar camouflage, freckle tattoo) never
rejects a legitimate studio.

Decisions: `accept_automated`, `reject_beauty`, `reject_not_tattoo`,
`reject_insufficient_evidence`, `review_mixed_business`, `review_ambiguous`,
`possible_duplicate`, `duplicate`, `failed_validation`. Rules fire in a fixed
order (R-MIXED, R-NAME-BEAUTY, R-MULTI-BEAUTY, R-SINGLE-STRONG-BEAUTY,
R-OFF-TOPIC, R-ACCEPT/R-LOW-CONFIDENCE, R-WEAK-*, R-NO-EVIDENCE) plus
pipeline rules (P-NO-COORDS, P-COUNTRY-MISMATCH). Every candidate stores its
signals, fired rule IDs, a human-readable explanation, and the ruleset
version in `decision_evidence` — decisions are reconstructible.

The score supports the decision (accept below `MIN_AUTOMATED_CONFIDENCE=70`
downgrades to review); hard rules carry the obvious cases.

## Dedup and claimed-profile protection

Dedup reuses the shipped Phase 1 classifier via the same annotation helpers
the manual lanes use, against: the candidate pool (same URL/provider id, the
0082 unique indexes), existing map entries (name+geo, Instagram, website),
and prior runs (candidates are adopted, not re-inserted, on unique-violation).
Clear hit → `duplicate`; softer → `possible_duplicate` (review). Any hit on a
claimed studio (`studio_profile_id` set) is a hard `duplicate`. Beyond that,
the lane only ever INSERTS new unclaimed seed rows — it has no update path to
claimed data by construction.

## Runs, idempotency, resume

`map_seed_country_runs` journals every run: mode (`dry_run`/`import`),
country, counts per decision, checksum, versions, conversion plan, gate
failures, verification, error summary. Input checksum = sha256 of the raw
file. An input imports ONCE: a pre-check refuses a repeat import, and a
partial unique index on `(input_checksum)` for active/completed imports is
the race-proof backstop at the `importing` flip. Dry runs repeat freely.
Candidate identity rides the 0082 unique indexes, so an interrupted run
re-run adopts existing rows (refreshing decisions ONLY where no human has
touched them — `reviewed_at` wins; `converted` is terminal and never
revisited). The dry-run → import sequence works the same way: the import
adopts the dry run's rows and converts them. A run hard-killed mid-import
(status stuck at `importing`) is auto-healed by the next import attempt
after 15 minutes; before converting each candidate the loop re-checks it,
so a human review made mid-run always wins over the plan.

## Safety gates (import mode)

Before any import: flag re-check, run ceiling (`maxImport`, default 150,
hard-capped 1000), and a 100%-acceptance plausibility check. A failed gate →
status `blocked`, plan and decisions preserved, nothing imported. Batches
that pass all gates import WITHOUT manual confirmation (by design). Per-entry
failures at insert time (density cap, fresh duplicate) skip that entry,
demote it to review where sensible, and are recorded in `verification`.

## Germany rollout

Country-by-country, Germany first: `--country=DE`. Cities come from seed
areas created in the admin panel (no hard-coded pilot lists). Suggested
first step: one mid-size city, `--mode=dry-run`, read the decision sheet in
the admin queue, then `--mode=import` with a small `--max`.

## Tests

`apps/web/src/lib/__tests__/seed-automation-filter.test.ts` — 32 fixtures:
the brief's 20-case battery (Berlin/Hamburg accepts, microblading/PMU/brow/
lip/SMP/beauty rejects, mixed-business review, scar/freckle non-rejects,
ä/ae normalization, duplicate merge incl. claimed-profile hard-stop,
status mapping, checksum/resume idempotency at the unit level) plus a
Chiang Mai regression block (English, sak yant, Thai script, Thai brow
studio). Manual-workflow regression: the full suite (1086 tests) passes and
the manual actions compile against the extracted core unchanged.
