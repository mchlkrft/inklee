-- Restore public read access to public-facing tables.
--
-- Migration 0026 enabled RLS on profiles, but the original 0001 policies
-- never added an anon SELECT path. The app worked previously because RLS
-- was effectively off (per the same migration-history bookkeeping issue
-- documented in 0026). Now that RLS is properly on, anon visitors can no
-- longer resolve `inklee.app/{slug}` because the profiles lookup returns
-- zero rows and the page 404s.
--
-- Same gap exists for trips, trip_legs, and flash_days — all queried by
-- the public booking and flash pages.
--
-- Public exposure scope: only artists who have claimed a slug. Profiles
-- without a slug stay private. Trips / trip_legs / flash_days are exposed
-- via EXISTS join to a slug-bearing profile, so a future "draft" artist
-- (no slug yet) is never leaked.

-- ─── profiles ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public can view artist profiles" ON profiles;

CREATE POLICY "public can view artist profiles"
  ON profiles FOR SELECT
  TO anon, authenticated
  USING (slug IS NOT NULL);

-- ─── trips ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public can view trips" ON trips;

CREATE POLICY "public can view trips"
  ON trips FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = trips.artist_id
        AND profiles.slug IS NOT NULL
    )
  );

-- ─── trip_legs ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public can view trip legs" ON trip_legs;

CREATE POLICY "public can view trip legs"
  ON trip_legs FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM trips
      INNER JOIN profiles ON profiles.id = trips.artist_id
      WHERE trips.id = trip_legs.trip_id
        AND profiles.slug IS NOT NULL
    )
  );

-- ─── flash_days ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public can view flash days" ON flash_days;

CREATE POLICY "public can view flash days"
  ON flash_days FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = flash_days.artist_id
        AND profiles.slug IS NOT NULL
    )
  );
