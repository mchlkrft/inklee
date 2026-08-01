-- Standalone orders (GC1 keystone, slice C1): an order no longer REQUIRES a
-- booking.
--
-- Founder decision GC1 (2026-08-01, DECISIONS.md): goods/bundles become
-- buyable WITHOUT an appointment. 0036 modelled orders as riders on a booking
-- deposit (`booking_id NOT NULL`), which made a standalone shop structurally
-- impossible. This migration relaxes exactly that, and nothing else changes
-- behaviour: every existing write path still sets booking_id, the standalone
-- PaymentIntent path arrives in a later slice, and the whole surface stays
-- dark behind GOODS_COMMERCE_ENABLED.
--
-- BUYER IDENTITY: an order must always have someone to fulfil to. A
-- booking-coupled order reaches its client through the booking; a standalone
-- order must carry `client_email` (the column has existed since 0036) itself.
-- The CHECK below encodes "booking OR email", which every existing row
-- satisfies (all have booking_id), so it validates instantly.
--
-- CONVERGENT per the AGENTS.md footgun rules: DROP NOT NULL is naturally
-- idempotent; the check constraint and the index are existence-guarded, so
-- re-running repairs a manually dropped object instead of no-op'ing.

alter table orders alter column booking_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_buyer_identity_check'
  ) then
    alter table orders
      add constraint orders_buyer_identity_check
      check (booking_id is not null or client_email is not null);
  end if;
end $$;

-- The refund webhook resolves orders by PaymentIntent id (charge.refunded has
-- no order_id metadata); 0036 never indexed that column because the paid-flip
-- looked up by metadata order_id instead.
create index if not exists orders_stripe_pi_idx
  on orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
