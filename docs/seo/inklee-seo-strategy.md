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

**Separate supporting resource:** `/tattoo-booking-form-template` — **Status: To build (validate).** The template page must provide an actual useful template or checklist and must not duplicate the commercial page.

### Booking management

**URL (recommended):** `/tattoo-booking-management`

**Status:** To build (validate)

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

**Status:** Live (metadata + visible copy aligned around `tattoo deposit software`, 2026-07-02)

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

**Supporting guide:** `/guides/how-to-take-tattoo-deposits-online` — **Status: Live (built 2026-07-02, validated in `docs/seo/problem-guide-validation.md`).**

### Client management

**URL:** `/tattoo-client-management`

**Status:** Live (built 2026-07-02; native language leads, CRM secondary only)

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

**Status:** To build (validate)

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

**URL:** `/tattoo-appointment-reminders`

**Status:** Live (built 2026-07-02; email-only claims, no SMS targeting)

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

**Status:** Live (metadata + visible copy aligned around `tattoo waitlist software`, 2026-07-02)

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

Inklee follows a hybrid SEO model:

1. Preserve and strengthen the existing product-led commercial spine.
2. Do not expand the spine with near-duplicate feature, synonym, or wording-variation pages.
3. Build topical authority through validated problem-led guides using language tattoo artists naturally use.
4. Link each guide to the commercial page that owns the corresponding product intent.
5. Treat account creation as the primary conversion.

Each implementation remains a separate operational slice owned by Claude Code, even when several slices are completed during one development session.

### P0: measurement and existing-page completion

Complete measurement and existing-page alignment before expanding the indexable page inventory.

#### Google Search Console baseline

Record the current Google Search Console baseline for every indexable marketing page.

Capture:

- query
- landing page
- country
- device
- clicks
- impressions
- CTR
- average position
- branded versus non-branded classification
- competing Inklee URLs appearing for the same query

The baseline must note that the deposit, waitlist, guest-spot, homepage, About, and category-pillar ownership changes were implemented on 2026-07-02.

Historical data from before 2026-07-02 may still be used, but the current baseline is the post-repositioning reference point.

Store the baseline and review notes in:

`docs/seo/gsc-baseline.md`

Do not paste raw exports into the canonical strategy.

#### Conversion measurement

Implement reliable measurement for:

- `marketing_cta_click`
- `signup_started`
- `signup_completed`
- `booking_link_created`

Where technically appropriate, record:

- entry landing page
- current page
- referrer
- source
- medium
- campaign
- device
- internal-user status

`signup_completed` must:

- fire only when onboarding is genuinely complete
- fire only once per account
- preserve the original marketing entry page where possible
- exclude internal and administrative traffic

Plausible remains the analytics platform.

Do not introduce Meta Pixel as part of this work.

#### Existing-page alignment

Strengthen the following pages without turning them into exact-match keyword pages:

- `/tattoo-deposit-tool`
- `/tattoo-artist-waitlist`
- `/guest-spot-booking`
- `/`
- `/tattoo-booking-software`

Review:

- eyebrow
- H1
- opening paragraph
- section headings
- FAQ wording
- internal anchor text
- related-page cards
- CTA context

Canonical keyword ownership remains:

| URL | Primary ownership |
| --- | --- |
| `/` | Inklee brand, target audience, connected value proposition, and conversion |
| `/tattoo-booking-software` | tattoo booking software, app, and system category |
| `/tattoo-deposit-tool` | tattoo deposit software |
| `/tattoo-artist-waitlist` | tattoo waitlist software |
| `/guest-spot-booking` | tattoo guest spot organizer and guest spot booking |

The visible copy should support the assigned intent naturally.

Exact keyword repetition is not required.

#### Homepage positioning

Keep DM chaos as an acquisition hook, but do not present it as Inklee's unique advantage.

The homepage must clearly communicate:

> Clients submit complete tattoo requests. The artist decides what gets booked.

Supporting copy should show that Inklee connects:

- booking form
- request review
- Accept or Pass
- deposits
- client information and history
- calendar
- reminders
- waitlist
- books-open periods
- guest spots
- flash
- public artist page

