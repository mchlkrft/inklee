# Inklee 2.0: guest spot map and studio network

Status: planning foundation, written 2026-07-17; extended 2026-07-18 with sixteen founder-selected feature extensions (marked "Extension (2026-07-18)" in their sections). Build status lives in the build plan: Phase 1 core and Phase 2 slice 1 are shipped behind the flag; everything else including all extensions is planning only. This document is the product source of truth for the Inklee 2.0 track until superseded.

Companion docs:

- Open questions: `docs/product/inklee-2-open-questions.md`
- Phased build plan: `docs/product/inklee-2-build-plan.md`
- Collision audit against Inklee 1.x: `docs/product/inklee-2-collision-audit.md`
- Schema proposal + permission matrix (Phase 0 draft): `docs/product/inklee-2-schema-proposal.md`

## 1. What this is

Inklee 1.0 is the booking operating system for tattoo artists, and it is finished and launching. Inklee 2.0 adds the tattoo world layer on top of it: studios, guest spots, travel, shops, map discovery, and artist identity.

The core of 2.0 is an artist-facing global tattoo map focused on guest spot planning. It should feel like a tattoo-native Google Maps with lightweight social updates from studios and artists the user is connected with. An artist opens the map for a destination city and understands the tattoo scene there: which studios exist, what they feel like, who is hosting guests, which artists are around, and where to buy supplies.

This is not a feature extension of 1.x. It is a second product layer with its own data model, roles, moderation surface, and cost profile. It gets planned and built as its own track while the current 1.0, 1.1, and 1.2 improvements continue independently; the two lines merge later, and the merge itself is a planned phase, not an afterthought (build plan Phase 9).

### What the map is mainly for

- Discovering studios
- Planning guest spots
- Requesting guest spot dates
- Seeing available or potentially available guest spot locations
- Managing accepted guest spots
- Seeing connected studio and artist updates
- Understanding the tattoo scene in a destination city

### Audience

Strictly artist-facing. The map is for tattoo artists and studio-related accounts. A public client-facing version may exist far in the future and is out of scope for this entire planning phase. Nothing in the 2.0 architecture may leak artist or studio data to logged-out visitors unless a decision explicitly makes a surface public (see open question Q3 on seeded pages).

Artists should feel like their Inklee account represents their tattoo identity: their profile is how they move through the tattoo world, not just how clients book them.

### The main promise

- Find and discover studios for guest spots.
- Plan tattoo travel more easily.
- See the tattoo-native map of a destination.
- Get lightweight updates from connected studios and artists.
- Use Inklee as the artist identity layer for moving through the tattoo world.

## 2. Relationship to existing work

Three earlier bodies of work overlap this scope. The collision audit covers them in depth; the short version:

1. **The live artist travel feature ("Guest Spots" at `/travel`).** Artists already plan trips with destinations today, stored in the `studios`, `trips`, and `trip_legs` tables. Important: that `studios` table means "a destination an artist travels to", not a studio business; every row is one artist's private copy, and the same physical studio exists as duplicate rows across artists. 2.0 keeps this feature as the artist-side travel planner (locked: reuse it, do not duplicate it) and adds the studio side around it. The name "Guest Spots" already fronts this feature in both navs, the calendar legend, and about 11 SEO pages, so 2.0's request workflow grows inside this surface rather than beside it.
2. **The shipped map slice.** Prod already has a journey-only map (web `/map` and the native travel map) built on MapLibre with free keyless CARTO tiles, rendering the artist's own travel data. The native module is already inside every shipped binary, so new mobile map surfaces are JS-only work. This is the shell the 2.0 map grows out of; the data plane behind it (load-once personal journey, no clustering, no spatial index) is not reusable and gets rebuilt.
3. **The local prototype worktree.** Branch `feature/local-studios-guestspots-map` (never pushed; 20 commits ahead of a 2026-06-23 merge-base that master has since moved 140 commits past) contains a dormant studio/guest-spot/map foundation: `studio_organizations`, locations, memberships, workspaces, a guest spot request FSM (14 states) plus proposal rows and a separate stay FSM, `map_locations`, claims, and admin moderation, across 15 slices with docs in `docs/features/studios-guest-spots-map/` (in the worktree), hardened by two prior multi-agent audits. It is a quarry for 2.0, not a base: parts match the locked decisions closely (guest spot state machines, map locations, claims, the date-bounded membership helper that directly implements the group guest window), parts contradict them (multi-location org model vs one studio per owner; a DB constraint that hard-blocks overlapping assignments vs warn-only overbooking), and its migrations collide numerically with prod and have never executed against a real database. The collision audit gives a per-subsystem reuse verdict; the founder confirmed the quarry treatment on 2026-07-17 (Q12 resolved), so the branch is source material only and is never merged or rebased.

