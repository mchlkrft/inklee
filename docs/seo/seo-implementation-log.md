# Inklee SEO Implementation Log

This file records completed technical and content implementation.

Strategic decisions belong in `inklee-seo-strategy.md`.

## Entry format

```markdown
### YYYY-MM-DD — Short implementation title

**Implemented by:** Claude Code

**Related strategy section:**

**Files changed:**

**Implementation:**

**Validation performed:**

**Remaining issues:**

**Commit:**
```

---

### 2026-07-26 — Tattoo map integrated into the marketing narrative (no indexation change, public links gated)

**Implemented by:** Claude Code

**Related strategy section:** "Public tattoo map and local studio discovery" (all guardrails preserved: `/map` stays `noindex, follow`, out of the sitemap, with no keyword ownership); "Relationship to existing owned URLs"; cannibalization rules; "New-page gate" (**not triggered** — no new indexable page). One entry filed under "Proposed strategic changes" (2026-07-26 guest-spot-host-discovery ownership guardrail), not applied.

**Files changed:** `apps/web/src/lib/map-features.ts`, `apps/web/src/lib/map-marketing.ts` (new), `apps/web/src/lib/__tests__/map-marketing.test.ts` (new), `apps/web/src/lib/footer-links.ts`, `apps/web/src/components/marketing-v2/pill-nav.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/guest-spot-booking/page.tsx`, `docs/marketing/public-map-marketing-integration-audit.md` (new), `docs/seo/inklee-seo-strategy.md` (proposal only), `docs/seo/conversion-measurement.md`, `docs/web-native-parity.md`, this log.

**Implementation:** Full marketing-architecture audit first (`docs/marketing/public-map-marketing-integration-audit.md`: 22 indexable pages inventoried, page-by-page map-reference recommendations, navigation model comparison, internal-link table, conversion funnel, SEO safeguards, analytics requirements, 15 explicitly rejected ideas). The audit's load-bearing finding is that **the public map does not exist**: every map route is under `(artist)/`, whose layout redirects anonymous visitors to `/login`, all four `/api/map/*` handlers 401 without a cookie user, and the public shell is still blocked on Q20 licensing (counsel note open). So the integration splits by what is true today.

Live now, gated only on `tattooMapEnabled()` so marketing can never advertise a killed feature: a homepage discovery section between "How it works" and "About" (eyebrow "The tattoo map", H2 "Find the place. Organize the guest spot.", three cards over shipped capabilities only — look up a city, ask about a guest spot, claim your studio — plus the community line backed by the shipped claim and correction loops), one homepage FAQ item, and a compact contextual section on `/guest-spot-booking` ("Before the requests" / "Find the studio. Then fill the trip.") plus one FAQ item there. The guest-spot section closes the loop back into the page's own intent (a confirmed spot materializes a trip, so its dates reach the booking page and client requests arrive against the right trip). The copy says "dates", not "city and dates": `finishAcceptance` materializes the leg without a `studios` row, and every public location label on `/[slug]` derives from that join, so a guest-spot trip renders dates only. The adversarial review caught the first draft overclaiming here; the pre-existing homepage and `/download` copy about manually entered trips showing a city stays correct, because those legs do carry a studio. Both FAQ additions append to the same array that feeds the visible section and `faqPageSchema`, so markup and visible content stay in lockstep. Deliberately **no map imagery**: `app-travel-map.webp` is the personal journey map, and a real map screenshot would publish seeded studio names on a public page, which is what Q20 blocks.

Dark until the public route exists: new `publicMapEnabled()` = `tattooMapEnabled() && NEXT_PUBLIC_PUBLIC_MAP === "true"` (fail-closed, AND-ed so a stray public flag cannot publish links on its own), a single gate-aware CTA resolver (`lib/map-marketing.ts`) so no page hand-rolls the destination, a `Tattoo map` footer entry in Product (`active: publicMapEnabled()`), and a desktop `Map` entry in the pill nav. Chosen IA model is "one navigation, discovery earns its entry": the Manage/Discover split was rejected because the marketing nav has no dropdown and no mobile menu at all, and because a nav that reads Manage | Discover tells visitors Inklee is two products.

Indexation untouched: no `MARKETING_ROUTES` change, no sitemap change, no IndexNow submission, no robots change, no canonical change, no new structured data, no `LocalBusiness`. `/download` and `/about` were evaluated and **deferred** (no truthful native tattoo-map screenshot exists; the community framing needs the public surface behind it). Map references were explicitly rejected on the pillar, deposits, reminders, waitlist, client management, booking form, comparison pages, guides, and all client-facing `/[slug]` surfaces.

