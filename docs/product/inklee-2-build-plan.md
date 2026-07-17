# Inklee 2.0 build plan

Status: planning foundation, written 2026-07-17. This is the phased build structure for the guest spot map and studio network track. No implementation has started. Scope and locked decisions live in `docs/product/inklee-2-guestspot-map-scope.md`; collision details in `docs/product/inklee-2-collision-audit.md`.

## Standing rules for the whole track

- **Small slices on master, behind flags.** The predecessor worktree proved that a long-lived local branch rots against a fast-moving master. 2.0 work lands on master in reviewable slices, gated by fail-closed feature flags (the existing capability-registry discipline applies: registry entry before any new flag). Nothing renders in prod until its flag flips.
- **1.x keeps shipping.** The 1.0/1.1/1.2 line continues independently. 2.0 slices must never block or destabilize it; the pre-commit full-build gate and existing test suites stay green on every slice.
- **Web first, mobile follows.** The web map is the proving ground. Mobile picks up each surface after it stabilizes on web, because every native change costs an EAS build and store review (no OTA).
- **Quarry the predecessor, do not rebase it (founder-confirmed 2026-07-17, Q12 resolved).** The worktree branch `feature/local-studios-guestspots-map` is source material: copy and adapt what matches the locked decisions, rewrite what does not. Its migrations (local 0054 to 0058) are reference SQL, never applied as-is.
- **Postponed questions stay postponed.** Each phase below names the open questions it eventually forces; an implementation task hitting one earlier stops and escalates rather than deciding silently.

## Phase 0: product architecture

Paper phase. Output is documents and decisions, no code.

- Product requirements consolidation (the scope doc is the base; this phase turns it into per-surface requirement lists)
- Role and permission matrix: artist / studio owner / shop owner / admin capabilities per object type, written against the existing auth and RLS patterns
- Data model draft hardened into a reviewable schema proposal (tables, columns, FKs, RLS sketch per table), reconciling the predecessor schema with the locked deltas: one studio per owner, warn-only overbooking, thumbs up, reports, groups, shops, temporary posts
- Privacy model: the three-plane model (public map / interaction / private) applied field-by-field
- Map object model: map location lifecycle (seeded, unclaimed, claimed, owner-created, hidden, removed) as an explicit state machine
- Guest spot workflow: adapt the predecessor request/proposal/stay state machines to the locked submission fields and calendar rules
- Studio owner workflow: elevation, create vs claim, claim review
- Studio group workflow: membership computation (roster + 14-day guest windows), vote lifecycle
- Review and report logic: thumbs-up eligibility, report thresholds and decay as auditable counter design; reconciliation with `docs/dsa-moderation-procedure.md`
- Cost risk notes: storage, tiles, realtime, notification volume, with provisional budgets
- Merge collision notes with 1.x: the collision audit reviewed and re-confirmed against master at phase start
- Style and category taxonomy: the canonical vocabulary for artist styles and studio categories (nothing exists in the schema today; map filters need it indexed)
- Notification matrix: which events produce feed rows, pushes, and emails, with per-category mute preferences designed before any high-volume type ships
- Doc reconciliation: record the strategy override of the written studio phase gates in `docs/business-model.md`, resolve the "Studio" naming split (BM-4.x booking multi-tenancy vs the 2.0 studio owner), amend the "not a discovery platform" guardrail to client-facing scope, and extend the DSA moderation procedure to the new report surfaces (with counsel review of the anonymous-report design)

The collision audit ends with the ten decisions this phase must make (`inklee-2-collision-audit.md` section 13); treat that list as the Phase 0 checklist.

Exit gate: founder signs off on the schema proposal, the permission matrix, and the business-model revision.

## Phase 1: data model and internal admin directory

First code. Admin-only, invisible to users.

