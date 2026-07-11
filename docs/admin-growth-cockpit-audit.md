# Growth cockpit: current-state audit

- Date: 2026-07-11
- Scope: everything the planned `/admin/growth` cockpit could read or should record, across
  apps/web, apps/mobile, packages/shared, migrations 0000-0066, and the live production database.
- Method: 12-area structured code audit (admin surface, database schema, signup/onboarding,
  booking lifecycle, activity signals, email system, Plausible/attribution, mobile identity,
  privacy/GDPR, support/feedback, UI/charting, Next.js conventions) plus read-only production
  probes run against the prod database via DATABASE_URL on 2026-07-10/11.
- Precedence rule: where a code reading and the production probe disagreed, the probe wins.
- Status: this audit precedes an implementation whose design decisions are locked.
  Section 8 describes that plan as the recommended order.

## 1. Executive summary

1. **An admin analytics dashboard already exists at `/admin`.**
   It ships KPIs with period-over-period deltas, an onboarding funnel, a booking funnel, feature
   adoption, quality/integrity flags, a support summary, and a 200-row artist roster
   (`apps/web/src/app/admin/page.tsx:34-52`, `apps/web/src/lib/admin-queries.ts`). The cockpit is
   an extension of an existing pattern, not a greenfield build. It must reuse the existing
   definitions (`periodBounds`, `testerIds`, `excludeArtistsQuery`, the funnel builders) or the
   two surfaces will disagree on every number.

2. **`profiles.created_at` means slug claim, not account creation, and the biggest funnel drop is
   invisible.** The profiles row is only created by the claim-slug upsert
   (`apps/web/src/app/(artist)/onboarding/claim-slug/actions.ts:84-115`), and slug is NOT NULL, so
   the existing funnel's "Account created" and "Slug claimed" steps are definitionally identical
   and always read 100%. Production: 25 auth users exist but only 18 profiles.
   **7 of 25 auth users never claimed a profile**, and no query anywhere counts them.

3. **Attribution is captured client-side but never persisted.** First-touch attribution
   (entry_path, referrer, source, medium, campaign) flows from localStorage through validated
   hidden form fields into Plausible event props and is then discarded
   (`apps/web/src/lib/analytics-gates.ts:65-102`). Production: **0 of 18 profiles have any stored
   attribution.** "Which channel produced our activated artists" is unanswerable, retroactively
   and permanently for all existing users.

4. **audit_log is a usable first-party event stream, but polluted and duplicated.** 1,305 rows in
   production, of which 823 are `email_delivery_failed` and 263 `reminder_sent`: system noise that
   must be excluded from any engagement metric. Booking transitions are written twice per event
   (`status_changed` plus `booking_status_change`, `apps/web/src/lib/server/bookings.ts:191,214`);
   `status_changed` is the canonical action and the other is the duplicate to ignore.

5. **Email engagement is joinable per artist by design but effectively has no data.** The
   0063-0065 tables give a clean markers/sends -> `email_events` join on `resend_message_id`, yet
   production holds 0 `email_jobs`, 0 `email_sends`, 0 lifecycle runs, 0 lifecycle markers, and
   exactly 1 `email_events` row (an unsubscribe). Opens and clicks are unverified in production
   (Resend tracking is a dashboard toggle invisible to the repo). The email section must render
   honest no-data states plus a webhook-health tile before charting anything.

6. **No login or activity history exists anywhere.** The web proxy and mobile auth validate every
   request and write nothing; there is no sign-in audit event; `auth.users.last_sign_in_at` is a
   single overwritten value (and is bumped by security flows); `auth.audit_log_entries` is empty
   in prod (verified), so there is no backfill source. Every existing "active artist" and
   "lastActivity" metric actually measures inbound customer demand
   (`apps/web/src/lib/admin-queries.ts:139-162,437-452`). True DAU/WAU/MAU is impossible
   historically and starts only when a touch mechanism ships.

7. **Volumes are tiny.** 18 profiles (13 after excluding 5 testers), 56 booking requests
   concentrated on 5 artists, 14 deposits requested and 14 paid, 92 slots across 3 artists.
   Nearly every rate the cockpit renders needs a minimum-sample warning, and the observed weekly
   cadence (1-2 distinct weekly artist actors over the last 90 days) means consumer-app
   daily-retention framing is wrong for this product.

8. **Production has schema drift.** `roadmap_items` (14 rows), `roadmap_votes`,
   `product_feedback`, `product_feedback_admin_notes`, and the function
   `roadmap_items_vote_count_sync` exist in prod with no migration and no code references
   anywhere in the repo. Migration bookkeeping itself is clean through 0066. The cockpit must not
   build on these tables.