Analytics: four new `cta` values on `marketing_cta_click` (`home-map-signup`, `home-map-explore`, `gs-map-signup`, `gs-map-explore`) plus `nav-map-explore` at flip, registered in `conversion-measurement.md`. `trackEvent` applies no allowlist to caller props and merges first-touch attribution automatically, so account creation stays attributable to the marketing page that introduced the map with zero infrastructure change.

**Validation performed:** `pnpm typecheck` clean; `pnpm lint` 0 errors (15 pre-existing warnings, none in touched files); `pnpm test` 1532 passed across 94 files (+17 new); production `next build` clean, with `/` and `/guest-spot-booking` unchanged in rendering mode (both were already dynamic `ƒ`, like every other marketing page, because the root layout reads cookies). New tests cover the gate truth table (including `"1"` rejected and each flag alone rejected), the CTA resolver in both modes, absence of any `/map` href in the rendered footer while dark, and first-ever regression coverage for the indexation safeguards: `/map` and any `/map/*`, `/studios*`, `/tattoo-studios*` and any query-carrying path absent from `MARKETING_ROUTES`/`MARKETING_URLS`, `/pricing` still absent, and `/map` deliberately **not** in `robots.ts` disallow (a Disallow would block the `noindex` tag and the follow path to claimed profiles). Playwright screenshots at 1440px and 390px with the map flag on and the public flag off confirmed the section renders, the colour alternation holds, no horizontal overflow on mobile, and no `/map` link exists anywhere in the public DOM; a second pass with the public flag on confirmed the nav, footer and CTA entries appear and point at `/map`. Keyboard tab order verified through both new sections. Em-dash sweep of the full diff: zero in visible copy.

**Remaining issues:** The public shell itself is out of scope. Its data-licensing gate (Q20) is now **closed**: answered 2026-07-24 as attribution-only, then corrected and re-confirmed 2026-07-26 after the verification sweep that answer required found 3,582 approved studios (5.0%) are OSM-derived via a direct Overpass lane. Counsel re-affirmed attribution only on the true facts; the credit string now restores OpenStreetMap (`docs/counsel-note-public-map-osm-correction-2026-07-26.md` §8). Remaining blockers are engineering: the studio-data credit component, the `/data-attribution` page, the GDPR Art. 14/21 surface, per-pin data-source attribution, an anonymous branch on the four `/api/map/*` routes, plane-1 caching and per-IP rate limiting, public chrome that does not inherit the authenticated rail, explicit `robots: { index: false, follow: true }` since a route outside `(artist)` is indexable by default, and enforcement of the four declared-but-unread `MapCapabilities` fields). Two analytics items must land in that same slice or the map is invisible in acquisition: carve `/map` out of `collector.ts` `PRIVATE_PREFIXES`, and register every new public event in `public-analytics/event-registry.ts` (its allowlist discards the whole event and still answers 202, and `recordPublicServerEvent` logs nothing). `/download` and `/about` await a real native tattoo-map screenshot and the public launch respectively. The filed strategy proposal awaits ChatGPT ratification; nothing is blocked on it.

**Commit:** _(added on commit; see `feat(marketing): integrate the tattoo map into the marketing narrative`)_

---

### 2026-07-25 — Public `/pricing` page (noindex, fail-closed) for the Plus consumer launch

**Implemented by:** Claude Code

**Related strategy section:** New-page gate (not triggered as an indexable addition — the page ships `noindex, follow`, out of the sitemap, per the `/map` fail-closed convention); "Proposed strategic changes" (new proposal filed: index `/pricing` + assign pricing-intent ownership, awaiting ChatGPT ratification).

**Files changed:** `apps/web/src/app/pricing/page.tsx` (new), `docs/seo/inklee-seo-strategy.md` (proposal entry), this log.

**Implementation:** Founder-requested public pricing page for the Plus consumer launch, layout from the founder's card template mapped onto the marketing-v2 design tokens: charcoal hero ("Pricing" / "Three options. The free one is genuinely useful.", the founder's own business-model.md §7 draft copy), a bone plans section with three cards (Free Starter on `#d9d4c7`, Inklee Plus featured on charcoal with the mustard CTA, Studio as an honest "Coming later" teaser with the planned 25 EUR direction and no feature checklist for unshipped functionality), the founder's honesty footer line, a charcoal FAQ (6 items, same array feeds the visible section and `faqPageSchema`), and a rosa final CTA. Prices are the counsel-shown, founder-ratified set: Free 0 EUR; Plus 3 EUR/month with the approved display sentence "3.00 EUR per month, final price. No VAT added. Renews monthly until you cancel."; no monthly/yearly toggle (yearly is not built; the founder's own draft bans save-percent framing). Plus bullets match the shipped PLUS_BENEFITS strings plus the card-deposit line with the 3% disclosure framing. `WebPage` + `FAQPage` JSON-LD via the shared serializer. Robots `index: false, follow: true`, self-canonical `/pricing`, NOT added to `MARKETING_ROUTES` (sitemap/IndexNow). The whole page is gated on `PLUS_CONSUMER_LAUNCH_ENABLED` (404s in production until the consumer launch flips), so paid plans are never publicly shown before Plus is purchasable. `pricing` was already a reserved slug. CTA tracking: `pricing-free-signup`, `pricing-plus-signup`, `pricing-final-signup` (account creation stays the conversion).

