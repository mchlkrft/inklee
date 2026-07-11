# Growth cockpit: architecture and operations

- Location: `/admin/growth` (apps/web), shipped 2026-07 with migration `0067_growth_cockpit.sql`.
- Audience: whoever maintains or extends the cockpit. The current-state audit that preceded the
  build is `docs/admin-growth-cockpit-audit.md`; canonical metric definitions live in
  `docs/metric-definitions.md` and on `/admin/growth/definitions`; the event catalogue is
  documented in `docs/analytics-event-catalogue.md`.

## Purpose

The cockpit answers the founder's growth questions from first-party data: where artists come
from, whether they activate, how engaged they stay, where they drop off, what the booking funnel
and deposits look like, and whether lifecycle email is doing anything. It replaces guesswork with
honestly labeled numbers. Two principles run through everything:

1. **Honesty over polish.** Rates on small samples carry an explicit warning, metrics that only
   exist since the 2026-07 instrumentation say so, empty sections say "no data" instead of
   rendering fake zeros, and email/feature associations are worded as associations, never causes.
2. **One definition per concept.** Every number traces to one SQL object or one pure function.
   "Meaningful activity" is defined exactly once (the `growth_activity_events` view); "activated"
   is defined exactly once (`isActivated` in `src/lib/growth/metrics.ts`); both are documented in
   the definitions module and rendered on the definitions tab.

## Route map and guards

Overview at `/admin/growth` plus eleven sub-tabs, all server components:
`/acquisition`, `/activation`, `/engagement`, `/retention`, `/features`, `/bookings`, `/email`,
`/users` (user explorer), `/insights`, `/definitions`, `/settings`. The explorer's rows link to
the existing `/admin/accounts/[id]` detail page, which gained a growth timeline section. The
global date range persists in the URL (`?range=7|30|90|365|month|prev-month|all` or
`?from=YYYY-MM-DD&to=YYYY-MM-DD`) and is resolved by `src/lib/growth/date-range.ts` in the
reporting timezone.

Defense in depth, three layers:

1. The admin layout and the growth layout (`src/app/admin/growth/layout.tsx`) both call
   `requireAdmin()` (ADMIN_EMAILS allowlist + MFA step-up, redirect on failure).
2. Every page calls `requireAdmin()` again as its first line, so a page is safe even if it is
   ever moved or the layout changes.
3. The SQL layer itself is unreadable without the service-role key: new tables have RLS enabled
   with no policies, views have anon/authenticated SELECT revoked, and RPC EXECUTE is revoked
   from PUBLIC/anon/authenticated and granted to service_role only. A leaked user JWT gets
   nothing from any growth object.

## Three-layer data architecture

**Layer 1: canonical product tables.** profiles, auth.users, booking_requests, audit_log, slots,
trips, flash_items, waitlist_entries, custom_fields, email_templates, instagram_accounts,
device_tokens, support_tickets, email_lifecycle_markers/runs, email_events. The cockpit never
duplicates their state; it derives from it.

**Layer 2: the 0067 derived read layer (views + RPCs).** Aggregation happens in Postgres, with
indexes, never as raw PostgREST row fetches. This is load-bearing: PostgREST silently truncates
`.select()` results at `max_rows=1000`, which already threatens several older `/admin` queries
(documented in the audit, section 5). A view or RPC returns pre-aggregated rows, so the cap can
only bite on the per-artist view fetch, which is explicitly paged (see performance notes).

**Layer 3: supplemental first-party events.** `analytics_events` records the few things canonical
tables cannot answer (onboarding step timing, the activation moment, link copies), plus
`artist_activity_days` for day-grain presence. Both are additive and privacy-minimal by
construction.

### Object inventory (migration 0067)

