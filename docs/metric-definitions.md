# Growth cockpit metric definitions

The canonical metric dictionary for the admin Growth cockpit (`/admin/growth`). The same content is
rendered in-app on `/admin/growth/definitions` from `apps/web/src/lib/growth/definitions-content.ts`;
that module and this document must always say the same thing. The executable definitions live in
`apps/web/src/lib/growth/metrics.ts` and `apps/web/src/lib/growth/retention.ts` and are unit-tested in
`apps/web/src/lib/growth/__tests__/`.

Shared facts that apply to every metric below:

- **Data layer**: aggregation happens in Postgres via migration `0067_growth_cockpit.sql`, which adds
  the views `growth_artist_stats` (one row per artist) and `growth_activity_events` (the meaningful-
  activity union), plus the RPCs `growth_signup_series`, `growth_booking_series`,
  `growth_deposit_totals`, `growth_activity_days_series`, `growth_auth_summary`,
  `growth_decision_latency`, `growth_audit_action_counts`, `growth_activity_kind_counts`, and
  `growth_lifecycle_engagement`. Pages never query base tables directly.
- **Refresh behaviour**: every number is computed live at page load from the view/RPCs. In addition,
  a daily snapshot cron (`/api/cron/growth-snapshot`, 02:30 UTC via `vercel.json`) writes yesterday's
  aggregate counts into `growth_daily_snapshots` so history survives the 30-day booking cleanup and
  the 24-month audit purge. Snapshots hold counts only, never per-artist rows.
- **Exclusions**: testers (`profiles.is_tester`), admin-owned accounts (matched against the
  `ADMIN_EMAILS` env config at query time), and suspended, archived, or soft-deleted accounts are
  excluded from every aggregate. The full excluded-id list is passed into every SQL function
  (`p_exclude`), so these accounts are absent from series and totals, not just filtered in code.
- **Thresholds**: names like `active_days` refer to the growth settings (`growth_settings` table,
  defaults in `apps/web/src/lib/growth/settings.ts`), editable on `/admin/growth/settings`.
- **Last definition change**: 2026-07-11 (cockpit v1) for all metrics. The Activated definition
  supersedes the old onboarding-completed-only definition on that date; see the metric entry.

---

## Counted artist

- **Plain language**: the base population behind every metric in the cockpit: real artist accounts
  that are live on the platform.
- **Calculation**: `profiles` rows with `is_tester = false`, `account_status = 'active'`, not soft
  deleted, and not owned by an `ADMIN_EMAILS` account (`isCountedArtist` in `metrics.ts`).
- **Sources**: `profiles`, `auth.users`, read through the `growth_artist_stats` view (0067).
- **Inclusions**: every live artist profile that passes all four conditions.
- **Exclusions**: testers, admin-owned accounts, suspended or archived accounts, and soft-deleted
  accounts. The full excluded-id list is passed into every SQL aggregate, so these accounts are
  absent from series and totals, not just from the artist list.
- **Timezone**: not time-bucketed.
- **Refresh**: live on page load.
- **Known limitations**: admin ownership is matched against the `ADMIN_EMAILS` environment config at
  query time; it is not stored in the database.
- **Last changed**: 2026-07-11.

## Account created

- **Plain language**: the moment a person signed up for an account, whether or not they ever claimed
  a booking page.
- **Calculation**: `auth.users.created_at`.
- **Sources**: `auth.users`, via the `growth_auth_summary` and `growth_signup_series` RPCs (0067) and
  `account_created_at` on the `growth_artist_stats` view.
- **Inclusions**: all auth accounts, including those that never claimed a booking page slug.
- **Exclusions**: testers and admin-owned accounts.
- **Timezone**: buckets in the reporting timezone.
- **Refresh**: live on page load; the daily 02:30 snapshot preserves per-day signup counts.
- **Known limitations**: this is not `profiles.created_at`, which is the moment the booking page slug
  was claimed. The pre-claim drop (accounts that never claim) is only visible from auth data; the old
  admin funnel mislabelled claim time as signup time.
- **Last changed**: 2026-07-11.

## Booking page published

- **Plain language**: the artist's public booking page is live and reachable by clients.
- **Calculation**: slug set AND `account_status = 'active'` AND not deleted (`isPagePublished` in
  `metrics.ts`).
- **Sources**: `profiles`, via the `growth_artist_stats` view (0067). The publish timestamp going
  forward comes from the `page_published` analytics event.
