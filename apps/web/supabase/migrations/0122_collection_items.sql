-- Many-to-many collection membership + archive lifecycle (Plus build P5d).
--
-- EXPAND step of expand / migrate / verify / contract. This migration ADDS the
-- new model and backfills it. `products.collection_id` is deliberately LEFT IN
-- PLACE and is dropped only by a later cleanup migration, after production
-- equivalence has been verified.
--
-- Why many-to-many: the approved design puts a product in more than one
-- section ("Prints" and "Winter drop"), each section owning its own order.
-- A single FK cannot express either.

-- ---------------------------------------------------------------------------
-- Archive lifecycle on the collection itself.
--
-- Archiving is not the same as hiding. `is_public_visible` is a layout choice
-- an artist flips while arranging their shop; archived means retired, keeps
-- its membership and ordering, and can be restored whole. Both hide the
-- collection publicly; only one is reversible-by-design bookkeeping.
alter table product_collections
  add column if not exists archived_at timestamptz;

-- The artist's live list: everything not archived, in their order.
create index if not exists product_collections_live_idx
  on product_collections (artist_id, position)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- Membership.
create table if not exists product_collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references product_collections(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  -- Denormalized for single-column RLS (house convention, migration 0080).
  -- Kept honest by the WITH CHECK below, which also verifies that BOTH
  -- referenced rows belong to the same artist.
  artist_id     uuid not null references profiles(id) on delete cascade,
  -- Per-collection ordering. The same product can sit at position 0 in one
  -- collection and 7 in another, which is the whole point of the join table.
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  -- A product appears at most once in a given collection. This also makes the
  -- backfill and the legacy-mirror trigger below idempotent for free.
  constraint product_collection_items_unique unique (collection_id, product_id)
);

-- Rendering a collection: its products in order.
create index if not exists product_collection_items_collection_idx
  on product_collection_items (collection_id, position);
-- The reverse lookup: which collections is this product in?
create index if not exists product_collection_items_product_idx
  on product_collection_items (product_id);

alter table product_collection_items enable row level security;

-- SELECT is scoped by the denormalized owner column.
-- Policies are dropped-then-created rather than created bare: Postgres has no
-- `create policy if not exists`, so a bare create aborts a re-run, and a
-- migration that cannot be safely retried is a migration that can strand a
-- half-applied schema. Found by re-running this file during verification.
drop policy if exists "artist reads own collection items" on product_collection_items;
create policy "artist reads own collection items" on product_collection_items
  for select using (artist_id = auth.uid());

-- Writes additionally verify BOTH referenced rows. `artist_id = auth.uid()`
-- alone would let an artist file someone else's product into their own
-- collection, or their own product into someone else's, simply by naming the
-- foreign id: the FK only proves the row exists, never who owns it.
drop policy if exists "artist inserts own collection items" on product_collection_items;
create policy "artist inserts own collection items" on product_collection_items
  for insert with check (
    artist_id = auth.uid()
    and exists (
      select 1 from product_collections c
      where c.id = collection_id and c.artist_id = auth.uid()
    )
    and exists (
      select 1 from products p
      where p.id = product_id and p.artist_id = auth.uid()
    )
  );

drop policy if exists "artist updates own collection items" on product_collection_items;
create policy "artist updates own collection items" on product_collection_items
  for update using (artist_id = auth.uid())
  with check (
    artist_id = auth.uid()
    and exists (
      select 1 from product_collections c
      where c.id = collection_id and c.artist_id = auth.uid()
    )
    and exists (
      select 1 from products p
      where p.id = product_id and p.artist_id = auth.uid()
    )
  );

drop policy if exists "artist deletes own collection items" on product_collection_items;
create policy "artist deletes own collection items" on product_collection_items
  for delete using (artist_id = auth.uid());

-- ---------------------------------------------------------------------------
-- BACKFILL every existing legacy assignment.
--
-- Idempotent via the unique constraint, so re-running this migration (or
-- running it after some rows already exist) adds nothing twice. Position is
-- seeded from the product's own shop order, which is the only ordering that
-- existed before per-collection ordering did.
insert into product_collection_items (collection_id, product_id, artist_id, position)
select
  p.collection_id,
  p.id,
  p.artist_id,
  row_number() over (partition by p.collection_id order by p.sort_order, p.created_at) - 1
from products p
where p.collection_id is not null
on conflict (collection_id, product_id) do nothing;

-- ---------------------------------------------------------------------------
-- COMPATIBILITY: mirror legacy-column writes into the new model.
--
-- `products` carries a FOR ALL policy, so any authenticated artist can still
-- set `products.collection_id` directly through PostgREST, and a client built
-- before this migration would. Without this trigger such a write would be
-- invisible to the new model and the two would silently disagree.
--
-- One-way by design: legacy column -> join table. New code writes the join
-- table directly and never touches `collection_id`, so this never fires for
-- it. That asymmetry is what makes it safe to delete in the contract step.
--
-- SECURITY DEFINER because the trigger writes a table whose RLS the invoking
-- statement is not evaluating. It cannot be abused: every value it writes is
-- taken from the products row being changed, which the caller already owns.
create or replace function sync_legacy_collection_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Membership removed or moved: drop the row for the OLD collection.
  if tg_op = 'UPDATE'
     and old.collection_id is not null
     and new.collection_id is distinct from old.collection_id then
    delete from product_collection_items
    where collection_id = old.collection_id and product_id = old.id;
  end if;

  if new.collection_id is not null then
    insert into product_collection_items
      (collection_id, product_id, artist_id, position)
    values (new.collection_id, new.id, new.artist_id, coalesce(new.sort_order, 0))
    on conflict (collection_id, product_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists products_sync_legacy_collection on products;
create trigger products_sync_legacy_collection
  after insert or update of collection_id on products
  for each row execute function sync_legacy_collection_membership();
