# Inklee security & quality audit — 2026-06-10

Branch `feat/mobile-e1`. Pre-launch full audit of web (`apps/web`, Next.js 16 App Router) + mobile (`apps/mobile`, Expo) + database (46 Supabase migrations). Method: multi-agent find → adversarial-verify across 20 dimensions, two workflow runs, plus hand-verification of the highest-stakes findings against source. Raw evidence with file:line + verifier votes: `.claude-audit-digest-round1.md`, `.claude-audit-digest-round2.md`.

## Verdict

**Launchable after the High list is closed.** No critical, attacker-reachable-without-precondition hole was found: deposit amounts are always server-derived, Connect endpoints are self-scoped, RLS shipped on every table created after the 2026-05 incident, the public surface leaks no internal fields, and account deletion is ordered correctly. The risk concentrates in two places that matter for a money product: **MFA can be defeated once a password is stolen** (admin surface + recovery endpoint), and **several booking/deposit transitions can keep a client's money with no record**. Both are fixable in well-scoped changes.

Severities reflect the adversarial verifiers' final calibration (many round-1 "high" items were correctly downgraded to low because they are hardening, not exploitable). Items marked **[verified inline]** were re-checked by hand against source after their automated verifier panel was interrupted.

---

## Remediation status

**High list — fixed 2026-06-10** (typecheck + 353 tests green; each fix passed an independent adversarial review, zero blockers):
- ✅ **High 1** — `lib/admin-guard.ts`: AAL2 step-up enforced in `requireAdmin` (redirect `/auth/mfa`) and `getAdminId` (return null), fail-closed on lookup error/absent levels; `/admin` added to the proxy gate (excluded from the onboarding redirect).
- ✅ **High 2** — `lib/ratelimit.ts` + `api/auth/mfa/recover`: `checkMfaRecoverRateLimit` (5/user/hour, keyed by session id) runs before the code comparison; malformed body now returns 400.
- ✅ **High 3** — `lib/server/bookings.ts` `rejectBookingCore`: refuses to reject a paid deposit (steer to cancel-with-refund), cancels a live unpaid intent, and the status flip is now a conditional UPDATE (`status` + `deposit_paid_at` precondition) that refuses on a concurrent webhook payment.
- ✅ **High 4** — `(artist)/bookings/calendar/actions.ts` `cancelAppointmentAction`: delegates to `cancelBookingCore` (refund-before-cancel, FSM guard, intent cancel, slot rollback).
- ✅ **High 5** — Next.js `16.2.4 → 16.2.9` (+ `eslint-config-next`), lockfile updated.

Medium / Low backlog below is not yet started.

---

## Critical
None.

## High — fix before launch

**Authentication**

1. **Admin surface is exempt from the MFA (AAL2) step-up.** `proxy.ts:5` `ARTIST_PATHS` omits `/admin`, and `lib/admin-guard.ts:22` (`requireAdmin`/`getAdminId`) checks only `getUser()` + `ADMIN_EMAILS` — no assurance-level check. `getAuthenticatorAssuranceLevel` appears exactly once in the whole app (proxy.ts:92), inside `if (isArtistPath)`. A password-only AAL1 session can invoke all 11 service-role admin actions (permanent-delete any account, ban, grant Plus, toggle fee sponsorship) even when the admin enrolled TOTP. *Fix:* enforce AAL2 inside `requireAdmin`/`getAdminId` (fail closed, including on lookup error — proxy.ts:96-98 currently swallows AAL errors too); add `/admin` to the proxy gate for defense in depth; consider requiring enrollment for `ADMIN_EMAILS`.

2. **MFA recovery endpoint has no rate limit → 2FA brute-force.** **[verified inline]** `api/auth/mfa/recover/route.ts` validates an 8-char recovery code against stored hashes with no throttle (confirmed: `ratelimit.ts` exports 9 limiters, none for MFA recover; the route imports no limiter). It requires only an AAL1 session, and on success unenrolls the TOTP factor (line 67) — dropping the AAL2 requirement. An attacker with the victim's password can brute-force the code and defeat 2FA. *Fix:* add a strict per-user + per-IP limiter (e.g. 5/hour) on this route; consider longer codes.

**Booking money path** (all [verified inline] against `lib/server/bookings.ts` + `calendar/actions.ts`)

3. **`rejectBookingCore` (bookings.ts:415-481) never cancels a live deposit PaymentIntent.** `deposit_pending → rejected` is a legal transition and both UIs offer "Pass" on a deposit-pending booking, but the function has zero Stripe calls (contrast `markDepositReceivedCore:850` and `cancelBookingCore:1013` which both cancel the intent). After a "Pass", a client with the payment page still open can pay; the webhook then 409s (route.ts:210-215) — money captured in the artist's account, no `deposit_paid_at`, no audit row, no refund. No race needed; minutes apart. *Fix:* cancel a live unpaid intent (and refuse to reject a `deposit_paid_at` booking without an explicit refund) inside `rejectBookingCore`.