- **Inclusions**: every counted artist whose page is currently reachable.
- **Exclusions**: suspended and deleted accounts, even if they once had a slug.
- **Timezone**: publish timestamps bucket in the reporting timezone.
- **Refresh**: live on page load.
- **Known limitations**: the page is live the instant the slug is claimed, so publish time equals
  claim time; there is no separate publish step. Suspension takes a page down, which is why this is a
  live predicate rather than a permanent flag.
- **Last changed**: 2026-07-11.

## Onboarding completed

- **Plain language**: the artist finished the onboarding wizard.
- **Calculation**: `settings.onboarding_completed = true`. "Ever completed" uses the permanent
  `signup_event_fired` flag instead.
- **Sources**: profile settings (exposed as `onboarding_completed` and `ever_completed_onboarding` on
  the `growth_artist_stats` view, 0067); completion timestamps from `analytics_events`
  (`onboarding_completed_event_at`).
- **Inclusions**: counted artists whose completion flag is currently set.
- **Exclusions**: artists whose flag was cleared by an admin reset (they still count under "ever
  completed").
- **Timezone**: completion timestamps bucket in the reporting timezone.
- **Refresh**: live on page load.
- **Known limitations**: the flag is mutable: an admin reset can clear it. Completion timestamps
  exist only from 2026-07 onward (via `analytics_events`); earlier completions have no timestamp.
- **Last changed**: 2026-07-11.

## Activated artist

- **Plain language**: an artist who is fully set up and shows at least one real booking signal.
- **Calculation**: onboarding completed AND page published AND at least one booking signal: received
  a request, approved a request, created a bookable slot, books open enabled, published a guest spot
  trip, or published a flash design (`isActivated` and `hasBookingSignal` in `metrics.ts`). The
  activation moment is the later of the onboarding completion event and the earliest timestamped
  booking signal (first request, first approval, first slot, first trip, or first flash;
  `activationMomentAt` in `metrics.ts`). Median days to activation measures account creation to that
  moment and is null when either half is untimestamped (for example a books-open-only activation).
- **Sources**: `growth_artist_stats` view (migration 0067).
- **Inclusions**: counted artists meeting all three conditions.
- **Exclusions**: artists with a live page but no booking signal yet.
- **Timezone**: not time-bucketed; activation timestamps bucket in the reporting timezone.
- **Refresh**: live on page load; the daily 02:30 snapshot records the activated count per day.
- **Known limitations**: median days to activation is only measurable for artists whose completion
  moment was recorded (analytics event, 2026-07 onward) and whose booking signal carries a
  timestamp; it previously measured account creation to completion only.
- **Last changed**: 2026-07-11. **Definition change**: this definition supersedes the old
  onboarding-completed-only definition of "activated", which read 100% in production and hid
  everything. Activation numbers before and after this date are not comparable.

## Meaningful activity

- **Plain language**: any signal that an artist actually did something in the product; the basis for
  engagement and retention.
- **Calculation**: union of allowlisted artist audit actions (booking decisions, books toggles,
  template edits, onboarding steps, waitlist conversions, support messages, token rotations), booking
  decisions, artist-created bookings, mobile app opens (device `last_seen`), day-grain presence
  (from 2026-07), and catalogued analytics events.
- **Sources**: `growth_activity_events` view (migration 0067), the SQL source of truth; served
  through the `growth_activity_days_series` and `growth_activity_kind_counts` RPCs.
- **Inclusions**: artist-initiated actions and presence signals only.
- **Exclusions**: system noise (reminder sends, delivery failures) and admin actions.
- **Timezone**: activity days are cut in the reporting timezone.
- **Refresh**: live on page load.
- **Known limitations**: day-grain presence exists only from 2026-07 onward. Earlier periods contain
  recorded actions only, which undercounts artists who logged in without acting. Label pre-release
  data "last action", post-release data "last seen".
- **Last changed**: 2026-07-11.

## Active / Churn risk / Dormant / Churned

- **Plain language**: lifecycle states derived from how recently an artist showed meaningful
  activity.
- **Calculation**: Active = meaningful activity within `active_days` (default 14). Churn risk =
  activated and silent longer than `churn_risk_days` (default 21). Dormant = silent at least
  `dormant_days` (default 30). Churned = silent at least `churned_days` (default 90).
  (`classifyRetention` in `retention.ts`.)
- **Sources**: `growth_artist_stats`, `growth_activity_events` (0067), growth settings.
- **Inclusions**: activated artists move through churn risk, dormant, and churned as silence grows.
- **Exclusions**: never-activated artists are "pre-activation", not churned. Churn language only
  applies to artists who reached value once.
- **Timezone**: silence is measured in days in the reporting timezone.
- **Refresh**: live on page load; thresholds configurable in growth settings.
- **Known limitations**: states are computed at read time from the configured thresholds, so
  changing a threshold reclassifies artists immediately. Tattoo artists work in weekly rhythms, so
  the defaults are deliberately looser than consumer-app defaults.
- **Last changed**: 2026-07-11.

## Reactivated

- **Plain language**: an artist who went quiet and then came back.
- **Calculation**: a meaningful-activity day after a gap of at least `reactivation_gap_days`
  (default 30), within the trailing 180 days (`findReactivations` in `retention.ts`).
- **Sources**: `growth_activity_days_series` RPC over the `growth_activity_events` view (0067).
- **Inclusions**: counted artists with at least one qualifying gap-then-return inside the lookback.
- **Exclusions**: returns after gaps shorter than the configured minimum.
- **Timezone**: gaps are measured in activity days cut in the reporting timezone.
- **Refresh**: live on page load.
- **Known limitations**: the lookback is capped at the trailing 180 days; earlier reactivations are
  not counted.
- **Last changed**: 2026-07-11.

## Approval / first approval

- **Plain language**: when a booking request was first approved, by artist decision or by the client
  paying the deposit.
- **Calculation**: the approval moment is the first of either a `status_changed` transition to
  `approved` or the Stripe webhook's `deposit_paid` audit row, per request (paying the deposit
  approves the booking; the webhook never writes a `status_changed` row). `last_decision_at` still
  means the latest artist decision (`status_changed` only). `decided_at` is only a fallback (it is
  overwritten by later transitions). See `firstApprovalAt` in `metrics.ts`.
