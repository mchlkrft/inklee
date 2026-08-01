-- FD5 [FINAL] wishlist + seller-scoped carts (founder ruling, 2026-08-01,
-- docs/product/plus-build-time-decisions.md — search "FD5").
--
-- COMMERCE MODEL (non-negotiable, from the ruling): a cart belongs to ONE
-- artist; products from different artists can never combine into one
-- payment; a buyer may hold separate carts for different artists at once; a
-- wishlist MAY span artists; moving a wishlist item to a cart must land it in
-- the correct seller cart.
--
-- BUYER IDENTITY. Verified before designing (see the FD5 decision-log entry
-- for the full reasoning): this product has NO buyer accounts anywhere.
-- `signUp` (app/(auth)/signup) only ever creates an ARTIST profile; a
-- booking's own "signed in" equivalent is holding a valid
-- `customer_token_hash` link, which is per-booking, not a persistent
-- identity across shops. So every buyer here is a guest, identified the same
-- way `booking_requests`/`payment_requests` already identify a guest client:
-- a random token handed to the browser, only its SHA-256 hash stored server
-- side (`shop-guest-identity.ts`). Nothing else about the buyer is stored —
-- no email, no IP, no name — until they actually check out, which is the
-- smallest shape that satisfies GS4 (guest-buyer privacy is already a
-- counsel-queue item; this stays off that queue's growth path).
--
-- WHICH CLIENT WRITES (the rls-write-policy-gap rule). Nobody but the server
-- ever writes these tables: there is no artist reader (a cart/wishlist is a
-- BUYER concept, an artist has no reason to see one), and the buyer has no
-- Supabase session at all (no auth.uid()), so there is no "user-scoped
-- client" for these tables the way `product_collections` or
-- `product_bundles` have one. Every read and write goes through a
-- `"use server"` action on the SERVICE-ROLE client, which verifies the
-- caller's cookie token (httpOnly, unreadable by page JS) against the stored
-- hash in application code — the exact posture `booking_requests`' customer
-- token portal already uses (0026 tried exposing that table to `anon` by
-- token equality and it was LOCKED DOWN in 0030: RLS cannot scope a policy to
-- "the one row whose hash equals this specific client-supplied value" any
-- more safely than just not exposing the table at all). So: RLS enabled, ZERO
-- policies for any role, and an explicit REVOKE of every verb from
-- `anon`/`authenticated` so a later careless `for all` policy can't undo it —
-- same shape as `refunds`/`refund_lines` (0139).
--
-- SELLER BOUNDARY — the hardest invariant here. `shop_cart_items.artist_id`
-- is denormalized onto every row, and TWO composite foreign keys bind it
-- simultaneously: (cart_id, artist_id) -> shop_carts(id, artist_id) and
-- (product_id, artist_id) / (bundle_id, artist_id) -> the product/bundle's
-- OWN (id, artist_id) key. A row can only exist where the cart's owner and
-- the item's owner are the SAME artist_id value — a cross-artist item is not
-- a row Postgres will store, for ANY role, including service role. This is
-- the FD6/refund_lines pattern (0132/0139) applied to the invariant the
-- founder called out by name: "refused, not filtered, not silently dropped."
-- `tests/db/shop-carts-seller-boundary.test.ts` proves it by trying the
-- forbidden insert directly and asserting the 23503.
--
-- CONVERGENCE (AGENTS.md): every named constraint gets its own existence
-- guard; nothing here relies on `create table if not exists` skipping an
-- inline declaration. Every policy (there are none to add, but the REVOKE
-- plays the same "cannot be undone by a careless re-run" role) is idempotent.
--
-- STALE PRICE / AVAILABILITY: deliberately, NOTHING here stores a price, a
-- title snapshot, or a stock count. A cart/wishlist row is a pointer
-- (product_id, variant_id, quantity) — price and availability are ALWAYS
-- resolved live, at render time and again at checkout, off the same catalog
-- reads `createStandaloneGoodsCheckoutCore` already uses. This eliminates
-- "staleness" by construction rather than by cache-invalidation: there is
-- nothing cached to go stale.

-- ===========================================================================
-- 1. shop_carts. One cart per (guest identity, artist).
create table if not exists shop_carts (
  id                uuid not null default gen_random_uuid(),
  guest_token_hash  text not null,
  artist_id         uuid not null,
  currency          text not null default 'eur',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shop_carts_pkey'
  ) then
    alter table shop_carts add constraint shop_carts_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_carts_artist_id_fkey'
  ) then
    alter table shop_carts
      add constraint shop_carts_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- FK target for shop_cart_items below: pairs (cart id, owner) as one unit.
  if not exists (
    select 1 from pg_constraint where conname = 'shop_carts_id_artist_key'
  ) then
    alter table shop_carts add constraint shop_carts_id_artist_key
      unique (id, artist_id);
  end if;

  -- One cart per artist per guest identity (find-or-create key).
  if not exists (
    select 1 from pg_constraint where conname = 'shop_carts_guest_artist_key'
  ) then
    alter table shop_carts add constraint shop_carts_guest_artist_key
      unique (guest_token_hash, artist_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_carts_currency_check'
  ) then
    alter table shop_carts add constraint shop_carts_currency_check
      check (currency = lower(currency) and char_length(currency) = 3);
  end if;
