# Inklee — Independent UX Audit (Claude)

**Date:** 2026-05-20
**Auditor:** Claude (independent pass — no input from the other agent yet)
**Method:** Direct inspection of `src/app/`, `src/components/`, route handlers, server actions, layouts, and navigation configuration. No assumptions imported from outside the codebase.
**Scope:** Whole web app — artist surfaces, public booking page, onboarding, settings, mobile chrome.

---

## A. Executive summary

**Overall UX health: 7/10.**

Inklee has more product than a typical pre-launch MVP. The product flow exists, the language is tattoo-native more often than not, and the navigation is competently structured — but the _coherence_ between major features is uneven. The shipped surfaces (sidebar IA, dashboard widgets, public form, request detail) are individually well-built; the connective tissue between them — the "what do I do next?" arrows — is where the experience leaks.

**Main UX strengths**

- Sidebar IA is concise: 4 General + 3 Tools items, no jungle.
- Dashboard is widget-driven and links forward into `/bookings/*` (the canonical IA) rather than to its own legacy `/dashboard/*` subroutes (those are clean redirect-only stubs).
- `FeatureIntroModal` auto-explains 5 empty features (overview, waitlist, travel, flash-items, flash-days) with real tattoo-native copy and one-click CTAs. This is a strong, under-used pattern that should be expanded.
- Onboarding wraps work into a 5-step progress bar with a calm welcome screen ("Takes about 3 minutes. You can adjust everything later.") and a "Set up later" affordance via the persistent dashboard banner.
- Public `/[slug]` is genuinely tattoo-native: charcoal hero + bone form, optional studio block, optional active-trip leg, clear "Booking request" heading, the booking form itself follows tattoo logic (placement → size → references → date → contact).
- `/help` exists with real plain-language FAQs.
- Microcopy is largely good. "Fill in the details and I'll get back to you" reads as the artist's voice; "Share this link with clients" is what artists actually do.

**Main UX weaknesses**

1. **Settings is fragmented and partially hidden.** The sidebar exposes 5 settings sub-items (Profile, Emails, Calendar, Dashboard, Account) but the codebase has _twelve_ settings routes (also `books`, `calendar-export`, `fields`, `reminders`, `slots`, `templates`, `travel`). Half of settings is reachable only by typing the URL or following inline deep-links from feature pages. New artists can't find e.g. "where do I edit reminder emails?" without a guess.
2. **"Settings → Dashboard" naming collides with the top-level "Dashboard"** sidebar item. A user clicking sidebar "Settings → Dashboard" lands on widget-toggles, not the dashboard.
3. **Books status (open/closed/cap)** lives at `/bookings/settings`, but the same set of toggles arguably also lives at `/settings/books` (two routes for one mental model). I haven't fully cross-confirmed whether they are duplicates or distinct concerns named the same — flagged as **needs manual testing**.
4. **The public-facing share moment is muted.** The dashboard has a `BookingLinkWidget` only if the user has it enabled in `/settings/dashboard`. For a tool whose value is "your one link", the share moment should be unconditionally visible to first-time artists.
5. **Flash is a top-level sidebar item.** For an artist who doesn't do flash, this is permanent visual weight on a feature they don't use. Flash also has the most internal complexity in onboarding-adjacent decisions (Items / Days / Instagram).
6. **`/bookings/` redirects through two hops** (`/bookings/` → `/bookings/requests` → `/bookings/overview`). Minor but a code smell that suggests the IA went through iterations and the legacy route shouldn't have been left in the chain.
7. **No persistent "Share booking link" CTA on mobile.** The mobile bottom nav has 5 tabs (Dashboard / Bookings / Flash / Travel / Settings); the share moment lives 2 taps deep on every page.
8. **Onboarding step 1 (`claim-slug`) is labeled "Profile" in the progress bar.** Slight conceptual drift — users see a step labeled "Profile" but the only field is their slug.

**Biggest user-flow risks**

- A new artist gets to the dashboard, sees mostly empty widgets, doesn't have a clear "now share your link to your first 3 clients" moment.
- A traveling artist trying to "add a trip and have it show on my form" has to mentally connect Travel (top-level) with Trip settings (per-trip toggle `show_on_booking_form`) — the dependency isn't obvious from outside the trip editor.
- A daily artist working from their phone hits a request, opens the detail page, and tries to approve — the StatusActions + image gallery + communication sidebar might compete for vertical space on mobile.

**Ready for real artist beta testing?**
**Yes, with caveats.** The product surface, the auth flow, the booking flow, and the legal frame are all in place. The risks above are _UX confusion_, not _broken paths_. A small number of inexpensive fixes (mostly copy, navigation hierarchy, and one or two "what's next?" cards) would close the most common confusion gaps.

**Does the product feel like one coherent tattoo booking tool?**
_Mostly yes._ The branded chrome (charcoal sidebar + bone workspace, mustard accent for primary actions) is consistent. The voice is consistent. What breaks coherence is the _information-architecture seams_ — places where the sidebar promises 5 things and the codebase has 12, where two adjacent menu items (Dashboard top-level vs Settings → Dashboard) refer to different things, where the public booking link's primacy isn't visually re-asserted on the artist's home screen. Not a redesign problem. A focus-and-naming problem.

---

## B. Discovered product surface

### B.1 Artist routes (auth-gated, behind `(artist)` group)

