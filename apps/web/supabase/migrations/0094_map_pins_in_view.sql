-- 0094: spatially fair viewport pins
--
-- The pins API took the first 500 rows in the bbox with no ordering, so
-- Postgres returned them in index order: at country zoom that meant the 500
-- SOUTHERNMOST studios and an empty northern half of Germany. Pins also
-- appeared to jump or vanish while panning, because a different arbitrary
-- 500 came back each time.
--
-- This returns one representative studio per grid cell instead. The grid is
-- anchored to absolute coordinates (not to the viewport), so panning does
-- not reshuffle which studio represents a cell - pins stay put the way they
-- do on a real map. Cell size halves with each zoom level, so zooming in
-- reveals more until, in a city, every studio is its own cell.
--
-- Claimed studios win their cell: the ones with owners are the ones worth
-- showing when something must be left out.

create or replace function map_pins_in_view(
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
    -- ~19 km cells at country zoom, ~300 m in a city; floored so the
    -- deepest zooms still bucket sanely.
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
      and l.display_latitude between p_south and p_north
      and l.display_longitude between p_west and p_east
  ),
  ranked as (
    select c.*,
      row_number() over (
        partition by c.gx, c.gy
        -- Claimed first, then a stable tiebreak so the same studio keeps
        -- representing the cell across requests.
        order by (c.claim_status = 'claimed') desc, c.id
      ) as rn
    from candidates c
  )
  select
    r.id, r.name, r.category, r.display_latitude, r.display_longitude,
    r.city, r.country, r.claim_status, r.moderation_status
  from ranked r
  where r.rn = 1
  limit greatest(1, least(p_limit, 5000));
$$;

-- Total approved studios in the viewport, so the UI can say how many of
-- them the sample represents instead of a bare "capped" flag.
create or replace function map_pins_in_view_count(
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
  from map_locations
  where moderation_status = 'approved'
    and display_latitude between p_south and p_north
    and display_longitude between p_west and p_east;
$$;

revoke all on function map_pins_in_view(
  double precision, double precision, double precision, double precision,
  double precision, int
) from public, anon, authenticated;
revoke all on function map_pins_in_view_count(
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;
