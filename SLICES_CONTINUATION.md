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

**Status:** ✅ complete

**Goal:** Customer image uploads are validated, optimised, and stored safely; the server enforces hard limits on request size and rejects malformed payloads before they reach application logic.

**Scope:**

- File count cap (5 per booking), mime-type allowlist (jpeg/png/webp), per-file size limit (10 MB), all enforced server-side in addition to client-side — **done**
- Images processed through sharp before storage: resize to ≤1600px longest edge, convert to WebP at 85% quality — **done**
- Storage path structured as `{artistId}/{bookingId}/{uuid}.webp` — **done**
- Orphan cleanup: uploaded files removed from storage if processing, upload, or booking insert fails — **done**
- `booking_images` table extended with `width`, `height`, `file_size`, `mime_type`, `original_filename` — **done**
- Next.js `serverActions.bodySizeLimit` set to `52mb` in `next.config.ts` — **done**
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

**Status:** ✅ complete — event_category column (migration 0015), writeAudit() helper, auth/settings/admin hooks, full booking timeline in sidebar

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

**Status:** ✅ complete — per-artist cron cap (10/run), manual send dedup via audit_log, Resend delivery webhook, EMAIL_FROM validation

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

**Status:** ✅ complete — Stripe test-mode guard, unreconciled deposit cron, duplicate intent guard (Slice 35), webhook idempotency (Slice 36)

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

**Status:** ✅ complete — /settings/export JSON download, admin integrity checks panel, RUNBOOK.md (5 procedures)

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

---

## Post-hardening work — Slices 41–53

These slices were built after the hardening package was complete. They are not pre-planned roadmap items — they emerged from real product decisions, UX gaps identified during testing, and marketing needs during the pre-launch window. All are shipped to production.

**Migrations applied to production:** 0000–0021 (all current).

---

### Slice 41 — UI/UX restructuring and Trip Planner

**Status:** ✅ complete (`ff703f1`, `1286953`, `1717037`, `a7142fc`; migration 0016)

**Goal:** Consolidate the navigation into a cleaner structure, replace the flat `travel_legs` model with a proper Studios + Trips + Trip Legs hierarchy, and add an Appearance settings section.

**Scope:**

- Nav consolidation: merged scattered settings into a unified sidebar; added dedicated Travel/Trip Planner section
- **New data model** (migration 0016): `studios` (reusable venue records), `trips` (parent trip with title + booking-form flag), `trip_legs` (date ranges with optional studio, nested under trips); existing `travel_legs` rows migrated forward
- `booking_requests.trip_id` FK added; `travel_leg_id` retained for historical reference
- Appearance settings section added to artist settings
- Bug fixes: preferred date now syncs with trip/location availability; advance bookings allowed for upcoming (not yet active) trip legs

---

### Slice 42 — Placement photo annotation

**Status:** ✅ complete (`ed19438`; migration 0017)

**Goal:** Clients can annotate uploaded reference photos with pin markers and comments to indicate exact placement on the body; annotations are stored alongside the image and shown to the artist on the booking detail.

**Scope:**

- `booking_images.annotations` JSONB column (array of `{ id, x, y, comment }` objects) — migration 0017
- Client-side annotation canvas on the image upload step of the booking form
- Artist sees annotated images with pins overlaid on the booking detail page

---

### Slice 43 — Flash feature and Instagram integration

**Status:** ✅ complete (`515fb79`, `cfe4188`; migrations 0018, 0019)

**Goal:** Artists can publish flash designs with optional flash days; clients can browse and request specific flash pieces. Artists can also connect their Instagram account to import posts directly as flash items.

**Scope:**

- **Flash items** (`flash_items` table, migration 0018): design images, price, availability status (`available | claimed | archived`), optional flash day assignment
- **Flash days** (`flash_days` table, migration 0018): title, date, location, description, status (`upcoming | active | past | cancelled`)
- Public flash page at `/[slug]/flash`: clients can browse available flash
- Availability modes: artist can set whether flash is bookable via the standard booking form or requires a separate contact
- **Instagram integration** (migration 0019): artists connect their Instagram account; posts can be synced and imported directly as flash items without manual re-upload
- `/settings/flash` and `/settings/instagram` in artist app

**Known limitation:** Instagram OAuth redirect URI requires configuration in Meta App dashboard — documented as open task.

---

### Slice 44 — Marketing growth pages and demo artist

**Status:** ✅ complete (`d9f7f22`, `7716ea3`, `dd84bf0`, `e9b945f`, `562eb44`)

**Goal:** Targeted landing pages for paid social campaigns; the live demo experience uses a real artist (Bert Grimm) with a clear demo notice so visitors understand it is not a live booking.

**Scope:**

- `/start` — primary Instagram ad landing page ("stop booking via DMs")
- `/dm-chaos` — variant landing page targeting booking friction pain point
- `/guest-spots` — variant targeting traveling/guest-spot artists
- Live demo switched from placeholder to Bert Grimm (`/bert-grimm`); demo notice intercepts form submit with an explanation modal so no accidental submissions land on the artist
- Demo notice moved to form submit intercept (not shown on page load) to preserve natural browsing

---

### Slice 45 — Admin account management system

**Status:** ✅ complete (`dca9d41`; migration 0020)

**Goal:** Admins can manage artist account status (suspend, reactivate, archive) from a dedicated account detail page; all actions are logged.

**Scope:**

- `profiles.account_status` (`active | suspended | archived`), `suspended_at`, `suspended_reason`, `deleted_at`, `deleted_by` columns — migration 0020
- `/admin/accounts/[id]` — full account detail page with usage stats, configuration snapshot, recent bookings, admin action history
- Admin actions: suspend (with reason, auth ban), reactivate (unban), archive (soft delete + auth ban), reset onboarding, trigger password reset (generates Supabase recovery link)
- All admin actions logged to new `admin_action_log` table and `audit_log`
- `getAccountDetail()` query in `admin-queries.ts`

---

### Slice 46 — Branding system and visual identity

**Status:** ✅ complete (`db2feab`, `f928e34`, `aa4f371`, `5a7e7c8`, `61c9405`, `4299357`, `3ab92dc`, `6927d65`, `70fe3e3`, `00e0a2c`, `19de975`, `345df9d`)

**Goal:** Establish a consistent Inklee visual identity — randomized but stable logo color, matching spiderweb loading illustrations, updated favicon, and a redesigned landing page — applied uniformly across the platform.

**Scope:**

- **Randomized logo**: six color variants (`blue`, `bone`, `green`, `mustard`, `red`, `rosa`); picked once at module load per session via `useSyncExternalStore` (hydration-safe, no flash)
- **Spiderweb loader**: `BrandLoader` component using matching six-variant spiderweb SVGs with a floating animation; replaces the old generic spinner
- **Brand color synchronization**: `src/lib/brand-pick.ts` shared singleton ensures logo and spiderweb loader always display the same color within a session
- **Landing page redesign**: new hero, feature highlights, social proof placeholder, footer; aligns with Inklee brand voice and palette
- Favicon updated to spiderweb illustration (mustard on charcoal)
- Branding applied consistently across auth pages, onboarding, customer portal, and public booking pages
- `/dev/loader` preview page for internal component review

---

### Slice 47 — Mobile UX pass

**Status:** ✅ complete (`a80c27d`, `3aec894`, `e3d8753`)

**Goal:** The artist app is usable on mobile — key flows (booking list, request detail, travel editing, booking form) work reliably with touch inputs and appropriate typography scale.

**Scope:**

- Nav: bottom tab bar stable; fixed header on mobile scroll
- Modals: scroll-safe, full-width on small screens
- Touch targets: minimum 44px on all interactive elements
- Typography: line height and size tuned for mobile readability
- Booking form reorder: field drag works on touch
- QR card for artist's booking URL, shareable on mobile
- Availability status displayed inline on booking settings

---

### Slice 48 — Onboarding and settings UX polish

**Status:** ✅ complete (`25479bd`, `dd44497`, `2180034`, `da69e3a`, `ea91c8b`)

**Goal:** Tighten the first-run experience and the most-used settings surfaces; reduce modal count in settings navigation.

**Scope:**

- **Onboarding refactor**: 5-step essential flow (identity → profile → booking setup → flash intro → go live); dashboard widget icons added for quick navigation
- **Feature intro modals**: empty placeholder modals on first encounter with Flash, Waitlist, and Travel features — scaffolded for copy, not yet written
- **Reminders merged into Emails**: `/settings/reminders` content folded into `/settings/emails` to reduce nav depth
- **Email templates UX**: card-list layout + modal editor replaces inline forms; "reset to default" button restores the system template body

---

### Slice 49 — Unified booking form builder

**Status:** ✅ complete (`931fd86`, `f5234c4`)

**Goal:** Artists have a single drag-and-drop interface for controlling which fields appear on their booking form and in what order, covering both standard fields and custom fields.

**Scope:**

- All standard fields (instagram handle, email, reference link, placement, size, description, image upload, preferred date, trip selector) are individually toggleable
- **Unified field list** (`UnifiedFieldList` component): combines standard field toggles and custom field management in one list; fields are reorderable via HTML5 drag-and-drop
- `profiles.settings.field_order` JSONB stores the canonical field order; public booking form renders fields in that order via a `renderField(key)` closure
- Backward-compatible: accounts without a saved order fall back to `buildDefaultFieldOrder()`

---

### Slice 50 — Booking settings UX (availability and slots)

**Status:** ✅ complete (`dad32c7`, `fd42efd`)

**Goal:** Availability toggle is instant; switching to fixed-slots mode is guided; adding time slots uses a pattern builder that handles bulk creation across dates or weekdays.

**Scope:**

- **Immediate availability toggle**: `books_open` flips on click without a save button; server action `toggleBooksOpenAction` updates the DB optimistically
- **Booking mode modal**: switching to `fixed_slots` for the first time opens an inline slot setup modal; skipping creates a `system_warning` notification so the artist is reminded
- **Slot pattern builder** (`SlotPatternBuilder`): define time windows (start–end pairs), apply to specific dates or to weekdays within a date range; creates multiple slots in one server action call (`createSlotsFromPatternAction`)
- "Add time slot" button opens a modal containing the pattern builder; replaces the old inline form

---

### Slice 51 — Admin analytics tester exclusion

**Status:** ✅ complete (`2c09701`; migration 0021)

**Goal:** Admin and test accounts can be flagged as testers so their activity does not skew product analytics.

**Scope:**

- `profiles.is_tester boolean NOT NULL DEFAULT false` — migration 0021
- Admin toggle on `/admin/accounts/[id]`: "Mark as tester" / "Tester" pill button; immediate optimistic save; logged in `admin_action_log` as `flag_tester` / `unflag_tester`
- "tester" badge in artist roster table
- All admin analytics queries (`getKpis`, `getOnboardingFunnel`, `getBookingFunnel`, `getFeatureAdoption`) exclude flagged profiles and their associated booking activity via `testerIds()` + `excludeTesters()` helpers

---

### Slice 52 — Trip planner UX improvements

**Status:** ✅ complete (`e276be1`)

**Goal:** Stops are part of the new-trip creation flow, not an after-the-fact edit; terminology is consistent and clear.

**Scope:**

- "Stops on your trip" section included in the New Trip modal; stops are collected in client state and submitted as `legs_json` with the trip in a single request
- `createTripAction` accepts `legs_json` and inserts trip legs in the same server action call
- All "date range" / "Add date range" labels renamed to "stop" / "Add stop" throughout trip manager and edit modal

---

### Slice 53 — Brand color synchronization

**Status:** ✅ complete (`345df9d`)

**Goal:** The spiderweb loader always matches the logo color — they were previously independent random picks.

**Scope:**

- `src/lib/brand-pick.ts`: single module-level singleton (`getBrandColor()`) shared by both `RandomizedLogo` and `BrandLoader`
- Both components now resolve their asset path through a named color map (`LOGO[color]`, `SPIDERWEB[color]`), guaranteeing they always render the same color variant within a session

---

## Post-hardening boundary

Slices 41–53 constitute the post-hardening work completed before v0.1 onboarding of real artist users.

**Applied migrations:** 0000–0021 (all current as of 2026-05-02).

---

## Open tasks and pending items

The following items are confirmed incomplete. They are not slices — they are specific gaps within shipped slices or pre-conditions for features not yet activated.

### Security and infrastructure