The roadmap also carries a separate business-model track ("Studio MVP", `docs/roadmap.md` sections 5.4 and 6.1) about multi-artist studio accounts with a studio subscription. Inklee 2.0's studio owner role overlaps that track and the two must be reconciled before Phase 3 ships (open question Q8, collision audit section 8).

## 3. Product pillars

1. **The map**: tattoo-native discovery of studios, shops, and artists in an area.
2. **Studio identity**: studio pages worth snooping through (vibe, photos, categories, reputation), claimable by studio owners.
3. **Guest spots**: a request-based workflow between artist and studio that lands in both calendars.
4. **Studio operations**: workspace overview, guest management, and the studio group for day-to-day coordination.
5. **Artist identity**: the artist profile as a tattoo-world passport with opt-in visibility.
6. **Shops**: a secondary supply-shop layer on the map.

## 4. Locked decisions

Everything in this section is decided. Implementation tasks should not reopen these without a founder decision. Open items are explicitly listed in `inklee-2-open-questions.md`.

### 4.1 Artist accounts

- Artist is the base account. No apprentice downgrade or lower status. Everyone is on eye level.
- Artists can hold multiple roles (an artist can also be a studio owner).
- Artist profile visibility on the map is opt-in. Default is not visible.
- No live location pointer, ever. Public location granularity is city or future destination only.
- Artists can show: current city, future destinations, and a "looking for guest spots" status.
- Artists can discover other public artists currently in town through a list.
- Artists are counted anonymously in an area on a consent-gated basis (founder decision 2026-07-17): only artists with any map visibility on are counted; city_only artists count without being listed; fully-off artists appear nowhere. A minimum-count display floor of 3 avoids deanonymization (Q13, resolved 2026-07-18).
- Artists can have a passport-style history of guest spots and travel, and can keep it private.

Artist profile fields to plan for the map identity layer:

- Travel history
- Guest spots completed
- Studio memberships
- Reviews from studios (thumbs up only, see 4.9)
- Style categories
- Availability
- Social links
- Future destinations
- Looking for guest spots status

### 4.2 Studio owner role

- Any standard Inklee account can be elevated into a studio owner role. A studio owner can be a tattoo artist, receptionist, manager, or business owner.
- No special owner sign-in. Same account, additional role.
- The studio owner account should feel more serious than a simple artist account: it carries a business surface and moderation responsibilities.
- To create or claim a studio, a studio owner must provide at least one social media link and an address. No legal documents required in the first version.
- One studio per studio owner account in the first version.

Studio owner capabilities:

- Create or claim one studio
- Manage the studio public page
- Add logo, photos, description, categories, social links, and vibe section
- Accept, deny, or suggest alternate dates for guest spot requests
- Send private pricing and policy information to requesting artists
- Manage guest spot stays
- Manage workspace availability
- Assign artists to workstations, or use auto-assignment
- Create recurring guest spot chair availability
- Receive overbooking warnings and manually accept overbooking when needed
- Invite artists into the studio group
- Manage group access, documents, announcements, votes, and house rules
- Privately blacklist artists
- Create one temporary map post per month

**Extension (2026-07-18): studio owner cockpit.** The studio owner role gets one operational command center, and it is the thing that makes the paid role feel worth paying for. The cockpit shows: guest spot requests, current guest artists, upcoming stays, the workspace overview, overbooking warnings, studio group activity, pending votes, temporary signal status, profile completeness, and report or admin status where relevant. It is deliberately NOT a generic analytics dashboard: no charts for their own sake, just what needs the owner's attention today. It grows with the phases that feed it (the Phase 3 shell shows profile and claim state; requests, stays, workspaces, and group activity light up as their phases ship).

**Extension (2026-07-18): studio profile completeness score.** A score inside the cockpit and the profile editor showing what is missing (logo, minimum 3 photos, address, categories, workspace overview, house rules, guest spot availability, vibe, resident artists). Useful, not childishly gamified: it improves map quality without manual nagging. It never blocks usage beyond the already-locked publish minimums (logo, 3 photos, address or approximate location, description, minimum 3 categories).

**Extension (2026-07-18): house rules builder.** House rules become structured, reusable studio-level content instead of one free-text field: deposit policy, client handling, cleaning rules, supplies included, setup and breakdown expectations, opening hours, key or access rules, guest artist promotion rules, walk-in policy, cancellation expectations. Owners choose whether rules show on the studio profile; they are automatically available in the studio group and can be included in the welcome pack. This is communication support, never contract management, and Inklee is never responsible for enforcing them.

**Extension (2026-07-18): studio welcome pack.** After a guest spot is accepted, the studio can send a saved, reusable welcome pack to the artist: house rules, address and access information, workspace assignment, wifi, emergency contact, nearby supply shops, promotion assets, the group chat link, local notes. Structured content inside Inklee, no PDF by default, connected to the confirmed stay, updatable and reusable across guest artists. Address, access, and contact details are interaction-plane data: they only ever reach an artist with an accepted stay.

