# Slices 11–23

Continues [SLICES.md](SLICES.md) (slices 0–10). This file is the authoritative roadmap from slice 11 onward.

**Migrations applied to production:** 0000–0011 (all current).

---

## Slice 11 — Custom field builder + observability foundations

**Status:** ✅ complete (`0d10d57`)

**Goal:** Artists can define custom booking questions; app has basic observability.

**Scope:**

- `custom_fields` table + migration; active fields wired into public booking form
- `/settings/fields` with create/edit/list flows
- Custom fields render on `/[slug]` and answers stored in `form_data.custom_answers`
- Sentry client/server wiring, vitest + playwright scaffolding, cron hardening

---

## Slice 12 — Custom-field hardening and production safety

**Status:** ✅ complete (`e39bc9d`, `dc449b1`)

**Goal:** Custom field system is safe for production use.

**Scope:**

- Tightened validation and production-safety checks
- Internal field key hidden from builder UI
- Edge cases from slice 11 rollout closed

---

## Slice 13 — Launch hardening and production readiness

**Status:** ✅ complete (`c80fbc2`)

**Goal:** Critical flows covered by E2E tests; app has launch-grade metadata and production scaffolding.

**Scope:**

- Playwright E2E for three critical paths: submit→approve→emails, submit→reject→email, artist cancel→customer notified
- Metadata: apple-touch-icon, open graph image, favicon
- CI-friendly local web-server config for E2E

---

## Slice 14 — Booking form builder UX and standard-field toggles

**Status:** ✅ complete (`c33c380`, `dc449b1`)

**Goal:** Artists can configure standard and custom fields from one coherent settings area.

**Scope:**

- Standard-field toggles stored in `profiles.settings.form_settings` JSONB
- Public form respects visibility/required settings
- Builder UX cohesive across custom + standard fields

---

## Slice 15 — Public artist profile essentials

**Status:** ✅ complete

**Goal:** Public booking page surfaces the artist's identity clearly.

**Scope:**

- `instagram_handle` shown as `@handle` link on `/[slug]`
- `location`, `bio` rendered with refined layout
- `fixed_slots` mode + zero open slots → "books are currently closed" via `BooksClosedBlock`
- Graceful omission of empty fields

---

## Slice 16 — Deposit system foundation

**Status:** ✅ complete (`8048683`, migration 0006)

**Goal:** Bookings carry deposit metadata; artist and customer UIs understand deposit-pending state.

**Scope:**

- `deposit_amount`, `deposit_due_at`, `deposit_note` columns on `booking_requests`
- Artist dashboard: set deposit amount/due date when marking deposit pending
- Customer portal: deposit details visible in booking summary

---

## Slice 17 — Stripe deposit payment integration

**Status:** ✅ complete (`3c083da`, migration 0007; Stripe test-mode activated 2026-04-21)

**Goal:** Customers can pay a booking deposit via Stripe; booking updates automatically after payment.

**Scope:**

- Stripe client/server config with graceful null fallback
- Deposit payment UI in customer portal (`/request/[token]`)
- `/api/stripe/webhook` — reconciles `payment_intent.succeeded`, updates booking, writes audit log
- All three Stripe env vars set in Vercel (test-mode keys)

**Smoke test:** Mark a booking `deposit_pending` → follow magic link → pay with `4242 4242 4242 4242` → confirm webhook updates status and audit log.

---

## Slice 18 — Reminder and reconfirmation automation

**Status:** ✅ complete (`6e9cb4f`; cron at `0 9 * * *` in `vercel.json`)

**Goal:** System proactively reminds customers and artists about overdue deposits, upcoming appointments, and bookings needing reconfirmation.

**Scope:**

- `/api/cron/reminders` route (cron-driven)
- Deposit-overdue reminders, appointment reminders, reconfirmation emails with refreshed magic links
- Idempotent: audit log prevents duplicate sends

---

## Slice 19 — Waitlist core

**Status:** ✅ complete (migration 0010 applied)

**Goal:** When books are closed, customers can join a waitlist; artists can review and convert entries.

**Scope:**

- `waitlist_entries` table: `id`, `artist_id`, `customer_email`, `customer_handle`, `note`, `status` (waiting/contacted/converted/dismissed), `created_at`
- RLS: artist owns entries; public inserts
- Waitlist form on `/[slug]` when books are closed
- Customer confirmation email on submission
- `/dashboard/waitlist`: list view with status badges
- Artist actions: mark contacted, convert to booking request, dismiss
- Convert action emails customer with magic link

