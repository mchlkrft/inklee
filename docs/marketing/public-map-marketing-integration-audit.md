---
document: Public tattoo map — marketing integration audit
status: active
date: 2026-07-26
author: Claude Code (implementation owner)
strategy_source_of_truth: docs/seo/inklee-seo-strategy.md
---

# Public tattoo map: marketing integration audit

**Date:** 2026-07-26 · **Scope:** the whole public marketing surface of `inklee.app` and how the tattoo map should join it.

**Location decision.** `docs/marketing/` did not exist. The repo already uses topical
subfolders under `docs/` (`seo/`, `product/`, `legal/`, `architecture/`, `ux-audit/`),
so a `marketing/` folder is consistent with the existing structure rather than a new
convention. This document is deliberately **not** in `docs/seo/`: that folder is the
shared SEO operating system read by the strategy owner (ChatGPT) every session and is
meant to stay small and canonical. This audit spans information architecture,
conversion, copy, analytics and responsive behaviour, most of which is not SEO
strategy. It is cross-linked from `docs/seo/seo-implementation-log.md` so the strategy
owner finds it, and any strategic consequence is filed as a proposal in
`docs/seo/inklee-seo-strategy.md` under `## Proposed strategic changes`.

**Canonical authority.** `docs/seo/inklee-seo-strategy.md` wins over this document on
keyword ownership, canonical URLs, indexation, audience, positioning, conversion goals,
page hierarchy and cannibalization. Nothing here changes any of those.

---

## 1. Executive summary

**The single fact that reshapes this task: the public tattoo map does not exist yet.**

Every map route in the repo lives under `apps/web/src/app/(artist)/`. `(artist)` is a
route group, so the URL really is `/map`, but `(artist)/layout.tsx:26` redirects anonymous
visitors to `/login` and `layout.tsx:12-14` sets `robots: { index: false, follow: false }`.
All four `/api/map/*` handlers return `401` without a cookie user, `map_locations` has RLS
enabled with zero client policies, and every map RPC has `revoke all ... from public, anon,
authenticated`. An anonymous visitor cannot read a single pin through any path. There is
also no `/studios/...` route anywhere, and `studio_profiles.slug` has never been written
for any row.

The public shell is the last item of the map rollout (`docs/product/inklee-2-map-redesign-audit-and-plan.md`
§ revised rollout, step 5) and it is still gated. `docs/web-native-parity.md:74` records
`Public (logged-out) map | unbuilt (Q20 gate)`.

**Q20 status, closed 2026-07-26.** Counsel answered on 2026-07-24 (attribution only, no
share-alike) on the ground that no studio rows were OSM-derived. The verification sweep that
answer required before the flip was run on 2026-07-26 and failed: **3,582 approved studios
(5.0% of the directory) come solely from a direct OpenStreetMap Overpass lane** added by
migration `0088`. Counsel was re-asked on the corrected facts and **re-confirmed the same
conclusion**: Produced Work, attribution only, no coverage held back. The one change is the
credit string, which now restores OpenStreetMap
(`docs/counsel-note-public-map-osm-correction-2026-07-26.md` §8). The Q14 DSA answers and
Q17/Q18/Q19 also landed. **The legal gate is therefore closed and the remaining blockers are
engineering** (credit component, `/data-attribution` page, provenance on `map_locations`,
GDPR Art. 14/21 surface, plus the public shell itself). Nothing in this marketing work
depended on the outcome: every public-facing map link is dark behind a fail-closed flag
either way.

So a marketing integration that adds `/map` links today would point public pages at a
login redirect. That is the exact failure the brief forbids. The integration therefore
splits in two:

**What is true and shippable today.** The tattoo map is a *live, prod-flipped product
capability for signed-in artists* (`NEXT_PUBLIC_TATTOO_MAP` is on in prod; the immersive
shell is the discovery surface since `c0cbc8d`), and the marketing site **never mentions
it once**. That is a real narrative hole, not a missing link: `/guest-spot-booking` covers
only the second half of a guest spot (collecting client requests for a trip) and says
nothing about the first half (finding a studio that hosts guest artists), which is
precisely what the map does. Marketing can say all of this truthfully today with
account creation as the CTA, because claim, watch and guest-spot-request are all shipped
and all require an Inklee account.

**What must wait behind a gate.** Any public-facing `href="/map"` — the navigation entry,
the footer entry, an "explore the map" CTA. Those are built now but rendered only when a
new fail-closed flag says the public route is real.

**Chosen information architecture: Model D**, one navigation, discovery earns its entry.
No navigation restructure. The map enters the product narrative through the homepage and
`/guest-spot-booking`, and enters navigation only when the public route exists. Reasons in
§5.

**No new indexable page, no new keyword ownership, no indexation change.** `/map` stays
`noindex, follow` and out of the sitemap. No `/studios/{slug}`, no city pages, no style
pages, no filter URLs. One strategic *proposal* is filed (a guardrail that forecloses a
future `/find-guest-spot-studios` page), not applied.

---

## 2. Current marketing architecture

### 2.1 Public surfaces

`apps/web/src/lib/marketing-routes.ts` is the only thing that puts a URL in the sitemap or
IndexNow (`app/sitemap.ts` and `lib/indexnow.ts` are its only importers; there is no
`generateSitemaps`, no filesystem discovery, no DB-driven segment). It holds 22 entries.

| # | Indexable page | Role |
|---|---|---|
| 1 | `/` | Brand-led conversion hub |
| 2 | `/tattoo-booking-software` | Category pillar |
| 3 | `/instagram-booking-link-for-tattoo-artists` | Channel solution page |
| 4 | `/guest-spot-booking` | Guest spot organizer |
| 5 | `/tattoo-booking-form` | Request/intake form |
| 6-8 | `/tattoo-booking-software-vs-{instagram-dms,google-forms,calendly}` | Comparisons |
| 9 | `/best-booking-app-for-tattoo-artists` | Comparison pillar |
| 10 | `/tattoo-deposit-tool` | Deposits |
| 11 | `/tattoo-artist-waitlist` | Waitlist |
| 12 | `/tattoo-appointment-reminders` | Reminders |
| 13 | `/tattoo-client-management` | Client management |
| 14 | `/download` | App download |
| 15 | `/dm-chaos` | Problem page |
| 16-17 | `/guides/how-to-{take-tattoo-deposits-online,reduce-tattoo-no-shows}` | Guides |
| 18 | `/about` | Brand/trust |
| 19 | `/help` | Support content |
| 20-22 | `/terms`, `/privacy`, `/imprint` | Legal |

