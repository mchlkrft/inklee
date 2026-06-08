-- Slice: in-app account deletion (GDPR Art.17 erasure vs EU tax/AML retention).
-- When an artist deletes their account, financial/transaction records that may
-- be legally required to retain are anonymized (NO client PII) and snapshotted
-- here BEFORE the profile cascade hard-deletes the originals. Intentionally has
-- NO FK to profiles so it SURVIVES the cascade; artist_id is a bare uuid kept
-- for reconciliation. Stripe remains the authoritative record of the underlying
-- transactions; this is Inklee's local retained copy.
--
-- ⚠️ PENDING COUNSEL: the exact retained field set, anonymization rules, and
-- retention window (Estonia/EE + EU) must be confirmed. The application writes a
-- conservative default (money + Stripe identifiers only, no client PII).

CREATE TABLE IF NOT EXISTS deleted_account_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id         uuid NOT NULL,            -- bare uuid, intentionally NO FK
  stripe_account_id text,                     -- retained Connect pointer
  record            jsonb NOT NULL,           -- anonymized financial snapshot
  deleted_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deleted_account_records_artist_idx
  ON deleted_account_records(artist_id);

-- Service-role only: RLS enabled with NO policies = no anon/authenticated access.
ALTER TABLE deleted_account_records ENABLE ROW LEVEL SECURITY;
