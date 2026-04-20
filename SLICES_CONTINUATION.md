# Slices 11-18

This document continues [SLICES.md](A:\WORK\inklee\SLICES.md), which currently stops at slice 10. The slices below were reconstructed from committed repo history so the documented roadmap matches the codebase again.

Important: slices 15-17 introduce deposit/payment and automation work that drift beyond the original post-slice-10 guardrail in `SLICES.md`. Treat this as a historical record of what was built, not as retroactive approval of that scope change.

---

## Slice 11 - Custom field builder + observability foundations

**Goal:** Artists can define custom booking questions, and the app gains basic observability and launch scaffolding.

**Scope:**

- Add `custom_fields` table + migration and wire active fields into public booking form submission
- Build `/settings/fields` with create/edit/list flows for custom fields
- Render custom fields on `/[slug]` and validate/store submitted answers
- Add Sentry client/server/instrumentation wiring
- Add metadata/icon scaffolding and testing foundations (`vitest`, `playwright`)
- Harden cleanup cron and general launch scaffolding

**Done when:** Artists can manage custom questions, customers can answer them on the public form, and errors can be captured in Sentry.

**Out of scope this slice:** Standard-field toggles, deposits, reminders, client CRM.

**Primary evidence in git history:** `0d10d57 feat: custom field builder, Sentry, cron hardening, metadata, tests`

**Smoke test:** Add a required custom field, submit a booking that includes it, verify the answer is stored on the booking, and confirm Sentry/test scaffolding builds cleanly.

---

## Slice 12 - Custom-field hardening and production safety

**Goal:** The new custom-field system is safe enough for production use.

**Scope:**

- Tighten validation and production-safety checks around custom fields
- Refine builder UX around field keys and dangerous input patterns
- Close edge cases discovered after slice 11 rollout

**Done when:** Custom fields behave predictably under real production input and no longer rely on hidden/internal builder concepts.

**Out of scope this slice:** Form builder UX overhaul, deposits, reminders.

**Primary evidence in git history:** `e39bc9d feat: slice 12 — custom-field hardening and production safety`, `dc449b1 ui: hide custom field key from builder UI`

**Smoke test:** Create, edit, and submit with multiple custom fields, including invalid inputs, and confirm the UI surfaces handled errors instead of saving bad config.

---

## Slice 13 - Launch hardening and production readiness

**Goal:** The app is safer and more complete for real-world launch usage.

**Scope:**

- Add Playwright E2E coverage for the three critical booking flows
- Finalize metadata assets (apple icon, open graph) and related production polish
- Add test helpers and CI-friendly local web-server config
- Finish remaining launch-readiness gaps carried over from slice 10

**Done when:** Critical flows are covered by runnable E2E tests and the app has launch-grade metadata/prod scaffolding.

**Out of scope this slice:** Deposits, reminders, CRM features.

**Primary evidence in git history:** `c80fbc2 feat: slice 13 — launch hardening and production readiness`

**Smoke test:** Run the three Playwright critical-path tests locally against a seeded artist and confirm they pass.

---

## Slice 14 - Booking form builder UX and standard-field toggles

**Goal:** Artists can control which standard fields appear on the public booking form, not just add custom ones.

**Scope:**

- Add standard-field toggles/settings in `/settings/fields`
- Add form-settings persistence/parsing
- Update public booking form rendering to respect standard-field visibility/required settings
- Refine booking-form-builder UX to feel cohesive with custom fields

**Done when:** Artists can configure both custom fields and key standard-form behavior from one settings area.

**Out of scope this slice:** Deposits, reminders, CRM.

**Primary evidence in git history:** `c33c380 feat: slice 14 — booking form builder UX and standard-field toggles`

**Smoke test:** Toggle a standard field off, refresh the public booking page, and confirm it disappears or changes requiredness as configured.

---

## Slice 15 - Deposit system foundation

**Goal:** Deposit-related state exists in the data model and dashboard UI, without full payment collection yet.

**Scope:**

- Add deposit-related columns/migrations to bookings
- Extend dashboard request detail/actions for deposit states
- Surface deposit context in customer portal

**Done when:** A booking can carry deposit amount/status metadata and the artist UI understands deposit-pending workflows.

**Out of scope this slice:** Live Stripe payment collection and webhook processing.

