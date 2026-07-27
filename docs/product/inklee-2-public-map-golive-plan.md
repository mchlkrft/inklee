# Inklee 2.0 public map go-live plan

Status: execution plan for the public map shell, written 2026-07-27. This is step 2 of the locked order (founder direction 2026-07-26: scope, then slices, then go-live, then features step by step). Step 1, the future-scope pass, landed the same day (`inklee-2-map-growth-strategy.md`). This document owns the launch execution: the slice sequence, the go/no-go gate, the flip procedure, the soak plan, and the rollback posture. It does not own direction (growth strategy), status history (build plan), founder decisions (open questions), or indexation (SEO strategy).

The authoritative critical-path enumeration stays in roadmap §6.6. This plan turns that list into ordered, verifiable slices and adds nothing to it; if the two ever differ, §6.6 wins and this plan gets corrected.

No calendar dates appear here on purpose (the standing no-dates-without-evidence rule). Slices carry rough effort classes so the founder can budget; they are estimates, not commitments.

## 1. What "go live" means

After the flip, an anonymous visitor on inklee.app can:

- Open `/map`, explore the ~71k approved studios across 16 countries, search, filter by category, and open studio detail (including claimed-studio content: description, specialties, house rules, guest timeline where consented).
- Open a claimed studio's public entity page at `/studios/{slug}`, with claimed media finally rendered, indexable only when the studio passes the SEO strategy's full quality gate (founder decision D1, 2026-07-27: in v1). At flip time claimed density is near zero, which is expected: the route launches gate-driven and pages appear as claims are approved.
- Share any map state or studio through the existing privacy-safe deep links.
- Start the professional actions that convert: claim this studio, sign in to watch, sign in to request a guest spot, suggest a correction (via the live report route), create an account.
- Read `/data-attribution` (licences, credits, GDPR Art. 14 disclosure, Art. 21 removal route).

The marketing layer flips automatically with the same env var: the pill-nav Map entry, the footer Tattoo map link, and the homepage plus `/guest-spot-booking` CTAs switch from signup mode to explore mode (`lib/map-marketing.ts` resolver; all pre-built and dark).

What go-live is explicitly NOT:

- No indexation beyond the ratified strategy. `/map` stays `noindex, follow`, out of the sitemap, no keyword ownership. The only indexable surface is a claimed `/studios/{slug}` page that passes the complete quality gate (D1), served through its own generated sitemap segment; nothing enters `MARKETING_ROUTES` or IndexNow, and no other structured data changes.
- No artists-in-town layer on the public plane at all, not even anonymous counts (founder decision D2, 2026-07-27: postponed to a later version; the authed layer is unchanged; any future public presence, counts or named, goes back through Q21).
- No client self-booking, no client accounts, no review or rating surface.
- Native app unchanged: the public shell is a web-only surface at launch (the native app already has the authenticated map; `docs/web-native-parity.md` gets a deliberate web-only row in S5).

## 2. Current state: why this is a compact build

Verified against code 2026-07-27 (the future-scope pass audits):

Already built and reusable: the shared map core (`map-core-state.ts` incl. `PUBLIC_MAP_CAPABILITIES`, currently consumer-less), the immersive shell with the 2026-07-25 tablet/mobile optimization, `toPublicMapPin` (display coords only, fails closed), the pins RPC (index-backed, ~0.7 ms), search, detail read models, the claim flow, corrections, `/data-attribution` (dark), the marketing integration (dark), the DSA machinery, and the Art. 21 delisting category (already live on `/legal/report`).

Genuinely missing, and therefore the work: an anonymous data path (all four `/api/map/*` routes 401 without a cookie; the pins, search, and artists fetches swallow failures client-side, so naive reuse renders a silently empty map; the detail panel has a partial error state), a `/map` route that serves anonymous visitors (everything sits under `(artist)`, which redirects to `/login`), any caching or per-IP rate limiting (the auth gate is currently the only abuse control), map analytics (`/map` is hard-excluded from the collector; zero map events exist), the studio-data credit on the map itself (only the basemap pill renders today), migration 0111, and the two 2026-07-27 review items (seeded `private_studio` true-coordinate gap; the robots meta).

D1 adds a second block of genuinely missing work: `studio_profiles.slug` is a reserved column that is never populated and never routed, no `/studios` route exists anywhere, no `LocalBusiness` or `BreadcrumbList` JSON-LD helper exists, the sitemap is a hand-curated 22-URL marketing list with no generated segment, and claimed studio media (a publish requirement) has never been rendered to any visitor, so its public serving path (the `studio-media` bucket is private, read through short signed URLs) has to be designed in the entity-page slice.

One structural note that shapes S1: the personal plane is currently neither separate nor un-embedded. The artist map page SSR-fetches the journey and watched ids into its props, and the detail read model takes a required viewer id and returns `watched` and `ownStudio` inside the shared payload. Serving an anonymous branch therefore requires a real refactor of those read models, not just an `if (user)` around today's code.

## 3. Slice plan

Standing rules apply to every slice: small flagged slices on master, registry entry before any new flag, fail-closed, adversarial review on the public data path (it is an exposure surface), and the pre-commit build gate green. `NEXT_PUBLIC_PUBLIC_MAP` stays OFF through S1 to S5; every slice is verifiable in preview or local with the flag forced on.

### S1: public data plane (effort class: ~1 week; the hard one, first)

