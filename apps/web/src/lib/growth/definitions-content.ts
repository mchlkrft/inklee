/**
 * Metric dictionary for the Growth cockpit. Pure content module, importable
 * from client and server; no data access. Rendered on
 * /admin/growth/definitions and mirrored in docs/metric-definitions.md.
 * Threshold names (active_days etc.) refer to growth settings
 * (src/lib/growth/settings.ts); defaults are stated inline.
 */

export type MetricDefinition = {
  /** Metric name as used across the cockpit. */
  name: string;
  /** One plain-language sentence a non-analyst can read. */
  plainLanguage: string;
  /** Exact rule the number is computed by. */
  calculation: string;
  /** Tables, views, or SQL functions the number comes from. */
  sources: string;
  /** What is counted. */
  inclusions: string;
  /** What is deliberately left out. */
  exclusions: string;
  /** How time bucketing applies, if at all. */
  timezone: string;
  /** When the number updates. */
  refresh: string;
  /** Honest caveats about the number. */
  limitations: string;
  /** Date the definition last changed (YYYY-MM-DD). */
  lastChanged: string;
};

const LAST_CHANGED = "2026-07-11";

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    name: "Counted artist",
    plainLanguage:
      "The base population behind every metric in the cockpit: real artist accounts that are live on the platform.",
    calculation:
      "profiles rows with is_tester = false, account_status = active, not soft deleted, and not owned by an ADMIN_EMAILS account.",
    sources: "profiles, auth.users.",
    inclusions: "Every live artist profile that passes all four conditions.",
    exclusions:
      "Testers, admin-owned accounts, suspended or archived accounts, and soft-deleted accounts. The full excluded-id list is passed into every SQL aggregate, so these accounts are absent from series and totals, not just from the artist list.",
    timezone: "Not time-bucketed.",
    refresh: "Live on page load.",
    limitations:
      "Admin ownership is matched against the ADMIN_EMAILS environment config at query time; it is not stored in the database.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Account created",
    plainLanguage:
      "The moment a person signed up for an account, whether or not they ever claimed a booking page.",
    calculation: "auth.users.created_at.",
    sources: "auth.users.",
    inclusions:
      "All auth accounts, including those that never claimed a booking page slug.",
    exclusions: "Testers and admin-owned accounts.",
    timezone: "Buckets in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "Not profiles.created_at, which is the moment the booking page slug was claimed. The pre-claim drop (accounts that never claim) is only visible from auth data.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Booking page published",
    plainLanguage:
      "The artist's public booking page is live and reachable by clients.",
    calculation: "Slug set AND account_status = active AND not deleted.",
    sources: "profiles.",
    inclusions: "Every counted artist whose page is currently reachable.",
    exclusions: "Suspended and deleted accounts, even if they once had a slug.",
    timezone: "Publish timestamps bucket in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "The page is live the instant the slug is claimed, so publish time equals claim time; there is no separate publish step.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Onboarding completed",
    plainLanguage: "The artist finished the onboarding wizard.",
    calculation:
      'settings.onboarding_completed = true. "Ever completed" uses the permanent signup_event_fired flag instead.',
    sources: "settings, analytics_events.",
    inclusions: "Counted artists whose completion flag is currently set.",
    exclusions:
      'Artists whose flag was cleared by an admin reset (they still count under "ever completed").',
    timezone: "Completion timestamps bucket in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "The flag is mutable: an admin reset can clear it. Completion timestamps exist only from 2026-07 onward (analytics_events).",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Activated artist",
    plainLanguage:
      "An artist who is fully set up and shows at least one real booking signal.",
    calculation:
      "Onboarding completed AND page published AND at least one booking signal: received a request, approved a request, created a bookable slot, books open enabled, published a guest spot trip, or published a flash design. The activation moment is the later of the onboarding completion event and the earliest timestamped booking signal (first request, first approval, first slot, first trip, or first flash). Median days to activation measures account creation to that moment and is null when either half is untimestamped (for example a books-open-only activation).",
    sources: "growth_artist_stats view (migration 0067).",
    inclusions: "Counted artists meeting all three conditions.",
    exclusions: "Artists with a live page but no booking signal yet.",
    timezone:
      "Not time-bucketed; activation timestamps bucket in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "Changed 2026-07-11. The previous definition (activated = onboarding completed) read 100% and is retired; the median previously measured account creation to completion only.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Meaningful activity",
    plainLanguage:
      "Any signal that an artist actually did something in the product; the basis for engagement and retention.",
    calculation:
      "Union of allowlisted artist audit actions (booking decisions, books toggles, template edits, onboarding steps, waitlist conversions, support messages, token rotations), booking decisions, artist-created bookings, mobile app opens (device last_seen), day-grain presence (from 2026-07), and catalogued analytics events.",
    sources:
      "growth_activity_events view (migration 0067), the SQL source of truth.",
    inclusions: "Artist-initiated actions and presence signals only.",
    exclusions:
      "System noise (reminder sends, delivery failures) and admin actions.",
    timezone: "Activity days are cut in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "Day-grain presence exists only from 2026-07 onward. Earlier periods contain recorded actions only, which undercounts artists who logged in without acting.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Active / Churn risk / Dormant / Churned",
    plainLanguage:
      "Lifecycle states derived from how recently an artist showed meaningful activity.",
    calculation:
      "Active = meaningful activity within active_days (default 14). Churn risk = activated and silent longer than churn_risk_days (default 21). Dormant = silent at least dormant_days (default 30). Churned = silent at least churned_days (default 90).",
    sources: "growth_artist_stats, growth_activity_events, growth settings.",
    inclusions:
      "Activated artists move through churn risk, dormant, and churned as silence grows.",
    exclusions: 'Never-activated artists are "pre-activation", not churned.',
    timezone: "Silence is measured in days in the reporting timezone.",
    refresh: "Live on page load; thresholds configurable in growth settings.",
    limitations:
      "States are computed at read time from the configured thresholds, so changing a threshold reclassifies artists immediately.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Reactivated",
    plainLanguage: "An artist who went quiet and then came back.",
    calculation:
      "A meaningful-activity day after a gap of at least reactivation_gap_days (default 30), within the trailing 180 days.",
    sources: "growth_activity_days_series (growth_activity_events view).",
    inclusions:
      "Counted artists with at least one qualifying gap-then-return inside the lookback.",
    exclusions: "Returns after gaps shorter than the configured minimum.",
    timezone:
      "Gaps are measured in activity days cut in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "The lookback is capped at the trailing 180 days; earlier reactivations are not counted.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Approval / first approval",
    plainLanguage:
      "When a booking request was first approved, by artist decision or by the client paying the deposit.",
    calculation:
      "The approval moment is the first of either a status_changed transition to approved or the Stripe webhook's deposit_paid audit row, per request (paying the deposit approves the booking; the webhook never writes a status_changed row). last_decision_at still means the latest artist decision (status_changed only). decided_at is only a fallback (it is overwritten by later transitions).",
    sources:
      "Booking audit trail, booking_requests, via growth_booking_series and growth_artist_stats (migration 0069).",
    inclusions:
      "The first approval moment per request, whether it arrived as an artist decision or a deposit payment.",
    exclusions:
      "booking_status_change audit rows are a duplicate write and are ignored.",
    timezone: "Approval timestamps bucket in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "The decided_at fallback reflects the most recent transition, so it can sit later than the true first approval.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Approval rate",
    plainLanguage: "The share of incoming requests that artists approve.",
    calculation: "Approvals in period / requests submitted in period.",
    sources:
      "growth_booking_series SQL function (definition updated in migration 0069).",
    inclusions:
      "Approvals are counted by their first-occurrence timestamp, so reopen loops do not double count, and include bookings approved by a deposit payment. The cancellations series counts both artist cancellations (status_changed to cancelled) and client cancellations (customer_cancelled audit rows); the client and artist split on the bookings page derives from customer_cancelled counts.",
    exclusions: "Testers and admin-owned accounts.",
    timezone: "Period boundaries in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "Approvals in a period can belong to requests submitted in an earlier period, so the rate can read above 100% on small windows.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Deposit conversion",
    plainLanguage:
      "The share of requested deposits that clients actually paid.",
    calculation: "Deposits paid / deposits requested, within the period.",
    sources: "growth_booking_series and growth_deposit_totals SQL functions.",
    inclusions:
      "All deposit requests and payments by counted artists in the period.",
    exclusions: "Testers and admin-owned accounts.",
    timezone: "Period boundaries in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "Money is always grouped by currency; there is no cross-currency total.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Email-associated conversion",
    plainLanguage:
      "A target outcome observed within a window after a lifecycle email went out.",
    calculation:
      "The definition's target outcome observed within email_attribution_window_days (default 7) after the send.",
    sources: "email_lifecycle_markers, growth_artist_stats.",
    inclusions: "Outcomes observed inside the attribution window.",
    exclusions: "Outcomes outside the window, even when they follow a send.",
    timezone: "The window is measured from the send timestamp.",
    refresh: "Live on page load.",
    limitations:
      "An association, never proof of causation; there is no control group.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "First-request rate",
    plainLanguage: "How many artists have ever received a booking request.",
    calculation:
      "Share of counted artists (or a cohort) with at least one booking request. With a period selected, cohort membership follows the account creation date (falling back to the claim date when no auth row exists), matching the funnel's auth head, so stages can never exceed 100% of the head.",
    sources: "growth_artist_stats view.",
    inclusions: "Any request, regardless of its outcome.",
    exclusions: "Testers and admin-owned accounts.",
    timezone: "Cohort boundaries in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "Requests removed by the 30-day privacy cleanup (rejected or cancelled, no money attached) no longer count, so the rate can undercount artists whose only requests were removed.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Retention cohort cell",
    plainLanguage:
      "For artists who claimed their page in the same period, the share showing meaningful activity at each checkpoint.",
    calculation:
      "Share of a claim-date cohort with meaningful activity in the 7 days starting at each checkpoint day (1, 7, 14, 30, 60, 90). The percentage's denominator is the cohort's measurable members, shown in each cell's tooltip.",
    sources: "growth_artist_stats, growth_activity_days_series.",
    inclusions: "Counted artists in the claim-date cohort.",
    exclusions:
      "A cell is measurable only when its full 7-day window has elapsed and lies inside the 180-day activity lookback; unmeasurable cells are blank, never zero.",
    timezone:
      "Cohorts and checkpoint windows are cut in the reporting timezone.",
    refresh: "Live on page load.",
    limitations:
      "Activity is fetched for the trailing 180 days only, so checkpoint windows before that render blank. Cohorts before 2026-07 rest on recorded actions only (no presence history), so early cells read lower than reality.",
    lastChanged: LAST_CHANGED,
  },
  {
    name: "Reporting timezone",
    plainLanguage:
      "The timezone every chart and bucket in the cockpit is cut in.",
    calculation:
      "All day, week, and month buckets use the configured reporting timezone (default Europe/Berlin), applied inside the SQL functions.",
    sources: "Growth settings.",
    inclusions: "Every time series and cohort boundary in the cockpit.",
    exclusions: "Artists' own profile timezones are not used for aggregation.",
    timezone: "Default Europe/Berlin, configurable in growth settings.",
    refresh: "Applies immediately after a settings change.",
    limitations:
      "Changing the timezone shifts bucket boundaries, so numbers near midnight can move between adjacent days.",
    lastChanged: LAST_CHANGED,
  },
];

/** Data-history caveats that apply across the whole cockpit. */
export const KNOWN_LIMITATIONS: string[] = [
  "No attribution before 2026-07. Attribution for accounts created earlier is unknown and cannot be backfilled.",
  "No onboarding completion timestamps before 2026-07.",
  "No login or presence history before 2026-07. Pre-release activity consists of recorded actions only.",
  "Slots created before 2026-07 have no creation time.",
  "Rejected and cancelled requests without money attached are deleted after 30 days. The daily snapshot preserves aggregates from its start date.",
  "Retention cohort cells only cover the trailing 180 days of activity; checkpoint windows before that render blank.",
  "Audit rows without a booking are purged after 24 months.",
  "Email open counts are inflated by mail-client prefetching, so unique opens are used.",
];