- **Sources**: booking audit trail (`audit_log`), `booking_requests`, surfaced as
  `first_approved_at` on the `growth_artist_stats` view and counted by `growth_booking_series`
  (both updated in migration 0069).
- **Inclusions**: the first approval moment per request, whether it arrived as an artist decision or
  a deposit payment.
- **Exclusions**: `booking_status_change` audit rows are a duplicate write and are ignored.
- **Timezone**: approval timestamps bucket in the reporting timezone.
- **Refresh**: live on page load.
- **Known limitations**: the `decided_at` fallback reflects the most recent transition, so it can sit
  later than the true first approval (early rows predate the `status_changed` audit trail).
- **Last changed**: 2026-07-11.

## Approval rate

- **Plain language**: the share of incoming requests that artists approve.
- **Calculation**: approvals in period / requests submitted in period.
- **Sources**: `growth_booking_series` SQL function (0067, definition updated in 0069).
- **Inclusions**: approvals are counted by their first-occurrence timestamp, so reopen loops do not
  double count, and include bookings approved by a deposit payment. The cancellations series counts
  both artist cancellations (`status_changed` to `cancelled`) and client cancellations
  (`customer_cancelled` audit rows); the client and artist split on the bookings page derives from
  `customer_cancelled` counts.
- **Exclusions**: testers and admin-owned accounts.
- **Timezone**: period boundaries in the reporting timezone.
- **Refresh**: live on page load; per-day counts preserved by the 02:30 snapshot.
- **Known limitations**: approvals in a period can belong to requests submitted in an earlier
  period, so the rate can read above 100% on small windows. Stale pending requests (no decision yet)
  depress the rate.
- **Last changed**: 2026-07-11.

## Deposit conversion

- **Plain language**: the share of requested deposits that clients actually paid.
- **Calculation**: deposits paid / deposits requested, within the period.
- **Sources**: `growth_booking_series` and `growth_deposit_totals` SQL functions (0067).
- **Inclusions**: all deposit requests and payments by counted artists in the period.
- **Exclusions**: testers and admin-owned accounts.
- **Timezone**: period boundaries in the reporting timezone.
- **Refresh**: live on page load; per-day counts preserved by the 02:30 snapshot.
- **Known limitations**: money is always grouped by currency; there is no cross-currency total.
- **Last changed**: 2026-07-11.

## Email-associated conversion

- **Plain language**: a target outcome observed within a window after a lifecycle email went out.
- **Calculation**: the definition's target outcome observed within
  `email_attribution_window_days` (default 7) after the send
  (`associateLifecycleConversions` in `email-metrics.ts`).
- **Sources**: `email_lifecycle_markers` (status `sent`), `growth_artist_stats` (0067); engagement
  counts via the `growth_lifecycle_engagement` RPC.
- **Inclusions**: outcomes observed inside the attribution window.
- **Exclusions**: outcomes outside the window, even when they follow a send. Outcomes that predate
  the send never count.
- **Timezone**: the window is measured from the send timestamp.
- **Refresh**: live on page load.
- **Known limitations**: an association, never proof of causation; there is no control group and
  none is implied. The wording contract is "converted within the attribution window".
