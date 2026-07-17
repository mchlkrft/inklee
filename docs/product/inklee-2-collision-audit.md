# Inklee 2.0 collision audit

Status: planning audit, written 2026-07-17 from a 10-area read-only repo audit (travel/guest spots, shipped map, artist profile, booking/calendar, auth/roles/admin, storage, mobile, the predecessor worktree, docs/business model, notifications/email/realtime). Every claim below was verified against actual files; paths are cited so implementation tasks can re-verify.

Scope and locked decisions: `docs/product/inklee-2-guestspot-map-scope.md`. Build plan: `docs/product/inklee-2-build-plan.md`.

Severity vocabulary: **blocker** = must be resolved before the affected phase can start; **high** = will cause data damage, security exposure, or user-facing breakage if ignored; **medium** = costs real rework if discovered late; **low** = annoying, cheap to handle early.

## 1. Vocabulary and naming collisions

**[Blocker] The `studios` table is an artist-private address book, not a studio directory.** Every `studios` row (migration `0016_trip_planner.sql`, extended in `0023_studios_google_places.sql`) has `artist_id NOT NULL REFERENCES profiles ON DELETE CASCADE` with owner-only RLS. The same physical studio exists as N duplicate rows across N artists. It is wired into live booking data: `booking_requests.studio_id` + `studio_snapshot`, `trip_legs.studio_id`, `flash_days.studio_id`, the public booking page's location labels, and confirmation/reminder emails (`apps/web/src/lib/booking-studio.ts`). Rows cascade-delete when their owning artist deletes their account. Consequence: 2.0's global seeded/claimed studio entity must be a new table; never promote or overload `studios`. The predecessor worktree's namespacing (`studio_organizations`, `map_locations`, `guest_spot_*`) was designed for exactly this and holds. A nullable link from private `studios` rows to the global entity (via `google_place_id` where present) connects the two worlds later.

**[High] "Guest Spots" the name is already taken and means "artist-managed trip".** The web sidebar and the mobile tab (`nav-config.ts:80,133`, `apps/mobile/src/lib/nav-items.ts`) label the existing `/travel` trip planner "Guest Spots". The calendar legend, dashboard widget, growth metrics ("Guest spot published"), the `MobileGuestSpot` API type, and roughly 11 SEO pages all use the term for the artist-owned feature. 2.0's studio-approved guest spot is a different object with the same name. Decision needed in Phase 0: the 2.0 request flow most likely grows inside the existing Guest Spots surface (see section 4), and shared type names like `MobileGuestSpot` must not be overloaded. The SEO owner URL `/guest-spot-booking` already owns that keyword intent; new indexable pages route through `docs/seo/inklee-seo-strategy.md`.

**Related smaller items:**

- `studios_v2` exists as a paper name in the BM-4.1 business-model proposal. Retire it in favor of the predecessor namespacing when the business-model doc gets its 2.0 revision (medium, see section 8).
- `travel_legs` (migration 0011) plus `booking_requests.travel_leg_id` are dead weight, unused since 0016. Do not reuse the name; optionally drop in a housekeeping migration (low).
- `map` is missing from `RESERVED_SLUGS` (`packages/shared/src/slug.ts`) even though the web route `/map` already exists. An artist can claim the slug `map` today and their path-mode page is shadowed. This is a live 1.x bug; fix it now, and reserve every new 2.0 route segment before shipping (medium).

## 2. The predecessor worktree: reuse, adapt, supersede

Worktree `A:\WORK\inklee-studios-guestspots-map`, branch `feature/local-studios-guestspots-map`, never pushed. Measured divergence: merge-base with master is `9aec1c5` (2026-06-23); the branch has 20 commits since, master has 140. Twelve files were touched on both sides, of which six hard-conflict in a merge simulation: `pnpm-lock.yaml`, `next.config.ts`, and all four extracted map files (the rest, including the `app.inklee` package rename in `apps/mobile/app.json`, auto-merge). Verdict (founder-confirmed 2026-07-17, Q12 resolved): **quarry, do not merge or rebase.** Port modules; treat master as the base everywhere the two overlap.

Per-subsystem verdicts:

**Reuse as-is:**

