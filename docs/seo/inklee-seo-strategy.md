---
document: Inklee SEO Strategy
status: active
canonical: true
company: Inklee OÜ
product: Tattoo booking and workflow software
primary_language: English
primary_markets:
  - Europe
  - United Kingdom
  - Southeast Asia
  - East Asia
conversion_goal: Account creation
strategy_owner: ChatGPT
implementation_owner: Claude Code
last_updated: 2026-07-02
---

# Inklee SEO Strategy

This is the **canonical** SEO strategy for Inklee. It defines keyword ownership, positioning, page architecture, cannibalization rules, and execution priority. Strategy is owned by ChatGPT; implementation is owned by Claude Code. See `docs/seo/README.md` for the operating model and required workflow.

> **Consolidation note (2026-07-02).** This file supersedes `docs/seo-strategy.md` as the *canonical* source of truth. That earlier document (created 2026-07-01) remains in the repo and is still valuable: it holds the detailed live-architecture audit, the Reddit keyword research and decision matrix, the A-vs-B strategy analysis, the prioritization scoring model, the measurement framework, and the validation backlog. Treat it as the **analytical companion** to this canonical file. Where the two differ on keyword ownership or page architecture, **this file wins.** Known deltas are listed in "Relationship to prior docs" at the end.

**Implementation status legend** (used on each URL below): **Live** = shipped and indexable today · **Live (reposition)** = shipped, but its keyword focus/metadata is a pending implementation slice · **To build** = recommended, does not exist yet · **To build (validate)** = recommended but gated on keyword/SERP validation · **Postpone** = do not build until the product supports it · **Done** = the specific action is already implemented and deployed.

---

## Business context

**Company:** Inklee OÜ

**Product:** Booking and workflow software for tattoo artists.

**Primary audience:**

- Independent tattoo artists
- Traveling tattoo artists
- Small tattoo studios where the current product genuinely supports the required workflows

**Primary conversion:** Account creation.

---

## Core product distinction

Inklee is **not** primarily an unrestricted client self-scheduling tool.

The defining workflow is:

1. Client submits a complete tattoo request.
2. Artist reviews the request.
3. Artist accepts, declines, or moves the request forward.
4. Inklee manages the booking, deposit, client, calendar, reminders, waitlist, guest spot, and sales workflow around that decision.

**Core semantic distinction:**

> Request first. Artist approval second. Appointment confirmation last.

**Core positioning:**

> Artist-controlled tattoo booking, request management, and commerce for independent tattoo artists.

**Core value statement:**

> Clients send complete tattoo requests. The artist decides what gets booked. Inklee manages the appointments, deposits, clients, waitlist, guest spots, books-open periods, and shop around that workflow.

**SEO consequence.** Never present Inklee as unrestricted self-booking software. Treat "scheduling app / appointment calendar / self-booking" keywords as secondary and reframed toward artist-controlled scheduling, never as a standalone page promise.

---

## Competitive reality

The following claims are **already common among competitors** and must not be presented as Inklee's sole differentiator:

- Replacing Instagram DMs
- Structured booking requests
- Accepting and declining requests
- Booking links
- Deposits
- Client management
- Calendars
- Reference uploads
- Public profiles
- Mobile access
- Flash booking

**Inklee's stronger position is the connected, artist-controlled workflow** rather than any individual feature. The differentiation is that request intake, approval, deposits, clients, calendar, reminders, waitlist, guest spots, books-open periods, and shop are one connected system governed by the artist's decision, not a bundle of separate tools.

**Competitors currently considered relevant:**

- Venue Ink
- InkDesk
- Get Ink
- Fresha
- Setmore
- Salonist

---

## Current keyword ownership

One search intent has one owner URL. Supporting keywords are on-page copy/headings/FAQ on the owner page, never new URLs.

### Homepage

**URL:** `/`

**Status:** Live

**Role:** Brand-led conversion hub.

**Positioning phrase:** `tattoo booking software for independent tattoo artists`

**Supporting terms:**

- tattoo booking app
- tattoo booking system
- booking software for tattoo artists
- tattoo booking management
- tattoo artist booking app

**Guardrail:** The homepage can use the category language, but must not duplicate the complete purpose of `/tattoo-booking-software`.

**The homepage owns:** Brand · Audience · Main product promise · Trust · Conversion · Navigation.

### Category pillar

**URL:** `/tattoo-booking-software`

**Status:** Live

**Primary keyword:** `tattoo booking software`

**Supporting keywords:**