Status 2026-07-17: core slice SHIPPED. Migration 0075 (map_locations, location_claims, styles + 15-style seed, map_reports, moderation_statements; PostGIS + spatial index on display coordinates; all tables RLS-on with zero policies, verified live), shared vocabulary module `packages/shared/src/map-directory.ts` with the seed bucket function (area proven ~300 square km across latitudes by an independent spherical-area test), admin directory at `/admin/map` (list, create/edit with the Places picker, moderation controls, delete, report queue), cap enforced in the insert path, map report retention wired into the purge cron. Deliberate deviation: the server-held-key geocoding endpoint is deferred to Phase 3 (owner create/claim needs it; admin curation uses the existing browser Places picker inside the admin-authed page, so coordinates stay trustworthy). Remaining in this phase: seeding the first hand-picked cities (founder-driven, Q4) and the Q2 bulk-import decision.

- Migrations for the map/directory core: map locations, claims, the style/category taxonomy, moderation state, and the report + statement-of-reasons tables (the studio and shop profile tables land in Phases 3 and 8 and link back to map locations by ALTER; per-phase landing table in the schema proposal, section 4). Ported worktree SQL is renumbered past the current head (0074+) and executed for the first time against a local Supabase, with live `pg_policies` verification (the prototype SQL has never run on a real database)
- A spatial index and a server-side geocoding endpoint (server-held key); the existing geocoding path is a browser-keyed web-only picker, and map queries need bbox/radius support that plain lat/lng columns cannot serve
- Admin moderation status on every publicly renderable object, fail closed
- Basic admin CRUD for studios, shops, and map locations inside the existing admin area (following the existing requireAdmin + serviceClient + dual audit-logging pattern; the founding-artist applications table is the approval-queue template)
- Report and flag storage plus a minimal admin queue view, shaped by the Phase 0 DSA reconciliation
- Data import boundaries: hand-curated entry first; any bulk import blocked until the seeding-source decision (Q2); no photos on seeded entries until Q5 is decided
- Seed cap enforcement: maximum 5 studios per 300 square km, enforced in the admin insert path with region bookkeeping, not just in import scripts
- Seed the first hand-picked cities (distribution per Q4 decision at that time)
- Reserve every new route segment in `RESERVED_SLUGS` (including the already-missing `map`)

Exit gate: admin can curate a city's studios end to end; cap provably enforced; RLS tests on every new table.

## Phase 2: artist-facing map shell

First artist-visible surface, behind a flag.

- Map view growing out of the shipped `/map` MapLibre shell (same tile approach until Q1 forces a provider decision): drop the travel-entries redirect gate, keep the URL, and layer the personal journey as one toggleable overlay
- Marker plane rebuilt as clustered GeoJSON layers (the shipped per-stop DOM/native-view markers do not scale past a personal journey) behind a viewport/filter query API
- The mobile branded basemap style promoted to the shared package so web and mobile render the same map (they have diverged)
- Studio markers and shop markers with claimed/unclaimed visual distinction
- Filters: city or area plus radius, date range, guest spot available, style, studio type, private room, workstation available (filters degrade gracefully where data is sparse)
- Studio preview cards and the studio detail page (logged-in only, noindex default per Q3)
- Watched studios
- Artist privacy settings: opt-in map presence, current city, future destinations from the existing travel data, looking-for-guest-spots status
- Artist map profile shell: the identity surface other artists see (style categories, availability, social links, studio memberships as they come to exist), all fields optional and private by default
- Public artist-in-area list (opt-in) and anonymous artist-in-area count with a minimum display floor (Q13 decided here)

Exit gate: an artist can explore a seeded city, watch studios, and control their own visibility; marker performance measured against a budget.

## Phase 3: studio owner role

- Upgrade flow: standard account elevates to studio owner (social link + address required, no legal documents)
- Create or claim a studio (one per account); claim review state in admin
- Studio profile editor: logo, photos (minimum 3), description, categories (minimum 3, custom allowed), social links, vibe section
- Photo upload on the existing storage patterns with the per-studio cap (Q6 decided here, provisional value acceptable)
- Address and approximate-location setting (private studios never render at exact position)
- Guest spot availability state control (the "open guest spot" map signal; the seeded/admin-side default lands in Phase 1 with the ported accepting signal)
- Owner dashboard shell: profile state, claim state, later inboxes
- Pricing placement reconciliation with the BM-4.x track (Q8 decided before this phase ships to real users)
- Deferred to a named follow-on slice after this phase: temporary map posts (1 per owner per month, cap enforced; display behavior decided then, per Q7)