| Kind | Name | Role |
|---|---|---|
| table | `analytics_events` | catalogued product events; dedupe_key partial unique index for once-only milestones |
| table | `artist_activity_days` | one row per (artist, day, surface); DAU/WAU/MAU forward from deploy |
| table | `growth_settings` | key/value thresholds + reporting timezone; defaults in code |
| table | `growth_daily_snapshots` | daily aggregate counts (jsonb, no PII); history protection |
| column | `profiles.signup_attribution` | first-touch attribution jsonb, written once at first claim |
| column | `slots.created_at` | default now() going forward; pre-0067 rows stay NULL (honestly unknown) |
| view | `growth_activity_events` | THE definition of meaningful artist activity (allowlist union) |
| view | `growth_artist_stats` | one row per artist: milestones, counts, activity, attribution (lateral joins) |
| function | `growth_signup_series` | auth signups + profile claims per bucket, in the reporting timezone |
| function | `growth_booking_series` | requests/approvals/declines/cancellations/deposits per bucket (audit first-occurrence; since 0069 approvals include the webhook's `deposit_paid` rows and cancellations include `customer_cancelled`) |
| function | `growth_deposit_totals` | paid deposit money, always grouped by currency |
| function | `growth_activity_days_series` | per-artist activity days (events + presence union) |
| function | `growth_auth_summary` | funnel head: total/confirmed auth users, users without a profile |
| function | `growth_decision_latency` | created to first decision per booking (median computed in code) |
| function | `growth_audit_action_counts` | windowed counts of specific audit actions |
| function | `growth_activity_kind_counts` | which kinds of meaningful activity happened in a window |
| function | `growth_lifecycle_engagement` | lifecycle sends joined to unique email events per definition |
| indexes | `audit_log_actor_time_idx`, `audit_log_action_time_idx` | activity scans (0048 only covered booking_id/action) |

Both views run with definer (owner) rights, which is what lets `growth_artist_stats` and
`growth_auth_summary` read `auth.users`; only service_role keeps SELECT.

### Code layer

- `src/lib/growth-queries.ts`: the only module that fetches. Service-role client, one exported
  function per section (`getOverviewData`, `getAcquisitionData`, ...), pages the view, calls the
  RPCs, assembles. Pages never query supabase directly.
- `src/lib/growth/*`: pure, unit-tested logic. `metrics.ts` (activation, funnel, medians,
  sample guard), `retention.ts` (state classification, cohorts, reactivations), `insights.ts`
  (rule-based insights), `email-metrics.ts` (attribution-window association), `date-range.ts`
  (timezone-correct range math), `settings.ts` (defaults + validated merge),
  `event-catalogue.ts` + `record-event.ts` (the event write path), `activity.ts` (presence
  touch), `definitions-content.ts` (the metric dictionary), `types.ts` (view row shapes).
  Tests live in `src/lib/growth/__tests__/`.

## Identity and attribution

First-touch attribution flows through an existing, cookie-free pipeline: `analytics-gates.ts`
captures entry_path, referrer (origin only), source, medium, campaign, content, and term into
localStorage on first visit; the signup and claim forms carry them as hidden fields;
`attributionPropsFromForm` validates against an allowlist, clamps values to 200 characters, and
content-filters them: values containing "@" or "://" are dropped (`sanitizeAttributionValue` in
`analytics-gates.ts`, mirrored client-side in `track.ts`), so an email in utm_source or a full URL
never enters storage.
What 0067 changed: `claimSlugAction` now persists those props into `profiles.signup_attribution`
at the FIRST claim only, with `platform: "web"` and a `captured_at` stamp. The blob is written
even when empty, so "captured, nothing to attribute" (a direct visit) stays distinguishable from
NULL (an account that predates capture). It is never overwritten. Mobile signups carry
platform-only attribution.

Known limitations, rendered in the acquisition UI rather than hidden:

- Safari ITP purges script-writable storage after about 7 days, so a Safari visitor who signs up
  more than a week after first touch reads as direct.
- Attribution is device-local: discover on the phone, sign up on the laptop, and the laptop's
  first touch wins (or nothing does).
- Every account created before 2026-07 is NULL, shown as "Unknown (pre-instrumentation)", and can
  never be backfilled. Production had 0 of 18 profiles with attribution at ship time.

## Activity and presence model

Two complementary signals:

**Meaningful activity** (`growth_activity_events` view) is an allowlisted union: thirteen
artist-actor audit actions (status_changed, books_opened/closed, booking_mode_changed, template
edits, onboarding steps, waitlist_convert (an action no code path currently writes; the bookings
tab counts waitlist conversions from `form_data->>'source' = 'waitlist'` via
`growth_booking_method_counts` instead), the two support actions, token_rotated), booking
decisions (`decided_at`), artist-created bookings, `device_tokens.last_seen_at`, and catalogued
analytics events. The allowlist deliberately excludes `booking_created` (customer demand, not
artist activity), the duplicate `booking_status_change` rows (double-count), and all system and
admin noise (823 `email_delivery_failed` rows and 263 `reminder_sent` rows polluted production at
audit time). Category filters were rejected because artist-driven support actions are filed under
category 'system'.

**Day-grain presence** (`artist_activity_days`) records that an artist showed up at all, acting
or not. `touchArtistActivity` (`src/lib/growth/activity.ts`) is called fire-and-forget from the
two auth chokepoints: the authed `(artist)` layout for the web and `requireMobileUser` for every
mobile API request. An in-process map debounces to one write per (artist, surface, day), capped
at 5,000 entries; after a cold start the first request re-upserts and the primary key turns it
into a no-op. Day boundaries use the reporting timezone. Presence exists only from deploy
forward; the UI labels pre-deploy history "last action" and post-deploy "last seen".

## The daily snapshot cron

`/api/cron/growth-snapshot` (vercel.json, daily at 02:30 UTC, CRON_SECRET bearer guard) writes
yesterday's aggregate counts into `growth_daily_snapshots`: point-in-time state (total artists,
activated, onboarding completed, books open) plus day-of counts (signups, claims, requests,
approvals, declines, cancellations, deposits requested and paid).

