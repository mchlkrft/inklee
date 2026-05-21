# Codex Independent UX Audit - Inklee

Phase 1 independent audit. I inspected the codebase, route structure, product flows, Supabase data usage, UI components, and live sampled the local app at `/`, `/start`, `/bert-grimm`, `/signup`, and protected `/dashboard` redirect behavior. I did not read or depend on another agent's audit.

## A. Executive Summary

### Overall UX Health Rating

**6.5 / 10**

Inklee has strong product bones: it understands the tattoo booking problem, the core public request form works, the artist request review flow exists, and travel, waitlist, deposits, flash, reminders, and calendar support are already wired into the product surface. The main weakness is not lack of features. The main weakness is that the current app presents these features as several adjacent modules instead of one clear booking loop.

### Main UX Strengths

- The central promise is strong and tattoo-specific: replace messy Instagram DMs with structured tattoo requests.
- The public artist page is simple, recognizable, and trustable enough for early client use.
- The request detail page captures many of the right tattoo decision inputs: handle, email, placement, size, date, references, description, custom answers, images, annotations, and location context.
- Books-open/books-closed, waitlist, fixed slots, preferred dates, travel tagging, and flash bookings are not just marketing ideas; they exist in the data model and product flow.
- The visual language has some Inklee personality: charcoal, bone, muted warm colors, strong borders, hand-drawn brand assets, and copy that often references DMs, books, flash, guest spots, and tattoo workflow.
- The app already has route redirects from older surfaces, which helps avoid hard breaks while the product shape evolves.

### Main UX Weaknesses

- The product does not yet make the core loop obvious enough: set up booking link, share link, receive request, review, accept/pass/deposit, organize approved bookings, collect waitlist demand when books are closed.
- Navigation mixes daily work, setup work, optional tools, and advanced features. `Bookings`, `Booking Settings`, `Booking Form`, `Settings`, `Travel`, `Flash`, `Analytics`, and `Notifications` compete for attention before the user knows what matters.
- First-time setup asks meaningful but abstract decisions too early, especially preferred dates versus fixed slots, without enough "which one fits my tattoo workflow?" framing.
- Empty states are uneven. Some are helpful, some are sparse, and some point through redirect routes rather than directly to the current product surface.
- Daily request review has the data, but the action model is under-explained. Artists need clearer confidence around what "Approve", "Reject", and "Request deposit" do next.
- Traveling and waitlist workflows are valuable but feel under-connected. City demand, trip setup, visible guest spots, and trip-filtered requests should feel like one guest spot workflow.
- Mobile is usable at the shell level but risky in the dense screens that matter most: request lists, request detail actions, calendar, waitlist rows, slot setup, and field reordering.
- Some public marketing/dev surfaces still contain placeholders, including `/start` and SEO pages such as `/dm-chaos` and `/guest-spots`. That can reduce trust before beta.

### Biggest User-Flow Risks

- **A new artist may finish onboarding without understanding the next best step.** The app should push them toward "preview your booking page" and "put this link in your Instagram bio", not just deposit them in a multi-module dashboard.
- **Fixed slots can create a bad first public impression.** If the artist chooses fixed slots but has not added slots, clients see a closed-books/waitlist state, which can feel like the form is broken or the artist is unavailable.
- **Request decisions do not explain consequences.** Approving, rejecting, requesting a deposit, and cancelling should clearly say whether the client gets an email, whether the request becomes a calendar booking, and whether the artist can undo or follow up.
- **Guest spot visibility is too abstract.** Artists can create trips and show them on the public form, but the UI does not make it obvious exactly how clients will encounter those city/date options.
- **Waitlist conversion can feel too magical.** "Convert" creates an approved booking-like record from a waitlist entry, but the artist may not yet have placement, size, date, or a real booking agreement.
- **Mobile review flow may hide the decision controls below too much detail.** Artists who work from their phone need the request summary and actions to stay close together.

### Beta Readiness

Inklee is ready for a **controlled artist beta with guided onboarding and close support**, especially for artists using preferred-date request intake. It is not yet ready as a fully self-serve beta for non-technical artists because the product structure and setup flow still require too much interpretation.

### Coherence Judgment

Inklee currently feels like **a promising tattoo booking tool with several strong modules**, not yet one completely coherent product experience. The fix does not require a rebuild. It needs clearer naming, guided empty states, tighter setup-to-share flow, better request action copy, and stronger connective tissue between books, requests, calendar, waitlist, and travel.

## B. Discovered Product Surface

### Route And Page Inventory

