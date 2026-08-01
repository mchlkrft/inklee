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
- **"(branch-only)" is a WEAKER claim than "(next build)", added 2026-07-29.**
  A row marked "(next build)" is on `origin/master`: it is deployed server-side
  and one EAS build away from devices. A row marked "(branch-only)" is on an
  unmerged branch: **nothing about it is deployed**, its server routes do not
  exist in production, and it needs a merge AND a build. Do not conflate them.
  The distinction was added because two P5d rows were marked "(next build)"
  while living only on `feat/p5d-collections`, which reads to a merger as
  "already shipped, just needs a build".

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
| Analytics gate (`analytics`) | WIRED: `/analytics` has three tabs: Bookings (all tiers), Hub (Plus: page views, clicks, CTR, sources, conversions, top links, daily trend), Savings (Plus: deposit fees, goods fees, hypothetical comparison, subscription cost, net benefit). Collection: hub click events via `/api/artist-events/collect`, pageviews aggregated from wa via daily rollup cron, fee data from `platform_fee_collected_cents` on settlements. | WIRED: `/api/mobile/analytics` returns `hubAnalytics` + `feeSavings` (both null for Free, full result for Plus). The app receives the data and can render both tabs. Needs a build. | ✅ |
| Goods sales analytics (Stage 3) | `/goods/sales` shows raw ledger (Free) + Plus-gated trends: this-month/last-month stat cards with pct change, top products by revenue, monthly revenue summary (last 6 months). Computed from existing order data, no new queries. | GET `/api/mobile/goods/sales` returns `totalRevenue`, `totalItems`, `orderCount`, and `analytics` (null for Free, full `SalesAnalytics` for Plus: `topProducts`, `months`, `thisMonth`, `prevMonth`, percentage changes). Needs a build | ~ |
| Shared appearance system (`appearance_custom`) | `/settings/appearance` editor + resolver on hub and booking form | `settings/page-appearance` screen + GET/PATCH `/api/mobile/settings/appearance`, both wrapping the SAME `saveAppearanceCore` (next build). Named "Page appearance" because the app's settings index already has an Appearance section for the APP's own theme, which is a different thing | ✅ |
| Booking-form visual templates (P3b) | 4 templates on the public page via `bookingTemplateStyles`; `clean` byte-identical to the pre-P3b markup | n/a by design: the public page is a web surface. The template PICKER is already native (`settings/page-appearance`, P1b) and now drives this page too | 🌐 |
| Cover image + colour through one resolver (P3c) | both public pages read `appearance.resolved`; `lib/public-cover.ts` deleted | the app edits the cover on `settings/profile` as before; nothing native reads the resolver | 🌐 |
| Custom confirmation page (P3d) | `bookings/booking-form` editor + gated render on `request/submitted` | `settings/booking-form/confirmation` screen + GET/POST `/api/mobile/booking-form/confirmation`, both through the SAME `saveConfirmationCore` (next build) | ✅ |
| Custom URL slug (P3e) | `settings/profile` rename form with an explicit consequence confirmation | `settings/slug` screen + GET/POST `/api/mobile/settings/slug`, both through the SAME `renameSlugCore` (next build) | ✅ |
| Scheduled books-open date (P3f) | `booking_opens_at` in all 3 web books forms; public page shows the date | native `settings/books` date field + `bookingOpensAt` on PUT `/settings/books` (next build); absent key means unchanged, so pre-P3f builds cannot clear it | ✅ |
| Shop collections (P5d) | `/goods/collections` manager (many-to-many membership, per-collection order, archive/restore, eligible-delete) + grouped public shop | ✅ `(tabs)/goods/collections` + GET/POST/PATCH/DELETE `/api/mobile/goods/collections`, every write through the SAME cores, so the entitlement refusal and the delete-eligibility rule are one implementation (**branch-only**, `feat/p5d-collections`, `caa1be1` — NOT on master, so these routes do not exist in production; then a build). ONE deliberate difference: web can drag to reorder, the app cannot. The reorder cores and the `reorder` / `reorderProducts` ops exist and are wired server-side, so the native gesture is additive whenever it is worth the surface. The public shop stays web: it is a visitor surface | ~ |
| Featured-collection Hub block (P5d) | `featured_collection` block in the Link Hub editor + rendered on `/<slug>/hub` | ✅ picker on `settings/link-hub`, fed by the `collections` key added to GET `/api/mobile/settings/hub` (**branch-only**, `feat/p5d-collections`, `25dda4f` — NOT on master; then a build, and that build is a HARD PREREQUISITE, see the wire hazard below). Both surfaces seed from the same shared parser, which drops a block naming nothing and keeps one block per collection | ✅ |
| Appointment payment request cores (P9 A2) | `server/appointment-payments.ts`: create / revise / send / cancel / expire, plus migration `0126` (`payment_requests.collects`, the atomic `send_payment_request` RPC) | ✅ A7 mobile routes: POST `/api/mobile/payments/requests` (create), POST `.../[id]/send`, `.../[id]/cancel`, `.../[id]/revise`, `.../[id]/refund`. Every route is a thin wrapper around the SAME core the web actions call. **No route adds its own entitlement gate**: create / revise / send are gated inside the cores; cancel is deliberately UNGATED (an artist who lapses to Free must still stop a live request for money); refund wraps `refundPaymentRequestCore` which gates on the settled state, not on entitlement. Status mapping: 403 `not_entitled`, 404 `not_found`, 409 `settled`, 400 everything else. `send` returns `customerToken` so the app can build the `/pay/<token>` link. **+ 2026-07-31 the READ half (was missing — every core is a write): GET `/api/mobile/payments/requests` (list, newest-first) and GET `.../[id]` (detail + lines), both wrapping the shared RLS-scoped `appointment-payment-read.ts`.** (**branch-only**, `feat/p5d-collections` — NOT on master; then a build) | ✅ |
| Appointment payment quote + intent (P9 A3) | `server/appointment-payment-quote.ts` (the ONE server-authoritative quote) and `server/appointment-payment-intent.ts` (the Stripe PaymentIntent for a payment request), plus migration `0127` (`payment_requests.payment_intent_id` / `payment_intent_amount_minor`) and the FEE UNIFICATION: the deposit path's `application_fee_amount` now comes from `appointmentApplicationFee` instead of the hardcoded `platformFeeCents`, so one implementation prices both lanes on both paths | n/a: the A7 routes wrap the cores; no mobile route computes or sends an amount. `buildPaymentQuote` is the ONE producer; the `/pay/<token>` page (A6) calls it server-side. The client-facing payment surface is A6 (web) and is a VISITOR surface. The native app never prices an appointment payment | 🌐 |
| `appointment_payments` capability (P9 A2) | new name in `CAPABILITIES`, so `GET /api/mobile/config` now emits it whenever it is paused | ✅ automatically, and safely: `disabledCapabilities` is typed `string[]` on the wire and consumers ignore names they do not know, which is the documented safe-ignore path for old builds. NOT a breaking wire change (contrast the `featured_collection` block type below: THAT is a union the app switches on). No new build is needed for installed apps to tolerate it; a build IS needed before any app surface can honour it | ✅ |
| Drops, preorders, low-stock alerts (P5c) | product form fields + all 3 public availability gates; alert via the notification plane | ✅ the three fields on `(tabs)/goods/[id]`, gated by a server-resolved `schedulingEntitled` and stripped server-side regardless (next build). ONE deliberate difference: web takes a date AND time, the app takes a DATE and means the start of it, because a native datetime picker is not worth the surface for a field most artists set to "that Friday". The ALERT already reached native via the existing `system_warning` type | ✅ |
| Discount codes (P5b) | artist editor at `/goods/discounts`; client code field in the portal checkout | ✅ `(tabs)/goods/discounts` screen + GET/POST/PATCH `/api/mobile/goods/discounts`, all writes through the SAME `saveDiscountCore` / `setDiscountActiveCore` (next build). The client checkout stays web: it is a visitor surface | ✅ |
| Platform fee engine + fee actuals (P5a) | `computeOrderFees` / `resolveOrderFee` on the checkout prepare paths; actuals written by the webhook | n/a: the app never prices a payment. It reads the artist's plan and the existing deposit surfaces, both unchanged | 🌐 |
| Payment dispute handling (P5a) | `charge.dispute.*` recorded to audit_log + an artist notification | ✅ automatically: the notification uses the EXISTING `system_warning` type, so installed builds render it with no new wire value and no new build. A new notification type would have reached devices that cannot switch on it | ✅ |
| Project client portal + emails (P4 follow-up) | `/project/<token>` client page; receipt, artist-alert and status emails | 🌐 the portal is a CLIENT surface and the app is artists-only. The artist half already reaches native: the new-enquiry alert uses the existing notification plane, so no new wire value and no new build | 🌐 |
| Large-project mode (P4) | public intake `/{slug}/project` (404s when un-entitled); artist list + detail at `/bookings/projects`, status transitions, private note, attach/detach sessions | `projects/index` + `projects/[id]` screens; GET `/api/mobile/projects`, GET/PATCH `/api/mobile/projects/[id]`, all through the SAME cores (next build). WEB-ONLY by design within it: the public intake (a visitor surface) and attaching a session (needs the booking picker, which is a bigger native surface; tracked) | ~ |
| Conditional booking-form questions (P3) | condition editor in `bookings/form/field-form.tsx`; public form renders through the shared `resolveFieldVisibility`; server re-resolves in `validateCustomAnswers` | `settings/booking-form/[fieldId]` condition section; GET `/api/mobile/booking-form` emits `custom.condition` + server-derived `conditionSources`, POST/PATCH persist `condition` (next build). Both editors ALWAYS send the condition back, because the write replaces it (omitting would clear a condition the artist never touched) | ✅ |

