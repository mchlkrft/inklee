CREATE TABLE custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('short_text', 'long_text', 'number', 'select', 'radio', 'checkbox', 'date')),
  required BOOLEAN NOT NULL DEFAULT false,
  placeholder TEXT,
  help_text TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: key must be unique per artist among non-deleted fields
-- Allows reusing a key after a field is archived
CREATE UNIQUE INDEX custom_fields_artist_key_unique
  ON custom_fields (artist_id, key)
  WHERE deleted_at IS NULL;

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

-- Artists can manage their own fields
CREATE POLICY "artists_manage_custom_fields"
  ON custom_fields
  FOR ALL
  TO authenticated
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- Public (anon) can read active, non-deleted fields for the booking form
CREATE POLICY "public_read_active_custom_fields"
  ON custom_fields
  FOR SELECT
  TO anon
  USING (active = true AND deleted_at IS NULL);
