# Public web analytics + Search Console

- Date: 2026-07-11
- Scope: the anonymous public-traffic layer of the admin Growth cockpit: first-party
  web analytics (migration `0070_public_web_analytics.sql`, `src/lib/public-analytics/*`,
  `/api/wa/collect`) and the Google Search Console integration (`src/lib/gsc/*`,
  `/api/admin/gsc/*`, `/api/cron/gsc-sync`).
- Companion: `docs/growth-analytics-privacy.md` covers the authenticated-artist analytics
  layer (migration 0067). This document covers the public-visitor layer only.

## 1. Purpose and scope

The cockpit's product metrics start at signup. This layer answers what happens before
that: who visits the public site, where they come from, which pages and campaigns
produce signups and booking requests, and how Google search treats us.

Phase 1 (this document, shipped):

- Anonymous first-party pageview and event collection on the public surfaces
  (marketing pages, artist booking pages, hub pages).
- UTM and referrer-based channel attribution per visit.
- Conversion events (signup started/completed, waitlist join, booking request
  completed), including server-emitted conversions that join the visitor's visit.
- Google Search Console clicks/impressions/CTR/position, synced daily.
- The acquisition-to-account bridge: persisted first-touch `signup_attribution` on
  profiles connects anonymous acquisition to concrete accounts.

Phase 2 exclusions. These are deliberately out of scope and none of the machinery for
them exists: no session recordings, no heatmaps, no event autocapture, no feature
flags, no A/B tests, no cross-device or cross-day identity, no multi-touch attribution
(first-touch and per-visit last-touch only), no Google Ads integration, no GSC URL
inspection API, no Google Discover data.

## 2. Architecture

```
browser (collector.ts, cookie-free)
  -> POST /api/wa/collect        (filter, validate, enrich, hash)
  -> web_analytics_events        (service-role only)
  -> wa_* SQL functions          (sessionization + aggregates)
  -> /admin/growth acquisition + search pages (requireAdmin)
server actions -> recordPublicServerEvent -> web_analytics_events (same hash)
```

### Client collector (`src/lib/public-analytics/collector.ts`)

Mounted by the `PublicAnalytics` component (`src/components/public-analytics.tsx`).
It is first-party and cookie-free. Behaviour:

- Sends registry-validated events to `/api/wa/collect` on the same origin via
  `sendBeacon` (fetch keepalive fallback). Failures are swallowed; analytics can never
  break a public page.
- Runs only in production builds on the production Vercel environment.
- Never tracks private prefixes (`/dashboard`, `/bookings`, `/settings`, `/admin`,
  `/onboarding`, `/auth`, `/api`, `/request`, and the rest of the list in
  `PRIVATE_PREFIXES`).
- Self-suppresses for internal browsers: the `inklee_internal` localStorage marker
  (set once via `?internal=1`, cleared via `?internal=0`, the same marker the
  Plausible events respect) disables it entirely.
- Same-session acquisition context lives in sessionStorage only
  (`inklee_wa_session`: landing path, external referrer domain, UTM labels). It is
  captured once per tab session and cleared when the tab closes. No cookie, no
  localStorage, nothing persistent.
- Dedupe: one pageview per real navigation (repeat fires for the same path are
  dropped), and query strings/hashes are stripped before anything is sent.

### Ingestion (`/api/wa/collect`)

Every outcome returns 202 so callers get no oracle for probing the filters. In order:

1. No-op unless `WA_VISITOR_HASH_SECRET` is set and the deployment is production.
2. Bot filter: known crawlers, link-preview bots, monitors, headless automation, and
   missing or absurdly short user agents are rejected (`isBotUserAgent`).
3. Internal exclusion: the `x-inklee-internal: 1` header is the server-side backstop
   for the client marker, and `WA_EXCLUDE_IPS` (IPs or /8 /16 /24 CIDR prefixes)
   excludes office/founder networks. Matching is transient; addresses are never stored.
4. Payload limits: 4 KB body cap, JSON only, event name and properties validated
   against the registry, pathname normalized, client timestamps accepted only within a
   skew window (else server time).
5. Hostname allowlist: `inklee.app` and `inkl.ee` plus their subdomains only
   (`ALLOWED_HOSTNAME_SUFFIXES` in `enrich.ts`); `localhost` is rejected.
6. Duplicate guard: an in-process sliding window drops identical
   (visitor hash, event, path) pageviews within 5 seconds (double-mounted effects,
   rapid re-fires). Best effort; the database is the durable record.
