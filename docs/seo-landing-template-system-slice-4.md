# Slice 4: Marketing Page Template System

**Date:** 2026-05-04
**Status:** Components shipped. No new SEO landing pages built yet — that is Slice 5.

This slice introduces a small library of reusable marketing components so future SEO/GEO landing pages can be assembled from blocks instead of duplicating page-specific JSX. The goal is fast assembly, consistent voice, FAQ schema parity, and low risk of thin/duplicated copy.

---

## Components created

All in `src/components/marketing/`. Server components by default, no client JS unless explicitly noted.

| Component              | File                         | Purpose                                                                                                               |
| ---------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `MarketingHero`        | `marketing-hero.tsx`         | Reusable SEO hero — eyebrow, H1, subhead, primary/secondary CTAs, optional proof line, optional visual slot           |
| `DefinitionBlock`      | `definition-block.tsx`       | "What is X?" GEO-friendly section — eyebrow, heading, body paragraphs, optional bullets, optional highlighted term    |
| `ProblemSolutionBlock` | `problem-solution-block.tsx` | Side-by-side problem ↔ Inklee solution with optional point lists                                                      |
| `FeatureBenefitGrid`   | `feature-benefit-grid.tsx`   | 2- or 3-column feature grid with title + description + optional label                                                 |
| `ComparisonTable`      | `comparison-table.tsx`       | Feature / alternative / Inklee table with optional intro and footnote                                                 |
| `FaqSection`           | `faq-section.tsx`            | Native `<details>`/`<summary>` accordion. No client JS. Same data shape as `faqPageSchema()` so JSON-LD stays in sync |
| `RelatedLinksBlock`    | `related-links-block.tsx`    | 2-column internal-link cards with eyebrow, title, description, href                                                   |
| `FinalCta`             | `final-cta.tsx`              | Centered final CTA — heading, subhead, primary/secondary CTAs                                                         |
| `PlaceholderVisual`    | `placeholder-visual.tsx`     | Dashed-border placeholder with label + caption + aspect ratio variants                                                |
| `CtaButton`            | `cta-button.tsx`             | Internal helper — typed CTA renderer (primary/secondary, internal/external)                                           |

Barrel export at `src/components/marketing/index.ts` so pages can `import { MarketingHero, FaqSection } from "@/components/marketing"`.

---

## Types/models created

`src/lib/marketing.ts` — single source of truth for marketing content shapes.

- `CtaLink`
- `FaqItem`
- `RelatedLink`
- `FeatureBenefitItem`
- `ComparisonRow`
- `ProblemPoint`
- `SolutionPoint`
- `SectionVariant`
- `MarketingHeroProps`

`src/lib/jsonld.ts` was updated to import `FaqItem` from `marketing.ts` so the FAQ JSON-LD payload and the visible FAQ component share the same data shape. The legacy `FaqEntry` alias is kept as a deprecated re-export for backwards compatibility — new code should use `FaqItem`.

---

## Existing pages using the new components

| Page                     | Refactored sections              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/` (`src/app/page.tsx`) | Definition, Related reading, FAQ | All three previously inline section functions are now removed and replaced with `<DefinitionBlock>`, `<RelatedLinksBlock>`, `<FaqSection>`. JSON-LD `faqPageSchema(HOMEPAGE_FAQ)` continues to read from the same array — schema/visible content remain in sync. Hero, Features, How-it-works, About, and Easy-peasy CTA were intentionally **not** refactored — they have brand-specific illustrations and copy that are not yet generic enough to extract. |
| `/dm-chaos`              | Not refactored                   | Has page-specific tonal copy (pain section, mustard solution band, dashed product mockup placeholders). Visual flow is too tied to those bespoke pieces to refactor safely in this slice. Will be revisited if/when its FAQ section is added.                                                                                                                                                                                                                |
| `/guest-spots`           | Not refactored                   | Same reason — bespoke section structure that would need a redesign, not a refactor. Out of scope for this slice.                                                                                                                                                                                                                                                                                                                                             |

---

## Recommended assembly patterns for future SEO pages

These are templates. **Each page must have its own search intent, its own copy, and a non-thin definition block.** Do not paste the same paragraphs across two pages.

### `/tattoo-booking-software` (pillar page)

```tsx
<MarketingHero
  eyebrow="Tattoo booking software"
  heading="Tattoo booking software built for artists, not appointments."
  subhead="Inklee turns Instagram inquiries into structured tattoo booking requests, deposits, waitlists, and guest spot bookings — without spreadsheets."
  primaryCta={{ label: "Get started free", href: "/signup" }}
  secondaryCta={{ label: "See a live example", href: "/bert-grimm", external: true }}