- `packages/shared/src/guest-spot-fsm.ts` (14-state request FSM: draft, submitted, under_review, information_requested, alternative_dates_proposed, artist_reviewing_proposal, accepted, awaiting_confirmation, confirmed, declined, withdrawn, cancelled, completed, no_show) and `guest-spot-stay-fsm.ts` (confirmed, active, completed, cancelled, no_show). Both are pure, unit-tested, mirror the booking-fsm pattern, and are a superset of 2.0's approve/deny/alternate including the alternate-dates loop. States are cheap; keep the superset.
- The invitation flow (32-byte token, SHA-256 hash stored only, rate-limited accept).
- The public-response shaper pattern (`packages/shared/src/tattoo-map.ts`: `toPublicMapLocation`/`toPublicDestination` as the tested service-role boundary). Its category enum already includes `piercing_studio` and `supply_shop`.
- `workspace-availability.ts` overlap math, repurposed as the overbooking WARNING calculator.
- The FSM matrix-mirror test convention and the design docs (`docs/features/studios-guest-spots-map/` in the worktree) as the design record.

**Adapt:**

- The org/membership model. The worktree models multi-location `studio_organizations` (no unique owner) with 5 roles (owner 40, manager 30, resident_artist 20, guest_artist 10, staff 5) via `studio_role_rank()` and a `SECURITY DEFINER is_studio_member(org, min_role)` helper with date-bounded membership. 2.0 locks one studio per owner. Adapt: add the unique owner constraint and collapse to one location, but KEEP the date-bounded membership helper, because `starts_at`/`ends_at` bounded membership is exactly the mechanism the studio group's 14-days-before to 14-days-after guest window needs.
- `guest_spot_requests` schema: about 80 percent matches the locked submission fields. Missing: a social-link field. Careful: the worktree's `number_of_artists` means artist headcount, NOT 2.0's "expected clients"; add a separate field rather than repurposing. `client_booking_status` (will_open/wont_open/unsure) already matches the "clients still book normally" signal. `guest_spot_proposals` already implements suggest-alternate-dates with supersede logic. `guest_spot_stays.terms_snapshot` jsonb is the existing hook for private pricing sent to requesters.
- Server cores (`guest-spots.ts`, `studio-orgs.ts`, `studio-invites.ts`, `tattoo-map.ts`): already hardened by two adversarial audits (47-agent slice 8, 50-agent slice 13; fixes included stay idempotency via `UNIQUE(guest_spot_request_id)`, server-side org derivation, proposal supersede atomicity).
- The flag pattern (fail-closed literal env reads + `notFound()`), re-homed under the master capability registry rule.

**Supersede:**

- Map rendering. Master's shipped `/map` + native MapLibre stack won (it has been hardened by 140 commits including ME-15). Port only the worktree's map DATA model (`map_locations`, accepting signal, claims) onto master's rendering.
- The S14 mobile screens (`apps/mobile/app/studios/*`): they predate the ME-15 window-class system and must be rebuilt on `Screen`/`AdaptiveSheet`/`ListDetailHost` conventions.

**Hard blockers inside the worktree code:**

- **[Blocker] Overbooking semantics are inverted.** `0055_studio_workspaces.sql` has a GiST EXCLUDE constraint (`studio_ws_assign_no_overlap`) that hard-rejects overlapping confirmed assignments at the database, plus capacity pinned to 1. The locked 2.0 decision is warn, never block. Drop the constraint and the capacity pin on port; compute warnings app-side from the shared overlap math. The worktree's own `KNOWN_LIMITATIONS.md` already sketches this replacement.
- **[High] Migration numbers 0054 to 0058 are taken.** Master has since shipped unrelated migrations under those numbers and is at 0073. Renumber to 0074+ on port. The worktree SQL has also NEVER executed against any Postgres (no local stack existed in that environment); RLS was verified by design and shaper tests only. First port step: run on a local Supabase and verify `pg_policies` live, per the AGENTS.md migration footgun rules.
- **[High] Calendar reflection gap.** A confirmed stay only best-effort inserts a private `artist_destinations` map row. It creates nothing in the artist's actual calendar and there is no studio calendar. 2.0 mandates both. See section 4 for the recommended fix.

