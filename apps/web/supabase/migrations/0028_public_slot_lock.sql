-- Allow public booking form to atomically lock an open slot during submission.
--
-- The public submission flow at `src/app/[slug]/actions.ts` does a single
-- UPDATE that flips an open slot to `locked` as the concurrency guard:
--   UPDATE slots SET status='locked' WHERE id=? AND status='open'
-- Postgres makes this atomic. If two customers race for the same slot,
-- only one UPDATE matches a row; the other sees 0 affected rows and is
-- told "this slot is no longer available".
--
-- Migration 0001 only granted UPDATE on slots to authenticated artists for
-- their own rows. The app worked previously because RLS was effectively
-- off (per 0026 history). Now with RLS on, anon visitors can't perform
-- the lock and every public booking with `fixed_slots` mode fails.
--
-- This policy is intentionally narrow:
--   USING (status = 'open')        — anon can only target open slots
--   WITH CHECK (status = 'locked') — anon can only set status to locked
-- So anon can never cancel, re-open, or otherwise mutate slots.

DROP POLICY IF EXISTS "public can lock open slots" ON slots;

CREATE POLICY "public can lock open slots"
  ON slots FOR UPDATE
  TO anon
  USING (status = 'open')
  WITH CHECK (status = 'locked');
