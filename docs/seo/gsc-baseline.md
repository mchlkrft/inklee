# Inklee Google Search Console baseline

## Baseline context

- Baseline date: 2026-07-02
- Comparison period: previous 3 months (2026-04-02 to 2026-07-02), plus 28-day and 7-day views for recency
- Strategy reference: `docs/seo/inklee-seo-strategy.md` (canonical), P0 "Google Search Console baseline"
- Metadata and ownership change date: 2026-07-02
- Data source: Google Search Console, Domain property `inklee.app` (numbers pending founder export; see "Founder export instructions")
- Prepared by: Claude Code (framework + URL inventory); founder (GSC exports)

## Important interpretation note

The current reference point follows the 2026-07-02 metadata, ownership, guest-spot consolidation, deposit repositioning, waitlist repositioning, and guest-spot repositioning work.

Data before this date should be interpreted as pre-change data.

Specific changes that landed on 2026-07-02 (all in prod):

- `/guest-spots` removed and 308-redirected to `/guest-spot-booking` (deployed in master `ca4a06e`).
- `/tattoo-deposit-tool` title/description repositioned around `tattoo deposit software` (master `7eca5db`).
- `/tattoo-artist-waitlist` repositioned around `tattoo waitlist software` (master `7eca5db`).
- `/guest-spot-booking` strengthened around `tattoo guest spot organizer` (master `7eca5db`).
- `/about` title moved to brand/trust, resolving the home/about/pillar title overlap (master `7eca5db`).
- Comparison pages `-vs-google-forms` and `-vs-calendly` gained "alternative" phrasing in meta description + one FAQ each (master `ca4a06e`).

Expect title/CTR effects to appear in GSC only after Google recrawls each page; position and query-mix effects lag further. Treat the first 2 to 4 weeks after 2026-07-02 as a transition window.

## Indexable marketing URLs

Baseline inventory at the baseline date (18 URLs, from `apps/web/src/lib/marketing-routes.ts`, which drives both the sitemap and IndexNow):

1. `https://inklee.app`
2. `https://inklee.app/tattoo-booking-software`
3. `https://inklee.app/instagram-booking-link-for-tattoo-artists`
4. `https://inklee.app/guest-spot-booking`
5. `https://inklee.app/tattoo-booking-form`
6. `https://inklee.app/tattoo-booking-software-vs-instagram-dms`
7. `https://inklee.app/tattoo-booking-software-vs-google-forms`
8. `https://inklee.app/tattoo-booking-software-vs-calendly`
9. `https://inklee.app/best-booking-app-for-tattoo-artists`
10. `https://inklee.app/tattoo-deposit-tool`
11. `https://inklee.app/tattoo-artist-waitlist`
12. `https://inklee.app/download`
13. `https://inklee.app/dm-chaos`
14. `https://inklee.app/about`
15. `https://inklee.app/help`
16. `https://inklee.app/terms`
17. `https://inklee.app/privacy`
18. `https://inklee.app/imprint`

Added after the baseline date (ship 2026-07-02, later the same day; they will have no baseline data and first appear in the next review):

- `https://inklee.app/tattoo-appointment-reminders`
- `https://inklee.app/tattoo-client-management`
- `https://inklee.app/guides/how-to-take-tattoo-deposits-online`
- `https://inklee.app/guides/how-to-reduce-tattoo-no-shows`

Reference URLs that should NOT accumulate impressions going forward (verify in the export):

- `https://inklee.app/guest-spots` (308 to `/guest-spot-booking` since 2026-07-02)
- `https://inklee.app/start` (noindex by design)
- Any `/[slug]` artist booking page (noindex by default)

## Query and page baseline

Data requires GSC export (not accessible from the development environment). Populate from the founder export described below.

| Query | Landing page | Country | Device | Branded | Clicks | Impressions | CTR | Average position | Notes |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| _requires export_ | | | | | | | | | |

Branded classification rule: a query is "branded" if it contains `inklee` or an obvious misspelling (`inklee app`, `inkl.ee`, `ink lee`). Everything else is non-branded.

## Page summary

