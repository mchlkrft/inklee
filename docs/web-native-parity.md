# Web / native parity register

**Purpose:** the single tracked view of what the native app (apps/mobile) covers
versus the web app, so parity never needs a fresh audit. **Founder rule
(2026-07-26): update this file with EVERY change that affects the native app or
adds a web feature the app might need** — new screens, new/changed
`/api/mobile/*` routes, entitlement/capability wiring, and deliberate
web-only/native-only decisions. The AGENTS.md "Native app changes" section
points here; treat an out-of-date row as a bug.

Baseline: the 4-reader parity audit of 2026-07-26 (mobile app structure, mobile
API surface, web billing functions, web map surface) + the native parity slice
shipped the same day. Conventions: ✅ = at parity (native has it), 🌐 = web-only
BY DECISION (not a gap), 📱 = native-only, ⬜ = tracked gap (native lacks it,
no decision against it), ~ = partial.

## Ground rules that shape parity

- **D17 / IAP:** NO in-app purchase, subscription checkout, upgrade CTA, price
  display, or Stripe customer portal in the app (Apple/Google steering rules).
  Post-purchase STATUTORY management (Art. 11a withdrawal, ordinary
  cancellation) is legal-function management, not purchasing, and ships native.
- **One source of truth:** native never reimplements logic; every mobile route
  wraps the same server core / RPC / shaper the web uses, and copy that counsel
  approved is reused verbatim.
- **Wire policy:** `packages/shared/src/mobile-api.ts` responses are ADDITIVE
  only (no OTA; installed builds keep compiled types).
- **Statutory routes are deliberately ungated:** the mobile billing-management
  routes (`/billing/subscription|withdraw|cancel`) sit behind auth only — no
  `PLUS_CONSUMER_LAUNCH_ENABLED` check, no capability. Statutory rights of an
  existing subscriber must stay reachable even if the purchase surface is dark
  or rolled back; while the launch flag is off no subscriber exists, so
  nothing leaks. Decision recorded 2026-07-26 — do not re-litigate in audits.
- **No OTA:** native changes reach devices only via a new EAS build; rows below
  marked "(next build)" are on master but not on devices yet.

## Billing / account / subscription

| Feature | Web | Native | Status |
|---|---|---|---|
| Plan display (tier, Active state) | /settings/plan | settings/plan (via /me) | ✅ |
| Plus benefits list (shared PLUS_BENEFITS) | ✅ | ✅ incl. the grandfathered keeps-templates filter (next build) | ✅ |
| Grandfather (legacy_free_v1) notes | ✅ | ✅ | ✅ |
| Price display (3 EUR/mo etc.) | ✅ | — | 🌐 IAP steering risk; app shows no prices |
| Upgrade / consumer checkout | ✅ (web-only per D17) | — | 🌐 by decision |
| Stripe customer portal | ✅ | — | 🌐 external purchase management |
| Subscription state (renews/ends on, cancel scheduled) | ✅ | ✅ GET /api/mobile/billing/subscription (next build) | ✅ |
| Withdrawal, Art. 11a (+ concrete deadline display) | ✅ plan page | ✅ settings/plan + POST /billing/withdraw, counsel copy verbatim (next build) | ✅ |
| Ordinary cancellation, § 312k | ✅ settings/account (next to delete) | ✅ settings/plan Subscription card + POST /billing/cancel (next build) | ✅ |
| Account deletion (+ re-auth) | ✅ | ✅ shared deleteOwnAccountCore | ✅ |
| Deposit card-vs-manual predictor | getDepositCollection | SAME server predictor via /settings/payouts (D19 fixed in 8c07894) | ✅ |
| Entitlement caps on create paths (fields/trips/studios/legs) | ✅ | ✅ capState on all 4 mobile routes | ✅ |
| Payouts / Connect onboarding + ID document | ✅ | ✅ (connect-link via in-app browser) | ✅ |
| Data export | ✅ /settings/export | — | ⬜ (low priority; web download) |

## Tattoo map (discovery)