**Net-new for 2.0 (zero prototype coverage):** thumbs-up reputation, reports with decay, badges, studio groups (chat, votes, documents, announcements), private blacklist, temporary map posts, watched studios, map filters, anonymous artist counts, the seeding density cap, shops approval workflow beyond categories, studio-owner monetization, and both calendar reflections.

## 3. Map plane

The shipped map slice (prod 2026-06-23) is a keeper as a shell and a dead end as a data plane.

**Keep:** `maplibre-gl` ^5.24 bundled on web with CSP already provisioned; `@maplibre/maplibre-react-native` ^11.3 already inside every shipped binary (config plugin in `app.json`), so new mobile map surfaces are JS-only with no new native deps or store permission changes; the branded hand-authored basemap on mobile (`apps/mobile/src/lib/map-style.ts`, promotable to `packages/shared`); free keyless CARTO tiles; the a11y/injection-guard/popup patterns; the shared-server-loader + `/api/mobile` route architecture.

**Rebuild:**

- **[High] No clustering.** Web renders one DOM element per stop; mobile renders every stop as an RN view with no declutter. Fine for 30 personal stops, collapses at hundreds of studio/shop markers. Rebuild the marker plane as GeoJSON sources + circle/symbol layers with MapLibre's built-in clustering (both platforms support it; mobile already uses GeoJSONSource for route lines).
- **[High] No geospatial query path.** The only feed is load-the-whole-journey-once. `studios.latitude/longitude` have no index of any kind. 2.0's filters (city + radius, date range, style, studio type) and the 5-per-300-km2 cap need a bbox/radius query API backed by PostGIS or earthdistance plus a spatial index in a new migration.
- **[Medium] Access gating and IA.** `/map` redirects to `/travel` unless the artist has travel entries (`hasTravelEntries`), and the analytics collector excludes `/map`. The discovery map must be reachable by every artist with zero prior data. Drop the gate, keep the URL, layer the personal journey as one toggleable overlay.
- **[Medium] Geocoding is web-only with a browser-exposed Google key.** Coordinates only enter via the web Places picker; the mobile API deliberately refuses coordinate writes (injection guard). Admin seeding and owner create/claim need a server-side place-resolution endpoint with a server-held key. Keep the mobile no-client-coordinates rule.
- **[Medium] CARTO free tiles are an unpriced dependency.** Acceptable for the personal journey page; a flagship map that studio subscriptions ride on needs a tile budget decision (open question Q1). The mobile brand style only needs source and glyph URLs swapped; the web should adopt the same authored style, which also removes its style-fetch-and-patch failure mode (low).
- **[Low, history with a standing lesson]** Migration 0023 briefly gave `studios` a public-read policy (`visibility_mode != 'hidden'`), a whole-row grant since RLS cannot hide columns; 0030 dropped it, and today `studios` has owner-only RLS. The lesson binds 2.0: never bolt private fields onto a table that a broad SELECT policy could expose, new entities carry their own RLS, and the house rule since 0030/0031 stands: no anon SELECT policies anywhere; public reads go through serviceClient with app-layer field selection.

## 4. Calendar and booking flow

Facts that shape everything: there is NO appointments table (a calendar appointment IS an approved `booking_requests` row); bookings are date-only; the web calendar aggregates exactly three sources (approved bookings, trip legs as non-interactive cobalt bands already labelled "Guest spot" in the legend, flash days); the mobile calendar API mirrors this with optional fields as the version-skew contract; and NO conflict detection of any kind exists anywhere today (double-booked dates are allowed, trip overlaps produce only a passive notice).

**The single highest-leverage architecture decision:** on acceptance, a 2.0 guest spot should MATERIALIZE a trip + trip_leg pointing at a (map-linked) studio. Seven live pipelines key off trips/trip_legs: calendar bands on both platforms, the booking form's location selector, slot location enrichment, booking auto-tagging, confirmation/reminder email addresses (`resolveStudioForBooking`), the home dashboard widget, and the per-trip request filter. Materializing a leg makes "appears in the artist calendar" and "clients keep booking normally during guest spots" true with almost no new UI, and honors the one-source-of-truth founder rule. A parallel confirmed-stay entity that skips trips would have to reimplement all seven touchpoints.

