-- Appointment payments: the collection attempt on a payment request
-- (Plus build P9, slice A3).
--
-- Spec: docs/product/plus-payments-architecture.md, sections 4 (outstanding
-- balance) and 8 (double-charge prevention). Money-path rules in AGENTS.md
-- apply to every line.
--
-- TWO COLUMNS, and they exist to close a double-charge hole rather than to be
-- convenient. A3 creates a Stripe PaymentIntent for a sent payment request and
-- moves the request to `payment_processing`. Without a stored id, the only
-- record that the attempt exists is Stripe's idempotency key, which lives for
-- 24 hours: a client returning to the link on day two would produce a SECOND
-- live intent for the same request while the first was still payable, and
-- spec section 8 lists exactly that under "duplicate charges" and "replays".
-- With the id stored, the second visit is answered from the row.
--
--   payment_intent_id            the intent CURRENTLY being collected against
--                                this request. Not a history: a request can be
--                                collected against more than once (a retry
--                                after a failure, the remainder after a partial
--                                payment), and each attempt replaces this. The
--                                durable history is `payment_collections` and
--                                `payment_allocations`, which A4 writes at
--                                settlement from what Stripe reported.
--
--   payment_intent_amount_minor  the QUOTED amount that intent was created for,
--                                integer minor units. Stored because it is the
--                                server's own answer to "what were we
--                                collecting", and A4 reconciles what Stripe
--                                reports against it. `total_minor` is not that
--                                number: a partial collection charges less than
--                                the frozen total.
--
-- WHY NOT A NEW TABLE, and why not `payment_collections`. `payment_collections`
-- is created by a trigger from the FIRST ALLOCATION of an intent (0125), which
-- is settlement time: it is the record of money that moved, written by the
-- service role from what Stripe said. An intent that was created and never paid
-- has no allocation and must not manufacture one, because every downstream read
-- of that table (the converge-to-a-target refund sum, A8's reconciliation,
-- `collected_total_minor`) means "collected". A request pointing at its live
-- attempt is a different fact and belongs on the request.
--
-- WHY THE ARTIST BEING ABLE TO WRITE THESE COLUMNS IS NOT A HOLE, stated rather
-- than assumed, because 0125's UPDATE policy is not column-scoped and an artist
-- can UPDATE their own row while it is `sent`, `viewed`, `expired` or `failed`.
-- They could therefore write a `payment_intent_id` of their choosing.
--
--   1. Nothing reads the column unless the status is `payment_processing`, and
--      `payment_processing` is absent from that policy's WITH CHECK list, so an
--      artist cannot put their row there. Executed in 0125's own probe: a
--      WITH CHECK violation is LOUD (42501).
--   2. A3's claim writes the status and the id in ONE statement, so whatever
--      was in the column beforehand is overwritten by the attempt that put the
--      row into `payment_processing`.
--   3. The unique index below means the id an artist wrote cannot be one
--      another request is already collecting against.
--
-- The residual is that an artist can leave a junk id on their own non-processing
-- request. It is read by nothing and replaced by the next attempt. Recorded
-- rather than closed with a column-level trigger, which would have to
-- distinguish roles and would be a worse thing to maintain than this paragraph.
--
-- NOT ADDED TO THE FREEZE LIST in `enforce_payment_request_immutability`, and
-- that is deliberate: these columns are written precisely BECAUSE the row is
-- frozen and being paid. The frozen list covers what the client agreed to
-- (amount, currency, subject, revision, fee schedule); an attempt against that
-- agreement is not part of it.
--
-- CONVERGENCE. `add column if not exists` is a per-item existence guard, which
-- is the convergent pattern (AGENTS.md); the constraints and the index are
-- guarded the same way 0125 guards its own. Nothing here is declared inline
-- inside a `create table if not exists`, which is the non-convergent shape.
--
-- PROVEN BY THE ROUTE THAT WOULD DISPROVE IT (2026-07-30, local stack). Both
-- columns dropped by hand with CASCADE, which takes the two checks and the
-- index with them; catalog confirmed `cols=0 cons=0 idx=0`. This file re-run
-- under ON_ERROR_STOP: `exit=0`, and the catalog reports `cols=2`, both
-- constraint names back, `idx=1`. Run a second time against the now-converged
-- table it emits zero ERROR lines, which is the WEAKER property and is labelled
-- as such: idempotent is not convergent, and this file claims both because both
-- were measured separately. The constraint and index halves are additionally
-- held by `tests/db/appointment-payments-convergence.test.ts`, which drops every
-- constraint and every index on these tables and asserts the name list comes
-- back byte-identical after re-running 0125, 0126 and this file.

alter table payment_requests
  add column if not exists payment_intent_id text;

alter table payment_requests
  add column if not exists payment_intent_amount_minor integer;

do $$
begin
  -- The pair is all-or-nothing. An id with no amount is an attempt whose size
  -- nobody recorded, and an amount with no id is a quote pretending to be an
  -- attempt. Either half alone would be read as the whole by A4.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_intent_pair_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_intent_pair_check
      check (num_nonnulls(payment_intent_id, payment_intent_amount_minor) <> 1);
  end if;

  -- Spec section 4: a zero balance produces no request at all rather than a
  -- 0.00 one, and the same holds for an attempt against one. A negative amount
  -- is not a refund; refunds are A5 and are recorded as allocations.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_intent_amount_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_intent_amount_check
      check (
        payment_intent_amount_minor is null
        or payment_intent_amount_minor > 0
      );
  end if;
end $$;

-- ONE REQUEST PER INTENT. Spec section 8, "cross-appointment deposit
-- application" and "unrelated payments on the wrong client": an intent settling
-- against two requests would let one payment discharge two debts. Partial
-- because the column is null on every request that has never been collected
-- against, and those are the overwhelming majority.
--
-- This is an INDEX rather than a constraint because a unique constraint cannot
-- be partial. It binds every role including the service role, which is what
-- makes it worth having: RLS never constrains the webhook writer.
create unique index if not exists payment_requests_intent_idx
  on payment_requests (payment_intent_id)
  where payment_intent_id is not null;
