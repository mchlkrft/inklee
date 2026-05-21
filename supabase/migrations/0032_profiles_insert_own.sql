-- Onboarding-fix: allow authenticated users to insert their own profile row.
--
-- Background: migration 0026 restored RLS on profiles with two policies:
--   - "artists can view own profile" (SELECT, USING auth.uid() = id)
--   - "artists can update own profile" (UPDATE, USING auth.uid() = id)
-- Neither covers INSERT. The original 0001 had the same gap, but the
-- migration-bookkeeping issue meant RLS was effectively off in prod, so
-- onboarding worked anyway. After 0026 properly enabled RLS on 2026-05-10,
-- every new signup has been silently broken at /onboarding/claim-slug:
--   "new row violates row-level security policy for table 'profiles'"
--
-- Fix: add an own-row INSERT policy. This matches the existing SELECT/UPDATE
-- pattern (auth.uid() = id) and is the standard Supabase idiom for
-- self-service profile creation post-signup.

CREATE POLICY "artists can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