9. **"Activated" currently means `settings->>onboarding_completed`, which reads 100% in
   production** (all 18 profiles have it true) and therefore hides everything. The flag is also
   mutable (admin reset). The metric needs redefinition (section 5), and there are no
   onboarding-completion timestamps for existing users to recover timing from (the audit actions
   exist but hold roughly one row each).

10. **Privacy promises are specific and load-bearing.** "No tracking cookies" (cookie banner) and
    "Aggregated, cookie-free analytics" (privacy policy) are published commitments. First-party
    user-level events and persisted attribution fit within them only under the constraints in
    section 7, including a privacy-policy row shipped as a founder-gated proposal.

## 2. Data that exists and can be used directly

Grouped by the cockpit sections that will consume it. All admin reads go through the service-role
client; 13 tables have RLS enabled with no policies (service-role only) and return nothing to
user-scoped clients.

### Acquisition

| Source | What it answers |
|---|---|
| `auth.users` (created_at, last_sign_in_at, email_confirmed_at, provider) | True account-creation series and the pre-claim drop. Never queried in aggregate today; the service-role auth admin API is already used per-account at `admin-queries.ts:491` |
| `profiles` (created_at, slug, is_tester, account_status, deleted_at) | Slug claims over time; live public pages (slug set AND active AND not deleted, the `booking_page_live` segment predicate) |
| `mobile_waitlist` (created_at, source) | Pre-launch app demand series (0 rows today) |
| `founding_artist_applications` | Beta pipeline with UTM columns; 0 rows, form lives on an unmerged branch; not a cockpit source |
| Plausible (external) | CTA clicks, signup_started/completed, booking_link_created with first-touch props since 2026-07-02. Dashboard-only: no Stats API client, no PLAUSIBLE_API_TOKEN exists |

### Activation

| Source | What it answers |
|---|---|
| `profiles.settings` keys `onboarding_completed`, `signup_event_fired`, `books_settings`, `form_settings` | Current activation state and onboarding step-state proxies. Prod: 18/18 completed, 16 books_settings, 15 form_settings, 2 signup_event_fired (instrumented only since 2026-07-02) |
| `audit_log` `onboarding_profile_claimed` / `onboarding_booking_set` / `onboarding_completed` | Per-step timestamps, written by the mobile routes only (web onboarding writes no audit rows); roughly 1 row each in prod, so historical timing is unrecoverable for nearly all existing users |
| `booking_requests` min(created_at) per artist | First booking received; time from claim to first request |
| `profiles.booking_mode` + `slots` | Fixed-slots vs preferred-date mix; whether a fixed-slots page can actually accept requests |

### Engagement and retention

| Source | What it answers |
|---|---|
| `audit_log` (actor, action, timestamp, event_category) | Last meaningful artist action and weekly acting-artist counts, after excluding system noise and admin actors. `books_opened`/`books_closed` are audited (3+3 rows so far, forward-usable) |
| `booking_requests.decided_at`, origin='artist_created' rows | Artist decision activity and artist-created bookings |
| `support_tickets` (created_at, last_artist_reply_at, artist_seen_at) | Passive artist presence; `artist_seen_at` is stamped just by opening a thread (0 tickets in prod) |
| `device_tokens` (platform, app_version, last_seen_at) | Mobile adoption and last cold start, for push-granted devices only (2 rows) |
| `instagram_accounts.last_sync_at` | Artist-triggered sync activity, never cron-driven (1 connected account) |
| `client_notes.updated_at`, `studios.updated_at`, `products.updated_at`, content `created_at` columns | Additional artist-action timestamps for the last-action composite |
| `deleted_account_records`, `audit_log` `account_deleted` | Churn events; pseudonymised snapshot with revenue, 24-month tombstone window |
| `email_events` opened/clicked joined via `email_sends`/markers | Reachability of dormant artists, once events actually flow |

### Features

| Source | What it answers |
|---|---|
| `slots`, `trips`/`trip_legs`, `flash_items`, `waitlist_entries`, `custom_fields`, `email_templates`, `client_notes`, `products`/`orders`, `booking_interests`, `instagram_accounts`, `device_tokens` | Feature adoption per artist (distinct artist_id counts, the `getFeatureAdoption` pattern at `admin-queries.ts:284-363`). Prod: slots 92, trips 9, flash 39, waitlist 5, custom fields 5, products 8, orders 1, notifications 30 |
| `account_overrides` | Comp/plus plan distribution, entitlement grants, fee-sponsorship spend (`fee_sponsored_used_cents` vs cap) |

