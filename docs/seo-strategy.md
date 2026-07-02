# Inklee SEO Strategy and Roadmap (source of truth)

**Status:** Active. Created 2026-07-01. This is the single source of truth for Inklee marketing SEO/GEO strategy.
**Supersedes:** the lost legacy memory `project_inklee_seo.md` (referenced by `docs/roadmap.md` §10 and §4.1). Consolidates the technical baseline in `docs/seo-geo-audit-slice-1.md` (now historical, most P0/P1 fixed), the component/assembly guidance in `docs/seo-landing-template-system-slice-4.md` (still valid), the June 2026 launch-sprint state (memory `seo-state`), and new qualitative Reddit keyword research (2026-07-01).
**Scope of this doc:** strategy, keyword-to-page ownership, page map, and the implementation roadmap. It does NOT change any production page, route, metadata, redirect, schema, sitemap, or app code. Implementation of any page below is a separate, gated slice.
**Owner:** Michel Kraeft. Product truth: `docs/business-model.md`, `docs/inklee-feature-scope.md`. Copy rules: `AGENTS.md` (sentence case, no em-dashes, Accept/Pass).

> **How to use this doc.** Before writing or changing any marketing page, find its row in the Page map (§5) and confirm the primary keyword it owns. One intent per page. Do not create a new page for a keyword already owned by an existing page (see the cannibalization rules in §5.3). Qualitative Reddit evidence in this doc is a signal of language and intent, NOT proof of search volume; anything marked "needs validation" must be checked against Search Console or a keyword tool before it drives a build.

---

## 0. Audit summary (Phase 1)

**Source-of-truth situation (the biggest structural gap).** Inklee has real, shipped SEO assets but no living strategy document. The nominal source of truth (`project_inklee_seo.md`) was lost; `docs/roadmap.md` §10 still points at it. Strategy today is scattered across the roadmap §4.1 paragraph, the `seo-state` memory (a state snapshot, not a strategy), and two dated slice docs. This document closes that gap.

**What already exists and is LIVE (this is not a greenfield plan).** The current architecture is essentially a product-led commercial build that already shipped:

| Cluster | Live pages |
| --- | --- |
| Home + brand | `/` (home), `/about`, `/start` (noindex), `/download`, `/help` |
| Pillar (category) | `/tattoo-booking-software` |
| Feature pages | `/tattoo-booking-form`, `/instagram-booking-link-for-tattoo-artists`, `/guest-spot-booking`, `/tattoo-deposit-tool`, `/tattoo-artist-waitlist` |
| Pain landing | `/dm-chaos`, `/guest-spots` (near-duplicate of `/guest-spot-booking`) |
| Comparison | `/tattoo-booking-software-vs-instagram-dms`, `-vs-google-forms`, `-vs-calendly` |
| Roundup / listicle | `/best-booking-app-for-tattoo-artists` |
| Planned (footer stubs, inactive) | `/resources/tattoo-booking-form-checklist`, `/resources/guest-spot-planning-checklist`, `/resources/instagram-booking-link-guide-for-tattoo-artists`, `/resources/dm-chaos-calculator` |

**Technical foundation: strong.** `metadataBase = https://inklee.app`; every marketing page except `/start` is indexable with a self-canonical; `robots.ts` disallows all private/auth routes; sitemap is clean (19 URLs, priorities laddered); JSON-LD is site-wide Organization + WebSite, plus WebPage + FAQPage on the long pages, SoftwareApplication on home, a bespoke MobileApplication on `/download`; no fabricated Review/Offers schema (correctly deferred); artist `/[slug]` booking pages are noindex-by-default; the Hub (`<slug>.l.inkl.ee`) is noindexed so it never competes with booking pages. Internal linking is a real hub-and-spoke: a shared footer links every route site-wide, the home page links out to the whole cluster, and each feature/comparison page carries a RELATED block.

**Weaknesses and gaps:**

1. **No living strategy / ownership doc** (fixed here).
2. **Cannibalization: `/guest-spots` vs `/guest-spot-booking`.** Both are indexable, both self-canonical, both target "tattoo guest spot booking," and they interlink. Clearest duplicate pair. Decision in §5.3.
3. **Soft title overlap:** home ("Tattoo booking tool for artists"), `/tattoo-booking-software` ("Tattoo booking software for artists"), and `/about` ("Tattoo Booking Tool for Artists") all lean on the same phrase. Not a hard duplicate (different intents) but needs explicit ownership (§5.2).
4. **The request-vs-direct-scheduling distinction is lived in product copy but not codified as an SEO guardrail.** The product is request-intake-first (Accept/Pass, not self-booking); several tempting keywords ("tattoo scheduling app," "appointment calendar for tattoo artists") carry salon-self-booking intent that mismatches the product. No rule currently prevents a future page from chasing them wrongly. Codified in §1 and §2.7.
5. **Roadmap §4.1 has no measurable priorities, dependencies, or completion criteria** and commits to "17+ Resources/* checklist pages" with no keyword validation. Reframed in §6.
6. **No UK-variant handling** ("tattooist," "enquiry") despite the UK being a primary market. Added to the validation backlog (§9).
7. **Cosmetic:** title separator drifts between `·` and `|` across pages; `buildTitle` in `lib/seo.ts` is dead code. Low priority (§6, Wave 0).

**Ten-question audit (compact):**

1. *Where documented:* fragmented (roadmap §4.1 + `seo-state` memory + two slice docs); nominal SoT lost. 2. *Source of truth:* none until this doc. 3. *Planned clusters/keywords:* pillar + feature + comparison + roundup live; 4 Resources pages stubbed; a vague "17+ checklist pages" commitment. 4. *Which exist:* the 16 pages above are live. 5. *Match real features:* yes, all live pages map to shipped features (booking form, IG link, guest spots, deposits, waitlist, comparisons). 6. *Outdated/duplicated/over-broad:* `/guest-spots` duplicate; slice-1 audit superseded; the 17-page checklist commitment is unvalidated. 7. *Page-type separation:* reasonably clear (footer groups Product/Compare/Resources), not formally documented as a taxonomy until §5. 8. *Cannibalization awareness:* partial (slice-4 warns "one intent per page") but no ownership map and one live duplicate. 9. *Request vs direct scheduling:* handled in positioning, not codified as SEO rule (now fixed). 10. *Measurable roadmap:* weak; no scoring, dependencies, or completion criteria (now added, §5/§6/§7/§8).

