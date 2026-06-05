-- Follow-up to 0030. The same hardening rationale applies to two tables that
-- 0030 missed:
--
-- 1. "public can view open slots" (slots FOR SELECT TO anon USING status='open')
--    — defined in 0001 + reaffirmed in 0026. Slot rows expose `artist_id`,
--    `starts_at`, `duration_minutes`, etc. RLS cannot hide columns; anon REST
--    can enumerate all open slots across every artist. All slot reads in the
--    code use `serviceClient` (public routes) or authenticated user context
--    (artist routes) — the anon SELECT path is unused.
--
-- 2. "public_read_active_custom_fields" (custom_fields FOR SELECT TO anon
--    USING active=true AND deleted_at IS NULL) — defined in 0005. Custom-field
--    rows expose `artist_id`, `key`, `label`, `type`, options, position.
--    Same enumeration leak. Public booking form's validation in
--    `[slug]/actions.ts:158` uses serviceClient; artist-side reads use
--    authenticated user context. Anon SELECT is unused.
--
-- After this migration runs, anon REST probes against these two tables should
-- return count=0, matching the state of profiles / booking_requests / studios
-- / trips / trip_legs / flash_items / flash_days after 0030.

DROP POLICY IF EXISTS "public can view open slots" ON slots;
DROP POLICY IF EXISTS "public_read_active_custom_fields" ON custom_fields;