### Bookings

| Source | What it answers |
|---|---|
| `booking_requests` (status, origin, created_at, decided_at, deposit_* columns, slot/trip/flash FKs) | Full booking funnel, deposit conversion, channel mix (public form vs artist-created vs flash vs trip vs slot vs waitlist-sourced). Prod: 56 requests, 25 approved, 24 pending, 4 cancelled, 2 rejected, 1 deposit_pending; deposits 14 requested / 14 paid |
| `audit_log` per-booking actions (`status_changed`, `deposit_paid`, `deposit_refunded`, `deposit_forfeited`, `deposit_payment_failed`, `customer_cancelled`) | Event-accurate transition timestamps and money events with amount + currency in details; indexed by `idx_audit_log_booking_action` (0048) |
| `orders` / `order_items` | Goods revenue, add-on attach rate, platform fee (1 order, 8 products today) |

### Email

| Source | What it answers |
|---|---|
| `email_lifecycle_runs` / `email_lifecycle_markers` | Lifecycle funnel per definition (audience -> eligible -> sent -> skipped-by-reason with the skipped_detail breakdown); all empty today |
| `email_sends` x `email_events` on `resend_message_id` | Campaign engagement per artist; the exact join `/api/internal/email-metrics` already implements; effectively empty today |
| `email_suppressions`, `profiles.settings.email_prefs` | Deliverability (bounces/complaints) and current opt-out state |
| `audit_log` `reminder_sent` (details.type) | Transactional reminder volume per booking/artist; the only record of reminder sends |

### Users (explorer)

| Source | What it answers |
|---|---|
| Existing `getAccountDetail` + `/admin/accounts/[id]` page | Per-artist deep view: email, last sign-in, status, usage cards, recent bookings, admin log, deposit volume. Reused as the cockpit's user detail view |
| `getArtistRoster` pattern (`admin-queries.ts:422-475`) | Roster table idiom with search/filter (note its `lastActivity` mislabel, section 5) |
| `lib/email-campaigns/resolve-segment.ts` (26 segments) | Canonical cohort definitions (setup_incomplete_day_N, booking_page_live, books_open_users, no_requests_day_N, inactive windows). Reuse, do not re-derive; they already encode tester/status/deleted_at rules |

## 3. Metrics derivable from existing tables today

- Signup (claim) series and activation state per cohort: `profiles.created_at` x
  `settings->>onboarding_completed` x `is_tester=false` (already in `getKpis`).
- True signup -> claim conversion and the pre-claim drop: `auth.users` minus `profiles`
  (new code over existing data; 7/25 today).
- Onboarding state funnel (claim -> profile info -> books configured -> completed -> first
  request): existing `getOnboardingFunnel` steps 2-6 (`admin-queries.ts:202-268`).
- Booking funnel and rates per period/artist: submitted, reviewed, accepted, passed, cancelled,
  deposit requested, deposit paid (`buildBookingFunnel`, `apps/web/src/lib/admin-metrics.ts:8-28`).
- Event-accurate transition timing (time to first decision, time to deposit paid): first
  `status_changed` occurrence per booking from audit_log; `decided_at` only as fallback because
  it is overwritten by later transitions.
- Deposit GMV and platform fee, always grouped by currency: `deposit_amount` /
  `deposit_currency` / `deposit_paid_at` columns, or the `deposit_paid` audit details. Caveat:
  the details key is named `amount_eur` even for non-EUR deposits; always read the `currency`
  key beside it (`api/stripe/webhook/route.ts:385-394`).
- Refund, forfeiture, and card-failure counts: `deposit_refunded`, `deposit_forfeited`,
  `deposit_payment_failed` audit actions; client-vs-artist cancellation split via
  `customer_cancelled` vs `status_changed{to:'cancelled'}`.
- Demand channel mix: `origin`, `slot_id`, `trip_id`, `flash_item_id`,
  `form_data->>source='waitlist'`.
- Feature adoption percentages and per-artist usage breadth: distinct artist_id per feature
  table, plus mobile adoption via `device_tokens` (platform split, app_version fleet).
- Last meaningful artist action (lower bound, labeled "last action"): GREATEST over allowlisted
  artist-actor audit rows (including the category-'system' support actions), booking decisions,
  artist-created bookings, support timestamps, instagram sync, `device_tokens.last_seen_at`,
  content created_at/updated_at columns, plus auth `last_sign_in_at` as a point value.
