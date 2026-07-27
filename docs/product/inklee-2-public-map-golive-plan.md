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

- Seeded `private_studio` coordinate remediation (decision D3, decided 2026-07-27 as recommended): measure how many approved `private_studio` rows exist and what they display, then apply the deterministic display offset to unclaimed `private_studio` rows (the same mechanism owner studios use) and null their street address on the map row. Consider a code-side guard in the detail read model alongside the data fix, so the rule holds structurally and not only for rows the migration touched. The locked scope rule "a private studio cannot be shown at its exact map position" must hold for every rendered row before anonymous eyes reach the map (the S1 review confirmed the detail payload serves addresses verbatim today, which is why this item gates the flip).
- Apply migration 0111 (provenance columns and backfill on `map_locations`, plus the irreversible Q17 Brave-title overwrite of reviewed candidates). Before applying, measure and record the actual affected count (`select count(*) from map_seed_candidates where source_type='brave_search' and status in ('converted','rejected')`); no evidenced count exists in any doc today and the overwrite cannot be undone. Locked timing: with the shell, which is now. Follow the migration footgun rules: verify effects live before any bookkeeping repair.
- Re-run the standing source-type verification (distinct `source_type` values in `map_seed_candidates` plus the OSM-derived approved count) and confirm the rendered credit string covers every source in the result. This check exists because skipping it once already produced a wrong counsel answer.
- `possibly_closed` and unverified labels verified on the public rendering path (they exist; the check is that the public branch renders them identically).

### S4: analytics and measurement (effort class: ~2 to 3 days)

Without this slice the public map is invisible in acquisition, so it gates the flip.

- Carve `/map` out of `PRIVATE_PREFIXES` in `lib/public-analytics/collector.ts`, gated on `publicMapEnabled()` so a rollback restores today's exclusion instead of leaving signed-in artists' map visits flowing into the acquisition collector (keeping authed-only subpaths excluded as needed).
- Register the launch event set in the public registry (closed allowlist; coarse enum props only, never ids, names, or coordinates): map pageview coverage plus `studio_detail_opened`, `filter_applied`, `map_signup_cta_clicked`, `claim_cta_clicked`. Follow the reserved-event pattern and the one-PR governance rule (registry + `docs/analytics-event-catalogue.md` + tests together).
- Server-recorded authenticated milestones for the claim funnel start (`claim_started`) on the existing growth catalogue pattern, dedupe-keyed.
- Verification harness: the wa diagnostics panel on `/admin/growth/acquisition` is the launch-day "is it firing" check; a pre-flip synthetic pageview against preview confirms the carve-out.
- Deliberately NOT in this slice: cockpit map tabs, meaningful-action definitions (Q28 waits for real data), watch/trip instrumentation (privacy-sharp, per the redesign analytics rules).

### S5: launch readiness pass (effort class: ~1 to 2 days)

- Verify the marketing flip end to end with the flag forced on in preview: nav, footer, both CTA modes, `/data-attribution` un-404s, no `/map` link anywhere while dark (the existing regression tests).
- `docs/web-native-parity.md`: add the deliberate web-only row for the public shell (founder rule: the register is updated in the same change).
- SEO implementation log entry for the S2 metadata work (robots, canonicals, the moved route), per the CLAUDE.md rule; confirm zero sitemap/robots.txt/`MARKETING_ROUTES` drift via the existing tests.
- Copy sweep of every new user-visible string (sentence case, no em dashes, Accept and Pass verbs, the experimental banner wording).
- Moderation readiness: confirm the correction queue and the Art. 16/Art. 21 intake are staffed for a public audience (founder awareness item; the DSA procedure v2 SLAs are the bar: acknowledge formal notices within 24 hours).
- Rollback rehearsal in preview: flip the env var off, confirm the entire surface goes dark cleanly (marketing reverts to signup mode, `/data-attribution` 404s, anonymous `/map` falls back safely, and the anonymous API branches refuse requests again).

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
- [ ] All three public API branches live, tested, rate-limited, cached (artists deliberately has none, D2); quantized request URLs wired on the public fetch (helper S1, wiring S2).
- [ ] Public pins AND detail payload structural-subset tests green; zero personal fields anonymously reachable.
- [ ] Capability fields load-bearing: `PUBLIC_MAP_CAPABILITIES` resolution tested on both branches, each field verifiably driving its gated rendering.
- [ ] Flag-off refusal: with `NEXT_PUBLIC_PUBLIC_MAP` unset, all four public branches refuse anonymous requests.
- [ ] Anonymous `/map` and `/map/[id]` render with explicit `noindex, follow` and self-canonicals (asserted in a test against rendered HTML, which no test does today).
- [ ] Anonymous chrome verified: no artist rail, bottom nav, or workspace chrome in the anonymous DOM (E2E assertion).
- [ ] Error and empty states render on forced API failure (no silent empty map).
- [ ] Authed experience regression-clean (personal overlays, watch, request flows unchanged).
- [ ] Rollback rehearsed in preview, including the API-refusal and collector-exclusion reverts.

**Legal and compliance**
- [ ] Source-type verification re-run; credit string covers every source found.
- [ ] Studio-data credit rendered on the map surface, linking `/data-attribution`.
- [ ] Migration 0111 applied and verified live.
- [ ] `/data-attribution` reachable with the flag on: licences, Foursquare NOTICE, dated change statement, Art. 14 disclosure, Art. 21 route.
- [ ] Seeded `private_studio` remediation applied and verified (D3 signed off).
- [ ] Moderation intake staffed for a public audience; Art. 16/21 24-hour acknowledgement SLA acknowledged by the founder (S5).

**Privacy**
- [ ] Artists layer absent from the public plane entirely: no public branch on `/api/map/artists`, no counts, no names, no badges (D2).
- [ ] No journey, watch, block, or viewer data in any anonymous payload or SSR page (tested).
- [ ] Approximate-location studios render display coordinates only, on the map AND on entity pages (existing shaper guarantee re-asserted on the public branch).

**SEO**
- [ ] `/map` posture unchanged: sitemap, robots.txt, `MARKETING_ROUTES`, IndexNow zero drift (existing regression tests green).
- [ ] `/studios/{slug}` gate tests green: ungated profiles never indexable, robots asserted on rendered HTML per gate state, 404 for unclaimed/unpublished.
- [ ] Studio sitemap segment contains exclusively gate-passing pages and does not feed IndexNow.
- [ ] JSON-LD constraint tests green (no forbidden properties, display coordinates only).
- [ ] SEO implementation log entries written (S2 metadata + S2b entity pages).

**Analytics**
- [ ] `/map` trackable; launch events registered and verified firing in preview.

**Product**
- [ ] Experimental banner live; unverified and possibly-closed labels on the public path; copy sweep clean.
- [ ] Marketing flip verified end to end in preview with the flag forced on (nav, footer, both CTA modes, `/data-attribution`; no `/map` links while dark).
- [ ] Parity register row added.
- [ ] D1 to D3 are decided and recorded (DECISIONS.md, 2026-07-27); the founder executes the flip.

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

From the growth strategy's accompanying Horizon 1 work, in recommended order: (1) claimed-pin canvas distinction, (2) full intent preservation through signup and onboarding (v1 ships the return-to basics), (3) the guest-spot-available filter (RPC filter path), (4) in-map claimed media reuse (the entity page's media path from S2b extended to the map detail panel). Then Horizon 2 begins with Q22. The artists-in-town public layer is deliberately NOT a fast-follow: it returns only through Q21 (D2).

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