**Primary evidence in git history:** `8048683 feat: slice 15 — deposit system foundation`

**Smoke test:** Mark a booking deposit-related in the dashboard and confirm the new status/data is visible in both artist and customer views.

---

## Slice 16 - Stripe deposit payment integration

**Goal:** Customers can pay a booking deposit and the booking updates automatically.

**Scope:**

- Add Stripe client/server dependencies and config
- Build deposit payment UI in customer portal
- Add Stripe webhook route to reconcile successful payment intents
- Update booking status/token lifecycle after successful deposit payment

**Done when:** A successful Stripe payment updates the booking, writes audit state, and triggers the correct customer email.

**Out of scope this slice:** Reminder automation, CRM/history.

**Primary evidence in git history:** `3c083da feat: slice 16 — Stripe deposit payment integration`

**Smoke test:** Complete a test-mode Stripe deposit payment and confirm the webhook marks the booking approved/deposit-paid as expected.

---

## Slice 17 - Reminder and reconfirmation automation

**Goal:** The system can proactively remind customers and artists about upcoming or overdue booking states.

**Scope:**

- Add cron-driven reminder route
- Send deposit-overdue reminders
- Send appointment reminders
- Send reconfirmation emails with refreshed magic links
- Record reminder sends in audit log to avoid duplicate sends

**Done when:** Scheduled reminder jobs can run idempotently and emit the correct reminder emails.

**Out of scope this slice:** Deeper CRM/history features.

**Primary evidence in git history:** `6e9cb4f feat: slice 17 — reminder and reconfirmation automation`

**Smoke test:** Trigger the reminder route with the cron secret in a seeded environment and confirm reminder emails/audit log entries are created once per booking state.

---

## Slice 18 - Client history basics

**Goal:** Artists get a lightweight customer history view inside the dashboard.

**Scope:**

- Add clients list page grouped by customer email
- Add per-client detail page with notes/history basics
- Add schema/migration support for client notes
- Link client history into artist dashboard navigation

**Done when:** An artist can browse repeat customers, inspect basic history, and save notes tied to that client.

**Out of scope this slice:** Full CRM pipeline, tags, segmentation, analytics.

**Primary evidence in git history:** `df6d0de feat: slice 18 — client history basics`

**Smoke test:** Create multiple bookings for the same customer email and confirm the clients dashboard groups them correctly and opens a detail page with notes/history.

---

## Roadmap realignment — 2026-04-20

### Production state at realignment

