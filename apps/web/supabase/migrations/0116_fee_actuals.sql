-- Fee actuals + schedule snapshots (Plus build P5a).
--
-- Three things this makes possible, none of which exist today:
--
--   1. Knowing what was actually charged. `orders.platform_fee_amount` has
--      existed since the goods slice and has never been written; the goods
--      lane of a combined deposit + add-on payment was charged at 0% take
--      because the add-on path raised the PaymentIntent's amount and left
--      `application_fee_amount` at the deposit's value. The engine now writes
--      both, and these columns record the split.
--
--   2. Reproducing an old charge. A fee schedule is versioned data, so every
--      transaction stamps the version it was priced under. Without the stamp,
--      changing a rate silently rewrites history: a refund computed months
--      later would use today's rate against a charge made under yesterday's.
--
--   3. The savings dashboard (P6), whose entire input is fee actuals. History
--      before this migration is unrecoverable (it survives only as audit_log
--      JSON), which is why the dashboard copy has to say "since {date}" rather
--      than implying it can look further back.
--
-- All nullable with no backfill: existing rows genuinely have no recorded fee,
-- and inventing one would be worse than an honest null. Under the ACTIVE
-- schedule (v1) the goods rate is 0%, so nothing about live pricing changes
-- with this migration; P7 activates v2 with accountant approval.

alter table orders
  add column if not exists fee_schedule_version text,
  -- The goods half of platform_fee_amount, so the two lanes stay separable
  -- after the fact. The appointment half is the remainder, and is also
  -- recorded on booking_requests below for deposit-only payments that never
  -- create an order row at all.
  add column if not exists goods_fee_amount numeric(10,2);

alter table booking_requests
  add column if not exists fee_schedule_version text,
  -- What Inklee actually took on the appointment lane, in minor units.
  -- Integer cents rather than numeric: this mirrors Stripe's
  -- application_fee_amount exactly, and a rounding difference between the two
  -- is the kind of discrepancy nobody notices until a reconciliation run.
  add column if not exists platform_fee_collected_cents integer
    check (platform_fee_collected_cents is null or platform_fee_collected_cents >= 0);

-- The reporting read: fees collected per artist over a period. Partial, since
-- the overwhelming majority of rows carry no fee.
create index if not exists booking_requests_fee_idx
  on booking_requests (artist_id, deposit_paid_at)
  where platform_fee_collected_cents is not null;