/>

<DefinitionBlock
  eyebrow="What is tattoo booking software"
  heading="A booking intake tool, not a calendar app."
  body={[ /* category definition unique to this page */ ]}
/>

<ProblemSolutionBlock
  problemHeading="Generic appointment software wasn't built for tattooing."
  problemPoints={[ /* 3–4 mismatch points */ ]}
  solutionHeading="Inklee is built around how tattoo bookings actually start."
  solutionPoints={[ /* 3–4 capability points */ ]}
/>

<FeatureBenefitGrid heading="What's inside" items={[ /* booking form, requests, deposits, waitlist, guest spots, calendar */ ]} />

<ComparisonTable
  heading="Tattoo booking software vs. generic appointment tools"
  alternativeLabel="Generic SaaS"
  rows={[ /* 5–7 honest comparison rows */ ]}
/>

<FaqSection items={SOFTWARE_FAQ} />
<JsonLd data={faqPageSchema(SOFTWARE_FAQ)} />

<RelatedLinksBlock heading="Keep reading" links={[ /* /dm-chaos, /guest-spots, /bert-grimm */ ]} />

<FinalCta
  heading="Your booking link in under 5 minutes."
  primaryCta={{ label: "Get started free", href: "/signup" }}
/>
```

### `/instagram-booking-link-for-tattoo-artists`

```tsx
<MarketingHero
  eyebrow="Instagram booking link"
  heading="A tattoo booking link your clients can actually use."
  subhead="Drop one Inklee link into your Instagram bio. Clients send a structured tattoo booking request instead of another DM."
  primaryCta={{ label: "Create your booking link", href: "/signup" }}
/>

<DefinitionBlock
  eyebrow="What is a booking link for tattoo artists"
  heading="The link in bio that replaces booking DMs."
  body={[ /* unique definition tied to Instagram-link search intent */ ]}
/>

<ProblemSolutionBlock
  problemHeading="Instagram is good for attention, not booking structure."
  problemPoints={[ /* DM pain points unique to this page */ ]}
  solutionHeading="One booking link. Every request, structured."
  solutionPoints={[ /* what the link does */ ]}
/>

<FeatureBenefitGrid heading="What the booking link does" items={[ /* form fields, references, approvals, deposits */ ]} />

<FaqSection items={INSTAGRAM_LINK_FAQ} />
<JsonLd data={faqPageSchema(INSTAGRAM_LINK_FAQ)} />

<RelatedLinksBlock heading="Related" links={[ /* /dm-chaos, /tattoo-booking-software */ ]} />
<FinalCta heading="Get your booking link." primaryCta={{ label: "Get started free", href: "/signup" }} />
```

### `/guest-spot-booking`

```tsx
<MarketingHero
  eyebrow="Guest spot booking"
  heading="Guest spot booking for traveling tattoo artists."
  subhead="Publish trips, cities, and dates. Collect tattoo booking requests for the right city and the right week."
  primaryCta={{ label: "Plan your guest spot", href: "/signup" }}
/>

<DefinitionBlock
  eyebrow="What is guest spot booking"
  heading="Bookings tied to where you actually are."
  body={[ /* unique guest-spot definition */ ]}
/>

<FeatureBenefitGrid heading="Built for traveling tattoo artists" items={[ /* trip publishing, per-leg requests, city demand, waitlist */ ]} />

<ComparisonTable
  heading="Guest spot booking vs. spreadsheets and DMs"
  alternativeLabel="Spreadsheets / DMs"
  rows={[ /* trip dates, city demand, leg-specific requests, etc. */ ]}
/>

