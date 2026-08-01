-- 0138: variant-aware bundles (founder ruling FD6,
-- docs/product/plus-build-time-decisions.md — FINAL, supersedes GC7's blanket
-- refusal of any variant-bearing bundle component).
--
-- GC7 (0132/0135 era) refused to SELL a bundle containing any product with an
-- active variant, because product_bundle_items carried no variant column: a
-- variant-stocked parent's own `quantity` is null (read as unlimited) while
-- decrementInventory moves nothing for it, so a bundle selling that product
-- choicelessly would sell ambiguous goods and skip the stock ledger entirely.
-- FD6 lifts the refusal by giving each bundle SLOT an explicit, ARTIST-CHOSEN
-- variant, exactly like a product_variants row chooses one option for a
-- direct sale. The choice is made once, when the artist BUILDS the bundle
-- (product_bundle_items.variant_id) — a bundle is still bought as ONE unit at
-- checkout, so there is no buyer-time variant picker to add here.
--
-- Two additive pieces, following the 0135 shape:
--   1. product_bundle_items.variant_id — the artist's fixed variant choice for
--      this bundle slot. NULL means "no variant needed", valid only while the
--      product itself has no ACTIVE variant to choose; a variant-bearing
--      product with a null slot is UN-SELECTABLE and is refused at sale time
--      (component_needs_variant) and flagged in the editor — never silently
--      sold and never silently broken.
--   2. order_item_bundle_components.variant_id + variant_snapshot — the
--      sale-time record of WHICH variant was actually sold, so refund/restock
--      moves the right stock counter and the purchase history survives the
--      variant (or its product, or its bundle) later being archived or
--      deleted.
--
-- Convergence discipline (AGENTS.md): every named constraint gets its own
-- existence guard; nothing here relies on `create table if not exists`
-- skipping an inline declaration.

-- ===========================================================================
-- 1. product_bundle_items.variant_id.

alter table product_bundle_items
  add column if not exists variant_id uuid;

-- Referential integrity only: a SIMPLE (non-composite) FK, not a composite FK
-- to (id, product_id). A composite FK's ON DELETE action applies to EVERY
-- column of that FK at once (pre-PG15 semantics; PG15+ can scope SET NULL to
-- named columns, but relying on that is a needless version dependency here),
-- so ON DELETE SET NULL on a (variant_id, product_id) composite would null
-- out product_id TOO the moment a variant is deleted — destroying which
-- PRODUCT the slot names, not just which variant. A simple FK on variant_id
-- alone nulls only the column that lost its parent.
--
-- "Belongs to this product" is therefore proven in application code, in TWO
-- places proportional to who is writing (the rls-write-policy-gap rule: check
-- WHICH CLIENT WRITES, not just which table):
--   - the artist's own writes (user-scoped client, the editor) get it in the
--     RLS WITH CHECK below;
--   - the checkout snapshot write (service-role, bypasses RLS entirely) gets
--     it in resolveBundleLines (goods-checkout.ts), which resolves a bundle's
--     declared variant_id ONLY within that component's OWN product's variant
--     list — the same scoping computeAddonLines already uses for a direct
--     purchase. A cross-product id simply never matches, so the component
--     refuses to resolve; this is re-checked at sale time regardless of what
--     the RLS layer already proved on write, the same money-path posture as
--     SHOP-VIS-001 re-checking visibility that the display path already
--     filtered.
--
-- ON DELETE SET NULL (not CASCADE, not RESTRICT): a hard-deleted variant
-- degrades the slot to "no variant selected", which the editor surfaces as
-- "needs a variant" (never a silent sale of the wrong thing, never a
-- cascade that erases the whole bundle item, never a RESTRICT that blocks
-- the artist from managing their own variant list elsewhere).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_bundle_items_variant_id_fkey'
  ) then
    alter table product_bundle_items
      add constraint product_bundle_items_variant_id_fkey
      foreign key (variant_id) references product_variants (id)
      on delete set null;
  end if;
