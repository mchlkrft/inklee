-- 0140: fix the variant-ownership check in 0138's bundle-item RLS policies.
--
-- 0138 added a WITH CHECK clause meant to prove that a non-null
-- `variant_id` names a variant of THIS SAME product:
--
--     exists (
--       select 1 from product_variants pv
--       where pv.id = variant_id and pv.product_id = product_id
--     )
--
-- The second predicate is a TAUTOLOGY. Inside the subquery, the unqualified
-- name `product_id` resolves to the INNER table's column (`pv.product_id`),
-- because a FROM-clause column shadows the outer row reference. So it reads
-- `pv.product_id = pv.product_id`, which is true for every row, and the check
-- proves only that the variant EXISTS — exactly what the FK already proved.
-- `pv.id = variant_id` is unaffected: product_variants has no `variant_id`
-- column, so that name still resolves to the row being written.
--
-- FOUND BY EXECUTION, not by reading: the FD6 slice shipped with its db tests
-- unrun (no Docker in that session) and the policy read as correct. The FD12
-- slice had Docker, ran `pnpm test:db`, and
-- `bundle-items-rls.test.ts` -> "refuses a variant that belongs to a DIFFERENT
-- product" came back RED (the insert succeeded where 42501 was expected). This
-- is the PAT-001 shape: a written safety claim that had never been executed.
--
-- The fix is to qualify the outer reference with the table's own name, which
-- is legal inside a policy expression and unambiguous:
--     pv.product_id = product_bundle_items.product_id
--
-- FORWARD-ONLY, per the 0133 precedent: 0138 is not edited even though it has
-- never been applied to production, because other local databases have already
-- run it and a silently-changed migration file is worse than an explicit
-- repair. Drop-then-create (Postgres has no `create policy if not exists`),
-- which is also the convergent shape: it repairs a present-but-wrong-shaped
-- policy, which an existence guard would skip over.
--
-- SCOPE OF THE DEFECT, recorded honestly: this was never the only guard. The
-- money path never trusted it — `resolveBundleComponent` (FD6) resolves a
-- component's variant only from that component's OWN product's variant list,
-- so a mis-owned row could not have been sold. The exposure was that an
-- artist's own client could WRITE a bundle slot naming a variant of a
-- different product (their own, or with a crafted product_id another artist's),
-- which the editor would then render as a slot whose variant name belongs to
-- something else.

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
        where pv.id = variant_id
          and pv.product_id = product_bundle_items.product_id
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
        where pv.id = variant_id
          and pv.product_id = product_bundle_items.product_id
      )
    )
  );
