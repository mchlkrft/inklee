-- Flash day <-> design membership (Slice FX-2): the many-to-many junction that
-- becomes the source of truth for "which designs are in a day". A design can now
-- be in multiple days and reused across events. flash_items.flash_day_id is KEPT
-- (not dropped) as a back-compat "primary day" hint that the shared writer keeps
-- synced; readers cut over to this junction in later slices (FX-4/FX-5/FX-6).
--
-- artist_id is denormalized onto the junction so RLS is a single-column check
-- (matching every other table) and the public serviceClient read can filter by
-- artist without a join.
--
-- This RUNS SQL (table + backfill). Apply with `supabase db push` or the SQL
-- editor.
--
-- ⚠️ ORDER MATTERS: deploy the FX-2 embed-fix code (flash_items!flash_day_id in
-- the artist "Flash > Days" query) to whatever app reads this database BEFORE
-- creating this table. The instant flash_day_items exists, an un-hinted
-- flash_items embed under flash_days becomes ambiguous and 500s. The fix is
-- backward-compatible (works with or without this table), so deploy code first,
-- then run this.

CREATE TABLE IF NOT EXISTS flash_day_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id      uuid NOT NULL REFERENCES flash_days(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES flash_items(id) ON DELETE CASCADE,
  artist_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_id, item_id)
);

ALTER TABLE flash_day_items ENABLE ROW LEVEL SECURITY;

-- Artist manages own membership rows. NO anon SELECT policy: the public day page
-- reads via serviceClient with artist_id + status gating in the query, exactly
-- like flash_items today. Re-adding anon SELECT would reopen the column
-- enumeration leak that 0030/0031 closed.
CREATE POLICY "artist can manage own flash day items"
  ON flash_day_items FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_flash_day_items_day_pos
  ON flash_day_items (day_id, position);
CREATE INDEX IF NOT EXISTS idx_flash_day_items_item
  ON flash_day_items (item_id);
CREATE INDEX IF NOT EXISTS idx_flash_day_items_artist
  ON flash_day_items (artist_id);

-- Backfill existing single-FK memberships so public day pages keep showing
-- exactly the same designs after the cutover. Deterministic position per day
-- (by created_at) so the roster has a stable order rather than all-zeros.
INSERT INTO flash_day_items (day_id, item_id, artist_id, position)
SELECT
  fi.flash_day_id,
  fi.id,
  fi.artist_id,
  (row_number() OVER (PARTITION BY fi.flash_day_id ORDER BY fi.created_at) - 1)::int
FROM flash_items fi
WHERE fi.flash_day_id IS NOT NULL
ON CONFLICT (day_id, item_id) DO NOTHING;
