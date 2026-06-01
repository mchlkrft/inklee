-- Booking interests (commerce layer extension, 2026-06-01): the client signals
-- which addon-eligible goods they'd like to buy at the appointment when they
-- submit the booking request. The artist confirms availability per item on
-- Accept (default available, can mark unavailable with a quick note).
--
-- Writes from the public submit flow are done via the service-role client
-- (anonymous customer, no auth.uid()), so they bypass RLS. The artist reads +
-- updates them under RLS keyed to auth.uid(). No anon policy.
--
-- title_snapshot + variant_snapshot + unit_price capture the state at request
-- time so the artist still sees what the client picked even if the product
-- is later edited or deleted (FKs are ON DELETE SET NULL).

CREATE TYPE booking_interest_status AS ENUM (
  'pending', 'available', 'unavailable'
);

CREATE TABLE booking_interests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booking_id        uuid NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id        uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  title_snapshot    text NOT NULL,
  variant_snapshot  text,
  unit_price        numeric(10, 2),
  currency          text NOT NULL DEFAULT 'eur',
  quantity          integer NOT NULL DEFAULT 1,
  status            booking_interest_status NOT NULL DEFAULT 'pending',
  decline_note      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_interests_artist_id_idx ON booking_interests (artist_id);
CREATE INDEX booking_interests_booking_id_idx ON booking_interests (booking_id);

ALTER TABLE booking_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can read and update own booking interests"
  ON booking_interests FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());
