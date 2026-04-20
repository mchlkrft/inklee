CREATE TYPE waitlist_status AS ENUM ('waiting', 'contacted', 'converted', 'dismissed');

CREATE TABLE waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_handle TEXT NOT NULL,
  note TEXT,
  status waitlist_status NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Artist reads and manages their own entries
CREATE POLICY "artist_own_waitlist" ON waitlist_entries
  FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- Unauthenticated public can insert (rate limited at edge)
CREATE POLICY "public_insert_waitlist" ON waitlist_entries
  FOR INSERT
  WITH CHECK (true);
