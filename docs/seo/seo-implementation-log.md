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