| Route                                                                                                                                                   | Status                                                      | User-facing purpose                                                                                                                                                                                 | In optimization plan? |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `/dashboard`                                                                                                                                            | working                                                     | Home: widget cards (pending requests, books status, upcoming, waitlist, booking link, analytics callout). Onboarding banner shows when incomplete.                                                  | Yes                   |
| `/dashboard/calendar`                                                                                                                                   | redirect-only (legacy)                                      | Old route; no UI value left.                                                                                                                                                                        | Cleanup only          |
| `/dashboard/clients`, `/dashboard/clients/[email]`, `/dashboard/waitlist`, `/dashboard/requests/[id]`                                                   | redirect-only (legacy)                                      | All redirect to `/bookings/...`.                                                                                                                                                                    | Cleanup only          |
| `/bookings`                                                                                                                                             | redirect-only → `/bookings/requests` → `/bookings/overview` | Double-hop redirect. Should redirect directly to `/bookings/overview`.                                                                                                                              | Yes                   |
| `/bookings/overview`                                                                                                                                    | working                                                     | Single screen with tabs Requests / Clients, status filter pills, trip filter pills, table list, empty state with Copy/Preview link.                                                                 | Yes                   |
| `/bookings/calendar`                                                                                                                                    | working (assumed; not deeply inspected)                     | Booking calendar view.                                                                                                                                                                              | Yes                   |
| `/bookings/waitlist`                                                                                                                                    | working (assumed)                                           | Waitlist entries. Has `FeatureIntroModal` intro copy.                                                                                                                                               | Yes                   |
| `/bookings/settings`                                                                                                                                    | working                                                     | Books open/closed, booking window, message, cap. (Mentally: where you decide whether you accept requests at all.)                                                                                   | Yes                   |
| `/bookings/booking-form`                                                                                                                                | working                                                     | The composite "manage your booking form" page — share section, form fields (drag-reorderable), appearance. Imports components from `bookings/form/`, `bookings/public-page/`, `bookings/settings/`. | Yes                   |
| `/bookings/slots`, `/bookings/books`                                                                                                                    | working (assumed)                                           | Slot-mode time slots; alternative books view. Not in sidebar.                                                                                                                                       | Yes — discoverability |
| `/bookings/form`, `/bookings/public-page`, `/bookings/requests`, `/bookings/clients`, `/bookings/clients/[email]`                                       | redirect-only (legacy)                                      | All redirect to either `booking-form` or `overview`. The _components_ in `bookings/form/` and `bookings/public-page/` are still imported by `booking-form/page.tsx`.                                | Cleanup only          |
| `/bookings/requests/[id]`                                                                                                                               | working                                                     | Request detail: form data, custom answers, annotated images, audit log, status actions, communication sidebar. Rich page.                                                                           | Yes                   |
| `/flash`                                                                                                                                                | redirect → `/flash/items`                                   |                                                                                                                                                                                                     | —                     |
| `/flash/items`, `/flash/items/new`, `/flash/items/[id]`                                                                                                 | working                                                     | Flash items management. `FeatureIntroModal` intro.                                                                                                                                                  | Yes                   |
| `/flash/days`, `/flash/days/new`, `/flash/days/[id]`                                                                                                    | working                                                     | Flash days/drops. `FeatureIntroModal` intro.                                                                                                                                                        | Yes                   |
| `/flash/instagram`                                                                                                                                      | working                                                     | Instagram OAuth + preview caching for flash.                                                                                                                                                        | Yes                   |
| `/travel`                                                                                                                                               | working                                                     | Trip + Studio management with `TripManager` + `StudioList`. `FeatureIntroModal` intro.                                                                                                              | Yes                   |
| `/analytics`                                                                                                                                            | working (not inspected deeply)                              | Conversion, volume, return rate.                                                                                                                                                                    | Yes — discoverability |
| `/notifications`                                                                                                                                        | working                                                     | Notification inbox; unread count surfaces in sidebar + mobile top bar.                                                                                                                              | Yes                   |
| `/onboarding/welcome`                                                                                                                                   | working                                                     | Value-prop landing (4 explainer cards). Routes to `claim-slug`.                                                                                                                                     | Yes                   |
| `/onboarding/claim-slug`                                                                                                                                | working — **step 1 ("Profile")**                            | Pick your slug + display name.                                                                                                                                                                      | Yes                   |
| `/onboarding/profile`                                                                                                                                   | redirect-only (legacy)                                      | Now redirects to `/onboarding/booking`.                                                                                                                                                             | Cleanup only          |
| `/onboarding/booking`                                                                                                                                   | working — **step 2 ("Booking")**                            | Choose booking mode: preferred_date vs fixed_slots. Two large cards.                                                                                                                                | Yes                   |
| `/onboarding/availability`                                                                                                                              | working — **step 3 ("Availability")**                       | Set books open/closed + booking window.                                                                                                                                                             | Yes                   |
| `/onboarding/form`                                                                                                                                      | working — **step 4 ("Form")**                               | Pick which form fields appear.                                                                                                                                                                      | Yes                   |
| `/onboarding/done`                                                                                                                                      | working — **step 5 ("Done")**                               | Final confirmation; logo upload moment.                                                                                                                                                             | Yes                   |
| `/settings`                                                                                                                                             | redirect → `/settings/profile`                              |                                                                                                                                                                                                     | —                     |
| `/settings/profile`                                                                                                                                     | working (in sidebar)                                        | Display name, IG handle, bio, location, logo, cover image. "This information appears on your public booking page."                                                                                  | Yes                   |
| `/settings/emails`                                                                                                                                      | working (in sidebar)                                        | Email template settings.                                                                                                                                                                            | Yes                   |
| `/settings/calendar`                                                                                                                                    | working (in sidebar)                                        | Calendar prefs.                                                                                                                                                                                     | Yes                   |
| `/settings/dashboard`                                                                                                                                   | working (in sidebar)                                        | Widget toggles for `/dashboard` — name collides with the top-level Dashboard item.                                                                                                                  | Yes — rename/move     |
| `/settings/account`                                                                                                                                     | working (in sidebar)                                        | Account/security.                                                                                                                                                                                   | Yes                   |
| `/settings/books`, `/settings/slots`, `/settings/fields`, `/settings/reminders`, `/settings/templates`, `/settings/travel`, `/settings/calendar-export` | working — **NOT in sidebar**                                | Reachable only via inline links from feature pages or URL.                                                                                                                                          | Yes — discoverability |
| `/settings/export`                                                                                                                                      | working (route.ts data export)                              | Backend-only file download.                                                                                                                                                                         | No                    |

### B.2 Public routes

