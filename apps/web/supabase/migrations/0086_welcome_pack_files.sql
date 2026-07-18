-- 0086: Inklee 2.0 Phase 4 - welcome pack attachments (the private bucket)
--
-- The deferred "any file attachments wait for the private bucket built in
-- this phase" item (build plan Phase 4 welcome pack extension). Purpose-
-- scoped bucket, the studio-media posture exactly: keyed by studio id (files
-- survive owner changes, purged by studio deletion, never the per-user
-- purge), NO storage.objects policies, all access service role + short
-- signed URLs. Guests reach files only through the welcome pack read core,
-- which requires a confirmed or active stay (interaction plane).

create table if not exists welcome_pack_files (
  id                uuid primary key default gen_random_uuid(),
  studio_profile_id uuid not null references studio_profiles(id) on delete cascade,
  storage_path      text not null,
  file_name         text not null,
  mime_type         text,
  file_size         int,
  created_at        timestamptz not null default now()
);
alter table welcome_pack_files enable row level security;

create policy "owner reads own welcome pack files" on welcome_pack_files
  for select using (is_studio_owner(studio_profile_id));

create index if not exists welcome_pack_files_studio_idx
  on welcome_pack_files (studio_profile_id, created_at);

insert into storage.buckets (id, name, public)
values ('welcome-pack-files', 'welcome-pack-files', false)
on conflict (id) do update set public = excluded.public;
