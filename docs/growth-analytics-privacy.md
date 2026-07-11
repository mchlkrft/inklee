# Growth cockpit: privacy posture

- Date: 2026-07-11
- Scope: the first-party analytics layer shipped with the admin Growth cockpit
  (migration `0067_growth_cockpit.sql`, the `src/lib/growth/*` write modules, the
  `/admin/growth` read surface, and the retention cron).
- Status: describes the shipped state. Two items are open proposals that need founder
  sign-off (section 3); everything else is implemented.
- Companion: section 7 ("Privacy constraints and risks") of
  `docs/admin-growth-cockpit-audit.md` is the pre-implementation analysis this posture
  implements; see section 9 below for the mapping.

## 1. What the cockpit stores

All new storage is per-artist (the authenticated business user) or aggregate. Nothing new
is stored about booking clients or public visitors.

| Store | Contents | Where written |
|---|---|---|
| `analytics_events` | Event name (four catalogued events: `onboarding_step_completed`, `onboarding_completed`, `page_published`, `booking_link_copied`), artist id, source (`web`/`mobile`), and coarse enumerated labels only (onboarding step name, copy surface). Zod `.strict()` schemas in `src/lib/growth/event-catalogue.ts` reject any other property. | Single server-side writer `src/lib/growth/record-event.ts`; rejects uncatalogued events and excludes tester and admin accounts at write time. |
| `artist_activity_days` | One row per (artist, day, surface): the fact that an artist was seen on the web app or mobile app on a given day. No pages, no actions, no timestamps beyond the first touch of the day. | Fire-and-forget from the authed artist layout (web) and the mobile bearer auth (`src/lib/growth/activity.ts`). Records presence for every authenticated account, including testers and admins; tester/admin exclusion happens at read time via the excluded-ids list. |
| `profiles.signup_attribution` | First-touch marketing labels written exactly once at the first slug claim: entry path, referrer origin (never the full URL), utm source/medium/campaign/content/term, platform, captured_at. Keys allowlisted, values length-clamped to 200 chars AND content-filtered: values containing "@" or "://" are dropped, so an email address in utm_source or a full URL never enters storage (`sanitizeAttributionValue` in `src/lib/analytics-gates.ts`, mirrored client-side in `src/lib/track.ts`). Mobile signups store platform and captured_at only. NULL for every account that predates the instrumentation. | `claim-slug/actions.ts` (web) and `/api/mobile/onboarding/profile` (mobile). |
| `growth_daily_snapshots` | Aggregate daily counts only (jsonb), never per-artist rows, never PII. | The daily growth-snapshot cron. |
| `growth_settings` | Cockpit configuration (thresholds, reporting timezone). No personal data. | Admin settings page. |

The `analytics_events` table also has unused `anonymous_id` and `session_id` columns
reserved for future pre-signup linkage; nothing writes them today, and the migration
header pins that they may never be a fingerprint (a random first-party id at most).

## 2. What it deliberately never stores

Per the catalogue contract (`event-catalogue.ts`), the migration 0067 header, and the
audit's "refuse" list:

- No IP addresses and no user agents in any analytics table. (IP and device metadata
  remain disclosed in the privacy policy solely for security and abuse prevention.)
- No client or customer identifiers: no emails, names, or Instagram handles.
- No booking content and no free text of any kind. Cockpit booking metrics are
  aggregate-only (counts, rates, amounts grouped by currency), which keeps them inside
  the DPA processor boundary: for Client Booking Request Data, Inklee acts "only on
  documented instructions from the Artist" (`apps/web/content/legal/dpa.md`).
- No session replay, no keystroke or scroll capture, no page-view tracking of public
  visitors beyond the existing aggregate Plausible setup.
- No new cookies (section 6).
- No third-party product-analytics platform and no marketing pixels.
- Cockpit reads never select the `profiles.settings` blob (it carries secrets such as
  `ical_token` and MFA recovery codes); the `growth_artist_stats` view extracts
  analytics-safe keys only, and no query selects `customer_token_hash`,
  `deposit_client_secret`, or token-rotation hashes.

## 3. Lawful basis and the open disclosure item

