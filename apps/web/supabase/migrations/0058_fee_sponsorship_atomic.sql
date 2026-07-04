-- PAY-1: atomic fee-sponsorship accounting.
--
-- The Stripe webhook tracked Inklee's foregone 3% against the artist's
-- sponsorship budget with a read-modify-write on account_overrides
-- (SELECT fee_sponsored_used_cents; UPDATE = old + delta). The once-only FSM
-- gate makes this safe against REPLAYS of the same booking, but two DIFFERENT
-- bookings for the SAME artist whose payment_intent.succeeded events land
-- concurrently both read the same base and one increment is lost. Direction
-- favours the artist (Inklee slightly over-sponsors), never overcharges a
-- customer, but the running total drifts.
--
-- This function does the increment as a single atomic UPDATE
-- (col = col + delta), so concurrent settlements can no longer lose an
-- increment. Restricted to service_role: only the webhook (serviceClient)
-- calls it; anon/authenticated get permission denied.

CREATE OR REPLACE FUNCTION increment_fee_sponsored_used(
  p_artist_id UUID,
  p_cents INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_cents IS NULL OR p_cents <= 0 THEN
    RETURN;
  END IF;

  UPDATE account_overrides
  SET fee_sponsored_used_cents = COALESCE(fee_sponsored_used_cents, 0) + p_cents,
      updated_at = now()
  WHERE artist_id = p_artist_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_fee_sponsored_used(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_fee_sponsored_used(UUID, INTEGER) TO service_role;