| Landing page | Non-branded clicks | Non-branded impressions | Primary query family | Average position | Account starts | Completed accounts | Notes |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| `/` | _requires export_ | _requires export_ | brand + tattoo booking tool | _requires export_ | _requires Plausible_ | _requires Plausible_ | |
| `/tattoo-booking-software` | _requires export_ | _requires export_ | tattoo booking software/app/system | _requires export_ | _requires Plausible_ | _requires Plausible_ | |
| `/tattoo-booking-form` | _requires export_ | _requires export_ | tattoo booking/request form | _requires export_ | _requires Plausible_ | _requires Plausible_ | |
| `/instagram-booking-link-for-tattoo-artists` | _requires export_ | _requires export_ | instagram booking link | _requires export_ | _requires Plausible_ | _requires Plausible_ | |
| `/tattoo-deposit-tool` | _requires export_ | _requires export_ | tattoo deposit software/deposits | _requires export_ | _requires Plausible_ | _requires Plausible_ | repositioned 2026-07-02 |
| `/tattoo-artist-waitlist` | _requires export_ | _requires export_ | tattoo waitlist software/waitlist | _requires export_ | _requires Plausible_ | _requires Plausible_ | repositioned 2026-07-02 |
| `/guest-spot-booking` | _requires export_ | _requires export_ | guest spot organizer/booking | _requires export_ | _requires Plausible_ | _requires Plausible_ | repositioned 2026-07-02; absorbs `/guest-spots` |
| `/dm-chaos` | _requires export_ | _requires export_ | instagram DM booking pain | _requires export_ | _requires Plausible_ | _requires Plausible_ | |
| `/tattoo-booking-software-vs-instagram-dms` | _requires export_ | _requires export_ | vs Instagram DMs | _requires export_ | _requires Plausible_ | _requires Plausible_ | |
| `/tattoo-booking-software-vs-google-forms` | _requires export_ | _requires export_ | vs/alternative Google Forms | _requires export_ | _requires Plausible_ | _requires Plausible_ | alternative phrasing added 2026-07-02 |
| `/tattoo-booking-software-vs-calendly` | _requires export_ | _requires export_ | vs/alternative Calendly | _requires export_ | _requires Plausible_ | _requires Plausible_ | alternative phrasing added 2026-07-02 |
| `/best-booking-app-for-tattoo-artists` | _requires export_ | _requires export_ | best booking app (roundup) | _requires export_ | _requires Plausible_ | _requires Plausible_ | |
| `/download` | _requires export_ | _requires export_ | Inklee app download | _requires export_ | _requires Plausible_ | _requires Plausible_ | |
| `/about` | _requires export_ | _requires export_ | brand/trust | _requires export_ | _requires Plausible_ | _requires Plausible_ | title moved off category phrase 2026-07-02 |
| `/help` | _requires export_ | _requires export_ | support | _requires export_ | n/a | n/a | |

Account starts / completed accounts come from Plausible custom events (`signup_started`, `signup_completed`) implemented 2026-07-02; they accrue from that date forward, so the first review window with usable conversion data starts 2026-07-02.

## Cannibalization checks

Check in GSC (Performance, filter by query, inspect the Pages tab) whether more than one Inklee URL collects impressions for one query. Expected owners:

| Query | Competing URLs | Primary owner | Action |
| --- | --- | --- | --- |
| tattoo booking software (+app/system) | _requires export_ | `/tattoo-booking-software` | investigate if `/` or `/about` competes |
| best tattoo booking app/software | _requires export_ | `/best-booking-app-for-tattoo-artists` | investigate if the pillar competes |
| tattoo guest spot booking/organizer | _requires export_ | `/guest-spot-booking` | confirm `/guest-spots` impressions decay to zero after the 308 |
| tattoo deposit(s) queries | _requires export_ | `/tattoo-deposit-tool` | |
| tattoo waitlist queries | _requires export_ | `/tattoo-artist-waitlist` | |
| tattoo booking form/request form | _requires export_ | `/tattoo-booking-form` | |
| instagram booking link queries | _requires export_ | `/instagram-booking-link-for-tattoo-artists` | watch overlap with `/dm-chaos` |

## Regional observations

### United Kingdom

- tattoo artist versus tattooist: _requires export_
- inquiry versus enquiry: _requires export_
- major queries: _requires export_
- account creation: _requires Plausible (from 2026-07-02)_