| #     | Item                                                                                                                                 | Origin                     | Priority                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------- |
| OT-01 | Supabase Storage bucket policy: restrict `bookings` bucket writes to service role only, scope reads to artist ownership              | Slice 32 (pending)         | High                            |
| OT-02 | Switch Stripe from test-mode to live-mode keys in Vercel (`sk_live_*`, `pk_live_*`, new webhook secret)                              | Slice 17 (still test-mode) | High — before any real payments |
| OT-03 | Set Instagram OAuth redirect URI in Meta App dashboard (required for Flash Instagram integration to work for non-developer accounts) | Slice 43                   | Medium                          |
| OT-04 | Upstash local dev credentials in `.env.local` (production rate limiting active; local dev silently skips it)                         | DEFERRED.md                | Low                             |

### Legal and compliance

| #     | Item                                                                                                    | Origin       | Priority          |
| ----- | ------------------------------------------------------------------------------------------------------- | ------------ | ----------------- |
| OT-05 | Legal entity for Impressum (required in Germany before real users)                                      | DECISIONS.md | High — pre-launch |
| OT-06 | Terms of Service + Privacy Policy (template + lawyer review)                                            | DECISIONS.md | High — pre-launch |
| OT-07 | Cookie consent disclosure (Supabase auth cookies need to be disclosed even if analytics is cookie-free) | DECISIONS.md | Medium            |

### Product features not yet activated

| #     | Item                                                                                                                     | Origin           | Priority             |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------------------- |
| OT-08 | Feature intro modal copy (Flash, Waitlist, Travel modals are scaffolded but empty — no copy written)                     | Slice 48         | Medium               |
| OT-09 | ✅ Logo upload on onboarding done page — inline upload widget added                                                      | Slice 25         | Done                 |
| OT-10 | ✅ Dashboard bio nudge — soft prompt rendered when `profiles.bio` is null after onboarding                               | Internal backlog | Done                 |
| OT-11 | HEIC image support for booking uploads (requires `libheif` compiled into `sharp`; not available in default Vercel build) | DECISIONS.md     | Deferred — post-v0.1 |

### Admin and analytics

| #     | Item                                                                                                                               | Origin   | Priority |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| OT-12 | ✅ `testerIds()` wrapped with React `cache()` — request-scoped memoization eliminates duplicate DB round-trips per admin page load | Slice 51 | Done     |

---

## Pre-launch UX polish package: Slices 60–61

These slices were added during the pre-launch UX walkthrough (Phase D in `project_inklee_roadmap.md`). The artist-facing surfaces work end-to-end, but real first-time use is exposing friction that wasn't obvious during feature-by-feature shipping. Slice 60 was **expanded 2026-05-16** from a narrow Flash UX pass into a platform-wide UX audit and restructure, split into sub-slices 60a–60d to keep each unit shippable. Slice 61 (auth UI) stays distinct. They sit before the post-launch short-domain phase (Slices 54–59) because they're launch-blocking polish, not growth work.

**Sequencing rules:**

- 60a must close before 60b–60d start (60a is the decision doc that scopes the rest).
- 60b and 60c can run in parallel once 60a closes.
- 60d should land after 60b (Flash needs to fit the new IA).
- Slice 61 (auth UI) is independent and can run any time.

Avoid scope creep into "redesign the whole thing". Each sub-slice is audit + targeted fixes, not a redesign.

---

### Slice 60a — Platform-wide UX audit + IA decision doc

**Status:** ✅ shipped 2026-05-21 (commit `8a5ea32`)

**What landed (diverged from the original spec):** the audit ran as a multi-agent process — Claude + Codex did independent passes, then cross-reviewed each other, then a final synthesized plan combined the findings. Five artifacts now live at `docs/ux-audit/`:

- `claude-independent-ux-audit.md` (Phase 1)
- `codex-independent-ux-audit.md` (Phase 1)
- `claude-response-to-other-agent.md` (Phase 2 — cross-review)
- `codex-response-to-other-agent.md` (Phase 2 — cross-review)
- `final-ux-optimization-plan.md` (Phase 3 — implementation plan: U1–U5 + optional U6)

**IA decision: Option A — keep current flat structure.** Both audits converged independently on the same conclusion: Inklee has the right modules; the connective tissue is what's weak. Restructuring Bookings to parent over Flash / Trip Planner / Slots / Waitlist would create churn without proportional benefit at this stage. Decision should be back-filled into `DECISIONS.md` (not yet done as of `8a5ea32`).

**Why the artifact filename diverged from `docs/platform-ux-audit-slice-60a.md`:** the deeper multi-agent process produced 5 files instead of 1. The final plan in `docs/ux-audit/final-ux-optimization-plan.md` is the canonical deliverable for 60a's "audit + decision + scoped notes" outputs.

**Goal:** Produce a written analysis of friction across the entire artist app, plus a concrete recommendation for whether and how to restructure the information architecture (notably: should "Booking" become the parent for Flash, Trip Planner, Slots, Waitlist?). Output is a decision doc + punch list, no code.

**Why this exists:** Real first-time use is exposing IA tension. Flash, Trip Planner, and the booking workflow live as siblings at top level today, but they're really _modes of taking bookings_. The user has flagged this as worth investigating; this slice runs the investigation and lands a decision before any code moves.

**Scope (audit phase):** walk every artist-facing surface as a real first-time visitor, then as a returning artist on mobile, and produce a written analysis covering:

- **Current IA snapshot** — every top-level sidebar item, its children, and what it actually contains today
- **Pain-point inventory** — friction observed at each surface (discoverability, naming, redundancy, dead ends, mobile breakage)
- **IA proposal (or "keep as-is" recommendation)** — at minimum, evaluate:
  - Option A: keep current flat structure (Dashboard / Bookings / Flash / Trip Planner / Analytics / Settings)
  - Option B: "Booking" becomes a parent (Bookings → Requests / Calendar / Flash / Trip Planner / Slots / Waitlist / Clients), reducing top-level items
  - Option C: hybrid (Bookings stays focused, but Flash + Trip Planner get clearer cross-links)
  - Document reasoning for the chosen option
- **Cross-feature flow gaps** — places where the user crosses feature boundaries (e.g. flash → booking request → calendar) and the seams show
- **Onboarding-to-real-use gap** — what first-time users miss after finishing the 5-step onboarding wizard
- **Mobile-specific friction** — every audited surface checked at 375px

**Output:** `docs/platform-ux-audit-slice-60a.md` containing:

1. Current state snapshot (top-level nav + children)
2. Friction punch list, prioritised by impact
3. IA recommendation with explicit decision
4. Scoped slice notes for 60b / 60c / 60d (what each one should ship based on findings)
5. A short entry added to `DECISIONS.md` recording the IA decision

**Out of scope:**

- Any code changes — this slice is purely audit + decision
- Schema changes
- Marketing site
- Public booking page redesign (separate track)

**Dependencies:** Slice 23 (UI/UX redesign), Slice 41 (Trip Planner introduction restructured nav), Slice 46 (branding), Slice 47 (mobile pass), Slice 48 (onboarding polish), Slice 50 (booking-settings UX), UI rework commits `885f9f8` + `2a4af67`.

**Acceptance criteria:**

- Audit doc committed at `docs/platform-ux-audit-slice-60a.md`
- IA decision recorded in `DECISIONS.md`
- Scoped notes for 60b/60c/60d are concrete enough that those slices can start without re-running the audit

---

### Slice 60b — Navigation + IA restructure (implementation)

**Status:** ✅ shipped 2026-05-21 (commit `8a5ea32`)

**What landed:** 60a's decision was "keep flat" so this slice collapsed from a structural rewire to a label rename pass. Changes:

- Sidebar labels: **Travel → Guest Spots**
- Bookings sub-nav: **Booking Settings → Books & Availability**; **Booking Form → Booking Link & Form**; first sub-item label changed to **Bookings** (was "Overview"; redundant given parent "Bookings")
- Page H1s match: `/bookings/overview` ("Bookings"), `/bookings/settings` ("Books & Availability"), `/bookings/booking-form` ("Booking Link & Form"), `/travel` ("Guest Spots")
- Sidebar Settings sub-item **"Dashboard" → "Home widgets"** (avoids name collision with top-level Dashboard)
- References in chrome updated: request-detail back link, `/settings/account` "Edit in" link, onboarding fixed-slots warning, onboarding-done feature item, FeatureIntroModal waitlist CTA
- Zero-request post-onboarding artists get a mustard-tinted **"Your booking link is live"** Card on `/dashboard` (Copy / Preview / Help); `BookingLinkWidget` force-rendered for that same condition regardless of the `widgets.booking_link` toggle
- "All widgets are hidden" fallback now reads "Show some widgets again →" and is suppressed when the zero-request setup card is present

**Goal:** Implement the IA decision from 60a. If the decision is "keep as-is", this slice ships only targeted nav polish (active states, hover affordances, mobile spacing). If the decision is "restructure", this slice rewires the sidebar, top nav, mobile nav, and sub-navs accordingly without breaking existing routes.

**Scope (likely, conditional on 60a):**

- **Sidebar rewire** — update `src/components/app-shell/sidebar*.tsx` to reflect the new IA. Preserve the hierarchical auto-expand pattern from the UI rework.
- **Top-bar consistency** — workspace top-bar cluster (books-status pill, bell, settings, avatar) stays; verify no new top-level items break the cluster's layout.
- **Mobile nav** — `src/components/section-nav.tsx` + bottom-tab strip updated to match. Touch targets ≥ 44px, no horizontal scroll.
- **Sub-navs** — `BookingsNav` (Requests / Calendar / Clients / Waitlist) likely expands if Flash + Trip Planner move under Bookings. Settings sub-nav untouched unless 60a flags it.
- **Routes** — every existing route still resolves. If a route moves (e.g. `/flash/items` → `/bookings/flash/items`), add a permanent redirect rule in `next.config.ts` so existing links don't 404.
- **Breadcrumbs / page titles** — update where the path display changes.
- **Active-state legibility** — selected vs hover vs unselected. Mobile bottom-tab active state especially.

**Out of scope:**

- Onboarding wizard changes (Slice 60c)
- Flash-specific surface fixes (Slice 60d)
- Auth surfaces (Slice 61)
- New nav features (search, command palette, etc.)

**Dependencies:** Slice 60a (decision doc).

**Acceptance criteria:**

- Nav structure matches 60a's recommendation, or 60a documented "no change" and this slice shipped only polish items
- All existing route paths either still resolve or are 301-redirected to their new homes
- Mobile nav passes a smoke test at 375px and 414px — no overflow, no missed touch targets
- Active-state legibility verified at desktop + mobile
- `pnpm typecheck` and `pnpm lint` pass
- No regression in the per-surface tests run during 60a (re-walk after implementation)

---

### Slice 60c — Onboarding wizard extension + mobile optimization

**Status:** 🔄 partial — commit `8a5ea32` shipped the mobile pass + onboarding microcopy; intro slides + OT-08 modal copy still open

**What landed (2026-05-21):**

- Mobile pass on the daily-work surface (covers what was crammed on small viewports): `md:hidden` card list on `/bookings/overview` Requests view; stacked rows on `/bookings/overview` Clients view; `/bookings/waitlist` card stacking on `<sm`; **StatusActions rendered above the dense detail block on `<lg`** for `/bookings/requests/[id]` (replaces the originally-planned sticky-bottom action bar — Codex flagged safe-area + keyboard conflicts; actions-at-top solves the underlying "scroll through dense content to decide" goal more cleanly)
- Onboarding step 1 progress label "Profile" → "Link"
- Booking-mode picker copy reframed as "Choose this if…" framing for both preferred_date and fixed_slots
- Public booking form's "what happens next" hint above the submit button: _"You'll get a confirmation email with a link to edit or cancel before {artistFirstName} replies."_
- New default field order for fresh accounts: contact (Instagram + email) → description → placement → size → references → date

**Still open (originally-scoped, not in `8a5ea32`):**

- 1–3 skippable intro slides BEFORE `/onboarding/welcome` (skippable + persisted dismissal)
- 375px pass across every onboarding step — keyboard interactions, autofocus, input keyboards, form-error visibility
- **OT-08:** real copy for the scaffolded Flash, Waitlist, Travel intro modals (the modals exist; their `description`/`bullets`/`ctaLabel` were filled in `feature-intro-modal.tsx` 2026-05-21 BUT the Flash/Waitlist/Travel entries should be re-reviewed for tattoo-native voice)
- First-real-use dashboard nudges beyond the zero-request "Your booking link is live" card (e.g. "Add your first slot" if fixed-slots mode is selected but 0 slots posted — partially addressed by the share-section warning shipped in `8a5ea32`, but not on `/dashboard`)

