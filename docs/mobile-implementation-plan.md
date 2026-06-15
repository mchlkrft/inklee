# Inklee mobile app — implementation plan (orchestrator synthesis)

**Date:** 2026-06-05 · **Status:** PRE-CODING plan, approved by the orchestrator. Build starts at Slice 1 after this.
**Owner:** orchestrating agent (this plan owns sequencing, scope control, quality bar).
**Inputs:** 5 specialist agent audits (Backend/API+Parity, Expo Architecture+Spike, UX/IA+Screens, Auth/Security+Payments, Push/Analytics/QA), all read-only against `A:\WORK\inklee`.
**Scope target:** the FULL artist feature set as a real, native-feeling app. **Execution method:** rational vertical slices with acceptance gates. The full app is the goal; big-bang is forbidden.

---

## 1. Recommended repo structure — in-place pnpm monorepo

Convert the existing single-package repo into a pnpm workspace **in place** (not a separate repo — a separate repo forces a published shared package + invites drift).

```
inklee/
├─ pnpm-workspace.yaml            # packages: ["apps/*", "packages/*"]
├─ .npmrc                         # node-linker=hoisted  (Metro + pnpm symlink friction)
├─ apps/
│  ├─ web/                        # the CURRENT Next.js app moves here (src/, next.config.ts, …)
│  └─ mobile/                     # new Expo app
└─ packages/
   └─ shared/                     # "@inklee/shared" — PURE TS only (types/schemas/enums/fee math)
```

- **`packages/shared` ships SOURCE `.ts`, not compiled JS** — both Turbopack (web) and Metro (mobile) transpile TS directly; no build step. Hard rule: no `next/*`, `react`, `react-native`, Supabase client, or Node built-ins in `shared`.
- Pure modules to move/re-export from `shared`: `booking-fsm`, `booking-schema` (incl. `SIZE_LABELS`/`formatSize`), `platform-fee`, `entitlements` (already documented PURE), `deposit-policy`, `deposit-settings`, `connect-countries`, `connect-requirements`, `notification-types`, `status-labels`, `booking-domain`, `date-utils`, `timezone`, `format`, `slug`, `trip-validation`, `studio-validation`, `custom-fields`, `books-settings`, `dashboard-settings`.
- **Server-only stays in the web app, reached only over HTTP:** `stripe*`, `supabase/service`, `email/*`, `image-processing` (sharp), `entitlements-server`.
- **Vercel:** set Root Directory = `apps/web`. **Husky pre-commit `pnpm build`** must become workspace/path-scoped so a mobile-only commit doesn't `next build`.

**M0 migration slice** (do FIRST, before any mobile code): `git mv src → apps/web/src`, add the workspace files, fix the `@/*` alias scope, re-confirm the web build is green + deploys, move the pure modules into `packages/shared` and codemod web imports. M0 is a discrete, prod-affecting refactor → its own PR + green-build gate.

## 2. Expo architecture decision

- **Stack: Expo / React Native** (locked; not a WebView wrapper). Reasons: the app is now a _primary_ artist surface for a critical, visual, mobile-first audience; native feel is the mandate; both Expo and a serious Capacitor build need the new `/api/mobile` layer anyway (there is no REST API today), so Capacitor's reuse advantage is partly reuse of the wrong thing (the desktop dashboard).
- **Router: Expo Router** (file-based) — mirrors the Next App Router mental model the team already uses, and makes deep-linking from push (`cta_href` → screen) nearly free.
- **UI: NativeWind v4** backed by a JS mirror of the `globals.css` brand tokens (`brand.mustard #e9b22b`, `rosa #db88b9`, `charcoal #1e1e1e`, `bone #e5e1d5`); ~16 core primitives (Screen, Button, Card, ListRow, Sheet, EmptyState, StatusPill, Field/Select-as-sheet, MoneyRow/FeePreview, Image via `expo-image`, Skeleton, Toast). No tables (cards + list rows); ≥48pt targets; ≥16px body; 1.5px borders.
- **Native modules:** `expo-notifications`, `expo-image-picker`+`expo-image`, `expo-secure-store`, `expo-web-browser`/`expo-auth-session`, `expo-apple-authentication`, `expo-linking`, `expo-splash-screen`, `@sentry/react-native`. All Expo-config-plugin compatible (no manual native code).
- **Build: EAS** (dev / preview / production profiles). **EAS cloud build produces the iOS binary without a Mac** — key for a Windows founder. EAS Update (OTA) for JS-only fixes without store review.

