# Inklee 2.0 map seeding tool

Status: v1 designed and confirmed by the founder 2026-07-18. This document is the source of truth for the initial map seeding tool: the source stack, the cost and compliance posture, what is stored, what is never stored, and how candidates become map entries.

The tool is a lead collector, not an importer. External sources create candidate leads. Inklee-owned studio entries come only from admin review, owner claims, artist suggestions, and manual enrichment. Nothing auto-publishes.

## 1. Why this shape

The first map seed has to happen without budget. The founder rule for this phase: start the initial seeding with zero expense and see how far it carries the project before touching money. That rule shaped every choice below.

- This is not a Google Maps importer, not a scraper, and not a paid API integration.
- Every candidate passes mandatory admin review before it can become an unclaimed studio shell.
- The locked density cap (maximum 5 seeded studios per 300 square km) is enforced once, at conversion, through the already shipped bucket enforcement in the map location insert path. Candidates themselves are uncapped leads: the point is to collect more leads than slots and curate the best.

## 2. The source stack (locked for v1)

| # | Source | Mode | Cost | Status |
|---|--------|------|------|--------|
| 1 | Overture Maps | Local extraction script + admin import lane | Zero (open data on public S3) | Build in v1 |
| 2 | Brave Search API | In-app search lane with hard guardrails | $5 monthly credit, metered card on file | Build in v1, founder-accepted risk |
| 3 | Manual Instagram discovery | Admin manual entry form | Zero | Build in v1 |
| 4 | Artist suggestions | Logged-in artist form | Zero | Planned, follow-on slice |
| 5 | Admin review | Queue + review actions + conversion | Zero | Build in v1 |

Excluded from v1: Google Places (paid), Google Maps scraping, Instagram scraping, Facebook scraping, any scraper of any kind, OpenStreetMap as primary source.

### 2.1 Research findings that changed the original plan (verified 2026-07-18)

The original concept named Google Programmable Search free quota as source 2. Verified against official documentation on 2026-07-18:

- **Google Custom Search JSON API is closed to new customers.** Existing customers have until January 1, 2027 to transition off. Source: developers.google.com/custom-search/v1/overview. The lane is impossible for a new project and short-lived for anyone.
- **Bing Search APIs were retired in August 2025.**
- **Brave Search API dropped its free tier (around February 2026).** All current plans are metered billing with a payment card on file: $5 in monthly credits on every plan, then $5 per 1,000 web search requests. Source: api-dashboard.search.brave.com/documentation/pricing.
- There is currently no compliant zero-cost general web search API. Everything remaining is paid, metered, or scraping-based (SerpAPI, Serper, self-hosted SearXNG), and scraping is banned by this tool's own rules.

Founder decision 2026-07-18: use Brave Search with hard guardrails, accepting the residual card-on-file risk with eyes open. The guardrails are described in section 4.

### 2.2 Why each source

- **Why not OpenStreetMap as primary:** ODbL share-alike obligations sit badly under a commercial directory that mixes sources, and OSM tattoo studio coverage is weak in exactly the cities that matter (small studios churn fast, OSM mapping lags). Overture's places theme carries better business coverage (Meta and Microsoft sourced) under a permissive license.
- **Why Overture Maps as the automated source:** open data, genuinely zero cost (GeoParquet on public S3 through the AWS Open Data program, anonymous reads), permissive license (section 6), stable entity IDs (GERS) for provenance, bounding box access that fits per-city seeding.
- **Why Brave Search only as a guarded lead lane:** it is the last practical search API. Results are leads (a URL and a title), never content. Hard ledger stops keep usage far inside the monthly credit.
- **Why manual Instagram discovery:** tattoo studios keep their most current presence on Instagram, and in cities like Chiang Mai manual Instagram discovery is expected to outperform every open dataset. Manual means manual: the admin finds the profile in a normal browser session and types the candidate in. No scraping, no automation, no profile extraction.
- **Why artist suggestions:** the map should improve through scene-native input. Artists know which studios take guests. Suggestions create candidates, never pages, and feed future community proof. This lane is artist-facing, so it ships as its own follow-on slice behind the map flag, with rate limits and privacy treatment.
- **Why admin review is mandatory:** the map is a curated surface, the seed phase decides first impressions, and every legal obligation above lands on what Inklee chooses to publish, not on what it collects. Review is where that choice happens.