- Slices 0–18 are committed and deployed to inklee.app (Frankfurt region).
- All migrations `0000–0009` are applied; `supabase db push --dry-run` confirms production is current (see AGENTS.md).
- Vercel Cron configured in `vercel.json` for cleanup (`0 3 * * *`) and reminders (`0 9 * * *`).
- Resend verified, rate limiting active, Sentry wired.
- **Stripe is code-complete but not production-activated.** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` are absent from `.env.example` and Vercel. Deposit payment UI degrades silently. This is addressed in Slice 17 below.

### Numbering reconciliation

The planned slice package (13–22) below inserts Slice 15 (public artist profile essentials) as new scope that was missing from the historical record. This shifts the numbering of deposit/payment/reminder/client-history relative to their git commit messages (`feat: slice 15`, `feat: slice 16`, etc.). The git history is authoritative for what was built; this document is authoritative for the intended roadmap numbering going forward.

| New number | Historical number | Name                                        | Status                                  |
| ---------- | ----------------- | ------------------------------------------- | --------------------------------------- |
| 13         | 13                | Launch hardening + production readiness     | completed                               |
| 14         | 14                | Builder UX, presets, standard-field toggles | completed                               |
| **15**     | —                 | **Public artist profile essentials**        | **pending**                             |
| 16         | 15                | Deposit system foundation                   | completed                               |
| 17         | 16                | Deposit payment integration                 | code complete, not production-activated |
| 18         | 17                | Reminder and reconfirmation automation      | completed                               |
| 19         | —                 | Waitlist core                               | pending                                 |
| 20         | —                 | Books-open / wave booking mode              | pending                                 |
| 21         | —                 | Guest spot / travel mode                    | pending                                 |
| 22         | 18                | Client history lite                         | completed                               |

---

## Planned slice package: 13–22

---

### Slice 13 — Launch hardening and production readiness

**Status:** completed (`c80fbc2`)

**Goal:** Critical booking flows are covered by E2E tests and the app has launch-grade metadata and production scaffolding.

**Scope:**

- Playwright E2E for three critical paths: submit→approve→emails, submit→reject→email, artist cancel→customer notified
- Metadata assets: apple-touch-icon, open graph image, favicon
- Production scaffolding polish carried over from Slice 10
- CI-friendly local web-server config for E2E

**Out of scope:** Custom field builder (Slice 14), deposits, reminders.

**Dependencies:** Slices 0–12.

**Acceptance criteria:**

- Three Playwright tests pass locally against a seeded artist
- Social previews render correctly (OG image, title, description)

---

### Slice 14 — Builder UX, presets, and standard-field toggles

**Status:** completed (`c33c380`, `dc449b1`)

**Goal:** Artists can configure which standard fields appear on the booking form and manage custom fields from one coherent settings area, without seeing internal implementation details.

**Scope:**

- Standard-field toggles (show/hide reference link, image upload, description required, etc.)
- Form settings stored in `profiles.settings.form_settings` JSONB
- Public form respects field visibility/required settings
- Custom field internal key hidden from builder UI
- Builder UX refined to feel cohesive (custom + standard fields from one screen)

**Out of scope:** Presets as saved templates (v0.1), deposit, waitlist.

**Dependencies:** Slice 11 (custom field builder foundation).

**Acceptance criteria:**

- Toggle a standard field off → disappears or changes requiredness on public form
- Custom field key not visible to the artist in the builder UI

---

### Slice 15 — Public artist profile essentials

**Status:** pending — partially addressed (location + bio render on public page; Instagram handle does not; no books-open state)

**Goal:** The public booking page surfaces the artist's identity clearly so customers know whose form they're submitting to.

**Scope:**

- Display `instagram_handle` on public `/[slug]` page (e.g. `@handle` as a subtle link or label)
- `location` and `bio` already render — audit and refine the layout so the profile header feels complete
- If `booking_mode = fixed_slots` and no open slots exist, show a clear "books are currently closed" state (no raw empty form)
- Graceful omission: if any profile field is empty, the element is not rendered (no blank placeholders)
- No structural changes to the booking form itself

**Out of scope:** Full artist portfolio/gallery page, custom branding, follower counts, books-open toggle (Slice 20), travel context (Slice 21).

**Dependencies:** Slice 3 (profile fields exist), Slice 4 (public page exists), Slice 9 (slot mode).

**Acceptance criteria:**

- Instagram handle visible on public page when set
- Artist with no handle: handle element is absent (not blank)
- Artist with `fixed_slots` mode and zero open slots: public page shows "books are currently closed" and not an empty slot picker
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 16 — Deposit system foundation

**Status:** completed (historical Slice 15, `8048683`)

**Goal:** Bookings can carry deposit amount, due date, and note; artist and customer views understand the deposit-pending state.

**Scope:**

- `deposit_amount`, `deposit_due_at`, `deposit_note` columns on `booking_requests`
- Artist dashboard: set deposit amount/due date when marking deposit pending
- Customer portal: deposit amount and due date visible in booking summary
- No payment collection in this slice

**Out of scope:** Stripe, payment UI, deposit reminders (Slice 18).

**Dependencies:** Slice 5 (dashboard), Slice 8 (customer portal).

**Acceptance criteria:**

- Artist can set deposit amount and due date on a `deposit_pending` booking
- Customer portal shows the deposit details clearly

---

### Slice 17 — Deposit payment integration

**Status:** code complete (historical Slice 16, `3c083da`); **not production-activated**

Stripe env vars (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`) are absent from `.env.example` and not set in Vercel. The deposit payment UI degrades silently without them.

**Goal:** Customers can pay a booking deposit via Stripe; the booking updates automatically after payment.

**Scope:**

- Add the three Stripe env vars to `.env.example` with placeholder values
- Configure env vars in Vercel (test-mode keys first)
- Register `https://inklee.app/api/stripe/webhook` in Stripe dashboard; copy signing secret to Vercel
- Verify deposit payment form renders for a `deposit_pending` booking
- Stripe test payment on the live app: webhook fires → booking status updates → audit log written
- Graceful degradation confirmed: without keys, deposit tracking still works, payment form not shown

