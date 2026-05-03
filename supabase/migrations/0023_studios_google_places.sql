-- Extend studios table with Google Places and visibility fields
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS google_maps_url text,
  ADD COLUMN IF NOT EXISTS public_note text,
  ADD COLUMN IF NOT EXISTS visibility_mode text NOT NULL DEFAULT 'hidden',
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE studios
  ADD CONSTRAINT studios_visibility_mode_check
  CHECK (visibility_mode IN ('public_exact_address', 'public_area_only', 'after_approval_only', 'hidden'));

-- One primary studio per artist
CREATE UNIQUE INDEX IF NOT EXISTS studios_one_primary_per_artist
  ON studios (artist_id)
  WHERE is_primary = true;

-- RLS: artists manage their own studios (full access)
DROP POLICY IF EXISTS "artists manage own studios" ON studios;
CREATE POLICY "artists manage own studios" ON studios
  FOR ALL USING (auth.uid() = artist_id);

-- RLS: public (anon + authenticated) can read non-hidden studios
DROP POLICY IF EXISTS "public can read visible studios" ON studios;
CREATE POLICY "public can read visible studios" ON studios
  FOR SELECT TO anon, authenticated
  USING (visibility_mode != 'hidden');

-- Add studio linkage to booking_requests
ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES studios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS studio_snapshot jsonb;
