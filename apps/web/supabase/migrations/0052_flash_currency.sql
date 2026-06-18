-- Flash item currency (ME test round, 2026-06-18). Flash designs were EUR-only:
-- price had no currency, so an international artist could not price in their own
-- currency the way goods (0035) and deposits (0044) already allow. This adds a
-- per-design currency, defaulting every existing design to 'eur' (the prior
-- hard-coded display), so no behaviour changes until an artist picks another.
--
-- Validation is app-side via the shared isCurrency() (packages/shared/src/goods.ts),
-- matching goods.currency — so extending the currency list never needs DDL and no
-- CHECK constraint is added.
--
-- Additive + idempotent (safe to re-run). This RUNS SQL: apply with
-- `supabase db push` (or paste in the SQL editor), NOT `migration repair
-- --status applied`. After applying, verify the column exists before any
-- bookkeeping repair (see AGENTS.md migration footgun):
--   select column_name from information_schema.columns
--   where table_name='flash_items' and column_name='currency';

ALTER TABLE flash_items
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'eur';
