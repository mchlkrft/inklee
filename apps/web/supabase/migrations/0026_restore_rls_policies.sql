-- Critical security fix: restore RLS on the 6 core tables that were flagged
-- by Supabase's Security Advisor on 2026-05-06 as "RLS Disabled in Public":
-- profiles, booking_requests, booking_images, slots, email_templates, audit_log.
--
-- Migration 0001_rls_policies.sql (and 0002_customer_rls.sql) define the
-- intended policies, but on 2026-04-20 the migration history was normalized
-- with `supabase migration repair ... --status applied`, which marks
-- migrations as applied WITHOUT executing their SQL. The tables exist
-- (created via earlier partial runs / direct SQL editor work) but the
-- RLS protections from 0001 + 0002 never reached production.
--
-- This migration re-applies 0001 + 0002 idempotently. DROP POLICY IF EXISTS
-- guards against partial state from a prior application attempt.
-- ENABLE ROW LEVEL SECURITY is naturally idempotent.
--
-- Application-layer ownership checks (Slice 33) remain unchanged — this
-- restores the second line of defense, not the only one.

-- ─── profiles ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "artists can view own profile" ON profiles;
DROP POLICY IF EXISTS "artists can update own profile" ON profiles;

CREATE POLICY "artists can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "artists can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ─── booking_requests ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "artists can view own booking requests" ON booking_requests;
DROP POLICY IF EXISTS "artists can update own booking requests" ON booking_requests;
DROP POLICY IF EXISTS "artists can delete own booking requests" ON booking_requests;
DROP POLICY IF EXISTS "artists can insert booking requests" ON booking_requests;
DROP POLICY IF EXISTS "public can submit booking requests" ON booking_requests;
DROP POLICY IF EXISTS "customers can view booking by token" ON booking_requests;
DROP POLICY IF EXISTS "customers can update booking by token" ON booking_requests;

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

CREATE POLICY "public can submit booking requests"
  ON booking_requests FOR INSERT
  TO anon
  WITH CHECK (origin = 'public_form');

CREATE POLICY "customers can view booking by token"
  ON booking_requests FOR SELECT
  TO anon
  USING (customer_token_hash IS NOT NULL);

CREATE POLICY "customers can update booking by token"
  ON booking_requests FOR UPDATE
  TO anon
  USING (customer_token_hash IS NOT NULL)
  WITH CHECK (customer_token_hash IS NOT NULL);

ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;

-- ─── booking_images ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "artists can view own booking images" ON booking_images;
DROP POLICY IF EXISTS "artists can delete own booking images" ON booking_images;
DROP POLICY IF EXISTS "service role can insert booking images" ON booking_images;

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

CREATE POLICY "service role can insert booking images"
  ON booking_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

ALTER TABLE booking_images ENABLE ROW LEVEL SECURITY;

-- ─── slots ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "artists can view own slots" ON slots;
DROP POLICY IF EXISTS "artists can insert own slots" ON slots;
DROP POLICY IF EXISTS "artists can update own slots" ON slots;
DROP POLICY IF EXISTS "artists can delete own slots" ON slots;
DROP POLICY IF EXISTS "public can view open slots" ON slots;

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

CREATE POLICY "public can view open slots"
  ON slots FOR SELECT
  TO anon
  USING (status = 'open');

ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

-- ─── email_templates ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "artists can manage own email templates" ON email_templates;

CREATE POLICY "artists can manage own email templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (auth.uid() = artist_id)
  WITH CHECK (auth.uid() = artist_id);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- ─── audit_log ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "artists can view own audit log" ON audit_log;
DROP POLICY IF EXISTS "artists can insert audit log entries" ON audit_log;

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

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
