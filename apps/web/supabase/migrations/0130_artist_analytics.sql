-- 0130 — artist-keyed analytics plane (P6 Linkhub analytics)
--
-- A PARALLEL plane to the anonymous web_analytics_events (0070). That table
-- tracks anonymous public acquisition traffic for the founder cockpit. This
-- one tracks per-artist page performance for the ARTIST's own analytics,
-- gated by the canSeeAdvancedAnalytics entitlement (Plus only, Free = none).
--
-- Privacy: same invariants as 0070. No raw IP, no persistent visitor id; the
-- visitor_hash is the same daily-rotating HMAC. Artist-keyed but never
-- client-keyed: the artist sees aggregate counts, not who visited.
--
-- Two tables:
--   artist_page_events  — raw click-level events (link_click, block_click).
--                         Pageviews flow through rollups from web_analytics_events.
--                         Retained 13 months, then purged.
--   artist_page_rollups — daily aggregated metrics per artist per surface.
--                         Includes pageview counts resolved from wa events.
--                         Retained permanently (aggregate, no visitor identity).
--
-- SECURITY MODEL: RLS enabled. Authenticated artists SELECT their own rows.
-- Only the service role writes (ingestion endpoint, rollup cron, server-side
-- conversion recording). INSERT/UPDATE/DELETE/TRUNCATE revoked from anon and
-- authenticated.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'artist_page_surface') then
    create type artist_page_surface as enum (
      'hub', 'booking_form', 'shop', 'large_project', 'pay'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'artist_page_event_type') then
    create type artist_page_event_type as enum (
      'page_view', 'link_click', 'block_click',
      'booking_submitted', 'goods_order_completed'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Raw click events
-- ---------------------------------------------------------------------------

create table if not exists artist_page_events (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid not null references profiles(id) on delete cascade,
  surface       artist_page_surface not null,
  event         artist_page_event_type not null,
  target_key    text,
  visitor_hash  text,
  channel       text,
  referrer_domain text,
  occurred_at   timestamptz not null default now(),
  properties    jsonb not null default '{}'::jsonb
);

create index if not exists ape_artist_time_idx
  on artist_page_events (artist_id, occurred_at desc);
create index if not exists ape_artist_surface_event_idx
  on artist_page_events (artist_id, surface, event, occurred_at desc);

alter table artist_page_events enable row level security;

drop policy if exists "artists read own events" on artist_page_events;
create policy "artists read own events"
  on artist_page_events for select to authenticated
  using (artist_id = auth.uid());

revoke insert, update, delete, truncate
  on artist_page_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Daily rollups (permanent, aggregate only)
-- ---------------------------------------------------------------------------

create table if not exists artist_page_rollups (
  id              uuid primary key default gen_random_uuid(),
  artist_id       uuid not null references profiles(id) on delete cascade,
  roll_date       date not null,
  surface         artist_page_surface not null,
  event           artist_page_event_type not null,
  target_key      text,
  event_count     integer not null default 0,
  unique_visitors integer not null default 0,
  constraint apr_unique unique nulls not distinct
    (artist_id, roll_date, surface, event, target_key)
);

create index if not exists apr_artist_date_idx
  on artist_page_rollups (artist_id, roll_date desc);
create index if not exists apr_artist_surface_idx
  on artist_page_rollups (artist_id, roll_date desc, surface);

alter table artist_page_rollups enable row level security;

drop policy if exists "artists read own rollups" on artist_page_rollups;
create policy "artists read own rollups"
  on artist_page_rollups for select to authenticated
  using (artist_id = auth.uid());

revoke insert, update, delete, truncate
  on artist_page_rollups from anon, authenticated;