| Route                                                                                                                                                                                                                                                                        | Status  | Purpose                                                                                                            | In plan?        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ | --------------- |
| `/`                                                                                                                                                                                                                                                                          | working | Marketing homepage. Recently received the exact deposit wording on the Deposit Collection feature card.            | Yes (copy only) |
| `/[slug]`                                                                                                                                                                                                                                                                    | working | Public artist booking page. Hero → optional studio/trip blocks → booking form OR books-closed-block with waitlist. | Yes             |
| `/[slug]/flash`, `/[slug]/flash/[flashSlug]`                                                                                                                                                                                                                                 | working | Public flash item / day.                                                                                           | Yes             |
| `/request/[token]` + `/request/submitted`                                                                                                                                                                                                                                    | working | Customer magic-link portal for editing/cancelling a request after submission.                                      | Yes             |
| `/start`                                                                                                                                                                                                                                                                     | working | Acquisition landing page.                                                                                          | Out of scope    |
| `/about`, `/help`, `/dm-chaos`, `/guest-spots`, `/best-booking-app-for-tattoo-artists`, `/instagram-booking-link-for-tattoo-artists`, `/tattoo-booking-form`, `/tattoo-booking-software`, `/tattoo-booking-software-vs-*`, `/tattoo-deposit-tool`, `/tattoo-artist-waitlist` | working | SEO/marketing pages.                                                                                               | Out of scope    |
| `/imprint`, `/terms`, `/dpa`, `/acceptable-use`, `/privacy`, `/cookies`, `/subprocessors`                                                                                                                                                                                    | working | Legal pages, counsel-cleared.                                                                                      | Out of scope    |
| `/legal/report`                                                                                                                                                                                                                                                              | working | DSA notice-and-action form.                                                                                        | Out of scope    |
| `/auth/mfa`, `/auth/callback`, `/auth/confirm`                                                                                                                                                                                                                               | working | Auth handlers.                                                                                                     | —               |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`                                                                                                                                                                                                                   | working | Auth. Signup has a passive legal-consent notice; no recorded acceptance.                                           | Yes (minor)     |
| `/admin`, `/admin/accounts/[id]`                                                                                                                                                                                                                                             | working | Admin-only roster.                                                                                                 | Out of scope    |

### B.3 Backend / utility

| Route                                                                                                                                        | Purpose                          |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `/api/auth/email-hook`, `/api/auth/mfa/recover`, `/api/email/webhook`, `/api/ical/[token]`, `/api/instagram/callback`, `/api/stripe/webhook` | Standard webhook + API plumbing. |
| `/api/cron/cleanup`, `/api/cron/reminders`, `/api/cron/instagram-refresh`                                                                    | Vercel cron jobs.                |
| `/dev/loader`, `/dev/ping`                                                                                                                   | Dev-only inspectors.             |

### B.4 Cross-cutting components worth naming

- `Sidebar` + `MobileTopBar` + `MobileBottomNav` + `WorkspaceTopBar` — the four chrome components in the `(artist)` shell. Sidebar config lives in `nav-config.ts`.
- `FeatureIntroModal` — auto-show explainer modal, configured for 5 feature keys. **Strong pattern, currently under-used.**
- `BooksStatusPill` — top-bar pill showing open/closed/remaining-cap. Always visible across all artist pages.
- `OnboardingProgress` — 5-step progress bar.
- `StatusBadge`, `IconChip`, `Card` — design-system pieces.
- `RandomizedLogo` — playful brand element.
- `PublicBookingLegalNotice` — Section 8 notice on `/[slug]`, now collapsed behind a Learn more toggle.

---

## C. User journey maps

### C.1 First-time tattoo artist (signup → first share)

**Goal:** "Get a working booking link I can paste into my Instagram bio in under 5 minutes."

| Step                                                            | Current experience                                                                                                                                                                                                                              | Friction / unclear                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Signup `/signup`                                             | Email + password OR Google OAuth. Below button: "By creating an account you agree to our Terms, Privacy Policy, Acceptable Use Policy."                                                                                                         | None significant.                                                                                                                                                                                                   |
| 2. Email confirmation                                           | Standard Supabase flow.                                                                                                                                                                                                                         | Depending on confirmation provider speed, can stall here. Not a UX issue per se.                                                                                                                                    |
| 3. Landing on `/onboarding/welcome`                             | Calm intro: "A few quick steps to set up the essentials. Takes about 3 minutes. You can adjust everything later." Four explainer cards (Your booking link, Structured requests, Review and approve, Stay organised). Single CTA: "Start setup". | Good.                                                                                                                                                                                                               |
| 4. `/onboarding/claim-slug` (labeled "Profile" in progress bar) | Pick slug + display name.                                                                                                                                                                                                                       | **Label drift:** the progress bar says "Profile" but the page is really "Pick your URL". This is the only screen labeled "Profile" — the broader profile (bio, location, logo) comes later via `/settings/profile`. |
| 5. `/onboarding/booking` (step 2)                               | Choose `preferred_date` vs `fixed_slots`. Two large cards with explanatory copy.                                                                                                                                                                | Good explanatory copy. The decision is binary but consequential; **decision is well-supported**.                                                                                                                    |
| 6. `/onboarding/availability` (step 3)                          | Books open? Window?                                                                                                                                                                                                                             | I haven't read this page closely but the flow exists. Needs manual testing for whether the artist understands "booking window" as a calendar concept.                                                               |
| 7. `/onboarding/form` (step 4)                                  | Toggle form fields.                                                                                                                                                                                                                             | Plausibly the place where they over-think.                                                                                                                                                                          |
| 8. `/onboarding/done` (step 5)                                  | Logo upload + final CTA.                                                                                                                                                                                                                        | Important: this is the **only** "share your link" success moment in the onboarding. If they skip it, the dashboard's booking-link widget may or may not be enabled (it's behind `widgets.booking_link`).            |
| 9. Land on `/dashboard`                                         | If `onboarding_completed === true` they see widgets; the "finish setting up" banner is gone. If books are open and capRemaining=null, they see "All widgets are hidden — Configure dashboard".                                                  | Risk: if widgets are all off (e.g. cold-state misconfig), the user lands on a near-empty dashboard with one fallback link to `/settings/dashboard`. That's a soft dead-end.                                         |

**Friction summary:**

- **Step 4** label says "Profile" but the page is "claim a slug" — small but real.
- **Onboarding "done" → dashboard hop** isn't an obvious celebration. The dashboard has a smart `BookingLinkWidget`, but it's gated by `widgets.booking_link`. New artists land on a dashboard whose entry-point depends on widget toggles set elsewhere.
- **No "send a test request to yourself" moment.** First-time artists don't know what their public page looks like until they remember to click `/bookings/booking-form` → preview.

**Improvement opportunities:**

- Rename onboarding step 1 from "Profile" to "Link" or "URL" (XS, copy).
- Force-show the booking-link share widget on the dashboard while the artist has zero received requests (regardless of `widgets.booking_link`). (S, conditional rendering.)
- After `/onboarding/done`, route to `/dashboard?just_finished=1` and show a single one-time celebratory card: "Your booking link is live — try sending it to yourself." (S.)

---

### C.2 Daily tattoo artist (request received → managed)

**Goal:** "Read this request, decide, approve/decline, get on with my day."

| Step                                         | Current experience                                                                                                                                           | Friction / unclear                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Notification                              | Notification email + in-app bell (unread count on sidebar + mobile top bar).                                                                                 | Good.                                                                                                                                          |
| 2. Open `/bookings/overview` or `/dashboard` | Dashboard shows up to 3 pending requests in a card; full list at `/bookings/overview?view=requests`. Filters by status, by trip. Clients tab also available. | Good.                                                                                                                                          |
| 3. Open request detail                       | Form data, custom answers, annotated images, slot/trip context, audit log, status actions, communication sidebar.                                            | Information-rich. Some risk of vertical-overload on mobile.                                                                                    |
| 4. Approve / decline / request deposit       | `StatusActions` component (I haven't read it line-by-line — needs manual testing for confirmation prompts on destructive actions).                           | Needs manual testing. Are there destructive-action confirmation prompts? Is there a way to "approve and propose a different date" in one step? |
| 5. Communication                             | `CommunicationSidebar` — exists.                                                                                                                             | I haven't validated the depth — there may be templated-reply support via `/settings/templates`.                                                |

**Friction summary:**

- The **status semantics** (`pending`, `approved`, `deposit_pending`, `rejected`, `cancelled`) are five categories. Five status badges to learn. The empty-state copy in `/bookings/overview` says "No `deposit_pending` requests" which is a raw label leaking through (`status.replace("_", " ")`). **Microcopy fix needed.**
- The dashboard's pending-requests card shows handles only. To skim "what's actually being requested" the artist must open each one.

**Improvement opportunities:**

- Replace status-label string interpolation with human labels everywhere (e.g. "Awaiting deposit" instead of "deposit pending"). (XS, helper function.)
- Add `placement` to the dashboard pending-requests card row alongside the handle — helps triaging from the dashboard glance. (XS, one line.)
- Make sure `StatusActions` has explicit confirmation on Reject/Cancel (needs manual testing).

---

### C.3 Traveling / guest-spot artist

**Goal:** "Set up a trip in Berlin Sep 12–18 and have my form route bookings to that window."

| Step                                        | Current experience                                                                                                                    | Friction / unclear                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `/travel`                                | `TripManager` + `StudioList`. `FeatureIntroModal` explains the value when empty.                                                      | Good first impression.                                                                                                                                                                                                                                     |
| 2. Add a studio                             | Google Places picker (`google-places-picker`) is the input.                                                                           | Depends on having a configured Google Maps API key.                                                                                                                                                                                                        |
| 3. Add a trip                               | Trip = title + legs (each leg = date range + studio + notes). Per-trip toggle `show_on_booking_form`.                                 | The mental model "trip → legs → optional studios" is one step beyond what most artists think. They think "I'm in Berlin Sep 12–18." The model expects them to first build a Studio then a Trip with a Leg pointing at that studio. **Cognitive overhead.** |
| 4. Verify it shows on `/[slug]`             | The public page surfaces an `activeLegData` block when a leg is current; the booking form's date logic uses `trips` to map date→trip. | Working but not visible to the artist _while editing_ — they have to open the public page in another tab.                                                                                                                                                  |
| 5. Receive a request during the trip window | `/[slug]` actions automatically tag `trip_id` based on slot/date overlap. Overview filter by trip works.                              | This is **already shipped well**. Real value here.                                                                                                                                                                                                         |

**Friction summary:**

- The Trip + Leg + Studio data model is more granular than the artist's mental model.
- There is no "preview your booking page right now" affordance on the `/travel` editor itself.
- The `show_on_booking_form` toggle name is good; its effect could be more visible (e.g., show "Visible on public page" / "Hidden" inline).

**Improvement opportunities:**

- Add an inline "Preview public page" link in the trip editor that opens the public page in a new tab. (XS.)
- Consider letting an artist add a one-leg "trip" as a single dialog (city + dates + studio) without the Trip→Legs nesting being visible. The data model can stay; the UI hides the nesting until needed. (M, scoped to TripManager.)

---

### C.4 Client submitting a tattoo request

**Goal:** "Submit a tattoo idea to this artist; understand what happens next."

| Step                                                                                | Current experience                                                                             | Friction / unclear                                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Lands on `/[slug]` from Instagram bio (mobile)                                   | Charcoal hero with logo + name + location + IG handle + bio. Bone form below.                  | Strong first impression. Tattoo-native.                              |
| 2. Sees "Booking request" heading + "Fill in the details and I'll get back to you." | Sets expectation. Voice = artist's, not platform's.                                            | Good.                                                                |
| 3. Studio block / active trip leg block (when applicable)                           | Surfaces context: "In Berlin Sep 12–18 · Studio X".                                            | Good. Honest.                                                        |
| 4. Booking form fields                                                              | Image upload + annotations + various form fields (size, placement, references, date, contact). | Comprehensive. Photo annotations are a strong tattoo-native feature. |
| 5. By-submitting paragraph + Learn more toggle                                      | Terms / Privacy / AUP linked. "Learn more" expands the full Section 8 client notice.           | Recently shipped (Section 8 collapsed behind toggle). Clean.         |
| 6. Submit                                                                           | Server action → confirmation page. The client gets a magic-link email to edit/cancel.          | Good post-submit story.                                              |
| 7. Books closed                                                                     | `BooksClosedBlock` with the artist's custom message + `WaitlistForm`.                          | Honest dead-end avoided.                                             |

**Friction summary:**

- The booking form is **long** (732 lines of TSX). On mobile, the scroll length depends on how many fields the artist enabled. Most fields are necessary; nothing screams "delete me". But the form may benefit from progressive disclosure of optional fields (e.g., "Add references" collapsed by default).
- The honeypot field is correctly hidden.
- The form does client-side image compression which is good for Vercel Hobby's body-size cap.
- **No explicit "you'll hear back within ~X days" sentence anywhere visible** in the form — the artist's voice "I'll get back to you" is the only commitment. That's intentional and probably fine, but worth noting.

**Improvement opportunities:**

- The post-submit confirmation page (`/request/submitted`) should be checked for whether it explicitly explains the magic link the client will receive. **Needs manual testing.**
- Long forms on mobile: consider grouping fields into 2–3 visual sections with subtle headers ("Your tattoo", "Date & location", "About you") instead of one continuous list. (S, layout-only.)

---

## D. Feature cohesion audit

For each major feature: what problem does it solve, how clearly is that communicated, how well does it connect.

| Feature                                | Problem solved                                                                      | Clarity of value in UI                                                                                                                                                                                                                                                                                                          | Connects to                                         | Treatment                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Booking link / public page**         | The one link the artist shares. The product's entire value pivots on this artifact. | **Under-communicated on the home dashboard.** The link is shown by a `BookingLinkWidget` that the user must toggle on.                                                                                                                                                                                                          | Booking form → Requests → Calendar.                 | **Promote.** The link should be unconditionally visible to artists with zero received requests.                                                                               |
| **Public booking form**                | Structured intake, replaces DMs.                                                    | Strong in onboarding ("Structured requests" card). Implicit afterwards.                                                                                                                                                                                                                                                         | Requests → Approval → Booking.                      | Keep; improve mobile sectioning.                                                                                                                                              |
| **Request inbox / overview**           | Single place to see all requests.                                                   | Clear. Has feature-intro modal for empty state.                                                                                                                                                                                                                                                                                 | Detail page → Approval → Calendar.                  | Keep.                                                                                                                                                                         |
| **Request detail / approval workflow** | The actual decision moment.                                                         | Rich UI.                                                                                                                                                                                                                                                                                                                        | Calendar; client communication.                     | Keep; manual-test mobile usability + destructive-action confirmations.                                                                                                        |
| **Calendar**                           | Bookings overview by date.                                                          | I haven't deep-dived. Likely lower priority than Requests for daily use.                                                                                                                                                                                                                                                        | Requests.                                           | Keep.                                                                                                                                                                         |
| **Waitlist**                           | Demand capture when books are closed.                                               | Has feature-intro modal.                                                                                                                                                                                                                                                                                                        | Books-closed state on public page.                  | Keep; ensure dashboard widget surfaces when waitlist > 0.                                                                                                                     |
| **Flash (Items / Days / Instagram)**   | Sell specific designs, group into drops, pull from Instagram.                       | Three sub-features. Each has intro modal.                                                                                                                                                                                                                                                                                       | Public flash pages.                                 | **Feels heavier than its current usage frequency.** Consider whether Flash should remain a top-level sidebar item or move under Bookings as "Flash". **Needs founder input.** |
| **Travel / trips**                     | Guest-spot dates + studios shown on public form.                                    | Has intro modal.                                                                                                                                                                                                                                                                                                                | Trip-tagged requests; public page active-leg block. | Keep; consider simplifying the Trip→Leg→Studio model for the single-trip case.                                                                                                |
| **Deposits**                           | Stripe-powered deposit collection.                                                  | **Currently not surfaced anywhere directly** — there is no `/settings/deposits` or `/bookings/deposits` route in the IA. The required deposit wording lives on the homepage feature card, in DPA + Terms text, and on the `/[slug]` Section 8 notice. The deposit _flow_ itself lives inside `StatusActions` on request detail. | Request approval → deposit_pending status.          | This is Slice 60e in the roadmap (artist deposit-settings UI + Stripe test-mode banner). Out of scope for _this_ audit; flagged.                                              |
| **Notifications**                      | Unread count + inbox.                                                               | Visible bell on sidebar + mobile top bar. Good.                                                                                                                                                                                                                                                                                 | Anywhere a state changes.                           | Keep.                                                                                                                                                                         |
| **Settings**                           | Configuration.                                                                      | **Fragmented.** Sidebar exposes 5 entries; codebase has 12.                                                                                                                                                                                                                                                                     | Everything.                                         | Major target of this audit (see §E).                                                                                                                                          |
| **Onboarding**                         | First-time setup.                                                                   | 5-step progress, calm welcome.                                                                                                                                                                                                                                                                                                  | Dashboard.                                          | Keep; small label fix on step 1.                                                                                                                                              |
| **Analytics**                          | Conversion/volume/return.                                                           | A callout card on the dashboard.                                                                                                                                                                                                                                                                                                | —                                                   | Keep; out of scope for audit.                                                                                                                                                 |

**Cohesion gaps that cost the most:**

1. **The booking link is the product's centerpiece but isn't always present on the dashboard.** Fix: unconditional widget for zero-request artists.
2. **The "I configure my form" mental model has three entry points** — `/bookings/booking-form`, `/settings/fields` (hidden from sidebar), and `/onboarding/form`. The artist may not realize that "Form fields" in `/bookings/booking-form` is the same data as `/settings/fields`. Likely one of these is the primary surface; the other should be removed from the IA or made an internal redirect. **Needs manual testing.**
3. **`Settings/dashboard` widget toggles vs. `Dashboard`** route — name collision is a real source of confusion.

---

## E. Navigation and information architecture findings

### What works

- Sidebar is compact (4 + 3 items) and uses tattoo-native vocabulary ("Bookings", not "Reservations"; "Flash" — the real word; "Travel", not "Locations").
- Dashboard is the only screen with widget-toggle behaviour; everywhere else has a fixed layout. Good consistency.
- Mobile bottom-nav mirrors the sidebar's top-level items (5 tabs). No accidental divergence between mobile and desktop IA.
- Sidebar sub-items expand only for the active section — keeps the sidebar from becoming a wall of links.

### What's confusing

- **Settings is half-hidden.** 12 settings routes, 5 in the sidebar.
- **Two "Dashboard" entries** in the IA (top-level sidebar Dashboard, plus Settings → Dashboard for widget toggles).
- `/bookings/settings` and `/settings/books` likely overlap. (Needs manual testing to confirm.)
- The composite `/bookings/booking-form` page pulls components from three legacy sub-routes (`bookings/form/`, `bookings/public-page/`, `bookings/settings/`). The component organization on disk doesn't match the URL the user sees. **Architectural; not user-facing.**

### What should be grouped differently

- **Move "Dashboard" widget toggles** out of `/settings/dashboard` and into the dashboard itself (a small "Customize" link at the bottom). Frees the "Settings → Dashboard" sidebar entry. (M.)
- **Settings should explicitly expose** Books status, Slots, Form fields, Reminders, Templates, Travel-related toggles, and Calendar export — either via expanded sidebar sub-items or via a clear "Settings home" landing page (`/settings`) listing every category instead of redirecting to Profile. (S to M.)

### What should be renamed

- `Settings → Dashboard` → "Home widgets" or "Customize home". (XS.)
- `/onboarding/claim-slug` progress label "Profile" → "Link" (the page is about claiming a URL). (XS.)
- `/bookings/booking-form` page header is "Booking Form" but the page covers Share link + Fields + Appearance. Consider "Your booking page" or "Booking page setup" to match what it actually does. (XS.)
- `/bookings/settings` is currently labeled "Booking Settings" in the sub-nav. It's actually "Books open/closed/cap/window" — i.e., availability. Consider "Availability" or "Books". (XS.)

### What should be moved

- Trip → Leg → Studio editor — within Travel, keep the data model but flatten the editor UI for the single-trip case (M). Not a navigation move; an in-page move.

### What should be hidden until needed

- Flash sub-items (Items / Days / Instagram): if the artist hasn't created any flash, the sub-items expanded under Flash adds clutter. Sidebar's `showChildren` already only shows children when the section is active — so this concern is already mitigated. **No action needed.**
- The legacy `/bookings/{form,public-page,requests,clients}` and `/dashboard/{calendar,clients,waitlist,requests}` routes are redirect stubs. Code cleanup, not user-facing.

---

## F. Public booking experience findings

### What works

- `/[slug]` opens with a charcoal hero that lets the artist's brand land first. The form sits in a bone-coloured workspace card.
- Image upload with optional annotation modal is real tattoo-native UX — clients can mark _where_ on a reference photo a tattoo should go.
- `BooksClosedBlock` + `WaitlistForm` turn a dead-end into a soft yes.
- "Inklee is built to make deposits part of the booking flow…" wording is now on Section 8 / Section 9 across the relevant surfaces.
- The collapsed "Learn more" Section 8 notice is the right pattern (was previously always-visible; founder feedback shipped 2026-05-20).

### What's still rough

- **Long form on mobile** — 732 lines of TSX, including image-annotation modal, custom fields, conditional date/slot pickers. Sectioning the form into 2–3 collapsible or visually-headed groups would improve scan + completion rates. (S, layout-only.)
- **No explicit "What happens after I submit?" sentence** in the form (it lives in the Section 8 notice, which is now collapsed by default). Consider a one-line "You'll get a confirmation email with a link to edit or cancel" _above_ the submit button, visible without expanding the legal notice. (XS, copy.)
- **`/request/submitted`** post-submit screen — needs manual testing to confirm it explains the magic-link follow-up.

### Trust signals

- Logo, location, IG handle, bio create a sense of identity.
- The legal links on the page footer (Terms / Privacy / Imprint / Powered by inklee) are present but low-contrast (`text-brand-bone/40`). For trust, that's enough; for compliance, it's correct (legal links not buried).
- The "Powered by inklee" link is small and unobtrusive. Good.

### Mobile (from code reading; needs real-device confirmation)

- Header is `max-w-lg` centered, padded; should render fine on 375px.
- Form inputs use `text-sm`; touch targets exist but the date inputs and slot picker may need a tap-target audit. (Needs manual testing.)

### Recommended improvements

1. **Pre-submit reassurance line** (XS, copy): one sentence above the submit button explaining "What happens next: you'll get a confirmation email with a link to edit or cancel before {artist} responds."
2. **Group form fields visually on mobile** (S): split into "Your tattoo" / "When" / "About you" sections with subtle headers. No new components needed; just `<section>` wrappers with a `text-xs uppercase` heading.
3. **Honor "I'll get back to you" voice consistently** across confirmation pages — manual test post-submit and email copy.

---

## G. Dashboard workflow findings

### Strengths

- Widget-driven dashboard with sensible defaults. Cards: Pending requests (count + top 3), Books status (open/closed/spots remaining), Upcoming (next 3 approved), Waitlist (count, shown only when > 0), Booking link, Analytics callout.
- Onboarding banner appears at top until `onboarding_completed === true`.
- "Add a short bio" nudge appears after onboarding if bio is still empty — a smart, time-shifted upsell. **This pattern should be replicated.**

### Weaknesses

1. **All-widgets-hidden state is a soft dead-end.** "All widgets are hidden. Configure dashboard." with a link to `/settings/dashboard`. Better: don't let the artist hide every widget. Force at least Pending Requests + Books Status to stay on. (S.)
2. **`BookingLinkWidget` is gated by a toggle.** For artists with zero received bookings this is precisely the widget that _most_ needs to be visible. Force-on while requests count is zero. (S.)
3. **Dashboard `<h1>` is the artist's display name** — that's pleasant, but the page has no second-level orientation. Consider a small subtitle that varies based on state: "Inbox: 3 pending" or "Books open · 8 spots remaining". (XS, conditional.)
4. **Status-string interpolation leaks `deposit_pending`** raw — see microcopy section. (XS.)
5. **The "View all" link on Pending requests** goes to `/bookings/overview?view=requests` — that's correct. But the "Calendar" link on Upcoming goes to `/bookings/calendar`, not `/bookings/overview?view=requests&status=approved`. Two different destinations from two adjacent cards is fine UX, but worth confirming via testing whether artists prefer the calendar or the list.

### Daily usability

- The pending-requests card shows only `@handle` and a "View all" link. Consider adding `placement` from `form_data` for at-a-glance triage. (XS.)
- The upcoming-card already shows placement when available — good. Consistency: bring the same treatment to pending. (XS.)

### Recommended improvements

1. **Force-on critical widgets** (S, dashboard server logic).
2. **Show placement in pending card rows** (XS, one line).
3. **Replace `status.replace("_", " ")` everywhere** with a human-status helper (XS, one helper function).
4. **Add a "post-onboarding celebration"** the first time the dashboard loads with `?just_finished=1` (S).

---

## H. Mobile UX findings

(_Code-level inference; verify on actual devices._)

### Strengths

- Bottom nav fixed, safe-area aware, 5 tabs, pill-style. Active state is mustard background + foreground text. Touch targets look adequate (`py-1.5` + icon + label).
- `MobileTopBar` exposes account + notifications (per layout import).
- The booking sub-nav (`BookingsNav`) renders only on mobile (`md:hidden`) — desktop relies on the sidebar's expanded sub-items. Clean.

### Risks

1. **Request-detail page on mobile.** Form data + custom answers + annotated images + audit log + status actions + communication sidebar. On a 375px width, the `CommunicationSidebar` and image gallery may compete vertically. **Needs real-device test.**
2. **Booking form length on phone.** See §F. Sectioning would help.
3. **No persistent "Share link" affordance on mobile.** Artists working from a phone have to navigate Dashboard → Booking Link widget (if enabled) or Bookings → Booking Form → Share. The mobile top bar could carry a small share icon. (S, but consider whether it adds clutter.)
4. **Action buttons sticky to bottom?** The submit button on `/[slug]` form is at the bottom; if the form is long enough the artist scrolls past the submit button as they fill it in. Sticky-footer pattern on mobile could help. (S, scoped to BookingForm.)

### Recommended improvements

1. **Real-device pass** on the request-detail page (Critical, needs manual test).
2. **Sticky-footer submit** on mobile public form (S).
3. **Share-link affordance** discoverable on mobile (XS — add to MobileTopBar or to dashboard widget set).

---

## I. Microcopy findings

### Tattoo-native wins to preserve

- "Fill in the details and I'll get back to you." — first-person artist voice.
- "Share this link with clients."
- "Your booking link" / "Structured requests" / "Review and approve" / "Stay organised" in welcome.
- "All in one place" framing on Overview.
- "Let clients queue while your books are closed." (waitlist intro)
- "Planning a guest spot? Add it here." (travel intro)
- "Flash: offer specific designs, not just time slots."

### Confusing or fixable copy

| Where                                                               | Current                                                              | Suggested                                                                            | Effort                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| Empty state in `/bookings/overview` for a non-`all` status          | `No deposit_pending requests.` (string-replace leaks underscore)     | `No requests awaiting deposit.`                                                      | XS, one helper                |
| `BookingForm` submit button label when pending                      | `Sending...`                                                         | `Sending your request…` (more reassuring; ellipsis char)                             | XS                            |
| Onboarding step 1 (claim-slug) progress label                       | `Profile`                                                            | `Link` or `URL`                                                                      | XS                            |
| Onboarding step 4 (`/onboarding/form`) heading (needs manual read)  | likely `Form`                                                        | `Your booking form`                                                                  | XS                            |
| `/bookings/booking-form` page H1                                    | `Booking Form`                                                       | `Your booking page` (the page also covers share link + appearance)                   | XS                            |
| `/bookings/settings` page H1 (likely "Booking Settings")            | `Booking Settings`                                                   | `Availability` or `Books`                                                            | XS                            |
| `/settings/dashboard` page label in sidebar                         | `Dashboard` (collides with top-level)                                | `Home widgets` or `Customize home`                                                   | XS                            |
| Dashboard "All widgets are hidden" fallback                         | `Configure dashboard`                                                | `Show some widgets again` (more recoverable tone)                                    | XS                            |
| Post-submit confirmation (`/request/submitted` — needs manual test) | unknown                                                              | Verify it tells the client about the magic-link follow-up                            | XS                            |
| `/bookings/overview` H1 + subtitle                                  | `Booking Overview` / `Requests, statuses, and clients in one place.` | Subtitle is good. H1 could be `Bookings` or `Inbox` to match the sidebar Inbox icon. | XS — needs founder taste call |

### Generic-SaaS leakage to fix

- The word "Manage" is overused (Manage booking settings / Manage your booking form / Configure dashboard). Tattoo-native alternatives: "Edit", "Set up", "Tweak". (XS, find-and-replace audit.)
- The word "Configure" — same.

### Missing helper text

- `/bookings/settings` — what does "booking window" mean? Probably needs a single-line helper. (XS, in-form helper.)
- `/onboarding/availability` — same question.
- `/settings/templates` — needs context for the artist who's never edited an email template.

---

## J. UI consistency findings

### Strong consistency

- Layout: every `(artist)` page uses the same shell — sidebar + workspace + top bar. The workspace is always a rounded card with charcoal/bone palette.
- Buttons: primary action is always `bg-brand-mustard text-brand-charcoal`. No deviation observed.
- Cards: `Card` + `CardHeader` + `IconChip` is the canonical pattern. Used consistently on the dashboard.
- Status badges: `StatusBadge` component is used in 3 contexts (overview list, dashboard pending card, request detail). Consistent.
- Form inputs: `bg-transparent border border-border` with `text-sm` and `focus:ring-1`. Consistent across signup, settings, /legal/report.

### Inconsistencies / smells

1. **Border alpha-overlap at corners** is in the open follow-ups (FU-2 in roadmap) — 5 fixes tried, all rolled back. Visible most on list containers. **Hold; not part of this audit.**
2. **Underline styles** — booking-form on `/[slug]` uses `underline underline-offset-4` for links; signup notice uses `no-underline`. This was a deliberate surgical decision (founder 2026-05-20) and should be honored. **Not an inconsistency to fix — but worth re-asserting that signup's no-underline is a singular case.**
3. **`/bookings/booking-form` and `/bookings/settings`** both render `space-y-10 max-w-2xl` and `space-y-6` patterns somewhat similarly. Should be consistent (both `max-w-2xl` or both `max-w-5xl`). (XS.)
4. **Empty states** vary in tone. The `/bookings/overview` empty state has a copy/preview CTA; `/dashboard` widgets have a one-line "No pending requests" with no CTA. Consider unifying: short message + minimal action where possible. (S.)
5. **Modal patterns** — `FeatureIntroModal` is custom (no shared `<Modal>` primitive). `AnnotationModal` likely also custom. Worth checking whether they share trap-focus / Escape-key behavior. **Needs manual testing.**

### Visual hierarchy

- The "primary action" pattern (mustard background) is used cleanly. Secondary CTAs use border-only outline buttons — consistent.
- Section headers in `/bookings/booking-form` use a `text-xs uppercase tracking-[0.14em] text-muted-foreground` pattern — a small but distinctive hierarchy marker. Same on the sidebar group headers. Good consistency.

### Loading + error states

- I observed minimal loading-state code in the dashboards (server-rendered with await). For server-rendered pages this is acceptable. For client-side action submissions, the action-state `pending` toggling button text is the consistent pattern.
- Error states on auth pages, signup, /legal/report all use `text-destructive`. Consistent.

---

## K. Prioritized UX improvement list

Each item has: priority (Critical/High/Medium/Low), effort (XS/S/M/L), affected files, problem, recommendation, expected benefit, risk.

### Critical

| #      | Effort               | Where                                                                          | Problem                                                                                                                       | Recommendation                                                                                                                                                  | Benefit                       | Risk                                                                     |
| ------ | -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| **K1** | S                    | `src/app/(artist)/dashboard/page.tsx`                                          | First-time and zero-request artists may not see the booking-link widget if it's toggled off. The link is the product's value. | Force `BookingLinkWidget` to render whenever the artist has zero received requests OR whenever onboarding just completed, regardless of `widgets.booking_link`. | Higher first-share rate.      | Low — the widget already exists; toggle override is a small conditional. |
| **K2** | XS                   | `src/app/(artist)/bookings/overview/page.tsx`, anywhere status is interpolated | `status.replace("_", " ")` leaks `deposit_pending` as raw text in empty-state copy.                                           | Create `humanStatusLabel(status)` returning friendly strings, use everywhere.                                                                                   | Less ugly copy; better trust. | None.                                                                    |
| **K3** | needs manual testing | `/[slug]` booking-form on real iOS/Android                                     | Long form on mobile may make the submit button hard to reach.                                                                 | Manual test; add sticky-footer submit on mobile if confirmed painful.                                                                                           | Higher completion.            | Sticky footers can clash with safe-area / keyboard.                      |

### High

| #      | Effort | Where                                                                | Problem                                                                                                                     | Recommendation                                                                                                                                                                                              | Benefit                                            | Risk                                                                          |
| ------ | ------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| **K4** | S      | `src/components/app-shell/nav-config.ts` + `settings-nav.tsx`        | Half of Settings is hidden from the sidebar. Artists can't find Slots/Books/Fields/Reminders/Templates without typing URLs. | Add a `/settings` landing page (replace the redirect-to-profile) listing every settings category. Optionally expand the sidebar sub-items to include the high-value ones (Books, Slots, Fields, Reminders). | Discoverability of half the settings.              | Adds vertical weight to the sidebar — manage with care.                       |
| **K5** | XS     | `nav-config.ts` Settings sub-items + the `/settings/dashboard` route | "Settings → Dashboard" sub-item name collides with top-level "Dashboard".                                                   | Rename sub-item to "Home widgets". (Page title can stay or also rename.)                                                                                                                                    | Eliminates the name collision.                     | None.                                                                         |
| **K6** | XS     | `OnboardingProgress` STEPS constant                                  | Step 1 is labeled "Profile" but the page is claim-slug.                                                                     | Rename to "Link" (or "URL").                                                                                                                                                                                | Less mid-onboarding confusion.                     | None.                                                                         |
| **K7** | S      | `src/app/(artist)/dashboard/page.tsx`                                | After `/onboarding/done`, the dashboard loads but there's no celebratory "you're set up" moment beyond removing the banner. | Detect `?just_finished=1` query (set by onboarding done page) and render a one-time card: "Your booking link is live — share it now." with copy/preview/Instagram-bio CTAs.                                 | Stronger sense of completion + drives first share. | Low — single-shot card with no state.                                         |
| **K8** | S      | `/bookings/booking-form/page.tsx` + `/settings/fields/page.tsx`      | Form fields appear in two places.                                                                                           | Verify they're the same data (very likely they are). Make `/settings/fields` redirect to `/bookings/booking-form#fields`, or remove from the IA.                                                            | One canonical place to manage fields.              | Needs manual confirmation that they edit the same `custom_fields` table rows. |
| **K9** | S      | `/bookings/settings` vs `/settings/books`                            | Likely two routes for the same books-open/cap/window mental model.                                                          | Needs manual confirmation. If duplicate, redirect one to the other.                                                                                                                                         | Removes a fork in the artist's mental model.       | Same — needs DB-level confirmation.                                           |