---

## Slice 20 — Books-open / wave booking mode

**Status:** ✅ complete (JSONB on `profiles.settings`, no migration needed)

**Goal:** Artists can explicitly open/close their books, cap submissions per window, and show current state publicly.

**Scope:**

- `profiles.settings.books_settings` JSONB: `books_open`, `booking_cap`, `booking_window_ends_at`, `books_closed_message`
- `/settings/books`: toggle open/close, set optional cap, window end date, closed message
- Public `/[slug]`: open → form; cap reached → "full" + waitlist; closed → message + waitlist
- Cap enforcement server-side on each submission
- `booking_window_ends_at` in the past treated as closed at request time

---

## Slice 21 — Guest spot / travel mode

**Status:** ✅ complete (migration 0011 applied)

**Goal:** Artists can create city/date-specific booking contexts for guest spots; customers see the trip context.

**Scope:**

- `travel_legs` table: `id`, `artist_id`, `city`, `country`, `studio_name`, `starts_on`, `ends_on`, `description`, `is_active`
- `booking_requests.travel_leg_id` FK (nullable)
- `/settings/travel`: create/edit/list travel legs
- Active travel leg shown on public `/[slug]` below artist identity block
- Server action resolves active leg on submission and stores FK
- Dashboard filter by travel leg

---

## Slice 22 — Client history lite

**Status:** ✅ complete (`df6d0de`, migration 0008)

**Goal:** Artists can browse repeat customers, inspect booking history, and save notes.

**Scope:**

- `/dashboard/clients`: list grouped by customer email
- Per-client detail page: past bookings, notes
- `client_notes` schema + migration
- Dashboard nav link

---

## Slice 23 — UI/UX redesign

**Status:** ✅ complete — deployed 2026-04-21

**Goal:** The full app (public-facing and artist dashboard) gets a cohesive design pass so the product feels intentional and polished before v0.1.

**Scope:** Full nav restructure (Dashboard hub, Bookings sub-nav, Travel, Settings), new NavBar + BookingsNav client components, mobile bottom tab bar, route redirects, dark mode design system pass.

**Out of scope:** New features, schema changes, business logic. Design and layout only.

**Dependencies:** Slices 15–22 complete (all interactions and states must exist before redesigning them).

---

## MVP phase boundary

Slices 11–23 constitute the MVP path.

**MVP is complete when Slice 23 is done and the full booking lifecycle has been validated end-to-end on the live app.**

**v0.1 begins after MVP.**

v0.1 is a separate planning phase. Do not scope v0.1 features until real artist feedback exists.

---

## Pre-v0.1 extension package: Slices 24–31

These slices were added after Slice 23 was completed. They represent work that belongs before v0.1 because it either closes gaps in the artist experience, establishes the public face of the product, or hardens the auth surface. v0.1 does not begin until Slice 31 is complete.

**Ordering rationale:** Account fundamentals (24) come first because they underpin onboarding (25), Google login (27), and the security section (31). The landing page (26) is independent and ships between onboarding and auth enhancements as a natural public-facing milestone. Communication settings (28) land after the core UX is restructured. UX polish (29) is placed before analytics to ensure the product feels intentional before measurement starts. Analytics (30) sits late because it requires accumulated data. 2FA (31) is last — security hardening that adds no product value until the base auth experience is stable.

---

### Slice 24 — Account & profile expansion

**Status:** ✅ complete — migration 0012 applied

**Goal:** Artists have a complete in-app account management experience, including their full identity model and the ability to change their password without leaving the app.

**Scope:**

- New `first_name`, `last_name` columns on `profiles` table — new migration
- Settings > Account page restructured into two sections:
  - **General**: first name, last name, artist name (maps to `display_name`), email address (display only — change triggers email verification flow)
  - **Security**: change password form (current password + new password + confirm); "forgot password" link for users who cannot remember their current password (reuses existing `/forgot-password` route)
- Email change: request-only in this slice — submit sends a re-verification email via Supabase Auth; full account-linked email swap handled by Supabase
- First/last name surfaced in onboarding wizard (Slice 25), email templates, and any future communication that needs a real name

**Out of scope:** Google login (Slice 27), 2FA (Slice 31), billing.

**Dependencies:** Slice 23 (Settings > Account page exists as a stub).

**Acceptance criteria:**

