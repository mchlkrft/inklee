-- Instagram account connection per artist
-- Access token stored at-rest; production should add application-level encryption.
CREATE TABLE instagram_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id           uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  instagram_user_id   text NOT NULL,
  username            text NOT NULL,
  access_token        text NOT NULL,
  token_expires_at    timestamptz,
  last_sync_at        timestamptz,
  connected           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artist manages own instagram account"
  ON instagram_accounts FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- Synced Instagram posts (source references, not booking objects)
CREATE TABLE instagram_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  instagram_media_id  text NOT NULL,
  media_type          text NOT NULL DEFAULT 'IMAGE',
  media_url           text,
  thumbnail_url       text,
  permalink           text NOT NULL,
  caption             text,
  posted_at           timestamptz,
  synced_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artist_id, instagram_media_id)
);

ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artist manages own instagram posts"
  ON instagram_posts FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- Link flash items back to their Instagram source post (nullable — manual items have no source)
ALTER TABLE flash_items
  ADD COLUMN instagram_post_id uuid REFERENCES instagram_posts(id) ON DELETE SET NULL;