The homepage remains a brand and conversion page.

`/tattoo-booking-software` remains the comprehensive category page.

#### Category-pillar strengthening

Review `/tattoo-booking-software` against the current competitive reality.

The page must explain that Inklee is:

- request first
- artist controlled
- designed for custom tattoo work
- connected across requests, deposits, clients, reminders, travel, and availability
- not a generic salon scheduler
- not unrestricted client self-booking
- not a heavy studio-management suite

Do not create separate pages for:

- tattoo booking app
- tattoo booking system
- booking app for tattoo artists
- booking software for tattoo artists
- tattoo artist booking app

These remain supporting variants owned by the category pillar.

#### Technical and documentation cleanup

- Update `docs/roadmap.md` so SEO strategy references point to `docs/seo/inklee-seo-strategy.md`.
- Preserve `docs/seo-strategy.md` as the analytical companion.
- Stop assigning the current timestamp as `lastModified` to every marketing URL on every sitemap generation.
- Use reliable route-specific modification dates or omit `lastModified`.
- Confirm the sitemap, canonicals, robots directives, schema, and internal links remain consistent.
- Record completed work in `docs/seo/seo-implementation-log.md`.

#### P0 completion gate

P0 is complete when:

- account creation can be attributed to a marketing entry page
- a dated Google Search Console baseline document exists
- internal traffic is excluded from conversion reporting
- existing repositioned pages have aligned visible copy
- the homepage explains the connected artist-controlled workflow
- the category pillar clearly protects the request-first distinction
- the sitemap does not falsely report every route as newly modified
- all strategic references point to the canonical SEO file

### P1: validated feature gaps

Build only the two currently validated commercial feature pages.

#### Tattoo appointment reminders

URL:

`/tattoo-appointment-reminders`

Primary keyword:

`tattoo appointment reminder software`

Supporting keywords:

- tattoo appointment reminders
- automatic reminders for tattoo appointments
- tattoo booking reminder emails
- tattoo appointment confirmation
- tattoo client reminders
- reduce tattoo no-shows

Required content scope:

- configurable reminder emails
- appointment confirmation
- appointment preparation communication
- reconfirmation where supported
- connection to the approved booking
- deposit and appointment context
- reducing no-shows without making guarantees
- editable artist communication

Do not target SMS-specific keywords unless SMS is supported.

Do not imply that reminders eliminate all no-shows.

#### Tattoo client management

URL:

`/tattoo-client-management`

Primary keyword:

`tattoo client management software`

Supporting keywords:

- tattoo client database
- tattoo client information
- tattoo client notes
- tattoo client history
- tattoo appointment history
- CRM for tattoo artists
- tattoo CRM

Required content scope:

- automatically created client records
- contact information
- tattoo request and booking history
- private notes
- deposit and appointment context
- returning-client visibility
- search by handle or email

Lead with native tattoo-artist language.

Use `CRM` only as a secondary term.

Do not imply:

- enterprise CRM
- marketing automation
- POS
- inventory
- staff management
- studio multi-tenancy
- unrestricted client access

#### P1 completion gate

Each page must have:

- one distinct primary intent
- unique title
- unique meta description
- one clear H1
- self-referencing canonical
- sitemap inclusion
- appropriate WebPage schema
- FAQ schema only where the FAQ is visible and useful
- contextual links from at least two relevant existing pages
- links back into the commercial spine
- a clear account-creation CTA
- copy grounded in shipped functionality
- no unsupported competitor or product claims

### P2: problem-led authority validation

Problem-led guides are the primary new authority-building track.

Candidate topics:

1. `how to manage tattoo bookings`
2. `how to organize tattoo requests`
3. `how to stop booking through Instagram DMs`
4. `how to create a tattoo booking process`
5. `how to take tattoo deposits online`
6. `how to reduce tattoo no-shows`

Do not publish all six.

Validate all six and select the strongest two first.

#### Guide validation criteria

Score each candidate from 1 to 5 for:

- search intent clarity
- relevance to shipped Inklee functionality
- ranking feasibility
- weakness of existing SERP results
- use of native tattoo-artist language
- commercial connection
- distinction from an existing Inklee page
- conversion relevance
- ability to provide genuinely useful information

Also record:

- monthly volume where available
- keyword difficulty where available
- CPC where available
- dominant page type
- top-ranking competitors
- community wording
- closest existing Inklee page
- cannibalization risk
- recommended commercial owner page

Store the validation in:

`docs/seo/problem-guide-validation.md`

#### Guide selection rule

Select the first two guides based on:

1. distinct search intent
2. realistic ranking opportunity
3. strong product connection
4. low cannibalization risk
5. usefulness without requiring Inklee
6. a natural path into one commercial page

The first two guides must not be chosen only because they have the highest volume.

#### Guide requirements

Each selected guide must:

- solve the operational problem before promoting Inklee
- use natural tattoo-industry terminology
- link primarily to one commercial owner page
- include a clear path toward account creation
- avoid duplicating the commercial page
- avoid implying that Inklee creates client demand by itself
- avoid generic marketing filler
- include practical steps, examples, or templates
- remain useful to an artist who has not created an Inklee account

Recommended acquisition framing:

> Getting attention is only half the problem. The booking process has to turn that attention into complete, manageable tattoo requests.

#### Likely guide-to-commercial relationships

| Candidate guide | Likely commercial owner |
| --- | --- |
| how to manage tattoo bookings | `/tattoo-booking-software` |
| how to organize tattoo requests | `/tattoo-booking-form` |
| how to stop booking through Instagram DMs | `/dm-chaos` or `/instagram-booking-link-for-tattoo-artists` |
| how to create a tattoo booking process | `/tattoo-booking-software` |
| how to take tattoo deposits online | `/tattoo-deposit-tool` |
| how to reduce tattoo no-shows | `/tattoo-appointment-reminders` |

The final relationship must be decided after SERP and cannibalization review.

### P3: validation-gated routes

Do not build the following pages until their search intent and separation from existing pages have been validated:

- `/tattoo-booking-management`
- `/tattoo-appointment-calendar`
- `/tattoo-artist-booking-page`
- `/tattoo-booking-form-template`
- `/tattoo-books-open-management`
- `/tattoo-flash-booking`
- `/online-shop-for-tattoo-artists`
- `/venue-ink-alternative`
- `/fresha-for-tattoo-artists`
- `/booksy-for-tattoo-artists`
- `/square-appointments-for-tattoo-artists`

#### Validation record

For every candidate route, record:

- target URL
- primary keyword
- supporting keywords
- search intent
- dominant SERP page type
- top-ranking competitors
- product capability represented
- nearest existing Inklee page
- shared top-ten results
- business value
- ranking feasibility
- conversion argument
- final decision

Allowed final decisions:

- build
- merge into an existing owner
- support through copy only
- postpone
- drop

### SERP overlap decision rules

Use top-ten result overlap as a guide:

| Shared top-ten results | Interpretation |
| ---: | --- |
| 60% or more | One page should normally own both terms |
| 30% to 59% | Inspect intent and page differentiation manually |
| Below 30% | Separate pages may be justified |

SERP overlap alone is not sufficient.

A separate page must also have:

- a distinct user problem
- a distinct Inklee capability
- unique content
- a different conversion argument
- no material cannibalization with an existing page

### Comparison-page rule

The existing comparison pages own both `vs` and `alternative` intent for their respective competitors:

- `/tattoo-booking-software-vs-instagram-dms`
- `/tattoo-booking-software-vs-google-forms`
- `/tattoo-booking-software-vs-calendly`

Do not create separate alternative pages for the same competitor.

Use `alternative` naturally in metadata, FAQs, or body copy where supported by SERP intent.

Every comparison must:

- use current verified facts
- compare workflows rather than only feature counts
- explain when the competitor may be the better choice
- avoid fabricated reviews
- avoid unsupported criticism
- avoid duplicate `vs` and `alternative` URLs

Before changing a comparison title, validate whether `vs` and `alternative` results materially overlap.

### UK terminology rule

Do not create separate UK pages solely for spelling variations.

