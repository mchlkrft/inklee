-- 0063 — email_campaigns (Email hub slice 9: campaign execution + suppression/unsubscribe foundation)
--
-- Backs CT→Inklee marketing/lifecycle campaign dispatch. Control Tower schedules and reviews a
-- campaign, then dispatches an HMAC-signed job to /api/internal/email-jobs; the whole send
-- (segment resolution, per-recipient filtering, batch send) runs INSIDE Inklee so that no
-- recipient PII (emails, handles) ever crosses back to Control Tower — it receives aggregates
-- and masked samples only. Four tables:
--   email_jobs               — one row per received dispatch (aggregates only, never a recipient list)
--   email_sends              — one row per recipient attempt; UNIQUE(job_id, artist_id) is the at-most-once key
--   email_suppressions       — hard bounces + spam complaints, checked before every send
--   email_unsubscribe_tokens — durable per-artist unsubscribe token (only the sha256 is stored)
--
-- SERVICE-ROLE ONLY (same pattern as founding_artist_applications / account_overrides, migrations
-- 0056 / 0045): RLS is enabled on all four with NO policies. Every access goes through the
-- service-role client (src/lib/supabase/service.ts), which bypasses RLS. The repo is public and
-- there is no anon policy, so none of these rows — which include recipient emails and unsubscribe
-- token hashes — can ever be read, enumerated, or modified by the public.
--
-- Preference storage note: campaign opt-out state is NOT a column here. It lives in
-- profiles.settings JSONB under settings.email_prefs = { marketing: bool, lifecycle: bool }
-- (absent key = opted-in). It is merged in application code (see lib/email-campaigns/preferences.ts),
-- kept strictly separate from settings.disabled_emails (which is an artist muting their OWN
-- customer mail — a different preference system entirely).
--
-- Additive only. Applied via `supabase db push`, dev first then prod. Never `migration repair`.

CREATE TABLE IF NOT EXISTS email_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   text NOT NULL UNIQUE,
  campaign_id       text,
  execution_key     text NOT NULL,
  segment_name      text,
  category          text NOT NULL,
  subject           text,
  dry_run           boolean NOT NULL DEFAULT true,
  status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','completed','failed','canceled')),
  audience_size     int,
  would_send        int,
  sent_count        int DEFAULT 0,
  failed_count      int DEFAULT 0,
  skipped_count     int DEFAULT 0,
  skipped_detail    jsonb,
  sample            jsonb,
  sending_enabled   boolean,
  error             text,
  created_at        timestamptz DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz
);

CREATE TABLE IF NOT EXISTS email_sends (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid REFERENCES email_jobs(id) ON DELETE CASCADE,
  artist_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_email   text,
  status            text CHECK (status IN (
                      'sent','failed','skipped_suppressed','skipped_opted_out',
                      'skipped_tester','skipped_dedup','skipped_no_email')),
  resend_message_id text,
  skip_reason       text,
  error             text,
  created_at        timestamptz DEFAULT now(),
  -- Recipient-level dedup: at most one attempt per artist per job. Insert-before-send
  -- turns a 23505 here into a skipped_dedup, never a double-send.
  UNIQUE (job_id, artist_id)
);

CREATE TABLE IF NOT EXISTS email_suppressions (
  recipient_email   text PRIMARY KEY,
  reason            text CHECK (reason IN ('bounced','complained')),
  hard              boolean DEFAULT true,
  source            text,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_unsubscribe_tokens (
  token_hash        text PRIMARY KEY,
  artist_id         uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  scope             text NOT NULL DEFAULT 'all',
  created_at        timestamptz DEFAULT now()
);

-- Recipient-attempt lookups by job (status roll-ups) and the jobs feed ordered newest-first.
CREATE INDEX IF NOT EXISTS email_sends_job_idx ON email_sends (job_id);
CREATE INDEX IF NOT EXISTS email_jobs_created_idx ON email_jobs (created_at DESC);

ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies on any of the four: all access is via the service-role client,
-- which bypasses RLS. There is no anon/user path to campaign jobs, recipient rows, suppressions,
-- or unsubscribe token hashes.
