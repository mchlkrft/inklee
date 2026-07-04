# Inklee launch-readiness audit

**Date:** 2026-07-04
**Branch:** `claude/launch-audit-e2e`
**Baseline commit:** `ba50019` (master tip at audit start)
**Auditor:** Claude Code (six parallel read-only flow audits + targeted verification)

## Purpose and scope

Make Inklee reliable enough for the first ~25 external beta artists. This is a
stability, permissions, and regression-protection pass, not a feature or
redesign effort. Every finding was verified against the current code (Next.js
16 App Router in `apps/web`; shared logic in `packages/shared`; Stripe Connect
Custom; Supabase). Where a prior audit had flagged an item, this pass reports
the CURRENT state, not the historical one.

Flows audited (each by a dedicated pass over the code):

1. Artist account + onboarding (`(auth)/**`, `(artist)/onboarding/**`, `proxy.ts`)
2. Public booking page + client request + customer portal (`[slug]/**`, `request/[token]/**`)
3. Artist request management + calendar/booking (`(artist)/bookings/**`, `lib/server/bookings.ts`, `booking-fsm`)
4. Deposits + Stripe (`api/stripe/webhook`, `lib/server/bookings.ts`, `lib/stripe-connect.ts`, `platform-fee`)
5. Emails + cron (`lib/email/**`, `api/cron/**`, `api/auth/email-hook`)
6. Admin + permissions + the new support-ticket system (`admin/**`, `lib/admin-guard.ts`, `lib/server/support.ts`, migration 0057)

## Headline

No blocker or high-severity defects were found in the money path, auth, or
tenant isolation. The heavily-audited deposit/webhook cluster (MONEY-01..04,
migration 0054, the reopen path) is confirmed correctly hardened. The findings
were medium/low: a cross-artist slot-lock gap, suspended artists keeping live
public pages, a customer-cancel race, a deposit idempotency-key edge, and
several fail-loud / defense-in-depth improvements. **13 of the findings were
fixed on this branch; the rest are documented with a rationale or a live check.**

The one launch-relevant NON-code item verified live: **RLS is enabled on all 37
public tables** (including the new `support_tickets` / `support_ticket_messages`),
both support policies are present, and migration bookkeeping records through
0057 — so the AGENTS.md migration-repair footgun did not recur for the support
system.

## Findings by severity

Severity rubric: **blocker** = exploitable money loss / cross-tenant breach /
auth bypass; **high** = privileged-path or PII bug, or a money/idempotency gap
under retry/race; **medium** = correctness bug with a workaround or narrow
blast radius; **low** = hardening / defense-in-depth / coverage.

### Fixed on this branch