**Validation performed:** Web `tsc` + lint + em-dash sweep of the diff; visual check on the local dev server with the launch flag on; copy cross-checked against the counsel-shown pricing table, the shipped plan-page strings, and the AGENTS.md copy rules (sentence case, accept/pass verbs, no em-dashes).

**Remaining issues:** Indexation + sitemap entry + footer/spine internal links wait on the ChatGPT ownership ratification (proposal filed) and on the launch flip; at flip, also decide the footer link placement. Yearly pricing appears only as "Yearly billing is coming" until the yearly plan ships.

**Commit:** the 2026-07-25 `feat(seo)` commit this entry ships in (public `/pricing` page, noindex fail-closed).

---

### 2026-07-15 — Play Store app name: SEO alignment check + founder decision

**Implemented by:** Claude Code

**Related strategy section:** "Mobile app" (`/download` owns web app-download conversion; the Play listing is a store surface, not an indexable inklee.app page — no keyword-ownership change). Core positioning guardrail applied: never present Inklee as unrestricted client self-booking.

**Files changed:** `docs/play-console-setup.md`, `docs/mobile-store-assets.md` (name decision recorded; both are docs, not pages).

**Implementation:** Checked the store title candidates from `docs/mobile-store-assets.md` §F against the canonical strategy. `Inklee: Tattoo bookings` (23/30) carried the owned category vocabulary but omitted the audience term; in Play search cards a title without "artist" reads as a client-facing booking app, inviting wrong-audience installs (clients hit the login wall, churn, and rate poorly), which conflicts with the strategy's audience definition and the anti-self-booking guardrail. Recommended `Inklee: Tattoo artist bookings` (30/30, §F option): tokenizes into `tattoo artist` + `bookings`, covering both owned phrase families ("tattoo artist booking app", "tattoo booking app") in the strongest ASO field. Founder signed off same day and created the Play app under that name.

**Validation performed:** Char-limit check (30/30); cross-checked against strategy keyword families, the cannibalization rules (no new indexable URL involved), and Play title policy (no promo/superlative terms).

**Remaining issues:** None for the name. Store listing copy itself lifts verbatim from §F (already char-verified).

**Commit:** (docs committed with the Play Console walkthrough follow-up)

---

### 2026-07-14 — /download founder polish pass (spacing, copy trims, visuals)

**Implemented by:** Claude Code

**Related strategy section:** "Mobile app" (`/download` owns mobile/app-download conversion). No keyword-ownership or metadata changes.

**Files changed:** `apps/web/src/app/download/page.tsx`, `apps/web/public/branding/app/app-artist-shop.webp` (replaced), `apps/web/public/branding/illustrations/reaper-spiderweb-key-visual.svg` (new).

**Implementation:** Founder-requested polish. Desktop hero mockup 10% smaller (420px → 378px) with reduced top padding; desktop hero now hugs content instead of filling the viewport, tightening the gap to the features section (features top padding also reduced). Feature-card bodies shortened (dropped trailing filler sentences; kept the keyword-bearing phrases: booking requests/books, guest spot/booking link, flash/booking page). Steps-section key visual swapped to the reaper spiderweb brand illustration. Step numbers 01/02/03 recolored from charcoal/12 (invisible on the dark rendering) to mustard. Artist-shop gallery mockup replaced with the product-detail shot (silkscreen print with sizes), converted from the founder PNG via the same flood-fill alpha extraction (reusable script now at `.scratch/make-app-mockup-webp.cjs`, 67KB WebP); alt text updated to describe the new screen. "Built by a tattoo artist" eyebrow changed to "Built by an artist" (founder wording).

**Validation performed:** Playwright full-page screenshots at 1440px before/after; new WebP composited over charcoal (transparent background, baked shadow intact, no punched-out UI text); all three gallery phones verified rendering; copy checked against AGENTS.md rules (no em-dashes, sentence case, terminal punctuation). Pre-existing hydration warning confirmed present on the untouched homepage (not introduced here).

