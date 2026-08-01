-- Refund ledger + goods-side processor-cost tracking (FD12, founder ruling
-- 2026-08-01: "partial refunds + native revise are pre-publication scope").
--
-- WHAT WAS MISSING. Both money lanes could already MOVE a refund (appointment
-- payments via refundPaymentRequestCore; goods only via the blunt webhook
-- convergence in goods-refund.ts, with no artist-initiated by-line path at
-- all). Neither lane kept an IMMUTABLE PER-EVENT RECORD of what was refunded:
-- appointment refunds converge `payment_allocations.refund_adjustment` rows to
-- the CUMULATIVE target (by AGENTS.md's own money-path rule, correctly), which
-- means the history of individual refund events is not reconstructable from
-- them, only the current total. The founder's list requires "immutable refund
-- history", "reconciliation records" and "remaining refundable balance" as
-- first-class, and none of those can be built on a converging aggregate alone.
--
-- THE SHAPE. Two tables, domain-generic (`appointment_payment` |
-- `goods_order`) rather than one pair per lane: the arithmetic
-- (feeRefundOutcome, over-refund / duplicate-refund / repeated-cost-retention
-- prevention) is IDENTICAL across both lanes, and a single ledger is what lets
-- "remaining refundable balance" and "is this order/request fully unwound" be
-- one query shape instead of two that must be kept in sync forever.
--
--   refunds       one row per refund EVENT (one Stripe refund object). Starts
--                 'pending' BEFORE the Stripe call (the claim gate — see
--                 below), moves to 'succeeded' or 'failed' after.
--   refund_lines  one row per LINE touched by that event (or one bare row with
--                 no line reference, for an amount-only refund not tied to
--                 specific lines/quantities). NEVER updated after insert: this
--                 is the immutable history the aggregate tables cannot give.
--
-- THE CLAIM GATE (duplicate-refund prevention, defense in depth beyond
-- Stripe's own idempotency key). `idempotency_key` is UNIQUE and is the SAME
-- deterministic string passed to `stripe.refunds.create`'s own idempotency
-- key. The core inserts the `refunds` row FIRST, before calling Stripe: two
-- concurrent calls for the identical logical refund (same subject, same
-- amount, same already-refunded baseline) produce the same key, so only one
-- INSERT wins and the loser sees the conflict and refuses BEFORE ever calling
-- Stripe. A genuinely later, different refund advances the "already refunded"
-- baseline the key is derived from, so its key differs and it claims its own
-- row. This is the same idempotency-key-derivation discipline
-- appointment-payment-refund.ts already uses for the Stripe call itself,
-- applied one layer earlier.
--
-- WHICH CLIENT WRITES. Both tables are SERVICE-ROLE ONLY writes, same posture
-- and same reasoning as `payment_allocations` / `payment_collections` (0125):
-- a refund is the record that money moved (or was decided to move), and an
-- artist's own client asserting one directly could manufacture refund history
-- that never happened at Stripe. SELECT-only for the owning artist, with the
-- same explicit REVOKE so a later careless `for all` policy cannot undo it.
--
-- REFERENTIAL ACTIONS, deliberately mirroring `payment_allocations`, not
-- `payment_requests`. `payment_requests_booking_fk` (0125) is ON DELETE
-- CASCADE for the whole request/line chain when the underlying appointment or
-- project is deleted. `payment_allocations_collection_fk` is NO ACTION,
-- because (0125's own words) "an allocation is the record that money moved,
-- and nothing should be able to delete its collection out from under it."
-- `refunds` is the same category of record as an allocation, arguably more so
-- given the founder's explicit "immutable refund history" requirement: CASCADE
-- would let that history silently vanish the moment a booking or order is
-- deleted, which directly undermines immutability. So `refunds.order_id` and
-- `refunds.payment_request_id` are NO ACTION (the default omitted clause):
-- deleting a booking/project/order that still has a refund on record is
-- REFUSED (23503) rather than silently taking the refund history with it. The
-- one path that still succeeds is an ACCOUNT deletion, because
-- `refunds.artist_id_fkey` is ON DELETE CASCADE and Postgres checks
-- referential actions at end of statement, so a single cascading delete that
-- removes the artist row removes everything under it, including `refunds`,
-- in one statement. A residual worth naming for whoever next touches booking
-- deletion: this is a BEHAVIOUR CHANGE for that path specifically (a booking
-- delete that used to cascade cleanly through orders/order_items can now be
-- refused once a refund exists against it), and it is the intended trade-off,
-- not an oversight.
--
-- CONVERGENCE (AGENTS.md). Every named constraint is a guarded
-- `do $$ ... if not exists ... end $$` block; column TYPE/NOT NULL/DEFAULT
-- stay inline (not separate objects, per the 0125/0131 boundary). Policies are
-- drop-then-create. `add column if not exists` on `orders` converges the same
-- way 0131 did on `payment_collections`.

-- ===========================================================================
-- 1. Goods-side processor-cost + fee-refund-policy tracking on `orders`.
--
-- Mirrors `payment_collections`' 0131 columns exactly, because `orders` IS the
-- goods lane's collection-equivalent row (one row per PaymentIntent for a
-- standalone order; shared with a booking's deposit PI for an add-on order).
-- Captured ONLY at STANDALONE settlement (`settleStandaloneGoodsOrder`): an
-- add-on order's PI is entangled with the deposit, so the processor cost on
-- that charge is not attributable to the goods portion alone, the same
-- entangled-PI reasoning `goods-refund.ts` already documents for refund
-- amounts. An add-on order's refund therefore reads these columns as null and
-- fails safe (returns the full fee, retains nothing) exactly like an
-- appointment collection settled before 0131 existed.
alter table orders
  add column if not exists processor_cost_minor integer,
  add column if not exists processor_cost_source text,
  add column if not exists processor_cost_status text not null default 'pending',
  add column if not exists fee_refund_policy_version text,
  add column if not exists processor_cost_retained_minor integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_processor_cost_check'
  ) then
    alter table orders
      add constraint orders_processor_cost_check
      check (processor_cost_minor is null or processor_cost_minor >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_cost_retained_check'
  ) then
    alter table orders
      add constraint orders_cost_retained_check
      check (processor_cost_retained_minor >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_cost_source_check'
  ) then
    alter table orders
      add constraint orders_cost_source_check
      check (processor_cost_source is null
        or processor_cost_source in ('balance_transaction', 'reconciled', 'unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_cost_status_check'
  ) then
    alter table orders
      add constraint orders_cost_status_check
      check (processor_cost_status in ('pending', 'captured', 'unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_cost_status_agrees_check'
  ) then
    alter table orders
      add constraint orders_cost_status_agrees_check
      check (
        (processor_cost_status = 'captured') = (processor_cost_minor is not null)
      );
  end if;

  -- FK target for `refunds.order_id`, same shape as `products_id_artist_key`
  -- (0125) and every other "(id, artist_id)" parent key in this feature area.
  if not exists (
    select 1 from pg_constraint where conname = 'orders_id_artist_key'
  ) then
    alter table orders
      add constraint orders_id_artist_key unique (id, artist_id);
  end if;
end $$;

-- ===========================================================================
-- 2. refunds. One row per refund EVENT (one Stripe refund object), across
--    both money lanes.
create table if not exists refunds (
  id                            uuid not null default gen_random_uuid(),
  -- Which lane this event belongs to. Not derivable from which FK is set
  -- alone (both could theoretically be read generically), so it is its own
  -- column: every query and every UI branch reads this first.
  domain                        text not null,
  -- Denormalized for single-column RLS (house convention, 0080/0125).
  artist_id                     uuid not null,
  -- The subject, exactly one, matching `domain`. Both nullable so the
  -- either/or is representable without a polymorphic id.
  payment_request_id            uuid,
  order_id                      uuid,
  currency                      text not null default 'eur',
  -- 'full' refunds everything refundable; 'partial_amount' is a bare custom
  -- amount not tied to specific lines (never restocks — see goods-order-refund.ts);
  -- 'by_line' names specific lines/quantities (the only kind that restocks).
  refund_type                   text not null,
  -- The fee-refund CASE this event was decided under (packages/shared's
  -- FeeRefundCase). Recorded even though the arithmetic is also derivable from
  -- the fee/cost columns below, because the CASE is what a human or a Terms
  -- clause reasons about, and it must survive independently of the numbers.
  fee_refund_case               text not null,
  -- pending (claimed, Stripe not yet confirmed) -> succeeded | failed. Never
  -- reused for a different attempt: a failed row's `idempotency_key` is
  -- reused on retry (the row is updated in place), a genuinely different
  -- refund gets a new key and a new row.
  status                        text not null default 'pending',
  amount_minor                  integer not null,
  application_fee_return_minor  integer,
  application_fee_retain_minor  integer,
  -- Cumulative non-recoverable processor cost retained BY THIS EVENT (not the
  -- running total across all events — that lives on `payment_collections` /
  -- `orders`, which this event's core also increments under the same
  -- no-double-retention rule those tables already enforce).
  processor_cost_retained_minor integer not null default 0,
  fee_refund_policy_version     text,
  stripe_refund_id              text,
  idempotency_key               text not null,
  error_message                 text,
  initiated_by                  uuid,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_pkey'
  ) then
    alter table refunds add constraint refunds_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refunds_artist_id_fkey'
  ) then
    alter table refunds
      add constraint refunds_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- FK target for `refund_lines`' composite ownership binding.
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_id_artist_key'
  ) then
    alter table refunds add constraint refunds_id_artist_key unique (id, artist_id);
  end if;

  -- NO ACTION (default, omitted clause) on both subject FKs. See the header:
  -- a refund on record blocks the delete of what it refunds, on purpose.
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_payment_request_fk'
  ) then
    alter table refunds
      add constraint refunds_payment_request_fk
      foreign key (payment_request_id, artist_id, currency)
      references payment_requests(id, artist_id, currency);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_order_fk'
  ) then
    alter table refunds
      add constraint refunds_order_fk
      foreign key (order_id, artist_id)
      references orders(id, artist_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refunds_domain_check'
  ) then
    alter table refunds
      add constraint refunds_domain_check
      check (domain in ('appointment_payment', 'goods_order'));
  end if;

  -- Exactly one subject, and it must match `domain` (not just "exactly one
  -- non-null" — a goods_order row pointing at a payment_request would pass a
  -- bare num_nonnulls check and be wrong).
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_subject_check'
  ) then
    alter table refunds
      add constraint refunds_subject_check
      check (
        (domain = 'appointment_payment' and payment_request_id is not null and order_id is null)
        or (domain = 'goods_order' and order_id is not null and payment_request_id is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refunds_type_check'
  ) then
    alter table refunds
      add constraint refunds_type_check
      check (refund_type in ('full', 'partial_amount', 'by_line'));
  end if;

  -- Mirrors packages/shared/src/fee-refund-policy.ts's FEE_REFUND_CASES.
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_case_check'
  ) then
    alter table refunds
      add constraint refunds_case_check
      check (fee_refund_case in (
        'voluntary_full', 'voluntary_partial', 'dispute', 'fraud',
        'artist_cancellation', 'inklee_error'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refunds_status_check'
  ) then
    alter table refunds
      add constraint refunds_status_check
      check (status in ('pending', 'succeeded', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refunds_amount_check'
  ) then
    alter table refunds
      add constraint refunds_amount_check check (amount_minor > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refunds_cost_retained_check'
  ) then
    alter table refunds
      add constraint refunds_cost_retained_check
      check (processor_cost_retained_minor >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refunds_currency_check'
  ) then
    alter table refunds
      add constraint refunds_currency_check
      check (currency = lower(currency) and char_length(currency) = 3);
  end if;

  -- THE CLAIM GATE. See the header block comment.
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_idempotency_key_key'
  ) then
    alter table refunds
      add constraint refunds_idempotency_key_key unique (idempotency_key);
  end if;

  -- A succeeded/failed row must carry the outcome it claims: a 'succeeded' row
  -- with no stripe_refund_id, or a 'failed' row with no error_message, would
  -- be a status the code never actually reached.
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_succeeded_has_stripe_id_check'
  ) then
    alter table refunds
      add constraint refunds_succeeded_has_stripe_id_check
      check (status <> 'succeeded' or stripe_refund_id is not null);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_failed_has_message_check'
  ) then
    alter table refunds
      add constraint refunds_failed_has_message_check
      check (status <> 'failed' or error_message is not null);
  end if;
