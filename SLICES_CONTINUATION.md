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
