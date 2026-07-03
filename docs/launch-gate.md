# Inklee launch gate — final to-do (Android-first + web)

**Decision (2026-06-23):** launch **Android + web first**; the iOS/Apple track is deferred.

**Where we are:** the deposit-path **code is done** (Slice 80 P0 closeout, verified 2026-06-23) and the guest-spot map + icon polish + mobile splash shipped (prod `master 268996f`). What remains is almost entirely **founder config** (Vercel env + Stripe/Supabase dashboards) and **external ops** (store, real artist, counsel), plus **one real code task** (server push send-half).

**Source:** the 2026-06-23 launch-blocker sweep (7-agent workflow over roadmap + payment audit + the fail-closed config gates in code + the mobile/web audits). Deep procedures live in [`beta-launch-checklist.md`](./beta-launch-checklist.md) (Stripe live phases C–E) and [`mobile-launch-checklist.md`](./mobile-launch-checklist.md) (mobile T1–T6); this file is the single top-level gate.

**The trap to internalize:** several prod paths **fail closed** when their env var is unset. A green build does NOT prove they are set. The product can look "launched" and silently take zero bookings / send zero emails. Confirm every var in the table below.

---

## 0. Already owned by the founder (in flight — not re-listed below)

- [ ] **Stripe LIVE keys** — `sk_live_…` / `pk_live_…` in Vercel Production (code only warns on test keys, it does not block).
- [x] **Onboarding wizard slide graphics (×3)** — ✅ DONE: the founder's 3 brand illustrations ship on BOTH surfaces via `packages/shared/src/onboarding-art.ts` (OB-1, merged to master in the 2026-06-29 mvp-bughunting merge `66fb48b`).
- [ ] **Instagram / Meta flash-import → PUBLIC access** — ⏳ IN REVIEW (2026-07-03). Corrected: NO new Meta app was ever needed (the June-17 diagnosis confused Meta-App-ID with Instagram-App-ID); prod env + redirect have been correct since May 10 and the flow works end-to-end for Instagram-Testers. The real chain to public: Business verification for portfolio "inklee.app" as Inklee OÜ (**resubmitted 2026-07-03, in Meta review**) → clear the Business-Account restriction → Zugriffsverifizierung (tech provider, ~5 days) → App Review Advanced Access for `instagram_business_basic` → app Live. Code prep before App Review: privacy-policy Instagram section + disconnect must delete the token row (currently only flips `connected`). Detail: memory `flash-instagram-meta-setup`.
- [ ] **Apple / iOS App Store** — DEFERRED (Android-first). Not an Android blocker.

---

## 1. 🔴 Hard blockers (the product is broken or unsafe without these)

### 1a. Vercel Production env — fail-closed gates
> **✅ Verified 2026-07-03 (names via the Vercel API):** every var in the quick-reference table below EXISTS in Production, including both Upstash vars, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_AUTH_HOOK_SECRET`, Resend, `CRON_SECRET`, `ADMIN_EMAILS`, both Sentry DSNs; `GOODS_COMMERCE_ENABLED`/`CHECKOUT_ADDONS_PROD_READY` are correctly UNSET. Values were not decrypted — the remaining risk is a wrong/stale VALUE, and `STRIPE_SECRET_KEY` is known to be a TEST key. Behavior checks (a real booking submission, an auth email) still prove the values work; fold them into G-5.

- [x] **`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`** — set; confirm with one real test booking during G-5.
- [x] **`STRIPE_WEBHOOK_SECRET`** — set, but it must be replaced with the LIVE webhook's `whsec_…` at cutover (the current one is the test-mode endpoint's).
- [x] **`SUPABASE_AUTH_HOOK_SECRET`** — set; confirm with one signup/reset email during G-5.

### 1b. Stripe LIVE setup (live mode is separate from sandbox — see `beta-launch-checklist.md` Phase C–E)
- [ ] **Enable Connect + Custom accounts in LIVE mode** and complete the Inklee OÜ platform profile. Re-confirm the controller / loss-liability / `fees.payer:application` settings match sandbox (sandbox config does NOT carry over). [OT-12]
- [ ] **Create the LIVE webhook** → `https://inklee.app/api/stripe/webhook` (NOT the apex `inkl.ee`, which 308-redirects and strips the body/signature). Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `account.application.deauthorized`. Put its `whsec_…` in `STRIPE_WEBHOOK_SECRET` (1a). No separate Connect webhook needed.
- [ ] **G-5: one real €1–5 deposit + refund** end-to-end on live (the only thing never done outside sandbox). Verify via Stripe API: charge paid, `application_fee` = 3%, `on_behalf_of`/`destination` = artist, booking flipped to Accepted via the LIVE webhook, emails sent; then refund and confirm return.
- [ ] **Comp the beta artists to Plus** (`/admin/accounts` → Plan → Plus/Comp) — deposits are entitlement-gated; without it testers get no card form. (Requires `ADMIN_EMAILS`, §2.)