### 4.3 Studio profiles

Studio entries can be: seeded by Inklee, unclaimed, claimed by a studio owner, or created by a studio owner. Unclaimed studios appear on the map.

Required fields:

- Studio name
- Address, unless manually set to approximate/private location
- Logo
- Minimum 3 photos
- Description
- Minimum 3 categories
- Public profile
- Studio owner state or unclaimed state
- Guest spot request availability state
- Basic workspace overview

Seeded unclaimed entries will not meet the photo/logo minimums; the requirements above bind claimed and owner-created studios. Seeded entries carry whatever safe subset the seeding rules allow (see open question Q5 on photos).

Optional fields:

- Resident artist social links
- Vibe section
- Detailed workstation information
- House rules
- Public hosted artist list
- Badges
- Temporary map post

Standard categories:

- Private studio
- Street shop
- Appointment only
- Walk-in friendly
- Blackwork
- Fine line
- Traditional
- Vegan supplies
- Private room available
- Piercing
- Custom category

Category and address rules:

- A studio must have at least 3 categories. All 3 can be custom categories.
- Studio address is public by default.
- If a studio hides its exact address, it appears only as an approximate location ("in the area").
- A private studio cannot be shown at its exact map position.
- Studio pricing is never public. The owner can write pricing or policy information and send it privately to requesting artists.
- Studios have a public thumbs-up reputation and a public hosted artist list.
- Studios can earn badges such as: great for guest spots, beginner friendly, private room, fast communication.

**Extension (2026-07-18): guest artist timeline.** Studio profiles gain a timeline of past, current, and upcoming guest artists, fed by confirmed and completed guest spot entries. It shows studio activity and credibility without text reviews. Visibility is studio-controlled (public or semi-public) and always capped by each artist's own privacy: an artist with a private profile or private travel history is never exposed by name; the studio may show an anonymized or reduced entry instead (exact representation is open question Q16).

### 4.4 Initial map seeding

- The map is global in concept.
- The first wave of data can use public sources to seed initial studio entries (legal source selection is open question Q2).
- Initial seed density is capped at a maximum of 5 studios per 300 square km. This cap is a hard rule. It exists to prevent cost explosion, uncontrolled data volume, messy data quality, and overloading the first launch version.
- Initial seeding is admin-curated and tightly controlled. No automated pipeline goes straight to the public map.
- User-generated entries become possible later, but always routed through admin control and moderation logic.

### 4.5 Guest spot request workflow

A guest spot request behaves like a booking request, not a job application. It reuses the mental model artists already have from Inklee 1.0 client bookings: someone asks for dates, the other side accepts, passes, or proposes alternatives.

Artist submits:

- Requested dates
- Instagram or social link
- Free text explaining the guest spot purpose
- Expected clients
- Equipment needs

Studio owner can: approve, deny, or suggest alternate dates. In-app button copy follows the founder verb rule (AGENTS.md, slice 60a): Accept / Pass / Suggest dates, not Approve / Reject.

Rules:

- Artists can request any date. No open slots and no direct booking in the first version. An "open guest spot" state can exist as a signal on the map, but booking remains request-based.
- Inklee does not handle guest spot payments and does not become a contract partner. Inklee only supports communication and organization.
- Guest spots are saved as entries inside Inklee. Confirmations are saved as lightweight text or structured entries. No PDF or formal file is generated.
- Extension note (2026-07-18): acceptance is also the trigger for the studio welcome pack (see 4.2) and feeds the guest artist timeline (see 4.3); completed stays feed studio stamps and story cards (see 4.9).
- The artist calendar must reflect requested and booked guest spots.
- The studio calendar must reflect requested and booked guest spots.
- Clients can still book artists through Inklee according to each artist's normal booking settings. A guest spot never overrides or locks the artist's own booking configuration.

### 4.6 Workspace management

Workspace management should be as detailed as the studio owner wants, but must not force heavy organization. A studio that never opens the workspace editor still works.

Mandatory:

- Visual overview of workstations (a simple studio blueprint, like a restaurant table view from above)
- Name per workstation
- Basic booking situation overview
- Overbooking warning popup
- Manual overbooking override

Optional details:

- Number of chairs, rooms, private rooms, shared stations, piercing room, photography or content corner
- Custom workspace fields and exact workspace information
- Manual assignment and auto-assignment
- Recurring availability

Overbooking must warn, not block. A studio may intentionally overbook during conventions, flash days, guest events, or partial-day arrangements. This is a hard product rule with a direct schema consequence: no database constraint may reject an overlapping assignment (the predecessor prototype did exactly that and must be adapted, see the collision audit).

### 4.7 Studio groups

Studio groups are for operational management. They are not meant to replace all external messenger communities. The feeling sits between a Telegram group with friends and Airbnb host chat.

Ownership and membership:

- Owned by the studio owner, created as a studio owner feature.
- Artists can belong to multiple studio groups.
- Studio owners can also be members of other studio groups.