Framing: this is first-party product analytics about authenticated business users
(artists) performed by Inklee as controller, on the legitimate-interests basis
(Art. 6(1)(f) GDPR), consistent with the existing analytics and security rows in the
policy. The privacy policy already claims controller responsibility for "website
analytics, error and security logs, support communications, and any data we need to run
and protect the platform" (`apps/web/content/legal/privacy.md`, section 2).

**Open item.** The policy's specific analytics disclosure (section 3.3) currently reads
only: "Aggregated, cookie-free analytics (e.g. Plausible)", and the subprocessor list
promises Plausible receives "Aggregated, non-identifying traffic metadata". Per-account
first-party events and persisted signup attribution are not aggregated, so they are not
yet explicitly disclosed. Until the policy is updated, the data is treated as
internal-operations data under the platform-operation clause quoted above, and the
disclosure ships as the following proposals.

### Proposal A: privacy policy rows (PROPOSAL, founder sign-off required)

Legal copy is founder-gated. These rows are ready to paste but must not ship until the
founder approves them, and they should be live before or at public launch.

Add to the section 3.1 table (artist account data):

```
| Product usage analytics (event name such as "onboarding completed", your account ID, coarse labels such as the onboarding step, the day you used the web or mobile app, and the page, referring site, and campaign that first brought you to Inklee) | Understand how artists adopt and use Inklee, improve onboarding and features | Legitimate interests (Art. 6(1)(f)) |
```

Add to the section 4 retention table:

```
| Product usage analytics | 24 months; deleted immediately when you delete your account. |
```

### Proposal B: cookie policy line (PROPOSAL, founder sign-off required)

The cookie policy's scope sentence already covers "cookies and similar storage
technologies" (`apps/web/content/legal/cookies.md`), so the localStorage attribution
entry belongs in its section 1 table:

```
| Similar storage (localStorage) | inklee_attribution | Remembers the page, referring site, and campaign that first brought this browser to Inklee, so a later signup can be attributed. Stays in your browser; sent to us once if you sign up. Not a cookie, not readable by other sites. | No (first-party measurement; subject to legal review) |
```

The "No" consent answer follows the existing table's treatment of first-party
operational storage but is itself part of the proposal: whether ePrivacy consent is
needed for a non-essential localStorage entry is a counsel question, flagged for the
DPIA (section 7).

## 4. Deletion behaviour

- `analytics_events.artist_id` and `artist_activity_days.artist_id` both reference
  `profiles(id) ON DELETE CASCADE` (migration 0067), so account deletion removes every
  event and presence row in the same delete as the profile. No code path needs to
  remember them.
- `profiles.signup_attribution` is a column on the profiles row and is deleted with it.
- `growth_daily_snapshots` intentionally survives deletion: it holds only aggregate
  daily counts, never per-artist rows, so there is nothing to erase (deletion-safe by
  design, stated in the migration).
- The activity-touch writer treats a foreign-key failure (profile already deleted) as
  silently fine, so a racing touch cannot resurrect data for a deleted account.

## 5. Retention

`/api/cron/retention-purge` (monthly, vercel.json schedule `0 5 1 * *`) purges
`analytics_events` older than 24 months (by `occurred_at`) and `artist_activity_days`
older than 24 months (by `day`), matching the 24-month convention counsel set for
security audit logs and the moderation log. The FK cascade covers deleted accounts; the
purge bounds retention for accounts that stay. Snapshots and settings hold no personal
data and have no purge.

## 6. Cookie-free position preserved

The published commitments stay exactly true:

- Cookie banner: "Inklee uses strictly necessary session cookies for artist login. No
  tracking cookies." (`apps/web/src/components/cookie-banner.tsx`). Unchanged; still
  accurate.
- Attribution never touches cookies: it is captured into localStorage
  (`inklee_attribution`, `src/lib/track.ts`), travels as validated hidden form fields on
  the claim-slug step, and is persisted server-side once. Browsers that block storage
  simply produce no attribution.
- The activity-day debounce is an in-process server-side map (`activity.ts`), not a
  cookie. (The audit anticipated a debounce cookie; the shipped implementation needs
  none, so no functional-cookie disclosure is required.)
- Plausible remains the only visitor-side analytics, cookie-free and aggregate.

## 7. Pre-existing gaps flagged, not widened

