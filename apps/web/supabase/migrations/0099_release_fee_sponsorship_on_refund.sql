-- Release sponsored deposit fees back to the artist's budget when the deposit
-- is refunded.
--
-- THE BUG: `refundDepositCore` refunds with `refund_application_fee: true`, so
-- on an UNSPONSORED deposit Inklee's 3% goes back to the customer and Inklee
-- keeps nothing. On a SPONSORED deposit the application fee was already 0, so
-- sponsoring a deposit that is later refunded costs Inklee exactly the same as
-- not sponsoring it: nothing. Yet the waived amount stayed booked against the
-- artist's cap forever, because the only writer of fee_sponsored_used_cents was
-- increment_fee_sponsored_used (migration 0058), called at settlement.
--
-- With a 50.00 cap: a 1,000.00 deposit sponsors a 30.00 fee and settles, the
-- client then cancels and is refunded in full. Inklee waived nothing, but the
-- artist is left with 20.00 of their 50.00 comp. Once the per-fee gate landed
-- (canSponsorFeeCents) that stopped being a cosmetically wrong number and
-- started denying sponsorship outright: the next deposit whose fee is 25.00 is
-- refused and charged the standard 3%.
--
-- WHY A PER-BOOKING LEDGER COLUMN: `charge.refunded` fires once per refund and
-- carries the CUMULATIVE `amount_refunded`, and Stripe can redeliver any event.
-- Releasing "proportional to amount_refunded" on each delivery would refund the
-- budget twice for two partial refunds, and again on every redelivery. Storing
-- how much this booking has already released turns the operation into a
-- converge-to-target: the caller computes the total that SHOULD have been
-- released for the cumulative refund, and this function moves only the
-- difference. Redelivery computes the same target and moves nothing.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS deposit_fee_sponsorship_released_cents INTEGER
  NOT NULL DEFAULT 0;

COMMENT ON COLUMN booking_requests.deposit_fee_sponsorship_released_cents IS
  'Cumulative sponsored platform fee (in cents) already credited back to the artist''s sponsorship budget for this booking. Written only by release_fee_sponsored_used.';

-- Converge this booking's released total to p_target_cents and move the
-- difference off the artist's sponsorship usage. Returns the cents actually
-- released (0 when there is nothing to do), so the caller can log the real
-- amount rather than what it asked for.
CREATE OR REPLACE FUNCTION release_fee_sponsored_used(
  p_booking_id UUID,
  p_artist_id UUID,
  p_target_cents INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already INTEGER;
  v_delta INTEGER;
BEGIN
  IF p_booking_id IS NULL OR p_artist_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_target_cents IS NULL OR p_target_cents <= 0 THEN
    RETURN 0;
  END IF;

  -- Lock the booking row: two concurrent deliveries for the same booking
  -- serialise here, so the second one sees the first one's write and computes a
  -- delta of 0 instead of double-releasing.
  SELECT COALESCE(deposit_fee_sponsorship_released_cents, 0)
    INTO v_already
    FROM booking_requests
   WHERE id = p_booking_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_delta := p_target_cents - v_already;
  IF v_delta <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE booking_requests
     SET deposit_fee_sponsorship_released_cents = p_target_cents
   WHERE id = p_booking_id;

  -- GREATEST floors the counter at zero. In practice a refund always follows a
  -- settlement, so the increment has already run and the subtraction stays
  -- positive; the floor only guards against a counter that was reset (or an
  -- out-of-order delivery) rather than silently going negative.
  UPDATE account_overrides
     SET fee_sponsored_used_cents =
           GREATEST(0, COALESCE(fee_sponsored_used_cents, 0) - v_delta),
         updated_at = now()
   WHERE artist_id = p_artist_id;

  RETURN v_delta;
END;
$$;

-- Same lockdown as 0060: this project runs
-- `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`,
-- so a new SECURITY DEFINER function is callable by the public anon key unless
-- the grant is revoked explicitly. Only the Stripe webhook (service_role) may
-- call this: it moves money-adjacent accounting.
REVOKE EXECUTE ON FUNCTION release_fee_sponsored_used(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_fee_sponsored_used(UUID, UUID, INTEGER)
  TO service_role;
