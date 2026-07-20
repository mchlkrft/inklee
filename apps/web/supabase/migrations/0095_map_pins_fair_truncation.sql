-- 0095: make the pin cap truncate fairly
--
-- 0094 fixed WHICH studio represents a grid cell but not what happens when
-- there are more populated cells than the cap allows: the LIMIT still cut
-- in whatever order the planner emitted, so the detail pass over Germany
-- returned 3,000 pins covering only longitudes 6.0-11.8 and Berlin blinked
-- out whenever the finer pass landed.
--
-- Ordering before the cut makes the truncation spatially uniform: claimed
-- studios first (they are never dropped), then a hash of the cell, which is
-- deterministic - the same viewport always yields the same sample, so pins
-- do not reshuffle between requests.

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
        order by (c.claim_status = 'claimed') desc, c.id
      ) as rn
    from candidates c
  )
  select
    r.id, r.name, r.category, r.display_latitude, r.display_longitude,
    r.city, r.country, r.claim_status, r.moderation_status
  from ranked r
  where r.rn = 1
  -- Claimed pages survive any cap; everything else is sampled evenly by a
  -- stable hash of its cell rather than clipped to one corner of the map.
  order by
    (r.claim_status = 'claimed') desc,
    md5(r.gx::text || ':' || r.gy::text)
  limit greatest(1, least(p_limit, 5000));
$$;

revoke all on function map_pins_in_view(
  double precision, double precision, double precision, double precision,
  double precision, int
) from public, anon, authenticated;