- Weekly acting-artist counts (historical WAU lower bound) from the same union.
- Books-open share now (deriveBooksOpen over settings, shared with the public page) and
  books-open transitions going forward (`books_opened`/`books_closed` audit rows).
- Guest-spot demand per trip, city, and leg window: `booking_requests.trip_id` join
  trips/trip_legs/studios.
- Waitlist funnel by state (waiting/contacted/converted/dismissed); conversion rate yes,
  conversion timing no (only created_at exists).
- Support load, category mix, first-response and resolution timing, computed from
  `support_ticket_messages` and audit rows rather than the mutable `resolved_at` (cleared on
  reopen); 0 tickets today.
- Segment sizes for all 26 lifecycle segments via the existing resolvers.
- Churn events: deletion tombstones (`details->>surface`) and `deleted_account_records`.
- Plan/comp distribution and sponsored-fee spend from `account_overrides`.

## 4. Important gaps (cannot be answered today, and why)

- **Pre-claim drop-off detail.** auth.users can head the funnel, but nothing records why 7
  signups never claimed. Web onboarding writes no per-step events at all (mobile writes audit
  rows; web writes none), so drop-off between claim, booking, availability, form, and done is
  invisible on the platform where most signups happen.
- **Onboarding timing.** `onboarding_completed` is a bare boolean set as a render side effect of
  `/onboarding/done` (`done/page.tsx:53-70`); no timestamp exists, and `profiles.updated_at` is
  overwritten by every settings write. Time-to-activate is unanswerable for existing users.
- **Activity / DAU.** No sign-in events, no last-seen column anywhere, `auth.audit_log_entries`
  empty in prod. Read-only sessions leave zero trace. An artist who logs in daily to check
  requests is indistinguishable from a fully dormant one: the exact cohort a growth cockpit most
  needs to separate. Day-grain presence starts only when the activity touch ships.
- **Attribution history.** Zero rows persisted; localStorage attribution is also fragile (Safari
  ITP purges script-writable storage after about 7 days), so pre-instrumentation users are
  permanently "Unknown", and mobile signups carry no attribution beyond the platform prop.
- **Page views per artist.** Booking-page views, form starts, and abandonment are uninstrumented;
  Plausible is aggregate and unjoinable by design. The admin dashboard's own "Instrumentation
  gaps" card lists this (`admin-client.tsx:398-418`).
- **Slot timing.** `slots` has no created_at or updated_at at all (0000 migration), so publish
  cadence, publish-to-lock latency, fill rate over time, and the real go-live moment for
  fixed_slots artists are unmeasurable. The 92 existing rows will stay unknown forever.
- **Books-open history.** `books_open` is an unversioned JSONB key overwritten in place; only
  3+3 audit rows exist so far, and the onboarding paths skip the audit write. Open/close cycle
  analysis is forward-only.
- **Transactional email joins.** `sendEmail()` discards the Resend message id
  (`apps/web/src/lib/email/send.ts:59`), so booking, deposit, reminder, auth, and support emails
  cannot be joined to artists, bookings, or `email_events` rows except by fragile
  recipient-email string matching.
- **Blocked demand.** Submissions rejected by books-closed, booking-cap, duplicate fingerprint,
  or rate limits return an error and write no row anywhere; demand lost while books are closed
  or capacity-constrained is invisible.
- **History erosion by design.** Non-money rejected/cancelled bookings are hard-deleted after 30
  days (cleanup cron), audit_log rows without a booking_id purge at 24 months, and account
  deletion cascades erase per-artist history (audit_log cascades on booking delete). Any
  live-computed historical trend silently shrinks; only a snapshot table protects it.
- **Mobile engagement.** The app's typed `track()` is a deliberate no-op
  (`apps/mobile/src/lib/analytics.ts:23-28`); screen views and in-app actions never leave the
  device. `audit_log` has no platform column, so web-vs-app action split is unavailable, and
  push delivery/taps are never recorded.
- **Roadmap voting, NPS, satisfaction.** No such infrastructure exists anywhere in web or
  mobile. The honest proxies are `feature_question` ticket share and ticket reopen rate, both
  currently zero-volume. The cockpit must not promise "top requested features".

## 5. Data-quality problems and conflicting definitions

- **Activated = onboarding_completed reads 100%.** All 18 prod profiles have the flag true, so
  the existing activation rate carries no signal. It is also mutable: the admin reset action
  flips it back to false (`accounts/[id]/actions.ts:207-228`), so counts can shrink.
  `signup_event_fired` is the permanent "ever activated" marker but exists on only 2 profiles.
