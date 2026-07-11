-- 0072 — drop the abandoned public-roadmap / voting / product-feedback tables (founder decision)
--
-- These four tables, a trigger, and a trigger function were created directly in production
-- (~2026-06-02, via the SQL editor) as an unfinished public roadmap + upvoting + product-feedback
-- feature. They were never wired to any application code, migration, or UI, and the growth-cockpit
-- audit flagged them as schema drift ("do not build on these"). State at drop time:
--   roadmap_items                 14 curated rows that DUPLICATE docs/roadmap.md (the source of truth)
--   roadmap_votes                 0 rows (+ trigger roadmap_votes_count_sync)
--   product_feedback              0 rows
--   product_feedback_admin_notes  0 rows
--   roadmap_items_vote_count_sync trigger function (no args, SECURITY DEFINER)
--
-- Verified before writing this migration: no table outside this set has a foreign key to any of
-- them, and no view references them, so CASCADE only removes their own policies, the trigger, and
-- the internal FKs. The roadmap content is not unique (it lives in docs/roadmap.md), so nothing of
-- value is lost.
--
-- Founder decision 2026-07-11: drop rather than carry dead schema. This is IRREVERSIBLE.
-- Applied via `supabase db push`.

DROP TABLE IF EXISTS roadmap_votes CASCADE;
DROP TABLE IF EXISTS product_feedback_admin_notes CASCADE;
DROP TABLE IF EXISTS product_feedback CASCADE;
DROP TABLE IF EXISTS roadmap_items CASCADE;
DROP FUNCTION IF EXISTS roadmap_items_vote_count_sync() CASCADE;