- **Email tables retain recipient emails past account deletion.** `email_events` and
  `email_sends` keep `recipient_email` (their artist_id is SET NULL on delete) and
  `email_suppressions` is keyed by raw email; no deletion path or purge cron touches
  them today. The cockpit does not widen this gap: it reads aggregates only, per the
  0064 header contract that raw rows never leave the database. A scrub-on-deletion plus
  a retention window should be scheduled as its own fix.
- **DPIA.** The still-open DPIA (launch gate item LO-5) should fold in the new
  first-party analytics: the events, the presence table, the persisted attribution, and
  the ePrivacy question from proposal B.

## 8. Admin-only access chain

Defence in depth, from the database outward:

1. All four new tables have RLS enabled with intentionally no policies: invisible to
   anon and authenticated PostgREST clients, service-role only (the 0063-0065 pattern).
2. The new views and RPC functions explicitly REVOKE anon/authenticated and grant
   service_role only (the 0060 lesson; views run definer-rights to read auth.users).
3. Reads happen exclusively in the server-only data layer
   (`apps/web/src/lib/growth-queries.ts`) via the service client; no page queries
   Supabase directly.
4. Every `/admin/growth` page calls `requireAdmin()` first, and the admin layout calls
   it again as a backstop. `requireAdmin` allowlists by `ADMIN_EMAILS` and enforces the
   MFA step-up fail-closed (`apps/web/src/lib/admin-guard.ts`).
5. The admin layout sets robots noindex/nofollow on the whole surface.

Writes run server-side only (`import "server-only"`) through the service client. The
single event writer excludes tester and admin accounts at write time, so internal usage
never enters `analytics_events`. The activity toucher, by contrast, records presence for
every authenticated account, including testers and admins; those rows are excluded at
read time via the excluded-ids list that every growth query passes into SQL.

## 9. Cross-reference: the cockpit audit's privacy section

Section 7 of `docs/admin-growth-cockpit-audit.md` ("Privacy constraints and risks") is
the pre-implementation analysis behind this document. Mapping:

- "Published wording is exact and load-bearing" -> sections 3 and 6 here (quotes
  preserved, position unchanged).
- "A privacy-policy row is needed" -> section 3 proposals A and B (founder-gated, as
  the audit required).
- "DPA processor boundary on client booking data" -> section 2 (aggregate-only booking
  metrics).
- "`profiles.settings` contains secrets" -> section 2 (analytics-safe key extraction).
- "Email tables retain PII past account deletion" -> section 7 (flagged, not widened).
- "Deletion behavior for the new tables: FK CASCADE" -> section 4.
- "Exclusion invariants carry over" -> sections 1 and 8 (write-time tester/admin
  exclusion for events; read-time exclusion for presence rows).

One deliberate divergence from the audit: the web activity touch shipped with an
in-memory debounce instead of the anticipated debounce cookie, so the
"strictly-necessary functional cookie" disclosure the audit mentioned is not needed
(section 6).

## 10. Public web analytics (anonymous visitors)