- **"New signups" mislabels claims.** `getKpis.newSignups` and the `new_signups` segment count
  `profiles.created_at`, which is slug-claim time. The cockpit renames this and heads the
  acquisition funnel at `auth.users.created_at`.
- **"lastActivity" means inbound demand.** The admin roster and account detail derive it from the
  latest `booking_requests.created_at`: a customer action, not artist activity
  (`admin-queries.ts:437-452,594`). The cockpit must keep "receiving demand", "last action", and
  (post-deploy) "last seen" as three distinct, labeled metrics.
- **`decided_at` is overloaded and overwritten.** Set on approve, re-set by every deposit
  request, preserved-or-set on manual receipt, nulled on reopen, untouched by cancel
  (`bookings.ts:787-790,1003,1296`). Prod shows 4 of 25 approved rows without it. First-decision
  timing must come from audit rows.
- **Dual transition rows.** The shared cores insert both `status_changed` and
  `booking_status_change` per transition. Canonical = `status_changed`, first occurrence per
  booking (reopen loops can otherwise double-count funnel events); `booking_status_change` rows
  are ignored.
- **`travel_legs` is legacy.** Superseded by trips in 0016, but 3 rows remain and both
  `travel_leg_id` and `trip_id` exist on bookings; travel attribution uses `trip_id` only.
  Similarly `flash_day_items` (0051) supersedes `flash_items.flash_day_id` for day rollups.
- **Drizzle drift on `device_tokens`.** `src/db/schema.ts:719` still declares a global unique
  token while prod enforces UNIQUE(artist_id, token) since 0055; queries generated from the
  Drizzle types would miscount devices shared across accounts.
- **Prod drift tables with no migration.** `roadmap_items` (14 rows), `roadmap_votes`,
  `product_feedback`, `product_feedback_admin_notes`, plus the `roadmap_items_vote_count_sync`
  function exist in prod only (RLS enabled on all four). Not used by the cockpit; adopt via a
  proper migration or drop (founder decision). Related caveat: `founding_artist_applications`
  column nullability in prod may not match master's 0056 file (branch-era changes per
  `docs/roadmap.md:174`); the table has 0 rows and is not a cockpit source, and migration
  bookkeeping is verified clean through 0066.
- **`is_tester` retro-flagging.** All metrics filter on the current flag, so flagging an account
  later retroactively shrinks historical counts (5 of 18 profiles are testers today; 9
  `admin_account_flag_tester` audit rows). Roster and support queries do not apply the filter at
  all, while KPIs do: two different "total artists" on the same page. Daily snapshots freeze
  numbers against silent restatement.
- **PostgREST 1000-row truncation in existing admin queries.** `getBookingFunnel`,
  `getFeatureAdoption`, `getQualitySignals`, `getIntegrityFlags`, the roster's booking
  aggregation, and the active-artist sets all do unbounded selects that PostgREST silently
  truncates at max_rows=1000 (`admin-queries.ts:274-280,293-299,390-393,431-433`). Harmless at
  56 bookings, wrong at scale. The cockpit aggregates in Postgres (views/RPCs) instead. Note:
  the `/api/internal/segments` comment claiming counts degrade above 1000 rows is stale;
  `fetchAllRows` now pages to 5001.
- **`range=all` inconsistencies.** `periodBounds` returns null bounds for "all", but several
  getKpis subqueries substitute fixed dates, so "all" and "30" behave differently across
  sub-metrics and previous-period deltas degenerate on the all-time view
  (`admin-queries.ts:12,83-84,91-129`).
- **Stale-state caveat.** 24 pending requests, the oldest from May, are still pending (nothing
  ever expires them); approval-rate and response-time cohorts must state this.
- **`medianResponseHours`** is computed from a `.limit(500)` sample with no explicit ordering
  (`admin-queries.ts:138`); a biased sample as volume grows, and it inherits the `decided_at`
  problem above.
- **System noise and category traps in audit_log.** 823 `email_delivery_failed`, 263
  `reminder_sent`, 51 `admin_page_accessed` rows must be excluded from engagement metrics; the
  same action name exists with and without an actor (manual vs cron `reminder_sent`); and
  artist-driven support actions are filed under category 'system', so category filters
  misattribute. The meaningful-activity definition therefore uses an explicit artist-action
  allowlist, not a category filter.

## 6. Tracking to add, and tracking to refuse

### Add (migration 0067, all additive)

1. **`analytics_events`.** Typed catalogue in code, server-side writes only, tester/admin
   excluded at write time, `artist_id` FK ON DELETE CASCADE, `dedupe_key` partial unique index
   for idempotent once-only milestones. v1 events, exactly four: `onboarding_step_completed`,
   `onboarding_completed`, `page_published`, `booking_link_copied`. Coarse label props only:
   no IP, no user agent, no client identifiers, no free text, no booking content.