4. **Calendar `cancelAppointmentAction` (calendar/actions.ts:145-221) bypasses `cancelBookingCore`.** It selects only `artist_id, customer_email, slot_id` (never deposit fields), does **no** `canTransition` check, hardcodes `details:{from:"approved"}` (line 189) and the rollback-to-"approved" (line 179), and makes **no** refund / intent-cancel call. The calendar lists all approved bookings including deposit-paid ones (calendar/page.tsx:17), so an artist cancelling a paid appointment from the calendar — a completely natural flow — keeps the client's money with no refund and no forfeiture record, diverging from the detail-page and mobile paths that use `cancelBookingCore`. *Fix:* delete the bespoke logic; delegate to `cancelBookingCore`.

**Dependency**

5. **Next.js 16.2.4 → upgrade to ≥16.2.6.** `pnpm audit` reports proxy/middleware-bypass advisories (GHSA-26hh-7cqf-hhc6 and the segment-prefetch class) patched in 16.2.5/16.2.6; `proxy.ts` is the sole MFA-step-up enforcement point, so a proxy bypass neutralizes the TOTP requirement. Bump `next` + `eslint-config-next` to ≥16.2.6 (16.2.9 latest on the line).

---

## Medium

**Booking / deposit correctness** (all [verified inline])
- **Every status transition is check-then-write** — `approveBookingCore:143`, `rejectBookingCore:428`, `markDepositReceivedCore:862`, `cancelBookingCore:1025` all read → `canTransition` in JS → unconditional `.update(...).eq("id", id)` with no `.eq("status", from)` and no DB backstop. Interleaved requests (webhook vs reject; cancel vs mark-received) can both pass and both write. `booking_interests` already does it right (`.eq("status","pending")`). *Fix:* make every transition a conditional UPDATE keyed on the expected `status` + `.select()`, treat 0 rows as "state changed, retry".
- **After a refund a booking can never be cancelled.** `refundDepositCore` records the refund only in `audit_log` and never clears `deposit_paid_at`/`deposit_payment_intent_id` (bookings.ts:968). `cancelBookingCore:1008` then re-enters the refund branch, `refundDepositCore` hits its own idempotency guard (`:938` "already been refunded"), and the cancellation aborts — booking stuck `approved`, slot stuck `booked`, forever. *Fix:* add `deposit_refunded_at`, skip the refund step when already refunded.
- **`approveBookingCore` from `deposit_pending` leaves the intent live** (no Stripe call, unlike `markDepositReceivedCore`). Reachable via stale UI or a direct `/api/mobile/bookings/[id]/approve` call; the webhook then swallows the later payment as a replay (route.ts:407). *Fix:* cancel the intent in both approve cores when prior status is `deposit_pending`.
- **Stripe webhook orphaned-payment branches** (amount-mismatch 409 `route.ts:261`; order-mismatch 409 `:239`; terminal-status silent skip `:407`) record nothing on a *succeeded* PaymentIntent — money captured, no reconciliation row. *Fix:* write a `deposit_payment_orphaned` audit row + Sentry capture in every non-advancing branch.
- **`requestDepositCore` persists a new deposit amount even when the live `paymentIntents.update` failed** (bookings.ts:660, best-effort catch) → guaranteed webhook amount-mismatch on a real charge. *Fix:* treat the intent update as mandatory on the reuse path.
- **`charge.refunded` conflates partial dashboard refunds with full** (webhook route.ts:106) → a €1 partial refund writes a terminal `deposit_refunded` row that blocks in-app refund/cancel forever. *Fix:* distinguish full vs partial.
- **Add-on checkout sums EUR goods into a non-EUR deposit intent** (request/[token]/actions.ts:416, records `currency:"eur"`). Latent — gated behind `GOODS_COMMERCE_ENABLED` + `CHECKOUT_ADDONS_PROD_READY` (both off) — **must be fixed before un-parking goods commerce.**
- **Slot lock leaks on image-processing/upload failure** during public submit ([slug]/actions.ts:423/442/454 return without reopening the slot) → slot stuck `locked`, unbookable and undeletable. *Fix:* reopen the slot on every post-lock failure path; or lock after image processing.

**Abuse / rate limiting**
- **DSA report action has no rate limit** (`legal/report/actions.ts` — honeypot only) → unauthenticated email relay to attacker-chosen addresses from Inklee's sending domain. *Fix:* IP-keyed limiter before send.
- **Signup action has no rate limit + leaks account existence** (`(auth)/signup/actions.ts` — "An account with that email already exists.") → mass-signup email flood + enumeration. *Fix:* IP limiter + honeypot; neutral response.

