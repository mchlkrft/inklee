# Inklee Tattoo Map — hybrid discovery redesign: audit and implementation plan

Status: audit + plan only, written 2026-07-22. No implementation started; no schema changed. This document is a proposal that sits inside the existing **Inklee 2.0** track (`docs/product/inklee-2-*.md`), not a separate product. Companion sources: `inklee-2-build-plan.md` (9-phase build structure), `inklee-2-guestspot-map-scope.md` (locked scope), `inklee-2-open-questions.md` (Q1–Q20, the founder-decision register), `inklee-2-schema-proposal.md`.

Method: a 26-agent read-only audit of the live codebase (15 auditors over schema/map/styles/guest-spots/nav/security/SEO/a11y, 9 design + adversarial-challenge agents, 2 synthesis agents), verified against migrations 0075–0100 on `master` and the Inklee 2.0 planning docs.

## How to read this

- **Part A — Audit** answers the 20 required audit questions (current implementation through explicit challenges to the spec).
- **Part B — Implementation plan** answers the 24 required planning questions (product direction through files-likely-to-change).
- The numbered `## 1 … ## 20` / `## 1 … ## 24` sections restart between Part A and Part B by design.
- Everything below is grounded in `file:line` / migration / Q-number evidence. Where a spec requirement conflicts with a locked founder decision, it is written as a **decision request**, never as work to be scheduled.

## Executive summary

**This is a redesign of a feature that is already ~60% built, not a greenfield build.** The Tattoo Map is the shipped, flag-gated (`NEXT_PUBLIC_TATTOO_MAP`, default off) Inklee 2.0 discovery surface. Phases 1–4 of the documented build plan have largely landed on `master`: the admin directory + `map_locations`/`styles`/claims schema, the MapLibre artist map shell, the studio-owner cockpit + full claim flow, and the guest-spot request workflow with house rules, welcome packs, and the guest-artist timeline.

The redesign splits cleanly into three buckets:

1. **Safe to build now (presentation + read-model plumbing, ~80% of the value).** Full-viewport canvas, a collapse-to-rail web shell, a right-drawer / bottom-sheet detail panel, URL/deep-link state, reduced-motion, an accessible list alternative, and a **style read-path** over data that already ships write-only. None of this touches consent or data boundaries. It is the natural evolution of the current `discovery-map-client.tsx`.

2. **One mandatory infrastructure fix, regardless of scope.** The viewport query has **no usable spatial index**: the purpose-built GiST-on-geography index cannot serve the raw `display_latitude/display_longitude BETWEEN` predicate the live RPC uses, and there is no btree on those columns. Every map pan full-scans ~71k approved rows, and the uncached count RPC doubles the work. This must be fixed before any density increase or full-viewport "show all pins" mode.

3. **Gated on a founder decision + legal review (the entire "public/hybrid" pillar).** The spec's public map, public studio/artist/city pages, shareable indexable links, and SEO integration **directly reverse a locked decision** — Q3, RESOLVED 2026-07-19: *the map stays logged-in only, noindex, out of the sitemap* — and the strictly-artist-facing audience lock (scope §1/§5). Reopening it is not an implementation call: it needs the SEO strategy owner (ChatGPT, per `CLAUDE.md`), a **licensing re-check** (Q20: seeded names+coordinates are Overture/Foursquare-derived and cleared *only* for the logged-in map), a new public-consent tier for artists, per-IP rate limiting + caching, and a DSA statement-of-reasons writer that does not exist yet — over data that is roughly **17% materially wrong** with **no "verified" tier** in the schema.

**The spec's proposed rollout is roughly inverted from reality.** Its Phase 2 (claim flow, correction/reporting) already shipped; its Phase 3 (public map + SEO) is the blocked part; its Phase 1 (immersive shell + style aggregation) is the real net-new work. Recommended order: immersive shell + client consolidation → perf hardening → style aggregation/filters → trust-surface polish → public (only if Q3 is reversed).

**Three of the spec's premises are factually off and were corrected by the audit:**
- Artist→style linkage **already exists** (`artist_styles`, migration 0076, up to 8 per artist) — it is merely write-only with no read surface. Do not build a parallel system.
- The ME-15 rail primitives the spec assumes can be reused (`NavRail`, `AdaptiveSheet`, `ListDetailHost`, the window-class system) are **React Native only**. Web has none; the sole web `layout.tsx` is an email helper. The web rail is net-new.
- "Resident styles" / "resident artists grouped by style" have **no backing data**: `studio_profiles` is claim/owner-based (`owner_user_id UNIQUE`), not a roster. Only owner-*declared* studio specialties and *anonymized* guest-artist coverage are truthful today.

## Reconciliation with the existing Inklee 2.0 track

| Spec pillar | Status in the current system | Verdict |
|---|---|---|
| Immersive full-viewport map | Boxed `max-w-4xl` / `h-[520px]` widget in document flow | **Genuinely new** — the core of this initiative |
| Collapse sidebar to a rail (keep logo, expandable, non-hover) | Fixed 228px `<aside>`, no collapse/rail/icon-only state; ME-15 rail is RN-only | **New on web** (extend `SidebarItem`; do not assume ME-15) |
| URL / deep-link / restore state | Viewport/filter/selection are `useState` only; reload snaps to Berlin | **New** (prerequisite for share/back/immersive) |
| Map/list toggle + accessible list | No list view anywhere; pins are canvas GL layers | **New** (also the a11y and keyboard path) |
| Studio drawer / bottom sheet | Single reused absolute card; navigate-away `/map/[id]` | **New** presentation over existing detail data |
| Tattoo-style taxonomy | `styles` table (15 keys) + `studio_categories.style_key` + `artist_styles` | **Exists; extend incrementally** — not greenfield |
| "Styles represented" aggregation | No aggregation, no read path; pins carry no style | **New read-model** (on-read shaper, no cache table) |
| Resident-artist style coverage | No residency/membership roster exists | **Deferred** — needs a founder decision + new table |
| Guest-artist style coverage | `guest_spot_stays` + anonymized `getStudioGuestTimeline` (Q16) | **Reuse** — current/upcoming stay anonymized |
| Claim + verification + reporting | Shipped (0079/0098); Claimed/Unclaimed only, no "verified" tier | **Mostly done** — add trust *display*, not mechanics |
| Watchlists / trips overlay | `watched_studios` + journey overlay exist; trips are DB-guarded | **Reuse** — map initiates, never authors trip legs |
| Public map / public pages / SEO | Q3 RESOLVED: logged-in only, noindex, out of sitemap | **Conflicts with locked decision** — decision request |
| Marker encoding (no per-style color) | Category `match` + signal ring; clustering removed 2026-07-20 | **Already aligned** — keep server grid-sampling |
| Personalized recs / watched-area alerts / relationship graph / convention layers | No engine; `studio_signals` already covers `convention_week` | **Out of scope for v1** (speculative overreach) |

## Decisions required from you (founder)

Detailed rationale in Part B §22 and the closing "Highest-risk decisions" list. In priority order:

1. **Public vs private (the single largest fork).** Reverse Q3 and expose a public/indexable surface, or stay logged-in-only? Everything downstream (SEO scaffolding, `LocalBusiness` schema, anon caching, a new public-consent tier, DSA statement-of-reasons wiring, the Overture Q20 re-license) gates on this. **Recommendation: stay private; let the authed beta earn the data quality that would make public safe later.**
2. **Residency roster: build or defer?** It is the only genuinely missing style edge and unlocks honest "resident styles," but opens an attestation/deanonymization question (a lone confirmed resident is identifiable). **Recommendation: defer; ship declared + guest coverage only.**
3. **Name upcoming guest artists publicly, or keep anonymized?** Current/upcoming stays are anonymized unconditionally today (`guest-spots.ts:1144`); naming future whereabouts is a larger consent than `passport_public` covers. A flag decision, not a table.
4. **Accept the spatial-index migration on the live viewport RPC before any density/full-viewport work?** Non-negotiable for scale; it touches the hot query and needs a careful rollout.
5. **Consolidate the two divergent map clients + two basemaps now, or carry the duplication?** Deferring bakes duplicated marker logic into every later slice.

## Founder decisions and revised architecture (2026-07-22)

The five decision requests above are now answered by the founder. This section records them, revises the target architecture to the founder's "one shared map core" directive (superseding the "two disjoint trees" framing in Plan §2/§18 where they differ), and lists the external dependencies the public decision triggers.

### Decisions taken

1. **Public: YES**, framed explicitly as an **experimental project that develops together with the community** (not a finished public directory). This **reverses locked Q3** (which had fixed the map as logged-in only). The experimental/community framing lowers the *product-polish and reputational* bar; it does **not** waive the legal/DSA/SEO prerequisites listed below, which are obligations, not polish.
2. **Residency roster: deferred.** Ship owner-declared studio specialties + anonymized/named guest coverage only. No `artist_studio_membership` table now; "resident styles" does not ship.
3. **Guest artists named publicly by default, with an explicit per-artist opt-out** added in settings. This **updates the Q16 default** (previously anonymized-by-default with opt-in). Artist privacy still always wins: an opt-out anonymizes the artist everywhere on every studio's timeline.
4. **Spatial-index fix: approved**, to be shipped **additive + backward-compatible**, validated in staging, with the current RPC retained until the replacement is verified, and a rollback plan. **No Supabase upgrade is required** (see below).
5. **Architecture: one shared map core with capability layers and multiple shells** (founder directive). The public and logged-in maps are the same technical product with different capability layers, never two map products.

### Revised target architecture: one shared map core

One core, many shells. The public/logged-in/owner split is a **capability layer** around a single core, not a fork. The nine "one X" contracts map to concrete, code-grounded modules:

| Founder contract | Single implementation | Home |
|---|---|---|
| One rendering engine | MapLibre GL JS wrapped once in `MapCanvas` (imperative init encapsulated). Retire the legacy DOM-marker `map-client.tsx`. | `components/map-core/MapCanvas.tsx` |
| One viewport/query contract | `MapQuery{bbox,zoom,filters}` → RPC → `PublicMapPin[] + {capped,total}`; one hook `useMapPins(query)` with debounce + abort. | `packages/shared/src/map-directory.ts` (contract) + `components/map-core/useMapPins.ts` |
| One clustering strategy | Server grid-sample + fair-truncation (0095). No client clustering, ever. | `map_pins_in_view` RPC |
| One marker + layer system | One GeoJSON source + GL layers (points, labels, signal-rings, selected), branded via ME-14 badge shapes. | `components/map-core/MapLayers.ts` |
| One URL-state model | `?bbox=&z=&cat=&style=&guest=`; `replaceState` on pan, `pushState` on selection/sheet detent. One serializer. | `packages/shared/src/map-core-state.ts` + `components/map-core/useMapUrlState.ts` |
| One search/filter state | One `MapFilterState` + reducer; one combobox against `map_search`. Same state drives map and list. | `packages/shared/src/map-core-state.ts` + `components/map-core/MapFilters.tsx`, `MapSearch.tsx` |
| One selected-place model | One `SelectedPlace{locationId, detail}`; never navigates away; drives the detail panel + camera padding; `/map/s/[id]` hydrates it. | `packages/shared/src/map-core-state.ts` |
| One public/private permission boundary | One server resolver `resolveMapCapabilities(session) → MapCapabilities{canWatch,canApplyGuest,canClaim,canSeePersonalOverlays,canSeeNamedArtists,viewerId,...}`; one API handler with `user ? authed : public`, same `toPublicMapPin` shape; personal overlays are a separate authed-only fetch. | `lib/server/map-core.ts` + `api/map/locations` + `api/map/personal` |
| One basemap configuration | `brandMapStyle(scheme)` as the sole source; retire `VOYAGER_STYLE`. Theme-aware. | `packages/shared/src/map-style.ts` |

Shells are thin wrappers that mount `<MapPlatform capabilities={...} layout={...}/>`:

```
Shared map core  (engine · query · clustering · markers · url-state · filter-state · selection · permission · basemap)
├── Public map shell        (public) route · explore/search + sign-in walls · anon API branch · cacheable
├── Logged-in artist shell  (artist) route · + watch · apply-guest · trips overlay · personal overlays
├── Studio-owner shell      artist shell + owner affordances (manage styles/signals/claim) → deep-links to /studio cockpit
├── Desktop layout          full-viewport canvas + right drawer + map/list toggle
└── Mobile/tablet layout    full-bleed canvas + draggable bottom sheet (portrait) / persistent drawer (landscape)
```

The permission boundary is the discipline that makes this safe: **planes 1 (public) and 2 (authed-shared) are the same RPC + `toPublicMapPin`; plane 3 (personal: watch/trips/blocks) is a separate authed-only fetch merged client-side and never SSR-embedded.** A single lint/test asserts the public payload is a structural subset of `toPublicMapPin`.

### Guest-artist public naming (decision 3): data + settings

- **New consent column** `profiles.guest_naming_opt_out boolean not null default false` (named by default; ships with its 0074 column grant + `supabase/seed.sql` mirror in the same migration, per the AGENTS.md rule).
- **New settings toggle** under `/settings/map` ("Show my name on studio guest-artist timelines", default on; off = anonymized everywhere). Mobile parity follows the web slice.
- **Read-model change** in `getStudioGuestTimeline` (`guest-spots.ts`): current/upcoming/past entries resolve name + link **unless** the artist opted out, in which case the entry stays "A guest artist" + dates. This replaces the old unconditional-anonymize-for-current/upcoming behavior and decouples naming from `passport_public` (which keeps its own purpose). The studio's `show_guest_timeline` still gates whether the timeline shows at all; the artist opt-out always wins over it.
- **Safety note (non-blocking):** naming *future* whereabouts publicly by default is the exact exposure the original Q16 protected against. Recommendation: surface the opt-out prominently (in onboarding and the settings page), and consider offering "hide upcoming only" as a lighter option later. Deferred to the founder; default remains named per the decision.
- **Sub-decision still open (flagging, not deciding):** the *artists-in-town* city layer (`map_visibility='listed'`) is a separate opt-in surface consented for the artist-only map. Decision 3 covers guest timelines, not this. Recommendation: on the public plane, artists-in-town stays **counts-only, floored at 3** until you either extend the opt-out model to it or add a public-presence consent. This avoids silently widening a different consent basis.

### Spatial index (decision 4): additive migration plan + the Supabase answer