**Bottom line.** The Reddit research does not overturn the current strategy; it largely validates it. The commercial spine is already built and already speaks the native language artists use. The real work is (a) fix the one duplicate and codify ownership, (b) fill two genuine feature-page gaps that map to shipped features (reminders, client management), (c) shift new content effort away from more near-duplicate commercial pages and into problem-led guides a low-authority domain can actually rank for, and (d) validate volume/difficulty before committing to any new cluster.

---

## 1. Strategic position

- **Primary category (the term we compete to own):** tattoo booking software (with "tattoo booking app" and "tattoo booking system" as equal-intent variants of the same head term, owned by one page).
- **Primary audience (in order):** solo freelance tattoo artists (Instagram-first, beginner to a few years in); traveling / guest-spot artists; established artists wanting to leave DM chaos; small tattoo studios later (Studio product does not exist yet, so studio keywords are future-only).
- **Core search problem:** "Instagram DMs are not a booking system." Artists are drowning in scattered DMs, lost references, missing details, ghosted deposits, and no-shows, with no structured way to collect and manage tattoo requests.
- **Commercial positioning:** "Tattoo booking software built for independent tattoo artists." The cleanest way to turn Instagram attention into organized booking requests. Not an all-in-one studio OS, not a marketplace, not a generic salon scheduler.
- **The semantic distinction that governs every page (critical).** "Booking" means two different things and Inklee is only the second one:
  1. Client directly selects and reserves an appointment (salon self-booking). **Inklee is NOT this.**
  2. Client submits a complete tattoo request; the artist reviews and decides whether and when to book it. **Inklee IS this.**
  The differentiator, usable as copy: **"Clients submit a complete tattoo request. You decide what gets booked."** Supporting language: collect complete tattoo requests; review before booking; stay in control of your calendar; accept, pass, or suggest another date; built for custom tattoo projects; not generic salon scheduling. **SEO consequence:** never present Inklee as unrestricted self-booking software, and treat "scheduling app / appointment calendar / self-booking" keywords as secondary-and-reframed, never as a page promise (see §2.7).
- **Primary conversion:** create an Inklee account (`/signup`). Every commercial and feature page ends there; guides route to the relevant commercial page first, then to `/signup`.
- **Geography and language:** English only. Primary markets: Europe, United Kingdom, Southeast Asia, East Asia. No `/de` tree or hreflang yet (deferred). UK spelling variants ("tattooist," "enquiry") are supporting copy on existing pages, never separate pages (pending validation, §9).

---

## 2. Keyword clusters

Clusters below are grouped by role. Each cluster names its owning page (see §5 for the full map). "Native" = the language artists actually use (lead with it). "Careful" = terms with demand but wrong or risky intent (secondary only).

### 2.1 Core commercial (category), owned by `/tattoo-booking-software`
tattoo booking software; tattoo booking app; tattoo booking system; tattoo artist booking app; booking app / booking system for tattoo artists; tattoo booking platform. **All one intent, one page.** "best tattoo booking app / software / booking system" is a distinct *roundup* intent owned by `/best-booking-app-for-tattoo-artists`, not the pillar.

### 2.2 Feature-specific
- **Booking form / requests** (owned by `/tattoo-booking-form`): tattoo booking form; tattoo request form; booking form for tattoo artists; tattoo appointment request form; tattoo inquiry form; tattoo enquiry form; online tattoo booking form. One intent.
- **Booking page / Instagram link** (owned by `/instagram-booking-link-for-tattoo-artists`): tattoo artist booking page; tattoo booking link; tattoo artist booking link; tattoo booking link for Instagram; tattoo booking form for Instagram; link in bio for tattoo artists; tattoo artist page with booking form. (Watch "tattoo artist booking page" vs the pillar, §9.)
- **Deposits** (owned by `/tattoo-deposit-tool`): tattoo booking deposit system; tattoo deposit app; tattoo deposit payment system; take / collect tattoo deposits online; tattoo deposit link. Copy stays cautious about card processing (it is a paid, Stripe-connected feature; manual deposit tracking is free).
- **Reminders / no-shows** (NEW page `/tattoo-appointment-reminders`): tattoo appointment reminders; automatic tattoo appointment reminders; tattoo booking reminder emails; tattoo appointment confirmation; reduce / prevent tattoo no-shows.
- **Client management** (NEW page `/tattoo-client-management`): manage tattoo clients; tattoo client history; tattoo appointment history; tattoo client database. Lead with native "client information / client notes / tattoo history"; "tattoo CRM / CRM for tattoo artists" is a *secondary* keyword only.
- **Waitlist** (owned by `/tattoo-artist-waitlist`): tattoo artist waitlist; cancellation list; open spots. ("tattoo waitlist software" needs validation, §9.)
- **Guest spots** (owned by `/guest-spot-booking`): tattoo guest spot booking; guest spot booking tool; traveling tattoo artist booking. ("guest spot organizer / software," "traveling tattoo artist calendar" need validation, §9.)

### 2.3 Problem-led (high intent, Wave 3)
how to manage tattoo bookings; how to organize tattoo requests; how do tattoo artists manage bookings; how to create a tattoo booking process; how to handle tattoo booking requests; stop booking through Instagram DMs; how to take tattoo deposits online; how to reduce tattoo no-shows; how to automate tattoo appointment reminders; how to manage tattoo clients. Each becomes a guide that links UP to the owning commercial page. Watch overlap with `/dm-chaos` for the Instagram-DM query (§5.3).