2. **`artist_activity_days`** (artist_id, day, surface web|mobile, PK on all three).
   Fire-and-forget touch from the authed artist layout (web, cookie-debounced) and
   `requireMobileUser` (mobile, in-memory debounced): the two existing auth chokepoints. Gives
   true DAU/WAU/MAU plus platform split forward from deploy. No history exists or can be
   recovered (`auth.audit_log_entries` is empty).
3. **`profiles.signup_attribution` jsonb.** Persisted at claim-slug from the existing
   localStorage -> hidden-field pipeline (`attributionPropsFromForm` already validates against an
   allowlist and clamps to 200 chars). Written once, never overwritten; platform-only for mobile;
   NULL for all pre-existing users, rendered as "Unknown (pre-instrumentation)".
4. **`slots.created_at`.** Default now() going forward, no backfill; the 92 existing rows stay
   NULL = unknown.
5. **`growth_daily_snapshots`** (snapshot_date PK, metrics jsonb). Written by a new
   `/api/cron/growth-snapshot` (vercel.json cron). Protects history against the 30-day booking
   cleanup, the 24-month audit purge, deletion cascades, and tester re-flagging. Backfilled once
   from surviving canonical data and labeled partial.
6. **`growth_settings`** (key PK, value jsonb, updated_at, updated_by). Retention thresholds and
   the reporting timezone; defaults live in code.

Also in the same migration: service-role-only SQL views and RPC functions
(`growth_artist_stats` one row per artist; `growth_signup_series`, `growth_booking_series`,
`growth_activity_days`, `growth_auth_summary` parameterized by from/to/timezone) so aggregation
happens in Postgres, never as unbounded PostgREST row fetches. All new tables: RLS enabled with
no policies (service-role only, matching the 0063-0065 pattern). The mobile events endpoint
`/api/mobile/events` ships on the existing bearer-auth pattern, ready for the app to adopt.

### Refuse (explicitly out of scope)

- **No PostHog** or any third-party product-analytics platform.
- **No session replay, no keystroke or scroll capture.**
- **No new cookies.** Attribution stays localStorage -> form -> server. The web activity-touch
  debounce cookie is a strictly-necessary functional cookie and is documented as such.
- **No client/customer PII in events.** No emails, handles, tattoo descriptions, booking
  content, or free text, matching the rules already written into the tracking modules.
- **No per-artist page-view tracking** until a privacy-reviewed design exists; visitor-side
  measurement touches the public site's published promises.
- **No Meta Pixel** or any marketing pixel: the cookie policy promises a consent banner first.
- **Do not build on the drift tables** (roadmap/product_feedback).
- **Do not flip the mobile `track()` no-op in this slice.** The endpoint ships now; the app-side
  flip waits for the next EAS build (no OTA updates exist, every JS change needs a build).

## 7. Privacy constraints and risks

- **Published wording is exact and load-bearing.** The cookie banner says "Inklee uses strictly
  necessary session cookies for artist login. No tracking cookies."
  (`apps/web/src/components/cookie-banner.tsx:24-26`). The privacy policy discloses analytics
  only as "Aggregated, cookie-free analytics (e.g. Plausible)" under legitimate interests
  Art. 6(1)(f) (`apps/web/content/legal/privacy.md:57`), and the subprocessor list promises
  Plausible receives "Aggregated, non-identifying traffic metadata". IP/device metadata is
  disclosed solely for security and abuse prevention, not analytics (`privacy.md:38`).
- **A privacy-policy row is needed before user-level events are considered fully disclosed.**
  First-party per-account product analytics and persisted attribution are not covered by the
  current wording; the broadest existing hook is the platform-operation clause at
  `privacy.md:23`. Legal copy changes are founder-gated, so the row ships as a **documented
  proposal**, with `analytics_events` dark-launched as internal-operations data in the interim.
  The still-open DPIA (LO-5 in the launch gate) should absorb the new capture, and the cookie
  policy's own scope sentence ("cookies and similar storage technologies") suggests listing the
  localStorage attribution entry there too.
- **DPA processor boundary on client booking data.** For Client Booking Request Data, Inklee is
  processor and may process it "only on documented instructions from the Artist", with the Annex
  1 purpose limited to operating the booking workflow (`apps/web/content/legal/dpa.md:24,30`).
  Cockpit booking metrics are therefore aggregate-only: counts, rates, and amounts, never client
  identity, handles, emails, or form content.
