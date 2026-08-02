-- 0142: consumer-law disclosures for the goods checkout (Plus build, counsel
-- wording docs/legal/counsel-accountant-handoff-2026-08.md Part 4, C1.1-C1.3).
--
-- Two independent additions:
--
-- 1. SELLER IDENTITY (C1.1). The checkout's disclosure block ("Sold by
--    [artist trading name], [artist address]... contact the artist at
--    [artist contact]") needs somewhere to read real data from. Lives on
--    `profiles` because it is account-level, not per-product, and every
--    checkout-surface read already starts from a `profiles` row keyed by
--    artist id. Counsel's own prerequisite: "Artists without complete seller
--    data cannot enable the shop" — enforced in application code
--    (sellerDataComplete, checked on the money path), not here; these columns
--    are nullable so an artist can exist without ever having filled them in,
--    which is every artist today.
--
-- 2. CUSTOM-MADE FLAG (C1.2). Art. 16(c) CRD's no-return exemption is claimed
--    PER PRODUCT, never as a blanket Terms claim. `products.custom_made`
--    is the artist's own declaration; `order_items.custom_made_snapshot` and
--    `order_item_bundle_components.custom_made_snapshot` freeze that
--    declaration at SALE TIME, the same pattern `title_snapshot` /
--    `variant_snapshot` already use — an artist relabelling a product after
--    the sale must never rewrite what a past buyer's receipt is allowed to
--    say about their return right.
--
-- ⚠️ PROFILES COLUMN-GRANT FOOTGUN (0074/0089, AGENTS.md): 0074 revoked
-- table-level UPDATE on profiles and re-grants only an enumerated column
-- list; a new column written via a user-scoped client (the settings/goods
-- form, not service-role) is invisible to authenticated writers until it is
-- added to that grant. The three seller_* columns below are written from the
-- artist's own session (apps/web/src/app/(artist)/goods/actions.ts,
-- saveSellerDetailsAction), so the GRANT UPDATE extension at the bottom of
-- this file is not optional. products/order_items/order_item_bundle_components
-- carry no column-level grants (row-level RLS only), so custom_made and its
-- snapshots need no such extension.

alter table profiles
  add column if not exists seller_trading_name text,
  add column if not exists seller_address text,
  add column if not exists seller_contact text;

alter table products
  add column if not exists custom_made boolean not null default false;

alter table order_items
  add column if not exists custom_made_snapshot boolean not null default false;

alter table order_item_bundle_components
  add column if not exists custom_made_snapshot boolean not null default false;

-- Extend the 0074 column-privilege allowlist so the artist's own session can
-- write their seller details (settings/goods form, user-scoped client).
-- REVOKE-then-GRANT would clobber every column 0074/0076/0084/0102 already
-- granted; GRANT is additive, so this only ADDS the three new columns to
-- whatever the allowlist already contains.
grant update (seller_trading_name, seller_address, seller_contact)
  on public.profiles to authenticated;
