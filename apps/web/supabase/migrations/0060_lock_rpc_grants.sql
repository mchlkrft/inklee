-- SECURITY FIX for 0058/0059: lock the two service-only RPCs to service_role.
--
-- 0058/0059 did `REVOKE ALL ... FROM PUBLIC` then `GRANT EXECUTE ... TO
-- service_role`. That is NOT enough on a Supabase database: the project has
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated`, so every newly-created function ALSO gets an explicit
-- anon + authenticated EXECUTE grant that a REVOKE-from-PUBLIC does not touch.
-- The result: both functions were callable through PostgREST with the public
-- anon key.
--
-- Impact this closes:
--  • book_flash_item is SECURITY DEFINER and INSERTs into booking_requests
--    bypassing RLS. With anon EXECUTE, anyone with the (public) anon key could
--    POST /rest/v1/rpc/book_flash_item to forge bookings under ANY artist_id
--    with arbitrary form_data, skipping the public form's honeypot / origin /
--    rate-limit / validation.
--  • increment_fee_sponsored_used let anyone mutate any artist's sponsored-fee
--    running total.
--
-- Only the server (serviceClient = service_role) is meant to call these.

REVOKE EXECUTE ON FUNCTION increment_fee_sponsored_used(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION book_flash_item(
  UUID, UUID, UUID, JSONB, DATE, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;

-- Re-assert the intended grant (idempotent; service_role already has it).
GRANT EXECUTE ON FUNCTION increment_fee_sponsored_used(UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION book_flash_item(
  UUID, UUID, UUID, JSONB, DATE, TEXT, TEXT, TEXT, UUID
) TO service_role;
