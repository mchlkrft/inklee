-- Artist-chosen icon tile BACKGROUND color for trips + studios. Companion to
-- 0049 (icon key) and 0053 (icon color). NULL = no choice → bone, the tile's
-- historic fixed color. No CHECK constraint: the value is validated app-side
-- against the shared palette (packages/shared/src/travel-icons.ts
-- sanitizeTravelIconBg), so extending the palette never needs DDL.
--
-- Additive + idempotent (safe to re-run). This RUNS SQL: apply with
-- `supabase db push` (or paste in the SQL editor), NOT `migration repair
-- --status applied`. After applying, verify the columns exist before any
-- bookkeeping repair (see AGENTS.md migration footgun):
--   select table_name, column_name from information_schema.columns
--   where column_name='icon_bg' and table_name in ('trips','studios');

alter table trips add column if not exists icon_bg text;
alter table studios add column if not exists icon_bg text;
