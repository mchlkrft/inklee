CREATE TABLE client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_notes_artist_email_unique UNIQUE (artist_id, customer_email)
);

ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artists_manage_own_client_notes"
  ON client_notes
  FOR ALL
  TO authenticated
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());