### 1c. Supabase Auth dashboard (this is why "Android has no blockers" is not quite true)
The APK builds fine, but for sign-in to work, in the **prod Supabase dashboard**:
- [ ] Add deep-link redirects to the allowlist: `inklee://auth-callback`, `inklee://auth-confirm`, `inklee://reset-password` (+ `exp://` for dev). The reset-password deep link is required for the already-shipped native forgot/reset flow.
- [ ] Set **Site URL** = `https://inklee.app`.
- [ ] Ensure **"Allow new signups" is ON** (off = neither web nor native sign-up can create accounts).
- [ ] Enable the **Google provider** with prod credentials.

---

## 2. 🟠 Important — set at launch (these fail *silently*)

- [ ] **`RESEND_API_KEY` (live) + `EMAIL_FROM`** + verify the `inklee.app` sending domain (SPF/DKIM/DMARC) in Resend. `send.ts` only `console.warn`s when unset, so all email silently vanishes.
- [ ] **`CRON_SECRET`** — else all 4 Vercel crons 401: reminders stop, cleanup stops, and the **monthly GDPR retention purge never runs** (compliance exposure). Also the Instagram OAuth state-secret fallback.
- [ ] **`ADMIN_EMAILS`** — fail-closed: unset = `/admin` reachable by no one (so you can't comp artists / moderate DSA reports).
- [ ] **Confirm core Supabase env + pooled `DATABASE_URL`** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` on port 6543 transaction mode `?pgbouncer=true`). Placeholders mask absence at build time.
- [ ] **Confirm `NEXT_PUBLIC_APP_URL=https://inklee.app`** and **`NEXT_PUBLIC_PUBLIC_BIO_DOMAIN=inkl.ee`** (a wrong value silently breaks emailed magic/reconfirm links + the IG redirect).
- [ ] **Recruit the first real artist → 4-week soak** (the actual Phase-1 close gate: ≥1 real artist daily for 4 weeks, deposits/refunds clean, no critical bug in the last 14 days).

---

## 3. 🟠 Code task (the only engineering work left)

- [x] **Server-side push send-half — ✅ BUILT 2026-06-24** (Codex audit DRIFT-01: `lib/server/push.ts` exists and is wired into `createNotification`). Delivery still fires only once **FCM creds** exist (§5) + a fresh EAS build ships. What remains here is verification, not code.
- [ ] **Mobile min-version kill-switch** (critic catch). No OTA + no remote-disable = a bad real-money build can't be recalled. Add a tiny `/api/mobile/min-version` check + a blocking "update required" screen, before the first money-path build.
- [ ] **Verify the privacy retention-table row** matches the cleanup-cron behavior (cancelled non-money bookings are deleted at 30 days) before the public web launch.
- [ ] **Run the `pg_policies` RLS sanity check** before any further prod migration push (standing process gate after the 0001 incident).
- [ ] **Smoke-test the postponed Stripe edges** before any non-EUR or manual-fallback artist: non-EUR (e.g. GBP) end-to-end, dashboard-refund reconciliation, declined-card `payment_intent.payment_failed`, reuse-after-deauthorize.

---

## 4. 🟡 Public-web-launch hardening (a private APK beta can defer these)

- [ ] **Google Play release pipeline** — only for a PUBLIC Play listing (a private comped beta distributes the existing preview APK fine). Open: production EAS profile + Play service account (`eas.json submit.production` is empty), store listing/screenshots/age-rating/**Data Safety form**, internal-testing soak. **Back up the cloud keystore (`eas credentials`) before any release.**
- [ ] **CAPTCHA/Turnstile** on public booking + waitlist + signup (today the only defense is the per-IP rate limiter).
- [ ] **Vercel Preview deployment protection** — previews point at the prod Supabase; a leaked preview URL is an unauth path to prod data. Confirm Deployment Protection is ON (and `NEXT_PUBLIC_LEGAL_PENDING_REVIEW=false` in Preview if you share preview URLs).
- [ ] **Supabase plan / backups** — the privacy page promises 30-day backups, but Free = 7-day PITR + daily only. Upgrade to Pro before real artist data, or correct the privacy copy to 7 days.
- [ ] **Supabase auth email rate limit** (default ~2–4/hr) can throttle launch-day signups/magic-links; raise it in the dashboard.
- [ ] **Password policy** — bump minimum length to ≥8 and enable leaked-password (HIBP) protection (Pro) for accounts that control payouts.
- [ ] **`SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`** — set at the Stripe-live cutover so payment/webhook errors are observable (the webhook already flags amount-mismatch/orphaned intents to Sentry).
- [ ] **Lock the Google Maps key** — `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is in the client bundle; add an HTTP-referrer + per-API restriction to `inklee.app` + a billing quota/alert.
- [ ] **Email verification cutover** (optional for launch; account hygiene) — the `feat/email-verification` branch is unmerged. If enforcing: merge it, flip "Confirm email" ON in the prod Supabase dashboard, verify the hook + secret, raise the rate limit, allowlist `inklee://auth-confirm`, native signup test.
- [ ] **Keep `GOODS_COMMERCE_ENABLED` and `CHECKOUT_ADDONS_PROD_READY` UNSET** (goods stay showcase-only; known latent EUR bug) — verify they are OFF while flipping other Stripe-live vars.
- [ ] **Post-launch hardening:** install `expo-updates` + `eas update:configure` (OTA); AES-GCM encrypt Instagram OAuth tokens at rest; iCal capability-token PII (hash token, drop email).

---

## 5. External ops (gating §3 push + the beta)

- [ ] **Android FCM credentials** — no `google-services.json` / FCM config exists; create the Firebase project + upload the service account to EAS credentials. Gates the push send-half.
- [ ] **On-device Android bug sweep** on a real device with the latest preview APK (verify sign-in/sign-up/booking end-to-end; ME-7 Google sign-in + ME-8 native email signup are code-complete but unverified on a real build). Depends on §1c.

---

## 6. Counsel (run in parallel; not hard blockers)

- [ ] **LO-2** — PSD2 / merchant-of-record analysis for the Connect deposit flow (artist-as-MoR, `fees.payer:application`).
- [ ] **LO-5** — DPIA covering booking-image processing, magic-link tokens, the Stripe flow.
- [ ] Lower-urgency (post-launch follow-up): LO-1 DPO, LO-3 DSA Art.19 exemption, LO-4 liability-cap enforceability, LO-6 CCPA/CPRA, LO-7 Estonian VAT threshold, LO-8 homepage "GDPR compliant" badge residual.

---

## 7. ✅ Verified done (so it is not re-litigated)

- Deposit-path code hardening (Slice 80 P0s — 5/6 already closed, G2-F1 + the email EUR residual fixed + deployed).
- Account-deletion re-auth (shipped server-side on both web + mobile).
- Legal "pending review" footnote OFF in prod (`NEXT_PUBLIC_LEGAL_PENDING_REVIEW=false`, 2026-05-20).
- Guest-spot travel map + icon polish + mobile splash (prod `master 268996f`, web live, Android APK built `ebae8796`).

---

## Vercel Production env — quick reference

| Var | Why | Fail mode if unset |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limiter | **booking/waitlist/auth reject ALL submissions** |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | live payments | test-mode banner; no real charges |
| `STRIPE_WEBHOOK_SECRET` | webhook verify | deposits never flip to Accepted; no emails |
| `SUPABASE_AUTH_HOOK_SECRET` | auth email hook | all confirm/reset/magic-link email 500s |
| `RESEND_API_KEY` / `EMAIL_FROM` | all email | email silently disappears |
| `CRON_SECRET` | 4 crons | reminders + **GDPR purge** stop (401) |
| `ADMIN_EMAILS` | /admin | no one can reach admin (can't comp artists) |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` | DB + auth | runtime auth/DB errors (build-safe placeholders mask it) |
| `NEXT_PUBLIC_APP_URL` (=`https://inklee.app`) / `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN` (=`inkl.ee`) | links + public hosts | emailed links break |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | error monitoring | payment errors unobserved (recommended) |
