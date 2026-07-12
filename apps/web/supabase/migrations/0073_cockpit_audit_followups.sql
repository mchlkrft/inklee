-- 0073 — cockpit audit follow-ups FU-29 / FU-30 / FU-32 (roadmap §7.2, deferred 2026-07-12)
--
--   1. FU-29: growth_lifecycle_engagement gains the same p_exclude account filter as every
--      other growth aggregate. email_lifecycle_markers.artist_id identifies the recipient, so
--      the "keyed by resend_message_id, cannot exclude" exception documented in
--      docs/metric-definitions.md goes away. Markers without an artist_id (never written by the
--      engine, but the column is nullable) stay counted, matching the old behaviour.
--   2. FU-30: the wa_breakdown / wa_campaigns hard cap rises from 500 to 10000 rows so the
--      acquisition CSV export can page through the full result set (the export route pages via
--      PostgREST Range headers in 1000-row steps; the SQL cap is the safety ceiling, aligned
--      with the users/organic exports' 10k bound). On-screen tables keep passing small limits.
--   3. FU-32: wa_visits sessionization is served from a daily rollup. The pure window-function
--      sessionization moves to wa_sessionize() (body unchanged from 0070's wa_visits);
--      wa_rollup_visits() materializes completed UTC days into wa_visits_daily (idempotent,
--      called by the daily growth-snapshot cron); wa_visits() now unions rolled days with live
--      sessionization of the un-rolled head/tail. Because the visitor hash rotates at midnight
--      UTC, a visit can never span two UTC days, so per-UTC-day sessionization is EXACTLY
--      equivalent to sessionizing the whole window: results are identical, only cheaper. If the
--      rollup has never run, everything computes live exactly as before (the cron is an
--      optimization, not a correctness dependency).
--
-- SECURITY MODEL (same as 0067-0070): tables RLS-enabled with NO policies (service-role only);
-- functions SECURITY DEFINER with pinned search_path, EXECUTE revoked from
-- public/anon/authenticated and granted to service_role.
--
-- RETENTION: wa_visits_daily carries the same anonymous visit rows wa_visits() always returned
-- and follows the same 24-month purge as web_analytics_events (retention-purge cron).
--
-- Applied via `supabase db push`. Never `migration repair`.

-- ---------------------------------------------------------------------------
-- 1. FU-29 — lifecycle engagement joins the account exclusion list
-- ---------------------------------------------------------------------------

-- Signature changes (new p_exclude parameter), so the zero-arg version must go:
-- CREATE OR REPLACE would otherwise leave both overloads behind.
DROP FUNCTION IF EXISTS growth_lifecycle_engagement();

CREATE OR REPLACE FUNCTION growth_lifecycle_engagement(p_exclude uuid[])
RETURNS TABLE (
  definition_key text,
  sent int,
  delivered int,
  opened int,
  clicked int,
  bounced int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.definition_key,
    count(DISTINCT m.id) FILTER (WHERE m.status = 'sent')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'delivered')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'opened')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'clicked')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'bounced')::int
  FROM email_lifecycle_markers m
  LEFT JOIN email_events e ON e.resend_message_id = m.resend_message_id
  WHERE m.artist_id IS NULL
     OR NOT (m.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
  GROUP BY 1;
$$;

-- Deploy-window compatibility shim: code deployed before this migration calls
-- the zero-arg form. NULL = exclude nothing, i.e. exactly the pre-0073
-- behaviour. PostgREST disambiguates overloads by the supplied argument keys.
-- Safe to drop in any later migration once no pre-0073 code can be live.
CREATE OR REPLACE FUNCTION growth_lifecycle_engagement()
RETURNS TABLE (
  definition_key text,
  sent int,
  delivered int,
  opened int,
  clicked int,
  bounced int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM growth_lifecycle_engagement(NULL::uuid[]);
$$;

-- ---------------------------------------------------------------------------
-- 2. FU-30 — raise the breakdown/campaign cap from 500 to 10000 (export ceiling)
-- ---------------------------------------------------------------------------

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
  LIMIT LEAST(GREATEST(p_limit, 1), 10000) OFFSET GREATEST(p_offset, 0);
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
  LIMIT LEAST(GREATEST(p_limit, 1), 10000) OFFSET GREATEST(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- 3. FU-32 — daily rollup for wa_visits sessionization
-- ---------------------------------------------------------------------------

-- Materialized visits for completed UTC days. Row shape = wa_visits() output
-- plus the UTC day for pruning. The CHECK pins the day to the visit_start so a
-- rollup bug cannot silently misfile rows.
CREATE TABLE IF NOT EXISTS wa_visits_daily (
  day                 date NOT NULL,
  visitor_day_hash    text NOT NULL,
  visit_start         timestamptz NOT NULL,
  hostname            text,
  landing_path        text,
  channel             text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  referrer_domain     text,
  country_code        text,
  device_type         text,
  pageviews           int NOT NULL DEFAULT 0,
  signup_starts       int NOT NULL DEFAULT 0,
  signup_completions  int NOT NULL DEFAULT 0,
  booking_completions int NOT NULL DEFAULT 0,
  conversions         int NOT NULL DEFAULT 0,
  PRIMARY KEY (visitor_day_hash, visit_start),
  CHECK (day = (visit_start AT TIME ZONE 'UTC')::date)
);

CREATE INDEX IF NOT EXISTS wa_visits_daily_day_idx ON wa_visits_daily (day);

-- Which UTC days have been rolled up (a zero-traffic day is rolled with zero
-- rows, so presence here, not row counts, is the coverage signal).
CREATE TABLE IF NOT EXISTS wa_visit_rollup_days (
  day       date PRIMARY KEY,
  rolled_at timestamptz NOT NULL DEFAULT now(),
  visits    int NOT NULL DEFAULT 0
);

ALTER TABLE wa_visits_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_visit_rollup_days ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies on either (service-role only).

-- The pure sessionization primitive: body identical to 0070's wa_visits().
-- wa_visits() below and wa_rollup_visits() both build on this one definition.
CREATE OR REPLACE FUNCTION wa_sessionize(p_from timestamptz, p_to timestamptz)
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

-- Idempotent daily rollup: materializes every not-yet-rolled UTC day from the
-- first event day through p_through (default: yesterday UTC; today is never
-- rolled because its hash-day is still receiving events). Re-rolling a day is
-- safe: delete then insert. Returns the number of days rolled.
CREATE OR REPLACE FUNCTION wa_rollup_visits(p_through date DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today   date := (now() AT TIME ZONE 'UTC')::date;
  v_through date := COALESCE(p_through, (now() AT TIME ZONE 'UTC')::date - 1);
  v_start   date;
  v_day     date;
  v_count   int := 0;
BEGIN
  IF v_through >= v_today THEN
    v_through := v_today - 1;
  END IF;
  SELECT min((occurred_at AT TIME ZONE 'UTC')::date) INTO v_start
  FROM web_analytics_events;
  IF v_start IS NULL OR v_start > v_through THEN
    RETURN 0;
  END IF;
  FOR v_day IN
    SELECT gs::date
    FROM generate_series(v_start::timestamp, v_through::timestamp, interval '1 day') gs
    WHERE NOT EXISTS (
      SELECT 1 FROM wa_visit_rollup_days rd WHERE rd.day = gs::date
    )
    ORDER BY 1
  LOOP
    DELETE FROM wa_visits_daily WHERE day = v_day;
    INSERT INTO wa_visits_daily (
      day, visitor_day_hash, visit_start, hostname, landing_path, channel,
      utm_source, utm_medium, utm_campaign, referrer_domain, country_code,
      device_type, pageviews, signup_starts, signup_completions,
      booking_completions, conversions
    )
    SELECT v_day, s.*
    FROM wa_sessionize(
      v_day::timestamp AT TIME ZONE 'UTC',
      (v_day + 1)::timestamp AT TIME ZONE 'UTC'
    ) s;
    INSERT INTO wa_visit_rollup_days (day, visits)
    VALUES (v_day, (SELECT count(*) FROM wa_visits_daily d WHERE d.day = v_day))
    ON CONFLICT (day) DO UPDATE
      SET rolled_at = now(), visits = EXCLUDED.visits;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- wa_visits keeps its exact signature and output (every wa_* aggregate and the
-- TS query layer call it unchanged) but now reads rolled days from the table
-- and computes only the un-rolled head/tail live. Coverage is the CONTIGUOUS
-- rolled prefix of the window's full UTC days; any gap or lag simply falls
-- back to live sessionization for that stretch, never to wrong numbers.
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- First UTC day fully inside [p_from, p_to).
  v_first_day date := CASE
    WHEN p_from = ((p_from AT TIME ZONE 'UTC')::date)::timestamp AT TIME ZONE 'UTC'
      THEN (p_from AT TIME ZONE 'UTC')::date
    ELSE (p_from AT TIME ZONE 'UTC')::date + 1
  END;
  -- Exclusive bound: day D is fully inside iff D >= v_first_day AND D < v_last_day.
  v_last_day date := (p_to AT TIME ZONE 'UTC')::date;
  -- End (exclusive) of the contiguous rolled prefix within the full days.
  v_rolled_until date;
  v_head_to timestamptz;
  v_tail_from timestamptz;
BEGIN
  IF v_first_day >= v_last_day THEN
    v_rolled_until := v_first_day;
  ELSE
    SELECT COALESCE(min(gs)::date, v_last_day) INTO v_rolled_until
    FROM generate_series(v_first_day::timestamp, (v_last_day - 1)::timestamp, interval '1 day') gs
    WHERE NOT EXISTS (
      SELECT 1 FROM wa_visit_rollup_days rd WHERE rd.day = gs::date
    );
  END IF;

  -- Live head: [p_from, start of the first full day); empty when aligned.
  v_head_to := LEAST(v_first_day::timestamp AT TIME ZONE 'UTC', p_to);
  -- Live tail: [end of the rolled prefix, p_to); the whole window when
  -- nothing is rolled.
  v_tail_from := GREATEST(v_rolled_until::timestamp AT TIME ZONE 'UTC', p_from);

  RETURN QUERY
  (
    SELECT
      d.visitor_day_hash, d.visit_start, d.hostname, d.landing_path, d.channel,
      d.utm_source, d.utm_medium, d.utm_campaign, d.referrer_domain,
      d.country_code, d.device_type, d.pageviews, d.signup_starts,
      d.signup_completions, d.booking_completions, d.conversions
    FROM wa_visits_daily d
    WHERE d.day >= v_first_day AND d.day < v_rolled_until
    UNION ALL
    SELECT s.* FROM wa_sessionize(p_from, v_head_to) s
    UNION ALL
    SELECT s.* FROM wa_sessionize(v_tail_from, p_to) s
  )
  ORDER BY 2, 1;
END;
$$;

-- Backfill: roll every completed UTC day so the first post-deploy page load
-- already reads from the rollup (collection started 2026-07, so this is small).
SELECT wa_rollup_visits();

-- ---------------------------------------------------------------------------
-- 4. Grants (re-asserted for every function this migration touched)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION growth_lifecycle_engagement(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_lifecycle_engagement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_breakdown(timestamptz, timestamptz, text, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_campaigns(timestamptz, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_sessionize(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_rollup_visits(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wa_visits(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION growth_lifecycle_engagement(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION growth_lifecycle_engagement() TO service_role;
GRANT EXECUTE ON FUNCTION wa_breakdown(timestamptz, timestamptz, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION wa_campaigns(timestamptz, timestamptz, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION wa_sessionize(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION wa_rollup_visits(date) TO service_role;
GRANT EXECUTE ON FUNCTION wa_visits(timestamptz, timestamptz) TO service_role;