## 3. Expo vs Capacitor spike — result

**Verdict (architecture-level): Expo.** It directly satisfies the "real native app, not a web dashboard" mandate; Capacitor's 95% reuse is undercut by (a) needing `/api/mobile` regardless and (b) the verified cross-origin problem — the web uses cookie-SSR Server Actions, so a Capacitor shell hits WKWebView cookie quirks + Server-Action-over-CORS.
**Capacitor would only win if ALL hold:** a hard ~2-week deadline becomes overriding, AND native feel is explicitly downgraded to "acceptable," AND a 4-hour cross-origin-auth counter-spike proves trivial, AND the beta is treated as throwaway. None hold.
**On-device confirmation (founder runs, 2 days, before full commit):** Day 0 prereqs (Apple Developer Program under Inklee OÜ — start D-U-N-S now; Google Play $25; Expo account; `eas-cli`; Expo Go on a real iPhone+Android). Day 1: scaffold `apps/mobile`, build login→inbox→detail→accept against a dev `/api/mobile` stub, run on devices via Expo Go + one `eas build --profile preview` to prove cloud iOS build from Windows. Day 2 (≤4h): Capacitor counter-spike — log in in a WebView + fire one Server Action; if you fight cookies/CORS, verdict confirmed. Default outcome: proceed with Expo.

## 4. Full feature parity matrix (condensed; full per-row detail in agent audit)

Every artist module maps to: mobile screen(s) + `/api/mobile` endpoint(s) + slice. Risk H rows are the watch-list.

| Module               | Mobile home                            | Key endpoints                                                                                    | Slice                      | Risk                          |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------- | ----------------------------- | --------------- | ------------------- |
| A Onboarding         | Native wizard (redesign)               | `/onboarding/*`, `/onboarding/slug`                                                              | 4                          | M                             |
| B Dashboard/home     | Home tab                               | `GET /home`                                                                                      | 1                          | L                             |
| C Booking requests   | Requests tab + detail + sheets         | `GET /bookings`, `/bookings/:id`, `POST .../approve                                              | reject                     | cancel`, `.../deposit/\*`     | 1–2 (deposit 4) | C5/C7 deposit **H** |
| D Calendar           | Calendar tab (redesign)                | `GET /calendar`, `POST/PATCH/DELETE /appointments/:id`                                           | 3                          | M                             |
| E Clients            | Clients tab + detail                   | `GET /clients`, `/clients/:email`, `PUT .../notes`                                               | 3                          | L                             |
| F Waitlist           | Segment under Requests/Clients         | `GET /waitlist`, `POST /waitlist/:id/{contacted,convert,dismiss}`                                | 3                          | M                             |
| G Link & form        | More → Set up                          | `GET/POST /form/fields` (+reorder), `POST /booking-settings`                                     | 5                          | M                             |
| H Slots/availability | More → Set up (redesign)               | `GET/POST /slots`, `/slots/pattern`, `/slots/block`, `DELETE /slots/:id`, `POST /books-settings` | 5                          | M                             |
| I Flash              | More → Grow                            | `/flash/items*`, `/flash/days*`                                                                  | 7                          | M (IG import **H**, web-view) |
| J Guest spots/travel | More → Grow                            | `/trips*`, `/trip-legs*`, `/studios*`                                                            | 8                          | M                             |
| K Goods (showcase)   | More → Grow                            | `/goods*` (status)                                                                               | 9                          | M                             |
| L Analytics          | More → Insights (redesign or web-view) | `GET /analytics?range=`                                                                          | 10                         | M                             |
| M Notifications      | Top-bar bell + feed                    | `GET /notifications`, `POST .../read                                                             | read-all`, `POST /devices` | 1 (push 3)                    | push **H**      |
| N Settings           | More → Account                         | `/settings/*`, `/account/*`, payouts (web-view), KYC (web-view)                                  | 6/11/12                    | KYC/MFA **H**                 |
| Web-only             | —                                      | public `[slug]`, `request/[token]`, marketing, legal, admin                                      | —                          | stays web                     |