**Goal:** Extend the onboarding wizard with intro slides that explain the product before the form-heavy steps begin, and run a mobile pass across the wizard so the 5-step flow doesn't break on small viewports. Close out the empty feature-intro modal copy gaps from Slice 48 (OT-08) as part of the same pass.

**Scope:**

- **Intro slides at wizard start** — 1–3 lightweight slides before the existing `/onboarding/welcome` content that establish what Inklee is, what the artist is about to set up, and what the booking link will look like. Skippable. Persisted dismissal so returning users don't re-see.
- **Mobile optimization across the wizard** — every step at 375px + 414px:
  - `/onboarding/welcome`
  - `/onboarding/claim-slug`
  - `/onboarding/profile` (or equivalent — confirm against current routes)
  - `/onboarding/booking-form` (or equivalent)
  - `/onboarding/done`
  - Check: keyboard interactions, autofocus behaviour, input keyboards (`type="email"` etc.), form-error visibility
- **Feature intro modals (OT-08)** — fill in the copy for the scaffolded Flash, Waitlist, and Travel intro modals. Tattoo-native voice, scene-aware, no SaaS framing. Audit doc 60a may surface a fourth modal target (e.g. "Booking" group intro if the IA restructure consolidates).
- **First-real-use prompts** — soft nudges on the dashboard once onboarding is done but key actions haven't happened yet (e.g. "Add your first slot" or "Set up your booking form"). Already scaffolded in Slice 48 backlog (OT-10 bio-nudge was the prototype).

**Out of scope:**