end $$;

-- UNIQUENESS, decided deliberately. Postgres treats NULL as DISTINCT from
-- every other NULL in a unique constraint or index — including from itself —
-- so a naive swap has a hole either way:
--
--   - Keeping the OLD `product_bundle_items_unique (bundle_id, product_id)`
--     would refuse the very thing FD6 asks for: a second row for the same
--     product at a DIFFERENT variant collides with the first before any
--     variant-aware rule ever runs ("the same product's two variants MUST
--     both be able to be in one bundle").
--   - Replacing it with a straight 3-column
--     `unique (bundle_id, product_id, variant_id)` fixes that, but reopens a
--     different hole on its own: two rows sharing (bundle_id, product_id)
--     with variant_id NULL do NOT collide under NULL-distinct semantics, so
--     the SAME product could be added twice with no variant chosen for
--     either — exactly the case that matters most, since a product with NO
--     active variants always carries variant_id NULL.
--
-- The fix is TWO constraints, one per case, so each is enforced by equality
-- comparison over values that are never NULL in that constraint's own domain:
--   - non-null slots: a real 3-column UNIQUE constraint. Two rows only
--     collide when their variant_id values are equal AND non-null, i.e. "the
--     same product at the same variant, twice".
--   - null slots: a PARTIAL unique INDEX scoped to `variant_id is null`, so
--     "same product, no variant chosen" can exist at most once per bundle. A
--     plain UNIQUE constraint cannot carry a WHERE clause, hence the index
--     form for this half.
alter table product_bundle_items
  drop constraint if exists product_bundle_items_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_bundle_items_unique_variant'
  ) then
    alter table product_bundle_items
      add constraint product_bundle_items_unique_variant
      unique (bundle_id, product_id, variant_id);
  end if;
end $$;

create unique index if not exists product_bundle_items_unique_no_variant
  on product_bundle_items (bundle_id, product_id)
  where variant_id is null;

-- RLS: variant_id is a new WRITABLE column on an artist-writable table (the
-- rls-write-policy-gap rule — a new column on a user-writable table needs its
-- OWN grant checked, not just the table's). The insert/update WITH CHECK
-- clauses gain the "variant belongs to product" proof: a null slot is always
-- allowed (no variant needed, or not yet chosen), a non-null slot must name a
-- variant of THIS SAME product. Without this, the artist's own editor could
-- write a variant id belonging to a different product (or, combined with a
-- crafted product_id from a different artist's catalog, a different artist's
-- variant) into a bundle slot — the FK above only proves the variant EXISTS,
-- never that it belongs here. Drop-then-create (no `create policy if not
-- exists` in Postgres), same convention as every policy in this file's
-- lineage (0120/0121/0132).
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
    and (
      variant_id is null
      or exists (
        select 1 from product_variants pv
        where pv.id = variant_id and pv.product_id = product_id
      )
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
    and (
      variant_id is null
      or exists (
        select 1 from product_variants pv
        where pv.id = variant_id and pv.product_id = product_id
      )
    )
  );

-- ===========================================================================
-- 2. order_item_bundle_components: the sale-time variant record.

alter table order_item_bundle_components
  add column if not exists variant_id uuid;
alter table order_item_bundle_components
  add column if not exists variant_snapshot text;

-- Same simple-FK reasoning as above, and the same soft-pointer posture this
-- table already uses for product_id (0135): ON DELETE SET NULL keeps the row
-- (and its variant_snapshot TEXT) after the variant is deleted, so a later
-- reader can tell "this line USED to be variant-specific" from the snapshot
-- text even once there is no live counter left to point at. No RLS change:
-- this table has no authenticated write policy at all (0135) — every write is
-- service-role, so there is no client-side grant to extend.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_item_bundle_components_variant_id_fkey'
  ) then
    alter table order_item_bundle_components
      add constraint order_item_bundle_components_variant_id_fkey
      foreign key (variant_id) references product_variants (id)
      on delete set null;
  end if;
end $$;
