-- 0067 — growth cockpit (admin growth analytics: /admin/growth)
--
-- Adds the derived-analytics layer for the founder-facing Growth cockpit. Three kinds of objects:
--
--   1. Supplemental first-party product events + presence:
--        analytics_events       — typed, server-recorded product events that canonical tables cannot
--                                 answer (onboarding step timing, page published, booking link copied).
--                                 The event catalogue lives in code (src/lib/growth/event-catalogue.ts);
--                                 the single writer (src/lib/growth/record-event.ts) rejects names
--                                 outside the catalogue and excludes tester/admin accounts at write time.
--                                 Props are coarse labels only: NO IP, NO user agent, NO client/customer
--                                 data, NO free text (same contract as lib/track.ts).
--        artist_activity_days   — one row per (artist, day, surface): day-grain presence touched
--                                 fire-and-forget from the authed web layout and the mobile API auth.
--                                 This is what makes DAU/WAU/MAU honest going forward; no historical
--                                 login data exists (auth.audit_log_entries is empty in prod).
--   2. Cockpit configuration + history protection:
--        growth_settings        — key/value thresholds (active/dormant/churn-risk windows, attribution
--                                 window, min sample size, reporting timezone). Defaults live in code.
--        growth_daily_snapshots — per-day aggregate counts (jsonb, no PII) written by the daily
--                                 /api/cron/growth-snapshot. Protects funnel history against the 30-day
--                                 booking cleanup and the 24-month audit purge.
--   3. Derived read layer (views + RPCs) so aggregation happens in Postgres with indexes instead of
--      unbounded PostgREST row fetches (max_rows=1000 silently truncates .select() results):
--        growth_activity_events — THE single definition of "meaningful artist activity" (allowlisted
--                                 audit actions + booking decisions + artist-created bookings + mobile
--                                 last-seen + analytics events). Everything else derives from it.
--        growth_artist_stats    — one row per artist: milestones, counts, activity, attribution.
--        growth_signup_series / growth_booking_series / growth_activity_days_series /
--        growth_auth_summary / growth_lifecycle_engagement — parameterized aggregate functions.
--
-- Also adds: profiles.signup_attribution (first-touch attribution persisted at claim-slug; the
-- capture pipeline shipped 2026-07-02 but was Plausible-only), slots.created_at (added WITHOUT
-- backfill: existing rows stay NULL = honestly unknown; only new rows get now()), and two audit_log
-- indexes for actor/action scans.
--
-- SECURITY MODEL:
--   - New TABLES: RLS enabled with intentionally NO policies (service-role only), matching
--     email_jobs/email_events/email_lifecycle_* (0063-0065).
--   - New VIEWS: views have NO RLS, and Supabase default privileges grant anon/authenticated SELECT
--     on new relations in public — so anon/authenticated are explicitly REVOKED below. The views run
--     with definer (owner) rights, which is what lets growth_artist_stats read auth.users; only
--     service_role keeps SELECT.
--   - New FUNCTIONS: EXECUTE revoked from public/anon/authenticated (the 0060 lesson), granted to
--     service_role only.
--
-- Additive only. Applied via `supabase db push`, dev first then prod. Never `migration repair`.
-- Verification (AGENTS.md footgun protocol) after applying:
--   select tablename from pg_tables where schemaname='public' and tablename like 'growth%' or tablename in ('analytics_events','artist_activity_days');
--   select viewname from pg_views where schemaname='public' and viewname like 'growth%';
--   select column_name from information_schema.columns where table_name='profiles' and column_name='signup_attribution';

