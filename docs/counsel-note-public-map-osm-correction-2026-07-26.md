# Counsel note — correction to Q20 §7.1: OSM-derived studio rows do exist

**Prepared:** 2026-07-26 · **For:** legal counsel (Estonia/EU, IP + open-data licensing)
**Corrects:** `docs/counsel-note-public-map-data-licensing-2026-07-22.md` §7.1 (answered 2026-07-24)
**Status:** **CONFIRMED BY COUNSEL 2026-07-26 on the corrected facts** (relayed by the
founder). The Produced Work reading holds: **ODbL share-alike does not attach** to the
public directory, and the obligation remains **attribution**. The corrected credit line in
§7, which restores OpenStreetMap, is approved. §8 records the outcome.

> One page, not a fresh brief. Only one premise changed. Everything else in the
> 2026-07-24 answer is unaffected and is listed in §5 below so it is not re-litigated.

---

## 1. What we told you, and what is actually true

The 2026-07-24 answer treated the ODbL share-alike question as **moot**, on the ground
that there are no OSM-derived studio rows. That ground had two legs:

| Leg | Verdict now |
|---|---|
| "Overture's Places theme contains no OpenStreetMap data" | **Still correct**, and unchanged. |
| "The seeding stack excludes OSM; the actual `source_type` set is `overture_maps`, `brave_search`, `manual_instagram`, `artist_suggestion`" | **Incorrect for the shipped system.** |

The second leg was true of the v1 seeding-tool design document, which does list
OpenStreetMap under *Excluded from v1*. It was overtaken in the build. OSM does not
reach the directory through Overture; it reaches it through a **separate, direct
OpenStreetMap Overpass extraction** that was added later for country coverage.

This was our error, not counsel's. The corrected facts follow.

## 2. Evidence

- **Schema.** Migration `0088_country_coverage.sql` widened the constraint:
  `check (source_type in ('overture_maps','brave_search','manual_instagram','artist_suggestion','osm'))`,
  and separately `map_seed_runs_provider_check ... in ('overture_maps','brave_search','osm')`.
- **Ingest path.** `scripts/osm-tattoo-extract.cjs` runs one bounded country-wide
  Overpass query (`shop=tattoo`) against `https://overpass-api.de/api/interpreter`;
  the result is recorded through a lane whose provider is `osm_overpass`
  (`map-seeding.ts:534-537`), and converted to candidates with `source_type='osm'`
  (`seed-coverage.ts:1455`).
- **Our own pipeline already classified them as ODbL.** `seed-coverage.ts:608` assigns
  `retention_class = 'odbl_attribution'` to OSM-provider rows while Overture rows get
  `cdla_permissive`, and every OSM candidate carries the attribution string
  `OpenStreetMap contributors (ODbL)` (`OSM_ATTRIBUTION`, `seed-coverage.ts:49`).
- **Operational record.** The per-country seeding ritual in `docs/roadmap.md` reads
  "ingest Overture **+ OSM**", and `docs/product/inklee-2-map-redesign-audit-and-plan.md`
  §11 states studio facts come from "Overture Maps **+ OSM Overpass** (ODbL / Overture
  CDLA, attribution carried on candidates)". The counsel note did not pick this up.

## 3. Scale (read-only production queries, 2026-07-26)

| Measure | Count |
|---|---|
| Seed candidates with `source_type='osm'` | **12,658** |
| of those, converted | 3,642 |
| **Approved, live `map_locations` whose sole converted source is OSM** | **3,582** |
| Approved live locations that have both an OSM and a non-OSM converted source | **0** |
| Total approved live locations | 71,191 |
| **OSM-only share of the live directory** | **≈ 5.0%** |
| Seed runs with `provider='osm'` | 206 |

The 3,582 are **not** corroboration of rows another source produced. There is zero
overlap: each exists in the directory only because of the Overpass extraction. They span
all sixteen seeded countries (US 1,002 · DE 684 · FR 560 · GB 333 · CA 216 · ES 190 ·
IT 175 · TH 109 · AU 93 · NL 69 · CH 63 · AT 46 · JP 19 · VN 16 · KR 6 · EE 1).

## 4. What this changes in the 2026-07-24 answer

1. **§7.1 is no longer moot.** The §5 Q1 question stands and needs an answer on these
   facts: is Inklee's public, searchable directory, insofar as it incorporates
   OSM-derived facts, a **"Derived Database" that is "publicly used"** under ODbL 1.0,
   or is each public page a **"Produced Work"** requiring attribution only?
