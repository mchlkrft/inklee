-- Pair the sponsorship release with what was ACTUALLY booked against the cap.
--
-- 0099 released a share of the PaymentIntent's `sponsored_fee_cents` metadata,
-- which records what Inklee INTENDED to waive at request time. It is not proof
-- that anything was ever added to the artist's counter. The settlement
-- increment runs only inside the once-only FSM gate in the Stripe webhook, and
-- its RPC error is swallowed, so there are real paths where the waiver is never
-- booked:
--
--   • Orphaned payment: the artist cancels while the card is in flight, the
--     PaymentIntent cancel fails (already processing), the charge succeeds, and
--     the webhook returns early because the booking is already cancelled. The
--     increment never runs.
--   • The increment RPC fails transiently and the error is captured and
--     dropped; settlement otherwise completes.
--
-- In both cases 0099 would still release on refund, subtracting from a
-- artist-GLOBAL counter that this booking never contributed to. That does not
-- merely mis-state a number: it erases OTHER bookings' real, unrefunded
-- waivers, so `canSponsorFeeCents` then hands out sponsorship past the cap the
-- founder deliberately set.
--
-- The fix is to make the release converge against a PER-BOOKING record of what
-- the increment actually booked. No booking, no release.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS deposit_fee_sponsorship_booked_cents INTEGER
  NOT NULL DEFAULT 0;

COMMENT ON COLUMN booking_requests.deposit_fee_sponsorship_booked_cents IS
  'Sponsored platform fee (in cents) actually added to the artist''s fee_sponsored_used_cents for this booking at settlement. 0 means nothing was ever booked, so a refund must release nothing. Zeroed when an admin resets the artist''s sponsorship usage, which starts a new budget period that older bookings must not draw against.';

-- Replaces the 0099 definition (same signature, so the existing grants carry
-- over; re-asserted below anyway). Two changes:
--
--   1. Return the cents the counter ACTUALLY gave back, not the delta we asked
--      for. The GREATEST floor can absorb part of a release, and the caller was
--      logging the requested amount as though it had all moved, which made the
--      audit trail unreconcilable.
--   2. Advance the per-booking ledger by what actually moved rather than
--      jumping it to the target, so a partially absorbed release stays
--      re-attemptable instead of being recorded as complete.
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
  v_before INTEGER;
  v_after INTEGER;
  v_moved INTEGER;
BEGIN
  IF p_booking_id IS NULL OR p_artist_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_target_cents IS NULL OR p_target_cents <= 0 THEN
    RETURN 0;
  END IF;

  -- Lock the booking row: concurrent deliveries for the same booking serialise
  -- here, so the second sees the first's write and computes a delta of 0.
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

  SELECT COALESCE(fee_sponsored_used_cents, 0)
    INTO v_before
    FROM account_overrides
   WHERE artist_id = p_artist_id
     FOR UPDATE;

  -- No overrides row means no counter to credit: nothing to do, and advancing
  -- the per-booking ledger would wrongly mark the release as done.
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE account_overrides
     SET fee_sponsored_used_cents = GREATEST(0, v_before - v_delta),
         updated_at = now()
   WHERE artist_id = p_artist_id
  RETURNING fee_sponsored_used_cents INTO v_after;

  v_moved := v_before - v_after;
  IF v_moved <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE booking_requests
     SET deposit_fee_sponsorship_released_cents = v_already + v_moved
   WHERE id = p_booking_id;

  RETURN v_moved;
END;
$$;

-- Re-assert the 0060 lockdown: this project runs
-- `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`,
-- and CREATE OR REPLACE can reapply those defaults.
REVOKE EXECUTE ON FUNCTION release_fee_sponsored_used(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_fee_sponsored_used(UUID, UUID, INTEGER)
  TO service_role;