| Feature | Web | Native | Status |
|---|---|---|---|
| Discovery map (pins, categories, signal rings, city badges) | immersive shell | travel/discover on the SAME shared core (style/types/filters) (next build) | ✅ |
| Viewport pins (grid-sampled, capped) | /api/map/locations | /api/mobile/map/locations (same RPCs) | ✅ |
| Search (pg_trgm RPC, 8 results) | ✅ | ✅ /api/mobile/map/search | ✅ |
| Artists-in-town city badges + city panel | ✅ | ✅ /api/mobile/map/artists (named artists open the web profile) | ✅ |
| Filters (all/categories/watched/signals) | ✅ | ✅ (filter sheet) | ✅ |
| Watch toggle + watched list | toggleWatchAction | shared toggleWatchCore via /watch + /watched | ✅ |
| Studio detail (styles, timeline, house rules, links, watched) | detail panel + /map/[id] | MapDetailSheet on the same read-model | ✅ |
| Guest-spot request from a pin | /map/[id]/request | travel/discover-request via the same submit core + shared validation | ✅ |
| List view of in-view pins | ✅ | ⬜ (map-first v1; the search + filter sheet cover discovery) | ⬜ |
| Report a correction (submitMapCorrection) | ✅ | ⬜ tracked gap | ⬜ |
| Claim a studio | ✅ /studio/claim | 🌐 (web flow; app links out later) | 🌐 |
| Journey overlay ("My trips" on the discovery map) | ✅ | 📱 has a dedicated travel map screen instead (travel/map) | ~ by design |
| Dark/light basemap | shell toggle | follows the app theme | ✅ |
| Kill switch | NEXT_PUBLIC_TATTOO_MAP (web launch flag) | `tattoo_map` capability (client hides + server refuses) | ✅ |
| Public (logged-out) map | unbuilt. Q20 licensing CLOSED 2026-07-26 (attribution only, OSM restored to the credit); remaining gates are engineering: credit component, `/data-attribution` page, GDPR Art. 14/21 surface, provenance on `map_locations` | n/a (app is artists-only) | 🌐 |
| Marketing narrative for the map (homepage section, `/guest-spot-booking` section, FAQ items) | ✅ 2026-07-26, gated on `tattooMapEnabled()` | 🌐 (the app has no marketing pages; the store listings are a separate surface) | 🌐 |
| Public-map entry points (pill nav `Map`, footer `Tattoo map`, "Open the tattoo map" CTAs) | built but DARK behind `NEXT_PUBLIC_PUBLIC_MAP` (`publicMapEnabled()` = platform gate AND public gate) | n/a | 🌐 |

## Other established surfaces (from the 2026-07-26 audit, unchanged)

Bookings (list/detail/approve/reject/cancel/deposits), calendar + appointments,
clients, flash (CRUD + Instagram), goods, waitlist, notifications + push,
support tickets, settings (profile/books/booking-form/deposits/policy/emails/
templates/hub/calendar-export/reminders/payouts/dashboard), onboarding, account
security: ✅ at parity via the 93-route /api/mobile surface. Web-only by
design: admin, marketing pages, legal pages, public artist pages, client
magic-link portal (D: app is artists-only).

## Update log

- **2026-07-26 — Native parity slice:** native tattoo map (travel/discover +
  detail sheet + guest-spot request form), 7 new /api/mobile/map/* routes +
  shared toggleWatchCore extraction + MapLocationDetail types promoted to
  packages/shared; billing management (GET /billing/subscription, POST
  /billing/withdraw, POST /billing/cancel + the settings/plan Subscription
  card); `tattoo_map` capability registered; keeps-templates benefits filter on
  mobile. All "(next build)" until the next EAS build ships.
- **2026-07-26 — Adversarial review fixes (same slice, pre-ship):** withdrawal
  stays available after a scheduled cancellation (statutory right survives
  § 312k scheduling, matching web); viewport bounds normalized via shared
  `normalizeViewportBounds` (web canvas rewired to it too); § 312k step-1
  explainer + detail-sheet banners now verbatim web copy; `tattoo_map` also
  hides the nav entry and stops queries when paused; watch failures surfaced;
  Sentry capture on the billing catches (mobile routes + web actions);
  ungated-statutory ground rule recorded above.
