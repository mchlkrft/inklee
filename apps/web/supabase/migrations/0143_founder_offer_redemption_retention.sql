-- 0143: Founder-offer redemption retention on account deletion (C1.10 follow-up).
--
-- BDEL-RET-001 enumerated eleven tables cascading from `profiles` that carry
-- billing/tax records the Terms and Privacy documents promise survive account
-- deletion: 0106's nine (account_billing_profiles, account_overrides is NOT
-- one of the nine — see below, billing_consent_records, billing_contract_
-- confirmations, billing_quotes, billing_risk_events, billing_subscriptions,
-- transaction_tax_snapshots, vies_validation_attempts, withdrawal_cases) plus
-- two tables OUTSIDE 0106 that its own count initially missed:
-- account_overrides (0105) and founder_offer_redemptions (0113).
--
-- 0129 fixed five of the eleven (billing_consent_records, billing_
-- subscriptions, transaction_tax_snapshots, billing_contract_confirmations,
-- withdrawal_cases) and its own header comment records a DELIBERATE decision
-- to leave four more on CASCADE: account_billing_profiles, vies_validation_
-- attempts, billing_quotes, billing_risk_events — all four are pure
-- classification/operational data with no independent revenue-substantiation
-- role (the amounts and tax treatment actually applied are already retained,
-- per-transaction, in transaction_tax_snapshots).
--
-- That is nine of eleven decided. The remaining two were never evaluated by
-- 0129 at all — it was scoped to "0106's tables" by its own header, and both
-- of these sit outside 0106. This migration is that missing evaluation,
-- against the same standard: does the table hold a record needed to
-- substantiate revenue or a pricing decision (RETAIN, pseudonymised, matching
-- 0129's pattern), or is it forward-looking configuration with nothing a tax
-- or legal-claims record needs that isn't already retained elsewhere (STAYS
-- CASCADE, matching 0129's four)?
--
-- DECIDED: account_overrides STAYS CASCADE, not touched by this migration.
-- It is entitlement/access-control configuration (plan_tier, plan_source,
-- fee-sponsorship budget and usage, entitlement_overrides, a free-text
-- admin_notes column — apps/web/supabase/migrations/0045_account_overrides.sql)
-- with no historical revenue-substantiation role: the amounts an artist was
-- actually billed, and under which tax treatment, live in the
-- already-retained billing_subscriptions and transaction_tax_snapshots rows
-- (0129), which have everything account_overrides does not. Retaining a
-- free-text admin-notes column and a sponsorship budget past account deletion
-- would be pure over-retention with no accounting or legal-claims purpose,
-- the wrong direction for a fix meant to narrow retention to what is required.
--
-- FIXED: founder_offer_redemptions moves to ON DELETE SET NULL, the same
-- pattern 0129 used for the five it fixed. Unlike account_overrides, this
-- table has no live-config role at all — apps/web/src/lib/server/billing/
-- founder-offer.ts's resolveFounderOffer() only ever READS it to check a cap
-- and a once-per-account guard, both of which are moot the instant the
-- account is deleted. What it retains is the "why this amount" evidence a
-- chargeback dispute or an accounting query on the artist's (already-
-- retained) transaction_tax_snapshots/billing_subscriptions rows would need:
-- the Stripe customer id the discount was granted against, the cohort
-- position, the policy version, and the grant timestamp. It carries no free
-- text: `eligibility_reason` is stamped only from recordFounderOfferRedemption
-- (founder-offer.ts:120-134), called only after resolveFounderOffer() returns
-- `{ eligible: true, reason: "eligible" }` (founder-offer.ts:103) — the
-- literal string "eligible" is the only value ever written. Same shape as
-- billing_consent_records: a discrete, Stripe-pointered decision record, not
-- a mutable classification row like account_billing_profiles/account_overrides.
--
-- `founder_offer_one_per_artist unique (artist_id)` needs no change: a plain
-- UNIQUE constraint (not NULLS NOT DISTINCT) treats every NULL as distinct
-- from every other NULL, so multiple redeemed-then-deleted accounts can all
-- carry artist_id = NULL without conflict. `founder_offer_unique_position
-- unique (policy_version, cohort_position)` is untouched by this migration and
-- unaffected: only artist_id is nulled.

alter table founder_offer_redemptions
  alter column artist_id drop not null;
alter table founder_offer_redemptions
  drop constraint founder_offer_redemptions_artist_id_fkey,
  add constraint founder_offer_redemptions_artist_id_fkey
    foreign key (artist_id) references profiles(id) on delete set null;

-- Verify (respect AGENTS.md migration bookkeeping): supabase db push; do NOT
-- migration repair --status applied.
--   select conname, confdeltype from pg_constraint
--     where conname = 'founder_offer_redemptions_artist_id_fkey';  -- expect confdeltype = 'n'
--   select attnotnull from pg_attribute
--     where attrelid = 'founder_offer_redemptions'::regclass and attname = 'artist_id';  -- expect false
