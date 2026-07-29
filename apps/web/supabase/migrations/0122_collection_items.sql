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
-- Composite parent keys, so the join table can reference (row, owner) as a
-- unit rather than just (row).
--
-- Both are trivially unique already: `id` is the primary key of each table, so
-- these add a guarantee Postgres could have inferred but cannot USE as an FK
-- target without it being declared.
--
-- `add constraint` has no `if not exists`, so it is guarded: a migration that
-- aborts on re-run can strand a half-applied schema.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_collections_id_artist_key'
  ) then
    alter table product_collections
      add constraint product_collections_id_artist_key unique (id, artist_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'products_id_artist_key'
  ) then
    alter table products
      add constraint products_id_artist_key unique (id, artist_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Membership.
create table if not exists product_collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  product_id    uuid not null,
  -- Denormalized for single-column RLS (house convention, migration 0080).
  --
  -- This column cannot drift, and that is enforced by the composite foreign
  -- keys below rather than by anyone remembering to keep it in step: they bind
  -- collection_id AND product_id to THIS artist_id, so a row pairing artist
  -- A's collection with artist B's product is not a row Postgres will store.
  --
  -- RLS alone would not get there. Policies constrain client roles; the
  -- service role bypasses them entirely, and the service client is what runs
  -- webhooks, admin paths and backfills. A constraint holds for every role,
  -- including a future caller nobody has written yet.
  artist_id     uuid not null references profiles(id) on delete cascade,
  -- Per-collection ordering. The same product can sit at position 0 in one
  -- collection and 7 in another, which is the whole point of the join table.
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  -- A product appears at most once in a given collection. This also makes the
  -- backfill and the legacy-mirror trigger below idempotent for free.
  constraint product_collection_items_unique unique (collection_id, product_id)
);

-- The cross-ownership guarantee. Each half carries artist_id, so both parents
-- must agree with each other AND with this row.
--
-- GUARDED, not inline in the `create table` above, and that is not cosmetic.
-- `create table if not exists` checks the TABLE's existence; anything
-- declared inline in its column/constraint list is skipped entirely once the
-- table exists, so a constraint placed there can never be restored by
-- re-running this file. Found empirically 2026-07-29: with the table already
-- present and both FKs dropped by hand, re-running the inline version of this
-- migration reported `relation "product_collection_items" already exists,
-- skipping` and restored neither — exit 0, having repaired nothing. Guarded
-- the same way as the two parent unique keys above, which already got this
-- right, so a future drop-and-rerun actually converges instead of silently
-- no-opping. See the AGENTS.md footgun entry for the general pattern.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_collection_items_collection_fk'
  ) then
    alter table product_collection_items
      add constraint product_collection_items_collection_fk
      foreign key (collection_id, artist_id)
      references product_collections(id, artist_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'product_collection_items_product_fk'
  ) then
    alter table product_collection_items
      add constraint product_collection_items_product_fk
      foreign key (product_id, artist_id)
      references products(id, artist_id) on delete cascade;
  end if;
end $$;

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
  for select to authenticated using (artist_id = auth.uid());

-- Writes additionally verify BOTH referenced rows. `artist_id = auth.uid()`
-- alone would let an artist file someone else's product into their own
-- collection, or their own product into someone else's, simply by naming the
-- foreign id: the FK only proves the row exists, never who owns it.
drop policy if exists "artist inserts own collection items" on product_collection_items;
create policy "artist inserts own collection items" on product_collection_items
  for insert to authenticated with check (
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
  for update to authenticated using (artist_id = auth.uid())
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
  for delete to authenticated using (artist_id = auth.uid());

-- ---------------------------------------------------------------------------
-- BACKFILL every existing legacy assignment.
--
-- Idempotent via the unique constraint, so re-running this migration (or
-- running it after some rows already exist) adds nothing twice. Position is
-- seeded from the product's own shop order, which is the only ordering that
-- existed before per-collection ordering did.
--
-- THE JOIN IS THE POINT, not a shortcut for the `is not null` filter. The
-- composite FK added above will REJECT a legacy pair whose product and
-- collection have different owners, and a rejection here aborts the whole
-- migration. Production was checked at Gate A review: 0 rows in
-- `product_collections`, 0 non-null `products.collection_id`, so this backfill
-- moves nothing there and cannot abort. The join keeps that true for any
-- environment whose data is less clean: a mismatched legacy pair is left
-- behind for the verify step to surface rather than taking the deploy down.
-- The two counts are compared in the verify step precisely so "left behind"
-- cannot pass unnoticed.
insert into product_collection_items (collection_id, product_id, artist_id, position)
select
  p.collection_id,
  p.id,
  p.artist_id,
  row_number() over (partition by p.collection_id order by p.sort_order, p.created_at) - 1
from products p
join product_collections c
  on c.id = p.collection_id
 and c.artist_id = p.artist_id
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
