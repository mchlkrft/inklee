# Counsel note — public map: Overture / Foursquare / OSM data licensing (Q20)

**Prepared:** 2026-07-22 · **For:** legal counsel (Estonia/EU, IP + open-data licensing)
**Companion docs:** `docs/product/inklee-2-open-questions.md` (Q20, Q2, Q14) · `docs/product/inklee-2-map-redesign-audit-and-plan.md` (§ external dependencies) · `docs/product/inklee-2-map-seeding-tool.md` (the seeding source stack)
**Triggered by:** founder decision 2026-07-22 to take the tattoo map **public** as an experimental, community-evolving surface (reverses locked Q3).
**Status:** **open — drafted for counsel.** This blocks nothing on the logged-in map, which is unaffected. It must close **before any seeded studio data is published on a public, non-authenticated page.**

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
| **OpenStreetMap-derived rows** (the map also draws studio facts from OSM) | **ODbL 1.0** | **"© OpenStreetMap contributors"** attribution; if a **Derived Database** is **publicly used**, offer it under ODbL. | **Yes (conditionally)** |

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

*Cross-reference: `docs/product/inklee-2-open-questions.md` Q20 points here. Keep
this note and that entry in sync; update both when counsel responds.*
