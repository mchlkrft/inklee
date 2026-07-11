-- 0070 — public web analytics + Google Search Console (growth cockpit acquisition layer, Phase 1)
--
-- Adds the ANONYMOUS acquisition layer the cockpit was missing. Two groups of objects:
--
--   1. First-party public web analytics:
--        web_analytics_events      — allowlisted pageviews + registry-validated public events from
--                                    Inklee's public surfaces. NO raw IP, NO full user agent, NO
--                                    full referrer URLs (domain only), NO form content, NO
--                                    persistent identifiers: the visitor key is a DAILY server-side
--                                    HMAC (date + hostname + transient request IP + coarse UA
--                                    signal) that cannot be reversed and rotates every day.
--        web_analytics_ingest_stats — per-day acceptance/rejection counters (diagnostics; counts only).
--        wa_visits()                — THE sessionization primitive: a visit is a sequence of events
--                                    from one daily visitor hash with no gap > 30 minutes; every
--                                    dashboard aggregate builds on this one definition.
--        wa_kpis / wa_timeseries / wa_breakdown / wa_campaigns / wa_organic_landing — aggregates.
--   2. Google Search Console:
--        gsc_connections / gsc_properties — OAuth connection (refresh token stored AES-256-GCM
--                                    encrypted; never readable outside the server) + property choice.
--        gsc_daily_totals / gsc_daily_dimensions — normalized daily performance rows (search type
--                                    'web'; dimensions query/page/country/device), idempotent upserts.
--        gsc_backfills              — resumable backfill progress.
--        gsc_dimension_agg()        — impression-weighted aggregation over a date range.
--
-- SECURITY MODEL (same as 0067-0069): tables RLS-enabled with NO policies (service-role only);
-- views none this time; functions SECURITY DEFINER with pinned search_path, EXECUTE revoked from
-- public/anon/authenticated and granted to service_role.
--
-- RETENTION: web_analytics_events rows are anonymous by construction (daily-rotating hash) and are
-- purged after 24 months by the retention cron, matching the audit-log convention. GSC rows are
-- aggregate search statistics (no personal data) and are kept indefinitely.
--
-- Additive only. Applied via `supabase db push`. Never `migration repair`.

-- ---------------------------------------------------------------------------
-- 1. First-party public analytics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS web_analytics_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  event_name        text NOT NULL CHECK (event_name ~ '^[a-z][a-z0-9_]{2,63}$'),
  hostname          text NOT NULL,
  pathname          text NOT NULL,
  -- Client-session landing hint (fallback only; the canonical landing page of
  -- a visit is its first pageview, derived in wa_visits).
  landing_path      text,
  referrer_domain   text,
  channel           text NOT NULL CHECK (channel IN (
                      'direct','organic_search','paid_search','organic_social',
                      'paid_social','email','referral','other')),
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_content       text,
  utm_term          text,
  country_code      text,
  device_type       text CHECK (device_type IN ('desktop','mobile','tablet')),
  browser_family    text,
  os_family         text,
  screen_bucket     text,
  visitor_day_hash  text NOT NULL,
  is_conversion     boolean NOT NULL DEFAULT false,
  properties        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS wa_events_time_idx ON web_analytics_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS wa_events_name_time_idx ON web_analytics_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS wa_events_visitor_time_idx ON web_analytics_events (visitor_day_hash, occurred_at);

ALTER TABLE web_analytics_events ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only the server-side ingestion route inserts,
-- only the admin-gated query layer reads (both via the service role).

