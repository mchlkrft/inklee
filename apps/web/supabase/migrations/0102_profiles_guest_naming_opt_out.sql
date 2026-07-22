-- 0102: guest-artist naming opt-out (map redesign; founder decision 2026-07-22
-- updating Q16).
--
-- The guest-artist timeline on a studio's map page previously anonymized every
-- current/upcoming entry unconditionally and named PAST entries only for
-- passport_public artists. The founder decision flips the default: guest
-- artists are NAMED by default across current/upcoming/past, and an artist
-- opts OUT to stay "A guest artist". This is decoupled from passport_public,
-- which keeps its own purpose (the completed-stays passport shown to studios
-- reviewing a request). Artist privacy still always caps the studio's
-- show_guest_timeline: an opt-out anonymizes the artist on every studio's
-- timeline.
--
-- Default false = named, so existing guest entries become named on deploy. The
-- map is logged-in-only (Q3), and the opt-out is a single toggle on
-- /settings/map, surfaced clearly (the founder's prominence note).
--
-- Per the 0074 column-privilege rule, the authenticated UPDATE grant ships in
-- this migration (the /settings/map action writes via the user client) and is
-- mirrored in apps/web/supabase/seed.sql so local verification matches prod.

alter table public.profiles
  add column if not exists guest_naming_opt_out boolean not null default false;

grant update (guest_naming_opt_out) on public.profiles to authenticated;
