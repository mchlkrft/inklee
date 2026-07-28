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
| Map attribution surface (basemap credits + `STUDIO_DATA_CREDIT` + `/data-attribution` link) | one collapsed `Info` pill at every width, collapsed by default (founder direction 2026-07-27, counsel-approved); full notices render uncollapsed on `/map/[id]`, `/studios/[slug]`, `/data-attribution` | ✅ `MapAttribution` on BOTH map screens (travel/discover top control row, travel/map top-left): same collapsed `Info` affordance, opening an `AdaptiveSheet` with the credits in full and a button to the web `/data-attribution` (next build) | ✅ |
| Claimed studio entity page `/studios/{slug}` (public, gate-indexable) | built 2026-07-27, DARK behind `publicMapEnabled()` (go-live plan S2b, founder D1) | 🌐 web-only BY DECISION: it is a public SEO/entity surface for visitors, and the app is artists-only. The app links a claimed studio to its web page only when the public surface is live | 🌐 |
| `studioSlug` on the shared map-detail payload | ✅ served by `/api/map/locations/[id]` | ✅ additively present on `/api/mobile/map/locations/[id]` (same shared type); native does not render it yet, and it is null while the public map is dark | ~ by design |

**Note on the attribution gap (found and CLOSED 2026-07-27).** The native maps
rendered the same basemap tiles and the same seeded studio rows as web with no
attribution of any kind. The ODbL / CDLA-Permissive-2.0 / Apache-2.0
obligations attach to the Produced Work rather than to whether its audience is
public, so an artists-only app did not escape them. Fixed by `MapAttribution`
on both map screens, drawing every string from
`@inklee/shared/map-attribution` (never restated, so the counsel-approved
wording cannot drift from web) and linking out to the web page via
`config.dataAttributionUrl()`. Placement differs from web by necessity, not
preference: both native screens anchor every bottom overlay (in-view count,
city panel, pin preview) to a single baseline that grows upward, so a
bottom-corner control would disappear the moment a pin is tapped. It rides the
top control row instead, which is also where the platform maps put theirs.
**Reaches devices with the next EAS build.**

## Plus entitlement gates (added 2026-07-28; rows were missing, which is a bug per the founder rule)

| Feature | Web | Native | Status |
|---|---|---|---|
| Branding removal gate (`branding`) | server-rendered on all public pages, fail-safe | n/a by design (public pages are web-only surfaces; the app has no public renderer) | 🌐 |
| Custom-template edit gate (`custom_templates`) | save action refuses pre-upsert | mobile route 403s `not_entitled` pre-upsert; the app maps the code to IAP-safe copy via `plan-errors.ts` (next build) | ✅ |
| Entitlement caps (fields/trips/studios/products) | enforced on all create paths + product unarchive | same guards on all mobile routes, 403 `cap_reached`; app shows the cap message stripped of purchase steering via `plan-errors.ts` (next build) | ✅ |
| Active-product cap + archived state + order-guarded delete | web action archives ordered products instead of deleting, explains the outcome | mobile DELETE returns additive `archived: true`; app alerts the outcome (next build); old builds see a normal delete and the row reappears archived on refresh | ✅ |
| Analytics gate (`analytics`) | DEFINED, NOT WIRED (audit 2026-07-28) | same: mobile analytics route ungated | ⬜ wired in Plus stage P6 with the boundary decision |
| Shared appearance system (`appearance_custom`) | `/settings/appearance` editor + resolver on hub and booking form | `settings/page-appearance` screen + GET/PATCH `/api/mobile/settings/appearance`, both wrapping the SAME `saveAppearanceCore` (next build). Named "Page appearance" because the app's settings index already has an Appearance section for the APP's own theme, which is a different thing | ✅ |

## Other established surfaces (from the 2026-07-26 audit, unchanged)

Bookings (list/detail/approve/reject/cancel/deposits), calendar + appointments,
clients, flash (CRUD + Instagram), goods, waitlist, notifications + push,
support tickets, settings (profile/books/booking-form/deposits/policy/emails/
templates/hub/calendar-export/reminders/payouts/dashboard), onboarding, account
security: ✅ at parity via the 93-route /api/mobile surface. Web-only by
design: admin, marketing pages, legal pages, public artist pages, client
magic-link portal (D: app is artists-only).

## Update log

- **2026-07-27 — Map attribution reaches native:** `MapAttribution` added to
  `travel/discover` and `travel/map`, closing a real compliance gap (the app
  showed no credit for tiles or studio data). Same collapsed `Info` pattern web
  adopted the same day; strings shared, placement adapted to the native overlay
  stack. `config.dataAttributionUrl()` added so the app links the full notices
  without restating the path. Next EAS build.

- **2026-07-27 — Public map go-live slices S1, S2, S2b (all web, all dark):**
  the anonymous data plane on `/api/map/*` (`/api/mobile/map/*` untouched, and
  the artists route has no public branch per founder D2), the auth-optional
  `(map)` route group, and the claimed studio entity page `/studios/{slug}`
  with its media proxy and sitemap segment. Native impact is limited to ONE
  additive field, `studioSlug`, on the shared `MapLocationDetail` the mobile
  detail route already serves; it is null while the public map is dark, and
  the app does not render it. No mobile route, screen, or capability changed,
  so no EAS build is required for this work. Rows added above.
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