| Area            | Name                                      | Location                                                            | User-facing purpose                                                           | Status                                   | Include in UX plan                   |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------ |
| Marketing       | Homepage                                  | `src/app/page.tsx`                                                  | Explains Inklee as tattoo booking software and links to signup/live example.  | working                                  | Yes, low priority                    |
| Marketing       | Start page                                | `src/app/start/page.tsx`                                            | More direct conversion page around Instagram DM chaos.                        | partially working                        | Yes, public trust issue              |
| Marketing       | About                                     | `src/app/about/page.tsx`                                            | Product/company explanation.                                                  | working                                  | Low priority                         |
| Marketing       | Help                                      | `src/app/help/page.tsx`                                             | FAQ/help content.                                                             | partially working                        | Yes, copy consistency                |
| Marketing/SEO   | DM chaos                                  | `src/app/dm-chaos/page.tsx`                                         | SEO/content page for replacing Instagram DMs.                                 | partially working                        | Low priority                         |
| Marketing/SEO   | Guest spots                               | `src/app/guest-spots/page.tsx`                                      | SEO/content page for traveling tattoo artists.                                | partially working                        | Low priority                         |
| Marketing/SEO   | Guest spot booking                        | `src/app/guest-spot-booking/page.tsx`                               | Landing page around guest spot booking.                                       | working/unclear                          | Low priority                         |
| Marketing/SEO   | Instagram booking link                    | `src/app/instagram-booking-link-for-tattoo-artists/page.tsx`        | SEO page for Instagram bio link use case.                                     | working/unclear                          | Low priority                         |
| Marketing/SEO   | Tattoo booking form                       | `src/app/tattoo-booking-form/page.tsx`                              | SEO page for form use case.                                                   | working/unclear                          | Low priority                         |
| Marketing/SEO   | Tattoo booking software                   | `src/app/tattoo-booking-software/page.tsx`                          | SEO page for category.                                                        | working/unclear                          | Low priority                         |
| Marketing/SEO   | Comparison pages                          | `src/app/tattoo-booking-software-vs-*`                              | Comparisons against Calendly, Google Forms, Instagram DMs.                    | working/unclear                          | No immediate product UX              |
| Marketing/SEO   | Waitlist page                             | `src/app/tattoo-artist-waitlist/page.tsx`                           | SEO page for waitlist.                                                        | working/unclear                          | Low priority                         |
| Marketing/SEO   | Deposit tool page                         | `src/app/tattoo-deposit-tool/page.tsx`                              | SEO page for deposits.                                                        | partially working                        | Low priority                         |
| Legal           | Terms, Privacy, DPA, AUP, Imprint, Report | `src/app/(legal)`, `src/app/legal/report`                           | Compliance and abuse report surfaces.                                         | working                                  | No, except public trust link clarity |
| Auth            | Signup                                    | `src/app/(auth)/signup/page.tsx`                                    | Email/password and Google account creation.                                   | working                                  | Yes, first-time flow                 |
| Auth            | Login                                     | `src/app/(auth)/login/page.tsx`                                     | Email/password and Google login.                                              | working                                  | Yes, entry clarity                   |
| Auth            | Forgot/reset password                     | `src/app/(auth)/forgot-password`, `src/app/(auth)/reset-password`   | Account recovery.                                                             | working/unclear                          | Low priority                         |
| Auth            | Callback/confirm/MFA                      | `src/app/auth/callback`, `src/app/auth/confirm`, `src/app/auth/mfa` | Auth callback and MFA.                                                        | working/unclear                          | Low priority                         |
| Protected shell | Artist app layout                         | `src/app/(artist)/layout.tsx`, `src/components/app-shell/*`         | Desktop sidebar, topbar, mobile topbar, bottom nav.                           | working                                  | Yes, high priority                   |
| Dashboard       | Overview dashboard                        | `src/app/(artist)/dashboard/page.tsx`                               | Summary cards, setup banners, booking link, pending/upcoming/waitlist counts. | working                                  | Yes, critical                        |
| Onboarding      | Welcome                                   | `src/app/(artist)/onboarding/welcome/page.tsx`                      | Introduces onboarding.                                                        | working                                  | Yes, critical                        |
| Onboarding      | Claim slug/profile                        | `src/app/(artist)/onboarding/claim-slug/page.tsx`                   | Display name, public slug, Instagram, location.                               | working                                  | Yes, critical                        |
| Onboarding      | Booking mode                              | `src/app/(artist)/onboarding/booking/page.tsx`                      | Choose preferred dates or fixed slots.                                        | working but risky                        | Yes, critical                        |
| Onboarding      | Availability                              | `src/app/(artist)/onboarding/availability/page.tsx`                 | Books open/closed settings.                                                   | working                                  | Yes, high                            |
| Onboarding      | Form setup                                | `src/app/(artist)/onboarding/form/page.tsx`                         | Choose standard form fields.                                                  | working                                  | Yes, high                            |
| Onboarding      | Done                                      | `src/app/(artist)/onboarding/done/page.tsx`                         | Completion and logo upload.                                                   | working                                  | Yes, critical                        |
| Bookings        | `/bookings` redirect                      | `src/app/(artist)/bookings/page.tsx`                                | Redirects to requests then overview.                                          | hidden                                   | Yes, cleanup mental model            |
| Bookings        | Overview/requests/clients                 | `src/app/(artist)/bookings/overview/page.tsx`                       | Request inbox and client list tab.                                            | working                                  | Yes, critical                        |
| Bookings        | Request detail                            | `src/app/(artist)/bookings/requests/[id]/page.tsx`                  | Review one booking request.                                                   | working                                  | Yes, critical                        |
| Bookings        | Status actions                            | `src/app/(artist)/bookings/requests/[id]/status-actions.tsx`        | Approve, reject, request/mark deposit, status transitions.                    | working but under-explained              | Yes, critical                        |
| Bookings        | Communication sidebar                     | `src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx` | Reminders and activity.                                                       | partially working                        | Yes, medium                          |
| Bookings        | Calendar                                  | `src/app/(artist)/bookings/calendar/page.tsx`, `calendar-view.tsx`  | Approved bookings and manual appointments.                                    | working                                  | Yes, high                            |
| Bookings        | Appointment drawer/modal                  | `appointment-drawer.tsx`, `new-appointment-modal.tsx`               | View/cancel bookings, create appointments.                                    | working                                  | Yes, medium                          |
| Bookings        | Waitlist                                  | `src/app/(artist)/bookings/waitlist/page.tsx`                       | Review waitlist entries and city demand.                                      | working but under-connected              | Yes, high                            |
| Bookings        | Booking settings                          | `src/app/(artist)/bookings/settings/page.tsx`                       | Books open/closed, request cap, booking mode, slots.                          | working                                  | Yes, critical                        |
| Bookings        | Availability form                         | `availability-form.tsx`                                             | Books status and public closed message.                                       | working                                  | Yes, high                            |
| Bookings        | Booking mode form                         | `booking-mode-form.tsx`                                             | Preferred dates vs fixed slots.                                               | working but risky                        | Yes, high                            |
| Bookings        | Slot builder/list                         | `src/app/(artist)/bookings/slots/*`, `slot-pattern-builder.tsx`     | Create fixed availability slots.                                              | working/unclear mobile                   | Yes, high                            |
| Bookings        | Booking form settings                     | `src/app/(artist)/bookings/booking-form/page.tsx`                   | Share link, QR, field toggles/reordering, appearance.                         | working                                  | Yes, critical                        |
| Bookings        | Form field manager                        | `src/app/(artist)/bookings/form/*`                                  | Standard/custom fields and settings actions.                                  | working                                  | Yes, high                            |
| Public client   | Artist public page                        | `src/app/[slug]/page.tsx`                                           | Public booking page with artist profile, studio/trip info, form/closed state. | working                                  | Yes, critical                        |
| Public client   | Booking form                              | `src/app/[slug]/booking-form.tsx`                                   | Client tattoo request submission.                                             | working                                  | Yes, critical                        |
| Public client   | Closed books block                        | `src/app/[slug]/books-closed-block.tsx`                             | Explains closed state and exposes waitlist.                                   | working but generic                      | Yes, high                            |
| Public client   | Waitlist form                             | `src/app/[slug]/waitlist-form.tsx`                                  | Client joins waitlist.                                                        | working                                  | Yes, high                            |
| Public client   | Annotation modal                          | `src/app/[slug]/annotation-modal.tsx`                               | Add notes to reference images.                                                | working/unclear mobile                   | Yes, medium                          |
| Public client   | Request submitted                         | `src/app/request/submitted/page.tsx`                                | Confirmation after public request.                                            | working                                  | Yes, high                            |
| Public client   | Client request portal                     | `src/app/request/[token]/page.tsx`, `customer-portal.tsx`           | View/edit/cancel request, pay deposit.                                        | working/partial                          | Yes, medium                          |
| Travel          | Trip planner                              | `src/app/(artist)/travel/page.tsx`, `trip-manager.tsx`              | Create trips, stops, visible guest spots.                                     | working but abstract                     | Yes, high                            |
| Travel          | Studio library                            | `src/app/(artist)/travel/studio-list.tsx`                           | Save studio/location records for trips.                                       | working                                  | Yes, medium                          |
| Flash           | Flash items                               | `src/app/(artist)/flash/items/*`                                    | Create and manage bookable flash designs.                                     | working/advanced                         | Maybe, not first                     |
| Flash           | Flash days                                | `src/app/(artist)/flash/days/*`                                     | Create flash events.                                                          | working/advanced                         | Maybe, not first                     |
| Flash           | Instagram                                 | `src/app/(artist)/flash/instagram/*`                                | Connect/import Instagram posts.                                               | partially working/depends on integration | Low priority                         |
| Public flash    | Flash gallery/item                        | `src/app/[slug]/flash/*`                                            | Public flash item browsing and flash request form.                            | working/unclear                          | Low priority                         |
| Analytics       | Analytics                                 | `src/app/(artist)/analytics/page.tsx`                               | Request, conversion, deposit, return metrics.                                 | working but premature                    | Low priority                         |
| Notifications   | Notifications                             | `src/app/(artist)/notifications/page.tsx`, `notification-bell.tsx`  | Activity, warnings, reminders.                                                | working                                  | Medium                               |
| Settings        | Profile                                   | `src/app/(artist)/settings/profile/page.tsx`                        | Public profile, images, bio, location, timezone.                              | working                                  | Yes, high                            |
| Settings        | Emails/reminders                          | `src/app/(artist)/settings/emails/page.tsx`                         | Email templates and reminder settings.                                        | working but technical                    | Yes, medium                          |
| Settings        | Calendar/iCal                             | `src/app/(artist)/settings/calendar/page.tsx`                       | Calendar export.                                                              | working                                  | Medium                               |
| Settings        | Dashboard widgets                         | `src/app/(artist)/settings/dashboard/page.tsx`                      | Customize dashboard cards.                                                    | working but premature                    | Low priority                         |
| Settings        | Account/security                          | `src/app/(artist)/settings/account/page.tsx`                        | User profile, email, password, MFA.                                           | working/unclear                          | Low priority                         |
| Admin           | Admin console                             | `src/app/admin/*`                                                   | Account/admin management.                                                     | hidden                                   | No product UX                        |
| Dev             | Dev pages                                 | `src/app/dev/*`                                                     | Internal tooling/testing.                                                     | hidden                                   | No                                   |

