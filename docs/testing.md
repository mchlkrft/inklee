# Testing strategy

How Inklee's `apps/web` is tested, how to run each layer, and how the E2E
suite stays safe against production. Last updated 2026-07-04 (branch
`claude/launch-audit-e2e`).

## Layers

| Layer | Tool | Scope | Where |
| --- | --- | --- | --- |
| Unit | Vitest | Pure logic: fee math, booking FSM, deposit classifier, schema/validation, email escaping, slug rules, entitlements | `apps/web/src/**/*.test.ts` |
| E2E | Playwright | Launch-critical flows end to end through a real browser + real local Supabase | `apps/web/tests/e2e/**` |

CI (`.github/workflows/ci.yml`) runs typecheck + lint + vitest for web and
mobile on every push/PR. It does NOT run E2E yet (needs an isolated Supabase;
see "CI" below).

## Commands

Run from `apps/web` (or the repo root variants):

```bash
pnpm --filter inklee typecheck      # next typegen + tsc --noEmit
pnpm --filter inklee lint           # eslint
pnpm --filter inklee test           # vitest (unit)
pnpm --filter inklee test:e2e       # playwright (all projects)
pnpm --filter inklee test:e2e:ui    # playwright interactive UI
pnpm --filter inklee test:e2e:headed
pnpm --filter inklee test:launch    # vitest + playwright (the full gate)
```

Root shortcuts: `pnpm test`, `pnpm test:e2e`, `pnpm test:launch`.

## Test-data strategy

**Chosen: a local Supabase stack (Docker) with a service-role seed layer.**

Rationale: the E2E suite must exercise real Supabase auth, RLS, and the actual
server actions — mocking Supabase would test a fiction. Local `.env.local`
points at the PRODUCTION project, so the suite runs against an isolated local
stack instead, seeded fresh per run and torn down after.

- `tests/e2e/helpers/seed.ts` — `createTestArtist` (auth admin API + a
  `profiles` row = a fully onboarded artist), `createTestBooking` (a pending
  `booking_requests` row + the raw portal token), `deleteTestArtist` (cascades).
- `tests/e2e/global-setup.ts` — seeds two artists per run (A drives most flows;
  B is the cross-tenant counterpart) and exports their credentials via env.
- `tests/e2e/global-teardown.ts` — deletes both seeded artists.
- Specs that MUTATE shared artist state (e.g. toggling books open/closed) seed
  their OWN artist in a `beforeAll` so they never pollute artist A that other
  specs read in parallel (`books-waitlist.spec.ts` is the model).

### Production safety guard (important)

`tests/e2e/helpers/env.ts` hard-refuses to run against production:

- It rejects the known production Supabase project ref and the production
  hostnames (`inklee.app`, `inkl.ee`).
- It is checked at BOTH Playwright config load (so no dev server even starts
  against an unsafe target) and in `global-setup` (with an actionable message).
- There is deliberately no override flag.

So the suite cannot create users, submit bookings, or mutate settings against
the live database, even by accident.

## Setting up the local Supabase for E2E

One-time, requires Docker Desktop running:

```bash
cd apps/web
npx supabase start          # boots the local stack (first run pulls images)
npx supabase db reset       # applies all migrations + supabase/seed.sql
npx supabase status         # prints API URL + anon + service_role keys
```

`supabase/seed.sql` (local-only, never runs on a hosted deploy) grants the
standard Supabase role privileges that a hosted project gets automatically but
a bare-from-migrations local stack lacks; without it the app's `serviceClient`
and the e2e seed helpers hit "permission denied for table ...".

Then create `apps/web/.env.e2e` from `.env.e2e.example` with the printed local
values (URL `http://127.0.0.1:54321`, the local anon + service_role keys,
`DATABASE_URL` on port 54322). Playwright loads `.env.e2e` (never `.env.local`).

Run the suite:

```bash
pnpm --filter inklee test:e2e
```

Playwright starts its own `next dev` on port 3000 with the e2e env injected. If
you already run a dev server on another port, point the suite at it and skip the
auto-start: `E2E_BASE_URL=http://localhost:3100 pnpm --filter inklee test:e2e`
(the app there must itself be running against the local Supabase, not prod).

The local stack's `config.toml` has `enable_confirmations = false`, so the
signup spec reaches onboarding directly; against a project with email
confirmation ON, signup stops at the "check your email" state.