**Redesign-required (do NOT copy web UI):** onboarding wizard, calendar, slots, analytics, MFA enroll, booking-interests decisions.

## 5. Mobile navigation / information architecture (RATIFIED)

**Bottom tab bar — 5 tabs:** **Home · Requests · Calendar · Clients · More.** (Orchestrator decision: Home and Requests are both daily and distinct — Home = "what needs action," Requests = triage inbox; this beats merging them. Showcase modules are NOT tabs.) **Notifications = top-bar bell** on Home (push is the primary channel; a tab would compete with Requests).
**"More" hub** (progressive disclosure, grouped list rows with state hints): a tappable **public-preview banner** at top, then GROW (Flash, Guest Spots, Goods), SET UP (Link & form, Slots, Books open/closed, Deposits setup), INSIGHTS (Analytics, Notifications archive), ACCOUNT (Profile/bio, Email templates, Payouts, Calendar export, Plan→web, Security, Help/Legal/Sign out).
**Daily loop never goes >1 push deep:** Home → Requests → request detail → Accept/Pass/Request-deposit (**bottom sheets**) → Calendar. Sheets (not full pages) for accept/pass/deposit/reschedule/filters/compose — the triage loop stays thumb-reachable.
**"Always understand" grammar:** a reused **"Clients see this"** chip on every public field; a single **Books OPEN/CLOSED** pill (Home top bar + More + toggle, one source of truth); Home's top section = "Needs action"; **"Preview as client"** on every brand-affecting surface; studio visibility shown in plain words.

## 6. `/api/mobile/*` endpoints (grouped, slice-ordered)

**Auth for all:** `Authorization: Bearer <supabase_access_token>`; a shared `requireMobileUser(req)` validates the JWT and returns a per-request RLS-scoped Supabase client (anon key + user token). **Never** the service-role key or Stripe secret on device. Envelope `{ data } | { error: { code, message } }`.

- **Slice 1:** `GET /me`, `GET /home`, `GET /bookings?status=&cursor=`, `GET /bookings/:id`, `GET /notifications`, `POST /notifications/read`, `/read-all`.
- **Slice 2:** `POST /bookings/:id/{approve,reject,cancel}`, `POST /books-settings`.
- **Slice 3 (push):** `POST /devices`, `DELETE /devices/:token`.
- **Slice 4 (deposits/payouts):** `POST /bookings/:id/deposit/{request,manual,received}`, `GET/POST .../deposit/refund`, `GET/PUT /settings/deposit-defaults`, `/deposit-policy`, `GET /settings/payouts/status`, `POST /settings/payouts/kyc-link` (returns a one-time web-view URL; PII never through JSON).
- **Slice 5:** `GET /calendar`, `POST/PATCH/DELETE /appointments/:id`, `POST /calendar/ical-token`.
- **Slice 6:** clients, waitlist, interests endpoints.
- **Slice 7:** form/fields, slots.
- **Slice 8:** onboarding, profile, uploads (`POST /uploads/image` multipart → server sharp), reminders, account.
- **Slice 9:** flash, travel. **Slice 10:** goods, analytics. **Slice 11:** web-view URLs (IG, templates, MFA recovery).
- **Analytics:** `POST /analytics` (server strips IP → Plausible Events API).

## 7. Data-model additions

One new table (migration `0046_device_tokens.sql`); everything else reuses existing tables.

```sql
CREATE TABLE device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL,                       -- Expo push token
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artist_id, token)
);
CREATE UNIQUE INDEX device_tokens_token_idx ON device_tokens(token);
CREATE INDEX device_tokens_artist_idx ON device_tokens(artist_id);
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artist manages own tokens" ON device_tokens FOR ALL
  USING (artist_id = auth.uid()) WITH CHECK (artist_id = auth.uid());
```