### Redirected, Duplicate, Hidden, Or Partial Surfaces

| Item                                                 | Location                                                                                                                                                | What I found                                                                                                     | Status                 | Include in plan                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| Old dashboard request/calendar/client/waitlist pages | `src/app/(artist)/dashboard/requests`, `calendar`, `clients`, `waitlist`                                                                                | Older feature locations still exist beside new bookings routes. Some redirect, some duplicate components remain. | hidden/dead code       | Yes, IA cleanup awareness                  |
| Booking route redirect chain                         | `/bookings` -> `/bookings/requests` -> `/bookings/overview`                                                                                             | Users and links can hit multiple redirects before the real page.                                                 | hidden                 | Yes                                        |
| Old settings route redirects                         | `/settings/books`, `/settings/slots`, `/settings/fields`, `/settings/templates`, `/settings/reminders`, `/settings/calendar-export`, `/settings/travel` | Redirects preserve older URLs but reflect previous IA.                                                           | hidden                 | Yes, link hygiene                          |
| Public page route redirect                           | `/bookings/public-page` -> `/bookings/booking-form`                                                                                                     | Public page setup is effectively part of booking form settings.                                                  | hidden                 | Yes, naming                                |
| Legacy travel table                                  | `src/db/schema.ts` `travel_legs`                                                                                                                        | Schema still has older travel-leg concept while UI uses `trips`, `trip_legs`, `studios`.                         | backend-only/dead code | No immediate UX, note for architecture     |
| Deposit product                                      | `booking_requests` deposit fields, Stripe webhook/API, request status actions, client portal payment                                                    | Deposits are partly in workflow, but availability depends on Stripe setup and copy is thin.                      | partially working      | Yes, clarify as optional                   |
| Instagram import                                     | `instagram_accounts`, `instagram_posts`, `/api/instagram/callback`, flash Instagram UI                                                                  | Appears integration-dependent and advanced.                                                                      | partially working      | Not first                                  |
| Feature intro modal system                           | `src/components/feature-intro-modal.tsx`                                                                                                                | Explains overview/waitlist/travel/flash, sometimes triggered from empty pages.                                   | working                | Yes, but should not carry onboarding alone |
| Marketing screenshot placeholders                    | `/start`, `/dm-chaos`, `/guest-spots`, `PlaceholderVisual`                                                                                              | Live `/start` exposes "Replace these with real screenshots once available."                                      | UI-only/partial        | Yes, public trust                          |

### Data And Workflow Inventory

| Domain                       | Data/API locations                                             | User-facing purpose                           | UX status                                        |
| ---------------------------- | -------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Profiles/public identity     | `profiles` table, profile settings, onboarding claim slug      | Artist public page identity and booking link. | Essential and mostly clear                       |
| Booking requests             | `booking_requests`, public actions, artist actions             | Core request intake and review.               | Strong but action copy needs clarity             |
| Reference images/annotations | `booking_images`, storage, annotation modal/gallery            | Tattoo reference materials and body notes.    | Tattoo-native, needs mobile QA                   |
| Custom fields                | `custom_fields`, form settings, public custom inputs           | Artist-specific intake questions.             | Useful, field setup can feel technical           |
| Slots                        | `slots`, booking mode, slot builder                            | Fixed availability booking.                   | Useful but risky if no slots are added           |
| Trips/studios                | `trips`, `trip_legs`, `studios`, travel actions                | Guest spot and travel context.                | Valuable but abstract                            |
| Waitlist                     | `waitlist_entries`, public waitlist form, artist waitlist page | Collect demand when books closed/full.        | Useful but under-connected                       |
| Flash                        | `flash_items`, `flash_days`, public flash routes               | Flash design bookings and flash events.       | Advanced/secondary                               |
| Client notes                 | `client_notes`, client detail pages                            | Lightweight client memory.                    | Useful but hidden inside clients                 |
| Notifications                | `notifications`, bell/page/actions                             | Activity and system prompts.                  | Supportive but not primary                       |
| Emails/reminders             | Resend, template/reminder settings, cron reminders             | Client communication.                         | Valuable, but template variables feel technical  |
| Deposits                     | Stripe, deposit fields/status, deposit emails, client portal   | Deposit request/payment.                      | Partial/optional; copy needs expectation-setting |
| Calendar export              | `/api/ical/[token]`, settings calendar                         | External calendar sync.                       | Practical support feature                        |