| id | sev | area | one-line | fix |
| --- | --- | --- | --- | --- |
| PUB-1 | medium | public booking | fixed-slot lock updated by slot id + status only, not artist — a submission to artist A could lock artist B's slot (ids are in public HTML) | added `.eq("artist_id", artistId)` to the lock + rollback (`[slug]/actions.ts`) |
| PUB-2 | medium | public pages | suspended/archived artists kept live public pages that still accepted bookings, waitlist, flash | `.eq("account_status","active")` on all 13 public profile-by-slug reads |
| REQ-1 | medium | customer portal | cancel wrote status gated only on the token, not status — a concurrent accept let the cancel free an approved booking's slot + email a false cancellation | status-gated conditional UPDATE + rowcount check; slot release artist-scoped (`request/[token]/actions.ts`) |
| REQ-2 | low | calendar | `editAppointmentCore` approved-only check was read-then-write | write gated on `status='approved'` with rowcount check (`lib/server/bookings.ts`) |
| PAY-2 | low | webhook | `payment_intent.succeeded` verified amount but not currency | added currency-equality check vs `deposit_currency` (`api/stripe/webhook/route.ts`) |
| PAY-3 | medium | deposit intent | `deposit-intent-${id}` key could replay a cancelled intent (lost MONEY-03 race) and wedge the deposit ~24h | per-attempt idempotency key (`lib/server/bookings.ts`) |
| PAY-5 | low | deposit UI | request-detail promised "client pays by card" + fee to a free-but-connected artist; server actually made a manual deposit | UI `canCollectInApp` now also requires the `deposits` entitlement |
| AUTH-1 | low | auth redirect | `/auth/callback` reflected `next` unsanitized (open-redirect via userinfo) | shared `safeNextPath` (new `lib/auth-redirect.ts`), applied to callback + confirm |
| AUTH-3 | low | auth flow | callback bounced profile-less users to onboarding even for a password reset, swallowing the reset | honor an explicit `next` before the onboarding bounce |
| AUTH-2 | low | onboarding | re-entering `/onboarding/claim-slug` wiped Instagram/location with blank inputs | upsert preserves existing values when the field is blank |
| ADM-1 | low | admin | no guard at the admin route-group layout (per-page guards only) | `requireAdmin()` in `admin/layout.tsx` as a safety net |
| SUP-2 | low | support | artist ticket reads relied solely on RLS | added explicit `.eq("artist_id", user.id)` to both reads (belt-and-suspenders) + verified RLS live |
| SUP-1 | low | support | ticket creation had no rate limit (each fires 2 emails) | 5-per-hour-per-artist cap in `createSupportTicket` |
| MAIL-1 | low | cron | reminder `reminder_sent` idempotency marker written after the send; a failed insert silently re-sends | `recordReminderSent` throws on insert failure into the per-item catch |
| MAIL-2 | low | email | `sendEmail` silently no-op'd on a missing key, defeating the auth-hook's fail-loud retry | throws in production when `RESEND_API_KEY` unset |
| MAIL-3 | low | email | no test covered body-variable HTML escaping | added `buildEmailHtml` escaping regression tests |
| DEV-1 | medium | dev tooling | a `"use server"` file re-exported `type InterestDecisionPayload`; `next build` erased it but `next dev` (Turbopack, the founder's dev command) emitted it as a value, 500-ing on EVERY Accept/Pass in dev | moved the type to the client-safe `booking-interests.ts`; server core re-exports for the mobile route, client component imports directly, the `"use server"` file no longer re-exports a type |
| PAY-1 | low | webhook | fee-sponsorship budget counter was a read-modify-write; two bookings for the same artist settling concurrently could lose one increment | migration `0058` adds `increment_fee_sponsored_used` (atomic `col = col + delta`, service_role-only); the webhook calls it via `.rpc()`. Proven by a concurrency test: 20 concurrent +7 total exactly 140 |
| PUB-3 | medium | flash | unique/limited flash capacity check was a non-atomic count-then-insert; two concurrent clients could both pass and overshoot capacity | migration `0059` adds `book_flash_item` (locks the flash item `FOR UPDATE`, re-checks the cap, inserts, all in one transaction; service_role-only); the public action calls it via `.rpc()`. Proven by a concurrency test: unique caps at 1/8, limited at 3/10, repeatable unbounded |

### Documented / not code-fixed (with rationale)

| id | sev | area | disposition |
| --- | --- | --- | --- |
| PUB-4 | low | waitlist | no dedupe on `(artist_id, email)`; a client can join twice. Informational; rate-limited to 3/IP/hr. |
| PAY-4 | low | webhook | a card payment that succeeds AFTER a manual "mark received" is swallowed with no orphan flag. Tight race; manual-mark for card deposits is already a hidden override. Add a `flagOrphanedPayment` branch for approved-without-audit-row. |
| PAY-6 | low | webhook | `payment_intent.payment_failed` audit insert is unguarded (audit noise only); no chargeback (`charge.dispute.*`) handling yet. Track before scaling past the beta. |
| ADM-2 | low | admin | self-target guard absent on non-lockout admin actions (plan/entitlement setters). Admin is already trusted; optionally block self-entitlement grants. |
| AUD-1 | low | admin | admin PII reads (account detail, support inbox) are not audit-logged, only mutations are. Consider logging sensitive-record views for the beta. |

## Verified OK (did not need fixing)

- **Deposit money path (Slice 80 + MONEY-01..04):** the webhook `deposit_pending -> approved`
  flip is an atomic conditional UPDATE (`.eq("status","deposit_pending").is("deposit_paid_at",null).select`);
  replay/duplicate/out-of-order deliveries change 0 rows and skip all side effects.
  Refund idempotency is DB-enforced (migration 0054 partial unique index; both writers treat 23505 as success).
  Server-side deposit floor (`amount < 1` reject) is present (P2-5). Reuse path's
  `paymentIntents.update` is non-swallowed (MONEY-02). Manual deposits refuse a Stripe refund.
- **Connect routing:** charges route through the artist only when the Connect account is
  active + charges-enabled; un-connected artists get a manual deposit, never a charge on Inklee's platform account.
- **Reopen (2026-06-29):** `reopenBookingCore` refuses when `deposit_paid_at` is set and cancels lingering unpaid intents.
- **Every other status write** on `booking_requests` is status-gated + rowcount-checked (approve/reject/deposit/cancel/reopen, web + mobile).
- **BUG-3 (waitlist convert):** now a shared `convertWaitlistEntryCore` with an already-converted guard + conditional claim.
- **Tenant isolation:** request detail + mutations are `.eq("artist_id", user.id)`; mobile routes use the RLS-scoped bearer client, never service-role, and assert ownership on `[id]` routes.
- **Email escaping:** all user free-text reaching email HTML passes through `escapeHtml`/`renderBody`; hrefs through `sanitizeHrefForEmail`.
- **Cron auth:** all four crons fail closed on a missing `CRON_SECRET`; retention-purge never touches booking-linked audit rows; reconfirmation rolls the token back on email failure.
- **Support system:** all writes are service-role after an ownership/admin check; RLS live-verified; input validated; status transitions sane; no 404-vs-403 existence oracle.
- **Auth:** password policy (min 8 + lower/upper/digit + confirm) applied on every password-set path (web + mobile); slug uniqueness + reserved-slug handling correct; `/auth/confirm` allowlists `next`; a profile can never exist without a slug.
- **Image pipeline:** `guardedSharp` sets `limitInputPixels` (the prior decompression-bomb hardening item is closed); server re-encodes uploads to WebP; type/size/count caps enforced server-side.
- **proxy.ts:** artist subdomains rewrite to public-only space; auth cookies don't cross the registrable-domain boundary; reserved slugs block `admin.` etc.

## Tests added

A durable Playwright E2E suite covering the launch-critical flows (details in
`docs/testing.md`). New specs on this branch:

- `auth-permissions.spec.ts` — logged-out redirects, artist-cannot-reach-admin, artist A cannot open/approve artist B's request (incl. the mobile API shape).
- `signup-onboarding.spec.ts` — full signup -> wizard -> live public page; reserved-slug rejection.
- `public-request.spec.ts` — public page loads without auth + hides PII, server-side required-field enforcement, complete submission surfaces to the artist, unknown-slug 404.
- `request-accept.spec.ts` — Accept -> calendar visibility; Pass -> leaves pending.
- `client-portal.spec.ts` — valid token cancel end-to-end, invalid token safe, expired (31-day) token safe.
- `deposit-manual.spec.ts` — request -> awaiting deposit -> mark received -> accepted (manual path); sub-1 amount rejected server-side.
- `mobile-smoke.spec.ts` — Pixel 7 viewport: public form, onboarding intro, requests list/detail/calendar, no horizontal overflow.

Plus unit regression tests: `buildEmailHtml` HTML-escaping (`lib/email/__tests__/booking-templates.test.ts`).

Test-data strategy: a Supabase-service-role seed layer (`tests/e2e/helpers/seed.ts`)
creates two isolated artists per run; a hard safety guard
(`tests/e2e/helpers/env.ts`) refuses the production project ref and production
hostnames at config-load AND global-setup time, so the suite cannot run against
production. See `docs/testing.md`.

## Commands run

- `pnpm --filter inklee typecheck` — pass (0 errors; pre-existing warnings only)
- `pnpm --filter inklee lint` — pass (0 errors; 5 pre-existing warnings)
- `pnpm --filter inklee test` (vitest) — 566 pass (was 564; +2 email-escaping tests)
- `pnpm --filter inklee build` (`next build`) — pass (162 static pages; expected test-mode Stripe warnings)
- `npx playwright test` against a local Supabase stack — **23 tests green**
  (20 Chromium + 3 Pixel 7 mobile), ~35s. The run doubled as verification of
  the audit fixes: public page hides the artist email, cross-tenant request
  access renders the not-found page, books-closed shows the waitlist, the
  manual deposit lifecycle completes, and expired/invalid portal tokens fail
  safely.
- E2E safety guard verified: refuses a missing env AND a production Supabase ref
  before any dev server starts.
- Live read-only DB check (service-role, SELECT-only): RLS enabled on all 37
  public tables; support policies present; bookkeeping through 0057.
- Local Supabase brought up via `supabase start` + `supabase db reset` (all 56
  migrations applied cleanly + `supabase/seed.sql` grants).

## Commands that could not run (and why)

- **Live Stripe card payment + webhook delivery:** needs live/test Stripe keys
  and a webhook tunnel. Covered by unit tests over the shared money cores and by
  the launch gate's one live G-5 run; not driven from E2E by design (no live
  keys in the test env).
