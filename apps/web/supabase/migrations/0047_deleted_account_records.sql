-- Slice: in-app account deletion (GDPR Art.17 erasure vs Estonian accounting/tax
-- retention). When an artist deletes their account, the financial record is
-- PSEUDONYMISED (money + Stripe identifiers only, NO client PII) and snapshotted
-- here BEFORE the profile cascade hard-deletes the originals. Intentionally has
-- NO FK to profiles so it SURVIVES the cascade; artist_id is a bare uuid kept
-- for reconciliation. Stripe remains the authoritative record of the underlying
-- transactions; this is Inklee's local retained copy.
--
-- LEGAL (docs/account-deletion-handoff.md, counsel): this record is PSEUDONYMISED
-- data, NOT anonymised — the Stripe/internal IDs permit re-identification, so it
-- remains in-scope personal data processed under Art. 6(1)(c). Retention period:
-- 7 YEARS from the end of the financial year of the transaction (Estonian
-- Accounting Act §12); a scheduled purge keyed to financial-year-end is required.

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
