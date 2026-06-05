# Inklee dev environment — best-practice setup (web + mobile)

**For:** a solo, AI-assisted founder shipping a money-handling web app + a first mobile app. Opinionated, not over-engineered. **Date:** 2026-06-05.

## The one idea everything hangs on: three environments

Today there is effectively **one** environment — local dev points at the **production** Supabase (that's why G-2 testing put test bookings in the live DB). Before mobile development, split into three so you never test against real artist data again:

| Env | Supabase | Stripe | Vercel | Who/what uses it |
|---|---|---|---|---|
| **Production** | `inklee-prod` (existing) | LIVE keys | Production deploy (`main`) | Real artists; the live apps |
| **Preview / staging** | `inklee-dev` (NEW) | TEST keys | Preview deploys (every branch/PR) | You, testing before prod; mobile dev builds |
| **Local** | `inklee-dev` (same as preview) OR local Supabase | TEST keys | `pnpm dev` on your machine | Day-to-day coding |

The highest-value change is creating **one new Supabase "dev" project**. That alone removes the "I'm testing on prod" risk. Local + preview can share it; a fully local Supabase (Docker) is optional and can wait.

---

## 1. Vercel (one project, three env scopes)

- **One project**, Root Directory = `apps/web` (the M0 change). The mobile app is NOT a Vercel project.
- **Deploys (automatic):** production branch (`main`, or your chosen branch) → **Production**; every other branch/PR → a **Preview** URL. You stop running `vercel --prod` by hand — merges deploy themselves.
- **Environment variables — scope each to the right env** (Vercel → Settings → Environment Variables; each var can target Production / Preview / Development):
  - **Production:** prod Supabase URL+keys, `sk_live_…`/`pk_live_…`, prod `STRIPE_WEBHOOK_SECRET`, prod Resend, Upstash, `NEXT_PUBLIC_APP_URL=https://inklee.app`.
  - **Preview:** **dev** Supabase URL+keys, `sk_test_…`/`pk_test_…`, the preview/test webhook secret, `NEXT_PUBLIC_APP_URL` = the preview/staging URL.
- **Branch protection mindset:** treat `main` as "what's live." Do work on branches → preview-test → merge.

## 2. Supabase (two projects: prod + dev)

- Create a second project **`inklee-dev`** (same region, EU/Frankfurt). Free tier is fine for dev (it may pause on inactivity; just un-pause).
- **Schema parity:** apply the SAME migrations to both. Migrations live in the repo (`apps/web/supabase/migrations`). For a fresh dev project, the cleanest is `supabase link` → `supabase db push` against dev (a blank DB applies the whole history cleanly — none of the prod history-drift we hit). Going forward, apply each new migration to **dev first**, then prod.
- **Configure both projects identically:** RLS (it travels with the migrations), Auth providers (email, Google, and **Apple** for the mobile app), Storage buckets (`bookings`, `logos` + their policies), the auth email hook, and the Auth → URL allow-list (add the mobile deep-link redirect + preview URLs).
- **Seed dev** with fake artists/bookings so you can develop without touching real data (`pnpm --filter inklee db:seed` against the dev env).
- **Secrets:** the dev project has its own anon + service-role keys. Local `.env.local` (in `apps/web`) points at **dev**. Prod keys only live in Vercel Production.

## 3. Stripe (one account, two modes)

- One Stripe account; **Test mode** for dev/preview, **Live mode** for prod. Keys + Connect settings + webhook endpoints are **per mode** (configure Connect Custom in BOTH).
- **Webhooks:** a **live** endpoint → `https://inklee.app/api/stripe/webhook`; a **test** endpoint → your preview/staging URL (or use `stripe listen --forward-to …` for purely local work — note the local CLI tunnel is flaky in the background, as we saw in G-2). Each endpoint has its own signing secret → set the matching `STRIPE_WEBHOOK_SECRET` per env.
- Events to enable on both: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `account.application.deauthorized`.

## 4. EAS / Expo (mobile build + distribution — the non-Vercel half)

- One Expo project; `eas.json` with **development / preview / production** profiles.
- Each profile carries the API base URL + Supabase (dev for development/preview, prod for production) via EAS environment variables + `app.config.ts` `extra`. **Client-safe values only** (Supabase URL + anon key, Stripe **publishable** key, API URL). Never the service-role/Stripe-secret on the device.
- EAS holds the APNs + FCM push credentials (managed) — never in the repo. EAS **cloud build makes the iOS binary without a Mac**.
- Distribution: TestFlight (iOS) + Play Internal Testing (Android) for the beta; store submit later.

## 5. Other services (keep simple)

- **Resend (email):** one account. In dev, avoid emailing real people — use a `+test` inbox you control (as in G-2) or a restricted key; verify SPF/DKIM/DMARC on the prod sending domain before launch.
- **Sentry:** tag events with the environment (`dev`/`preview`/`production`) so prod noise is separable; add `@sentry/react-native` for the app. One project is fine.
- **Upstash (rate limiting):** prod only is fine — the code no-ops without creds locally. Add a dev instance only if you need to test rate limits.

## 6. The everyday workflow (web + mobile)

**Web:** branch → code locally against **dev** Supabase + Stripe **test** → push → Vercel **preview deploy** auto-builds against the preview env → click through the preview → merge to `main` → **production** deploy. Migrations: apply to **dev** first, then prod.

**Mobile:** `eas build --profile development` (or Expo Go) → test against the **dev** API on a real phone → `eas build --profile preview` → TestFlight/Play internal → fix via EAS Update (OTA, no store review) → `production` submit. The app's "which backend" is just the API URL in the EAS profile.

## 7. Do-now vs later

**Do now (before E1):**
1. Finish **M0** (Vercel Root Directory = `apps/web`, validate on a preview deploy, merge).
2. Create the **`inklee-dev` Supabase project**, push migrations, seed it, point local `.env.local` at it. ← biggest single win.
3. Set Vercel **Preview** env vars to dev Supabase + Stripe test.
4. Start the **Apple Developer / D-U-N-S / Google Play / Expo** account enrollments (lead time).

**Later (when needed):** local Supabase via Docker (full isolation), a dedicated staging branch/domain, separate Sentry projects, dev Upstash.

---

**What I can do for you:** wire `eas.json` + `app.config.ts` env profiles, the Supabase seed for dev, and keep migrations applied to both projects. **What only you can do:** create the Supabase dev project, set Vercel env vars + Root Directory, and the store/Stripe dashboard config (account-level).
