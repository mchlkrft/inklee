-- 0111: carry per-row data provenance onto map_locations.
--
-- Why: the public tattoo map must credit the open-data source behind each
-- seeded studio, and must be able to act on a removal request for a specific
-- source. Provenance exists today only on map_seed_candidates, which is the
-- lead queue, not the published table. Counsel note
-- docs/counsel-note-public-map-data-licensing-2026-07-22.md §7.6 lists this as
-- a blocker on publishing any seeded row; the corrected licence position is in
-- docs/counsel-note-public-map-osm-correction-2026-07-26.md.
--
-- Shape: two nullable columns, no constraint on existing rows, backfilled from
-- the candidate that converted into each location. Null means "not derived from
-- an open-data source" (admin-created, owner-created, claim-converted) and
-- renders no per-row credit.
--
-- Note on the values: 'osm' is a real source. Migration 0088 added it to
-- map_seed_candidates.source_type and a direct OpenStreetMap Overpass lane has
-- produced ~12.6k candidates and ~3.6k converted rows. Do not "simplify" this
-- list back to Overture-only.

alter table map_locations
  add column if not exists data_source text
    check (data_source is null or data_source in (
      'overture_maps', 'osm', 'brave_search',
      'manual_instagram', 'artist_suggestion')),
  add column if not exists data_attribution text;

comment on column map_locations.data_source is
  'Open-data source this row was seeded from, mirrored from map_seed_candidates.source_type at conversion. Null for admin/owner-created rows.';
comment on column map_locations.data_attribution is
  'Human-readable credit for data_source, e.g. "OpenStreetMap contributors (ODbL)". Rendered per row where a source-specific credit is needed; the page-level credit lives in packages/shared/src/map-attribution.ts.';

-- Backfill from the converting candidate. Where several candidates converted
-- into the same location (dedupe merges), prefer the earliest, which is the one
-- that actually created the row.
with first_candidate as (
  select distinct on (c.converted_location_id)
         c.converted_location_id as location_id,
         c.source_type,
         c.attribution
  from map_seed_candidates c
  where c.converted_location_id is not null
  order by c.converted_location_id, c.created_at asc
)
update map_locations l
   set data_source      = f.source_type,
       data_attribution = f.attribution
  from first_candidate f
 where l.id = f.location_id
   and l.data_source is null;

-- Partial index: the only query that needs this is "which rows carry which
-- source", for the attribution surface and for source-scoped takedowns.
create index if not exists map_locations_data_source_idx
  on map_locations (data_source)
  where data_source is not null;

-- No RLS change: map_locations is service-role only (zero client policies) and
-- these columns are read through the same shapers as every other field.

-- ---------------------------------------------------------------------------
-- Q17 (answered 2026-07-24): a reviewed Brave lead keeps its URL, not Brave's
-- result title. The title is stored in map_seed_candidates.name, which is NOT
-- NULL, so the conservative path is to overwrite it once the lead reaches a
-- terminal status. The title stays re-derivable by opening source_url, which is
-- a pointer rather than stored content. Forward behaviour lives in
-- markConvertedCore / the review writer in lib/server/map-seeding.ts
-- (DROPPED_BRAVE_TITLE); this backfills the leads already reviewed.
-- Converted rows are unaffected in substance: the studio name they produced
-- lives on in map_locations as an admin-reviewed Inklee record.

update map_seed_candidates
   set name = '(title dropped after review)',
       updated_at = now()
 where source_type = 'brave_search'
   and status in ('converted', 'rejected')
   and name <> '(title dropped after review)';