### Medium

| #       | Effort | Where                                              | Problem                                                                                             | Recommendation                                                                                                                                                           | Benefit                                 | Risk                                                                                             |
| ------- | ------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **K10** | XS     | `BookingForm` `/[slug]` booking-form, above submit | No explicit "what happens after submit" reassurance visible without expanding the Section 8 notice. | Add a one-line "You'll get a confirmation email with a link to edit or cancel before {artist} replies." just above the submit button.                                    | Higher trust at the moment of decision. | None.                                                                                            |
| **K11** | S      | `/[slug]` booking-form on mobile                   | The form is long; visual grouping would help.                                                       | Wrap fields into 2–3 `<section>` blocks with `text-xs uppercase` headers ("Your tattoo", "When", "About you"). No new components.                                        | Scannability + completion.              | Sections must respect the artist's enabled fields — if a section ends up empty, hide its header. |
| **K12** | XS     | Dashboard pending-requests card                    | Only handle visible; no triage signal.                                                              | Show `form_data.placement` in the row below the handle (consistent with the upcoming card).                                                                              | Faster glance triage.                   | None.                                                                                            |
| **K13** | M      | `/travel` TripManager                              | Trip→Leg→Studio model is more granular than artists think.                                          | For the single-trip case, present a one-form quick-add ("City, dates, studio") that internally creates a 1-leg trip. Keep the full Trip/Legs editor for multi-leg cases. | Less cognitive overhead.                | Medium — UI refactor of TripManager.                                                             |
| **K14** | XS     | Anywhere "Manage" / "Configure" appears            | Generic-SaaS verbs.                                                                                 | Find/replace: "Edit", "Set up", "Tweak".                                                                                                                                 | Tattoo-native voice consistency.        | Run a quick search to make sure no third-party text is touched.                                  |
| **K15** | XS     | `/dashboard` "All widgets are hidden" fallback     | Soft dead-end.                                                                                      | Disallow hiding the Pending-Requests + Books-Status widgets in `/settings/dashboard`.                                                                                    | No more empty dashboard.                | None.                                                                                            |

