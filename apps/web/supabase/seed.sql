-- Local-development seed, applied automatically after migrations on
-- `supabase db reset` (see [db.seed] in config.toml). It does NOT run on a
-- hosted Supabase deploy, so it never affects production.
--
-- Purpose: reproduce the role GRANTs that the Supabase platform sets up
-- automatically on a hosted project but that a bare local stack built purely
-- from this repo's migrations does not have. Without these, the service_role
-- (used by the app's serviceClient for audit_log inserts, public reads, and
-- by the e2e seed helpers) gets "permission denied for table ...".
--
-- RLS still governs anon/authenticated exactly as in production — these are
-- table-level GRANTs, not row policies. service_role bypasses RLS by design.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- Routines: only service_role. Function-level EXECUTE for anon/authenticated
-- comes from the local stack's own default privileges (mirroring prod), so a
-- migration that deliberately REVOKEs a service-only RPC from anon/authenticated
-- (e.g. 0060) stays revoked locally too, instead of being re-opened here.
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Re-apply deliberate column-privilege hardenings that the blanket
-- GRANT ALL above just clobbered. On prod these live ONLY in their
-- migrations; this block exists because seed.sql runs AFTER migrations
-- locally. ⚠️ When a new column-privilege migration lands, mirror its
-- REVOKE/GRANT statements here or local verification will silently
-- diverge from prod.

-- Mirror of 0062_instagram_token_column_privileges.sql:
REVOKE SELECT ON instagram_accounts FROM anon, authenticated;
GRANT SELECT (
  id, artist_id, instagram_user_id, username, token_expires_at,
  last_sync_at, connected, created_at, updated_at
) ON instagram_accounts TO authenticated;

-- Mirror of 0074_profiles_column_privileges.sql + the 0076 grant extension:
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
REVOKE INSERT ON public.profiles FROM anon, authenticated;
GRANT UPDATE (
  slug, display_name, first_name, last_name, instagram_handle, bio,
  timezone, location, logo_url, booking_mode, settings,
  signup_attribution, updated_at,
  map_visibility, looking_for_guest_spots,
  map_city_label, map_city_place_id, map_city_lat, map_city_lng,
  travel_map_consent
) ON public.profiles TO authenticated;
GRANT INSERT (
  id, slug, display_name, instagram_handle, location, timezone,
  signup_attribution, updated_at
) ON public.profiles TO authenticated;