- **CI E2E:** the GitHub Actions job still runs typecheck/lint/vitest only.
  Adding E2E needs a Supabase service in the workflow (see `docs/testing.md`
  "CI"); the env guard keeps it from ever touching production.

## Environment assumptions

- E2E runs against a local Supabase stack (`apps/web/supabase/config.toml`;
  `supabase start`) or a dedicated dev project — NEVER production.
- Email confirmations OFF in the e2e Supabase (the local `config.toml` default:
  `enable_confirmations = false`) so the signup spec reaches onboarding; with
  confirmations ON, signup stops at the "check your email" state.
- No Stripe key in e2e -> deposits take the manual path (the realistic
  experience for a beta artist without Connect). Card + webhook idempotency are
  covered by unit tests and the live G-5 launch-gate run.
- No Resend key in e2e -> `sendEmail` is skipped in dev (and now throws in
  production, MAIL-2). No real emails are sent from tests.

## Remaining risks (for the launch gate, not code)

These are unchanged by this audit and remain on `docs/launch-gate.md`:

- Stripe LIVE cutover + live webhook + the one real G-5 deposit/refund run (money path has never run outside sandbox).
- Comp beta artists to Plus (deposits are entitlement-gated).
- Supabase mobile deep-link allowlist + auth email rate limit (currently 2/hr).
- The medium/low items in "Documented / not code-fixed" above, before scaling past ~25 artists (flash capacity race, dispute handling, sponsorship counter atomicity).