**Remaining issues:** None. No new indexable pages; titles, descriptions, canonicals, and sitemap untouched.

**Commit:** _(added on commit; see `feat(download): founder polish pass`)_

---

### 2026-07-13 — Real app mockups on /download (hero + screens gallery)

**Implemented by:** Claude Code

**Related strategy section:** "Mobile app" (`/download` owns mobile/app-download conversion); "Future product gates → Artist shop" (showcase-only copy).

**Files changed:** `apps/web/public/branding/app/` (new: `app-dashboard.webp`, `app-travel-map.webp`, `app-calendar.webp`, `app-artist-shop.webp`), `apps/web/src/app/download/page.tsx`, `apps/web/src/app/download/device-preview.tsx` (deleted), `apps/web/src/app/dm-chaos/page.tsx` (stale comment only).

**Implementation:** Replaced the CSS faux-phone placeholder in the `/download` hero with the founder's real dashboard mockup (LCP preload added, descriptive keyword-bearing alt text) and added a "Straight from the app" gallery section with the travel map, calendar, and artist shop mockups. Assets are transparent WebP (1080x1607, 50-104KB, quality 82) derived from the founder's PNG exports via flood-fill alpha extraction (exterior white to alpha-0, soft shadow band to black-with-alpha), because the SVG exports carry broken x-offsets on centre-anchored text ("23", "Pending" chips) and are not safe to rasterize. Phones sit directly on the charcoal sections with their baked shadows. Shop caption uses showcase-only language (no checkout/selling claims, goods remain showcase-only per the product gate).

**Validation performed:** `pnpm typecheck` and eslint clean; alpha-extracted renders composited over charcoal and compared against the founder's PNG exports (pixel-correct text, shadows intact); Playwright screenshots of `/download` at 1440px and 390px confirm layout and lazy-loading; copy checked against AGENTS.md rules (no em-dashes in visible strings, sentence case, terminal punctuation).

**Remaining issues:** None. No new indexable pages; no metadata changes.

**Commit:** master, 2026-07-13 — `feat(download): real app screenshot mockups replace the faux CSS phone`.

---

### 2026-07-06 — Instagram data-deletion status page (noindexed utility URL)

**Implemented by:** Claude Code

**Related strategy section:** New-page gate (not triggered — the page is excluded from the indexable inventory).

**Files changed:** `apps/web/src/app/instagram/data-deletion/page.tsx` (new).

**Implementation:** Added `/instagram/data-deletion`, the confirmation-status page Meta's data-deletion callback links to (Meta App Review requirement, not a marketing page). `robots: { index: false, follow: false }` per the auth/request-page convention; not added to the sitemap; no internal links from indexable pages.

**Validation performed:** Confirmed the sitemap remains the curated list (page not referenced); noindex metadata matches the existing utility-page convention.

**Remaining issues:** None.

**Commit:** feat/instagram-meta-review-prep (Meta review prep slice).

---

### 2026-07-02 — Strategy narrowed to the hybrid execution model

**Implemented by:** Claude Code (approved ChatGPT strategy, applied as written)

**Related strategy section:** "Execution priority" (full replacement), status changes, decision log.

**Files changed:** `docs/seo/inklee-seo-strategy.md`.

**Implementation:** Replaced the execution-priority section with the approved hybrid model (P0 measurement + existing-page completion, P1 two validated feature pages, P2 guide validation, P3 validation-gated routes, SERP-overlap rules, comparison-page rule, UK terminology rule, future product gates, P4). Moved booking-management, appointment-calendar, and the booking-form template to "To build (validate)". Added the decision-log entry.

**Validation performed:** Diff review (docs-only); statuses cross-checked against live routes.

**Remaining issues:** None.

**Commit:** `cbace22`

---

### 2026-07-02 — Search Console baseline framework

**Implemented by:** Claude Code

**Related strategy section:** P0 "Google Search Console baseline".

**Files changed:** `docs/seo/gsc-baseline.md` (new).

**Implementation:** Full baseline structure anchored to the 2026-07-02 repositioning: 18-URL baseline inventory (plus the four post-baseline additions), query/page/cannibalization/regional/indexing tables, branded-classification rule, and exact founder export steps. No numbers invented.

**Validation performed:** URL inventory generated from `marketing-routes.ts` and cross-checked against the built sitemap.

**Remaining issues:** Numeric data requires the founder's GSC export (steps in the doc); next review 2026-08-02.

**Commit:** `f42dda5`

---

### 2026-07-02 — Conversion measurement (marketing to completed signup)