Why it exists: three mechanisms deliberately erode live history. The 30-day cleanup deletes
rejected/cancelled bookings without money, the 24-month retention purge deletes non-booking audit
rows, and account deletion cascades erase per-artist rows. Any live-computed trend silently
shrinks; the snapshot freezes each day's numbers (including against tester re-flagging, which
retroactively shrinks live counts). Counts only, never per-artist rows or PII, so the table is
exempt from deletion cascades by design.

Idempotency: the write is an upsert on `snapshot_date`, so re-running a day is safe.
`?date=YYYY-MM-DD` recomputes a specific day for manual backfill; the one-time historical
backfill from surviving canonical data is labeled partial.

## Applying and verifying migrations

Growth migrations are applied with `supabase db push`, dev first, then prod. Never use
`migration repair --status applied` without verifying the SQL actually ran (the AGENTS.md
footgun: repair updates bookkeeping without executing anything). Verification queries for 0067
are embedded in the migration header; the short form:

- tables: `select tablename from pg_tables where schemaname='public' and (tablename like 'growth%' or tablename in ('analytics_events','artist_activity_days'));`
- views: `select viewname from pg_views where schemaname='public' and viewname like 'growth%';`
- columns: `select column_name from information_schema.columns where table_name='profiles' and column_name='signup_attribution';`

## Performance notes

- `growth_artist_stats` is a lateral-join view: one row per artist, each row touching a dozen
  small per-artist aggregates. Cost scales linearly with artist count and is trivial at today's
  volume (18 profiles).
- `getAllArtistStats` pages the view fetch 1,000 rows at a time (the PostgREST cap) with a hard
  safety stop past offset 50,000, and is request-deduped via React `cache()` so a page that needs
  the rows three times fetches once.
- All time series are GROUP BY in SQL; only pre-aggregated buckets cross the wire. Medians run in
  code over per-booking latency rows, which are bounded by the selected window.
- Revisit when artist count passes roughly 10,000: materialize the per-artist stats (a
  materialized view refreshed by cron, or a rollup table maintained by the snapshot cron) and
  move the explorer's filtering into SQL. Nothing in the page layer would change; only
  `growth-queries.ts` and the migration.

