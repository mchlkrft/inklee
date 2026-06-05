-- Slice 81 — internal admin entitlements + fee-sponsorship overrides.
--
-- One row per artist, created on demand by an admin. SERVICE-ROLE ONLY: RLS is
-- enabled with NO policies, so an artist can never read the internal admin
-- notes, sponsorship budget, or usage about themselves (the repo is public and
-- artists can SELECT their own profiles row, which is why this lives in a
-- separate locked table, not on profiles). The app reads it server-side via the
-- service client.
--
-- Capabilities:
--   plan_tier / plan_source / plan_expires_at  → feature entitlement baseline + comp grants with expiry
--   entitlement_overrides (jsonb)              → per-feature true/false overrides on top of the plan
--   fee_sponsored / *_expires_at / *_cap_cents → sponsored deposit fees (Inklee absorbs the 3%) with an
--   fee_sponsored_used_cents                     optional spend limit + running usage
--   admin_notes                                → free-text internal notes

CREATE TABLE IF NOT EXISTS account_overrides (
  artist_id                uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  plan_tier                text NOT NULL DEFAULT 'free',          -- 'free' | 'plus'
  plan_source              text,                                   -- 'comp' | 'paid' | null
  plan_expires_at          timestamptz,                            -- null = no expiry
  entitlement_overrides    jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { "<feature>": true|false }
  fee_sponsored            boolean NOT NULL DEFAULT false,         -- Inklee covers the deposit fee
  fee_sponsor_expires_at   timestamptz,                            -- null = no expiry
  fee_sponsor_cap_cents    integer,                                -- null = unlimited budget
  fee_sponsored_used_cents integer NOT NULL DEFAULT 0,             -- running sponsored spend (foregone fee)
  admin_notes              text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_overrides ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only the service role (admin server actions +
-- server-side entitlement checks) can read or write this table.