### 2.4 Alternatives and comparisons
- Owned already: Instagram DMs (`-vs-instagram-dms`), Google Forms (`-vs-google-forms`), Calendly (`-vs-calendly`). These also own the "X alternative for tattoo bookings/artists" phrasing. **Do not build a separate `/google-forms-alternative-...` or `/calendly-alternative-...` page** (§5.3).
- Candidates, validation + fair-comparison required (Wave 4): Square Appointments; Jotform (overlaps form-builder intent, may fold into the form page); Wix / Squarespace (weaker fit, Inklee is not a website builder); Linktree (relates to the free, currently-noindexed Link Hub and the Instagram-link page).

### 2.5 Informational acquisition (broad, Wave 5)
how to get more tattoo bookings / clients; how to attract tattoo clients; how to fill empty tattoo appointments / cancellations; how to promote tattoo availability; how to announce tattoo books open; how to get tattoo bookings on Instagram; how to convert followers into tattoo clients; how to improve the tattoo client experience; tattoo artist marketing. **Framing guardrail:** booking software does not create demand. Angle: "Getting attention is only half the problem. Your booking process has to turn that attention into complete, manageable requests." Larger reach, weaker conversion, good for authority and internal links into the spine.

### 2.6 Future product expansion (Wave 6, gated on feature maturity + validation)
Guest spots and waitlist are already LIVE and stay in the spine (do not downgrade them just because they were thin in the Reddit sample). Not yet supportable by the product and therefore postponed: tattoo flash shop / flash marketplace / sell tattoo flash online / online shop for tattoo artists / tattoo artist ecommerce / artist storefront (goods are showcase-only, no checkout; flash is a bookable catalog, not a store). Revisit when goods checkout ships (Stripe Connect + `GOODS_COMMERCE_ENABLED`). See §9.

### 2.7 Terminology to use carefully
- **Lead with native language:** booking system / app / form, request / inquiry / enquiry form, booking link, deposits, booking fee, reminders, confirmations, no-shows, reference photos, placement, size, budget, client info / notes / tattoo history, return clients, books open, open spots, cancellation list, flash booking, buried messages, staying organized.
- **Avoid as lead copy or H1 (use only as secondary keywords where demand justifies it):** CRM, lead management, customer relationship management, workflow management, business organizer, client portal, administrative software.
- **Do not chase as a page promise:** "scheduling app," "appointment calendar," "self-booking," salon-scheduling terms. The product has an artist-side calendar and iCal export, but it is not self-booking. These terms are secondary-and-reframed on the pillar or a future calendar section only, never a standalone self-booking page (§1 distinction).

---

## 3. Reddit findings decision matrix (Phase 2)

Actions: Keep / Strengthen / Merge / Split / Reposition / Postpone / Remove / Needs validation.

| Cluster | Existing strategy | Reddit evidence | Product fit | Search intent | Cannibalization risk | Recommended action |
| --- | --- | --- | --- | --- | --- | --- |
| tattoo booking software (+ app/system/platform) | Pillar `/tattoo-booking-software` live | Strongest cluster; native | Exact (the product) | Category / commercial | Low (one page owns all variants) | **Keep + Strengthen** (add app/system as on-page secondary; keep single page) |
| tattoo booking form / request form / inquiry / enquiry | `/tattoo-booking-form` live | Native, high frequency | Exact | Feature / commercial | Low if kept single | **Keep**; fold inquiry/enquiry as supporting copy (no split) |
| tattoo artist booking page / booking link / IG link / link in bio | `/instagram-booking-link-for-tattoo-artists` live | Native | Exact | Feature / commercial | Medium (booking page vs pillar vs IG link) | **Keep**; **Needs validation** on "tattoo artist booking page" as its own intent (§9) |
| tattoo scheduling app / software; appointment / booking calendar | No dedicated page (calendar is artist-side) | Present but ambiguous | Partial (not self-booking) | Mixed (some salon self-booking) | High (product mismatch) | **Reposition**: secondary keyword, reframed to request-approval; **do not** build a self-booking page. Validate intent (§9) |
| tattoo booking deposit system / take deposits online / deposit link | `/tattoo-deposit-tool` live | Native | Exact (card = paid; manual = free) | Feature / commercial | Low | **Keep**; keep cautious card-processing copy |
| tattoo appointment reminders / reduce no-shows / confirmations | No page; feature shipped | Native, strong pain | Exact (reminder emails, cron) | Feature / commercial | Low (new owner) | **Split out**: build `/tattoo-appointment-reminders` (Wave 2) |
| tattoo client management / client history / database; tattoo CRM | No page; clients feature shipped | Native prefers "client info/notes/history" over "CRM" | Exact | Feature / commercial | Low | **Split out**: build `/tattoo-client-management` (Wave 2); "CRM" secondary only |
| best tattoo booking app / software | `/best-booking-app-for-tattoo-artists` live | Native "best ..." | Good (roundup) | Roundup / commercial-investigation | Medium vs pillar (kept distinct) | **Keep**; ownership: roundup owns "best", pillar owns category |
| how to manage tattoo bookings / organize requests / booking process | Only `/dm-chaos` adjacent | Native problem language | Good (top-of-funnel) | Informational / problem | Medium vs dm-chaos and pillar | **Strengthen**: Wave 3 guides linking up to the spine; validate angle vs dm-chaos |
| stop booking through Instagram DMs | `/dm-chaos` + `-vs-instagram-dms` own it | Native | Exact | Problem / commercial | High (already owned) | **Keep**; a how-to guide only if a distinct step-by-step angle exists (§5.3) |
| Google Forms alternative for tattoo bookings | `/tattoo-booking-software-vs-google-forms` live | Strong "fragmented workflow" evidence | Exact | Alternative / comparison | High if a new page is built | **Merge** into the existing vs- page; optimize title to capture "alternative"; no new page |
| Calendly / Square / Jotform / Wix / Linktree alternative | Calendly vs- page live; others none | Fragmented-stack evidence | Varies | Alternative / comparison | Medium | **Keep** Calendly; **Needs validation** for Square/Jotform/Wix/Linktree (Wave 4, fair comparison only) |
| guest spot booking (traveling artists) | `/guest-spot-booking` + `/guest-spots` live | Under-sampled but real | Exact (trip planner) | Feature / commercial | High (`/guest-spots` duplicate) | **Merge** `/guest-spots` into `/guest-spot-booking` (§5.3); keep the primary |
| tattoo waitlist / cancellation list / open spots | `/tattoo-artist-waitlist` live | Native | Exact (waitlist) | Feature / commercial | Low | **Keep**; validate "tattoo waitlist software" volume (§9) |
| get more bookings/clients; fill cancellations; announce books open; tattoo marketing | Not built | Larger reach, weak intent | Indirect (software is not demand-gen) | Informational / acquisition | Low | **Postpone to Wave 5**; use the "attention is half the problem" framing |
| flash shop / marketplace / sell flash / storefront / ecommerce | Not built | Under-sampled; flagged for separate research | Weak today (showcase-only, no checkout) | Commercial (transactional) | Low | **Postpone (Wave 6)**; do not over-promise ecommerce; revisit at goods checkout |

