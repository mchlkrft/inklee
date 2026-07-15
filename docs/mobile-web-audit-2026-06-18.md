# Mobile ↔ Web full audit (parity · one-source-of-truth · security · launch connectors)

**Date:** 2026-06-18
**Scope:** `apps/web` (Next.js Server Actions + `/api/mobile/*`), `apps/mobile` (Expo), `packages/shared`.
**Method:** 44-agent workflow (17 feature domains × parity + adversarial re-check, 6 security sweeps, 2 connector sweeps, critical/high finding verification) cross-checked by hand on the highest-impact claims. Raw structured output: `.scratch/audit-result.json`.

---

## TL;DR

- **Architecture is sound.** The one-source-of-truth pattern (`packages/shared` + `apps/web/src/lib/server/*`) is real and widely followed. The money path, FSM, deposit-state, and the mobile auth layer are genuinely single-sourced.
- **Security posture is strong.** Zero critical or high security findings across the whole sweep. All 76 mobile routes are auth-guarded; the service-role key is isolated and every use inside a request path is owner-scoped; the Stripe webhook verifies signatures, re-checks amounts server-side, and is idempotent. Findings are 1 medium + a handful of low/info (plaintext Instagram tokens, iCal PII capability URL, a known image-write race).
- **The real risk is drift, not holes.** The parity lens surfaced ~10 places where web and mobile compute the same thing from *different* code, and **3 of those are live bugs today** (all on the **web** side, verified by hand).
- **Launch is gated by config, not code.** Money flips to live + a set of fail-closed env vars + the push send-half. The mobile API base is already correct (`inklee.app`). See §1.

---

## 1. Launch connectors — the action list

> Set these in **Vercel Production** unless noted. Several are **fail-closed**: unset = the feature breaks, not degrades.

### 1.1 Blockers (must do before public/real-money launch)

| # | Connector | State now | Launch action |
|---|-----------|-----------|---------------|
| B1 | **Stripe keys** | `sk_test_`/`pk_test_` in prod (code only `console.warn`s, does not block) | Switch dashboard to **Live**; set `STRIPE_SECRET_KEY=sk_live_…` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`; redeploy. In-app test-mode banner auto-clears. |
| B2 | **Stripe webhook** | No live endpoint/secret | Create a **Live** webhook → `https://inklee.app/api/stripe/webhook` with events `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `account.application.deauthorized`. Put its live signing secret in `STRIPE_WEBHOOK_SECRET`. |
| B3 | **Stripe Connect (Custom)** | Verified in **sandbox only** | In Live mode enable Connect + Custom accounts (sandbox settings do **not** carry over); complete the Inklee OÜ platform profile; confirm controller/fee settings (`fees.payer: application`, `on_behalf_of`/destination = artist). Smoke-test one real €1–5 deposit + refund. |
| B4 | **Supabase Auth redirects + providers** | Deep-link scheme wired in app; dashboard not confirmed | Add `inklee://auth-callback` + `inklee://auth-confirm` + `inklee://reset-password` (and Expo dev `exp://`) to the redirect allowlist; Site URL `https://inklee.app`; ensure **"Allow new signups"** is ON; enable **Google + Apple** providers with prod credentials (Apple is required by App Store review since Google is offered). |
| B5 | **Upstash Redis** (rate limiter) | **FAIL-CLOSED in prod** | Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. **Verified:** `lib/ratelimit.ts:20-22` returns `{allowed:false}` in production when Redis is unconfigured → the public booking form (5/hr) and waitlist reject **every** submission. |
| B6 | **Supabase Send-Email hook** | 500s if secret unset | Set `SUPABASE_AUTH_HOOK_SECRET` **and** configure the Supabase Send-Email hook → `https://inklee.app/api/auth/email-hook`. Inklee bypasses Supabase SMTP and sends via Resend through this hook; if unset, **all** confirmation/reset/magic-link emails fail. |

### 1.2 High (needed for a healthy launch)

