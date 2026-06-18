-- Artist-chosen icon COLOR for trips + studios (ME test round, 2026-06-18).
-- Companion to 0049 (icon key). NULL = no color chosen → render the surface's
-- default icon color, exactly like NULL icon = default glyph. No CHECK
-- constraint: the value is validated app-side against the shared palette
-- (packages/shared/src/travel-icons.ts sanitizeTravelIconColor), so extending
-- the palette never needs DDL.
--
-- Additive + idempotent (safe to re-run). This RUNS SQL: apply with
-- `supabase db push` (or paste in the SQL editor), NOT `migration repair
-- --status applied`. After applying, verify the columns exist before any
-- bookkeeping repair (see AGENTS.md migration footgun):
--   select table_name, column_name from information_schema.columns
--   where column_name='icon_color' and table_name in ('trips','studios');

alter table trips add column if not exists icon_color text;
alter table studios add column if not exists icon_color text;