2. **The belt-and-braces fallback is unavailable.** §7.1 cited the OSMF *Substantial*
   guideline (extractions under 100 features are not Substantial). At 3,582 converted
   rows, and 12,658 candidates, that threshold is exceeded by roughly 36x and 127x.
3. **The approved attribution string in §7.3 is now wrong.** It deliberately removes OSM
   from the studio-data credit. Implemented as written, it would publish 3,582
   ODbL-sourced rows with no ODbL attribution. **We have suspended implementation of
   §7.3 pending your re-confirmation.**
4. **The §6 contingency is back in play**, and its third branch is now costed:

   | Option | Effect |
   |---|---|
   | Attribution only (Produced Work reading) | Restore OSM to the studio-data credit; publish everything. No data loss. |
   | Share-alike triggered | Offer the derived database under ODbL, or re-source those facts permissively. |
   | Publish without OSM rows | Keep the 3,582 OSM-only rows authenticated-only; publish 67,609 of 71,191 pins. Cost: 5.0% of coverage, spread across all 16 countries. |

## 5. Unaffected by this correction (please do not re-review)

The following parts of the 2026-07-24 answer do not depend on the OSM premise and we are
treating them as settled:

- **§7.2** facts-vs-database: single studio name, display point, derived city/country are
  facts; standing policy retained (publish only facts, no bulk export, no dataset-re-emitting API).
- **§7.4** Foursquare: Apache-2.0 only; no trademark, badge, endorsement or partnership use.
- **§7.6** the two engineering blockers (provenance column on `map_locations`, the
  attribution UI).
- **§7.7** GDPR for sole-trader studios: Art. 6(1)(f) basis and balancing note, Art. 14
  transparency disclosure, Art. 21 objection/delisting route, all dischargeable via one
  `/data-attribution` page.
- **Q14** (DSA): micro-enterprise Art. 19 exclusion from Section 3; Art. 16 and 17 still
  apply; the category-to-channel mapping; the "an unclaimed seeded studio is not a
  recipient of the service" nuance.
- **Q17** (drop Brave titles at terminal status), **Q18** (bare Instagram profile URL is
  an acceptable durable reference), **Q19** (Google Maps link as a transient review
  reference only).

## 6. What we are doing meanwhile

- The **logged-in map is unaffected** and continues to run. This correction concerns
  publication only.
- **No public flip.** The public shell is unbuilt, and the marketing entry points for it
  (navigation, footer, calls to action) are built but held dark behind a fail-closed flag,
  so nothing reaches an anonymous visitor.
- **§7.3 implementation is suspended**: neither the attribution component nor the
  `/data-attribution` page will be built against the OSM-less credit string.
- We are **not** removing the OSM rows or altering the seeding lane pending your answer.

## 7. The single question

On the corrected facts in §2 and §3 — 3,582 approved studio rows (5.0% of the live
directory) whose sole provenance is a direct OpenStreetMap Overpass extraction, carried
in a public, searchable directory alongside ~67,600 Overture/Foursquare rows — does ODbL
share-alike attach to the public directory, or is each public studio page a Produced Work
requiring attribution only?

If attribution only: please confirm the corrected studio-data credit line, which we
propose restores OSM, for example:

> Studio data © OpenStreetMap contributors (ODbL), Overture Maps Foundation
> (CDLA-Permissive-2.0) and Foursquare Labs, Inc. (Apache-2.0), modified by Inklee.
> [Licences and notices]

with the same placement finding as §7.3 (persistent credit on the public map and each
public studio page, linking to a `/data-attribution` page carrying the full licence texts,
the Foursquare NOTICE, and the modification statement).

---

## 8. Outcome (2026-07-26)

**Counsel confirmed the corrected facts and re-affirmed the position:** ODbL share-alike
does **not** attach to the public directory; each public studio page is a Produced Work and
the obligation is **attribution**. The §6 contingency (ODbL-licensed export, re-sourcing,
or holding the 3,582 OSM-only rows back) is **not** needed, and no coverage is lost.

What changes against the 2026-07-24 answer is the **credit string only**. Approved
studio-data credit, with OpenStreetMap restored:

> Studio data © OpenStreetMap contributors (ODbL), Overture Maps Foundation
> (CDLA-Permissive-2.0) and Foursquare Labs, Inc. (Apache-2.0), modified by Inklee.
> [Licences and notices]

