# Codex audit brief — Inklee

**Audit this commit:** `master` tip **`ffb1e05`** (working tree clean). Anchor every finding to it; if a line drifts, name the function/symbol.

**Operating model:** Codex runs the audit and emits findings in the format in §10. Claude fixes them: triage, adversarially verify each is real, fix in severity-ordered reviewable slices, each gated (web+mobile tsc, lint, ~518 vitest, `next build`).

**Goal:** a *high-signal* audit. ~20 prior audits + a very clean baseline (across `apps/{web,mobile}`: ~1 `as any`, ~3 eslint-disable/ts-ignore, ~1 TODO; all gates green) mean the obvious surface is closed. Spend the budget on **money correctness, webhook idempotency/replay, authorization on the service-role + mobile-bearer paths, RLS on recently-added tables, residual injection/escaping, and the just-shipped map/icons** — not on re-deriving closed items or style nits.

---

## 1. Stack (one paragraph)

`apps/web` = Next.js 16 (Turbopack, App Router), ~553 src ts/tsx, 205 routes, 16 server libs, 78 `/api/mobile/**` routes. `apps/mobile` = Expo / React Native, ~139 files. `packages/shared` = 41 one-source-of-truth modules both apps import (`@inklee/shared`). 53 Supabase migrations (through 0053) define the RLS + storage posture. Payments = Stripe Connect **Custom** (artist is merchant of record; `application_fee` = flat 3%). ~518 vitest green; `next build` = 156 routes.

---

## 2. Scope — included

- `apps/web`, `apps/mobile`, `packages/shared` on master `ffb1e05`.
- All `/api/mobile/**` (78 routes) + the `requireMobileUser` -> RLS-scoped-client authz model.
- The money path end to end: `requestDepositCore` / `refundDepositCore` / `markDepositReceivedCore` (`lib/server/bookings.ts`), the Stripe webhook (`api/stripe/webhook/route.ts`), Connect (`lib/stripe-connect.ts`), fee math (`packages/shared/src/platform-fee.ts`).
- All `serviceClient` (RLS-bypass) call sites (54 files) and whether each re-derives tenant scope.
- Unauthenticated input: public booking + flash booking + waitlist actions, the `request/[token]` magic-link portal, `ical/[token]`, `instagram/callback`, crons.
- **Just-shipped + likely-unaudited:** the travel map (web page + mobile screen + `packages/shared/src/travel-map.ts` + journey API), the icon library (`inklee-icon-art.ts` / `travel-icons.ts` / `studio-validation.ts`), the splash.
- Open/deferred items carried from prior audits (§6b).

## 2b. Scope — excluded (do NOT report findings against these)

