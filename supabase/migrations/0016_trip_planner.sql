-- Trip Planner: replace flat travel_legs with studios + trips + trip_legs model
--
-- Studios are reusable: one studio can appear in multiple trips.
-- Trips are the parent concept: each trip has a title, description, and
--   a flag controlling visibility on the public booking form.
-- Trip legs are individual date ranges (with optional studio) within a trip.
--
-- booking_requests gains a trip_id FK pointing to trips.id.
-- travel_legs and travel_leg_id are kept for historical reference but are
--   no longer the primary data source.

-- 1. Studios (reusable)
CREATE TABLE studios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  city       text NOT NULL,
  country    text NOT NULL,
  address    text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE studios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can manage own studios"
  ON studios FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- 2. Trips (parent trip concept)
CREATE TABLE trips (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title                text NOT NULL,
  description          text,
  show_on_booking_form boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can manage own trips"
  ON trips FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- 3. Trip legs (date ranges + optional studio, within a trip)
CREATE TABLE trip_legs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  studio_id  uuid REFERENCES studios(id) ON DELETE SET NULL,
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trip_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can manage own trip legs"
  ON trip_legs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.artist_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.artist_id = auth.uid()
    )
  );

-- 4. Add trip_id to booking_requests
ALTER TABLE booking_requests
  ADD COLUMN trip_id uuid REFERENCES trips(id) ON DELETE SET NULL;

-- 5. Migrate existing travel_legs data into the new structure
--    Each old leg becomes: optionally a studio, a trip, and a trip_leg.
DO $$
DECLARE
  leg       RECORD;
  new_studio_id uuid;
  new_trip_id   uuid;
BEGIN
  FOR leg IN
    SELECT id, artist_id, city, country, studio_name, starts_on, ends_on,
           description, is_active
    FROM   travel_legs
  LOOP
    -- Optionally create a studio if studio_name is present
    IF leg.studio_name IS NOT NULL AND leg.studio_name != '' THEN
      INSERT INTO studios (artist_id, name, city, country)
      VALUES (leg.artist_id, leg.studio_name, leg.city, leg.country)
      RETURNING id INTO new_studio_id;
    ELSE
      new_studio_id := NULL;
    END IF;

    -- Create a trip for this leg
    INSERT INTO trips (artist_id, title, description, show_on_booking_form)
    VALUES (
      leg.artist_id,
      leg.city || ', ' || leg.country,
      leg.description,
      leg.is_active
    )
    RETURNING id INTO new_trip_id;

    -- Create the trip_leg
    INSERT INTO trip_legs (trip_id, studio_id, starts_on, ends_on)
    VALUES (new_trip_id, new_studio_id, leg.starts_on, leg.ends_on);

    -- Map existing booking_requests that referenced this travel_leg to the new trip
    UPDATE booking_requests
    SET trip_id = new_trip_id
    WHERE travel_leg_id = leg.id;
  END LOOP;
END $$;