**Status 2026-07-27: BUILT (uncommitted at time of writing), dark behind `publicMapEnabled()`.** Delivered: the access resolver (`lib/server/map-public-access.ts`, the one enforcement point: 404/401/429/public/authed matrix), anonymous branches on pins, detail, and search with public-branch-only caching (`s-maxage=300` + `stale-while-revalidate` + `Vary: Cookie` backstop; authed branches now explicitly `private, no-store`), the detail read-model plane split (`getPublicMapLocationDetail` viewer-independent by construction; authed wire shape unchanged for web and the mobile twin), `resolveMapCapabilities` in the shared core consumed by the access point and the detail branch, per-IP limits (pins 240/min, detail 60/min, search 45/min, refuse-before-work, production fail-closed without Redis) plus a 100-char search needle cap, the D2 comment locking the artists route, the `quantizeViewportQuery` helper, and 28 gating tests across three files (policy/flag matrix, capability resolution, quantization properties, detail structural subset + literal key allowlist, access matrix, per-route header/branch/artists-refusal assertions). 3-lens adversarial review: privacy and rollback verified clean; all findings fixed (search cost cap, kind-based detail headers, the missing resolver/route tests) or handed to S2 as named obligations (page SSR restructuring, quantization URL wiring, capability rendering E2E). Anonymous behavior with the flag off is byte-identical to pre-S1; `/api/mobile/map/*` untouched.

The anonymous branch on the read path, with abuse controls. Nothing user-visible.

- Add the anonymous branch to `/api/map/locations`, `/api/map/locations/[id]`, and `/api/map/search`: `user ? authed : public` instead of 401. The anonymous branch is additionally gated on `publicMapEnabled()` server-side (defense in depth per the map-features convention): with the flag off, anonymous requests are refused exactly as today, so S1 can land dark and a rollback re-closes the data plane, not just the UI.
- Split the personal plane out of the shared read models (the real refactor in this slice): the detail read model becomes viewer-nullable, with `watched` and `ownStudio` moved out of the shared payload into an authed-only decoration. Planes 1 and 2 end as the same viewer-independent payload. (The map PAGE's SSR embedding of journey and watched ids moves to S2 with the route itself: the invariant "the public route never SSR-embeds personal data" is a property of the new auth-optional route, and today's page is safely authed-only.)
- `/api/map/artists` gets NO public branch (decision D2: the artists-in-town layer is postponed entirely on the public plane). The route keeps refusing anonymous requests, the public shell never fetches it, and the authed layer is unchanged. When the layer is revisited it goes back through Q21.
- Caching on the public branch only: `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`. For cache hits to exist at all, the public-plane pins request URL must be quantized client-side (bounds snapped to a grid, integer zoom); today the client sends raw fractional bounds and zoom, which would give a near-zero hit rate under any header. The authed plane keeps raw bounds since its responses stay uncached; personal fetches stay `private, no-store`.
- Per-IP rate limiting on all three public branches (artists has none, per D2; the existing Upstash `makeLimit` pattern; search gets the tightest budget since it fires per keystroke, plus a needle-length cap so a single request cannot be made arbitrarily expensive). Refuse-before-work ordering.
- Wire `PUBLIC_MAP_CAPABILITIES` as a real consumer: S1 delivers the server half (one session-to-capabilities resolution consumed by the access point and the detail branch); the client-rendering half of the four fields (`isPublic`, `canClaim`, `canApplyGuest`, `canSeeNamedArtists`) lands with the S2 shell, whose E2E closes the §4 capability gate line.
- Tests that gate the slice: the public pins payload AND the public detail payload are structural subsets of their shapers, with the public detail keys pinned as a literal allowlist (no personal field, journey, watched ids, blocks, or viewer id reachable anonymously); with the flag off, all public branches refuse anonymous requests (asserted at the access resolver AND per route); the artists route refuses anonymous requests even with the flag on (D2); capability resolution is exercised on both planes (rendering assertions land with S2); cache headers only on the public branch; the quantization helper's properties (outward cover, exact idempotence, collision; the URL wiring is an S2 test obligation); rate limits enforced with refuse-before-work and 429 on deny.

### S2: public shell and chrome (effort class: ~1 to 1.5 weeks)