7. Enrichment: deterministic channel classification (`channels.ts`), UTM cleaning
   (150-char clamp, values containing "@" or "://" dropped), country from the
   `x-vercel-ip-country` edge header, coarse UA families, screen bucket, and the daily
   visitor HMAC (section 3).
8. Rejections increment per-day counters in `web_analytics_ingest_stats`
   (`bot_rejected`, `invalid_payload`, `internal_rejected`, `unsupported_hostname`).
   Counts only; no request data is kept.

### Storage and aggregation (migration 0070)

- `web_analytics_events` holds the rows; RLS enabled with intentionally no policies
  (service-role only, the 0067-0069 pattern).
- `wa_visits(from, to)` is THE sessionization primitive: a visit is a sequence of
  events from one daily visitor hash with no inactivity gap longer than 30 minutes.
  A visit is attributed to its first pageview (landing page, channel, UTM, referrer,
  geo, device). Because the hash rotates at midnight UTC, a visit never spans
  midnight (documented approximation).
- `wa_kpis`, `wa_timeseries`, `wa_breakdown`, `wa_campaigns`, `wa_organic_landing`
  all build on `wa_visits`. All are SECURITY DEFINER with pinned search_path, EXECUTE
  revoked from public/anon/authenticated and granted to service_role only.
- Pages read exclusively through `src/lib/public-analytics/queries.ts` (server-only,
  service client, behind `requireAdmin()`); no page queries Supabase directly.

### Channel classification (`src/lib/public-analytics/channels.ts`)

One pure, unit-tested module; nothing else may re-derive channels. Precedence:

1. Explicit UTM parameters win (medium decides email/paid; paid mediums split into
   paid_search vs paid_social by source; social mediums and sources map to
   organic_social; unrecognized labeled traffic falls to `other`).
2. Known search-engine referrers -> `organic_search`.
3. Known social-network referrers -> `organic_social`.
4. Any other external referrer -> `referral`.
5. No signal at all -> `direct`.

The same classifier runs in the ingestion route and in the server-side recorder, so
client and server events land in identical channel buckets.

### Server-emitted conversions (`recordPublicServerEvent`)

Conversions whose truth lives in a server action or route are recorded server-side
(`src/lib/public-analytics/record-server.ts`). The recorder computes the same daily
visitor hash from the request headers as the ingestion route, so server-emitted
conversions join the visitor's client-side visit. It is fire-and-forget, never throws,
and applies the same bot/internal/hostname/registry gates. Current emission points:

- `artist_signup_started` (method email): `signUpAction` in `app/(auth)/signup/actions.ts`.
- `artist_signup_completed` (method email): `signUpAction` success (awaited so the
  once-per-account conversion cannot be lost to serverless teardown).
- `artist_signup_completed` (method google): `app/auth/callback/route.ts` for OAuth
  accounts created within the last two minutes (returning logins pass through the same
  callback and are not counted).
- `beta_invite_requested`: `joinMobileWaitlistAction` in `app/download/actions.ts`.
- `booking_request_completed`: the booking submit action in `app/[slug]/actions.ts`
  (carries no booking content, no customer data, only the page path).

## 3. Privacy

### What one event row stores

Timestamps (occurred/received), event name, hostname, pathname, landing path,
referrer domain (host only, never a path or query), channel, the five UTM labels
(clamped, content-filtered), ISO-3166 country code from the edge header, device type
(desktop/mobile/tablet), browser family, OS family, screen-width bucket, the daily
visitor hash, a conversion flag, and allowlisted coarse properties (today only
`method: email|google`).

### What is never stored

No raw IP addresses (transient HMAC input only, never logged), no full user agents
(reduced to coarse families), no full referrer URLs, no form content or free text of
any kind, no emails or names or handles, no persistent identifiers, no cookies, no
fingerprints. The registry (`event-registry.ts`) rejects any property that is not an
allowlisted key with an allowlisted value.

### The daily visitor hash

`visitorDayHash` in `enrich.ts`: HMAC-SHA256 over
`date | hostname | ip | browser:os:device`, keyed by `WA_VISITOR_HASH_SECRET`,
truncated to 32 base64url chars. The identifier rotates every UTC day, the raw IP is
an input only and is unrecoverable from the output, and rotating the secret simply
starts a new hash universe (safe at any time; visitor counts split on the rotation
day). This yields approximate daily visitors, not persistent people: the same person
on two days, two networks, or two devices counts as different visitors.

### Consent posture