## New migrations on this branch

- `0058_fee_sponsorship_atomic.sql` — the `increment_fee_sponsored_used` RPC (PAY-1).
- `0059_flash_capacity_atomic.sql` — the `book_flash_item` RPC (PUB-3).

Both apply cleanly to a fresh DB (verified via `supabase db reset` locally + in
CI). Before pushing them to PRODUCTION, follow the AGENTS.md rule: prod
bookkeeping records only through 0051, so run
`supabase migration repair --status applied 0052 0053 0054 0055 0056 0057`
first, then `supabase db push`, and re-run the `pg_policies` RLS sanity check.
Neither function touches RLS or adds a tenant table, so no new anon-SELECT risk.

## CI

The `.github/workflows/ci.yml` `e2e` job now stands up a local Supabase
(`supabase start` + `db reset`), writes `.env.e2e` from `supabase status -o env`,
installs Chromium, and runs `pnpm test:e2e` against `next dev`. It runs in dev
(not a production build) on purpose: the rate limiter fails closed in production
when Upstash is unset, which would reject every public-form submission; dev uses
the in-memory allow-fallback. No production or live-Stripe secrets are exposed;
the env guard would refuse them anyway.

## Recommended next actions

1. Address the remaining low items when convenient: waitlist `(artist_id,email)`
   dedupe (PUB-4), the card-paid-after-manual orphan flag (PAY-4), and the
   unguarded `payment_intent.payment_failed` audit insert (PAY-6).
2. Add `charge.dispute.*` (chargeback) handling before the beta scales.
3. Optionally add an admin self-entitlement-grant guard (ADM-2) and sensitive-
   read audit logging (AUD-1).
