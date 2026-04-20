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
