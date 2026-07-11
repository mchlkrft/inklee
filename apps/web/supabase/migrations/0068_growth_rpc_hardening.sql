-- 0068 — growth RPC hardening (review follow-up to 0067)
--
-- Three fixes from the pre-ship adversarial review of the Growth cockpit:
--   1. growth_activity_days_series and growth_decision_latency are set-returning
--      functions read through PostgREST, which silently caps responses at
--      max_rows (1000). The data layer now pages them with Range headers, which
--      requires a DETERMINISTIC order — both functions gain a stable ORDER BY.
--      (Same body otherwise; CREATE OR REPLACE.)
--   2. growth_booking_method_counts: the booking-method breakdown previously ran
--      five PostgREST count queries each embedding the excluded-id list in the
--      query string URL (breaks with a few hundred excluded ids). One aggregate
--      function replaces them.
--
-- SECURITY: same model as 0067 — SECURITY DEFINER, search_path pinned, EXECUTE
-- revoked from public/anon/authenticated, granted to service_role only.
--
-- Additive only. Applied via `supabase db push`, dev first then prod. Never `migration repair`.
-- Verification after applying:
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname = 'growth_booking_method_counts';

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
  FROM ev FULL OUTER JOIN pres ON ev.aid = pres.aid AND ev.d = pres.d
  -- Deterministic order so PostgREST Range paging yields disjoint pages.
  ORDER BY 1, 2;
$$;

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
  GROUP BY b.id, b.created_at
  -- Deterministic order so PostgREST Range paging yields disjoint pages.
  ORDER BY b.id;
$$;

-- Booking-method mix in one aggregate pass (categories overlap by design:
-- flash/guest-spot/artist-created cut across the slot vs preferred-date split).
CREATE OR REPLACE FUNCTION growth_booking_method_counts(
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid[]
) RETURNS TABLE (
  total int,
  slot_based int,
  flash_originated int,
  guest_spot int,
  artist_created int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE b.slot_id IS NOT NULL)::int,
    count(*) FILTER (WHERE b.flash_item_id IS NOT NULL)::int,
    count(*) FILTER (WHERE b.trip_id IS NOT NULL)::int,
    count(*) FILTER (WHERE b.origin = 'artist_created')::int
  FROM booking_requests b
  WHERE b.created_at >= p_from AND b.created_at < p_to
    AND NOT (b.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])));
$$;

REVOKE EXECUTE ON FUNCTION growth_booking_method_counts(timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION growth_booking_method_counts(timestamptz, timestamptz, uuid[]) TO service_role;