---

## 4. Strategy challenge: A vs B (Phase 3)

### Strategy A: product-led commercial architecture
Prioritize a strong pillar, dedicated feature pages, comparison/alternative pages, and high-intent problem pages, each converting directly to `/signup`. Architecture roughly: `/tattoo-booking-software`, `/tattoo-booking-form`, `/tattoo-artist-booking-page` (or the IG-link page), `/tattoo-deposit-system`, `/tattoo-appointment-reminders`, `/tattoo-client-management`, `/google-forms-alternative-...`, `/calendly-alternative-...`. **This is essentially what Inklee already shipped.**

### Strategy B: problem-led topical-authority architecture
Prioritize the native problems and language (managing requests, escaping DM chaos, building a booking process, collecting complete client info, taking deposits, reducing no-shows, filling cancellations, managing books-open periods, turning followers into manageable requests). Build educational/problem content to earn topical authority on a young domain, then route to a *smaller* set of consolidated commercial pages.

### Comparison

| Criterion | Strategy A (pure) | Strategy B (pure) |
| --- | --- | --- |
| Product-market fit | High (pages = real features) | High (problems = real pains) |
| Current domain authority | Assumes it (young domain, launched ~2026) | Builds it |
| Ranking feasibility (near-term) | Low on head commercial terms vs entrenched SaaS | Higher on long-tail problem queries |
| Commercial intent | High | Lower per page |
| Topical-authority potential | Medium (thin without supporting content) | High |
| Conversion proximity | High (page ends at signup) | Lower (guide then commercial then signup) |
| Content-production effort | Low now (spine already built) | High (many original guides) |
| Maintenance burden | Low | Medium-high (content freshness) |
| Cannibalization risk | Higher (more near-duplicate commercial pages) | Lower if guides stay distinct |
| Credibility | Good if honest | High (genuinely useful) |
| Usefulness to artists | Medium (buyer pages) | High (teaches) |
| Competes vs established SaaS | Weak head-on | Flanks via long tail |
| Fits Inklee's launch stage | Assets exist but cannot rank head terms yet | Matches a young domain's realistic wins |
| Expandability (guest spots, waitlist, shop, studio) | Add commercial pages as features ship | Add topic hubs as features mature |

### Recommendation: a specific hybrid ("built spine, fed by problem-led authority")

Neither pure strategy is right. Strategy A's commercial spine is **already shipped and cheap to maintain**, so its marginal cost is near zero and it owns the money intent; but a young domain cannot rank the head terms yet. Strategy B is where a young domain can actually win now and where the founder's limited content time should go, but pure B wastes the built spine and delays commercial capture. So:

**Keep the Strategy A spine, stop expanding it with near-duplicates, and invest new effort in Strategy B content that links UP into the spine.** Concretely:

1. **Consolidate and codify first (Wave 0-1).** Fix the `/guest-spots` duplicate, write the ownership map (§5.2), and set metadata/schema/linking standards. No net-new pages beyond fixing what exists.
2. **Fill the two genuine feature-page gaps (Wave 2)** that map to shipped features and validated Reddit clusters: `/tattoo-appointment-reminders` and `/tattoo-client-management`. These extend the spine without duplicating it.
3. **Then weight new production toward problem-led guides (Wave 3)** matching §2.3. Each guide targets a query the spine cannot (top-of-funnel "how to ..."), and each links up to the owning commercial page. This is the Strategy B investment and the main authority engine.
4. **Add alternative/comparison pages only where validated and fair (Wave 4),** never as duplicates of the vs- pages that already own that intent.
5. **Broad acquisition and future-feature clusters last (Waves 5-6),** gated on capacity and feature maturity.

**Internal-linking architecture for the hybrid.** Pillar `/tattoo-booking-software` is the hub. Feature pages link to the pillar and to 1-2 sibling features (already the pattern). Comparison pages link to the pillar and the roundup. Every Wave 3 guide links up to exactly one owning commercial page (its "money page") plus the pillar, and the owning commercial page gets a RELATED link back to its best guide. The shared footer keeps the whole set discoverable site-wide. This makes the guides do double duty: capture long-tail intent AND pass authority into the commercial spine.

---

## 5. Page map and ownership (Phase 4 + 5.3)

### 5.1 Page map

Status legend: **Live** = shipped and indexable; **Live (fix)** = shipped but needs a change; **New** = to build; **Planned** = footer stub only; **Postpone** = do not build yet.