## C. User Journey Map

### 1. First-Time Tattoo Artist

**User goal:** Quickly understand what Inklee does, set up a booking link, and know what to share in Instagram.

**Current steps:**

1. Artist lands on `/` or `/start`.
2. Clicks signup, creates account with email/password or Google.
3. Enters onboarding: welcome, public identity/slug, booking mode, availability, form fields, done.
4. Lands in dashboard with setup banners, summary cards, and booking link.
5. May visit Booking Form, Booking Settings, Profile, Travel, Flash, or Settings without a clear order.

**Friction points:**

- Signup itself is simple, but the signup page has little reminder of what happens after account creation.
- Choosing booking mode early may be hard. "Preferred dates" versus "fixed slots" is a real workflow decision, not just a setting.
- Fixed slots can produce a closed public form if no slots are added. That creates a bad first share-link moment.
- Dashboard "Overview" does not strongly say "your next step is to preview/share your booking link."
- Flash, analytics, notifications, settings, travel, and booking setup are all visible quickly; new users may read Inklee as a broader business OS.

**Unclear moments:**

- What does Inklee expect me to configure before sharing?
- Does "books open" mean clients can request anything, or that I have available appointment slots?
- If I choose fixed slots, where do I add the slots before sharing?
- Which page controls my public profile versus my booking form?
- Are deposits live now or something I can set up later?

**Missing guidance:**

- A lightweight setup checklist anchored around outcomes: public name/slug, booking mode, books open/slots, form fields, preview, copy link.
- A first-success moment after onboarding: "Your booking link is ready. Preview it, then add it to Instagram."
- A safer warning for fixed slots with no slots: "Add at least one slot before sharing."
- Contextual explanation that Flash, Travel, Waitlist, Email Templates, Analytics are optional later tools.

**Improvement opportunities:**

- Add a persistent "booking link readiness" checklist to onboarding done/dashboard/booking-form.
- Rename setup pages around user intent: "Books & Availability", "Booking Link & Form", "Public Profile".
- Add a guided empty dashboard for accounts with zero requests.
- Keep analytics/flash as secondary until a user has the core booking link working.

### 2. Daily Tattoo Artist

**User goal:** Open Inklee, see new requests, decide what to take, manage accepted bookings, and keep clients organized.

**Current steps:**

1. Artist opens dashboard.
2. Sees pending count and clicks Booking Overview.
3. Filters requests by status/trip or switches to clients.
4. Opens a request detail page.
5. Reviews details, images, custom answers, deposit panel, metadata, and communication sidebar.
6. Approves, rejects, requests deposit, sends reminders, or later checks calendar.

**Friction points:**

- Request list is table-driven; on mobile it hides columns rather than becoming a decision-friendly card list.
- The request detail page is data-rich but could scan better as "idea", "logistics", "client", "references", "history/actions."
- Approval/rejection/deposit actions do not explain consequences at the moment of action.
- "Approve" is generic. Tattoo artists may think more in terms of "accept the request", "pass for now", or "ask for deposit."
- Deposit request needs clearer wording about whether it emails the client, creates a payment link, or just marks a status.
- Communication sidebar is useful but visually separate from the main decision.

**Unclear moments:**

- Does approving automatically email the client?
- Does approving create a calendar booking if the client only gave a preferred date?
- Can a rejected request go to waitlist instead?
- Where does a deposit-pending request live in the daily workflow?
- What should the artist do after accepting a preferred-date request if the exact time is not finalized?

**Missing guidance:**

- Action helper text: "Client gets an email", "This adds it to your approved bookings", "Use deposit if you want payment before confirming."
- After-action success states with next links: "View in calendar", "Back to requests", "Send follow-up."
- Better mobile placement of status actions near the summary.

**Improvement opportunities:**

- Turn request review into a clearer decision page without changing the data model.
- Add one-line explanations under each primary action.
- Add mobile cards for requests and waitlist rows.
- Add filter labels that map to artist decisions: New, Accepted, Deposit needed, Passed, Cancelled.

### 3. Traveling / Guest Spot Artist

**User goal:** Tell clients where and when they are booking, collect location-aware requests, and understand demand by city.

**Current steps:**

1. Artist opens Travel.
2. Creates studios and trips with stops/date ranges.
3. Chooses whether trip appears on the public form.
4. Public page shows active trip information when relevant.
5. Preferred-date form attaches a trip after client selects a date that overlaps a trip.
6. Fixed-slot form can tag a slot with trip/studio context.
7. Artist filters requests by trip and can review waitlist city demand separately.

**Friction points:**

- "Trip Planner" is understandable, but the product value is "guest spots" and "travel requests." The page should lead with that.
- "Show on booking form" does not explain where/when clients will see it.
- The public form does not proactively show a visible guest spot schedule; clients discover location context mostly through date selection.
- Waitlist city demand exists but is not connected to planning the next trip.
- Travel and studio library are in one page, which may be practical but can feel like setup complexity before the value is obvious.

**Unclear moments:**

- Will clients see all future trips or only the currently active trip?
- What happens if a client picks a date outside my trip dates?
- Do trip stops affect fixed slots, preferred dates, or both?
- Should I create studios first or trips first?
- Can I use waitlist demand to choose cities?

**Missing guidance:**

- A short flow at the top of Travel: "Create trip -> add stops/dates -> show it on your booking page -> requests get tagged by city/date."
- A preview link to the public page after enabling a visible trip.
- Demand CTA from waitlist: "Use this city demand when planning guest spots" or link to Travel.

**Improvement opportunities:**

