-- Repair: product_collections had no write policies (Plus build P5d, Gate A).
--
-- Migration 0120 created the table with RLS enabled and a SELECT policy only.
-- Every collection write path runs on the USER-scoped Supabase client, so
-- Postgres rejected every insert, update and delete. The feature shipped
-- unable to write anything:
--
--   AUTHENTICATED INSERT -> new row violates row-level security policy
--                           for table "product_collections"
--
-- 0120 is already applied to production and is never edited; this is
-- forward-only.
--
-- WHY THE SHAPE DIFFERS FROM ITS SIBLING. `projects` is also SELECT-only, and
-- that is correct FOR IT: its writes go through the SERVICE client after an
-- explicit ownership check, because those paths carry rules RLS cannot express
-- (a status transition). Collection writes carry no such rule, so they run on
-- the user's own client and need real policies. Copying a sibling's policy
-- shape without checking WHICH CLIENT WRITES is what caused this defect.
--
-- `discount_codes` was originally cited here as a second healthy precedent.
-- That was wrong, and the error is worth recording rather than deleting: a
-- Gate A review checked the claim instead of taking it, and found that
-- `discount_codes` has the SAME missing-write-policy defect, already in
-- production on the revenue path. It is repaired in `0123`. A false
-- "this sibling is fine" is worse than no comment, because it discourages the
-- next reader from looking.
--
-- `WITH CHECK` is the half that matters for isolation: `USING` decides which
-- rows may be targeted, `WITH CHECK` decides what the resulting row may look
-- like. Without it an owner could update a row and hand it to another artist.
--
-- `TO authenticated` is explicit on every policy. Untargeted policies also
-- apply to `anon`, which then reads as though anonymous writes were considered
-- and permitted. They were not: `auth.uid()` is null for `anon`, so the check
-- fails anyway, but the reader cannot tell intent from accident without this.

-- Policies are dropped-then-created rather than created bare: Postgres has no
-- `create policy if not exists`, so a bare create aborts a re-run, and a
-- migration that cannot be safely retried is a migration that can strand a
-- half-applied schema. Found by re-running this file during verification.
drop policy if exists "artist inserts own collections" on product_collections;
create policy "artist inserts own collections" on product_collections
  for insert to authenticated
  with check (artist_id = auth.uid());

drop policy if exists "artist updates own collections" on product_collections;
create policy "artist updates own collections" on product_collections
  for update to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist deletes own collections" on product_collections;
create policy "artist deletes own collections" on product_collections
  for delete to authenticated
  using (artist_id = auth.uid());
