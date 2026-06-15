# Inklee Mobile App — Consolidated Audit (2026-06-08)

Four independent read-only audit agents reviewed `apps/mobile` + the `/api/mobile/*`
backend layer against `docs/mobile-implementation-plan.md`. Lenses: (A) code quality
& RN best practices, (B) architecture & future-readiness, (C) feature-goal alignment
& plan conformance, (D) security, auth & money-path. This is the synthesis.

State at audit: branch `feat/mobile-e1`, HEAD ~`fd27de7`. 5 tabs built (Home,
Requests, Calendar, Clients, More), Apple/Google sign-in, booking detail + money
actions, Intl swept. ~28 mobile source files, 22 API routes, **0 tests**.

## Scorecard

| Lens | Grade / Verdict |
|---|---|
| Code quality & RN practices | **B+ / A−** — clean, idiomatic; gaps are verification not structure |
| Architecture & future-readiness | **B+** — sound for ~10 screens; 3 deferred load-bearing abstractions |
| Feature-goal alignment | **Faithful but early (~Slice 6 of 12); NOT yet beta-submittable** |
| Security / auth / money-path | **PASS — LOW risk.** No Critical/High. No cross-tenant access. Money path correct. |

**Headline:** This is a strong, secure, faithful foundation. The work ahead is
*installing three consciously-deferred abstractions* (server-state cache, hardened
API contract, app shell) and *building unbuilt launch-blocker scope* (account
deletion, notifications/push, books toggle, onboarding) — **not fixing mistakes.**
The code's comments prove deep awareness of the exact traps (Hermes Intl, double-React,
PKCE, MoR) — the team knows what it deferred and why.

## What's genuinely strong (do not "fix")

- **Security model is correct, defense-in-depth.** Every route `requireMobileUser`-gated;
  JWT *validated* via `supabase.auth.getUser()` (not decoded-and-trusted); RLS-scoped
  anon client, never service-role on device; SecureStore (not AsyncStorage); PKCE.
- **Money path = thin wrapper over the same shared `*Core` fns as web** — no divergence.
  Idempotency layered (audit-log + Stripe keys); webhook pins paid amount to server value;
  FSM blocks re-request after payment; cancel refunds-first-or-aborts (no stranded money).
- **Business logic not duplicated** — FSM/fee/labels/customerLabel from `@inklee/shared`.
- **Monorepo/Metro traps solved deliberately** (disableHierarchicalLookup, hoisted linker).
- **iOS Intl trap pre-empted** (`lib/date.ts`).
- **Per-screen UX bar met** — pull-to-refresh, dual-confirm destructive actions,
  lazy deposit form, German comma-decimal handling.

## Cross-cutting findings (convergent — flagged by 2+ agents = high confidence)

| ID | Finding | Agents | Severity | Fix |
|---|---|---|---|---|
| X1 | **Server↔client types hand-mirrored + `apiGet` casts `as T` unchecked** — a backend field rename ships a runtime `undefined`/white-screen with zero compile error. Biggest latent-bug class. | A(H2), B(M3) | High | Export `/api/mobile/*` response types from `@inklee/shared`; both route + `useApiQuery<T>` reference the same `T`. Extend the `lib/bookings.ts`/`clients.ts` pattern to home/me/profile/payouts/bookings-list. |
| X2 | **No shared data/cache layer.** `useApiQuery` is screen-local: no cache, dedup, invalidation, pagination, or mutation primitive. After a booking mutation only the detail refetches; list/home/clients go stale. Unread-badge-across-screens (E3) is unbuildable on it. | B(H1,H2,M1), A | High | Adopt **TanStack Query** before E3; keep `apiGet/apiPost` as fetcher. Delivers cache + `invalidateQueries` + `useInfiniteQuery` (the `nextCursor` is already built server-side) + `useMutation` (optimistic toggles). |
| X3 | **No root error boundary** — any render throw white-screens the whole app (compounds X1). | A(H1), B(M5) | High | Export `ErrorBoundary` from `app/_layout.tsx` (Expo Router convention) + charcoal fallback. |
| X4 | **`EXPO_PUBLIC_API_URL` dual fallback** — `api.ts` defaults `""` (relative → fails on native), `more.tsx` defaults `"https://inkl.ee"`. Two sources of truth, one broken. | A(L1), B(M2), D | Medium | One `lib/config.ts` reading/validating all `EXPO_PUBLIC_*`; fail loud if `API_URL` unset. |
| X5 | **Android `RECORD_AUDIO` permission** present, no audio feature — Play Data-Safety friction + leftover from image-picker default. | C(D3), D(L3) | Medium | Remove from `app.json`. |
| X6 | **Reference images path-only** ("viewable on web") — a triage parity gap an artist feels immediately. | A,B,C,D | Medium | Small signed-URL endpoint, per-artist short-TTL. |
| X7 | **No mobile typecheck/lint in pre-commit or CI** — a mobile type error commits clean (esp. costly given X1). No tests at all. | A(M4,M5,M6) | Medium | Add `cd apps/mobile && pnpm typecheck` to husky; stand up CI; first unit tests on `calendar.ts` grid math + FSM gating. |

