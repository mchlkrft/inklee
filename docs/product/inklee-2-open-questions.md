# Inklee 2.0 open questions

Status: all questions in this file are **postponed on purpose**. They were raised during the 2026-07-17 Inklee 2.0 planning round and deliberately not decided. Do not resolve them silently inside an implementation task. Each one needs either a founder decision, a cost spike, or real usage data first.

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

### Q3. Indexability of seeded unclaimed studio pages

Should seeded unclaimed studio pages be indexable, or live strictly inside the logged-in artist map?

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

### Q7. Temporary map post display behavior

How should temporary map posts be displayed without becoming spam?

- Why open: the 1 post per owner account per month limit is locked, but the display (marker badge, feed entry, map layer, expiry visuals) is deliberately undecided. Wrong display design either buries the feature or turns the map into a billboard.
- What it blocks: nothing until late. Temporary posts sit at the end of the studio owner track and can ship after the core map.
- Decide by: the named temporary-map-posts follow-on slice after Phase 3 (see the build plan's Phase 3 deferred item).

### Q8. Studio owner pricing placement

Does studio owner account pricing belong inside existing Inklee pricing, or as a separate Inklee Studio tier?

- Why open: the roadmap already carries a Business Model Phase 4 "Studio MVP" track with a planned studio subscription (`docs/roadmap.md` section 6.1, BM-4.7). The audit sharpened this: "Studio" currently names two different products. BM-4.x is multi-artist booking multi-tenancy (central inbox, shared calendar, studio booking page); the 2.0 studio owner is a guest spot host (map page, workspaces, groups, blacklist), with almost zero feature overlap but the same name and price anchor. Whether 2.0 studio owners are the new Studio tier definition, a separate SKU, a lighter tier, or free during map bootstrap is a monetization decision with its own timing (locked: monetization runs mainly through studio owner accounts, and the map is not behind an artist paywall). Also relevant: no subscription billing infrastructure exists yet at all (collision audit section 8), so early studio owners are comped via the existing admin mechanism regardless.
- What it blocks: nothing technical before Phase 3. The role model must simply not hard-code any plan assumptions.
- Decide by: before Phase 3 ships studio owner elevation to real users. The naming reconciliation in `business-model.md` happens earlier, in Phase 0; this question is only the pricing placement.

### Q9. Guest spot notification channels

Should guest spot requests trigger email notifications, in-app notifications, or both?

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

### Q12. Fate of the predecessor worktree branch

The local branch `feature/local-studios-guestspots-map` (slices 0 to 14, never pushed) partially matches and partially contradicts the locked 2.0 decisions. Is it treated as a quarry (copy adapted pieces into fresh 2.0 slices) or as a base (rebase and rework)? The audit measured the divergence (20 branch commits vs 140 master commits since the 2026-06-23 merge-base; 12 files touched on both sides, of which 6 hard-conflict: the lockfile, the CSP config, and all four extracted map files) and recommends quarry with per-subsystem verdicts (collision audit section 2). The scope doc and build plan carry quarry as the recommended default; this question is the founder's confirmation of it.

- Decide by: before Phase 1 implementation starts.

### Q13. Anonymous artist count privacy floor

Private artists are counted anonymously per area. Below what count does the number itself become identifying ("1 artist in town" plus an Instagram post equals a person)? A minimum display threshold (for example only show counts of 3 or more) seems needed, but the exact floor and the aggregation area size are undecided.

- Decide by: Phase 2 artist-in-area display build.

### Q14. Are map reports DSA notices or in-product signals?

The locked decisions want anonymous reports with threshold logic. The existing DSA moderation procedure requires acknowledging reporters within 24 hours (anonymity is contemplated only for CSAM) and treats visibility restrictions as moderation actions requiring statements of reasons. The likely design is two channels (anonymous in-product map signals plus the formal `/legal/report` path, with escalation between them), but that split and its wording need counsel review, and the DSA procedure document must be extended to cover studio pages, shop entries, and temporary posts either way.

- Decide by: Phase 0 for the design direction; counsel sign-off before Phase 7 ships reports to users.