- Rename Travel to "Guest Spots" or "Travel / Guest Spots" in the app shell.
- Add helper copy around trip visibility and request tagging.
- Connect waitlist city demand and Travel with cross-links.
- Keep studio library secondary on the page; present it as saved places for guest spots.

### 4. Client Submitting A Request

**User goal:** From Instagram, land on the artist's page, understand what to submit, trust the form, and know what happens next.

**Current steps:**

1. Client opens public artist page from a link.
2. Sees artist name, location/Instagram, bio, studio info, active trip if applicable.
3. Sees "Booking request" and helper "Fill in the details and I'll get back to you."
4. Completes Instagram handle, email, reference link, placement, size, description, images, preferred date/slot.
5. Submits request.
6. Lands on submitted page with reference ID and optional email reminder.
7. May later use client portal link to view/edit/cancel/pay deposit.

**Friction points:**

- Field order starts with reference link before the core idea. This can interrupt natural client thinking.
- The form is tattoo-specific but the heading is generic. "Booking request" does not fully frame "tell me your tattoo idea."
- There is not enough immediate copy saying "this is not a confirmed booking until the artist accepts."
- Live snapshot showed size label text can collapse in accessible text (`Palm-sized~ 5 cm`, `Larger20 cm+`), which needs visual and accessibility QA.
- An unlabeled extra textbox appears in the live snapshot after preferred date, likely honeypot or date helper, and should be hidden from assistive tech if intentional.
- If books are closed because fixed slots are not configured, the message may feel like the artist is closed rather than "slots are not posted yet."

**Unclear moments:**

- What is the difference between a reference link and reference images?
- Should the client choose a date even if they are flexible?
- What happens after submission?
- For guest spots, how does a client know which dates/cities are available before picking a date?

**Missing guidance:**

- Near the form title: "Send the basics first. The artist will review and confirm details before anything is booked."
- Date helper: "Choose your ideal date. If you are flexible, say so in the description."
- Reference helper: "Links are optional; photos are better if you have them."
- Closed-state reason copy that matches the cause.

**Improvement opportunities:**

- Reorder fields into a client-natural sequence: contact, tattoo idea, placement/size, references, date/location.
- Add short trust/expectation copy near submit.
- Keep legal text collapsed and visually quieter.
- Improve mobile image upload touch targets and annotation flow.

## D. Feature Cohesion Audit

| Feature                     | Problem it solves                                        | Value clarity                                            | Product connection                                                 | Current role            | Recommended UX treatment                                                               |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| Booking link/public profile | Gives artists one link for Instagram instead of DMs.     | Clear in marketing and dashboard.                        | Connects profile, form, requests, waitlist.                        | Essential               | Make it the center of setup and dashboard readiness.                                   |
| Booking form                | Collects placement, size, references, date, description. | Mostly clear to clients.                                 | Feeds request inbox and later calendar/deposit.                    | Essential               | Reorder fields and add expectation copy; avoid over-configuring early.                 |
| Request inbox               | Centralizes client submissions.                          | Clear enough, but "Booking Overview" dilutes it.         | Connects public form to decisions.                                 | Essential               | Rename/position as "Requests" or "Booking Inbox"; make empty state share-link focused. |
| Request detail/review       | Helps artist decide if request is a fit.                 | Data is present; decision flow less clear.               | Connects inbox to approval, deposit, calendar, communication.      | Essential               | Add decision helper copy and better scan hierarchy.                                    |
| Approvals/rejections        | Lets artist accept or pass.                              | Under-explained at action moment.                        | Drives booking status and emails.                                  | Essential               | Use action labels/copy that explain client communication and calendar effect.          |
| Deposits                    | Lets artist request payment before confirming.           | Partially clear; Stripe dependency not obvious.          | Connects status, email, client portal, reminders.                  | Secondary/optional      | Keep as optional branch; clarify what happens and avoid overpromising.                 |
| Calendar                    | Organizes approved bookings and manual appointments.     | Clear for approved work.                                 | Should be outcome of accepted requests.                            | Essential support       | Add stronger "approved bookings go here" connection; improve mobile agenda.            |
| Fixed slots                 | Lets artists publish exact appointment times.            | Conceptually useful but risky in onboarding.             | Affects public form and books-closed state.                        | Secondary mode          | Explain who should choose it; warn if no slots before sharing.                         |
| Books open/closed           | Controls intake and triggers waitlist.                   | Tattoo-native but needs context.                         | Connects public form, waitlist, dashboard.                         | Essential setup         | Rename/settings copy around "can clients send requests right now?"                     |
| Waitlist                    | Collects demand when books are closed/full.              | Clear in public closed state; less clear in artist flow. | Should connect closed books, city demand, travel, future bookings. | Secondary but valuable  | Cross-link with Books and Travel; make conversion safer/more explicit.                 |
| Guest spots/travel          | Adds city/date/studio context for traveling artists.     | Valuable but abstract in current UI.                     | Connects trips, public form, request filters, waitlist demand.     | Secondary for travelers | Rename/explain as guest spot workflow; show public visibility consequences.            |
| Studio library              | Stores repeat guest spot/studio places.                  | Useful but setup-like.                                   | Supports trips and public page.                                    | Support feature         | Keep inside travel; explain as "saved places."                                         |
| Flash                       | Lets artists post bookable flash designs/events.         | Tattoo-native but advanced.                              | Creates request records and public flash pages.                    | Optional/secondary      | Do not lead new-user flow with Flash; introduce after core booking link works.         |
| Email templates/reminders   | Controls client communication.                           | Useful but variable syntax is technical.                 | Supports requests, approvals, rejections, deposits.                | Support feature         | Simplify labels and hide technical variables behind insertion helpers later.           |
| Notifications               | Shows activity/system warnings.                          | Useful.                                                  | Supports daily workflow.                                           | Support feature         | Keep, but ensure warnings link to the exact fix.                                       |
| Analytics                   | Shows request/conversion metrics.                        | Understandable but SaaS-like before data.                | Weakly connected to daily decisions.                               | Tertiary                | De-emphasize until enough requests exist.                                              |
| Dashboard widgets           | Lets artist customize dashboard cards.                   | Too administrative early.                                | Affects first impression.                                          | Premature customization | Keep but avoid letting users hide the product's core guidance too soon.                |

## E. Navigation And Information Architecture Findings

### What Works