-- ---------------------------------------------------------------------------
-- 1. Supplemental events + presence
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Shape-checked here; the catalogue itself is enforced in code so adding an event
  -- does not require a migration (controlled naming still holds: one writer, typed union).
  event_name  text NOT NULL CHECK (event_name ~ '^[a-z][a-z0-9_]{2,63}$'),
  artist_id   uuid REFERENCES profiles(id) ON DELETE CASCADE,
  -- Pre-signup linkage (future use; never a fingerprint — a random first-party id at most).
  anonymous_id text,
  session_id   text,
  source      text NOT NULL DEFAULT 'web' CHECK (source IN ('web','mobile','system')),
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Idempotency for once-only milestones and resumable backfills:
  -- e.g. 'onboarding_step_completed:<artist>:<step>'. NULL = not deduplicated.
  dedupe_key  text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_dedupe_idx
  ON analytics_events (event_name, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_name_time_idx
  ON analytics_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_artist_time_idx
  ON analytics_events (artist_id, occurred_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: writes go through the server-side recorder, reads through the cockpit.

CREATE TABLE IF NOT EXISTS artist_activity_days (
  artist_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day           date NOT NULL,
  surface       text NOT NULL CHECK (surface IN ('web','mobile')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artist_id, day, surface)
);

CREATE INDEX IF NOT EXISTS artist_activity_days_day_idx ON artist_activity_days (day);

ALTER TABLE artist_activity_days ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies (service-role only).

-- ---------------------------------------------------------------------------
-- 2. Settings + snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS growth_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE growth_settings ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies (service-role only; edited via the admin settings page).

CREATE TABLE IF NOT EXISTS growth_daily_snapshots (
  snapshot_date date PRIMARY KEY,
  -- Aggregate counts only (signups, requests by status, approvals, deposits, active artists...).
  -- Never per-artist rows, never PII: this table intentionally survives account deletion.
  metrics    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE growth_daily_snapshots ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies (service-role only).

-- ---------------------------------------------------------------------------
-- 3. Canonical-table additions
-- ---------------------------------------------------------------------------

-- First-touch attribution, persisted at claim-slug from the existing localStorage -> hidden-field
-- pipeline (analytics-gates.ts). Keys: entry_path, referrer (origin only), source, medium, campaign,
-- content, term, platform, captured_at. Length-clamped labels, no PII by construction. NULL for every
-- account that existed before this migration ("unknown, pre-instrumentation") — not backfillable.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signup_attribution jsonb;

-- Slot creation time. Added WITHOUT a default first so the ~existing rows keep NULL (we never
-- invent history), then defaulted for all future rows.
ALTER TABLE slots ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE slots ALTER COLUMN created_at SET DEFAULT now();

-- Activity scans: audit_log had no actor index (0048 covers booking_id/action only).
CREATE INDEX IF NOT EXISTS audit_log_actor_time_idx
  ON audit_log (actor, "timestamp" DESC) WHERE actor IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_action_time_idx
  ON audit_log (action, "timestamp" DESC);

-- ---------------------------------------------------------------------------
-- 4. Derived read layer
-- ---------------------------------------------------------------------------

-- THE definition of "meaningful artist activity". One place, referenced by everything else.
-- Notes on the allowlist:
--   - 'status_changed' is the canonical booking-transition action; 'booking_status_change' is a
--     duplicate write of the same transition and is deliberately absent (would double-count).
--   - 'booking_created' is absent: public-form submissions are customer demand, not artist activity;
--     artist-created bookings are counted via origin='artist_created' below.
--   - reminder_sent / email_delivery_failed / deposit_* / admin_* are system, webhook, or admin
--     actions and are deliberately absent.
--   - support_ticket_created / support_artist_reply are artist actions despite event_category='system'.
CREATE OR REPLACE VIEW growth_activity_events AS
  SELECT
    a.actor        AS artist_id,
    a."timestamp"  AS occurred_at,
    'audit:' || a.action AS kind
  FROM audit_log a
  WHERE a.actor IS NOT NULL
    AND a.action IN (
      'status_changed',
      'books_opened',
      'books_closed',
      'booking_mode_changed',
      'email_template_edited',
      'email_template_reset',
      'onboarding_profile_claimed',
      'onboarding_booking_set',
      'onboarding_completed',
      'waitlist_convert',
      'support_ticket_created',
      'support_artist_reply',
      'token_rotated'
    )
UNION ALL
  SELECT b.artist_id, b.decided_at, 'booking_decided'
  FROM booking_requests b
  WHERE b.decided_at IS NOT NULL
UNION ALL
  SELECT b.artist_id, b.created_at, 'booking_created_by_artist'
  FROM booking_requests b
  WHERE b.origin = 'artist_created'
UNION ALL
  SELECT d.artist_id, d.last_seen_at, 'mobile_app_seen'
  FROM device_tokens d
UNION ALL
  SELECT e.artist_id, e.occurred_at, 'event:' || e.event_name
  FROM analytics_events e
  WHERE e.artist_id IS NOT NULL AND e.source IN ('web','mobile');

-- One row per artist: milestones, counts, latest activity, attribution, feature usage.
-- Definer-rights view (owner postgres) so the auth.users join works; service_role-only SELECT.
-- Columns are deliberately PII-minimal: no emails, no customer identifiers, no settings blob
-- (profiles.settings carries secrets — only analytics-safe keys are extracted).
CREATE OR REPLACE VIEW growth_artist_stats AS
SELECT
  p.id,
  p.slug,
  p.display_name,
  p.is_tester,
  p.account_status,
  (p.deleted_at IS NOT NULL)                                        AS soft_deleted,
  p.booking_mode::text                                              AS booking_mode,
  p.timezone,
  u.created_at                                                      AS account_created_at,
  p.created_at                                                      AS profile_claimed_at,
  u.last_sign_in_at,
  (u.email_confirmed_at IS NOT NULL)                                AS email_confirmed,
  (p.settings->>'onboarding_completed' = 'true')                    AS onboarding_completed,
  (p.settings->>'signup_event_fired' = 'true')                      AS ever_completed_onboarding,
  (p.settings->'books_settings' IS NOT NULL)                        AS books_configured,
  COALESCE((p.settings->'books_settings'->>'books_open')::boolean, true) AS books_open_flag,
  p.settings->'books_settings'->>'booking_window_ends_at'           AS booking_window_ends_at,
  (p.settings->'form_settings' IS NOT NULL)                         AS form_configured,
  (p.bio IS NOT NULL OR p.location IS NOT NULL)                     AS profile_info_set,
  p.stripe_account_status,
  p.signup_attribution->>'source'                                   AS attribution_source,
  p.signup_attribution->>'medium'                                   AS attribution_medium,
  p.signup_attribution->>'campaign'                                 AS attribution_campaign,
  p.signup_attribution->>'referrer'                                 AS attribution_referrer,
  p.signup_attribution->>'entry_path'                               AS attribution_entry_path,
  p.signup_attribution->>'platform'                                 AS attribution_platform,
  bk.total_requests,
  bk.pending_requests,
  bk.approved_requests,
  bk.rejected_requests,
  bk.cancelled_requests,
  bk.artist_created_requests,
  bk.first_request_at,
  bk.last_request_at,
  bk.deposits_requested,
  bk.deposits_paid,
  bk.first_deposit_paid_at,
  ap.first_approved_at,
  ap.last_decision_at,
  sl.slot_count,
  sl.first_slot_created_at,
  tr.trip_count,
  tr.published_trip_count,
  tr.first_trip_at,
  fl.flash_count,
  fl.published_flash_count,
  fl.first_flash_at,
  wl.waitlist_count,
  cf.custom_field_count,
  et.email_template_count,
  (ig.artist_id IS NOT NULL)                                        AS instagram_connected,
  dv.device_platforms,
  dv.last_mobile_seen_at,
  dv.first_device_at,
  st.support_ticket_count,
  ev.onboarding_completed_event_at,
  ev.link_copied_count,
  lc.lifecycle_sends,
  lc.last_lifecycle_send_at,
  act.last_activity_at,
  ad.last_presence_day,
  ad.presence_days_90
FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id
LEFT JOIN LATERAL (
  SELECT
    count(*)::int                                            AS total_requests,
    count(*) FILTER (WHERE b.status = 'pending')::int        AS pending_requests,
    count(*) FILTER (WHERE b.status = 'approved')::int       AS approved_requests,
    count(*) FILTER (WHERE b.status = 'rejected')::int       AS rejected_requests,
    count(*) FILTER (WHERE b.status = 'cancelled')::int      AS cancelled_requests,
    count(*) FILTER (WHERE b.origin = 'artist_created')::int AS artist_created_requests,
    min(b.created_at)                                        AS first_request_at,
    max(b.created_at)                                        AS last_request_at,
    count(*) FILTER (WHERE b.deposit_amount IS NOT NULL)::int AS deposits_requested,
    count(*) FILTER (WHERE b.deposit_paid_at IS NOT NULL)::int AS deposits_paid,
    min(b.deposit_paid_at)                                   AS first_deposit_paid_at
  FROM booking_requests b WHERE b.artist_id = p.id
) bk ON true
LEFT JOIN LATERAL (
  -- First approval from the audit trail (first occurrence wins; decided_at is overwritten by
  -- later transitions and undercounts reviewed-then-cancelled requests).
  SELECT
    min(a."timestamp") FILTER (WHERE a.details->>'to' = 'approved') AS first_approved_at,
    max(a."timestamp")                                              AS last_decision_at
  FROM audit_log a
  JOIN booking_requests b ON b.id = a.booking_id
  WHERE b.artist_id = p.id AND a.action = 'status_changed'
) ap ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS slot_count, min(s.created_at) AS first_slot_created_at
  FROM slots s WHERE s.artist_id = p.id
) sl ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)::int                                              AS trip_count,
    count(*) FILTER (WHERE t.show_on_booking_form)::int        AS published_trip_count,
    min(t.created_at)                                          AS first_trip_at
  FROM trips t WHERE t.artist_id = p.id
) tr ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)::int                                              AS flash_count,
    count(*) FILTER (WHERE f.status = 'published')::int        AS published_flash_count,
    min(f.created_at)                                          AS first_flash_at
  FROM flash_items f WHERE f.artist_id = p.id
) fl ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS waitlist_count FROM waitlist_entries w WHERE w.artist_id = p.id
) wl ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS custom_field_count FROM custom_fields c
  WHERE c.artist_id = p.id AND c.deleted_at IS NULL
) cf ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS email_template_count FROM email_templates e WHERE e.artist_id = p.id
) et ON true
LEFT JOIN instagram_accounts ig ON ig.artist_id = p.id AND ig.connected
LEFT JOIN LATERAL (
  SELECT
    array_agg(DISTINCT d.platform) AS device_platforms,
    max(d.last_seen_at)            AS last_mobile_seen_at,
    min(d.created_at)              AS first_device_at
  FROM device_tokens d WHERE d.artist_id = p.id
) dv ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS support_ticket_count FROM support_tickets s WHERE s.artist_id = p.id
) st ON true
LEFT JOIN LATERAL (
  SELECT
    min(e.occurred_at) FILTER (WHERE e.event_name = 'onboarding_completed') AS onboarding_completed_event_at,
    count(*) FILTER (WHERE e.event_name = 'booking_link_copied')::int       AS link_copied_count
  FROM analytics_events e WHERE e.artist_id = p.id
) ev ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE m.status = 'sent')::int AS lifecycle_sends,
    max(m.created_at) FILTER (WHERE m.status = 'sent') AS last_lifecycle_send_at
  FROM email_lifecycle_markers m WHERE m.artist_id = p.id
) lc ON true
LEFT JOIN LATERAL (
  SELECT max(g.occurred_at) AS last_activity_at
  FROM growth_activity_events g WHERE g.artist_id = p.id
) act ON true
LEFT JOIN LATERAL (
  SELECT
    max(d.day)                                                    AS last_presence_day,
    count(DISTINCT d.day) FILTER (WHERE d.day > current_date - 90)::int AS presence_days_90
  FROM artist_activity_days d WHERE d.artist_id = p.id
) ad ON true;