- Artist can set and update first name, last name, and artist name from Settings > Account
- Change password form validates current password and updates the account
- "Forgot password" link in the Security section triggers the existing reset email
- Email change submission confirms the request and explains what happens next
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 25 — First-login onboarding

**Status:** ✅ complete — 4-step wizard at /onboarding/\*

**Goal:** New artists are guided through a focused setup wizard on first login instead of landing on an empty dashboard, so they understand what to configure before their first client visits their public page.

**Scope:**

- First-login detection: check if `onboarding_completed` flag is absent from `profiles.settings`; if absent, redirect to `/onboarding`
- Multistep wizard at `/onboarding` (replaces the current single-step slug claim):
  - **Step 1 — Identity**: slug claim (existing logic), first name, last name, artist name
  - **Step 2 — Profile**: bio (280 char), location, Instagram handle
  - **Step 3 — Booking setup**: choose booking mode (preferred date vs fixed slots); brief explanation of each
  - **Step 4 — Go live**: preview link to public page, copy booking URL, mark onboarding complete
- Progress indicator across steps (e.g. 1 / 4)
- Each step is skippable except slug (slug is required to proceed)
- On completion: set `profiles.settings.onboarding_completed = true`, redirect to `/dashboard`
- Dashboard widget: if `onboarding_completed` is absent, show a soft prompt ("finish setting up your profile →") above the main widgets

**Out of scope:** Logo upload in wizard (artist can do this in Settings > Profile after), payment setup.

**Dependencies:** Slice 24 (first/last name fields exist), Slice 23 (dashboard widget hub).

**Acceptance criteria:**

- New signup redirects to `/onboarding` instead of directly to `/dashboard`
- Completing all steps sets the completion flag and redirects to dashboard
- Existing artists who already have a slug are not redirected to onboarding
- Skipping a non-required step still allows progression
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 26 — Landing page

**Status:** ✅ complete — / redirects logged-in users to /dashboard

**Goal:** Replace the current minimal landing page stub with a product-quality marketing page that communicates the value of Inklee to tattoo artists and converts visitors to signups.

**Scope:**

- Hero section: headline, subheadline, primary CTA ("get started free" → `/signup`), secondary CTA ("see how it works" → anchor or help page)
- Feature highlights section: booking form, request management, deposit flow, waitlist, travel mode — each with a brief description and icon
- Social proof placeholder: one or two artist quote slots (can be filled with real quotes post-launch)
- Footer: links to Terms, Privacy, Impressum, Help, About; "powered by inklee" wordmark
- Fully responsive (mobile-first), dark mode default, matches design system
- SEO: meta title, description, and Open Graph already wired — ensure they reflect landing page content accurately
- Remove or replace any placeholder content currently on `/`

**Out of scope:** Animated product demo, pricing page, blog, multi-language.

**Dependencies:** None.

**Acceptance criteria:**

- `/` renders the new landing page for unauthenticated visitors
- Authenticated artists visiting `/` are redirected to `/dashboard`
- Page passes Lighthouse accessibility audit (no critical failures)
- All links resolve to valid routes
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 27 — Google login

**Status:** ✅ complete — button on login/signup; requires Supabase Google OAuth setup in dashboard

**Goal:** Artists can sign up and log in with Google, removing the email/password friction for the majority of users who are already signed in to Google.

**Scope:**

- Enable Google OAuth provider in Supabase Auth dashboard
- "Continue with Google" button on `/login` and `/signup` pages, visually consistent with existing form
- Post-OAuth callback handling: new users land on onboarding wizard (Slice 25); returning users land on `/dashboard`
- Account linking: if a Google sign-in email matches an existing email/password account, Supabase handles merge — document the expected behaviour and test it
- Error handling: provider unavailable, popup blocked, user cancels OAuth flow
- No change to existing email/password flow

**Out of scope:** Apple login, GitHub login, multi-provider account management UI.

**Dependencies:** Slice 24 (account structure stable), Slice 25 (onboarding handles new Google users correctly).

**Acceptance criteria:**

- New artist can complete signup entirely via Google with no form to fill
- Returning artist can log in via Google and lands on dashboard
- If email already exists as email/password account, login succeeds with the merged account
- Cancel/error states show a clear message and return the user to the login page
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 28 — Reminder & communication settings

**Status:** ✅ complete — /settings/reminders, manual sends on booking detail, cron reads per-artist settings

**Goal:** Artists can configure when automated reminders fire, see the full communication history per booking, and manually trigger a reminder or reconfirmation request from the booking detail without waiting for the cron window.

