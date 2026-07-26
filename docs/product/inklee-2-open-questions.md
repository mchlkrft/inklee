# Inklee 2.0 open questions

Status: questions in this file are **postponed on purpose** unless their heading says RESOLVED. They were raised during the 2026-07-17 Inklee 2.0 planning round and deliberately not decided. Do not resolve them silently inside an implementation task. Each one needs either a founder decision, a cost spike, or real usage data first.

Companion docs:

- Scope: `docs/product/inklee-2-guestspot-map-scope.md`
- Build plan: `docs/product/inklee-2-build-plan.md`
- Collision audit: `docs/product/inklee-2-collision-audit.md`

## How to read this file

Each question lists: why it is open, what it blocks, and the earliest point in the build plan where it must be answered. Nothing here blocks Phase 0 or Phase 1 groundwork unless marked.

## Postponed questions

### Q1. Long-term map provider

Which map provider should Inklee use long term: Mapbox, Google Maps, OpenStreetMap, or a hybrid?

- Why open: cost, licensing, and mobile support differ sharply. The shipped `/map` slice already runs on MapLibre with free OSM/CARTO tiles and no API key. That is the cheapest possible baseline, but tile styling, geocoding quality, and commercial usage terms at scale are unverified.
- What it blocks: nothing before Phase 2. The existing MapLibre setup carries Phase 2 fine.
- Decide by: end of Phase 2, once marker volume and geocoding needs are real. Needs a cost spike comparing tile serving, geocoding, and places data across providers.

### Q2. Legally safe public data source for seeding

What public data source is legally safe enough for first studio seeding?

- Why open: OpenStreetMap data is ODbL-licensed (attribution plus share-alike concerns for derived databases), Google Places data cannot be stored long term under its terms, and scraping business sites has its own risk. This needs a real legal read, not an engineering guess.
- What it blocks: Phase 1 seeding imports. Admin CRUD and the data model do not depend on it; hand-entered admin curation can start without any bulk source.
- Decide by: before the first bulk import in Phase 1. Until then, seed by hand through admin CRUD only.
- **Provisionally answered by the founder 2026-07-18** (see `inklee-2-map-seeding-tool.md`): the seeding source stack is locked as Overture Maps (CDLA-Permissive-2.0, the automated source), Brave Search leads (URL and title only), manual Instagram discovery, and artist suggestions, all through mandatory admin review; no scraping, no Google Places, no bulk publish. What stays open from Q2: formal legal review of the whole seeding posture before public launch, plus Q17 to Q20 below.
- **Updated 2026-07-26.** Two things have moved. (a) Q17, Q18, Q19 are **answered** (2026-07-24) and Q20 is answered apart from one re-opened question, so the "plus Q17 to Q20" clause is largely discharged. (b) **The locked source list above is out of date**: a fifth automated source, a direct OpenStreetMap **Overpass** extraction, was added for country coverage by migration `0088` and has produced 12,658 candidates / 3,582 approved live studios. It is not scraping and it went through the same mandatory admin review, but it is an ODbL source that the 2026-07-18 lock did not contemplate and the counsel note did not know about. **Cleared 2026-07-26**: counsel confirmed attribution-only on the corrected facts, so the OSM lane stays in the stack, with OpenStreetMap restored to the studio-data credit. Treat the source list above as five sources, not four.

### Q3. Indexability of seeded unclaimed studio pages

**REVERSED 2026-07-22 (founder): the map GOES PUBLIC as an experimental, community-evolving surface.** This supersedes the 2026-07-19 logged-in-only resolution below. The public surface is one capability layer on a single shared map core (not a separate map product); it ships last in the rollout and only after its prerequisites close: the Q20 Overture/Foursquare licensing re-check (legal), a DSA `moderation_statements` writer (counsel item Q14), and SEO keyword/page ownership through the SEO strategy owner per the CLAUDE.md split (no filter-combination indexable pages; do not cannibalize `/guest-spot-booking`). Full detail + the shared-core architecture in `docs/product/inklee-2-map-redesign-audit-and-plan.md`.

