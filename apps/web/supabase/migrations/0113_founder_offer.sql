-- Founder offer eligibility (Plus build, founder direction 2026-07-28).
--
-- Fixes a real defect: the first-year yearly coupon was applied to EVERY
-- yearly checkout, with no cohort cap, no enrollment window and no eligibility
-- record. The approved offer is the first 100 eligible subscribers within a
-- six-month window, yearly only, non-transferable.
--
-- Deliberately NOT a general promotion-code system: no public code, no admin
-- UI, no arbitrary campaigns. Two small tables carrying exactly the approved
-- terms and the evidence for each decision.
--
-- Both tables are service-role only (no RLS policies), matching the billing
-- convention: artists never read or write offer state, the server decides.

-- The offer's terms. A row must EXIST for the offer to be open, so the default
-- state (no row) is closed, and opening it is a deliberate act.
create table if not exists founder_offer_policy (
  policy_version   text primary key,
  starts_at        timestamptz,
  ends_at          timestamptz,
  max_redemptions  integer not null default 100,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table founder_offer_policy enable row level security;

-- One row per granted redemption. This table IS the cap: the unique cohort
-- position is what makes two concurrent "100th" checkouts resolve to exactly
-- one winner, and the unique artist_id makes the offer non-transferable and
-- once-per-account (a cancelled founder subscription never frees a slot).
create table if not exists founder_offer_redemptions (
  id                  uuid primary key default gen_random_uuid(),
  artist_id           uuid not null references profiles(id) on delete cascade,
  stripe_customer_id  text,
  cohort_position     integer not null,
  eligibility_reason  text not null,
  policy_version      text not null,
  redeemed_at         timestamptz not null default now(),
  constraint founder_offer_one_per_artist unique (artist_id),
  constraint founder_offer_unique_position unique (policy_version, cohort_position)
);

create index if not exists founder_offer_redemptions_policy_idx
  on founder_offer_redemptions (policy_version, redeemed_at desc);

alter table founder_offer_redemptions enable row level security;