**Scope:**

- **Reminder settings** (new `/settings/reminders` or extended `/settings/emails`):
  - Deposit-overdue reminder: configurable threshold in days (default: 2 days before due date)
  - Appointment reminder: configurable timing (default: 48h before appointment)
  - Reconfirmation request: configurable timing (default: 7 days before appointment)
  - Enable/disable per reminder type
  - Stored in `profiles.settings.reminder_settings` JSONB — no migration needed
- **Booking detail — communication history**:
  - Reminder log section in the booking sidebar: shows each sent reminder from the `audit_log` (type, timestamp)
- **Manual send actions** on booking detail:
  - "Send deposit reminder" (if status = `deposit_pending` and due date is set)
  - "Send reconfirmation" (if status = `approved` and preferred date is in the future)
  - Each manual send writes an audit log entry and uses the existing email functions
- Cron route updated to read `reminder_settings` per artist before sending

**Out of scope:** Custom reminder message bodies (that is template editing, already in `/settings/emails`), SMS.

**Dependencies:** Slice 18 (reminder cron and audit log), Slice 23 (booking detail at `/bookings/requests/[id]`).

**Acceptance criteria:**

- Artist can configure reminder timing per type and save it
- Cron respects per-artist timing settings
- Booking detail shows a communication history log sourced from audit_log
- Manual reminder triggers fire the correct email and appear in the log
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 29 — UX polish

**Status:** ✅ complete

**Goal:** The app has a consistent visual language through a monochrome icon system and communicates loading state reliably across all data-heavy surfaces.

**Scope:**

- **Monochrome icon system**: a small, consistent set of SVG icons used throughout the app — nav (already added in Slice 23 bottom tabs), action buttons (approve, reject, copy, preview, delete, edit), status indicators, and empty states. Icons should be single-weight, `currentColor` only.
- **Loading skeleton screens**: replace blank flash on initial load for `/bookings/requests`, `/bookings/clients`, `/bookings/calendar`, and `/dashboard` widget grid using the `loading.tsx` convention.
- **Consistent loading spinner**: a single `<Spinner />` component used uniformly for all in-progress server action states (currently each form has its own ad-hoc "saving…" text).
- **Empty state quality**: empty state messages on bookings list, waitlist, clients, and calendar should include a brief prompt toward the next action (e.g. "no requests yet — share your booking link to get started" with a copy-link button).

**Out of scope:** Page transition animations, illustration system, dark/light mode toggle in the artist app.

**Dependencies:** Slice 23 (IA and nav structure stable — icons need to match the final navigation).

**Acceptance criteria:**

- No blank loading flash on any of the four key data pages
- All server action buttons use the shared `<Spinner />` component during pending state
- Icon usage is consistent: same icon for the same action across all pages
- Empty states on all list views include a clear next-action prompt
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 30 — Simple analytics

**Status:** ✅ complete — /analytics, 5 metrics, CSS bar chart, date range selector, dashboard entry point

**Goal:** Artists can see basic booking performance at a glance — volume, conversion, and client return rate — without leaving the app.

**Scope:**

- New `/analytics` route under the artist group, linked from the top-level nav or as a dashboard entry point
- Data derived entirely from `booking_requests` — no new schema, no external analytics API calls
- **Metrics:**
  - Booking volume: submissions per month, rolling 3 months
  - Conversion rate: approved / submitted (percentage), per period
  - Rejection rate: rejected / submitted
  - Client return rate: customers with more than one booking vs total unique customers
  - Deposit collection rate: deposit paid / deposit requested (where applicable)
- Date range selector: last 30 days / last 90 days / all time
- Simple bar or line chart — prefer a lightweight built-in approach (CSS bar widths or minimal SVG) unless the data shape genuinely requires a library
- Analytics page renders gracefully with zero bookings

**Out of scope:** Funnel visualisation, cohort analysis, geographic breakdowns, Plausible event integration, custom date ranges.

**Dependencies:** Accumulated production data (meaningful only after real bookings exist), Slice 23 (nav structure).

**Acceptance criteria:**

- All five metrics calculate correctly against real data
- Date range selector updates all metrics simultaneously
- Chart renders cleanly on mobile and desktop
- Zero-data state is handled without errors or empty UI
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 31 — Two-factor authentication

**Status:** ✅ complete — TOTP via Supabase MFA, /auth/mfa challenge page, recovery codes, proxy AAL2 gate

