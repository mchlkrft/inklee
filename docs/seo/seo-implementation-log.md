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