**Privacy / GDPR**
- **`audit_log`/`admin_action_log` retain artist email + display_name after deletion** (`admin/accounts/[id]/actions.ts:272`, `webhook/route.ts:86` for client emails) — contradicts counsel §8's pseudonymous-record ruling.
- **No scheduled purge implements the 7-year / 24-month retention commitments** (vercel.json has only cleanup/reminders/instagram-refresh) — `deleted_account_records` 0047 even says a purge "is required."
- **Cleanup cron cascade-deletes financial records** — 30-day-old cancelled bookings cascade-delete paid `orders` (0036 ON DELETE CASCADE) and `deposit_*` audit rows (the only in-app money trail). *Fix:* exclude money-state bookings or `SET NULL` the FKs.
- **Web account deletion has no re-auth; mobile re-auth is client-side only** (`settings/account/actions.ts:17`, `api/mobile/account/route.ts:14` — own TODO comment) — counsel §9 control on the unenforceable side of the trust boundary.
- **Published privacy notice contradicts implemented deletion behavior** (`content/legal/privacy.md:65` still says "plus 30 days"; counsel §10 clauses unpublished; cancelled-bookings row overstates retention).

**Mobile**
- **Apple sign-in has no nonce** (`auth.tsx:126`) — Apple ID-token replay not prevented (low-ish; no capture path in this codebase, but cheap to add).
- **`reference_link` opened via `Linking.openURL` with no scheme allowlist** (`bookings/[id].tsx:89`) — public booking form's URL is validated only by `z.string().url()` which permits `tel:`/`sms:`/arbitrary app schemes. *Fix:* restrict to http(s) before `openURL`; tighten the shared schema.

**Other correctness**
- **Public booking origin check rejects artist-subdomain submissions** ([slug]/actions.ts:59) — breaks every booking once `*.inkl.ee` bio-domain mode goes live. *Fix:* allowlist the bio-domain pattern, or drop the redundant check.
- **`proxy.ts` `ARTIST_PATHS` missing `/goods` and `/notifications`** — those routes get no MFA step-up (and the list is a drift hazard). *Fix:* derive the gate from the route group + a covering test.
- **Validation drift** — mobile normalizers enforce bounds the web actions don't (`mobile-settings.ts` vs `settings/profile/actions.ts`); web can store data mobile then refuses to round-trip. *Fix:* route web actions through the tested normalizers.

**Performance**
- **`booking_requests` has zero secondary indexes** (0000) despite being hit by the artist layout, mobile inbox, the unauthenticated token portal, the Stripe webhook, and public flash pages. Add `(artist_id, created_at desc)`, `(artist_id, status)`, partial indexes on `customer_token_hash` and `deposit_payment_intent_id`, FK indexes on `slot_id`/`trip_id`/`flash_item_id`.
- **`audit_log`, `slots`, `waitlist_entries`, `booking_images` lack indexes** on their hot filter/FK columns. Add `(booking_id, action)` on audit_log (+ partial expr index for the token-reuse scan), `(artist_id, status, starts_at)` on slots, `(artist_id, status)` on waitlist, `(booking_id)` on booking_images.
- **Public `/[slug]` page runs up to 8 queries sequentially** + booking-detail page does a per-image `createSignedUrl` N+1. `Promise.all` the independent queries; use `createSignedUrls` batch.

**Test coverage** (regression risk on the money path; no CI runs any of it)
- No `.github/workflows`; pre-commit runs typecheck/lint/build but never `pnpm test` (1.26s suite). Stripe webhook, `lib/server/bookings.ts` cores, the `booking-fsm` table, and the public token portal have **zero** tests; no test exercises a cross-artist authz failure; e2e never covers the pay→webhook→confirm path and two specs are stale (still click "approve"/"reject" pre-Slice-60a). *Fix:* CI job running `pnpm test` on PRs; extract + unit-test the webhook handler and the `*Core` functions; one negative-authz API test.

---

## Low / hardening (high-signal subset)