**Goal:** Artists who want stronger account security can enable TOTP-based 2FA; the feature is opt-in and does not disrupt artists who skip it.

**Scope:**

- TOTP 2FA via Supabase Auth MFA (enable in Supabase project settings)
- Settings > Account > Security section (extended from Slice 24):
  - "Enable two-factor authentication" toggle
  - Setup flow: QR code for authenticator app → verify one TOTP code to confirm → show one-time recovery codes (download / copy)
  - Disable flow: requires current TOTP code to turn off
- Login page: if 2FA is enabled for the account, show a second step after email/password to enter the TOTP code
- Recovery code flow: if artist loses their authenticator, a recovery code bypasses TOTP for one session and prompts re-setup
- Google login users: 2FA applies to email/password sessions only; Google OAuth sessions rely on Google's own security

**Out of scope:** SMS-based 2FA, hardware security keys, organisation-level 2FA enforcement.

**Dependencies:** Slice 24 (Settings > Account > Security section exists), Slice 27 (Google login shipped — avoids 2FA edge cases during OAuth development).

**Acceptance criteria:**

- Artist can set up and verify TOTP from Settings > Account
- Login flow correctly prompts for TOTP after password when 2FA is active
- Recovery codes are shown once at setup and can be used to regain access
- Disabling 2FA requires a valid TOTP code
- `pnpm typecheck` and `pnpm lint` pass

---

## Pre-v0.1 extension boundary

Slices 24–31 complete the pre-v0.1 work.

**v0.1 begins after Slice 31 is complete and the product has been validated end-to-end with at least one real artist user.**

---

## Hardening package: Slices 32–41

These slices form a structured hardening track that runs alongside or after v0.1 validation. They are sequenced by risk reduction priority and implementation dependency — not grouped by theme. Early slices address the most foundational protections; deposit and backup work comes later when those surfaces are live and tested.

**Ordering rationale:** Upload abuse protection is already partially shipped and closes the most immediate surface risk. Server-side authorization comes next because it is the prerequisite for meaningful rate limiting and state machine enforcement. Rate limiting follows once actions are correctly locked. Booking state machine hardening requires confident auth and a stable action layer. Webhook and origin integrity depend on the full request pipeline being understood. Audit log expansion is most useful once the state machine is clean. Email safeguards depend on the reminder system being stable. Session reauthentication hardening requires 2FA to be shipped (Slice 31). Deposit hardening is meaningful only once real payments exist. Backup and recovery is placed last as it is the lowest operational urgency for a pre-scale product.

---

### Slice 32 — Upload hardening and payload limits

**Status:** ✅ complete (image optimization and file validation shipped 2026-04-23; payload limit configuration pending)

**Goal:** Customer image uploads are validated, optimised, and stored safely; the server enforces hard limits on request size and rejects malformed payloads before they reach application logic.

**Scope:**

- File count cap (5 per booking), mime-type allowlist (jpeg/png/webp), per-file size limit (10 MB), all enforced server-side in addition to client-side — **done**
- Images processed through sharp before storage: resize to ≤1600px longest edge, convert to WebP at 85% quality — **done**
- Storage path structured as `{artistId}/{bookingId}/{uuid}.webp` — **done**
- Orphan cleanup: uploaded files removed from storage if processing, upload, or booking insert fails — **done**
- `booking_images` table extended with `width`, `height`, `file_size`, `mime_type`, `original_filename` — **done**
- Next.js `api.bodyParser.sizeLimit` set to a safe ceiling (e.g. `25mb`) in `next.config.ts` to prevent giant raw request bodies from reaching the runtime on Pro plan — **pending**
- Supabase Storage bucket policy for `bookings` bucket: restrict writes to service role only, reads scoped to artist ownership — **pending**

**Out of scope:** Client-side compression, drag-and-drop reordering, image moderation, original archive.

**Dependencies:** None — foundational surface hardening.

**Acceptance criteria:**

- Uploads above 10 MB are rejected with a user-facing error before processing
- Unsupported mime types are rejected server-side regardless of client input
- A booking creation failure after upload cleans up all associated storage files
- Stored images are WebP, ≤1600px on longest edge
- Oversized raw request bodies are rejected at the platform edge before reaching application code
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 33 — Server-side authorization hardening

**Status:** ✅ complete — ownership assertions added to travel (delete/toggle), waitlist (contacted/dismiss); all action files audited

