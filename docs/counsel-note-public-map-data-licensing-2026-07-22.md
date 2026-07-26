# Counsel note — public map: Overture / Foursquare / OSM data licensing (Q20)

**Prepared:** 2026-07-22 · **For:** legal counsel (Estonia/EU, IP + open-data licensing)
**Companion docs:** `docs/product/inklee-2-open-questions.md` (Q20, Q2, Q14) · `docs/product/inklee-2-map-redesign-audit-and-plan.md` (§ external dependencies) · `docs/product/inklee-2-map-seeding-tool.md` (the seeding source stack)
**Triggered by:** founder decision 2026-07-22 to take the tattoo map **public** as an experimental, community-evolving surface (reverses locked Q3).
**Status:** **ANSWERED — attribution only, no share-alike. Premise corrected and answer
re-confirmed 2026-07-26.**

The 2026-07-24 answer reached attribution-only on the ground that there are **no
OSM-derived studio rows**. That ground was false: the verification sweep §7.1 itself
required before the flip found **3,582 approved live studios (5.0% of the directory)
sourced solely from a direct OpenStreetMap Overpass lane** added by migration `0088`.
Counsel was given the corrected facts and **re-confirmed the same conclusion on 2026-07-26**:
each public studio page is a Produced Work, share-alike does not attach, the obligation is
attribution. No coverage is lost.

**The only substantive change is the credit string, which now restores OpenStreetMap** —
see `docs/counsel-note-public-map-osm-correction-2026-07-26.md` §8 for the approved wording
and the standing re-verification instruction. §7.2, §7.4, §7.6 and §7.7 are unaffected
throughout; §7.3's placement finding and Apache-2.0 obligations also stand.

*Original status: open — drafted for counsel. This blocks nothing on the logged-in
map, which is unaffected. It must close before any seeded studio data is published
on a public, non-authenticated page.*

*Original status: open — drafted for counsel. This blocks nothing on the logged-in
map, which is unaffected. It must close before any seeded studio data is published
on a public, non-authenticated page.*

> This note is written by the engineering team, not by a lawyer. It states facts
> about where the data comes from and what the licenses appear to require, and it
> asks the questions only counsel can close. Nothing in it is a legal conclusion.

---

## 0. Why you are receiving this

Until now the tattoo map has been **logged-in only** (Q3, resolved 2026-07-19:
noindex, out of the sitemap, artist-facing only). Under that posture the seeded
directory data was cleared for internal, authenticated use.

On **2026-07-22** the founder reversed Q3: the map will expose a **public**
capability layer (same shared map core, a public shell added last). The moment a
public visitor can load a studio's **name and location** without signing in, the
question changes from "internal use" to "publication/redistribution," and the
open-data licenses that ride on the seeded data attach obligations we must meet
**before** we publish.

We are **not** asking whether to go public — that is decided. We are asking what
publishing the seeded name+coordinate data **obliges us to attribute, disclose,
and possibly share back**, and where the one genuine risk edge is.

---

## 1. What data is at issue (facts)

The directory is built from two automated open-data sources plus admin-reviewed
manual discovery (`inklee-2-map-seeding-tool.md`). On a **public page**, the
fields that originate outside Inklee are narrow:

- **Studio `name`** (business name).
- **Coordinates** (`latitude`/`longitude`; the public map shows a display point,
  approximate for privacy-set studios).
- **`city` / `country`** (derived/geocoded).

Everything else a public page would show is **Inklee-originated or
artist-supplied**: the "styles represented" aggregation, house rules, welcome
packs, guest-artist timelines, claim status, and any studio-authored copy. We do
**not** copy source **descriptions, photos, ratings, opening hours, or
proprietary category taxonomies** onto public pages.

Provenance is stored per row (source + source id), so every seeded fact is
traceable to its origin for attribution and takedown.

## 2. The licenses on the sources

| Source | License | Core obligation on publication | Share-alike? |
|---|---|---|---|
| **Overture Maps** (Places theme, base) | **CDLA-Permissive-2.0** | Preserve the license text / disclaimer when the **Data** is shared; attribution requested. | **No** |
| **Foursquare-sourced rows** within Overture Places | **Apache-2.0** | Preserve attribution / NOTICE when redistributing. | **No** |
| **OpenStreetMap-derived rows** — the 2026-07-24 correction said "this row does not exist". **RE-CORRECTED 2026-07-26: it does.** 3,582 approved studios come solely from a direct Overpass extraction (`source_type='osm'`, added by migration `0088`). OSM additionally covers the basemap tiles, which are separately credited in the tile pill. | **ODbL 1.0** (studio rows) + tiles | Attribution; share-alike question re-put to counsel. | **Under re-check** |