**No Supabase platform/version upgrade is needed.** PostGIS is already installed (migration 0075) and every function required (`ST_MakeEnvelope`, the geography `&&` bounding-box operator, geography GiST) ships with the PostGIS version already in use. This is a pure schema/RPC change on the existing stack.

**Recommended path (matches "keep the current RPC until the replacement is verified"): reuse the existing dead GiST index via a versioned RPC, behind a flag.**

- The purpose-built index already exists (`map_locations_display_geo_idx`, a GiST over `st_setsrid(st_makepoint(display_longitude, display_latitude), 4326)::geography`) but the live RPC never uses it because it filters raw `display_latitude/longitude BETWEEN`. No new index required.
- Add `map_pins_in_view_v2` (+ `_count_v2`) whose predicate **mirrors the indexed expression verbatim** so the planner picks the GiST: `st_setsrid(st_makepoint(display_longitude, display_latitude),4326)::geography && st_makeenvelope(:west,:south,:east,:north,4326)::geography`, keeping identical grid-sample, fair-truncation (`claim_status='claimed' desc, md5(gx:gy)`), `PIN_LIMIT`/ceiling, and `capped` output. **v1 stays untouched.**
- A server-side flag `map_pins_v2` (default off, fail-closed like `tattooMapEnabled()`) routes `/api/map/locations` to v1 or v2.
- **Staging validation:** `EXPLAIN ANALYZE` confirms a GiST index scan replaces the seq scan; a parity harness asserts v2 returns the same pin set as v1 across sampled bboxes/zooms, **including the antimeridian-crossing case** (v1's split/wrap logic must be preserved in v2, e.g. two `&&` clauses OR'd).
- **Rollout:** flip `map_pins_v2` on in prod after staging passes. **Rollback = flip the flag back to v1 (instant, no schema to undo).** Retire v1 only after a bake period.
- Adversarial verification (correctness + planner-uses-index + parity) runs as a review pass on the migration PR before the flag flips, per the money/hot-path rigor bar.

*Lower-risk alternative if you would rather not touch the RPC at all:* add a partial btree `on map_locations (display_latitude, display_longitude) where moderation_status='approved'` and change nothing else; the existing RPC's `BETWEEN` plan improves automatically. Note: `CREATE INDEX CONCURRENTLY` cannot run inside the transaction `supabase db push` wraps a migration in, but on ~71k approved rows a non-concurrent partial build is sub-second and `map_locations` writes are admin/seed-lane only (never the user hot path), so a brief write lock is acceptable. The GiST-reuse path is recommended because it matches your "replacement verified before cutover" framing and finally activates the index that was built for exactly this.

### External dependencies the public decision triggers (need owners)

Going public is approved, but it pulls in obligations I cannot decide or discharge alone. None block the logged-in core work; all must close **before public seeded data actually goes live**:

- **Overture/Foursquare licensing re-check (Q20) — legal.** Seeded names+coordinates are CDLA-Permissive-2.0 (Foursquare rows Apache-2.0); this is likely fine for public use but needs the actual read + attribution placement before publishing. Owner: founder + counsel.
- **DSA statement-of-reasons writer.** `moderation_statements` is schema-provisioned but has zero writers; a public directory of businesses that did not ask to be listed raises this from provisioned to required (Q14 counsel item). Owner: implementation (me) + counsel sign-off.
- **SEO keyword/page strategy — ChatGPT owns keywords (CLAUDE.md).** Which public pages are indexable, their intents, and canonical ownership route through the SEO strategy owner; I own implementation. Guardrail: do not mint indexable filter-combination pages, and do not cannibalize `/guest-spot-booking`, which already owns that intent. This decision is documented here as a strategy change to be ratified by the SEO owner, not silently executed.
- **Public artist-presence consent** for the artists-in-town layer (the sub-decision above), if it is ever named publicly.

### Revised rollout (public now in scope, still sequenced last)

1. **Shared map core + logged-in immersive shell + client consolidation + URL state** (the foundation everything else layers on). Logged-in only, noindex.
2. **Perf hardening** (the `map_pins_v2` GiST-reuse RPC + flag + count de-doubling). Invisible; prerequisite to density.
3. **Style aggregation + filters** (read-path over `artist_styles` + `studio_categories`; guest coverage; the "styles represented" shaper) + the guest-naming opt-out column/toggle.
4. **Trust surface** (`last_confirmed_at` writer, `possibly_closed`, claimed/unverified badges) + DSA `moderation_statements` writer.
5. **Public shell** (the public capability layer + shell on the same core: anon API branch, plane-1 caching + rate limiting, `(public)` routes, `LocalBusiness`/`Place` schema on claimed studios, generated sitemap) — begins only once the legal/DSA/SEO owners above have cleared their items.

### Proposed first slice (awaiting go)

**Slice 1 — shared map core + logged-in immersive shell.** Stand up `MapPlatform` (the nine contracts as real modules), consolidate the two divergent clients/basemaps onto it, escape the `max-w-5xl` clamp with a route-scoped full-viewport layout, add the responsive detail panel with focus management, the accessible list alternative, URL/deep-link state, and reduced-motion. All logged-in, behind `map_immersive_shell`, flag-gated and fail-closed. This is pure presentation + the core module boundary; it touches no consent surface and no public exposure, so it is safe to build immediately and it is the substrate the public shell later reuses unchanged.



---

# Part A — Audit

This feature is already the documented "Inklee 2.0" track, not a greenfield build. Inklee 2.0 is a fully specified, actively-shipping program with a locked schema, ten approved Phase-0 decisions (collision-audit §13, 2026-07-17), and ~26 migrations (0075–0100) already on master. **DONE:** the admin directory + `map_locations`/`styles`/claims schema (Phase 1, 0075/0077/0082); the artist map shell behind `NEXT_PUBLIC_TATTOO_MAP` (Phase 2, 0076 — clustered/grid-sampled discovery map, `/map`, `/map/[id]`, settings, artists-in-town); the studio-owner cockpit + claim flow (Phase 3, 0078/0079/0081); and guest spots (Phase 4, 0080/0083–0086). **NEW in the redesign:** the immersive full-viewport presentation, the collapse-to-rail web shell, deep-link/URL state, an accessible list alternative, a style read-path over already-collected junctions, and — conflicting with locked decisions — a public/indexable surface. Where the spec asks for the last item, it collides head-on with Q3 (RESOLVED 2026-07-19: map stays logged-in only, noindex, out of sitemap) and the strictly-artist-facing audience lock (scope §1/§5); those are treated below as decision requests, never implementation.

## 1. Current implementation summary