end $$;

create index if not exists shop_carts_guest_idx on shop_carts (guest_token_hash);

alter table shop_carts enable row level security;
revoke select, insert, update, delete, truncate on shop_carts from anon, authenticated;

-- ===========================================================================
-- 2. shop_cart_items. One row per (product+variant) or per bundle in a cart.
create table if not exists shop_cart_items (
  id           uuid not null default gen_random_uuid(),
  cart_id      uuid not null,
  -- Denormalized from the parent cart. Never allowed to disagree with it: the
  -- composite FK below binds (cart_id, artist_id) to shop_carts(id,
  -- artist_id), so a row naming a DIFFERENT artist_id than its own cart is
  -- not representable.
  artist_id    uuid not null,
  kind         text not null,
  product_id   uuid,
  variant_id   uuid,
  bundle_id    uuid,
  quantity     integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shop_cart_items_pkey'
  ) then
    alter table shop_cart_items add constraint shop_cart_items_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_cart_items_kind_check'
  ) then
    alter table shop_cart_items add constraint shop_cart_items_kind_check
      check (kind in ('product', 'bundle'));
  end if;

  -- Exactly one subject, matching its kind. Same shape as
  -- refund_lines_subject_check (0139) and order_items' own product/bundle
  -- split.
  if not exists (
    select 1 from pg_constraint where conname = 'shop_cart_items_subject_check'
  ) then
    alter table shop_cart_items add constraint shop_cart_items_subject_check
      check (
        (kind = 'product' and product_id is not null and bundle_id is null)
        or
        (kind = 'bundle' and bundle_id is not null and product_id is null and variant_id is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_cart_items_quantity_check'
  ) then
    alter table shop_cart_items add constraint shop_cart_items_quantity_check
      check (quantity > 0);
  end if;

  -- THE SELLER BOUNDARY. Every item's owner must be the SAME artist_id as its
  -- cart. Cascades: deleting the cart drops its items (an item has no life
  -- apart from its cart).
  if not exists (
    select 1 from pg_constraint where conname = 'shop_cart_items_cart_fk'
  ) then
    alter table shop_cart_items add constraint shop_cart_items_cart_fk
      foreign key (cart_id, artist_id) references shop_carts(id, artist_id)
      on delete cascade;
  end if;

  -- THE SELLER BOUNDARY, other half. A product-kind row's product must belong
  -- to the SAME artist_id as the row itself (and therefore, via the FK above,
  -- the same artist as the cart). ON DELETE CASCADE: a deleted product has
  -- nothing left to sell, unlike a collection membership.
  if not exists (
    select 1 from pg_constraint where conname = 'shop_cart_items_product_fk'
  ) then
    alter table shop_cart_items add constraint shop_cart_items_product_fk
      foreign key (product_id, artist_id) references products(id, artist_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_cart_items_bundle_fk'
  ) then
    alter table shop_cart_items add constraint shop_cart_items_bundle_fk
      foreign key (bundle_id, artist_id) references product_bundles(id, artist_id)
      on delete cascade;
  end if;

  -- Referential integrity only (not composite): same reasoning as
  -- product_bundle_items.variant_id (0138) — a composite FK's ON DELETE
  -- action would apply to every column at once, nulling product_id along
  -- with variant_id. "Belongs to this product" is enforced in application
  -- code (add-to-cart validates it against the SAME catalog read the
  -- checkout core uses), not by this FK.
  if not exists (
    select 1 from pg_constraint where conname = 'shop_cart_items_variant_id_fkey'
  ) then
    alter table shop_cart_items add constraint shop_cart_items_variant_id_fkey
      foreign key (variant_id) references product_variants(id) on delete set null;
  end if;
end $$;

-- Dedupe: at most one row per (cart, product, variant) or per (cart, bundle).
-- COALESCE folds a null variant_id to a sentinel so two "no variant chosen"
-- rows for the same product collide (Postgres treats NULL as distinct from
-- itself in a plain unique index, the same hole 0138 documents for bundle
-- items).
create unique index if not exists shop_cart_items_product_unique
  on shop_cart_items (cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'))
  where kind = 'product';

create unique index if not exists shop_cart_items_bundle_unique
  on shop_cart_items (cart_id, bundle_id)
  where kind = 'bundle';

create index if not exists shop_cart_items_cart_idx on shop_cart_items (cart_id);

alter table shop_cart_items enable row level security;
revoke select, insert, update, delete, truncate on shop_cart_items from anon, authenticated;

-- ===========================================================================
-- 3. shop_wishlist_items. Cross-artist by design (FD5): no cart_id, no
--    per-artist grouping table — just a flat list keyed by guest identity.
--    artist_id is still denormalized and FK-bound to the product's own
--    owner, so "move to cart" always resolves the CORRECT seller cart by
--    reading it off this row rather than trusting any client-supplied value.
create table if not exists shop_wishlist_items (
  id                uuid not null default gen_random_uuid(),
  guest_token_hash  text not null,
  artist_id         uuid not null,
  product_id        uuid not null,
  variant_id        uuid,
  created_at        timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shop_wishlist_items_pkey'
  ) then
    alter table shop_wishlist_items add constraint shop_wishlist_items_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_wishlist_items_product_fk'
  ) then
    alter table shop_wishlist_items add constraint shop_wishlist_items_product_fk
      foreign key (product_id, artist_id) references products(id, artist_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_wishlist_items_variant_id_fkey'
  ) then
    alter table shop_wishlist_items add constraint shop_wishlist_items_variant_id_fkey
      foreign key (variant_id) references product_variants(id) on delete set null;
  end if;
end $$;

create unique index if not exists shop_wishlist_items_unique
  on shop_wishlist_items (guest_token_hash, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'));

create index if not exists shop_wishlist_items_guest_idx on shop_wishlist_items (guest_token_hash);

alter table shop_wishlist_items enable row level security;
revoke select, insert, update, delete, truncate on shop_wishlist_items from anon, authenticated;

-- ===========================================================================
-- 4. orders.cart_id. Threaded through createStandaloneGoodsCheckoutCore so a
--    successful settle can clear the cart it came from (SUCCESSFUL-PAYMENT
--    CLEANUP). ON DELETE SET NULL: a cart is ephemeral shopping-list data and
--    may be cleared/deleted independently of the historical order record it
--    produced; the order must never disappear or break because its cart did.
alter table orders add column if not exists cart_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_cart_id_fkey'
  ) then
    alter table orders
      add constraint orders_cart_id_fkey
      foreign key (cart_id) references shop_carts(id) on delete set null;
  end if;
end $$;

create index if not exists orders_cart_id_idx on orders (cart_id) where cart_id is not null;
