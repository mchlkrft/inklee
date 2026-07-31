-- Product bundles (Plus build, Stage 3).
--
-- A bundle is a named group of products sold together at ONE set price ("Starter
-- kit: 3 prints for 40 EUR"). Structurally it is collections' shape (a parent +
-- a join table, per-artist, positioned) PLUS a price of its own, so an artist
-- can present an offer. Modelled directly on product_collections (0120-0124) so
-- an artist meets one mental model for "group of products", and so this file can
-- reuse the proven RLS + composite-FK + convergence patterns rather than
-- inventing new ones.
--
-- SCOPE (decision B1, docs/product/plus-build-time-decisions.md): this ships the
-- ENTITY (create, manage, display, and show the saving vs the component list
-- prices). Turning a bundle into `order_items` at checkout is a SEPARATE
-- follow-on slice, because the payable goods checkout is dark today
-- (GOODS_COMMERCE_ENABLED off, goods fee 0% under v1) and the bundle-price ->
-- order-line -> goods-fee-base decomposition is the one genuinely new money
-- surface here. It gets its own slice with tests against the v2 rates rather
-- than riding in on the entity build.
--
-- v1 groups PRODUCTS, not variants (no variant_id): a bundle item is a product
-- and a quantity. Variant-level bundles are additive later if wanted.
--
-- =========================================================================
-- WHICH CLIENT WRITES. Both tables are written by the ARTIST on the USER-scoped
-- client (the goods editor), exactly like product_collections. So BOTH get real
-- per-command write policies (insert/update/delete, TO authenticated, WITH
-- CHECK), NOT a SELECT-only policy. This is the 0120/0123 lesson applied UP
-- FRONT: product_collections (0120) and discount_codes (0118) each shipped RLS
-- enabled with a SELECT-only policy while their writes ran on the user client,
-- so every write was rejected in production (a 100% broken feature that every
-- pure-function test still passed). Repaired in 0121/0123. This file does not
-- repeat it.
--
--   product_bundles       artist, USER-scoped client -> S/I/U/D policies
--   product_bundle_items  artist, USER-scoped client -> S/I/U/D policies
--
-- =========================================================================
-- CONVERGENCE (AGENTS.md). `create table if not exists` checks the TABLE's
-- existence, so anything declared INLINE in its column/constraint list is
-- skipped once the table exists and can never be restored by re-running. So
-- every NAMED constraint (primary keys, foreign keys, unique keys, checks) is
-- added through a guarded `do $$ ... if not exists ... alter table ... add
-- constraint ... end $$;` block, and every policy is drop-then-created. Only
-- column TYPES, NOT NULL and DEFAULTS stay inline (they are part of the column
-- definition, not separate objects). 0122/0125 are the reference; 0120's inline
-- PK/FK are the anti-pattern this file avoids.

-- ===========================================================================
-- 1. product_bundles. The offer: a name, a price, an owner.
create table if not exists product_bundles (
  id                uuid not null default gen_random_uuid(),
  artist_id         uuid not null,
  name              text not null,
  -- The bundle's set price, in the artist's currency. numeric(10,2) matching
  -- products.price_amount (bundles are priced like a product), not integer
  -- minor units: this is display + the artist's offer, and the checkout slice
  -- converts to minor units at charge time exactly as the product path does.
  price_amount      numeric(10,2) not null default 0,
  currency          text not null default 'eur',
  -- A bundle can be hidden without deleting it, to stage an offer before it goes
  -- live (mirrors product_collections.is_public_visible).
  is_public_visible boolean not null default true,
  position          integer not null default 0,
  -- Soft archive (mirrors product_collections.archived_at, 0122): an artist
  -- retires an offer without destroying its record or its item history.
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_bundles_pkey'
  ) then
    alter table product_bundles add constraint product_bundles_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'product_bundles_artist_id_fkey'
  ) then
    alter table product_bundles
      add constraint product_bundles_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- The FK target the item join binds to: it lets a bundle item reference
  -- (bundle, owner) as one unit, so a cross-owner item is unrepresentable for
  -- every role including the service role.
  if not exists (
    select 1 from pg_constraint where conname = 'product_bundles_id_artist_key'
  ) then
    alter table product_bundles
      add constraint product_bundles_id_artist_key unique (id, artist_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'product_bundles_price_check'
  ) then
    alter table product_bundles
      add constraint product_bundles_price_check check (price_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'product_bundles_currency_check'
  ) then
    alter table product_bundles
      add constraint product_bundles_currency_check
      check (currency = lower(currency) and char_length(currency) = 3);
  end if;
end $$;

create index if not exists product_bundles_artist_idx
  on product_bundles (artist_id, position);

alter table product_bundles enable row level security;

