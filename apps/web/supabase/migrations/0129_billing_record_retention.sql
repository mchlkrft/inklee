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
alter table billing_consent_records
  alter column artist_id drop not null;
alter table billing_consent_records
  drop constraint billing_consent_records_artist_id_fkey,
  add constraint billing_consent_records_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;

-- 2. billing_subscriptions — reconciled access-control mirror of Stripe.
alter table billing_subscriptions
  alter column artist_id drop not null;
alter table billing_subscriptions
  drop constraint billing_subscriptions_artist_id_fkey,
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
  drop constraint transaction_tax_snapshots_artist_id_fkey,
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
  drop constraint billing_contract_confirmations_artist_id_fkey,
  add constraint billing_contract_confirmations_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;

-- 5. withdrawal_cases — statutory withdrawal records.
alter table withdrawal_cases
  alter column artist_id drop not null;
alter table withdrawal_cases
  drop constraint withdrawal_cases_artist_id_fkey,
  add constraint withdrawal_cases_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;