## 3. Architecture

Four tables (migration 0082), all service-role only (RLS enabled, zero policies), all admin-surface only:

- **map_seed_areas**: planning entities. Label, city, country, center coordinates, radius km, status (active, done, archived), notes. No cap columns: the density cap does not live here (section 5). The admin UI shows live bucket capacity for the area instead.
- **map_seed_runs**: one row per persisted intake event (a committed Overture import, a stored Brave selection). Provider, query or file label, result count, stored count, duplicate count, notes, who ran it. Manual entries do not create runs. The original concept had async-job fields (started/finished/status/dry-run); these intakes are synchronous and previews are never persisted, so the lean shape records what actually happened.
- **map_seed_candidates**: the leads. Source type (overture_maps, brave_search, manual_instagram, artist_suggestion), source URL, source provider ID (Overture GERS ID), minimal source payload, candidate type, name, city, country, coordinates when known, social URL, website URL, confidence score, provenance notes, attribution note, status, duplicate annotations, conversion link, admin notes, review stamps.
- **map_seed_provider_usage**: the ledger. One row per automated provider request, including blocked ones (provider, query, day key, month key, blocked, block reason). This is what enforces the Brave caps.

Candidate statuses (simplified from the original concept, founder-confirmed 2026-07-18):

```
new -> likely_duplicate | approved_for_enrichment | rejected | converted
```

The candidate lifecycle ends at converted (with converted_location_id) or rejected. Claim state lives solely on map_locations and location_claims (shipped in migration 0079); candidates never mirror claimed or claim_conflict, because duplicated state drifts.

Candidate types align with the shipped map category vocabulary (tattoo_studio, private_studio, piercing_studio, supply_shop, other) plus two candidate-only extras: tattoo_artist (an outreach lead, not a map location) and uncertain. Both extras must be re-typed before conversion.

## 4. Zero-expense posture, honestly stated

There are two different guarantees in play:

- **Structural (Overture, manual lanes):** no key, no account, no billing exists. Spending money is impossible.
- **Guarded (Brave):** a payment card is on file with Brave. The ledger is the wall, and it is ordered to fail closed: every request first writes its own ledger row (a failed write aborts before anything billable), then counts usage including that row, so concurrent searches cannot all pass the same pre-check. Three caps, all shared constants: 60 per day, 900 per calendar month, and 900 per trailing 30 days (the trailing window covers Brave billing cycles that straddle two calendar months). Worst case the $5 credit buys 1,000 queries at $0.005, so the hard stop keeps real headroom. Over-cap and failed-ledger requests are recorded as blocked rows with reasons. The kill switch is structural: the lane is off unless MAP_SEED_BRAVE_SEARCH_KEY is set. Residual risk, accepted by the founder 2026-07-18: a guardrail bug or a Brave price change could create a real charge. Nothing structural prevents it.

The original concept proposed nine environment controls including a zero-expense mode. Collapsed (founder-confirmed): v1 contains no paid code paths for a mode to block. Config surface is one secret (the Brave key; absence disables the lane) plus shared constants for every cap.

## 5. Seed density enforcement

The locked rule: maximum 5 seeded studios per 300 square km. It shipped in Phase 1 as a ~17.3 km grid bucket (seedRegionBucket) checked in the map location insert path, and that stays the single enforcement point. Conversion routes through the same create pipeline as hand-entered admin entries, so no seeding round can bypass the cap, and the cap code exists exactly once.

Candidates are deliberately not capped by density. Collecting 40 leads for a city with 10 slots is the desired workflow: curate, do not crowd. Per-run noise limits exist (maximum 200 candidates per import commit) but they are hygiene, not density policy.

Seed areas display live capacity: which buckets the area touches, how many of each bucket's 5 slots are used.

## 6. What is stored, what is never stored

Stored per candidate, by source:

- **Overture:** name, coordinates, category hint, GERS ID, attribution and license note, city/country when present. License: the places theme is CDLA-Permissive-2.0 (rows sourced from Foursquare are Apache 2.0). CDLA-Permissive-2.0 requires including the license text when sharing the data and disclaims warranties; results built on the data carry no obligations. The attribution note is stored on every Overture candidate and the map keeps the existing attribution surface.
- **Brave:** the result URL, the result title, and the query that found it. Nothing else. No snippets, no descriptions, no cached pages. Long-term storage rights for even title text remain an open question (Q17); if the answer comes back negative, titles can be dropped and re-derived at review time by opening the URL.
- **Manual Instagram:** only what the admin typed, plus the Instagram URL as a reference.
- **Artist suggestions (planned):** only what the artist typed, plus who suggested it (admin-visible only, never public).

Never stored, from any source: scraped pages, copied Google Maps data, Instagram-scraped data, third-party photos, third-party reviews, third-party ratings. External data is never treated as final Inklee-owned profile data; conversion creates an incomplete unclaimed shell and real profiles come from claims and enrichment.

## 7. Duplicate detection

Reuses the shipped Phase 1 classifier (name similarity, distance, shared classifyDuplicate with clear/likely/possible confidence) plus exact matches candidates bring with them:

- same source URL (unique index, hard block)
- same Overture GERS ID (unique index, hard block)
- same Instagram or website URL as an existing candidate or map location
- similar name near similar coordinates against both the candidate pool and existing map locations

Nothing auto-merges. Likely and clear hits mark the candidate likely_duplicate with a link to what it duplicates; the admin decides.

## 8. Conversion to an unclaimed studio shell

Converting a candidate routes the admin to the existing create form, prefilled from the candidate. The same pipeline that guards hand-entered admin entries runs unchanged: validation, the density cap, duplicate warn-and-confirm, audit logging. On success the candidate is marked converted and linked to the new location.

The created entry uses only the shipped vocabulary: source inklee_seed, is_seed true, claim_status unclaimed, moderation status chosen by the admin at creation (approved makes it visible on the logged-in map). No new columns, no new statuses. Unclaimed approved entries appearing on the logged-in map is decided, shipped behavior: that is what seeding is for. They stay noindexed per Q3.

Photos are never imported (Q5 default). Reviews and ratings are never imported, ever.

## 9. Admin workflow

1. Create or open a seed area for a city.
2. See live bucket capacity for the area.
3. Collect leads: run the Overture script for the area and import the file (preview with duplicate badges, then commit), run guarded Brave searches and store selected results, or type in Instagram finds.
4. Review the queue: reject, mark duplicate, approve for enrichment, adjust confidence, add notes.
5. Convert the best candidates through the prefilled create form until the buckets are full.
6. Real profile completion happens later through owner claims, admin enrichment, or direct owner submission.

The Overture script is a repo script (DuckDB CLI over the public S3 GeoParquet, bounding box pushdown, tattoo-relevant category and name filters). It runs locally, costs nothing, and emits a candidates JSON file for the import lane. Overture's category taxonomy is mid-migration (categories is deprecated in favor of basic_category/taxonomy), so the script discovers the live column shape at run time rather than hard-coding it.

## 10. Open questions (kept open, never resolved silently)

- Q2 (existing): provisionally answered by the founder 2026-07-18. The seeding source stack is locked as above; formal legal review of the whole seeding posture before public launch remains open.
- Q5 (existing): photos on seeded entries stay off by default until decided.
- Q17 (new): whether Brave result titles can be stored long term under Brave's data rights, or must be dropped after review.
- Q18 (new): whether Instagram URLs are acceptable as durable source references without additional policy review.
- Q19 (new): whether optional Google Maps links in future artist suggestions can be stored long term as review references.
- Q20 (new): whether Overture-derived fields can appear on public (logged-out) pages without legal review. Currently moot: the map is logged-in only.
- Whether city-level seed quality gets a manual audit pass before the flag flips (recommended, founder call).

## 11. Acceptance criteria vs the original concept

Everything from the original concept holds except the founder-confirmed deviations recorded above: cap at conversion instead of per-area cap columns, five candidate statuses instead of eight, Overture as script-plus-import instead of in-app querying, one env secret plus constants instead of nine env controls, Brave replacing the closed Google Programmable Search lane, and artist suggestions planned as the follow-on slice.