**Out of scope:** Stripe live mode (real charges — v0.1 decision), Stripe Connect, additional email templates for payment.

**Dependencies:** Slice 16.

**Acceptance criteria:**

- `.env.example` documents all three Stripe vars with placeholder values
- Stripe test payment on production app succeeds end-to-end
- Webhook processes `payment_intent.succeeded`, updates booking, writes audit log entry
- No console errors during the payment flow

**Smoke test:** Mark a booking `deposit_pending`. Follow magic link as customer. Payment UI loads. Use Stripe test card. Confirm payment. Dashboard shows updated booking status. Stripe dashboard shows succeeded intent. Audit log has the entry.

---

### Slice 18 — Reminder and reconfirmation automation

**Status:** completed (historical Slice 17, `6e9cb4f`); cron scheduled in `vercel.json` at `0 9 * * *`

**Goal:** The system proactively reminds customers and artists about overdue deposits, upcoming appointments, and bookings needing reconfirmation.

**Scope:**

- Cron-driven `/api/cron/reminders` route (already scheduled in `vercel.json`)
- Deposit-overdue reminders to customer and artist
- Appointment reminders ahead of the booked date
- Reconfirmation emails with refreshed magic links
- Idempotent: audit log records reminder sends to prevent duplicates

**Out of scope:** SMS, push notifications, custom reminder timing per artist (v0.1).

**Dependencies:** Slice 6 (email), Slice 16 (deposit).

**Acceptance criteria:**

- Reminder route triggers correct emails per booking state
- Audit log prevents duplicate sends on re-run
- No reminder sent for cancelled bookings

---

### Slice 19 — Waitlist core

**Status:** pending — not yet implemented

**Goal:** When books are closed or a booking round is full, customers can join a waitlist; artists can review and convert entries into booking requests.

**Scope:**

- New `waitlist_entries` table: `id`, `artist_id` (FK), `customer_email`, `customer_handle`, `note` (optional, short), `status` (enum: `waiting | contacted | converted | dismissed`), `created_at`
- Migration for the new table with RLS (artist reads own entries; public inserts)
- Waitlist form shown on public `/[slug]` when books are closed (Slice 20 controls the closed state; this slice can stub it behind a dev flag or a manual DB toggle for now)
- Waitlist form fields: email (required), Instagram handle (required), brief note (optional, 280 char max)
- Rate limit waitlist submissions per IP (reuse Upstash pattern from booking form)
- Customer receives a confirmation email on waitlist submission ("we'll be in touch when books open")
- `/dashboard/waitlist` list view: handle, email, note, submitted date, status badge
- Artist actions: mark contacted, convert to booking request (creates a `booking_requests` row with `origin = 'artist_created'`, `status = 'approved'`), dismiss
- Convert action emails the customer with magic link (reuses `artist-booking-created` email template)

**Out of scope:** Automatic conversion without artist action, public waitlist position display, priority ranking, waitlist capacity limits (v0.1).

**Dependencies:** Slice 4 (form patterns, rate limiting), Slice 5 (dashboard patterns), Slice 6 (email), Slice 20 (books-closed state that surfaces the form — can stub for development).

**Acceptance criteria:**

- Customer submits waitlist form when books are shown as closed
- Entry appears in artist dashboard with correct status
- Artist converts entry → a booking request row is created, customer receives email with magic link
- Artist dismisses entry → status updates, no email sent
- Duplicate submission from same email within 24h is rate-limited or deduplicated
- RLS: artist can only see their own waitlist entries

---

### Slice 20 — Books-open / wave booking mode

**Status:** pending — not yet implemented

**Goal:** Artists can explicitly open and close their books, cap the number of submissions per window, and show the current state publicly — so wave-style booking rounds are a first-class feature.

**Scope:**

- New fields on `profiles.settings` (JSONB): `books_open` (boolean, default true), `booking_cap` (nullable int), `booking_window_ends_at` (nullable timestamptz), `books_closed_message` (nullable text, 280 char max)
- No new table required — all state lives in `profiles.settings`
- `/settings/books` route: toggle open/close, set optional cap, set optional window end date, set optional closed message
- Public `/[slug]` page reads booking state and renders accordingly:
  - **Open, no cap or cap not reached:** show form normally
  - **Open, cap reached:** "this round of bookings is full" + waitlist form (Slice 19)
  - **Closed:** artist's closed message (or default "books are currently closed") + waitlist form (Slice 19) + optional re-open date if `booking_window_ends_at` is set