| URL | Type | Primary keyword | Supporting keywords | Intent | Funnel | Conversion | Priority | Dependencies | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Home | tattoo booking tool for artists (brand) | booking requests, DM chaos | Brand / category | Mid | `/signup` | P0 | none | Live |
| `/tattoo-booking-software` | Core commercial (pillar) | tattoo booking software | booking app, booking system, platform | Category / commercial | Mid | `/signup` | P0 | none | Live |
| `/tattoo-booking-form` | Feature | tattoo booking form | request/inquiry/enquiry form, appointment request form | Feature / commercial | Mid | `/signup` | P1 | none | Live |
| `/instagram-booking-link-for-tattoo-artists` | Feature | instagram booking link for tattoo artists | booking link, link in bio, booking page | Feature / commercial | Mid | `/signup` | P1 | none | Live |
| `/tattoo-deposit-tool` | Feature | tattoo deposit tool | take/collect deposits online, deposit system/link | Feature / commercial | Mid | `/signup` | P1 | keep cautious card copy | Live |
| `/tattoo-artist-waitlist` | Feature | tattoo artist waitlist | cancellation list, open spots | Feature / commercial | Mid | `/signup` | P2 | none | Live |
| `/guest-spot-booking` | Feature | tattoo guest spot booking | traveling artist booking, city demand | Feature / commercial | Mid | `/signup` | P1 | absorb `/guest-spots` | Live |
| `/guest-spots` | Pain landing (dup) | (same as above) | - | duplicate | Mid | `/signup` | - | consolidation | **Consolidated + LIVE (deployed 2026-07-02, master `ca4a06e`): 308 → `/guest-spot-booking`, page removed** |
| `/dm-chaos` | Pain landing | tattoo booking from Instagram / DM chaos | stop losing tattoo requests | Problem / commercial | Top-mid | `/signup` | P1 | none | Live |
| `/tattoo-booking-software-vs-instagram-dms` | Comparison | tattoo booking vs Instagram DMs | move bookings off DMs | Comparison | Mid | `/signup` | P1 | none | Live |
| `/tattoo-booking-software-vs-google-forms` | Comparison / alternative | tattoo booking software vs Google Forms | Google Forms alternative for tattoo bookings | Comparison / alternative | Mid | `/signup` | P1 | title tune for "alternative" | Live |
| `/tattoo-booking-software-vs-calendly` | Comparison / alternative | tattoo booking software vs Calendly | Calendly alternative for tattoo artists | Comparison / alternative | Mid | `/signup` | P1 | title tune for "alternative" | Live |
| `/best-booking-app-for-tattoo-artists` | Roundup / listicle | best booking app for tattoo artists | best tattoo booking software | Investigation / commercial | Mid | `/signup` | P2 | none | Live |
| `/download` | App | Inklee app for tattoo artists | tattoo artist app iOS Android | Brand / app | Bottom | store badges / `/signup` | P2 | store links are placeholders | Live |
| `/about` | Brand / company | about Inklee | built by a tattoo artist | Brand / trust | Mid | `/signup` | P3 | none | Live |
| `/help` | Support | Inklee help and FAQ | booking page, deposits, calendar export | Support | n/a | none (support) | P3 | none | Live |
| `/tattoo-appointment-reminders` | Feature | tattoo appointment reminders | reduce no-shows, reminder emails, confirmations | Feature / commercial | Mid | `/signup` | **P1 (new)** | reminder feature (shipped) | **New (Wave 2)** |
| `/tattoo-client-management` | Feature | tattoo client management | client history/notes/database; tattoo CRM (secondary) | Feature / commercial | Mid | `/signup` | **P2 (new)** | clients feature (shipped) | **New (Wave 2)** |
| Guides (§2.3) | Guide | e.g. how to manage tattoo bookings | organize requests, booking process | Problem / informational | Top | up to owning commercial page then `/signup` | **P2 (new)** | none (content only) | **New (Wave 3)** |
| `/resources/*` checklists | Supporting article | booking form checklist, guest spot checklist | - | Informational | Top | up to owning page | P3 | validate demand first | **Planned (reframe, §6)** |
| Square / Jotform / Wix / Linktree alternatives | Alternative | e.g. Square Appointments alternative for tattoo artists | fragmented stack | Alternative | Mid | `/signup` | P3 | validation + fair comparison | **New if validated (Wave 4)** |
| Broad acquisition (§2.5) | Supporting article | e.g. how to fill tattoo cancellations | books open, get more bookings | Informational | Top | up to owning page | P3 | capacity | **New (Wave 5)** |
| Flash shop / storefront / ecommerce | (future) | sell tattoo flash online, artist storefront | - | Transactional | Bottom | - | P4 | goods checkout not shipped | **Postpone (Wave 6)** |
| Studio / multi-artist | (future) | tattoo studio booking software | studio management | Commercial | Mid | `/signup` | P4 | Studio product does not exist | **Postpone (Wave 6)** |
| `/tattoo-artist-booking-page` (standalone) | Feature | tattoo artist booking page | - | Feature / commercial | Mid | `/signup` | ? | SERP-overlap check vs IG-link/pillar | **Needs validation (§9)** |
| `/tattoo-scheduling-app` (self-booking) | - | - | - | Mixed / mismatch | - | - | - | product mismatch | **Do not build (§1, §2.7)** |

### 5.2 Keyword-to-page ownership map (one owner per intent)

- **tattoo booking software / app / system / platform, "booking app/system for tattoo artists"** -> `/tattoo-booking-software` (pillar). Home may rank for brand + "tattoo booking tool" but does not target "software."
- **best tattoo booking app / software / "best booking system"** -> `/best-booking-app-for-tattoo-artists` (roundup). Not the pillar.
- **tattoo booking form / request / inquiry / enquiry / appointment request / online booking form** -> `/tattoo-booking-form`.
- **tattoo booking link / IG booking link / link in bio / booking page / booking form for Instagram** -> `/instagram-booking-link-for-tattoo-artists`.
- **tattoo deposits (system / app / link / take/collect online)** -> `/tattoo-deposit-tool`.
- **tattoo appointment reminders / confirmations / reduce no-shows** -> `/tattoo-appointment-reminders` (new).
- **tattoo client management / history / notes / database / CRM (secondary)** -> `/tattoo-client-management` (new).
- **tattoo waitlist / cancellation list / open spots** -> `/tattoo-artist-waitlist`.
- **tattoo guest spot booking / traveling artist booking** -> `/guest-spot-booking` (after absorbing `/guest-spots`).
- **tattoo booking from Instagram / DM chaos / stop losing requests / stop booking through DMs** -> `/dm-chaos` (pain) and `-vs-instagram-dms` (comparison). A Wave 3 how-to guide may co-exist only with a distinct step-by-step angle.
- **X vs / X alternative (Google Forms, Calendly, Instagram DMs)** -> the existing `-vs-` page for each. New alternative pages (Square, Jotform, Wix, Linktree) only after validation, each with a distinct competitor.

