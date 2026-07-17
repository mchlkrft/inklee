# Inklee launch gate — strict MVP blockers (web + Android)

**Rewritten 2026-07-03** after challenging the previous version against `docs/roadmap.md` and LIVE verification (Vercel env API, Supabase Management API, Resend API, git). The old gate was materially stale: most "unset env" blockers were already set, the push send-half already exists, the onboarding art already shipped. This version lists ONLY tasks that block a fully working web + Android MVP; everything else is explicitly parked at the bottom with the reason.

**Definition of "fully working MVP":** a real artist can sign up (web AND the Android app), configure their page, receive real client bookings, collect a real deposit with the 3% fee, get emails and push notifications, and the founder can administer accounts. Nothing fails silently.

**Roadmap note:** roadmap §3.1/§8/§9 still carry the pre-reset "Bio Page + Goods cluster + OT-12 gate launch" framing. That is superseded — goods are showcase-only (2026-06-03 money-scope reset) and the deposit code is done. THIS file is the launch source of truth.

---

## ✅ Verified working (live-checked 2026-07-03 — do not re-litigate)

- **Every Production env var is SET** (names via Vercel API): Upstash ×2, Stripe ×3, `SUPABASE_AUTH_HOOK_SECRET`, Resend + `EMAIL_FROM`, `CRON_SECRET`, `ADMIN_EMAILS`, Supabase ×4, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN`, Sentry ×2, Maps. Goods flags correctly UNSET. Only known-wrong VALUE: `STRIPE_SECRET_KEY`/publishable are test-mode; `STRIPE_WEBHOOK_SECRET` is the test endpoint's.
- **Resend sending domain `inklee.app` is VERIFIED** (Resend API) — email infra is real.
- **Supabase Auth prod config** (Management API): Site URL = `https://inklee.app` ✅, signups ON ✅, Google provider ENABLED ✅. The two gaps (deep-link allowlist, email rate limit) were closed 2026-07-07 → blockers 5 + 6 below.
- **`DATABASE_URL` is the pooled connection** (re-verified 2026-07-07 via Vercel API): `*.pooler.supabase.com:6543`, and `src/db/index.ts` sets `prepare: false` for the transaction pooler. No `?pgbouncer=true` needed (that flag is a Prisma convention; the driver is postgres-js).
- **Re-verified live 2026-07-07:** all Production env var names still set; Stripe live webhook `enabled` at `https://inklee.app/api/stripe/webhook` with all 5 events; live key `livemode: true`; `/api/mobile/min-version` returns disarmed defaults on prod.
- **Deposit-path code done** (Slice 80 P0 closeout + Codex MONEY-01..04); **server push send-half EXISTS** (`lib/server/push.ts`, wired into `createNotification`); **onboarding art shipped** both surfaces (OB-1); **FU-18 image-race guard + FU sweep deployed** (`ff44a7e`).
- Web prod is live and git-tracked from `master`; 541 tests green; full build green.

---

## 🔴 The blockers (ordered — this is the whole list)

### Money path (web) — founder, ~half a day total