**Goal:** Every artist-facing server action enforces authentication and ownership checks server-side, so that auth cannot be bypassed by manipulating client state, URL parameters, or form payloads.

**Scope:**

- Audit all server actions under `src/app/(artist)/` and `src/app/[slug]/`: confirm each fetches the session user and validates `artist_id === user.id` before reading or writing data
- Booking actions (approve, reject, deposit, cancel): re-fetch booking from DB and assert ownership before applying transition — not just trusting the submitted booking ID
- Settings actions (profile, books, slots, fields, templates, reminders): assert the update target belongs to the authenticated user
- Waitlist and travel actions: same ownership assertion
- Admin route (`/admin`): server-side email check already in place — audit that no admin query falls through to an unauthenticated call
- Storage: ensure all Supabase Storage reads for booking images go through the service client only, never the anon client directly from the artist app
- Remove any remaining cases where only page-level auth guards (middleware redirect, UI hide) protect a sensitive action

**Out of scope:** API-key based authentication, organisation-level RBAC, audit log for every authorization check.

**Dependencies:** None — can proceed against current codebase.

**Acceptance criteria:**

- Every server action that mutates artist data begins with `supabase.auth.getUser()` and an explicit ownership assertion
- A fabricated form submission with a different artist's booking ID is rejected before any DB write
- No action relies solely on a hidden field or URL param for identity — all identity comes from the session
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 34 — Rate limiting expansion

**Status:** ✅ complete — login (10/15min), password reset (5/hr per IP+email), manual reminder send (3/day), customer portal cancel (5/hr per token)

**Goal:** Rate limiting covers all externally accessible actions that are either unauthenticated (booking form, login, password reset) or prone to automated abuse (reminder sends, resend triggers).

**Scope:**

- **Currently rate-limited:** public booking form submission — no change needed
- **Add rate limits via Upstash:**
  - Login action: per IP, e.g. 10 attempts / 15 min
  - Password reset (forgot-password action): per IP + per email, e.g. 5 / hour
  - Manual reminder send (booking detail): per artist per booking per type, e.g. 3 / day
  - Waitlist conversion email: per artist per entry, 1 send
  - Customer-facing portal actions (reschedule, cancel): per token per action, e.g. 5 / hour
- All rate limit errors return a clear, user-facing message — not a raw 429
- Rate limit key strategy: prefer IP + action slug for unauthenticated routes, user ID + action slug for authenticated ones

**Out of scope:** Full DDoS protection (platform-level concern), per-endpoint analytics.

**Dependencies:** Slice 33 (authorization hardening — actions should be auth-locked before layering rate limits).

**Acceptance criteria:**

- Login endpoint rejects excess attempts with a user-facing message and does not leak information about account existence
- Password reset cannot be spammed per email address
- Manual reminder send is capped per booking per type
- All rate-limited actions fail gracefully with a readable error
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 35 — Booking state machine and idempotency hardening

**Status:** ✅ complete — FSM in booking-fsm.ts, guards on all transitions, Stripe intent dedup, 60s submission dedup

**Goal:** Booking status transitions are validated against an explicit state machine server-side; repeated or concurrent requests for the same transition are safe and produce no duplicate side effects.

**Scope:**

- Define explicit valid transitions as a constant, e.g.:
  - `pending → approved | rejected | deposit_pending | cancelled`
  - `deposit_pending → approved | rejected | cancelled`
  - `approved → cancelled`
  - Terminal states (`rejected`, `cancelled`) accept no further transitions
- All status-changing server actions (`approveBooking`, `rejectBooking`, `requestDeposit`, `markDepositReceived`, `cancelCustomerBooking`) validate the current status against allowed transitions before writing — re-fetching the row inside the action, not trusting submitted state
- Idempotency: status-changing actions check that the transition has not already been applied (DB re-fetch) before sending emails or creating notifications — prevents duplicate emails on double-click or retry
- Slot release on cancellation / rejection is already handled — verify it is inside the transition guard and not outside it
- Public booking submission: add a short-lived deduplication key (customer email + artist slug + timestamp window) to prevent identical bookings submitted twice within 60 seconds

**Out of scope:** Full event sourcing, optimistic locking with row versions, multi-artist workflows.

**Dependencies:** Slice 33 (ownership checks must be in place before transition guards are meaningful).

**Acceptance criteria:**

- A server action called on a booking in a terminal state returns an error without writing to the DB
- Approving an already-approved booking is a no-op that does not send a second email
- A customer submitting the same form twice within 60 seconds results in one booking, not two
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 36 — Webhook and origin integrity

