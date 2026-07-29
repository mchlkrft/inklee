-- Repair: discount_codes had no write policies (Plus build P5d, Gate A finding A2).
--
-- The same defect as `product_collections` (see `0121`), found by a Gate A
-- review that checked a claim in 0121's own comment instead of taking it. The
-- table has RLS enabled with a SELECT policy only, while BOTH write callers
-- pass the USER-scoped client:
--
--   (artist)/goods/discounts/actions.ts -> createClient()      -> saveDiscountCore
--   api/mobile/goods/discounts/route.ts -> requireMobileUser() -> saveDiscountCore
--
-- Verified in the database rather than inferred:
--
--   select policyname, cmd from pg_policies where tablename = 'discount_codes';
--    artist reads own discount codes | SELECT      <- and nothing else
--
-- This one is worse than the collections defect it was found next to. It is on
-- the REVENUE path, it is already in production, and it fails as a save that
-- reports "Couldn't save. Try again." forever: `saveDiscountCore` maps the RLS
-- rejection to its generic failure branch, so an artist retrying a discount
-- code sees a transient-looking message describing a permanent condition.
--
-- INSERT and UPDATE only. NO DELETE, deliberately, and not as an oversight to
-- be tidied up later: `setDiscountActiveCore` deactivates instead of deleting
-- because a published code is a promise and its redemption history is what a
-- sales report is made of. A DELETE policy would hand the client a capability
-- the product intentionally withholds, and RLS is the layer that makes that
-- refusal real rather than merely conventional.
--
-- `TO authenticated` is explicit: an untargeted policy also applies to `anon`,
-- which reads as though anonymous writes to the discount table had been
-- considered and permitted.

drop policy if exists "artist inserts own discount codes" on discount_codes;
create policy "artist inserts own discount codes" on discount_codes
  for insert to authenticated
  with check (artist_id = auth.uid());

-- `USING` picks the targetable rows, `WITH CHECK` constrains the result. Both
-- are needed: without WITH CHECK an artist could update their own code and
-- re-assign it to someone else, moving a discount (and its redemption cap)
-- into another artist's shop.
drop policy if exists "artist updates own discount codes" on discount_codes;
create policy "artist updates own discount codes" on discount_codes
  for update to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());