CREATE TABLE IF NOT EXISTS web_analytics_ingest_stats (
  day                  date PRIMARY KEY,
  bot_rejected         int NOT NULL DEFAULT 0,
  invalid_payload      int NOT NULL DEFAULT 0,
  internal_rejected    int NOT NULL DEFAULT 0,
  unsupported_hostname int NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE web_analytics_ingest_stats ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies (service-role only). Accepted counts come from
-- web_analytics_events itself; this table holds rejection counters only.

-- Atomic rejection counter (one call per rejected request, fire-and-forget).
CREATE OR REPLACE FUNCTION wa_ingest_bump(p_day date, p_field text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_field NOT IN ('bot_rejected','invalid_payload','internal_rejected','unsupported_hostname') THEN
    RAISE EXCEPTION 'invalid field %', p_field;
  END IF;
  EXECUTE format(
    'INSERT INTO web_analytics_ingest_stats (day, %I) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET %I = web_analytics_ingest_stats.%I + 1, updated_at = now()',
    p_field, p_field, p_field
  ) USING p_day;
END;
$$;

-- THE visit definition (docs/metric-definitions.md "Visit"): events from one
-- daily visitor hash with no inactivity gap longer than 30 minutes. A visit is
-- attributed to its FIRST pageview (landing page, channel, utm, referrer,
-- geo/device); conversion counts are per visit. Daily hash rotation means a
-- visit never spans midnight UTC (documented approximation).
CREATE OR REPLACE FUNCTION wa_visits(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  visitor_day_hash text,
  visit_start timestamptz,
  hostname text,
  landing_path text,
  channel text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer_domain text,
  country_code text,
  device_type text,
  pageviews int,
  signup_starts int,
  signup_completions int,
  booking_completions int,
  conversions int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ordered AS (
    SELECT
      e.*,
      CASE
        WHEN lag(e.occurred_at) OVER w IS NULL THEN 1
        WHEN e.occurred_at - lag(e.occurred_at) OVER w > interval '30 minutes' THEN 1
        ELSE 0
      END AS is_new_visit
    FROM web_analytics_events e
    WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
    WINDOW w AS (PARTITION BY e.visitor_day_hash ORDER BY e.occurred_at, e.id)
  ), numbered AS (
    SELECT
      o.*,
      sum(o.is_new_visit) OVER (PARTITION BY o.visitor_day_hash ORDER BY o.occurred_at, o.id) AS visit_seq
    FROM ordered o
  ), firsts AS (
    SELECT DISTINCT ON (n.visitor_day_hash, n.visit_seq)
      n.visitor_day_hash,
      n.visit_seq,
      n.occurred_at AS visit_start,
      n.hostname,
      CASE WHEN n.event_name = 'pageview' THEN n.pathname ELSE n.landing_path END AS landing_path,
      n.channel,
      n.utm_source,
      n.utm_medium,
      n.utm_campaign,
      n.referrer_domain,
      n.country_code,
      n.device_type
    FROM numbered n
    ORDER BY n.visitor_day_hash, n.visit_seq, n.occurred_at, n.id
  ), rollup AS (
    SELECT
      n.visitor_day_hash,
      n.visit_seq,
      count(*) FILTER (WHERE n.event_name = 'pageview')::int AS pageviews,
      count(*) FILTER (WHERE n.event_name = 'artist_signup_started')::int AS signup_starts,
      count(*) FILTER (WHERE n.event_name = 'artist_signup_completed')::int AS signup_completions,
      count(*) FILTER (WHERE n.event_name = 'booking_request_completed')::int AS booking_completions,
      count(*) FILTER (WHERE n.is_conversion)::int AS conversions
    FROM numbered n
    GROUP BY 1, 2
  )
  SELECT
    f.visitor_day_hash,
    f.visit_start,
    f.hostname,
    f.landing_path,
    f.channel,
    f.utm_source,
    f.utm_medium,
    f.utm_campaign,
    f.referrer_domain,
    f.country_code,
    f.device_type,
    r.pageviews,
    r.signup_starts,
    r.signup_completions,
    r.booking_completions,
    r.conversions
  FROM firsts f
  JOIN rollup r ON r.visitor_day_hash = f.visitor_day_hash AND r.visit_seq = f.visit_seq
  ORDER BY f.visit_start, f.visitor_day_hash;
$$;

CREATE OR REPLACE FUNCTION wa_kpis(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  visitors int,
  visits int,
  pageviews int,
  signup_starts int,
  signup_completions int,
  booking_completions int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    count(DISTINCT v.visitor_day_hash)::int,
    count(*)::int,
    COALESCE(sum(v.pageviews), 0)::int,
    COALESCE(sum(v.signup_starts), 0)::int,
    COALESCE(sum(v.signup_completions), 0)::int,
    COALESCE(sum(v.booking_completions), 0)::int
  FROM wa_visits(p_from, p_to) v;
$$;

CREATE OR REPLACE FUNCTION wa_timeseries(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text,
  p_bucket text
) RETURNS TABLE (
  bucket date,
  visitors int,
  visits int,
  pageviews int,
  signup_completions int,
  booking_completions int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_bucket NOT IN ('day','week','month') THEN
    RAISE EXCEPTION 'invalid bucket %', p_bucket;
  END IF;
  RETURN QUERY
  WITH v AS (
    SELECT date_trunc(p_bucket, w.visit_start AT TIME ZONE p_tz)::date AS b,
           w.visitor_day_hash AS vh,
           w.signup_completions AS sc,
           w.booking_completions AS bc
    FROM wa_visits(p_from, p_to) w
  ), pv AS (
    SELECT date_trunc(p_bucket, e.occurred_at AT TIME ZONE p_tz)::date AS b, count(*)::int AS n
    FROM web_analytics_events e
    WHERE e.occurred_at >= p_from AND e.occurred_at < p_to AND e.event_name = 'pageview'
    GROUP BY 1
  ), va AS (
    SELECT v.b, count(DISTINCT v.vh)::int AS visitors, count(*)::int AS visits,
           sum(v.sc)::int AS signups, sum(v.bc)::int AS bookings
    FROM v GROUP BY 1
  )
  SELECT
    COALESCE(va.b, pv.b),
    COALESCE(va.visitors, 0),
    COALESCE(va.visits, 0),
    COALESCE(pv.n, 0),
    COALESCE(va.signups, 0),
    COALESCE(va.bookings, 0)
  FROM va FULL OUTER JOIN pv ON va.b = pv.b
  ORDER BY 1;
END;
$$;

-- Visit-attributed breakdown over one dimension. p_dimension is validated
-- against a fixed list (no dynamic SQL over user input).
CREATE OR REPLACE FUNCTION wa_breakdown(
  p_from timestamptz,
  p_to timestamptz,
  p_dimension text,
  p_limit int,
  p_offset int
) RETURNS TABLE (
  dimension_value text,
  visitors int,
  visits int,
  pageviews int,
  signup_starts int,
  signup_completions int,
  booking_completions int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_dimension NOT IN ('landing_path','channel','referrer_domain','country_code','device_type','hostname') THEN
    RAISE EXCEPTION 'invalid dimension %', p_dimension;
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(
      CASE p_dimension
        WHEN 'landing_path' THEN v.landing_path
        WHEN 'channel' THEN v.channel
        WHEN 'referrer_domain' THEN v.referrer_domain
        WHEN 'country_code' THEN v.country_code
        WHEN 'device_type' THEN v.device_type
        WHEN 'hostname' THEN v.hostname
      END, '(none)') AS dim,
    count(DISTINCT v.visitor_day_hash)::int,
    count(*)::int,
    COALESCE(sum(v.pageviews), 0)::int,
    COALESCE(sum(v.signup_starts), 0)::int,
    COALESCE(sum(v.signup_completions), 0)::int,
    COALESCE(sum(v.booking_completions), 0)::int
  FROM wa_visits(p_from, p_to) v
  GROUP BY 1
  ORDER BY count(*) DESC, 1
  LIMIT LEAST(GREATEST(p_limit, 1), 500) OFFSET GREATEST(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION wa_campaigns(
  p_from timestamptz,
  p_to timestamptz,
  p_limit int,
  p_offset int
) RETURNS TABLE (
  utm_source text,
  utm_medium text,
  utm_campaign text,
  visitors int,
  visits int,
  signup_starts int,
  signup_completions int,
  booking_completions int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(v.utm_source, '(none)'),
    COALESCE(v.utm_medium, '(none)'),
    COALESCE(v.utm_campaign, '(none)'),
    count(DISTINCT v.visitor_day_hash)::int,
    count(*)::int,
    COALESCE(sum(v.signup_starts), 0)::int,
    COALESCE(sum(v.signup_completions), 0)::int,
    COALESCE(sum(v.booking_completions), 0)::int
  FROM wa_visits(p_from, p_to) v
  WHERE v.utm_source IS NOT NULL OR v.utm_medium IS NOT NULL OR v.utm_campaign IS NOT NULL
  GROUP BY 1, 2, 3
  ORDER BY count(*) DESC, 1, 2, 3
  LIMIT LEAST(GREATEST(p_limit, 1), 500) OFFSET GREATEST(p_offset, 0);
$$;

-- Organic-search visits per landing page (feeds the combined organic
-- landing-pages view; joined to GSC pages in the query layer).
CREATE OR REPLACE FUNCTION wa_organic_landing(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  landing_path text,
  visitors int,
  visits int,
  signup_starts int,
  signup_completions int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(v.landing_path, '(none)'),
    count(DISTINCT v.visitor_day_hash)::int,
    count(*)::int,
    COALESCE(sum(v.signup_starts), 0)::int,
    COALESCE(sum(v.signup_completions), 0)::int
  FROM wa_visits(p_from, p_to) v
  WHERE v.channel = 'organic_search'
  GROUP BY 1
  ORDER BY count(*) DESC, 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. Google Search Console
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gsc_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_by            uuid,
  -- AES-256-GCM ciphertext (iv:tag:data, base64), key from
  -- GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET. Never leaves the server.
  encrypted_refresh_token text NOT NULL,
  token_metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at            timestamptz NOT NULL DEFAULT now(),
  disconnected_at         timestamptz,
  last_successful_sync_at timestamptz,
  last_failed_sync_at     timestamptz,
  last_error              text,
  sync_locked_at          timestamptz
);

CREATE TABLE IF NOT EXISTS gsc_properties (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id    uuid NOT NULL REFERENCES gsc_connections(id) ON DELETE CASCADE,
  site_url         text NOT NULL,
  permission_level text,
  is_active        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, site_url)
);

CREATE TABLE IF NOT EXISTS gsc_daily_totals (
  property_id      uuid NOT NULL REFERENCES gsc_properties(id) ON DELETE CASCADE,
  source_date      date NOT NULL,
  search_type      text NOT NULL DEFAULT 'web',
  clicks           int NOT NULL DEFAULT 0,
  impressions      int NOT NULL DEFAULT 0,
  ctr              double precision NOT NULL DEFAULT 0,
  average_position double precision NOT NULL DEFAULT 0,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, source_date, search_type)
);

CREATE TABLE IF NOT EXISTS gsc_daily_dimensions (
  property_id      uuid NOT NULL REFERENCES gsc_properties(id) ON DELETE CASCADE,
  source_date      date NOT NULL,
  search_type      text NOT NULL DEFAULT 'web',
  dimension_type   text NOT NULL CHECK (dimension_type IN ('query','page','country','device')),
  dimension_value  text NOT NULL,
  clicks           int NOT NULL DEFAULT 0,
  impressions      int NOT NULL DEFAULT 0,
  ctr              double precision NOT NULL DEFAULT 0,
  average_position double precision NOT NULL DEFAULT 0,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, source_date, search_type, dimension_type, dimension_value)
);

CREATE INDEX IF NOT EXISTS gsc_dim_type_date_idx
  ON gsc_daily_dimensions (property_id, dimension_type, source_date DESC);

CREATE TABLE IF NOT EXISTS gsc_backfills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES gsc_properties(id) ON DELETE CASCADE,
  from_date     date NOT NULL,
  to_date       date NOT NULL,
  -- Next date to process (walks backward from to_date to from_date).
  cursor_date   date NOT NULL,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  dates_done    int NOT NULL DEFAULT 0,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gsc_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_daily_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_backfills ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies on any of the five (service-role only).

-- Impression-weighted aggregation over a date range for one dimension type.
CREATE OR REPLACE FUNCTION gsc_dimension_agg(
  p_property_id uuid,
  p_dimension_type text,
  p_from date,
  p_to date,
  p_limit int,
  p_offset int
) RETURNS TABLE (
  dimension_value text,
  clicks bigint,
  impressions bigint,
  ctr double precision,
  average_position double precision
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    d.dimension_value,
    sum(d.clicks)::bigint,
    sum(d.impressions)::bigint,
    CASE WHEN sum(d.impressions) > 0
         THEN sum(d.clicks)::double precision / sum(d.impressions)
         ELSE 0 END,
    CASE WHEN sum(d.impressions) > 0
         THEN sum(d.average_position * d.impressions) / sum(d.impressions)
         ELSE 0 END
  FROM gsc_daily_dimensions d
  WHERE d.property_id = p_property_id
    AND d.dimension_type = p_dimension_type
    AND d.search_type = 'web'
    AND d.source_date >= p_from AND d.source_date <= p_to
  GROUP BY 1
  ORDER BY sum(d.impressions) DESC, 1
  LIMIT LEAST(GREATEST(p_limit, 1), 1000) OFFSET GREATEST(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION wa_ingest_bump(date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_visits(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_kpis(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_timeseries(timestamptz, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_breakdown(timestamptz, timestamptz, text, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_campaigns(timestamptz, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_organic_landing(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION gsc_dimension_agg(uuid, text, date, date, int, int) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION wa_ingest_bump(date, text) TO service_role;
GRANT EXECUTE ON FUNCTION wa_visits(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION wa_kpis(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION wa_timeseries(timestamptz, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION wa_breakdown(timestamptz, timestamptz, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION wa_campaigns(timestamptz, timestamptz, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION wa_organic_landing(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION gsc_dimension_agg(uuid, text, date, date, int, int) TO service_role;
