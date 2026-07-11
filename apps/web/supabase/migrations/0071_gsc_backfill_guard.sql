-- 0071 — GSC backfill concurrency guard (review follow-up to 0070)
--
-- The startGscBackfillAction check-then-insert had a race: two near-simultaneous
-- clicks could both pass the "is a backfill running?" SELECT and insert two
-- 'running' rows, which the daily sync would then advance independently. A
-- partial unique index makes "at most one running backfill per property" a
-- database guarantee; the action treats the resulting 23505 as the authoritative
-- "already running" signal.
--
-- Additive only. Applied via `supabase db push`. Never `migration repair`.
CREATE UNIQUE INDEX IF NOT EXISTS gsc_backfills_one_running_idx
  ON gsc_backfills (property_id)
  WHERE status = 'running';