## Exclusion rules

Every aggregate excludes the same groups: testers (`profiles.is_tester`), suspended or archived
and soft-deleted accounts (`account_status`, `deleted_at`), and admin-owned accounts (auth emails
matched against the ADMIN_EMAILS env allowlist, which is invisible to SQL). `getExcludedIds`
(react-cached) resolves the full id list (testers, suspended/archived, soft-deleted, admins) once
per request and passes it INTO every RPC as `p_exclude`, so excluded accounts are absent from the
SQL aggregates themselves, not just filtered in code. On the read side, `getAllArtistStats` drops
admin-owned rows outright but lets tester and suspended/deleted rows through carrying their
flags: aggregates drop them via `isCountedArtist`, while the user explorer can show testers
marked (`?testers=1`). On the write side, `recordGrowthEvent` excludes admin emails and testers
at write time, so supplemental events never need re-cleaning; the activity toucher, by contrast,
records presence for every authenticated account including testers and admins, and exclusion
happens at read time via the excluded-ids list. Plausible applies the same exclusion at fire
time, which keeps the two systems reconcilable.

## Retention, purge, and account deletion

- `analytics_events` and `artist_activity_days` cascade with the profiles delete (FK ON DELETE
  CASCADE), so account deletion erases an artist's events and presence automatically.
- The existing `/api/cron/retention-purge` now also bounds both tables for accounts that stay:
  rows older than 24 months are deleted, matching the audit-log convention.
- `growth_daily_snapshots` intentionally survives both: it holds aggregate counts only, never
  per-artist data, which is the counsel-approved shape for post-deletion survivors.
- The cockpit reads email engagement as aggregates only and never selects `profiles.settings`
  (it carries `ical_token` and MFA recovery codes), `recipient_email`, or any customer data. The
  pre-existing email-tables PII retention gap is documented in the audit (section 7) as a
  separate fix, not widened here.

## How-to guides

### Add a new metric

1. Write the computation as a pure function in `src/lib/growth/metrics.ts` (or `retention.ts` if
   it is a lifecycle-state concept). No IO in these modules.
2. Add a unit test in `src/lib/growth/__tests__/metrics.test.ts` covering the empty case and the
   small-sample case.
3. Add a `MetricDefinition` entry to `src/lib/growth/definitions-content.ts` (plain language,
   exact calculation, sources, exclusions, limitations, lastChanged date) and mirror it in
   `docs/metric-definitions.md`. A metric without a definition entry does not ship.
4. Fetch and assemble in the relevant section function in `src/lib/growth-queries.ts`; render on
   the page with `MetricCard`, including `SampleWarning`/`EmptyState` handling. If the metric
   needs new SQL, add a view or RPC in a new migration following the 0067 grant pattern (REVOKE
   anon/authenticated, GRANT service_role).

### Add a new analytics event

1. Add the zod schema to `GROWTH_EVENT_SCHEMAS` in `src/lib/growth/event-catalogue.ts` and extend
   `dedupeKeyFor` (return a key for once-only milestones, null for repeatable events). Prop rules
   are hard: coarse enumerable labels only; never emails, names, handles, booking or client data,
   free text, IP, or user agent.
2. Call `recordGrowthEvent(...)` at the server-side call site (server action or API route), never
   from the client. Await once-only dedupe-keyed milestones at terminal moments (the recorder never
   throws, and an unawaited write can be lost to serverless teardown); fire repeatable events as
   `void recordGrowthEvent(...)`. The recorder excludes testers/admins and swallows failures.
3. Document the event in `docs/analytics-event-catalogue.md` in the same PR (the catalogue file
   header requires it) and add a test in `src/lib/growth/__tests__/event-catalogue.test.ts`.
4. No migration is needed: the table's name check is shape-only and the catalogue is enforced in
   code by the single writer. Mobile events flow through `/api/mobile/events` once the app-side
   `track()` no-op is flipped.

### Add a new insight rule

