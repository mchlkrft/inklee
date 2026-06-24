-- MONEY-04 (Codex audit 2026-06-24): make deposit-refund logging durably
-- idempotent. The in-app refund (refundDepositCore) and the charge.refunded
-- Stripe webhook both count-then-insert a `deposit_refunded` audit row, so a
-- concurrent refund click + webhook delivery can both observe count 0 and write
-- two rows. Inklee supports one full refund per booking, so enforce exactly one
-- `deposit_refunded` audit row per booking at the DB level; both writers now
-- treat a 23505 unique violation as success (the Stripe refund itself is already
-- idempotent via the `refund-deposit-${id}` key).

-- Drop any pre-existing duplicate `deposit_refunded` rows (keep one per booking)
-- so the unique index can be created cleanly. ctid keeps this independent of
-- id/timestamp ordering.
DELETE FROM public.audit_log a
USING public.audit_log b
WHERE a.action = 'deposit_refunded'
  AND b.action = 'deposit_refunded'
  AND a.booking_id = b.booking_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS audit_log_one_deposit_refund_per_booking
  ON public.audit_log (booking_id)
  WHERE action = 'deposit_refunded';