Use globally clear terms in titles and H1s:

- tattoo artist
- tattoo booking software
- tattoo booking form

Use UK variants naturally in supporting copy:

- tattooist
- enquiry
- enquiry form

Reconsider dedicated localization only when:

- the UK produces meaningful impressions or account creation
- UK SERPs differ materially
- pricing, payment, or legal information differs
- localized pages can provide more than spelling changes

### Future product gates

Do not target capabilities that have not shipped.

#### Flash

Keep these intents separate:

1. flash tattoo booking and reservation
2. selling tattoo flash or products online

A flash-booking page may be considered after validation because Inklee supports a public flash catalog and booking flow.

Do not target:

- ecommerce
- digital-product sales
- product checkout
- order management
- transactional storefronts

until public checkout has shipped.

#### Artist shop

Do not build `/online-shop-for-tattoo-artists` while goods remain showcase-only.

#### Studio

Do not build studio-management pages until the following have shipped:

- multi-artist permissions
- shared workflows
- request assignment
- shared calendar
- studio administration
- team-level data boundaries

### P4: later expansion

After the first two feature pages and first two guides have generated usable Search Console and conversion data, reconsider:

- booking-management page
- appointment-calendar page
- public artist booking page
- booking-form template
- books-open content
- cancellation content
- UK terminology expansion
- Linktree comparison
- competitor alternatives
- flash booking
- localization
- studio software

Prioritize evidence from:

- Google Search Console
- account-creation attribution
- user interviews
- competitor movement
- product usage
- keyword tools
- manual SERP reviews

---

## Proposed strategic changes

_No open proposals. Claude Code adds entries here when implementation evidence suggests a strategic change. Until the canonical strategy above is updated, a proposal is not approved strategy. Each proposal must contain: current decision · proposed decision · technical or data-based reason · pages affected · cannibalization risk · recommended next step._

---

## Decision log

### 2026-07-02: P0/P1/P2 implementation status (same-day execution)

- P0 conversion measurement: implemented (four Plausible events, attribution, internal exclusion, duplicate prevention with unit tests). Founder actions remaining: Plausible goal + custom-property registration, `?internal=1` browser marking (see `docs/seo/conversion-measurement.md`).
- P0 GSC baseline: **framework complete, numeric data pending** (`docs/seo/gsc-baseline.md`). GSC is not accessible from the dev environment; the founder export steps are in the doc. The numeric baseline is NOT marked complete.
- P0 existing-page alignment: complete (deposit, waitlist, guest-spot, homepage, pillar visible copy).
- P0 sitemap dates + roadmap references + comparison-page safeguard review: complete.
- P1: `/tattoo-appointment-reminders` and `/tattoo-client-management` built and live.
- P2: six guide topics validated (`docs/seo/problem-guide-validation.md`); `/guides/how-to-take-tattoo-deposits-online` and `/guides/how-to-reduce-tattoo-no-shows` built and live. The other four candidates remain postponed or copy-only per the validation doc.
- Implementation detail per slice: `docs/seo/seo-implementation-log.md`.

### 2026-07-02: Hybrid execution model narrowed

- Reconfirmed the product-led commercial spine as Inklee's conversion layer.
- Reconfirmed problem-led guides as the primary authority and discovery layer.
- Stopped automatic expansion into adjacent feature and synonym pages.
- Limited the immediate new commercial-page queue to `/tattoo-appointment-reminders` and `/tattoo-client-management`.
- Moved `/tattoo-booking-management`, `/tattoo-appointment-calendar`, `/tattoo-artist-booking-page`, and `/tattoo-booking-form-template` behind explicit SERP and cannibalization validation.
- Required validation of six problem-led topics before selecting the first two guides.
- Added conversion measurement and a dated Google Search Console baseline as prerequisites for further page expansion.
- Reconfirmed that the existing comparison URLs own both `vs` and `alternative` intent unless SERP evidence supports a different structure.
- Reconfirmed that UK spelling variants belong in supporting copy, not separate pages.
- Reconfirmed that flash booking, flash ecommerce, artist storefronts, and studio software remain separate and product-gated territories.

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