- Cookie-free by construction; the published cookie-banner claim ("strictly necessary
  session cookies for artist login, no tracking cookies") stays exactly true.
  Session context is sessionStorage only and dies with the tab.
- Global Privacy Control is not currently implemented app-wide; if it is adopted, the
  collector's `enabled()` gate is the single place to honour it.
- Internal traffic exclusion: the `inklee_internal` marker keeps founder/admin
  browsing out of the numbers. The admin exclusion control writes it in three
  places so both client-sent events and server-recorded conversions honour it:
  a `localStorage` item (the client collector self-suppresses), a mirrored
  first-party `inklee_internal` cookie (read server-side by the ingestion route
  and `recordPublicServerEvent`), and it is also honoured from the
  `x-inklee-internal` header and the `WA_EXCLUDE_IPS` env list. This cookie is
  the one intentional cookie in the layer: it is set only when an admin
  explicitly excludes their own browser, exists only to STOP measurement, and
  carries no identifier. Public visitors never receive it.
- Retention: `web_analytics_events` rows older than 24 months are purged by the
  monthly retention cron (`/api/cron/retention-purge`, schedule `0 5 1 * *`),
  matching the audit-log convention. GSC rows are aggregate search statistics with no
  personal data and are kept indefinitely.
- Transition note: Plausible keeps running in parallel until this layer's numbers are
  confirmed to match it in shape (not necessarily exactly; different bot filters and
  session definitions), then the Plausible script gets removed.

## 4. Event registry

Mirror of `src/lib/public-analytics/event-registry.ts`. This is the ONLY set of event
names the ingestion route accepts.

| Event | Category | Conversion | Props | Emitter / status |
|---|---|---|---|---|
| `pageview` | acquisition | no | none | PublicAnalytics component (`src/components/public-analytics.tsx`) |
| `pricing_viewed` | acquisition | no | none | RESERVED: no /pricing page exists on master yet; wire when one ships |
| `artist_signup_started` | registration | no | `method: email\|google` | `signUpAction` (`app/(auth)/signup/actions.ts`) and the Google OAuth start |
| `artist_signup_completed` | registration | yes | `method: email\|google` | `signUpAction` success + `app/auth/callback/route.ts` for new OAuth accounts |
| `beta_invite_requested` | registration | yes | none | `joinMobileWaitlistAction` (`app/download/actions.ts`) |
| `app_store_clicked` | acquisition | no | none | RESERVED: /download badges are placeholder links until the app is in stores |
| `play_store_clicked` | acquisition | no | none | RESERVED: /download badges are placeholder links until the app is in stores |
| `booking_page_viewed` | booking | no | none | PublicAnalytics component (booking-page routes; also derivable from pageviews) |
| `booking_request_started` | booking | no | none | Booking form client (`app/[slug]`) |
| `booking_request_completed` | booking | yes | none | Server-side in the booking submit action (`app/[slug]/actions.ts`) |

Adding an event: add it to `PUBLIC_EVENTS` (name must match `^[a-z][a-z0-9_]{2,63}$`;
properties must be coarse enumerable labels, never free text), emit it via
`trackPublicEvent` (client) or `recordPublicServerEvent` (server), and update this
table. No migration is needed; the registry is the validation layer.

## 5. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `WA_VISITOR_HASH_SECRET` | Yes, for collection | HMAC key for the daily visitor hash. Generate 32+ random characters. Without it, collection silently no-ops (nothing is stored). |
| `WA_EXCLUDE_IPS` | No | Comma-separated IPs or /8 /16 /24 CIDR prefixes to exclude (office, founder home). Matched transiently, never stored. |
| `GOOGLE_SEARCH_CONSOLE_CLIENT_ID` | For GSC | OAuth 2.0 web client id from Google Cloud. |
| `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET` | For GSC | The matching client secret. |
| `GOOGLE_SEARCH_CONSOLE_REDIRECT_URI` | No | Defaults to `https://inklee.app/api/admin/gsc/callback`. |
| `GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET` | For GSC | Key material for AES-256-GCM encryption of the refresh token at rest. 16+ chars minimum, 32+ recommended. |

Canonical copies live in Vercel Production; mirror each secret into the Control Tower
vault per the founder rule.

## 6. Google Cloud + Search Console setup

1. Create a Google Cloud project (or reuse an existing Inklee project) at
   console.cloud.google.com.
2. APIs & Services > Library: enable the "Google Search Console API".
3. APIs & Services > OAuth consent screen: configure it (internal if the Google
   account is on a Workspace org, otherwise external), and add the scope
   `https://www.googleapis.com/auth/webmasters.readonly`. Only the connecting Google
   account needs access; add it as a test user if the app stays in testing mode.
4. APIs & Services > Credentials: create an OAuth 2.0 client of type Web application.
   Set the authorized redirect URI to exactly
   `https://inklee.app/api/admin/gsc/callback`.
5. Put the four `GOOGLE_SEARCH_CONSOLE_*` env vars into Vercel Production (and the
   vault), then redeploy.
6. In the cockpit: Search tab > Connect Google Search Console. The flow is
   admin-only with a CSRF state cookie; Google returns to `/api/admin/gsc/callback`,
   which exchanges the code server-side and stores the refresh token AES-256-GCM
   encrypted. Tokens never reach the browser.
7. Pick the `sc-domain:inklee.app` property (auto-selected when it is the only
   accessible property).
8. Optionally start a backfill: 90 days, or all available history (~16 months, which
   is all Search Console keeps). Backfills are resumable rows in `gsc_backfills`; the
   daily cron advances one bounded batch (14 dates) per run, and "Sync now" can be
   pressed repeatedly to advance faster.
9. From then on the sync runs daily at 06:00 UTC (`vercel.json` cron
   `/api/cron/gsc-sync`, `CRON_SECRET`-gated). Each run refreshes the access token,
   re-fetches a rolling 10-day window of finalized source dates (late-final data
   self-corrects), and advances any running backfill. Writes are idempotent
   primary-key upserts; a lock on the connection prevents overlapping runs, and a
   failed dimension request for one date never removes previously synced data.

Reconnecting: the flow uses `prompt=consent` so a refresh token is always returned.
If Google still withholds one, remove the app's access at
myaccount.google.com/permissions and reconnect. Disconnecting retires the stored
token; synced data is kept.

## 7. Data caveats

- First-party visits and Google clicks are different measurements. Never merge or
  substitute them. GSC data is always labeled "Search Console (delayed, source
  dates)" in the cockpit.