Added 2026-07-11 with migration `0070_public_web_analytics.sql`, the
`src/lib/public-analytics/*` modules, the `/api/wa/collect` ingestion route, and the
Google Search Console sync. This extends the posture above to the one place the cockpit
now measures public visitors. Everything here is first-party and anonymous by
construction; the metric semantics live in `docs/metric-definitions.md` ("Public web
analytics").

### What a `web_analytics_events` row contains

One row per registry-validated event (a pageview or one of the catalogued public events
in `src/lib/public-analytics/event-registry.ts`; anything else is rejected at
ingestion):

- Timestamps: `occurred_at` (client clock within a bounded tolerance, else server time)
  and `received_at`.
- Event name, hostname, and normalized pathname (query strings and fragments stripped;
  only public paths: the collector never tracks authenticated product prefixes or the
  tokened customer portal).
- Acquisition context: landing path, referrer domain (domain only, never a full URL),
  the derived channel, and clamped, content-filtered utm labels (values containing "@"
  or "://" are dropped, the same hygiene as signup attribution).
- Coarse environment: two-letter country code from the edge header, device type,
  browser family, OS family, and a screen-width bucket.
- The daily visitor hash (next subsection), a conversion flag, and allowlisted coarse
  properties (for example signup method "email" or "google"; free text is impossible by
  schema).

Deliberately never stored: raw IP addresses, raw user agents, full referrer URLs, page
titles or DOM text, form content, emails or handles, account ids, and any persistent
identifier.

### The daily visitor hash

`visitor_day_hash` is an HMAC-SHA256 over (UTC date + hostname + request IP + coarse
browser/OS/device signal), keyed by a server-only secret and truncated
(`visitorDayHash` in `src/lib/public-analytics/enrich.ts`).

- The raw IP exists transiently inside the ingestion route (and the server-side
  conversion recorder, `record-server.ts`) as an HMAC input and for the optional
  exclusion check. It is never stored and never logged; the enrichment module pins this
  invariant in code and comments.
- The key is `WA_VISITOR_HASH_SECRET`, a server-only environment secret. Without it
  nothing is collected, and the hash cannot be reversed to an IP.
- The date input rotates the identifier every UTC day, so no cross-day identity exists
  anywhere in storage. "Visitor" is an approximate daily measure, not a person.

### No cookies

The collector sets no cookies. sessionStorage (`inklee_wa_session`) carries same-session
acquisition context only (landing path, referrer domain, utm labels) and dies with the
tab. The pre-existing localStorage first-touch attribution entry (`inklee_attribution`,
section 6) is unchanged by this layer; no new localStorage is added.

### Consent posture

Stated as design facts, with no legal conclusions attached: no cookies, no persistent
identifiers, no cross-day identity, no personal data in storage, and the IP used
transiently server-side only. The cookie banner's published statement (strictly
necessary session cookies for artist login, no tracking cookies) stays exactly true, and
the privacy policy already discloses cookie-free analytics ("Aggregated, cookie-free
analytics", section 3.3). The founder-gated policy-row proposal in section 3 now covers
Inklee's first-party analytics generally rather than the artist event layer alone; the
anonymous visitor layer described here stores no personal identifiers, so its disclosure
burden is lighter than the per-account artist events that proposal was written for.
Whether any of this needs consent is a counsel question already flagged for the DPIA
(section 7); this document claims only the design facts above.

### Search Console data

- `gsc_daily_totals` and `gsc_daily_dimensions` hold aggregate search statistics
  computed by Google: clicks, impressions, CTR, and average position per day, query,
  page, country, and device. This is aggregate data about search results for Inklee's
  own property, not data about identifiable visitors; no personal data enters these
  tables.
- The OAuth refresh token is stored AES-256-GCM encrypted
  (`gsc_connections.encrypted_refresh_token`, key
  `GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET`). It is decrypted server-side only and
  never leaves the server or reaches any client.

### Retention

- `web_analytics_events` rows older than 24 months are purged by the monthly retention
  cron (`/api/cron/retention-purge`, by `occurred_at`), the same 24-month convention as
  the audit log and the artist analytics tables (section 5). The rows are anonymous by
  construction; the purge bounds storage anyway.
- Search Console aggregates are kept indefinitely: they contain no personal data and
  long history is their value.
- `web_analytics_ingest_stats` holds per-day rejection counters only (counts, never
  request data) and needs no purge.

### Internal and non-production exclusion

Four mechanisms keep internal usage out of the data:

1. The client self-suppresses when the `inklee_internal` localStorage marker is set
   (the same marker the Plausible events respect).
2. The ingestion route rejects any request carrying the `x-inklee-internal: 1` header,
   the server-side backstop; the rejection is counted, nothing about the request is
   stored.
3. `WA_EXCLUDE_IPS` (comma-separated IPs or /8, /16, /24 prefixes) is matched
   transiently against the request IP; matching requests are rejected and the address is
   never stored.
4. Non-production environments never collect: the client is disabled outside production
   builds, and the ingestion route and the server-side recorder both refuse when
   `VERCEL_ENV` is not production or the hash secret is missing.

### Access

Same chain as section 8: the 0070 tables are RLS-enabled with intentionally no policies
(service-role only), the SQL functions revoke EXECUTE from anon and authenticated, reads
happen exclusively in the server-only query layer
(`src/lib/public-analytics/queries.ts`) behind `requireAdmin()`, and writes happen only
in the server-side ingestion route and conversion recorder via the service client.