Consequences of that decision:

- `trip_legs` needs additive columns (nullable `guest_spot_request_id`, `origin`) so a studio-confirmed leg is distinguishable from a self-declared one, and an edit policy: the artist can edit or delete any leg unilaterally today, so a studio-confirmed leg needs locked fields or edits that notify/invalidate the studio side (high).
- The pending (requested, not yet accepted) state should render as a distinct marker, not a second cobalt band; the `CellMarker` union (web) and `MobileCalendarResponse` optional fields (mobile) are the designed extension points (medium).
- The iCal feed (`/api/ical/[token]`) contains only approved bookings; even today's trips never reach external calendars. Extend the feed with trip-leg VEVENTs when guest spots ship (low).

**The studio calendar is the genuinely new build.** Every calendar read path is `artist_id`-scoped with artist-own RLS; there is no studio dimension anywhere. The stay entity needs RLS readable by both parties (artist + studio owner), and a studio-scoped calendar route following the existing dual-source pattern. Do not widen `booking_requests` RLS (high).

**A guest spot request is not a booking_request.** `booking_requests` carries customer email/token, deposit and Stripe columns, and a 5-value status enum whose FSM has no alternate-dates state; `booking_cap`, client aggregations, growth metrics, iCal, and the reminders cron all consume it unscoped. New table, own FSM (the worktree one), extend `humanStatusLabel` and the status-badge map, both of which fall back safely on unknown statuses (medium).

**Copy rule collision:** the concept brief says approve/deny; the founder rule (AGENTS.md, slice 60a) unified in-app verbs to Accept/Pass. Guest spot decision buttons should read Accept / Pass / Suggest dates. Not open for debate in implementation tasks; flagging it here so nobody ships "Approve" (low, but user-visible everywhere).

**Overbooking warnings are greenfield:** the only reusable primitive is `rangesOverlap` (`packages/shared/src/trip-validation.ts`) plus the worktree's availability math. Build as a shared pure derivation module (deposit-state.ts is the exemplar), advisory in the accept path, never a conditional gate (medium).

## 5. Roles, auth, and RLS