Plus: `profiles.settings.push_prefs` JSONB (per-category push opt-in; no migration). Optional later: 30-day soft-delete `deleted_at` for account deletion (GDPR-friendly) instead of immediate hard delete.

## 8. Screen inventory

~**50 screens/sheets** across modules A–N (full table in the UX audit). ~18 are the core daily loop (Slices 1–3); the rest are progressively disclosed (4–12). Every screen has a defined empty / loading / error pattern (skeletons not spinners; cached-then-revalidate; tiered errors; tiered destructive confirms; optimistic toggles).

## 9. Rational slice plan

| Slice  | Title                                                                                                       | Gate                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **0**  | ✅ Audit + architecture + spike (THIS plan)                                                                 | done                                                                  |
| **M0** | Monorepo migration (`apps/web` + `packages/shared`), web build green + deploys                              | web regression suite green; Vercel root dir flipped                   |
| **1**  | Expo foundation + auth + first `/api/mobile` (me/home/bookings/notifications) + shell + nav + UI primitives | login persists; home + inbox render from API on device                |
| **2**  | Booking core (inbox, detail, accept/pass/cancel, references, deposit if entitled)                           | FSM-correct actions round-trip; sheets feel native                    |
| **3**  | Notifications + push (device tokens, register, push on new request, deep link)                              | real push on both platforms → correct screen                          |
| **4**  | Onboarding + public booking link (first-10-minutes excellence)                                              | new artist → live shared link in <10 min                              |
| **5**  | Calendar, slots, availability, books open/cap                                                               | create/edit appointment; toggle books                                 |
| **6**  | Clients + waitlist                                                                                          | history + notes; convert waitlist                                     |
| **7**  | Flash                                                                                                       | item/day CRUD + public preview                                        |
| **8**  | Guest spots / travel                                                                                        | trips/legs/studios                                                    |
| **9**  | Goods (showcase)                                                                                            | showcase CRUD, no checkout                                            |
| **10** | Analytics + polish                                                                                          | mobile-readable stats; state sweep                                    |
| **11** | Settings, payouts, deposits, templates, KYC web-view                                                        | KYC reachable; deposit settings                                       |
| **12** | Beta release readiness                                                                                      | TestFlight + Play internal; review pack; web regression; quality gate |

(Onboarding sits at Slice 4 deliberately: the core triage loop + push must exist first so the "send yourself a test request" moment in onboarding actually lands.)

## 10. Acceptance criteria per slice (template)

Each slice ships only when: **(a)** every screen has empty/loading/error states; **(b)** destructive actions dual-confirm, saves give feedback; **(c)** no client PII in push/analytics; **(d)** `pnpm typecheck`+`pnpm test` green on `apps/web`; **(e)** the web app does not regress (run the §12 regression list); **(f)** `eas build --profile preview` succeeds; **(g)** on-device check on a real iPhone + Android. Per-slice push/analytics/web-regression sub-checklists per the QA audit.

## 11. Risk register

| Risk                                                                                 | Sev   | Mitigation                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 monorepo migration breaks the live web build/deploy                               | **H** | Do M0 as its own PR; re-confirm green build + a prod smoke deploy before any mobile code; Vercel root-dir change verified on a preview deploy first |
| Cookie-session Server Actions don't work for native                                  | **H** | New `/api/mobile` + `requireMobileUser` Bearer-JWT layer; never reuse cookie actions from the app                                                   |
| In-app subscription purchase → Apple/Google IAP rejection (15–30%)                   | **H** | NO subscribe CTA in app; plan management web-only; don't even show price with a buy action                                                          |
| Sign in with Apple missing while Google offered → iOS rejection                      | **H** | Build `expo-apple-authentication` before first TestFlight                                                                                           |
| In-app account deletion missing → iOS rejection + GDPR gap (NOT built on web either) | **H** | Build self-service deletion (web + app) before submission; cancel live intents on delete                                                            |
| Stripe Connect KYC PII through mobile JSON                                           | **H** | KYC via in-app browser (SFSafariViewController/Custom Tab) to existing `/settings/payouts`; never a native PII JSON form                            |
| Push payload leaks client/tattoo data                                                | **H** | Generic titles ("New booking request"); fetch details only after authed open                                                                        |
| Business logic duplicated web↔mobile (fee/FSM/entitlements)                          | **M** | Call server or import `packages/shared` pure tier; never reimplement on device                                                                      |
| Heavy action duplication (dashboard/_ vs bookings/_, slots/fields/books/templates)   | **M** | Consolidate to single `lib/server` services during extraction                                                                                       |
| sharp + Vercel 4.5MB body cap on image upload                                        | **M** | On-device compress (`expo-image-manipulator`) before multipart upload                                                                               |
| Apple "web wrapper" minimum-functionality bar                                        | **M** | Push + camera + deep links clear it (Expo is unambiguously native anyway)                                                                           |
| Metro + pnpm symlink resolution                                                      | **L** | `node-linker=hoisted`; ship shared as source                                                                                                        |