### 5.3 Cannibalization rules

1. **Do not create separate pages for equal-intent synonyms.** "app" vs "software" vs "system," "inquiry" vs "enquiry," "artist" vs "tattoo artist," singular vs plural, and minor word-order changes are the SAME page. Add them as on-page supporting copy, headings, or FAQ, not new URLs.
2. **`/guest-spots` -> `/guest-spot-booking`.** Consolidate: 301/308 redirect `/guest-spots` to `/guest-spot-booking`, fold any unique copy in, and remove the interlink loop. `/guest-spot-booking` is the survivor (it is in the footer, sitemap priority 0.9, has FAQ schema and a comparison block). This is a decision recorded here; the redirect itself is an implementation slice (Wave 1), not part of this doc.
3. **Do not build "Google Forms alternative" or "Calendly alternative" pages.** The `-vs-google-forms` and `-vs-calendly` pages already own that intent. Instead, tune those pages' titles/H2/FAQ to also capture "alternative for tattoo artists/bookings" phrasing.
4. **Scheduling/calendar terms stay secondary.** No standalone self-booking/scheduling page (product mismatch, §1).
5. **Guides never duplicate their money page.** A Wave 3 guide must answer a "how to" question the commercial page does not; if a guide's intent collapses into an existing commercial page, drop the guide and strengthen the page instead.
6. **New page gate:** before any new page, confirm (a) it maps to a shipped feature, (b) it has a distinct primary keyword not already owned above, and (c) SERP evidence shows a different intent from the nearest existing page.

---

## 6. Implementation waves

Each wave lists completion criteria. Waves are ordered; within a wave, items can run in parallel. Nothing here is a commitment to a build date; it is priority order.

### Wave 0: technical and strategic foundation
- Confirm canonical domain and URL conventions (done: `inklee.app`, self-canonicals, keyword-exact slugs).
- Verify sitemap and indexing health in GSC (sitemap submitted; re-check coverage and the benign "alternate canonical" notice).
- Confirm metadata templates and standardize the title separator (`·` vs `|`); decide whether to retire or use the dead `buildTitle` helper.
- Establish schema standards (Organization + WebSite site-wide; WebPage + FAQPage on long pages; SoftwareApplication on home; MobileApplication on `/download`; no Review/Offers until real). Consider BreadcrumbList on deep pages (deferred, low value).
- Establish internal-linking rules (§4 hub-and-spoke; every new page joins the footer + a RELATED block + the ownership map).
- Set up baseline Search Console measurements per §8; record a starting snapshot per page type.
- **Adopt this doc as the ownership source of truth; retire references to the lost `project_inklee_seo.md`.**
- **Completion:** ownership map live; GSC baseline captured; separator decision made; no orphan pages.

### Wave 1: core commercial foundation (consolidate, do not expand)
- Consolidate `/guest-spots` -> `/guest-spot-booking` (§5.3.2).
- Tune `-vs-google-forms` and `-vs-calendly` titles/copy to capture "alternative" phrasing (§5.3.3).
- Confirm ownership and de-duplicate soft overlaps between home / pillar / about titles (§5.2); no new pages.
- Optional: revisit whether "tattoo artist booking page" needs its own page or stays folded (blocked on §9 validation).
- **Completion:** one guest-spot page; no live duplicate pairs; alternative phrasing captured; home/pillar/about ownership documented and reflected in titles.

### Wave 2: product feature pages (fill genuine gaps)
- Build `/tattoo-appointment-reminders` (reminder emails, confirmations, reduce no-shows). Real feature. Native language; link to pillar + `/tattoo-deposit-tool` + the future no-show guide.
- Build `/tattoo-client-management` (auto-collected clients, history, private notes, search). Lead native; "CRM" secondary only. Link to pillar + `/tattoo-booking-form`.
- (Deposits, forms, IG link, waitlist, guest spots already exist; strengthen copy only if needed.)
- **Completion:** both pages live, indexed, in the sitemap + footer + ownership map, each with a single clear intent and FAQ schema.

### Wave 3: high-intent problem content (the Strategy B investment)
Guides for §2.3, each linking up to one owning commercial page:
- how to manage tattoo bookings; how to organize tattoo requests; how to create a tattoo booking process; how to handle tattoo booking requests -> pillar / form.
- how to take tattoo deposits online -> `/tattoo-deposit-tool`.
- how to reduce tattoo no-shows; how to automate appointment reminders -> `/tattoo-appointment-reminders`.
- how to manage tattoo clients -> `/tattoo-client-management`.
- how to move tattoo bookings off Instagram DMs (distinct step-by-step angle only) -> `/dm-chaos`.
- Reframe the 4 stubbed `/resources/*` checklists here: keep only those that match a validated problem query; drop the rest rather than shipping thin checklists. The "17+ checklist pages" commitment is retired in favor of validated, problem-led guides.
- **Completion:** each guide targets a validated distinct query, links up correctly, and is not a duplicate of its money page.

### Wave 4: alternatives and comparisons (validated + fair only)
- Candidates: Square Appointments, Jotform, Wix/Squarespace, Linktree. Build a page only where (a) volume/difficulty validate it and (b) Inklee can make a factual, fair, useful comparison. Jotform likely folds into the form page; Linktree relates to the Link Hub + IG-link page (decide overlap first).
- **Completion:** each shipped page names one competitor, is honest, and does not duplicate an existing vs- page.

### Wave 5: broader topical authority
- §2.5 acquisition topics, with the "attention is half the problem" framing; link into the spine. Sparingly; these are authority/brand plays with weak conversion.
- **Completion:** each article links to a commercial page and does not imply software creates demand.