Guest access window:

- Guest artist access is tied to guest spot dates.
- Access starts 14 days before the guest spot and ends 14 days after the final guest spot day.
- Former guest artists automatically drop out after this period.

A studio group includes:

- Real-time chat
- Members list
- House rules
- Owner-only documents
- Owner-only announcements
- Votes
- Linked guest spot calendar subpage

Votes:

- Created by the owner; members can propose them.
- Multiple choice, shown inside the chat.
- Not legally or operationally binding. A communication tool only.
- Vote types: flash day date, guest artist approval, studio event, supply purchase, travel plans, house decision, custom.

**Extension (2026-07-18): pinned group cards.** The chat gets owner-controlled pinned functional cards so the important operational stuff stays findable: house rules, current guest artists, upcoming guest spots, an active vote, the flash day plan, the supply list, a studio announcement, the workspace schedule. Cards are functional, not decorative, and where the data already exists (house rules, upcoming stays) the card is generated from it rather than retyped. The group keeps its feeling between a Telegram group with friends and Airbnb host chat.

**Extension (2026-07-18): shared supply list.** A simple operational list inside the group: ink running low, need more cartridges, second skin, printer paper, gloves, cleaning supplies. Anyone in the group can add and tick off. It is a list, not procurement software. Shops stay entirely out of the first version of the supply list; any future shop suggestion around supply needs is its own carefully-scoped decision because the spam risk is obvious.

**Extension (2026-07-18): flash day planner.** The concrete operational use case that makes studio groups feel tattoo-native: plan a studio flash day from inside the group. Builds on what already exists: the date vote (vote types above), participating artists (group members), flash theme, time slots, a promotion checklist, the booking link, client request routing, and assigned workstations (workspace planning). It stays focused on studio-organized flash days; it is not an event platform. How it connects to the existing 1.x flash days feature is a real architecture decision (open question Q15) that gets made before this ships.

### 4.8 Shops

Shop listings are secondary to the studio and guest spot layer.

Shop categories: tattoo supply shops, needle suppliers, ink suppliers, piercing suppliers.

Shop account rules:

- Limited business profile with manual approval before going live.
- Visible to every Inklee account.
- Can advertise city-wide, list a product catalog in Inklee, link to their own webshop, and link to Google Maps for navigation.
- Cannot sell directly through Inklee in the first version. Inklee takes no shop commission in this version.
- Shops can contact studio owner accounts. Studio owners can block shops manually after contact.

### 4.9 Reputation: thumbs up, badges

The only public reputation signal is thumbs up. Deliberately excluded: star ratings, public text reviews, downvotes, and negative review text. The map should build legitimacy between colleagues, not become a review battleground.

- Allowed directions: artist reviews studio, studio reviews artist, artist reviews shop, studio reviews shop.
- Reviews are possible after completed guest spots. Shops can receive thumbs up from any artist account.
- Public reputation is a thumbs-up counter. More thumbs up means more legitimacy from colleagues.
- Studios can earn badges (great for guest spots, beginner friendly, private room, fast communication).

**Extension (2026-07-18): studio stamps.** After a completed guest spot, the studio can give the artist a visual stamp: "Worked at Black Needle Studio, Berlin, October 2027". A beautiful internal Inklee object in the artist passport, shown only if the artist allows it (passport privacy applies). Connected to verified completed stays only, so it cannot be faked. This is a tattoo-native memory and reputation object, not a generic achievement badge, and it has nothing to do with NFTs or blockchains. Shareable visuals can come later; the first focus is the internal passport.

**Extension (2026-07-18): guest spot story cards.** An optional shareable card after a completed guest spot: artist, studio, city, dates, optional photos, studio logo, Inklee branding. Generated only after completion, only with privacy-safe consent from both sides where needed, and it never exposes a private studio's true address or private artist travel data. Connects to stamps and the passport. This is the organic marketing loop: artists and studios showing real guest spots is how the map spreads.

### 4.10 Reports and moderation

- Anonymous reports are possible. Artists can flag studios; studios can flag artists; artists can flag shops, wrong locations, fake studios, spam, scam accounts, and bad behavior.
- Reports are collected in Inklee admin. Inklee does not promise to resolve every report. Tone: "We try to keep the map as clean as possible."

**Extension (2026-07-18): report context categories.** Every report is categorized first; the categories are the report. The vocabulary: no-show, unsafe behavior, payment conflict, harassment, fake profile, wrong location, spam, scam, hygiene concern, other. Free text stays out of the reporter flow; a short optional detail field exists only as admin context, never shown to anyone else. Categories apply to reports on artists, studios, shops, fake entries, and wrong locations. This reduces drama, improves admin review quality, and removes the free-text abuse surface. Anonymity toward the target stays exactly as scoped. Note for implementation: the already-shipped report storage carries a narrower reason list, so the vocabulary extension is a lockstep change across the database CHECK, the shared module, and the admin queue (collision audit section 14).