| # | Connector | Action |
|---|-----------|--------|
| H1 | **Resend** | Set `RESEND_API_KEY` (live) + `EMAIL_FROM`; **verify `inklee.app` domain (SPF/DKIM/DMARC)** or all email bounces. Optionally `RESEND_WEBHOOK_SECRET` + bounce webhook. Without the key, email **silently no-ops**. |
| H2 | **CRON_SECRET** | Set it — guards all 4 Vercel crons (`cleanup` 03:00, `reminders` 09:00, `instagram-refresh` 04:00, `retention-purge` monthly). Unset = 401 and they silently stop (incl. GDPR retention-purge). |
| H3 | **Core Supabase env** | Confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), pooled `DATABASE_URL` (6543/transaction/pgbouncer). Build-safe placeholders mask absence until runtime. |
| H4 | **Push delivery (send-half)** | The device-side token registration is **done** (`push.ts` → `/api/mobile/devices`, migration 0046), but the **server→Expo send does not exist** (no `lib/server/push.ts`, no `exp.host` POST). Provision EAS APNs + FCM creds (needs store accounts), then build the sender wired into `lib/server/bookings.ts` notification points. No OTA → needs a fresh EAS build. |
| H5 | **RLS verification** | Per `AGENTS.md` (the 0001 RLS masking incident): before any prod migration push, run `select tablename, policyname from pg_policies where schemaname='public';` and confirm policies actually exist. |

### 1.3 Medium / Low

- **`ADMIN_EMAILS`** (fail-closed: unset = `/admin` reachable by no one).
- **Apple Developer + Google Play accounts** (`app.inklee` since the 2026-07-15 package rename; was `ee.inkl.app` at audit time) → unlocks push creds + store submission; fill empty `eas.json` `submit.production`.
- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`** with HTTP-referrer restriction to `inklee.app` (web travel map; also a security note — see §5).
- **`SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`** (recommended before real-money beta).
- **Instagram/Meta** (`INSTAGRAM_APP_ID/SECRET`, dedicated `INSTAGRAM_STATE_SECRET`, register callback) — blocked on the new Meta app + Business verification; **non-blocking** for the deposit beta.
- **Leave parked:** `GOODS_COMMERCE_ENABLED` + `CHECKOUT_ADDONS_PROD_READY` **UNSET** (money paths intentionally parked until OT-12.2). `canChargeCheckoutAddons` fails closed in prod regardless.
- **`NEXT_PUBLIC_LEGAL_PENDING_REVIEW`** — unset once legal copy is approved.

### 1.4 Verified correct (no change)

- **Mobile API base** `EXPO_PUBLIC_API_URL=https://inklee.app` in **both** `eas.json` profiles (NOT `inkl.ee` — the apex 308 strips the `Authorization` header). Public link base `EXPO_PUBLIC_PUBLIC_BASE_URL=https://inkl.ee` is intentionally decoupled.

---

## 2. Real bugs found (verified by hand)

These were surfaced by the parity lens (comparing the two implementations of the same operation) and confirmed by direct reading. **All three of the top items are web-side bugs.**

