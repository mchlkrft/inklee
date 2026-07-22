-- 0101: viewport pins v2 - activate the spatial index (map redesign Slice 2)
--
-- v1 (map_pins_in_view / map_pins_in_view_count, 0094 + 0095) filters the RAW
-- display_latitude / display_longitude columns with BETWEEN. Postgres cannot
-- serve a plain range predicate from the GiST-on-geography index that 0075
-- built for exactly this (map_locations_display_geo_idx), and there is no btree
-- on those columns, so every pan sequentially scans the ~71k approved rows -
-- and the count RPC doubles that work. This is the map's hottest path.
--
-- These v2 functions add an `&&` bbox predicate whose LEFT operand matches the
-- indexed expression from 0075 VERBATIM, so the planner uses the GiST to prune.
-- The original BETWEEN stays as an exact filter, which keeps v2 byte-identical
-- to v1: the geography bbox `&&` is a superset of the exact lon/lat box (it can
-- only over-include at the spheroid-padded edge, never under-include), and the
-- BETWEEN narrows it back to precisely v1's set. Grid sampling, the claimed-win
-- rule, and the deterministic fair truncation are copied unchanged from 0095.
--
-- ADDITIVE + BACKWARD-COMPATIBLE. v1 is untouched. The API calls v2 only when
-- the server flag MAP_PINS_V2 is on (default off, fail-closed to v1). No data
-- change, no RLS change, no column change.
--
-- Staging validation before flipping MAP_PINS_V2 on in production:
--   1. `explain (analyze, buffers) select * from map_pins_in_view_v2(
--         <west>, <south>, <east>, <north>, 4)` shows a Bitmap Index Scan /
--      Index Scan on map_locations_display_geo_idx (v1 shows a Seq Scan on
--      map_locations). Repeat for map_pins_in_view_count_v2.
--   2. Parity: for a spread of bboxes and zooms - including a viewport the
--      client wrapped to the full -180/180 range - assert the v2 pin id set
--      equals the v1 pin id set and the v2 count equals the v1 count.
--
-- Rollback: keep MAP_PINS_V2 off (instant), or
--   `drop function map_pins_in_view_v2(double precision, double precision,
--      double precision, double precision, double precision, int);`
--   `drop function map_pins_in_view_count_v2(double precision, double precision,
--      double precision, double precision);`
-- v1 is never modified, so there is nothing to restore.

create or replace function map_pins_in_view_v2(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_zoom double precision,
  p_limit int default 3000
)
returns table (
  id uuid,
  name text,
  category text,
  display_latitude double precision,
  display_longitude double precision,
  city text,
  country text,
  claim_status text,
  moderation_status text
)
language sql
stable
security invoker
as $$
  with grid as (
    select greatest(360.0 / power(2, greatest(coalesce(p_zoom, 3), 0) + 5), 0.0002)
      as size
  ),
  candidates as (
    select
      l.id, l.name, l.category, l.display_latitude, l.display_longitude,
      l.city, l.country, l.claim_status, l.moderation_status,
      floor(l.display_longitude / g.size) as gx,
      floor(l.display_latitude / g.size) as gy
    from map_locations l, grid g
    where l.moderation_status = 'approved'
      -- Index prune: this expression matches map_locations_display_geo_idx
      -- (0075) verbatim so the planner can use the GiST index.
      and extensions.st_setsrid(
            extensions.st_makepoint(l.display_longitude, l.display_latitude), 4326
          )::extensions.geography
          OPERATOR(extensions.&&) extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::extensions.geography
      -- Exact filter: keeps v2 byte-identical to v1's BETWEEN result.
      and l.display_latitude between p_south and p_north
      and l.display_longitude between p_west and p_east
  ),
  ranked as (
    select c.*,
      row_number() over (
        partition by c.gx, c.gy
        order by (c.claim_status = 'claimed') desc, c.id
      ) as rn
    from candidates c
  )
  select
    r.id, r.name, r.category, r.display_latitude, r.display_longitude,
    r.city, r.country, r.claim_status, r.moderation_status
  from ranked r
  where r.rn = 1
  order by
    (r.claim_status = 'claimed') desc,
    md5(r.gx::text || ':' || r.gy::text)
  limit greatest(1, least(p_limit, 5000));
$$;

create or replace function map_pins_in_view_count_v2(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision
)
returns bigint
language sql
stable
security invoker
as $$
  select count(*)
  from map_locations l
  where l.moderation_status = 'approved'
    and extensions.st_setsrid(
          extensions.st_makepoint(l.display_longitude, l.display_latitude), 4326
        )::extensions.geography
        OPERATOR(extensions.&&) extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::extensions.geography
    and l.display_latitude between p_south and p_north
    and l.display_longitude between p_west and p_east;
$$;

revoke all on function map_pins_in_view_v2(
  double precision, double precision, double precision, double precision,
  double precision, int
) from public, anon, authenticated;
revoke all on function map_pins_in_view_count_v2(
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;
