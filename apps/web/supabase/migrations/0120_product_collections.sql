-- Product collections (Plus build P5d).
--
-- Grouping for the public shop: "Prints", "Winter drop", "Aftercare". Modelled
-- directly on flash_folders (a name, a position, an artist) with a nullable FK
-- on the item, because that pattern is already proven here and an artist
-- should not meet two different mental models for the same idea in one app.
--
-- ON DELETE SET NULL, like flash_items.folder_id: deleting a collection must
-- never delete the products in it. An artist tidying their shop is not asking
-- to destroy stock, and the products simply become ungrouped.

create table if not exists product_collections (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid not null references profiles(id) on delete cascade,
  name          text not null,
  position      integer not null default 0,
  -- A collection can be hidden without ungrouping its products, which is how
  -- an artist stages a drop's collection before the drop itself.
  is_public_visible boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists product_collections_artist_idx
  on product_collections (artist_id, position);

alter table product_collections enable row level security;

create policy "artist reads own collections" on product_collections
  for select using (artist_id = auth.uid());

alter table products
  add column if not exists collection_id uuid
    references product_collections(id) on delete set null;

create index if not exists products_collection_idx
  on products (collection_id, sort_order)
  where collection_id is not null;
