-- 0090: seed contact enrichment (founder decision 2026-07-19)
--
-- Structured open-data fields (OSM ODbL / Overture CDLA, attribution carried
-- on the candidates) flow through to public map entries: full address was
-- already there, phone and opening hours become first-class columns.
-- seed_metadata / extra_metadata are the FUTURE-PROOFING envelope: any new
-- field the seeding pipeline learns to extract rides these jsonb containers
-- end to end (extractor -> discovery payload -> candidate -> map entry)
-- without another migration; promotion to a real column happens only when a
-- field becomes load-bearing. Email deliberately lives in the metadata
-- envelope, NOT in a public column (spam-harvesting surface).

alter table map_locations
  add column if not exists phone text,
  add column if not exists opening_hours text,
  add column if not exists seed_metadata jsonb;

alter table map_seed_candidates
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists phone text,
  add column if not exists opening_hours text,
  add column if not exists extra_metadata jsonb;

alter table map_coverage_discoveries
  add column if not exists opening_hours text;