- The protected shell has a clear desktop sidebar and simple mobile bottom nav.
- `Dashboard`, `Bookings`, `Travel`, and `Settings` are reasonable top-level anchors.
- Section navs under Bookings, Flash, and Settings help contain complexity.
- Redirect routes protect users from many older URLs.
- The mobile bottom nav keeps the core areas reachable with a thumb.

### What Is Confusing

- `Bookings` contains both daily work and setup work: Overview, Calendar, Waitlist, Booking Settings, Booking Form.
- `Settings` also contains setup work: Profile, Emails, Calendar, Dashboard, Account. Public profile and public booking form are split.
- `Booking Overview` is not the language most artists would use. The actual job is "new requests."
- `Booking Settings` versus `Booking Form` is ambiguous. Artists do not naturally know which page controls books open/closed, slots, fields, appearance, or public page sharing.
- `Travel` is clear as an internal planning word, but the user-facing tattoo value is "guest spots."
- `Flash` is a large optional feature, but it appears at the same top-level weight as the core booking workflow.
- `Analytics` is visible before most artists have enough data to care.
- Some old paths redirect through multiple layers, which is fine technically but signals IA churn.

### What Should Be Grouped Differently

- **Booking setup:** public booking link, form fields, books open/closed, booking mode, slots, public profile preview.
- **Daily booking work:** requests, request detail, clients, calendar, notifications.
- **Travel/guest spots:** trips, studios, trip visibility, request filtering, city demand from waitlist.
- **Communication:** email templates, reminders, deposit reminders, client portal expectations.
- **Account/settings:** login/security/export/calendar feed.

### What Should Be Renamed

- `Booking Overview` -> `Requests` or `Booking Inbox`.
- `Booking Settings` -> `Books & Availability`.
- `Booking Form` -> `Booking Link & Form`.
- `Travel` -> `Guest Spots` or `Travel / Guest Spots`.
- `Trip Planner` -> `Guest Spots`.
- `Show on booking form` -> `Let clients request this guest spot`.
- `Convert` waitlist action -> `Create booking` or `Move to booking`.
- Status label `Waitlist Request` for converted entries -> `Converted`.

### What Should Be Moved Or Cross-Linked

- Dashboard setup banners should link directly to the active setup surface, not redirect routes.
- Waitlist empty state should link directly to `/bookings/settings`.
- Booking Form should more clearly link to Profile settings because profile fields shape the public page.
- Travel should link to Waitlist city demand; Waitlist should link back to Travel.
- Fixed slots setup should appear immediately after a user chooses fixed slots.

### What Should Be Hidden Until Needed

- Analytics can be de-emphasized until there are enough requests to show meaningful trends.
- Flash can remain accessible but should not be presented as part of the required setup path.
- Dashboard widget customization should stay in settings but not appear as a first-run task.
- Email template variable syntax should be tucked behind helper text or an insert menu later.

## F. Public Booking Experience Findings

### Public Artist Page

The public page is functional and lightweight. It shows artist identity, location/Instagram, bio, studio, active trip, and a booking form or closed-books state. The live demo `/bert-grimm` loaded correctly and felt credible enough for early use.

Main issues:

- The page title "Booking request" is generic. It should frame the client task as "Tell me about your tattoo idea" or "Send a tattoo request."
- The helper "Fill in the details and I'll get back to you" is good but should also say the request is reviewed before booking is confirmed.
- Studio info appears before the request form. That can be useful for trust, but on mobile it may push the form down; this needs manual mobile QA.
- Guest spot context is only obvious when active or after date selection. Future visible trips are not strongly previewed.

### Booking Form

Current default order from the live public page:

1. Instagram handle
2. Email
3. Reference link
4. Placement
5. Size
6. Description
7. Reference images
8. Preferred date

Recommended order:

1. Instagram handle and email
2. Tattoo idea/description
3. Placement
4. Size
5. Reference link and reference images
6. Preferred date/slot and guest spot location

This better follows how clients think: who they are, what they want, where/size, what references they have, and when they hope to book.

### Field-Level Findings

- Size choices are tattoo-specific and good, but live accessible text spacing should be checked (`Palm-sized~ 5 cm`, `Larger20 cm+` appeared in snapshot).
- The preferred date area appears as a date field plus an extra unlabeled textbox in the live snapshot. If it is a honeypot or hidden helper, it should be hidden from assistive tech and not visible.
- Reference link before description may cause clients to focus on Instagram links before explaining the idea.
- Reference image upload is strong and tattoo-native. The annotation feature is distinctive, but auto-opening annotation after upload may surprise clients.
- Required fields are reasonable, but the form needs a short "Not a confirmed booking yet" expectation.

### Trust And Confirmation

- Legal copy is present and can be expanded. That is good for trust, but should stay visually secondary.
- Confirmation page is clear enough: "Request sent", reference ID, back link, check email if present.
- The product should avoid making clients think they booked an appointment when they only submitted a request.

### Recommended Improvements

- Add one short expectation sentence near the form title and submit button.
- Reorder fields to match client thinking.
- Clarify reference link versus images.
- Tune closed-books copy by reason: manual closed, booking window expired, request cap reached, fixed slots not posted.
- Add guest spot date/city helper when visible trips exist.
- Manually QA mobile upload/annotation/date inputs.

## G. Dashboard Workflow Findings

### Request Review

The request detail page contains the right information, but the hierarchy can better match artist decision-making:

- First: tattoo idea summary, placement, size, references.
- Second: timing/location, preferred date, slot, trip/studio.
- Third: client/contact and history.
- Fourth: action panel and communication.

The current two-column layout works on desktop, but on mobile the action panel risks falling too low.

### Approvals/Rejections/Deposits

Current actions exist and are meaningful:

- Approve pending request.
- Reject pending/deposit-pending request.
- Request deposit.
- Mark deposit received.

UX gaps:

- Actions need "what happens next" copy.
- Approve should explain whether the client is notified and where the booking goes.
- Reject should use humane tattoo-native language, possibly "Pass for now", while preserving internal status.
- Deposit should say whether this sends the client a payment request, how due date works, and what happens after payment.

### Booking Organization

- Approved bookings appear in calendar.
- Calendar supports appointment drawer and manual appointments.
- The connection from request approval to calendar could be stronger.
- Calendar month grid likely needs mobile agenda treatment; this can be a later slice if scope is tight.

### Waitlist

Strengths:

- Waitlist appears when books are closed.
- Artist can see city demand.
- Entries have statuses and actions.

Weaknesses:

- Empty state says "Close your books to start collecting them" but CTA goes through `/bookings/books`, a redirect route.
- "Convert" is too vague and may imply a complete booking even when details are missing.
- Waitlist demand is not connected enough to guest spot planning.

### Guest Spots

Strengths:

- Trips, stops, studios, visible-on-form toggle, and request tagging exist.
- Requests can be filtered by trip in Booking Overview.

Weaknesses:

- The Travel page explains mechanics more than the artist outcome.
- Visible trip behavior on the public page is not obvious from the artist UI.
- Public clients may not know future city/date availability before picking a date.

### Settings

Settings are powerful but fragmented:

- Profile settings affect public page.
- Booking Settings affect books, booking mode, slots.
- Booking Form affects fields, appearance, share link, QR.
- Emails affect client communication.
- Calendar affects iCal export.
- Dashboard affects dashboard widgets.

The individual pages are logical after discovery, but the new user needs a simpler mental model: "Public profile", "Booking link and form", "Books and availability", "Messages", "Account."

## H. Mobile UX Findings

### Mobile Dashboard

The app shell has a sensible mobile top bar and bottom nav. The risk is inside pages, not the shell.

Risks:

- Dashboard cards are likely usable but may require too much scrolling if setup guidance grows.
- Notifications are available via top bell, but not bottom nav; this is fine if notifications stay supportive.
- The booking link card should stay prominent for new users.

### Mobile Public Form

Strengths:

- Form inputs are large and mostly mobile-friendly.
- The page width is constrained, which is good for Instagram traffic.
- Upload supports browsing and drag/drop.

Risks:

- Image thumbnails and annotation controls may be small.
- Long legal copy, studio blocks, and trip cards may push the submit action far down.
- Size radio cards and date inputs need manual QA across narrow widths.

### Mobile Request Review

Risks:

- Request list uses a table that hides columns rather than becoming cards.
- Important decision actions may appear below lots of details on request detail.
- Reference image galleries and communication sidebar add scroll depth.

Recommendations:

- Use mobile request cards with handle, placement, size/date, status, and submitted time.
- Put status/actions closer to the top on mobile, or add a compact sticky action summary.
- Keep request metadata below the decision content.

### Mobile Calendar, Waitlist, Slots, And Field Setup

Risks:

- Calendar month grid is dense for phone use; agenda/list mode would be more practical.
- Waitlist action buttons can crowd rows.
- Slot pattern builder and drag-to-reorder field list are likely awkward on touch.
- Modals may be scrollable but cognitively dense.

Recommendations:

- Add mobile cards for waitlist entries.
- Add non-drag controls or clear tap targets for field ordering later.
- Treat calendar mobile agenda as medium-to-large effort and defer if needed.

## I. Microcopy Findings

### Confusing Or Generic Labels

| Current              | Suggested                           | Why                                      |
| -------------------- | ----------------------------------- | ---------------------------------------- |
| Booking Overview     | Requests / Booking Inbox            | Names the daily job.                     |
| Booking Settings     | Books & Availability                | Explains books-open/slots/date settings. |
| Booking Form         | Booking Link & Form                 | Includes the share-link purpose.         |
| Trip Planner         | Guest Spots                         | More tattoo-native and value-led.        |
| Show on booking form | Let clients request this guest spot | Explains outcome.                        |
| Preferred dates      | Client suggests a date              | Makes the mode less abstract.            |
| Fixed slots          | Published time slots                | Clearer for non-technical users.         |
| Convert              | Create booking                      | Tells the artist what action does.       |
| Waitlist Request     | Converted                           | Avoids confusing status label.           |
| Approve              | Accept request                      | More human and tattoo-native.            |
| Reject               | Pass for now                        | Softer, still clear.                     |

### Missing Helper Text

- Booking mode onboarding: "Choose preferred dates if you want to review ideas first. Choose published slots if clients should pick from exact times."
- Books open/closed: "When books are closed, clients cannot send new requests and can join your waitlist instead."
- Fixed slots with none posted: "Add at least one slot before sharing your booking link."
- Request actions: "Accepting emails the client and moves this into approved bookings."
- Deposit request: "Use this when you want the client to pay a deposit before you confirm the booking."
- Travel visibility: "Visible trips help clients request the right city/date and tag incoming requests."
- Waitlist: "Use city demand to decide where to open books or plan guest spots."
- Public form: "This sends a request. Your appointment is not confirmed until the artist accepts it."

### Too Technical

- Email template variable syntax such as `{{customer_name}}` can scare non-technical artists.
- Custom field setup terms like "field type", "placeholder", and option management are normal software language, but helper examples should make them feel less technical.
- Calendar export/iCal is practical but should be framed as "Add approved bookings to Google/Apple Calendar."

### Generic SaaS Language

- "Analytics", "Overview", "Settings", "Dashboard widgets", and "conversion rate" can make the product feel generic if surfaced too early.
- Keep these available, but lead with tattoo workflow language: requests, books, guest spots, flash, clients, deposits.

## J. UI Consistency Findings

### What Feels Coherent

- Brand color and illustration direction are distinctive.
- Public booking page is calm and simple.
- Artist app uses consistent page headers, bordered cards, and muted text.
- The mobile app shell is practical and not over-designed.

### Inconsistencies

- Many screens use custom button/card classes instead of the shared `Button` and `Card` primitives. This creates small differences in weight, border, radius, and spacing.
- Marketing pages feel more expressive; artist app screens can feel like generic dashboards.
- Some pages use feature intro modals, some use empty-state cards, and some use simple blank states.
- Old route names remain in code and sometimes links, causing mental model drift.
- Public marketing pages still use placeholder visuals and placeholder text.

### Visual Hierarchy Issues

- Dashboard gives Analytics a visible card even when the core setup/request loop may not be established.
- Booking Form combines share link, QR, field setup, and appearance; useful, but the share-link success moment should dominate for new users.
- Request detail right rail includes important actions but may become secondary on mobile.
- Waitlist and Travel have good data but need clearer next-action hierarchy.

### Empty/Loading/Error States

- Best empty state: Booking Overview suggests sharing the booking link.
- Weak empty states: no slots, no waitlist entries, no notifications, analytics with no data.
- Loading states exist in some routes, but UX guidance is mostly absent during empty/zero-data states.
- Error states are generally functional but not always written in human tattoo-native language.

## K. Prioritized UX Improvement List

