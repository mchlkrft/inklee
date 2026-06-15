CREATE TABLE travel_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  studio_name TEXT,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE travel_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_own_travel_legs" ON travel_legs
  FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

ALTER TABLE booking_requests
  ADD COLUMN travel_leg_id UUID REFERENCES travel_legs(id) ON DELETE SET NULL;