Exit gate: a real studio owner can claim a seeded entry, complete the profile, and appear claimed on the map.

## Phase 4: guest spot requests

The workflow phase. Depends on Phases 2 and 3.

- Guest spot request form: date selection, social link requirement, expected clients, equipment needs, free-text purpose; submission rate-limited per requesting account
- Request state machine ported from the predecessor (14-state superset covering approve/deny/alternate plus information-requested and withdrawal), with button copy per the founder verb rule: Accept / Pass / Suggest dates
- Studio inbox: accept, pass, suggest alternate dates (proposals as separate entries, never overwriting the request)
- Private pricing and policy notes from studio to requesting artist (private storage, never the public bucket)
- Guest spot confirmation entry (lightweight structured entry, no PDF)
- Artist calendar integration: acceptance materializes a trip + trip_leg with linkage columns and an edit policy for studio-confirmed legs; pending requests render as a distinct marker through the calendar extension points; client bookings never auto-blocked
- Studio calendar: first version of the studio-side calendar showing requested and confirmed stays (new read path over the stay entity with two-party RLS; nothing studio-scoped exists today)
- Artist passport: the read model over completed stays and travel history with its privacy toggle (guest spots completed becomes real data in this phase)
- Notification wiring per the Q9 decision (made at this phase): new notification types are additive to the shared enum, and mobile push emission is version-gated so taps never dead-end on installed builds (screens plus extended tap-routing allowlist ship in a store build first)

Exit gate: a full request-to-confirmed loop between a real artist and a real studio, visible in both calendars, with the 1.x booking flow provably untouched.

## Phase 5: workspace management

- Visual workstation overview: the simple top-down blueprint view
- Named stations; workspace types (chair, room, private room, shared station, piercing room, content corner, custom)
- Optional detail fields, kept optional in the UI (no forced setup)
- Manual assignment of artists to stations; auto-assignment option
- Recurring availability rules for guest chairs
- Overbooking warning popup with manual override: overlap detection is an application-layer computation that warns and records the override; no blocking constraint anywhere
- Basic booking situation overview per station

Exit gate: a studio can run a convention-week overbook on purpose and the system warns without ever refusing.

## Phase 6: studio group

The heaviest infrastructure phase. Chat build-vs-buy (Q10) decided before it starts.