- tattoo booking app
- tattoo booking system
- booking software for tattoo artists
- tattoo artist booking app
- tattoo appointment software
- tattoo scheduling software

**Role:** Own the broad commercial software, app, and system category.

**Do not** create separate pages for minor variants such as: tattoo booking app · tattoo booking system · booking software for tattoo artists.

### Booking form

**URL:** `/tattoo-booking-form`

**Status:** Live

**Primary keyword:** `tattoo booking form`

**Supporting keywords:**

- tattoo request form
- tattoo intake form
- tattoo consultation form
- custom tattoo booking form
- booking form for tattoo artists
- tattoo enquiry form
- tattoo inquiry form
- tattoo reference upload form

**Separate supporting resource:** `/tattoo-booking-form-template` — **Status: To build.** The template page must provide an actual useful template or checklist and must not duplicate the commercial page.

### Booking management

**URL (recommended):** `/tattoo-booking-management`

**Status:** To build

**Primary keyword:** `tattoo booking management`

**Supporting keywords:**

- manage tattoo requests
- organize tattoo requests
- tattoo request management
- review tattoo requests
- accept or decline tattoo requests
- tattoo booking approval
- request-based tattoo booking
- tattoo booking organizer

**Role:** Own the workflow between form submission and confirmed appointment.

**Important:** `tattoo request management` is supporting differentiation, not an uncontested category.

### Instagram booking

**URL:** `/instagram-booking-link-for-tattoo-artists`

**Status:** Live

**Primary keyword:** `tattoo booking link for Instagram`

**Supporting keywords:**

- tattoo booking link in bio
- tattoo booking form for Instagram
- manage tattoo bookings from Instagram
- Instagram booking system for tattoo artists
- collect tattoo requests from Instagram
- replace tattoo booking DMs

**Role:** Channel-specific solution page.

### DM problem page

**URL:** `/dm-chaos`

**Status:** Live

**Role:** Problem-awareness page. It should target the operational pain of fragmented Instagram booking conversations. It **must not** present replacing DMs as Inklee's unique competitive advantage.

### Deposits

**Current URL:** `/tattoo-deposit-tool`

**Status:** Live (reposition)

**Primary keyword:** `tattoo deposit software`

**Supporting keywords:**

- tattoo deposit app
- tattoo booking deposits
- take tattoo deposits online
- collect tattoo deposits online
- tattoo deposit payment app
- tattoo deposit link
- online payments for tattoo artists
- reduce tattoo no-shows

Keep the current URL unless a migration has a strong technical and SEO justification. Copy stays cautious about card processing (card = a paid, Stripe-connected feature; manual deposit tracking is free).

**Supporting guide:** `/guides/how-to-take-tattoo-deposits-online` — **Status: To build.**

### Client management

**URL (recommended):** `/tattoo-client-management`

**Status:** To build

**Primary keyword:** `tattoo client management software`

**Supporting keywords:**

- tattoo CRM
- tattoo client profiles
- tattoo client records
- tattoo client database
- tattoo appointment history
- tattoo project management
- client management for tattoo artists

**Do not** claim a full enterprise CRM unless the product supports it. Lead with native "client info / notes / history"; "CRM" is a secondary keyword only.

### Calendar

**URL (recommended):** `/tattoo-appointment-calendar`

**Status:** To build

**Primary keyword:** `tattoo appointment calendar`

**Supporting keywords:**

- tattoo artist calendar
- tattoo booking calendar
- tattoo scheduling app
- tattoo availability calendar
- calendar for tattoo artists
- manage tattoo appointments
- tattoo appointment management

The page must explain **artist-controlled scheduling** rather than unrestricted self-booking.

### Reminders

**URL (recommended):** `/tattoo-appointment-reminders`

**Status:** To build

**Primary keyword:** `tattoo appointment reminder software`

**Supporting keywords:**

- tattoo appointment reminders
- automatic reminders for tattoo appointments
- tattoo booking reminder emails
- tattoo appointment confirmation email
- tattoo client reminders
- reduce tattoo no-shows

**Do not** target SMS-specific keywords unless SMS is genuinely supported.

### Guest spots

**Canonical URL:** `/guest-spot-booking`

**Status:** Live

**Primary keyword:** `tattoo guest spot organizer`

**Supporting keywords:**

- guest spot management software
- tattoo guest spot booking
- manage tattoo guest spots
- guest artist booking management
- tattoo travel calendar
- guest spot scheduling
- tattoo guest spot planner
- organize guest spot requests