**Extension (2026-07-18): duplicate studio detector.** Data quality is a moderation concern from day one because seeding may use public sources. The detector runs at import, studio creation, and studio claim, matching on similar name, same address, nearby coordinates, same Instagram link, same website, and same phone number where stored. It never auto-merges; it creates admin review suggestions with confidence levels (clear duplicate, likely duplicate, possible duplicate). Part of map health and the admin moderation surface.

**Extension (2026-07-18): claim conflict workflow.** When multiple accounts claim the same studio: mark the location as claim conflict, freeze any public ownership change, ask both claimants for social proof (resident artists, studio social links, a matching official website, other community validation), and let admin decide. The current public studio state stays stable until resolved; ownership never transfers automatically during a conflict. Legal documents stay not-required, and community proof remains the future-friendly direction without being a built dependency now.

Threshold logic:

- If an artist has 5 negative reports, this is shown to the artist and to the next studio they request.
- For every 3 guest spots without reports, the artist report count lowers by 1.
- If a studio has 10 reports, a warning is shown to artists.
- For every 5 thumbs up, the studio report count lowers by 1.

Note: these reports feed the same legal surface as the existing DSA moderation procedure (`docs/dsa-moderation-procedure.md`). Phase 0 must reconcile the map report flow with those obligations rather than inventing a parallel process.

### 4.11 Verification

First-stage goal: fill the map and create the use case before excluding too many users. Strict verification is deliberately not part of the first version, but the structure must support future verification.

Preferred future direction: community-based verification. A studio claim could be validated by social proof from artists connected to the studio. Plan for it, do not overbuild it.

No legal documents required in the first planned version.

### 4.12 Privacy and blocking

- Artists have full control over their visibility.
- No live location pointer. Public location is city or future destination only.
- Studio addresses are public by default; private studios show only an approximate location.
- Exact phone or private contact details are shared only after a positive request interaction.
- Preventing outside contact through Instagram is not a goal. The map is discovery, not a walled garden.
- Every account can block another account. Blocking affects conversation visibility and public data visibility between the blocked accounts.
- Studio owners can privately blacklist artists (invisible to the artist, filters future requests).
- Inklee stores only lightweight confirmations and agreements, never contracts.

### 4.13 Map experience

The default map is simple, clean, and discovery-oriented. The artist should feel excited to snoop around, inspect studio vibes, and discover possible guest spot locations.

The map shows:

- Studios (seeded, unclaimed, claimed)
- Shops
- Artists in town or area: a public list for artists who opted in, an anonymous count for private artists
- A subtle signal for guest spot availability
- Future support for events (architecture only, see out of scope)

Filters:

- City or area, plus extra km around it
- Date range
- Guest spot available
- Style
- Studio type
- Private room
- Workstation available

Artist actions on the map:

- Explore studios
- Watch or mark studios
- Request a guest spot
- View shops
- View public artists in town and anonymous artist counts
- Use the existing travel plan feature rather than a duplicate (the map links into `/travel`, it does not reinvent it)

No saved cities in this version. Watched or marked studios are enough.

**Extension (2026-07-18): temporary studio signals.** Temporary map posts grow into a typed signal system:

- Studios can push one short-lived signal from a typed vocabulary: guest chair open, flash day planned, looking for guest artist, convention week availability, walk-in day, new resident artist, studio relocation, private room available.
- The limit stays exactly as locked: 1 temporary map post or signal per owner account per month.
- Signals are lightweight and temporary, appear contextually on the map and possibly in the contextual feed, and this never becomes a general social posting system.
- Exact display behavior is deliberately undecided (open question Q7, which now covers signals).

**Extension (2026-07-18): contextual map feed.** The map feels alive without becoming Instagram. The feed is strictly contextual, never global: updates near watched studios, updates in a planned destination, updates from the artist's studio groups, updates from studios the artist interacted with, updates in the current city. Content is map-related and operational: temporary signals, changed studio profiles, new guest spot activity, relevant group updates, map changes. No infinite scroll, no global timeline, no algorithmic social behavior; it exists to support guest spot planning and discovery, nothing else.

**Extension (2026-07-18): what changed here.** For returning artists: what changed in a city or area since the last visit, without scrolling anything. Sourced from watched studios, planned destinations, and recently viewed areas: new studios, new shops, new signals, new artists in town (consent-gated counts and lists only), changed studio profiles, new badges. Requires change tracking on map entities and studio profiles, which is why it sits in the later map activity work, not the first map shell.

### 4.14 Monetization

- Monetization runs mainly through studio owner accounts.
- The map is not behind an artist paywall in the first version.
- The map can become a main reason for users to keep paying for Inklee, especially studio owners.
- Shop monetization is future potential, not commission-based in the first version.
- Where studio owner pricing lives (existing plans vs a separate Inklee Studio tier) is open question Q8 and must be reconciled with the roadmap's BM-4.x Studio MVP track.