### Europe

- major countries: _requires export_
- major queries: _requires export_
- account creation: _requires Plausible (from 2026-07-02)_

### Southeast Asia

- major countries: _requires export_
- major queries: _requires export_
- account creation: _requires Plausible (from 2026-07-02)_

### East Asia

- major countries: _requires export_
- major queries: _requires export_
- account creation: _requires Plausible (from 2026-07-02)_

## Indexing checks

Run URL inspection (or the Pages report) for each URL. Known-benign notice: "Alternate page with proper canonical tag" is the canonical system working, not an error.

| URL | Indexed | Google-selected canonical | Submitted canonical | Notes |
| --- | --- | --- | --- | --- |
| `/` | _requires GSC_ | _requires GSC_ | `https://inklee.app` | |
| `/tattoo-booking-software` | _requires GSC_ | _requires GSC_ | self | |
| `/tattoo-booking-form` | _requires GSC_ | _requires GSC_ | self | |
| `/instagram-booking-link-for-tattoo-artists` | _requires GSC_ | _requires GSC_ | self | |
| `/tattoo-deposit-tool` | _requires GSC_ | _requires GSC_ | self | request recrawl after 2026-07-02 repositioning |
| `/tattoo-artist-waitlist` | _requires GSC_ | _requires GSC_ | self | request recrawl after 2026-07-02 repositioning |
| `/guest-spot-booking` | _requires GSC_ | _requires GSC_ | self | request recrawl; watch `/guest-spots` drop out |
| `/guest-spots` | should drop out | n/a (308) | n/a | consolidated 2026-07-02 |
| `/dm-chaos` | _requires GSC_ | _requires GSC_ | self | |
| comparison pages (3) | _requires GSC_ | _requires GSC_ | self | |
| `/best-booking-app-for-tattoo-artists` | _requires GSC_ | _requires GSC_ | self | |
| `/download`, `/about`, `/help`, legal (3) | _requires GSC_ | _requires GSC_ | self | |

## Founder export instructions

The development environment has no GSC API access, so the numeric baseline needs a one-time manual export from https://search.google.com/search-console (Domain property `inklee.app`):

1. Performance > Search results. Set the date range to "Last 3 months". Export (top-right) > Google Sheets or CSV. This produces the Queries, Pages, Countries, and Devices tabs in one export. Save as `gsc-baseline-2026-07-02-3m.csv` (or a Sheet named the same).
2. Repeat with the date range "Last 28 days" > save as `gsc-baseline-2026-07-02-28d.csv`.
3. For the cannibalization table: in Performance, filter Query = each head query above, open the Pages tab, and note every URL with impressions > 0 for that query.
4. For regional observations: Performance > Countries tab (already in export 1); additionally filter Country = United Kingdom and export the Queries tab to see tattooist/enquiry variants.
5. Indexing > Pages: note counts of indexed vs not-indexed and any "Duplicate without user-selected canonical" entries (none expected).
6. URL inspection for the three repositioned pages (`/tattoo-deposit-tool`, `/tattoo-artist-waitlist`, `/guest-spot-booking`) and request reindexing so the 2026-07-02 titles land faster. Do the same for `/about`. Quota is roughly 10 URLs/day.
7. Re-submit the sitemap (Sitemaps > `https://inklee.app/sitemap.xml`) after the 2026-07-02 page additions deploy, so the four new URLs are discovered quickly. (IndexNow also pushes them to Bing.)
8. Paste the exported numbers into the tables above (or attach the Sheet link under "Data source") and delete the corresponding `_requires export_` markers.

## Unresolved questions

- Does the home/about/pillar query overlap actually cost clicks (canonical strategy, validation backlog item)? Answer from the query-level export.
- How much UK volume uses "tattooist"/"enquiry" phrasing? Determines whether supporting copy needs strengthening (never separate pages).
- Do the "-vs-" pages already collect "alternative" impressions after the 2026-07-02 phrasing additions?

## Next review

- Review date: 2026-08-02 (4 weeks after baseline; repositioned titles should be recrawled by then)
- Comparison window: 2026-07-02 to 2026-08-02 vs the pre-change 3-month export
- Owner: founder (export) + ChatGPT (interpretation) + Claude Code (any resulting implementation slices)
