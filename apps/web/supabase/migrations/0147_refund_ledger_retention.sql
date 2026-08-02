-- 0147: refund-ledger retention on account deletion (C1.10 completion, counsel
-- confirmed: "yes, fix it; that instruction is confirmed").
--
-- WHAT WAS WRONG. `refunds.artist_id_fkey` and `refund_lines.artist_id_fkey`
-- (0139) are both ON DELETE CASCADE from profiles. `refunds`/`refund_lines`
-- appear in neither 0129 nor 0143's retention carve-out, so deleting an
-- artist's account destroys the entire refund ledger -- the immutable
-- per-event history 0139 built specifically because the aggregate tables
-- (payment_allocations, orders) cannot reconstruct it. C1.10 requires
-- financial records to survive; this one didn't.
--
-- THE FIX: same pattern as 0129/0143 -- ON DELETE SET NULL so the row
-- survives pseudonymised (artist_id nulled, every Stripe id and amount
-- intact). BOTH tables need it, not just `refunds`: `refund_lines` carries
-- its OWN direct FK to profiles (0139's "denormalized for single-column RLS"
-- design), independent of `refund_lines_refund_fk`'s link to its parent
-- `refunds` row. Fixing only `refunds` would still lose every line-item row
-- to its own direct CASCADE the moment the parent survives it -- the more
-- important half of the immutable history, per 0139's own header ("one row
-- per LINE touched by that event... NEVER updated after insert: this is the
-- immutable history the aggregate tables cannot give").
--
-- CONVERGENCE. MIG-DROP-001's lesson: `drop constraint if exists` on its own
-- statement, unconditional `add constraint` after it -- never a two-clause
-- bare ALTER TABLE (0129/0143's shape). The renaming lesson from 0146
-- (183e5841) does not apply here: every constraint below keeps its existing
-- name, only the referential action changes, so a single `drop ... if
-- exists` / `add` pair per constraint converges correctly on a re-run.
--
-- THE PART THAT IS NOT A ONE-LINE FK FLIP, found by executing the delete
-- against a real fixture, not by reading the schema. Once `refunds`/
-- `refund_lines` SURVIVE instead of being destroyed with the artist, they
-- keep pointing at rows that DO still get cascade-erased in the SAME
-- statement (payment_requests/payment_request_lines stay CASCADE per
-- BDEL-PAY-001 -- archived, not schema-preserved; orders/order_items cascade
-- from profiles too). Two DIFFERENT problems showed up, and they needed two
-- different fixes:
--
--   1. `refunds_payment_request_fk (payment_request_id, artist_id,
--      currency)` and `refunds_order_fk (order_id, artist_id)` are composite
--      and INCLUDE artist_id. Postgres checks NO ACTION/RESTRICT constraints
--      IMMEDIATELY by default, in an order not guaranteed to run every SET
--      NULL before every cascade delete within one statement's fan-out --
--      confirmed by execution: with these two left NO ACTION (not
--      deferred), a real deleteOwnAccountCore call against a fixture with an
--      appointment-payment refund on record failed outright with
--      "update or delete on table \"payment_requests\" violates foreign key
--      constraint \"refunds_payment_request_fk\"", and NOTHING in the delete
--      completed (profiles survived, nothing was pseudonymised, nothing was
--      erased -- the whole cascading statement rolled back). Making both
--      DEFERRABLE INITIALLY DEFERRED moves the check to end of statement,
--      by which point `refunds.artist_id` has already been nulled by its own
--      FK action in the SAME cascade -- MATCH SIMPLE (the unchanged default)
--      exempts a composite FK from enforcement once any of its columns is
--      NULL, so the now-deferred check finds nothing to block. Re-verified:
--      the same fixture then completed with `{ok: true}`.
--
--   2. `refund_lines_request_line_fk (payment_request_line_id,
--      payment_request_id)` and `refund_lines_order_item_fk (order_item_id)`
--      do NOT involve artist_id at all, so deferring them changes nothing --
--      nothing ever nulls their columns, so the deferred check still finds a
--      blocking reference at end of statement. Confirmed by execution: with
--      artist_id_fkey fixed and the FIRST pair deferred, the SAME fixture
--      failed one step later with "violates foreign key constraint
--      \"refund_lines_request_line_fk\" on table \"payment_request_lines\"".
--      These two need a DIFFERENT fix: ON DELETE SET NULL on the line
--      pointer itself, so when the payment_request_line/order_item it names
--      is cascade-erased, the pointer on the surviving refund_lines row goes
--      null instead of blocking the erase. This narrows 0139's original
--      "backstop" intent for these two (a payment_request_line/order_item
--      "must not be deletable out from under" a refund referencing it) to
--      apply only outside the account-deletion path -- the same trade
--      0129/0143 already made everywhere else in this feature area:
--      preserving the financial record over a hard block that, per 0139's
--      own comment, was never live in practice anyway ("in practice neither
--      is ever deleted directly"). Re-verified: the same fixture then
--      completed with `{ok: true}` and both the parent refund and its line
--      survived pseudonymised, dangling honestly at a payment_request_line
--      that is now gone -- the same "orphaned but honest reference" shape
--      `refunds.payment_request_id` itself ends up in.
--
-- Both empirical failures and the final pass are reproduced in
-- apps/web/tests/db/account-deletion-retention.test.ts, extended with a real
-- refund + refund_lines fixture rather than a synthetic one.

alter table refunds alter column artist_id drop not null;
alter table refunds drop constraint if exists refunds_artist_id_fkey;
alter table refunds
  add constraint refunds_artist_id_fkey
  foreign key (artist_id) references profiles(id) on delete set null;

alter table refund_lines alter column artist_id drop not null;
alter table refund_lines drop constraint if exists refund_lines_artist_id_fkey;
alter table refund_lines
  add constraint refund_lines_artist_id_fkey
  foreign key (artist_id) references profiles(id) on delete set null;

-- Fix 1: composite subject FKs that include artist_id -- deferred is
-- sufficient (MATCH SIMPLE exempts them once artist_id is null).
alter table refunds drop constraint if exists refunds_payment_request_fk;
alter table refunds
  add constraint refunds_payment_request_fk
  foreign key (payment_request_id, artist_id, currency)
  references payment_requests(id, artist_id, currency)
  deferrable initially deferred;

alter table refunds drop constraint if exists refunds_order_fk;
alter table refunds
  add constraint refunds_order_fk
  foreign key (order_id, artist_id)
  references orders(id, artist_id)
  deferrable initially deferred;

-- Fix 2: line-reference FKs that do NOT include artist_id -- deferring them
-- does nothing (proven above); they need their own ON DELETE SET NULL so the
-- surviving refund_lines row's pointer goes null instead of blocking the
-- cascade-erase of the line/order_item it names.
alter table refund_lines drop constraint if exists refund_lines_request_line_fk;
alter table refund_lines
  add constraint refund_lines_request_line_fk
  foreign key (payment_request_line_id, payment_request_id)
  references payment_request_lines(id, request_id)
  on delete set null;

alter table refund_lines drop constraint if exists refund_lines_order_item_fk;
alter table refund_lines
  add constraint refund_lines_order_item_fk
  foreign key (order_item_id) references order_items(id)
  on delete set null;
