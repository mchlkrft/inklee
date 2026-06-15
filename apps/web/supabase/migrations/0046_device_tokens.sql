-- Slice E1/E3 — device push tokens for the mobile app (Expo).
-- One row per device push token. The artist registers their token after login;
-- the server fans out push on events (E3) by reading this table via the service
-- role. `token` is globally unique so re-registering the same device updates its
-- owner/last_seen rather than duplicating. RLS: an artist manages only their own.

CREATE TABLE IF NOT EXISTS device_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,                 -- Expo push token
  platform     text NOT NULL CHECK (platform IN ('ios','android')),
  app_version  text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_tokens_artist_idx ON device_tokens(artist_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist manages own device tokens"
  ON device_tokens FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());