- GSC omits low-volume queries for privacy, so the query breakdown sums to less than
  the totals row. This is Google's behaviour, not a sync bug.
- Breakdown vs totals mismatch is general: dimension rows (query/page/country/device)
  are each independently filtered and do not sum to the daily totals.
- Source dates: GSC days are Google's reporting days, stored as plain dates and never
  converted through timezones. First-party ranges use the cockpit's reporting
  timezone. The two windows are computed separately (`gscWindowFor`) and the GSC
  window is clamped to the latest synced source date.
- Finalization lag: Google finalizes data about 3 days behind today; the sync only
  requests finalized data (`dataState: final`) and the rolling window self-corrects.
- Canonical URL vs landing URL: GSC reports the canonical URL of a page; first-party
  landing paths are the URLs actually visited. The combined organic view joins them
  via `gscPageToPath` (path extraction), which is an approximation when canonicals
  differ from visited URLs.
- Daily visitor hashes mean visitors are approximate and per-day; week/month visitor
  counts are sums of daily visitors, not deduplicated people, and a visit never spans
  midnight UTC.
- Rates render "–" (en dash placeholder) when the denominator is 0, and comparison
  deltas are hidden when the previous value is 0 or missing. Nothing fakes a 0%.

## 8. Dashboards map

| Question | Page |
|---|---|
| How much public traffic, from which channels, landing where, converting how | `/admin/growth/acquisition` (KPIs, trend, channel/landing/referrer/country/device breakdowns, UTM campaign table) |
| Which accounts did that traffic become (first-touch attribution per account) | `/admin/growth/acquisition/attribution` |
| How does Google search treat us (clicks, impressions, CTR, position, queries, pages) | `/admin/growth/search` |
| Which pages earn organic visits AND how they perform in Google | the combined organic landing-pages section on `/admin/growth/search` |
| Is the collector alive; what is being rejected | the diagnostics section on `/admin/growth/acquisition` (`getWaDiagnostics`: last event time, events today, per-day rejection counters, secret configured) |
| Is the GSC sync healthy; how far along is the backfill | the connection card on `/admin/growth/search` (last successful/failed sync, last error, latest source date, backfill progress) |

CSV exports are admin-gated route handlers colocated with their pages (the pattern is
`/admin/growth/users/export`); acquisition and search table exports live next to
those pages. Raw diagnostics tables: `web_analytics_ingest_stats` (rejection
counters) and `gsc_backfills` (backfill progress), both service-role only.