**Critical action:** `/guest-spots` must permanently redirect to `/guest-spot-booking`. **Status: Done** (308 permanent redirect in `apps/web/vercel.json`; the `/guest-spots` page was removed; deployed to prod 2026-07-02, master `ca4a06e`). Only one commercial guest-spot page may remain indexable.

### Waitlist

**URL:** `/tattoo-artist-waitlist`

**Status:** Live (reposition)

**Primary keyword:** `tattoo waitlist software`

**Supporting keywords:**

- tattoo appointment waitlist
- tattoo cancellation waitlist
- tattoo booking waitlist
- manage tattoo cancellations
- fill tattoo cancellations
- last-minute tattoo appointment list
- tattoo cancellation management

**Supporting guide:** `/guides/how-to-fill-tattoo-cancellations` — **Status: To build.**

### Books-open management

**URL (recommended):** `/tattoo-books-open-management`

**Status:** To build (validate)

**Primary keyword hypothesis:** `tattoo books open management`

**Supporting keyword hypotheses:**

- tattoo books open form
- manage tattoo books
- open tattoo bookings online
- tattoo booking waves
- books-open booking system
- close tattoo bookings automatically
- booking system for books-open artists
- tattoo books open app

This is a strategic opportunity requiring keyword validation. **Do not merge it with the waitlist page.** Books-open management concerns controlled intake periods; waitlists concern deferred demand and cancellations.

### Public artist page

**URL (recommended):** `/tattoo-artist-booking-page`

**Status:** To build (validate)

**Primary keyword:** `tattoo artist booking page`

**Supporting keywords:**

- personal booking page for tattoo artists
- tattoo artist profile page
- tattoo artist landing page
- tattoo portfolio booking page
- tattoo artist mini website
- tattoo artist link in bio

**Do not** target `tattoo artist website builder` as the primary term until the feature genuinely replaces a full artist website. Validate SERP intent against the Instagram-booking page and the pillar before building (risk of overlap).

### Flash booking

**URL (recommended):** `/tattoo-flash-booking`

**Status:** To build (validate)

**Primary keyword:** `flash tattoo booking`

**Supporting keywords:**

- tattoo flash booking app
- book flash tattoos online
- tattoo flash booking form
- manage available tattoo flash
- flash tattoo deposits
- tattoo flash library
- flash day booking
- tattoo flash claim system
- tattoo flash reservation

**Do not** automatically merge this with the general artist shop.

### Artist shop

**URL (recommended):** `/online-shop-for-tattoo-artists`

**Status:** To build (validate)

**Primary keyword hypothesis:** `online shop for tattoo artists`

**Supporting keywords:**

- tattoo artist storefront
- tattoo artist shop
- public shop for tattoo artists
- tattoo artist store without website
- sell tattoo products online
- tattoo shop link in bio
- sell tattoo designs without a website

Create this as a separate page **only if** Inklee supports a genuine shop workflow beyond flash booking. Manually verify search results for possible tattoo-supply-store ambiguity before committing.

### Mobile app

**URL:** `/download`

**Status:** Live

**Primary keyword:** `tattoo booking app for iOS and Android`

**Role:** Mobile and app-download conversion. Generic software and app category ownership stays with `/tattoo-booking-software`.

### Comparison pillar

**URL:** `/best-booking-app-for-tattoo-artists`

**Status:** Live

**Primary keyword:** `best booking app for tattoo artists`

**Supporting keywords:**

- best tattoo booking software
- best booking system for tattoo artists
- tattoo booking apps comparison
- tattoo booking software comparison

This is the single owner for broad plural comparison intent.

**Keep these existing comparison pages** (Status: Live):

- `/tattoo-booking-software-vs-instagram-dms`
- `/tattoo-booking-software-vs-google-forms`
- `/tattoo-booking-software-vs-calendly`

**Potential future comparison pages require validation** (Status: To build (validate)):

- `/venue-ink-alternative`
- `/fresha-for-tattoo-artists`
- `/booksy-for-tattoo-artists`
- `/square-appointments-for-tattoo-artists`

**Do not** publish thin programmatic comparison pages.

### Studio software

**Future URL:** `/tattoo-studio-booking-software`

**Status:** Postpone

**Primary keyword:** `tattoo studio booking software`

**Supporting keywords:**

- tattoo studio management software
- tattoo shop booking software
- multi-artist tattoo booking system
- shared tattoo studio calendar
- assign tattoo requests
- guest artist scheduling

**Do not** publish this page until the product genuinely supports the required multi-artist studio workflow.

---

## Cannibalization rules