1. **Stripe LIVE cutover.** ✅ DONE 2026-07-04. `STRIPE_SECRET_KEY` (sk_live_, Inklee OÜ `acct_1TODmK…`, verified `GET /v1/balance` livemode + EUR balance) and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_live_) swapped in Vercel Production and redeployed (prod `84dfc2a`); build log no longer logs the test-mode warning. Live account shows `card_payments: active` + `transfers: active` (Connect ready). Secrets mirrored to the Control Tower vault (`stripe-inklee-live`). NOTE: vars are type "Encrypted" (readable via `vercel env pull` by the project owner) — flip to "Sensitive" in the dashboard if you want them write-only. Still confirm the Connect controller / loss-liability / `fees.payer: application` settings from `beta-launch-checklist.md` Phases C–E carried over (G-5 validates).
2. **LIVE webhook.** ✅ DONE 2026-07-04. Endpoint `we_1TpPmyHkG0exykzFYTq26SyV` created + `enabled` at `https://inklee.app/api/stripe/webhook` with all 5 events (`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `account.application.deauthorized`). Its `whsec_…` is in `STRIPE_WEBHOOK_SECRET` (Vercel prod) + the vault (`stripe-webhook-inklee-live`); verified live: unsigned POST → 400 (signature check active).
3. **G-5: one real €1–5 deposit + refund end-to-end on live.** The only money flow never run outside sandbox. Verify: charge paid, `application_fee` = 3%, `on_behalf_of`/destination = artist, booking flips to Accepted via the live webhook, emails send; then refund and confirm the return. **This run doubles as the value-check for the fail-closed env vars** (one public booking submission proves Upstash; one signup/reset email proves the auth hook + Resend).
4. **Comp the beta artists to Plus** (`/admin/accounts` → Plan). Deposits are entitlement-gated — without this, testers never see a card form. (`ADMIN_EMAILS` is set, so `/admin` works.)

### App path (Android) — founder config + one small code task

5. **Supabase redirect allowlist — add the mobile deep links.** ✅ DONE 2026-07-07 (via Management API, PATCH `config/auth`). `uri_allow_list` now = the two web URLs + `inklee://auth-callback`, `inklee://auth-confirm`, `inklee://reset-password` + `exp://**` (Expo Go dev wildcard). Verified persisted by re-reading the config. On-device confirmation happens in the blocker-9 sweep (ME-7/ME-8).
6. **Raise the auth email rate limit.** ✅ DONE 2026-07-07 (via Management API). `rate_limit_email_sent` raised **2 → 30/hour**, verified persisted. Note: `mailer_autoconfirm=false` suggests email confirmation IS currently required in prod; the G-5 signup test will confirm the actual behavior either way.
7. **Android FCM credentials.** ✅ DONE 2026-07-07. Firebase project `inklee-99004` created standalone under the `inklee.app` org (owner `official@inklee.app`; `michel.kraeft@gmail.com` holds Editor + Project IAM Admin as lockout backup). `google-services.json` wired via `apps/mobile/app.config.js` + the `GOOGLE_SERVICES_JSON` EAS file env var (file gitignored — public repo); FCM V1 service-account key generated via gcloud (org policy `iam.disableServiceAccountKeyCreation` temporarily overridden on the project, then re-enforced — rotation procedure in the vault entry) and uploaded to EAS credentials by the founder. Both files mirrored in the Control Tower vault (`firebase-fcm-inklee`, `google-services-inklee`).
8. **Mobile min-version kill-switch** — ✅ CODE DONE 2026-07-04 (deployed, master `8928954`). `GET /api/mobile/min-version` (unauthenticated, fail-open) + a blocking "update required" screen wired above the auth gate; semver compare single-sourced in `packages/shared/src/app-version.ts` (unit-tested). Verified live on prod: unset = `{minVersion:"0.0.0",updateRequired:false}` (disarmed, nobody blocked). **Founder config when cutting the money-path build:** set `MOBILE_MIN_VERSION` (or `MOBILE_MIN_VERSION_ANDROID`) + `MOBILE_UPDATE_URL` in Vercel Production. To recall a bad build later: raise the minimum above it and redeploy. The mobile screen reaches devices only via the next EAS build (#9).
9. **Fresh EAS Android build + on-device sweep.** 🔨 BUILD IN FLIGHT 2026-07-07: `e4f0633c` (preview profile, master `9b2688d`) carries everything since `ebae8796`: push, the kill-switch screen, trip date-range picker, native support screens, flash + Instagram. Remaining = the on-device sweep once it lands: Google sign-in (ME-7), native email signup incl. the confirm deep link (ME-8 — deep-link allowlist fixed 2026-07-07), booking flow end-to-end, one push notification E2E. Distribution for the private beta = this preview APK directly; **no Play listing needed**.

### App path (iPad/tablet) — added 2026-07-17, founder decision: last biggie before launch

10. **ME-15: iPad/tablet adaptive optimization.** ✅ DONE 2026-07-17 — audited (20-agent), built in 5 phases (window-class layout system, expanded-class nav rail, master-detail for requests/clients/calendar, adaptive sheets, width caps on all 57 screens, `ios.supportsTablet=true` + iPad rotation/Split View/Stage Manager), adversarially reviewed (70 agents, 29 confirmed findings fixed), shipped as **0.3.0 (TestFlight build 4 + Android preview)** and **founder-verified on the iPad same day: everything works**. SoT: `docs/me15-tablet-audit.md` (decisions + §7 completion report; deferred post-launch polish in §7.12/13). Follow-up rider for the PUBLIC App Store release (not beta-blocking): iPad screenshots are now mandatory in the ASC listing.

### Standing process gates (not tasks, but do not skip)

- Migration bookkeeping is now CURRENT through 0060 (verified 2026-07-04: `supabase migration list` shows local≡remote; the 0056 file was re-added to align). No repair is needed before the next push. (Superseded the old "records only through 0051 → repair 0052-0055" note.) Still run the `pg_policies` RLS sanity check after any new migration (post-0001-incident rule, see AGENTS.md).
- While flipping Stripe vars: confirm `GOODS_COMMERCE_ENABLED` / `CHECKOUT_ADDONS_PROD_READY` stay unset (verified unset today).

### The finish line

**Recruit the first real artist → 4-week soak** (daily use, deposits/refunds clean, no critical bug in the last 14 days). This is the Phase-1 close criterion, not a config task. The recruitment vehicle already exists code-complete: the Founding Artist page on branch `feat/founding-artist-beta` (roadmap §3.9, migration 0056 already applied) — merging it is the natural first step of recruitment.

---

## 📦 Parked — explicitly NOT MVP-blocking (and why)

| Item | Why parked |
| --- | --- |
| Instagram import PUBLIC access | Works for Instagram-Testers now. Business verification APPROVED 2026-07-06. Code prep DONE (privacy §3.4, deauthorize + data-deletion callbacks, migration 0061). Remaining = founder dashboard chain (restriction check → access verification → App Review → Live); submission kit in `docs/instagram-app-review.md`. |
| Google Play listing (production EAS profile, store assets, Data Safety form) | Private beta distributes the preview APK directly. Needed only for a PUBLIC store launch. Back up the cloud keystore before any release. |
| Vercel Preview deployment protection | Verified OFF today. Previews point at prod Supabase — do not share preview URLs until enabled. Pre-public item, not MVP. |
| CAPTCHA/Turnstile on public forms | Rate limiter is active (Upstash set). Add before public marketing push. |
| Supabase Pro upgrade / backups | Privacy page promises 30-day backups vs Free tier's 7 — fix (upgrade or copy change) before PUBLIC launch; a comped private beta accepts the risk knowingly. |
| Password policy | ✅ DONE 2026-07-04: min 8 + required lower/upper/digit enforced server-side (Management API) AND in the shared client validator; signup now has a confirm-password field on both surfaces. NEW passwords only — existing logins unaffected. Still parked: HIBP leaked-password check (Supabase Pro feature). |
| Email-verification cutover (`feat/email-verification`, unmerged) | Optional hygiene; G-5 will reveal whether confirm-email is already effectively on. |
| Stripe non-EUR / declined-card / reuse-after-deauthorize edges | EUR-only beta; smoke-test before the first non-EUR artist. |
| Privacy retention-row vs cleanup-cron wording check | Quick doc-accuracy check before PUBLIC web launch. |
| Maps API key referrer lock | Cost control, not functionality. |
| Counsel LO-2 (PSD2/MoR) + LO-5 (DPIA) | Run in parallel; counsel signed off the Custom-Connect process (G-4). |
| Apple / iOS | Deferred by decision 2026-06-23 (Android-first). **Apple Developer Program enrollment ACCEPTED 2026-07-16** — iOS track (ME-7 Apple half, TestFlight, App Store listing) is now unblocked; needs App Store Connect setup + first iOS EAS build. |
| ME-1 store assets, ME-13 dashboard mockup, Plausible goals registration | Store listing / polish / measurement — not blocking a working product. |

---

## Quick reference — who does what

| # | Task | Owner | Size |
| --- | --- | --- | --- |
| 1–2 | Stripe live mode + live webhook | Founder | ~2 h |
| 3 | G-5 real €1–5 deposit + refund | Founder (Claude verifies via API) | ~1 h |
| 4 | Comp beta artists to Plus | Founder | 5 min |
| 5 | Supabase deep-link allowlist | ✅ done (Claude, 2026-07-07) | — |
| 6 | Auth email rate limit | ✅ done (Claude, 2026-07-07) | — |
| 7 | Firebase/FCM creds → EAS | Founder | ~30 min |
| 8 | Min-version kill-switch | Claude | small PR |
| 9 | EAS build + on-device sweep | Claude builds, founder tests | ~1 h device time |