**Status:** ✅ complete — Stripe audit_log idempotency, email-hook secret required, booking form origin check, crons audited (both had CRON_SECRET)

**Goal:** Incoming webhooks (Stripe, cron) are verified before being trusted; the booking form rejects submissions from unexpected origins.

**Scope:**

- **Stripe webhook:** audit `/api/stripe/webhook` — confirm `stripe.webhooks.constructEvent` is called with `STRIPE_WEBHOOK_SECRET` before any booking update; if the raw body is not being correctly forwarded by Next.js, fix it (disable body parsing for that route)
- **Cron endpoints:** confirm `CRON_SECRET` header check is present and returns 401 without it on `/api/cron/cleanup` and `/api/cron/reminders`
- **Booking form origin:** add `Origin` / `Referer` header check in `submitBookingAction` — reject submissions that do not originate from the expected app domain (configurable via `NEXT_PUBLIC_APP_URL`)
- **Auth callback:** confirm `/auth/callback` rejects `code` parameters that do not match expected Supabase state — already handled by Supabase SDK, document this

**Out of scope:** Full CSRF token implementation for all forms (Supabase session cookies are SameSite=Lax by default — adequate for same-origin forms), Resend webhook verification (defer to Slice 38).

**Dependencies:** Slice 34 (rate limiting in place before focusing on origin hardening).

**Acceptance criteria:**

- A Stripe webhook request without a valid signature is rejected with 400 before any DB write
- Cron endpoints return 401 for requests without the correct `Authorization` header
- A booking form POST from an unexpected origin is rejected server-side
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 37 — Audit log expansion

**Status:** ⬜ pending

**Goal:** The existing `audit_log` table is extended to cover auth events, settings changes, and sensitive admin actions — making it a practical debugging and trust tool, not just a booking history.

**Scope:**

- **Currently logged:** booking lifecycle events (created, approved, rejected, cancelled, deposit, customer_cancelled) — no change
- **Add logging for:**
  - Auth events: login (success and failure), password change, 2FA enable/disable, recovery code use
  - Settings changes: booking mode change, books open/close, email template edits
  - Admin actions: any admin analytics page load (for access record)
  - Notification sends: manual reminder trigger (already partial — verify completeness)
- Log schema additions: add `actor_email` (denormalized for readability) and `event_category` (`auth | booking | settings | admin`) columns — or store in existing `details` JSONB if migration is undesirable
- Log viewer: expose auth and settings events in the booking detail communication sidebar where relevant (e.g. "password changed" visible to admin only, not artist-facing)
- Retention: no automatic pruning in v1 — document that logs are permanent until manual cleanup

**Out of scope:** Real-time alerting on log events, log export UI, compliance-grade audit trails.

**Dependencies:** Slice 35 (state machine hardening — clean transitions before logging them), Slice 31 (2FA must be shipped before auth events can be logged).

**Acceptance criteria:**

- A password change writes an entry to `audit_log` with actor, timestamp, and event type
- A 2FA enable/disable event is recorded
- Booking mode changes appear in the audit log
- Admin page access is recorded
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 38 — Email infrastructure safeguards

**Status:** ⬜ pending

**Goal:** The email sending layer has per-artist daily send limits, deduplication hardening for reminders, and a foundation for tracking delivery failures.

**Scope:**

- **Per-artist send cap:** add a daily email send counter (via Upstash or a `daily_email_count` field in `profiles.settings`) — cap total outbound emails per artist per day at a sensible default (e.g. 200), log and skip beyond the cap without hard-failing the request
- **Reminder deduplication:** tighten the cron idempotency check — before sending any reminder, verify the `audit_log` does not already contain a matching send for the same booking + type + day window; current check exists but confirm it covers all three reminder types
- **Resend webhook (optional):** if Resend delivery webhooks are available, register an endpoint to receive `email.bounced` and `email.complained` events and write them to `audit_log` with type `email_delivery_failed` — do not hard-block sending on first bounce in v1, just record it
- **Sender domain:** document that `EMAIL_FROM` must use a verified sending domain in Resend; add a startup check that warns if the domain is unverified

**Out of scope:** Unsubscribe list management, bounce-based send suppression (defer to post-v0.1), full deliverability monitoring.

**Dependencies:** Slice 36 (webhook integrity — Resend webhook endpoint needs origin validation), Slice 34 (rate limiting covers manual reminder triggers).