Two of the three (CDLA-Permissive-2.0, Apache-2.0) are permissive with **no**
share-alike. The load-bearing one is **ODbL**, because the map's studio facts are
partly OSM-derived and ODbL's share-alike can bite when a **derived database** is
made **publicly available** rather than kept internal.

## 3. The facts-vs-database distinction (why we think the risk is contained)

Copyright and database rights attach to the **collection/database**, not to
individual **facts**. A single studio's **name** and **point location** are
facts; reproducing one studio's name+point is not reproducing the source
database. The public pages display facts, one studio at a time, inside an
Inklee-built directory whose selection, review, corrections, enrichment
(styles/house-rules), and ongoing artist edits make it **materially different**
from any source database (independently, the seed is measured ~17% materially
wrong before our review, which is why we review).

Our working reading, for counsel to confirm or correct:

- **Each public page is a "Produced Work" (ODbL) / a use of Data (CDLA-2.0)**,
  not a redistribution of the source **Database**. On that reading the obligation
  is **attribution + license notice**, not share-alike.
- The **CDLA-2.0 and Apache-2.0** obligations are satisfied by a persistent
  **attribution line + license links**; neither imposes share-alike.
- The **ODbL** obligation is the one to pressure-test (§5, Q2).

## 4. Proposed position (engineering draft, for counsel to ratify or correct)

1. **Persistent, visible data attribution on every public map/studio page**,
   separate from the existing basemap-tile credit. The map canvas already renders
   a tile-attribution pill (`MapLibre | © CARTO © OpenStreetMap contributors`);
   the **studio-data** attribution is a distinct requirement and will read,
   subject to counsel's exact wording:
   > Studio data © OpenStreetMap contributors (ODbL), Overture Maps Foundation
   > (CDLA-Permissive-2.0), and Foursquare (Apache-2.0).
   with links to each license.
2. **Publish only facts** (name, coordinates, city/country). No source
   descriptions, photos, hours, or verbatim category taxonomies on public pages.
3. **Do not republish the source dataset.** No bulk export, no "download the
   directory," no API that re-emits the collection. Public pages are
   per-studio Produced Works.
4. **Preserve per-row provenance** (already implemented) for attribution and
   takedown.
5. **Experimental/community framing changes nothing about the licenses.** The
   public banner will say the directory is experimental and community-evolving;
   that lowers the product-polish bar, not the legal one. Stated here so it is on
   the record that we are not treating "experimental" as a license waiver.

## 5. Residual questions only counsel can close

1. **ODbL share-alike (the load-bearing question).** Is Inklee's **public,
   searchable** studio directory, insofar as it incorporates OSM-derived facts, a
   **"Derived Database"** that is **"publicly used"** under ODbL 1.0 — which would
   oblige us to **offer that derived database under ODbL** — or is each public
   page a **"Produced Work"** needing only attribution? A private/authed directory
   sits comfortably on the Produced-Work side; a public one is closer to the line.
   This is the one answer that could change the architecture (e.g. force an
   ODbL-licensed data export or push us to source those specific facts
   differently).
2. **Facts sufficiency.** Do you agree that publishing a single studio's
   name+coordinates is publication of **facts** (not the database), so
   CDLA-2.0/Apache-2.0 impose attribution but not redistribution controls?
3. **Attribution wording + placement.** Does one combined credit line with
   license links, persistently visible on the public map and each public studio
   page, satisfy all three licenses simultaneously? Is a footer link acceptable
   or must it be adjacent to the data?
4. **Foursquare specifics.** Anything beyond Apache-2.0 to observe for the
   Foursquare-sourced rows (trademark use, "no endorsement implied," any
   Foursquare-specific attribution string)?
5. **Interaction with Q2 / Q14.** Q2 (the whole seeding posture) and Q14 (the DSA
   statement-of-reasons obligations for listing businesses that did not ask to be
   listed) are adjacent. Confirm whether the public-data license read and the DSA
   read should be delivered together, since both gate the same public launch.

## 6. What we will do once you answer

- If **attribution-only** clears it: add the data-attribution component to the
  public shell (distinct from the tile credit), wire the license links, and
  publish. The engineering cost is small; the wording is yours.
- If **ODbL share-alike is triggered** for the public directory: we hold the
  public launch of OSM-derived rows and bring you an options memo (ODbL-license
  the derived export; re-source those facts from a permissive origin; or keep
  OSM-derived rows authed-only while publishing only Overture/Foursquare-sourced
  rows). We do **not** publish on the optimistic reading without your sign-off.