## How external services are handled

- **Stripe:** no key is set for E2E, so deposit requests take the MANUAL path
  (no PaymentIntent) — exactly what a beta artist without Stripe Connect sees.
  `deposit-manual.spec.ts` covers request -> awaiting deposit -> mark received
  -> accepted, plus the server-side sub-1 amount rejection. Card payments and
  webhook idempotency/replay are covered by unit tests over the shared cores
  and by the launch gate's one live G-5 run; they are NOT driven from E2E
  because that needs live Stripe. Never put live Stripe keys in the E2E env.
- **Email:** no `RESEND_API_KEY` in E2E, so `sendEmail` is skipped in dev and no
  real email is sent. In production the same missing key now THROWS (so the auth
  hook 500s and Supabase retries rather than silently dropping the email). To
  assert "an email would have been sent" at the unit level, mock the single
  `sendEmail` seam in `@/lib/email/send`.
- **Supabase:** local stack only (above). Never run the suite against a shared
  or production project.
- **Upstash rate limiter:** no creds in E2E, so the limiter uses its in-memory
  dev fallback (does not fail closed locally).

## What is covered (E2E)

- **auth-permissions** — logged-out redirects (dashboard, admin, request
  detail), non-admin blocked from `/admin`, artist A cannot open or (via the
  mobile API shape) approve artist B's request.
- **signup-onboarding** — full signup -> wizard -> live public page; reserved
  slug rejected by the live check with the submit button disabled.
- **public-request** — public page loads without auth and hides the artist's
  email; server-side required-field enforcement; a complete submission lands
  under the right artist (verified via the detail page); unknown slug 404s.
- **request-accept** — Accept -> "Accepted" + calendar visibility; Pass ->
  leaves the pending filter.
- **client-portal** — valid token cancel end to end; invalid token safe; expired
  (31-day) token safe; no data leak on either failure.
- **deposit-manual** — manual deposit lifecycle + server-side minimum floor.
- **books-waitlist** — closing books shows the waitlist; a client joins; it
  reaches the artist (on its own seeded artist, no shared-state pollution).
- **mobile-smoke** (Pixel 7) — public form, onboarding intro, requests
  list/detail/calendar render with no horizontal overflow.

## What is NOT covered yet (E2E)

- Live Stripe card payment + webhook delivery (needs live/test Stripe + a tunnel;
  covered by unit tests + the launch-gate G-5 run instead).
- Real email delivery / inbox assertions (Mailpit is available on the local
  stack at `:54324` if inbox assertions are wanted later).
- Password reset for an account that never finished onboarding (fixed in
  `/auth/callback`; add a spec when a mail sink is wired).
- Guest-spot / travel map, flash booking, goods, Instagram import (advanced
  surfaces, not launch-critical for the first 25 artists).
- Native mobile app (Expo) — has its own typecheck/lint in CI; no device E2E here.

## Debugging a failed Playwright test

- `pnpm --filter inklee test:e2e:ui` — step through with the time-travel UI.
- `pnpm --filter inklee test:e2e:headed` — watch it run in a real browser.
- On failure, Playwright writes `apps/web/test-results/<test>/error-context.md`
  containing an accessibility-tree snapshot of the page at the failure point —
  the fastest way to see the actual DOM state (this is how the audit found the
  "books closed" pollution and the pre-filled deposit date).
- `--project=chromium` or `--project=mobile` to run one viewport.
- Add `--trace on` and open the trace with `npx playwright show-trace`.
- A whole-suite failure with "browser executable doesn't exist" means the
  Chromium binary is missing: `npx playwright install chromium`.

## Notes on selectors

Prefer accessible roles/labels and form `name` attributes over CSS. The one
custom widget that needs a helper is the branded date picker
(`components/date-input.tsx`): it renders a button trigger + a day-grid popover
rather than a native input, so use `pickDate()` in `tests/e2e/helpers/public-form.ts`
to drive it. The artist deposit "Due by" field pre-fills a valid future date, so
it needs no interaction.

## CI

To add E2E to CI safely: stand up a local Supabase in the workflow (the
`supabase` CLI + Docker service, `supabase db reset`), set `.env.e2e` from the
CLI output, `npx playwright install --with-deps chromium`, then
`pnpm --filter inklee test:e2e`. Never expose production Supabase or live Stripe
secrets to CI — the suite's env guard would refuse them anyway.
