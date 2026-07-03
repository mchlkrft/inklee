# In-platform support ticket system

Shipped 2026-07-04. Logged-in artists open structured support tickets at `/support` and continue the conversation inside Inklee; admins triage and reply from `/admin/support`. Email is a notification layer only — no conversation content ever leaves the platform.

## Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/support` | authenticated artists (`(artist)` group shell) | intro, FAQ, structured request form, own-ticket list with unread badge |
| `/support/[ticketId]` | ticket owner | full thread, structured report, reply form; closed tickets are read-only |
| `/admin/support` | admins (`requireAdmin`) | inbox: filters (status/category, default "Needs attention"), sort (last activity / oldest unanswered / newest), search (reference/subject/artist/email) |
| `/admin/support/[ticketId]` | admins | metadata, artist account link, full thread incl. internal notes, reply + status controls |

Navigation: "Support" in the artist sidebar Tools group (`nav-config.ts`); admin reaches the inbox via the support summary card on the `/admin` dashboard (there is no admin nav shell — the dashboard is the hub, matching the existing pattern).

## Data model (migration `0057_support_tickets.sql`, applied to prod 2026-07-04)

- `support_tickets` — the structured request lives on the ticket row (subject, category, description, expected/actual behavior, optional reproduction steps / relevant area / device / platform / context), NOT duplicated as a first message. Status text + CHECK: `open | awaiting_support | awaiting_artist | resolved | closed` (default `awaiting_support`). Timestamps: `last_artist_reply_at`, `last_admin_reply_at`, `artist_seen_at` (unread derivations), `resolved_at`/`closed_at` describe the CURRENT state (cleared on leaving it).
- `support_ticket_messages` — `author_role` artist|admin, `visibility` public|internal (internal notes), `author_id → auth.users ON DELETE SET NULL` (admins may lack a profiles row). Cascade: profile deletion removes tickets + messages (GDPR-consistent).
- Reference `INK-<n>`: `DEFAULT ('INK-' || nextval('support_ticket_ref_seq'))`, sequence starts 1001 — race-safe, unique by constraint, never derived in app code.

## Authorization

- **RLS**: artists can SELECT their own tickets and the PUBLIC messages on them. No write policies exist — every mutation goes through `lib/server/support.ts` on the service role after explicit authorization, so clients can never forge status, timestamps, author attribution, or see internal notes. Artist ownership is re-checked in the core (`eq("artist_id", ...)`) on every artist mutation; admin actions gate on `getAdminId()` (ADMIN_EMAILS + MFA step-up, fail-closed).
- Artist pages read through the user-scoped client (RLS does the filtering; a foreign ticket id 404s). Admin pages read through `serviceClient` after `requireAdmin()`, like the rest of `/admin`.

## Status behavior (single-sourced in `lib/support.ts`, unit-tested)

Artist reply → `awaiting_support` (reopens resolved tickets; closed = read-only). Admin public reply → `awaiting_artist` unless the admin picked a status in the same action. Admins can set any status; resolve/close notify the artist. Internal notes never change status and never notify.

## Notifications

- **Email** (existing Resend `sendEmail` + branded `renderEmailShell`; templates in `lib/email/support-templates.ts`): ticket created → `support@inklee.app` (reply-to artist) + artist confirmation; artist reply → support inbox; admin reply → artist; resolve/close without reply → artist. One email per action (a reply that also resolves sends only the reply email). All sends are wrapped in `safeNotify` — failures log to console/Sentry-path but never roll back a persisted ticket/reply (persist first, notify after).
- **In-app + push**: admin replies also `createNotification` (new type `support_reply`, category `info`) so the bell + Android push fire via the existing pipeline.
- **Unread**: artist side = `last_admin_reply_at > artist_seen_at` (stamped when the artist opens the ticket page); admin side = `last_artist_reply_at > last_admin_reply_at`. No read-receipt/presence machinery.

## Consistency

Safe sequencing instead of a DB transaction (house style, no RPCs for writes): message insert first; ticket bookkeeping second (a failure there is logged — the stale status self-heals on the next action); notifications last and non-blocking. A ticket cannot exist without its required structured fields (NOT NULL + validation in `validateTicketInput`).

## Tests

`src/lib/__tests__/support.test.ts` (status machine, attention/unread, validation, reference format, labels — 14) + `src/lib/email/__tests__/support-templates.test.ts` (content, deep links, HTML escaping, no-body-in-email invariant — 5). Route-level authorization is enforced by RLS + the shared guards and covered by the existing conventions; no integration-test harness exists in the repo (Playwright config is present but no support E2E was added — candidate follow-up).

## Deferred (documented, not built)

- **Attachments/screenshots** — the safe upload path exists (`processAndUpload`), but the `logos` bucket is public-URL readable; support screenshots may contain sensitive data and belong in a private bucket with signed URLs (the booking-images pattern). Deferred until that is wired.
- **Assignment** (`assigned_admin_id`) — single-admin operation today; add the column + filter when a second admin exists.
- **Message editing** (`updated_at` on messages), SLA automation, satisfaction scoring, email ingestion — out of scope by design.
- **Privacy policy**: support tickets are a new personal-data category (ticket content, device info). The privacy page should mention it at the next counsel-reviewed edit — do not edit counsel-cleared copy silently.

## UI audit (2026-07-04, same-day follow-up)

- **New shared `components/select-input.tsx`** — brand-styled select replacing native `<select>` chrome, following the `DateInput` precedent (custom popover: bone surface, mustard selected check, rounded, flip-up). WAI-ARIA listbox pattern: full keyboard support (arrows, Home/End, Enter/Space, Escape, first-character typeahead), `aria-activedescendant`, native-form-compatible API via an sr-only input. Adopted across all six support dropdowns; available for app-wide adoption (the other ~14 native selects are a follow-up).
- **Status chips aligned to the platform StatusBadge rule** (solid brand fills, not tints): awaiting artist = mustard (your turn), open/awaiting support = rosa (waiting on Inklee), resolved = green, closed = muted. Same chip now used in the admin inbox + detail header.
- **Nav placement (founder call):** Support is the LAST sub-item of Settings (sidebar `nav-config.ts`, Settings `match` includes `/support`) and the last tab in `settings-nav.tsx` — not a standalone Tools item.
- UX fixes: FAQ uses a rotating lucide chevron with hover + focus-visible ring; admin replies in the artist thread carry a mustard left accent; the internal-note toggle disables the status picker and relabels the composer/button; admin inbox subjects are links and rows have hover states; created-banner announces via `role="status"`.

## Ops

No new env vars. `support@inklee.app` must exist as a real mailbox (it is already the imprint/DSA contact). Migration 0057 was applied + verified via the Management API and recorded in `schema_migrations`.
