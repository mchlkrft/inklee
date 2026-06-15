-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- profiles: artists manage only their own row
CREATE POLICY "artists can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "artists can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- booking_requests: artists manage their own; public can insert
CREATE POLICY "artists can view own booking requests"
  ON booking_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = artist_id);

CREATE POLICY "artists can update own booking requests"
  ON booking_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = artist_id);

CREATE POLICY "artists can delete own booking requests"
  ON booking_requests FOR DELETE
  TO authenticated
  USING (auth.uid() = artist_id);

CREATE POLICY "artists can insert booking requests"
  ON booking_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = artist_id);

-- Public (anon) can insert booking requests (rate limited at edge)
CREATE POLICY "public can submit booking requests"
  ON booking_requests FOR INSERT
  TO anon
  WITH CHECK (origin = 'public_form');

-- booking_images: follow parent booking ownership
CREATE POLICY "artists can view own booking images"
  ON booking_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM booking_requests
      WHERE booking_requests.id = booking_images.booking_id
        AND booking_requests.artist_id = auth.uid()
    )
  );

CREATE POLICY "artists can delete own booking images"
  ON booking_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM booking_requests
      WHERE booking_requests.id = booking_images.booking_id
        AND booking_requests.artist_id = auth.uid()
    )
  );

-- Allow inserts for booking image uploads (server action uses service role)
CREATE POLICY "service role can insert booking images"
  ON booking_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- slots: artists manage their own
CREATE POLICY "artists can view own slots"
  ON slots FOR SELECT
  TO authenticated
  USING (auth.uid() = artist_id);

CREATE POLICY "artists can insert own slots"
  ON slots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = artist_id);

CREATE POLICY "artists can update own slots"
  ON slots FOR UPDATE
  TO authenticated
  USING (auth.uid() = artist_id);

CREATE POLICY "artists can delete own slots"
  ON slots FOR DELETE
  TO authenticated
  USING (auth.uid() = artist_id);

-- Public can view open slots for a given artist (for booking form)
CREATE POLICY "public can view open slots"
  ON slots FOR SELECT
  TO anon
  USING (status = 'open');

-- email_templates: artists manage their own
CREATE POLICY "artists can manage own email templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (auth.uid() = artist_id)
  WITH CHECK (auth.uid() = artist_id);

-- audit_log: append-only for authenticated artists on their own bookings
CREATE POLICY "artists can view own audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM booking_requests
      WHERE booking_requests.id = audit_log.booking_id
        AND booking_requests.artist_id = auth.uid()
    )
  );

CREATE POLICY "artists can insert audit log entries"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM booking_requests
      WHERE booking_requests.id = audit_log.booking_id
        AND booking_requests.artist_id = auth.uid()
    )
  );
