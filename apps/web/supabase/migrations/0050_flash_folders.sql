-- Flash folders (Slice FX-1): optional, flat, per-artist organization for the
-- design library. A design lives in AT MOST ONE folder (folder_id on
-- flash_items). Deleting a folder un-files its designs (SET NULL), never deletes
-- them. Purely organizational: a NULL folder_id ("Unfiled") is the correct
-- default for every existing design, so no backfill is needed.
--
-- Additive + idempotent (safe to re-run). This RUNS SQL: apply with
-- `supabase db push` (or paste in the SQL editor), NOT `migration repair
-- --status applied`. After applying, verify the effects (see the checklist in
-- docs/flash-audit-and-plan-2026-06-17.md / AGENTS.md).

CREATE TABLE IF NOT EXISTS flash_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flash_folders ENABLE ROW LEVEL SECURITY;

-- Artist manages own folders. NO anon SELECT policy: the library is
-- artist-only, and any future public read goes via serviceClient, matching the
-- 0030/0031 lockdown on the other flash tables.
CREATE POLICY "artist can manage own flash folders"
  ON flash_folders FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_flash_folders_artist_pos
  ON flash_folders (artist_id, position);

-- A design's folder (nullable = Unfiled). SET NULL on folder delete keeps the
-- design; it just becomes Unfiled.
ALTER TABLE flash_items
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES flash_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flash_items_artist_folder
  ON flash_items (artist_id, folder_id);
