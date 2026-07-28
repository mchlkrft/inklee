-- Discount codes (Plus build P5b).
--
-- Ordered first among the goods tools for a reason that is not product
-- preference: the approved goods fee applies to "product subtotal AFTER
-- discounts" (plus-product-spec.md section 10). Until discounts exist, the fee
-- base cannot be correct, so activating fee schedule v2 before this would
-- charge on a number the spec does not describe.
--
-- Redemption accounting lives in its own table rather than as a counter on the
-- code. A counter is a read-modify-write, and two clients checking out with the
-- last remaining redemption would both see "1 left" and both succeed. A row per
-- redemption with a unique constraint makes the database the arbiter, which is
-- the same reasoning the founder-offer cohort cap uses (migration 0113).

create table if not exists discount_codes (
  id                uuid primary key default gen_random_uuid(),
  artist_id         uuid not null references profiles(id) on delete cascade,
  -- Stored uppercase and compared uppercase. Clients type these from a phone
  -- with autocapitalise doing whatever it likes, so case can never be the
  -- difference between a working code and a rejected one.
  code              text not null,
  kind              text not null check (kind in ('percent', 'fixed')),
  -- Basis points for percent (1000 = 10%), minor units for fixed. One column
  -- because the pair is never both, and two nullable columns would make an
  -- invalid half-set state representable.
  value             integer not null check (value > 0),
  currency          text not null default 'eur',
  -- Minimum goods subtotal in minor units before the code applies at all.
  min_subtotal_minor integer not null default 0 check (min_subtotal_minor >= 0),
  -- Null = no limit. The cap is enforced by discount_redemptions, not here.
  max_redemptions   integer check (max_redemptions is null or max_redemptions > 0),
  starts_at         timestamptz,
  ends_at           timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint discount_percent_range check (
    kind <> 'percent' or (value > 0 and value <= 10000)
  ),
  constraint discount_window check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

-- One live code per artist per string. Case is normalized on write, so this
-- also prevents "SUMMER" and "summer" existing side by side.
create unique index if not exists discount_codes_artist_code_idx
  on discount_codes (artist_id, code);

alter table discount_codes enable row level security;

create policy "artist reads own discount codes" on discount_codes
  for select using (artist_id = auth.uid());

-- ---------------------------------------------------------------------------
-- One row per successful redemption. THIS table is the cap.
create table if not exists discount_redemptions (
  id               uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references discount_codes(id) on delete cascade,
  -- Denormalized for single-column RLS (house convention).
  artist_id        uuid not null references profiles(id) on delete cascade,
  order_id         uuid references orders(id) on delete set null,
  -- What the discount actually took off, in minor units. Recorded rather than
  -- recomputed: a code's value can be edited afterwards, and an old order must
  -- keep the discount it was actually given.
  amount_minor     integer not null check (amount_minor >= 0),
  redeemed_at      timestamptz not null default now(),
  -- An order redeems a code at most once. Makes the webhook's redemption
  -- write idempotent under Stripe's redelivery for free.
  constraint discount_one_per_order unique (discount_code_id, order_id)
);

create index if not exists discount_redemptions_code_idx
  on discount_redemptions (discount_code_id, redeemed_at desc);

alter table discount_redemptions enable row level security;

create policy "artist reads own discount redemptions" on discount_redemptions
  for select using (artist_id = auth.uid());

-- ---------------------------------------------------------------------------
-- What the order was actually given. Nullable: existing orders had no
-- discount, and there is nothing honest to backfill.
alter table orders
  add column if not exists discount_code_id uuid
    references discount_codes(id) on delete set null,
  add column if not exists discount_amount numeric(10,2);