**Prerequisite status 2026-07-26.** Of the three above: the **DSA writer shipped** 2026-07-23 (`lib/server/moderation-statements.ts`, wired into three moderation actions) and **SEO ownership was ratified** 2026-07-23 into the canonical strategy (`/map` public but `noindex`, no keyword ownership). **Q20 is the only original prerequisite still open**, and only in part (see Q20 below). What now gates the flip is mostly engineering, not decisions: the attribution UI and `/data-attribution` page, provenance carried to `map_locations`, the GDPR surface, the DSA procedure scope extension, and the public shell itself. The marketing entry points are already built and held dark behind `NEXT_PUBLIC_PUBLIC_MAP` (`docs/marketing/public-map-marketing-integration-audit.md`).

**RESOLVED 2026-07-19 (founder): the map stays logged-in only.** Seeded
pages remain noindex, behind auth, out of the sitemap. This also closes the
attribution follow-up below in its favor (nothing changes while pages are
private). Reversal remains possible later; it would need the SEO strategy
owner per the CLAUDE.md split plus the licensing re-check.

Original question: should seeded unclaimed studio pages be indexable, or live strictly inside the logged-in artist map?

- Why open: indexable pages could become an SEO asset, but they also raise the legal and reputational stakes of showing businesses that never asked to be listed. SEO strategy ownership sits with ChatGPT per the SEO split in `CLAUDE.md`, so this is also a strategy question, not just an implementation one.
- What it blocks: Phase 2 page rendering decisions (public route vs authed route). Default until decided: logged-in only, noindex, no sitemap entries. That default is reversible; the opposite is not.
- Decide by: before Phase 2 ships. Route through the SEO strategy owner.

### Q4. Seed distribution across cities

How should the first internal build distribute seeded studios across cities, while respecting the cap of maximum 5 studios per 300 square km?

- Why open: the cap is locked, the distribution is not. Options include founder-picked launch cities, cities weighted by existing Inklee artist locations, or tattoo-scene density. Each shapes the first impression of the map.
- What it blocks: the Phase 1 seed plan content, not its mechanics. The cap enforcement itself is in scope and locked.
- Decide by: when the first seed list is drawn up in Phase 1.

### Q5. Photos on seeded entries

Should photos on seeded entries be avoided until claimed, to reduce legal risk?

- Why open: photos make the map attractive but importing images of businesses without consent is the riskiest part of seeding (copyright plus business objection). Text-only seeded entries are much safer but visually flat.
- What it blocks: Phase 1 import boundaries and the Phase 2 studio card design (which must look decent without photos either way, since unclaimed entries may never have them).
- Decide by: before the first bulk import. Default until decided: no photos on seeded entries.

### Q6. Hard storage limit per studio profile

What is the hard storage limit per studio profile?

- Why open: needs a real cost model (Supabase storage pricing, expected studio count, photo sizes after processing) rather than a guessed number.
- What it blocks: the Phase 3 photo upload implementation needs a number, even a provisional one. A provisional cap can ship and be raised later; shipping without any cap cannot be undone cheaply.
- Decide by: Phase 3 photo upload build. Until then, plan for "a cap exists, value TBD".

### Q7. Temporary studio signal display behavior

**RESOLVED 2026-07-19 (founder, all four display calls):** (1) a ring
around the studio's map marker, (2) visible only when zoomed in
(minzoom 10), (3) signals expire silently (no countdown on public
surfaces; the owner sees the end date in their cockpit), (4) watchers get
an IN-APP notification only, no email and no push. Plus the recommended
map filter toggle ("Signals") and a detail page section. Shipped as the
temporary-signals slice (migration 0092): 8-type vocabulary, 14-day
duration, the locked 1 per owner per month cap counted against creation.

Original question: how should temporary studio signals be displayed without becoming spam? (Widened 2026-07-18: temporary map posts became typed temporary studio signals; the question covers the whole signal system.)

