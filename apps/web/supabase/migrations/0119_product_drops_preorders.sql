-- Scheduled drops, preorders and low-stock alerts (Plus build P5c).
--
-- Drops are named in the spec as a headline tattoo-scene feature: an artist
-- announces a piece, a time, and everyone shows up at once. A preorder is the
-- other half of the same idea, letting someone commit before the thing is
-- physically ready.
--
-- Three columns, no new tables. The availability RULE is the part that matters
-- and it lives in packages/shared/src/product-availability.ts, because there
-- are THREE public gates that decide whether a product can be bought (the shop
-- teaser, the checkout catalogue, and the line composer that re-checks at
-- payment time). A drop honoured by two of the three would let a scheduled
-- product be bought before it dropped, which is exactly the thing the feature
-- promises cannot happen.

alter table products
  -- Null = available now, which is every existing product. A future value
  -- means the product is announced but not yet purchasable.
  add column if not exists available_from timestamptz,
  -- Purchasable before availability and without stock. Deliberately separate
  -- from `available_from`: a drop with preorder on is a pre-sale, a drop with
  -- it off is a queue, and collapsing them into one flag would remove the
  -- artist's choice between the two.
  add column if not exists preorder boolean not null default false,
  -- Null = no alert. When stock falls to or below this after a sale, the
  -- artist gets one notification.
  add column if not exists low_stock_threshold integer
    check (low_stock_threshold is null or low_stock_threshold >= 0),
  -- When the last low-stock alert fired, so restocking and selling down again
  -- alerts a second time while a series of sales below the line does not.
  add column if not exists low_stock_alerted_at timestamptz;

-- The shop read: an artist's purchasable products, drop time included so the
-- "drops at" sort is not a full scan once catalogues grow.
create index if not exists products_artist_available_idx
  on products (artist_id, available_from)
  where is_public_visible = true;
