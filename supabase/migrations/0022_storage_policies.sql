-- Storage bucket access control (OT-01, slice 32 follow-up).
--
-- Two buckets are in use:
--   * `bookings` — booking reference photos; path `{artistId}/{bookingId}/{uuid}.webp`.
--                  Private. Reads via signed URL by the owning artist.
--                  Writes through the service role only (booking submission).
--   * `logos`    — profile logos and flash item previews;
--                  paths `{artistId}/logo.webp` and `{artistId}/flash/{itemId}.webp`.
--                  Public read (rendered on public booking and flash pages).
--                  Writes through the service role only.
--
-- After this migration, no anon or authenticated client can write to either bucket
-- directly. Service-role usage in server actions bypasses RLS and continues to work.

-- Ensure buckets exist with the correct visibility.
insert into storage.buckets (id, name, public)
values ('bookings', 'bookings', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = excluded.public;

-- Drop any pre-existing permissive policies on these buckets to avoid stacking
-- (Supabase often seeds default policies on bucket creation).
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%bookings%'
        or policyname ilike '%logos%'
        or policyname ilike '%flash%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end$$;

-- bookings: artist can read their own files. First path segment = auth.uid().
create policy "bookings_owner_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bookings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No insert/update/delete policy for `bookings` → only the service role can write.

-- logos: public read for anyone (including unauthenticated visitors on /[slug]).
create policy "logos_public_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'logos');

-- No insert/update/delete policy for `logos` → only the service role can write.
