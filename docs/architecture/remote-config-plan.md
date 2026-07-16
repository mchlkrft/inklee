# Remote Config & Feature Flag Plan — audit + minimum viable design

**Date:** 2026-07-16
**Status:** PLAN — not implemented. Audit complete (4 parallel code audits: mobile client, mobile API contracts, shared/database layer, money paths).
**Decision requested from founder:** approve the final flag set (§8) and the phased plan (§16) before any implementation.

---

## 1. Executive summary

The audit's headline finding is that **Inklee already owns most of a safe flag system**, and the piece it is missing is not Firebase Remote Config:

1. **Firebase Remote Config cannot reach any Inklee build that exists today or ships this quarter.** The mobile app contains no Firebase SDK at all (`apps/mobile/package.json` has no `@react-native-firebase/*`; push is `expo-notifications` + Expo push tokens, Firebase is only the FCM transport behind Expo's service). Adding `@react-native-firebase/remote-config` is a native-module change requiring a new EAS build, and there is **no OTA channel** (`expo-updates` absent) — so RC coverage would begin only with the *next* binary and never protect the installed fleet.
2. **The app already has a server-driven config channel that reaches every build:** `GET /api/mobile/min-version` (unauthenticated, fail-open, checked above the auth gate on every launch — `apps/mobile/app/_layout.tsx:117,163`). Extending this proven pattern into a small `GET /api/mobile/config` gives kill-switch and rollout capability with zero new native dependencies, one config plane, and full coverage of the existing harness (unit + Playwright).
3. **Every risky capability must be server-enforced anyway** (money, entitlements, enum emission). A client-side flag only hides entry points; the authoritative switch lives in the backend regardless of where the client reads its copy. Inklee already has that backend layer: the entitlement engine (`packages/shared/src/entitlements.ts` + `account_overrides`), per-artist feature JSONB (`apps/web/src/lib/features.ts`), and fail-closed env gates (`GOODS_COMMERCE_ENABLED`, `CHECKOUT_ADDONS_PROD_READY`, `EMAIL_LIFECYCLE_ENABLED`).
4. **The genuine gaps found are narrow:** (a) no granular pause switch for in-app deposit collection (the only levers today are the whole-app min-version block or removing Stripe keys, which also kills refunds and 400s the webhook); (b) no app-version signal on API requests, so the server cannot version-negotiate responses; (c) a handful of contract-hardening issues (enum emission, `select("*")` pass-through, error-string matching) that no flag can fix.

**Recommendation: 0 Firebase Remote Config parameters for the MVP.** Build the capability layer server-side (§8, §10): one config endpoint with three keys (`minVersion` — existing, `recommendedVersion` — new, `disabledCapabilities` — new, with two registered capability keys `deposits` and `instagram_import`), a typed client capability module, and version headers on every API call. Adopt Firebase RC later only if one of the explicit triggers in §17 fires, and then cap it at 3 parameters.

This is deliberately contrarian to the prompt's framing and is where the evidence points: a Firebase parameter added today is operational debt with **zero reachable benefit**, because the fleet it is meant to protect cannot consume it.

---

## 2. Current architecture findings

### 2.1 Client fleet reality (the version-skew problem, sized)

| Surface | Version state | Skew risk |
|---|---|---|
| **Web** (`inklee.app`, Vercel git deploy from `master`) | Continuously deployed; only skew is a stale open browser tab | ~Zero. Rollback = Vercel promote-previous. Needs no remote config. |
| **Android** | v0.1.0 (`apps/mobile/app.json:7`), versionCode managed remotely by EAS (`eas.json` `appVersionSource: "remote"`, production `autoIncrement`). Distribution: preview APKs to a handful of beta testers; Play Internal testing upload (vc3) in progress | **The whole problem.** No OTA (`expo-updates` absent) — every JS change requires a new binary and a user-initiated update. Old builds persist indefinitely. |
| **iOS** | Does not exist in production (Apple enrollment blocked; Android-first decision 2026-06-23) | None yet. Design for it, ship nothing for it. |
| **Backend/DB** | Single unversioned API surface; 72 migrations through `0073` | Server always newest; every change is instantly live for all clients. |

Fleet size today: single-digit devices. This matters for the rollout design — percentage rollouts over <10 devices are theatre; per-artist cohorting is the meaningful unit.

### 2.2 Existing control mechanisms (inventory)

| Mechanism | Where | Scope | Failure direction |
|---|---|---|---|
| **Min-version kill-switch** | `GET /api/mobile/min-version` (`apps/web/src/app/api/mobile/min-version/route.ts`) + `useMinVersionGate` (`apps/mobile/src/lib/min-version.ts`) + blocking `UpdateRequired` screen. Env: `MOBILE_MIN_VERSION[_ANDROID|_IOS]`, `MOBILE_UPDATE_URL` | Whole app, per platform | **Fail-open** (unset ⇒ `0.0.0`, nobody blocked; offline ⇒ app runs) |
| **Entitlement engine** | `packages/shared/src/entitlements.ts` + `account_overrides` (migration 0045); plan tiers `free\|plus`; only `deposits` enforced today (`bookings.ts:705-707`); surfaced read-only via `/api/mobile/me` (`plan`, `canCollectDeposits`) | Per artist, per feature | Fail-soft (un-entitled deposit request silently degrades to manual deposit) |
| **Per-artist feature JSONB** | `profiles.settings.features` via `apps/web/src/lib/features.ts` (`bio_page_modules`, `goods_module`, `checkout_addons`), defaults all ON | Per artist | Default-on |
| **Fail-closed env gates** | `GOODS_COMMERCE_ENABLED`, `CHECKOUT_ADDONS_PROD_READY` (`features.ts:53-93`), `EMAIL_LIFECYCLE_ENABLED`, `EMAIL_CAMPAIGNS_ENABLED` | Deployment-wide | **Fail-closed** (unset ⇒ off) |
| **Server-computed capability booleans** | `MobileMe.canCollectDeposits`, `MobilePayouts.routeCharges`, `MobileInstagram.configured`, `MobileSupportTicketDetail.canReply`, `dashboardWidgets` | Per artist, consumed by client as ad-hoc gates | Server-authoritative |
| **Version-skew contract by convention** | `packages/shared/src/mobile-api.ts` — optional fields for newer data (`todayKey?`, `guestSpots?`, `actionItems?`…), `@deprecated` field retention (`referenceImagePaths` "kept so older installed builds don't crash") | Wire contract | Additive-only discipline, comment-enforced |
| **Play Store staged rollout** | Play Console (once Production track is live) | Binary rollout percentage | Native platform feature, no code |

### 2.3 Firebase footprint today

- Firebase project `inklee-99004` exists **only** as the FCM transport for Expo push on Android. `google-services.json` is injected via `apps/mobile/app.config.js` + the `GOOGLE_SERVICES_JSON` EAS file env var.
- No Firebase JS SDK, no Analytics, no Crashlytics, no Remote Config anywhere in the repo.
- The app authenticates against Supabase; all data flows through `https://inklee.app/api/mobile/*` with a Supabase bearer token (`apps/mobile/src/lib/api.ts`). **If the Inklee backend is down, the app is inert regardless of any config system** — which removes RC's main theoretical advantage (config availability independent of the app backend).

### 2.4 Client tolerance profile (what old builds already survive)

The client is defensively written in most places: unknown enum values fall through to raw-string labels (`status-labels.ts:25-48`), `StatusPill` has an explicit fallback tone, unknown booking statuses render no actions rather than crashing (`booking-fsm.ts:40-43` → `BookingActions.tsx:83`), unknown `MobileActionItem.kind`s are silently dropped, off-allowlist push routes no-op (`push.ts:35-92`), and the root `ErrorBoundary` catches render crashes (`_layout.tsx:41-64`). The API client ignores unknown response fields (blind cast) and the API ignores unknown request fields (no `.strict()` validation anywhere). This baseline tolerance is why the final flag count can be small.

---

## 3. Fragile compatibility areas

Ranked. "Old build" = an installed Android binary that will not be updated promptly.

### A. Money-critical (highest stakes)

1. **New `DepositState` value / partial refunds.** The 5-state union (`awaiting|overdue|paid|refunded|cancelled`, `packages/shared/src/deposit-state.ts:35-40`) is compiled into the binary. The deposits overview filters by exact string (`apps/mobile/app/(tabs)/bookings/deposits.tsx:158-162`) — a new state **silently drops the row**; the booking detail mislabels it as "Awaiting payment" (`apps/mobile/app/bookings/[id].tsx:51-62`). Partial refunds are worse: `depositState` treats *any* refund audit row as fully refunded (`deposit-state.ts:64`), so an old build would show "Refunded / full deposit returned" while money is only partly returned.
2. **Platform fee display drift.** The 3% fee is a compiled shared constant (`packages/shared/src/platform-fee.ts:33`) rendered in the deposit request form (`BookingActions.tsx:468`). A server-side fee change leaves old builds displaying a wrong "you receive" figure while the server charges the new fee.
3. **`MobileBookingDeposit` / `MobilePayouts` shape changes.** Card-vs-manual gating (`BookingActions.tsx:162,368`) and refund gating (`apps/mobile/src/lib/bookings.ts:19-26`) read `hasCardIntent`, `paid`, `routeCharges` — renaming or removing any of these misfires money UI.

### B. Contract-structural

4. **Enum widening over `string`-typed wire fields.** Nearly all status fields cross the wire as bare `string`; the client's compiled union is the only guard. The **worst case is `notifications.type`**: TEXT with **no DB CHECK** (`0013_notifications.sql:4`), served via `select("*")` pass-through (`notifications/route.ts:19-36`), and mirrored into push `data`. Any new notification type reaches old feeds and push handlers with zero guardrails (in-app: invisible icon/dot — `notifications.tsx:176,184` have no fallback; push: safe no-op). By contrast, flash/support/goods enums are Postgres-enum- or CHECK-guarded, which forces a coordinated migration.
5. **Pass-through responses.** `notifications` (`select("*")`) and `waitlist` (direct cast, `waitlist/route.ts:21-36`) ship DB column *names* to the device; a column rename breaks those screens instantly. All other routes hand-shape (deliberate — the `waitlist/route.ts:19-20` anti-leak comment).
6. **Error contract by English string.** `mobileMutation` (`apps/web/src/lib/server/mobile-auth.ts:83-90`) maps HTTP status by exact-matching `"Booking not found."` / `"Not authorised."`. Rewording a core error message silently collapses 403/404 to 400 for every installed client. Error `code`s (`no_account`, `sync_failed`, `rate_limited`…) are the only machine-readable signal and are similarly rename-fragile.
7. **Duplicated enum sets.** `bookings/route.ts:15-21` hand-copies the booking FSM's status list; drift silently drops rows from the inbox filter.
8. **New required mutation fields.** All request validation ignores unknown keys (forward-compatible), but a *newly required* field 400s every old client. Most exposed: `bookings/[id]/deposit`, `goods` POST, `support` POST, `booking-form/fields` POST.

### C. Flow-level

9. **Onboarding strand risk.** Completion is a single server boolean (`MobileMe.onboardingCompleted`); the steps are client-defined screens. Tightening `/api/mobile/onboarding/*` validation would strand old builds mid-onboarding with no UI to satisfy the new requirement.
10. **`PlanTier` widening.** `effectivePlanTier` (`entitlements.ts:57-60`) treats an unknown tier as non-plus ⇒ a future `studio` tier silently downgrades to free on old code paths. Safe direction, wrong result.
11. **New deep-link/push destinations.** `PUSH_ROUTABLE_PREFIXES` allowlisting means unknown targets no-op safely — but the notification dead-ends, and there is **no `+not-found.tsx` catch-all** for cold deep links to routes an old build lacks.
12. **No version signal on requests.** `api.ts` sends only `Authorization`; the server cannot vary a response by client version or even measure fleet version distribution from API traffic (only `devices.appVersion` is stored, unused).

### D. Web (for completeness)

13. Web has no meaningful skew, but **route renames break external surfaces**: emails, push `href`s (`webHrefToRoute` maps web paths → native routes), magic links (`/request/[token]`), and the connect-link `next` allowlist. Treat public URL paths as a frozen contract; add redirects rather than renames.

---

## 4. Risk-ranked compatibility matrix

Cohorts: **W** = current web (auto-updated) · **A-now** = current Android 0.1.0 · **A-old** = older installed Android builds (the future problem, same binary properties as A-now) · **A-new** = future client versions · **BE** = backend/database (always newest).

| # | Change class | W | A-now/A-old | A-new | Protection today | Protection needed |
|---|---|---|---|---|---|---|
| 1 | New `DepositState` / partial-refund semantics | safe (redeploys) | 🔴 rows dropped / mislabeled "refunded" | ok | none | **Server-side version negotiation** (do not emit new states to builds below X) + min-version floor when unavoidable |
| 2 | Response field rename/removal (esp. pass-through routes) | safe | 🔴 screen breaks (blind cast) | ok | hand-shaping convention | Never rename; additive-only rule + fix the two pass-through routes |
| 3 | Platform-fee change | safe | 🟠 wrong "you receive" display, correct charge | ok | none | Serve fee from API (already-fetched payload), stop compiling it in |
| 4 | New booking status (FSM widening) | safe | 🟠 raw label, actions hidden (no crash) | ok | fallback labels | Version negotiation; update duplicated `ALLOWED_STATUS` |
| 5 | New required field on an existing mutation | safe | 🟠 400 on submit | ok | none | Backward-compatible defaults server-side; never add required fields to existing mutations |
| 6 | New notification type | safe | 🟡 invisible icon/dot, unroutable push (no crash) | ok | category/priority CHECKs only | Add client fallbacks (Phase 0); emit `category`+`priority` always; version-gate new `href` targets |
| 7 | Error message/code rewording | safe | 🟡 status-code collapse, generic errors | ok | none | Freeze `code` strings; replace string-matching with structured codes (Phase 0) |
| 8 | Onboarding tightening | safe | 🟠 stranded mid-onboarding | ok | none | Server accepts old-shape onboarding forever, or min-version floor |
| 9 | New plan tier / entitlement flip | safe | 🟡 features vanish (server-computed booleans honored) | ok | `/me` booleans | Keep booleans authoritative; old builds already obey them |
| 10 | New screens / nav / deep links | safe | 🟢 push no-op (dead-end, no crash) | ok | route allowlist | `+not-found` catch-all + "update to view" fallback |
| 11 | Push payload shape change | safe | 🟢 unknown fields ignored; routing keys frozen | ok | `PushData` is minimal (`booking_id`/`path`/`href`) | Freeze the three routing keys forever |
| 12 | New DB columns / new optional response fields | safe | 🟢 ignored | ok | additive convention | Keep the `mobile-api.ts` optional-field discipline |
| 13 | Web route rename | 🟠 emails/links/push hrefs break | 🟡 `webHrefToRoute` misses | ok | none | Redirects, never renames, for any URL that leaves the site |

The matrix's lesson: **almost nothing here is fixable by a client-side flag.** Rows 1–8 are contract-discipline and server-side-negotiation problems. Flags help only where a capability must be turned off remotely faster than the fleet updates (row 1 fallback, plus operational emergencies in §6).

---

## 5. Base MVP fallback definition

The base MVP is the set of features every supported build must deliver even with **every optional capability disabled** and **no config fetched at all**. It matches the launch-gate MVP definition (`docs/launch-gate.md`).

### 5.1 Base MVP (never behind any remote switch)

- **Authentication** — Supabase email/Google sign-in, password reset, `auth-confirm`/`reset-password` deep links (ungated routes in `_layout.tsx:257,263`).
- **Artist account access** — `/me` identity, onboarding gate, account settings, account deletion.
- **Public booking page (web)** — `inkl.ee/<slug>`, structured booking request submission with the artist's custom form.
- **Request review** — bookings inbox, booking detail, Accept / Pass, cancel, reopen.
- **Manual deposits** — request/mark-received/refund in manual mode (this is already the entitlement fallback; card collection is the optional extension).
- **Basic client info** — clients list + detail.
- **Calendar visibility** — appointments list/calendar read.
- **Notifications feed** — in-app list (push is best-effort transport, never load-bearing: `notifications.ts:54-56`).
- **Support** — tickets + FAQ.
- **Settings core** — profile, books open/closed, booking form editor, slots.
- **Safe navigation** — the 5 tabs (`home, flash, bookings, travel, goods`) all point at screens compiled into the same binary; nothing in navigation is remote-controlled (see §10.5).

### 5.2 Optional extensions (capability-gated, may be remotely disabled)

| Capability | Gate today | Fallback when off |
|---|---|---|
| **Card deposit collection** (`deposits`) | entitlement + `routeCharges`, server-computed | Manual deposit flow (already the built-in degradation path, `bookings.ts:700-717`) |
| **Instagram import/sync** (`instagram_import`) | `MobileInstagram.configured` boolean | Connect/import UI shows "unavailable"; existing flash items untouched |
| **Goods commerce** (checkout) | `GOODS_COMMERCE_ENABLED` + `CHECKOUT_ADDONS_PROD_READY` env, fail-closed | Showcase-only goods (current production state) |
| **Lifecycle emails** | `EMAIL_LIFECYCLE_ENABLED` env | No sends; transactional emails unaffected |
| Future: studios/guest-spots, paid-plan billing | server capability + entitlements when they ship | Feature absent |

### 5.3 Degradation rules

- **Feature unavailable:** hide the entry point where the client knows how (server boolean already fetched); where it doesn't, the server rejects with a stable error `code` and the client shows the error message. Never a dead button that half-works.
- **Unsupported deep link / push target:** current behavior is a safe no-op; Phase 0 adds `+not-found.tsx` with "This screen isn't available in this version" + an update prompt when `recommendedVersion` > installed.
- **Newer backend data:** unknown response fields ignored (already true); unknown enum values must render via the existing fallback paths (Phase 0 closes the two gaps: notification icon/dot, deposit label default).
- **Firebase unavailable:** irrelevant to the base MVP — Firebase is only the push transport. Push degrades; nothing else notices. (This must remain true even if RC is adopted later: RC may never be a startup dependency.)
- **Before first config fetch:** the app runs on **bundled defaults = everything the binary shipped with, enabled**. Config can only *disable* capabilities; therefore "no config yet" equals "nothing disabled", which is the correct optimistic default given every disable also has server-side enforcement.
- **Stale cached config:** acceptable for one session. Config is re-fetched each launch (same cadence as min-version). A capability wrongly shown due to staleness still hits the authoritative server check and fails with a coded error.
- **Missing/malformed parameter:** the typed parser drops unknown keys and coerces bad types to the bundled default. Malformed `disabledCapabilities` entries are ignored per-entry (an unknown capability name is a no-op by design — that is how old builds safely consume newer config). Fail direction is per-mechanism: kill data (`disabledCapabilities`) fails **open** (nothing disabled), matching the min-version philosophy that a config outage must never degrade the fleet; the *server* gates remain fail-closed where they already are.

---

## 6. Candidate flag inventory (initial set — 15)

Everything anyone could plausibly ask to remote-control, before reduction. "Mechanism" alternatives considered for each: (1) no flag / backward-compatible code, (2) static app-version capability detection, (3) server-side capability check, (4) database-driven state, (5) user/admin setting, (6) entitlement/subscription logic, (7) grouped flag, (8) dedicated Firebase RC parameter.

| # | Candidate key | Type | Bundled default | Responsibility | Platforms | Failure behavior | Backend enforcement | Verdict (→ §7) |
|---|---|---|---|---|---|---|---|---|
| C1 | `deposits` kill | bool | on | Pause in-app card-deposit *collection* platform-wide (entry point + server core falls to manual) | Android, iOS-future, web | fail-open client / fail-closed server | **Required** — `requestDepositCore` must refuse card path | **KEEP → merged into `disabledCapabilities`** |
| C2 | `instagram_import` kill | bool | on | Kill IG connect/sync/import during a Meta API incident or review fallout | Android, web | fail-open client / server refuses sync | **Required** — `/api/mobile/instagram/*` + web actions | **KEEP → merged into `disabledCapabilities`** |
| C3 | `goods_commerce` kill | bool | off | Gate goods checkout | web | fail-closed | exists (`GOODS_COMMERCE_ENABLED`) | **REJECT** — duplicate of an existing fail-closed env gate on a parked feature |
| C4 | `checkout_addons` kill | bool | off | Gate add-on charging in prod | web | fail-closed | exists (`CHECKOUT_ADDONS_PROD_READY`) | **REJECT** — same |
| C5 | `push_notifications` kill | bool | on | Stop push during an Expo-push/FCM incident | Android | n/a client-side | server stops sending | **REJECT** — the kill is server-side only (`sendPushToArtist` already best-effort/never-throws); a client flag is unreachable by old builds and controls nothing |
| C6 | `maps` kill | bool | on | Disable map screens on tile-provider outage | Android, web | degrade in code | none needed | **REJECT** — handle with an error state in the map component (mechanism 1); cosmetic surface, no money/data risk |
| C7 | `flash_days` toggle | bool | on | Toggle flash-day surfaces | Android, web | — | — | **REJECT** — stable shipped feature; toggling a working feature is not an operational need (anti-pattern: component-level flag) |
| C8 | `link_hub` toggle | bool | on | Toggle Linklee hub | web | — | — | **REJECT** — same |
| C9 | `travel_mode` toggle | bool | on | Toggle travel/trips | Android, web | — | — | **REJECT** — same |
| C10 | `min_supported_version` (per platform) | string | `0.0.0` | Hard update floor / build recall | Android, iOS-future | fail-open | n/a (UX recall, not security — `min-version/route.ts:19-23`) | **KEEP AS-IS** — already exists server-side; migrating it to Firebase is rejected (§7 Q-analysis) |
| C11 | `recommended_version` soft update | string + optional message | unset | Nudge updates without blocking (no OTA ⇒ update velocity is the whole compat story) | Android, iOS-future | fail-open (unset ⇒ no banner) | none | **KEEP** — new key on the config endpoint |
| C12 | `onboarding_variant` | enum | `default` | A/B onboarding flows | Android, web | — | — | **REJECT** — no experimentation program exists; when one does, variant assignment belongs in the DB (per-account, sticky), not device-random RC |
| C13 | `emergency_notice` banner | JSON | unset | Remote messaging ("deposits paused, here's why") | Android, web | fail-open | — | **REJECT** — the notification pipeline already delivers this (`createNotification` with the existing `system_warning` type reaches feed + push on all builds) |
| C14 | `studios_guest_spots` rollout gate | bool | off | Gate the future studios/guest-spots/map feature | Android, web | fail-closed | required | **REJECT as a today-flag** — feature is not on master (worktree-only, roadmap §6.6). When it merges, it registers as a capability key in the same `disabledCapabilities` mechanism + entitlements; no new system needed |
| C15 | `paid_plan_gating` flip | bool | off | Flip free/plus enforcement when billing ships | all | fail-soft | entitlements | **REJECT** — this *is* the entitlement engine's job (`canAccess`, `/me` booleans old builds already obey); a parallel flag would duplicate authorization, which Remote Config must never own |

Per-candidate detail for the four survivors (C1, C2, C10, C11) — remaining required attributes:

| Attribute | C1 `deposits` | C2 `instagram_import` | C10 min-version (existing) | C11 `recommendedVersion` |
|---|---|---|---|---|
| Min supported app version | any build that ships the capability module (target 0.2.0); older builds are covered by the server-side half only | same | all builds (already live) | 0.2.0+ (older builds simply ignore it) |
| Rollout use case | Re-enable gradually after a deposit incident; keep off for a cohort during a Stripe migration | Dark-launch IG features after Meta app review flips to Live | Recall a bad money-path build | Nudge fleet onto a build before enabling a new capability |
| Rollback use case | **The** money panic switch: pause card collection without touching Stripe keys (which would also break refunds + webhook — `ot-12-rollout-runbook.md:237` caveat) | Stop a runaway import bug from purging/duplicating flash images (the class of bug the 2026-07-05 audit caught) | Block a build with an irrecoverable defect | n/a (informational) |
| Expected lifetime | **Permanent** (operational kill-switch, not a release flag) | Permanent (third-party dependency kill) | Permanent | Permanent |
| Removal condition | Never (review annually that it is still wired) | If IG integration is ever removed | Never | Never |
| Why alternatives are insufficient | (1) backward-compat can't pause a live capability; (2) version detection is not remote; (4) DB per-artist state exists (`stripe_account_status` flip) but is per-artist and touches real Connect data; (6) entitlements could mass-revoke but that rewrites real account rows and doesn't hide old-build UI. A deployment-level switch read by both server core and client is the only clean lever | Same shape: `MobileInstagram.configured=false` per artist is manual and per-row; a platform switch must not mutate account data | — | Store listing alone can't nudge; there is no OTA |

---

## 7. Flag reduction and challenge review

Applying the mandatory challenge questions:

**"Can this be removed entirely / can backward-compatible code eliminate it?"**
Removed C6 (map error state in code), C7–C9 (stable features; a toggle is pure debt), C5 (server already owns the off-switch). Backward-compatible contract rules (§4 rows 2, 5, 11, 12) replace any flag ambition for response shapes, mutations, and push payloads — those were never flaggable problems.

**"Is it duplicating subscription, permission, account-type, or backend logic?"**
Removed C15 (entitlements own plan gating; RC must not touch authorization), C3/C4 (existing fail-closed env gates on a parked feature — adding an RC mirror would create two sources of truth for money-path state, the worst possible duplication).

**"Will it become permanent configuration rather than a temporary release control?"**
C12 rejected on this ground (variant selection is product config, DB-owned). C1/C2/C10/C11 are *accepted knowing they are permanent* — they are operational kill/recall levers, the one category where permanence is the point. No temporary release-control flags survive at all, because release gating for new features is done by the release itself (feature ships dormant, server enables — §13).

**"Can it be merged with another flag?"**
C1 + C2 (and every future kill of this class, e.g. C14 when studios merge) collapse into **one mechanism**: `disabledCapabilities: string[]`. One list, capability-named entries, unknown entries ignored. This is the "single grouped feature flag" alternative (mechanism 7) and it wins because old builds consume it safely by construction: a build that doesn't know a capability name ignores it, a build that knows it obeys it.

**"Would an older app version even know how to consume it safely?"**
The decisive question for **Firebase RC as a whole**: no installed build has the SDK, so *no* RC parameter passes this test today. That converts every "dedicated RC parameter" verdict (mechanism 8) into either mechanism 3 (server capability check — chosen) or "wait for the fleet to contain RC-capable builds" (§17 triggers).

**"Does disabling it actually restore a coherent fallback experience?"**
Verified per survivor: `deposits` off ⇒ the manual-deposit flow, which is the *built-in* degradation path already exercised by un-entitled artists — coherent by construction. `instagram_import` off ⇒ the not-configured UI state that already exists (`MobileInstagram.configured=false`). Min-version ⇒ the UpdateRequired screen (coherent, if blunt). Rejected candidates C7–C9 fail this test: disabling them merely hides working screens and orphans data the artist already created — that is why they are rejected.

**"Is its operational value greater than its maintenance cost?"**
The surviving set is 2 capability keys + 2 version strings riding one endpoint that already exists in half-form. Cost ≈ one small route + one client module. Each rejected flag would have added a console value, a test matrix row, and a governance entry for zero operational scenarios.

### Reduction summary

| Stage | Contents |
|---|---|
| **1. Initial candidates** | 15 (C1–C15) |
| **2. After consolidation** | 4 controls: `disabledCapabilities` (absorbing C1+C2, future C14), min-version (C10, unchanged), `recommendedVersion` (C11); all server-side, 0 Firebase |
| **3. Final minimum viable set** | **3 config keys on one endpoint, 2 registered capability names, 0 Firebase parameters** (§8) |

Removed outright: C3, C4, C5, C6, C7, C8, C9, C12, C13, C15 (10). Merged: C1, C2 → `disabledCapabilities` (2 → 1 mechanism). Kept standalone: C10 (pre-existing), C11 (new).

---

## 8. Final minimum viable flag set

**Firebase Remote Config parameters: 0.**

**Server config plane:** extend the existing min-version pattern into `GET /api/mobile/config` (unauthenticated, fail-open, same `mobileOk` envelope):

```jsonc
{
  "data": {
    // identical semantics to /api/mobile/min-version (shared impl):
    "minVersion": "0.0.0",
    "updateRequired": false,
    "updateUrl": null,

    // NEW — soft update nudge; unset ⇒ no banner:
    "recommendedVersion": null,

    // NEW — the grouped kill mechanism; empty ⇒ nothing disabled:
    "disabledCapabilities": []
  }
}
```

**Registered capability names (the registry starts with exactly two):**

| Capability | Client effect when listed | Server effect when listed (authoritative) | Coherent fallback |
|---|---|---|---|
| `deposits` | Hide "Request card deposit" path; show manual-deposit UI | `requestDepositCore` takes the manual branch regardless of entitlement/routing (`bookings.ts:700-717` — the branch already exists; the switch adds one condition) | Manual deposits — the already-shipped degradation path |
| `instagram_import` | Hide IG connect/sync/import entry points | `/api/mobile/instagram/*` + web IG actions return `{code:"capability_disabled"}` | The existing not-configured UI state |

Config source, phase 1: env var `DISABLED_CAPABILITIES` (comma-separated; not `MOBILE_`-prefixed because the enforcement is platform-wide, web included) + existing `MOBILE_MIN_VERSION*` + new `MOBILE_RECOMMENDED_VERSION` — same operational muscle memory as the shipped kill-switch (set in Vercel, redeploy, ~2–3 min to effect). Phase 2 option if flip latency ever matters: a single-row `app_config` table editable from `/admin` (instant flip, `admin_action_log` audit) — see §17.

`/api/mobile/min-version` stays untouched forever: shipped binaries call it. `/api/mobile/config` supersedes it for 0.2.0+ builds; both share one implementation.

---

## 9. Rejected flags and the mechanism that owns each instead

| Rejected | Owner mechanism |
|---|---|
| Goods commerce / checkout add-ons kill | Existing fail-closed env gates (`GOODS_COMMERCE_ENABLED`, `CHECKOUT_ADDONS_PROD_READY`) |
| Push kill | Server-side: stop sending (`sendPushToArtist` is best-effort; feed remains source of truth) |
| Map kill; flash/link-hub/travel toggles | Backward-compatible code (error states); no toggle at all |
| Onboarding variants | Database (per-account, sticky) — if an experiment program ever exists |
| Emergency user messaging | Existing notification pipeline (`system_warning` type → feed + push on all builds) |
| Studios/guest-spots gate | Future capability-registry entry + entitlements, when the feature merges to master |
| Paid-plan gating | Entitlement engine (`canAccess`, `/me` booleans) — authorization never lives in remote config |
| Per-version flags | Version headers + server-side `clientAtLeast()` negotiation (§12) — reusable conditions, not flags |
| Percentage rollout of app code | Play Store staged rollout (binaries) + per-artist server cohorts (behavior) |
| Secrets, per-user state, business data, cosmetics | Explicitly out of scope per this plan's charter; owned by env/vault, DB, DB, and code respectively |

---

## 10. Recommended architecture

### 10.1 Shared contract (one source of truth, per founder rule)

`packages/shared/src/app-config.ts`:

```ts
export const CAPABILITIES = ["deposits", "instagram_import"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type MobileAppConfig = {
  minVersion: string;
  updateRequired: boolean;
  updateUrl: string | null;
  recommendedVersion: string | null;
  disabledCapabilities: string[]; // string[], NOT Capability[] — newer servers may send names this build doesn't know
};

export const DEFAULT_APP_CONFIG: MobileAppConfig = {
  minVersion: "0.0.0",
  updateRequired: false,
  updateUrl: null,
  recommendedVersion: null,
  disabledCapabilities: [],
};

// Tolerant parser: unknown keys dropped, wrong types → default, list entries coerced to strings.
export function parseAppConfig(raw: unknown): MobileAppConfig { /* … */ }
```

### 10.2 Client capability module (the only consumer surface)

`apps/mobile/src/lib/capabilities.ts` — no flag-name strings anywhere else in the app:

```ts
// Combines: bundled defaults → cached config (SecureStore/AsyncStorage) → fresh fetch
// → /me entitlement booleans → platform/version. Remote config NEVER the sole authority.
export function useAppConfig(): MobileAppConfig;          // fail-open, non-blocking
export function useCapability(cap: Capability): boolean;  // config ∧ entitlement ∧ version
export function canUseDeposits(me, config): boolean;      // = !disabled ∧ me.canCollectDeposits ∧ routeCharges…
export function canUseInstagramImport(me, config): boolean;
```

Rules:
- **Typed keys only** (`Capability` union) — a typo is a compile error.
- **Centralized bundled defaults** (`DEFAULT_APP_CONFIG`) — the app is fully functional having never fetched.
- **Runtime validation** via `parseAppConfig` — a malformed payload can only produce defaults, never a crash.
- **Separation of visibility vs authorization:** the hook may hide UI; every gated action is *also* refused server-side with a stable `code` (`capability_disabled`). Frontend flag manipulation changes nothing that matters.
- **Logging:** log config source (`bundled|cached|fetched`), applied `disabledCapabilities`, and parse failures to the existing `captureError` path. Never log user identifiers alongside config state (no PII).
- **Test helpers:** a `ConfigProvider`-style override for unit tests + a `__DEV__`-only local override (in-memory, set from a dev screen or env `EXPO_PUBLIC_DISABLED_CAPABILITIES`) so development never edits production values.

### 10.3 Server enforcement module

`apps/web/src/lib/server/app-config.ts`: reads env (later: DB row), exposes `isCapabilityDisabled(cap)` used by (a) the config route, (b) `requestDepositCore`, (c) the Instagram routes/actions. Web UI reads the same helper server-side — web needs no fetch layer at all.

### 10.4 What we deliberately do NOT build

- No Firebase RC SDK, no RC service/adapter — deferred behind §17 triggers, with the adapter design pre-agreed there so adoption is a swap of the fetch source *behind* `useAppConfig`, invisible to every consumer.
- No observable/reactive config re-rendering mid-session beyond the two screens that read capabilities (see §11 activation rules).
- No per-component flags, no cosmetic flags, no navigation driven by config.

### 10.5 Navigation rule

Tabs and screens are **never** remote-controlled. A disabled capability hides actions *within* screens (e.g. the card-deposit button) or shows the unavailable state — the screen itself, and all navigation to it, remains. This guarantees "safe navigation without dead links" under every config state and keeps the base MVP's shape constant.

---

## 11. Fetch and activation strategy

Modeled on the shipped min-version behavior, which is already correct:

- **Startup:** render immediately from bundled defaults + last cached config (read synchronously-ish from storage; do not block splash). Fire the `/config` fetch in parallel with the existing min-version query (0.2.0+ builds make one call instead of two).
- **Activation:**
  - `updateRequired` — applies immediately whenever it resolves true (existing behavior, `_layout.tsx:163`).
  - `disabledCapabilities` — applies on resolution, but consumers are entry-point renderers; an in-flight flow is not torn down mid-action. The server-side check catches any action that races the flip. No mid-session navigation changes.
  - `recommendedVersion` — banner on the home screen on next focus; dismissible per version value.
- **Cadence:** once per cold start + on foreground after ≥15 min background (matches react-query defaults already in the app). No polling, no real-time channel — Inklee has no concrete need for sub-minute config latency; the emergency path's latency budget is "minutes", met by env-flip + redeploy (Phase 1) or admin flip (Phase 2).
- **Offline / API down:** cached config if present, else bundled defaults; never block; never brick (identical to min-version's documented fail-open contract, `min-version.ts:11-18`).
- **Environments:**
  - **Development:** no fetch against prod required — `EXPO_PUBLIC_API_URL` already points wherever the dev server is; local override via the `__DEV__` helper (§10.2).
  - **Preview/staging builds (EAS preview profile):** same code path as prod against `https://inklee.app`; capability flips for testing use per-artist levers (entitlement overrides, `is_tester`) rather than global config, so testers never affect real artists.
  - **Production:** as above. Add `Cache-Control: s-maxage=60, stale-while-revalidate=300` on the config route so a fleet-wide launch storm hits the CDN, while a kill still propagates in ≤1 min past deploy.

---

## 12. App-version targeting strategy

- **Version source:** `Constants.expoConfig.version` (baked at build — already used by min-version and `devices.appVersion`); Android build number from EAS remote `versionCode`. Both are trustworthy-enough for UX gating; neither is a security input.
- **Comparison:** the existing `packages/shared/src/app-version.ts` semver-lite (`compareVersions`, zero-fill, suffix-drop, non-numeric → 0 — already malformed-input-safe and unit-tested). No new mechanism.
- **NEW — version signal on every request (the single highest-leverage change in this plan):** add to all six `api.ts` fetch wrappers:
  - `X-Inklee-App-Version: 0.2.0`
  - `X-Inklee-Platform: android`
  Server helper `clientAtLeast(req, "0.2.0")` (wrapping `compareVersions`; absent header ⇒ treated as `0.0.0`, i.e. oldest — protects against missing/malformed values by defaulting to the most conservative emission).
- **Emission rule (the policy that makes flags mostly unnecessary):** *new backend behavior must be backward compatible by default; where a response would carry a value or shape an old build cannot render safely (new enum value, changed money semantics), the server collapses or withholds it for clients below the capability version.* Example: when partial refunds ship, builds `< X` receive the deposit presented in pre-partial semantics (state stays `paid` with the refund detail withheld) rather than a new state that old code would misrender as fully refunded. Where no safe collapse exists, that feature's ship plan includes raising `MOBILE_MIN_VERSION` after a `recommendedVersion` grace window.
- **Version rules ladder:** `minVersion` (hard block, exists) → `recommendedVersion` (soft banner, new) → per-capability emission floors in code (`clientAtLeast`). **No hard-update behavior beyond the existing UpdateRequired screen**, and no security-critical use of version gating (auth/RLS protect data regardless of client version — `requireMobileUser` + RLS-as-the-artist).
- **Anti-pattern ban:** never one flag per app version; version conditions live in code as reusable `clientAtLeast` checks, and in config only as the two version strings.

---

## 13. Rollout and rollback process

### Standard sequence for a risky feature (adapted to Inklee's real levers)

1. **Ship dormant client support** — new screens/actions compiled into the next binary, entry points driven by server-computed booleans that the server still returns as `false` (the `canCollectDeposits`/`configured` pattern — already Inklee's idiom).
2. **Verify backend compatibility** — migration applied + `pg_policies` RLS check (AGENTS.md rule); confirm old-build request/response replay against the new backend (E2E suite).
3. **Enable internally** — per-artist: entitlement override or `is_tester` cohort via `/admin/accounts`. No global switch touched.
4. **Small production cohort** — per-artist server-side enablement (deterministic by account, sticky, auditable) — *not* device-percentage; the fleet is artists, and an artist may use web + app simultaneously, so the account is the only coherent rollout unit.
5. **Monitor** — Sentry (web), `captureError` (mobile), growth events (`/api/mobile/events`), Stripe dashboard for money paths.
6. **Expand** — widen the cohort; for binaries, Play staged rollout percentage.
7. **Rollback path** — per-artist: revert overrides. Platform: add the capability name to `disabledCapabilities` (documented result per capability in §8 — each restores a coherent, already-shipped fallback state, not a hidden-entry-point-with-live-guts). Build-level: raise `MOBILE_MIN_VERSION` above the bad build. Never remove Stripe keys as a kill mechanism (breaks refunds + webhook).
8. **Close the window** — when the fleet's oldest supported build understands the feature, delete the emission floor and any temporary cohort logic. `disabledCapabilities` entries are removed from the *registry* only if the capability itself is removed from the product.

### Firebase template versioning and restoration (applies only if/when RC is adopted per §17)

- Treat the RC template as code: export with `firebase remoteconfig:get -o rc-template.json` into the repo on every change; changes go through PR review like migrations.
- Use RC's built-in template history (`remoteconfig:versions:list`) and `remoteconfig:rollback` for restoration; note the template version number in the incident/agent log at every flip.
- One template, conditions per platform/version — never per-flag conditions duplicated across parameters.

---

## 14. Flag governance and cleanup

### Registry

`docs/architecture/capability-registry.md` — one table row per capability name and per config key, mandatory columns: **owner** (founder or Claude-maintained), **purpose**, **created**, **default**, **safe-disabled behavior**, **platforms**, **min compatible version**, **review date**, **removal condition**, **link** to the shipping decision/doc. The `CAPABILITIES` const in `packages/shared/src/app-config.ts` and the registry must stay in lockstep (same rule as the metric-definitions lockstep already enforced in the growth cockpit).

### Naming convention

- Capability names: `snake_case`, capability-level nouns describing user-facing ability (`deposits`, `instagram_import`), never components (`deposit_button`), never negatives (`disable_x` — the *list* carries the negation), never implementation details (`stripe_pi_v2`).
- Config keys: camelCase in the JSON payload matching `mobile-api.ts` house style.

### Recurring cleanup (quarterly, or at each "audit" session)

Checklist: capabilities never disabled since last review (fine — kill-switches are supposed to idle) · config keys unreferenced in code (delete) · duplicate control of one behavior by two mechanisms (consolidate — the C3/C4 rule) · emission floors (`clientAtLeast`) whose version is below the fleet minimum (delete the branch) · anything in config that has become permanent product state (move to DB/entitlements). The registry review date drives this; an entry past review blocks new capability additions until cleared.

### Addition bar

A new capability name requires: a written operational scenario (what incident flips it, who flips it, what users see), the coherent-fallback proof, and server enforcement identified — appended to the registry in the same PR that wires it. If the scenario is "we might want to turn it off someday", it is rejected.

---

## 15. Testing strategy

**Unit (Vitest, `packages/shared` + web lib):**
- `parseAppConfig`: missing keys, wrong types, unknown capability names, non-array `disabledCapabilities`, null payload → defaults, per-entry tolerance.
- `compareVersions` edge cases (already covered — keep).
- Capability resolution matrix: (config × entitlement × version) → expected boolean for each capability.
- `clientAtLeast`: absent header, garbage header, pre-release suffixes.

**Integration (route-level):**
- `/api/mobile/config` with each env permutation (unset ⇒ all-defaults disarmed; each capability listed; malformed env value).
- Server enforcement: `requestDepositCore` with `deposits` disabled ⇒ manual branch; Instagram route ⇒ `capability_disabled` code. **Backend authorization despite frontend flag manipulation** is covered here by construction: the client never sends flag state, so there is nothing to manipulate — assert the server checks its own source only.

**E2E (existing 23-test Playwright harness on local Supabase):**
- All-capabilities-disabled pass: base MVP flows (auth → booking request → accept → manual deposit → notification) green with `DISABLED_CAPABILITIES=deposits,instagram_import`.
- Each capability disabled individually: entry point absent on web, API returns coded error.
- Old-client simulation: replay requests **without** version headers against the new backend (server must treat as oldest and still serve every base-MVP response).

**Mobile (Jest + on-device checklist, extending the EAS-build sweep):**
- First launch offline / API down: app boots to sign-in on bundled defaults (Firebase irrelevant — no Firebase dependency exists; keep a test asserting startup has no RC/network hard dependency so this never regresses).
- Stale cache: capability disabled server-side while cache says enabled ⇒ action fails with coded error, no crash.
- New-server tolerance: fixture responses carrying unknown enum values (notification type/category, deposit state, action-item kind) render fallbacks, not crashes — this locks in the Phase 0 hardening.
- Deep link / push tap to an unknown route ⇒ `+not-found` screen (post-Phase 0), no crash.
- UpdateRequired with and without `updateUrl`; `recommendedVersion` banner show/dismiss.
- Platform matrix: Android now; parameterized for iOS later.
- Rollback drill (manual, staging): flip `deposits` off mid-session → in-flight request-deposit action returns the coded error, UI shows manual path on next visit.

---

## 16. Phased implementation plan

**Phase 0 — contract hardening (no flags involved; highest value-per-line).** Small independent PRs:
1. Add `X-Inklee-App-Version` + `X-Inklee-Platform` headers in `api.ts` wrappers + `clientAtLeast` server helper.
2. Replace `select("*")` in `notifications/route.ts` with an explicit column list; add fallbacks to `CATEGORY_ICON`/`PRIORITY_DOT` lookups; fix the `depositStatusLabel` default branch to a neutral label.
3. Replace `mobileMutation` error-string matching with structured error codes from the cores (retain string fallback for old messages).
4. Deduplicate `ALLOWED_STATUS` against `booking-fsm.ts`.
5. Add `+not-found.tsx` catch-all ("not available in this version" + update prompt).
6. Document the emission rule + additive-only wire policy in `mobile-api.ts`'s header comment (it is already half-written there).

**Phase 1 — the config plane (one slice).**
7. `packages/shared/src/app-config.ts` (types, defaults, parser, `CAPABILITIES`).
8. `GET /api/mobile/config` (shared impl with min-version; env-driven; CDN cache headers).
9. `apps/mobile/src/lib/capabilities.ts` + cached-config storage + `useAppConfig` wired into `_layout.tsx` beside the existing gate; `recommendedVersion` banner.
10. Server enforcement: `isCapabilityDisabled` in `requestDepositCore` + Instagram routes/actions; `capability_disabled` error code.
11. Registry doc + tests (§15). Ships in the next EAS build; devices before that build are protected by the server-side half alone (which is most of the protection).

**Phase 2 — optional, on demonstrated need.**
12. `app_config` DB row + `/admin` editor with `admin_action_log`, replacing env as the source behind the same server helper (zero client change) — only if env-flip latency (~minutes) ever proves too slow in a real incident.

**Phase 3 — Firebase Remote Config adoption, only on a §17 trigger.**
13. Add `@react-native-firebase/app` + `remote-config` (native build), an adapter that feeds `useAppConfig` as an additional source (client-side OR of `disabledCapabilities`, most-restrictive-wins for versions), template-as-code per §13. Cap: 3 parameters (`disabled_capabilities`, `min_supported_version_android`, `min_supported_version_ios`). Everything else in this plan is already RC-shaped, so this is a fetch-source swap, not a redesign.

---

## 17. Open decisions and assumptions

| # | Item | Assumption / decision needed |
|---|---|---|
| 1 | **RC adoption triggers** (the conditions under which Firebase parameters get created) | Adopt only when at least one holds: (a) fleet > ~500 devices AND a real incident demonstrated env-flip latency was too slow; (b) a needed kill must work while `inklee.app` itself is degraded *and* the app retains offline utility worth protecting (not true today — the app is inert without the backend); (c) Play staged rollout + per-artist cohorts prove insufficient for a specific risky native-capability launch. Founder sign-off required either way. |
| 2 | Config source phase 2 (env vs `app_config` row) | Assumed: stay env-driven until an incident proves otherwise. |
| 3 | iOS | Assumed: same design applies unchanged (`_IOS` env vars and platform header already designed in); nothing ships until Apple enrollment resolves. |
| 4 | Fold min-version into `/config` for new builds | Assumed yes (one call), `/min-version` kept forever for old builds; both share one implementation. |
| 5 | Partial refunds / new deposit states | Assumed they WILL ship someday; the emission rule (§12) + a min-version floor is the agreed handling. The plan does not add a flag for them. |
| 6 | Paid-plan flip | Owned entirely by entitlements; assumed no remote-config involvement ever. Old builds already obey `/me` booleans, which is the compatibility story. |
| 7 | Web | Assumed zero web remote-config need (continuous deploy + env gates + Vercel rollback). Revisit only if web ever gets an installable/offline mode. |
| 8 | `emergency_notice` messaging | Assumed the existing `system_warning` notification path is sufficient for incident comms. |

---

## Final recommendation

- **Number of initial candidate flags:** 15
- **Number removed:** 10 (C3–C9, C12, C13, C15 — owned by existing env gates, backward-compatible code, DB, entitlements, or the notification pipeline)
- **Number merged:** 2 → 1 (C1 `deposits` + C2 `instagram_import` into the single `disabledCapabilities` mechanism; future kills join the same list instead of adding parameters)
- **Final number of Firebase Remote Config parameters: 0**
- **Final parameter names:** none in Firebase. Server config keys: `minVersion` / `updateRequired` / `updateUrl` (pre-existing), `recommendedVersion` (new), `disabledCapabilities` (new — registered capability names: `deposits`, `instagram_import`)
- **Why this is the minimum necessary set:** every candidate either (a) duplicates a mechanism Inklee already operates (fail-closed env gates, entitlements, per-artist DB state, notification pipeline), (b) toggles a stable feature with no operational scenario, or (c) cannot be consumed by any installed build because the Firebase SDK isn't in the app and there is no OTA. The two capabilities that survive are the two with real incident scenarios (money-path pause without collateral damage; third-party-API kill) and coherent already-shipped fallbacks — and they ride one grouped mechanism on a channel every future build already fetches at launch.
- **Maximum acceptable parameter count for the MVP:** 0 Firebase parameters; 3 server config keys; if Firebase RC is later adopted under trigger #1, hard cap of **3** Firebase parameters (`disabled_capabilities`, `min_supported_version_android`, `min_supported_version_ios`).
- **Conditions under which another flag may be added:** a written operational scenario (incident, operator, user-visible result), proof of a coherent fallback, identified server-side enforcement, a registry entry with owner/review/removal fields in the same PR — and no existing mechanism (backward-compatible code, version negotiation, entitlements, per-artist DB state, env gate) that already owns the behavior. "We might want to toggle it" is an automatic rejection.