## Other established surfaces (from the 2026-07-26 audit, unchanged)

Bookings (list/detail/approve/reject/cancel/deposits), calendar + appointments,
clients, flash (CRUD + Instagram), goods, waitlist, notifications + push,
support tickets, settings (profile/books/booking-form/deposits/policy/emails/
templates/hub/calendar-export/reminders/payouts/dashboard), onboarding, account
security: ✅ at parity via the 93-route /api/mobile surface. Web-only by
design: admin, marketing pages, legal pages, public artist pages, client
magic-link portal (D: app is artists-only).

## Wire hazard: a new BLOCK TYPE is not additive the way a new field is

Recorded 2026-07-29, from the `featured_collection` block (P5d).

The additive-only rule protects installed builds because an unknown KEY is
ignored. A new block TYPE is different: the Link Hub editor renders every block
the server sends, and it looked its label up with `BIO_BLOCK_META[block.type].label`.
An installed build carries its own compiled copy of that map, so a block type
added afterwards resolves to `undefined` and reading `.label` takes the whole
screen down. The value is not ignored, it is dereferenced.

Two things follow, both done here:

- The native editor now falls back (`?.label ?? "Block"`) instead of indexing
  blind, so the NEXT block type cannot crash a build that predates it. **This
  protects builds made from the NEXT EAS build onward. It protects nothing that
  exists today.**

  > **Correction, 2026-07-29.** This bullet read "This protects builds from
  > `da93749b` onward, not the ones already installed", which reads as though
  > `da93749b` carries the fallback. It does not, and no build does yet.
  > `da93749b` was built 2026-07-28 from `c00341a`; the fallback landed in
  > `25dda4f`, which is on `feat/p5d-collections` and is not on master, let
  > alone in a build. Verified directly rather than inferred:
  > `git show c00341a:apps/mobile/app/settings/link-hub.tsx | grep BIO_BLOCK_META`
  > returns `{BIO_BLOCK_META[block.type].label}` at line 372 and
  > `BIO_BLOCK_META[type].addLabel` at 470 — the blind index, no `?.`, in the
  > exact code that ships on devices today. The guarded form
  > (`BIO_BLOCK_META[block.type]?.label ?? "Block"`) exists only in the working
  > tree, at `link-hub.tsx:420` and `:559`. So the set of builds carrying the fallback is
  > currently **empty**, and `da93749b` (the latest, and the one on devices) is
  > among the vulnerable ones. Retracted in place rather than deleted, because
  > "the fix already shipped to devices" is precisely the wrong thing for the
  > next reader to believe here.