**Implemented by:** Claude Code

**Related strategy section:** P0 "Conversion measurement".

**Files changed:** `apps/web/src/lib/track.ts`, `track-server.ts`, `analytics-gates.ts` + `analytics-gates.test.ts` (new); `components/analytics-bootstrap.tsx`, `tracked-cta-link.tsx`, `attribution-fields.tsx` (new); `app/layout.tsx`; signup page + `google-auth-button.tsx`; `onboarding/done/page.tsx` + `signup-completed-tracker.tsx`; `api/mobile/onboarding/complete/route.ts`; `onboarding/claim-slug/actions.ts` + `page.tsx`; `api/mobile/onboarding/profile/route.ts`; CTA swaps on home, pillar, dm-chaos, five feature pages, roundup, compare template, pill-nav; `docs/seo/conversion-measurement.md` (new).

**Implementation:** Four Plausible custom events (`marketing_cta_click`, `signup_started`, `signup_completed`, `booking_link_created`) with first-touch localStorage attribution (cookie-free), once-per-account gating via the permanent `settings.signup_event_fired` flag (survives admin onboarding resets; shared web/mobile), first null-to-slug gating for booking links, and three-layer internal exclusion (`?internal=1` browser mark, `ADMIN_EMAILS`, `profiles.is_tester`). No PII in any prop; values allowlisted and clamped. Plausible remains the only analytics platform; no Meta Pixel, no cookies.

**Validation performed:** 13 unit tests on the gate logic (first fire, repeat, admin reset, legacy accounts, internal, cross-platform, form-field clamping) all green; web + mobile typecheck; production build.

**Remaining issues:** Founder must register the four goals + custom properties in Plausible and mark internal browsers (steps in `docs/seo/conversion-measurement.md`).

**Commit:** `662f3e4`

---

### 2026-07-02 — Existing commercial page intent alignment (visible copy)

**Implemented by:** Claude Code

**Related strategy section:** P0 "Existing-page alignment", "Homepage positioning", "Category-pillar strengthening".

**Files changed:** `app/page.tsx`, `tattoo-booking-software/page.tsx`, `tattoo-deposit-tool/page.tsx`, `tattoo-artist-waitlist/page.tsx`, `guest-spot-booking/page.tsx`.

**Implementation:** Deposit eyebrow/H1/opening lead with tattoo deposit software; waitlist eyebrow/opening with tattoo waitlist software; guest-spot eyebrow/opening with tattoo guest spot organizer plus explicit artist approval; homepage hero states the request-first distinction and the features section shows the full connected system (form, review, Accept or Pass, deposits, client history, calendar, reminders, waitlist, books-open, guest spots, flash, public page); pillar eyebrow carries app/system variants and the hero adds artist control + no self-booking. No exact-match stuffing; no URL or metadata changes.

**Validation performed:** Typecheck + production build; em-dash sweep of the diff (zero); copy rules (sentence case, Accept/Pass) checked.

**Remaining issues:** None.

**Commit:** `4b3d3fe`

---

### 2026-07-02 — Sitemap dates + roadmap references + comparison safeguards

**Implemented by:** Claude Code

**Related strategy section:** P0 "Technical and documentation cleanup"; "Comparison-page rule".

**Files changed:** `apps/web/src/app/sitemap.ts`, `docs/roadmap.md`.

**Implementation:** Removed the per-generation `new Date()` `lastModified` from the sitemap (no reliable per-route source; omitted rather than invented). Roadmap SEO references now point at the canonical strategy, with the roadmap owning sequencing and the log recording completed work. Comparison safeguard review (read-only): both -vs- pages already carry "alternative" phrasing in meta + a visible FAQ, compare workflows, and acknowledge when the competitor suffices; no factual errors found; no separate alternative routes created.

**Validation performed:** Production build; sitemap output inspected (no lastModified, priorities/changefreq intact).

**Remaining issues:** None.

**Commit:** `8b75272`

---

### 2026-07-02 — /tattoo-appointment-reminders page

**Implemented by:** Claude Code

**Related strategy section:** P1 "Tattoo appointment reminders".

**Files changed:** `apps/web/src/app/tattoo-appointment-reminders/page.tsx` (new); `marketing-routes.ts`, `footer-links.ts`, `packages/shared/src/slug.ts` (reserved slugs incl. `guides` + `tattoo-client-management`); contextual cards on pillar, deposit, waitlist pages.

