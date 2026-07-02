# Inklee SEO/GEO Audit — Slice 1: Indexing & Technical Baseline

> **HISTORICAL (2026-07-01).** Most P0/P1 findings here were fixed in the June 2026 launch sprint (per-page metadata, robots disallows, clean sitemap, JSON-LD, artist-page noindex). Kept as a record of the original baseline. Current SEO source of truth = `docs/seo-strategy.md`.

**Date:** 2026-05-03  
**Auditor:** Claude Code (automated codebase inspection)  
**Scope:** Slice 1 only — indexing configuration, metadata, sitemap coverage, robots, heading structure, JSON-LD, noindex risks. No changes made. Punch list at end.

---

## 1. Crawlability & Indexing Configuration

### 1.1 `robots.ts`

**File:** `src/app/robots.ts`

```ts
rules: { userAgent: "*", allow: "/" },
sitemap: "https://inklee.app/sitemap.xml",
```

**Finding:** All routes are open to all crawlers. No `Disallow` rules exist. This means admin routes (`/admin`, `/admin/accounts/*`), artist dashboard routes (`/dashboard`, `/bookings/*`, `/flash/*`, `/onboarding/*`, `/settings/*`, `/analytics`), auth routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`), and dev routes (`/dev/loader`, `/dev/ping`) are all crawlable in principle.

**Risk level:** Medium. Googlebot will attempt to crawl these routes, hit auth redirects, and waste crawl budget. More importantly, if any of these pages are accidentally rendered without a redirect (e.g., edge cases in middleware), they could get indexed.

**What's missing:**

- No `Disallow` for `/dashboard`, `/bookings`, `/flash`, `/settings`, `/analytics`, `/onboarding`, `/admin`, `/dev`, `/auth/mfa`
- No `Disallow` for `/request/*` (magic link customer portal — should not be indexed)

---

### 1.2 `sitemap.ts`

**File:** `src/app/sitemap.ts`

**Current sitemap (8 URLs):**

| URL                          | Priority | Change freq |
| ---------------------------- | -------- | ----------- |
| `https://inklee.app/`        | 1.0      | monthly     |
| `https://inklee.app/signup`  | 0.8      | yearly      |
| `https://inklee.app/login`   | 0.5      | yearly      |
| `https://inklee.app/about`   | 0.6      | monthly     |
| `https://inklee.app/help`    | 0.6      | monthly     |
| `https://inklee.app/terms`   | 0.3      | yearly      |
| `https://inklee.app/privacy` | 0.3      | yearly      |
| `https://inklee.app/imprint` | 0.3      | yearly      |

**Missing from sitemap:**

| Route                        | Why it matters                                                              |
| ---------------------------- | --------------------------------------------------------------------------- |
| `/start`                     | Primary ad landing page — has custom metadata, has H1, should be in sitemap |
| `/dm-chaos`                  | Marketing landing page — no metadata, not in sitemap                        |
| `/guest-spots`               | Marketing landing page — no metadata, not in sitemap                        |
| `/bert-grimm`                | Demo artist page — linked from homepage CTA, should be discoverable         |
| `/{slug}` (all artist pages) | Public pages with unique artist content — none in sitemap                   |

**Other issues:**

- `/login` in sitemap at priority 0.5: a login page has no SEO value and wastes crawl budget. Priority should be 0.1 or removed.
- All `lastModified` fields use `new Date()` (current build time) — this is correct for a static sitemap but means all pages report as "modified today" on every deploy. For mostly-static pages this is a minor issue.

---

### 1.3 Noindex Audit

**Finding:** No `noindex` directives exist anywhere in the codebase. No `<meta name="robots" content="noindex">` tags, no `noIndex: true` in Next.js metadata objects.

**Routes that should be noindexed:**

| Route                       | Reason                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| `/login`                    | Auth utility page, no indexable content                                |
| `/signup`                   | Auth utility page — could stay indexed for brand queries but low value |
| `/forgot-password`          | Auth utility page                                                      |
| `/reset-password`           | Auth utility page                                                      |
| `/auth/mfa`                 | Auth utility page                                                      |
| `/request/[token]`          | Magic link customer portal with session-specific data                  |
| `/request/submitted`        | Thank-you page, no standalone value                                    |
| `/dev/*`                    | Dev-only pages                                                         |
| `/admin/*`                  | Admin backend                                                          |
| All artist dashboard routes | Authenticated-only, behind redirects                                   |

**Note:** Auth routes currently rely entirely on middleware redirects for protection. If middleware ever fails or a route is accidentally reachable, there is no metadata-level noindex as a fallback.

---

## 2. Root & Global Metadata

**File:** `src/app/layout.tsx`

```ts
title: "Inklee — booking requests without the DM chaos",
description: "A simple booking request tool for freelance and traveling tattoo artists.",
metadataBase: new URL("https://inklee.app"),
openGraph: {
  title: "Inklee — booking requests without the DM chaos",
  description: "A clean booking request tool for freelance tattoo artists. Replace chaotic DMs with a structured form and approval flow.",
  url: "https://inklee.app",
  siteName: "Inklee",
  type: "website",
},
twitter: {
  card: "summary",
  title: "Inklee — booking requests without the DM chaos",
  description: "A clean booking request tool for freelance tattoo artists.",
},
```

**Findings:**

- **`metadataBase` is set** — canonical URL resolution will work correctly for all pages that don't override it.
- **Twitter card is `summary`** — `summary_large_image` would be more impactful for a product with visual assets. Low priority.
- **No `og:image`** — Open Graph image is not set anywhere. All social shares will use the fallback (often the site favicon or nothing). This is a gap for paid social campaigns where `/start` and `/dm-chaos` are ad landing pages.
- **Description is generic** — "A simple booking request tool for freelance and traveling tattoo artists." reads like a product spec, not a user benefit statement. Adequate for now but weak for click-through rate.
- **`lang="en"` set on `<html>`** — correct.

---

## 3. Per-Page Metadata

### 3.1 Marketing pages with custom metadata

| Page                                | Title                                        | Description                                                                                                      | OG                          | Notes                                |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------ |
| `/start` (`src/app/start/page.tsx`) | "Inklee — Your DMs are not a booking system" | "Put one clean booking link in your Instagram bio. Turn messy DM chats into structured tattoo booking requests." | Custom OG title/description | Good. Conversion-focused copy.       |
| `/dm-chaos`                         | None (falls back to root)                    | None                                                                                                             | None                        | **Missing.** Full page, no metadata. |
| `/guest-spots`                      | None (falls back to root)                    | None                                                                                                             | None                        | **Missing.** Full page, no metadata. |

### 3.2 Artist public pages (`/[slug]`)

**File:** `src/app/[slug]/page.tsx`

**Finding:** No `generateMetadata` export. All artist pages — `inklee.app/bert-grimm`, `inklee.app/any-artist` — serve the root metadata:

- Title: "Inklee — booking requests without the DM chaos"
- Description: "A simple booking request tool for freelance and traveling tattoo artists."

This is a significant SEO gap. When an artist shares their booking page link, Google and social platforms will show the Inklee brand title instead of the artist's name. It also means all artist pages are identical from a search engine perspective — no signal that each page represents a real individual artist with unique content.

**What's available in the page component to build metadata:**

- `profile.display_name` — artist's display name
- `profile.bio` — artist's bio text
- `profile.location` — artist's location
- `profile.instagram_handle` — Instagram handle
- `profile.logo_url` — profile image (could be `og:image`)

A `generateMetadata` function could produce per-artist titles like `"Bert Grimm — Tattoo booking · Inklee"` and descriptions derived from their bio.

### 3.3 Pages with metadata (summary)

| Page           | Has metadata?        |
| -------------- | -------------------- |
| `/`            | ✓ Root metadata      |
| `/start`       | ✓ Custom             |
| `/signup`      | Falls back to root   |
| `/login`       | Falls back to root   |
| `/about`       | Falls back to root   |
| `/help`        | Falls back to root   |
| `/terms`       | Falls back to root   |
| `/privacy`     | Falls back to root   |
| `/imprint`     | Falls back to root   |
| `/dm-chaos`    | ✗ Missing            |
| `/guest-spots` | ✗ Missing            |
| `/[slug]`      | ✗ Missing (critical) |

---

## 4. Heading Structure (H1/H2)

### Homepage (`/`)

- **H1:** "No more DM chaos" — strong, concise, on-brand
- **H2 (1):** "Built by tattoo artists, for tattoo artists."
- **H2 (2):** "Your booking link in under 5 minutes"
- **Feature section:** Feature titles rendered as `<p>` (not headings) — semantically acceptable for a grid of features
- **Missing:** No keyword-rich heading for the features section itself (currently no heading before the feature grid)

### `/start` (primary ad landing page)

- **H1:** "Stop losing tattoo requests in Instagram DMs." — strong, pain-led
- **H2 (1):** "Instagram gets you attention. It doesn't give you structure."
- **H2 (2):** "One link. Cleaner requests. Less chaos."
- **H2 (3):** "How it works"
- **H2 (4):** "Built to actually work"
- **H2 (5):** "Made for tattoo artists, not generic booking software."
- **H2 (6):** "Your DMs are not a booking system." (final CTA)
- **Assessment:** Good heading hierarchy. Pain-led H1 targets a real search intent.

### `/dm-chaos` (marketing landing page)

- **H1:** "Booking requests without DM chaos" — keyword-rich but slightly generic vs `/start`
- Multiple H2s present covering pain, solution, product proof
- **No custom metadata** — page not benefiting from its own headings for SEO because title/description are inherited from root

### `/guest-spots` (marketing landing page)

- **H1:** "Guest spot bookings without the chaos" — directly targets "guest spot bookings" as a keyword
- Multiple H2s covering the guest-spot workflow
- **No custom metadata** — same issue as `/dm-chaos`

### Artist public pages (`/[slug]`)

- **H1:** Artist's `display_name` (e.g., "Bert Grimm") — rendered at `src/app/[slug]/page.tsx:213`
- **H2:** "Booking request" — the form section label
- **Assessment:** The H1 is the artist name, which is correct for a profile page. The page has no keyword context for tattooing in its headings beyond the artist's own name. With `generateMetadata` added, these pages would become much more discoverable.

---

## 5. Canonical URLs

**Finding:** No explicit canonical `<link rel="canonical">` tags are set anywhere in the codebase. Next.js App Router with `metadataBase` set to `https://inklee.app` will auto-generate canonical tags on pages that export `metadata` or `generateMetadata` objects.

**Consequence:** Pages that do not export their own metadata (most of the site) rely on Next.js defaults. The root `metadataBase` means canonical URLs will resolve correctly for static routes. However, artist public pages at `/{slug}` — which have no metadata export — get no canonical tag, leaving Google to determine the canonical itself.

**No canonical conflicts detected** — there is a 301 redirect from `/impressum` → `/imprint` in `next.config.ts`, so duplicate content from that old URL is handled.

---

## 6. Structured Data (JSON-LD)

**Finding:** Zero JSON-LD structured data anywhere in the codebase.

**Opportunities by page type:**

| Page                                  | Schema type                                            | Value                                                   |
| ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `/`                                   | `SoftwareApplication` or `WebSite` with `SearchAction` | Brand presence in knowledge panels                      |
| `/start`, `/dm-chaos`, `/guest-spots` | `WebPage` + `FAQPage` (if FAQ section added)           | Rich result eligibility                                 |
| `/[slug]` (artist pages)              | `LocalBusiness` or `Person` + `Service`                | Artist name in knowledge panels, booking service markup |
| `/about`                              | `Organization`                                         | Inklee OÜ entity disambiguation                         |

**Priority:** Artist pages with `LocalBusiness` or `Person` schema are the highest-value opportunity — they can help individual artist pages rank for "[artist name] tattoo booking" searches.

---

## 7. Image Alt Text Audit

### Homepage (`/`)

| Image                                     | Alt text                       | Status               |
| ----------------------------------------- | ------------------------------ | -------------------- |
| `key-visual.svg` (hero illustration)      | `""` with `aria-hidden="true"` | Correct — decorative |
| `feature-*.svg` (6 feature illustrations) | `""` with `aria-hidden="true"` | Correct — decorative |
| `artist.svg` (about section)              | `""` with `aria-hidden="true"` | Correct — decorative |
| `easy-peasy.svg`                          | `""` with `aria-hidden="true"` | Correct — decorative |
| `badge-handmade.svg`                      | `"Made by hand"`               | ✓ Good               |
| `badge-gdpr.svg`                          | `"GDPR compliant"`             | ✓ Good               |

### Artist profile pages (`/[slug]`)

- Artist logo/photo: `alt={profile.display_name}` — ✓ correct

**Assessment:** Alt text handling is clean throughout. No missing alts on meaningful images, decorative images correctly marked with `aria-hidden`.

---

## 8. Technical Infrastructure

### 8.1 Analytics

- **Plausible.io** script loaded in `layout.tsx` (`data-domain="inklee.app"`, deferred, `afterInteractive`)
- No Google Analytics, no GA4 — Plausible is the single analytics source
- Plausible does not support Google Search Console data; GSC must be connected separately via DNS or HTML file verification

### 8.2 Rendering strategy

- **Next.js App Router** — pages are server-rendered by default
- All marketing pages (`/`, `/start`, `/dm-chaos`, `/guest-spots`) are server components — fully SSR, content visible to crawlers
- Artist public pages (`/[slug]`) are server components with Supabase data fetching — content rendered server-side, crawlable
- No client-only rendering issues detected for SEO-critical content

### 8.3 Page speed considerations (not measured, code-based observations)

- **Hero illustration** on homepage uses `<img>` not Next.js `<Image>` — no automatic optimization/lazy loading
- **Artist profile photo** uses Next.js `<Image fill>` with Supabase CDN URL — correct
- **Font loading:** Inter and JetBrains Mono loaded via `next/font/google` — self-hosted, no external request
- **Client-side JS on marketing pages:** Minimal. Cookie banner (`CookieBanner`) and Plausible script are the only client-side additions. Good for LCP.

### 8.4 `lang` attribute

`<html lang="en">` set in `layout.tsx`. Correct for an English-language product.

---

## 9. Plausible & Google Search Console Status

**Plausible:** Script active on all pages (root layout). No configuration gaps detected in code.

**Google Search Console:** Cannot be verified via codebase inspection. Must verify:

- Is `inklee.app` verified in GSC?
- Is `https://inklee.app/sitemap.xml` submitted?
- Are any coverage errors reported?
- Is any crawl budget waste visible in the Coverage report?

**Action required (manual):** Log into GSC and confirm sitemap is submitted and crawl is healthy.

---

## 10. Punch List — Prioritized Findings

### P0 — Fix before any SEO investment pays off

| #    | Issue                                          | File                           | Fix                                                                 |
| ---- | ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| P0-1 | Artist public pages have no `generateMetadata` | `src/app/[slug]/page.tsx`      | Add `generateMetadata` using `display_name`, `bio`, `location`      |
| P0-2 | `/dm-chaos` has no metadata                    | `src/app/dm-chaos/page.tsx`    | Add `export const metadata` with keyword-targeted title/description |
| P0-3 | `/guest-spots` has no metadata                 | `src/app/guest-spots/page.tsx` | Add `export const metadata` with keyword-targeted title/description |
| P0-4 | `/start` and `/dm-chaos` missing from sitemap  | `src/app/sitemap.ts`           | Add both URLs                                                       |

### P1 — High value, no structural changes needed

| #    | Issue                                                | File                 | Fix                                                                                                                                     |
| ---- | ---------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1 | No `robots.txt` disallows for private routes         | `src/app/robots.ts`  | Add `Disallow` for `/dashboard`, `/bookings`, `/settings`, `/flash`, `/analytics`, `/onboarding`, `/admin`, `/dev`, `/request`, `/auth` |
| P1-2 | Auth pages (`/login`, `/signup`, etc.) not noindexed | Per-page metadata    | Add `robots: { index: false }` in metadata for auth routes                                                                              |
| P1-3 | `/guest-spots` missing from sitemap                  | `src/app/sitemap.ts` | Add URL                                                                                                                                 |
| P1-4 | No `og:image` anywhere                               | `src/app/layout.tsx` | Set a fallback OG image (e.g., `/og-image.png`) for social shares                                                                       |

### P2 — Medium priority, meaningful uplift

| #    | Issue                                      | Fix                                                         |
| ---- | ------------------------------------------ | ----------------------------------------------------------- |
| P2-1 | No JSON-LD structured data on artist pages | Add `Person` or `LocalBusiness` schema to `[slug]/page.tsx` |
| P2-2 | No JSON-LD on homepage                     | Add `SoftwareApplication` schema to `src/app/page.tsx`      |
| P2-3 | `/login` in sitemap at priority 0.5        | Reduce to 0.1 or remove entirely                            |
| P2-4 | `/bert-grimm` demo page not in sitemap     | Add to sitemap — it's linked from homepage CTA              |
| P2-5 | Twitter card is `summary`                  | Change to `summary_large_image` once OG image exists        |

### P3 — Lower priority / longer-term

| #    | Issue                                                               | Fix                                                                                |
| ---- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P3-1 | GSC verification and sitemap submission                             | Manual step — verify via DNS, submit sitemap                                       |
| P3-2 | Hero images on marketing pages use `<img>` not `<Image>`            | Migrate to Next.js `<Image>` for automatic optimization                            |
| P3-3 | Artist pages have no keyword context beyond artist name in headings | Once `generateMetadata` done, consider adding location/style keywords to page copy |
| P3-4 | No FAQ schema on marketing pages                                    | Add FAQ section + `FAQPage` JSON-LD to `/start` or `/dm-chaos`                     |

---

## 11. Quick Wins Summary (in order of effort vs. impact)

1. **Add metadata to `/dm-chaos` and `/guest-spots`** — 15 min, immediate indexing improvement for existing pages
2. **Add `/start`, `/dm-chaos`, `/guest-spots` to sitemap** — 5 min, ensures crawlers find these pages
3. **Add `generateMetadata` to `[slug]/page.tsx`** — 30 min, unlocks all artist pages as individually indexable content
4. **Add `Disallow` rules to `robots.ts`** — 15 min, stops crawl budget waste on private routes
5. **Add a fallback `og:image`** — design asset needed, then 10 min to wire up

---

## CHATGPT HANDOFF SUMMARY

**Project:** Inklee (inklee.app) — tattoo artist booking platform  
**Tech stack:** Next.js 16 App Router, TypeScript, Tailwind, Supabase, Vercel Hobby  
**Codebase language:** English. All copy is English. Target market: global freelance/traveling tattoo artists.

**What I need help with:** Writing SEO-optimized copy and metadata for specific pages based on a technical audit I just completed.

**Audit findings relevant to copy work:**

1. **Artist public pages (`/{slug}`)** have no individual metadata. I need a `generateMetadata` template that produces:
   - Title format: `{display_name} — Tattoo Booking · Inklee`
   - Description: derived from `{display_name}`, optional `{bio}` text (may be empty), optional `{location}` (may be empty). Must be ≤155 characters. Should communicate "book a tattoo with [name]" + location if available.

2. **`/dm-chaos`** (marketing landing page targeting artists frustrated with Instagram DM bookings):
   - H1 on page: "Booking requests without DM chaos"
   - Needs: `<title>` tag and meta description that target the keyword cluster: "tattoo booking from instagram", "stop losing tattoo requests", "tattoo DM booking"
   - Target: freelance tattoo artists searching for a booking solution

3. **`/guest-spots`** (marketing landing page targeting artists who travel for guest spots):
   - H1 on page: "Guest spot bookings without the chaos"
   - Needs: `<title>` tag and meta description targeting: "tattoo guest spot booking", "guest spot booking tool", "traveling tattoo artist booking"
   - Target: artists who do guest spots in multiple cities

4. **Root description** (`src/app/layout.tsx`) — currently: "A simple booking request tool for freelance and traveling tattoo artists." Needs a stronger benefit-led rewrite that still fits ≤155 chars.

**Constraints:**

- Brand voice: direct, no corporate speak, slightly irreverent, built-for-artists energy
- No emojis in metadata
- All copy in English
- Titles must stay under ~60 characters
- Descriptions must stay under 155 characters
- The product is free to start (mention where relevant)

**Deliverable format I need from you:**  
For each page, output exactly:

```
Page: /page-name
title: "..."
description: "..."
og:title: "..." (can differ from title for social context)
og:description: "..." (can be slightly longer/more punchy)
Notes: any copy reasoning
```
