# Inklee 2.0 map growth strategy

Status: approved long-term product direction, adopted 2026-07-27 through the founder-directed map future-scope pass (founder direction 2026-07-26: scope first, then slices, then go-live, then features; roadmap §1). The core decision, the two-layer position, and the constraints (§1 to §3) carry founder authority through that direction; the elaboration (mode details, portfolio classifications, challenge outcomes) implements it and any line of it can be adjusted by a later founder decision without reopening the direction itself. This document defines what the public tattoo map is for, how it grows, which future capabilities exist in the plan, and in what order they may be considered. It is direction, not an implementation schedule: nothing in this document is scheduled, dated, or promoted into an active build phase by appearing here.

Document ownership:

- This document owns: the map's long-term product role, the growth loops, the future feature portfolio and its classification, the feature discovery framework, the measurement framework, and the prioritization horizons.
- `docs/product/inklee-2-guestspot-map-scope.md` owns: the locked Inklee 2.0 scope and the studio-network decisions (roles, guest spot workflow, groups, shops, reputation design, privacy planes). Where that document's audience statements conflict with the public-map direction, this document and the dated supersession notes in the scope doc win.
- `docs/product/inklee-2-build-plan.md` owns: implementation status and build sequencing.
- `docs/product/inklee-2-open-questions.md` owns: undecided founder, legal, privacy, cost, and usage questions. Nothing here resolves one silently.
- `docs/seo/inklee-seo-strategy.md` owns: everything about indexation, keyword ownership, sitemap, structured data, and page architecture. This document changes none of it.
- `docs/product/pricing-model.md` and `docs/business-model.md` own pricing. This document invents no price and approves no paid feature.

## 1. The core product decision

Approved as the long-term direction:

> Inklee should not try to build the largest generic tattoo directory. It should build the best professional discovery, decision, and coordination layer around tattoo locations.

Google Maps and generic directories already serve basic place search. Inklee's map wins by connecting discovery to tattoo-specific professional workflows: guest spot research and applications, travel planning, studio claiming and identity, house rules, welcome packs, workspace information, artist availability, artist-controlled requests, calendars, clients, deposits, booking periods, notifications, and ongoing professional relationships.

The central product promise:

> Discover the right place, build the professional connection, and manage the resulting work in Inklee.

The short form:

> Find the place. Build the connection. Manage the work.

This direction complements, and never replaces, Inklee's existing identity as artist-controlled tattoo booking and workflow software. The booking product remains the core; the map is the discovery layer that feeds it.

## 2. Strategic position: two connected layers

The map is not a separate business. Inklee is two connected layers over one account:

**Manage your tattoo work** (shipped, the 1.x core plus the 2.0 guest spot workflow): booking requests, artist review with Accept or Pass, deposits, clients, calendar, reminders, waitlist, books-open periods, guest spot management, public artist presence, and shop and flash workflows where supported.

**Discover the tattoo world** (the 2.0 map layer, live for signed-in artists, public shell postponed): explore studios, research cities, find possible guest spot locations, understand owner-declared studio specialties, see consented guest artist activity, watch studios, plan professional travel, claim studio profiles, build professional connections, and move accepted opportunities into the Inklee workflow.

The discovery layer feeds the management layer. The intended loop:

1. Explore a studio or city.
2. Save, watch, compare, or contact a place.
3. Discover or create a professional opportunity.
4. Move the opportunity into a structured Inklee workflow.
5. Manage the stay, dates, requests, clients, and resulting bookings in Inklee.
6. Return through alerts, travel planning, profile activity, or further opportunities.

The central product test: **does the map create professional actions that move users into Inklee's workflow?** If the map produces only browsing, it is functioning as a directory. If it creates claims, watches, trips, applications, accepted guest spots, and managed bookings, it is functioning as an Inklee growth engine.

## 3. Non-negotiable constraints

These stand unless a separate founder or strategy decision changes them. Each names its source.

| Constraint | Source |
| --- | --- |
| One shared map core with capability layers and multiple shells; public, authenticated artist, and studio-owner experiences are the same technical map product | Founder architecture directive 2026-07-22, `inklee-2-map-redesign-audit-and-plan.md` |
| Personal overlays (watches, journey, blocks) stay separate from public data and are never SSR-embedded on a public surface | Redesign plan §15, three-plane model |
| The public map is an experimental, community-evolving surface | Founder decision 2026-07-22 (Q3 reversal) |
| `/map` stays `noindex, follow`, outside the sitemap; filter combinations are never indexable; unclaimed entries are never indexable; claimed studio pages become indexable only after the full quality and privacy gate; city pages are validation-gated; style pages are postponed | `inklee-seo-strategy.md`, ratified 2026-07-23 |
| Account creation is the primary conversion | SEO strategy + business model |
| The public map must not imply unrestricted client self-booking | SEO strategy directory rules + `inklee-feature-scope.md` guardrails |
| `/guest-spot-booking` owns guest spot organization and software intent | SEO strategy |
| Public artist location and future travel exposure require explicit consent; no live location, city granularity only; anonymous counts floored at 3 | Scope §4.1/§4.12, Q13, redesign plan |
| Exact private studio locations are never exposed | Scope §4.3; `address_visibility` + deterministic display offset |
| No fabricated style, quality, popularity, rating, or proficiency claims | Scope §4.9, redesign plan challenges 7 and 14 |
| No parallel trip, booking, guest spot, notification, studio, or artist-profile system where a canonical entity exists | One-source-of-truth founder rule; collision audit |
| Public launch is gated by the standing legal, moderation, privacy, performance, and SEO requirements | Roadmap §6.6 public-shell list, Q20/Q14 records |
| Registry entry before any new flag; capability kill-switch coverage for native surfaces | `docs/architecture/remote-config-plan.md` |
| The parity register `docs/web-native-parity.md` is updated with every native-affecting change | Founder rule 2026-07-26, AGENTS.md |