| Priority | Effort | Affected flow                   | Affected files/components                                               | Problem                                                  | Recommendation                                                                                 | Expected benefit                                    | Implementation risk                                         |
| -------- | -----: | ------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Critical |      M | First-time setup                | `dashboard/page.tsx`, onboarding done, `bookings/booking-form/page.tsx` | New users lack one clear "get value now" path.           | Add a booking-link readiness path: profile, books/slots, form, preview, copy link.             | Artists know exactly what to do before sharing.     | Medium, must avoid duplicating onboarding state.            |
| Critical |      S | Navigation/setup                | `nav-config.ts`, `bookings/layout.tsx`, page headings                   | Setup and daily work labels are ambiguous.               | Rename core labels: Requests, Books & Availability, Booking Link & Form, Guest Spots.          | Faster comprehension and less module hopping.       | Medium, links/docs/tests may reference old names.           |
| Critical |      S | Public form                     | `src/app/[slug]/booking-form.tsx`, `page.tsx`                           | Clients may not know request is not a confirmed booking. | Add expectation copy and reorder default form flow toward idea-first submission.               | More complete requests and fewer misunderstandings. | Low/medium, field ordering may affect settings assumptions. |
| High     |      S | Request decisions               | `status-actions.tsx`, request detail page                               | Approve/reject/deposit consequences are unclear.         | Add helper copy and more human action labels while preserving statuses.                        | Artists act with more confidence.                   | Low, copy/UI only if status values unchanged.               |
| High     |     XS | Waitlist                        | `waitlist/page.tsx`, `waitlist-actions.tsx`, `status-badge.tsx`         | Waitlist CTA/status/action labels are confusing.         | Direct empty CTA to active settings route; rename Convert and Converted label.                 | Waitlist feels purposeful, not like another list.   | Low.                                                        |
| High     |      S | Fixed slots/public closed state | `availability-form.tsx`, `books-closed-block.tsx`, slot pages           | No-slot state can look like books are closed/broken.     | Add warning before sharing and reason-specific closed copy.                                    | Prevents bad first client impression.               | Low/medium, needs careful condition checks.                 |
| High     |    S/M | Guest spots                     | `travel/page.tsx`, `trip-manager.tsx`, public page/form                 | Trip visibility and request tagging are abstract.        | Add guest-spot flow copy, visibility helper, preview link, waitlist cross-link.                | Traveling artists understand why trips matter.      | Low/medium.                                                 |
| High     |      M | Mobile daily workflow           | `bookings/overview/page.tsx`, waitlist page, request detail             | Tables and action placement are not phone-first.         | Mobile card layout for requests/waitlist; action summary closer to top.                        | Artists can review requests from phone.             | Medium.                                                     |
| Medium   |     XS | Public marketing trust          | `start/page.tsx`, `dm-chaos`, `guest-spots`                             | Placeholder text/visuals are public.                     | Remove visible placeholder instructions; replace with real or neutral mockups.                 | Public beta feels less unfinished.                  | Low.                                                        |
| Medium   |      S | Dashboard hierarchy             | `dashboard/page.tsx`, `settings/dashboard`                              | Analytics/customization can distract before core value.  | De-emphasize analytics until there are requests; strengthen booking link and pending requests. | Dashboard feels like a booking command center.      | Low.                                                        |
| Medium   |    S/M | Email settings                  | `settings/emails/*`                                                     | Template variables are technical.                        | Add plain-language helper and template preview; avoid leading with syntax.                     | Non-technical artists can customize safely.         | Medium.                                                     |
| Medium   |      M | Calendar mobile                 | `bookings/calendar/calendar-view.tsx`                                   | Month grid likely cramped.                               | Add mobile agenda/list view.                                                                   | Better phone booking organization.                  | Medium/high; defer if scope tight.                          |
| Medium   |      S | Help/docs consistency           | `help/page.tsx`, settings routes                                        | Help copy may reference older labels.                    | Update FAQ and help paths after nav labels settle.                                             | Reduces mismatch between docs and app.              | Low.                                                        |
| Low      |      L | Design system                   | Shared UI primitives and scattered screen classes                       | UI is coherent but inconsistent in small ways.           | Gradually consolidate buttons/cards/forms.                                                     | More polished app over time.                        | High if done broadly; avoid early.                          |
| Low      |    M/L | Flash onboarding                | Flash routes/nav                                                        | Flash is powerful but may distract new users.            | Introduce Flash as optional later tool after core setup.                                       | Keeps first-time flow light.                        | Medium if nav changes are broad.                            |

## L. Best Low-Effort Wins

1. Rename "Booking Overview" to "Requests" in headings/nav copy.
2. Rename "Booking Settings" to "Books & Availability."
3. Rename "Booking Form" to "Booking Link & Form."
4. Rename Travel page heading from "Trip Planner" to "Guest Spots" or "Guest Spots & Travel."
5. Add one expectation sentence to the public booking form: "This sends a request; your appointment is confirmed after the artist accepts it."
6. Move or clarify reference link after the tattoo idea/description.
7. Fix waitlist empty CTA to point directly at `/bookings/settings`.
8. Change waitlist "Convert" wording to "Create booking" and status label to "Converted."
9. Add helper copy under Approve/Reject/Deposit actions.
10. Add fixed-slots no-slot warning wherever the artist copies/previews the booking link.
11. Remove visible "Replace these with real screenshots" placeholder copy from `/start`.
12. Add Travel visibility helper: "Clients see this when their date matches your guest spot dates."
13. Add "Preview public page" links near settings that affect the public page.
14. De-emphasize Analytics on zero-data dashboards.
15. Standardize empty-state language around action: what is happening, why it matters, what to do next.

## M. Strongest Product-Flow Recommendation

Make Inklee's whole app revolve around one visible booking loop:

**Set up your booking link -> share it in Instagram -> clients send tattoo requests -> review the idea -> accept, pass, or request deposit -> approved work goes to calendar -> closed books collect waitlist demand -> guest spots use city/date demand to plan travel.**

This does not require a rebuild. The product already has most of the pieces. The best UX optimization is to make every screen explain where it sits in that loop and what the next logical action is.

Concretely:

- Treat `Booking Link & Form` and `Books & Availability` as setup surfaces.
- Treat `Requests` and `Calendar` as daily work surfaces.
- Treat `Waitlist` and `Guest Spots` as demand/travel support surfaces.
- Treat `Flash`, `Analytics`, email templates, and dashboard widget customization as optional advanced tools.
- Keep the public client experience simple, expectation-setting, and tattoo-native.

The goal is not to make Inklee bigger. The goal is to make the existing pieces feel like one lightweight tattoo booking flow instead of a collection of admin screens.
