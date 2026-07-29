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
-- WHY THE SHAPE DIFFERS FROM ITS SIBLINGS. `projects` and `discount_codes` are
-- also SELECT-only, and that is correct for them: their writes go through the
-- SERVICE client after an explicit ownership check, because those paths carry
-- rules RLS cannot express (a status transition, a redemption cap). Collection
-- writes carry no such rule, so they run on the user's own client and need
-- real policies. Copying the sibling policy shape without checking which
-- client writes is what caused this.
--
-- `WITH CHECK` is the half that matters for isolation: `USING` decides which
-- rows may be targeted, `WITH CHECK` decides what the resulting row may look
-- like. Without it an owner could update a row and hand it to another artist.

-- Policies are dropped-then-created rather than created bare: Postgres has no
-- `create policy if not exists`, so a bare create aborts a re-run, and a
-- migration that cannot be safely retried is a migration that can strand a
-- half-applied schema. Found by re-running this file during verification.
drop policy if exists "artist inserts own collections" on product_collections;
create policy "artist inserts own collections" on product_collections
  for insert with check (artist_id = auth.uid());

drop policy if exists "artist updates own collections" on product_collections;
create policy "artist updates own collections" on product_collections
  for update using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist deletes own collections" on product_collections;
create policy "artist deletes own collections" on product_collections
  for delete using (artist_id = auth.uid());
