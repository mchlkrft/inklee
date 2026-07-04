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