-- Signups per bucket: auth accounts (funnel head — profiles.created_at is slug-claim time, NOT
-- account creation) and claimed profiles, in the reporting timezone. p_exclude carries tester +
-- admin profile ids resolved in code (ADMIN_EMAILS is an env allowlist, unavailable in SQL).
CREATE OR REPLACE FUNCTION growth_signup_series(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text,
  p_bucket text,
  p_exclude uuid[]
) RETURNS TABLE (bucket date, auth_signups int, profiles_claimed int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF p_bucket NOT IN ('day','week','month') THEN
    RAISE EXCEPTION 'invalid bucket %', p_bucket;
  END IF;
  RETURN QUERY
  WITH a AS (
    SELECT date_trunc(p_bucket, au.created_at AT TIME ZONE p_tz)::date AS b, count(*)::int AS n
    FROM auth.users au
    WHERE au.created_at >= p_from AND au.created_at < p_to
      AND NOT (au.id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
    GROUP BY 1
  ), c AS (
    SELECT date_trunc(p_bucket, pr.created_at AT TIME ZONE p_tz)::date AS b, count(*)::int AS n
    FROM profiles pr
    WHERE pr.created_at >= p_from AND pr.created_at < p_to
      AND NOT (pr.id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
    GROUP BY 1
  )
  SELECT COALESCE(a.b, c.b), COALESCE(a.n, 0), COALESCE(c.n, 0)
  FROM a FULL OUTER JOIN c ON a.b = c.b
  ORDER BY 1;
END;
$$;

-- Booking events per bucket. Approvals/declines/deposit-requests come from the audit trail
-- (first occurrence per booking, so reopen loops don't double-count); deposit payments from the
-- true deposit_paid_at event timestamp.
CREATE OR REPLACE FUNCTION growth_booking_series(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text,
  p_bucket text,
  p_exclude uuid[]
) RETURNS TABLE (
  bucket date,
  requests int,
  approvals int,
  declines int,
  cancellations int,
  deposits_requested int,
  deposits_paid int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_bucket NOT IN ('day','week','month') THEN
    RAISE EXCEPTION 'invalid bucket %', p_bucket;
  END IF;
  RETURN QUERY
  WITH req AS (
    SELECT date_trunc(p_bucket, b.created_at AT TIME ZONE p_tz)::date AS b, count(*)::int AS n
    FROM booking_requests b
    WHERE b.created_at >= p_from AND b.created_at < p_to
      AND NOT (b.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
    GROUP BY 1
  ), trans AS (
    -- Global first occurrence per (booking, target status), THEN filtered to the window, so a
    -- reopened booking re-approved inside the window does not count as a new first approval.
    SELECT
      b.id AS booking_id,
      a.details->>'to' AS to_status,
      min(a."timestamp") AS first_at
    FROM audit_log a
    JOIN booking_requests b ON b.id = a.booking_id
    WHERE a.action = 'status_changed'
      AND NOT (b.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
    GROUP BY 1, 2
    HAVING min(a."timestamp") >= p_from AND min(a."timestamp") < p_to
  ), tr_b AS (
    SELECT
      date_trunc(p_bucket, t.first_at AT TIME ZONE p_tz)::date AS b,
      count(*) FILTER (WHERE t.to_status = 'approved')::int        AS approvals,
      count(*) FILTER (WHERE t.to_status = 'rejected')::int        AS declines,
      count(*) FILTER (WHERE t.to_status = 'cancelled')::int       AS cancellations,
      count(*) FILTER (WHERE t.to_status = 'deposit_pending')::int AS deposits_requested
    FROM trans t
    GROUP BY 1
  ), dep AS (
    SELECT date_trunc(p_bucket, b.deposit_paid_at AT TIME ZONE p_tz)::date AS b, count(*)::int AS n
    FROM booking_requests b
    WHERE b.deposit_paid_at >= p_from AND b.deposit_paid_at < p_to
      AND NOT (b.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
    GROUP BY 1
  )
  SELECT
    COALESCE(req.b, tr_b.b, dep.b),
    COALESCE(req.n, 0),
    COALESCE(tr_b.approvals, 0),
    COALESCE(tr_b.declines, 0),
    COALESCE(tr_b.cancellations, 0),
    COALESCE(tr_b.deposits_requested, 0),
    COALESCE(dep.n, 0)
  FROM req
  FULL OUTER JOIN tr_b ON req.b = tr_b.b
  FULL OUTER JOIN dep ON COALESCE(req.b, tr_b.b) = dep.b
  ORDER BY 1;
END;
$$;

-- Deposit money, ALWAYS grouped by currency (summing across currencies is meaningless).
-- Deposit-request counts live in growth_booking_series (audit-based); this is the paid side only.
CREATE OR REPLACE FUNCTION growth_deposit_totals(
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid[]
) RETURNS TABLE (currency text, paid_count int, paid_sum numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(b.deposit_currency, 'eur') AS currency,
    count(*)::int,
    COALESCE(sum(b.deposit_amount), 0)
  FROM booking_requests b
  WHERE b.deposit_paid_at >= p_from AND b.deposit_paid_at < p_to
    AND NOT (b.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
  GROUP BY 1;
$$;

-- Per-artist activity days (for DAU/WAU/MAU, retention grids, engagement): unions the meaningful
-- activity events (bucketed to days in the reporting timezone) with the day-grain presence table.
CREATE OR REPLACE FUNCTION growth_activity_days_series(
  p_from date,
  p_to date,
  p_tz text,
  p_exclude uuid[]
) RETURNS TABLE (artist_id uuid, day date, actions int, presence boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT g.artist_id AS aid, (g.occurred_at AT TIME ZONE p_tz)::date AS d, count(*)::int AS n
    FROM growth_activity_events g
    WHERE (g.occurred_at AT TIME ZONE p_tz)::date BETWEEN p_from AND p_to
      AND NOT (g.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
    GROUP BY 1, 2
  ), pres AS (
    SELECT a.artist_id AS aid, a.day AS d
    FROM artist_activity_days a
    WHERE a.day BETWEEN p_from AND p_to
      AND NOT (a.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
    GROUP BY 1, 2
  )
  SELECT
    COALESCE(ev.aid, pres.aid),
    COALESCE(ev.d, pres.d),
    COALESCE(ev.n, 0),
    (pres.aid IS NOT NULL)
  FROM ev FULL OUTER JOIN pres ON ev.aid = pres.aid AND ev.d = pres.d;
$$;

-- Funnel head summary: the pre-claim drop that no profiles-based query can see.
CREATE OR REPLACE FUNCTION growth_auth_summary(p_exclude uuid[])
RETURNS TABLE (
  total_users int,
  confirmed_users int,
  users_without_profile int,
  first_user_at timestamptz,
  last_user_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE u.email_confirmed_at IS NOT NULL)::int,
    count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id))::int,
    min(u.created_at),
    max(u.created_at)
  FROM auth.users u
  WHERE NOT (u.id = ANY(COALESCE(p_exclude, '{}'::uuid[])));
$$;

-- Per-booking decision latency: created -> FIRST decision from the audit trail (decided_at is
-- overwritten by later transitions). Used for median response time; the median is computed in code.
CREATE OR REPLACE FUNCTION growth_decision_latency(
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid[]
) RETURNS TABLE (booking_id uuid, created_at timestamptz, first_decision_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.created_at, min(a."timestamp")
  FROM booking_requests b
  JOIN audit_log a ON a.booking_id = b.id AND a.action = 'status_changed'
  WHERE b.created_at >= p_from AND b.created_at < p_to
    AND NOT (b.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
  GROUP BY b.id, b.created_at;
$$;

-- Counts of specific audit actions in a window, with tester/admin exclusion applied through the
-- booking's artist when the row is booking-linked, else through the actor.
CREATE OR REPLACE FUNCTION growth_audit_action_counts(
  p_actions text[],
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid[]
) RETURNS TABLE (action text, occurrences int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.action, count(*)::int
  FROM audit_log a
  LEFT JOIN booking_requests b ON b.id = a.booking_id
  WHERE a.action = ANY(p_actions)
    AND a."timestamp" >= p_from AND a."timestamp" < p_to
    -- Excluded when the booking's artist (or, unlinked, the actor) is a tester/admin id;
    -- rows with neither subject (pure system rows) stay counted.
    AND (
      COALESCE(b.artist_id, a.actor) IS NULL
      OR NOT (COALESCE(b.artist_id, a.actor) = ANY(COALESCE(p_exclude, '{}'::uuid[])))
    )
  GROUP BY 1;
$$;

-- What kinds of meaningful activity happened in a window (feeds "most common meaningful actions").
CREATE OR REPLACE FUNCTION growth_activity_kind_counts(
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid[]
) RETURNS TABLE (kind text, occurrences int, artists int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.kind, count(*)::int, count(DISTINCT g.artist_id)::int
  FROM growth_activity_events g
  WHERE g.occurred_at >= p_from AND g.occurred_at < p_to
    AND NOT (g.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])))
  GROUP BY 1;
$$;

-- Lifecycle email engagement per definition: distinct-message-id counts (unique opens/clicks;
-- raw open counts are inflated by Apple Mail prefetch). Recipient emails never leave the join.
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
  SELECT
    m.definition_key,
    count(*) FILTER (WHERE m.status = 'sent')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'delivered')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'opened')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'clicked')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'bounced')::int
  FROM email_lifecycle_markers m
  LEFT JOIN email_events e ON e.resend_message_id = m.resend_message_id
  GROUP BY 1;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants (see SECURITY MODEL above)
-- ---------------------------------------------------------------------------

REVOKE ALL ON growth_activity_events FROM anon, authenticated;
REVOKE ALL ON growth_artist_stats FROM anon, authenticated;
GRANT SELECT ON growth_activity_events TO service_role;
GRANT SELECT ON growth_artist_stats TO service_role;

REVOKE EXECUTE ON FUNCTION growth_signup_series(timestamptz, timestamptz, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_booking_series(timestamptz, timestamptz, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_deposit_totals(timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_activity_days_series(date, date, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_auth_summary(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_lifecycle_engagement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_decision_latency(timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_audit_action_counts(text[], timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_activity_kind_counts(timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION growth_signup_series(timestamptz, timestamptz, text, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION growth_booking_series(timestamptz, timestamptz, text, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION growth_deposit_totals(timestamptz, timestamptz, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION growth_activity_days_series(date, date, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION growth_auth_summary(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION growth_lifecycle_engagement() TO service_role;
GRANT EXECUTE ON FUNCTION growth_decision_latency(timestamptz, timestamptz, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION growth_audit_action_counts(text[], timestamptz, timestamptz, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION growth_activity_kind_counts(timestamptz, timestamptz, uuid[]) TO service_role;