- **A fresh EAS build is a prerequisite before `goods_collections` is granted
  to anyone.** Builds that predate this change would crash on the Link Hub
  screen if an artist featured a collection on web. Nothing can hit it today
  (the capability is ungranted and the tier is dark), which is exactly why it
  needs writing down rather than remembering.

## Update log

- **2026-07-31 — Product bundles, native route + screen (Stage 3, slice 3,
  branch-only).** Closes the bundles native gap opened by slice 2:
  `GET/POST/PATCH/DELETE /api/mobile/goods/bundles` (the native twin of the web
  actions, every write through the SAME cores, `writeResponse` maps
  not_entitled->403 / not_eligible->409 / failed->500 / else 400, PATCH ops
  archive|reorder|setItems), the `MobileBundleList` wire type, and the native
  editor `apps/mobile/app/(tabs)/goods/bundles.tsx` (create/edit name+price,
  Hide/Show, Archive, archive-first Delete, a product picker with quantity
  steppers + savings line), wired from the goods index and `_layout`. Bundles
  are now at web<->native parity for management. STILL: the public shop renders
  web-only (native has no public shop), and the payable bundle checkout is a
  further follow-on (dark). ⚠️ New mobile route + screen => a fresh EAS build is
  a prerequisite before `goods_bundles` is granted, alongside `goods_collections`
  and the `featured_collection`/`image_gallery` block-type changes. On
  `feat/p5d-collections`, NOT on master.