- Why open: the 1 post or signal per owner account per month limit is locked and the signal type vocabulary is now scoped, but the display (marker badge, feed entry, map layer, expiry visuals, contextual feed placement) is deliberately undecided. Wrong display design either buries the feature or turns the map into a billboard.
- What it blocks: nothing until late. Signals sit in the named follow-on slice after Phase 3, and their contextual-feed appearance waits for the map activity cluster anyway.
- Decide by: the temporary-studio-signals follow-on slice after Phase 3 (see the build plan's Phase 3 deferred item).

### Q8. Studio owner pricing placement

Does studio owner account pricing belong inside existing Inklee pricing, or as a separate Inklee Studio tier? Narrowed 2026-07-17: the founder decided the 2.0 studio owner role REDEFINES the Studio tier (recorded in `docs/business-model.md` Phase 4), so the naming split is resolved; what stays open here is only when studio owners start paying and at what price.

- Why open: the roadmap already carries a Business Model Phase 4 "Studio MVP" track with a planned studio subscription (`docs/roadmap.md` section 6.1, BM-4.7). The audit sharpened this: "Studio" currently names two different products. BM-4.x is multi-artist booking multi-tenancy (central inbox, shared calendar, studio booking page); the 2.0 studio owner is a guest spot host (map page, workspaces, groups, blacklist), with almost zero feature overlap but the same name and price anchor. Whether 2.0 studio owners are the new Studio tier definition, a separate SKU, a lighter tier, or free during map bootstrap is a monetization decision with its own timing (locked: monetization runs mainly through studio owner accounts, and the map is not behind an artist paywall). Also relevant: no subscription billing infrastructure exists yet at all (collision audit section 8), so early studio owners are comped via the existing admin mechanism regardless.
- What it blocks: nothing technical before Phase 3. The role model must simply not hard-code any plan assumptions.
- Decide by: before Phase 3 ships studio owner elevation to real users. The naming reconciliation in `business-model.md` happens earlier, in Phase 0; this question is only the pricing placement.

### Q9. Guest spot notification channels

**RESOLVED 2026-07-19 (founder): both email AND push** (which per the
booking-pattern default also means the in-app feed row that push taps
resolve to). Implementation mirrors the booking flow: feed + push +
transactional email at request/decision state changes, nothing chattier;
push emission version-gated because installed builds' tap routing only
extends with a store build.

Original question: should guest spot requests trigger email notifications, in-app notifications, or both?

- Why open: notification overload is a named risk, email sending has rate limits, and the mobile app has no OTA updates (new push types mean new store builds; push taps dead-end on installed builds until a store build extends the tap-routing allowlist). The right mix depends on how the request workflow actually gets used.
- What it blocks: Phase 4 notification wiring. The workflow itself (request, approve, deny, alternate dates) does not depend on the channel choice.
- Decide by: Phase 4. The audit found the booking flow already implements the likely answer (in-app feed row + push + transactional email at state changes), so the default direction to evaluate is: mirror the booking pattern for request/decision events, keep email off everything chattier, and version-gate push emission.

### Q10. Studio group chat build vs integrate

Should studio group chat be custom-built or integrated later through a service? The locked baseline stands either way: the studio group ships with real-time chat. This question only decides how it is built.

- Why open: realtime chat is the single heaviest new infrastructure in 2.0. The audit confirmed there is zero realtime usage anywhere in the product (no Supabase Realtime channels, no publication config, no polling loops; the mobile app is bearer-REST only with no direct client-to-database path), so Supabase Realtime adoption is first-time infrastructure including client-facing RLS design and reconnect handling on mobile. A hosted service (Stream, Sendbird, etc.) trades money for time and adds a data-processing dependency. Message retention and GDPR duties apply either way. A pull-based thread on the support-ticket model exists as technical context, but choosing it would drop the locked real-time requirement; that would be a scope reduction needing its own founder decision, not an answer to this question.
- What it blocks: Phase 6 entirely. Everything before it is unaffected.
- Decide by: before Phase 6 starts. Needs a spike: Supabase Realtime channel prototype vs one hosted-service quote, measured against expected group sizes (studio roster plus guests, tens of members, not thousands).

## Questions added during the planning audit

These were not in the original brief but surfaced while auditing the repo. Also postponed.

### Q11. Naming cleanup for the existing `studios` table

The live database already has a `studios` table that means "an artist's own travel destination", not a studio business. The predecessor prototype namespaced new tables (`studio_organizations` etc.) to avoid collision. Long term, carrying both vocabularies is a permanent tax on every future contributor. Does Inklee ever rename the artist-travel `studios` table (expensive, risky migration) or accept the split vocabulary forever and enforce it in docs and code review?

- Decide by: Phase 0 can document the vocabulary rule; an actual rename decision can wait indefinitely.

### Q12. Fate of the predecessor worktree branch: RESOLVED

**Resolved 2026-07-17: quarry, confirmed by the founder.** The branch `feature/local-studios-guestspots-map` is source material only: modules are copied and adapted into fresh 2.0 slices on master (migrations renumbered to 0074+), and the branch itself is never merged or rebased. Per-subsystem verdicts in the collision audit section 2. The same founder decision approved all ten Phase 0 architecture calls in collision audit section 13 as working defaults.

### Q13. Anonymous artist count privacy floor: RESOLVED

**Resolved 2026-07-18: the floor is 3, decided by the founder.** City counts below 3 render as nothing (the standard small-cell suppression baseline; city-level granularity and consent gating carry the rest of the protection). The constant lives as `MIN_ANON_ARTIST_COUNT` in `packages/shared/src/map-directory.ts`.

### Q14. Are map reports DSA notices or in-product signals?

The locked decisions want anonymous reports with threshold logic. The existing DSA moderation procedure requires acknowledging reporters within 24 hours (anonymity is contemplated only for CSAM) and treats visibility restrictions as moderation actions requiring statements of reasons. The likely design is two channels (anonymous in-product map signals plus the formal `/legal/report` path, with escalation between them), but that split and its wording need counsel review, and the DSA procedure document must be extended to cover studio pages, shop entries, and temporary posts either way. Note 2026-07-18: the categorized report vocabulary now includes conduct categories (harassment, unsafe behavior, payment conflict) that lean further toward the formal channel; the counsel review should cover the category-to-channel mapping.

**ANSWERED 2026-07-24: hybrid, split by whether the report alleges illegal content — and much lighter than assumed, because Inklee is a micro enterprise.**

Inklee OÜ qualifies as a **micro enterprise**, so **DSA Article 19 excludes it from Section 3**: no internal complaint-handling system (Art. 20), no out-of-court dispute settlement (Art. 21), no trusted-flagger channel (Art. 22), and Art. 15(2) also exempts it from transparency reporting. Most of the feared apparatus does not apply.

**Section 2 applies regardless of size**: Art. 16 (notice and action) and Art. 17 (statement of reasons).

Category-to-channel mapping:

| Report category | Channel | Why |
|---|---|---|
| Harassment, unsafe behaviour | **Formal DSA notice** (`/legal/report`) | Capable of alleging illegal content → Art. 16 notice, acknowledgement, decision, statement of reasons where action is taken |
| Payment conflict | In-product signal (+ own T&C enforcement) | Contractual dispute, not illegal content |
| Wrong address, closed, not a tattoo studio, duplicate | In-product signal only | Factual correction; no DSA machinery |

**Key nuance that resolves the anonymity tension:** Art. 17 statements of reasons are owed to **"recipients of the service."** An unclaimed seeded studio is not a recipient, so delisting or correcting an unclaimed entry owes no Art. 17 statement (which is fortunate, since there is often no contact route). Once a studio **claims** its profile it becomes a recipient and Art. 17 applies to visibility restrictions against it. Anonymous in-product signals are therefore fine for unclaimed-entry corrections; the formal channel carries the conduct categories.

**Required work:** extend `docs/dsa-moderation-procedure.md` (still v1) beyond its current `inklee.app` / public artist pages / booking-upload scope to cover **directory entries, studio pages, shop entries, and temporary signals**, and record the category-to-channel table above. Deliver together with Q20 (see that entry §7.5).

- Decide by: Phase 0 for the design direction; counsel sign-off before Phase 7 ships reports to users.

## Added 2026-07-18 (extension round)

### Q15. Flash day planner vs the live 1.x flash days feature

Inklee 1.x already ships artist-owned flash days (flash days, flash items, booking forms, calendar rendering, capacity logic). The 2.0 flash day planner organizes a studio-level flash day across multiple artists. Does the planner extend the existing artist-owned entities (each participating artist gets or links a 1.x flash day), or does a studio-level flash day entity exist that references artist flash days, or something else? This is the same class of decision as guest-spot-acceptance-materializes-a-trip-leg, and the one-source-of-truth rule forbids a parallel flash pipeline.

- What it blocks: the flash day planner slice in Phase 6. Nothing before it.
- Decide by: before the Phase 6 flash day planner slice starts. Needs a short design pass over the 1.x flash schema first.

### Q16. Private artist representation in the guest artist timeline

**UPDATED 2026-07-22 (founder): named by default, with an explicit per-artist opt-out.** The default flips from anonymized to named across current/upcoming/past timeline entries; a new `profiles.guest_naming_opt_out` (default false) plus a `/settings/map` toggle lets an artist anonymize themselves everywhere. Artist privacy still always caps studio settings: an opt-out wins over any studio's `show_guest_timeline`. Naming is decoupled from `passport_public` (which keeps its own purpose). Safety note recorded in `docs/product/inklee-2-map-redesign-audit-and-plan.md`: naming future whereabouts publicly by default is what the original anonymized default protected against, so the opt-out should be surfaced prominently.

**RESOLVED by the founder 2026-07-18: anonymized entry.** A privacy-protected artist appears as "a guest artist" with dates only: no name, no link, no origin. The timeline stays visually complete without exposing anyone, and artists can opt in to full display. Artist privacy always caps studio settings.

Original question kept for context: when a studio's guest artist timeline includes an artist whose profile or travel history is private, what does the entry show by default: an anonymized entry, a reduced entry, or nothing at all?

## Added 2026-07-18 (seeding tool)

Background and the 2026 search API landscape live in `inklee-2-map-seeding-tool.md`.

### Q17. Long-term storage of Brave result titles

Brave's data rights around storing search results are written mostly for LLM training. The tool stores only the result URL and title as a lead. Can titles stay long term, or must they be dropped after review (the URL alone would remain)?

**ANSWERED 2026-07-24: take the conservative path — keep the URL durably, drop the title once the candidate is reviewed.**

A result title is thin material, but it is still Brave's search output, and Brave's terms restrict storing and caching result content. Because the title can be re-derived at review time by opening the URL, the conservative option costs nothing operationally and removes the question entirely rather than leaving a standing argument. Store `source_url` durably (a URL is a pointer, not content); null the title when the candidate reaches a terminal status (`converted` / `rejected`).

**Implementation note 2026-07-26.** There is no separate title column: `storeBraveSelectionCore` writes the Brave result title straight into `map_seed_candidates.name`, which is `NOT NULL`. So "null the title" is implemented as an overwrite with `DROPPED_BRAVE_TITLE` (`(title dropped after review)`) for `source_type='brave_search'` rows only, applied in `markConvertedCore` and in the reject path, with a backfill in migration `0111`. `source_url` is kept, so the title stays re-derivable exactly as the answer contemplated. Converted rows lose nothing in substance: the studio name they produced lives on in `map_locations` as an admin-reviewed Inklee record. **Migration `0111` is written but not yet applied.**

- What it blocks: nothing operationally; the conservative fallback (drop titles post-review) is a small migration.
- Decide by: the legal review pass before public launch. **Built 2026-07-26, pending the migration being applied.**

### Q18. Instagram URLs as durable source references

Manual candidates carry the Instagram URL the admin found. Is a bare profile URL acceptable as a durable stored reference without additional policy review?

**ANSWERED 2026-07-24: yes — a bare Instagram profile URL is acceptable as a durable stored reference.**

A public profile URL is a pointer, not copied content: no posts, images, captions, or follower data are stored or cached, so neither Instagram's terms on scraping/caching nor copyright in the profile content is engaged. Keep it strictly a URL. Two conditions: do not fetch and store profile media or bio text alongside it (that would change the analysis), and treat the URL as personal data where the profile belongs to an identifiable sole trader — it falls under the same Art. 6(1)(f) basis and delisting route as the rest of the seeded record (Q20 §7.7).

- What it blocks: nothing; URLs are references, no content is copied.
- Decide by: the legal review pass before public launch.

### Q19. Google Maps reference links in artist suggestions

The planned artist suggestion form may accept an optional Google Maps link as a review reference only. Can such links be stored long term?

**ANSWERED 2026-07-24: ship the field, but as a transient review reference — do not persist the Google Maps link after the candidate is resolved.**

Google Maps Platform terms restrict caching Maps content and specifically prohibit using it to create, augment, or improve a competing mapping dataset. A bare URL is a pointer rather than Maps content, so accepting one at submission and opening it during review is low risk. Retaining Google place references **durably inside a studio directory** is the part that invites the "augmenting a dataset from Google" objection — and it buys nothing, since the value of the link is exhausted at review.

Implementation: accept the optional link on the artist-suggestion form; use it during admin review; **null it when the candidate reaches a terminal status** (`converted` / `rejected`), keeping only Inklee-verified facts and the artist's own submitted text. Never derive coordinates, name, hours, or ratings from the linked page — facts must come from Overture, the artist's submission, or admin verification.

The rest of the artist suggestion (submitted studio name, city, notes, plus the submitting artist's identity for audit and abuse handling) **is storable long term** under Art. 6(1)(f) / contract performance; pseudonymise or drop the submitter link on that artist's account deletion, per `docs/account-deletion-handoff.md`. Mandatory admin review before publication stays.

**Reframed by the founder 2026-07-26: the artist-suggestion form is an acquisition angle, not an admin utility.** Its purpose is to be **an angle for new artists to get listed**, so design it as a growth surface that pulls an artist into Inklee, with the studio lead as a by-product rather than the point. Scheduled on the roadmap (§6.4 Inklee 2.0), sequenced behind the public shell because the acquisition value depends on the map being publicly reachable. The data constraints below are settled and carry over unchanged.

**Status 2026-07-26: unblocked but not implementable yet.** The artist-suggestion slice does not exist. `artist_suggestion` appears only as a `source_type` enum value and a display label in `packages/shared/src/map-seeding.ts`; there is no submission form, no route, and no writer. The requirement above is therefore recorded here as a spec for whoever builds that slice: accept the optional Google Maps link, use it during admin review, null it at terminal status (`converted` / `rejected`) the same way the Brave title is dropped in Q17, and never derive coordinates, name, hours or ratings from the linked page.

- What it blocks: the artist suggestion slice ships without the field until decided. **Unblocked** — ship with the transient-reference behaviour above.
- Decide by: before the artist suggestion slice adds the field.

### Q20. Overture-derived fields on public pages

Converted entries carry name and coordinates that originated in Overture data (CDLA-Permissive-2.0, Foursquare-sourced rows Apache 2.0). Fine on the logged-in map; does anything change if map pages ever become public (Q3)?

**Reopened + drafted for counsel 2026-07-22.** Q3 was reversed the same day (map goes public), so this is now live rather than hypothetical. A full legal draft — the sources, the three licenses (adding the OSM/ODbL share-alike edge the original framing missed), the facts-vs-database distinction, the proposed attribution position, and the residual questions only counsel can close — is in `docs/counsel-note-public-map-data-licensing-2026-07-22.md`. The load-bearing question is whether the public directory is an ODbL "Derived Database publicly used" (share-alike) or a "Produced Work" (attribution only).

**ANSWERED: attribution only, no share-alike.** Given 2026-07-24, premise corrected and **re-confirmed by counsel 2026-07-26** on the true facts. Full answer in `docs/counsel-note-public-map-data-licensing-2026-07-22.md` §7; the correction and the confirmed outcome in `docs/counsel-note-public-map-osm-correction-2026-07-26.md` §8.

The 2026-07-24 answer held that there are **no OSM-derived studio rows**, so ODbL share-alike could not attach. The verification sweep that answer itself required before the flip was run on 2026-07-26 and **failed**: migration `0088` widened `map_seed_candidates.source_type` to include `'osm'`, a direct OpenStreetMap **Overpass** extraction (`scripts/osm-tattoo-extract.cjs`) feeds the country-coverage lane, and Inklee's own pipeline stamps those rows `retention_class='odbl_attribution'` with the attribution string `OpenStreetMap contributors (ODbL)`. Production counts: **12,658 OSM candidates, 3,642 converted, 3,582 approved and live** out of 71,191 (**5.0%**), with **zero** overlap with Overture (each is OSM-only) and spread across all 16 seeded countries.

Counsel was re-asked on those facts and **re-confirmed the same conclusion on 2026-07-26**: each public studio page is a Produced Work, ODbL share-alike does not attach, the obligation is attribution. **No coverage is lost** — the contingency of holding the OSM rows back (which would have cost 67,609 of 71,191 pins) is not needed. The one substantive change is the credit string, which now **restores OpenStreetMap**:

> Studio data © OpenStreetMap contributors (ODbL), Overture Maps Foundation (CDLA-Permissive-2.0) and Foursquare Labs, Inc. (Apache-2.0), modified by Inklee. [Licences and notices]

**Standing instruction:** re-run the source-type verification before any change to the seeding stack and before the public flip. This correction exists only because that check was not re-run between migration `0088` and the 2026-07-24 answer.

Still standing from the 2026-07-24 answer, unaffected by the correction: §7.2 facts-vs-database and the standing no-bulk-export policy, §7.4 Foursquare/Apache-2.0 with no trademark use, §7.6 the two build gaps, §7.7 the GDPR surface for sole-trader studios.

Overture's Places theme does contain no OpenStreetMap data — that leg of the 2026-07-24 reasoning was correct and is unchanged. It simply does not cover the direct Overpass path.

What must ship before the flip:

1. **Corrected studio-data credit** (drop OSM, add the Foursquare NOTICE and a "modified by Inklee" statement — Apache-2.0 requires stating changes) plus a linked `/data-attribution` page carrying both licence texts. Exact string in the counsel note §7.3.
2. **Provenance carried to `map_locations`** — it currently exists only on `map_seed_candidates`.
3. **The attribution UI itself** — does not exist today; only the basemap tile pill does. Claimed-profile gate item 7 cannot be satisfied until it ships.
4. **GDPR surface for sole-trader studios** (counsel note §7.7): Art. 6(1)(f) basis + balancing note, Art. 14 transparency disclosure, Art. 21 objection/delisting route. The same `/data-attribution` page can carry the "why you are listed / how to be removed" text.

Standing policy retained: publish only facts (name, display point, city/country), no bulk export, no dataset-re-emitting API, no source descriptions/photos/hours/ratings/taxonomies.

What must ship before the flip is otherwise unchanged (corrected credit string once confirmed, provenance carried to `map_locations`, the attribution UI, and the GDPR surface).

- What it blocks: the **public** launch of seeded studio data. The logged-in map is unaffected. **The legal question is now closed** (attribution only, OSM restored to the credit). What remains before the flip is engineering: the corrected credit component, the `/data-attribution` page, provenance carried to `map_locations`, and the GDPR Art. 14/21 surface.
- Decide by: before the public shell publishes any seeded row. Owner: founder + counsel. **Closed 2026-07-26.**