**Status 2026-07-27: BUILT, dark behind `publicMapEnabled()`.** Delivered: `/map` and `/map/[id]` moved to the auth-optional `(map)` route group (`/map/[id]/request` and `/settings/map` stay authed under `(artist)`); the workspace chrome extracted into one shared `ArtistWorkspaceShell` so signed-in artists keep the identical chrome (and the day-grain activity touch) on both routes, with a `(map)` layout that renders it for authed users and a bare frame for anonymous ones, plus the matching loading state; explicit `robots: { index: false, follow: true }` and self-canonicals on both routes (test-locked at metadata level); the anonymous shell (no rail or bottom nav, sign-in header on desktop, a bottom conversion bar on phones, the experimental banner, logo to the homepage) with all four capability fields load-bearing in rendering (`isPublic` gates chrome, artists fetch, and CTAs; `canWatch`/`canApplyGuest`/`canClaim` drive watch, request, and claim sign-in walls; `canSeeNamedArtists` gates the city panel names); the anonymous `/map/[id]` page with its own public chrome, the live `/legal/report` correction path, the per-IP limiter on the SSR read (the S1 invariant, added after review), and the counsel-approved `STUDIO_DATA_CREDIT` rendered verbatim with the approved link label (map pill and entity page); pins error and retry state plus search failure states (no more silent empty map or false "No studios found."); the public pins fetch quantized through `viewportRequestQuery` (helper contract test-locked); login return-path support with the open-redirect-hardened `sanitizeReturnPath` (tested); a structural read-model guard withholding unclaimed `private_studio` street addresses by construction (tested; S3's data remediation becomes belt and braces). 3-lens adversarial review applied: both HIGH findings fixed (authed `/map/[id]` chrome restored via the shared shell; the anonymous SSR rate limiter), plus the credit rendering, search errors, phone attribution overlap, aria copy, stale comments, and the loading state.

**Named obligations still open from S2 (close in S5/E2E, never silently):** rendered-HTML assertions for robots/canonical and for the anonymous document containing no journey/watch data and no artist chrome; E2E that each capability field flips its surface (§4 gate line); on-the-wire proof the public pins request URL is quantized; anonymous explore/search/detail/share-link/sign-in-wall E2E flows; keyboard path and axe pass; threading the return target through the signup CTAs and the Google OAuth redirect (see §7).

The `/map` route serves both audiences from one shared core.

- Move `/map` and `/map/[id]` out of `(artist)` into their own route group with an auth-optional layout: signed-in users keep exactly today's experience (immersive shell, personal overlays, watch, request CTAs); anonymous visitors get the same shell with public capabilities. `/map/[id]/request` and `/settings/map` stay authed. `proxy.ts` does not gate `/map` (verified), so no middleware change; the danger to engineer around is that leaving `(artist)` silently drops the auth redirect AND the noindex, both of which must be reintroduced deliberately.
- Restructure the page's personal-plane SSR with the move (inherited from S1): journey and watched ids become a separate authed-only fetch (or an authed-layout-only embed), so the auth-optional route never SSR-embeds personal data. Test-locked: the anonymous document contains no journey or watch data.
- The public pins fetch builds its request URL through `quantizeViewportQuery` (the S1 helper; inherited obligation, test-locked here), so public cache keys actually collide; the authed fetch keeps raw bounds.
- The client renders from the capability object: the four S1-resolved fields (`isPublic`, `canClaim`, `canApplyGuest`, `canSeeNamedArtists`) drive the gated rendering, with E2E assertions that each field flips its surface (closes the §4 capability gate line).
- Explicit metadata on the moved routes: `robots: { index: false, follow: true }` (this also discharges the 2026-07-27 review item: today's rendered tag is `noindex, nofollow` via the artist layout, while the strategy specifies follow) and a self-referencing canonical without viewport or filter params (also fixes the inherited canonical-to-homepage defect on map pages).
- Anonymous chrome: no artist rail, no bottom nav, no workspace card; a minimal public header with sign-in and the experimental banner (the Q3 framing: an experimental surface evolving with the community; sentence case, no em dashes).
- Sign-in walls with basic intent preservation: every gated action (watch, request a guest spot, claim) renders a context-specific CTA (per the growth strategy conversion table) that links to signup with a return-to target back to the same map state or studio. Full preserved-intent flows (resume the exact action after onboarding) stay a fast-follow (§7).
- Explicit error and empty states on the map client: the current catch-and-swallow behavior becomes visible retry states, so a failed fetch can never render a silently empty public map.
- Attribution: the map's attribution pill gains the studio-data credit line linking to `/data-attribution` (exact approved string from `@inklee/shared/map-attribution`; OpenStreetMap restored, per the corrected counsel outcome; never the old OSM-less string).
- E2E: anonymous explore, search, detail open, share link round-trip, sign-in wall CTAs, an explicit assertion that anonymous `/map` renders no artist rail, bottom nav, or workspace chrome, authed regression (personal overlays intact), keyboard path, axe pass.

### S2b: claimed studio entity pages `/studios/{slug}` (effort class: ~1 week; in v1 per founder decision D1)

**Status 2026-07-27: BUILT, dark behind `publicMapEnabled()`.** Delivered: the pure eight-condition indexability gate and slug logic in the shared package; slug minting at claim approval AND first publish, validated against `RESERVED_SLUGS`, never changed afterwards (so no redirect table is needed); the gated `/studios/[slug]` route (404 for anything unclaimed, unpublished, or unapproved; `noindex, follow` for anything that renders but fails the gate; self-canonical; public chrome and the studio-data credit); `WebPage` + `TattooParlor` + `BreadcrumbList` JSON-LD on gate-passing pages only, carrying only what the page visibly renders; a stable media proxy that keeps the bucket private, re-checks the gate per request, and is rate-limited, plus the narrow `robots.txt` allow that keeps those images crawlable under the blanket `/api/` disallow; the `/studios/sitemap.xml` segment built from the gate alone and deliberately outside `MARKETING_ROUTES` so studio URLs can never reach IndexNow; internal links from both map surfaces; 51 tests; the SEO implementation log entry and the parity register row.

3-lens adversarial review (SEO/legal, security/privacy, correctness) applied. The findings worth recording because they were real defects, not polish: the JSON-LD `sameAs` would have published the claim-evidence social link (often a claimant's personal profile) that the page never shows and no owner surface can edit; `robots.txt`'s blanket `/api/` disallow would have made every studio image uncrawlable, silently defeating the entity markup; a throttled request would have served a placeholder body under `index: true`; the "Open the studio page" links were not gated on the flip and would have 404'd for signed-in artists today; the entity page read the owner-editable address copy that no moderation action can scrub, putting a takedown out of the queue's reach; a claimed `private_studio` would have published its street address and coordinates because the claim path takes the column default of `exact` without asking; and the sitemap's per-studio replay of the read model would have timed out on the ISR path. All fixed. Measured while fixing: production has **zero** studio profiles and **zero** claimed locations, so the review's backfill concern is vacuous in data and the first page appears only after a real claim.

**Named obligations carried to S5:** rendered-HTML assertions (the tests assert the metadata objects, not the served document), and an end-to-end pass over a real claimed studio once one exists.

The claimed reward surface, gate-driven so it carries zero thin-page risk: ungated profiles never render an indexable page.

- Reserve the `studios` route segment in `RESERVED_SLUGS` (verify; add if missing, following the collision-audit precedent) so no artist slug can shadow the route.
- Slug system: populate `studio_profiles.slug` on publish and on claim approval (kebab-case from studio name plus a city or numeric disambiguator on collision; validated against reserved words). Stability rule: once a page has been indexable its slug never changes silently; a rename keeps the old slug redirecting. Backfill slugs for any already-published studios.
- The route: `/studios/[slug]`, server-rendered, public. Resolution rules: unknown, unclaimed, unpublished, hidden, or removed resolves 404 (never a thin page); claimed and published renders. Robots per the SEO strategy's 8-condition gate: `index` only when every condition passes (claimed, published, publication gates, no unresolved moderation or possibly-closed state, owner-declared content only, crawlable unique HTML, attribution and privacy active, approximate studios never exposing true location); otherwise `noindex, follow`. Self-referencing canonical.
- Page content (owner-declared and consented only): name, description, city or region, specialties and categories, house rules summary, guest timeline per the existing consent stack, guest spot status, official links, and claimed media. The media serving path is a design decision inside this slice: the `studio-media` bucket is private with short signed URLs, which an indexable page cannot use directly; choose between a public image proxy route for published studios or a published-copy path, and document it.
- Structured data per the ratified strategy: `WebPage`, `LocalBusiness`, `BreadcrumbList` for gate-passing pages only; only visible owner-approved properties; no `aggregateRating`, no unconfirmed opening hours, display coordinates only for approximate-location studios.
- Generated studio sitemap segment containing exclusively gate-passing pages, deliberately separate from `MARKETING_ROUTES` (which auto-feeds IndexNow; the studio segment must not).
- Internal links: the map detail panel and `/map/[id]` link to the entity page for claimed published studios; the entity page links back to `/map` centered on the studio.
- Tests that gate the slice: unclaimed and ungated profiles can never produce an indexable page (robots asserted on rendered HTML per gate state); the sitemap segment contains only gate-passers; JSON-LD constraint tests (no forbidden properties, display coords only); slug collision and reserved-word handling; 404 behavior.
- SEO implementation log entry (this slice is SEO implementation by definition; the strategy already assigns the URL and gates, so no proposal is needed).

### S3: data and trust review items (effort class: ~2 to 4 days; gates the flip)

**Status 2026-07-27: DONE, all measurements recorded.** (1) The standing source-type verification PASSED: production carries exactly three source types (overture_maps 95,160 candidates, osm 12,658, brave_search 3,882; no manual_instagram or artist_suggestion rows), all covered by the approved credit string; OSM-derived approved studios measured 3,582, matching the counsel note exactly. (2) Migration 0111 applied and verified live: both provenance columns plus the partial index exist, backfill covers every location row (approved: 67,599 Overture, 3,582 OSM, 10 Brave, summing to the known 71,191), and the irreversible Q17 Brave-title overwrite touched the measured **10** terminal-status rows, zero remaining (the "~3.6k" figure circulating in earlier docs was a conflation with the OSM count and has been corrected where it appeared). (3) D3 turned out vacuous in data: **zero** approved unclaimed `private_studio` rows exist in prod, so no data migration was needed; the remediation is enforced structurally instead, by the S2 read-model guard plus a new writer guard in the seed/admin lane row builder (deterministic coarse offset and withheld address for any future `private_studio` conversion, test-locked). (4) The `possibly_closed` and unverified labels were code-verified on the shared payload both planes render.

- Seeded `private_studio` coordinate remediation (decision D3, decided 2026-07-27 as recommended): measure how many approved `private_studio` rows exist and what they display, then apply the deterministic display offset to unclaimed `private_studio` rows (the same mechanism owner studios use) and null their street address on the map row. Consider a code-side guard in the detail read model alongside the data fix, so the rule holds structurally and not only for rows the migration touched. The locked scope rule "a private studio cannot be shown at its exact map position" must hold for every rendered row before anonymous eyes reach the map (the S1 review confirmed the detail payload serves addresses verbatim today, which is why this item gates the flip).
- Apply migration 0111 (provenance columns and backfill on `map_locations`, plus the irreversible Q17 Brave-title overwrite of reviewed candidates). Before applying, measure and record the actual affected count (`select count(*) from map_seed_candidates where source_type='brave_search' and status in ('converted','rejected')`); no evidenced count exists in any doc today and the overwrite cannot be undone. Locked timing: with the shell, which is now. Follow the migration footgun rules: verify effects live before any bookkeeping repair.
- Re-run the standing source-type verification (distinct `source_type` values in `map_seed_candidates` plus the OSM-derived approved count) and confirm the rendered credit string covers every source in the result. This check exists because skipping it once already produced a wrong counsel answer.
- `possibly_closed` and unverified labels verified on the public rendering path (they exist; the check is that the public branch renders them identically).

### S4: analytics and measurement (effort class: ~2 to 3 days)

**Status 2026-07-27: BUILT, dark with the rest of the surface.** Delivered: the `/map` carve-out in the collector's private prefixes, gated on `publicMapEnabled()` so a rollback restores today's exclusion, with `/map/<id>/request` staying private in both states (an authed workflow route a prefix rule cannot exclude); four public map events registered on the closed allowlist (`map_studio_opened`, `map_filter_applied`, `map_signup_cta_clicked`, `studio_claim_started`), each carrying enum-only props so a studio id, name, city, or coordinate cannot enter a payload even by mistake, and none marked a conversion (account creation stays the conversion); client emitters on the public shell, the detail panel, and the entity page walls; the server-observed `studio_claim_submitted` milestone closing the claim funnel from the authenticated end; the catalogue documentation both registries require; and 9 tests pinning the carve-out's behaviour across the flip and the allowlist's rejection of identifying props.

Deliberately NOT in this slice, per the plan and the standing privacy line: cockpit map tabs, the meaningful-action metric definitions (Q28 waits for real data), and any instrumentation of watch or trip intent.

Without this slice the public map is invisible in acquisition, so it gates the flip.

- Carve `/map` out of `PRIVATE_PREFIXES` in `lib/public-analytics/collector.ts`, gated on `publicMapEnabled()` so a rollback restores today's exclusion instead of leaving signed-in artists' map visits flowing into the acquisition collector (keeping authed-only subpaths excluded as needed).
- Register the launch event set in the public registry (closed allowlist; coarse enum props only, never ids, names, or coordinates): map pageview coverage plus `studio_detail_opened`, `filter_applied`, `map_signup_cta_clicked`, `claim_cta_clicked`. Follow the reserved-event pattern and the one-PR governance rule (registry + `docs/analytics-event-catalogue.md` + tests together).
- Server-recorded authenticated milestones for the claim funnel start (`claim_started`) on the existing growth catalogue pattern, dedupe-keyed.
- Verification harness: the wa diagnostics panel on `/admin/growth/acquisition` is the launch-day "is it firing" check; a pre-flip synthetic pageview against preview confirms the carve-out.
- Deliberately NOT in this slice: cockpit map tabs, meaningful-action definitions (Q28 waits for real data), watch/trip instrumentation (privacy-sharp, per the redesign analytics rules).

### S5: launch readiness pass (effort class: ~1 to 2 days)

**Status 2026-07-27: DONE except the two items only the founder can close.**

Verified by executing a production build with both flags forced on, and again with them off (the rollback rehearsal), then reading the real emitted output rather than trusting the code:

- With the flags ON: `/studios/[slug]` and `/studios/sitemap.xml` register, `/data-attribution` renders instead of 404ing, and `robots.txt` emits `Allow: /api/studio-media/` ahead of the blanket `/api/` disallow plus BOTH sitemap lines. `/map` is correctly absent from the disallow list (a `Disallow` there would block the `noindex` tag itself and the follow path to claimed studios).
- With the flags OFF: the studio sitemap line disappears from `robots.txt` and the public surfaces close again. The rollback story is now rehearsed at the artifact level, not just asserted.

The end-to-end obligations S1, S2 and S2b handed forward are written as a real Playwright spec (`tests/e2e/public-map.spec.ts`, 10 tests) and wired into the suite with the map flags pinned in `playwright.config.ts`. They assert what unit tests structurally cannot: the served HTML's robots and canonical, that the anonymous document embeds no journey or watch data and renders no artist chrome, that the public pins request is quantized on the wire, that the sign-in walls carry a return target, that a shared link restores the viewport, that the artists layer is never fetched on the public plane (D2), that an unknown studio slug is a 404, and that the sitemap and robots posture hold.

**Executed 2026-07-27, and they caught a real defect.** The full suite now runs green from a cold `.next` against local Supabase: **37/37 e2e, 1647/1647 unit, typecheck clean** (`5c7f52a`). Two things came out of the run and both were worth the trouble:

- **The anonymous document was advertising the personal plane.** The public shell was handed `journey={[]}` and `watchedIds={[]}`. Empty is not absent: React serializes the prop *names* into the RSC flight payload inlined in the served document, so every anonymous `/map` response carried the personal-plane shape even with no data in it. The props are now omitted at the call site and defaulted inside the shell. This is exactly the class of leak the S2 obligation existed to catch, and no unit test could have: the shape only appears in the served HTML.
- **The suite's own parallelism was the flake, not the code.** Every worker shares ONE `next dev` server, and Playwright defaults to half the CPU cores, so a 20-core box ran 10 workers competing for a single Turbopack compile queue; a cold route starved unrelated specs until they blew the 60s timeout. This presented as 4 to 11 failures in flows with no map involvement, which is what made it look like a map regression. Bisecting to the pre-map commit and re-running under `--workers=2` settled it. Workers are now capped in `playwright.config.ts`, and `/map` (the heaviest route in the app, it pulls in maplibre) joined the `global-setup` warm list. The capped run is also *faster* than the failing one.

The CI `e2e` job failure the founder reported was this same starvation, not a product defect.

Copy sweep across all five slices: zero em dashes in user-visible strings, no Approve or Reject verbs, sentence case with terminal punctuation on every new string. The parity register row and the SEO implementation log entry shipped with S2b.

**Moderation intake: acknowledged by the founder 2026-07-27.** They are ready to meet the DSA procedure's 24-hour acknowledgement bar for a public audience, across the map report queue, the claims queue, and the live Art. 16/21 intake on `/legal/report`. Gate line closed.

**Visual pass: DONE, founder-confirmed 2026-07-27.** Served locally as a dev server with `NEXT_PUBLIC_PUBLIC_MAP=true` forced on against production Supabase, reviewed anonymously in an incognito window across `/map`, `/map/[id]`, `/`, `/guest-spot-booking` and `/data-attribution`, plus the signed-in plane for the shared-chrome comparison. (It has to be a dev server, not `next start`: a production build forces `NODE_ENV=production`, where the rate limiter fails closed without Upstash and the map renders empty. That is a local-preview artifact, not a product defect, and it cost a debugging cycle once already.)

One change came out of the pass and shipped with it: the attribution pill is now ONE collapsed `Info` control at every width, collapsed by default, compact when open, and raised above the map/list toggle when open. See the attribution note in §4 for the open counsel item this creates.

The e2e obligation is closed locally; confirm the CI `e2e` job goes green as the final tick.

- Verify the marketing flip end to end with the flag forced on in preview: nav, footer, both CTA modes, `/data-attribution` un-404s, no `/map` link anywhere while dark (the existing regression tests).
- `docs/web-native-parity.md`: add the deliberate web-only row for the public shell (founder rule: the register is updated in the same change).
- SEO implementation log entry for the S2 metadata work (robots, canonicals, the moved route), per the CLAUDE.md rule; confirm zero sitemap/robots.txt/`MARKETING_ROUTES` drift via the existing tests.
- Copy sweep of every new user-visible string (sentence case, no em dashes, Accept and Pass verbs, the experimental banner wording).
- Moderation readiness: confirm the correction queue and the Art. 16/Art. 21 intake are staffed for a public audience (founder awareness item; the DSA procedure v2 SLAs are the bar: acknowledge formal notices within 24 hours).
- Rollback rehearsal in preview: flip the env var off, confirm the entire surface goes dark cleanly (marketing reverts to signup mode, `/data-attribution` 404s, anonymous `/map` falls back safely, and the anonymous API branches refuse requests again).

**Open findings from the S5 cross-slice sweep, none blocking, all recorded rather than silently applied.** Two of them are decisions the founder owns, not engineering judgement:

- **`viewerId` rides in `MapCapabilities` on both planes** (medium). The authed plane serializes a real user UUID into the document, and no production code reads the field. It is dead weight on the public plane and a needless identifier on the authed one. Recommend deleting it outright rather than gating it; that is a small, safe change, but it touches the shared capability contract that native also consumes, so it wants its own slice rather than a pre-flip patch.
- **Named guest artists render on the INDEXABLE `/studios/[slug]` page, while the consent copy artists agreed to says "on its map page"** (medium, founder decision). `/map` is `noindex`; the studio entity page is not. Artists who opted into being named may reasonably have understood a noindex surface. This is a consent-scope question, not a bug, and per the standing rule it is not being resolved silently. In practice the exposure is currently nil (production has zero claimed studios, so no entity page exists yet), which is why it does not block the flip, but it should be answered before the first claim is approved. Options: narrow the render on the entity page, or widen the consent copy and re-collect.
- ~~**Post-flip the collector will track SIGNED-IN artists on `/map`**~~ **FIXED 2026-07-27.** Done one level deeper than first recommended: gating the `trackPublicEvent` call sites would have left pageviews (the bigger contaminant) still flowing, so the plane requirement went into `isTrackablePath` instead, which both pageviews and events already route through. See the Analytics gate line above.
- **The anonymous shell still ships the artist nav bundle** (low). Chrome is correctly hidden from anonymous visitors, but the bundle is still sent. A payload cost, not an exposure.

### S6: go/no-go and the map flip (founder execution)

This is the MAP flip, independent of and unrelated to the BM-2.0 Plus consumer flip (`PLUS_CONSUMER_LAUNCH_ENABLED`, its own procedure in the roadmap); neither gates the other.

Run the gate checklist (§4). Then:

1. Confirm `NEXT_PUBLIC_TATTOO_MAP=true` is still set on production (`publicMapEnabled()` is the AND of both flags; with the platform gate off the flip silently no-ops), then set `NEXT_PUBLIC_PUBLIC_MAP=true` on the Vercel `inklee` project (production) and redeploy so the `NEXT_PUBLIC_` value bakes in (the recorded flag-flip recipe: env API + redeploy, or commit-triggered deploy).
2. Smoke test anonymously: `/map` renders pins, search works, detail opens, claimed content renders, share link round-trips, `/data-attribution` serves, nav and footer links live, CTAs in explore mode, sign-in walls return correctly.
3. Verify analytics: the diagnostics panel shows map pageviews within the hour.
4. Announce per the experimental framing (community-evolving surface; no "directory" or "verified" language).

Rollback at any point: set the flag to false and redeploy. The surface goes dark again fail-closed: the UI, the marketing links, `/data-attribution`, the anonymous API branches (S1's server-side flag check), and the collector carve-out (S4's flag gate) all revert. What does not revert: migration 0111 stays applied (its data changes are one-way by design), and downstream shared caches outside Vercel may serve already-cached public payloads for up to the TTL window (about an hour) after the flip-off. No other exposure to claw back beyond what was already public while live.

## 4. Go/no-go gate

Every line verifiable, no judgment calls at flip time:

**Technical**
- [x] All three public API branches live, tested, rate-limited, cached (artists deliberately has none, D2); quantized request URLs wired on the public fetch (S1 helper, S2 wiring, e2e asserts the wire).
- [x] Public pins AND detail payload structural-subset tests green; zero personal fields anonymously reachable (unit-tested, including a literal key allowlist).
- [x] Capability fields load-bearing: resolution unit-tested on both planes; each field drives its gated rendering in the shell, panel, and entity page.
- [x] Flag-off refusal: with `NEXT_PUBLIC_PUBLIC_MAP` unset, every public branch refuses anonymous requests (unit-tested at the resolver and per route).
- [x] Anonymous `/map` and `/map/[id]` render with explicit `noindex, follow` and self-canonicals **against rendered HTML** (`tests/e2e/public-map.spec.ts`, executed green 2026-07-27).
- [x] Anonymous chrome and the no-personal-data document verified in the served DOM (same spec, executed green). This line earned its keep: the run caught the public shell serializing the personal-plane prop names into the anonymous document, fixed in `5c7f52a`. Re-verified against real production data in the visual pass (`watchedIds`, `journey`, `bookingCount`: zero occurrences).
- [x] Error and empty states render on forced API failure (pins retry state and search failure state; no silent empty map).
- [x] Authed experience regression-clean: the workspace chrome, personal overlays, watch, and request flows are unchanged after the route move (shared `ArtistWorkspaceShell`), 1647 unit tests green.
- [x] Rollback rehearsed: production builds executed with the flags on and off; the emitted `robots.txt` and route set revert, the API branches re-close (unit-tested), and the collector carve-out re-closes (unit-tested).

**Legal and compliance**
- [x] Source-type verification re-run (2026-07-27: exactly overture_maps, osm, brave_search; OSM approved = 3,582, matching the counsel note; re-run again at flip time if the seeding stack changes).
- [x] Studio-data credit rendered verbatim on the map attribution pill and on the studio entity page, with the approved "Licences and notices" link (all three constants imported from the shared module, never restated).
- [x] Studio-data credit rendered on the map surface, linking `/data-attribution`. Delivered as one collapsed `Info` control at every width (founder direction 2026-07-27), so the credits sit one click behind an always-visible labelled button rather than inline; the full notices additionally render uncollapsed on `/map/[id]`, `/studios/[slug]` and `/data-attribution`. **The collapsed rendering was put to counsel and APPROVED 2026-07-27**, which closes the question the change opened. The strings themselves are untouched and still come from `@inklee/shared/map-attribution`; nothing here reopens Q20.
- [x] Migration 0111 applied and verified live (2026-07-27: columns + index + full backfill; Brave overwrite = the measured 10 rows, zero remaining).
- [x] `/data-attribution` reachable with the flag on: licences, Foursquare NOTICE, dated change statement, Art. 14 disclosure, Art. 21 route (served 200 and reviewed in the 2026-07-27 visual pass).
- [x] Seeded `private_studio` remediation in force (D3 as recommended, 2026-07-27: zero affected rows measured in prod; enforced structurally by the read-model guard + the seed-lane writer guard, both test-locked).
- [x] Moderation intake staffed for a public audience; the Art. 16/21 24-hour acknowledgement bar **acknowledged by the founder 2026-07-27**. The surfaces this commits to: the correction and report queue at `/admin/map/reports`, the claims queue at `/admin/map/claims`, and the public Art. 16 notice-and-action plus Art. 21 delisting intake on `/legal/report` (already live), all per `docs/dsa-moderation-procedure.md` v2.

**Privacy**
- [x] Artists layer absent from the public plane entirely: no public branch on `/api/map/artists`, no counts, no names, no badges (D2; unit-tested and e2e-asserted that the layer is never fetched anonymously).
- [x] No journey, watch, block, or viewer data in any anonymous payload or SSR page. Unit-tested on the payloads, and now asserted on the served document too, which is what caught the prop-name leak (`5c7f52a`).
- [ ] Approximate-location studios render display coordinates only, on the map AND on entity pages (existing shaper guarantee re-asserted on the public branch).

**SEO**
- [x] `/map` posture: `MARKETING_ROUTES`, the root sitemap and IndexNow are untouched (regression tests green); `/map` now correctly declares `noindex, follow` instead of the inherited `nofollow`.
- [x] `/studios/{slug}` gate tests green: ungated profiles never indexable, 404 for unclaimed/unpublished/unapproved, metadata robots asserted per gate state (rendered-HTML assertion is the e2e item above).
- [x] Studio sitemap segment is built from the indexability gate alone and lives outside `MARKETING_ROUTES`, so it cannot feed IndexNow; `robots.txt` announces it only when the surface is live (verified in both build states).
- [x] JSON-LD constraint tests green: no `aggregateRating`, reviews, opening hours, or `priceRange`; geo and street address only for exact-address non-private studios; the claim-evidence social link is never published.
- [x] SEO implementation log entry written (S2 metadata + S2b entity pages, one dated entry).

**Analytics**
- [x] `/map` becomes trackable exactly at the flip and re-closes on rollback (flag-gated carve-out, unit-tested); the authed request route stays private in both states.
- [x] **The carve-out is plane-aware, not just flag-aware (fixed 2026-07-27).** `/map` is the first route serving both audiences on one path, so the flag alone would have counted signed-in artists browsing their own workspace as acquisition from the flip onward, silently poisoning the soak numbers the flip is judged on. The anonymous shells now publish the plane (`usePublicMapPlane`, from the server-resolved `capabilities.isPublic`) and the collector requires it. Deliberately fail-closed: an unknown plane excludes, so a missed marker under-counts anonymous traffic rather than contaminating acquisition. 4 tests pin the dual-plane behaviour, including the fail-closed direction and that the marker cannot become a global tracking switch.
- [x] Launch events registered on the closed allowlist with enum-only props (no ids, names, or coordinates possible) plus the server-observed claim milestone.
- [ ] Verified firing after the flip: the wa diagnostics panel on `/admin/growth/acquisition` shows map pageviews within the hour (post-flip check, S6 step 3).

**Product**
- [x] Experimental banner live on both public surfaces; unverified and possibly-closed labels render on the public path; copy sweep clean across all five slices (zero em dashes, sentence case, no Approve or Reject verbs).
- [x] Marketing flip verified at the artifact level: a build with the flags on registers `/studios/*` and un-404s `/data-attribution`, and `robots.txt` gains the studio sitemap; the dark build reverts both. Link and CTA gating is unit-tested.
- [ ] Visual pass over the flipped marketing surfaces in a preview deployment (founder; nav pill, footer entry, both CTA modes).
- [x] Parity register row added (web-only by decision, plus the additive `studioSlug` field on the mobile detail payload).
- [x] D1 to D3 are decided and recorded (DECISIONS.md, 2026-07-27); the founder executes the flip.

## 5. Soak and measurement (first weeks after the flip)

Daily, first week: wa diagnostics on `/admin/growth/acquisition` (map pageviews, rejection counters), rate-limit hit rates (Upstash console analytics for the `makeLimit` limiters), API error rates (Sentry plus Vercel function logs, within the current plan's observability limits), correction and report volume in `/admin/map/reports` (moderation load is the named solo-founder risk), claim submissions in `/admin/map/claims`, Sentry.

Weekly: the acquisition funnel that already exists with no new work (visits landing on `/map` to signup start to completed account, via `wa_breakdown`), claim funnel counts from raw tables, search zero-result spot checks, CARTO tile behavior under public traffic (Q1 stays open; a traffic spike is the trigger to revisit the tile budget).

Data collected here feeds Q28 (city activation criteria and the meaningful-action definitions) and the Horizon 1 fast-follow ordering. No cockpit build until definitions are ratified.

## 6. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Silently empty map on API failure (the historical client behavior) | S2 explicit error states + an e2e that forces a failure |
| Scraping and bulk export of the directory | Per-IP rate limits, PIN_LIMIT and grid sampling, no dataset-shaped API, the standing no-bulk-export policy |
| Moderation surge from a public audience | Art. 16/21 SLAs rehearsed in S5, queue volume on the daily soak check, the non-promise tone ("we try to keep the map clean") |
| Reputation hit from stale seeds (~17% materially wrong) | Unverified labels, possibly-closed handling, corrections loop, experimental framing |
| Cache plane mixing (personal data in a shared cache) | Caching only on the public branch, plane separation tests, personal fetches `private, no-store` |
| Zero claimed profiles at launch makes claimed value invisible | Expected: the claim loop starts at go-live; claim CTA prominence; the D1 entity page is the claimed reward from the first approved claim |
| An entity-page gate bug leaks an indexable thin page | 404 (not noindex) for unclaimed/unpublished; robots asserted on rendered HTML per gate state; the studio sitemap contains only gate-passers; all test-locked in S2b |
| CARTO free tiles under public load | Monitor in soak; the Q1 provider decision is triggered by evidence, not preempted |
| Accidental indexation of the moved route | Explicit robots + canonical asserted by test; robots.txt deliberately does not disallow `/map` (test-locked, correct: a disallow would block the noindex signal) |

## 7. Post-launch fast-follows (ordered, not gating)

From the growth strategy's accompanying Horizon 1 work, in recommended order: (1) claimed-pin canvas distinction, (2) full intent preservation through signup and onboarding (v1 ships the return-to basics on the password sign-in path only; threading `next` through the signup CTAs and the Google OAuth redirect, and resuming the action after onboarding, are this item), (3) the guest-spot-available filter (RPC filter path), (4) in-map claimed media reuse (the entity page's media path from S2b extended to the map detail panel). Then Horizon 2 begins with Q22. The artists-in-town public layer is deliberately NOT a fast-follow: it returns only through Q21 (D2).

## 8. Decisions: D1 to D3 DECIDED by the founder 2026-07-27 (recorded in DECISIONS.md)

**D1: claimed `/studios/{slug}` entity pages ship IN v1** (the founder reversed the plan's fast-follow recommendation). Consequences absorbed into this plan: slice S2b (slug system, gated route, JSON-LD, generated sitemap segment, claimed media rendering and its serving-path design), roughly one added week of effort, and the SEO gate lines in §4. The thin-page risk the original recommendation guarded against is handled structurally: ungated profiles never render an indexable page, so launching with near-zero claimed density costs nothing and the claimed reward exists from the first approved claim.

**D2: the artists-in-town layer is POSTPONED entirely on the public plane.** Not even anonymous counts ship in v1. The authed layer is unchanged. Any future public presence (counts or named) goes back through Q21; nothing about Q21 is resolved by this postponement.

**D3: seeded `private_studio` remediation as recommended.** Extend the deterministic display offset plus address nulling to unclaimed `private_studio` rows, executed and verified in S3.

Everything else this plan relies on was already decided and referenced: Q20 attribution posture, Q14 channels, the Q3 reversal, SEO ownership, and migration 0111 timing.

## 9. Sequencing summary

```
S1 public data plane  ->  S2 public shell + chrome  ->  S5 launch readiness  ->  S6 go/no-go + map flip  ->  soak
                                   \
S2b claimed entity pages  ----------+   (after S1; parallel to S2 where they do not touch the same files)
S3 data + trust review items  ------+   (parallel to S2 after S1; must close before S6)
S4 analytics + measurement    ------+   (parallel to S2/S3; must close before S6)
```

Rough total: four to five working weeks of slices before the flip, dominated by S1, S2, and S2b. The flip itself is a founder action measured in minutes, with a rehearsed one-flag rollback.
