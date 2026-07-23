# Brief for ChatGPT — keyword + page ownership for the public tattoo map

**Prepared by:** Claude Code (implementation owner) · **2026-07-22**
**For:** ChatGPT (SEO strategy owner, per `CLAUDE.md` and `docs/seo/README.md`)
**Read alongside:** `docs/seo/inklee-seo-strategy.md` (canonical) · `docs/product/inklee-2-map-redesign-audit-and-plan.md` (§ external dependencies, § revised rollout) · `docs/product/inklee-2-open-questions.md` (Q3, Q20)

> **This is a request, not a strategy.** Per the ownership split, keywords, search
> intent, keyword ownership, and page architecture are yours. I am handing you a
> new product surface, the data behind it, the guardrails it must respect, and
> the specific decisions I need back before I build anything indexable. I have
> **not** set any keyword ownership here and I will not mint an indexable page for
> an intent that already has an owner. Please return a proposal in the canonical
> format and I will implement it as a logged slice.

> **Resolved 2026-07-23.** The approved ownership and indexation decision is now
> recorded in `docs/seo/inklee-seo-strategy.md` under "Public tattoo map and
> local studio discovery." This brief remains as the implementation context and
> decision request history. The canonical strategy file wins if the documents
> ever differ.

---

## 1. What changed

The Inklee **tattoo map** — until now logged-in only, `noindex`, out of the
sitemap (Q3, resolved 2026-07-19) — is going **public**. The founder reversed Q3
on 2026-07-22: the map becomes a **public, experimental, community-evolving**
surface, built as one capability layer on a single shared map core. The public
shell ships **last** in the rollout and only after three owners clear their
items:

- **Legal** — Overture/Foursquare/OSM data licensing for public display (Q20; drafted in `docs/counsel-note-public-map-data-licensing-2026-07-22.md`).
- **DSA** — a `moderation_statements` statement-of-reasons writer (Q14; now implemented).
- **You (SEO)** — keyword + page ownership for whatever becomes public. **This doc.**

Nothing is indexable yet. I will not publish a public, crawlable surface until
you have assigned ownership, because doing so silently would redefine keyword
ownership — which `CLAUDE.md` forbids.

## 2. The new thing about this surface

Every public marketing page Inklee owns today targets **artists** shopping for
booking software (`/tattoo-booking-software`, `/tattoo-booking-form`,
`/guest-spot-booking`, `/tattoo-client-management`, the comparison pillar, etc.).
Audience: **the artist**. Intent: **SaaS / product**.

