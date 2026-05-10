-- Drop policies that became unused after switching the public booking flow's
-- privileged operations to serviceClient (commit f467ac6, [slug]/actions.ts).
--
-- 1. "public can lock open slots" (slots, anon UPDATE) — added by 0028 as a
--    fix attempt before we discovered the real bug was UPDATE+RETURNING running
--    through the SELECT policy. Slot lock now uses serviceClient (bypasses RLS),
--    so anon should never directly UPDATE slots.
--
-- 2. "service role can insert booking images" (booking_images, authenticated
--    INSERT, WITH CHECK true) — defined in 0001 but misnamed: the role was
--    actually `authenticated`, not service role, with no ownership check, so
--    any authenticated user could insert any booking_images row. The advisor
--    flagged this as "RLS Policy Always True". booking_images insert now uses
--    serviceClient (matches Slice 32 design intent), so no policy is needed.
--
-- 3. "public_insert_waitlist" (waitlist_entries, INSERT, WITH CHECK true) —
--    same pattern: anon insert path with no constraint. Waitlist insert
--    already uses serviceClient at [slug]/actions.ts:598. Drop the policy.
--
-- After this migration, the Security Advisor should drop from 4 warnings
-- to 2 (storage.logos public-listing and Auth leaked-password — both
-- separate concerns deferred to follow-up work).

DROP POLICY IF EXISTS "public can lock open slots" ON slots;
DROP POLICY IF EXISTS "service role can insert booking images" ON booking_images;
DROP POLICY IF EXISTS "public_insert_waitlist" ON waitlist_entries;
