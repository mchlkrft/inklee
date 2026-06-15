-- Flash day overhaul (Slice 60d.3):
-- 1. Link flash days to the studio library (so artist's own studios from Trip
--    Planner can be selected directly instead of typed as free text).
-- 2. Add `is_public` to control whether the day gets a public shareable page
--    at /{slug}/flash/days/[dayId]. Default false (artists ship via the form
--    toggle when they're ready).
--
-- Backwards-compat: the existing `location` TEXT column stays as the
-- "external venue not in my studio library" fallback. UI prefers structured
-- `studio_id` when set, falls back to `location` text when not.
--
-- `IF NOT EXISTS` makes this safe to re-run against environments where one or
-- both columns were already added manually (e.g., the prod 2026-05-21 apply
-- where `studio_id` had been added in an earlier attempt before this file
-- shipped).

ALTER TABLE flash_days
  ADD COLUMN IF NOT EXISTS studio_id UUID REFERENCES studios(id) ON DELETE SET NULL;

ALTER TABLE flash_days
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