## 5. Explicitly out of scope for the first build

Named here so implementation tasks do not drift into them:

- Client-facing map or any logged-out consumer surface
- Events, conventions, flash days, and walk-in days as map event OBJECTS (the object model must leave room for an event type later, but no event entities ship in the first build; temporary studio signals may reference them as short-lived text, and the Phase 6 flash day planner is group-scoped, not map-scoped)
- Saved cities
- Direct booking of guest spot slots (request-based only)
- Guest spot payments, deposits, contracts, or generated documents
- Shop checkout, shop commission, or any commerce through Inklee
- Star ratings, text reviews, downvotes
- Legal-document verification of studios
- Automated seeding pipelines that publish without admin curation
- Renaming or migrating the existing artist-travel tables (vocabulary rule instead, see collision audit)
- A global or algorithmic social feed, infinite scrolling, or anything competing with Instagram (the feed is contextual and map-bound only)
- Procurement software (the supply list is a list) and shop involvement in supply lists
- A full event platform (the flash day planner covers studio-organized flash days only)
- NFTs, blockchains, or any tokenized version of stamps and passports
- Auto-merging duplicate studios or auto-transferring contested claims

## 6. Product architecture

### 6.1 Role and permission model

Roles are additive capabilities on the single existing account, never separate account types:

| Role | How obtained | Adds |
| --- | --- | --- |
| Artist | Base account (existing 1.x signup) | Map browsing, opt-in map presence, guest spot requests, watching studios, thumbs up, reports |
| Studio owner | Self-service elevation with social link + address, one studio per account | Studio page management, guest spot inbox, workspace management, studio group ownership, blacklist, temporary posts |
| Shop owner | Application with manual admin approval | Shop profile, catalog, city-wide advertising, contacting studio owners |
| Admin | Existing internal admin (unchanged mechanism) | Seeding CRUD, claim review, report queue, moderation actions |

Permission principles:

- Elevation never replaces the base artist capability set; a studio owner still is an artist account with everything that implies.
- Every studio-scoped write is checked against studio ownership (one owner per studio in v1 keeps this a single-column check).
- Group access is computed from roster membership plus the guest-stay 14-day window, never granted as a permanent flag that must be revoked manually.
- Shop accounts get no access to artist personal data beyond what any account sees publicly.
- Admin moderation state (approved, pending, hidden, removed) gates every publicly rendered map object. Fail closed: an object with no moderation state does not render.

### 6.2 Map object model

One shared map object concept underlies everything rendered on the map, following the predecessor's `map_locations` direction:

- A **map location** is a geographic point with a category (studio, shop, later: event), a source (seed, owner-created, claim-converted), a claim state, and a moderation state.
- Studio and shop profiles attach to a map location; the location is the map-facing identity, the profile is the content.
- Artist presence is not a map location. It is derived, aggregated data (city-level counts and opt-in lists), never a stored point coordinate for a person.
- Approximate-location studios carry a display coordinate that is deliberately offset/coarse, separate from the true address (which stays private).
- The seeding cap (5 studios per 300 square km) is enforced at insert time in the admin tooling, not just in an import script, so later seeding rounds cannot silently violate it.

### 6.3 Privacy model

Three visibility planes, decided per object, never mixed:

1. **Public map plane**: what any logged-in artist sees. Studio pages, shop pages, opt-in artist presence, anonymous counts, thumbs-up counters, badges.
2. **Interaction plane**: what becomes visible between two parties after a positive interaction (accepted request): private pricing/policy notes, exact contact details, group access during the stay window.
3. **Private plane**: what never leaves the owner: blacklist, report identities, draft requests, private passport history, true addresses of approximate-location studios.

Rules of thumb for every new surface: default to the most private plane, promote explicitly, and prefer aggregate over individual data (counts before lists, lists before profiles).

### 6.4 Data model draft

Directional sketch, not a migration plan. Names follow the predecessor's namespacing so nothing collides with the live artist-travel tables (`studios`, `trips`, `trip_legs`). Final naming happens in Phase 0/1.

Map and directory:

- `map_locations`: the shared map object (predecessor shape fits almost as-is: source, category, coordinates, claim_status, moderation_status, is_seed). Add: approximate-location display fields, seed-cap bookkeeping (region bucket).
- `location_claims`: claim requests with evidence note and admin review state (predecessor shape fits).
- `watched_studios`: artist bookmarks a map location.
- `temporary_map_posts`: owner posts with created month bookkeeping for the 1/month cap.

Studio side:

- `studio_profiles`: the claimed or owner-created studio. One row per studio, `owner_user_id` unique in v1 (one studio per owner). Carries logo, description, vibe, address + address-visibility mode, guest spot availability state. The predecessor's two-table org/location split is deliberately collapsed for v1; if multi-location returns later, this table becomes the location and grows an org parent (documented migration path, not built now).
- `studio_categories`: standard + custom categories per studio, minimum 3 enforced in the app layer.
- `studio_photos`: ordered photos, minimum 3 for claimed studios (validated at publish time, not upload time), storage-capped (open question Q6). Stored in a NEW `studio-media` bucket keyed by studio id, not artist id: every existing storage convention keys ownership to the artist userId path prefix, and studio assets under an owner's prefix would be deleted with the owner's account.
- `studio_workspaces`, `studio_workspace_availability`, `studio_workspace_assignments`: adapted from the predecessor with one hard change: no DB-level overlap exclusion. Overlap detection is an application-layer computation that produces warnings and requires explicit override confirmation, because overbooking is allowed by design.
- `studio_blacklists`: private per-studio artist blacklist.
- `studio_badges`: badge grants per studio.

Guest spots:

- `guest_spot_requests`: predecessor shape extended with the locked submission fields (social link, expected clients, equipment needs, free-text purpose). Careful: the predecessor's `number_of_artists` means artist headcount, not expected clients; those are two fields.
- `guest_spot_proposals`: alternate-date proposals as separate rows (predecessor pattern, keeps history intact, supersede logic already built).
- `guest_spot_stays`: the confirmed entry, the thing both calendars render and the passport counts. Carries the lightweight confirmation text/structure (the predecessor's `terms_snapshot` jsonb is the existing hook for the private pricing/policy message).
- On acceptance, the stay **materializes a trip + trip_leg** in the artist's existing travel data (with additive linkage columns so a studio-confirmed leg is distinguishable and edit-protected). This one decision makes the artist calendar, the public booking form's location labels, booking auto-tagging, confirmation emails, and the dashboard widget work through the pipelines that already exist, and it satisfies "clients keep booking normally during guest spots" by construction. The collision audit (section 4) carries the full argument.

Groups:

- `studio_groups` (1:1 with studio in v1), `studio_group_members` (roster + computed guest windows), `studio_group_messages`, `studio_group_announcements`, `studio_group_documents`, `studio_group_votes` + `studio_group_vote_options` + `studio_group_vote_ballots`. House rules live on the group row.

Reputation and moderation:

- `map_thumbs_up`: giver, target (studio/artist/shop), optional stay reference for eligibility.
- `map_reports`: anonymous-to-target reports with reason, target, admin queue state. Report counts and decay are computed views/counters, designed in Phase 0 so the decay rules (3 clean guest spots, 5 thumbs up) are auditable.

Shops:

- `shop_profiles` (approval state, links, advertising area), `shop_catalog_items`.

Artist side (mostly existing tables plus new explicit columns):

- Map presence, "looking for guest spots", and passport privacy live as real indexed columns with off defaults, not settings-jsonb keys (map filters need indexes, and the profile settings jsonb is already a documented sprawl trap). Current city needs structured geocoded columns; today's `profiles.location` is free text.
- Future destinations derive from the existing travel feature, but behind a NEW consent flag: the existing `show_on_booking_form` toggle is consent to show travel to the artist's own clients, and must never be silently repurposed for cross-artist map discovery.
- Style categories are a new canonical taxonomy (reference table plus junctions for artists and studios); no style vocabulary exists anywhere in the schema today.
- The passport is a read model over completed stays + travel history with a privacy toggle, not a new store.

### 6.5 Calendar integration principle

On the artist side, an accepted guest spot materializes into the existing travel data (trip + trip_leg with linkage columns), so it rides the calendar bands, booking-form location labels, and email plumbing that already exist; a pending request renders as a distinct marker through the calendar's designed extension points. The artist's client-booking behavior during a guest spot stays governed by the artist's normal booking settings; a guest spot never auto-blocks client bookings (there is deliberately no conflict blocking anywhere in Inklee today, and 2.0 keeps it that way).

The studio calendar is the genuinely new build: every calendar read path today is scoped to one artist, so the stay entity carries two-party RLS (artist and studio owner) and gets its own studio-scoped calendar route. The external iCal feed gains trip-leg events when guest spots ship (it currently contains approved bookings only). Details in the collision audit, section 4.

## 7. Main risks

Challenged and ranked, not just listed. Every one of these gets an explicit owner phase in the build plan.

**Data and cost risks**

1. Initial seeding: the wrong source or density decision creates legal exposure and garbage data that poisons first impressions. Mitigation: admin-curated only, hard density cap, source decision escalated (Q2), photos off by default on seeded entries (Q5 default).
2. Public-source data usage: ODbL/ToS violations are easy to commit accidentally. Mitigation: no bulk import before the legal read; hand-curation carries the first cities.
3. Map data and image storage costs: studio photos are the first unbounded-growth asset Inklee hosts for non-paying entities. Mitigation: per-studio storage cap (Q6), processed/resized uploads only, no seeded photos.
4. Large data volume: a global map invites unbounded rows. Mitigation: the seed cap, admin-gated user generation, per-area render limits from day one.

**Abuse and moderation risks**

5. User-generated map spam, fake studios, wrong locations, scam accounts: the map's credibility is its product. Mitigation: everything user-generated flows through moderation state; reports with thresholds; unclaimed entries visually distinct from claimed ones.
6. Moderation load: reports plus claims plus shop approvals is a real ongoing labor cost for a solo founder. This risk is understated in most plans. Mitigation: queues with thresholds rather than per-item promises, the stated non-promise tone, and the DSA procedure reconciliation so legal duties are met without over-promising.
7. Notification overload: request flows, group chat, and temporary posts can easily triple Inklee's notification volume. Mitigation: channel decision deferred (Q9), digest-first defaults, per-surface opt-outs planned in Phase 0.

**Privacy and safety risks**

8. Privacy mistakes: artist location data is genuinely sensitive (stalking risk is real in this scene). Mitigation: the three-plane privacy model, no live location, city-only granularity, the anonymous count floor of 3 (Q13, resolved), opt-in defaults everywhere.
9. Role escalation mistakes: self-service studio owner elevation is an attack surface (fake claims on real studios). Mitigation: claims reviewed by admin, social-link requirement, community verification direction later; RLS review is a named Phase 9 audit.

**Product integration risks**

10. Calendar collisions: guest spots rendering into the 1.x calendar can corrupt the artist's trust in their own schedule if statuses or conflicts display wrong. Mitigation: new entry type, no auto-blocking, Phase 4 dedicated integration work, collision audit section on the calendar.
11. Booking system collisions: the guest spot request flow must feel like booking requests without touching their code paths or statuses. Mitigation: separate tables and state machine; shared UI patterns only.
12. Guest spot workflow collisions with normal bookings: an artist on a guest spot still receives client bookings; date-range overlaps are normal, not errors. Mitigation: explicit product rule (never auto-block), warning-style surfacing only.
13. Merge complexity with Inklee 1.x: 2.0 develops as its own track while 1.x keeps shipping. The predecessor worktree already demonstrates how fast an unmerged branch rots. Mitigation: 2.0 lands on master behind flags in small slices (the build plan's standing rule), not as a long-lived mega-branch.

**Platform risks**

14. Mobile app map performance: hundreds of markers plus clustering on mid-range Android is a real risk; the native app also has no OTA updates, so every map iteration costs a store build. Mitigation: marker budget + clustering from day one, list-view fallback, mobile follows web once the web map stabilizes.
15. Map tile dependency: both platforms currently ride CARTO's free keyless tile endpoints with no contract. Fine for the personal journey page, unpriced for a flagship surface that studio subscriptions depend on. Mitigation: tile budget decision folded into the map provider question (Q1), decided by end of Phase 2.
15a. Feed and change-tracking volume (added 2026-07-18): the contextual feed and what-changed-here need change events on map entities and studio profiles, which is a new unbounded-growth table family. Mitigation: pull-only delivery (the feed never rides the notification pipeline), tight retention on change events, and contextual scoping so no query ever spans the whole map.
15b. Outward-facing story cards (added 2026-07-18): story cards are the first 2.0 artifact designed to leave Inklee. Mitigation: completed stays only, consent from both sides where needed, the shaper discipline applied to the card content (no true addresses of approximate studios, no private travel data), and the privacy audit in Phase 9 covers them explicitly.

**Business risks**

16. Billing infrastructure gap: studio owner monetization presumes a subscription layer (plan schema, Stripe Checkout/Portal, webhooks, feature gates) that does not exist yet; the only entitlement mechanism today is admin comping. Mitigation: either sequence the billing build as an explicit prerequisite or launch studio owners comped; keep the role model free of plan assumptions either way (Q8).
17. Strategy legibility: the written business docs gate all studio work behind Solo Plus stability metrics and explicitly disclaim "marketplace-style discovery". Building 2.0 now is a deliberate founder override that must be recorded in the business-model doc during Phase 0, or future work sessions will treat 2.0 as a violation of the locked phase gates.
18. Legal surface of reports: the anonymous report system intersects the existing DSA moderation procedure (reporter acknowledgment duties, statements of reasons on visibility restrictions, automation disclosure, records retention). Mitigation: Phase 0 designs reports as in-product signals distinct from formal DSA notices, with counsel review (Q14); the DSA doc, report form, and AUP update together.

## 8. Where this document does not decide

- Everything in `docs/product/inklee-2-open-questions.md` (map provider, seeding source, indexability, seed distribution, seeded photos, storage caps, temporary post display, pricing placement, notification channels, chat build vs buy, plus audit-added questions).
- Final table names, column types, and RLS policies (Phase 0/1 output).
- Visual design of the map, studio pages, and the workspace blueprint view.
- The exact merge mechanics with the 1.x line (Phase 9 produces that plan).