---

## 7. Answers (2026-07-24)

> Not legal advice. Positions below are for ratification; each states its basis so
> the review is a confirmation rather than a fresh analysis.

### 7.1 The load-bearing question is moot — there are no OSM-derived studio rows

> 🚨 **PREMISE SUPERSEDED 2026-07-26; CONCLUSION UNCHANGED.** The reasoning below is false
> for the shipped system, and the verification condition this section itself set ("re-check
> before the flip") is what caught it. Ground 2 (Overture Places contains no OSM data)
> stands; **ground 1 does not** — OSM reaches the directory through a separate direct
> Overpass extraction, not through Overture. 3,582 approved studios (5.0%) are OSM-only, so
> the *Substantial* fallback below is also unavailable. Counsel was re-asked on the
> corrected facts and **re-confirmed attribution-only** on 2026-07-26, so the outcome of
> this section survives even though its route to it did not. Text kept verbatim for the
> record. **Correction, numbers and confirmed answer:**
> `docs/counsel-note-public-map-osm-correction-2026-07-26.md`.

§2 of this note listed OSM-derived rows as a third source. **That is incorrect**, on
two independent grounds:

1. **The seeding stack excludes OSM.** `inklee-2-map-seeding-tool.md` lists
   "OpenStreetMap as primary source" under *Excluded from v1*, and gives the reason
   ("ODbL share-alike obligations sit badly under a commercial directory that mixes
   sources"). The actual `source_type` set is `overture_maps`, `brave_search`,
   `manual_instagram`, `artist_suggestion`.
2. **Overture's Places theme contains no OSM data.** Per Overture's own attribution
   documentation, the Places theme is CDLA-Permissive-2.0 (Apache-2.0 for
   Foursquare-sourced rows) and "contains no OpenStreetMap data and carries none of
   the share-alike obligations of the ODbL." OSM sits in Overture's
   base/transportation/buildings/divisions themes, which are not used for studio facts.

**Consequence:** ODbL share-alike is **not triggered**. Both applicable licences
(CDLA-Permissive-2.0, Apache-2.0) are permissive with no share-alike. The §6
contingency (hold the launch, options memo, ODbL-licensed export) is **not needed**.

OSM remains relevant only to the **basemap tiles**, which are a rendered Produced
Work and are already credited by the existing tile pill
(`MapLibre | © CARTO © OpenStreetMap contributors`). No change required there.

*Belt-and-braces:* even if a small number of OSM rows were later found, the OSMF
**Substantial guideline** treats extractions of fewer than 100 features as not
Substantial under ODbL, so share-alike would still not bite at seeding scale.

**Verification condition:** confirm no seeding path ever wrote an OSM-sourced row —
`map_seed_candidates.source_type` should contain only the four values above. A repo
and docs sweep on 2026-07-24 found no OSM source type outside the basemap tiles and
this note. Re-check before the flip.

### 7.2 Facts sufficiency (§5 Q2) — agreed, and no longer load-bearing

A single studio's name, display point, and derived city/country are **facts**; each
public page is a Produced Work / a use of Data, not redistribution of a source
Database. With ODbL out of scope, CDLA-2.0 and Apache-2.0 impose **attribution and
licence preservation only**, with no redistribution control. The §4 commitments (no
bulk export, no "download the directory", no API re-emitting the collection) keep
Inklee clearly on the use-of-Data side and should be **retained as standing policy**.

### 7.3 Attribution wording and placement (§5 Q3) — approved with a corrected string

> 🚨 **THE CREDIT STRING BELOW IS SUPERSEDED — DO NOT IMPLEMENT IT.** It removes OSM from
> the studio-data credit on the §7.1 premise, which is false; shipping it would publish
> 3,582 ODbL-sourced rows with no ODbL attribution. **Implement the corrected string from
> `docs/counsel-note-public-map-osm-correction-2026-07-26.md` §8 instead** (approved
> 2026-07-26, OpenStreetMap restored):
>
> > Studio data © OpenStreetMap contributors (ODbL), Overture Maps Foundation
> > (CDLA-Permissive-2.0) and Foursquare Labs, Inc. (Apache-2.0), modified by Inklee.
> > [Licences and notices]
>
> The **placement** finding (persistent credit + linked `/data-attribution` page, adjacency
> not required) and the **Apache-2.0 requirements** (NOTICE preservation, licence copy,
> statement of changes with dates) are unaffected and stand as written below.

Remove OSM from the **studio-data** credit (it stays in the tile credit). Apache-2.0
is the stricter of the two licences and requires: (a) preserving the NOTICE
attribution, at minimum `Copyright 2024 Foursquare Labs, Inc. All rights reserved.`;
(b) including a copy of the licence; and (c) **stating that files were changed, with
dates of change** — this applies, because admin review edits rows.

Approved studio-data credit line:

> Studio data © Overture Maps Foundation (CDLA-Permissive-2.0) and Foursquare Labs,
> Inc. (Apache-2.0), modified by Inklee. [Licences and notices]

**Placement:** a persistently visible credit on the public map and each public studio
page, linking to a `/data-attribution` page that carries the full CDLA-2.0 and
Apache-2.0 licence texts, the Foursquare NOTICE, and the modification statement
("modified by Inklee, ongoing since <date>"). Neither licence requires the credit to
sit adjacent to the data — adjacency is an ODbL-culture expectation, which no longer
applies here. The footer-plus-linked-page pattern satisfies both licences.

### 7.4 Foursquare specifics (§5 Q4) — nothing beyond Apache-2.0, minus trademarks

Apache-2.0 §6 grants **no trademark rights**. Do not use the Foursquare name or logo
as a badge, endorsement, or partnership signal; a plain copyright attribution string
is both permitted and sufficient. The NOTICE preservation and change statement in
§7.3 discharge the remaining obligations. No Foursquare-specific attribution string
beyond the NOTICE copyright line is required.

### 7.5 Interaction with Q2 / Q14 (§5 Q5) — deliver together

Confirmed: deliver the licensing read with the DSA/GDPR read. They gate the same
flip, and the DSA notice-and-action route plus the GDPR objection/delisting route are
the takedown surface this licensing position assumes exists. Extend
`docs/dsa-moderation-procedure.md` scope beyond `inklee.app` / public artist pages /
booking uploads to cover **directory entries, studio pages, shop entries, and
temporary signals**. Q14 answers are recorded in `inklee-2-open-questions.md`.

### 7.6 Remaining blockers are engineering, not legal

1. **`map_locations` has no attribution/provenance column** — the Overture/CDLA
   string lives only on `map_seed_candidates`. Per-row provenance must carry over to
   the published table; it is what makes takedown and the change statement honest.
2. **No data-source attribution UI exists** — only the basemap tile pill. The
   §7.3 component must ship before any seeded row is public.

Until both land, claimed-profile gate item 7 ("public licensing attribution active")
cannot be satisfied and the flip stays closed.

### 7.7 Additional requirement not in the original five: GDPR for seeded studios

Seeded studios that are **sole traders trading under a personal name** are personal
data, so publishing them needs, independently of any licence:

- a documented **Art. 6(1)(f)** legitimate-interest basis and balancing note in the
  Art. 30 record;
- an **Art. 14** disclosure (the data was not obtained from the data subject). The
  Art. 14(5)(b) disproportionate-effort exemption is available for open-data seeding
  **only if** the information is published instead — a public transparency page
  discharges this;
- a working **Art. 21 objection / delisting** route.

Practically this is one page — "why you are listed, where the data came from, how to
correct or remove it" — plus a delist action. **That page can be the same
`/data-attribution` page as §7.3.** This is a launch condition for the public map.

### 7.8 Summary

| § | Question | Answer |
|---|---|---|
| 7.1 | ODbL share-alike | **Not triggered** — but not for the reason given here. 3,582 approved studios (5.0%) *are* OSM-only; counsel re-confirmed the Produced Work reading on the corrected facts, 2026-07-26 |
| 7.2 | Facts sufficiency | Agreed; attribution only, keep no-bulk-export policy |
| 7.3 | Attribution wording/placement | Placement + Apache-2.0 findings stand; **credit string superseded 2026-07-26** — use the corrected one with OSM restored |
| 7.4 | Foursquare specifics | Apache-2.0 only; no trademark/endorsement use |
| 7.5 | Deliver with Q2/Q14 | Yes; extend DSA procedure scope to the directory |
| 7.6 | Blockers | Two build gaps (provenance column, attribution UI) |
| 7.7 | Added | GDPR Art. 6(1)(f)/14/21 for sole-trader studios |

**Basis:** [Overture attribution docs](https://docs.overturemaps.org/attribution/) ·
[Overture Places guide](https://docs.overturemaps.org/guides/places/) ·
[OSMF Substantial guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline) ·
[OSMF licence FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ) ·
Apache-2.0 §§4, 6 · CDLA-Permissive-2.0 · GDPR Arts. 6, 14, 21.

---

*Cross-reference: `docs/product/inklee-2-open-questions.md` Q20 points here. Keep
this note and that entry in sync; update both when counsel responds.*
