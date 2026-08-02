-- 0146: orders/order_items service-role-write-only (PAY-AUTHZ-002 remediation,
-- counsel Q8, findings.yaml PAY-AUTHZ-002).
--
-- WHAT WAS WRONG. Both tables carried a single FOR ALL policy named to sound
-- read-only ("artist can read own orders" / "artist can read own order
-- items") but declared FOR ALL with a WITH CHECK, and neither table had the
-- REVOKE that would have stopped the default anon/authenticated table grants
-- (INSERT/UPDATE/DELETE/TRUNCATE, confirmed present on both tables locally)
-- from mattering. Combined, an artist's own authenticated session could
-- rewrite any row it owns: PAY-AUTHZ-002 proved this by executing UPDATEs
-- against total_amount, platform_fee_amount, created_at and status
-- (paid -> cancelled), inside a rolled-back transaction.
--
-- WHY IT IS WORSE THAN A PLAIN AUTHZ GAP. Migration 0142 added
-- order_items.custom_made_snapshot to FREEZE a consumer-rights disclosure
-- (Art. 16(c) CRD's no-return exemption, claimed per product) at the moment
-- of sale. A seller who can edit that column afterwards can retroactively
-- change what a past buyer's receipt is allowed to say about their return
-- right, alongside title_snapshot and every amount on the row. That is why
-- this BLOCKS shop-on rather than being a routine authz tidy-up.
--
-- THE FIX, following 0139's precedent for `refunds` / `refund_lines` (same
-- reasoning: these rows are the record that money moved, and an artist's own
-- client asserting a write directly could fabricate what never happened at
-- Stripe or in Postgres):
--   - Both FOR ALL policies replaced with SELECT-only TO authenticated.
--   - REVOKE insert/update/delete/truncate from anon AND authenticated on
--     both tables (the table-grant half 0139 already applies to refunds).
--   - orders_stripe_pi_idx (0134, a plain btree) becomes a UNIQUE partial
--     index, closing the other PAY-AUTHZ-002 remediation item: two orders
--     sharing a PaymentIntent id would let a refund/settlement read pick the
--     wrong row.
--
-- WHO STILL WRITES. Every current writer of orders/order_items already uses
-- the service-role client (apps/web/src/app/api/stripe/webhook/route.ts,
-- lib/server/goods-checkout.ts, lib/server/goods-refund.ts,
-- lib/server/goods-order-refund.ts, app/request/[token]/actions.ts,
-- lib/server/shop-retention.ts) EXCEPT markGoodsPickedUp
-- (app/(artist)/bookings/actions.ts), which updated orders.fulfillment_status
-- directly through the artist's own RLS-scoped client. That call site moves
-- to a new markGoodsPickedUpCore (lib/server/bookings.ts) in the same change,
-- service-role after an explicit artist_id ownership check, matching the
-- 0080 house convention -- otherwise this migration would silently break
-- "mark goods as picked up" the moment it lands, which is exactly the kind of
-- regression a policy-only diff hides from review.
--
-- PRE-FLIGHT FOR WHOEVER APPLIES THIS TO PRODUCTION: the UNIQUE index create
-- FAILS LOUDLY (not silently) if a duplicate non-null stripe_payment_intent_id
-- already exists. Verified zero duplicates on the local stack; run this
-- against production BEFORE applying:
--   select stripe_payment_intent_id, count(*) from orders
--     where stripe_payment_intent_id is not null
--     group by 1 having count(*) > 1;
-- PAY-AUTHZ-002's own production_exposure note says the goods build is
-- unpushed and production carries no orders yet, so this is expected to
-- return nothing -- "expected" is not "verified"; verify before applying.

drop policy if exists "artist can read own orders" on orders;
create policy "artist reads own orders" on orders
  for select to authenticated using (artist_id = auth.uid());

revoke insert, update, delete, truncate on orders from anon, authenticated;

drop policy if exists "artist can read own order items" on order_items;
create policy "artist reads own order items" on order_items
  for select to authenticated using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id and o.artist_id = auth.uid()
    )
  );

revoke insert, update, delete, truncate on order_items from anon, authenticated;

-- UNIQUE partial index, convergent via drop-then-create (AGENTS.md: a bare
-- `create index if not exists` would skip an existing NON-unique index of the
-- same name, which is exactly the non-convergent shape AGENTS.md warns about
-- for objects that already exist under the same name).
drop index if exists orders_stripe_pi_idx;
create unique index orders_stripe_pi_idx
  on orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
