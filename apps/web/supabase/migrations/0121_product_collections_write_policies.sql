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

create policy "artist inserts own collections" on product_collections
  for insert with check (artist_id = auth.uid());

create policy "artist updates own collections" on product_collections
  for update using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

create policy "artist deletes own collections" on product_collections
  for delete using (artist_id = auth.uid());