- One search intent must have one clear owner URL.
- Minor wording variations (app/software/system, inquiry/enquiry, singular/plural, word order) do not justify separate indexable pages. Add them as on-page supporting copy.
- Commercial feature pages and informational guides must remain separate.
- Homepage and category pillar must have separate roles.
- Booking form and booking-form template must remain separate.
- Booking management and appointment calendar must remain separate.
- Books-open management and waitlist must remain separate.
- Flash booking and general artist shop must remain separate unless validated otherwise.
- Guest-spot software and guest-spot planning content must remain separate.
- Solo-artist software and studio-management software must remain separate.

**New-page gate.** Before any new indexable page, confirm: (a) it maps to a shipped feature (or is explicitly a validated guide), (b) it has a distinct primary keyword not already owned above, and (c) SERP evidence shows a different intent from the nearest existing page.

---

## Execution priority

Priorities are documented here for sequencing. Implementation of each item is a separate, gated slice owned by Claude Code (see `docs/seo/README.md`). This document does not itself change any page.

### P0

- Redirect `/guest-spots` to `/guest-spot-booking`. **(Done, deployed 2026-07-02.)**
- Separate homepage, About page, and category-pillar metadata ownership.
- Keep `/tattoo-booking-software` as the main category pillar.
- Reposition the deposit page around `tattoo deposit software`.
- Reposition the waitlist page around `tattoo waitlist software`.
- Strengthen the guest-spot page around `tattoo guest spot organizer`.
- Keep the DM page problem-led.

### P1

- Build `/tattoo-booking-management`.
- Build `/tattoo-client-management`.
- Build `/tattoo-appointment-calendar`.
- Build `/tattoo-appointment-reminders`.
- Build `/tattoo-artist-booking-page`.
- Build `/tattoo-booking-form-template`.

None of these pages exist yet, so none are implemented as part of this setup task.

### P2

- Validate books-open terminology.
- Build books-open management after validation.
- Build flash-booking coverage.
- Build the artist-shop page only when product support and intent are clear.
- Publish high-value operational guides.
- Validate one high-intent competitor comparison.

### P3

- Broader informational authority content.
- Regional localization.
- Studio software after product readiness.
- Additional competitor comparisons after validation.

---

## Proposed strategic changes

_No open proposals. Claude Code adds entries here when implementation evidence suggests a strategic change. Until the canonical strategy above is updated, a proposal is not approved strategy. Each proposal must contain: current decision · proposed decision · technical or data-based reason · pages affected · cannibalization risk · recommended next step._

---

## Relationship to prior docs

This canonical file consolidates and, where noted, overrides the following:

- **`docs/seo-strategy.md`** (2026-07-01): retained as the analytical companion (audit, Reddit research, A/B strategy, scoring, measurement framework, validation backlog). **Known deltas where this canonical wins:**
  - Deposits primary keyword is `tattoo deposit software` here (the companion used `tattoo deposit tool`, matching the URL).
  - Guest spots primary keyword is `tattoo guest spot organizer` here (the companion led with `tattoo guest spot booking`).
  - Waitlist primary keyword is `tattoo waitlist software` here.
  - This canonical recommends additional pages the companion did not enumerate or postponed: `/tattoo-booking-management`, `/tattoo-appointment-calendar`, `/tattoo-artist-booking-page`, `/tattoo-books-open-management`, `/tattoo-flash-booking`, `/online-shop-for-tattoo-artists`, plus a validated future comparison set (Venue Ink / Fresha / Booksy / Square). All are gated on validation and/or product readiness.
  - Competitor set here (Venue Ink, InkDesk, Get Ink, Fresha, Setmore, Salonist) differs from the companion's alternative candidates (Square, Jotform, Wix, Linktree).
- **`docs/roadmap.md`** (§4.1, §10): the SEO roadmap sections should point at this file as the canonical strategy.
- **`docs/seo-geo-audit-slice-1.md`**: historical technical audit; most P0/P1 items were fixed in the June 2026 launch sprint.
- **`docs/seo-landing-template-system-slice-4.md`**: landing-page component/assembly guidance; still valid for implementation.
- **`docs/github-publishing-strategy.md`**: governs the public GitHub repos (tool-neutral how-to / product transparency); those must not restate the commercial pitch or duplicate an inklee.app page's query.

**Product truth references (must not be contradicted by SEO copy):** `docs/business-model.md`, `docs/inklee-feature-scope.md`. **Copy rules:** `AGENTS.md` (sentence case, no em-dashes, Accept/Pass verbs).