- **[Blocker] There is no database role model at all.** No role column, no membership table, no custom claims. Platform admin is an `ADMIN_EMAILS` env allowlist (`apps/web/src/lib/admin-guard.ts`); every signed-in user is an artist by virtue of a self-inserted profiles row. Studio-owner elevation and shop accounts need dedicated tables (the worktree's ownership + membership model is the reviewed starting point). Keep platform admin as it is.
- **[High] The profiles own-row UPDATE policy has no column restrictions.** An authenticated user hitting PostgREST directly can update ANY own-row column, including `is_tester`, `account_status`, and the Stripe state columns. Only `instagram_accounts` ever got column-privilege treatment (0062), and that was SELECT-only. Two consequences: never store role, approval, or reputation flags on profiles (use service-role-only tables, the `account_overrides` pattern from 0045); and this gap is worth closing for the existing columns regardless of 2.0. This is a 1.x security finding, not just a 2.0 constraint.
- **[High] RPC grant footgun:** default privileges grant EXECUTE to anon on every new function; SECURITY DEFINER RPCs must explicitly REVOKE (the 0058/0059 forged-booking incident, fixed in 0060). Every new 2.0 RPC follows the 0060/0068 hygiene.
- **[Medium]** `proxy.ts` bounces any authenticated session without a profiles row into artist onboarding for every artist path. Since studio owners are elevated artist accounts (locked decision), profiles always exists and this mostly resolves itself, but shop accounts need an explicit decision on whether they get profiles rows, and new top-level routes inherit the bounce behavior.
- **[Medium]** Admin MFA step-up only applies when a TOTP factor is enrolled; an admin who never enrolls operates password-only. 2.0 adds moderation queues and blacklist visibility to that surface; make TOTP mandatory for admin emails first.
- **[Medium]** Suspension bans future sign-ins but already-issued tokens work until expiry. Threshold-based moderation actions inherit this latency; status checks belong in the relevant server cores.
- **[Low]** `admin_action_log` targets users only; extend with a target type/id convention for studios, shops, and posts. The `founding_artist_applications` table (0056) is the manual-approval queue template (status workflow, reviewed_by, internal notes, dedup indexes, service-role-only RLS) for claims and shop approvals. Admin moderation is web-only; no mobile admin exists or should be assumed.

## 6. Privacy and consent

- **[High] The artist profile is effectively always public once claimed** (slug NOT NULL, no hide toggle; the only softening is noindex, with an in-code note anticipating an opt-in discovery flag later). 2.0's map presence must be new explicit opt-in columns, defaulting off, never derived from having a slug. Filterable flags belong in real columns, not the settings jsonb grab-bag (which also has documented drizzle drift).
- **[High] Trips consent scope is booking-form-only.** `show_on_booking_form` is consent to show travel to the artist's own clients on their own page. Feeding those rows into cross-artist discovery or anonymous counts silently repurposes that consent. A distinct "show on the artist map" opt-in is required; aggregate counts may only draw from rows carrying the new consent.
- **[High] No style taxonomy exists anywhere** (the only style field in the schema is free text on a marketing table). Map style filters and studio categories need a canonical vocabulary plus junction tables, indexed, not jsonb.
- **[Medium]** `profiles.location` is free text, unusable for city + radius or counts; structured geocoded city columns are new work.
- Deletion cascades: all profile FKs cascade. Reputation, thumbs given, and reports authored by a deleted account need explicit survival semantics (the `deleted_account_records` precedent, 0047) decided with GDPR counsel before schema design; avoid ON DELETE CASCADE on reputation tables (medium).
- The anonymous artist count needs a minimum display floor to avoid deanonymization (Q13, resolved 2026-07-18: floor of 3).

## 7. Storage

- **[High] Every storage convention keys ownership to the artist userId as the first path segment.** The private-bucket RLS policy, account-deletion purge (`purgeStoragePrefix('logos', userId)`), and the delete-path guards all assume it. Studio assets stored under an owner's userId would be silently deleted with the owner's account and stranded on ownership transfer. Adopt a new `studio-media` bucket with `{studioId}/...` paths, ownership resolved via table join, explicitly excluded from the user purge, with its own studio-deletion purge.
- **[High] Seeded or unclaimed studio photos have no legal-safe home:** the only public bucket serves objects instantly and world-readable with no review queue, no takedown tooling, no provenance metadata. Reinforces the Q5 default (no photos on seeded entries). If ever ingesting by URL, reuse the SSRF-hardened pipeline (`instagram-storage.ts`) and store provenance in a metadata table (the `booking_images` shape).
- **[Medium] Per-studio storage caps have zero existing mechanism.** No byte accounting, no prod bucket limits (the real ceiling is Vercel's ~4.5 MB request body). Enforce like goods does: a shared max-photos constant checked server-side plus a DB image-list column as source of truth; record file_size in metadata if byte caps matter.
- **[Medium] Group documents and private pricing are private media, and the only private-storage pattern is images-only.** This is the same gap already blocking support attachments (FU-20). Build the private bucket once, pay off FU-20 with it, and add a non-image branch (no sharp re-encode for PDFs).
- **[Low]** The `logos` bucket is already a five-asset-type grab-bag; do not add studio shapes to it. Min-3-photos means sequential uploads under the body cap (the goods multi-image flow already works this way); validate the minimum at publish time, not upload time.

## 8. Business model and strategy

- **[Blocker] No subscription billing infrastructure exists.** 2.0 monetizes mainly via studio owners, but the entire billing layer is business-model Phase 2 and not started: no plan_tier schema, no Stripe Checkout/Portal subscriptions, no subscription webhooks, no `canAccess()` gate. The only entitlement mechanism is founder comping via `/admin/accounts` (`account_overrides`). Either sequence the billing phase as an explicit 2.0 prerequisite, or launch studio owners free/comped and bill later. Do not hard-code plan assumptions into the role model (this keeps Q8 genuinely open).
- **[Resolved 2026-07-17] "Studio" named two different products.** The roadmap's BM-4.x Studio MVP (25 EUR/month) was multi-artist BOOKING multi-tenancy; 2.0's studio owner is a guest spot host. Founder decision, recorded in `business-model.md` Phase 4: the 2.0 studio owner role redefines the Studio tier, BM-4.x becomes a possible later expansion, `studios_v2` is retired, and pricing timing stays open as Q8. The Phase 5 Studio Pro overlap (guest-artist management, demand analytics) is annotated in that doc so the upsell ladder gets reassigned consciously if Pro ever happens.
- **[Resolved 2026-07-17] 2.0 jumps the written phase gates.** Building 2.0 now overrides the "Solo Plus stable 3+ months and 5+ inbound inquiries" gate. The override is recorded as a strategy revision in `business-model.md` Phase 4 (build-only; the pricing gates and the booking-multi-tenancy expansion gate stand), so future sessions do not treat 2.0 work as violating the gates.
- **[Resolved 2026-07-17] Positioning guardrail:** the "not a marketplace or discovery platform" lines in `inklee-feature-scope.md` and `business-model.md` are now scoped to client-facing discovery (which stays true); the honesty rule of not promising studio features until shipped is unchanged.
- **[Low]** Infra is on free tiers with documented upgrade triggers; min-3-photo studios, group media, and map traffic will hit the Supabase storage/egress caps. Re-read `docs/paid-plan-triggers.md` at build start and budget upgrades into studio pricing.

## 9. Moderation and the DSA procedure

The map's report system lands inside an existing legal procedure (`docs/dsa-moderation-procedure.md`, intake at `/legal/report`), and the collisions are real:

- Anonymous reporting is contemplated in the procedure only for CSAM; ordinary DSA notices require acknowledging the reporter within 24 hours. 2.0's fully anonymous reports have no reporter contact. The likely resolution is two channels: in-product map signals (anonymous, threshold-driven, not DSA notices) and the formal `/legal/report` path for legal notices, with clear escalation from one to the other. This needs counsel confirmation; flagged as open question Q14 (high).
- Showing "this artist has 5 reports" to the artist and the next requested studio, or a warning banner on a studio at 10 reports, is a visibility restriction, which under Art. 17 requires a statement of reasons and a right of redress to the affected user. The threshold mechanics must emit those statements (high).
- Threshold plus decay automation flips the procedure's current "automated means used: no" disclosure (medium).
- The procedure's scope covers only existing surfaces; studio pages, shop entries, and temporary posts are new hosted UGC surfaces that must be added to it, with the records-retention duties (24 months reports, 5 years statements of reasons) applied. The current report register is a spreadsheet; in-product reporting at any volume forces it into the product database, which shapes the `map_reports` data model (medium).
- Update the DSA doc, the report form, and the AUP in the same change (the doc's own §7 sync rule).

## 10. Notifications, email, and realtime

- **[High] The notifications table and NotificationType enum are artist-only and booking-shaped.** Mechanically fine for 2.0's request/decision events (both parties are profiles rows; `createNotification` and the push fan-out work unchanged), but the closed enum, the categories, and both clients' cta routing need additive extension. Group fan-out (N recipients) needs a new bulk write path.
- **[High] Push taps into new surfaces dead-end on installed builds.** The tap-routing allowlist (`PUSH_ROUTABLE_PREFIXES` in `apps/mobile/src/lib/push.ts`) is client-baked, there is no OTA, and old builds live for months. Sequencing is forced: ship screens + extended allowlist in a store build FIRST, then gate server-side push emission on client version (`clientAtLeast`, the pattern already specified in the remote-config plan). Until then, feed rows without pushes, or route taps to `/notifications`.
- **[Medium] Push is hard-coupled 1:1 with the feed and there are no notification preferences.** Every push writes a permanent feed row (never purged, 100-row mobile cap). Chat messages, votes, and watched-studio updates through this pipeline would bury booking-critical notifications. Chat needs its own push path (the sender is trivially generalizable) plus per-category mute preferences before any high-volume type ships. Add a retention sweep for read rows to the cleanup cron.
- **[Medium] Email throttles:** the famous 30/hour limit is Supabase AUTH email only; the transactional Resend path has no aggregate outbound cap, only per-surface rate limits. Guest spot mail should fire on state changes only (mirroring bookings); add a request-submission rate limit keyed on the requesting user (the `makeLimit` pattern).
- **[Medium] Realtime chat is greenfield twice over:** zero Supabase Realtime usage exists anywhere (no channels, no publication config), and the mobile app has no direct client-to-database path at all (bearer REST only, RLS applied server-side). Supabase Realtime adoption means first-time client-facing RLS design and RN reconnect handling; the alternative v1 is a poll/pull thread on the support-ticket model, which matches the app's existing freshness model and ships with zero new infrastructure. This grounds open question Q10.
- **[Low] Scheduled windows** (group access open/close, post expiry, report decay) fit the existing daily-cron + at-most-once marker patterns (`email_lifecycle_markers`, audit_log idempotency rows); daily granularity is sufficient for 14-day and monthly boundaries.

## 11. Mobile

- **[High] The 5-tab chrome is load-bearing:** both nav chromes compute the raised center FAB as `floor(len/2)`; a sixth tab breaks the design. The travel tab ("Guest Spots") should evolve into the 2.0 surface (map, requests, trips inside it) rather than adding a tab. The ME-15 audit already deferred travel master-detail; rebuilding the travel tab is the natural moment to deliver it.
- **[High] No OTA shapes the rollout:** every JS change is an EAS build (~30 min) plus store processing; old builds keep hitting the same endpoints for months. Register 2.0 capabilities (map, guest spots, groups) in the capability registry for kill-switch coverage before shipping; version-gate every response-shape change; batch mobile work into planned checkpoint builds.
- **[Medium] Every new screen must honor the ME-15 contract** (`docs/me15-tablet-audit.md` D1 to D12): Screen with column caps, AdaptiveSheet for modals (theme re-apply + orientation + back handling), gridColumns floors, ListDetailHost + selected-param rules, draft-store for dirty forms. Chat and studio detail are natural ListDetailHost candidates.
- **[Low] Good news:** the MapLibre native module is already in every shipped binary, Android location/camera permissions are deliberately stripped (perfectly aligned with no-live-location; keep city filters as manual geocode input), and photos ride the existing image-picker + multipart pipeline. As specced, the entire 2.0 mobile surface needs NO new native modules; store risk is normal binary review.

## 12. Pre-existing 1.x findings surfaced by this audit

Worth fixing independently of 2.0. Status as of 2026-07-17 evening:

1. **Fixed.** `resolveBookingGuestSpotStudio` queried a nonexistent `slots.flash_day_id` column (silent error, function degraded); it now reads `flash_day_id` from the booking row directly.
2. **Fixed.** `map` was missing from `RESERVED_SLUGS`, and a route sweep found five more live segments equally claimable and shadowed: `goods`, `link-hub`, `notifications`, `forgot-password`, `reset-password`. All six added.
3. **Fixed, applied to prod 2026-07-17 (migration 0074).** Profiles own-row UPDATE/INSERT column-privilege gap (section 5): verified on a local Supabase (full 75-migration replay, 7 behavioral tests as the authenticated role) and then on prod via the management API (exact column sets present, zero residual table-level grants). Note for local dev: `supabase/seed.sql` re-applies platform grants after migrations, so it now carries a mirror of the 0062 and 0074 hardenings; keep future column-privilege migrations mirrored there.
4. **Fixed.** Cover upload error copy said "under 5 MB" while the cap is 4 MB.
5. Open: drizzle schema drift (`first_name`/`last_name` missing from the profiles definition; `icon_color`/`icon_bg` missing from trips/studios definitions). Cosmetic until Drizzle is used against those tables.
6. Open: the mobile flash image route knowingly orphans replaced storage objects ("cleanup is a follow-up", acknowledged debt).

## 13. Summary: the ten decisions Phase 0 must make with this audit in hand

**Status: all ten approved by the founder as working defaults on 2026-07-17.** Any of them can still be reopened, but only with an explicit founder decision; implementation tasks build on these.

1. New global studio entity; never touch the `studios` table semantics (section 1).
2. Quarry the worktree; renumber migrations to 0074+; first-ever live execution on local Supabase (section 2).
3. Drop the overlap-blocking constraint; warnings are app-layer (section 2).
4. Acceptance materializes a trip + trip_leg; additive linkage columns; edit policy for studio-confirmed legs (section 4).
5. Studio calendar as a new read path over the stay entity with two-party RLS (section 4).
6. Roles in dedicated tables; nothing role-like on profiles; close the profiles column-privilege gap (section 5).
7. New consent flags for map presence; never repurpose `show_on_booking_form` (section 6).
8. New `studio-media` bucket with studioId paths; private bucket built once for groups + pricing + FU-20 (section 7).
9. Record the strategy override and the Studio naming reconciliation in the business-model doc (section 8).
10. Two-channel report design reconciled with the DSA procedure, statements of reasons wired into thresholds (section 9).

## 14. Extension risks (added 2026-07-18)

New risks introduced by the sixteen founder-selected extensions. Same severity vocabulary as the rest of this audit.

- **[High] Flash day planner vs the live 1.x flash days feature.** Inklee 1.x already ships artist-owned flash days: `flash_days` (with `studio_id` into the private studios table), `flash_items`, `flash_day_items`, flash booking forms, calendar rendering on both platforms, and capacity RPCs. A studio-organized flash day spans multiple artists and lives on the studio side. Building it as a parallel entity would duplicate the flash pipeline and violate the one-source-of-truth rule; bolting studio semantics onto the artist-owned tables collides with their RLS and ownership. This is the same class of decision as guest-spot-materializes-a-trip-leg, and it is open question Q15, decided before the Phase 6 planner slice starts.
- **[Medium] Shipped 0075 vocabularies need lockstep extension.** Two CHECK constraints already live on prod: `map_reports.reason` (wrong_location, fake_studio, spam, scam, behavior, other) and `location_claims.status` (pending, approved, rejected, revoked). The report context categories replace the first with the ten-value vocabulary, and the claim conflict workflow needs a conflict state in the second. Both are mechanical ALTERs, but each must move in lockstep with the shared module and the admin queue labels in one change, or the admin surface renders raw strings and inserts start failing.
- **[Medium] House rules move from the group to the studio.** The schema proposal placed `house_rules` as text on the group row. The builder makes rules structured, studio-level, and reused by the profile, the group, and the welcome pack. The schema proposal carries the correction (extensions addendum); anyone porting the group tables before Phase 4 should not ship the group-level text field.
- **[Medium] Welcome pack is interaction-plane data with a shop-adjacent field.** Address, access info, wifi, and emergency contact must only ever reach artists with an accepted stay (private storage for any attachments, the Phase 4 bucket). The "nearby supply shops" field stays owner-curated free content; it must not become a shop advertising surface, which would bypass the shop layer's own rules.
- **[Medium] Change tracking is a new unbounded table family.** The contextual feed and what-changed-here need change events on map entities and studio profiles. Without tight retention and contextual scoping this becomes the map's biggest table. The map activity cluster carries the mitigation (pull-only, retention, scoped queries) and the Phase 9 cost audit covers it.
- **[Medium] Story cards leave the platform.** The first 2.0 artifact designed for sharing outside Inklee. The shaper discipline must apply to card content exactly as it does to API responses: no true addresses of approximate studios, no private travel data, consent from both sides where needed. Covered explicitly in the Phase 9 privacy audit.
- **[Low] Stamps inherit the reputation survival questions.** A stamp is a studio-to-artist grant tied to a completed stay, so the same GDPR survival semantics as thumbs (schema proposal section 5, counsel item) apply: what happens on studio deletion, what on artist deletion. Decide alongside the thumbs answer, not separately.
- **[Low] Cockpit scope creep.** The cockpit aggregates data from five phases and will attract dashboard-itis. The guardrail is written into scope 4.2: operational clarity only, no generic analytics. The growth cockpit already owns analytics; the studio cockpit owns action.
- **[Low] Duplicate detector needs fuzzy matching infrastructure.** Similar-name matching wants trigram similarity (pg_trgm) or equivalent; nearby-coordinate matching rides the existing spatial index. An implementation dependency to settle in the detector slice, not a product risk.
- **[Low] Signals stay inside the existing cap.** Temporary studio signals reuse the temporary-post limit (1 per owner per month) and the Q7 open display question. The only new surface is the typed vocabulary; no new abuse surface as long as the cap holds.