- Cap enforcement: server-side, count `pending` + `approved` + `deposit_pending` requests against cap on each submission; reject if over
- Artist dashboard header/nav: shows current books state (open / closed / capped) with a quick-toggle button
- When `booking_window_ends_at` passes, treat as closed (server-side check, no cron needed — evaluated at request time)

**Out of scope:** Scheduled auto-open at a future time (v0.1), per-style or per-placement caps, public countdown timer (v0.1), email blast to waitlist on books-open (v0.1).

**Dependencies:** Slice 4 (public form), Slice 9 (slot mode — slot exhaustion is a separate closed state), Slice 19 (waitlist form shown in closed state).

**Acceptance criteria:**

- Artist closes books → public page shows closed message and waitlist form instead of booking form
- Artist sets cap of 10 → 11th submission is rejected server-side; public page shows "full" state
- `booking_window_ends_at` in the past → treated as closed without any artist action
- Dashboard shows current books state with a one-click toggle
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 21 — Guest spot / travel mode

**Status:** pending — not yet implemented

**Goal:** Artists can create city/date-specific booking contexts for guest spots or travel legs; customers booking during that window see the trip context, and the artist can filter their dashboard by leg.

**Scope:**

- New `travel_legs` table: `id`, `artist_id` (FK), `city` (text), `country` (text), `studio_name` (optional), `starts_on` (date), `ends_on` (date), `description` (optional, 500 char max), `is_active` (boolean, default true), `created_at`
- RLS: artist owns their own legs
- Migration for the new table
- `/settings/travel` route: create/edit/list travel legs (date range, city, country, optional studio name and description)
- Active travel leg displayed on public `/[slug]` page (city, dates, studio name if set) — shown as a contextual header below the artist identity block
- If multiple legs are active simultaneously (edge case), show the one with the earliest `starts_on`
- `booking_requests` gains `travel_leg_id` (FK nullable) — new migration
- On form submission, server action resolves the active travel leg (if any) and stores the FK on the booking row
- Artist dashboard: filter/group requests by travel leg (select dropdown, defaults to "all")
- Leg marked `is_active = false` after `ends_on` passes (evaluated at request time, no cron needed)

**Out of scope:** Public travel schedule / upcoming dates page (v0.1), multi-leg booking form, geo-detection, Instagram location tag integration (hard rule: no Instagram API), per-leg booking caps (use Slice 20 books-open for that).

**Dependencies:** Slice 3 (artist profile), Slice 15 (public profile header layout), Slice 5 (dashboard filter patterns).

**Acceptance criteria:**

- Artist creates a travel leg "Amsterdam, May 10–14, Tattooist Studio"
- During those dates, public page shows the travel context above the form
- Submitted booking row has `travel_leg_id` set
- Artist can filter dashboard to show only bookings for that leg
- Outside the date range, travel context is not shown
- `pnpm typecheck` and `pnpm lint` pass

---

### Slice 22 — Client history lite

**Status:** completed (historical Slice 18, `df6d0de`)

**Goal:** Artists can browse repeat customers, inspect their booking history, and save notes tied to a client — without a full CRM.

**Scope:**

- `/dashboard/clients` list grouped by customer email
- Per-client detail page: past bookings, notes, basic history
- `client_notes` schema/migration
- Dashboard nav link

**Out of scope:** Tags, segmentation, analytics, CRM pipeline, email blast to client list.

**Dependencies:** Slices 4, 5.

**Acceptance criteria:**

- Multiple bookings for the same customer email are grouped on the clients page
- Detail page shows history and allows note-saving
- Dashboard nav reaches the clients area

---

## MVP phase boundary

The slices above (13–22) constitute the MVP path. When Slice 22 is complete and the full booking lifecycle has been validated end-to-end on the live app with a real customer, the MVP phase is over.

**After the MVP slices are completed, the MVP phase ends.**

**Work on v0.1 begins after MVP.**

v0.1 is a separate planning phase. Do not scope v0.1 features until the MVP is validated and real artist feedback exists. Resist adding chat, custom branding, multi-language, SMS, recurring slots, or analytics until usage demands it.