**Implementation:** Commercial page owning `tattoo appointment reminder software`. Product-truth claims only: three email reminder types tied to accepted bookings, per-type toggles + day offsets, reconfirmation magic link, deposit context, editable booking-status emails distinguished from toggled reminders, FAQ states SMS is not supported and no attendance guarantees. Unique metadata, one H1, self-canonical, OG/Twitter, WebPage + FAQPage JSON-LD, tracked CTAs.

**Validation performed:** Production build (page static-generates); links resolve; em-dash sweep; claims verified against `api/cron/reminders`, `reminder-emails.ts`, `settings/reminders`.

**Remaining issues:** None.

**Commit:** `31ae9cc`

---

### 2026-07-02 — /tattoo-client-management page

**Implemented by:** Claude Code

**Related strategy section:** P1 "Tattoo client management".

**Files changed:** `apps/web/src/app/tattoo-client-management/page.tsx` (new); `marketing-routes.ts`, `footer-links.ts`; contextual cards on pillar, booking-form, reminders pages.

**Implementation:** Commercial page owning `tattoo client management software`, leading with native language; CRM only as a secondary term in one honest FAQ. Product-truth claims: auto-created records from requests, contact info, booking/tattoo history with deposits, private notes, returning clients via counts, mobile-app search by handle/email (web = full list), no client accounts. Explicit non-claims: marketing automation, newsletters, pipelines, POS, inventory, staff, studio administration.

**Validation performed:** Production build (static); claims verified against `packages/shared/src/clients.ts`, the clients views, and the notes API; em-dash sweep.

**Remaining issues:** None.

**Commit:** `468bef8`

---

### 2026-07-02 — Problem-guide validation (six candidates)

**Implemented by:** Claude Code

**Related strategy section:** P2 "Problem-led authority validation" + "Guide selection rule".

**Files changed:** `docs/seo/problem-guide-validation.md` (new).

**Implementation:** Live SERP review per candidate + documented Reddit language; scored table; volume/KD/CPC marked Unavailable (no keyword tool). Selected: deposits guide (owner `/tattoo-deposit-tool`) and no-shows guide (owner `/tattoo-appointment-reminders`). Postponed the three overlapping workflow topics; Instagram-DM topic stays with its existing owners.

**Validation performed:** Cross-checked owners against the keyword-ownership map; verified the two selections do not overlap each other's SERPs.

**Remaining issues:** Re-check volumes when a keyword tool or GSC history is available.

**Commit:** `65f1d25`

---

### 2026-07-02 — Guide: how to take tattoo deposits online

**Implemented by:** Claude Code

**Related strategy section:** P2 "Guide requirements"; validation doc selection 1.

**Files changed:** `apps/web/src/app/guides/how-to-take-tattoo-deposits-online/page.tsx` (new); `marketing-routes.ts` (0.6), `footer-links.ts` (Resources), deposit-page contextual card.

**Implementation:** Seven-step guide (decide, write policy, accept first, collect with a record, one clear message, track, apply calmly), checklist, five mistakes, honest manual-vs-software section, FAQ distinct from the commercial page. Useful without Inklee; no invented statistics; no legal guarantees; single commercial owner `/tattoo-deposit-tool` + signup path.

**Validation performed:** Production build (static); FAQ visible + schema; links resolve; em-dash sweep.

**Remaining issues:** None.

**Commit:** `2a5c061`

---

### 2026-07-02 — Guide: how to reduce tattoo no-shows

**Implemented by:** Claude Code

**Related strategy section:** P2 "Guide requirements"; validation doc selection 2.

**Files changed:** `apps/web/src/app/guides/how-to-reduce-tattoo-no-shows/page.tsx` (new); `marketing-routes.ts` (0.6), `footer-links.ts` (Resources), reminders-page contextual card.

**Implementation:** Seven-part system (deposit, written policy, immediate confirmation, days-ahead reminder, reconfirmation with an easy cancel path, waitlist refill, pattern review), checklist, five mistakes (including expecting zero no-shows), manual-vs-software section. No fabricated statistics; no guaranteed-reduction claims; FAQ states SMS is not part of Inklee. Single commercial owner `/tattoo-appointment-reminders` + signup path.

**Validation performed:** Production build (static); FAQ visible + schema; links resolve; em-dash sweep.

**Remaining issues:** None.

**Commit:** `f13a4d4`

---

### 2026-07-02 — P0 metadata repositioning (deposit, waitlist, guest-spot, home/about/pillar ownership)

**Implemented by:** Claude Code

**Related strategy section:** "Execution priority → P0"; per-URL keyword ownership for Deposits, Waitlist, Guest spots, Homepage, About, Category pillar.

**Files changed:**