- **Last changed**: 2026-07-11.

## First-request rate

- **Plain language**: how many artists have ever received a booking request.
- **Calculation**: share of counted artists (or a cohort) with at least one booking request. With a
  period selected, cohort membership follows the account creation date (falling back to the claim
  date when no auth row exists), matching the funnel's auth head, so stages can never exceed 100% of
  the head.
- **Sources**: `growth_artist_stats` view (0067).
- **Inclusions**: any request, regardless of its outcome.
- **Exclusions**: testers and admin-owned accounts.
- **Timezone**: cohort boundaries in the reporting timezone.
- **Refresh**: live on page load.
- **Known limitations**: requests removed by the 30-day privacy cleanup (rejected or cancelled, no
  money attached) no longer count, so the rate can undercount artists whose only requests were
  removed. The daily snapshot preserves aggregate request counts from its start date.
- **Last changed**: 2026-07-11.

## Retention cohort cell

- **Plain language**: for artists who claimed their page in the same period, the share showing
  meaningful activity at each checkpoint.
- **Calculation**: share of a claim-date cohort with meaningful activity in the 7 days starting at
  each checkpoint day (1, 7, 14, 30, 60, 90). The 7-day window matches the weekly working cadence; a
  strict single-day check would read near zero for artists who work weekly. The percentage's
  denominator is the cohort's measurable members, shown in each cell's tooltip.
  (`buildRetentionCohorts` in `retention.ts`.)
- **Sources**: `growth_artist_stats`, `growth_activity_days_series` (0067).
- **Inclusions**: counted artists in the claim-date cohort.
- **Exclusions**: a cell is measurable only when its full 7-day window has elapsed and lies inside
  the 180-day activity lookback; unmeasurable cells are blank, never zero, so young cohorts do not
  read as churned.
- **Timezone**: cohorts and checkpoint windows are cut in the reporting timezone.
- **Refresh**: live on page load.
- **Known limitations**: activity is fetched for the trailing 180 days only, so checkpoint windows
  before that render blank. Cohorts before 2026-07 rest on recorded actions only (no presence
  history), so early cells read lower than reality.
- **Last changed**: 2026-07-11.

## Reporting timezone

- **Plain language**: the timezone every chart and bucket in the cockpit is cut in.
- **Calculation**: all day, week, and month buckets use the configured reporting timezone (default
  Europe/Berlin), applied inside the SQL functions via an `AT TIME ZONE` parameter.
- **Sources**: growth settings (`growth_settings` table, defaults in `settings.ts`).
- **Inclusions**: every time series and cohort boundary in the cockpit.
- **Exclusions**: artists' own profile timezones are not used for aggregation.
- **Timezone**: default Europe/Berlin, configurable in growth settings.
- **Refresh**: applies immediately after a settings change. The daily snapshot uses the timezone
  configured at snapshot time.
- **Known limitations**: changing the timezone shifts bucket boundaries, so numbers near midnight
  can move between adjacent days. Already-written daily snapshots are not recomputed.
- **Last changed**: 2026-07-11.

---

## Known data-history limitations

These caveats apply across the whole cockpit and are surfaced in the UI where relevant:

- No attribution before 2026-07. Attribution for accounts created earlier is unknown and cannot be
  backfilled.
- No onboarding completion timestamps before 2026-07.
- No login or presence history before 2026-07. Pre-release activity consists of recorded actions
  only.
- Slots created before 2026-07 have no creation time.
- Rejected and cancelled requests without money attached are deleted after 30 days. The daily
  snapshot preserves aggregates from its start date.
- Retention cohort cells only cover the trailing 180 days of activity; checkpoint windows before
  that render blank.
- Audit rows without a booking are purged after 24 months.
- Email open counts are inflated by mail-client prefetching, so unique opens are used.

---

## Changing a definition

A metric definition is an interface, not an implementation detail. Changing one silently rewrites
history: every past reading of that metric means something different afterwards. The protocol:

1. Change the executable definition (`apps/web/src/lib/growth/metrics.ts`,
   `retention.ts`, or `email-metrics.ts`) together with its unit tests in
   `apps/web/src/lib/growth/__tests__/`.
2. Update `apps/web/src/lib/growth/definitions-content.ts` (the in-app `/admin/growth/definitions`
   page) and this document in the same PR, including the "last changed" date and a note describing
   what the old definition was.
3. Call the change out explicitly in the PR description: which readings shift, from when, and
   whether before/after values remain comparable. The Activated change of 2026-07-11 (superseding
   the old onboarding-completed-only definition) is the template for how to record this.

A definition change that ships without all three parts is a bug.