## 12. Store / tester readiness checklist

- Apple Developer Program (Inklee OÜ, D-U-N-S) + Google Play Console ($25) — **prerequisites, start now**.
- EAS credentials (managed APNs p8 + FCM service account — never in repo/Vercel).
- TestFlight (internal + external) + Play Internal Testing tracks.
- Review pack: privacy policy URL (`/privacy`, live), **in-app account deletion**, demo account (`review@inklee.app`, seeded fake data, no real Stripe), review notes (app is artist-facing; public/client side is web), metadata, screenshots (6.9"/6.5"/iPad), 1024² icon (no alpha), splash, **Privacy Nutrition Label + Play Data Safety form** (push token + crash + cookieless analytics; no tracking).
- **Minimum quality gate before first beta artist:** push end-to-end on both platforms from a real form submit; zero-PII payload audit; cold-start deep link resolves; token cleanup on sign-out; account deletion live; demo account ready; privacy forms submitted; web regression green; Sentry RN verified; `device_tokens` RLS confirmed.

## 13. Temporary web-view exceptions

**Allowed (in-app browser, documented as temporary):** Stripe Connect KYC, advanced email-template editor, complex analytics drill-down, legal/privacy, rare account-security/2FA-enroll flows.
**Never web-view:** onboarding, dashboard/home, booking inbox, request detail, public-link setup (artist side), core booking actions, push/notification flow, basic settings, calendar, clients list.

## 14. Assumptions

1. Founder's machine lacks the iOS/Android native toolchain → EAS cloud build resolves the Mac gap; Apple Developer + Google Play org accounts not yet created (gating prereq).
2. Goods stay showcase-only (`GOODS_COMMERCE_ENABLED` off) on mobile.
3. Solo Plus subscription is comped for the beta → no in-app billing needed now; purchase stays web permanently (IAP avoidance).
4. `/dashboard/*` is legacy vs canonical `/bookings/*`; consolidate during extraction.
5. Entitlement check (`canAccess`) is callable to gate deposit UI client-side (pure module).
6. Slice numbering follows the founder's 0–12 plan; M0 inserted as a prerequisite to Slice 1.

## 15. What stays WEB-ONLY (hard boundary)

Public artist bio/booking pages `/[slug]` (+ `/flash`, `/waitlist`); the client magic-link portal `/request/[token]` (view/edit/cancel + **card payment**); all marketing/SEO/GEO pages; all legal pages; the `/admin` backend. The app is **artists-only**; it deep-links out to these where needed and never embeds the client payment flow.

---

## Cross-cutting NEW work surfaced (not mobile-only)

- **Self-service account deletion** must be built on the WEB too (Apple req + GDPR Art. 17) — currently only an admin action exists.
- **`notifyArtist()` shared server fn** wraps the existing `createNotification` and fans out push — migrate webhook + booking-action + cron call-sites to it.
- **De-duplicate** the legacy `dashboard/*` ↔ `bookings/*` action trees during `lib/server` extraction.

_Authoritative source: this doc. Companion: `docs/mobile-strategy.md` (stack analysis), `docs/mobile-app-handoff-chatgpt.md` (ChatGPT scope brief). Update this plan if the web product changes materially._
