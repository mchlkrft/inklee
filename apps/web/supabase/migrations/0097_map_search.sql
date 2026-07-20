-- 0097: typo- and accent-tolerant studio search for the map
--
-- Artists need a Google-Maps-grade search box: autosuggest as they type,
-- accent-insensitive ("malaga" finds "Málaga"), and typo-tolerant
-- ("estudo" finds "Estudio", "berln" finds "Berlin"). Trigram similarity
-- (pg_trgm) gives the fuzzy match; unaccent normalizes diacritics; a GIN
-- trigram index keeps it fast across 40k+ rows.
--
-- unaccent() is not marked immutable (its dictionary can in theory change),
-- so it cannot be used directly in an index expression. The standard
-- Supabase workaround is a thin wrapper declared immutable - safe because
-- the dictionary is effectively static.
--
-- Applied to prod 2026-07-20; the extensions live in the `extensions`
-- schema and the indexes were built CONCURRENTLY (non-concurrent here so a
-- fresh/local apply stays inside one transaction).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(text)
  returns text
  language sql
  immutable
  parallel safe
  strict
as $func$
  select extensions.unaccent('extensions.unaccent', $1)
$func$;

create index if not exists idx_map_locations_name_trgm
  on public.map_locations
  using gin (public.immutable_unaccent(lower(name)) extensions.gin_trgm_ops);

create index if not exists idx_map_locations_city_trgm
  on public.map_locations
  using gin (public.immutable_unaccent(lower(coalesce(city, ''))) extensions.gin_trgm_ops);

-- Ranks: name prefix, then name substring, then city substring, then the
-- best of similarity / word_similarity (typo tolerance), claimed first,
-- shorter names first. Approved rows only. Service-role only, like the
-- other map RPCs (the /api/map/search route calls it with the service
-- client behind the artist auth gate).
create or replace function public.map_search(p_q text, p_limit int default 8)
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
  language plpgsql
  stable
  security invoker
  set search_path = public, extensions
as $fn$
declare
  needle text := public.immutable_unaccent(lower(btrim(coalesce(p_q, ''))));
begin
  if length(needle) < 2 then
    return;
  end if;
  -- A touch below the 0.3 default so single-typo queries still match.
  perform set_config('pg_trgm.similarity_threshold', '0.25', true);
  return query
  select
    l.id, l.name, l.category,
    l.display_latitude, l.display_longitude,
    l.city, l.country, l.claim_status, l.moderation_status
  from public.map_locations l
  where l.moderation_status = 'approved'
    and (
      public.immutable_unaccent(lower(l.name)) like '%' || needle || '%'
      or public.immutable_unaccent(lower(coalesce(l.city, ''))) like '%' || needle || '%'
      or (length(needle) >= 3 and public.immutable_unaccent(lower(l.name)) % needle)
    )
  order by
    (public.immutable_unaccent(lower(l.name)) like needle || '%') desc,
    (public.immutable_unaccent(lower(l.name)) like '%' || needle || '%') desc,
    (public.immutable_unaccent(lower(coalesce(l.city, ''))) like '%' || needle || '%') desc,
    greatest(
      similarity(public.immutable_unaccent(lower(l.name)), needle),
      word_similarity(needle, public.immutable_unaccent(lower(l.name)))
    ) desc,
    (l.claim_status = 'claimed') desc,
    length(l.name)
  limit greatest(1, least(coalesce(p_limit, 8), 20));
end;
$fn$;

revoke all on function public.map_search(text, int) from public, anon, authenticated;
