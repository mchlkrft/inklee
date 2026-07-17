-- DRAFT — NOT YET A LIVE MIGRATION. Deliberately parked in supabase/drafts/
-- so it cannot ride along on an unrelated `supabase db push`. Promotion steps:
--   1. Move into supabase/migrations/ under the then-current next number.
--   2. Apply on a LOCAL Supabase and exercise the profile flows below.
--   3. `supabase db push` to prod only with an explicit founder go.
--
-- What this fixes (found in the 2026-07-17 Inklee 2.0 collision audit,
-- docs/product/inklee-2-collision-audit.md section 5): the own-row UPDATE
-- policy from 0026 has no column limits and profiles has no column-level
-- privileges, so any authenticated user hitting PostgREST directly with their
-- own JWT can update ANY column on their own row, including is_tester
-- (analytics self-exclusion), account_status / suspended_* (profile-state
-- divergence from the auth-level ban), and stripe_account_id /
-- stripe_charges_enabled / stripe_account_status (money-adjacent). The same
-- self-escalation exists at INSERT time via the 0032 own-row INSERT policy.
-- Same issue class as 0062 (instagram token column privileges).
--
-- Fix pattern: revoke table-level UPDATE/INSERT from anon + authenticated,
-- re-grant only the columns the app legitimately writes through user-scoped
-- clients. Column set enumerated 2026-07-17 across every authenticated-role
-- write site: all web server actions, all /api/mobile/* routes (bearer
-- clients are role `authenticated`), the shared ical token module, and the
-- claim-slug upserts (web + mobile onboarding). Service-role writers
-- (stripe-connect, admin actions, MFA recovery, email preferences, account
-- deletion) are unaffected by grants on `authenticated`.
--
-- ⚠️ Footgun carried over from 0062: column grants do NOT auto-extend to new
-- columns. Any future migration that adds a profiles column written via
-- user-scoped clients MUST extend these grants in the same migration.
--
-- Verification after applying locally:
--   - settings/profile save, settings/account name change, every settings/*
--     surface, onboarding claim-slug (fresh account), mobile profile PUT,
--     mobile logo/cover upload, ical token generate/revoke.
--   - Negative check: as an authenticated user via PostgREST,
--     `PATCH /rest/v1/profiles?id=eq.<own-id>` with {"is_tester": true}
--     must return a permission error.
--   - `select grantee, privilege_type, column_name from
--      information_schema.column_privileges where table_name = 'profiles';`

BEGIN;

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
REVOKE INSERT ON public.profiles FROM anon, authenticated;

-- Union of every column written by authenticated-role UPDATEs, plus the
-- claim-slug upsert's ON CONFLICT UPDATE set (slug, signup_attribution):
GRANT UPDATE (
  slug,
  display_name,
  first_name,
  last_name,
  instagram_handle,
  bio,
  timezone,
  location,
  logo_url,
  booking_mode,
  settings,
  signup_attribution,
  updated_at
) ON public.profiles TO authenticated;

-- The claim-slug upsert (web onboarding/claim-slug action + mobile
-- onboarding/profile route) is the only authenticated INSERT path:
GRANT INSERT (
  id,
  slug,
  display_name,
  instagram_handle,
  location,
  timezone,
  signup_attribution,
  updated_at
) ON public.profiles TO authenticated;

COMMIT;