### Wave 6: future-product clusters (gated)
- Guest spots and waitlist are already live (not future). New future work: flash-booking or (later) flash-selling pages, storefront/goods, traveling-artist hubs, and studio/multi-artist pages, each gated on the feature actually shipping (goods checkout, Studio product) AND separate keyword validation. Do not over-promise ecommerce or studio features that do not exist.
- **Completion:** no page claims a capability the product lacks; each is unblocked by a shipped feature.

---

## 7. Prioritization model

Score 1-5 per dimension (5 = best). Total is a guide, not a ruler; strategic dependencies (a duplicate must be fixed before new builds; a feature must ship before its page) override the number.

Dimensions: PF product fit, CI commercial intent, QV qualitative (Reddit) audience validation, RF ranking feasibility (young domain), CP conversion potential, IR implementation readiness, SD strategic differentiation.

| Page / work item | PF | CI | QV | RF | CP | IR | SD | Total | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Consolidate `/guest-spots` (Wave 1) | 5 | 4 | 4 | 5 | 4 | 5 | 3 | 30 | Removes self-competition; near-zero cost |
| Ownership map + GSC baseline (Wave 0) | 5 | 4 | 5 | 5 | 4 | 5 | 4 | 32 | Prevents future cannibalization; enabler |
| `/tattoo-appointment-reminders` (Wave 2) | 5 | 4 | 5 | 4 | 4 | 5 | 4 | 31 | Real feature; strong no-show pain; new owner |
| `/tattoo-client-management` (Wave 2) | 5 | 4 | 4 | 4 | 3 | 5 | 4 | 29 | Real feature; native copy; CRM secondary |
| Alternative-phrasing tune on vs- pages (Wave 1) | 4 | 4 | 4 | 4 | 4 | 5 | 3 | 28 | Captures "alternative" without a new page |
| Problem-led guides (Wave 3) | 4 | 3 | 5 | 5 | 3 | 3 | 5 | 28 | Best young-domain ranking; feeds spine |
| Pillar strengthen (Wave 0-1) | 5 | 5 | 5 | 2 | 5 | 5 | 4 | 31 | Head term hard to rank now, but the hub |
| Square/Jotform/Wix/Linktree alternatives (Wave 4) | 3 | 4 | 3 | 3 | 4 | 3 | 3 | 23 | Only if validated + fair |
| Broad acquisition articles (Wave 5) | 3 | 2 | 4 | 4 | 2 | 3 | 4 | 22 | Reach and authority, weak conversion |
| Flash shop / storefront (Wave 6) | 2 | 3 | 2 | 3 | 3 | 1 | 3 | 17 | Blocked: no checkout; over-promise risk |

Reading: Wave 0-2 items dominate (fix duplicates, codify ownership, fill real feature gaps). Guides (Wave 3) score high on validation and ranking feasibility, which is exactly why they carry the young-domain authority push despite lower per-page conversion. Future clusters score lowest, correctly.

---

## 8. Measurement framework

Baseline in GSC (Domain property `inklee.app`) and Plausible; review monthly. Track per page type, not just sitewide.

| Metric | Where | Applies to | What good looks like |
| --- | --- | --- | --- |
| Impressions (non-branded) | GSC | all commercial/feature/guide | rising after indexation |
| Average position (target keyword) | GSC | each owned keyword | top-20 then top-10 progression |
| Non-branded clicks | GSC | all | rising share vs branded |
| CTR | GSC | all | at/above SERP-position benchmark; tune titles if low |
| Indexed-page status | GSC coverage | all | indexed, self-canonical, no "duplicate without canonical" |
| Competing-page overlap (same query, two URLs) | GSC (pages per query) | cannibalization watch | one URL per query; investigate splits |
| Query expansion (new queries per page) | GSC | guides / feature pages | growing long-tail footprint |
| Regional query differences (UK/EU/SEA/EA) | GSC (countries) | all | informs tattooist/enquiry decision |
| Internal-link clicks | Plausible (outbound/link events) | guides -> commercial | guides send traffic down-funnel |
| Account-creation visits (signup page views from marketing) | Plausible path/referrer | all | commercial pages drive `/signup` |
| Account-creation conversion (`signup_completed`) | Plausible custom event (Slice 63) | all | primary KPI; per-source attribution |
| Assisted conversions (multi-touch to signup) | Plausible | guides | guides assist even if last-click is a commercial page |

Do not promise traffic numbers without quantitative data. Rankings and volume estimates require GSC history plus a keyword tool.

---

## 9. Validation backlog (needs external tools / GSC data)

Qualitative Reddit evidence is language/intent signal, not volume. Validate before committing build effort:

1. **Search volume and keyword difficulty** for every primary keyword in §5.1 (especially the head "tattoo booking software/app/system" and the two new feature pages).
2. **SERP composition** per head term (is it dominated by SaaS listicles, marketplaces, or app stores? informs whether Inklee can realistically rank).
3. **Ranking competitors** per term (who holds the top 10; what page type wins).
4. **Regional differences** across EU / UK / Southeast Asia / East Asia (query mix, intent, competition).
5. **"tattoo artist" vs "tattooist"** (UK). Same-intent variant on existing pages, or a supporting section, or negligible? Decide from UK GSC data. No separate page.
6. **"inquiry" vs "enquiry"** (US vs UK). Confirm one page can hold both as supporting copy (expected yes).
7. **"software" vs "app" vs "system"** single-intent confirmation via SERP overlap (expected: one page; confirm before ever splitting).
8. **"tattoo artist booking page"** as a distinct intent from the IG-link page and the pillar (build a page only if SERP shows a different intent).
9. **"tattoo scheduling app / appointment calendar"** intent split: how much is salon-self-booking (mismatch) vs artist-side calendar (fit)? Governs whether any calendar section is worth targeting.
10. **Guest-spot terminology** ("guest spot organizer/software," "traveling tattoo artist calendar") volume and whether the existing page covers it.
11. **Waitlist terminology** ("tattoo waitlist software," "books-open tools") volume.
12. **Alternative candidates** (Square Appointments, Jotform, Wix, Linktree): real search demand + whether a fair comparison exists.
13. **Flash-shop / storefront / "sell tattoo flash online" / broad artist-shop** demand (separate research; the Reddit sample under-covered these and the feature is not transactional yet).
14. **Home vs pillar vs about** query overlap (confirm the soft title overlap is not costing clicks).

