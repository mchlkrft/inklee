-- 0074: profiles column-level privileges (security hardening)
--
-- Closes the gap found in the 2026-07-17 Inklee 2.0 collision audit
-- (docs/product/inklee-2-collision-audit.md section 5): the own-row UPDATE
-- policy from 0026 has no column limits and profiles had no column-level
-- privileges, so any authenticated user hitting PostgREST directly with their
-- own JWT could update ANY column on their own row, including is_tester
-- (analytics self-exclusion), account_status / suspended_* (profile-state
-- divergence from the auth-level ban), and stripe_account_id /
-- stripe_charges_enabled / stripe_account_status (money-adjacent). The same
-- self-escalation existed at INSERT time via the 0032 own-row INSERT policy.
-- Same issue class as 0062 (instagram token column privileges).
--
-- Fix: revoke table-level UPDATE/INSERT from anon + authenticated, re-grant
-- only the columns the app legitimately writes through user-scoped clients.
-- Column set enumerated 2026-07-17 across every authenticated-role write
-- site: all web server actions, all /api/mobile/* routes (bearer clients are
-- role `authenticated`), the shared ical token module, and the claim-slug
-- upserts (web + mobile onboarding). Service-role writers (stripe-connect,
-- admin actions, MFA recovery, email preferences, account deletion) bypass
-- these grants entirely.
--
-- ⚠️ Footgun carried over from 0062: column grants do NOT auto-extend to new
-- columns. Any future migration that adds a profiles column written via
-- user-scoped clients MUST extend these grants in the same migration.
-- (First known case: the planned Inklee 2.0 artist map columns, see
-- docs/product/inklee-2-schema-proposal.md section 2.8.)
--
-- ⚠️ Local-dev mirror: supabase/seed.sql re-applies platform grants AFTER
-- migrations and would clobber this hardening locally, so it carries a mirror
-- of these statements. Keep the two in sync (prod is governed by this file
-- alone; seed.sql never runs on prod).

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