1. Extend `InsightsBundle` in `src/lib/growth/insights.ts` if the rule needs data the bundle does
   not carry, then assemble that data in `getInsightsData` (`growth-queries.ts`).
2. Add the rule to `buildInsights`: neutral, investigation-oriented wording, an explicit
   `sampleWarning` when n is small, a `severity` (attention/watch/info), and an `href` into the
   section where the underlying data lives. No causal language: "currently show", "associated
   with", never "causes" or "drives".
3. Add a test in `src/lib/growth/__tests__/insights.test.ts` proving the rule fires on the
   intended input and stays silent below its thresholds.

### Change a threshold

Use `/admin/growth/settings`. Thresholds (active/churn-risk/dormant/churned windows, reactivation
gap, attribution window, minimum sample size, insight change threshold, reporting timezone) live
in the `growth_settings` table with defaults in `src/lib/growth/settings.ts`; writes are validated
against `growthSettingsSchema` and stamped with the editing admin's id. Retention states are
computed at read time, so a threshold change reclassifies artists immediately, and a timezone
change shifts bucket boundaries (numbers near midnight can move between adjacent days). A single
bad stored value falls back to its default instead of taking the cockpit down.

## Known limitations

Mirrored from `KNOWN_LIMITATIONS` in `src/lib/growth/definitions-content.ts` (also rendered on
the definitions tab):

- No attribution before 2026-07. Attribution for accounts created earlier is unknown and cannot
  be backfilled.
- No onboarding completion timestamps before 2026-07.
- No login or presence history before 2026-07. Pre-release activity consists of recorded actions
  only, which undercounts artists who logged in without acting.
- Slots created before 2026-07 have no creation time.
- Rejected and cancelled requests without money attached are deleted after 30 days; the daily
  snapshot preserves aggregates from its start date.
- Retention cohort cells only cover the trailing 180 days of activity; checkpoint windows before
  that render blank.
- Audit rows without a booking are purged after 24 months.
- Email open counts are inflated by mail-client prefetching, so unique opens are used.

Additional operational caveats: production volume is tiny (13 counted artists at ship time), so
nearly every rate renders with the minimum-sample warning; stale pending requests (no automatic
expiry exists) depress approval rates on long windows; and `email_events` held a single row at
ship time, so the email tab leads with a webhook-health notice instead of engagement charts.

## What was deliberately not built

- **No PostHog** or any third-party product-analytics platform; first-party tables only.
- **No session replay**, keystroke capture, or scroll tracking.
- **No new cookies.** Attribution stays localStorage to form to server; the published "no
  tracking cookies" promise holds. The web activity-touch debounce is in-process memory, not a
  cookie.
- **No per-artist page-view tracking.** Booking-page views and form abandonment stay
  uninstrumented until a privacy-reviewed design exists; visitor-side measurement touches the
  public site's published promises.
- **No Plausible Stats API integration yet.** The dashboard stays the only Plausible surface; a
  PLAUSIBLE_API_TOKEN decision is the gate. Documented as the recommended next improvement.
- **Mobile `track()` is still a no-op.** The `/api/mobile/events` endpoint is live (bearer auth,
  batch of 20, catalogue-gated, restricted to `CLIENT_INGESTIBLE_EVENTS` (only
  `booking_link_copied`; milestones are server-observed only), rate-limited to 120 events per
  artist per hour shared with the web copy action, clock-skew clamped, and awaited before
  responding), so flipping the app-side no-op is a pure mobile change at the next EAS build (no
  OTA updates exist).
- **Nothing was deleted.** The old `/admin` dashboard, `periodBounds`, `testerIds`, the funnel
  builders, and the lifecycle segment resolvers remain; the cockpit supersedes the `/admin` KPIs
  over time rather than in this slice.
- **The privacy-policy row ships as a proposal.** First-party per-account analytics and persisted
  attribution are not fully covered by the current policy wording; legal copy is founder-gated,
  so the events table is dark-launched as internal-operations data with the disclosure row
  documented as a pending founder decision (audit, section 7).