---

## 10. Roadmap changes (added / merged / postponed / removed)

**Added:**
- New source-of-truth doc (this file) with ownership map, page map, waves, scoring, measurement, and validation backlog.
- New feature pages `/tattoo-appointment-reminders` and `/tattoo-client-management` (Wave 2), mapped to shipped features.
- Wave 3 problem-led guide track (the Strategy B authority investment).
- UK-variant and scheduling-intent items on the validation backlog.

**Merged / consolidated:**
- `/guest-spots` -> `/guest-spot-booking` (kill the duplicate).
- "Google Forms alternative" and "Calendly alternative" intents folded into the existing `-vs-` pages (title/copy tune, no new pages).
- "app / system / platform," "inquiry / enquiry," singular/plural, word-order variants folded into their owning pages as supporting copy.

**Postponed (with the evidence needed to reconsider, §9):**
- Square/Jotform/Wix/Linktree alternative pages (Wave 4): need volume + fair-comparison validation.
- Broad acquisition articles (Wave 5): capacity-gated; weak conversion.
- Flash shop / storefront / ecommerce / studio pages (Wave 6): gated on goods checkout and the Studio product actually shipping.
- Standalone `/tattoo-artist-booking-page` and any scheduling/calendar page: gated on SERP-intent validation; scheduling self-booking page is a product mismatch and should not be built.

**Removed / retired:**
- The unvalidated "17+ Resources/* checklist pages" commitment in roadmap §4.1 is retired; replaced by validated Wave 3 guides (keep only checklist stubs that match a validated query).
- References to the lost `project_inklee_seo.md` as the SoT (roadmap §10 + §4.1) are redirected to this doc.
- `docs/seo-geo-audit-slice-1.md` is marked historical (its P0/P1 were fixed in the June 2026 launch sprint).

---

## 11. Assumptions and open questions

**Assumptions (documented, not verified here):**
- The domain is young and low-authority (launched ~June 2026), so head commercial terms are not near-term wins; long-tail problem content is the realistic authority path. (Verify against GSC once history exists.)
- Content-production capacity is a solo-founder constraint; effort should concentrate, not spread across dozens of thin pages.
- The product is and remains request-intake-first (Accept/Pass), not self-booking. All SEO copy must reflect this.
- Deposits: card processing is a paid, Stripe-connected feature (manual tracking is free); deposit-page copy stays cautious and must not imply free card processing.
- Goods are showcase-only (no checkout) and Studio multi-tenancy does not exist; SEO must not promise either.

**Open questions:**
- Should the two comparison pages be renamed/expanded to "alternative" pages, or keep "vs" titles with added "alternative" copy? (Recommend the latter to avoid churn; revisit with CTR data.)
- Does "tattoo artist booking page" merit its own page, or stay folded into the IG-link page and pillar? (Blocked on §9.8.)
- UK strategy: supporting copy for "tattooist/enquiry," or negligible? (Blocked on §9.5-9.6.)
- Link Hub angle: is a "Linktree alternative for tattoo artists" page worth it given the Hub is free and currently noindexed? (Wave 4 validation.)
- When goods checkout ships, does flash move from showcase framing to a "sell tattoo flash online" transactional page, and how do we avoid marketplace connotations the brand rejects?

---

## 12. Changelog

- **2026-07-02 (Wave 1 quick wins DEPLOYED, prod master `ca4a06e`).** Consolidated the `/guest-spots` vs `/guest-spot-booking` duplicate: added a permanent `/guest-spots` → `/guest-spot-booking` redirect in `apps/web/vercel.json` (same edge-redirect pattern as `/impressum`), removed the `/guest-spots` page and its sitemap entry, and repointed the two internal links that pointed at it (`/guest-spot-booking` hero secondary CTA → `/tattoo-booking-software`; a RELATED card → `/tattoo-artist-waitlist`). `guest-spots` stays in the reserved-slug list so no artist can claim the path. Also captured "alternative" phrasing on the two comparison pages without new URLs: updated the meta descriptions and added one FAQ entry each ("Is Inklee a good Google Forms/Calendly alternative for tattoo artists?", which also feeds FAQPage schema) on `-vs-google-forms` and `-vs-calendly`. Gate green: web tsc clean, lint 0 errors, no em-dashes. Committed (`d78bfc6`) + merged to master (`ca4a06e`) + deployed via Vercel git integration; verified live (`curl` on `/guest-spots` returns 308 to `/guest-spot-booking`). **Founder follow-up:** GSC re-submit the sitemap and request recrawl/removal of `/guest-spots` so the consolidation lands cleanly.
- **2026-07-01 (this doc created).** Established `docs/seo-strategy.md` as the SEO source of truth, replacing the lost `project_inklee_seo.md`. Audited the live architecture (16 marketing pages + strong technical foundation) against new qualitative Reddit keyword research. Findings: the Reddit language validates the existing product-led spine rather than overturning it. Key decisions recorded: (1) consolidate the `/guest-spots` vs `/guest-spot-booking` duplicate; (2) do not build separate "Google Forms/Calendly alternative" pages (existing vs- pages own that intent); (3) add two feature pages that map to shipped features (`/tattoo-appointment-reminders`, `/tattoo-client-management`) with native language and CRM only as a secondary keyword; (4) codify the request-vs-self-booking distinction as an SEO guardrail and keep scheduling/calendar terms secondary; (5) retire the unvalidated "17+ checklist pages" plan in favor of validated Wave 3 problem-led guides that feed the commercial spine; (6) add a keyword-to-page ownership map and cannibalization rules; (7) add a measurement framework and a validation backlog (including UK tattooist/enquiry variants). Chosen strategy: a specific hybrid (keep the built Strategy A spine, stop expanding it with near-duplicates, invest new effort in Strategy B problem-led guides that link up into the spine). No production code, routes, metadata, redirects, schema, or sitemap were changed by this task; every page action above is a separate gated slice.
