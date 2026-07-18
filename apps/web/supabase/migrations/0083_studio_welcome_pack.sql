-- 0083: Inklee 2.0 Phase 4 - studio welcome pack
--
-- Saved, reusable, structured content for confirmed guest artists (build
-- plan Phase 4 extension, 2026-07-18): access, wifi, emergency contact,
-- nearby supply shops, promotion, local notes, plus a toggle to include the
-- studio's house rules. Interaction plane only: the pack renders on the
-- artist's request page ONLY while a confirmed or active stay exists; that
-- gate lives in the server core, so this table carries owner-only SELECT
-- (the artist never reads it through PostgREST directly). No notification
-- until Q9 is decided; no attachments until the private bucket exists.

create table if not exists studio_welcome_packs (
  id                  uuid primary key default gen_random_uuid(),
  studio_profile_id   uuid not null unique references studio_profiles(id) on delete cascade,
  access_details      text,
  wifi                text,
  emergency_contact   text,
  supply_shops        text,
  promotion_notes     text,
  local_notes         text,
  -- Reserved for the Q9 send surface (whether the sent pack embeds the house
  -- rules). No in-app control until that surface exists; on the request page
  -- house rules always render alongside the pack as profile content.
  include_house_rules boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table studio_welcome_packs enable row level security;

create policy "studio owner reads own welcome pack" on studio_welcome_packs
  for select using (is_studio_owner(studio_profile_id));