## 4. The four product modes

The future map experience is organized around four capability modes over the same shared map core. Modes are product concepts, not necessarily four routes.

### 4.1 Explore

Primary users: public visitors, artists, studio owners. Primary question: what tattoo studios and relevant tattoo places exist here?

Core value: search places, explore areas, open studio details, distinguish claimed and unclaimed entries, see truthful public studio information and owner-declared specialties, see consented guest artist activity, share a studio or map state, suggest corrections, start a studio claim. Anonymous exploration must provide real value before registration.

Today: the mode exists for signed-in artists (immersive shell, search, filters, detail panel, deep links via URL state). The anonymous variant is the postponed public shell. Two known gaps hold Explore back even for signed-in users: claimed and unclaimed pins render identically on the canvas (the distinction is text-only), and claimed studio photos and logos are a publish requirement that no visitor surface ever renders.

### 4.2 Guest spots

Primary users: traveling artists and studio owners. Primary question: where could I work, and what does the studio expect?

Future filtering and decision support may include: accepting-guests state, guest spot status, preferred dates, owner-declared styles or specialties, studio type, private room, workstation availability, equipment or supplies included, minimum stay, house rules available, welcome pack after acceptance, languages, accessibility information, current or upcoming guest activity, and temporary studio opportunities.

This mode must connect discovery to Inklee's request-based guest spot workflow. It must not become direct self-booking.

Today: the workflow core is shipped (request form from a pin, studio inbox with Accept, Pass, and Suggest dates, acceptance materializing a locked trip leg, house rules, welcome packs, temporary signals, guest artist timeline). What is missing is the discovery side: there is no guest-spot filter on the map, no opportunity cards, and several of the decision attributes (minimum stay, included equipment, languages, accessibility) have no data model.

### 4.3 Plan a trip

Primary users: traveling artists. Primary question: which studios, cities, and dates should become part of my professional travel plan?

Future value may include: save cities, save candidate studios, organize shortlists, add approximate travel dates, compare studio requirements, track application status, record confirmed stays, convert accepted guest spots into the canonical trip model, connect stops to booking periods, connect destination availability to the artist's public presence, and share a privacy-safe version of a trip or upcoming tour.

Inklee is not becoming a general travel booking product. The trip mode exists only for tattoo work and professional travel.

Today: the canonical trip model and the accepted-guest-spot conversion are shipped. Everything upstream of a request (shortlists, saved cities, comparisons, approximate dates, route ordering) is absent, and there is no linkage between trips and books-open periods.

### 4.4 Manage presence

Primary users: studio owners and artists. Primary question: how do I appear in the tattoo network, and what needs my attention?

Studio owner value may include: claim state, profile completeness, public preview, missing information, profile freshness, guest spot status, house rules, welcome pack, current and upcoming guests, watch or interest signals where appropriate, correction and moderation state, privacy-safe profile visit and action counts, and opportunity responses.

Artist value may include: map visibility, current city, future destinations, looking-for-guest-spots state, guest artist naming consent, public or member-only presence, travel history privacy, saved studios and cities, and opportunity alerts.

Today: the studio cockpit covers claim state, completeness, publishing, signals, requests, and stays. Artist presence settings cover map visibility, base city, looking-for-guest-spots, guest naming opt-out, and passport privacy, on web only (no native presence settings exist). One truth-in-copy defect: the `travel_map_consent` toggle ("Show my upcoming trip cities on the map") is collected and stored but no read path consumes it, so the promised destination display does not exist yet. Either the read path ships (Horizon 2) or the copy comes down; leaving a consent toggle attached to a nonexistent feature is not acceptable long term.

## 5. Access and value ladder

Registration unlocks continuity and professional action, not basic visibility. Basic public discovery is never paywalled.

**Anonymous visitor** may: explore the map, search and filter public data, open public studio information, share map states and studios, suggest corrections, start a claim flow, follow official external studio links. Must not access private interaction surfaces or personal data. (Today: this rung does not exist; it is the public shell.)

**Free Inklee account** may additionally: watch studios, save cities, create private lists, preserve map state, receive basic alerts, start guest spot actions, add places to a trip, manage personal map preferences. (Today: watching, map URL state, signal alerts, and guest spot requests exist; saved cities, lists, preserved server-side state, and preferences do not.)

**Artist account with completed identity** may additionally: publish consented map presence, show future destinations, show looking-for-guest-spots state, apply for guest spots, manage trips and accepted stays, build a professional map history, connect map opportunities to booking periods. (Today: presence, looking state, applications, and stays exist; future-destination display and booking-period connection do not.)

**Studio owner** may additionally: claim or create a studio, complete and publish the studio profile, set guest spot availability, manage opportunities, publish house rules, manage guest stays, send welcome packs, manage temporary studio signals, see operational map-related activity. (Today: all of this exists except an opportunity board and analytics.)

**Future paid value** stays open until pricing and product evidence justify it. Possible candidates: advanced opportunity alerts, studio analytics, team or roster management, advanced guest spot operations, more sophisticated saved searches, demand and travel insight tools, and clearly labeled promotional visibility. See §7 group K and the guardrails there. Nothing on this rung is approved by this document.