### Low

| #       | Effort | Where                                                             | Problem                                                                          | Recommendation                                                                                                      | Benefit                              | Risk                                                                                                       |
| ------- | ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **K16** | XS     | `/bookings/page.tsx`                                              | Double-hop redirect (`/bookings` → `/bookings/requests` → `/bookings/overview`). | Redirect `/bookings` directly to `/bookings/overview`.                                                              | Cleaner network trace, no UX impact. | None.                                                                                                      |
| **K17** | XS     | `src/app/(artist)/dashboard/{calendar,clients,waitlist,requests}` | Dead redirect stubs from a prior IA.                                             | Delete after confirming no one bookmarks them.                                                                      | Less code surface.                   | Low — old bookmarks would 404; mitigate by keeping the redirects but moving to `next.config.ts` redirects. |
| **K18** | S      | `/help`                                                           | Lives at top level; not linked from the artist shell footer/header.              | Add a small Help link in `MobileTopBar` (and the desktop top bar).                                                  | Discoverable support.                | None.                                                                                                      |
| **K19** | S      | `/settings/dashboard` widget toggles                              | Toggles for hide/show widgets are buried in Settings.                            | Add a small "Customize" link at the bottom-right of the dashboard that opens the widget settings inline (or links). | Less digging.                        | Medium — depends on whether inline editing is worth the complexity. Keep as a link for now.                |
| **K20** | XS     | `BookingLinkWidget`                                               | Worth confirming this includes a QR-code mode for printed material.              | Manual test only.                                                                                                   | —                                    | —                                                                                                          |