Public but deliberately **not** indexable: `/pricing` (`noindex, follow`, out of the
sitemap, 404s while `PLUS_CONSUMER_LAUNCH_ENABLED` is false), `/[slug]` artist booking
pages and `/[slug]/hub` (`noindex, follow`), `/start`, `/instagram/data-deletion`,
`/legal/*` beyond the three footer entries, `/unsubscribe`.

### 2.2 Navigation

There is exactly **one** public navigation component: `components/marketing-v2/pill-nav.tsx`.

- Desktop (`sm+`): logo → `App` (`/download`), `About` (`/about`), `Log in` (`/login`),
  and the mustard `Get started` (`/signup`, tracked `nav-get-started`). Four items.
- **Mobile: logo pill + the `Get started` FAB and nothing else.** All three text links are
  `hidden ... sm:inline-block`. There is **no mobile menu, no drawer, no hamburger, no
  dropdown and no mega-menu mechanism anywhere in the marketing nav.**
- It shares zero code with the authenticated app nav
  (`components/app-shell/*`, `nav-config.ts`), where the map already appears as
  `{ label: "Tattoo map", href: "/map", icon: Compass }` gated on `tattooMapEnabled()`
  (`nav-config.ts:86-90`).

`components/marketing-v2/site-footer.tsx` renders `lib/footer-links.ts`. Five groups
(Product 11 items, Compare 4, Resources 2 active + 4 `planned`, Company 4, Legal 3).
`getRenderableFooterGroups()` filters on `active`, and the file already carries the
`active: false, planned: true` convention for links whose route does not exist yet — the
house-native way to hold a slot without shipping a broken link.

### 2.3 Internal-link mechanisms that already exist

1. **Footer** (site-wide, `lib/footer-links.ts`).
2. **Per-page `RELATED_LINKS` arrays** rendered as a bone "More to read" card grid.
   Present on 8 pages: pillar, booking form, deposit, waitlist, reminders, client
   management, Instagram, guest spot. Each is a local const in the page file; there is no
   shared component (`components/marketing/related-links-block.tsx` exists but the
   marketing-v2 pages inline their own).
3. **Homepage feature cards** with per-card `href` and a `Learn more →` link (6 cards, 5
   linked).
4. **Homepage "Compare Inklee:" row** (4 comparison links).
5. **Hero secondary buttons** (e.g. `See the booking tool →`, `See a live example →`).

### 2.4 SEO / indexation plumbing

- Canonicals: hand-written per page as `alternates: { canonical: PAGE_PATH }`.
- `absoluteUrl()` from `lib/seo.ts` builds OG URLs and JSON-LD `url`.
- `lib/jsonld.ts` has `organizationSchema`, `websiteSchema`, `softwareApplicationSchema`,
  `webPageSchema`, `faqPageSchema`. **There is no `LocalBusiness` / `TattooParlor` /
  `Place` builder** — nothing exists for a studio entity page, which is consistent with
  "do not build claimed studio pages yet".
- `app/robots.ts`: one `userAgent: "*"` rule, `allow: "/"`, 24 disallow prefixes.
  **`/map` is not disallowed** and must stay that way (§9).
- `vercel.json` holds the `/guest-spots` → `/guest-spot-booking` 308.

### 2.5 Analytics

Three pipelines run in parallel (the "Plausible is the only analytics platform" comment in
`lib/track.ts:3` is about third-party vendors; it is not literally true of pipelines):

1. **Plausible** (third-party, the only one): `marketing_cta_click`, `signup_started`,
   `signup_completed`, `booking_link_created`, plus `plus_upgrade_click` (undocumented,
   dark behind `PLUS_CONSUMER_LAUNCH_ENABLED`). `trackEvent` merges first-touch
   attribution from `localStorage` and `current_path` automatically and applies **no
   allowlist to caller props** — a new `cta` value works with zero infrastructure change.
2. **First-party `web_analytics_events`** via `lib/public-analytics/collector.ts` →
   `/api/wa/collect`. `event-registry.ts:150-184` is a **hard allowlist that drops the
   whole event** (not just the prop) and answers `202` regardless;
   `record-server.ts:52-53` logs nothing at all.
3. **First-party `analytics_events`** (authenticated growth analytics, zod `.strict()`).

`collector.ts:40` lists **`/map` in `PRIVATE_PREFIXES`**, so the first-party collector
records nothing for `/map` today.

### 2.6 Test and gate conventions

- `pnpm typecheck` = `next typegen && tsc --noEmit`; `pnpm lint` = `eslint`;
  `pnpm test` = `vitest run` (include is **`src/**/*.test.ts` only** — a `.test.tsx` file
  is silently skipped); `pnpm build` = `next build`; `pnpm test:e2e` = Playwright, which
  needs local Supabase and `apps/web/.env.e2e`.
- The pre-commit hook runs mobile typecheck plus web typecheck + lint-staged + a full
  `next build` (~60s) whenever `apps/web/` or `packages/` is staged. It does not run vitest.
- **No test anywhere covers the sitemap, robots, `marketing-routes.ts`, or navigation.**
  The only SEO-adjacent unit test is `components/seo/__tests__/json-ld.test.ts`.
- Flag convention: fail-closed literal env compare, e.g.
  `tattooMapEnabled() = process.env.NEXT_PUBLIC_TATTOO_MAP === "true"`. Gated *routes*
  `notFound()`; gated *nav entries* use `...(flag() ? [entry] : [])` inside the nav const
  (`nav-config.ts:86`).

---

## 3. Public map positioning assessment

### 3.1 What is actually shipped

| Capability | State | Requires |
|---|---|---|
| Tattoo map of studios and shops (`/map`, immersive shell) | Live in prod, artists only | account + `NEXT_PUBLIC_TATTOO_MAP` |
| Studio detail (`/map/[id]`, UUID-addressed) | Live, artists only | account |
| Search + category filters | Live | account |
| Watch a studio | Live, no entitlement, no cap | account |
| Guest spot request to a studio (artist → studio) | Live, 14-state FSM | account, studio published + accepting |
| Claim a studio (`/studio/claim/[id]`) | Live end to end, admin-approved | account, one studio per owner |
| Report / correct a listing | Live, on `/map/[id]` for unclaimed only | account |
| Basemap attribution UI (MapLibre / CARTO / OSM) | Live on the web shell | — |
| **Data-source attribution (Overture/CDLA, OSM/ODbL) on a pin or detail page** | **Does not exist** | build gap |
| **Public (logged-out) shell** | **Does not exist** | Q20 counsel + anon API + caching + rate limit + consent tier |
| **`/studios/{slug}` entity page** | **Does not exist**; no slug ever written | slug decision + full quality gate |
| **"Experimental / evolving with the community" framing** | **Does not exist in the product**; zero hits for "experimental" in `apps/web/src` | planned public-shell element |

