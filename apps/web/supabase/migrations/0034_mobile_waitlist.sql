-- 0034 — mobile_waitlist
--
-- Standalone table for the public `/download` page email capture. Distinct
-- from `waitlist_entries` (which is per-artist book-closed waitlist scoped
-- to a booking flow). This table is a single global list: visitors who
-- want to be told when the Inklee iOS + Android app launches.
--
-- Privacy / consent: rows here represent active opt-in to receive one
-- launch announcement email. The /download form makes that purpose
-- explicit in the helper copy above the submit button.
--
-- No RLS policy is added: writes go through the service-role client only
-- (server action), and reads happen via admin queries only.

CREATE TABLE IF NOT EXISTS mobile_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz NULL,
  CONSTRAINT mobile_waitlist_email_lowercase
    CHECK (email = lower(email)),
  CONSTRAINT mobile_waitlist_email_shape
    CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Unique on lower(email) so resubmits don't duplicate. Done as a unique
-- index on a normalised column rather than UNIQUE(email) so the constraint
-- error message stays predictable.
CREATE UNIQUE INDEX IF NOT EXISTS mobile_waitlist_email_uidx
  ON mobile_waitlist (email);

-- Recent-first ordering for the eventual admin view.
CREATE INDEX IF NOT EXISTS mobile_waitlist_created_idx
  ON mobile_waitlist (created_at DESC);

ALTER TABLE mobile_waitlist ENABLE ROW LEVEL SECURITY;
-- No public policies. Service-role bypasses RLS for the server action.