- **2026-07-31 — Product bundles, web editor + public render (Stage 3,
  branch-only).** Bundles slice 2 on top of the backend slice (`5e094d0`):
  the artist editor at `/goods/bundles` (create/edit name + price + visibility,
  pick products with quantities, archive/restore, archive-first delete, live
  savings display), a nav entry under Goods, and the public shop bundles section
  in `[slug]/shop-teaser.tsx` (display-only offers with the saving vs the parts;
  fail-flat + entitlement-aware via `publicBundlesForArtist`). WEB-ONLY so far:
  the public shop renders web-only anyway, and the NATIVE goods editor has
  `collections`/`discounts` screens but NOT yet bundles — that is slice 3
  (`/api/mobile/goods/bundles` route + `apps/mobile/app/(tabs)/goods/bundles.tsx`
  + a `_layout` row), and it carries the usual fresh-EAS-build prerequisite
  before `goods_bundles` is granted. The payable bundle checkout is a further
  follow-on (dark). On `feat/p5d-collections`, NOT on master.

- **2026-07-31 — `image_gallery` Link Hub block (Stage 3, branch-only).** A new
  block TYPE (a Plus rich block: the artist's own images), so the wire-hazard
  above applies again. It is additive and the native lookups are already guarded
  (`?.label ?? "Block"`, `?.addLabel ?? type`), so a build carrying this change
  will not crash on it; older builds show the block as a "Block" card with no
  body (graceful) rather than crashing, and the public hub renders web-only.
  PARITY of editing is DELIBERATELY web-only for v1 (D4 in
  `plus-build-time-decisions.md`): the native editor shows an image_gallery block
  as a read-only "N images · edit on the web" summary and does not add native
  image upload; it PRESERVES the block untouched on save (state holds the full
  `BioBlock`, sent back verbatim), so a web-made gallery survives native edits.
  Gating: a Plus rich block on the `appearance_custom` entitlement. Enforced at
  RENDER (web hub) AND at SAVE on BOTH write paths — `saveBioPageAction` (web) and
  `POST /api/mobile/settings/hub` (native) both call the shared
  `gateMediaBlocksForSave`, which refuses a NEW or CHANGED gallery for an
  unentitled artist and keeps an existing unchanged one (D2: hide-on-downgrade,
  never delete). (Corrected 2026-07-31: the save paths previously did NOT enforce
  this despite comments claiming they did; finding recorded and fixed.) The pure
  parser still keeps the block regardless of plan, so a downgrade hides rather
  than loses it. **A fresh EAS build
  is a prerequisite before the rich blocks are granted to anyone** (same gate as
  `goods_collections`): the guard prevents a crash, but the native summary +
  gated add button only exist from the next build onward. Files: shared
  `bio-page.ts` (union + parser + `sanitizeImageUrl`), web `hub/page.tsx` +
  `feature-blocks.tsx` (render), `link-hub/*` (editor), mobile
  `settings/hub/route.ts` (`richBlocksAllowed`) + `app/settings/link-hub.tsx`
  (summary + gated add). On `feat/p5d-collections`, NOT on master.

- **2026-08-01 — P9 artist payment-requests WEB UI, slices 2a + 2b (branch-only).**
  Web surface for appointment payments under `(artist)/bookings/payments`: the
  list (2a, read-only via the shared read layer), the per-request detail page
  `[id]` (2b-i, shows lines), and the create flow `new/` (2b-ii/iii: a form with a
  booking/project subject picker + collects + line editor → `createPaymentRequestAction`).
  `actions.ts` wraps the SAME cores the mobile routes call: create / send / cancel
  / refund (a two-step full-refund control on the detail page, case voluntary_full,
  reusing the artist-case allowlist; revise form + partial/by-line refunds still to
  come). **LINK DELIVERY (slice 3, 2026-08-01): on send, the client is emailed
  their `/pay/<token>` link** (shared `appointment-payment-delivery.ts`, best-effort
  AFTER the send, `Sent by Inklee on behalf of <artist>` anti-phishing footer);
  BOTH surfaces deliver — the web action returns `{payUrl, emailed}` and shows the
  copyable link (the token is stored hashed, so this response is its only carrier),
  and the mobile send route gained ADDITIVE `payUrl`/`emailed` keys (older builds
  ignore them; `customerToken` unchanged). **CLIENT RECEIPT (slice 4, 2026-08-01):
  settlement now emails the client a receipt, hooked INSIDE `settlePaymentRequestSuccess`'s
  once-only claim gate so both settlement paths (webhook + reconciliation) send
  exactly one; no route shape changed. Refund availability WIDENED per the authz
  review (Finding B): the core's exported `REFUNDABLE_STATUSES` now includes
  cancelled/expired/failed (money-holding states per the transition matrix), which
  the mobile refund route inherits automatically; the web UI derives its
  Cancel/Refund visibility from the shared/core constants (Finding A, no more
  hand-copied sets).** NOT yet in the nav (feature is dark /
  entitlement-gated; the item appears at launch-readiness, like `/pricing`),
  reachable by URL. NATIVE EQUIVALENT is a follow-on: the app already has the
  write + read `/api/mobile/payments/requests` routes but no management SCREEN.
  Link delivery + client receipt are later slices. On `feat/p5d-collections`.

- **2026-07-31 — P9 A7 appointment payment mobile routes (branch-only).**
  Five `/api/mobile/payments/requests` routes: create (POST), send (POST
  `[id]/send`), cancel (POST `[id]/cancel`), revise (POST `[id]/revise`),
  refund (POST `[id]/refund`). Every route is a thin wrapper around the SAME
  server core the web actions call. No route adds its own entitlement gate:
  the cores gate create/revise/send; cancel is deliberately ungated (a lapsed
  artist must still stop a live request for money); refund gates on settled
  state, not entitlement. `send` returns `customerToken` so the app can build
  the `/pay/<token>` link for sharing. Status mapping: 403 `not_entitled`,
  404 `not_found`, 409 `settled`, 400 everything else. A6 row updated from
  ⬜ to ✅, A3 row updated from ⬜ to 🌐 (the quote/intent cores are
  server-only; the native app never prices a payment). On
  `feat/p5d-collections`, NOT on master.

- **2026-07-29 — P9 A2 appointment payment cores: one parity DECISION recorded,
  no surface on either platform.** Nothing shipped, nothing deployed,
  uncommitted working tree. The register gets an entry anyway because the rule
  covers deliberate decisions, and this one is a trap A7 would otherwise walk
  into: **asking for money is gated, stopping it is not.** `create`, `revise`
  and `send` refuse a Free or paused artist inside the core; `cancel` and
  `expire` refuse nobody, on purpose, because an artist who lapses to Free (or a
  platform-wide pause) must never be left with a live request for money that
  nobody can withdraw, and expiry is a safety property of a link that runs
  unattended. A native route that added its own entitlement check around cancel
  would produce exactly the divergence this file exists to catch, and it would
  look like defensive coding while doing it. The asymmetry is asserted in the
  unit suite rather than described only here.

  The `appointment_payments` capability name is already in `CAPABILITIES` and is
  emitted by `GET /api/mobile/config` (row above). Safe for installed builds:
  `disabledCapabilities` is `string[]` and unknown names pass through. That is
  NOT the case for a future `collects` value if any app ever switches on it, and
  the wire-hazard section below is the reason to check before adding one.

- **2026-07-29 — Plus P5d shop collections, web + native. ⚠️ BRANCH-ONLY, and
  it carries the first BREAKING wire change this register has recorded.**
  Everything in this entry is on `feat/p5d-collections`, unmerged. Nothing here
  is deployed and nothing here is on a device.

  **Native collection management** (`caa1be1`, milestone 5):
  `(tabs)/goods/collections` plus GET/POST/PATCH/DELETE
  `/api/mobile/goods/collections`. Every write calls the same cores the web
  actions call, so the entitlement refusal, the delete-eligibility rule and the
  ordering behaviour are one implementation rather than two that agree today.
  The five state-changing operations share ONE PATCH route discriminated by
  `op`, rather than five endpoints: each is a single call with no body worth its
  own route, and an unknown `op` is refused with 400, so a newer app calling an
  older deployment gets a clear error instead of a silent no-op. Status mapping
  is deliberate: **403** for `not_entitled` (the app maps it to IAP-safe copy
  through `plan-errors.ts`), **409** for `not_eligible`, because a delete
  refused for having products in it is a state conflict and not a malformed
  request. ONE deliberate difference, recorded here rather than left implicit:
  **web can drag to reorder, the app cannot.** The reorder cores and both
  reorder ops are built and wired server-side, so the native gesture is purely
  additive whenever it earns the surface.

  **The `featured_collection` Link Hub block** (`25dda4f`, milestone 4): a THIRD
  block family. The existing two are content blocks (which carry their own text)
  and feature blocks (content-free, capped at one each). This one carries a
  REFERENCE, so it needed its own rules. The parser drops a block naming
  nothing, but deliberately does NOT resolve the reference: the parser is pure
  and has no database, and dropping on a failed lookup would let a transient
  read error silently delete the artist's saved block. The renderer drops a
  dangling reference instead. Deduped by `collectionId` rather than capped at
  one. The native picker is fed by a new `collections` key on GET
  `/api/mobile/settings/hub`.

  **🚨 THE WIRE HAZARD: adding a value to a union the app SWITCHES ON or INDEXES
  BY is a BREAKING wire change, unlike adding a field.** This is the first time
  the additive-only rule at the top of this file has failed, and it failed
  because the rule's protection has a precondition nobody had written down: an
  unknown KEY is ignored, but an unknown VALUE that gets used as a MAP INDEX is
  **dereferenced**. The native Link Hub editor read
  `BIO_BLOCK_META[block.type].label`. An installed build carries its own
  compiled copy of that map, so a block type added afterwards resolves to
  `undefined`, and reading `.label` off it takes the whole screen down. It
  crashed the Link Hub screen on installed builds.

  Two consequences, and only one of them is fixed:
  - The editor now falls back (`?.label ?? "Block"`), so the NEXT block type
    cannot crash a build that predates it. **This protects no build that exists
    today** — see the correction under "Wire hazard" below.
  - **A fresh EAS build is a HARD PREREQUISITE before `goods_collections` is
    granted to anyone.** Builds already installed cannot be repaired from the
    server. Nothing can hit it today (the capability is ungranted and the tier
    is dark), which is exactly why it is written down rather than remembered.

  **Web-only by decision, recorded as rows rather than omitted:** the grouped
  public shop and the rendered `/<slug>/hub` block are visitor surfaces, and the
  app is artists-only.

  **Also relevant to this register, and NOT on master either:** `0de2034`
  (native discount + product-scheduling editors) was previously recorded as
  shipped. It was not. It is the base commit of `feat/p5d-collections` and lands
  with that merge. Reviewed clean, no rebase, per founder decision 2026-07-29.
  See `docs/product/p5d-base-commit-review.md`.

- **2026-07-28 — Plus P4 large-project mode, web + native:** migration `0115`
  adds `projects`, `project_media` and ONE nullable `booking_requests.project_id`.
  That column is the whole design: sessions are not a new entity, they are
  ordinary booking requests carrying a project id, so deposits, the calendar,
  reminders and every lifecycle email keep working through pipelines that
  already exist. New `large_projects` capability, GRANT-shaped, which gates the
  public intake and the CREATION of projects but deliberately not READING or
  managing existing ones: a downgrade must never hide long-term records that
  have live bookings attached. The intake 404s rather than showing a message
  when un-entitled, because a half-working sub-path tells a client the artist
  takes project enquiries when they do not. Media reuses the private `bookings`
  bucket under a `projects/` prefix and is served through short-lived signed
  URLs, since these are body photographs.

- **2026-07-28 — Plus P3 booking form (P3b-P3f), web + native:** visual
  templates on the public page, cover image and colour unified onto the
  appearance resolver (which deleted `lib/public-cover.ts` and, with it, a
  second cover implementation that silently beat any per-surface override),
  the custom confirmation page, the custom URL slug, and the scheduled
  books-open date. Two new capability keys, `form_conditional` and
  `form_custom`, both GRANT-shaped so pausing either reverts to today's
  behaviour. The conditional-questions gate is the interesting one: an
  un-entitled artist's conditions are STRIPPED on read so every question
  shows, because the alternative (honouring a condition for someone who is
  not entitled) keeps questions hidden from their clients and nobody notices
  until a booking arrives missing information. Stored conditions are never
  destroyed, and an unchanged one rides along on unrelated edits.

- **2026-07-28 — Conditional booking-form questions (Plus P3), web + native:**
  migration `0114` adds a nullable `condition` jsonb to `custom_fields`; the
  shared module owns the parser, the single-pass resolver and the validation.
  Both editors ship together because the write REPLACES the stored condition,
  so an editor that could not render one would silently clear it. Two
  correctness notes worth keeping: the resolver walks fields in position order
  carrying only answers of already-visible fields (a chained A→B→C condition
  would otherwise keep C on screen off a stale answer to a hidden B, diverging
  from the server), and a checkbox controller offers only ticked / not ticked,
  because "is" has no option list to compare against and would serialise to an
  empty value the parser correctly discards. Requires a fresh EAS build for the
  native editor. Older builds are safe: the mobile PATCH distinguishes an
  ABSENT `condition` key (leave the stored one alone) from an explicit null
  (clear it), so a pre-P3 build editing a conditional field cannot wipe a
  condition it never rendered.

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