### 3.2 Answers to the twelve narrative questions

1. **Does the homepage make room for discovery without weakening the request-first
   workflow?** Not today: the map is absent. There is room. The homepage runs
   hero → definition → features → how it works → about → final CTA → FAQ, and a discovery
   section placed *after* "how it works" arrives only once the request-first promise has
   been made three times. It reads as an extension, not a competing promise.
2. **Core capability, secondary platform capability, or experiment?** **Secondary product
   capability of the artist workflow.** Not core (the conversion engine is request intake),
   not an experiment in marketing voice (see 11).
3. **Does the navigation distinguish manage from discover?** The question does not apply:
   the marketing nav has no product items at all (App / About / Log in / Get started). There
   is nothing to distinguish it from.
4. **Would a dedicated "Explore" / "Tattoo map" nav item improve understanding?** Yes,
   *once the public route exists*. Today it would point at a login redirect. Also note it
   could only be a desktop item, because mobile has no menu.
5. **Nav, product nav, footer, or a combination?** Footer (held behind the gate) plus the
   pill nav at flip. No product nav exists to add to.
6. **Should mobile navigation expose the map directly?** It cannot without building a
   mobile menu, which does not exist for any item. On mobile the map is reached through the
   homepage section and the footer. This is a pre-existing IA gap, not one this work
   introduces; see §13.
7. **Does the guest spot page need a contextual connection to studio discovery?** **Yes,
   and this is the strongest finding in the audit.** `/guest-spot-booking` is 718 lines
   about collecting and organizing *client* requests for a trip. Search it for "find",
   "host studio", "where to go": the closest it gets is "planning where to travel next
   becomes a guess". The step of finding a studio that hosts guest artists is missing from
   the page and is exactly what the map does. This is complementary, not cannibalizing.