- Group created from the studio (1:1 in v1)
- Membership: roster members plus guest artists tied to guest spot dates; auto-add 14 days before the stay, auto-remove 14 days after the final day (the predecessor's date-bounded membership helper is the mechanism; daily crons with at-most-once markers cover the window boundaries)
- Real-time chat. The locked baseline is that the group ships with real-time chat; Q10 only decides custom-built vs a hosted service. Grounding: the product has zero realtime usage today (no Supabase Realtime channels anywhere, mobile is bearer-REST only with no direct client-to-database path), so Supabase Realtime adoption is first-time infrastructure with client-facing RLS design. A pull-based thread on the existing support-ticket model would be zero new infrastructure but is NOT live chat; if the Q10 spike makes that trade tempting, it is a scope reduction that needs its own founder decision, not a default. Chat traffic bypasses the notification feed either way (its own push path plus per-thread unread counts), or it buries booking-critical notifications
- Owner announcements and owner-only documents
- House rules
- Votes: owner-created, member-proposed, multiple choice, rendered in chat, explicitly non-binding
- Linked guest spot calendar subpage

Exit gate: a guest artist flows in and out of a group automatically around a real stay; retention and GDPR handling for messages documented.

## Phase 7: reputation and reports

- Thumbs-up system: artist to studio, studio to artist, artist to shop, studio to shop; eligibility tied to completed guest spots (shops: any artist account)
- Public thumbs-up counters on studio, artist, and shop profiles
- Badges: great for guest spots, beginner friendly, private room, fast communication
- Artist and studio flags; anonymous reports for wrong locations, fake studios, spam, scam accounts, bad behavior
- Report decay logic as designed in Phase 0 (artist: minus 1 per 3 clean guest spots; studio: minus 1 per 5 thumbs up)
- Warning thresholds (artist at 5 shown to artist and next requested studio; studio at 10 shown to artists)
- Admin report queue with moderation actions, reconciled with the DSA procedure (Q14 counsel sign-off required before this phase ships to users)

Exit gate: threshold and decay behavior verified against fixture histories; admin queue handles a report end to end.

## Phase 8: shop layer

- Shop owner application and manual approval flow
- Shop profile: categories (supply, needles, ink, piercing), links, description
- Product catalog (display only, no checkout)
- Webshop link and Google Maps navigation link
- City-wide advertising setting
- Shop-to-studio-owner contact; studio owners can block shops
- Shop markers already on the map from Phase 2 render real shop profiles now

Exit gate: an approved shop is discoverable and contactable without any commerce flowing through Inklee.

## Phase 9: audit and merge plan

The consolidation phase before 2.0 is considered part of the main product line.

- Database cost audit (row growth, index sizes, realtime throughput)
- RLS and security audit across every 2.0 table (same rigor as the 1.x pre-launch audits)
- Privacy audit against the three-plane model, including the anonymous-count floor
- Image storage audit (per-studio caps holding, orphan cleanup)
- Map API cost audit: confirm the Phase 2 provider decision (Q1) still holds at real scale
- Moderation flow audit: queue volume vs founder capacity, DSA compliance
- Role escalation audit: elevation, claims, shop approvals
- Calendar collision audit re-run against the then-current 1.x calendar
- Existing booking system collision audit re-run
- Mobile compatibility audit and the mobile map performance / marker budget audit
- Abuse case audit: fake studios, claim hijacking, report brigading, spam posts
- Migration and merge plan from the 2.0 track into the 1.x product line: nav integration, pricing integration (per Q8 outcome), flag removal schedule, docs consolidation

Exit gate: a written go/no-go with the same seriousness as the 1.0 launch gate.

## Mobile sequencing note

Phases above describe the web build. Mobile follows per surface, roughly: map shell after Phase 2 stabilizes, request flow after Phase 4, groups after Phase 6. Constraints the audit confirmed:

- The 5-tab chrome is load-bearing (both nav chromes hard-assume a raised center FAB at `floor(len/2)`). The existing "Guest Spots" travel tab evolves into the 2.0 surface; no sixth tab.
- The MapLibre native module is already in every shipped binary, so the whole 2.0 mobile surface as specced needs no new native modules and no new store permissions (location stays stripped, matching the no-live-location rule). The costs are EAS build cadence (no OTA, batch into checkpoint builds), version-skew management (`clientAtLeast` gating on every response-shape change), and registering each 2.0 capability in the kill-switch registry before shipping.
- Every new screen honors the ME-15 adaptive contract (`docs/me15-tablet-audit.md` D1 to D12); the deferred travel master-detail lands when the travel tab is rebuilt.
- Heavy studio-owner admin (workspace editor, documents, votes) can ship through the existing web-handoff escape hatch before native versions exist.

## Dependency sketch

```
Phase 0 (paper)
  -> Phase 1 (schema + admin directory)
       -> Phase 2 (artist map shell)
            -> Phase 3 (studio owner)
            |    -> Phase 4 (guest spots)
            |         -> Phase 5 (workspaces)   [needs 4 for assignment targets]
            |         -> Phase 6 (groups)       [needs 4 for guest windows]
            |         -> Phase 7 (reputation)   [needs 4 for completed-stay eligibility]
            -> Phase 8 (shops)                  [needs only 1 + 2 + admin approval]
                                -> Phase 9 (audit + merge)
```

Phase 8 can run parallel to Phases 4 to 7 if capacity allows; everything funnels into Phase 9.