<FaqSection items={GUEST_SPOT_FAQ} />
<JsonLd data={faqPageSchema(GUEST_SPOT_FAQ)} />

<RelatedLinksBlock heading="Related" links={[ /* /guest-spots, /tattoo-booking-software */ ]} />
<FinalCta heading="Run your next guest spot through Inklee." primaryCta={{ label: "Get started free", href: "/signup" }} />
```

---

## Warnings

### Each SEO page needs ONE clear search intent.

A page that tries to rank for "tattoo booking software" AND "instagram booking link" AND "guest spot booking" will rank for none. One intent per page. The hero heading, definition block, FAQ, and `<title>` should all answer the same question.

### No thin or duplicated copy.

If two pages share the same Definition paragraphs or the same FAQ answers, Google treats them as duplicates and one will lose. The definition block is the highest-leverage place to write something specific to that page's intent.

### Don't fake what doesn't exist.

- No reviews, ratings, testimonials, or quotes that aren't real.
- No `offers` in `SoftwareApplication` schema until public pricing exists.
- No `SearchAction` until a real public search page exists.
- Deposit wording stays cautious: _"Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features."_

### FAQ schema must match visible content.

The `FaqSection` component and `faqPageSchema()` both read from the same `FaqItem[]` array. Always pass the same array to both. If the answer changes on the page, it must change in the schema.

---

## Artist public page indexing decision needed

**Current behavior**

- `/{slug}` artist pages are publicly accessible.
- They render full content for any visitor (no auth gate).
- Per-artist `generateMetadata` was added in the P0 slice, so each page now has a unique title and description.
- Artist pages are **not in the sitemap** — they are not actively pushed to Google.
- There is no `noindex` directive on `/{slug}`, so once Google discovers them via inbound links or social shares, they are eligible for indexing.
- There is no `public_indexable` opt-in/opt-out flag on the `profiles` table.

**Why this matters**

- Mass-adding artist pages to the sitemap before there is an opt-in could surface artists in search who explicitly didn't want to be discoverable through Google.
- It also opens an SEO tail that can either help (more landing pages on real artist content) or hurt (thin profile pages with no bio dilute domain authority).
- An artist who deletes their account today leaves a 404 in the sitemap if we mass-publish.

**Options**

1. **Keep accessible but exclude from sitemap** — current state. Artists pages are private-by-default from a discovery perspective, and only show up if an artist shares the link or someone links to them externally. Lowest risk.
2. **Add `public_indexable boolean default false` on `profiles`** — opt-in to discoverability. Inside `[slug]/page.tsx generateMetadata`, set `robots: { index: false, follow: true }` when `public_indexable` is false. Adds a clear toggle in artist settings. Best long-term.
3. **Featured/demo allowlist in sitemap** — manually include `/bert-grimm` and a hand-picked set of consenting artists in `sitemap.ts`. Useful for the homepage's "live example" link.
4. **Full dynamic artist sitemap with consent** — option 2 plus generating `/sitemap.xml` entries for every `public_indexable: true` profile. Build this once option 2 has been live long enough that real artists have opted in.

**Recommendation for beta:** Stay on option 1. Add `public_indexable` (option 2) before any large artist-page SEO push or paid campaign that points at `/{slug}` URLs. **Do not implement any of this in Slice 4 or Slice 5** — it requires a Supabase migration + settings UI and should be its own slice.

---

## Why this slice did not refactor `/dm-chaos` and `/guest-spots`

Their current section structure is too tied to specific brand visuals (mustard solution band, dashed mockup placeholders, custom pain card icons) to refactor cleanly without changing their visible design. Refactoring them would have been a redesign disguised as a cleanup. They will be revisited if and when:

- a FAQ section is added to either (use `<FaqSection>` then),
- a comparison block is added (use `<ComparisonTable>`),
- or as part of a deliberate visual unification pass.

Until then, the new components are validated against the homepage and ready for Slice 5.

---

## Recommended next slice

**Slice 5: `/tattoo-booking-software` pillar page.** Before implementing, run a strategy pass with ChatGPT to produce: search intent, page outline, metadata, FAQ, internal link plan, and the Claude Code implementation prompt. Then the page is just an assembly of the components in this slice.