8. **Does `/download` need the map as an app capability?** Not yet. The existing
   `app-travel-map.webp` is the **personal journey map** ("a four-stop guest spot trip route
   through Germany"), a different feature. The native tattoo map shipped 2026-07-26
   (`10f1b9d`) but no approved screenshot of it exists, and inventing one or relabelling the
   journey-map shot would be a false product claim. Deferred pending a real asset.
9. **Should `/about` explain the community-maintained map?** Not yet. `/about` is a tight
   six-section DM-chaos origin story; the community framing has no product surface behind it
   yet (there is no experimental/community banner anywhere). It becomes a genuine trust
   asset at public launch. Deferred.
10. **Is a dedicated indexable marketing explainer page needed?** **No.** It would either
    duplicate `/map` or invent a new intent owner, and the canonical strategy explicitly
    gives `/map` no keyword ownership. The two intents that would justify a page already
    have owners: guest spot organization (`/guest-spot-booking`) and the software category
    (`/tattoo-booking-software`). A proposal is filed to add a guardrail sentence that
    forecloses a future `/find-guest-spot-studios` page rather than opening one.
11. **Is the experimental framing helping trust or making the map sound unfinished?**
    The premise needs correcting: **there is no experimental framing in the product.** What
    ships is *unverified-listing* framing on the authenticated detail surfaces
    ("Unverified listing. We compiled this from public map data, so the address and details
    may be out of date."), which is per-listing honesty and does work. "Experimental" as a
    whole-product label reads as unfinished, and per the counsel note it "changes nothing
    about the licenses", so it buys no legal cover either. Marketing should use
    **forward-looking community language** ("the map grows with the tattoo community",
    backed by the shipped claim and correction loops) and leave per-listing accuracy
    caveats where they belong, on the listing.
12. **Clearest conversion path from public map visitor to account creation?** Studio claim
    for owners; watch and guest spot request for artists. All three are already
    account-gated in code, so the account wall is a product fact, not marketing copy. See §8.

---

## 4. Page-by-page findings

Audience is "artist" unless noted. "Map ref useful?" and "Placement" are the recommendations.

| URL | Role | Primary keyword | Conversion goal | Links in (internal) | Links out (internal) | Mentions discovery / studios / travel / map today | Map ref useful? | Audience confusion risk | Placement |
|---|---|---|---|---|---|---|---|---|---|
| `/` | Brand + conversion hub | brand + `tattoo booking software for independent tattoo artists` (positioning phrase, not owned as a keyword) | account creation | footer (Company → Home), every page logo | 5 feature pages, 4 comparisons, `/about`, `/bert-grimm`, `/signup` ×3 | travel/guest spots yes ("Trips and guest spots" card, FAQ ×2). **Map: no** | **Yes** | Low if artist-framed | **New section after "How it works"**, primary |
| `/tattoo-booking-software` | Category pillar | `tattoo booking software` | account creation | home, most feature pages, footer | 6 related pages incl. `/guest-spot-booking` | guest spots yes; map no | **No** | Medium: discovery copy dilutes category ownership | **None.** The correct hop is pillar → `/guest-spot-booking` → map |
| `/guest-spot-booking` | Guest spot organizer | `tattoo guest spot organizer` | account creation | home feature card, pillar, footer, 3+ related blocks | pillar, Instagram page, waitlist | travel yes, extensively. **Studio discovery: no. Map: no** | **Yes, strongest fit** | Low | **New compact section** + 1 FAQ item, secondary CTA |
| `/download` | App download | `tattoo booking app for iOS and Android` | app install + account | home nav (`App`), footer | store links, `/signup` | journey map screenshot + "Trips on a map" | Later | Medium: relabelling the journey map shot would be false | **Defer** pending a real native tattoo-map screenshot |
| `/about` | Brand/trust | brand | account creation | nav, footer, home | pillar, `/signup` (untracked) | travel/guest spots in passing; map no | Later | Low | **Defer** to public launch (community framing) |
| `/tattoo-booking-form` | Intake form | `tattoo booking form` | account creation | pillar, home card, footer | related ×3 | no | No | High: form intent is unrelated | None |
| `/tattoo-deposit-tool` | Deposits | `tattoo deposit software` | account creation | pillar, guide, footer | related ×3 | no | No | High | None |
| `/tattoo-artist-waitlist` | Waitlist | `tattoo waitlist software` | account creation | pillar, home card, footer | related ×3 | city demand yes (waitlist cities) | No | Medium: city demand is not studio discovery | None |
| `/tattoo-appointment-reminders` | Reminders | `tattoo appointment reminder software` | account creation | pillar, guide, footer | related ×3 | no | No | High | None |
| `/tattoo-client-management` | Clients | `tattoo client management software` | account creation | pillar, form, reminders, footer | related ×3 | no | No | High | None |
| `/instagram-booking-link-for-tattoo-artists` | Channel page | `tattoo booking link for Instagram` | account creation | pillar, footer | related ×3 | no | No | High | None |
| `/dm-chaos` | Problem page | DM pain (no exact-match ownership) | account creation | pillar, footer | pillar, form | no | No | High | None |
| `/best-booking-app-for-tattoo-artists` | Comparison pillar | `best booking app for tattoo artists` | account creation | home compare row, footer | 3 `-vs-` pages, pillar | no | No | Medium: "best studios" adjacency is a ranking-language trap | None |
| `/tattoo-booking-software-vs-{instagram-dms,google-forms,calendly}` | Comparisons | per competitor | account creation | pillar, home, footer | pillar | no | No | High | None |
| `/guides/how-to-take-tattoo-deposits-online` | Guide | `how to take tattoo deposits online` | account creation | deposit page, footer | `/tattoo-deposit-tool` | no | No | High | None |
| `/guides/how-to-reduce-tattoo-no-shows` | Guide | `how to reduce tattoo no-shows` | account creation | reminders page, footer | `/tattoo-appointment-reminders` | no | No | High | None |
| `/pricing` | Pricing (noindex, dark) | pricing intent (proposal pending) | account creation | none yet | `/signup` ×3 | no | No | Low but out of scope | None |
| `/help` | Support content | support | support resolution | footer | support | no | No | Low | None |
| `/terms`, `/privacy`, `/imprint` | Legal | — | — | footer | legal pages | no | No | — | None. **Note:** a public map publishing seeded third-party data may need a privacy/attribution paragraph at launch (Q20 output) |
| `/[slug]`, `/[slug]/hub` | Artist booking pages (noindex) | — | booking request (client audience) | artist's own bio | artist links | guest spot dates yes | **No** | **High: client audience.** A map link here would push clients into studio discovery and read as marketplace behaviour | None |
| Pill nav | Navigation | — | account creation | every marketing page | 4 destinations | no | **Yes, at flip only** | Low | **Gated desktop entry** |
| Footer | Navigation | — | — | every marketing page | 24 destinations | no | **Yes, at flip only** | Low | **Gated Product entry** |

Pages where a map reference is explicitly rejected: 13 of 22. **Not every marketing page
needs a map link**, and pushing one into deposits, reminders, waitlist, client management
or the booking form would be keyword-farming with no user journey behind it.

---

## 5. Navigation recommendation

### Chosen: Model D — one navigation, discovery earns its entry

1. **The pill nav is unchanged today.** At public-map flip it gains one desktop text link,
   `Map` → `/map`, next to `App` and `About`, rendered only when the gate is on.
2. **The footer Product group gains `Tattoo map` → `/map`**, `active: publicMapEnabled()`,
   so it renders nothing until the public route is real.
3. **The narrative work happens on pages, not in the nav**: a homepage discovery section
   and a `/guest-spot-booking` contextual section, both live today with account creation as
   the CTA.
4. **The authenticated app nav is untouched.** It already has `Tattoo map` and it is a
   separate system.

### Why not the alternatives

- **Model A (map alongside existing product features in the nav).** There are no product
  features in the marketing nav. `App`, `About`, `Log in`, `Get started` are a download
  page, a brand page and two auth actions. There is nothing to sit alongside.
- **Model B (Manage / Discover split).** Two independent problems. Mechanically it needs a
  dropdown or mega-menu and a mobile menu, none of which exist, so it is a full navigation
  rebuild for a capability that is not yet public. Strategically it is worse than doing
  nothing: a nav that literally reads "Manage | Discover" tells visitors Inklee is two
  products, which is the precise failure this brief asks to avoid. The map should read as a
  layer *of* the artist workflow.
- **Model C (a visible "Explore tattoo studios" entry now).** It would link a public page to
  a route that redirects anonymous visitors to `/login`, breaking the brief's own
  requirement, and it would be desktop-only with no mobile equivalent.

Model D delivers the narrative today at zero risk and pre-builds both nav entries behind
one flag, so the flip is an env change plus a deploy, not a design project.

### Map-specific navigation behaviour (for the flip)

The authenticated immersive shell renders its own full-screen chrome: a `/dashboard` logo
link, the authenticated `SIDEBAR_NAV` rail and `<MobileBottomNav inMapShell />`. A public
shell must **not** inherit any of that. It needs the marketing logo, a `Log in` and a
`Get started`, and nothing that implies an account already exists. That is public-shell
work, listed in §14 as a prerequisite, not built here.

---

## 6. Homepage recommendation

### Sequence

Current: hero (charcoal) → definition (bone) → features (charcoal) → how it works (mustard)
→ about (bone) → final CTA (rosa) → FAQ (charcoal).

Recommended: insert **one** section between "how it works" and "about", on charcoal.

1. Core booking and workflow promise (hero, unchanged, still leads)
2. What Inklee is (definition, unchanged)
3. The connected artist management system (features, unchanged)
4. Three steps (how it works, unchanged)
5. **The tattoo map: find the place, organize the guest spot** ← new
6. Built by artists (about, unchanged)
7. Conversion (final CTA, unchanged)
8. FAQ (+ one map item)

Why this slot and not the hero or the feature grid:

- The hero secondary CTA is `See a live example →`, which is the single strongest
  proof-of-product link on the site. Replacing or crowding it with a map link would trade a
  conversion asset for a utility link, and today the utility link does not even resolve.
- A seventh feature card would flatten the map into a peer of "Calendar and iCal" and lose
  the guest-spot connection, which is the whole point.
- Position 5 comes after the request-first promise has been stated three times, so it
  cannot be read as the main promise. It also sits directly before "built by artists",
  which makes the community line land naturally.
- Colour rhythm stays strictly alternating: mustard → charcoal → bone.

### What the section says

- **Eyebrow:** `The tattoo map`
- **Heading:** `Find the place. Organize the guest spot.`
- **Lead:** what the map is, artist-framed, no city names and no directory language.
- **Three cards** (the house charcoal-on-colour card pattern): search studios by city ·
  ask about a guest spot · claim your studio. Each is a shipped capability.
- **Community line:** the map gets more accurate every time an owner claims a page or an
  artist reports something that changed. Both loops are shipped, so this is product truth,
  not aspiration.
- **CTA:** account creation while the gate is off; `Open the tattoo map` primary with
  account creation secondary once the gate is on.

### No map screenshot, deliberately

- `app-travel-map.webp` is the **personal journey map**, a different feature.
- A real screenshot of the tattoo map would render seeded studio names and positions on a
  **public, non-authenticated page**, which is exactly what the open Q20 counsel note
  blocks. Publishing seeded data in an image is still publishing it.
- So the section mirrors the mustard "how it works" structure (heading left, cards right)
  and carries no illustration. This is an existing homepage pattern, not a new one.

---

## 7. Internal-link architecture

Gate column: **now** = ships live; **flip** = code exists, renders only when
`publicMapEnabled()` is true.

| # | Source | Destination | Placement | Anchor text | User intent | Conversion purpose | Priority | Devices | Gate |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | `/signup` | Homepage map section, primary button | `Get started free` | "I want this" | account creation (`home-map-signup`) | Primary | both | now |
| 2 | `/` | `/guest-spot-booking` | Homepage map section, secondary | `How guest spots work →` | "explain the workflow" | move into the owner page | Secondary | both | now |
| 3 | `/` | `/map` | Homepage map section, primary button (replaces #1 as primary; #1 becomes secondary) | `Open the tattoo map` | "let me look" | map → account wall (`home-map-explore`) | Primary | both | flip |
| 4 | `/guest-spot-booking` | `/signup` | New section, primary | `Create your booking link` | "I want this" | account creation (`gs-map-signup`) | Primary | both | now |
| 5 | `/guest-spot-booking` | `/map` | New section, primary (demotes #4 to secondary) | `Open the tattoo map` | "show me studios" | map → account wall (`gs-map-explore`) | Primary | both | flip |
| 6 | Footer (site-wide) | `/map` | Product group | `Tattoo map` | wayfinding | discovery entry | Secondary | both | flip |
| 7 | Pill nav | `/map` | Desktop text links | `Map` | wayfinding | discovery entry (`nav-map-explore`) | Secondary | desktop only | flip |
| 8 | `/download` | `/map` | — | — | — | — | — | — | **rejected now** (no truthful asset) |
| 9 | `/about` | `/map` | — | — | — | — | — | — | **deferred** to public launch |
| 10 | `/tattoo-booking-software` | `/map` | — | — | — | — | — | — | **rejected** (dilutes category ownership) |
| 11 | `/map` | `/guest-spot-booking` | Public shell empty/help state | `Organize the guest spot in Inklee` | artist who found a studio | move into the workflow | Secondary | both | public shell |
| 12 | `/map` | `/signup` | Account walls (watch, guest spot request, claim) | `Create an account to …` | account-gated action | **the main map conversion** | Primary | both | public shell |
| 13 | `/map` | `/studios/{slug}` | Pin detail | studio name | entity lookup | crawlable path to claimed profiles | Primary | both | not built |
| 14 | `/studios/{slug}` | `/map` | Studio page | `See it on the tattoo map` | context | back into discovery | Secondary | both | not built |
| 15 | Approved city page | `/studios/{slug}` | City list | studio name | local directory | entity lookup | Primary | both | not built |

Anchor-text discipline: no exact-match directory anchors (`tattoo studios in Berlin`,
`tattoo studio map`) anywhere, and no repeated `tattoo map` anchor across surfaces. Six
distinct anchors across seven live/flip links. Anchors are user-facing wayfinding, not
ranking levers, because the destination is `noindex` and owns no keyword.

**Link-direction rule.** Commercial pages link *into* the map only where travel or studio
context is genuinely present (the homepage discovery section and the guest spot page). The
map links *out* into studio discovery, claiming, watching, guest spot applications, account
creation and eligible claimed profiles. Nothing links from a client-facing surface
(`/[slug]`, `/[slug]/hub`, the client portal) into the map.

---

## 8. Conversion funnel

Account creation stays the single measured conversion. Client appointment booking is never
the goal.

### Artist

`marketing page (home or guest spot)` → `/map` → pan/search → open a studio →
watch **or** ask about a guest spot → **account wall** → `/signup` → onboarding →
`signup_completed` (carrying the first-touch `entry_path`, so the marketing page that
introduced the map is preserved) → back into the workflow.

Both gated actions are already account-gated in code (`toggleWatchCore` and
`submitGuestSpotRequestCore` both require an authenticated user), so the wall is real.

### Studio owner

`marketing page or shared map link` → `/map` → find the studio → sees an
`Unverified listing` notice and a `Claimed`/`Unclaimed` chip → `Claim this studio` →
**account wall** → `/signup` → `/studio/claim/[id]` → admin approval → publish the profile.
This is the acquisition loop the strategy describes: claims improve data quality, and data
quality is what could later unlock approved city pages.

### Client

`/map` → find a studio → read only owner-declared or clearly-labelled seeded facts →
follow the studio's own official website or social link. **No Inklee booking CTA on a
studio entry**, so nothing implies Inklee offers unrestricted client self-booking.

### CTA hierarchy and wording

| Surface | Primary | Secondary | Never |
|---|---|---|---|
| Homepage map section (gate off) | `Get started free` → `/signup` | `How guest spots work →` | any `/map` link |
| Homepage map section (gate on) | `Open the tattoo map` | `Get started free` | — |
| Guest spot section (gate off) | `Create your booking link` → `/signup` | — | any `/map` link |
| Guest spot section (gate on) | `Open the tattoo map` | `Create your booking link` | — |
| Public map (shell work) | `Create an account` on the watch / guest spot / claim walls | `Log in` | `Book an appointment` |
| Claimed studio profile | `Claim this studio` (owner) / `Ask about a guest spot` (artist, account-gated) | the studio's own website | any Inklee booking CTA |
| Unclaimed entry | `Claim this studio` | `Report an issue` | `LocalBusiness` schema, inferred styles, any verified badge |
| Navigation / footer | `Get started` stays the nav conversion | `Map` / `Tattoo map` as wayfinding | — |
| Empty state (no pins in view) | `Zoom out or search a city` | `Suggest a studio` (when built) | fabricated counts |
| Account wall | `Create an account to watch this studio` (verb matched to the action) | `Log in` | generic `Sign up` |

Wording rules: no em-dashes, sentence case, `Accept`/`Pass` never appear here (they are
booking-flow verbs), no studio counts (the number moves and the rollout is paused), no
`best`, no ratings, no reviews.

---

## 9. SEO safeguards

### `/map`

1. `noindex, follow` — inherited today from `(artist)/layout.tsx` (which is
   `index: false, follow: false`). **When the public shell lands outside `(artist)`, it will
   be indexable by default**; it must set `robots: { index: false, follow: true }`
   explicitly. `follow: true` is required, not cosmetic: the strategy asks crawlers to
   follow links to eligible claimed studio profiles.
2. Self-referencing canonical `/map`, with **no** `ll`, `z`, `f` or `sel` parameters. The
   URL codec already promises "a deep link must be reconstructable by any visitor", and
   those four params must never reach a canonical.
3. **Out of the sitemap** — that means out of `MARKETING_ROUTES`, which is the only path
   into both the sitemap and IndexNow. Now covered by a unit test.
4. **No IndexNow submission** — same guarantee, same list.
5. **Do not add `/map` to `robots.ts` disallow.** A `Disallow` would stop crawlers reading
   the `noindex` tag *and* stop them following links to claimed profiles, defeating both
   requirements at once. Its current absence from the disallow list is correct.
6. No indexable query combinations: filter, style, category, guest-spot status, bounds and
   selection stay interaction state.
7. `/map/s/{location-id}` (if built) is `noindex, follow`, out of the sitemap.

### Claimed studio profiles

Not implemented, and must not be until the full eight-point gate in the canonical strategy
passes. Two hard blockers beyond that gate, both verified in code:

- `studio_profiles.slug` is unique but **null for every row** and no code writes it. A slug
  generation, collision and immutability decision must come first.
- **No data-source attribution exists on any pin or detail page.** `map_locations` has no
  attribution column; the Overture/CDLA string lives only on `map_seed_candidates`. Gate
  item 7 ("public licensing attribution ... active") therefore cannot currently be
  satisfied.

### Unclaimed entries

`noindex, follow`, out of the sitemap, no `LocalBusiness` schema, no inferred styles,
services, artists, reviews or guest spot availability. The shipped `Unverified listing`
and `Possibly closed` notices are the correct honesty surface and should be preserved
verbatim on any public plane.

### City and style pages

Not built, not indexed, no route, no allowlist. Out of scope here.

### Structured data

No new structured data added. `lib/jsonld.ts` gains nothing. The homepage keeps
`SoftwareApplication` + `FAQPage`; the added FAQ item enters the existing visible FAQ and
the same schema array, so visible content and markup stay in lockstep. No
`LocalBusiness`/`Place` builder is introduced, because no page may legitimately emit one yet.

### Ownership preserved

`/guest-spot-booking` keeps `tattoo guest spot organizer`; `/tattoo-booking-software` keeps
the category; `/tattoo-booking-form` keeps request/intake; `/tattoo-artist-booking-page` and
`/tattoo-studio-booking-software` remain the future owners of their intents. The new copy
introduces no `tattoo studios in {city}`, `tattoo studio map`, `tattoo shops near me`,
`guest spot studios in {city}` or `best studio` phrasing.

---

## 10. Analytics requirements

### Shippable now (zero infrastructure change)

`TrackedCtaLink` with new `cta` ids. `trackEvent` applies no allowlist to caller props and
merges first-touch attribution plus `current_path` automatically, so a new id flows end to
end and **account creation stays attributable to the marketing page that introduced the
map**.

| `cta` id | Fires on | Destination | Gate |
|---|---|---|---|
| `home-map-signup` | homepage map section | `/signup` | now |
| `home-map-explore` | homepage map section | `/map` | flip |
| `gs-map-signup` | guest spot map section | `/signup` | now |
| `gs-map-explore` | guest spot map section | `/map` | flip |
| `nav-map-explore` | pill nav `Map` | `/map` | flip |

These are registered in `docs/seo/conversion-measurement.md`. Plausible only *displays*
registered custom properties, but `cta` is already on the founder's registration list, so
new values need no dashboard change.

### Required at public-shell time (must not be forgotten)

1. **Carve `/map` out of `collector.ts` `PRIVATE_PREFIXES`.** Until then the first-party
   collector records nothing for `/map`, so the map is invisible in `/admin/growth`
   Acquisition. Do this in the public-shell slice, not before: today `/map` traffic is
   authenticated artists and would pollute acquisition data. The public shell should signal
   the public view explicitly rather than making the whole path public.
2. **Add each new public event to `public-analytics/event-registry.ts`.** The registry is a
   hard allowlist that discards **the whole event** and still answers `202`;
   `recordPublicServerEvent` logs nothing. An unregistered event or an off-enum prop value
   is a silent total loss. Candidate names: `public_map_opened`,
   `map_to_signup_clicked`, `studio_claim_started`, `studio_claim_completed`,
   `map_wall_opened` (prop `action: watch | guest_spot`), `claimed_studio_viewed`,
   `studio_website_clicked`.
3. **Privacy constraints on those props.** No coordinates, no bounding boxes, no city
   names at a granularity finer than the existing `MIN_ANON_ARTIST_COUNT = 3` floor allows,
   no studio names, no user identifiers. Prop values are capped at 80 characters by the
   registry, which is a helpful natural limit.
4. **No second analytics platform.** Plausible stays the only third-party vendor.
5. Existing latent issue worth noting to the owner: `pricing_viewed` is
   `clientEmittable: false` with a comment saying `/pricing` does not exist, while
   `/pricing` now does. Any emitter added today is silently dropped. Out of scope here.

---

## 11. Accessibility considerations

The added marketing sections are plain semantic HTML and inherit the existing patterns:
`<section>` with a real `<h2>`, `<h3>` on cards, decorative images `aria-hidden` with empty
`alt`, and CTAs as real links so they are keyboard focusable and in DOM order. No new
interactive widget, no custom focus management, no motion, so nothing new to trap or
announce. Colour pairs are the existing token pairs (charcoal on mustard/bone/rosa,
`shell-fg` on `shell-bg`), already used site-wide.

The FAQ items use the existing `<details>`/`<summary>` pattern, which is natively keyboard
operable.

**On the map's own accessibility, read the code, not the older audit.** The a11y gap list
in `docs/product/inklee-2-map-redesign-audit-and-plan.md` §15 was written 2026-07-22 and
predates the immersive shell and the 2026-07-25 tablet/mobile pass, so several of its
items are now closed. Verified in code on 2026-07-26:

- **Closed:** an accessible list alternative exists (`viewMode` map/list with a real
  `<ul role="list">`, `immersive-map-shell.tsx:115,387`), and the toggle carries
  `aria-pressed`; the detail panel is a real `role="dialog"` and moves focus to itself
  (`map-detail-panel.tsx:66,103`); `prefers-reduced-motion` gates the camera animations
  (`core/map-canvas.tsx:71-75,166-173`); `env(safe-area-inset-bottom)` is used
  (`immersive-map-shell.tsx:338`).
- **Still open and inherited by a public shell:** pins are GL layers and not in the DOM,
  so the canvas itself has no keyboard path to a pin; and the search box has working
  arrow/enter/escape handling but no ARIA combobox wiring (no `role="combobox"`,
  `aria-expanded`, `aria-controls`, `role="listbox"`/`option`, `aria-activedescendant`).

The list view is also the crawlable DOM a claimed studio page would eventually need.

---

## 12. Mobile and desktop considerations

- The homepage section uses the existing `md:grid-cols-[5fr_7fr]` pattern: single column on
  mobile with the heading above the cards, two columns from `md`. Cards stack.
- The guest spot section uses the same `md:grid-cols-[5fr_7fr]` split (heading left, the
  two paragraphs and the CTA row right), single column below `md`, with a wrapping CTA row.
- **The footer entry appears on both** (the footer grid is `grid-cols-2` on mobile).
- **The pill nav entry is desktop-only**, because every marketing nav text link is
  `hidden ... sm:inline-block` and no mobile menu exists. Mobile reaches the map via the
  homepage section, the guest spot section and the footer. This asymmetry is pre-existing
  and applies equally to `App` and `About`; it is recorded in §13 as a proposal, not
  silently accepted as good.
- The footer grid column count is derived (`MD_GRID_COLS[groups.length + 1]`). Adding an
  item to an existing group does not change the group count, so the grid is unaffected.
- Public-shell mobile behaviour (full-bleed canvas, bottom sheet, safe-area handling) is
  public-shell work, but it inherits a shell that already does this: the immersive shell
  uses `env(safe-area-inset-bottom)` and got a dedicated tablet/mobile pass on 2026-07-25.

---

## 13. Risks and cannibalization review

| Risk | Severity | Assessment | Mitigation |
|---|---|---|---|
| Broken links: public pages pointing at a route that redirects anonymous visitors to `/login` | **Blocker** | Real. `/map` is authenticated-only. | Every `/map` link is behind `publicMapEnabled()`, which is fail-closed and AND-ed with `tattooMapEnabled()`. Unit-tested. |
| Publishing seeded studio data publicly before Q20 clears | **Blocker** | Real, and it includes screenshots. | No map imagery on marketing. No seeded name, address or count in copy. |
| Repositioning Inklee as a client self-booking marketplace | High | Guarded by scope (`docs/inklee-feature-scope.md`: "Not a client-facing marketplace or discovery platform ... the map is artist-facing discovery of studios and shops"). | All new copy is artist-framed (guest spots, claiming, travel). No "find a tattoo artist near you". No map link on any client-facing surface. |
| "Two unrelated businesses" impression | High | This is what a Manage/Discover nav split would have caused. | Model D. The map is introduced as the step before the guest spot workflow, on pages that already own that workflow. |
| Cannibalizing `/guest-spot-booking` | Medium | The new copy is product-capability copy on the owner page itself, so it cannot compete with it. No new URL, no city pages, no `tattoo guest spot booking` directory anchor. | Verified: no new indexable page, no `MARKETING_ROUTES` entry. |
| Diluting `/tattoo-booking-software` category ownership | Medium | Would happen if discovery copy were added to the pillar. | Explicitly rejected; the hop is pillar → guest spot → map. |
| Homepage promise drift away from request-first | Medium | Position 5 of 8, after the promise is stated three times; hero untouched. | Sequence in §6. |
| Future `/find-guest-spot-studios` or `/tattoo-studios` marketing page being minted by a later session | Medium | No guardrail exists today; "guest spot host discovery" has no named owner in the canonical strategy. | Proposal filed to name `/guest-spot-booking` as the owner in copy form, foreclosing a new URL. |
| Accidental indexation of a public `/map` | High at flip | A public shell outside `(artist)` is indexable by default. | §9 item 1, plus the sitemap/IndexNow regression test. |
| Accidental `MARKETING_ROUTES` addition auto-submitting to IndexNow | High | Adding a row pushes it to Bing/Yandex. | Regression test asserts `/map`, `/studios`, `/tattoo-studios` and any query-string path are absent. |
| Marketing claiming a capability that a flag can remove | Medium | `NEXT_PUBLIC_TATTOO_MAP` off makes `/map` render the legacy personal journey map instead of 404ing, so the tattoo map would silently not exist. | All map copy is gated on `tattooMapEnabled()`, including the FAQ items so visible content and FAQ schema stay in lockstep. |
| Map invisible in acquisition analytics after the flip | Medium | `/map` is in `PRIVATE_PREFIXES`. | §10 item 1, scheduled into the public-shell slice. |
| Mobile has no nav entry for the map | Low | Pre-existing: mobile has no nav entries at all. | Recorded; a mobile menu is a separate proposal, not smuggled in here. |
| `MAP_PINS_V2` accidentally flipped on | Medium | Validated-bad, still wired into both web and mobile pin routes. A public map raises wide-viewport traffic. | Out of scope, but noted: it must stay off. |

---

## 14. Recommended implementation slices

The brief's suggested order was nav → homepage → guest spot → supporting → analytics.
**Challenged and reordered**, because nav-first is the least valuable slice today: it must
ship completely dark, so it delivers nothing on its own and cannot be visually verified.

- **Slice 1 — gate primitive plus dark structural entries.** `publicMapEnabled()`,
  the shared CTA resolver, the footer Product entry, the pill nav entry, and the regression
  tests. All map links dark. No SEO or indexation change. Small and fully unit-testable.
- **Slice 2 — homepage integration.** The discovery section plus one FAQ item, live,
  capability-framed, account-creation CTA, gate-aware.
- **Slice 3 — guest spot and travel integration.** The compact contextual section plus one
  FAQ item on `/guest-spot-booking`, live, gate-aware.
- **Slice 4 — supporting pages.** Deferred by this audit: `/download` needs a real native
  tattoo-map screenshot; `/about` waits for the public launch so the community framing has
  a product surface behind it.
- **Slice 5 — analytics and validation.** CTA id registration in
  `docs/seo/conversion-measurement.md`, sitemap/robots regression tests, and the
  public-shell analytics checklist (collector carve-out plus event-registry entries) written
  down as prerequisites.
- **Slice 6 — the public shell. POSTPONED by founder direction 2026-07-26**, pending a
  dedicated map future-scope pass. Not blocked: every legal gate closed the same day. The
  hold is sequencing, because future map features may change go-live decisions and a public
  surface is expensive to redesign afterwards. Order is scope, then slices, then go-live,
  then features step by step (`docs/roadmap.md` §1). Prerequisites when it does start:
  Prerequisites, now all engineering: the studio-data credit component and the
  `/data-attribution` page (licence texts + Foursquare NOTICE + "modified by Inklee"
  change statement), the GDPR Art. 14/21 surface on that same page, per-row provenance
  carried to `map_locations`; an anonymous branch on all four
  `/api/map/*` routes (today they `401` and every client `catch` swallows the failure, so a
  naive public reuse renders a silently empty map); plane-1 caching and per-IP rate
  limiting; public-presence consent for the artists-in-town layer; public chrome that does
  not inherit the authenticated rail; `robots: { index: false, follow: true }`; the
  collector carve-out; and enforcement of the four `MapCapabilities` fields that are
  declared but never read (`isPublic`, `canClaim`, `canApplyGuest`, `canSeeNamedArtists`).

Slices 1 to 3 and 5 are implemented in this change. Slice 4 is deferred with reasons.
Slice 6 is out of scope.

---

## 15. Files likely to change

Implemented here:

- `apps/web/src/lib/map-features.ts` — add `publicMapEnabled()`.
- `apps/web/src/lib/map-marketing.ts` (new) — the single gate-aware CTA resolver.
- `apps/web/src/lib/__tests__/map-marketing.test.ts` (new) — gate, resolver, sitemap,
  robots and footer regression tests.
- `apps/web/src/lib/footer-links.ts` — gated `Tattoo map` entry in Product.
- `apps/web/src/components/marketing-v2/pill-nav.tsx` — gated desktop `Map` link.
- `apps/web/src/app/page.tsx` — the discovery section, one FAQ item.
- `apps/web/src/app/guest-spot-booking/page.tsx` — the contextual section, one FAQ item.
- `docs/marketing/public-map-marketing-integration-audit.md` (this file).
- `docs/seo/inklee-seo-strategy.md` — one entry under `## Proposed strategic changes`.
- `docs/seo/seo-implementation-log.md` — the slice record.
- `docs/seo/conversion-measurement.md` — the new `cta` ids.
- `docs/web-native-parity.md` — a row for the marketing integration.

Not changed, listed so a later session knows where the public-shell work lands:
`apps/web/src/lib/marketing-routes.ts`, `app/sitemap.ts`, `app/robots.ts`, `lib/jsonld.ts`,
`lib/indexnow.ts`, `lib/public-analytics/{collector,event-registry}.ts`,
`app/api/map/*/route.ts`, `packages/shared/src/map-core-state.ts`, `app/download/page.tsx`,
`app/about/page.tsx`.

---

## 16. Explicitly rejected ideas

1. **A dedicated indexable marketing page for the map** (`/tattoo-map`,
   `/find-guest-spot-studios`, `/explore`). Duplicates `/map`, mints an intent owner the
   strategy deliberately withheld, and has no distinct SERP intent that is not already
   owned.
2. **A Manage / Discover navigation split.** Needs a nav system that does not exist and
   actively communicates "two products".
3. **A visible `/map` link anywhere while the public route is authenticated-only.**
4. **Any map screenshot on a marketing page before Q20 clears.** Publishing seeded studio
   data in an image is still publishing it.
5. **Relabelling `app-travel-map.webp` as the tattoo map.** It is the personal journey map.
6. **Map references on deposits, reminders, waitlist, client management, the booking form,
   the comparison pages or the guides.** No contextual connection; keyword farming.
7. **A map link on `/tattoo-booking-software`.** Dilutes category ownership; the correct
   hop is via `/guest-spot-booking`.
8. **A map link on `/[slug]` or `/[slug]/hub`.** Client audience; would read as
   marketplace behaviour and contradict the scope guardrail.
9. **Adding `/map` to `MARKETING_ROUTES`** "so it can be tracked". That is the IndexNow
   foot-gun.
10. **Adding `/map` to `robots.ts` disallow** "to be safe". It would block the `noindex`
    tag and the follow path to claimed profiles.
11. **`LocalBusiness` / `TattooParlor` structured data anywhere.** No page may legitimately
    emit it yet.
12. **Studio counts in marketing copy** ("71,000 studios"). The number moves, the rollout is
    paused at 16 countries, and roughly 17% of seeds are materially wrong.
13. **"Experimental" as the marketing label.** Reads unfinished, buys no legal cover, and
    describes a banner that does not exist in the product.
14. **A second analytics platform or a Meta Pixel** for map funnel measurement.
15. **Removing `/map` from `PRIVATE_PREFIXES` now.** It would record authenticated artist
    traffic as public acquisition.

---

## 17. Open founder decisions

Only two, and neither blocks this change.

1. **When to flip `NEXT_PUBLIC_PUBLIC_MAP`.** The licensing gate closed 2026-07-26, so
   this is now an engineering readiness call: not before the studio-data credit component,
   the `/data-attribution` page and the GDPR Art. 14/21 surface ship, *and* the public
   shell exists. Flipping it while `/map` is still authenticated-only would publish nav,
   footer and CTA links that redirect anonymous visitors to `/login`. The flag is
   fail-closed and AND-ed with `tattooMapEnabled()`, so the only way to get this wrong is a
   deliberate premature flip.
2. **Whether the marketing nav gets a mobile menu.** Today no marketing nav text link is
   reachable on mobile, including `App` and `About`. At public-map flip the `Map` entry
   inherits that limitation. This is a pre-existing IA gap; fixing it is a separate design
   decision and was not smuggled into this change.

Tracked elsewhere, not decisions for this audit: Q20 licensing (counsel), the
`/studios/{slug}` slug decision, the per-pin data-source attribution build gap, and the
ChatGPT ratification of the filed proposal.
