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
-- A SECOND, LESS OBVIOUS FIX: once `refund_lines` survives instead of being
-- destroyed with the artist, it still points at a `payment_request_line`
-- (or `order_item`) that DOES get cascade-erased in the SAME statement
-- (payment_request_lines stays CASCADE per BDEL-PAY-001 -- archived, not
-- schema-preserved; order_items cascades from orders, which cascades from
-- profiles). `refund_lines_request_line_fk (payment_request_line_id,
-- payment_request_id)` and `refund_lines_order_item_fk (order_item_id)` were
-- both plain ON DELETE NO ACTION and involve neither `artist_id` nor
-- anything else that gets nulled, so nothing exempts them: a real
-- `deleteOwnAccountCore` call against a fixture with a refund_lines row
-- referencing a sent payment_request_line failed outright ("update or
-- delete on table \"payment_request_lines\" violates foreign key constraint
-- \"refund_lines_request_line_fk\""), and nothing in the delete completed --
-- confirmed by isolated execution: this is the ONLY schema change in this
-- migration whose reversal reproducibly breaks the fixture; reverting just
-- this pair, with every other change in this file left in place, is
-- sufficient on its own to fail the exact same way. Both are now ON DELETE
-- SET NULL, narrowing 0139's original "backstop" intent for these two (a
-- payment_request_line/order_item "must not be deletable out from under" a
-- refund referencing it) to apply only outside the account-deletion path --
-- the same trade 0129/0143 already made elsewhere in this feature area, and
-- one 0139 itself noted was never live in practice ("in practice neither is
-- ever deleted directly").
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH, and why that is recorded
-- rather than silent. An earlier draft of this migration also made
-- `refunds_payment_request_fk` and `refunds_order_fk` (the composite FKs on
-- `refunds` ITSELF, which do include `artist_id`) DEFERRABLE INITIALLY
-- DEFERRED, reasoning that MATCH SIMPLE would need the deferred timing to
-- exempt them once `artist_id` is nulled by the same cascade. That reasoning
-- was tested against a compound state (both this pair AND the line-reference
-- pair above still broken) and the resulting failure was wrongly attributed
-- to this pair without isolating it. Isolated re-verification -- reverting
-- ONLY these two to their original NOT DEFERRABLE, ON DELETE NO ACTION shape,
-- with every other fix in this file left in place -- passes the full fixture
-- cleanly, 13/13. The deferred change was NOT load-bearing for the path this
-- fixture exercises and has been retracted rather than defended: it is not
-- carried on unverified reasoning, and a money-adjacent FK's deferred
-- checking should not exist without a proven reason. Both constraints are
-- left exactly as 0139 defined them.
--
-- CONVERGENCE. MIG-DROP-001's lesson: `drop constraint if exists` on its own
-- statement, unconditional `add constraint` after it -- never a two-clause
-- bare ALTER TABLE (0129/0143's shape). The renaming lesson from 0146
-- (183e5841) does not apply here: every constraint below keeps its existing
-- name, only the referential action changes, so a single `drop ... if
-- exists` / `add` pair per constraint converges correctly on a re-run.
--
-- Every claim above is reproduced in
-- apps/web/tests/db/account-deletion-retention.test.ts, extended with a real
-- refund + refund_lines fixture (against the existing sent payment_request)
-- rather than a synthetic one, exercised through the real
-- `deleteOwnAccountCore`, not a raw DELETE.

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

-- Line-reference FKs: the fix proven load-bearing by isolated execution (see
-- header). Once the payment_request_line/order_item they name is
-- cascade-erased, the surviving refund_lines row's pointer goes null instead
-- of blocking the erase.
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

-- refunds_payment_request_fk and refunds_order_fk are DELIBERATELY left
-- untouched -- see header. Not reproduced here; 0139's original definitions
-- stand.