| ID | Sev | Bug | Evidence |
|----|-----|-----|----------|
| BUG-1 | **High** | **Editing a non-EUR flash design on web silently resets its currency to EUR.** The web edit form's `initial` object omits `currency`, so `FlashItemForm` defaults to `"eur"` and the save overwrites the stored value. Mobile preserves currency. | `flash/items/[id]/page.tsx:87-104` (no `currency` key); `flash-item-form.tsx:66` (`currency = initial.currency ?? "eur"`); `loadFlashItemForEditAction` also omits it. **Verified.** |
| BUG-2 | **High** | **Saving the Books settings form wipes `form_appearance` (public booking-form theme resets to dark).** Two web save actions rebuild `books_settings` from only 4 keys without spreading the current object. Mobile merges carefully. | `settings/books/actions.ts:46-54` and `bookings/books/actions.ts` (same shape). `saveAvailabilityAction` does it correctly. **Verified.** |
| BUG-3 | **High** | **Waitlist "Move to booking" on web has no idempotency / already-converted / email guard.** A double-submit or web+app race creates **two** approved bookings and emails **two** magic links; converting an email-less entry inserts a booking with empty `customer_email` and emails an empty address. Mobile's convert route claims the row conditionally, rejects already-converted (409) and missing email (400). | `bookings/actions.ts` `convertWaitlistEntry` vs `api/mobile/waitlist/[id]/convert/route.ts`. |
| BUG-4 | **High** | **Mobile studio icon color never persists.** The studio editor posts camelCase `iconColor`, but `studioSchema` expects `icon_color`; `z.object` strips the unknown key, so the color always saves as null. (The icon itself saves — its key matches.) Trips are unaffected. | `travel/studios/[id].tsx:137` vs `studio-validation.ts:44`. |
| BUG-5 | Med | **Web appointment edit has no status guard and no required-field validation** — it will rewrite the date/placement of a `deposit_pending`/`rejected`/`cancelled` booking and can blank out placement/size. Mobile's PATCH enforces `status==='approved'` (409) + non-empty fields (400). | `bookings/calendar/actions.ts` `editAppointmentAction` vs `api/mobile/bookings/[id]/route.ts` PATCH. |
| BUG-6 | Med | **`ActionFeed` money formatting uses `Intl.NumberFormat`** — Hermes ships no `Intl` on iOS, so the home Action-required deposit amounts can fail on iOS (only the Android/catch path works). Also duplicated instead of using shared `formatMoneyShort`. | `apps/mobile/src/components/home/ActionFeed.tsx`. |
| BUG-7 | Med | **MFA pill can disagree across surfaces.** Web reads `factors.totp[0]` (first factor only); mobile `.some()`s over all factors. With an abandoned-then-verified factor ordering, web shows 2FA "Off" while mobile shows "On". | `settings/account/page.tsx:30-32` vs `api/mobile/account/route.ts:44-46`. |
| BUG-8 | Med | **Home greeting date uses client `Intl.DateTimeFormat` in device-local time** — Hermes-iOS risk + a travelling artist sees a different "today" than web (which uses the artist's profile timezone). | `apps/mobile/app/(tabs)/index.tsx:50-54,276`. |

> Note BUG-1: the flash *currency feature* itself shipped recently (commits `64008ba`/`f25f6c5`); this is an edit-path oversight in that same feature, not a missing feature.

---

## 3. Parity matrix (web → mobile)

The app is **artists-only** and mirrors the web artist IA closely. Presence per domain:

| Domain | Mobile presence | Notable real gaps (non-by-design) |
|--------|-----------------|-----------------------------------|
| Bookings | partial | custom-field answers not shown on detail (low); manual reminder/reconfirmation send (med, see emails) |
| Deposits / money | full | inline Connect-requirements list before onboarding (low) |
| Calendar | full | — (different entry shapes only) |
| Clients | full | copy/preview link from empty state (low) |
| Waitlist | full | — (lives in its own Waitlist screen, not the bookings tab) |
| Flash | full | rename slug / set IG URL / reorder folders (all low) |
| Goods | partial | product reorder + explicit image reorder (low; goods commerce parked) |
| Travel | full | inline quick-add studio (Places is web-only by design); one-tap visibility toggle (low) |
| Onboarding | full | logo upload deferred to Settings (low) |
| Settings: profile/books/dashboard | partial | form-appearance theme editor (low — mobile preserves it) |
| Settings: emails/reminders | partial | **manual per-booking deposit-overdue / reconfirmation / appointment nudges (med)** |
| Booking-form builder | full | drag-reorder UX differs (by design) |
| Slots | full | — (cleanest single-source domain) |
| Notifications / push | partial | **resolve a system warning (high)**; **server push delivery absent (high)**; feed grouping/priority sort (low) |
| Analytics / Home | full | per-day heatmap is web-only (by design) |
| Account / Auth | partial | **no native forgot/reset password (high)**; change email/password in-app (med, web handoff); 2FA enrol/recovery codes (web handoff) |
| Link Hub | full | module show/hide + booking-policy edit are web-only (by design) |
| Entitlements/plan | partial | no self-serve billing (by design) |

**Highest-value parity gaps to close before/just-after launch:**
1. ~~**Native forgot/reset password**~~ — ✅ **DONE 2026-06-18** (commit `36676ac`): `forgot-password` + `reset-password` screens, `sendPasswordReset`/`completePasswordReset` in the auth context, "Forgot password?" on sign-in. Gated on adding `inklee://reset-password` to the Supabase redirect allowlist (see B4) + a native-build device test.
2. ~~**Resolve a system warning** on mobile~~ — ✅ **DONE 2026-06-18** (commit `af7349f`): `POST /api/mobile/notifications/resolve` + a Resolve button on open `system_warning` rows.
3. **Server push delivery** (H4 above) — the whole point of the device-token plumbing.
4. **Manual reminder/reconfirmation sends** (emails, med) — a real chase action artists will want on mobile.
5. ~~**Custom-field answers on the booking detail**~~ — ✅ **DONE 2026-06-18** (commit `d2557aa`): `MobileBookingDetail.customAnswers` (formatted server-side) + an "Additional details" card on the mobile detail screen.

**Web-only by design (correctly excluded, not gaps):** public bio/booking pages, client magic-link portal, marketing, legal, admin, Instagram OAuth import, Google Places autocomplete, native in-app Connect KYC form (in-app browser handoff), goods checkout/add-ons + pickup (commerce parked), public-form rendering, per-day analytics heatmap, self-serve billing.

---

## 4. One-source-of-truth (ME-10) drift register

The good news first: **genuinely single-sourced** — booking FSM (`@inklee/shared/booking-fsm`), all six booking mutation cores (`lib/server/bookings.ts`), platform-fee math (`@inklee/shared/platform-fee`), deposit refund-state (`lib/deposit-state.ts`), slots (`lib/server/slots.ts` + `@inklee/shared/slot-pattern`), entitlements, bio-page parsing. These cannot drift.

The drift register below is the ME-10 backlog. BUG-1..BUG-8 above are the subset that have *already* drifted into live bugs; the rest are latent. Ranked by risk:

**High-priority extractions (touch correctness/money/security-sensitive logic):**
- ✅ **DONE** (`b9acefd`) **Books-open / window-expiry derivation** → `deriveBooksOpen(books, todayKey)` in `@inklee/shared/books-settings`, consumed by the public page, the booking-submit gate, and mobile /me + /home; unit-tested.
- ✅ **DONE** (`e6a6784`) **Create-appointment insert** (UUID + 32-byte token + sha256 + audit + approval email) → `createAppointmentCore` in `lib/server/bookings.ts`; web action + mobile route now thin adapters.
- **Waitlist convert** token + insert shape duplicated and already diverged → `convertWaitlistEntryCore` (fixes BUG-3 + single-sources the magic-link contract).
- **Analytics metric math** fully copy-pasted (conversion/return/deposit rates, 6-month aggregation) → pure `@inklee/shared/analytics.ts` (keep Intl-free).
- **Booking-form standard-field descriptor** (`STD`/`TYPE_BADGE`) duplicated web tsx vs mobile route + a 3rd id copy → shared `booking-form-fields.ts`.
- **Reminder day-count clamp/defaults** in 3 places (web write, mobile write, read) → shared `sanitizeReminderSettings` + `REMINDER_BOUNDS`.
- **goods `image_urls` read-modify-write** (FU-18) implemented twice with no concurrency guard → one atomic shared helper (DB-side `array_append`/`array_remove` or `updated_at` CAS).

**Medium (validation/format drift, mostly Intl-free formatter or shared-constant work):**
- Deposit-defaults bounds triplicated; client aggregation duplicated; per-client "approved" computed 3×; calendar month-grid + leg-expansion forked; iCal token logic triplicated (2 web + mobile, one web copy is dead); flash metadata validation 2 implementations (different strictness); goods category/status option lists re-declared on mobile; goods price parsing 3 parsers; `ownedGoodsStoragePath` duplicated verbatim (security-sensitive); trip title/desc caps web-missing; `rangesOverlap` + leg-active predicates duplicated; onboarding logo pipeline 2 sharp configs (web onboarding lacks the decompression-bomb guard); booking-mode enum validation web-vs-mobile; **web slug-availability check is blind under post-0030 RLS** (can show a taken slug as free); profile field validation weaker on web; cover-color swatches defined 3×; web bell re-implements shared `relativeTime`; notification absolute-timestamp 2 formatters; push payload shape only client-side; sign-in identity (`hasPassword`/`oauthProvider`) derived 3×; password policy (min 8) in 4 files.

**Recommended pattern** (the founder's own `deposit-state.ts` model): pure function in `packages/shared` (Intl-free so Hermes-iOS can import it), consumed by both the web Server Action and the mobile route/screen, locked by a unit test. Several "two formatters" items need an **Intl-free absolute date/time formatter** added to `@inklee/shared/format` (mirroring how `relativeTime` is already shared) so web and mobile can finally share one.

**Dead code to delete** (found during the sweep): `settings/templates/{actions.ts,template-editor.tsx}` (page redirects to `/settings/emails`); `settings/fields/{actions.ts,field-form.tsx,field-list.tsx,standard-fields.tsx,form-settings-actions.ts}` (page redirects to `/bookings/form`, and the stale copy already omits `field_order` upkeep). Confirm no imports, then remove.

---

## 5. Security posture & findings

**Verdict: strong. Zero critical/high.** Cross-checked by hand:
- All **76** mobile routes call `requireMobileUser` (401 before any data access); auth = anon key + the user's JWT → **RLS-scoped**, never service-role.
- The service-role client is isolated to one factory and used inside a request path only for owner-scoped operations (storage `.remove()` on `${userId}/…` keys, `.eq('artist_id', userId)` counts, the token-validated user's own magic-link mint). No cross-tenant data is returned.
- Booking mutations go through `getAuthorisedBooking` (explicit `artist_id !== userId` → 403) **on top of** RLS, with conditional `UPDATE`s (`.eq('status', prior)`) closing TOCTOU races.
- Stripe webhook: signature-verified, server-side amount re-check (anti-tampering, 409 + Sentry on mismatch), `artist_id` cross-check, layered idempotency. **P0-2 (refund-on-cancel) and P0-6 (multi-currency display leak) are CLOSED.**
- RLS enabled with owner-only policies on every artist-data table; service-role-only tables are deny-all; the 0001 incident is remediated (0026-0032). Secrets confined to server; `service.ts` throws if imported client-side. No CORS on `/api/mobile` (correct for native Bearer clients).

**Findings worth tracking (none launch-blocking):**

| Sev | Finding | Location | Action |
|-----|---------|----------|--------|
| Medium | **Instagram OAuth tokens stored plaintext at rest** (migration comment admits it). RLS limits reads to the owner, but a DB dump yields working IG tokens. | `0019_instagram_integration.sql:8` | App-layer encrypt (AES-GCM, key from env) or secrets store; enforce `token_expires_at`; clear on disconnect. |
| Low | **Public iCal feed leaks customer PII** (email/handle/placement) behind a capability token with no expiry; token stored plaintext in `settings` JSONB. | `api/ical/[token]/route.ts:18` | Acceptable as a 128-bit capability URL; consider hashing the stored token, dropping email from the payload, documenting it as revocable. |
| Low | **FU-18 image_urls lost-update race** + a TOCTOU on the image cap (same root). Single-artist, self-correcting, no cross-tenant impact. | `api/mobile/goods/[id]/image/route.ts` | Tie to the §4 atomic `image_urls` helper. |
| Low | **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`** in the client bundle needs console-side HTTP-referrer + per-API restriction (can't verify from the repo). | `travel/trip-manager.tsx:34` | Lock down in Google Cloud console; billing quota/alert. |
| Info | Webhook checks amount but not **currency** equality (not client-exploitable; currency is server-set & immutable). | `stripe/webhook/route.ts:275-299` | Cheap defense-in-depth: 409 if `intent.currency !== booking.deposit_currency`. |
| Info | Non-constant-time `CRON_SECRET` compare; `x-forwarded-for` is spoofable but Vercel normalizes it at the edge (mitigated in prod). | `cron/*`, `get-client-ip.ts` | Optional hardening; no change needed for the Vercel deployment. |

---

## 6. Recommended sequencing

1. **Now (config, no code):** §1.1 blockers B1–B6 + §1.2 H1–H3, H5. This is what actually gates launch. Re-run the §5 P0 sanity (`pg_policies`, one live deposit+refund).
2. **Pre-launch code (small, high-value):** fix BUG-1..BUG-4 (data-loss/integrity, all tiny diffs), add native **forgot/reset password** (highest parity gap), and the **ActionFeed `Intl` → `formatMoneyShort`** swap (BUG-6, iOS crash risk).
3. **Launch-week:** push send-half (H4), **resolve-warning** on mobile, manual reminder/reconfirmation sends, BUG-5/7/8.
4. **ME-10 sweep (ongoing):** work the §4 register highest-first; each extraction is a pure shared fn + unit test. Delete the two dead folders.
5. **Post-launch hardening:** Instagram token encryption, iCal payload minimization, the Intl-free shared date/time formatter (unblocks ~5 medium drift items at once).

---

*Generated by the Inklee mobile↔web audit workflow (run `wi6qe0kdv`). Full per-domain structured findings, including every low/info item and exact file:line for all drift risks, are in `.scratch/audit-result.json`.*