-- WRITTEN BY THE ARTIST ON THE USER-SCOPED CLIENT, so all four verbs get real
-- policies. TO authenticated is explicit (an untargeted policy also binds anon).
-- Drop-then-create because Postgres has no `create policy if not exists`, and
-- drop-then-create additionally repairs a present-but-wrong-shaped policy.
drop policy if exists "artist reads own bundles" on product_bundles;
create policy "artist reads own bundles" on product_bundles
  for select to authenticated using (artist_id = auth.uid());

drop policy if exists "artist inserts own bundles" on product_bundles;
create policy "artist inserts own bundles" on product_bundles
  for insert to authenticated with check (artist_id = auth.uid());

-- WITH CHECK re-asserts ownership: without it an owner could update a row and
-- hand it to another artist.
drop policy if exists "artist updates own bundles" on product_bundles;
create policy "artist updates own bundles" on product_bundles
  for update to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

drop policy if exists "artist deletes own bundles" on product_bundles;
create policy "artist deletes own bundles" on product_bundles
  for delete to authenticated using (artist_id = auth.uid());

-- ===========================================================================
-- 2. product_bundle_items. Which products are in a bundle, and how many.
create table if not exists product_bundle_items (
  id           uuid not null default gen_random_uuid(),
  bundle_id    uuid not null,
  product_id   uuid not null,
  -- Denormalized for single-column RLS (house convention, migration 0080). It
  -- cannot drift: the composite foreign keys below bind bundle_id AND product_id
  -- to THIS artist_id, so a row pairing artist A's bundle with artist B's
  -- product is not a row Postgres will store, for any role.
  artist_id    uuid not null,
  -- How many of this product the bundle includes.
  quantity     integer not null default 1,
  -- Order within the bundle.
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_bundle_items_pkey'
  ) then
    alter table product_bundle_items add constraint product_bundle_items_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'product_bundle_items_artist_id_fkey'
  ) then
    alter table product_bundle_items
      add constraint product_bundle_items_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- A product appears at most once in a given bundle (its count is `quantity`).
  if not exists (
    select 1 from pg_constraint where conname = 'product_bundle_items_unique'
  ) then
    alter table product_bundle_items
      add constraint product_bundle_items_unique unique (bundle_id, product_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'product_bundle_items_quantity_check'
  ) then
    alter table product_bundle_items
      add constraint product_bundle_items_quantity_check check (quantity > 0);
  end if;

  -- The cross-ownership guarantee, as composite foreign keys. Each half carries
  -- artist_id, so both parents must agree with each other AND with this row.
  -- ON DELETE CASCADE on both: deleting the bundle drops its items, and deleting
  -- a product drops it from every bundle (an item pointing at a gone product is
  -- a broken line, unlike a collection where the product just ungroups).
  if not exists (
    select 1 from pg_constraint where conname = 'product_bundle_items_bundle_fk'
  ) then
    alter table product_bundle_items
      add constraint product_bundle_items_bundle_fk
      foreign key (bundle_id, artist_id)
      references product_bundles(id, artist_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'product_bundle_items_product_fk'
  ) then
    alter table product_bundle_items
      add constraint product_bundle_items_product_fk
      foreign key (product_id, artist_id)
      references products(id, artist_id) on delete cascade;
  end if;
end $$;

-- Rendering a bundle: its products in order.
create index if not exists product_bundle_items_bundle_idx
  on product_bundle_items (bundle_id, position);
-- The reverse lookup: which bundles is this product in?
create index if not exists product_bundle_items_product_idx
  on product_bundle_items (product_id);

alter table product_bundle_items enable row level security;

drop policy if exists "artist reads own bundle items" on product_bundle_items;
create policy "artist reads own bundle items" on product_bundle_items
  for select to authenticated using (artist_id = auth.uid());

-- Writes additionally verify BOTH referenced rows. `artist_id = auth.uid()`
-- alone would let an artist file someone else's product into their own bundle,
-- or their own product into someone else's, by naming the foreign id: the FK
-- proves the row exists, never who owns it.
drop policy if exists "artist inserts own bundle items" on product_bundle_items;
create policy "artist inserts own bundle items" on product_bundle_items
  for insert to authenticated with check (
    artist_id = auth.uid()
    and exists (
      select 1 from product_bundles b
      where b.id = bundle_id and b.artist_id = auth.uid()
    )
    and exists (
      select 1 from products p
      where p.id = product_id and p.artist_id = auth.uid()
    )
  );

drop policy if exists "artist updates own bundle items" on product_bundle_items;
create policy "artist updates own bundle items" on product_bundle_items
  for update to authenticated using (artist_id = auth.uid())
  with check (
    artist_id = auth.uid()
    and exists (
      select 1 from product_bundles b
      where b.id = bundle_id and b.artist_id = auth.uid()
    )
    and exists (
      select 1 from products p
      where p.id = product_id and p.artist_id = auth.uid()
    )
  );

drop policy if exists "artist deletes own bundle items" on product_bundle_items;
create policy "artist deletes own bundle items" on product_bundle_items
  for delete to authenticated using (artist_id = auth.uid());
