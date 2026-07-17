-- 0078: Inklee 2.0 Phase 3 - studio profiles foundation
--
-- The studio owner role's data layer (docs/product/inklee-2-schema-proposal.md
-- section 2.2; build plan Phase 3). This slice is schema + the ownership
-- helper + the private media bucket + the map link; the elevation, create,
-- claim, editor, and cockpit surfaces build on it in later slices.
--
-- Ownership model (locked): one studio per owner. owner_user_id is UNIQUE but
-- NULLABLE, so a studio survives its owner's account deletion and reads as
-- unclaimed on the map (its map entry and earned reputation persist; media
-- survives because storage is keyed by studio id, not user id). The detach is
-- enforced at the database (FK ON DELETE SET NULL + a trigger), so it can
-- never be forgotten in app code.
--
-- Writes: RLS grants owners SELECT only. Every studio mutation goes through a
-- server core (service role after an explicit ownership check), because RLS
-- cannot gate which columns change and publication_status must never be
-- settable directly (the publish transition validates the locked minimums:
-- logo, description, address or approximate mode, 3+ distinct categories,
-- 3+ photos).

-- ---------------------------------------------------------------------------
-- Studio profiles.
create table if not exists studio_profiles (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid references profiles(id) on delete set null,
  name               text not null,
  -- Reserved for a future /studio/<slug> route; not populated or routed in
  -- v1. Nullable so unclaimed/draft studios need none.
  slug               text unique,
  description        text,
  vibe               text,
  logo_path          text,
  address            text,
  city               text,
  country            text,
  postal_code        text,
  address_visibility text not null default 'exact'
                     check (address_visibility in ('exact', 'approximate')),
  guest_spot_status  text not null default 'not_accepting'
                     check (guest_spot_status in ('not_accepting', 'accepting', 'invitation_only')),
  publication_status text not null default 'draft'
                     check (publication_status in ('draft', 'published', 'suspended')),
  settings           jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- One studio per owner (NULLs allowed, so detached studios don't collide).
  constraint studio_profiles_one_per_owner unique (owner_user_id)
);
alter table studio_profiles enable row level security;

create policy "owner reads own studio" on studio_profiles
  for select
  using (owner_user_id = auth.uid());

create index if not exists studio_profiles_publication_idx
  on studio_profiles (publication_status);

-- ---------------------------------------------------------------------------
-- Ownership helper. SECURITY DEFINER so RLS policies can call it; used inside
-- policy expressions, so authenticated keeps EXECUTE (the RLS-helper carve-out
-- from the 0060 grant-hygiene rule). search_path pinned. Defined after the
-- table because the SQL body is validated at creation time.
create or replace function public.is_studio_owner(p_studio_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.studio_profiles s
    where s.id = p_studio_profile_id
      and s.owner_user_id = auth.uid()
  );
$$;
revoke execute on function public.is_studio_owner(uuid) from public, anon;
grant execute on function public.is_studio_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Studio categories. Three shapes: a style category references the styles
-- table (map filters join through it), a non-style standard uses standard_key,
-- a custom uses custom_label. Exactly one is set, matching kind.
create table if not exists studio_categories (
  id                uuid primary key default gen_random_uuid(),
  studio_profile_id uuid not null references studio_profiles(id) on delete cascade,
  kind              text not null check (kind in ('standard', 'custom')),
  style_key         text references styles(key) on delete set null,
  standard_key      text,
  custom_label      text,
  created_at        timestamptz not null default now(),
  constraint studio_categories_shape check (
    (kind = 'custom'
       and custom_label is not null
       and style_key is null
       and standard_key is null)
    or
    (kind = 'standard'
       and custom_label is null
       and num_nonnulls(style_key, standard_key) = 1)
  )
);
alter table studio_categories enable row level security;

create policy "owner reads own studio categories" on studio_categories
  for select
  using (is_studio_owner(studio_profile_id));

-- Distinct-category protection so 3 identical rows cannot satisfy the min-3
-- publish gate.
create unique index if not exists studio_categories_style_uniq
  on studio_categories (studio_profile_id, style_key)
  where style_key is not null;
create unique index if not exists studio_categories_standard_uniq
  on studio_categories (studio_profile_id, standard_key)
  where standard_key is not null;
create unique index if not exists studio_categories_custom_uniq
  on studio_categories (studio_profile_id, lower(custom_label))
  where custom_label is not null;

-- ---------------------------------------------------------------------------
-- Studio photos. Metadata rows; bytes live in the private studio-media bucket
-- keyed by studio id. Reads via server-generated signed URLs (service role).
create table if not exists studio_photos (
  id                uuid primary key default gen_random_uuid(),
  studio_profile_id uuid not null references studio_profiles(id) on delete cascade,
  storage_path      text not null,
  position          int not null default 0,
  width             int,
  height            int,
  file_size         int,
  mime_type         text,
  created_at        timestamptz not null default now()
);
alter table studio_photos enable row level security;

create policy "owner reads own studio photos" on studio_photos
  for select
  using (is_studio_owner(studio_profile_id));

create index if not exists studio_photos_studio_idx
  on studio_photos (studio_profile_id, position);

-- ---------------------------------------------------------------------------
-- Private studio-media bucket. Path convention {studioProfileId}/... so media
-- survives an owner change and is purged by a studio-deletion path, never the
-- per-user account-deletion purge. No storage.objects policy: all access is
-- service role + server-generated signed URLs (the bookings-bucket posture).
insert into storage.buckets (id, name, public)
values ('studio-media', 'studio-media', false)
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- Link map locations to their claimed/created studio (deferred from 0075).
alter table map_locations
  add column if not exists studio_profile_id uuid
    references studio_profiles(id) on delete set null;
create index if not exists map_locations_studio_profile_idx
  on map_locations (studio_profile_id)
  where studio_profile_id is not null;

-- ---------------------------------------------------------------------------
-- Detach on owner loss: when owner_user_id becomes null (FK SET NULL during a
-- profiles cascade, or an explicit transfer), the linked map location reverts
-- to unclaimed and the studio is suspended so an ownerless page stops
-- accepting guests. The map entry itself and its reputation survive.
create or replace function public.studio_detach_on_owner_loss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.owner_user_id is not null and new.owner_user_id is null then
    update public.map_locations
      set claim_status = 'unclaimed', updated_at = now()
      where studio_profile_id = new.id;
    new.publication_status := 'suspended';
    new.guest_spot_status := 'not_accepting';
  end if;
  return new;
end;
$$;
revoke execute on function public.studio_detach_on_owner_loss() from public, anon, authenticated;

drop trigger if exists studio_profiles_detach on studio_profiles;
create trigger studio_profiles_detach
  before update of owner_user_id on studio_profiles
  for each row
  execute function public.studio_detach_on_owner_loss();