---

## L. Best low-effort wins

If you can only ship 6 things this week, these are the highest-ROI:

1. **K2 — `humanStatusLabel(status)` helper.** XS effort, fixes leakage in 3+ surfaces.
2. **K6 — Rename onboarding step 1 from "Profile" to "Link".** XS, fixes a real conceptual confusion at step 1.
3. **K5 — Rename "Settings → Dashboard" sub-item to "Home widgets".** XS, removes a name collision.
4. **K10 — Add a "what happens next?" line above the public-form submit.** XS, real trust win.
5. **K1 — Force-on the BookingLinkWidget while requests count = 0.** S, possibly the single highest-impact change for first-share rates.
6. **K7 — `?just_finished=1` celebration card on the dashboard.** S, gives the onboarding a real success moment.

Total estimated effort: **a handful of hours** (most XS + 2 S).

---

## M. Strongest product-flow recommendation

**One sentence:** _Treat the booking link as the spine of the product, and make every artist surface explicitly answer "what do I do with my booking link right now?"_

**What that means concretely (without redesigning):**

1. **On the dashboard:** the booking-link widget is unconditional for artists with zero received requests. After the first request arrives, the widget can fade behind the pending-requests card (which becomes the primary action surface).
2. **On the booking-form admin page:** the "Share this link" section already leads the page — good. Keep that.
3. **In onboarding's last step:** the `done` page already focuses on logo upload + "your link is ready" — make that the explicit moment ("Open in a new tab", "Copy", "QR for print").
4. **In the empty-state of `/bookings/overview`:** the copy/preview CTAs are already there — keep them.
5. **On mobile:** a small share icon in the top bar would let the artist demo the page or copy the link without navigating.