**Acceptance criteria:**

- An artist with an unusually high booking volume cannot trigger more than the daily cap of outbound emails via cron
- A reminder that was already sent today for a given booking is skipped without error
- If Resend webhooks are configured, a bounced email is recorded in `audit_log`
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 39 — Deposit payment hardening

**Status:** ⬜ pending

**Goal:** The Stripe deposit flow is hardened against duplicate payments, webhook replay, and unreconciled states; the system can detect and recover from payment/booking mismatches.

**Scope:**

- **Webhook idempotency:** before processing `payment_intent.succeeded`, check `audit_log` for an existing entry with the same `payment_intent_id` — skip if already processed; Stripe's own retry logic means the same event may arrive multiple times
- **Duplicate intent prevention:** when `requestDeposit` creates a new PaymentIntent, check that the booking does not already have a non-cancelled `deposit_payment_intent_id`; if so, return the existing client secret rather than creating a second intent
- **Reconciliation cron (weekly):** add a cron job that queries bookings in `deposit_pending` status where `deposit_due_at` is more than 7 days past and no matching `deposit_paid_at` exists — log these as `deposit_unreconciled` in `audit_log` for manual review; do not auto-cancel
- **Stripe secret rotation safety:** document the procedure for rotating `STRIPE_WEBHOOK_SECRET` without downtime (add to DECISIONS.md)
- **Test mode guard:** confirm that test-mode Stripe keys cannot be mixed with production Supabase data by checking `STRIPE_SECRET_KEY` prefix (`sk_live_` vs `sk_test_`) at startup and logging a warning if in production with a test key

**Out of scope:** Refund automation, dispute handling, invoice generation, Stripe Radar integration.

**Dependencies:** Slice 36 (webhook signature verification must be in place before idempotency work is meaningful), active Stripe test-mode usage with real bookings to validate against.

**Acceptance criteria:**

- A replayed `payment_intent.succeeded` webhook does not update the booking or write a duplicate audit entry
- Calling `requestDeposit` twice on the same booking returns the existing PaymentIntent, not a new one
- The reconciliation cron identifies unresolved deposits without modifying booking status
- A test-mode key in a production environment logs a startup warning
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 40 — Backup and recovery basics

**Status:** ⬜ pending

**Goal:** Critical booking and artist data can be recovered from an incident; the team has a documented, tested recovery path and artists can export their own records.

**Scope:**

- **Supabase PITR:** document the current PITR window (7 days on free plan, 30 days on Pro) in DECISIONS.md — include the procedure to restore a single table to a point in time using the Supabase dashboard
- **Artist data export:** add a `/settings/export` page (or action) that generates a JSON export of the authenticated artist's bookings, client notes, and audit log — available on demand, no scheduled automation in v1
- **Booking integrity check (admin):** add a section to the `/admin` analytics page that flags bookings in impossible states (e.g. `approved` with no `decided_at`, `deposit_pending` with no `deposit_amount`) — display count only, no automated repair
- **Critical field protection:** confirm that `profiles.slug` and `booking_requests.customer_token_hash` have no delete RLS path for the artist role — artists cannot delete their own slug or invalidate customer magic links
- **Recovery runbook:** add `RUNBOOK.md` with step-by-step instructions for: restoring a deleted booking from PITR, resending a customer magic link, recovering an artist account after lockout

**Out of scope:** Automated off-site backups, cross-region replication, point-in-time restore automation, GDPR deletion workflows (separate concern).

**Dependencies:** Slice 37 (audit log expansion — export should include audit events), production data volume sufficient to validate export size and performance.

**Acceptance criteria:**

- An artist can download a JSON export of their bookings from Settings
- The admin page flags at least two categories of booking integrity anomalies
- `RUNBOOK.md` exists and covers the three recovery scenarios
- `pnpm typecheck` and `pnpm lint` pass

---

## Hardening package boundary

Slices 32–40 constitute the hardening track.

**Sequencing summary:**

- Slices 32–33: surface protection (uploads locked, actions auth-guarded) — highest priority, ship first
- Slices 34–35: behavioral integrity (rate limits, state machine) — ship before first real artist wave
- Slices 36–37: trust and observability (webhooks, audit log) — ship before public launch
- Slices 38–39: operational reliability (email, deposits) — ship as each surface becomes active
- Slice 40: recovery readiness — ship before meaningful data accumulates

**v0.1 hard launch readiness requires Slices 32–36 complete.**
