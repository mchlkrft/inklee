-- In-platform support tickets (2026-07-04).
-- Artists open structured tickets at /support; admins triage and reply from
-- /admin/support. The conversation lives in support_ticket_messages; the
-- original structured request stays on the ticket row itself (easy to display
-- and query, not duplicated as a first message). Email is notification-only.
--
-- Reference INK-<n> is race-safe via a sequence default (never derived from
-- row counts in application code).
--
-- RLS: artists can READ their own tickets and the PUBLIC messages on them,
-- and nothing else. Every write (ticket creation, replies, status changes)
-- goes through the server actions using the service role after explicit
-- authorization, so status transitions, timestamps, author attribution and
-- internal-note visibility can never be forged from a client.

CREATE SEQUENCE support_ticket_ref_seq START 1001;

CREATE TABLE support_tickets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            text NOT NULL UNIQUE DEFAULT ('INK-' || nextval('support_ticket_ref_seq')),
  artist_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject              text NOT NULL,
  category             text NOT NULL CHECK (category IN (
    'account_login', 'booking_requests', 'calendar_availability',
    'public_page', 'payments_deposits', 'mobile_app',
    'notifications_email', 'studio_team', 'bug', 'feature_question',
    'billing', 'other'
  )),
  status               text NOT NULL DEFAULT 'awaiting_support' CHECK (status IN (
    'open', 'awaiting_support', 'awaiting_artist', 'resolved', 'closed'
  )),
  description          text NOT NULL,
  expected_behavior    text NOT NULL,
  actual_behavior      text NOT NULL,
  reproduction_steps   text,
  relevant_area        text,
  device_info          text,
  platform_info        text,
  additional_context   text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  closed_at            timestamptz,
  last_artist_reply_at timestamptz,
  last_admin_reply_at  timestamptz,
  -- When the artist last opened the ticket page; a newer last_admin_reply_at
  -- means "unread admin reply" on the artist side.
  artist_seen_at       timestamptz
);

CREATE INDEX support_tickets_artist_idx ON support_tickets (artist_id);
CREATE INDEX support_tickets_status_idx ON support_tickets (status);
CREATE INDEX support_tickets_updated_idx ON support_tickets (updated_at DESC);

CREATE TABLE support_ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  -- Admin accounts are auth users that may not have a profiles row, so this
  -- references auth.users. SET NULL keeps the thread readable if an author
  -- account is ever deleted; author_role carries the display identity.
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role text NOT NULL CHECK (author_role IN ('artist', 'admin')),
  visibility  text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal')),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_messages_ticket_idx ON support_ticket_messages (ticket_id, created_at);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist reads own support tickets"
  ON support_tickets FOR SELECT
  USING (artist_id = auth.uid());

CREATE POLICY "artist reads public messages on own tickets"
  ON support_ticket_messages FOR SELECT
  USING (
    visibility = 'public'
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = ticket_id AND t.artist_id = auth.uid()
    )
  );