- New onboarding steps (don't expand from 5 → 8). Slides go _before_ the existing flow.
- Tutorial videos, embedded help articles, chat widgets
- Schema changes to track wizard progress (existing `onboarding_completed` flag remains)
- Sign-up form itself (Slice 27 Google login + Slice 31 2FA cover that)

**Dependencies:** Slice 25 (first-login onboarding), Slice 48 (onboarding polish), OT-08 (feature intro modal copy).

**Acceptance criteria:**

- Intro slides ship with skippable mechanism and persistence
- Every onboarding step usable at 375px with no horizontal scroll, no clipped fields, no broken keyboards
- All scaffolded feature-intro modals have real copy (OT-08 closed)
- First-real-use dashboard nudges either shipped or explicitly deferred with reasoning in 60a's audit doc
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 60d — Flash feature thorough audit + flow integration

**Status:** ⏳ pending — best run after 60b lands so Flash fits the final IA

**Goal:** The Flash workflow — from Instagram connection through draft import, item editing, flash days scheduling, and the public flash page — feels coherent and obvious to a first-time artist, AND integrates cleanly with whatever IA decision 60a landed. Friction points discovered during real-flow testing get fixed without expanding the feature surface.

**This was the original scope of the un-expanded Slice 60.** Kept intact, with one addition: the integration step that verifies Flash sits naturally in the (possibly restructured) booking flow.

**Scope (audit phase):** walk the Flash flow as a real artist with no prior context, in this order, and produce a written punch list:

- `/settings/instagram` — first connect, sync feedback, post grid scan, "Add to Flash" decision
- `/flash/items` (or `/bookings/flash/items` if 60b moved it) — list view, draft vs published states, edit modal, image preview quality
- `/flash/items/[id]` (or edit modal) — pricing, availability, booking mode, flash day assignment
- `/flash/days` (or restructured path) — schedule view, status transitions (upcoming/active/past/cancelled), per-day flash assignment
- Public `/[slug]/flash` — what a client sees when scanning available flash, request-to-book flow, "books closed" empty state
- **NEW: cross-feature flow** — verify that a flash request that gets approved lands in the same bookings dashboard as a custom booking, with consistent status handling, deposit options, and customer portal experience

**Scope (fix phase):** triage punch list by impact. Likely targets (placeholder until 60a punch list informs):

- Empty-state copy + next-action prompts across the four list surfaces
- Loading/pending feedback parity with the Instagram-resync pattern shipped 2026-05-10 (`useTransition`-driven spinner + status note)
- Image quality on the public flash page — confirm Supabase-hosted thumbnails render at adequate resolution
- Flash day status transitions feel intentional (upcoming → active → past automation already in place; UX clarity around manual cancel)
- Flash request appearing in the unified booking list with no special-case affordances (consistency over feature isolation)

**Out of scope:**

- New features (flash variants, bulk pricing, custom availability rules)
- Schema changes
- Public flash page visual redesign (separate visual pass, if needed)
- Instagram integration changes — caching layer shipped 2026-05-10, considered stable
- Onboarding modal copy for Flash (handled in 60c)

**Dependencies:** Slice 43 (Flash + Instagram), 2026-05-10 Instagram caching commit, Slice 60a (audit), Slice 60b (IA restructure if any), Slice 60c (Flash intro modal copy).

**Acceptance criteria:**

- Written punch list committed to repo as `docs/flash-ux-audit-slice-60d.md`
- High-impact items shipped; deferred items re-filed as discrete OTs with explicit reasoning
- Flash flow re-walked end-to-end after fixes; no regression on the audited surfaces
- An approved flash booking and an approved custom booking sit side-by-side in the dashboard with no visual or behavioural inconsistencies
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 61 — Navigation + auth UI pass

**Status:** ⏳ pending — punch list to be authored during audit

**Goal:** The artist app's navigation surfaces and the auth/onboarding entry points feel like one consistent product. The pre-login moments (login, signup, forgot/reset, MFA) and the in-app navigation chrome (top nav, sub-navs, mobile bottom tabs) match the brand voice and visual system established in Slice 46 (branding) without diverging from each other.

**Scope (audit phase):** review every surface below as a real first-time visitor, then as a returning artist on mobile, and produce a written punch list:

- **Auth surfaces:** `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/mfa`, OAuth callback transition states
- **Top nav (NavBar):** logo, primary sections (Dashboard / Bookings / Flash / Trip Planner / Analytics / Settings), notification bell, user menu, account-status indicators
- **Sub-navs:** BookingsNav (Requests / Calendar / Clients / Waitlist), Flash sub-nav (Items / Days / Instagram), Settings sub-nav, Trip Planner controls
- **Mobile bottom tab bar:** primary tabs, active state, transition behaviour
- **Branding moments:** randomized logo color (Slice 46), spiderweb loader, favicon consistency across auth pages

**Scope (fix phase):** triage punch list by impact. Likely targets (placeholder until audit completes):

- Auth page hierarchy and copy — first-time clarity, error-state messaging, "no account / already have one" CTAs
- Visual consistency between auth pages and the in-app design system
- Nav active-state legibility (selected vs hover vs unselected)
- Mobile bottom-tab spacing and touch target sizes (Slice 47 mobile pass already covered the basics — verify no regression)
- User-menu density, logout placement, account-status pills

**Out of scope:**

- New nav structure or IA changes (Slice 41 did the last restructure; no new sections)
- Marketing site nav (separate concern, owned by the marketing layout system shipped 2026-05-07)
- Public booking page nav (separate visual track)
- Schema or routing changes

**Dependencies:** Slice 23 (initial UI/UX redesign), Slice 41 (nav restructure), Slice 46 (branding system), Slice 47 (mobile UX), Slice 31 (2FA flows live).

**Acceptance criteria:**

- Written punch list committed to repo as `docs/nav-auth-ui-audit-slice-61.md` (or similar)
- High-impact items shipped; deferred items re-filed as discrete OTs with explicit reasoning
- Visual smoke-test pass on desktop (1280, 1440, 1920) and mobile (375, 414) — no layout regressions on existing flows
- Auth flow re-walked end-to-end (signup → onboarding → first-login → 2FA enable → logout → login → MFA challenge) with no copy or visual stutters
- `pnpm typecheck` and `pnpm lint` pass

---

## Pre-launch UX polish boundary

Slices 60–61 must complete before public launch. They block the MVP gate (Phase D in `project_inklee_roadmap.md`) only if their audits surface critical issues; otherwise they're polish that can ship in parallel with marketing/legal closeout.

---

## Post-Launch Phase: Short Domain + Shareability Layer (inkl.ee)

**Status:** ⏳ Planning only. No implementation until the post-launch checklist is met.

**Where this fits:** After production stability, the core marketing site (homepage + 5 SEO pages live), the SEO/GEO foundation, working tracking, and a stable public booking flow. **Not before.** The short domain is a growth/shareability layer, not a launch blocker.

**Strategic decision (locked in):**

- `inklee.app` stays the **canonical** product, marketing, SEO, GEO, app, and dashboard domain. All SEO authority accumulates here.
- `inkl.ee` is a **short link / sharing surface only** — Instagram bios, QR codes, campaign URLs, artist booking links, offline/print. Not a separate product, not a separate brand.
- Written brand stays "Inklee". `inkl.ee` is the literal URL only — never the product name.
- No duplicate content across both domains. Everything on `inkl.ee` is either a 301 redirect to `inklee.app` or (only if explicitly authorised in Slice 56) serves the canonical page with a strict `<link rel="canonical">` pointing back to `inklee.app`.

**Pre-conditions before Slice 54 may start:**

- MVP closeout complete (`project_inklee_roadmap.md` Phases B/C/D)
- At least one real artist actively using the product
- Plausible/analytics confirmed firing reliably across all marketing pages
- Sitemap and canonical setup verified clean in Search Console

**What must NOT be built yet:**

- Any artist page served directly from `inkl.ee` (Slice 58 only — and only after redirect-only is shipped and validated first)
- A separate sitemap or robots.txt for `inkl.ee` that introduces duplicate-content risk
- QR generation in the dashboard (Slice 57) before campaign-redirect plumbing exists (Slice 54/55)
- Any SEO-page content rewritten to live on `inkl.ee`
- Auth, dashboard, customer portal, or Stripe webhook routes ever reachable via `inkl.ee`

**Recommended first step after stable launch:** Slice 54 only — DNS connection plus a single root redirect `inkl.ee → inklee.app` and 2–3 named campaign shortlinks. Ship small, verify analytics attribution end-to-end on real Instagram traffic, then expand.

**SEO/GEO invariants (do not silently revisit at any later point):**

- `inklee.app` is the only domain in the sitemap
- All canonical tags point to `inklee.app`
- All `inkl.ee` paths are 301 (permanent), never 302
- Internal links inside `inklee.app` content never point to `inkl.ee` — only outbound surfaces (bios, QR, print) use the short domain
- Search Console configured for `inklee.app` only — no separate `inkl.ee` property
- `inkl.ee` returns no indexable HTML — pure redirect surface

**Tracking requirements (carried across all six slices):**

- Every shortlink redirect target carries `utm_source` + `utm_medium=shortlink` + `utm_campaign`; QR variants additionally carry `utm_term=qr`
- Plausible attribution must survive the 301 (verified in Slice 54 acceptance)
- Per-artist shortlink hits trackable in Slice 58
- Dashboard share-card interactions tracked as Plausible custom events in Slice 57
- A pinned Goal in Plausible counts shortlink-attributed signups distinctly from organic

---

### Slice 54 — Short domain technical setup (Phase A)

**Status:** ✅ LIVE 2026-05-18 — DNS connected (Zone → Cloudflare → Vercel), domain attached to project `inklee`, both paths verified redirecting. **Scope + timing adjusted by founder 2026-05-18** (see `DECISIONS.md`): campaign shortlinks cut; pulled forward to pre-launch deliberately, overriding the post-launch gate, to lock the `inkl.ee/{slug}` link format before beta testers start sharing links.

**Goal:** `inkl.ee` is connected to the existing infrastructure and permanently redirects every path (root + artist slugs) to `inklee.app`. It is a pure artist-link shortener — no content, no campaign links. (Redirects emit HTTP 308 — Vercel's `permanent: true`; SEO-equivalent to 301, satisfies the "permanent, never 302" invariant.)

**Scope (as built):**

- Connect `inkl.ee` to the Vercel project as a domain on `mchlkrfts-projects/inklee` (DNS: Zone registrar → Cloudflare nameservers, A `@` → `76.76.21.21` **DNS-only/grey-cloud** → Vercel)
- Two host-scoped `vercel.json` redirects: explicit `/` + catch-all `/:path*`, both `inkl.ee → 308 → https://inklee.app/...` (the explicit root rule is required — `/:path*` does not match the root on Vercel; without it `inkl.ee/` served the homepage 200). `has` host condition makes both inert for `inklee.app` traffic.
- `DECISIONS.md` records the mechanism + the campaign-cut + Option A (redirect, not serve) rationale.

**Cut from original scope (2026-05-18):**

- ❌ The 3 named campaign shortlinks (`/dm`, `/start`, `/link`) — collide with the artist-slug namespace; would need permanent slug bans. Reversibly re-addable later as named rules above the catch-all if marketing ever wants them.
- Consequently the Plausible-UTM-attribution acceptance step no longer applies to Slice 54 (no UTM-bearing links ship here). Artist-link attribution is a Slice 57/58 concern.

**Out of scope (unchanged):** Dynamic shortlink mapping system (Slice 55), campaign management UI, dashboard share tools (Slice 57), artist pages _served_ (not redirected) on `inkl.ee` (Option B / Slices 56+58).

**Technical risks:**

- If `inkl.ee` ever resolves to a Next.js page rather than a redirect, canonical and noindex must be airtight — this is why it ships pure-redirect (Option A). Option B is explicitly deferred.
- Cloudflare proxy (orange cloud) + Vercel apex = SSL/redirect-loop risk. Mitigated: records stay **DNS-only**; Vercel terminates TLS.
- Vercel domain SSL certificate provisioning can take a few minutes after DNS resolves — plan a low-traffic window.

**Acceptance criteria:**

- `curl -I https://inkl.ee/` returns 308 → `https://inklee.app/` ✓ verified 2026-05-18 (after explicit root-rule fix)
- `curl -I https://inkl.ee/<some-artist-slug>` returns 308 → `https://inklee.app/<slug>` ✓ verified 2026-05-18 (`/bert-grimm`)
- `inkl.ee` returns zero indexable pages (manual check + `site:inkl.ee` search after 7 days); NOT added to the sitemap or to Search Console as a separate property
- `pnpm typecheck` and `pnpm lint` pass ✓ (verified 2026-05-18: typecheck clean, lint 0 errors / 11 pre-existing unrelated warnings)

---

### Slice 55 — Campaign shortlinks (Phase B)

**Status:** ⏳ pending — depends on Slice 54

**Goal:** Named campaign shortlinks for Instagram bios, stories, reels, conventions, and printed material are managed from a single config and follow a consistent UTM convention.

**Scope:**

- `src/lib/shortlinks.ts` config: array of `{ slug, target, utm: { source, medium, campaign } }` entries
- Build-time codegen (or runtime lookup, depending on Slice 54's redirect implementation choice) that emits the redirects from this config so adding a new shortlink is a one-line PR
- Initial set:
  - `inkl.ee/dm` → `/dm-chaos` (already from Slice 54, now in config)
  - `inkl.ee/guest` → `/guest-spots`
  - `inkl.ee/form` → `/tattoo-booking-form`
  - `inkl.ee/start` → `/signup` (from Slice 54)
  - `inkl.ee/link` → `/instagram-booking-link-for-tattoo-artists` (from Slice 54)
- Every shortlink carries `utm_source` + `utm_medium=shortlink` + per-campaign `utm_campaign`
- Internal docs page `docs/shortlinks.md`: how to add/retire a campaign shortlink, naming conventions, the reserved-path collision risk with future Slice 58

**Out of scope:** Dashboard UI for non-technical campaign creation, A/B variant shortlinks, time-bound campaigns.

**Technical risks:**

- Slug collision with future artist slugs (Slice 58) — every campaign slug added here must also be added to `RESERVED_SLUGS` in the same PR

**Acceptance criteria:**

- All initial shortlinks return 301 with attached UTM
- Adding a new campaign shortlink is a one-config-entry change
- A pinned Plausible Goal counts shortlink-attributed signups distinctly from organic
- All campaign slugs are present in `RESERVED_SLUGS`

---

### Slice 56 — Artist shortlink decision (Phase C, planning only)

**Status:** ⏳ planning — produces a written decision in `DECISIONS.md`, not code

**Goal:** Resolve the artist-slug shortlink strategy before any implementation. Output is a decision doc; no code changes.

**Decisions required (all needed before Slice 58):**

- **Routing strategy:** `inkl.ee/{slug}` 301 → `inklee.app/{slug}` (recommended starting point), OR `inkl.ee/{slug}` serves the canonical artist page directly (requires strict `<link rel="canonical">` and rigorous duplicate-content handling)
- **Indexing:** if redirect-only — non-issue. If direct-serve — `noindex` initially until artist-page SEO is intentionally pursued, and even then needs the `public_indexable` profile flag noted in `project_inklee_seo.md` decision #1
- **Reserved-path collisions:** `inkl.ee/{slug}` collides with campaign shortlinks (`/dm`, `/start`, etc.). Define a single reserved-path list combining `RESERVED_SLUGS` + every active campaign slug from Slice 55. Add a startup check that warns if any existing artist slug overlaps
- **Tracking:** how to differentiate `inkl.ee/{slug}` vs direct `inklee.app/{slug}` vs Instagram-referral. Options: per-artist UTM in the redirect, server-logged shortlink hit counter, both
- **Privacy / legal:** does `inkl.ee` change anything in the privacy policy or imprint? (Likely no — same controller, same data flow — but document explicitly so the answer is on record)
- **Auth/session separation:** `inkl.ee` must never set or read app session cookies. Document this as a hard invariant

**Recommended early approach (to be confirmed in this slice):** redirect-only. `inkl.ee/{slug}` 301s to `inklee.app/{slug}`. Defer direct-serve until there is a clear product reason and the public artist SEO surface is intentionally being grown.

**Out of scope:** Implementation. This slice produces a decision doc, not a feature.

**Acceptance criteria:**

- A new `DECISIONS.md` entry covers all six decision points above with explicit answers
- The chosen approach is annotated as default vs reversible
- `RESERVED_SLUGS` reservation strategy for slugs is defined (even if implementation lands in Slice 58)

---

### Slice 57 — Dashboard sharing tools (Phase D)

**Status:** ⏳ pending — independent of Slice 56 if the short URL gracefully falls back to the canonical when `inkl.ee` per-artist routing is not yet live

**Goal:** Artists have a one-screen "share your booking link" surface in the dashboard with copy buttons, a QR download, and a few starter copy snippets.

**Scope:**

- New "Share" card on the artist dashboard (or `/settings/sharing`):
  - Public booking link `inklee.app/{slug}` — copy button
  - Short booking link `inkl.ee/{slug}` if Slice 58 has shipped, else fall back to the canonical link with a tooltip "short link coming soon"
  - QR preview (client-side, e.g. `qrcode` lib) — download as PNG
  - Three static copy snippets to drop into Instagram bio / story / guest-spot announcement
- Plausible custom events on each copy / download interaction
- All UI under the existing artist-app design system (no new component patterns)

**Out of scope:** Editable copy snippets, QR style customisation, Instagram API auto-post, multi-language snippets.

**Tracking requirements:**

- Plausible events: `share_link_copy_full`, `share_link_copy_short`, `share_link_qr_download`, `share_link_snippet_copy`
- Each event tags `slug` (so per-artist breakdown is possible later)

**Acceptance criteria:**

- Artist sees the share card in the dashboard within one nav action
- Both copy buttons populate clipboard with the right URL
- QR download produces a working scannable PNG that resolves to the canonical artist page
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 58 — Artist public shortlinks (Phase E)

**Status:** ⏳ pending — gated by Slice 56 decision and stable artist-page UX

**Goal:** `inkl.ee/{artistSlug}` resolves correctly per the Slice 56 decision (redirect-only by default), with reserved-path conflict handling and per-artist analytics.

**Scope:**

- Implement the chosen routing strategy from Slice 56
- Reserved-slug check: `inkl.ee/{slug}` rejects (or 404s) any slug colliding with a campaign shortlink, system reserved word, or anything in `RESERVED_SLUGS`
- Analytics: every `inkl.ee/{slug}` hit counted as a Plausible custom event with `slug` property, separate from canonical-domain traffic
- Tests: route resolution, reserved-slug guard, redirect target correctness, UTM persistence
- Search Console: monitor for any inadvertent indexing of `inkl.ee/{slug}` URLs in the first 30 days post-launch

**Out of scope:** Direct-serve artist pages on `inkl.ee` (only on the table if Slice 56 explicitly authorised it — and even then ship redirect first, direct-serve later as a separate slice)

**Technical risks:**

- Reserved-path collisions: an artist signs up with slug `dm` → `inkl.ee/dm` is now ambiguous. Mitigation already encoded in Slice 55: every campaign slug added to `RESERVED_SLUGS` at the same time. Slice 58 ships the startup check that warns if any active artist slug overlaps.
- Magic-link customer portals (`/request/[token]`) must not be exposed via `inkl.ee` — auth/session surfaces stay strictly on `inklee.app`. Add an explicit allow-list of path prefixes the short domain serves; everything else 404s.

**Acceptance criteria:**

- A real artist's `inkl.ee/{slug}` resolves correctly per the chosen strategy
- A slug colliding with a campaign returns the campaign destination, never the artist's
- Plausible reports per-artist shortlink click counts
- `/request/*`, `/auth/*`, `/dashboard/*`, `/admin/*`, `/api/*` all 404 when requested via `inkl.ee`
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 59 — QR + offline campaign layer (Phase F)

**Status:** ⏳ pending — depends on Slice 57 + 58

**Goal:** Downloadable, trackable QR codes and printable assets exist for campaign shortlinks (and per-artist links), with appropriate source-tracking parameters.

**Scope:**

- Campaign QR generator (internal tool, not artist-facing): generates QR codes for each campaign shortlink with `utm_term=qr` so QR-originated traffic is distinguishable from clicks
- Asset bundle: PNG + SVG exports per campaign for stickers, flyers, convention banners
- `docs/campaign-assets.md`: how to request a new printed asset, naming conventions, where to file requests
- Optional: extend the dashboard share card (Slice 57) to expose `utm_term=qr` toggle when downloading the per-artist QR

**Out of scope:** Print-on-demand integration, sticker fulfilment, automatic asset generation pipelines, multi-language QR variants.

**Tracking requirements:**

- All QR-generated links carry `utm_term=qr` so Plausible can break QR-attributed traffic out separately

**Acceptance criteria:**

- Each campaign shortlink has an exportable QR asset stored in the repo (or CDN)
- A scanned QR resolves to the correct campaign page with `utm_term=qr` attached
- Per-artist QR (from Slice 57) carries `utm_term=qr` when downloaded

---

## Short domain phase boundary

**Sequencing rule:** 54 → 55 → 56 (decision) → 57 / 58 / 59 in any order once Slice 56 is resolved.

**Roll-back rule:** every step in this phase is reversible without affecting `inklee.app`. Disconnecting the `inkl.ee` alias domain at the Vercel level is a one-click rollback if anything in Plausible attribution, indexing, or routing goes sideways.

---

## Post-Launch Phase: Conversion Testing — Dark vs Bone-Light `/dm-chaos`

**Status:** ⏳ Planning only. No implementation until the post-launch checklist is met and Slice 63 (Tracking Foundation) has been live for at least one full week of organic traffic.

**Where this fits:** A focused conversion-optimisation phase that runs _after_ the launch is stable, _after_ the SEO foundation is in place, and _after_ analytics fire reliably. Independent of (and orthogonal to) the short-domain phase — they can run in either order.

**Test question:** Does a lighter, bone-coloured Inklee theme on `/dm-chaos` improve completed-signup conversion from Instagram and Reddit traffic compared with the current dark theme?

**Test page:** `/dm-chaos` only. The homepage carries broader SEO/GEO responsibility and is not a clean A/B surface. `/dm-chaos` is a single-intent landing page already wired for Instagram bio / DM traffic — the right place to test conversion-theme hypotheses.

**Strategic principles (locked in):**

- Both variants must share **identical copy, headlines, subheadlines, CTAs, section order, layout, offer, signup flow, and page length**. Only colour theme, background, card styling, contrast, borders/shadows, and graphic framing change.
- `/dm-chaos` stays the **only canonical URL**. No `/dm-chaos-light`, no `/dm-chaos-dark`, no preview routes that compete for index space.
- The bone-light theme must feel Inklee-branded, tattoo-scene-native, warm — **not generic SaaS, not luxury, not corporate**. If the light variant only "wins" by looking like every other startup, the win is not real.
- The light theme is built as **reusable design tokens**, not a forked component tree. If light performs better on `/dm-chaos`, the same tokens can apply to other landing pages later without rewriting components.
- Logged-in users always see dark and are excluded from conversion analysis. Internal/founder visits are excluded at three layers (cookie, admin-email list, event-time filter).
- Plausible carries the first test. Meta Pixel ships as a **separate gated slice** (Slice 67) only when paid Instagram ads are about to start, and only after the cookie banner + privacy policy + consent gate are revised.

**Pre-conditions before Slice 62 may start:**

- MVP closeout complete (`project_inklee_roadmap.md` Phases B/C/D)
- `/dm-chaos` landing page stable, with no copy edits planned during the test window
- Signup + onboarding flow stable, no launch-critical bugs
- At least one real artist has signed up via the production flow
- The audit findings in `docs/analytics-audit-2026-05-14.md` have been reviewed by the owner

**What must NOT be built yet:**

- Variant theming or middleware before Slice 63 confirms Plausible custom events fire reliably
- Any A/B logic that creates a second indexable URL for `/dm-chaos`
- Meta Pixel integration before Slice 67 (consent gate)
- Copy or layout edits to `/dm-chaos` while a test is running
- A second test on the homepage or any other page before this one concludes

**SEO/conversion-testing invariants (do not silently revisit):**

- One canonical URL, one set of metadata, one JSON-LD payload for both variants
- No cloaking — Googlebot sees the same variant-assignment logic as a real visitor
- No 301 redirects in the test (if any redirects exist for the test infra, they must be 302/307)
- No copy or CTA changes during the test window
- Statistical honesty: a 50–200 EUR test is **directional learning**, not a statistically final result. The phase decision rules reflect that.

**Tracking requirements (carried across all eight slices):**

- Six Plausible custom events: `dm_chaos_view`, `dm_chaos_cta_click`, `signup_started`, `signup_completed`, `onboarding_started`, `booking_link_created`
- Every event carries `variant` (`dark`|`light`), `source`, `medium`, `campaign`, `device`, `path`, `logged_in`, `internal` properties where applicable
- `signup_completed` fires **server-side from `/onboarding/done`**, exactly once per user, guarded by a `profiles.settings.signup_event_fired` flag. Never from `/signup` — auth user exists with no profile during onboarding drop-off, that is not a real conversion.
- UTM convention for paid + organic traffic:
  - Instagram organic: `utm_source=instagram&utm_medium=social&utm_campaign=dm_chaos_ab_test`
  - Instagram paid: `utm_source=instagram&utm_medium=paid_social&utm_campaign=dm_chaos_ab_test`
  - Reddit: `utm_source=reddit&utm_medium=community&utm_campaign=dm_chaos_ab_test`

**See also:** `docs/analytics-audit-2026-05-14.md` for the full pre-implementation audit, the recommended event schema, and the consent-flow analysis.

---

### Slice 62 — Analytics & Conversion Audit

**Status:** ✅ complete (2026-05-14) — output is `docs/analytics-audit-2026-05-14.md`

**Goal:** A written, evidence-backed snapshot of the current analytics state, so the implementation slices below can be scoped against reality (Plausible is installed but passive, no custom event helper exists, the cookie banner promises "no tracking cookies", etc.) rather than against assumptions.

**Output:** `docs/analytics-audit-2026-05-14.md` covering the 13 audit questions, recommended implementation path, event schema, risks/guardrails, and a Slice 63 checklist.

**Why this is its own slice and not just a doc:** the audit findings determine the firing point for `signup_completed`, the consent constraints on Meta Pixel, and the structure of the variant system. Without it, Slices 63–69 are over-scoped guesses.

---

### Slice 63 — Tracking Foundation (Plausible custom events)

**Status:** ⏳ pending — gated by pre-conditions above

**Goal:** Plausible fires six named custom events reliably across the marketing → signup → onboarding funnel, with internal/admin exclusion, duplicate-event prevention, and a server-side path for the most important event (`signup_completed`).

**Scope:**

- `src/lib/track.ts` with two helpers:
  - `trackEvent(name, props)` — client-side, calls `window.plausible(...)` with the property bag
  - `trackServerEvent(name, props)` — server-side, posts to the Plausible HTTP events API with the visitor's IP + UA forwarded so Plausible counts it as one session
- `PLAUSIBLE_API_TOKEN` env var added to Vercel (Production + Preview)
- Server-side `signup_completed` fires once from the `/onboarding/done` server action, guarded by a new `profiles.settings.signup_event_fired: boolean` flag set in the same transaction
- Client-side events wired:
  - `signup_started` — on the signup page mount (if attribution cookie present)
  - `booking_link_created` — on slug claim success
- Internal exclusion:
  - Server-readable `inklee_internal=1` cookie, settable via visiting `/dm-chaos?internal=1` once (90-day cookie, no UI surface)
  - `track.ts` skips firing when the cookie is set OR when the current user's email is in `ADMIN_EMAILS`
  - Every fired event also tags `internal: false` (or `true` if the skip is overridden for testing) so analysis can filter at query time
- UTM persistence: any UTM params present on the original `/dm-chaos` visit are written to a `inklee_attribution` cookie (30-day) and copied into `profiles.settings.signup_attribution` on slug claim
- Meta Pixel scaffolded but **not loaded**: `NEXT_PUBLIC_META_PIXEL_ID` env var read but ignored; the script tag is conditional on a `metaPixelEnabled` flag that stays `false` until Slice 67

**Out of scope:** Variant system, theme tokens, light theme, Meta Pixel actual firing.

**Technical risks:**

- Plausible's client-side `plausible(...)` is only available after `afterInteractive`. CTA-click handlers must guard against `window.plausible` being undefined (queue + flush, or no-op).
- The Plausible HTTP API requires the visitor's IP + UA forwarded with the request — easy to miss, easy to silently miscount.
- A flag in `profiles.settings` JSONB needs an atomic check-and-set; use Supabase's `update ... where signup_event_fired is null` pattern, not a read-then-write.

**Acceptance criteria:**

- All six events visible in the Plausible dashboard from a staging deploy
- `signup_completed` fires exactly once for a fresh signup, verified by re-loading `/onboarding/done` (should not double-fire) and replaying the auth callback (should not double-fire)
- An `inklee_internal=1` cookie suppresses all events from a real session
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 64 — Marketing theme tokens (dark + bone-light)

**Status:** ⏳ pending — depends on Slice 63

**Goal:** A reusable design-token system that lets any marketing page render in either the current dark theme or a new bone-light theme, by toggling a single attribute on the page wrapper.

**Scope:**

- `data-marketing-theme="dark"` (default) and `data-marketing-theme="light"` attribute selectors in `globals.css`
- Each selector defines a complete token set: background, surface, foreground, muted-foreground, border, accent (rosa/red/mustard stay branded in both themes), card surface, shadow strength
- Bone-light values designed against the existing Inklee brand palette — bone background, charcoal text, rosa/red/mustard accents preserved
- Tokens applied to `/dm-chaos` first; no other page touched in this slice
- A short visual reference at `docs/marketing-themes.md` showing the two token sets side-by-side
- Existing components on `/dm-chaos` (Hero, Pain, Solution, ProductProof, ArtistNative, Trust, FinalCta) read from CSS vars only — no per-component dark/light branches
- Print/screenshot the same `/dm-chaos` page in both themes for visual QA

**Out of scope:** Variant assignment logic (Slice 65), graphic adaptations for the light theme (Slice 66), applying the light theme to other pages.

**Technical risks:**

- The existing `/dm-chaos` page uses hardcoded Tailwind colour utilities in several places (e.g., `bg-brand-charcoal`, `text-brand-bone`). These need to be migrated to CSS-var-backed utilities or to `theme()`-aware classes before the toggle works. List every offender in the slice doc.
- Existing pages outside `/dm-chaos` (homepage, SEO pages, `/guest-spots`) MUST NOT regress — confirm via screenshot diff that the default dark tokens match current production exactly.

**Acceptance criteria:**

- Manually flipping `data-marketing-theme="light"` on `/dm-chaos` in DevTools renders a complete bone-light variant with no missing colours
- All other marketing pages render unchanged with default dark tokens
- The light variant feels Inklee-native (subjective owner sign-off) — not generic SaaS, not luxury
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 65 — `/dm-chaos` variant system (middleware-driven)

**Status:** ⏳ pending — depends on Slice 64

**Goal:** Anonymous, non-internal visitors to `/dm-chaos` are deterministically assigned `dark` or `light` 50/50, the assignment persists across visits, logged-in users always see dark, and `dm_chaos_view` fires on every visit with the variant attached.

**Scope:**

- Next.js middleware reads the `inklee_variant` cookie on `/dm-chaos`:
  - If `inklee_internal=1` or Supabase auth session cookie present → no variant set, force `dark`
  - If `inklee_variant` already set → use as-is (no re-randomization)
  - Else → assign `dark`|`light` 50/50, set cookie (Secure, SameSite=Lax, 30-day, not HttpOnly so client can read for debugging)
- `/dm-chaos` server component reads the cookie at render and applies `data-marketing-theme` accordingly
- `dm_chaos_view` fires from a tiny client component mounted on the page, with `variant`, `source`, `medium`, `campaign`, `device`, `logged_in`, `internal` properties
- `dm_chaos_cta_click` wired onto every signup CTA on `/dm-chaos` (HeroSection, FinalCtaSection, etc.) with `cta_label` property
- Variant is **always rendered server-side** — no client-side flash of wrong theme
- A debug query param `?force_variant=light` (or `dark`) overrides the cookie for owner inspection but does NOT persist and does NOT fire events with `internal: false`

**Out of scope:** Building the actual light variant graphics (Slice 66), Meta Pixel (Slice 67).

**Technical risks:**

- Middleware adds latency to every `/dm-chaos` request — keep the assignment logic to a few statements, no DB calls
- The Supabase auth cookie check in middleware must be a presence check only, not a full session validation (which would require a Supabase round-trip per request)
- Variant cookie + UTM persistence cookie are separate concerns — don't conflate

**Acceptance criteria:**

- Anonymous first visit assigns a variant and renders correctly in SSR (HTML inspect, no client-side flip)
- Returning anonymous visit shows the same variant
- Logged-in visit always shows dark, no variant cookie set
- `inklee_internal=1` cookie shows dark and fires no `dm_chaos_view` event
- `?force_variant=light` renders light without persisting, and the corresponding event is tagged internal-test
- Googlebot user-agent fetched against staging gets a deterministic variant (verified via curl) — no cloaking
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 66 — Bone-light `/dm-chaos` variant

**Status:** ⏳ pending — depends on Slice 65

**Goal:** The bone-light render of `/dm-chaos` looks intentionally Inklee — warm, scene-native, artist-friendly — and the placeholder graphics that currently live in dashed-border boxes on the dark variant are adapted to read cleanly on a light background without breaking the test (same concept, same message, same composition).

**Scope:**

- Walk every section of `/dm-chaos` in light mode, fix anything that reads weakly: contrast, divider lines, card edges, button states, hover affordances
- Adapt the two dashed-border placeholder zones (Hero + one section) noted in `inklee_followup.md` follow-up #4: same conceptual composition, redrawn for a bone background
- Keep copy, layout, section order, and CTA labels **byte-identical** to the dark variant
- Decide and document: do the brand rosa/red dividers (`bg-brand-rosa`, `bg-brand-red`) stay or change in light mode? Strong recommendation: keep them — they're brand markers, not theming
- Screenshot the full page in both variants at mobile (375px) and desktop (1440px) for visual QA, attach to the slice PR

**Out of scope:** Editing copy, changing CTAs, restructuring sections, applying light theme to any other page.

**Technical risks:**

- Subjective tuning can drag — set a 1-day cap, ship the first credible version, iterate post-test if it wins
- Tempting to "improve" copy while editing the theme. **Do not.** Copy stays frozen during the test.

**Acceptance criteria:**

- Owner sign-off that the bone-light page feels Inklee-native (not generic SaaS)
- Side-by-side desktop + mobile screenshots in the slice PR
- Contrast checked against WCAG AA for body text and CTAs
- Copy diff between the two variants is empty
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 67 — Meta Pixel + consent gate (gated, optional)

**Status:** ⏳ pending — independent of Slices 62–66, only required when paid Instagram ads are about to start

**Goal:** Meta Pixel is loadable, fires `CompleteRegistration` only on real signup completion, respects an explicit opt-in consent gate, and is fully disclosed in the cookie banner and privacy policy.

**Scope:**

- Revise `src/components/cookie-banner.tsx` from a passive "no tracking cookies" notice to a real consent gate with explicit accept/reject buttons. Default state: rejected (Plausible-only).
- Revise `src/app/privacy/page.tsx` to disclose Meta Pixel: what it is, what data goes to Meta, what the lawful basis is (consent), how the visitor can withdraw consent.
- `NEXT_PUBLIC_META_PIXEL_ID` env var read at runtime; Pixel script loads only when both the env var is set AND the consent cookie is `accepted`.
- Server-side `CompleteRegistration` fires once via the Meta Conversions API from the same `/onboarding/done` server action that fires Plausible `signup_completed` — guarded by the same `signup_event_fired` flag so the two events fire together, never duplicated. Includes hashed email per Meta's Conversions API spec.
- CSP `connect-src` extended to include `connect.facebook.net` (only when the Pixel is enabled — gate via a build-time check)
- The slice ships with Meta Pixel **disabled by default** (env var unset). Enabling it for production is a separate env-var flip after the consent flow is verified.

**Out of scope:** Other paid-ads pixels (Reddit, TikTok), Conversions API for events other than `CompleteRegistration`, advanced matching beyond hashed email.

**Technical risks:**

- The current cookie banner is a passive notice, not a consent gate. Rebuilding it as a real gate is the bulk of this slice — it touches every marketing page.
- Meta's Conversions API requires the visitor's IP + UA + a click-ID — same forwarding rigor as Plausible server events.
- CSP changes can break other things — extend `connect-src` in a focused PR and verify the Plausible + Stripe + Supabase + Maps connections still work.

**Acceptance criteria:**

- Cookie banner offers explicit accept/reject; default is reject
- Privacy page discloses Meta Pixel and consent semantics
- With `NEXT_PUBLIC_META_PIXEL_ID` unset → no Pixel script in the page source
- With `NEXT_PUBLIC_META_PIXEL_ID` set + consent rejected → no Pixel script
- With `NEXT_PUBLIC_META_PIXEL_ID` set + consent accepted → Pixel loads and `CompleteRegistration` fires at `/onboarding/done`
- `CompleteRegistration` never fires twice for the same user
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 68 — QA & data validation

**Status:** ⏳ pending — depends on Slices 63–66 (Slice 67 not required)

**Goal:** The test is launchable. Every exclusion, every event, every variant edge case is verified end-to-end on a staging deploy before paid traffic begins.

**Scope:**

- Anonymous visitor: variant assigned, persists across reload, `dm_chaos_view` fires once per visit, CTA clicks fire `dm_chaos_cta_click`
- Returning anonymous visitor: same variant served, no re-randomization
- Logged-in artist visiting `/dm-chaos`: always sees dark, no variant cookie set, no events fire
- Internal user (`inklee_internal=1` cookie): always sees dark, no events fire
- Founder admin email (`ADMIN_EMAILS` membership) completing a test signup: no `signup_completed` fires
- Mobile rendering: both variants pass visual QA at 375px and 414px viewport widths
- Page performance: Lighthouse score (mobile + desktop) within 5 points of the current dark baseline
- Playwright tests: variant persistence across reload, logged-in lock to dark, `?force_variant=` override
- Duplicate-event prevention: replay the auth callback, hit `/onboarding/done` twice, verify `signup_completed` fires exactly once

**Out of scope:** Test launch (Slice 69), Meta Pixel QA (covered separately in Slice 67's acceptance).

**Acceptance criteria:**

- All scenarios above documented and verified, with results in the slice PR
- Playwright suite green
- Lighthouse delta ≤ 5 points
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 69 — Test launch, analysis & decision

**Status:** ⏳ pending — depends on Slice 68

**Goal:** Run the first 10-day, 150 EUR test, collect the data, make a written decision in `DECISIONS.md`, and lock in the next move (keep dark, switch to light, split by surface, hybrid, or run a larger second test).

**Scope:**

- **Pre-launch checklist (24 hours before traffic starts):**
  - No copy or layout edits queued for `/dm-chaos`
  - All six events firing reliably in the Plausible production dashboard
  - Internal exclusion verified one last time from owner's main device
  - UTM convention documented (Instagram organic + paid, Reddit, future inkl.ee shortlinks)
- **Test parameters:**
  - Duration: 10 days
  - Budget: 150 EUR (acceptable range 50–200 EUR; below 50 = smoke test only, above 200 = stronger early signal)
  - Sources: Instagram (organic + paid), Reddit (community), no other paid surface
  - No edits to the landing page during the test window
  - No edits to copy, CTAs, or section order
- **Metrics tracked (all broken down by variant + source + device):**
  - `signup_completed / dm_chaos_view` — primary metric
  - `dm_chaos_cta_click / dm_chaos_view` — click-through rate
  - `signup_started / dm_chaos_view` — intent rate
  - `signup_completed / signup_started` — finish rate
  - `booking_link_created / signup_completed` — onboarding quality
  - Instagram vs Reddit performance
  - Mobile vs desktop performance
- **Analysis & decision options:**
  - Keep dark
  - Switch `/dm-chaos` to bone-light permanently
  - Use bone-light only for paid traffic, keep dark for organic / brand pages
  - Split themes by page surface: dark for brand pages (`/`, `/dm-chaos` if direction-of-arrival is brand), light for direct-response landing pages
  - Build a hybrid that picks the strongest sections from each
  - Run a second test with a larger budget if the first run is too noisy to call

**Out of scope:** Implementing whichever decision wins — that becomes a new slice in its own right, scoped after the data lands.

**Hard rules:**

- Do **not** declare a statistically final winner from a 50–200 EUR test. Treat the result as **directional learning**.
- Do **not** rely on CTA clicks if signup-completion data is present — CTA-click winners that don't convert are noise.
- Do **not** fire Meta `CompleteRegistration` unless Slice 67 is shipped AND consent is granted AND signup actually completed.
- Do **not** pollute the data with logged-in / admin / founder traffic. If pollution is detected during the run, document the contamination window and exclude it from the final analysis.

**Acceptance criteria:**

- Final decision entry written into `DECISIONS.md` with: hypothesis, sample sizes per variant, primary metric delta, secondary metrics, sources of bias, follow-up plan
- Test data exported from Plausible and archived in `docs/test-results-dm-chaos-ab-1.md`
- The chosen direction is reversible (i.e., variant infrastructure stays in place even if dark wins, so a future re-test on a different hypothesis is cheap to launch)

---

## Conversion testing phase boundary

**Sequencing rule:** 62 → 63 → 64 → 65 → 66 → 68 → 69. Slice 67 (Meta Pixel + consent) is independent and may ship in parallel with 64/65/66 or be deferred entirely until paid Instagram ads are about to start.

**Roll-back rule:** every step in this phase is reversible without touching the canonical `/dm-chaos` URL. Disabling the variant system is a middleware-revert + a CSS-var-default flip; the page stays live with the current dark theme throughout. Meta Pixel can be disabled instantly by clearing the env var.

**Cross-phase guardrail:** if the short-domain phase (Slices 54–59) is also live by the time this test runs, the UTM convention here must remain compatible with the inkl.ee shortlink convention documented there (`utm_medium=shortlink` for shortlinks, `utm_medium=social|paid_social|community` for direct posts). Cross-check before launching the test.

---

## Pre-Launch Phase: Bio Page + Goods + Appointment Add-ons (Slices 72–76)

**Status:** ⏳ Planning locked 2026-05-28. Build Slice 72 only after the plan is approved. Full design, audit, DB/Stripe/UI plan, legal caution, and QA checklist live in `docs/bio-page-goods-plan.md` — this section is the slice-level summary; do not duplicate the detail.

**Why pre-launch:** founder decision (2026-05-28) to ship the whole cluster before public launch. It reshapes booking/payment/webhook logic, is the headline differentiator, and is cheaper to land before any real artist has data. Sits after the Phase D gate, before Phase E mobile. See `docs/roadmap.md` §3.8.

**Locked decisions (do not re-litigate without updating the plan doc + `DECISIONS.md`):**

- **D1** — whole cluster ships before public launch.
- **D2** — keep the existing embedded **PaymentIntent** flow. One combined intent (deposit + goods), itemized in Inklee's own `order_items`. No Stripe Checkout Session in v1 (`stripe_checkout_session_id` kept nullable for forward-compat only).
- **D3** — **Stripe Connect gates production goods money** (roadmap OT-12). Build + test in Stripe test mode without Connect; `checkout_addons` stays OFF in production until Connect is live and artists are onboarded as connected accounts.
- **D4** — add-ons attach to the deposit-payment moment in `/request/[token]`, when `status === deposit_pending` and the artist has `is_checkout_addon` goods.
- **D5** — appointment pickup only; one artist + one booking per checkout; no shipping, cart, buyer accounts, discounts, multi-artist cart, global discovery, or reviews.
- **D6** — paywall **readiness** only: `profiles.settings.features` flags + `canUseGoods()` helper returning true for everyone. No subscription billing, no public pricing copy.

**Hard invariants:** deposit safe wording (7 files) verbatim; existing `/[slug]` route + deposit-only payment path unchanged for artists with no goods; honeypot + RLS service-role pattern + webhook idempotency intact; no em-dashes in public copy.

### Slice 72 — Bio Page modular structure

**Status:** ⏳ next to build (lowest risk; pre-launch-safe).

Refactor `src/app/[slug]/page.tsx` from a monolithic page into an ordered list of modules driven by `profiles.settings.bio_page` (module order + per-module visibility). Modules: `BookingCta` (wraps existing booking form / books-closed — primary conversion, unchanged behavior), `GuestSpots`, `Flash`, `Waitlist` (each wraps existing data — do not fake), `BookingPolicy` (NEW — editable text), `CustomLinks` (NEW), `Shop` (NEW — placeholder card only this slice, real products land in 73). Settings surface (`/settings/bio-page` or extend `/bookings/booking-form`) for show/hide + order + custom-link CRUD + booking-policy text.

Custom links in `profiles.settings.bio_page.custom_links[]` (`label`, `url`, `icon?`, `sort_order`, `is_active`). URL safety: allow `http`/`https` (+ optional `mailto`); reject `javascript:`/`data:`/other schemes — reuse the `resolveCoverImage` validation shape already in `[slug]/page.tsx`.

**Acceptance:** existing public page renders identically when no new modules are configured; custom links + booking policy render and are editable; shop placeholder shows; opinionated structure, no drag-drop page builder; existing booking flow untouched.

**No DB change** (JSONB only).

### Slice 73 — Goods data model + dashboard CRUD

**Status:** ⏳ pending — depends on 72.

Migration **0035** (`products`, `product_variants` + enums `product_category`, `product_status`, `product_fulfillment`). New "Goods" nav item in the General group; routes `/goods` (grid), `/goods/new`, `/goods/[id]` (edit + variants). Create / edit / hide / mark sold-out, image upload (reuse the `sharp` + logo/booking upload pipeline), shirt variants (S/M/L/XL with optional price override + optional stock), pickup note, `is_public_visible` + `is_checkout_addon` toggles, sort order. Public Shop cards replace the Slice 72 placeholder. Delete only if safe, otherwise archive/hide. Reuse the Flash designs-grid layout language.

**Acceptance:** artist can create a product + variants, hide, mark sold-out; hidden products never render publicly; public Shop shows active visible products; no variant matrix / SKU / shipping / tax-category complexity. Column spec in `docs/bio-page-goods-plan.md` §4.

### Slice 74 — Pre-checkout add-ons page

**Status:** ⏳ pending — depends on 73.

Enhance `src/app/request/[token]/customer-portal.tsx`: when `deposit_pending` and the artist has `is_checkout_addon` goods, show a goods selector + booking summary + required deposit + live total above the existing payment form. Server-side total recompute (never trust client amounts). On "Pay deposit and selected items," a server action upserts an `orders` row (`pending`) + `order_items` (deposit + product lines, snapshotted), updates the existing PaymentIntent amount to the combined subtotal and sets `metadata.order_id`, returns the client secret. Existing `DepositPaymentForm` / `PaymentElement` confirm unchanged.

**Acceptance:** client can pay deposit only (no goods) exactly as today; client can pay deposit + goods; total is correct and server-computed; combined amount is reflected in the PaymentIntent before confirmation. Copy examples in the plan doc, em-dash-free.

**No new DB this slice** (orders/order_items land in 75's migration, but the action in 74 writes to them — sequence the migration with 75 or fold 0036 into 74's start; the plan doc treats 0036 as the orders migration. Build order: apply 0036 before wiring 74's action).

### Slice 75 — Order + webhook + inventory + fulfillment

**Status:** ⏳ pending — depends on 74. **Highest risk — touches live money + the webhook.**

Migration **0036** (`orders`, `order_items`, optional `inventory_movements` + enums). Extend `/api/stripe/webhook`: on `payment_intent.succeeded`, if `metadata.order_id` present → verify `intent.amount === order.subtotal*100`, mark order `paid`, decrement inventory per product line items, run the existing booking-approval path, send itemized emails. If no `order_id` → existing deposit-only path untouched. Idempotency via order-status guard + existing audit_log guard. Booking detail (`/bookings/requests/[id]`) shows attached goods (variants, qty, fulfillment) + "Mark goods as picked up" + cancelled/refunded state mirroring Stripe. Itemized confirmation emails (customer + artist) extend the existing Resend templates minimally.

**Inventory rule:** decrement ONLY in the webhook after success. Never on page view or intent creation. Null quantity = unlimited. Overselling under concurrent checkout is accepted + documented for v1 (no reservation system).

**Acceptance:** webhook creates/updates the order correctly; inventory decreases only after successful payment and never before; order-item snapshots captured; booking confirms with and without goods; sold-out/hidden/unknown product cannot be purchased; webhook idempotent; existing booking + public routes still work.

### Slice 76 — Paywall readiness + analytics + QA hardening

**Status:** ⏳ pending — depends on 75.

`profiles.settings.features` flags (`bio_page_modules`, `goods_module`, `checkout_addons`) defaulting on; a single `canUseGoods(profile)` helper as the future gate point; a note in `business-model.md` mapping the future Free/Plus split. Optional Plausible events (`public_bio_page_view`, `shop_section_view`, `product_view`, `addon_selected`, `addon_removed`, `checkout_started`, `checkout_paid`, `goods_picked_up`). Full unit/utility test pass + the manual QA checklist in the plan doc §10.

**Acceptance:** no subscription billing, no public pricing copy, no plan ladder; flags are non-breaking and reversible; tests + manual QA pass; `checkout_addons` confirmed OFF in production pending OT-12 (Stripe Connect).

## Bio Page + Goods phase boundary

**Sequencing rule:** 72 → 73 → 74 → 75 → 76. Slice 72 is independently shippable and lowest-risk. Production goods checkout (real money) is gated on OT-12 (Stripe Connect) regardless of slice completion. Re-confirm scope at each slice boundary; do not implement more than one slice without checking back.

---

### Slice 77 — Pre-walkthrough UX + branding bug sweep

**Status:** ✅ DONE 2026-06-04 (code green: typecheck + lint clean, 287 vitest tests pass). On `feat/bio-page-goods`. A batch of founder-collected UX/UI bugs cleared before the Phase D live walkthrough (§3.3). Capture-then-fix, same as the Phase D method.

**Goal:** close five founder-reported issues that were rough edges on real surfaces, so the live walkthrough starts from a clean slate.

**Scope (all shipped):**

- **B1 — mobile nav: Goods had no entry point.** `MOBILE_BOTTOM_NAV` (`src/components/app-shell/nav-config.ts`) swapped the last slot Settings → Goods (`/goods`, `ShoppingBag`). Settings now lives only in the top-right account menu (`mobile-top-bar.tsx`: "Edit profile" relabelled "Settings" → `/settings/profile`). Bookings stays the center FAB (slot count unchanged).
- **B2 — booking-form Size radios broke on mobile.** `src/app/[slug]/booking-form.tsx` size options now stack label over hint (`flex-col`, dropped the `·`) so they fit the narrow `grid-cols-2` column.
- **B3 — size value lost its measurement in the artist backend.** Stored value is still the bare key (`forearm`); added `SIZE_LABELS` + `formatSize()` to `src/lib/booking-schema.ts` (label + hint, raw fallback). Applied at the artist display surfaces (`bookings/requests/[id]`, `bookings/overview` list + table, calendar `appointment-drawer` Row + edit-select option labels) and in every booking/deposit email var (submit, artist notification, approval × 4, webhook), so the artist sees exactly what the client picked (`Forearm · ~ 15-20 cm`). `SIZE_LABELS` relocated out of the client `booking-form.tsx`; `customer-portal.tsx` re-imports from the schema.
- **B4 — profile banner upload threw a full-screen 500.** `settings/profile/profile-form.tsx` now validates type + size client-side (inline message, clears the input) before any request; `MAX_COVER_SIZE` dropped 5 MB → **4 MB** (under Vercel's ~4.5 MB request-body cap, the silent platform reject); `sharp` calls in `actions.ts` wrapped in try/catch returning a friendly `{ error }` so an undecodable file (HEIC/corrupt) never surfaces the global error overlay.
- **B5 (mini-project) — email branding + deposit trust.** The described "plain, button-less, no-logo" deposit mail was already styled, but the audit surfaced real system-wide gaps. Unified the two divergent wrappers (`buildEmailHtml` + auth `base()`) into one shared shell `src/lib/email/layout.ts` carrying a **real hosted logo** (`public/branding/logos/inklee-email-logo.png`, 280×80, rasterized from the charcoal SVG because clients won't render SVG). Deposit-request mail gained trust context (why-received, "processed securely by Stripe, deposit goes directly to the artist's account," "no added fees") and a `Sent by Inklee on behalf of <artist>.` footer (also on the client deposit receipt) as an anti-phishing signal.

**Out of scope / deferred:** capitalization "drift" (not a bug — `Inklee` is a brand term per AGENTS.md sentence-case); footer-link parity + GDPR-badge softening (deliberately dropped, see `project_inklee_legal_package` L4); deliverability (SPF/DKIM/DMARC on `inklee.app` in Resend) — operational, verify in the Resend dashboard, not code.

**Smoke test:** mobile bottom nav shows Goods, Settings reachable top-right; Size radios stack cleanly at 375px; an approved/submitted booking shows `Forearm · ~ 15-20 cm` in the dashboard + emails; uploading a 6 MB or HEIC banner shows an inline message, not a 500; a sent deposit email renders the logo + Stripe/no-fee lines + on-behalf-of footer. `pnpm typecheck`, `pnpm lint`, `pnpm test` all green.

---

## Slice 78 — Phase D punch-list fix cluster

Formalizes the remaining Phase D walkthrough findings (`docs/phase-d-walkthrough-2026-05-27.md`) into shippable sub-slices. Desktop quick-wins, IP-ROOT (iPad), and UP-1 (uploads) already shipped; this cluster is the rest. **Sequencing: 78a → 78b → 78c → 78d → 78e → 78f**, each independently shippable + deployable, capture-then-fix, `typecheck`/`lint`/`test` green before each ship. Re-confirm scope at each boundary.

### Slice 78a — Goods "mark interest" decouple (DT-11) — H, regression

**Goal:** restore the ability for clients to mark interest in goods from the booking flow, independent of paid checkout (which stays parked).

**Root cause:** RS-3's `isGoodsCommerceEnabled()` (env `GOODS_COMMERCE_ENABLED`, default OFF) parked the _entire_ interest→checkout flow behind one flag, including the no-money interest-marking path.

**Scope:** split the flag's responsibilities. Gate **interest-marking** on the goods module (`canUseGoods(settings)`), keep **paid checkout** on `isGoodsCommerceEnabled()`.

- Un-park (gate on goods module): `src/app/[slug]/page.tsx:239` (`interestEligible`), `src/app/[slug]/actions.ts:282` (read `interests_json` on submit), `src/lib/addon-products.ts:56` (`getInterestEligibleProducts`).
- Stays parked (money): `src/app/request/[token]/page.tsx:105` (portal add-on checkout), `src/lib/addon-products.ts:110` (`getAddonProducts`).
- Verify the artist sees marked interests in the booking overview/detail and the Accept-time availability popup ("About your goods" decisions → approval email "ready for pickup") still fires off `booking_interests` presence (not gated on the money flag).

**Done when:** with `GOODS_COMMERCE_ENABLED` unset (parked), a client can still add goods to interest on the public Shop overlay; the artist sees them on the request and confirms availability on Accept; NO payable add-on appears in the customer portal; no money path is reachable. Tests cover the new gate split.

**Out of scope:** re-enabling paid goods checkout; the standalone Bio Page (FEAT-Bio).

### Slice 78b — Payment-system pass: deposit page + payouts (DT-12, DT-13) — H

**Goal:** a clean, on-brand, correctly-tested deposit + payout surface (the money path was not properly re-tested after the RS money-scope restructure).

**Scope:** redesign `/bookings/deposits` UI (cleaner layout, fix the orange-warning-on-bone off-brand treatment, align to bone/charcoal/mustard/rosa); review `/settings/payouts` alongside it as one Connect-onboarding → deposit → fee → refund → payout operation; walk the full workflow in test mode (Connect onboarding country, deposit intent with `application_fee`, payment split, refund, manual path). Founder-driven verification expected.

**Done when:** deposit page reads clean + on-brand; payouts reviewed; the end-to-end deposit money flow is verified in test mode; no off-brand warnings.

**Out of scope:** changing the fee model (3% is provisional, founder-owned); legal copy (counsel).

### Slice 78c — Waitlist artist-backend restructure (DT-5)

**Goal:** declutter the artist waitlist; clarify converted/dismissed states.

**Scope:** main waitlist view shows only active entries; move dismissed + converted into a collapsed "history" section (pick a clear name), expandable, greyed out. Relabel converted entries "added to requests" in the waitlist. In Requests, a converted-from-waitlist entry shows a "waitlist request" chip in the same color as the "request" chip.

**Done when:** main view lists only active; history collapses/expands; converted/dismissed visually de-emphasized; requests chip reflects waitlist origin.

### Slice 78d — Onboarding/viewport + booking-settings polish (DT-1, DT-15)

**Scope:** DT-1 — onboarding intro slides (`onboarding/welcome/welcome-slides.tsx`) + `/onboarding/done` must fit the first viewport (no top cutoff) on all devices. DT-15 — add icons + reduce clutter on `/bookings/settings` for scannability.

**Done when:** intro + done render fully in the first viewport at phone/tablet/desktop; booking settings is easier to scan with section icons.

### Slice 78e — Analytics calendar (DT-4)

**Scope:** render a calendar in the "Requests per Month" section, each day showing its request count (heatmap-style). (Detailed per-day drilldown = DT-4b, FUTURE — founder will prompt.)

**Done when:** the requests-per-month section shows a per-day calendar with counts; no regressions to existing analytics.

### Slice 78f — Flash edit-in-modal (DT-16)

**Scope:** flash item edit + new use a modal (matching the goods/guest-spots modal style), not a subpage. (DT-16b — modal-everywhere backend principle — FUTURE.)

**Done when:** editing/creating a flash item happens in a modal overlay; no full-page navigation for item edit; parity with the existing quick-create modal styling.

### Deferred to future prompts (not in Slice 78)

- **FEAT-Bio** — standalone Linktree-style per-artist link page (full prompt pending).
- **DT-4b** — detailed/per-day analytics drilldown.
- **DT-16b** — modal-everywhere artist-backend editing principle.

---

## Slice 79 — Deposit payouts via Custom Connect (no artist Stripe signup) [MVP pivot 2026-06-04]

**Founder pivot (2026-06-04):** artists must NOT be forced through a Stripe-branded signup (the friction Express creates). Founder's first framing was "money goes to Inklee, held, then forwarded to the artist on the appointment date" — that's escrow / money-holding, which is regulated (PSD2 / payment-institution licensing / safeguarding) and makes Inklee merchant of record (VAT + chargeback liability). **Rejected for MVP.** Chosen instead: **Stripe Connect Custom accounts** — the artist provides identity + bank data inside Inklee's own UI and never visits Stripe, but money still routes straight to the artist (artist stays merchant of record, no Inklee escrow). Keeps the LO-2 posture; achieves the no-signup goal.

**Honest KYC reality:** "provide account data" is NOT just an IBAN. To pay anyone out, Stripe must verify identity, so Inklee will collect (in-app): legal name, DOB, address, IBAN, ToS acceptance, and sometimes an ID document. Custom also shifts more dispute/negative-balance/compliance burden onto Inklee than Express. There is no lighter legal path to "artist gets paid."

**Scope:**

1. Stripe dashboard (founder): enable Custom accounts + platform loss-liability settings.
2. `createConnectAccount` (`src/lib/stripe-connect.ts`): `type: "express"` → `"custom"`, add `tos_acceptance` (date + ip) + `business_type`; drop the hosted `accountLinks` onboarding redirect.
3. In-app onboarding form on `/settings/payouts`: collect individual KYC + `external_account` (IBAN) → `accounts.update`; render Stripe `requirements.currently_due` so missing fields surface; handle verification pending/failed states.
4. ID-document upload path (Stripe file upload) when requirements demand it.
5. Charge flow UNCHANGED: destination charge + `on_behalf_of` + 3% `application_fee` (`platform-fee.ts` untouched). Payouts enable once verified.
6. Payout timing: default standard schedule (compliant). "Hold until appointment date" DEFERRED — reintroduces the money-holding/safeguarding concern; open decision.

**Done when:** an artist can become payout-ready entirely inside Inklee (no Stripe redirect); a test-mode deposit routes to the connected account with the 3% split; verification states surface cleanly.

**Owner:** Founder + Claude — JOINT session (needs Stripe test mode + dashboard config + product calls on individual-vs-company default + countries). Not solo-shippable: a money path must be built + verified in test mode, not blind.

**Counsel:** re-confirm that Custom + Inklee-as-platform keeps the artist as merchant of record and does NOT make Inklee a payment intermediary (lighter than the rejected escrow model, but confirm). Folds into the open questions in `docs/payment-flow-for-counsel.md`.

**STRICT MONEY WALL + LAZY KYC (founder principle, 2026-06-04).** Flipping the Stripe platform profile to platform-controlled (Custom) only grants _permission_; it must NOT pull any artist into KYC/liability by default. Hard rule: **no Connect account, no KYC, no Inklee liability exposure for an artist until they explicitly enable deposit collection.** Crossing that wall (opting into deposits) is what triggers `createConnectAccount` + the in-app KYC onboarding, which gates deposit activation (no KYC ⇒ no in-app deposits, manual fallback only). Every free feature (booking, bio page, flash, guest spots, goods showcase, waitlist) stays entirely clear of Stripe/KYC/liability. Implementation: a single "is this artist payout-ready?" gate (extend `deriveConnectRouting`/`getConnectRoutingForArtist`) that all money-touching surfaces sit behind; account creation stays on-demand (never at signup/onboarding). Audit that nothing creates a Connect account or requests KYC outside the deposit opt-in path.

**⚠️ MARGIN RISK — FEATURE-LEVEL (checked against Stripe EU pricing 2026-06-04).** Stripe Connect costs for the Custom/destination model: card processing 1.5%+€0.25 (already modelled) **PLUS €2/month per _active_ connected account PLUS payout fee 0.25%+€0.10 (SEPA).** Inklee's keep per deposit = `1.5%·deposit − €0.25` (€0.50 on €50, €1.25 on €100, €2.75 on €200). Subtracting the €2/month + payout fee, **single-deposit-per-month artists are net-NEGATIVE below ~€157 deposit** (e.g. €100 deposit ⇒ ~−€1.10/mo). It only profits on multi-deposit or large-deposit artists. **Critical link: the €2/month + payout fee exist BECAUSE we chose Custom (no artist signup); Standard accounts have neither (Stripe bills the artist) but require the signup the founder rejected.** So "no signup" costs ~€2/active-artist/month, and the 3%-transaction-fee-alone model does NOT cover it for low-volume artists. **Resolution options (founder decision, launch-gating):** (1) subscription/plan fee covering the €2 + margin — most likely (this is why 3% was always "provisional pending stricter subscription model", D-d); (2) Standard accounts (kills the fee, reintroduces signup); (3) minimum-deposit floor (~€150, unrealistic); (4) higher % (~5–8%, too high). **Plumbing is model-agnostic — safe to build — but launch economics are gated on this decision. Founder flagged the whole feature "at risk" on the math.** Also confirm exact EE/EU numbers + any Inklee↔Stripe negotiated rate on the live Stripe pricing page before launch. Sources: stripe.com/connect/pricing.

**DECISION LOCKED 2026-06-04: Custom, all-in (founder).** Accept the €2/mo + payout fees + Inklee loss-liability for the no-signup UX; the **subscription layer is the assumed margin cover** (3% transaction fee stays provisional/secondary). Custom-vs-Standard settled in favour of Custom.

**Build approach — sandbox-first (NOT blind).** The `controller` config interacts with the fee model: `controller.fees.payer` decides who bears Stripe's processing fee, `controller.losses.payments` who eats negative balances — get these wrong and the 3% math silently breaks. So this is validated against the founder's Stripe sandbox, not written blind. Planned controller (to verify in sandbox): `controller.requirement_collection: "application"` (Inklee collects KYC, no Stripe UI), `controller.stripe_dashboard.type: "none"` (artist never sees Stripe), `controller.losses.payments: "application"` (Inklee liable), `controller.fees.payer` — **VERIFY**: must keep the artist bearing Stripe's processing fee to preserve the platform-fee.ts 3%-all-in math (likely paired with `on_behalf_of` retained on the charge). Planned KYC fields for an EE/DE **individual** account (confirm against live `requirements.currently_due`): legal first/last name, DOB, residential address, email, phone, IBAN (`external_account`), `tos_acceptance` (date+ip), and an ID document when Stripe escalates. Build steps unchanged from the Scope list above; ship gated on sandbox validation.

**✅ SANDBOX-VALIDATED 2026-06-04 (probe against test keys, account created + deleted):**

- **Working controller config** (artist never sees Stripe): `controller: { requirement_collection: "application", stripe_dashboard: { type: "none" }, losses: { payments: "application" }, fees: { payer: "application" } }` + `business_type: "individual"` + `capabilities: { card_payments, transfers }`. Stripe **rejects** `fees.payer: "account"` here ("when controlling requirement collection the application must also control losses, fees, and dashboard none").
- **CONSEQUENCE — fee model change:** because Custom forces `fees.payer: application`, **Inklee (platform) pays Stripe's processing fee**, not the artist. End economics identical (artist −3%, Inklee nets ~€2.75/€200) but `platform-fee.ts applicationFeeCents` must become the **FULL 3%** (`platformFeeCents`), since Stripe now deducts its fee from Inklee's platform balance separately rather than from the artist via `on_behalf_of`. **Verify the exact split with a real test deposit before trusting it.** Also re-check whether `on_behalf_of` is still wanted on the deposit PaymentIntent for MoR under this model.
- **Exact KYC fields (DE individual `requirements.currently_due`):** `individual.first_name`, `individual.last_name`, `individual.dob.{day,month,year}`, `individual.address.{line1,city,postal_code}`, `individual.email`, `individual.phone`, `external_account` (IBAN), `business_profile.mcc` (auto-fill, e.g. 7299), `business_profile.url` (auto-fill = artist's inkl.ee page), `tos_acceptance.{date,ip}` (captured on accept via `next/headers`). **No ID document up-front** (Stripe may escalate later → handle via `requirements`).

**Build sequence (foundation validated; build next):** (1) `createConnectAccount` → the validated Custom controller; (2) `updateConnectKyc` lib fn → `accounts.update` with individual + external_account + business_profile + tos_acceptance; (3) in-app KYC form on `/settings/payouts` (artist-facing fields above) + `submitConnectKycAction`; (4) replace the Stripe-hosted `accountLinks` redirect with the in-app form; (5) render `requirements.currently_due` so missing fields surface. THEN the deposit-flow half: (6) change `platform-fee.ts` to full-3% application fee + (7) test-deposit in sandbox to verify the split + payout. Onboarding half (1–5) is independent of the fee math and testable on its own ("can an artist go payout-ready entirely in-app?").

**AGENT-REVIEW FINDINGS (2026-06-04, orchestrated read-only Discovery + Security passes) — fold into the build:**

- **C-1 [critical, Phase C]** `applicationFeeCents` formula wrong under `fees.payer:application` → change to full 3% (`platformFeeCents`) at `platform-fee.ts:71` + call sites `bookings/actions.ts:585,666`; update `platform-fee.test.ts` (will fail = correct signal); **verify with a real test deposit.**
- **C-2 [critical, tracked follow-up]** public `profiles` SELECT RLS (`0027`) exposes all `stripe_*` columns to anon. Mitigation now: KYC never stored in our DB; never `select("*")` profiles client-side. Proper fix = column-scoped policy (migration, founder-applied).
- **H-1 [Phase B]** `updateConnectKyc` sends KYC (name/DOB/address/IBAN) straight to Stripe; **never persist to our DB**, only the status sync.
- **H-2 [Phase B]** zero `console.*` of KYC form fields; Sentry on Stripe errors only.
- **H-3 [Phase A ✅]** shared `getClientIp()` created (`src/lib/get-client-ip.ts`) for `tos_acceptance.ip`.
- **H-4 [Phase B]** `syncConnectAccountAction`: short-circuit when status `unset`/`disabled`.
- **M-2 [Phase B]** pass `hasAccount: boolean` to the client, not the raw `acct_…` id.
- **M-4 [Phase A ✅]** server-only runtime guard added to `stripe-connect.ts` (skipped `stripe.ts` — it exports the client-safe publishable key + secret is env-null in browser).
- **M-5 [Phase A ✅]** Stripe vars added to `.env.example`.
- **M-3 [tracked]** retrofit `getClientIp()` onto login/forgot-password rate-limit keys (auth files — separate small pass).
- **L-1 [Phase B/C]** webhook: assert `event.account === account.id` before persist.
- **Discovery notes:** `/settings/payouts/{return,refresh}` routes + `createConnectOnboardingLink` go dead (delete/neutralize); `first_name`/`last_name` in DB (not Drizzle schema) usable as KYC pre-fill; remove the Express docs link at `payouts/page.tsx:117`; update `STATUS_DESCRIPTION` copy (pending now means "in-app KYC not submitted"); `prepareCheckoutAction` doesn't set `application_fee` (existing behavior, note for sandbox).

**Supersedes** the OT-12 Express onboarding (Slice 78b's deposit/payout UI work rolls into this).

### Slice 79 phases — shipped log

- **Phase A** (`3380a2a`) — orchestrator agent + pre-build hardening: `getClientIp()` (`src/lib/get-client-ip.ts`, H-3), server-only runtime guard on `stripe-connect.ts` (M-4), Stripe vars in `.env.example` (M-5).
- **Phase B** (`7a83854` + sandbox fixes `6707209`) — in-app Custom KYC onboarding: `createConnectAccount` → validated Custom controller (`requirement_collection: application`, `stripe_dashboard.type: none`, `losses.payments: application`, `fees.payer: application`), `updateConnectKyc` (`accounts.update`, KYC sent straight to Stripe, **never persisted** — H-1/H-2), in-app KYC form on `/settings/payouts` + `submitConnectKycAction`, hosted `accountLinks` redirect removed, `requirements.currently_due` surfaced. `hasAccount` boolean to client not the `acct_…` id (M-2), webhook asserts `event.account === account.id` (L-1).
- **Phase C** (`feb7fb8`) — fee model under Custom: because Custom forces `fees.payer: application`, **Inklee pays Stripe's processing fee**, so `applicationFeeCents` became the **full 3%** (`platformFeeCents`) at `platform-fee.ts` + call sites `bookings/actions.ts` (C-1). `platform-fee.test.ts` updated. End economics unchanged (artist −3%, Inklee nets ~€2.75/€200) but the split now happens on Inklee's platform balance, not via `on_behalf_of` deduction.

### Slice 79d — multi-currency deposits ✅ build done (verification + deploy pending)

Non-eurozone artists are charged/settled in their own currency (no FX at payout). EUR artists fully unchanged — everything defaults to `eur`.

- **79d.1** (`6316102`) — foundation: migration **0044** `booking_requests.deposit_currency` (text, default `'eur'`); `artistDepositCurrency()` = the artist's Connect-country currency when connected, else `eur` (manual deposits carry no FX); `requestDeposit` derives the currency, charges the PaymentIntent in it, stores it on the booking (create + reuse paths). 3% fee is currency-agnostic.
- **79d.2-3** (`06bf436`) — customer portal + artist deposit display thread `deposit_currency`: portal page loads it; `DepositPaymentForm`/`AddonsCheckout`/fallback format with it (Stripe Elements derives currency from the PaymentIntent — no widget change); request-detail deposit amount + refund line + `DepositRefundButton` format with it.
- **79d.3-4** (`670c6e2`) — preview line + all emails: status-actions deposit-request amount prefix + "you receive" fee preview use the artist's currency (threaded from request-detail page); all deposit emails (requested, client receipt, artist paid, overdue customer + artist) take + format a currency; callers pass it (`requestDeposit`/`notifyDepositRequested`, webhook from `intent.currency`, cron + manual reminders from `booking.deposit_currency`); deposit-settings max-amount message made currency-neutral.

**State:** `typecheck` + `lint` (0 errors) clean, **284 tests green**. 2 commits unpushed to `origin/payment-stripe`.

**Remaining (founder-gated, money path — not solo-shippable):**

1. **Founder must apply migration 0044** in Supabase (`booking_requests.deposit_currency`).
2. **Verification in Stripe sandbox** — an EUR test deposit (must be behaviourally identical to before) + a non-EUR test deposit (e.g. a non-eurozone Connect country) routing to the connected account with the full-3% split, confirming currency renders correctly across portal / artist display / emails. This is the C-1 "verify with a real test deposit" check rolled together with 79d.
3. **Deploy** to prod once verified.
