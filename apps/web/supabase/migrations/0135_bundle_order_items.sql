-- 0135: payable bundles in the goods checkout (decision GC6, task C4).
--
-- Three additive pieces:
--   1. order_item_type gains 'bundle' — a sold bundle is ONE first-class line
--      at the bundle's own price (fee base = bundle price, decision B2/GC6).
--   2. order_items.bundle_id — attribution back to the bundle, nullable and
--      ON DELETE SET NULL so deleting a bundle never touches sales history.
--   3. order_item_bundle_components — the composition SNAPSHOT taken at sale
--      time. Fulfilment (inventory decrement, refund restock) and the product
--      deletion guard read THIS table, never live product_bundle_items: the
--      live join mutates with the artist's edits and cascades away on product
--      delete, which would erase what was actually sold (GC6 gotcha 2).
--
-- Convergence discipline (AGENTS.md): no FK/check is declared inline inside
-- `create table if not exists`; every named constraint gets its own existence
-- guard so a re-run restores a manually dropped object instead of skipping it.

-- 1. New enum value. `if not exists` makes the re-run a no-op. (Safe inside
--    the migration transaction on PG >= 12 as long as the value is not USED in
--    the same transaction, and nothing below writes rows.)
alter type order_item_type add value if not exists 'bundle';

-- 2. Attribution column on order_items. Column and FK guarded separately:
--    `add column if not exists` with an inline `references` would skip the FK
--    forever once the column exists (the 0122 non-convergence footgun).
alter table order_items
  add column if not exists bundle_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_bundle_id_fkey'
  ) then
    alter table order_items
      add constraint order_items_bundle_id_fkey
      foreign key (bundle_id) references product_bundles (id)
      on delete set null;
  end if;
end $$;

-- 3. Composition snapshot. Plain columns only; constraints follow, guarded.
--    product_id is kept as a soft pointer (SET NULL on product delete) so the
--    deletion guard can see "this product was sold inside a bundle" while the
--    title/quantity/list-price snapshot keeps the record whole after deletion.
create table if not exists order_item_bundle_components (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null,
  product_id uuid,
  title_snapshot text not null,
  quantity integer not null,
  -- The component's LIST price at sale time, major units, display/records only.
  -- Never a charge amount: the charged price is the bundle line's total_amount.
  unit_list_price numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_item_bundle_components_order_item_id_fkey'
  ) then
    alter table order_item_bundle_components
      add constraint order_item_bundle_components_order_item_id_fkey
      foreign key (order_item_id) references order_items (id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_item_bundle_components_product_id_fkey'
  ) then
    alter table order_item_bundle_components
      add constraint order_item_bundle_components_product_id_fkey
      foreign key (product_id) references products (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_item_bundle_components_quantity_check'
  ) then
    alter table order_item_bundle_components
      add constraint order_item_bundle_components_quantity_check
      check (quantity > 0);
  end if;
end $$;

create index if not exists order_item_bundle_components_order_item_id_idx
  on order_item_bundle_components (order_item_id);

-- The product deletion guard (goods-guard.ts) asks "was this product ever sold
-- inside a bundle" by product_id; partial index because SET NULL rows are dead
-- weight for that question.
create index if not exists order_item_bundle_components_product_id_idx
  on order_item_bundle_components (product_id)
  where product_id is not null;

-- RLS: same posture as order_items (0036) — the artist reads their own sales;
-- all writes go through the service role in the checkout/settlement path, so
-- there are deliberately NO authenticated write policies (the write client is
-- the service client; a user-scoped write policy would imply a write path that
-- does not exist). Per-command + TO authenticated per the 0120/0123 lesson,
-- drop-then-create so a re-run repairs a wrong-shaped policy.
alter table order_item_bundle_components enable row level security;

drop policy if exists "artist can read own bundle components"
  on order_item_bundle_components;
create policy "artist can read own bundle components"
  on order_item_bundle_components for select
  to authenticated
  using (
    exists (
      select 1
      from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_bundle_components.order_item_id
        and o.artist_id = auth.uid()
    )
  );