- **Sentry effectively not wired** — no `onRequestError`, no `withSentryConfig`, `sentry.client.config.ts` is dead code; webhook/cron/mobile routes auto-capture nothing (instrumentation.ts). Add `export const onRequestError = Sentry.captureRequestError`.
- **CSP allows `unsafe-inline` + `unsafe-eval`** (next.config.ts:19); `X-Frame-Options: SAMEORIGIN` disagrees with `frame-ancestors 'none'`.
- **`images.remotePatterns` + CSP `img-src` use `*.supabase.co` wildcard** — pin to the project ref (open image-proxy / arbitrary-origin images).
- **`serverActions.bodySizeLimit: "52mb"` is global**, including unauthenticated public actions.
- **Web sharp pipelines omit `limitInputPixels`** at 6 call sites (only `mobile-image.ts` has it) — decompression-bomb DoS on the unauthenticated booking form.
- **`CRON_SECRET` reused as the Instagram OAuth state HMAC fallback** (instagram.ts:51); **Instagram access tokens stored plaintext** (0019, own comment flags it).
- **`service.ts` guarded only at runtime** — add `import "server-only"`.
- **`.env.example` omits 13 used vars** incl. `ADMIN_EMAILS`, `CRON_SECRET` (fail-closed but silently disable admin/cron on a fresh deploy).
- **Audit writes are silently lossy** — `writeAudit` discards the insert error and ~19 sites call it fire-and-forget (`void`) before responding; on Vercel the floating promise can be dropped.
- **Mobile sign-out fails silently offline** (auth.tsx:150 ignores the error → session stays in SecureStore); **push token sent in DELETE URL query** (push.ts:114 → lands in access logs).
- **`logAuthEventAction` lets any artist write arbitrary `action` strings into `audit_log`** (settings/account/actions.ts:133) — allowlist it.
- **shadcn CLI is a prod dependency** dragging hono/express/qs transitives = 12 of the `pnpm audit` advisories (none runtime-reachable) — move to devDependencies or `pnpm dlx`.
- **~35 em-dash copy-rule violations** across web/mobile/email/SEO strings (shared validators in `slug.ts`/`booking-fsm.ts` fan out to both apps); raw Postgres `error.message` surfaced to users at 60+ sites.

---

## Verified-clean areas (no action needed)

- **RLS:** every table created after the 0026–0031 lockdown (`products`, `product_variants`, `orders`, `order_items`, `booking_interests`, `mobile_waitlist`, `account_overrides`, `device_tokens`, `deleted_account_records`) shipped `ENABLE ROW LEVEL SECURITY` + an `auth.uid()`-scoped (or service-role-only) policy in the same migration. No repeat of the 0001 incident.
- **Payments:** deposit + add-on amounts are always server-derived; webhook verifies signature, cross-checks `artist_id`/amount/intent binding, and is idempotent via the audit-row gate + `.select()`-gated order flip; refunds are full-only and ownership-checked; Connect link/payouts derive `stripe_account_id` from the authenticated caller's own row.
- **Server actions:** all 46 `"use server"` files resolve the user first and scope mutations to them; all 11 admin actions re-run `getAdminId()` in-body and dual-log; public token portal re-hashes the token, enforces 30-day expiry + FSM guards.
- **Storage:** `bookings` bucket private with `auth.uid()`-scoped SELECT, `logos` public-by-design only; paths are always `${userId}/...` + random UUID (no traversal); deletion lifecycle purges both buckets.
- **Mobile client:** session in `expo-secure-store` (never AsyncStorage) with PKCE; bearer token only to the configured API origin; notification-tap routing has an allowlist excluding `/account`/`/settings`; no embedded secrets beyond the public anon key.
- **Login** is rate-limited with a generic error (no enumeration oracle); **reset-password** redirects to a constant (no open redirect).

---

## Residual coverage gaps (recommend a follow-up pass)

The usage-policy classifier blocked the dedicated finders for these dimensions in both runs; they are partially covered by adjacent dimensions but were not swept end-to-end:
- **Injection / XSS** — email-template escaping of every user/artist string (names, notes, custom-field answers, goods titles), iCal `SUMMARY`/`DESCRIPTION` CRLF injection (`api/ical/[token]`), and `jsonld.ts` `</script>` escaping. The booking-templates href sanitizer is tested; the rest of the text-interpolation sites were not individually verified.
- **Webhooks / OAuth** — the Instagram callback's OAuth `state` replay window and the logged-in-user-vs-state-`artistId` binding (CSRF account-attach) were not traced end-to-end.
- **Public surface** — a column-by-column review of every public `[slug]` query's RSC payload for over-fetched internal fields, and the exact PII set in the iCal feed.
- **Full rate-limit matrix** — surface → limiter → keying map; `get-client-ip` header-trust on Vercel.

Re-running these inline with defensive "verify the control" framing (not attack framing) will close the loop.

---

## Suggested order of work
1. **Auth (High 1, 2)** + **Next.js bump (High 5)** — small, high-leverage.
2. **Booking money path (High 3, 4 + the Medium deposit/FSM cluster)** — these share root causes; fixing them together (conditional UPDATEs, intent-cancel on every terminal transition, `deposit_refunded_at`, delegate calendar-cancel to the core) closes most of the money-correctness risk.
3. **Webhook reconciliation rows + the abuse limiters (DSA report, signup)** — cheap, observable.
4. **Indexes + CI** before traffic ramps.
5. The GDPR retention/purge + privacy-notice items before the deletion feature is announced.
6. Hardening backlog (Low) as capacity allows.