## 6. Growth loops

Six loops define how the map acquires users, improves its own data, and creates retention. Each loop lists its current basis so future work extends reality rather than fiction.

### Loop 1: studio claim and quality loop

1. Inklee seeds or receives a studio entry.
2. An owner or artist discovers it.
3. The entry is visibly unclaimed or incomplete.
4. The owner starts a claim.
5. Claiming requires an Inklee account.
6. The owner completes the studio profile.
7. Better profile data improves discovery value.
8. Improved profiles attract artists and studio attention.
9. Additional owners claim and improve their profiles.
10. Higher-quality claimed density may unlock future SEO surfaces (through the SEO strategy's own gates, never automatically).

Current basis: seeding (16 countries, ~71k approved entries), the claim flow with conflict handling, the completeness score, publish gates, corrections, and possibly-closed handling are shipped. The weak links today are display, not mechanics: claimed pins are not visually distinct on the canvas, and claimed profile media is invisible to visitors, so step 7 underdelivers.

The value difference between unclaimed and claimed entries must remain meaningful:

- An unclaimed entry may contain: name, safe display location, city and country, source and attribution, claim action, correction and report actions, and explicit unclaimed or community-maintained framing. It must not contain fabricated styles, services, artists, guest availability, reviews, ratings, quality signals, or verification claims.
- A claimed profile may contain owner-provided and consented information: description, logo, photos, studio specialties, studio standards, custom categories, guest spot availability, guest artist timeline, house rules summary, social links, workspace information, vibe, last confirmed information, and relevant temporary signals.
- Claimed profiles are not labeled "verified" unless Inklee implements a real verification process. No verified tier exists in the schema, and no copy may imply one.

### Loop 2: guest spot opportunity loop

1. Artist explores a destination.
2. Artist filters for relevant studios or opportunities.
3. Artist watches, saves, or applies.
4. Studio receives a structured request.
5. Studio owner claims or creates an Inklee account when necessary.
6. Studio uses Accept, Pass, or Suggest dates.
7. An accepted request becomes a canonical Inklee guest stay and travel entry.
8. Artist and studio manage the resulting dates and work in Inklee.
9. The artist or studio shares the upcoming stay.
10. Shared activity attracts more artists, studios, and clients to the public map.

Inklee's advantage is not merely creating an introduction. It is carrying the professional relationship into an operational workflow. Current basis: steps 3 to 8 are shipped end to end on web (native is submit-only). Steps 1, 2, 9, and 10 are the future work: guest-spot discovery filters, opportunity surfaces, and privacy-safe sharing.

### Loop 3: watch and alert loop

1. User watches a studio, city, opportunity, or saved search.
2. Relevant state changes.
3. Inklee sends a useful, explainable notification.
4. User returns to the map.
5. User takes a professional action.

Potential alerts: studio started accepting guests, guest spot dates opened, new temporary opportunity, studio profile claimed, studio profile materially updated, new guest artist announced, house rules changed, studio marked possibly closed, artist trip overlaps a watched studio, studio added a matching owner-declared specialty, a watched city gained meaningful new activity.

Every alert must explain why it was sent, be based on real data, respect privacy and consent, be configurable, avoid notification spam, and lead to a useful action.

Current basis: exactly one alert exists (a watcher gets an in-app notification when a watched studio posts a temporary signal; deliberately no email, no push). Everything else is future scope, and it is blocked on infrastructure that does not exist yet: no per-type preference surface exists for artist-facing notifications (the only per-type toggles today govern outgoing client booking emails), scheduled work is daily-only, and no cron currently writes in-app notifications. Alert expansion without a preference surface would violate the configurability rule above; see open question Q22.

### Loop 4: trip and collection sharing loop

Artists may eventually create privacy-safe collections (Berlin guest spot research, Europe summer tour, studios to contact in Bangkok). A collection may be private, shared by link, or public where explicitly chosen. Private notes, application status, exact private travel details, and confidential studio information never appear in public collections. Public or shared collections should create acquisition paths back into the map and into account creation.

Current basis: absent. The only bookmark primitive is the single flat watch set. Sharing exists only as reconstructable map URLs that deliberately carry no personal data; that property is the model for anything shareable. Privacy model for shared collections is open question Q23. If a shared collection ever becomes an indexable document, that is a separate SEO proposal first.

### Loop 5: community correction loop

Users improve the map through structured actions: report closed, wrong location, not a tattoo studio, duplicate, missing studio, wrong category, owner changed, privacy concern, suggest a new entry.

Current basis: the correction and report flow is shipped for signed-in artists on unclaimed entries (five reasons, dedupe, daily caps, admin queue, possibly-closed effect), the duplicate detector runs at create and claim, and the Art. 21 delisting route is live on `/legal/report`. Missing-studio suggestion is the planned artist-suggestion acquisition slice (Q19, sequenced behind the public shell). Native has no correction affordance.

Useful contribution recognition may include contributor status, contribution history, confirmed correction count, and city contribution progress. Avoid public competitive leaderboards that encourage low-quality bulk actions. Recognition design is open question Q29.

### Loop 6: city activation loop

Progress is not measured by global pin count. Controlled city activation:

1. Seed a baseline.
2. Validate data quality.
3. Recruit several anchor studios.
4. Get profiles claimed and completed.
5. Recruit active guest artists.
6. Add useful guest spot and studio information.
7. Launch a local campaign.
8. Measure searches, watches, claims, applications, and repeat use.
9. Expand when the city has useful professional liquidity.

A city is "active" based on useful actions and quality, not studio count. An activated city does not automatically become an indexable SEO page; the SEO strategy's city-page gates (SERP validation, allowlist, eight indexable claimed profiles, unique content) remain a separate decision. Activation criteria are open question Q28.

Current basis: seeding and quality gates exist (the seed lane, per-country language gates, ghost detection, staleness measurement); everything from step 3 onward is future operational work with no tooling yet.

## 7. Future feature portfolio

Classification vocabulary, used per feature:

- **Directionally approved**: fits the strategy; may be planned into a horizon when its dependencies are met. Still not scheduled by this document.
- **Candidate (validate)**: plausible; requires demand or usage evidence (via §9's discovery system) before build.
- **Blocked by dependency**: cannot be built yet regardless of desire; the dependency is named.
- **Postponed**: deliberately not now; revisit condition named.
- **Rejected for now**: see §8.

Status vocabulary: shipped, partial, absent, dark (built, gated off).

### Group A: trust, quality, and conversion foundation

The highest-value prerequisites for map growth.

| # | Feature | Status today | Classification |
| --- | --- | --- | --- |
| 1 | Strong claimed studio profiles | partial (model + gates shipped; photos/logo never rendered to visitors) | Directionally approved; rendering gap is Horizon 1 work |
| 2 | Visible claimed vs unclaimed distinction | partial (text badges only; canvas pins identical) | Directionally approved (Horizon 1) |
| 3 | Profile freshness and last-confirmed signals | partial (`last_confirmed_at` written on claim approval and on every owner profile update, both clearing `possibly_closed`; no non-owner freshness writer such as re-confirmation prompts or decay) | Directionally approved |
| 4 | Correction and report tools | shipped (web); absent on native | Directionally approved (native parity candidate) |
| 5 | Safe source attribution | dark (`/data-attribution` built, gated; per-pin provenance migration written, no UI reads it) | Directionally approved; public launch prerequisite |
| 6 | Studio claim conversion flow | shipped (web, signed-in); anonymous claim entry is the public-shell case | Directionally approved |
| 7 | Public-to-account attribution | partial (first-party analytics rails exist; `/map` excluded from the collector; no map events registered) | Directionally approved; public launch prerequisite |
| 8 | Preserved intent through account walls | absent | Directionally approved (Horizon 1) |
| 9 | Deep links to studio and map states | shipped (URL codec: center, zoom, filter, selection) | Done for v1; extend per mode |
| 10 | Useful public studio detail panels | partial (logged-in panel shipped; anonymous variant absent) | Directionally approved; public launch prerequisite |
| 11 | Studio completeness guidance | shipped (score + cockpit checklist) | Done for v1 |
| 12 | Privacy-safe exact vs approximate location handling | shipped for owner studios (deterministic offset); gap: seeded `private_studio` entries render at true coordinates | Directionally approved; the seeded-private-studio gap needs review before the public flip (see §12 Horizon 1) |

### Group B: retention and repeat use

| # | Feature | Status today | Classification |
| --- | --- | --- | --- |
| 1 | Watch studios | shipped (web + native, uncapped, filter-only surface) | Done for v1; a watchlist page is a candidate (validate) |
| 2 | Save cities (bookmark semantics; any alerting on a saved city rides Q22) | absent | Candidate (validate) |
| 3 | Saved searches | absent | Candidate (validate); note the current filter model is single-select, so there is little to save until filters grow |
| 4 | Saved studio lists | absent (watch is one flat unnamed set) | Candidate (validate) |
| 5 | Opportunity alerts | partial (signal-to-watcher in-app only) | Blocked by dependency: notification preferences (Q22) |
| 6 | Profile-update alerts | absent | Blocked by dependency: change tracking (build plan map activity cluster) + Q22 |
| 7 | Trip overlap alerts | absent | Candidate (validate); depends on Q22 |
| 8 | Guest artist activity alerts | absent | Candidate (validate); consent-capped; depends on Q22 |
| 9 | Map history or recently viewed places | absent | Candidate (validate) |
| 10 | Notification controls by type and frequency | absent for artist-facing notifications (the only per-type toggle surface today is /settings/emails for outgoing client booking emails, a different domain) | Directionally approved as the prerequisite for 5 to 8; design via Q22 |

### Group C: guest spot opportunity system

| # | Feature | Status today | Classification |
| --- | --- | --- | --- |
| 1 | Guest spot discovery mode (filters) | absent (no guest filter on the map; `guest_spot_status` and signals exist as data) | Directionally approved (Horizon 1 candidate) |
| 2 | Opportunity cards | absent | Candidate (validate) |
| 3 | Date-aware guest spot signals | partial (signals expire but carry no dates) | Candidate (validate) |
| 4 | Studio request board | absent | Candidate (validate); must reconcile with signals, see group I and Q24 |
| 5 | Temporary guest chair availability | shipped as a signal type (`guest_chair_open`) | Done for v1 |
| 6 | Requested style or artist type | absent | Candidate (validate) |
| 7 | Minimum stay | absent (no data model) | Candidate (validate) |
| 8 | Included equipment and supplies | absent studio-side (requests carry the artist's needs) | Candidate (validate) |
| 9 | Workstation availability | absent (build plan Phase 5) | Blocked by dependency: workspace management phase |
| 10 | House rules summary | shipped | Done for v1 |
| 11 | Structured guest spot requirements | partial (house rules typed; no requirements object) | Candidate (validate) |
| 12 | Direct path into the canonical request workflow | shipped | Done for v1 |
| 13 | Mutual artist and studio interest | absent | Candidate (validate); privacy and spam controls via Q24 |
| 14 | Accepted opportunity to canonical trip conversion | shipped (locked legs, terms snapshot) | Done for v1 |

### Group D: trip workspace

The trip workspace must extend the canonical trips + trip_legs + stays model. No parallel travel database without a documented reason and founder approval.

| # | Feature | Status today | Classification |
| --- | --- | --- | --- |
| 1 | Save cities and studios to a trip | absent | Directionally approved (Horizon 2) |
| 2 | Candidate studio shortlist | absent | Directionally approved (Horizon 2) |
| 3 | Compare studios | absent | Candidate (validate); see group F |
| 4 | Add approximate dates | absent (legs require exact dates) | Candidate (validate) |
| 5 | Application state | shipped (request FSM visible at /travel/requests) | Done for v1 |
| 6 | Studio response state | shipped | Done for v1 |
| 7 | Confirmed stay state | shipped | Done for v1 |
| 8 | Private notes | shipped (party-private notes on requests) | Done for v1 |
| 9 | Route ordering | absent | Postponed; revisit with real multi-stop usage |
| 10 | Booking-period connection | absent (no trips to books-open linkage exists anywhere) | Candidate (validate); a genuine model decision, do not improvise |
| 11 | Public or shared privacy-safe tour view | absent | Candidate (validate); privacy model is Q23 |
| 12 | City and studio alerts tied to the trip | absent | Blocked by dependency: Q22 |

### Group E: studio and artist matching

All absent today. Start with transparent filters and comparisons. No opaque AI ranking and no "best match" score until reliable data exists, ranking criteria are explainable, consent is clear, bias and manipulation risks are reviewed, and users demonstrate a real matching problem. Candidates (validate): planned-city overlap, guest availability overlap, date compatibility, owner-declared style fit, studio type fit, equipment fit, stay-length fit, language fit, accessibility fit, mutual interest, structured introduction. Note on data reality: a style DISPLAY read path is shipped (styles-represented chips on claimed published detail surfaces, composed from owner-declared styles plus consented guest coverage), but the style FILTER read path is unbuilt, so matching has no query surface yet; the residency roster remains deferred (founder 2026-07-22), so "resident style fit" is not truthful data.

### Group F: studio comparison

Candidate (validate). Artists compare a small number of saved studios on factual data only: location, guest spot status, dates, owner-declared styles, studio type, house rules, equipment, languages, minimum stay, workspace information, profile completeness, last confirmed date. No ranking; comparison supports a user decision, never declares a winner. Depends on saved lists (group B) and on several data fields that do not exist yet (minimum stay, languages, equipment).

### Group G: artist presence

Classification: candidate (validate) for the new presence states; blocked by dependency (Q21) for anything on the public plane. Candidate consent-based presence states: based here (shipped as map city + visibility), visiting, considering a visit, dates available, looking for guest spots (shipped), books open in this city. A visibility model to evaluate: private, visible to claimed studio owners, visible to signed-in Inklee users, public.

Rules: never widen existing consent automatically; future locations and upcoming travel require especially clear controls. `map_visibility='listed'` was consented for an artist-only surface, and block filtering keys off the viewer id, which anonymous requests do not have, so on the public plane artists stay counts-only (floored at 3) until a public-presence consent tier exists. The tier design is open question Q21. The half-built future-destinations display (`travel_map_consent` collected, read path absent) belongs to this group: ship the read path or retire the toggle copy.

### Group H: city pulse

Candidate (validate). A city pulse may summarize current Inklee map activity: claimed studios, guest spot availability, visiting artists (consent-capped), owner-declared common styles, upcoming guest stays, recent profile confirmations, temporary opportunities, contribution progress. Initially an in-map, non-indexable product surface. It must not present itself as comprehensive market intelligence while coverage is incomplete. Any indexable city document remains owned by the SEO strategy's city-page gates.

### Group I: studio request board

Candidate (validate), with a hard reconciliation requirement (Q24): the shipped temporary-signal system already carries typed, expiring, rate-limited, owner-attributed studio needs (guest chair open, looking for guest artist, convention week, walk-in day, and more). A request board is only justified as an evolution of that system (richer typed requests, dates, a browsable surface), never as a parallel post type. Requests must be typed, expire, be rate-limited, be clearly attributed, respect moderation, avoid generic social posting, and lead to a professional Inklee action. Board post types under consideration: guest artist wanted, specific dates available, specific style wanted, convention-week chair, short-notice cancellation, flash-day collaborator, resident artist opportunity, workspace available.

### Group J: embeddable Inklee presence

Postponed pending scope (Q25). Claimed studios and artists may eventually embed outward widgets (view this studio on Inklee, guest artists welcome, upcoming guest artists, apply for a guest spot, view my travel dates). Embeds must use public consented information only, be clearly branded, link back to Inklee, respect profile publication state, be revocable, and never expose private interaction data. This would be the second outward-facing artifact family after story cards; the same shaper discipline applies.

### Group K: future monetization candidates

Classification: blocked by dependency, the Q8 and Q27 business-model work (`docs/business-model.md`); nothing in this group is approved by this document. Potential future value: advanced opportunity alerts, studio map analytics, more saved searches, team or roster workflows, advanced guest spot coordination, city demand insight, travel overlap insight, clearly labeled promotional placements.

Any paid visibility must: be visibly labeled, remain separate from organic relevance, be limited in volume, require a claimed and complete profile, never masquerade as an organic recommendation, and never use "best" or "recommended" without a real methodology. Basic public discovery is never paywalled.

## 8. Features explicitly rejected for now

Recorded so future sessions do not relitigate them without new evidence.

**Public review marketplace.** No general public star ratings or open client reviews. Reasons: moderation burden, manipulation, disputes, verification difficulty, legal and DSA complexity, drift toward a client marketplace, weak fit with the professional artist-first position. The scope doc's thumbs-up-only reputation design (scope §4.9, Phase 7, unbuilt) remains the planned professional reputation layer and is not affected by this rejection. Prefer early trust signals: claimed status, last confirmed date, profile completeness, owner-declared information, confirmed Inklee guest stays, transparent source labels, correction and report systems.

**Algorithmic studio rankings.** No "best studios", "top-rated studios", "most popular", automatic quality scores, or hidden sponsored ranking. Consistent with the SEO strategy's no-editorial-ranking rule for city pages.

**Generic social feed.** No second Instagram. Map activity stays location-specific, time-sensitive, professional, actionable, and relevant to guest spots, travel, studios, or work. The contextual map feed in the build plan's map activity cluster (pull-only, contextual sources, no global timeline) remains the compatible design.

**Unverified style inference.** No inferring studio or artist style from seed data, random public images, external portfolios without permission, image recognition, or popular assumptions. Owner-declared, artist-declared, or safely derived consented data only. (Seeded entries carry no style data and gain none.)

**Generic travel booking.** No flights, hotels, general tourism, restaurant booking, or generic itinerary planning. Travel features serve tattoo work.

**Paid pin priority before organic relevance works.** No selling placement before organic relevance rules exist, profile quality is strong, promotion labeling is designed, manipulation risk is reviewed, and the map has enough real use to justify it.

## 9. User acquisition strategy

### Public acquisition sources

Potential sources: studio profile sharing, guest artist announcements, artist tour announcements, studio claim outreach, Instagram story cards (the scope doc's story cards extension), artist and studio embeds (group J, postponed), tattoo convention activity, city activation campaigns, relevant Reddit discussions, public studio pages (gated), future validated city pages (gated), external studio websites, artist link-in-bio use, and community correction links. The artist-suggestion form is a dedicated acquisition angle (founder reframe 2026-07-26, Q19), sequenced behind the public shell.

### Contextual landing states

A visitor should not always land on a generic world view. Privacy-safe deep links may open: a selected studio, a centered city, guest spot mode, a shared collection (future), a guest artist appearance, a claim invitation, a temporary opportunity, or a privacy-safe artist tour (future). The URL codec already carries viewport, filter, and selection and deliberately excludes personal data; every future shareable state keeps that property. Map and filter state stays shareable without becoming indexable; canonical SEO behavior is unchanged.

### Conversion actions

Context-specific actions instead of a repeated generic "Create account":

| Context | Primary action |
| --- | --- |
| Unclaimed studio | Claim this studio |
| Claimed studio | Watch this studio |
| Guest opportunity | Apply for these dates |
| City exploration | Save this city |
| Trip research | Add to my trip |
| Artist presence | Show when I am here |
| Incorrect entry | Suggest an update |
| Studio owner view | Manage this profile |
| Saved filter | Alert me about changes |

The action may lead to account creation, but the CTA describes the user's intended outcome. Preserve the intended action through signup and return the user to it after onboarding (group A item 8; nothing preserves intent today).

## 10. Feature discovery system

Future map features come from observed behavior and demonstrated workflows, not mainly from generic feature requests.

### Behavioral signals

Measure (as instrumentation arrives; almost none of this is instrumented today): zero-result searches, searches followed by exit, repeated searches for the same city, repeated views of the same studios, filters repeatedly changed, studios opened without action, external website or Instagram exits, account-wall openings, abandoned claims, abandoned guest spot applications, saved studios in geographic clusters, trips created without studio contact, reports by location and category, cities with high search demand but weak claimed density, alerts that generate return actions, studio profiles frequently compared manually, repeated movement between the same cities.

Map observed behavior to possible unmet needs:

| Observed behavior | Possible need |
| --- | --- |
| Same studios repeatedly opened | Comparison or shortlist |
| Same city repeatedly searched | City watch |
| Frequent external profile exits | Better portfolios or studio detail |
| Guest filters used without applications | Missing terms, dates, or trust |
| Trips saved without contact | Structured outreach or opportunity signals |
| High search with low claimed density | City activation campaign |
| Many reports in one area | Seed-quality intervention |
| Nearby studios saved together | Route or collection planning |
| Account wall opened but signup abandoned | Weak value explanation or lost intent |

### Event-triggered research

Optional, lightweight, rate-limited research prompts after meaningful events: after first studio watch ("What are you waiting to learn?"), after an abandoned guest application ("What information was missing?"), after a studio claim ("What made claiming worthwhile?"), after creating a trip ("What do you still manage outside Inklee?"), after an external social link click ("What were you looking for?"), after correcting an entry ("How did you know this was wrong?"). Never interrupt users excessively; prompts are optional and rate-limited.

### Workaround research

User interviews inspect actual workflows involving Google Maps lists, Instagram saved posts, notes, screenshots, spreadsheets, calendar entries, DMs, WhatsApp groups, convention lists, and travel planning tools. Ask users to demonstrate the current workflow rather than only describe desired features.

### Feature thesis template

Every future map feature proposal must answer:

- **User:** who specifically needs it?
- **Trigger:** what situation creates the need?
- **Current workaround:** how is it handled today?
- **Map advantage:** why does location matter?
- **Professional action:** what decision or action follows?
- **Inklee connection:** which canonical Inklee workflow does it activate?
- **Acquisition:** why would it attract an account?
- **Retention:** why would the user return?
- **Data requirement:** does Inklee have reliable data?
- **Privacy requirement:** what consent is required?
- **Trust risk:** could the feature infer or misrepresent anything?
- **Moderation risk:** what abuse or dispute could occur?
- **Implementation dependency:** what must ship first?
- **Success metric:** what behavior proves value?
- **Failure signal:** what would show the feature should be stopped?
- **Scope decision:** build, prototype, validate, postpone, or reject.

Reject or postpone proposals that cannot explain both why the feature benefits from a map and how it connects to an Inklee workflow.

## 11. Measurement framework

The primary map metric is not page views. The primary product metric:

> Weekly meaningful map actions

A meaningful map action includes: studio claimed, claimed profile completed, studio watched, city saved, saved search created, trip created, studio added to a trip, guest spot application started, guest spot request submitted, guest spot accepted, professional introduction created, artist presence published, useful correction approved, and an alert leading to a professional action. Passive map pans never count.

Exact metric definitions follow the house rule for the growth cockpit: one definition, recorded in `apps/web/src/lib/growth/definitions-content.ts` and `docs/metric-definitions.md` in lockstep, when the instrumentation slice is built. Open question Q28 covers ratification.

Supporting measures:

- **Acquisition:** public map visitor to signup start and completed account; claim invitation to completed account; marketing page to map to signup; shared studio page to signup; shared collection to signup.
- **Activation:** new account completing one meaningful map action; time to first watch, first saved city, first claim, first guest spot request.
- **Supply quality:** percentage of viewed entries claimed; percentage of claimed profiles passing publication gates; materially incorrect listing rate; possibly-closed rate; duplicate rate; time from correction to resolution; profile freshness.
- **Discovery quality:** search success rate; zero-result rate; searches producing actionable results; detail opens per useful session; saves per search; guest opportunity actions per search; external exits caused by missing information.
- **Retention:** returns through watch, city, trip-overlap, studio-response, and profile-update alerts; repeat meaningful actions per active user.
- **Guest spot liquidity:** opportunities published; artists expressing interest; applications submitted; studio response time; Accept, Pass, and Suggest dates distribution; accepted stays; accepted stays connected to trips; resulting booking-period activation.
- **Claim funnel:** claim CTA opened, claim started, signup started from claim, claim submitted, claim approved, profile completion started, profile published.
- **Trust:** reports and corrections per 1,000 studio views; confirmed corrections; invalid reports; owner disputes; privacy complaints; unclaimed entry error rate.

Instrumentation reality (2026-07-27): nothing map-shaped is instrumented. The public analytics registry contains no map events, `/map` is a hard entry in the collector's private-prefix list, the growth cockpit has no map section, the server actions for watch, correction, and claim emit no events, and the native map is entirely unmeasured. What does exist is the rail: the first-party collector, the visit sessionization and landing-page funnel, the typed event catalogues on both planes, and the attribution bridge into accounts. The measurement slice is therefore registry and catalogue extensions plus the private-prefix carve-out, not new infrastructure. All map analytics follow the standing rules: first-party only, no ids or free text in public props, private travel intent never leaves the authenticated plane.

## 12. Prioritization horizons

Four planning horizons integrate this strategy into the build plan without flattening it into one backlog. Horizons are ordered dependency layers, not dates. The build plan (`inklee-2-build-plan.md`, "Future map growth track") maps them onto its phase structure; the roadmap carries only the milestone view.

### Horizon 1: trust and public utility

The public-launch layer. Focus: public exploration, safe unclaimed entries, strong claimed profiles (including finally rendering claimed media and a visible claimed pin distinction), claim flow from the public plane, correction and reporting, deep links, public-to-account attribution, account walls that preserve intent, watch studios, guest spot filters, and the legal, privacy, moderation, performance, and SEO gates.

The public launch critical path stays separately tracked in roadmap §6.6 (anonymous API branch, public chrome, caching and rate limiting, robots posture, analytics carve-out, capability enforcement, migration 0111, the attribution surfaces going live with the flip). Two review items joined it from this pass: the seeded `private_studio` display-coordinate review (group A item 12; founder D3 2026-07-27 chose the recommended offset remediation) and the `/map` robots meta, which today emits `noindex, nofollow` through the authenticated layout while the SEO strategy specifies `noindex, follow` for the public surface. Founder decisions 2026-07-27 (DECISIONS.md) then reshaped the launch scope: claimed `/studios/{slug}` entity pages, including claimed media rendering, are IN v1 (D1), and the artists-in-town layer is postponed entirely on the public plane, returning only through Q21 (D2). The remaining Horizon 1 trust work (claimed-pin distinction, full intent preservation, the guest-spot filter) accompanies the flip and may land before or after it; it does not gate go-live. The roadmap §6.6 list is the authoritative critical-path enumeration and the execution plan is `inklee-2-public-map-golive-plan.md`; this section points at both rather than redefining them.

### Horizon 2: retention and professional planning

Focus: notification preferences and watch alerts (Q22 first), save cities, saved searches, studio lists, the trip workspace (shortlists, approximate dates, comparisons), opportunity cards, studio comparison, artist presence controls (including resolving the travel-destinations read path), date and location overlap, and better guest spot decision data (minimum stay, equipment, languages as owner-declared fields).

### Horizon 3: marketplace liquidity without self-booking

Focus: the studio request board as an evolution of temporary signals (Q24), mutual interest, structured introductions, city activation tools, city pulse, shareable tours and collections (Q23), embeds (Q25), studio map analytics (Q26), and professional demand signals. This remains request-based and artist-controlled; it is never unrestricted marketplace booking.

### Horizon 4: validated network and monetization expansion

Potential scope: advanced matching (group E, with the transparency safeguards), advanced alerts, team and roster tools (including the deferred residency roster), demand insight, promotion products (Q27 plus business-model work), validated city SEO pages, validated style discovery pages, and carefully reviewed new professional roles. Every Horizon 4 feature requires real product evidence and separate validation; none is approved by appearing here.

## 13. Dependencies and sequencing rules

Before any capability from §7 is planned into a slice, its planning note must map: the existing canonical entity it extends, current implementation status, required data, required consent, required moderation, required analytics, required notification support, required mobile support (and the parity register row), required legal review, required SEO decision, required founder decision, its feature flag and registry entry, its kill switch, its rollback posture, and its earliest horizon. The feature thesis template in §10 is the front half of that note.

Standing sequencing rules:

- No precise implementation dates without evidence.
- Future scope never enters the public-shell launch critical path unless it is a genuine prerequisite.
- Web first, mobile follows, and every native-affecting change updates `docs/web-native-parity.md`.
- Small flagged slices on master; registry entry before any new flag.
- Any new indexable surface starts as a proposal in `docs/seo/inklee-seo-strategy.md` under "Proposed strategic changes".
- Any new paid element starts in the business-model and pricing documents, not in a map slice.

## 14. Challenge record

The strategy was challenged from seven perspectives before adoption. Outcomes worth recording:

- **Product:** the map solves professional work (guest spots, claiming, travel) rather than duplicating place search; the features that create repeat use (alerts, trips, presence) all route back into shipped Inklee workflows. Features that would distract from the core workflow (social feed, reviews, generic travel) are rejected in §8.
- **UX:** the four modes are lenses over one map, not four products; a new visitor must get value in Explore without an account, and account walls come after value with preserved intent. Mobile and tablet usability is inherited from the shipped immersive shell work; native parity gaps (presence settings, corrections, request tracking) are named rather than assumed away.
- **Data:** every feature states whether its information is declared, derived, or seeded; seeded entries never gain styles, photos, or quality claims; stale-data harm is mitigated by freshness signals, corrections, and possibly-closed handling. Features needing data that does not exist (minimum stay, languages, equipment, residency) are marked accordingly.
- **Privacy:** no feature widens existing consent; public artist presence stays counts-only pending Q21; collections and embeds carry their own privacy questions (Q23, Q25); the seeded private-studio coordinate gap was surfaced instead of ignored.
- **Moderation:** the request board reuses the signal system's caps and typing; recognition avoids leaderboards; anything resembling a visibility restriction stays inside the shipped DSA statement-of-reasons machinery.
- **Growth:** each loop names its measurable conversion; measurement rides existing first-party rails; no loop depends on indexation that the SEO strategy has not approved.
- **Architecture:** everything extends the shared map core and canonical entities; no duplicate trip, studio, guest spot, or notification model is proposed; every future capability is flag-gated and reversible.

Ideas rejected or substantially modified during the challenge: a standalone request-board entity (merged into the signal-evolution path), naming artists on the public plane at launch (deferred to Q21), treating city pulse as market intelligence (reframed as an in-map summary), immediate alert expansion (blocked on the preference surface), and any "verified" labeling (no verification process exists).

## 15. Supersessions and document map

This pass supersedes the following older planning statements, each annotated in place:

- Scope doc §1 "Strictly artist-facing" audience and "a public client-facing version ... is out of scope for this entire planning phase": superseded 2026-07-22 by the founder's Q3 reversal, recorded 2026-07-27 in the scope doc. The narrower rule that survives: no client self-booking, and clients still come from the artist's own audience for bookings.
- Scope doc §5 "Client-facing map or any logged-out consumer surface" exclusion: superseded for the map surface itself; the exclusions for client self-booking and client accounts stand.
- Scope doc §4.13 "No saved cities in this version": stands as a v1 statement; saved cities are now a classified future candidate (group B).
- Build plan header "No implementation has started" and the stale phase-status lines (mobile, Q9 wiring, Q16 default): corrected in the build plan's 2026-07-27 status note.
- Roadmap §6.6 "IN BUILD on master, flag OFF" and "permanently noindex per Q3": corrected in the roadmap.
- Roadmap §6.6 Phase 4 bullet ("Q9 notification wiring deliberately unbuilt", "Mobile surfaces not started", "Q16: anonymized default"): superseded, annotated in place in the roadmap.
- Roadmap §6.6 "mobile pickup of the map/request surfaces" as a pending founder-go track: narrowed to the remaining native-absent surfaces (request tracking, studio inbox, corrections/claims, presence settings); the native map and request submit shipped 2026-07-26.
- Business model §1 and feature-scope guardrail parentheticals describing the map as artist-facing-only discovery: updated in those documents.

Decision history is preserved: no superseded text was deleted, only annotated with the newer decision and a pointer here.
