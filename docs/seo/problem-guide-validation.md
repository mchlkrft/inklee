# Problem-led guide validation (P2)

Validates the six candidate guide topics from the canonical strategy (`docs/seo/inklee-seo-strategy.md`, "P2: problem-led authority validation") and selects the first two to build.

- Date: 2026-07-02
- Method: live SERP review (web search, one query per candidate, top ~10 organic results), the documented Reddit community-language research (`docs/seo-strategy.md` §2-§3), current Inklee page ownership, and product-fit checks against shipped functionality. 
- Quantitative data: **monthly volume, keyword difficulty, and CPC are Unavailable** (no keyword tool access from this environment). Scores are qualitative; re-check volumes when a keyword tool or GSC history is available.
- Scoring: 1 to 5 per criterion (5 best). Total = sum of the eight scored columns (product fit through usefulness).

## Validation table

| Candidate | Intent | Likely owner | Product fit | SERP fit | Ranking feasibility | Commercial connection | Cannibalization risk | Usefulness | Total | Decision |
| --------- | ------ | ------------ | ----------: | -------: | ------------------: | --------------------: | -------------------: | ---------: | ----: | -------- |
| how to take tattoo deposits online | Artist operational how-to (money process) | `/tattoo-deposit-tool` | 5 | 5 | 4 | 5 | 5 (low risk) | 5 | **29** | **Build first** |
| how to reduce tattoo no-shows | Artist operational how-to (attendance) | `/tattoo-appointment-reminders` | 5 | 5 | 3 | 5 | 5 (low risk) | 5 | **28** | **Build second** |
| how to manage tattoo bookings | Broad artist workflow how-to | `/tattoo-booking-software` | 4 | 3 | 3 | 4 | 3 (pillar overlap) | 4 | 21 | Postpone (P4 reconsider) |
| how to organize tattoo requests | Artist workflow how-to, but SERP splits client/artist | `/tattoo-booking-form` | 4 | 2 | 3 | 4 | 3 (form-page overlap) | 4 | 20 | Postpone (P4 reconsider) |
| how to create a tattoo booking process | Artist workflow how-to | `/tattoo-booking-software` | 4 | 2 | 3 | 4 | 2 (duplicates #1 + form content) | 4 | 19 | Postpone; likely merge into #1 if ever built |
| how to stop booking through Instagram DMs | Artist migration how-to | `/dm-chaos` or `/instagram-booking-link-for-tattoo-artists` | 5 | 3 | 4 | 5 | 1 (intent already owned twice) | 4 | 22 | Support through copy on existing owners; guide only with a distinct step-by-step migration angle later |

Scored columns: product fit, SERP fit (does the SERP match an artist-side operational guide), ranking feasibility (young domain vs incumbents), commercial connection, cannibalization risk (5 = low risk), usefulness without an Inklee account. Intent and owner are descriptive.

## Per-candidate evidence

### 1. how to take tattoo deposits online — SELECTED (guide 1)

- Dominant page type: competitor SaaS operational guides + individual artists' own deposit-payment pages.
- Top-ranking competitors observed: Venue Ink (strategy guide + deposits/payments feature page), Apprentice ("without getting burned"), Tattoo Studio Pro (online-deposits help + feature page), LVL2, TattooBizGuide, plus real artist deposit checkout pages (inkinktat.com, rabblerousertattoo.com).
- Community wording (Reddit research): "take/collect tattoo deposits online", "deposit link", "ghosted deposits", "booking fee".
- Closest existing Inklee page: `/tattoo-deposit-tool` (commercial feature evaluation). The guide answers the *how do I actually do this* question (methods, policy, timing, records, manual vs card), which the commercial page deliberately does not.
- Cannibalization: low. Informational how-to vs commercial evaluation; the guide links up to the deposit page as its one owner.
- Why selected: exact product fit (deposits shipped, free manual + Stripe card), unambiguous artist-side intent, high usefulness without Inklee (policy writing, payment methods, record keeping), strongest natural conversion path of all six.

### 2. how to reduce tattoo no-shows — SELECTED (guide 2)

- Dominant page type: competitor SaaS listicle/strategy guides.
- Top-ranking competitors observed: Tattoo Studio Pro (two pages incl. an SMS-heavy one), InkDesk, Tattoogenda, Killer Ink, Bookedin, DaySmart, BestTattooApps, StudioFlo, Painful Pleasures.
- Community wording: "no-shows", "ghosting", "deposit protects the slot", "cancellation list".
- Closest existing Inklee page: `/tattoo-appointment-reminders` (ships today as the new commercial owner). Distinct: the guide covers the full anti-no-show system (deposits, policy, reminders, reconfirmation, waitlist backfill); the page evaluates the reminder feature.
- Cannibalization: low (brand-new cluster; the guide feeds the new owner page).
- Honesty guardrails for the build: competitor content leans on SMS statistics; Inklee reminders are email only and the guide must not cite fabricated stats or imply guaranteed reduction.
- Why selected: unambiguous intent, native pain language, connects four shipped features (deposits, reminders, reconfirmation, waitlist), useful without Inklee, and it strengthens the just-launched reminders page's topic cluster. Feasibility scored 3 (crowded SERP) but every incumbent is a competitor blog, not an authority site, and none owns the email-first, artist-controlled angle.

### 3. how to manage tattoo bookings — postponed

- SERP: Bookedin (4 results), Venue Ink (2), Vagaro, Porter, Mantra; drifts toward studio/shop management and multi-artist studios.
- Risk: heavy overlap with the pillar's own promise; a young-domain guide against four entrenched Bookedin posts is a weak first bet; partial studio-intent mismatch (Inklee is solo-artist software today).
- Reconsider at P4 with GSC query data.

### 4. how to organize tattoo requests — postponed

- SERP: mixed intent; roughly half the results are CLIENT-side "how to submit your idea to an artist" (Tattoodo, Quora, Hyperinkers, Tattd). Google currently reads this query as substantially client-intent.
- Risk: an artist-side guide fights the dominant interpretation; the artist-side content largely collapses into `/tattoo-booking-form`'s existing job.
- Reconsider at P4; meanwhile the form page's copy already captures the artist-side phrasing.

### 5. how to create a tattoo booking process — postponed

- SERP: near-duplicate of candidate 1's and the booking-form SERP (Vagaro, Porter, Mantra appear again; Jotform/forms.app template pages).
- Risk: selecting it alongside "how to manage tattoo bookings" would violate the no-duplicate-pair rule; standalone, it mostly duplicates `/tattoo-booking-form` + pillar content.
- If ever built, fold into a single "booking process" guide with candidate 3, not two separate guides.

### 6. how to stop booking through Instagram DMs — support through copy

- SERP: thin and odd (a satire piece, Tattoodo's for-artists page, an app-builder ad page, a client-side forum thread) — actually weak competition.
- BUT: Inklee already owns this intent twice (`/dm-chaos` problem page + `/tattoo-booking-software-vs-instagram-dms` comparison). The canonical strategy allows a guide here only with a distinct step-by-step migration angle.
- Decision: strengthen the existing owners through copy where needed now; revisit a "migration checklist" guide at P4 once the first two guides have data. Cannibalization risk today outweighs the weak SERP.

## Selection

Per the guide selection rule (distinct intent, realistic ranking opportunity, strong product connection, low cannibalization, useful without Inklee, one natural commercial path — explicitly not volume-ranked):

1. **`/guides/how-to-take-tattoo-deposits-online`** — commercial owner: `/tattoo-deposit-tool`.
2. **`/guides/how-to-reduce-tattoo-no-shows`** — commercial owner: `/tattoo-appointment-reminders`.

The two do not overlap each other (money process vs attendance operations; one shared SERP result out of ~10 each), each maps to a shipped feature set, and each has one clear owner page.

## SERP sources reviewed (2026-07-02)

- venue.ink (blog + feature pages), bookedin.com/blog (multiple), vagaro.com/learn, getporter.io/blog, mantratattoo.us, tattoodo.com guides + for-artists, jotform.com, forms.app, useapprentice.com, tattoostudiopro.com (multiple), lvl2.ink, tattoobizguide.com, inkdesk.app, tattoogenda.com, killerinktattoo.co.uk, besttattooapps.com, daysmart.com/bodyart, studioflo.io, painfulpleasures.com, appinstitute.com, tattooclient.com, inkinktat.com, rabblerousertattoo.com, hyperinkers.com, tattd.co, quora.com, lastsparrowtattoo.com, thehardtimes.net (satire), bookniapp.com, sourceforge.net.