Inklee's value isn't really _one feature_ — it's the _one link_. Every part of the artist shell should re-assert that, gently. That's the cohesion lever.

Beyond that, the secondary cohesion lever is **Settings**: consolidate the dozen routes behind a single discoverable landing, kill the name collision with the top-level Dashboard, and surface the high-traffic settings (Books, Slots, Fields, Reminders) in the sidebar. That's not a redesign — it's the existing IA finishing the job it half-did.

Everything else in §K is polish on top of those two structural moves.

---

## Final notes (for the synthesis step)

- This audit is grounded in actual code reading, not assumptions. Where I flagged "needs manual testing", that's because the code path was visible but the UX behaviour could only be verified by interacting with the live app or running a real device.
- I deliberately did **not** read the other agent's audit before writing this.
- I deliberately did **not** recommend a redesign. Most items are XS or S. The two largest items (K4 settings IA + K13 trip-quick-add) are scoped to specific pages.
- Items I explicitly held back from recommending because they would over-reach beyond the brief: any new database schema, a new admin Stripe surface (that's Slice 60e — separate planning), a new "trips list on the public page" feature (no UX evidence it's needed), or any change to the legal/marketing pages.
- The biggest item the audit can't resolve on its own is whether **Flash** should remain a top-level sidebar item. That's a founder taste call grounded in expected feature usage. Flagged for the synthesis discussion.