The Tattoo Map is a logged-in-only artist feature living at `apps/web/src/app/(artist)/map/`, gated by `NEXT_PUBLIC_TATTOO_MAP === "true"` (`lib/map-features.ts:11-13`, fail-closed default off). It renders through two divergent clients behind that flag: `discovery-map-client.tsx` (the Inklee 2.0 discovery map, flag ON — the redesign's real baseline) and `map-client.tsx` (the legacy personal travel/journey map, flag OFF fallback). The page is document-flow: `page.tsx:92` clamps content to `mx-auto max-w-4xl ... p-4 sm:p-6`, and the map itself is a fixed-height rounded card (`h-[420px] ... sm:h-[520px]`, `discovery-map-client.tsx:576`) — a boxed widget, never a viewport canvas.

Data flows viewport-first: `moveend` → 300 ms debounce → `fetch("/api/map/locations?bbox…")` with antimeridian-safe lng wrapping and `AbortController` cancellation. The server grid-samples one representative studio per zoom-sized cell and returns a `capped`/`total` payload; the client re-slices the last fetch for filter chips without refetching. Selection opens an absolutely-positioned bottom card (not a dialog, not a route); detail navigates away to the SSR route `/map/[id]` (noindex, logged-in only). Supporting surfaces: `/settings/map` (presence + styles), `/studio` (owner cockpit), `/admin/map` (moderation, seeding, claims, reports, duplicates). All reads go through `serviceClient` behind the auth gate; RLS-bypassing service-role reads are shaped by tested `@inklee/shared/map-directory` functions (`toPublicMapPin`, `aggregateArtistCities`).

Country seeding (a separate operational lane) is paused at 16 countries / ~71k approved studios per founder (2026-07-22).

## 2. Existing reusable components

### Web (directly reusable or extend-in-place)
- `apps/web/src/app/(artist)/map/discovery-map-client.tsx` — the MapLibre discovery client (GL-layer pins, viewport fetch, filter chips, artists-in-town + journey overlays, bottom selection card). The redesign extends this, not replaces it.
- `map-search-box.tsx` — debounced (180 ms) autosuggest against `/api/map/search`, working ArrowUp/Down/Enter/Escape keyboard nav (needs ARIA combobox roles added).
- `packages/shared/src/map-style.ts` — `brandMapStyle(scheme)`, the self-authored branded vector style over CARTO's free OpenMapTiles source; plus the legacy `VOYAGER_STYLE` path.
- `components/app-shell/sidebar.tsx` + `sidebar-item.tsx` + `nav-config.ts` (`SIDEBAR_NAV`) — the 228px fixed sidebar. `SidebarItem` already renders icon + label + active rosa left-bar + badge; a collapsed icon-only variant is a modest prop addition (hide `<span>{label}</span>`, add tooltip).
- `components/feature-intro-modal.tsx`, `appointment-drawer.tsx` — ESC + backdrop dismiss patterns (but neither traps or restores focus; there is no shared web focus-trap primitive).
- `packages/shared/src/inklee-icon-art.ts` (ME-14 tattoo-badge system, `currentColor`) — the branded marker-shape source.

### Mobile (RN — NOT portable to web)
- `apps/mobile/src/components/AdaptiveSheet.tsx` — the canonical bottom-sheet (compact-vs-centered via `useLayoutClass()`, `onRequestClose` = Android-back/Escape close, RN modal theme re-apply).
- `apps/mobile/src/components/{NavRail.tsx, layout/ListDetailHost.tsx}` + `apps/mobile/src/lib/layout.tsx` — the ME-15 window-class 600/900 system. **These are React Native only.** The brief's assumption that they exist on web is wrong; the sole `apps/web/src/lib/layout.tsx` is `email/layout.ts`.
- `apps/mobile/app/(tabs)/travel/map.tsx` — the mobile map (`@maplibre/maplibre-react-native`, DOM-backed `<Marker>`s).

## 3. Current map technology and limitations

Engine is **MapLibre GL JS** (`maplibre-gl ^5.24.0`, `apps/web/package.json:54`), driven imperatively via `new maplibregl.Map(...)` with no React wrapper; CSS is bundled, not CDN, so CSP needs no script-src exception. No mapbox-gl, react-map-gl, leaflet, or deck.gl anywhere.

Discovery renders pins as **native GL layers**, not DOM markers: GeoJSON source `"pins"` → `circle` layer `pin-points`, `symbol` layer `pin-labels` (minzoom 10), rosa `signal-rings` (minzoom 12); category color via a `match` expression. `cluster: false` explicitly (`:222`) — the founder removed all client clustering 2026-07-20; density is server grid-sampled instead. Legacy `map-client.tsx` uses DOM `maplibregl.Marker` teardrops + itinerary `line` layers — a fundamentally different marker model and a different basemap (CARTO Voyager JSON vs the branded vector style). Both depend on remote CARTO tiles + glyph fonts (external hosts; no self-hosted tiles). A style lab at `dev/map-style/` is where the founder tuned colors 2026-07-20.

**Limitations vs an immersive redesign:**
- Boxed `max-w-4xl` + `h-[420/520px]` widget blocks a full-viewport canvas; the whole layout is document-flow.
- No app-shell primitives: no collapse rail, no right drawer, no mobile bottom sheet. Selection is one reused `max-w-sm` absolute card for both studio and city.
- No URL/deep-link state: filter, selection, viewport live in React `useState`; reload resets to `center:[13.405,52.52], zoom:3`. Only `/map/[id]` is addressable.
- No `prefers-reduced-motion` guard anywhere in the map dir; `easeTo`/`flyTo` durations are unconditional. Only search triggers `easeTo` (800 ms); filters re-slice, selection opens a card — the camera is otherwise static.
- Two divergent clients + two basemaps behind the flag; the redesign must consolidate or inherit duplicated marker logic.
- External CARTO tile/glyph dependency (CSP/offline-resilience risk for a heavier experience).
- Imperative single-init `useEffect([])` with ref-threaded state makes drawer/rail/sheet coordination and camera-to-selection sync non-trivial to retrofit.

## 4. Current navigation and responsive behavior

The web artist shell (`(artist)/layout.tsx:99-129`) is a single flex container: `Sidebar` + a content column (`WorkspaceTopBar` + `<main>`), with `MobileTopBar`/`MobileBottomNav` siblings. `<main>` is clamped `mx-auto w-full max-w-5xl px-4 pb-28 pt-20 md:px-8 md:pb-12 md:pt-6` — every artist page including the map is width-clamped and heavily padded, floating inside a `md:rounded-[28px]` light "workspace card" on a dark shell.

The sidebar is `hidden md:flex w-[228px] shrink-0` — **no collapse, rail, icon-only, or width-variant state.** Nav is data-driven from `SIDEBAR_NAV` (two groups; `children` sub-nav inline-expands only when the parent route is active); the Tattoo map + Studio entries are flag-gated (`Compass`/`Building2` icons). Responsiveness is plain Tailwind with a single `md:` (768px) breakpoint — **no JS window-class system, no `useWindowDimensions`, no provider** on web (those are RN-only, ME-15). Below `md`, the sidebar/top-bar vanish and `MobileBottomNav` (a fixed 5-tab pill with a raised center FAB) takes over. The map is **not** in the mobile bottom nav — on phones it is reachable only by route.

Critically: there is **no public/unauthenticated map route or public shell.** All map surfaces are under `(artist)/`, `admin/map/`, or `api/map/`. `proxy.ts` (Next 16's renamed middleware) gates only literal `ARTIST_PATHS` prefixes — **`/map` is not in that list**, so map auth comes entirely from the `(artist)` layout/page/API, not middleware. Any refactor moving the map out of `(artist)` breaks that coupling silently.

## 5. Current studio schema

There are **two disjoint studio systems**; the redesign must not conflate them. Legacy `studios` (0023, artist-owned, booking-linked, its own `visibility_mode` enum, public anon-SELECT RLS) is the old per-artist address, NOT the map. Inklee 2.0 `map_locations` + `studio_profiles` (0075–0100, RLS-locked, service-role writes) is the live directory the redesign builds on.

**`map_locations`** (0075, extended 0078/0090) — the shared map object: `source` (`inklee_seed`/`owner_created`/`claim_converted`), `category` (`tattoo_studio`/`private_studio`/`piercing_studio`/`supply_shop`/`other`), `name`, true `latitude`/`longitude`, rendered `display_latitude`/`display_longitude`, address fields, `google_place_id` (unique partial dedupe key), `website_url`, `instagram_handle`, `claim_status` (`unclaimed`/`claim_pending`/`claim_conflict`/`claimed`), `moderation_status` (`pending`/`approved`/`hidden`/`removed`, **fail-closed default pending**), `is_seed`, `seed_region_bucket` (~300 km² density cap), `last_confirmed_at`, `studio_profile_id` FK (`ON DELETE SET NULL`). 0090 added first-class `phone`, `opening_hours`, and a `seed_metadata` jsonb envelope — **email deliberately kept in metadata jsonb, never a column** (spam surface). The GiST spatial index is on the **display** position.

**`studio_profiles`** (0078) — owner data layer: `owner_user_id` (**UNIQUE + NULLABLE** = one studio per owner, survives owner deletion), `name`, `slug` (unique, reserved for a future `/studio/<slug>`, **not routed in v1**), `description`, `vibe`, `logo_path`, address fields, `address_visibility` (`exact`/`approximate`), `guest_spot_status`, `publication_status` (**never client-settable**), `settings jsonb` (holds `social_links`), `show_guest_timeline bool` (0085, default false). Trigger `studio_detach_on_owner_loss` reverts the map location to `unclaimed` and suspends the studio on owner loss. Publish gates (`packages/shared/src/studio-profile.ts`): logo + ≥3 photos + description + address-or-approximate + **≥3 distinct categories** (`MIN_STUDIO_CATEGORIES=3`, `MIN/MAX_STUDIO_PHOTOS=3/12`).

Supporting tables: `studio_categories` (0078, polymorphic — style/standard/custom under a CHECK), `studio_photos` (private `studio-media` bucket; logo at `{studioId}/logo.webp` — **no separate cover-image concept**), `studio_house_rules` (0081, 10 typed keys), `studio_welcome_packs`/`welcome_pack_files` (0083/0086, interaction-plane — readable only with a `confirmed`/`active` stay), `studio_signals` (0092, one per owner per calendar month). All FK `studio_profiles` `ON DELETE CASCADE`.

**Gaps:** no structured amenities table (only 7 flat `standard_key` booleans + free-text); no cover image; no structured supply-shop linkage (`supply_shops` is free text, no FK/proximity join); per-field public/private granularity absent (`moderation_status` + `address_visibility` only); `slug`/`/studio/<slug>` reserved but unbuilt.

## 6. Current artist schema

A `profiles` row (origin `0000`) is keyed `id = auth.uid()`: `slug` (UNIQUE NOT NULL — the single public identity), `display_name`, `instagram_handle`, `bio`, `logo_url`, `timezone`, `location` (freeform), `settings jsonb`, `booking_mode`. Later: `first_name`/`last_name` (0012); `account_status` + soft-delete columns (0020 — all public reads filter `account_status='active'`).

**Map-presence columns (0076, all consent-gated, 2026-07-17):** `map_visibility` (`off`/`city_only`/`listed`, default off), `looking_for_guest_spots`, `passport_public` (grant deferred to 0084), `map_city_label`/`map_city_place_id`/`map_city_lat`/`map_city_lng`, `travel_map_consent` (deliberately separate from `trips.show_on_booking_form`). Constraint `profiles_map_visibility_needs_city`; partial index on `map_visibility <> 'off'`. Also created: `artist_styles(artist_user_id, style_key→styles.key, PK composite)` (own-row `FOR ALL` RLS), `watched_studios`, `account_blocks`.

**Column-privilege hardening (0074):** table-level UPDATE/INSERT revoked from anon/authenticated, re-granted per an explicit column allowlist (PostgREST-with-own-JWT bypassed app validation). Hard rule: **any new user-writable profiles column must extend these grants in the same migration and mirror `supabase/seed.sql`** — new artist fields are not free.

**There is no public artist profile.** `[slug]/page.tsx` is a booking form (header + request form / books-closed + waitlist), `robots:{index:false, follow:true}` (founder 2026-06-16, "templated and thin at scale"); `[slug]/hub` is likewise noindex. No styles, no "artists in town", no guest-spot signal on this page. `artist_styles` is read/written in exactly one place — `settings/map/` — and surfaced nowhere public (not on `[slug]`, not in `/api/map/artists`, which never selects styles). So artist→style linkage **exists in schema + settings UI but is not consumed by any read/discovery surface** ("will power map filters" is future tense in the form copy).

## 7. Existing style taxonomy or tags

The canonical vocabulary is a Postgres table `styles` (0075) mirrored 1:1 by `STYLE_SEED` in `packages/shared/src/map-directory.ts:96` (a standing sync hazard). **The entire column set is `key text PK, label text, position int, created_at`** — no `slug`, `description`, `parent_key`, `aliases`/`synonyms`, `localization`, `active`, `icon`, or `color`. `position` exists but **is read nowhere** (both UIs iterate array order). 15 seeded keys: `blackwork`, `fine_line`, `traditional`, `neo_traditional`, `realism`, `japanese`, `tribal`, `dotwork`, `geometric`, `watercolor`, `new_school`, `lettering`, `portrait`, `ornamental`, `trash_polka`. `styles` is RLS-enabled with **zero policies** (service-role only) — the public style-filter vocabulary must be served via a server route, never a direct anon SELECT.

**The mandate's premise that no artist↔style edge exists is wrong.** `artist_styles` (0076) is that edge — normalized, own-row RLS, written by `updateMapPresenceAction` (≤8 keys, loss-free upsert-then-delete-stale). It is **write-only** from a product standpoint: no read path surfaces it. Studios declare styles via `studio_categories` stored as **`kind='standard'` + `style_key`** (a subtle quirk any new writer/reader must respect), distinctness enforced by three partial-unique indexes; a studio can publish with zero styles by picking 3 standards/customs. Public pins carry **no style** — `toPublicMapPin` emits only `{id, name, category, lat, lng, city, country, claimed, signal}`; the viewport API filters only `category`. Mobile has zero style references.

**Gaps:** no taxonomy metadata (aliases/parents/localization/active); no aggregation layer for "styles represented"; no declared-vs-aggregated distinction anywhere; `position` is dead; the DB/`STYLE_SEED` duplication must be kept in lockstep.

## 8. Current guest artist and guest spot relationships

Two trip models coexist. **1.x self-entered travel** (0016): `studios` (artist-owned free-text places), `trips` (`show_on_booking_form` = consent-to-show-clients, **not** map consent), `trip_legs`. **2.0 real-world places:** `map_locations` + `studio_profiles`. The 1.x `studios` table has no link to `map_locations`; only guest-spot stays bridge them (`guest_spot_stays.studio_profile_id → map_locations.studio_profile_id`).

`guest_spot_requests` (0080) is **artist→studio only** (no studio-initiated invite path exists in schema or code). 14-state FSM (`draft … confirmed … completed/no_show`); `guest_spot_requests_one_open_idx` enforces one live request per artist per studio. Companion tables: `guest_spot_proposals`, `guest_spot_private_notes`, `studio_blacklists` (owner-only SELECT so a blocked artist can't detect the hold). **No client INSERT/UPDATE/DELETE policies anywhere** — all writes go through service-role cores after party checks. On confirmed acceptance, `finishAcceptance` upserts one `guest_spot_stays` row and materializes a `trips`+`trip_legs` pair with `origin='guest_spot'`; DB triggers block the authenticated role from mutating guest-spot legs. Stay FSM: `confirmed→active→completed` (+`cancelled`/`no_show`), advanced by `runStayLifecycleSweep`.

**The guest-artist timeline is a read model, not a table.** 0085 adds only `studio_profiles.show_guest_timeline bool`. `getStudioGuestTimeline` splits `current`/`upcoming`/`past` over `guest_spot_stays` — it records artist + dates, but **current/upcoming entries are anonymized unconditionally** ("A guest artist"); only `past` entries resolve a name/slug, and only when `passport_public=true`. Naming future whereabouts is flagged as a **pending founder consent decision** (`guest-spots.ts:1144-1147`).

`watched_studios` (0076) binds to `map_locations.id` (the public entry), **not** `studio_profiles` — a location without a claimed profile can still be watched. Own-row `FOR ALL` RLS, never exposed to the studio.

**Key gap:** there is **no residency/membership model** — `studio_profiles` is claim/owner-based, not a roster. Guest style coverage is derivable (`guest_spot_stays × artist_styles`); resident coverage is not modeled at all.

## 9. Current public/private route architecture

Three defense layers, all authed. **Page gate:** the map is `/map` in `(artist)`; `(artist)/layout.tsx:26` redirects unauthed to `/login` and sets `robots:{index:false,follow:false}`; the map page and `/map/[id]` re-check and are noindex. **Middleware nuance:** `proxy.ts` gates only literal `ARTIST_PATHS` — `/map` is **not** among them, so map auth lives entirely in the layout/page/API. **API gate:** all three handlers (`/api/map/locations`, `/artists`, `/search`) require a user (401 otherwise), call `tattooMapEnabled()` first (404 when off), and read via `serviceClient` shaped by `@inklee/shared/map-directory`.

The public-page template is `[slug]`: served on `inklee.app/<slug>` and `<slug>.inkl.ee` (via `proxy.ts` host rewrite), `serviceClient` filtered by `account_status='active'`, deliberately **noindex, follow** with a canonical to the preferred URL. Subdomain traffic is "strictly public-only" — `proxy.ts` skips the auth gate and app cookies live on `inklee.app` (a different registrable domain) so they don't flow to `*.inkl.ee`.

SEO surfaces: `sitemap.ts` emits only `MARKETING_ROUTES` (~23 hand-curated pages; "ONLY public, indexable pages belong here"); `robots.ts` disallows `/api/`, `/admin`, app surfaces, `/request/`, auth — but **`/map` is not disallowed** (it relies on the layout noindex + login redirect). `next.config.ts` already whitelists MapLibre/CARTO in CSP.

**A hybrid public surface cannot live under `(artist)/`** (its layout hard-redirects anon). It needs a new `(public)` route group on `inklee.app`, following the `[slug]` pattern, and the API handlers would need an anon branch (`user ? authedPayload : publicPayload`) rather than 401.

## 10. Existing claim and verification workflow

The claim flow is **already shipped (0079)**. Two coupled enums, all transitions admin-gated: `map_locations.claim_status` (`unclaimed → claim_pending → claim_conflict → claimed`) is a derived badge; `location_claims.status` (`pending/approved/rejected/revoked`). A claimant only ever creates a `pending` claim via the rate-limited `submitClaimCore` (service-role INSERT only — 0079 deliberately withholds a client INSERT policy so PostgREST can't bypass the rate limit); `pendingCount >= 2` flips the location to `claim_conflict`. Admins approve/reject via `decideClaimAction`; **approval is the only transition that assigns an owner** — it mints a `studio_profiles` row, links `studio_profile_id`, sets `claim_status='claimed'` under a `.neq('claim_status','claimed')` race guard, and auto-rejects sibling claims. Eligibility: any signed-in user with no existing owned studio ("one studio per owner"), valid social link + address, location `approved` and not `supply_shop`; `claimant_role` is captured for review only.

**"Verified by Inklee" does not exist as a concept** — no `verified` column, no `verified_by`/`verified_at`. Trust is expressed only via `claim_status` + `is_seed`: the detail page computes `unverified = is_seed && !claimed` and shows an "Unverified listing… compiled from public map data" notice; the only badges are **Claimed / Unclaimed** (`claim_conflict`/`claim_pending` are not publicly surfaced).

Reports/corrections share `map_reports`, split by reason: abuse (`wrong_location, fake_studio, spam, scam, behavior, other`) vs data-quality (`closed, outdated_details`, 0098). `submitMapCorrection` writes `status='new'` with 25/day + one-open-per-pin caps; reporter identity is stored for abuse control, never exposed. Admin surfaces (`admin/map`, `requireAdmin`) cover claims, reports (`reviewed`/`dismissed` only — the enum's `actioned` is never set), duplicates, and the seeding lane; every action writes `admin_action_log`.

**Gaps:** the spec's trust labels don't map cleanly (no `verified` tier, no `community` tier — everything unclaimed is seed); `closed`/`outdated_details` corrections have **no automated pin effect** (they land as reports needing manual review — no `possibly_closed` location state); `revoked` and `actioned` are dead enum values; **DSA statement-of-reasons is schema-provisioned but never written** (`moderation_statements` has zero writers) — a public launch raises that exposure.

## 11. Seeded data provenance and confidence model

Provenance is split across two fields: `source` (`inklee_seed`/`owner_created`/`claim_converted`) records origin; `claim_status` records ownership; `is_seed` is an independent boolean. Moderation is fail-closed (`moderation_status` default `pending`; only `approved` renders). Seeds are not raw provider hits — a lead pipeline sits behind each: `map_seed_candidates` (0082, uncapped leads, own lifecycle) → automated `decision` enum + `decision_confidence` (0–100) + `decision_evidence` jsonb + `ruleset_version` (0087) → country orchestration (`map_coverage_runs`/`_units`/`_tasks`/`_discoveries`, 0088), where raw provider hits land pre-filter with `assignment_method`/`assignment_confidence` (low/medium/high) and `retention_class`.

**Confidence is multi-layered but coarse and whole-record:** candidate `confidence_score`, automated `decision_confidence`, discovery `assignment_confidence`. **There is no per-field confidence or per-field verification anywhere.** Contact enrichment rides `phone`/`opening_hours` columns + the `seed_metadata` jsonb envelope (0090); email stays in metadata, never a public column.

**Data source (correcting a common assumption):** studio facts come from **Overture Maps + OSM Overpass** (ODbL / Overture CDLA, attribution carried on candidates). **Brave Search is discovery-only** — but note this is a pipeline convention, not a DB constraint (`map_coverage_discoveries.provider` and `map_seed_candidates.source_type` both still list `brave_search`). Dedup: unique indexes on `lower(source_url)` and `(source_type, source_provider_id)`; fuzzy `duplicate_confidence`; one map row per `google_place_id`. Category false-positive defense: `packages/shared/src/seed-countries.ts` ships per-country language quality gates whose `qualityFixtures` must reject beauty/PMU businesses in local languages (ruleset currently 2026-07-22.6).

Retention (0093): `seed_retention_plan()`, `prune_coverage_discoveries()`, `compact_seed_evidence()` — all **manual** (admin-lane), NOT wired into the retention-purge cron. Staleness is partly instrumented: 0098 cites ~1-in-6 materially stale; `scripts/ghost-detect.cjs` flags DNS-dead domains into `map_reports` (conservative, ~19% of seeds with a website).

**Gaps:** `last_confirmed_at` is **dead metadata** — read on `/map/[id]` but **written nowhere**, so no freshness signal is actually maintained; no per-field verification; closure detection is thin; staleness figures (~25% stale / ~17% materially wrong) are prose, not queryable columns; Brave-as-discovery-only is convention, not enforced; retention functions are manual, so unbounded growth risk returns if a rollout resumes.

## 12. Current map query and clustering behavior

`GET /api/map/locations` is auth-gated + flag-gated. It parses a bbox (`parseMapBBox`) and clamped `zoom`, then fires two `serviceClient.rpc` calls in parallel: `map_pins_in_view` (the sample) and `map_pins_in_view_count` (raw in-view total). The pins RPC (0095, superseding 0094) is `language sql stable security invoker`: computes a grid cell `greatest(360.0/power(2,zoom+5), 0.0002)°` (~19 km at country zoom, ~300 m in a city), filters on `moderation_status='approved'` and raw `display_latitude/longitude BETWEEN`, buckets by `floor(lng/size), floor(lat/size)`, keeps `rn=1` per cell (**claimed wins the cell**), then **fair-truncates** by `order by (claim_status='claimed') desc, md5(gx:gy)` `limit least(p_limit, 5000)` — so pins are stable across pans (no corner-clipping) and claimed pages are never dropped. `PIN_LIMIT=3000`; `capped = total > pins.length` drives a "zoom in" banner.

This is server grid-**sampling**, not clustering — every populated cell is represented, zoom halves cell size to reveal more; the founder removed client clustering 2026-07-20. **Category filtering is post-sample JS** on a single `category` text column (`category ? all.filter(...) : all`), so a filtered view can return far fewer than one-per-cell. Signals decorate the sampled ids. Search (`/api/map/search` → `map_search`, 0097) uses pg_trgm + unaccent with two GIN trigram indexes. The artists layer (`/api/map/artists`) has no viewport filter — one whole-map response, `.limit(10000)` to defeat the PostgREST 1000-row ceiling, block-filtered both ways, floored per city.

## 13. Performance risks

**The purpose-built spatial index is dead for the live query.** 0075 creates `map_locations_display_geo_idx` as a GiST over `st_makepoint(display_longitude, display_latitude)::geography`, but `map_pins_in_view`/`_count` filter the **raw `display_latitude`/`display_longitude` columns with plain BETWEEN**, and there is **no btree on those columns.** Postgres cannot use a geography GiST for a btree range predicate, so every `moveend` runs a full scan of the ~71k approved rows through the moderation index + window function + sort — and the uncached count RPC **doubles the work.** There is **no caching anywhere** (`runtime='nodejs'`, no `revalidate`, no `Cache-Control`, service-client reads bypass the data cache/CDN).

Fixes, in order: (1) add `btree(display_latitude, display_longitude)` **or** rewrite the RPC to `ST_MakeEnvelope(...) && st_makepoint(...)::geography` to finally use the GiST — non-negotiable before any density increase or full-viewport "show all pins"; (2) keep the 0095 grid-sample + fair-truncation (do **not** re-add client clustering the founder removed); (3) drop or cheapen the count RPC (compute "capped" from a `>limit` probe); (4) move style/category filtering **into the RPC before sampling** (post-sample JS on a single `category` column returns sparse/empty pins and can't scale to multi-style); (5) list mode needs a **separate distance-sorted query** (`ORDER BY geo <-> point`) — the only place the GiST index would finally be useful. Client debounce (300 ms) + `AbortController` cancellation already exist and stay. A public/anonymous surface additionally needs a cacheable un-authed variant since every route currently 401s anon with zero caching.

## 14. Security and privacy risks

**RLS posture is fail-closed and consistent.** Two patterns: service-role-only zero-policy tables (`map_locations`, `moderation_statements`, `map_reports`, `location_claims` writes, `map_duplicate_suggestions`, `studio_signals`, `styles`) and owner/party SELECT-only with service-role writes (`studio_profiles`, `studio_categories`/`photos`, the whole guest-spot stack). The only truly client-writable map tables are `artist_styles`, `watched_studios`, `account_blocks` (own-row `FOR ALL`). Column-privilege hardening is thorough (0074/0076/0079 — e.g. `location_claims` revokes `reviewed_by`/`reviewed_at` from claimants; `passport_public` grant held until its write site ships in 0084). **IDOR review is clean** — every core resolves ownership from `auth.uid()`, never a client id. Boundary shapers fail closed: `toPublicMapPin` returns `null` unless `approved` + finite coords and emits **only display coords** (true lat/lng never selected); `aggregateArtistCities` enforces consent, the `MIN_ANON_ARTIST_COUNT=3` floor, listed-vs-counted split, and bidirectional block exclusion that never dents counts.

**Risks for a hybrid public surface (all BLOCKERS/HIGH):**
- **Every read path is auth-gated by design; the shapers are safe to expose but the routes are not** — going public removes the gate whose only abuse control *is* the gate.
- **Artist-identity consent basis changes.** `map_visibility='listed'` was consented for an *artist-only* surface (2026-07-17). Serving `slug`/`display_name` to anonymous visitors re-purposes that consent — needs a fresh public-presence consent tier.
- **Block filtering and the anonymity floor assume a logged-in viewer.** Anon requests have no `user.id`, so `account_blocks` exclusion silently can't apply — named artists would bypass blocks entirely. Public presence must be counts-only until a new tier exists.
- **No rate limiting on the read RPCs** — abuse is bounded only by the auth requirement; `map_search` fires per keystroke. Public exposure needs explicit per-IP limits + caching.
- **SSR leak vectors:** `(artist)/map/page.tsx` embeds viewer `journey` (trips) and `watchedIds`; the detail page embeds guest-spot timelines and watch state. A public SSR payload must strip all viewer-scoped data.
- **`map_city_lat/label` are self-asserted, range-checked only** — worth validating before a public directory.

## 15. Accessibility gaps

The web map is **canvas-only**: pins are GL `circle`/`symbol` layers, not in the DOM, so they are unreachable by keyboard or screen reader. The container is a bare `<div aria-label="Tattoo map">` — one generic label, no role, no live region, no per-marker labels, no keyboard path to select a pin (selection fires on `map.on("click")`, mouse/touch only). **There is no list view** — the single biggest gap; the only keyboard route to a pin is the search box. The selection card is an absolutely-positioned div, **not** a dialog: no `role="dialog"`, `aria-modal`, focus move/restore, or ESC-to-close (only a `✕` button). Filter chips are real `<button>`s but signal state by background color only — `aria-pressed` is on the "My trips" toggle but **not** on the category/watched/signals chips.

The search box has working ArrowUp/Down/Enter/Escape but **no ARIA combobox wiring** (no `role="combobox"`, `aria-expanded`, `aria-controls`, `role="listbox"`/`option`, `aria-activedescendant`) — a screen reader gets a plain textbox with no announcement of results. **There is no shared web focus-trap primitive** (`feature-intro-modal`/`appointment-drawer` hand-roll ESC; neither traps or restores focus). **Reduced-motion is nearly unimplemented** — `globals.css` scopes `prefers-reduced-motion` to exactly one rule (`.animate-hero-float`); MapLibre `easeTo`/`flyTo` and the spinner ignore it.

Mobile is stronger: `AdaptiveSheet` gives Android-back/Escape close and a trips-list alternative, but RN `<Marker>`s lack `accessibilityLabel`/`accessibilityRole`, targets are 26×26 (below 44 pt), and reduced-motion is unhandled. Web has no `env(safe-area-inset-*)` usage at all — the redesign's mobile-web map must add it. The public surface has **zero existing a11y baseline** (the map is auth-gated today).

## 16. Inconsistencies with current Inklee patterns

- **Brief assumes ME-15 web primitives (`NavRail`, `AdaptiveSheet`, `ListDetailHost`, window-class 600/900, `layout.tsx`).** These are **React Native only**; web has none. Any "reuse the rail" plan is mistaken about platform.
- **Brief assumes no artist↔style edge.** `artist_styles` (0076) already ships — it is the edge, merely write-only. Build the read path; don't reinvent.
- **Spec's "resident styles" / "styles represented" per-artist claims** have no backing data — there is no residency roster. Only owner-declared studio categories and anonymized guest coverage are truthful.
- **Public/SEO pillar contradicts locked Q3** (logged-in only, noindex, out of sitemap, RESOLVED 2026-07-19) and the strictly-artist-facing audience lock (scope §1/§5). CLAUDE.md's SEO source-of-truth rule (ChatGPT owns keywords; `/guest-spot-booking` already owns that intent) forbids minting indexable pages while Q3 holds.
- **Maximal "immersive density"** conflicts with the seed density cap (5/300 km², hard rule) and approximate positioning / no-live-location locks.
- **Multi-location studio ambitions** conflict with one-studio-per-owner (`owner_user_id UNIQUE`).
- **Re-adding cluster bubbles** would reverse the founder's deliberate 2026-07-20 removal of client clustering.
- **Copy rules** (AGENTS.md): no em-dashes in user-visible strings, sentence case, Accept/Pass verbs, brand vocab in `status-labels.ts` — the redesign's new copy must comply.
- **Everything is flag-gated (`NEXT_PUBLIC_TATTOO_MAP`, default off) and mobile trails web.** Redesign work must land as flagged slices on master, never a long-lived branch (the quarried studios/guest-spots worktree is the cautionary precedent).

## 17. Technical debt to resolve first

1. **Spatial index / query hot path (blocks scale).** Add the btree (or RPC envelope rewrite) and address the doubled, uncached count RPC before any density increase or full-viewport mode. §13.
2. **Two divergent map clients + two basemaps.** Consolidate `discovery-map-client.tsx` and legacy `map-client.tsx` (GL-layer pins vs DOM markers; branded vector vs Voyager JSON) or inherit duplicated marker logic forever. Retire `map-client.tsx`.
3. **No URL/deep-link state.** Viewport/filter/selection are `useState`-only; reload snaps to Berlin/zoom-3. Deep-linkable state is a prerequisite for sharing, back-button, immersive routing, and crawlable pages.
4. **`<main>`'s `max-w-5xl` + heavy padding fights full-bleed.** Needs a route-scoped layout override, not negative-margin hacks.
5. **No shared web dialog/focus-trap primitive.** Build one (role/aria-modal/focus move+restore/ESC/trap) before the drawer/bottom-sheet work; every current modal hand-rolls ESC.
6. **`last_confirmed_at` is a dead column** read on the detail page but written nowhere — either wire writers (claim/correction/ghost-detect) or stop rendering a freshness claim it can't back.
7. **Style read-path missing.** `artist_styles` + `studio_categories.style_key` are indexed but write-only; the style filter and "styles represented" need the read path + RPC predicate.
8. **`styles`/`STYLE_SEED` duplication** must be kept in lockstep in any migration touching the vocabulary.
9. **Manual retention functions** (0093) are not on a cron — a rollout resume reintroduces unbounded growth.
10. **Reduced-motion is one CSS rule** — gate all camera animations.

## 18. Proposed target architecture (summary — details in the plan doc)

Split the surface into two trees. **Immersive app map (logged-in, noindex, honors Q3):** stays inside `(artist)/` but escapes the `max-w-5xl` clamp via a route-scoped layout; routes `/map`, `/map/[country]`, `/map/[country]/[city]` (camera-preset URLs over one canvas, not separate documents), and `/map/s/[locationId]` (in-canvas selection replacing the navigate-away `/map/[id]`). **Crawlable public pages (CONFLICTS with Q3 — decision-request only):** a new `(public)` group on `inklee.app` (`/studios/[slug]`, `/tattoo-studios/[city]`, `/guest-spots/[city]`), each requiring founder + SEO-owner Q3 reversal, the Q20 Overture licensing re-check, `robots.index:true`, `MARKETING_ROUTES` entries (IndexNow foot-gun), and `LocalBusiness`/`TattooParlor` JSON-LD over **claimed** studios only.

**Three response planes, one shaper:** public (anon, CDN-cacheable, `toPublicMapPin` shape + floored counts), authed-shared (login-gated richness, still viewer-independent, cacheable), personal (`watched_studios`/journey/blocks — `private, no-store`, SSR-stripped, merged client-side only). Planes 1–2 use the same RPC + `toPublicMapPin`; plane 3 is a separate fetch.

**Shell:** entering `/map*` collapses the 228px sidebar to a ~64px persistent, explicit-toggle rail (icon-only `SidebarItem` variant, mark-only logo, flyout popovers for `children`), width driven off the flex parent so `<main>` reflows; exit restores the prior route + full sidebar. **Interaction:** desktop full-viewport canvas + floating search/filters + a map/split/list segmented toggle + a right drawer with `easeTo({padding:{right}})`; mobile a three-detent draggable bottom sheet with back-button interception and `env(safe-area-inset-bottom)`; tablet branches on `matchMedia('(orientation: portrait)')`. **Markers:** two real states (claimed = filled brand mark; unclaimed/seed = hollow/muted) + the existing signal ring + selected enlargement, branded via the ME-14 badge shape on the `brandMapStyle` basemap — no per-style colors, no invented "verified" tier. **Style model:** zero new style tables in v1 — read `artist_styles`, read `studio_categories.style_key`, derive guest coverage from `guest_spot_stays × artist_styles`; wake `position`; add taxonomy columns one at a time behind a live reader; a `map_location_styles` rollup + RPC `p_styles` predicate only when style filtering ships. **Migrations:** the spatial index; RPC style predicate; a `last_confirmed_at` writer; `moderation_statements` writer + `possibly_closed` state (public phase); `profiles.public_directory_consent` + `studio_profiles.cover_image_path` (public phase, each with its 0074 grant + seed mirror). **Rollout:** (1) immersive shell + client consolidation, (2) perf hardening, (3) style aggregation + filters, (4) trust-surface polish, (5) public surface — decision-gated, never scheduled. Flags: keep `NEXT_PUBLIC_TATTOO_MAP` master; add `map_immersive_shell`, `map_style_filters`, server-side `map_public` + `map_public_pages` (routed through the capability-plane kill-switch), `map_claim_v2`.

## 19. Alternatives considered

- **Add a collapse-to-rail mode vs give the immersive map its own chrome-less route.** A full-bleed map does not need the sidebar narrowed; it needs it *absent*. A distinct route with a minimal layout and one "back to app" affordance is the smaller path and cleanly separates the eventual public variant (which can't live under `(artist)/`). The rail is deferred polish. **Chosen direction:** distinct immersive route; icon-only `SidebarItem` variant later.
- **Evolve `/map` in place vs a distinct route/shell.** In-place fights the `max-w-5xl` clamp with fragile negative margins and reloads the shell on detail nav. A distinct route forces the URL-state work — which is a feature (share/back-button), not a cost.
- **Rich taxonomy now vs extend `styles` incrementally.** Aliases/synonyms/parents/localization have **no consumer** today (both writers are closed chip pickers over 15 keys). Building them now models a matching problem that doesn't exist. **Chosen:** the 15-key closed vocabulary as the v1 spine; add columns behind a live reader; a `style_aliases` side-table only when the seed pipeline needs style-mapping over unclaimed studios.
- **`studio_aggregated_style` cache vs on-read shaper.** The drawer renders one studio at a time; declared styles are a tiny junction select and guest coverage is a bounded (10/10/8) join. On-read is sufficient and always-fresh; a materialized rollup is justified **only** for map-wide style *filtering* (keyed to `map_locations.id` so seeds have zero rows). **Chosen:** on-read for drawers; narrow rollup only if/when filter chips ship.
- **Client clustering vs server grid-sampling.** The founder removed clustering 2026-07-20; the 0095 fair-truncation model (deterministic hash, claimed-win, stable across pans) is the right primitive for full-viewport. **Chosen:** keep server sampling; do not re-add cluster bubbles.
- **Simultaneous map/split/list vs toggled map⇄list.** Split forces a second synced viewport + the new list query up front. A toggled list is the non-negotiable accessibility fallback and reuses the panel rows; split is a later enhancement. **Chosen:** toggled modes for v1.
- **Image-based style inference vs declared-only.** Deferred — inferring style from unverified Overture/OSM seeds (~17% wrong, no owned imagery, no DSA pipeline, no `verified` tier) manufactures confident claims and a moderation-liability surface. **Chosen:** declared-only, forever until claim/correction loops mature and counsel clears imagery.
- **Public-first vs private-first.** Private-first uses the authed beta as the data-quality flywheel (claims + corrections + ghost-detect) until a claimed subset is safe to expose. **Chosen:** private-first; public is a Q3-gated proposal.

## 20. Explicit challenges to this specification

1. **Public studio/artist/city pages (indexable).** *Problematic:* directly contradicts locked Q3 (RESOLVED 2026-07-19: map stays logged-in only, noindex, out of sitemap) and the strictly-artist-facing audience lock (scope §1/§5). *Evidence:* no public map/studio/city route exists; `[slug]` artist pages are deliberately noindex since 2026-06-16; `moderation_status` is fail-closed; ~17% of seeds are materially wrong; Overture CDLA needs a Q20 re-review before public use; `moderation_statements` (DSA) has zero writers. *Better alternative:* keep private; earn data quality through the authed beta, then expose a claimed/verified subset only. *Tradeoff:* forgoes compounding SEO. *Blocks:* **YES** — requires founder + SEO-owner Q3 reversal + Q20 re-check before any implementation.

2. **Public map (client-facing).** *Problematic:* "a client-facing version is out of scope for this entire planning phase" (scope §5). *Evidence:* all three map routes 401 anon; comments assert "the map is not client-facing." *Better alternative:* logged-in immersive map now; public map only behind an independent server flag (`map_public`) after Q3 reversal. *Tradeoff:* no anonymous discovery at launch. *Blocks:* **YES** (same lock as #1).

3. **Named public artist presence.** *Problematic:* `map_visibility='listed'` consent was given against a non-client-facing surface; `account_blocks` filtering keys off `auth.uid()`, which is null anon — named artists would bypass blocks entirely. *Evidence:* `aggregateArtistCities` block exclusion is viewer-relative; the anonymity floor is `MIN_ANON_ARTIST_COUNT=3`. *Better alternative:* public presence is counts-only, floored at 3, until a new `public_directory_consent` tier exists. *Tradeoff:* no named artists publicly at first. *Blocks:* **YES** for named exposure; counts-only does not block.

4. **"Resident styles" / per-artist "styles represented".** *Problematic:* asserts a roster that doesn't exist. *Evidence:* `studio_profiles` is claim/owner-based (`owner_user_id UNIQUE`), not a roster; no artist↔studio residency table anywhere. *Better alternative:* ship only owner-declared "studio specialties" (`studio_categories`, no count) and anonymized "guest artist styles" (`guest_spot_stays × artist_styles`, floored counts); reserve "resident styles" behind a future roster + founder decision. *Tradeoff:* less breadth. *Blocks:* **YES** for a resident-style rollup (no backing data); does not block the declared/guest split.

5. **A new `artist_guest_appearance` table.** *Problematic:* parallel system. *Evidence:* `guest_spot_stays` (0080) already holds artist × studio × dates × status, and `getStudioGuestTimeline` already splits current/upcoming/past. *Better alternative:* reuse it; resolve only the naming-consent decision (`guest-spots.ts:1144-1147`) as a flag. *Tradeoff:* upcoming guests stay anonymized until that decision. *Blocks:* no.

6. **A cached `studio_aggregated_style` table for the drawer.** *Problematic:* optimizes a query nobody runs while the real hot path (`map_pins_in_view` full scan) is uncached. *Evidence:* drawers render one studio; the timeline is hard-limited 10/10/8. *Better alternative:* on-read shaper; a `map_location_styles` rollup only for map-wide filtering. *Tradeoff:* style *filtering* waits for the rollup + RPC change. *Blocks:* no.

7. **Proficiency / confidence / "primary style" per artist.** *Problematic:* no source column to populate — any value is fabricated. *Evidence:* the three confidence signals are whole-record seed-pipeline judgments about whether a studio is real, never per-style skill; `artist_styles` PK is composite/unordered; `position` is dead. *Better alternative:* represent only claim *provenance* ("declared by artist / studio", "brought by a guest"). *Tradeoff:* no ranking UI. *Blocks:* **YES** for proficiency values (fabrication); provenance labels do not block.

8. **Rich style taxonomy (parents/aliases/synonyms/localization/active) now.** *Problematic:* no consumer — both writers are closed chip pickers over 15 keys; the surface is logged-in-only. *Evidence:* `styles` is `key/label/position/created_at`, RLS with zero policies. *Better alternative:* keep the 15-key spine; wake `position`; add `active`/`parent_key`/`description` one at a time behind a live reader; `style_aliases` only when the seed pipeline needs style-mapping. *Tradeoff:* later backfills + `STYLE_SEED` lockstep. *Blocks:* no (deferral is safe).

9. **Reuse ME-15 `NavRail`/`AdaptiveSheet`/`ListDetailHost`/window-class on web.** *Problematic:* those are React Native only. *Evidence:* the sole web `layout.tsx` is `email/layout.ts`; the web shell is a fixed 228px `<aside>` with no collapse state; responsiveness is plain Tailwind `md:`. *Better alternative:* build a chrome-less immersive route (no rail) first; add an icon-only `SidebarItem` variant later. *Tradeoff:* less global-nav persistence in map mode (mitigated by an exit control). *Blocks:* no.

10. **Immersive as a shell state on `/map`.** *Problematic:* fights the `max-w-5xl` + `pt-20/pb-28` clamp; the current map only survives by staying a `max-w-4xl` boxed widget. *Evidence:* `page.tsx:92`, `discovery-map-client.tsx:576`. *Better alternative:* distinct route with a route-scoped layout override. *Tradeoff:* selection/viewport state must survive the transition — forcing the URL-state work (a feature). *Blocks:* no.

11. **Re-adding cluster bubbles for "immersive" density.** *Problematic:* reverses a deliberate founder decision. *Evidence:* clustering removed 2026-07-20; `cluster:false`; server grid-sampling with fair truncation replaced it. *Better alternative:* keep server sampling; let claimed pins win cells; use the "zoom in" banner. *Tradeoff:* no expand-on-zoom cluster UX. *Blocks:* no (and re-adding it is discouraged).

12. **Full-viewport "show all pins" on the current query.** *Problematic:* every pan full-scans ~71k rows + window + sort, doubled by the count RPC, uncached. *Evidence:* the GiST geography index can't serve raw-lat/lng BETWEEN; no btree exists. *Better alternative:* add the btree (or `ST_MakeEnvelope && geog` rewrite) and cheapen/cache the count **before** full-bleed. *Tradeoff:* the index rewrite touches the hot RPC and needs a careful migration. *Blocks:* **YES** — full-viewport at country zoom without the index is a linear-scan-per-pan regression.

13. **Per-style marker colors.** *Problematic:* pins carry no style; a color-per-style scheme has no data. *Evidence:* `toPublicMapPin` emits no style; the RPC filters only `category`. *Better alternative:* style changes relevance/visibility (filter), not marker color; keep the category `match` expression, encode claimed-vs-unclaimed by shape/fill + the existing signal ring + selected enlargement. *Tradeoff:* less at-a-glance style scanning (offset by chips). *Blocks:* no.

14. **A four-tier claimed/neutral/selected/verified marker scheme.** *Problematic:* invents a "verified" tier the data can't back. *Evidence:* no `verified` concept exists — only `claim_status` + `is_seed`; the detail page's only badges are Claimed/Unclaimed. *Better alternative:* two real states (claimed vs unclaimed/seed) + signal ring + selected state. *Tradeoff:* fewer visual classes. *Blocks:* **YES** for a "verified" marker until a verified tier is actually built.

15. **`closed`/`possibly-closed` as a rendered map state.** *Problematic:* corrections have no automated pin effect today. *Evidence:* `closed`/`outdated_details` land as `map_reports(status='new')` needing manual review; there is no `possibly_closed` location state; `revoked`/`actioned` enum values are dead. *Better alternative:* add a `possibly_closed` `moderation_status` path + writer if the redesign needs it (public phase). *Tradeoff:* new enum + core + admin wiring. *Blocks:* no (additive) — but don't render a state that doesn't exist.

16. **"Add to trip" from map pins.** *Problematic:* would fork the guest-spot materializer. *Evidence:* trip legs are created only via `finishAcceptance → guest_spot_stays`, DB-guarded against client mutation; direction is artist→studio only (no invite path). *Better alternative:* map actions deep-link into the existing guest-spot request flow; the journey overlay stays read-only; `watched_studios` keeps its one-call star. *Tradeoff:* no one-tap trip authoring. *Blocks:* no (provided every map action is a link-out, not a new writer).

17. **New third-party product analytics / rich per-event props.** *Problematic:* breaks a documented commitment and the PII-in-props ban. *Evidence:* three first-party registries only (no Segment/pixel); `PRIVATE_PREFIXES` includes `/map` (a public map on `/map` would be silently dropped); zod `.strict()` forbids ids/free text; watch/add-to-trip are private travel intent. *Better alternative:* route anon map behavior to `web_analytics_events` (coarse enum props), authenticated milestones to `analytics_events` (server-recorded), never private travel to Plausible; carve `/map` out of `PRIVATE_PREFIXES` or use a distinct public path. *Tradeoff:* coarser analytics. *Blocks:* no, but leaking a studio id/name/coords into props is forbidden.

18. **Programmatic filter-combination indexable pages (`/tattoo/[city]/[style]`).** *Problematic:* near-infinite thin URLs that cannibalize `/guest-spot-booking`, which already owns that intent, and the IndexNow foot-gun auto-submits anything added to `MARKETING_ROUTES`. *Evidence:* `sitemap.ts` is a 23-URL hand-curated allowlist feeding IndexNow; the strategy's one-intent/one-owner rule forbids thin pages. *Better alternative:* if public ever opens, lead with a small set of claimed-studio pages (self-canonical) + a segmented generated sitemap; filter combinations stay canonicalized-to-parent or noindex; city pages lag studio pages. *Tradeoff:* slower keyword coverage. *Blocks:* **YES** while Q3 holds (and any premature `MARKETING_ROUTES` entry is a live legal leak).

19. **`LocalBusiness`/`TattooParlor` schema on seeded studios.** *Problematic:* structured-data-quality penalties + defamation/"fake studio" exposure on ~17%-wrong, unclaimed, unverified rows with no DSA statement-of-reasons pipeline. *Evidence:* no `LocalBusiness` helper exists (`lib/jsonld.ts` has Org/WebSite/WebPage/FAQ/SoftwareApplication only); DSA `moderation_statements` never written. *Better alternative:* emit schema only for **claimed** studios once the claim/correction loop matures and counsel clears it. *Tradeoff:* narrower rich-result coverage. *Blocks:* **YES** for unclaimed seeds.

20. **Social-network overreach (residency graph, convention layers, personalized recs, watched-area notifications).** *Problematic:* speculative schema ahead of proven demand. *Evidence:* no residency/membership model; `studio_signals` already covers `convention_week`; `watched_studios` is a private bookmark with no notification engine; direction is artist→studio only. *Better alternative:* v1 = declared artist styles + declared studio categories + the anonymized guest timeline + existing signals; defer roster, recs, and watched-area alerts to a Phase 5+ that has a roster table to stand on. *Tradeoff:* the map is less "social" at launch. *Blocks:* no (additive) — but building it now invents schema ahead of demand.

**Single highest-risk decision the founder must make:** whether to reverse Q3 and go public. Everything downstream — SEO scaffolding, `LocalBusiness` schema, anon caching, a new public-consent tier, DSA statement-of-reasons wiring, and the Overture Q20 re-review — is gated on it, and it trades a compounding growth asset against legal/reputational exposure on data that is ~17% wrong. Recommendation: keep it private, and let the authed beta earn the data quality that makes public safe.

---

# Part B — Implementation plan

## 1. Recommended product direction

Ship the **immersive Tattoo Map as a logged-in, artist-facing product** built on the existing Inklee 2.0 discovery plane (`discovery-map-client.tsx` + `map_pins_in_view` + `toPublicMapPin`). Do **not** ship a public/indexable map, public studio pages, public artist pages, or city SEO pages in this initiative. Those directly conflict with two locked decisions: **Q3 RESOLVED (2026-07-19): the map stays logged-in only, noindex, out of the sitemap**, and the **strictly artist-facing audience lock** (scope §1/§5). Treat the public pillar as a founder + SEO-owner decision request, not an implementation track.

The redesign is 80% presentation and read-model plumbing over shipped schema, and 20% net-new. Concretely:

- **Presentation (net-new UI over existing data):** full-viewport canvas, collapse-to-rail shell, right-drawer/bottom-sheet detail, URL/deep-link state, reduced-motion, and an accessible list alternative. None of these touch consent or data boundaries.
- **Read-model plumbing (surface what already ships write-only):** `artist_styles` (0076) and `studio_categories.style_key` (0078) exist, are indexed, and are surfaced nowhere. Adding the read path plus a "styles represented" shaper unlocks the locked filter list (scope §4.13) with no new consent basis.
- **One mandatory infra fix regardless of scope:** the viewport query has **no usable spatial index** (GIST-on-geography vs raw lat/lng `BETWEEN`), so every pan full-scans ~71k approved rows twice, uncached. Fix before any density increase.

The single sharpest discipline: **the map initiates flows, it never duplicates them.** Watch is one `toggleWatchAction`; trips materialize only via `finishAcceptance` → `guest_spot_stays` (DB-guarded against client mutation); guest-spot requests are artist→studio only. Every map action is a link-out.

**Explicit position vs the spec:** the spec front-loads public reach and "rich style taxonomy / aggregation." The evidence dissolves both. Style is not greenfield (two edges already ship); the only missing edge is residency, which stays deferred. Public-on-seeded-data ships ~17%-materially-wrong records to the open web through the IndexNow foot-gun with no DSA statement-of-reasons pipeline. Recommend private-first; let the authed beta earn the data quality that would make public safe later.

## 2. Information architecture

Two disjoint trees, never overloaded onto one route:

- **Immersive app map (this initiative).** Lives inside `(artist)/`, behind `(artist)/layout.tsx` auth + `tattooMapEnabled()`, noindex, honoring Q3. This is where all the work lands.
- **Crawlable public pages (decision-gated, NOT built now).** A future `(public)` route group on `inklee.app`, outside `(artist)/`. Documented in §3 as a proposal only.

Within the immersive map, the IA is a single canvas with three overlay planes and one detail surface:

1. **Canvas** — MapLibre GL, branded vector basemap (`brandMapStyle`), server grid-sampled pins.
2. **Search overlay** — promoted to a real ARIA combobox (`map-search-box.tsx`).
3. **Filter overlay** — chip row (category/watched/signals/trips today; style/guest-available added).
4. **Mode toggle** — map / list (split deferred).
5. **Detail surface** — a responsive panel (right-drawer desktop, bottom-sheet mobile), rendering in-canvas, replacing today's navigate-away `/map/[id]`.

Nav IA is unchanged and locked: web sidebar is flat (Slice 60a); the mobile 5-tab FAB-at-center chrome is load-bearing (collision-audit §11), **no sixth tab**. The map is not in `MobileBottomNav`; on phones it is reached via routes/links. The rail is a **web-shell presentation change**, not an IA change.

## 3. Route plan

**Immersive (build now, logged-in, noindex):**

| Route | Purpose | Notes |
|---|---|---|
| `/map` | Canvas home | Escapes the `max-w-5xl` `<main>` clamp via a route-scoped layout |
| `/map/[country]` | Camera preset | URL is a bbox/camera state over one canvas, not a separate SSR document |
| `/map/[country]/[city]` | Camera preset | Deep-links a viewport; no per-city list page |
| `/map/s/[locationId]` | Selection | `pushState`; replaces today's `/map/[id]` navigate-away; renders into the detail panel |

Query params carry viewport + filters: `?bbox=&z=&cat=&style=&guest=`. Viewport writes use `history.replaceState` (no history flooding on pan); selection and sheet detent use `pushState` so Back closes them before leaving `/map`.

**Public (CONFLICTS with Q3/§5 — proposal only, do not implement):**

`/discover` (city index), `/tattoo-studios/[city]`, `/studios/[slug]` (reuses reserved-but-unrouted `studio_profiles.slug`), `/guest-spots/[city]`. These require: founder + SEO-owner reversal of Q3, the Q20 Overture CDLA re-license check, per-page `robots.index:true`, `MARKETING_ROUTES` entries (auto-feed `sitemap.ts` + IndexNow), and `LocalBusiness`/`TattooParlor` JSON-LD over **claimed** studios only. `/guest-spot-booking` already owns that intent; do not cannibalize it. The public **map** itself stays out of scope (§5); only these document pages are the SEO surface.

**Never** let `?style=`/`?radius=` permutations mint indexable URLs. Canonicalize filtered views to the bare city page and noindex the rest (one intent, one owner URL).

## 4. Desktop interaction model

- **Full-viewport canvas.** Break the boxed `h-[520px]`/`max-w-4xl` widget; render edge-to-edge under a route-scoped layout that drops the `max-w-5xl px-4 pt-20 pb-28` clamp.
- **Floating overlays:** search combobox top-left; filter chips top-left/center; a **map / list** segmented toggle top-right (split deferred, §5 of the challenge digest).
- **Selection opens a right drawer**, not the current bottom card. Critically, the camera **eases with padding, not cover**: `map.easeTo({ padding: { right: DRAWER_W } })` so the selected pin stays visible beside the drawer.
- **List mode** = a focusable `<ul role="list">` of the server-sampled in-view studios, each row a link/button that drives `easeTo` and opens the drawer. This is both the accessibility path and the keyboard path to markers (pins are canvas layers, unreachable otherwise).
- **All camera animation gates on `prefers-reduced-motion`** (`duration:0` when reduced). Today only one CSS rule honors the preference; MapLibre `easeTo`/`flyTo` ignore it.
- **Rail:** entering `/map*` collapses the 228px sidebar to ~64px (see §2 shell and the digest). Exit restores the previous route and the full sidebar.

## 5. Mobile interaction model

- **Full-bleed canvas** with a **draggable bottom sheet in three detents:** peek (search + result count), half (in-view studio list — the accessible list alternative web lacks entirely today), full (studio detail).
- **Back-button intercepts the sheet first:** each detent/selection is a history entry, so browser Back collapses full → half → closed before leaving `/map`. Mirror RN `AdaptiveSheet`'s free `onRequestClose` behavior, which web does not get for free.
- **Non-gesture alternative required:** explicit expand/collapse and close buttons alongside the drag, for keyboard and motor accessibility.
- **Apply `env(safe-area-inset-bottom)`** — no web file uses safe-area today; the mobile-web map needs it added.
- Pins remain canvas layers, so the **list is the keyboard/screen-reader path** to selection.
- The map is not in `MobileBottomNav` and there is no rail concept on phones; the map is a route reached via links.

## 6. Tablet interaction model

Branch on **orientation, not just width** via `matchMedia('(orientation: portrait)')`:

- **Portrait:** phone model — draggable bottom sheet over full canvas.
- **Landscape:** desktop model — persistent right drawer, optional split later.

The **same selection state feeds either presentation**, so rotation does not reset the selected studio or the camera. This reuses the single responsive panel primitive (§7) rather than forking desktop/mobile detail components.

## 7. Studio drawer content hierarchy

Build **one responsive web panel primitive** (right-drawer ≥ `md`, bottom-sheet below) with real focus management (`role="dialog"`, `aria-modal`, `aria-labelledby`, focus move-in, focus restore to the invoking marker/list-row, ESC, trap). Web has no shared focus-trap today (every modal hand-rolls ESC); reuse the ESC + backdrop patterns from `feature-intro-modal.tsx`/`appointment-drawer.tsx` and add the trap/restore they lack. Render detail **in-canvas** from the existing `/map/[id]` server data-shaping, not a navigate-away route.

**Compact preview (peek/bottom card):**
1. Name, category chip, city.
2. Trust badge: **Claimed / Unclaimed**, plus "Unverified listing" when `is_seed && !claimed` (per `map/[id]:113`). There is **no "verified" tier** in the schema, do not invent one in copy.
3. **Top 2–3 styles**, ranked declared-first then guest-by-count, each tagged with provenance ("studio specialty" / "guest"). If none (the typical seed case), **omit the row entirely** — never render an empty or "no styles" state a viewer could read as "generalist."
4. Watch toggle + "View details".

**Expanded drawer:**
1. Header; address (display/approximate per `address_visibility`, always display coords, never true lat/lng); website, Instagram handle, `phone`, `opening_hours` (0090 first-class). **Email stays in `seed_metadata` jsonb, never surfaced** (spam surface). Do not render a "last verified" claim — `last_confirmed_at` is written nowhere today.
2. **"Styles represented"** section split into labeled sub-groups so provenance is unmissable:
   - **Studio specialties** — declared `studio_categories.style_key`, no count.
   - **Guest artist styles** — active/upcoming, anonymized aggregate, counts only at/above `MIN_ANON_ARTIST_COUNT=3` ("Realism · 3 visiting guests"); below the floor, drop the number ("Watercolor · guest artist visiting").
   - **Recently hosted** — completed stays; name the artist only if `passport_public=true`.
   - One-line disclaimer: "styles reflect the studio's declared focus and visiting guest artists; not every artist works in every style."
   - **No "resident styles" block** — no residency roster exists; the label is not truthful and must not ship.
3. House rules (`studio_house_rules`), signals (`studio_signals`), guest-spot status, guest-spot request link-out.

## 8. Artist and style interaction model

**Correction to the spec's premise:** the artist↔style edge already exists. `artist_styles` (0076, composite PK, own-row `FOR ALL` RLS) is written by `updateMapPresenceAction` (≤8 keys, loss-free upsert) and surfaced **nowhere** publicly today. The work is a read path, not new schema.

- **Artist styles surface only under consent:** an artist's styles appear only when `map_visibility in ('city_only','listed')` (or a future public-consent flag). Reuse the consent basis; do not invent a bypass.
- **Guest coverage** is derived from `guest_spot_stays × artist_styles`, respecting the anonymity gates: current/upcoming are **anonymized unconditionally** (`getStudioGuestTimeline`, `guest-spots.ts:1144`); only `past` entries name the artist, and only if `passport_public=true`. Naming upcoming guests is a **pending founder consent decision** (Q16-adjacent), resolve as a flag, not a table.
- **Residency is not modeled.** No artist↔studio roster exists; `studio_profiles` is owner/claim-based (`owner_user_id` UNIQUE). "Resident vs guest style coverage" is greenfield and deferred.
- **No proficiency, no primary/ordinality, no skill rating.** All three schema confidence signals (`confidence_score`, `decision_confidence`, `assignment_confidence`) are whole-record seed-pipeline judgments about whether a studio is *real*, never per-style quality. Represent only **provenance of the claim** ("declared by artist," "declared by studio," "brought by a guest"). The one cheap ordering win is to **wake `position`** (add it to `artist_styles`, order chips by it) since `styles.position` is dead today.
- **Copy discipline:** adopt "styles represented" verbatim (the codebase already frames `studio_categories` as "categories the studio represents"). Avoid "specialty/proficiency/primary" language, sentence case, no em-dashes.

## 9. Filter architecture

The locked filter list (scope §4.13) is: city+radius, date, guest-spot-available, style, studio type, private room, workstation. Category/watched chips ship today; the rest gate on later-phase data or the RPC change below.

**The scaling defect:** category filtering is currently a **post-sample JS filter** on a single `map_locations.category` text column (`route.ts:93`), applied *after* the grid sample, so a filtered view can return far fewer than one-per-cell pins. Multi-style has no query path at all: `studio_categories.style_key` is keyed to `studio_profile_id` (claimed studios only), not to `map_locations`.

**Fix:** move filtering **into `map_pins_in_view` before grid-sampling**. Pass `p_styles text[]` and category into the RPC so the sample is drawn from the filtered set. Style **changes relevance/visibility, not marker color** — filtered-out pins vanish; there are no per-style colors (the category `match` expression stays).

**Filter → plane routing:**
- Category, style, guest-available, studio type → server RPC predicate (pre-sample).
- Watched → client-side `Set` filter (unchanged, private plane).
- City "styles represented" chips → a separate cacheable `GROUP BY city` rollup.

Filter state lives in the URL (`?cat=&style=&guest=`), re-sliced client-side for chip toggles that don't change the server predicate.

## 10. Style taxonomy recommendation

**Extend `styles` in place; do not replace.** It is `key(PK)/label/position/created_at` (0075), FK-referenced by `artist_styles.style_key` and `studio_categories.style_key`, RLS-enabled with **zero policies** (service-role only). Replacing it breaks both FKs and the grant model for no benefit.

- **`key` is already the slug** (`fine_line`, `trash_polka`). Do **not** add a `slug` column; derive `fine-line` at the route layer if public URLs ever need hyphens.
- **v1 columns (one migration, mirror `STYLE_SEED` in `packages/shared/src/map-directory.ts:96` in the same PR — this duplication is a standing sync hazard):**
  - `active boolean not null default true` — soft-hide without an FK-orphaning DELETE.
  - `parent_key text references styles(key)` (nullable; 15 seeds ship `null`) — self-referential grouping for collapsible filter groups. Add only if faceting demands it.
  - `description text` — tooltip copy.
  - **Start reading `position`** (currently dead) for ordering instead of adding `sort_order`.
- **Vocabulary approach: controlled canonical + aliases (hybrid).** Declaration stays strict (closed chip pickers over the 15 keys, so `artist_styles`/`studio_categories` never re-introduce jsonb). A net-new **`style_aliases`** table serves seed-import normalization and search-synonym expansion (irezumi → `japanese`), and is forward-compatible for localization. Because both writers are closed pickers with no free-text entry today, **aliases have no live consumer until style-filtering over seeds ships** — build `style_aliases` only alongside that reader, not speculatively.
- **Defer to v2:** per-locale labels via `style_labels(style_key, locale, label)`. English `label` is enough for a logged-in-only surface; 16 countries make this real but it is additive.

Reject the spec's "rich taxonomy now" (parents/aliases/synonyms/localization/`active` all at once): you would be modeling a matching problem you don't have. Extend one column at a time behind a live reader.

## 11. Database changes

Prefer **extend and reuse** over net-new. The map plane already ships; the redesign adds read paths and one infra index. Deliberately **no** `studio_aggregated_style` table, **no** amenities table (flat `studio_categories` standards suffice for v1), **no** residency roster (deferred to a founder decision), **no** `artist_guest_appearance` (reuse `guest_spot_stays`).

### 11.1 Per-change requirements table

| Change | Net-new / extend | Why | Extends | Cardinality | Indexes | RLS | Public exposure | Migration | Backfill | Rollback | Effect on existing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Btree `(display_latitude, display_longitude)` **or** rewrite RPC to `ST_MakeEnvelope + && ::geography` | extend | GIST-on-geography is dead for the `BETWEEN` predicate; every pan full-scans ~71k rows twice | `map_locations` / `map_pins_in_view` | index over all approved rows | new btree, or reuse `map_locations_display_geo_idx` via `&&` | none | none | index-only DDL / RPC replace | none | drop index / revert RPC | zero data change; speeds every viewport request |
| Move category+style filter into RPC pre-sample; add `p_styles text[]` | extend | post-sample JS filter on single `category` col returns sparse pins; multi-style has no path | `map_pins_in_view` + join `studio_categories.style_key` | — | existing FK indexes | invoker, service-only | style keys only | RPC replace | none | revert RPC | claimed studios carry styles; unclaimed seeds unaffected |
| `styles`: `active`, `parent_key`, `description`; start reading `position` | extend | soft-hide + grouping + tooltip; wake dead `position` | `styles` (mirror `STYLE_SEED` same PR) | 15 rows | existing PK | zero-policy, service-only | labels/descriptions public-safe | `ALTER TABLE` | seeds ship `null`/`true` | `DROP COLUMN` | no FK break; label rename is safe (joins live) |
| `artist_styles.position smallint not null default 0` | extend | explicit chip ordering / primary-first; no proficiency | `artist_styles` | ≤8 per artist | existing PK | own-row `FOR ALL` (**+ column grant, 0074 rule**) | only when artist consented | `ALTER TABLE` + grant + seed.sql mirror | `row_number() over (partition by artist_user_id order by created_at)` | `DROP COLUMN` | loss-free for the edge |
| `style_aliases` (id, alias, style_key FK, source, locale, created_at) | net-new | seed-import normalization + search synonyms; forward-compat localization | — | many per style | unique `(lower(alias), coalesce(locale,''))` + `pg_trgm` GIN | zero-policy, service-only | labels/aliases public-safe | `CREATE TABLE` | seed curated aliases; scan distinct candidate category strings into `import` aliases for admin triage | `DROP TABLE` (no dependents) | none on seeded/claimed studios; **build only with the style-filter reader** |
| `map_locations.last_confirmed_at` **writer** (no schema change) | extend | column exists, read on detail page, **written nowhere** — freshness is fake | existing col | — | — | — | display-safe | app code + admin lane | stamp on seed/claim/correction-resolve | stop writing | makes an existing read meaningful |
| `moderation_statements` **writer** + `possibly_closed` handling | extend | DSA Art.17 table has zero writers; `closed` reports never flip a pin | `map_reports` / `moderation_status` path | 1 per hide/remove | existing | service-only | statement text public per DSA | new core + optional enum path | none | drop path | additive; approved rows untouched |

### 11.2 Deferred / do-not-build (with rationale)

- **`studio_aggregated_style`** — the drawer renders one studio; declared styles are a tiny junction select, guest coverage is a bounded join already hard-limited 10/10/8. On-read is sufficient. A materialized `map_location_styles(map_location_id, style_key, source, artist_count, expires_at)` is justified **only** if map-wide style filtering proves read pressure; scope it to claimed/has-guest studios (seeds have zero rows), refresh on `studio_categories` writes, guest FSM transitions, `artist_styles` upserts, and studio publish/suspend.
- **`artist_studio_membership` (residency roster)** — the only genuinely missing edge, but greenfield with an unanswered attestation question (how is residency verified without deanonymizing a lone resident?). Model it like the guest-spot FSM (propose → confirm, bilateral `artist_consent`, service-role writes, party-scoped SELECT) **when the founder decides**, not on spec. No backfill is possible; the roster would start empty.
- **`artist_guest_appearance`** — do not build; `guest_spot_stays` (0080) already holds artist × studio × dates × status, and `getStudioGuestTimeline` splits current/upcoming/past. The only gap is the naming-consent flag.

### 11.3 Public-phase-only (gated, not this initiative)

- `profiles.public_directory_consent bool default false` (+ 0074 column grant + seed.sql mirror in the same migration) — `map_visibility='listed'` was consented for an artist-only map; public re-purposes it.
- `studio_profiles.cover_image_path` — only `logo_path` (512² square) exists; public pages need a hero.

## 12. Data migration plan (backfill, rollback, effect on profiles/seeds/guest-spots/claims)

**Sequencing rule (AGENTS.md footgun):** every `profiles`/`studio_profiles` writable column ships its **0074 column grant + `supabase/seed.sql` mirror in the same migration**. Before any `migration repair --status applied`, verify effects with `information_schema.columns` / `pg_policies` / `pg_indexes` — the 2026-04-20 repair masked an unrun RLS migration for three weeks.

**Backfills:**
- Spatial index: none (index-only DDL, transparent).
- `artist_styles.position`: `row_number() over (partition by artist_user_id order by created_at)`. Loss-free.
- `styles` new columns: seeds ship `active=true`, `parent_key=null`, `description=null`. Mirror `STYLE_SEED` in the same PR.
- `style_aliases`: seed curated aliases; optionally scan distinct `map_seed_candidates` / `map_coverage_discoveries` category strings into `source='import'` rows for admin triage. Zero effect on rendered pins.
- `last_confirmed_at`: backfill a stamp on the seed/claim/correction path going forward; do not fabricate historical timestamps.

**Effect on existing entities:**
- **profiles:** additive only (`artist_styles.position`; `public_directory_consent` gated). No read-path change until the style shaper ships; consent semantics unchanged in this initiative.
- **seeds (~71k `inklee_seed`, `unclaimed`):** carry **no style data** and gain none. They remain category-only pins; never infer style from a seed name. Style is a claimed-studio / has-guest feature, not a 71k-row feature. Density remains bounded by the seed cap (5/300 km²).
- **guest-spots:** untouched schema. Guest style coverage is a read model over `guest_spot_stays × artist_styles`; the lifecycle sweep (`runStayLifecycleSweep`) already ages coverage out, so no new cron. Trip legs stay DB-guarded (`trip_legs_guest_spot_guard`); the map never authors them.
- **claims:** the flow is shipped (0079). The redesign adds only a public trust **display** (Claimed/Unclaimed + "Unverified listing"), no ownership mechanics. `possibly_closed` and `moderation_statements` writers are additive; approved rows are untouched. `revoked`/`actioned` remain dead enum values unless a re-onboarding flow is separately scoped.

**Rollback:** every change is `DROP COLUMN`/`DROP TABLE`/`DROP INDEX` or an RPC revert with no FK dependents. `style_aliases` and (deferred) roster/rollup tables have no dependents. A `styles.key` DELETE must stay `ON DELETE RESTRICT`; label renames are safe because joins read `styles.label` live and rollups store `style_key`, never the label.

## 13. API/query changes

- **`map_pins_in_view` (0095) rewrite:** add the spatial index or `ST_MakeEnvelope + &&`; add category+style filtering **before** grid-sampling (`p_styles text[]`); retain fair-truncation (`order by claim_status='claimed' desc, md5(gx:gy)`), `PIN_LIMIT=3000`, RPC ceil 5000, and the `capped` "zoom in" banner. **Do not re-add client clustering** the founder removed 2026-07-20.
- **`map_pins_in_view_count`:** currently a second full scan per request purely for the banner. Make it best-effort/deferred (fire in parallel, don't block pins) or replace with a cheap `> limit` probe.
- **`toPublicMapPin` (`map-directory.ts`):** extend the shape with style chips (declared-first, guest-by-count, provenance-tagged) for the drawer; keep it the **sole shaper**, still returning `null` unless `moderation_status='approved'` with finite coords, still emitting **display coords only** (never true lat/lng), never email.
- **"Styles represented" shaper:** a service-role read composing declared (`studio_categories.style_key`) + guest (`guest_spot_stays × artist_styles`) with provenance preserved and the `MIN_ANON_ARTIST_COUNT=3` floor applied to guest counts. On-read; no aggregation table.
- **List mode = a separate query.** The sample RPC returns one-per-cell, not a ranked list. Distance-sorted pagination (`ORDER BY geo <-> viewer_point`, keyset or `LIMIT/OFFSET`) is where the GIST geography index finally becomes useful.
- **`map_search` (0097):** fold `style_aliases` into the synonym path when style-filtering ships (`pg_trgm` GIN on `alias`).
- **Public API variants (gated):** today every route calls `auth.getUser()` and 401s anon. A public plane needs a branch `user ? authedPayload : publicPayload` (never a 401), with all viewer-scoped data stripped and named artists withheld until `public_directory_consent` exists. Not this initiative.

## 14. Permission matrix

| Capability | Public visitor (gated) | Logged-in artist | Studio owner | Admin |
|---|---|---|---|---|
| Explore / search | Yes (cached, rate-limited) | Yes | Yes | Yes |
| Watch / save | No (sign-in wall) | Yes (`watched_studios`, bound to `map_locations.id`) | Yes | Yes |
| Add-to-trip | No | Via `finishAcceptance` only (never authored from pins) | Via guest-spot flow | — |
| Private overlays (journey, watch, blocks) | Never | Own only | Own only | Own only |
| Apply / contact guest | No | Yes (artist→studio only; no invite path exists) | Receives, not initiates | — |
| Claim | No | Yes (1/owner, if unowned + `approved` non-supply location) | Already owns one | Decides (approve/reject) |
| Edit studio | No | No | Own studio only | Any |
| Manage styles | No | Own `artist_styles` (≤8, consent-gated read) | Own `studio_categories` (≥3 distinct to publish) | Any |
| Set map presence / signals | No | Toggle own `map_visibility` | `guest_spot_status` + one `studio_signals`/month | Suspend |
| Analytics | Aggregate public only | Own cockpit metrics | Own studio metrics | Full `/admin/growth` |

Public "watch/add-to-trip" resolve to a **sign-in wall, not a silent no-op**. Because `account_blocks` filtering keys off `auth.uid()` (null anonymously), **named artists must not appear on the public plane at all** until `public_directory_consent` ships; public presence is counts-only, floored at 3.

## 15. Public/private data boundaries

Three cacheability planes, one shaper:

1. **Public plane (anon, CDN-cacheable):** approved-only pins via `toPublicMapPin`, city "styles represented" rollups, floored artist **counts**. Key on `(bbox-tile, zoom, style-filter)`. No viewer identity, no named artists.
2. **Authed-shared plane (logged-in, still cacheable):** identical pin geometry, viewer-independent; same cache key + an `auth=1` variant.
3. **Personal plane (per-viewer, never cacheable):** `watched_studios`, "My trips" journey overlay, guest-spot application state, `account_blocks`-filtered names. `Cache-Control: private, no-store`, always a separate fetch merged client-side.

**Invariant:** planes 1 and 2 are computed by the same `serviceClient` RPC + `toPublicMapPin`; plane 3 is separate and merged client-side only. The current `(artist)/map/page.tsx` embeds `journey` and `watchedIds` in its SSR payload — a public route must **never** do this.

**Exposed public fields:** `{id, name, category, display_lat, display_lng, city, country, claimed, signal}` plus website, Instagram handle, `phone`, `opening_hours`, and city style chips. **Never** true `latitude`/`longitude`, email (`seed_metadata` jsonb), `watched_studios`, `trips`, `guest_spot_requests`, or `account_blocks`. **URL state carries viewport + filters only**, never watch/trip/application identifiers — a deep-link must be reconstructable by any visitor, proving no personal data rides the URL. A lint/test should assert the public payload is a structural subset of `toPublicMapPin`'s type.

## 16. Performance strategy

At ~71k approved rows, in order:

1. **Add `btree(display_latitude, display_longitude)`** or rewrite `map_pins_in_view` to `ST_MakeEnvelope(...) && st_makepoint(display_longitude, display_latitude)::geography`. The purpose-built GIST-on-geography index cannot serve a raw-column `BETWEEN`, so today every `moveend` full-scans the moderation index + window + sort. **Prerequisite to full-viewport and any density increase.**
2. **Keep the 0095 grid-sample + fair-truncation RPC.** It returns one representative per zoom-sized cell, claimed studios win the cell, deterministic `md5(gx:gy)` truncation makes pins stable across pans (no corner-clipping). Retain `PIN_LIMIT=3000` / RPC ceil 5000 and the `capped` banner. **Do not re-add client clustering** removed 2026-07-20.
3. **Filter before sampling** (§9/§13) so filtered views are not sparse.
4. **De-double the count RPC:** best-effort/deferred parallel fire, or a cheap `> limit` probe; never block pins on the banner.
5. **List mode uses the GIST geography index** (`geo <-> viewer_point`), which is otherwise dead.
6. **Keep debounce/cancellation:** 300ms `moveend` + `AbortController` per fetch; search 180ms abort-on-supersede.
7. **External CARTO tile/glyph dependency** is a CSP/offline-resilience consideration for a heavier immersive experience; the CSP already whitelists MapLibre/CARTO. No self-hosted tiles today.

## 17. Caching strategy

Today: **none** (`runtime='nodejs'`, no `revalidate`, no `Cache-Control`, service-client reads every request). Introduce caching per plane:

- **Public plane (gated):** `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` on the anon `/api/map/locations` variant, keyed on **quantized bbox tiles** + zoom + style so near-identical viewports collide. This is the first caching in the system.
- **Authed-shared plane:** same body, separate `auth=1` cache key; still `s-maxage`-cacheable because viewer-independent.
- **Personal plane:** `private, no-store`.
- **City "styles represented" rollups:** cacheable `GROUP BY city`.
- **Rate limiting on any public read RPC** (per-IP, Vercel WAF/edge). Today the only abuse control is the auth gate; `map_search` fires per keystroke and `serviceClient` bypasses RLS.
- **Constraint:** the authed map cannot be CDN-cached without a public variant, since every route currently 401s anon. Public caching is a public-phase deliverable, not this initiative.

## 18. Analytics plan

Route every map event through the **three existing first-party registries**; add **zero** third-party product analytics (breaks a documented commitment). Nothing map-related fires today, so all events are net-new with no dedupe.

- **`map_opened`** — public/anon → `web_analytics_events` (`event-registry.ts`), `clientEmittable:true`. **Do not reuse `pageview`:** `/map` is in `PRIVATE_PREFIXES` (`collector.ts:40`) and is silently dropped. Either mint a distinct public path or carve `/map` out while keeping authed subpaths excluded. Authed map-open is not a growth milestone.
- **`studio_viewed` / `studio_detail_opened`** — anon → `web_analytics_events` with a coarse `props.surface` enum (`map|list|deeplink`). **Never** send `map_location_id`, slug, name, city, or coords (zod `.strict()` allowlist forbids ids/free text).
- **`filter_applied`** — `web_analytics_events`, `props.filter_type` enum only (`style|guest_available|studio_type|radius`), never the value.
- **`watch_toggled` / `add_to_trip`** — **private travel intent, the sharpest privacy line.** First-party, authenticated, server-recorded via `record-event.ts` (the `booking_link_copied` pattern), emitting only a boolean/count, never studio id/name/coords, never to Plausible or the wa collector. If not wanted in `/admin/growth`, leave un-instrumented rather than risk a leak.
- **`claim_started` / `claim_submitted`** — authenticated `analytics_events`, server-recorded, coarse.

Governance: each event = typed registry edit + `docs/analytics-event-catalogue.md` + tests, one PR (uncatalogued events rejected by construction). Conversions stay `clientEmittable:false`. Flag public-map instrumentation against the still-open **DPIA (launch gate LO-5)**.

## 19. Accessibility plan

Pins are canvas GL layers, not DOM, so keyboard/SR access is **built from a list, not retrofitted onto the canvas**.

- **Accessible list alternative (primary a11y surface):** a real `<ul role="list">` of the server-sampled studios, each row a focusable link/button that drives `easeTo` and opens the detail panel. One component, three payoffs: a11y path, mobile fallback, and (later) the crawlable SEO DOM. Web has no list today.
- **Keyboard map controls:** keep MapLibre `NavigationControl`; make the list the keyboard path to markers (no roving-tabindex over canvas features).
- **Non-color state:** add `aria-pressed` to **every** filter chip (only "My trips" has it today); trust state (claimed/unverified/signal) carries a text/icon token, not color alone (WCAG 1.4.1).
- **Focus management:** build the one dialog primitive (`role="dialog"` + `aria-modal` + `aria-labelledby`, focus move-in, restore to invoking marker/list-row, ESC, trap). Web has no shared focus-trap; reuse the ESC/backdrop patterns from `feature-intro-modal.tsx`/`appointment-drawer.tsx` and add the trap/restore they lack. On mobile, mirror RN `AdaptiveSheet`'s `onRequestClose` "back closes sheet before leaving map" via history interception.
- **Search combobox:** `map-search-box.tsx` has working Arrow/Enter/Escape but no ARIA. Add `role="combobox"`, `aria-expanded`, `aria-controls`, `role="listbox"`/`option`, `aria-activedescendant`.
- **Screen-reader marker labels:** list rows carry `"{name}, {city}, {category}, {claimed|unverified}"`. RN `<Marker>`s currently lack `accessibilityLabel`/`accessibilityRole` and are 26×26 — add labels and raise toward 44pt.
- **Reduced-motion:** gate all `easeTo`/`flyTo` (`duration:0`) and the RN sheet `animationType`. Only one CSS rule honors the preference today.

## 20. Test plan

Harness: vitest (unit) + the LOCAL-Supabase Playwright suite (`claude/launch-audit-e2e`, prod-refusal guard, `seed.sql` grants). RPCs/shapers need integration tests against local Postgres.

- **Unit (`@inklee/shared` shapers + the "styles represented" aggregator):** 1 artist/1 style; overlapping styles (dedupe); unrelated styles (union); no linked artists → empty, not error; declared specialty without artist data; artist at multiple studios; loss-free upsert-then-delete (`updateMapPresenceAction`); source precedence (seed vs claimed correction); `toPublicMapPin` fails closed on non-approved/invalid coords; `aggregateArtistCities` floor-of-3 + block-both-directions + listed-vs-counted; upcoming guest **adds** coverage / date-lapsed guest **stops** counting.
- **Integration (RPC/route):** fair-truncation stability across pans; large-cluster grid sampling + `capped` banner; **style filter in the RPC before sampling** (regression: post-sample JS returns sparse/empty); duplicate `google_place_id` dedupe; `closed` report has no pin-state effect today (assert + flag gap); deleted artist/studio detach (`ON DELETE SET NULL` + `studio_detach_on_owner_loss`); anon branch returns reduced payload (no trips/watch/blocks); abort-on-supersede.
- **E2E (Playwright):** watch persists; private trip never in anon payload/wa collector; style filter synced across map+list; browser back/forward restores viewport+filter+selection; deep-linked studio; mobile bottom sheet detents; tablet orientation swap keeps selection; **keyboard-only** traversal via list + focus trap/restore + ESC; empty-results copy; axe pass. Note: back/forward, deep-link, mobile sheet, and keyboard have **no current implementation** — these tests gate net-new behavior.

## 21. Rollout and feature-flag plan

Land everything as **flagged slices on master**, never a long-lived branch (the quarried studios worktree is the cautionary precedent). Keep `NEXT_PUBLIC_TATTOO_MAP` as the master fail-closed gate; add narrow, independently-fail-closed sub-flags:

- `map_immersive_shell` — client build flag; shell/rail/panel/URL-state. Safe to default on once QA'd.
- `map_style_filters` — gates the style read-path + RPC style predicate; default off until the index fix is proven.
- `map_claim_v2` — trust-badge surface.
- `map_public` (server, **not** `NEXT_PUBLIC_`) — the anon read gate; the only consumer allowed to bypass `auth.getUser()`; must fail closed identically to `tattooMapEnabled()`. **Gated.**
- `map_public_pages` — gates indexable routes + `MARKETING_ROUTES`/IndexNow registration; separate from `map_public` so a public map could ship without minting indexable pages. **Gated.**

Route the two public flags through the **capability plane `DISABLED_CAPABILITIES` kill-switch** for OTA-less kill. Never let public flags read a `NEXT_PUBLIC_` var (leaks intent, can't fail closed server-side).

**Recommended order (reordered against the spec, which front-loads presentation/public):**
1. Immersive shell (logged-in) + consolidate the two divergent clients/basemaps.
2. Perf hardening (index + RPC + count) — invisible, prerequisite to density.
3. Style aggregation + filters (read-shaper over write-only edges).
4. Claim/trust surface polish (`last_confirmed_at` writer, `possibly_closed`, badges).
5. Public surface — decision-gated proposal only; never begin while Q3 holds.

## 22. Risks and mitigations

1. **Privacy leak on public inversion (BLOCKER).** Anon requests have no `user.id`, so `account_blocks` filtering and the floor-of-3 silently don't apply, and the SSR payload embeds `journey`/`watchedIds`. *Mitigation:* a distinct public aggregation path stripping all viewer-scoped data, re-deriving the floor globally, gating named artists on a new `public_directory_consent`; never reuse `/api/map/artists` block logic anon.
2. **Perf at scale (HIGH).** No spatial index serves the query; no caching; count RPC doubles work. *Mitigation:* index fix before density/public; `Cache-Control`/CDN only on the un-authed variant.
3. **Data-quality-as-verified (HIGH).** ~17% materially wrong; no per-field confidence; **no "verified" tier** (only `claimed`/`is_seed`). *Mitigation:* never emit `LocalBusiness` for unclaimed seeds; keep the "unverified listing" notice; never conflate seeded style with declared style; never infer style from a seed name.
4. **SEO/IndexNow foot-gun (HIGH if public).** Any `MARKETING_ROUTES` entry auto-submits to Bing/Yandex. *Mitigation:* no route added there before Q3 + Q20 sign-off; filter permutations noindex/canonicalized; generated segmented sitemaps for a directory.
5. **DSA exposure (MEDIUM→HIGH if public).** `moderation_statements` has zero writers; hide/remove emit no statement-of-reasons. *Mitigation:* wire the writer before any public launch (Q14 counsel item).
6. **Migration bookkeeping (MEDIUM, AGENTS.md footgun).** *Mitigation:* every profiles/studio column ships its 0074 grant + `seed.sql` mirror in the same migration; verify effects via `information_schema`/`pg_policies` before any `repair --status applied`.
7. **Scope creep / two divergent clients (MEDIUM).** *Mitigation:* consolidate `discovery-map-client` vs legacy `map-client` and the two basemaps in Phase 1, or inherit duplicated marker logic forever; keep public work a proposal, not a branch.
8. **Re-adding removed clustering (MEDIUM).** *Mitigation:* keep server grid-sampling; never re-introduce cluster bubbles the founder killed 2026-07-20.

## 23. Estimated implementation phases

- **P1 — Immersive shell + client consolidation (~2–3 wk):** full-bleed route layout (drop `max-w-5xl`), collapse-to-rail (icon-only `SidebarItem` variant + flyout sub-nav + route-derived collapse state + exit restore), responsive drawer/bottom-sheet panel with focus management, accessible list alternative, URL/deep-link state, reduced-motion, orientation branch.
- **P2 — Perf hardening (~2–4 days):** spatial index + RPC rewrite + count de-doubling. Ships invisibly; prerequisite to P3 density/filters.
- **P3 — Style aggregation + filters (~1–1.5 wk):** `map_pins_in_view` style predicate, `toPublicMapPin` style extension, "styles represented" shaper, filter chips, `styles`/`artist_styles` column adds, `map-presence-form` copy from "will power" to live, optional `style_aliases`.
- **P4 — Trust surface (~1 wk):** claimed/unverified badges, `last_confirmed_at` writer, `possibly_closed` handling, `moderation_statements` writer.
- **P5 — Public surface (GATED, ~4–6 wk if approved):** `public_directory_consent` migration, anon API variants, plane-1 caching + rate limiting, DSA writers, `LocalBusiness`/`Place` schema, generated sitemaps, robots, `(public)` route group, `collector.ts` `PRIVATE_PREFIXES` carve-out, `studio_profiles.cover_image_path`.

## 24. Files and modules likely to change

- **P1:** `apps/web/src/app/(artist)/map/{page.tsx, discovery-map-client.tsx, map-search-box.tsx}`; retire `apps/web/src/app/(artist)/map/map-client.tsx`; `packages/shared/src/map-style.ts`; new collapsed variant of `apps/web/src/components/app-shell/{sidebar.tsx, sidebar-item.tsx}` + `nav-config.ts`; a per-route layout override to drop `max-w-5xl`; new responsive panel/dialog primitive (web focus-trap); `globals.css` reduced-motion; RN `apps/mobile/src/components/AdaptiveSheet.tsx` + `apps/mobile/app/(tabs)/travel/map.tsx` (marker a11y labels, 44pt targets).
- **P2:** `supabase/migrations/01xx_map_pins_spatial_index.sql`; `apps/web/src/app/api/map/locations/route.ts`.
- **P3:** `packages/shared/src/map-directory.ts` (`toPublicMapPin`, style shaper, `STYLE_SEED` sync); `apps/web/src/app/api/map/locations/route.ts`; RPC migration; `supabase/migrations/01xx_styles_extend.sql` + `01xx_artist_styles_position.sql` (+ 0074 grants + `seed.sql`); `apps/web/src/app/(artist)/settings/map/map-presence-form.tsx`; optional `01xx_style_aliases.sql` + `api/map/search`.
- **P4:** `packages/shared/src/studios.ts` cores; `apps/web/src/app/admin/map/*`; `apps/web/src/app/(artist)/map/[id]/page.tsx`; `map_reports`/`moderation_status` enum migration.
- **P5 (gated):** new `(public)` route group + `/studios/[slug]`, `/tattoo-studios/[city]`, `/discover`; `apps/web/src/lib/{marketing-routes,indexnow,jsonld,seo}.ts`; `robots.ts`; segmented `sitemap.ts`; `public_directory_consent` + `cover_image_path` migrations (+ grants + `seed.sql`); anon API variants; capability-plane flag wiring; `apps/web/src/lib/public-analytics/{collector.ts, event-registry.ts}`; `apps/web/src/lib/growth/{event-catalogue.ts, record-event.ts}`.

---

### Highest-risk decisions for the founder

1. **Reverse Q3 and go public, or stay private?** The single largest fork. Everything downstream (SEO scaffolding, `LocalBusiness` schema, anon caching, a new public-consent tier, DSA statement-of-reasons wiring, Overture Q20 re-license) gates on it, and it trades a compounding growth asset against legal/reputational exposure on data that is ~17% materially wrong with no "verified" tier. **Recommendation: keep it private; let the authed beta earn the data quality that makes public safe.**
2. **Build a residency/membership roster, or defer?** The only genuinely missing style edge. It unlocks "resident styles" but opens an attestation/deanonymization question (a lone confirmed resident is identifiable). **Recommendation: defer; ship declared + guest coverage only.**
3. **Name upcoming guest artists publicly, or keep them anonymized?** Current/upcoming stays are anonymized unconditionally (`guest-spots.ts:1144`); naming future whereabouts is a bigger consent than `passport_public` promises. A flag decision, not a table.
4. **Accept the spatial-index migration on the hot RPC before any density/full-viewport work?** Non-negotiable for scale, but it touches the live viewport query and needs careful rollout.
5. **Consolidate the two divergent map clients + basemaps now, or carry the duplication?** Deferring it bakes duplicated marker logic into every subsequent slice.
