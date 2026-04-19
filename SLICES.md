# Build Plan

Eleven slices (zero-indexed). Each slice ends in a runnable, smoke-tested increment. Do not skip smoke tests. Do not start slice N+1 until slice N is green.

Each slice lists: **goal**, **scope**, **done when**, **out of scope for this slice**, **opening prompt** for Claude Code, and a **smoke test**.

---

## Slice 0 — Workspace setup (half day, human-only)

**Goal:** Repo, accounts, local dev environment ready.

**Scope:**
- Confirm `inklee.app` is available (domain + trademark quick check via EUIPO + USPTO)
- Register `inklee.app` (All-inkl is fine as registrar; DNS will point to Vercel)
- Create GitHub repo `inklee` (public)
- Drop `CLAUDE.md`, `DECISIONS.md`, `SLICES.md` at repo root
- Create Supabase project, region Frankfurt
- Create Vercel project, EU region, linked to GitHub repo
- Create Resend account, add `inklee.app` sending domain (don't verify yet — slice 6)
- Create Upstash account for rate limiting (free tier)
- Install Node LTS, pnpm, Claude Code CLI locally
- Store all API keys in a password manager (1Password, Bitwarden)
- `.env.example` committed with all env var names and placeholder values

**Done when:** Every account exists, keys are stored safely, repo has the three foundation docs.

**Smoke test:** Visit each service dashboard and confirm project exists. Run `pnpm --version` and `claude --version` locally.

---

## Slice 1 — Skeleton + design tokens

**Goal:** Next.js app renders a landing page with the full design system wired up.

**Scope:**
- `pnpm create next-app` with TypeScript, Tailwind, App Router, `src/` directory, ESLint
- Install and initialize shadcn/ui with the neutral theme
- Replace default colors with the Inklee palette in `globals.css` as CSS variables (see CLAUDE.md)
- Dark mode default, light mode toggle via `class` strategy
- Install Inter and JetBrains Mono via `next/font/google`
- Configure `tailwind.config.ts` tokens to reference the CSS variables
- Landing page: Inklee wordmark, one tagline ("booking requests without the DM chaos" or similar), a "sign up" button (non-functional), footer with Terms / Privacy / Impressum placeholder links
- Prettier, Husky pre-commit hook running typecheck + lint
- Basic README pointing to the three foundation docs

**Done when:** Landing page renders, looks roughly Cal.com-shaped, typecheck + lint pass, dark/light toggle works.

**Out of scope this slice:** Authentication, database, any business logic.

**Opening prompt:**
> Read CLAUDE.md, DECISIONS.md, and SLICES.md. We're starting Slice 1. Scaffold a Next.js 15 App Router project with TypeScript strict, Tailwind, and shadcn/ui. Wire up the Inklee color tokens from CLAUDE.md as CSS variables in globals.css. Default to dark mode. Build a minimal landing page with just the Inklee wordmark, one tagline, a "sign up" button (no link yet), and a footer with placeholder legal links. Before writing code, confirm the file structure you plan to create.

**Smoke test:** `pnpm dev`, open `localhost:3000`, landing page loads in dark mode. Toggle to light mode works. `pnpm typecheck` and `pnpm lint` both pass.

---

## Slice 2 — Database schema + Supabase wiring

**Goal:** Schema is migrated, seed script runs, Supabase client is callable from server components.

**Scope:**
- Install `@supabase/supabase-js`, `@supabase/ssr`, `drizzle-orm`, `drizzle-kit`
- Create Drizzle schema:
  - `profiles` (extends Supabase `auth.users`): `id` (uuid, FK), `slug` (citext, unique), `display_name`, `instagram_handle`, `bio`, `logo_url`, `timezone`, `location`, `settings` (jsonb), `booking_mode` (enum: `preferred_date | fixed_slots`, default `preferred_date`), `created_at`, `updated_at`
  - `booking_requests`: `id`, `artist_id` (FK), `status` (enum: `pending | approved | rejected | deposit_pending | cancelled`), `form_data` (jsonb), `preferred_date` (date, nullable), `slot_id` (FK, nullable), `customer_email`, `customer_handle`, `customer_token_hash`, `origin` (enum: `public_form | artist_created`), `created_at`, `updated_at`, `decided_at`
  - `booking_images`: `id`, `booking_id` (FK), `storage_path`, `created_at`
  - `slots`: `id`, `artist_id` (FK), `starts_at` (timestamptz), `ends_at` (timestamptz), `duration_minutes`, `status` (enum: `open | locked | booked | cancelled`)
  - `email_templates`: `id`, `artist_id` (FK), `type` (enum), `subject`, `body`
  - `audit_log`: `id`, `booking_id` (FK), `action`, `actor` (uuid, nullable), `timestamp`, `details` (jsonb)
- Enable Row Level Security on every table. Policies:
  - Artists can `select`/`update`/`delete` only their own rows
  - Public can `insert` into `booking_requests` (rate limited at edge)
  - Magic-link token grants scoped `select`/`update` on one booking row
  - `audit_log` is append-only for authenticated artists on their bookings; no updates or deletes
- Seed script: one test artist with slug `demo`, display name "Demo Artist", placeholder logo
- Server-side Supabase client in `src/lib/supabase/server.ts`
- Browser-side Supabase client in `src/lib/supabase/client.ts`
- Middleware at `src/middleware.ts` for session refresh

**Done when:** Migrations run clean, seed creates test artist, a server component can read the demo profile.

**Out of scope this slice:** Auth UI, forms, any user-facing page beyond a dev-only test route.

**Opening prompt:**
> Slice 2. Wire up Supabase with Drizzle. Build the schema listed in SLICES.md slice 2. Enable RLS on every table with the policies listed. Write a seed script. Add a dev-only `/dev/ping` page (server component) that fetches the demo artist and renders their display name. Walk me through the schema decisions before writing migrations — especially the enum choices and jsonb usage.

**Smoke test:** `pnpm db:migrate && pnpm db:seed`. Visit `/dev/ping`, see demo artist's display name. In Supabase dashboard, every table shows RLS enabled.

---

## Slice 3 — Artist auth + profile + slug claim

**Goal:** Artist can sign up, verify email, log in, set profile, claim a unique public slug.

**Scope:**
- Routes: `/signup`, `/login`, `/logout`, `/forgot-password`, `/reset-password`
- Supabase Auth email/password flow with email verification
- Protected route group `(artist)` with middleware check
- `/onboarding/claim-slug` step post-signup:
  - Input with realtime availability check (debounced 300ms)
  - Reserved word list from DECISIONS.md
  - Format validation: 3-30 chars, lowercase alphanumeric + single dashes, must start with a letter, cannot end with a dash
- `/settings/profile`: display name, Instagram handle, bio (280 char max), timezone auto-detect + override dropdown, location (free text city), logo upload
- Logo upload: Supabase Storage bucket `logos`, max 2MB, PNG/JPG/WebP, auto-resize to 512px square using `sharp` in a server action
- `/[slug]` route stub that reads profile and shows "booking page coming soon" (slice 4 populates this)

**Done when:** Full signup → verify email → claim slug → set profile → logout → login round trip works.

**Out of scope this slice:** Public booking form, dashboard.

**Opening prompt:**
> Slice 3. Build artist auth and profile. Use Supabase Auth email/password with email verification, cookie-based session via `@supabase/ssr`. Follow CLAUDE.md design system — lowercase microcopy, bone-on-dark, no exclamation marks. Before writing the slug claim logic, propose the reserved-word list (cross-reference DECISIONS.md) and the validation regex. Confirm the logo resize pipeline before implementing.

**Smoke test:** Sign up with a test email. Confirm verification email arrives. Click verify. Claim slug `test-artist`. Upload a logo. Log out. Log back in. Visit `/test-artist` — placeholder page loads.

---

## Slice 4 — Public booking form (preferred-date mode)

**Goal:** Public `/[slug]` page shows the booking form, submissions land in DB, magic-link token is generated.

**Scope:**
- Route `/[slug]` (dynamic, no static generation)
- 404 if slug doesn't exist
- Mobile-first single-column layout, generous vertical spacing, artist's logo + display name at top
- Form fields:
  - Instagram handle (required, `@` prefix auto-stripped)
  - Email (required, RFC 5322 validation)
  - Tattoo reference link (optional, URL validation)
  - Placement (required, single-line text)
  - Size (required, radio group: palm-sized / hand-sized / forearm / larger)
  - Description (required, textarea, 1000 char max, char counter)
  - Image upload (max 5, 10MB each, JPG/PNG/HEIC/WebP, drag-drop + click-to-upload, thumbnail previews, remove button)
  - Preferred date (required, date picker, disables past dates + today)
  - Honeypot field (hidden, name something innocuous like `website`)
- Server action on submit:
  - Zod validation (shared schema between client and server)
  - Rate limit by IP via Upstash (5 submissions per hour per IP)
  - Honeypot check (if filled, silently drop)
  - Upload images to Supabase Storage bucket `bookings/{booking_id}/`
  - Insert `booking_requests` row with `status = 'pending'`, `origin = 'public_form'`
  - Generate 32-byte random token, hash with Argon2, store hash
  - Write audit log entry
  - Log customer confirmation email to console (real Resend wiring in slice 6)
  - Redirect to `/request/submitted?id={booking_id}` confirmation page
- Add legal footer stub (Terms / Privacy / Impressum — content in slice 10)

**Done when:** Anonymous user can submit a booking end-to-end; row lands in DB; images are in Storage; token hash is present.

**Out of scope this slice:** Artist review (slice 5), real emails (slice 6), slot mode (slice 9), customer portal (slice 8).

**Opening prompt:**
> Slice 4. Build the public booking form at `/[slug]`. Mobile-first, follow CLAUDE.md design system. Before writing the form, show me the shared Zod schema, the rate-limit strategy, and the image-upload flow (client upload direct to Storage vs. server-action proxy). Explain the tradeoff.

**Smoke test:** Visit `/test-artist`. Submit a booking with 5 images. Row in `booking_requests` table, files in Storage under correct path, token hash present. Submit a 6th time within an hour — rate limited. Submit with honeypot filled — silently dropped but page still shows success.

---

## Slice 5 — Artist dashboard (list + detail + status actions)

**Goal:** Artist can see pending requests, review details, and approve / reject / mark deposit pending.

**Scope:**
- `/dashboard` list view:
  - Table of requests with status filter (all / pending / approved / rejected / deposit pending / cancelled)
  - Columns: customer handle, placement, size, preferred date, status badge, submitted (relative time)
  - Sort newest first
  - Empty state when no requests ("no requests yet. share your booking link.")
  - Loading skeleton
- `/dashboard/requests/[id]` detail view:
  - All form data displayed clearly
  - Image thumbnails with lightbox on click
  - Three action buttons: approve, reject, mark deposit pending
  - Confirmation dialog on reject
  - Metadata sidebar: submitted at, customer email, magic-link status (active / used)
- Server actions for state transitions; each writes to `audit_log`
- Optimistic UI with rollback on server error
- `/dashboard` is the default post-login landing page

**Done when:** Artist can review and move a booking through every status. Audit log captures each transition.

**Out of scope this slice:** Emails on state change (slice 6), calendar (slice 7), editing a booking (slice 7).

**Opening prompt:**
> Slice 5. Build the artist dashboard list and detail views with status actions. Desktop-first, follow the design system. Write server actions for state transitions with full audit log coverage. Before implementation, propose the component structure for the detail page and how image lightbox will work without shipping a heavy library.

**Smoke test:** Submit a booking as anonymous user. Log in as artist. Request appears in list with "pending" status. Open detail. Approve it. Status badge updates, audit log row exists in DB.

---

## Slice 6 — Email system

**Goal:** Every state transition triggers the right email with the right content. Artist can customize bodies.

**Scope:**
- Install `resend` and `@react-email/components`
- Verify `inklee.app` sending domain in Resend (SPF, DKIM, DMARC in All-inkl DNS)
- React Email templates (bone-on-dark, Inklee wordmark, plain-text fallback for each):
  - `customer-booking-submitted` (includes magic link for edit/cancel)
  - `customer-booking-approved` (includes magic link for cancel)
  - `customer-booking-rejected`
  - `customer-booking-cancelled-by-artist`
  - `artist-new-booking-request`
- Variable substitution with allowlisted vars:
  - `{{customer_handle}}`, `{{artist_name}}`, `{{artist_slug}}`, `{{date}}`, `{{placement}}`, `{{size}}`, `{{magic_link}}`
  - Any unknown variable renders as empty string, logged as warning
  - Zod schema validates template body before save (no HTML, no script tags)
- `/settings/templates` UI: artist edits body for each template, subject locked, layout locked
- Wire email sends into state transitions from slice 5
- Send failures logged but do not block the state change (emails are best-effort)

**Done when:** End-to-end: submit booking → customer receives confirmation + artist receives notification. Approve → customer gets approval email. Reject → customer gets rejection email. Artist can edit template body and preview it.

**Out of scope this slice:** Magic-link portal routes (slice 8).

**Opening prompt:**
> Slice 6. Wire up Resend. Build React Email templates for all five email types. Implement allowlist-based variable substitution with Zod validation on template bodies. Before building the customization UI, show me how you'll prevent template injection (HTML, script tags, unauthorized variables).

**Smoke test:** Submit a booking. Check your inbox for both the customer confirmation and the artist notification. Approve — customer inbox receives approval email. Reject — rejection email arrives. Edit a template body via UI — next email reflects the change.

---

## Slice 7 — Calendar + artist-created appointments + edits/cancels

**Goal:** Approved bookings show on a month calendar. Artist can add appointments directly (optionally with customer email) and edit/cancel any booking.

**Scope:**
- `/dashboard/calendar` month view with `react-big-calendar`, restyled to match design system
- Only approved and artist-created bookings render as events
- Click event → side drawer with booking details + edit / cancel buttons
- Artist edit: all form fields editable except status (status uses action buttons); save triggers customer notification email if email present
- Artist cancel: confirmation dialog; sets status `cancelled`; triggers customer email if email present; frees up slot if slot-mode booking
- `+ new appointment` button → modal:
  - Fields: customer handle, date, placement, size, description, optional customer email (checkbox: "send confirmation email")
  - If email checkbox checked and email provided: creates booking with `status = 'approved'`, `origin = 'artist_created'`, sends confirmation with magic link
  - If no email or checkbox unchecked: creates booking with `status = 'approved'`, `customer_email = null`, no email sent (private calendar block)
- iCal feed per artist at `/api/ical/{token}` (read-only, token in artist settings, revocable)
- Link to iCal feed in `/settings/calendar-export`

**Done when:** Artist can see a month calendar, add their own appointments, edit or cancel any booking, and customers are notified when relevant.

**Out of scope this slice:** Customer-side edit/cancel portal (slice 8), slot mode (slice 9).

**Opening prompt:**
> Slice 7. Build the calendar view, artist-initiated appointment creation, and edit/cancel flows. Propose the component structure for the calendar + drawer + new-appointment modal before writing code. Confirm how `react-big-calendar` will be themed to our design tokens — if it fights us, suggest an alternative.

**Smoke test:** Approve a booking from slice 5 — appears on calendar. Click it — drawer opens. Create a new appointment without a customer email — appears as a private block on the calendar. Create one with a customer email — customer receives confirmation with magic link. Edit the date — artist sees the change, customer gets notification. Cancel — customer gets cancellation email.

---

## Slice 8 — Customer magic-link portal

**Goal:** Customer can edit their booking (before approval) and cancel it (anytime) via a link sent to their email.

**Scope:**
- Route `/request/[token]`:
  - Validates token hash; loads booking if valid and not expired
  - Shows current booking details
  - Edit form (only rendered if `status = 'pending'`): same fields as public form, prefilled
  - Cancel button (always visible unless already cancelled): confirmation dialog → sets status `cancelled` → notifies artist via email
  - "Link expired" state (after 30 days)
  - "Already used" state (for single-use edit tokens)
  - "Not found" state (404 equivalent)
- Token lifecycle:
  - 32-byte cryptographically random on generation
  - Hashed with Argon2 before storage
  - 30-day expiry
  - Edit is single-use: after each edit, a new token is issued and emailed
  - Cancel is reusable (same token works for cancel at any point)
- Add new email template: `artist-booking-cancelled-by-customer`
- Audit log entry on every customer action

**Done when:** Customer can follow magic link, edit their request pre-approval, cancel at any time. Artist is notified on customer cancel.

**Out of scope this slice:** Slot mode.

**Opening prompt:**
> Slice 8. Build the customer magic-link portal at `/request/[token]`. Before writing token logic, propose the full token lifecycle (generation, storage, validation, rotation on edit) and confirm it matches the security section of CLAUDE.md. Think through the "already used", "expired", and "not found" states as first-class UI.

**Smoke test:** Submit a booking. Click magic link in email → edit it → submit. Check that a new token was issued in the updated email. Click new link → cancel. Artist inbox receives cancellation notification.

---

## Slice 9 — Slot mode (fixed published slots)

**Goal:** Artist can publish one-off time slots. Customers pick a slot instead of proposing a date. Conflict resolution is race-safe.

**Scope:**
- `/settings/slots`: artist creates slots
  - Date + start time + duration (minutes)
  - Or a block with auto-generated sub-slots (e.g. "Nov 12, 10:00-18:00, 2-hour slots" generates 4 slots)
  - List of existing slots with status badges, delete action for `open` slots
- Setting toggle in `/settings/profile`: `booking_mode` = `preferred_date` | `fixed_slots`
- Public form adapts based on mode:
  - `fixed_slots`: show list of open slots grouped by date, radio select, no date picker
  - `preferred_date`: date picker as in slice 4
  - If `fixed_slots` but no open slots exist: "artist hasn't published slots yet — check back soon"
- Conflict rule: first successful submission locks the slot via `SELECT ... FOR UPDATE` within a transaction; `slot.status = 'locked'`; subsequent requests see "unavailable"
- Slot becomes `booked` on artist approval
- Slot returns to `open` on cancel or reject (by either party)

**Done when:** Artist publishes slots, customers book them, and two concurrent submissions for the same slot cannot both succeed.

**Out of scope this slice:** Recurring slot templates (v2), time-zone-aware slot display for customer (MVP displays in artist's timezone with a clear label).

**Opening prompt:**
> Slice 9. Build fixed-slot mode. Before writing the conflict-resolution logic, explain how you'll prevent race conditions on simultaneous submissions — show me the transaction structure and the fallback if two clients hit the server within the same millisecond. Also propose the "block with sub-slots" UI flow.

**Smoke test:** Artist creates 3 slots. Switch booking mode to `fixed_slots`. Public form shows slot picker. Two customers submit at the same time for the same slot — exactly one succeeds, the other sees "unavailable". Artist approves — slot shows as booked. Artist cancels — slot returns to open.

---

## Slice 10 — Polish, legal, pre-launch hardening

**Goal:** Ready for a real first user. You personally book a tattoo through Inklee.

**Scope:**
- Empty states, loading states, error boundaries on every route
- Mobile responsiveness audit of customer-facing pages
- Form customization UI:
  - Required-field toggles for optional fields
  - Up to 3 custom text-only fields with label + required flag
- Legal pages:
  - `/terms` — template content, placeholder
  - `/privacy` — template content, covers Supabase, Vercel, Resend, Plausible, cookies
  - `/impressum` — German requirement; artist as legal entity
- Cookie disclosure banner (Plausible is cookie-free; Supabase auth cookies are strictly necessary — single disclosure, no consent modal needed if only strictly-necessary)
- Plausible analytics script wired into root layout
- Vercel Cron daily job: delete storage files for rejected bookings older than 30 days, then delete the booking row
- Sentry for error monitoring (free tier, EU region)
- Playwright E2E tests for three critical paths:
  - submit → artist approve → both emails sent
  - submit → artist reject → rejection email sent
  - artist cancels approved booking → customer notified
- `/help` page with FAQ (6-10 questions based on your own expected questions as a tattoo artist)
- `/about` page stub
- Favicon, open-graph images, apple-touch-icon
- `robots.txt`, `sitemap.xml`
- Security headers: CSP, HSTS, X-Frame-Options, Referrer-Policy
- 404 and 500 pages matching design system

**Done when:** You personally book a tattoo through Inklee with a real human customer and the whole flow works without intervention.

**Out of scope this slice:** Anything not listed above. If it's missing, it goes in v2.

**Opening prompt:**
> Slice 10. Polish and pre-launch hardening. Walk through the scope in SLICES.md slice 10 and propose an execution order. Surface any legal blockers (Impressum content, DPA with subprocessors, cookie consent scope) first so we can resolve them in parallel with development work.

**Smoke test:** Book a real tattoo through Inklee with a real customer, end to end.

---

## After slice 10 — the hardest rule

Do not build anything else until you have 5 real artist users actively using Inklee. Resist v2 scope. Your job now is to validate assumptions, not to expand the product. Chat, payments, custom branding, recurring slots, multi-language — all of it waits for real users to demand it.
