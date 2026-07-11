-- 0069 — growth metric fixes (round-2 adversarial review of the Growth cockpit)
--
-- Four definition bugs found before first founder use:
--   1. APPROVALS missed every booking approved by PAYING a Stripe deposit: the webhook
--      (api/stripe/webhook) flips the booking to approved but writes only a 'deposit_paid'
--      audit row, never a status_changed to='approved'. growth_booking_series and
--      growth_artist_stats.first_approved_at now treat deposit_paid as the approval moment
--      (the GROUP BY on (booking, target status) still dedupes bookings that also have a
--      manual status_changed approval row).
--   2. CANCELLATIONS counted artist cancellations only: client cancellations write
--      'customer_cancelled' (no status_changed row). The series now admits both.
--   3. growth_lifecycle_engagement 'sent' fanned out across joined email_events rows
--      (count(*) after a LEFT JOIN); now count(DISTINCT m.id).
--   4. WAITLIST CONVERSIONS were read from a 'waitlist_convert' audit action that no code
--      path has ever written. The durable marker is booking_requests.form_data->>'source'
--      = 'waitlist' (set by the conversion core), now surfaced via
--      growth_booking_method_counts (recreated with the extra column; RETURNS TABLE
--      changes require DROP + CREATE).
--
-- Read-side fixes self-heal all history still inside audit/table retention; the snapshot
-- cron can then re-backfill affected days via ?date=.
--
-- SECURITY: same model as 0067/0068 (SECURITY DEFINER, pinned search_path, EXECUTE revoked
-- from public/anon/authenticated, granted to service_role; view grants re-asserted).
--
-- Additive/replacement only. Applied via `supabase db push`. Never `migration repair`.

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
    -- Global first occurrence per (booking, target status), THEN filtered to the window.
    -- Approval moments: status_changed to='approved' OR the Stripe webhook's deposit_paid.
    -- Cancellation moments: status_changed to='cancelled' (artist) OR customer_cancelled.
    SELECT
      b.id AS booking_id,
      CASE
        WHEN a.action = 'deposit_paid' THEN 'approved'
        WHEN a.action = 'customer_cancelled' THEN 'cancelled'
        ELSE a.details->>'to'
      END AS to_status,
      min(a."timestamp") AS first_at
    FROM audit_log a
    JOIN booking_requests b ON b.id = a.booking_id
    WHERE a.action IN ('status_changed', 'deposit_paid', 'customer_cancelled')
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

-- Same column set as 0067 (CREATE OR REPLACE is valid); only the ap lateral changes:
-- first_approved_at now also accepts the webhook's deposit_paid row as the approval moment,
-- while last_decision_at keeps meaning "latest artist decision" (status_changed only).
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
  -- First approval = earliest of (status_changed to='approved', deposit_paid): the Stripe
  -- webhook approves by payment and writes only deposit_paid. last_decision_at stays
  -- status_changed-only ("latest artist decision").
  SELECT
    min(a."timestamp") FILTER (
      WHERE a.action = 'deposit_paid' OR a.details->>'to' = 'approved'
    ) AS first_approved_at,
    max(a."timestamp") FILTER (WHERE a.action = 'status_changed') AS last_decision_at
  FROM audit_log a
  JOIN booking_requests b ON b.id = a.booking_id
  WHERE b.artist_id = p.id AND a.action IN ('status_changed', 'deposit_paid')
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

-- 'sent' must not fan out across joined event rows.
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
    count(DISTINCT m.id) FILTER (WHERE m.status = 'sent')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'delivered')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'opened')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'clicked')::int,
    count(DISTINCT e.resend_message_id) FILTER (WHERE e.event_type = 'bounced')::int
  FROM email_lifecycle_markers m
  LEFT JOIN email_events e ON e.resend_message_id = m.resend_message_id
  GROUP BY 1;
$$;

-- Adds waitlist_converted (the durable conversion marker is form_data->>'source' =
-- 'waitlist' on the created booking; the 'waitlist_convert' audit action is never
-- written by any code path). RETURNS TABLE changes require DROP + CREATE.
DROP FUNCTION IF EXISTS growth_booking_method_counts(timestamptz, timestamptz, uuid[]);
CREATE FUNCTION growth_booking_method_counts(
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid[]
) RETURNS TABLE (
  total int,
  slot_based int,
  flash_originated int,
  guest_spot int,
  artist_created int,
  waitlist_converted int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE b.slot_id IS NOT NULL)::int,
    count(*) FILTER (WHERE b.flash_item_id IS NOT NULL)::int,
    count(*) FILTER (WHERE b.trip_id IS NOT NULL)::int,
    count(*) FILTER (WHERE b.origin = 'artist_created')::int,
    count(*) FILTER (WHERE b.form_data->>'source' = 'waitlist')::int
  FROM booking_requests b
  WHERE b.created_at >= p_from AND b.created_at < p_to
    AND NOT (b.artist_id = ANY(COALESCE(p_exclude, '{}'::uuid[])));
$$;

-- Re-assert grants for every replaced/recreated object.
REVOKE ALL ON growth_artist_stats FROM anon, authenticated;
GRANT SELECT ON growth_artist_stats TO service_role;
REVOKE EXECUTE ON FUNCTION growth_booking_series(timestamptz, timestamptz, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION growth_booking_series(timestamptz, timestamptz, text, text, uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION growth_lifecycle_engagement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION growth_lifecycle_engagement() TO service_role;
REVOKE EXECUTE ON FUNCTION growth_booking_method_counts(timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION growth_booking_method_counts(timestamptz, timestamptz, uuid[]) TO service_role;
