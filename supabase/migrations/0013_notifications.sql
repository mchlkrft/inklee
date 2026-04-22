CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('booking_activity', 'client_update', 'system_warning', 'info')),
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  cta_label   TEXT,
  cta_href    TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  is_resolved BOOLEAN,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_artist_id_idx ON notifications (artist_id);
CREATE INDEX notifications_unread_idx   ON notifications (artist_id, is_read) WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist owns notifications"
  ON notifications FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());
