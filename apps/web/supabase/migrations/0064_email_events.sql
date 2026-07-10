-- Email hub slice 10: delivery/engagement analytics.
--
-- email_events persists EVERY email.* event Resend's webhook delivers (sent, delivered,
-- delivery_delayed, bounced, complained, opened, clicked), linked back to a campaign
-- recipient row via resend_message_id when one exists. The Control Tower Email hub reads
-- AGGREGATES of this table through /api/internal/email-metrics; raw rows (which carry the
-- recipient address, Inklee-owned PII) never leave this database.
--
-- Additive only. Service-role only: RLS enabled with intentionally NO policies, matching
-- email_jobs/email_sends (0063).

-- 'unsubscribed' is recorded by Inklee's own unsubscribe surfaces (the /unsubscribe page and
-- the RFC 8058 one-click POST), not by Resend; it has no resend_message_id, so it counts
-- globally rather than per campaign.
CREATE TABLE IF NOT EXISTS email_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        text NOT NULL CHECK (event_type IN (
                      'sent','delivered','delivery_delayed','bounced',
                      'complained','opened','clicked','unsubscribed')),
  resend_message_id text,
  recipient_email   text,
  subject           text,
  occurred_at       timestamptz,
  created_at        timestamptz DEFAULT now()
);

-- The rollup joins events to campaign recipients by message id, filtered per event type;
-- the created_at index keeps "recent events" maintenance queries cheap.
CREATE INDEX IF NOT EXISTS email_events_message_idx ON email_events (resend_message_id);
CREATE INDEX IF NOT EXISTS email_events_type_idx ON email_events (event_type, created_at DESC);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: all access is via the service-role client. There is no
-- anon/user path to delivery events or recipient addresses.
