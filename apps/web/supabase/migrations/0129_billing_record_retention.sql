-- 0129: Billing record retention on account deletion (C1).
--
-- Problem: five billing tables with retention obligations (consent evidence,
-- tax snapshots, subscription records, contract confirmations, withdrawal
-- cases) have ON DELETE CASCADE from profiles. When an artist deletes their
-- account, the profile cascade destroys records that Terms and Estonian tax law
-- (7-year retention, Accounting Act §12) require retention of. Additionally,
-- the transaction_tax_snapshots immutability trigger (tts_no_mutation) raises
-- an exception on the cascading delete, blocking account deletion entirely for
-- any artist with tax snapshot rows.
--
-- Fix: change the FK on the five retained tables from CASCADE to SET NULL.
-- The artist_id is nullified (pseudonymised) but the records survive with
-- their Stripe IDs intact for tax/accounting/legal purposes. The tts trigger
-- is updated to allow the SET NULL update while blocking all other mutations.
--
-- Tables that STAY CASCADE (operational, no retention obligation):
--   account_billing_profiles (1:1 classification)
--   vies_validation_attempts (operational)
--   billing_quotes (short-lived)
--   billing_risk_events (authored-schema-only)

-- 1. billing_consent_records — consent evidence (terms acceptance, business-
--    use declaration, immediate-performance request, withdrawal ack).
--
-- MIG-DROP-001: split into DROP-then-ADD. The original single two-clause
-- ALTER TABLE had no `if exists` on the drop, so a hand-dropped constraint
-- aborted the whole statement on re-run and the FK never came back (same
-- shape confirmed empirically on 0143's identical reshape, 2026-08-02:
-- manual drop, re-run, pg_constraint came back empty). `drop constraint if
-- exists` never errors; the unconditional `add constraint` after it is the
-- AGENTS.md convergent shape (0138_bundle_item_variants.sql:107-108 is the
-- reference). This file was believed applied to production and therefore
-- unfixable; that belief was wrong (confirmed via `git ls-tree -r
-- origin/master`, which does not contain this file at all) and is corrected
-- here rather than left as an accepted permanent risk.
alter table billing_consent_records
  alter column artist_id drop not null;
alter table billing_consent_records
  drop constraint if exists billing_consent_records_artist_id_fkey;
alter table billing_consent_records
  add constraint billing_consent_records_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;

-- 2. billing_subscriptions — reconciled access-control mirror of Stripe.
alter table billing_subscriptions
  alter column artist_id drop not null;
alter table billing_subscriptions
  drop constraint if exists billing_subscriptions_artist_id_fkey;
alter table billing_subscriptions
  add constraint billing_subscriptions_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;

-- 3. transaction_tax_snapshots — immutable per-transaction tax records.
--    The existing tts_no_mutation trigger blocks ALL updates and deletes.
--    The FK change to SET NULL fires an UPDATE (artist_id → null) on the
--    cascade, which the old trigger refuses. The replacement below allows
--    that specific update and nothing else.
alter table transaction_tax_snapshots
  alter column artist_id drop not null;
alter table transaction_tax_snapshots
  drop constraint if exists transaction_tax_snapshots_artist_id_fkey;
alter table transaction_tax_snapshots
  add constraint transaction_tax_snapshots_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;

create or replace function tts_block_mutation() returns trigger language plpgsql as $$
declare
  _check transaction_tax_snapshots;
begin
  if TG_OP = 'DELETE' then
    raise exception 'transaction_tax_snapshots is append-only; corrections are new rows';
  end if;
  -- Allow ONLY the FK ON DELETE SET NULL action: artist_id → NULL, all other
  -- columns unchanged. Verified by temporarily restoring artist_id on the new
  -- row and comparing the full composite; IS NOT DISTINCT FROM treats NULLs in
  -- corresponding columns as equal.
  if NEW.artist_id is null and OLD.artist_id is not null then
    _check := NEW;
    _check.artist_id := OLD.artist_id;
    if _check is not distinct from OLD then
      return NEW;
    end if;
  end if;
  raise exception 'transaction_tax_snapshots is append-only; corrections are new rows';
end $$;

-- 4. billing_contract_confirmations — durable-medium confirmation evidence.
alter table billing_contract_confirmations
  alter column artist_id drop not null;
alter table billing_contract_confirmations
  drop constraint if exists billing_contract_confirmations_artist_id_fkey;
alter table billing_contract_confirmations
  add constraint billing_contract_confirmations_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;

-- 5. withdrawal_cases — statutory withdrawal records.
alter table withdrawal_cases
  alter column artist_id drop not null;
alter table withdrawal_cases
  drop constraint if exists withdrawal_cases_artist_id_fkey;
alter table withdrawal_cases
  add constraint withdrawal_cases_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;