- `apps/web/src/app/about/page.tsx` — `PAGE_TITLE` → "About Inklee · Built by a tattoo artist for tattoo artists" (moved off the "tattoo booking tool/software" category phrase so home/about/pillar own distinct intents).
- `apps/web/src/app/tattoo-deposit-tool/page.tsx` — `PAGE_TITLE`/`PAGE_DESCRIPTION`/`OG_TITLE`/`OG_DESCRIPTION` repositioned around `tattoo deposit software` (URL kept; cautious card copy kept).
- `apps/web/src/app/tattoo-artist-waitlist/page.tsx` — title/description/OG repositioned around `tattoo waitlist software`.
- `apps/web/src/app/guest-spot-booking/page.tsx` — title/description strengthened around `tattoo guest spot organizer`.
- `docs/seo/inklee-seo-strategy.md` — status tags + P0 checklist updated to reflect the above.

**Implementation:** Metadata-only edits (title, description, OpenGraph, Twitter) via each page's existing `PAGE_*`/`OG_*` constants. No URLs, canonicals, routes, redirects, sitemap, structured-data shapes, or body/H1 copy changed. Home (`/`, brand-led "tattoo booking tool") and the pillar (`/tattoo-booking-software`, category "tattoo booking software") were intentionally left unchanged; only About was moved to resolve the three-way title overlap. Copy rules honored: sentence case, no em-dashes, terminal punctuation on descriptions.

**Validation performed:**

- Ran the dev server and fetched all six pages; confirmed the rendered `<title>` and `<meta name="description">`: home unchanged, pillar unchanged, About = brand/trust, deposit leads with "Tattoo deposit software", waitlist with "Tattoo waitlist software", guest-spot with "Tattoo guest spot organizer".
- Confirmed each page keeps its self-canonical to the same path (no URL change).

**Remaining issues:**

- On-page H1 and body copy still lead with the older phrasing (e.g. deposit H1). Aligning H1/body with the repositioned primary keyword is a follow-up on-page slice.
- Title separator/casing is now consistent across the touched pages (`·`, sentence case) but still mixed site-wide (`|` on some untouched pages); site-wide separator standardization remains a Wave 0 item.

**Commit:** _(added on commit; see `feat(seo): P0 metadata repositioning per canonical strategy`)_

---

### 2026-07-02 — Establish shared SEO operating structure

**Implemented by:** Claude Code

**Related strategy section:** Whole document (setup); "Source of truth" and "Required workflow" in `docs/seo/README.md`.

**Files changed:**

- `docs/seo/README.md` (new) — operating model, responsibility split, required workflow, strategic-change rule.
- `docs/seo/inklee-seo-strategy.md` (new) — canonical SEO strategy (front matter, business context, core distinction, competitive reality, per-URL keyword ownership, cannibalization rules, execution priority, proposed-changes section, relationship to prior docs).
- `docs/seo/seo-implementation-log.md` (new) — this log.
- `CLAUDE.md` — added an "SEO source of truth" section pointing at the canonical strategy and this log.
- `docs/seo-strategy.md` — added a banner marking it superseded as *canonical* by `docs/seo/inklee-seo-strategy.md` (content retained as the analytical companion; not deleted).

**Implementation:** Documentation and workflow setup only. Created the `docs/seo/` structure with the canonical strategy as the single source of truth, wired the ChatGPT-owns-strategy / Claude-owns-implementation split into `CLAUDE.md`, and consolidated the relationship with the existing `docs/seo-strategy.md` without deleting it. No routes, metadata, canonicals, redirects, sitemap, structured data, or application code were changed.

**Validation performed:**

- Confirmed the current indexable marketing page inventory (18 pages) matches `apps/web/src/app/sitemap.ts`.
- Confirmed `/guest-spots` → `/guest-spot-booking` is a live permanent (308) redirect in `apps/web/vercel.json` and the `/guest-spots` page is removed (P0 redirect already deployed, master `ca4a06e`).
- Reviewed the diff to confirm it is docs-only; no application functionality changed.

**Remaining issues:**

- Two strategy documents now exist. `docs/seo/inklee-seo-strategy.md` is canonical; `docs/seo-strategy.md` is the analytical companion. Known keyword-ownership deltas (deposits, guest spots, waitlist primaries; additional recommended pages; competitor set) are listed in the canonical file's "Relationship to prior docs" section for ChatGPT/founder to reconcile.
- `docs/roadmap.md` §4.1/§10 still reference the older SEO strategy; a follow-up doc edit should point them at the canonical file.

**Commit:** _(added on commit; see `docs(seo): establish shared SEO strategy source of truth`)_

---

### 2026-07-22 — Public tattoo map: keyword/page-ownership handoff to ChatGPT (no indexable change)