## Security hardening (Agent D — all Low/Medium, mostly pre-push)

- **D-M1 — `device_tokens` upsert squatting:** `onConflict:"token"` lets artist B re-register
  artist A's globally-unique Expo token to themselves → notification misrouting once push lands.
  Fix before E3 (reject conflict when existing `artist_id != caller`).
- **D-M2 — No upper cap on deposit `amount`** (floor only). Add a server-side ceiling + 2-decimal
  validation in `requestDepositCore` (benefits web too).
- **D-L1 — `dueAt` server-unvalidated** (client checks `isDateKey`, server must too).
- **D-L2 — Sign-out doesn't deregister push token** — call `DELETE /devices` before `signOut()`
  while JWT still valid. Required step when E3 lands.

"Can artist A access artist B's data?" → **NO** for bookings, clients, calendar, settings,
notifications, waitlist, analytics, home (app-layer `artist_id` filter + RLS backstop).
Only caveat = D-M1 registration edge, pre-push.

## Plan conformance (Agent C)

**Load-bearing decisions all MET:** Expo stack, 5 tabs, artists-only boundary, no-IAP,
Sign in with Apple, Bearer-JWT/RLS API, deposit money-path, brand tokens. **No drift.**

**Missing (unbuilt scope, not deviation):**
- **Notifications top-bar bell + feed — MISSING** (endpoints exist, zero UI). The `_layout.tsx`
  comment claims a bell "per screen" — stale (D2).
- **Ghost endpoints (backend ready, no UI):** `notifications`, `notifications/read[-all]`,
  `devices`, `waitlist`, `analytics`. 4 feature areas = fast-follow UI work.
- **"More" hub ≠ ratified IA** — built as Account/Payments/About (mostly read-only); plan
  specified GROW/SET UP/INSIGHTS/ACCOUNT groups + public-preview banner + Books toggle (D1).
- Calendar is read-only (no appointment CRUD/slots). Client notes read-only. All settings
  GET-only (no editing). Onboarding, Flash, Guest-spots, Goods, image upload — absent.

## Launch blockers (gate a TestFlight/Play beta) — priority order

1. **🔴 In-app account deletion — MISSING.** Apple 5.1.1(v) hard reject + GDPR Art. 17.
   No UI, no `/api/mobile/account/*`, no self-service delete on web either. **Buildable now
   without the Apple account.** Biggest single blocker.
2. **🔴 Notification surface + push — MISSING.** Push is the product's stated reason to exist;
   also leans Apple's "minimum functionality / not a web wrapper" bar. Endpoints dead, no
   registration/deep-link. Migration 0046 also still unapplied. (iOS push Apple-gated; Android
   FCM + the in-app UI buildable now.)
3. **Books OPEN/CLOSED toggle — MISSING.** Core "one source of truth" control; display-only today.
4. **Onboarding first-run — MISSING.** New artist hits read-only screens with no path to set
   slug/profile. Needs a third router state (`onboardingCompleted`) — refactor of `_layout.tsx`.

## Future-readiness scorecard (Agent B)

| Upcoming | Rating | Note |
|---|---|---|
| E3 Push | Needs new abstraction | forces the cache/badge layer (X2); registration + deep-link + dedupe |
| Settings mutations | Needs new abstraction | GET-only today; no PUT routes, no `useMutation` primitive |
| Account deletion | Minor (mobile) / server work | confirm screen small; cascade + Stripe teardown is the real work |
| Onboarding | Needs refactor | binary auth gate → 3-state; nested wizard stack |
| Flash/Guest/Goods | Minor work | slot into the existing screen+endpoint+query template |
| Analytics | Ready | `/analytics` computes stats; needs a screen + `useAnalytics()` |
| German i18n | Needs refactor | 100% hardcoded English; web is en+de; land `t()` before screen count triples |

## Recommendation — a short "harden + foundation" pass BEFORE more feature tabs

The cheapest-now/expensive-later items cluster. Suggested order:

**Tier 0 — quick wins (hours):** remove RECORD_AUDIO (X5); single `config.ts` + fix API_URL
fallback (X4); root error boundary (X3); deposit amount cap + `dueAt`/amount server validation
(D-M2/L1); use shared `isTerminal`/`canTransition` in `BookingActions` (A-H3); wire mobile
typecheck into pre-commit (X7).

**Tier 1 — foundation (before E3):** share API response types via `@inklee/shared` (X1);
**decide on TanStack Query** (X2) — recommended yes, it's the next slice's prerequisite; stub
the app shell (Sentry init, `useAnalytics()`, i18n `t()` wrapper) so they're habits not retrofits.

**Tier 2 — top launch-blocker that needs no Apple account:** account deletion (server
`DELETE /api/mobile/account` + confirm screen + Stripe teardown).

Then resume feature slices (notifications UI, books toggle, onboarding, calendar write…),
now on a hardened base.

— Generated 2026-06-08 by a 4-agent audit; raw agent reports in session transcript.
