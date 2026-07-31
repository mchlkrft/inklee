-- Processor cost + refund-policy stamp on payment_collections (PAY-RFD-002).
--
-- WHY. The fee-refund policy v1 case `retain_non_recoverable` (artist
-- cancellation) is meant to retain ONLY the actual non-recoverable Stripe
-- processing cost and return the rest of Inklee's fee. The refund core had no
-- source for that cost and fell back to retaining the WHOLE application fee
-- (cost + margin), which is the PAY-RFD-002 defect. This migration gives the
-- collection a place to persist the actual cost (from balance-transaction data
-- at settlement), the policy version the collection was settled under, and how
-- much cost has already been retained across refunds, so the decision is made
-- from stored transaction facts and is reproducible rather than depending on
-- whichever global policy version happens to be active at refund time.
--
-- WHICH CLIENT WRITES. `payment_collections` is written by the SERVICE ROLE at
-- settlement only (0125: the artist reads it, and insert/update/delete are
-- REVOKEd from anon and authenticated). These columns follow that: the
-- settlement path writes the cost and stamp, the refund core increments the
-- retained total, both as the service role. No RLS change is needed; the
-- existing SELECT policy already exposes reads to the owning artist and the
-- REVOKE already forbids artist writes.
--
-- CONVERGENCE (AGENTS.md). Columns are added with `add column if not exists`,
-- which converges: a re-run adds a missing column and skips a present one.
-- Column TYPE, NOT NULL and DEFAULT stay inline on the column, matching the
-- 0125 boundary (those are part of the column definition, not separate
-- objects). Everything carrying a semantic guarantee (the CHECK constraints) is
-- a NAMED constraint added through a guarded `do $$ ... if not exists ... end`
-- block, so a re-run restores a dropped check rather than exiting 0 having
-- restored nothing.
--
-- All nullable / defaulted with no backfill: collections settled before this
-- migration genuinely have no recorded cost, and inventing one would be worse
-- than an honest null. A refund against such a collection reads the cost as
-- absent and FAILS SAFE (returns the full fee, retains nothing) rather than
-- retaining an unproven amount. v1 stays inactive until P7 regardless.

alter table payment_collections
  -- The actual third-party processing cost Stripe charged on this collection,
  -- in integer minor units, from balance_transaction.fee. Integer cents rather
  -- than numeric, mirroring application_fee_amount exactly (the 0116 reasoning).
  -- NEVER derived from the platform-fee percentage: the fee and the processing
  -- cost are separate values.
  add column if not exists processor_cost_minor integer,
  -- Where processor_cost_minor came from, so a reconciliation run can tell a
  -- captured cost from a placeholder. 'balance_transaction' at settlement,
  -- 'reconciled' when backfilled later, 'unavailable' when Stripe had not
  -- settled the balance transaction yet.
  add column if not exists processor_cost_source text,
  -- Capture state, so the refund core can require a PROVEN cost before
  -- retaining any of it. 'pending' until captured; existing rows default here.
  add column if not exists processor_cost_status text not null default 'pending',
  -- The application fee actually taken on this collection (mirrors the PI
  -- metadata application_fee_minor), persisted so the refund decision reads it
  -- from stored state rather than only from Stripe metadata.
  add column if not exists application_fee_minor integer,
  -- The fee-refund policy version this collection was SETTLED under, so a refund
  -- computed months later uses the policy in force at settlement, not whatever
  -- is globally active then. Null on pre-migration rows -> the core falls back
  -- to the active version.
  add column if not exists fee_refund_policy_version text,
  -- Cumulative non-recoverable processor cost already retained by prior refunds
  -- on this collection, so repeated / partial refunds can never retain the same
  -- cost twice. Starts at 0.
  add column if not exists processor_cost_retained_minor integer not null default 0;

do $$
begin
  -- Amounts are non-negative minor units.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_processor_cost_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_processor_cost_check
      check (processor_cost_minor is null or processor_cost_minor >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_application_fee_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_application_fee_check
      check (application_fee_minor is null or application_fee_minor >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_cost_retained_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_cost_retained_check
      check (processor_cost_retained_minor >= 0);
  end if;

  -- Closed vocabularies, mirrored in the settlement/refund code. Check
  -- constraints rather than enums: narrow, server-only, and cheap to widen.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_cost_source_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_cost_source_check
      check (processor_cost_source is null
        or processor_cost_source in ('balance_transaction', 'reconciled', 'unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_cost_status_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_cost_status_check
      check (processor_cost_status in ('pending', 'captured', 'unavailable'));
  end if;

  -- A captured cost must actually carry a number, and a number must be marked
  -- captured: the two cannot disagree, or the refund core's "is the cost
  -- proven?" test would read one and the other would contradict it.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_cost_status_agrees_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_cost_status_agrees_check
      check (
        (processor_cost_status = 'captured') = (processor_cost_minor is not null)
      );
  end if;
end $$;
