-- PUB-3: atomic flash-item booking capacity.
--
-- Public flash intake read an active-request COUNT, called
-- computeFlashAvailability, then inserted, with no lock between. Two concurrent
-- clients booking the same `unique` (cap 1) or `limited` (cap N) design could
-- both pass the count gate and both insert, overshooting intake capacity. A
-- plain partial unique index can't express this: the cap lives on flash_items
-- (booking_mode / max_bookings), not on booking_requests, and `limited` allows
-- N > 1 (a unique index can only enforce 1). `repeatable` is unbounded and must
-- not be constrained at all.
--
-- This function performs the capacity check and the insert atomically: it locks
-- the flash_items row (FOR UPDATE) so concurrent bookings for the same design
-- serialise, counts active requests, compares against the mode's cap, and
-- inserts only if there is room. Returns the new booking id, or NULL when the
-- item is full / missing / not owned by the artist. `repeatable` skips the
-- count and always inserts. Restricted to service_role (the public flash action
-- runs under serviceClient); SECURITY DEFINER so the insert is not blocked by
-- booking_requests RLS, matching the serviceClient write it replaces.
--
-- Active statuses mirror packages/shared FLASH_ACTIVE_REQUEST_STATUSES
-- ('pending', 'approved', 'deposit_pending').

CREATE OR REPLACE FUNCTION book_flash_item(
  p_flash_item_id UUID,
  p_artist_id UUID,
  p_booking_id UUID,
  p_form_data JSONB,
  p_preferred_date DATE,
  p_customer_email TEXT,
  p_customer_handle TEXT,
  p_customer_token_hash TEXT,
  p_flash_day_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
  v_max INTEGER;
  v_active INTEGER;
  v_cap INTEGER;
BEGIN
  -- Serialise concurrent bookings for the same design on the item row.
  SELECT booking_mode, max_bookings
  INTO v_mode, v_max
  FROM flash_items
  WHERE id = p_flash_item_id
    AND artist_id = p_artist_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_mode <> 'repeatable' THEN
    SELECT count(*)
    INTO v_active
    FROM booking_requests
    WHERE flash_item_id = p_flash_item_id
      AND status IN ('pending', 'approved', 'deposit_pending');

    IF v_mode = 'unique' THEN
      v_cap := 1;
    ELSE
      v_cap := COALESCE(v_max, 1);
    END IF;

    IF v_active >= v_cap THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO booking_requests (
    id, artist_id, status, form_data, preferred_date,
    customer_email, customer_handle, customer_token_hash,
    origin, flash_item_id, flash_day_id
  ) VALUES (
    p_booking_id, p_artist_id, 'pending', p_form_data, p_preferred_date,
    p_customer_email, p_customer_handle, p_customer_token_hash,
    'public_form', p_flash_item_id, p_flash_day_id
  );

  RETURN p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION book_flash_item(UUID, UUID, UUID, JSONB, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION book_flash_item(UUID, UUID, UUID, JSONB, DATE, TEXT, TEXT, TEXT, UUID) TO service_role;