- **`profiles.settings` contains secrets.** `ical_token` and `mfa_recovery_codes` live in the
  same JSONB as the analytics flags. No cockpit query selects the settings blob;
  `growth_artist_stats` extracts only analytics-safe keys. Similarly, cockpit queries never
  select `customer_token_hash`, `deposit_client_secret`, or token-rotation hashes.
- **Email tables retain PII past account deletion: a pre-existing gap to fix separately.**
  `email_events` and `email_sends` keep `recipient_email` (artist_id is SET NULL on delete) and
  `email_suppressions` is keyed by raw email; none are touched by the deletion core or any purge
  cron. This conflicts with the deletion promise and counsel's pseudonymous-survivors rule. The
  cockpit does not widen it: it reads aggregates only, per the 0064 header contract that raw
  rows "never leave this database". A scrub-on-deletion plus retention window should be
  scheduled as its own fix.
- **Deletion behavior for the new tables: FK CASCADE.** `analytics_events` and
  `artist_activity_days` cascade with the profiles delete; snapshots are aggregate counts with
  no per-user data; anything that must survive deletion reduces to counsel §8 form (bare uuid +
  action + timestamp, no free-text props).
- **Exclusion invariants carry over.** Every cockpit write and read honors the three-layer
  exclusion: `profiles.is_tester=false`, `account_status='active'`, and ADMIN_EMAILS-matched
  accounts excluded via a react-cached helper. Otherwise DB numbers will not reconcile with the
  Plausible events, which already exclude internal users at fire time.
- **Email association language.** Emails-then-outcomes joins are correlational (no holdout
  exists); the cockpit words them as "converted within the attribution window" (default 7 days),
  never as caused.

## 8. Recommended implementation order

Phases match the locked design decisions. Phases 1-3 are being implemented immediately after
this audit; phase 4 items are follow-ups, each gated or deferred.

**Phase 1: capture first (migration 0067 plus write plumbing).**
Every day before deploy is data lost forever, so instrumentation lands before any UI:

- the 0067 tables, columns, views, and RPCs from section 6;
- the activity touches at the two auth chokepoints (web layout, `requireMobileUser`);
- attribution persistence in `claimSlugAction`;
- the four `analytics_events` write sites and `/api/mobile/events`;
- the `growth-snapshot` cron with its one-time partial backfill.

Apply with `supabase db push` and verify effects per the AGENTS.md migration footgun; never
`migration repair --status applied` without verifying the SQL actually ran.

**Phase 2: cockpit shell and overview.**

- `/admin/growth` layout using the existing route-based SectionNav idiom, inheriting the admin
  layout's `requireAdmin()` defense-in-depth and robots noindex;
- global date range via `?range=7|30|90|365|all` plus custom `?from=&to=`;
- the Overview page reading the layer-2 views/RPCs;
- shared components: MetricCard (extracted from the two near-duplicate implementations),
  Sparkline (hand-rolled SVG polyline, currentColor), CohortHeatmap (CSS grid, literal Tailwind
  bucket classes because dynamic class interpolation is not JIT-compiled, dark-safe), FunnelBars;
- a link card on `/admin` mirroring the support-card pattern;
- no chart library dependency. Standard admin recipe throughout: `requireAdmin()` per page,
  serviceClient queries in a server module, pure computation in a testable metrics module, one
  sibling client component, loading skeleton, brand tokens, sentence case, no em-dashes.

**Phase 3: section pages.**

- `/acquisition`, `/activation`, `/engagement`, `/retention`, `/features`, `/bookings`,
  `/email`, `/users`, `/insights`, `/definitions`, `/settings`;
- the User explorer's rows link to the reused `/admin/accounts/[id]`, which gains a growth
  timeline section;
- `/definitions` renders the canonical metric definitions, which are also written to
  `docs/metric-definitions.md`;
- `/settings` edits the `growth_settings` thresholds;
- honest-state rules everywhere: minimum-sample warnings at current volume (13 real artists),
  "Unknown (pre-instrumentation)" attribution, "last action" vs "last seen" labels split at the
  deploy date, the email webhook-health notice and insufficient-data states, money grouped by
  currency, and the stale-pending caveat on approval rates.

**Phase 4: follow-ups.**

- the privacy-policy row proposal (founder decision, section 7);
- the mobile `track()` flip at the next EAS build;
- Plausible Stats API integration (needs a PLAUSIBLE_API_TOKEN decision; documented as the
  recommended next improvement, not in this slice);