The public map is the first surface that could target a **different audience with
a different intent**: **local discovery** — someone (artist *or* client) looking
for **tattoo studios in a place**. Queries in this class ("tattoo studios in
Berlin", "tattoo shops near me", "guest spot friendly studios in London") are
**local/directory** intent, and **no existing owned URL targets them**. So this
is not a repositioning of an existing page; it is a decision about whether Inklee
enters a **new intent class** at all, and if so, how.

That decision is yours. It genuinely could go either way — a local directory is a
different game from artist SaaS marketing, with a different competitor set
(Google Maps, Booksy, Yelp, local blogs) and a data-quality bar we do not yet
meet (§5). "Keep the map a `noindex` utility and not an SEO play" is a legitimate
answer.

## 3. Candidate public surfaces (what exists / could exist)

For each, I have noted what it is, the data behind it, and the audience — so you
can decide indexability, intent, and canonical ownership.

| # | Surface | What it is | Data behind it | Audience |
|---|---|---|---|---|
| A | **Public map explore view** | The full-viewport map + search + filters (styles, etc.), no login. | ~71k admin-reviewed seeded studios (name + coordinates + city/country) across 16 countries. | Client + artist |
| B | **Public studio pages** | Per-studio page for **claimed** studios: name, location, styles represented, guest-artist timeline, house rules. `LocalBusiness`/`Place` schema candidate. | Claimed-studio, artist-supplied content (high quality). | Client + artist |
| C | **Seeded (unclaimed) studio pages** | Per-studio page for **unclaimed** seeds: name + approximate location only. | Seeded facts only (name+coords); no owner content; ~17% materially stale. | Client |
| D | **City / region landing pages** | "Tattoo studios in {city}" index pages. | Aggregation over A. | Client |
| E | **Style landing pages** | "{Style} tattoo studios" index pages. | Aggregation over the style read-path. | Client |
| F | **Filter-combination pages** | "{Style} tattoo studios in {city}", etc. | Aggregation. | Client |

## 4. Hard guardrails (non-negotiable, from the audit + existing ownership)

These are implementation/quality constraints I will enforce regardless of the
strategy; they bound what you can safely assign:

1. **One intent, one owner URL.** Whatever you assign must not create a second
   owner for an intent already owned. In particular, **do not cannibalize
   `/guest-spot-booking`** (owns the guest-spot intent) or `/tattoo-booking-form`
   / `/tattoo-booking-software` (own the artist-SaaS intents). A public
   "guest spot studios" surface must be positioned so it complements, not
   competes with, `/guest-spot-booking`.
2. **No indexable filter-combination pages by default** (surface F). Faceted
   style×city×… pages are an index-bloat / thin-content trap. If you want any of
   them indexable, name the *specific* few with real demand; the default for
   filter combinations is `noindex` + canonical to the parent.
3. **Booking pages stay `noindex`** (unchanged; existing rule). The public map is
   separate from the per-artist booking pages.
4. **Data quality gates indexation.** The seed is measured **~17% materially
   wrong** and there is **no "verified" tier** in the schema. Unclaimed seed pages
   (surface C) are thin and partly stale. My recommendation to you (yours to
   overrule): index **claimed** studio pages (B) confidently; treat unclaimed
   pages (C) as `noindex` until a verification/confirmation signal exists; decide
   city pages (D) only once enough claimed density backs them.
5. **Licensing attribution is required on any public data surface** (Q20). This
   is a legal obligation, not an SEO choice, but it affects page templates.
6. **Experimental framing is visible.** The public surface will carry an
   "experimental, evolving with the community" banner. Factor that into how
   aggressively you want to chase rankings on it.

## 5. Technical + data caveats that bound the strategy

- **Coverage:** 16 countries, ~71.2k approved studios (US ~26k, GB, DE, FR, IT,
  ES, TH, CA, AU, VN, NL, CH, AT, JP, EE, KR). Rollout paused after Vietnam.
- **Quality:** ~25% staleness / ~17% materially wrong on seeds; artist-correction
  loop + ghost-detection exist; no verified tier yet.
- **Privacy:** privacy-set studios show an **approximate** display point, not the
  true address. Public pages must never expose the true point for those.
- **Rendering:** the map is client-side MapLibre; public index pages (if any)
  need server-rendered, crawlable HTML content, not just the map canvas.

## 6. What I need back from you (the decisions)

Please return, in the canonical proposal format (`docs/seo/README.md` → strategic
change rule), a decision on each:

1. **Does Inklee enter the local-directory intent class at all?** (Yes → assign
   below; No → the public map is a `noindex` utility surface and we stop here.)
2. **Per surface A–F: indexable or `noindex`?** With a one-line why.
3. **For each indexable surface: primary keyword + search intent + the canonical
   owner URL + URL structure** (e.g. `/studios/{country}/{city}/{slug}` vs
   `/tattoo-studios/{city}` — your call).
4. **Relationship to existing owned URLs** — confirm no cannibalization of
   `/guest-spot-booking`, `/tattoo-booking-form`, `/tattoo-booking-software`, the
   public artist page, or the studio-software page; name any that need a
   guardrail note added to the canonical file.
5. **Sitemap + schema:** which surfaces enter the generated sitemap; where
   `LocalBusiness`/`Place` structured data applies.
6. **Priority tier** (P0–P4 in the canonical model) and whether any of this is
   gated on SERP/keyword validation ("To build (validate)").

## 7. How this gets applied (the loop)

You author the proposal (canonical format). It lands in
`docs/seo/inklee-seo-strategy.md` on `master` (founder pastes or I apply it). I
then implement the assigned pages/metadata as a slice, logged in
`docs/seo/seo-implementation-log.md`, and only **then** does anything public
become indexable. Until your proposal is on `master`, the public map ships (if it
ships before your decision) as `noindex`, out of the sitemap — fail-closed, same
posture as today.

---

*Raw-file URL for reading this in the GitHub connector:
`https://raw.githubusercontent.com/mchlkrft/inklee/master/docs/seo/public-map-keyword-ownership-brief.md`*
