CREATE OR REPLACE FUNCTION reorder_custom_field(
  p_field_id UUID,
  p_direction TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_artist_id UUID := auth.uid();
  v_current RECORD;
  v_swap RECORD;
BEGIN
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'invalid direction';
  END IF;

  SELECT id, position
  INTO v_current
  FROM custom_fields
  WHERE id = p_field_id
    AND artist_id = v_artist_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'field not found';
  END IF;

  IF p_direction = 'up' THEN
    SELECT id, position
    INTO v_swap
    FROM custom_fields
    WHERE artist_id = v_artist_id
      AND deleted_at IS NULL
      AND position < v_current.position
    ORDER BY position DESC
    LIMIT 1;
  ELSE
    SELECT id, position
    INTO v_swap
    FROM custom_fields
    WHERE artist_id = v_artist_id
      AND deleted_at IS NULL
      AND position > v_current.position
    ORDER BY position ASC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE custom_fields
  SET position = CASE
    WHEN id = v_current.id THEN v_swap.position
    WHEN id = v_swap.id THEN v_current.position
    ELSE position
  END
  WHERE artist_id = v_artist_id
    AND id IN (v_current.id, v_swap.id);
END;
$$;

GRANT EXECUTE ON FUNCTION reorder_custom_field(UUID, TEXT) TO authenticated;