- the email-tables PII retention fix;
- a founder decision to adopt or drop the drift tables;
- eventual supersession of the `/admin` dashboard KPIs by the cockpit. Nothing is deleted in
  this slice; `periodBounds`, `testerIds`, the funnel builders, and the segment resolvers remain
  the shared definitions.

Key canonical definitions the implementation pins (full text goes to `/definitions` and
`docs/metric-definitions.md`):

- Account created = `auth.users.created_at` (not `profiles.created_at`).
- Page published = slug set AND `account_status='active'` AND `deleted_at IS NULL` (the page is
  live the instant the slug is claimed).
- Onboarding completed = the settings boolean (mutable); "ever activated" marker =
  `signup_event_fired`; completion timestamps only via `analytics_events` going forward.
- Activated artist = onboarding completed AND page published AND at least one of: received a
  booking request, approved a request, created a bookable slot, books open enabled, published a
  guest-spot trip, published a flash item. This supersedes the old activated =
  onboarding_completed definition and is documented as a definition change.
- Meaningful activity = the allowlisted union in section 3, with system noise excluded, labeled
  "last action" pre-deploy vs "last seen" post-deploy.
- Retention states (thresholds from `growth_settings`, defaults): Active = activity within 14
  days; Churn-risk = activated with no activity for more than 21 days; Dormant = no activity for
  30 days or more; Reactivated = activity after a gap of 30 days or more; Churned = dormant 90
  days or more, or account deleted. The tattoo-cadence caveat (weekly usage is normal) is
  documented next to these thresholds.
- Approval timestamps = first `status_changed` to 'approved' per booking; `decided_at` fallback
  only. Money aggregates always grouped by currency. Timezone for all SQL bucketing comes from
  `growth_settings` (default Europe/Berlin).

## Appendix: production probe snapshot (2026-07-10/11, read-only)

| Item | Value |
|---|---|
| auth.users | 25 total (24 email, 1 google); last_sign_in cumulative: 7d=3, 14d=5, 30d=7, 60d=17, never=3 |
| profiles | 18 (5 testers, 13 real); first 2026-04-19, last 2026-07-06; all account_status='active' |
| Auth users without a profile | 7 of 25 |
| onboarding_completed / books_settings / form_settings / signup_event_fired | 18 / 16 / 15 / 2 |
| signup_attribution persisted | 0 of 18 |
| booking_requests | 56 across 5 artists: approved 25 (21 with decided_at), pending 24 (0 decided_at), cancelled 4, rejected 2, deposit_pending 1; last approved-created 2026-06-05, last pending 2026-05-29 |
| Deposits | 14 requested, 14 paid (100% of requested) |
| Feature rows | slots 92 (3 artists), trips 9, trip_legs 10, travel_legs 3 (legacy), flash_items 39, waitlist_entries 5, custom_fields 5, email_templates 0, client_notes 0, notifications 30 (4 artists), device_tokens 2, support_tickets 0, instagram_accounts 1, orders 1, products 8, booking_interests 2 |
| audit_log | 1,305 rows, 2026-04-19 to date, 7 distinct actors |
| audit_log top actions | email_delivery_failed 823, reminder_sent 263, admin_page_accessed 51, booking_created 51, status_changed 40, deposit_unreconciled 19, booking_mode_changed 15, admin_account_flag_tester 9, token_rotated 6, admin_account_permanent_delete 6 |
| audit_log low-volume actions | books_opened 3, books_closed 3, email_template_reset 3, deposit_paid 3, deposit_refunded 2, onboarding_completed 1, customer_cancelled 1, onboarding_profile_claimed 1, deposit_forfeited 1, onboarding_booking_set 1 |
| Weekly distinct artist actors (last 90 days) | mostly 1-2 per week |
| email_jobs / email_sends / email_lifecycle_runs / email_lifecycle_markers | 0 / 0 / 0 / 0 |
| email_events | 1 row (unsubscribed, 2026-07-10); opens/clicks unverified in production |
| founding_artist_applications / mobile_waitlist | 0 / 0 |
| Drift tables (no migration, no code references) | roadmap_items 14 rows, roadmap_votes 0, product_feedback 0, product_feedback_admin_notes 0, function roadmap_items_vote_count_sync; RLS enabled on all four |
| Migration bookkeeping | clean; schema_migrations tail 0059-0066 |
| Views / materialized views in public schema | none (the growth SQL layer will be the first) |
| public functions | book_flash_item, increment_fee_sponsored_used, reorder_custom_field, roadmap_items_vote_count_sync (drift) |
| auth.audit_log_entries | empty (no login-history backfill source exists) |