- **The local-only studios/guest-spots/map worktree** at `A:\WORK\inklee-studios-guestspots-map` (branch `feature/local-studios-guestspots-map`, ~19 commits ahead, never merged/pushed, flags OFF). **Caution:** master DOES contain the SHIPPED public guest-spot surfaces (`app/guest-spots/page.tsx`, `app/guest-spot-booking/page.tsx`, the Guest Spots nav) — those ARE in scope. Do not confuse them.
- The `.claude/worktrees/web-legal-tables` worktree (branch-only WIP).
- **iOS / Apple track** (deferred, Android-first): missing iOS provisioning, Sign-in-with-Apple on a current build, the empty iOS submit profile, App Store metadata are NOT findings.
- **Launch-gate env config** (founder sets in Vercel, not code defects): `UPSTASH_REDIS_*`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_AUTH_HOOK_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS`, `RESEND_API_KEY`, `CHECKOUT_ADDONS_PROD_READY`, `GOODS_COMMERCE_ENABLED`.
- The closed findings in §6a.

---

## 3. Must-respect conventions (so findings are accurate, not false-positives)

1. **This is NOT the Next.js you know.** `apps/web` is Next.js 16 (Turbopack, App Router) with breaking API changes vs training data. READ `node_modules/next/dist/docs/` before claiming any App Router API, async `params`/`searchParams`, the `proxy.ts` middleware-file convention, Server Action signatures, or cache directives (`use cache` / `cacheLife` / `cacheTag`) is "wrong." A green build is the baseline; an API-shape "bug" is almost always a training-data mismatch.
2. **Copy rules** (apply to every user-visible string: page copy, labels, helper text, modal bodies, action error messages, email copy. NOT code comments/logs/commits): (a) **no em-dashes** (flag one in user copy as a violation, and never propose copy containing one); (b) sentence case (proper nouns / brand terms stay capitalised); (c) terminal punctuation on full sentences, no period on single labels; (d) booking-flow verbs are **Accept / Pass**, not Approve / Reject. Do NOT flag "Accepted"/"Passed" UI copy as wrong.
3. **Accept/Pass is user-copy only.** The DB enum stays `status='approved'/'rejected'` and functions are named `approveBooking`/`rejectBooking`. Internal identifiers using approve/reject are NOT violations.
4. **Brand vocabulary is single-sourced** in `packages/shared/src/status-labels.ts` (`humanStatusLabel`: approved->"Accepted", rejected->"Passed", deposit_pending->"Awaiting deposit"). The web `src/lib/status-labels.ts` is a deliberate 3-line re-export SHIM (not dead/duplicate). A raw `status.replace('_',' ')` leak IS a legitimate finding.
5. **One-source-of-truth.** Web + mobile derive shared logic from `packages/shared`. Thin web `src/lib/*.ts` re-export shims and "same constant in shared, imported by both" are the architecture, not duplication. The real finding is the INVERSE: any place web or mobile RE-IMPLEMENTS logic already in shared (a second copy of the fee math, a duplicated FSM, a parallel status-label switch).
6. **Service-role is correctly NOT used on `/api/mobile/*`** (those use `requireMobileUser` -> anon client scoped to the Bearer JWT, so RLS applies). `serviceClient` is used on public/webhook/cron/admin paths where there is no session; there each call MUST do its own ownership filter. Judge service-role sites on whether they re-derive tenant scope, not on the mere fact they bypass RLS.
7. **Mobile API base MUST be `inklee.app`, not `inkl.ee`** (the apex 308-redirect strips the Authorization header). Config pointing mobile at `inkl.ee` IS a real bug; `inklee.app` is correct.
8. **Fail-CLOSED on an unset env var is the intended secure default** (rate-limiter rejects all, webhook 400s, crons 401, `/admin` reachable by no one). Do NOT report fail-closed-when-unset as a bug or DoS. Only a gate that fails OPEN (silently allows when its secret is missing) is a finding.
9. **Migration-repair footgun** (AGENTS.md): the 2026-04-20 `migration repair --status applied` masked an unrun 0001 RLS for ~3 weeks (incident 2026-05-10, fixed in 0026-0029, CLOSED). If you see bookkeeping-vs-DB drift, frame it as a verification recommendation, not a claim RLS is currently broken. Run the `pg_policies` / RLS-enabled queries from AGENTS.md to verify rather than assume.
10. **Baseline debt is very low.** "missing test", "any type", "TODO"-style findings are near-zero by construction. Spend budget on money correctness, webhook idempotency/replay, RLS/authz on service-role paths, and cross-app drift.
11. **Match the precedent format** in `docs/codex-audit-goods-feature.md` (data-model table, locked-decisions, end-to-end flow, focus table, deferred list, resolution log) and `docs/ux-audit/codex-independent-ux-audit.md` for any UX pass.

---

## 4. Intentional non-bugs (verified deliberate — do NOT flag)

- **Stripe in TEST mode in prod**: `stripe.ts` exports null when `STRIPE_SECRET_KEY` unset and only `console.warn`s on a `sk_test_` key. Both deliberate pre-launch. (Signature verification, `application_fee`=3% / `on_behalf_of` / `destination` correctness, server-side amount recompute, and webhook idempotency ARE in scope.)
- **Goods commerce + checkout-addons flags OFF** by design (`features.ts`: `canChargeCheckoutAddons()` fails closed unless `CHECKOUT_ADDONS_PROD_READY==='true'`; `isGoodsCommerceEnabled()` parks the payable path). The known latent EUR add-on bug is fenced behind both OFF flags. `DEFAULT_FEATURES` defaulting true is paywall readiness only.
- **Deposits entitlement-gated behind Solo Plus** (`entitlements.ts` pure; `entitlements-server.ts` holds the service-role read — deliberate split). A free artist seeing no card form is the designed gate.
- The web `src/lib/status-labels.ts` (and similar) thin re-export shims are the one-source pattern, not dead code.
- `serviceClient` bypassing RLS on public/webhook/cron/admin is by design; public `[slug]` RSC reads hand-select columns because RLS cannot column-filter (anon SELECT deliberately dropped in 0027/0030/0031/0040). The finding bar is a MISSING owner filter or an over-fetched/visibility-gated column, not the use of `serviceClient` itself.
- Goods atomic-inventory decrement is read-modify-write; concurrent oversell is v1-accepted (Plan §4). Webhook does NOT flip `slots.status` (artist-side approve does) — known follow-up.
- Cron auth uses non-timing-safe `header !== Bearer ${CRON_SECRET}` — already noted low/known.
- `service.ts` defaults `SUPABASE_SERVICE_ROLE_KEY` to a placeholder so a missing key fails at first DB call — known; a zod env loader is a recommendation.
- `settings/templates/` and `settings/fields/` are redirect-only stubs (already flagged for deletion 2026-06-18) — KNOWN, not new.

---

## 5. Surface risk tiers (review depth)

Critical = real money / auth / RLS / unauthenticated input. Audit these deepest.

### CRITICAL
- **Stripe webhook** — `api/stripe/webhook/route.ts`. Idempotency across retries / duplicate / out-of-order delivery (`deposit_paid` audit row + `.contains` on `payment_intent_id`; the `.select()`-gated `pending->paid` flip). Anti-tamper backstops: `intent.amount===expectedAmount` (~L289), `intent.metadata.artist_id===booking.artist_id` (~L181). The status flip to `approved` (~L329) is a DIRECT write, NOT a conditional `.eq('status',from)` UPDATE — confirm a stale/replayed/out-of-order event can't flip a booking that already moved on. `charge.refunded` + `payment_intent.payment_failed` branch idempotency (count-based `deposit_refunded` guard can race the in-app guard — no unique constraint). Fee-sponsorship budget decrement (~L368-386) must not be replayable to over-credit. Currency equality is NOT checked (info).
- **Deposit intent creation + fee + amount guards** — `lib/server/bookings.ts` `requestDepositCore` (~L638); `packages/shared/src/platform-fee.ts`; `lib/stripe-connect.ts`; `lib/stripe.ts`. `amountCents=Math.round(amount*100)` must never drift from charged cents; cap + `>=1` floor; `application_fee_amount` correctness (full 3% / 300bps; 0 on the sponsored path). `idempotencyKey=deposit-intent-${id}` is ONE key per booking but the booking can be re-requested at a DIFFERENT amount — on a transient create failure, can a stale intent at the old amount be served back? Reuse path does `paymentIntents.update(amount,fee)` — confirm currency-immutability check + cancel-and-fallback-to-manual when currency or `routeCharges` changed (P1-6). Metadata must always carry `booking_id` + `artist_id`. `routeCharges` must fall back to a MANUAL deposit when Connect is incomplete, never ride Inklee's platform account. (Swallowed catches ~L764/~L864 can let stored `deposit_amount` diverge from the live intent.)
- **Refund + cancel** — `lib/server/bookings.ts` `refundDepositCore` (~L1009), `cancel` (~L484); webhook `charge.refunded` (~L90-127); `api/mobile/bookings/[id]/deposit-refund`. `refunds.create({reverse_transfer:true, refund_application_fee:true}, {idempotencyKey:refund-deposit-${id}})` guarded by a COUNT-based `deposit_refunded` audit check — can the in-app guard and the webhook guard race to write two rows (no unique constraint)? `reverse_transfer` when the artist balance is insufficient. Manual (non-card) deposits must refuse refund. Single full-refund only.
- **Mobile API trust boundary** — `lib/server/mobile-auth.ts`; `api/mobile/**`; `getAuthorisedBooking` (~L69); mobile `config.ts`. `requireMobileUser` builds a per-request anon client + `auth.getUser()` (must round-trip, not a local JWT decode); returns an RLS-scoped client, NEVER service-role. Grep every route and confirm none (a) skip the guard, (b) trust an id/`artist_id` from the request BODY instead of `userId`, or (c) pass service-role into a core. IDOR hides in the `:id` routes (`bookings/[id]/*`, `goods/[id]/*`, `flash/items/[id]/*`, `slots/[id]`, `travel/legs/[id]`) — the core must `.eq('artist_id', userId)` or assert ownership. Status mapping (404/403/400) must not leak cross-tenant existence.
- **Service-role client (54 files)** — `lib/supabase/service.ts`; `lib/admin-queries.ts`; `app/[slug]/actions.ts`; `lib/booking-studio.ts`; `lib/order-fulfillment.ts`; `lib/notifications.ts`; `lib/server/account-deletion.ts`. Highest-leverage grep. Per write, enumerate what scopes it to the right artist (it must re-derive scope, not trust a client id). `admin-queries.ts` builds `let query: any = serviceClient.from(table)` (~L293) with `table` interpolated — confirm `table` is a fixed allowlist, not user input. Confirm none is reachable from the browser bundle.
- **Public booking intake** (unauthenticated FormData -> serviceClient writes) + waitlist + flash booking — `app/[slug]/actions.ts`; `app/[slug]/flash/[flashSlug]/actions.ts`; `lib/ratelimit.ts`; `lib/honeypot.ts`; `lib/host.ts`; `lib/booking-schema.ts`; `lib/custom-fields.ts`; `lib/image-processing.ts`. Defenses to verify hold: honeypot, Origin allowlist, IP rate-limit (fails closed), schema + `validateCustomAnswers` bounds, image type/size/count caps + re-encode to webp, the atomic slot lock (`.eq status open`) + rollback, trip-ownership validation, dedupe fingerprint, `JSON.parse` of `interests_json`/`annotations_json`. A slug lookup must not let a write land under ANOTHER artist. Image pipeline: EXIF strip, SSRF / path-traversal, decompression-bomb (sharp omits `limitInputPixels` at ~6 sites). Address-visibility gate. Whether any field reaches an email/notification unescaped.
- **Customer magic-link portal** — `app/request/[token]/actions.ts`; `addons-checkout.tsx`; `lib/orders.ts`; `lib/addon-products.ts`. Auth = `sha256(token)` vs `customer_token_hash` via serviceClient (no session). Verify: token entropy (32 bytes), 30-day expiry, per-hash rate limit, FSM `canTransition` guards, token rotation on edit (a replayed OLD token after rotation must not escalate), cancel deposit direction, slot re-open + rollback, `prepareCheckout`'s `booking_interests` allowlist + quantity cap (can't reach the wider catalogue), EUR-only add-on guard, and that its PaymentIntent amount stays in sync with the webhook's check.
- **RLS + storage policies (53 migrations)** — `migrations/0001`, `0002`, `0026`, `0027/0030/0031/0040` (anon-SELECT drops + storage), `0045`, `0046`, `0047`, `0049/0053`, `0050/0051`, `0037`, `0036`. Confirm RLS ENABLED + policies present on every tenant table, ESPECIALLY recent slices (0036/0037/0045/0046/0047/0049/0050/0051/0053). Confirm NO new table since 0031 added a `TO anon ... FOR SELECT` that leaks `artist_id`/PII. Storage buckets RLS-locked. Run the AGENTS.md `pg_policies` queries against the live DB; verify, don't assume.

### HIGH
- **Crons** — `api/cron/{reminders,retention-purge,cleanup,instagram-refresh}`; `lib/email/reminder-emails.ts`. All four must gate on `Bearer ${CRON_SECRET}` and fail closed (401). reminders: per-artist 10-email cap + already-sent-today idempotency; reconfirmation token-rotation rollback on email failure. retention-purge (GDPR): cutoff math correctness, never purge booking-linked audit rows.
- **Admin** — `lib/admin-guard.ts`; `app/admin/accounts/[id]/actions.ts`; `lib/audit.ts`; `lib/admin-queries.ts`; `lib/entitlements.ts`. `admin-guard.ts` is the real enforcement (proxy is defense-in-depth). `needsMfaStepUp` fails CLOSED. Confirm `getAdminId()` is the FIRST statement in EVERY exported admin action. Self-target guards on destructive ops. `deleteAccountPermanentlyAction` must route through the shared `deleteOwnAccountCore`.
- **Auth: proxy, email hook (open-redirect), MFA recovery, deletion re-auth** — `proxy.ts`; `api/auth/email-hook/route.ts`; `api/auth/mfa/recover/route.ts`; `lib/server/account-deletion.ts`; mobile `auth.tsx`. proxy rewrites artist subdomains as PUBLIC-only (no auth cookies cross the registrable-domain boundary). email-hook verifies a Standard-Webhooks HMAC with `timingSafeEqual` — but **check the `redirect_to`/`next` param: confirm `/auth/confirm` validates `next` against an allowlist (OPEN-REDIRECT candidate)**. mfa/recover: 8-char code, rate-limited 5/user/hr, used code removed. account-deletion: 5-min re-auth on web action AND mobile route — but mobile DELETE re-auth is documented UI-only (a leaked-but-valid token could delete without re-auth).
- **iCal + Instagram OAuth** — `api/ical/[token]/route.ts`; `api/instagram/callback/route.ts`; `lib/instagram.ts`; `lib/instagram-storage.ts`. iCal: token entropy; the feed currently includes customer email/handle + placement — confirm that PII set is intended for a shareable no-expiry URL; injection escaping (`icalEscape` handles `;` and `\n` — **check CRLF / property-injection**). Instagram callback (unauth GET): `verifyOAuthState` replay/expiry AND **logged-in-user-vs-state-artistId CSRF account-attach binding**; `access_token` plaintext at rest (0019 notes it); **SSRF in `downloadInstagramThumbnail`** (fetches an attacker-influenced `media_url`).
- **Email subsystem** — `lib/email/{send,booking-templates,auth-templates,reminder-emails,layout}.ts`; `api/email/webhook/route.ts`. webhook verifies a svix HMAC with a 5-min window + `timingSafeEqual`, and in DEV processes UNSIGNED if the secret is unset (confirm that dev branch cannot run in prod). **HTML-injection / template escaping**: `customer_handle`, `placement`, `description` and other free-text reaching email HTML (residual gap). `send.ts` can't be coerced into recipient injection.

### MEDIUM
- **Just-shipped: travel map** — `packages/shared/src/travel-map.ts`; `lib/server/travel-map.ts`; `app/(artist)/map/{page,map-client}.tsx`; `api/mobile/travel/journey/route.ts`; mobile `travel/map.tsx`. The one real security check is **`safeMapsUrl`** (~L69-75): it guards an artist-entered `googleMapsUrl` to https-only via `/^https:\/\//i` before it becomes an href (web) or is opened (native). **Verify the regex can't be bypassed** (`https:evil`, whitespace/control chars, embedded newline) and the href/native-open is safe. `latitude`/`longitude` must be numbers (no injection at L60). `listTravelJourney` must get the RLS-scoped client, not service-role. map-client ships no key/token and renders no unsanitized studio names.
- **Just-shipped: icon library** — `packages/shared/src/{inklee-icon-art,travel-icons,studio-validation}.ts`; `app/[slug]/travel-card.tsx`; `components/travel-icon.tsx`. [Largely verified OK — confirm] `studio-validation` constrains `icon` to `z.enum(TRAVEL_ICON_KEYS)` and `icon_color` to `z.enum(TRAVEL_ICON_COLORS)` with sanitizers degrading off-library values to null, so an artist can't store arbitrary strings flowing into SVG/`currentColor`/inline style on a PUBLIC page. Confirm on every write path. `travel-icon.tsx` (~L34) `dangerouslySetInnerHTML` consumes `art.inner` from the GENERATED (static) art — confirm it never interpolates DB/user input. Native `SvgXml` consumes only static bundled art.
- **Shared one-source modules (blast radius)** — `packages/shared/src/{booking-fsm,platform-fee,deposit-policy,money,booking-schema,timezone,mobile-api}.ts`; `lib/deposit-state.ts`. FSM transition-table completeness; grep `.update({...status:` writes to `booking_requests` across the web and confirm each is preceded by `canTransition` OR is the webhook's deliberate `deposit_pending->approved` bypass (the ONLY intended one). Money rounding consistency. Timezone correctness. `mobile-api` types match route payloads. `money.ts` is the Intl-free formatter both import (Hermes has no Intl) — check any mobile screen formatting money WITHOUT it.
- **Server domain libs** — `lib/server/{bookings,deposits,account-deletion-logic,mobile-goods-server,slots,waitlist}.ts`. `getAuthorisedBooking` is the choke point — confirm EVERY mutation core calls it (or `.eq artist_id`) before writing, that the `supabase` arg is the RLS-scoped client for mobile, and refund/deposit-received cores re-derive amounts. waitlist convert lacks the idempotency guard the mobile route has (BUG-3).
- **Mobile app shell** — mobile `{auth,supabase,api,push,config}.ts`; `api/mobile/devices/route.ts`. Token at rest (SecureStore not AsyncStorage); the `inklee://reset-password` PKCE handler can't be hijacked to exchange an attacker code; deregister-before-signout ordering; no secrets in `EXPO_PUBLIC_*`; Bearer never to the apex. devices `onConflict:'token'` — D-M1 squatting (artist B re-registers artist A's token).
- **Mobile image upload routes** — `api/mobile/flash/items/[id]/image`, `goods/[id]/image`, `settings/profile/{logo,cover}`; `lib/{mobile-image,image-processing}.ts`. file-type/size validation before sharp; storage path always prefixed with `userId` (no traversal via `[id]`); ownership checked BEFORE upload (verify uniformly); goods `image_urls` lost-update race (FU-18); returned URL bucket-scoped, not a signed leak.
- **Public bio/flash/hub pages + SEO** — `app/[slug]/{page,flash/page,hub/page,studio-block}.tsx`; `app/{robots,sitemap}.ts`. Every `serviceClient .select` exposes ONLY public columns (column-by-column over-fetch review — RLS can't column-filter). Address-visibility gate holds. flash/goods only show published/active. No slug-enumeration leak of suspended/archived/deleted accounts.
- **XSS / dangerous sinks + secrets** — `components/seo/json-ld.tsx`; `app/[slug]/not-found.tsx`; `components/travel-icon.tsx`; `lib/supabase/service.ts`; `api/auth/email-hook/route.ts`. Exactly 3 `dangerouslySetInnerHTML`: travel-icon (static art), json-ld (confirm `JSON.stringify`, `</script>` breakout), not-found (confirm static literal). The only `.rpc()` is `reorder_custom_field` on an RLS-scoped client. No secret in a `NEXT_PUBLIC_*`/client/JSON; errors don't echo intent ids.

### LOW
- **Marketing / legal / dev pages + dead-code sweep** — confirm ALL `dev/*` pages keep the prod `notFound()` guard. Legal markdown doesn't execute embedded HTML. No knip/ts-prune configured: recommend a one-off knip run rather than hand-auditing (suspects: `packages/shared/src/index.ts` barrel, `lib/mobile-*.ts` shims). Copy follows AGENTS.md.

---

## 6a. Prior audits — CLOSED (low value to re-tread)

- **security-audit-2026-06-10** (full pre-launch sweep): admin AAL2 step-up, MFA-recover rate limit, `rejectBookingCore` intent-cancel + conditional UPDATE, calendar-cancel delegation, the booking-money cluster (conditional `.eq('status',from)` UPDATEs, `deposit_refunded_at`, approve-from-deposit_pending cancels intent, webhook orphan Sentry), DSA + signup rate limiters, perf indexes (0048), slot-lock-leak rollback, subdomain-origin allowlist, add-on EUR guard, GDPR retention cluster, CI. Re-verified by the 2026-06-18 audit §5.
- **payment-audit-2026-06-03** (F1-F15): essentially all closed.
- **payment-audit-2026-06-05** (Slice 79 Custom-Connect P0-1..P0-6): all P0s closed; G2-F1 closed in Slice 80. Do NOT re-litigate the canonical deposit path (server-derived amounts, `on_behalf_of`+`destination` MoR, `application_fee`, idempotent create/refund, webhook amount re-validation).
- **mobile-audit-2026-06-08 + pass-2**: shared API types, TanStack Query, root error boundary, single `config.ts`, deposit server validation, account deletion via shared core, server-typed routes, captureError on mutations.
- **mobile-web-audit-2026-06-18 confirmed-fixed**: BUG-1/2/6, native forgot/reset password, resolve-warning on mobile, custom-field answers on mobile, `deriveBooksOpen` + `createAppointmentCore` extractions.
- **codex-audit-goods-feature** (10 prior Codex findings closed): feature-gate split, `prepareCheckoutAction` authz intersect, portal authoritative prices, webhook dual idempotency, accept-popup parity, SQL-level interest-decision race guard, image storage authz, `reconcileVariants`, deposit-only stale-PI fix, email mapsUrl sanitiser.
- **phase-d + ux-audit**: copy/IA passes shipped; `/start` TODO placeholder, stale "May 2025", Approve/Decline mockup all gone; humanStatusLabel + Accept/Pass + nav-rename slices; Slice-61 auth UI.

## 6b. Open / deferred / known-soft (CONFIRM or fix — high value)

- **[verified] Server push send-half ABSENT** — `lib/server/push.ts` does not exist; nothing POSTs to Expo. Device side is complete. Confirm + scope (load `device_tokens` -> POST `https://exp.host/--/api/v2/push/send` -> delete on `DeviceNotRegistered` -> wire into `createNotification` inserts). Gated externally on FCM creds.
- **[verified gap] `lib/server/bookings.ts` (~1100 lines) has NO direct test**; the Stripe webhook has no test. The highest-risk Supabase+Stripe orchestration is tested only indirectly. No Supabase-client mock harness exists. Top coverage-gap recommendation.
- Webhook status flip (`deposit_pending->approved`, ~L329) is still NOT a conditional `.eq('status',from)` UPDATE — asymmetric with the hardened cores. Confirm a stale/duplicate webhook can't flip a booking that moved on.
- **BUG-3** (still live): web waitlist "Move to booking" (`convertWaitlistEntry`) has no idempotency / already-converted / email guard, unlike the mobile route. Needs shared `convertWaitlistEntryCore`.
- **BUG-4**: mobile studio `icon_color` never persists (camelCase `iconColor` stripped by `studioSchema`). **BUG-5**: web appointment edit has no status guard / required-field validation vs the mobile PATCH. **BUG-7**: MFA pill disagreement (web `factors.totp[0]` vs mobile `.some()`). **BUG-8**: home greeting uses client `Intl.DateTimeFormat` (Hermes-iOS + timezone drift).
- **D-M1**: `device_tokens` upsert squatting — `onConflict:'token'` lets artist B re-register artist A's token; gate before push send lands.
- **Payment fast-follows**: P1-3 `audit_log` keys `amount_eur`/`application_fee_eur` mislabel non-EUR (store currency alongside); P1-6/FUN-10 reuse-path currency/routing staleness; P2-2 no rate-limit on `submitConnectKycAction`; P2-5 server-side minimum-deposit floor (UI min=1, server only checks >0 — confirm).
- **Residual injection/escaping the prior classifier never swept end-to-end (highest-value NEW)**: email-template HTML escaping of user/artist free-text; iCal `SUMMARY`/`DESCRIPTION` CRLF/property injection; `jsonld.ts` `</script>` escaping; Instagram OAuth state replay + logged-in-user-vs-state-artistId account-attach CSRF; column-by-column public `[slug]` RSC over-fetch + the exact iCal PII set; full rate-limit surface->limiter->keying matrix.
- **Track but not launch-blocking**: Instagram `access_token` plaintext at rest; iCal feed PII behind a no-expiry token; webhook checks amount not currency (info).
- **Low hardening backlog (2026-06-10)**: CSP `unsafe-inline`/`unsafe-eval` + `*.supabase.co` wildcard; `serverActions.bodySizeLimit` 52mb global on unauth public actions; web sharp pipelines omit `limitInputPixels` (~6 sites, decompression-bomb DoS on the booking form); `import 'server-only'` on `service.ts`; `logAuthEventAction` lets any artist write arbitrary `audit_log` action strings (allowlist it); raw Postgres `error.message` surfaced to users at 60+ sites.
- **Flash**: folder management UI absent on BOTH web + mobile (table/endpoints exist, no create/rename/delete entry point); Instagram import blocked on Meta verification (env-only).
- **Mobile divergence register**: `settings/books` read-modify-write of the whole `profiles.settings` jsonb (concurrent clobber); goods `image_urls` lost-update (FU-18); optimistic-rollback divergence; ~38 hardcoded English strings vs ~11 i18n keys; `analytics.track()` taxonomy with zero call sites.

---

## 7. Dimensions

Money correctness; payment idempotency/replay; authorization/IDOR; RLS + DB boundary; unauthenticated input validation; injection/XSS/template escaping; secret handling; cross-app drift from `packages/shared`; fail-open vs fail-closed; FSM integrity; open-redirect/OAuth-state/CSRF; test coverage (recommendation); concurrency races + missing idempotency; copy compliance.

## 8. Highest-yield targets (review deepest)

1. `api/stripe/webhook/route.ts` — the single money settlement file (replay / double-fulfilment, the dual-idempotency interaction ~L206-443, count-based guards, the direct status flip ~L329, missing currency check).
2. `lib/server/bookings.ts` — `requestDepositCore`/`refundDepositCore`/`markDepositReceivedCore`/`cancel`; the reuse-vs-changed-amount path, the swallowed catches (~L764/~L864), `getAuthorisedBooking` (~L69). No direct test.
3. `lib/supabase/service.ts` + the 54 service-role sites — owner-filter audit; `admin-queries.ts` dynamic-table query (~L293).
4. `api/mobile/**` (78) + `lib/server/mobile-auth.ts` — every route for `requireMobileUser` and body-supplied-id IDOR.
5. `packages/shared/src/travel-map.ts` `safeMapsUrl` (~L69-75) — regex bypass + safe render.
6. `migrations` (0036/0037/0045/0046/0047/0049/0050/0051/0053) — RLS enabled + no anon-SELECT leak; run the live `pg_policies` query.
7. `lib/email/{booking,auth}-templates.ts` + `api/ical/[token]/route.ts` — free-text into email HTML; iCal CRLF.
8. `api/instagram/callback/route.ts` — state replay + account-attach CSRF + SSRF in `downloadInstagramThumbnail`.
9. `lib/server/push.ts` (ABSENT) — confirm it's the one remaining Android engineering gap.
10. `app/[slug]/page.tsx` + flash/hub — column-by-column public over-fetch.

---

## 9. Baseline (the "before" snapshot)

- master tip `ffb1e05`, working tree clean.
- ~553 web src ts/tsx, 205 routes, 16 server libs; ~139 mobile; 41 shared; 53 migrations; 49 test files (~518 vitest green); ~25k app LOC.
- Debt: ~1 `as any`, ~3 eslint-disable/ts-ignore, ~1 TODO across `apps/{web,mobile}`; 3 `dangerouslySetInnerHTML`; 1 `.rpc()`.
- Gates green: web+mobile tsc, lint, vitest, `next build` (156 routes).

---

## 10. Findings format (emit exactly this so Claude can fix without re-deriving context)

Per finding:

- **id** — stable slug, prefixed by dimension: `MONEY-01`, `AUTHZ-03`, `RLS-02`, `INJ-01`, `DRIFT-02`, `FSM-01`, `COPY-01`. Stable across re-runs.
- **title** — one line.
- **severity** — `blocker | high | medium | low`. Rubric: **blocker** = exploitable real-money loss / cross-tenant breach / auth bypass / unauthenticated RCE-class, fix before Android launch; **high** = privileged-path or PII bug, or a money/idempotency gap exploitable under retry/race; **medium** = correctness bug with a workaround or narrow blast radius, or a just-shipped defect; **low** = hardening, copy, dead code, coverage gap.
- **dimension** — one of §7.
- **scope** — `in-scope-master | open-deferred-confirmed | just-shipped | intentional-false-positive` (the last only to record something you checked and confirmed is intended, so Claude does not chase it).
- **location** — exact file path(s) + line(s) or precise symbol; anchored to `ffb1e05`. Multiple allowed for one root cause.
- **evidence** — the code excerpt / query result proving it, plus a minimal repro / trigger (request shape, event sequence, input). For a race/replay, give the interleaving.
- **whyItMatters** — impact in 1-2 sentences (who is harmed, what data/money moves, under what conditions).
- **suggestedFix** — a concrete minimal change: name the guard (`canTransition` / `.eq('artist_id', userId)` / unique constraint / allowlist / escaping helper), the file, and the shared-module placement if both apps consume it. If a DB constraint/migration, give the migration number it should follow.
- **confidence** — `high | medium | low` (low = Claude verifies at fix time; flag assumptions you couldn't confirm statically).

Group by severity (blocker first), then by tier/surface. At the top: (1) a one-paragraph health rating, (2) a coverage table (surface -> reviewed? -> finding ids), (3) a resolution-log stub mapping each id to TBD for Claude to fill commit hashes. Mirror `docs/codex-audit-goods-feature.md`. Do NOT propose any user-visible copy containing an em-dash.