Everything else from 2026-07-24 stands unchanged, including the placement finding
(persistent credit on the public map and each public studio page, linking to a
`/data-attribution` page; adjacency not required), the Apache-2.0 obligations (preserve the
Foursquare NOTICE `Copyright 2024 Foursquare Labs, Inc. All rights reserved.`, include the
licence texts, and state that files were changed with dates), the no-trademark limit, the
standing publish-only-facts / no-bulk-export / no-dataset-API policy, and the §7.7 GDPR
surface for sole-trader studios.

**Standing instruction for future sessions:** re-run the §3 verification (which
`source_type` values exist in `map_seed_candidates`, and the OSM-derived approved count)
before any change to the seeding source stack and before the public flip. This correction
exists because that check was not re-run between migration `0088` and the 2026-07-24
answer. The check is cheap; the failure mode is publishing third-party data under the wrong
licence notice.

## 9. Implementation status (2026-07-26)

Built the same day, all fail-closed behind `publicMapEnabled()`:

| Requirement | Where | State |
|---|---|---|
| Approved credit string, single-sourced | `packages/shared/src/map-attribution.ts` | Done, unit-tested for all three sources and the change statement |
| Licences, Foursquare NOTICE, dated change statement | `/data-attribution` | Done |
| Verbatim CDLA-2.0 + Apache-2.0 texts (Apache §4(a), CDLA §2.1) | `apps/web/content/licenses/` rendered on `/data-attribution` | Done, downloaded and hash-recorded |
| GDPR Art. 14 disclosure (why you are listed, what we publish, our basis) | `/data-attribution` | Done |
| GDPR Art. 21 objection and delisting route | `directory_listing` category on the public `/legal/report` form, plus `support@inklee.app` | Done |
| Triage rules for that category | `docs/dsa-moderation-procedure.md` §2a | Done: removals granted without a reason, set `removed` not deleted so re-seeding cannot reintroduce |
| Provenance carried to the published table | migration `0111` + `markConvertedCore` | **Written, NOT APPLIED** |
| Q17 Brave title dropped at terminal status | `DROPPED_BRAVE_TITLE` + `0111` backfill | **Written, NOT APPLIED** |

**Licence copies: done 2026-07-26.** The CDLA-Permissive-2.0 and Apache-2.0 texts are
vendored verbatim at `apps/web/content/licenses/` and rendered in full on
`/data-attribution`. Both were **downloaded from the canonical source, never transcribed**:

| File | Source | sha256 |
|---|---|---|
| `apache-2.0.txt` | `https://www.apache.org/licenses/LICENSE-2.0.txt` | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `cdla-permissive-2.0.txt` | SPDX `license-list-data/text/CDLA-Permissive-2.0.txt` | `4531a67d443284d93ffed0803df5b10634aff21c3d77e381f2d48af01d875868` |

Unit tests assert both are present and whole (the Apache appendix and CDLA §5.4 are
checked, so a truncated file fails). CDLA §2.1 turned out to require this independently of
Apache-2.0 §4(a): it obliges a Data Recipient sharing Data to make the agreement text
available with it.

**ODbL is deliberately not vendored** (counsel, 2026-07-26). For a Produced Work the
obligation is attribution plus indicating the licence, which the credit line and its link
discharge. A test pins that position so it is not added by reflex.

**Publication is postponed, and not for legal reasons.** The founder held the public shell
on 2026-07-26 pending a map future-scope pass, because future features may change go-live
decisions. Nothing in this note is waiting on anything: the licensing position is settled,
the attribution and GDPR surfaces are built, and they stay dark behind
`NEXT_PUBLIC_PUBLIC_MAP` until the shell ships. Re-run the §3 verification before that flip.

**One thing is deliberately not done.**

1. **Migration `0111` has not been applied.** It is a schema change plus two backfills
   against ~71k live rows, and the house rule is that migrations reach production
   deliberately and before the code that depends on them. Nothing in the shipped code path
   requires the columns yet.

**Q19 could not be implemented**: the artist-suggestion slice does not exist
(`artist_suggestion` appears only as an enum value and a label). The answer's requirement
is recorded against that future slice in `docs/product/inklee-2-open-questions.md` Q19:
accept the optional Google Maps link, use it during review, null it at terminal status,
never derive facts from the linked page.

---

*Cross-references: `docs/counsel-note-public-map-data-licensing-2026-07-22.md` (§7.1, §7.3,
§7.8) and `docs/product/inklee-2-open-questions.md` (Q20). All three are kept in sync;
update them together when counsel responds.*