end $$;

create index if not exists refunds_payment_request_idx
  on refunds (payment_request_id, created_at desc)
  where payment_request_id is not null;
create index if not exists refunds_order_idx
  on refunds (order_id, created_at desc)
  where order_id is not null;
create index if not exists refunds_artist_idx
  on refunds (artist_id, created_at desc);

alter table refunds enable row level security;

drop policy if exists "artist reads own refunds" on refunds;
create policy "artist reads own refunds" on refunds
  for select to authenticated using (artist_id = auth.uid());

revoke insert, update, delete, truncate on refunds from anon, authenticated;

-- ===========================================================================
-- 3. refund_lines. One row per LINE touched by a refund event; never updated
--    after insert (the immutable history itself). A bare amount-only refund
--    (no specific lines known) writes exactly one row with both line
--    references null.
create table if not exists refund_lines (
  id                       uuid not null default gen_random_uuid(),
  refund_id                uuid not null,
  -- Denormalized for single-column RLS AND to carry the composite FKs below
  -- (the house convention throughout this migration family).
  artist_id                uuid not null,
  payment_request_id       uuid,
  order_id                 uuid,
  payment_request_line_id  uuid,
  order_item_id            uuid,
  -- Captured at refund time from the line's OWN snapshot
  -- (payment_request_lines.name / order_items.title_snapshot), so this row
  -- reads correctly even after the line, its product, or the whole order is
  -- gone. This is the "historical purchases stay refundable/readable after
  -- archival" guarantee, applied to the refund record itself.
  name_snapshot            text not null,
  quantity_refunded        integer,
  amount_minor             integer not null,
  -- Whether this line's refunded quantity was restocked into inventory.
  -- Always false for the appointment-payment domain (no inventory there) and
  -- for a bare amount-only goods refund (nothing specific to restock).
  restocked                boolean not null default false,
  created_at               timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'refund_lines_pkey'
  ) then
    alter table refund_lines add constraint refund_lines_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refund_lines_artist_id_fkey'
  ) then
    alter table refund_lines
      add constraint refund_lines_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- Ownership binding to the parent event. CASCADE here (unlike the parent's
  -- own subject FKs): a refund_lines row has no independent life apart from
  -- its refund row, so deleting a refund necessarily deletes its lines. There
  -- is no live path that deletes a `refunds` row (it is never artist-writable
  -- and the subject FKs above are NO ACTION), so this only ever fires as part
  -- of an account-deletion cascade.
  if not exists (
    select 1 from pg_constraint where conname = 'refund_lines_refund_fk'
  ) then
    alter table refund_lines
      add constraint refund_lines_refund_fk
      foreign key (refund_id, artist_id)
      references refunds(id, artist_id) on delete cascade;
  end if;

  -- Line references. Default NO ACTION on both, for the same reason as the
  -- parent's subject FKs: a line this ledger has a row against must not be
  -- deletable out from under it. In practice neither is ever deleted directly
  -- (payment_request_lines only before send; order_items has no delete path
  -- at all), so this is a backstop rather than a live constraint.
  if not exists (
    select 1 from pg_constraint where conname = 'refund_lines_request_line_fk'
  ) then
    alter table refund_lines
      add constraint refund_lines_request_line_fk
      foreign key (payment_request_line_id, payment_request_id)
      references payment_request_lines(id, request_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'refund_lines_order_item_fk'
  ) then
    alter table refund_lines
      add constraint refund_lines_order_item_fk
      foreign key (order_item_id) references order_items(id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refund_lines_subject_check'
  ) then
    alter table refund_lines
      add constraint refund_lines_subject_check
      check (num_nonnulls(payment_request_line_id, order_item_id) <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refund_lines_quantity_check'
  ) then
    alter table refund_lines
      add constraint refund_lines_quantity_check
      check (quantity_refunded is null or quantity_refunded > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'refund_lines_amount_check'
  ) then
    alter table refund_lines
      add constraint refund_lines_amount_check check (amount_minor > 0);
  end if;
end $$;

create index if not exists refund_lines_refund_idx on refund_lines (refund_id);
create index if not exists refund_lines_request_line_idx
  on refund_lines (payment_request_line_id)
  where payment_request_line_id is not null;
create index if not exists refund_lines_order_item_idx
  on refund_lines (order_item_id)
  where order_item_id is not null;

alter table refund_lines enable row level security;

drop policy if exists "artist reads own refund lines" on refund_lines;
create policy "artist reads own refund lines" on refund_lines
  for select to authenticated using (artist_id = auth.uid());

revoke insert, update, delete, truncate on refund_lines from anon, authenticated;