**Implemented by:** Claude Code

**Related strategy section:** New surface not yet in the canonical strategy; requests an addition. Guardrails reference "Current keyword ownership" (`/guest-spot-booking`, `/tattoo-booking-form`, `/tattoo-booking-software`) and "SERP overlap decision rules".

**Files changed:**

- `docs/seo/public-map-keyword-ownership-brief.md` (new) — brief for ChatGPT (strategy owner) describing the public map surfaces (public explore view, claimed vs unclaimed studio pages, city/style/filter-combination pages), the data + audience behind each, hard guardrails (one intent one owner; no filter-combination indexable pages; no cannibalization of `/guest-spot-booking`; data ~17% materially wrong so unclaimed pages recommended `noindex`; licensing attribution required), and the specific ownership decisions requested back in the canonical proposal format.

**Implementation:** Documentation/handoff only. The tattoo map is going public (Q3 reversed 2026-07-22); its public shell ships last and stays `noindex` + out of the sitemap (fail-closed) until ChatGPT assigns keyword/page ownership and I implement it as a logged slice. Per `CLAUDE.md`, I did **not** set keyword ownership or mint any indexable page. No routes, metadata, canonicals, redirects, sitemap, or structured data changed.

**Validation performed:**

- Confirmed the public map introduces a *new* intent class (consumer/local directory) that no existing owned URL targets, so this is an addition decision, not a repositioning — flagged as such for the strategy owner rather than resolved here.
- Confirmed the fail-closed posture: `mapImmersiveShellEnabled()` and the public shell remain `noindex`/out-of-sitemap absent an explicit strategy decision.

**Remaining issues:**

- Awaiting ChatGPT's ownership proposal (surfaces A–F: indexable or `noindex`, intent, canonical owner URL, URL structure, sitemap/schema, priority tier). Nothing public becomes indexable until that lands on `master` and is implemented + logged here.
- Legal prerequisite tracked separately: `docs/counsel-note-public-map-data-licensing-2026-07-22.md` (Q20 data-attribution/licensing must clear before any seeded row is published).

**Commit:** _(added on commit; see the map redesign / DSA writer commit)_

---

### 2026-07-23 — Public map ownership decision ratified into canonical strategy (still no implementation)

**Implemented by:** Claude Code (applying ChatGPT's strategy decision, relayed by the founder)

**Related strategy section:** New "Public tattoo map and local studio discovery" section in `docs/seo/inklee-seo-strategy.md`; new cannibalization rules; P3 "Public map and local directory pilot"; two P4 items; 2026-07-23 decision-log entry.

**Files changed:**

- `docs/seo/inklee-seo-strategy.md` — added the public-map ownership section (surface ownership + indexation table, per-surface rules for `/map`, claimed `/studios/{studio-slug}`, unclaimed seeds, city pages, style pages, filter combinations, sitemap + structured data, relationship to existing owned URLs, directory conversion rules), the cannibalization bullets, the P3 pilot subsection, two P4 reconsideration items, and the decision-log entry. `last_updated` bumped to 2026-07-23.
- `docs/seo/public-map-keyword-ownership-brief.md` — marked resolved 2026-07-23, pointing at the canonical section.

**Implementation:** Documentation/strategy only. This resolves the 2026-07-22 handoff below. **No routes, metadata, canonicals, redirects, sitemap, structured data, or application code changed**, and no production indexation changed. The decision authorizes a future P3 pilot: a `noindex` public `/map`, `noindex` unclaimed entries, and indexable `/studios/{studio-slug}` only for claimed profiles that pass the full quality gate. City pages remain P4 validate-and-allowlist; style pages postponed; filter combinations `noindex`. `/guest-spot-booking`, `/tattoo-booking-software`, `/tattoo-booking-form`, `/tattoo-artist-booking-page`, and `/tattoo-studio-booking-software` retain their existing ownership.

**Validation performed:**

- Confirmed the only line removed from the canonical strategy was the `last_updated` date (no existing keyword or canonical URL altered).
- Confirmed the added content contains zero em-dashes and the 6-column ownership table is well-formed.
- Confirmed `/map` stays out of the sitemap and only claimed profiles that pass the quality gate may enter the generated studio sitemap.

**Remaining issues:**

- Legal prerequisite still open: `docs/counsel-note-public-map-data-licensing-2026-07-22.md` (Q20) must clear before any seeded row is published publicly.
- Implementation of the P3 pilot (public routes, `/studios/{slug}` quality gate, sitemap segment) is a future Claude Code slice, logged here when built. Nothing public is indexable today.

**Commit:** _(added on commit; see the SEO strategy ratification commit)_
