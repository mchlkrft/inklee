# Mobile dashboard (Home) redesign — spec

**Status:** proposed / approved-in-principle 2026-06-15. Blueprint before code (founder picked "spec doc first"). Branch `feat/dashboard-redesign`.

**Context.** The founder shared a reference dashboard (a freelancer **invoicing** app) and asked to land "something in the middle": the reference's **easier UI structure** (a personalized rotating welcome, a glanceable box overview, an action feed with inline quick-response buttons) combined with **Inklee's richer functionality** (the real per-item quick actions Inklee already supports). The reference is money-centric (revenue incl. VAT, VAT this month). **Inklee is a tattoo booking tool with no revenue/VAT concept** — we borrow the reference's *structure and feel*, never its accounting content.

**Decisions locked (this session):**
- **Hero glance box = "Requests waiting"** (pending requests), not a money box. It is the action-bearing metric a solo artist reopens to handle. (Rejected: a "deposits collected" money box — it isn't true revenue and can mislead; rejected: equal symmetric tiles — loses the reference's focal point.)
- **Greeting rotates per login** (a new session / cold launch), not per app-open (per-open reads as noisy). State-aware where possible.
- Books open/closed status stays in the **TopBar pill** (founder round 4), not on the dashboard.
- One `/api/mobile/home` aggregate remains the single source of truth, mirrored 1:1 by the web dashboard (one-source-of-truth rule).

---

## 1. Goal

Turn the Home tab from a **navigational board** (every action requires drilling into a detail screen) into a **triage board**: glance the state in one fixation, then act on the exact thing that needs you without leaving Home. Keep Inklee's per-widget control and web parity.

## 2. Current-state audit

Source: `apps/mobile/app/(tabs)/index.tsx` (HomeScreen), fed by `GET /api/mobile/home`; web twin `apps/web/src/app/(artist)/dashboard/page.tsx`.

**Strengths (keep):**
- Single `/home` aggregate, gated per widget by `data.dashboardWidgets`; web parity 1:1.
- Glanceable counts already exist (pending, upcoming, waitlist) as big numbers.
- Strong zero/empty handling: waitlist hidden at zero, zero-request artists pivot to "share your link", all-hidden escape-hatch card, loading + error + pull-to-refresh.
- Shared primitives (`Card`, `CardHeader`/`IconChip` tints, `StatusPill`, `TravelIcon`, `PillButton`) + the Accept/Pass + `humanStatusLabel` vocabulary.
- Per-widget toggle screen (`settings/dashboard.tsx`) + shared `dashboard-settings.ts`.

**Weaknesses (what the redesign fixes):**
1. **Purely navigational** — every real mutation (Accept, Pass, Mark deposit received, Convert waitlist) already has a wired endpoint but forces tap-into-detail-tap-to-act. The single biggest time tax for a 10-30s triage reopen.
2. **Counts scattered, not unified** — pending/upcoming each render their own card; `thisMonthCount` and the deposits outstanding/overdue rollups (already computed on sibling endpoints) never reach Home.
3. **Deposits invisible on Home** — a high-value money-shaped operational signal (overdue/awaiting) is buried behind the bookings tab.
4. **Nothing is ranked** — pending/upcoming are flat recency lists capped at 3; the artist's true next action (overdue deposit, oldest-unanswered request) doesn't float to the top.
5. Minor web/mobile drift (mobile shows a big count on Upcoming; web doesn't) + the toggle list lags the actual surface (Insights is always-on; books pill moved to TopBar).

## 3. Dashboard best practices (the ones that drove this design)

- **Hero = "what needs me right now,"** not a logo, greeting, or vanity chart. For Inklee that's requests waiting.
- **One verb per item, surfaced inline.** Remove the navigation tax on the most frequent operation.
- **Order by urgency + decay, not by feature.** Action-required first; ambient (links, insights) sinks. No charts on Home.
- **Counts must be live and trustworthy** — a big number is a promise; stale/double-counted numbers kill the operator's trust.
- **~5-7 cards max on the daily surface; let the operator hide the rest** (preserve toggles + all-hidden escape).
- **Thumb arc** — primary verbs on the right of each row, ≥44pt targets, full-row hit areas, `hitSlop` on small header links. Status display up top; frequently-tapped controls never stranded in the top corner.
- **Greeting is thin chrome**, never the hero; rotate from a small curated pool; **state beats sentiment** ("3 requests waiting" > "hello"); always a safe fallback; greeting is decorative for screen readers, the counts are the real labeled content.
- **Zero states are activation moments** (brand-new artist → share booking link), never dead gray lines.

## 4. Proposed structure (the "middle")

Reference hierarchy (greeting → glance boxes → action feed) + Inklee's inline actions + urgency ranking.

```
+----------------------------------------+
| [Books open]          inklee   (bell)(o)|  TopBar (status stays here)
+----------------------------------------+
|  What's up, Michel?                     |  rotating greeting (per login)
|  Wednesday, June 15                     |  date
|                                         |
|  +------------------+ +--------------+  |  asymmetric glance grid
|  | [inbox]          | | [cal] Upcoming| |
|  | Requests waiting | |   8          |  |  satellites tap to their list
|  |   3  · 2 new today| +--------------+ |
|  |                  | | [!] Deposits  | |  shown only when >0;
|  +------------------+ |  2 due (1 over)| |  tinted danger if overdue
|        (hero, taps -> /bookings)        |
|                       +--------------+  |
|                                         |
|  Action required                    4   |  centerpiece — inline verbs
|  +-------------------------------------+ |
|  | Mara K.        [overdue deposit]   | |
|  | Forearm · due 3d ago [Mark received]| |  one-tap
|  | Jonas P.            [pending]      | |
|  | Sleeve · prefers Jul 4 [Accept] Pass| |  Accept 1-tap; Pass 2-step
|  | Ada R.  [pending]      [Accept] Pass| |
|  | +1 more ->                         | |  -> /bookings
|  +-------------------------------------+ |
|                                         |
|  Guest spots · Your pages · Insights    |  ambient, demoted (+ toggles)
+----------------------------------------+
| [Home]  Bookings  Travel  Settings      |  bottom nav (thumb arc)
+----------------------------------------+
```

## 5. Section-by-section spec

1. **Greeting + date** (always; thin chrome). Rotating greeting (see §6) replacing the static "Overview" subline; date below. No tap target. The counts below are the real content (a11y).
2. **Glance grid** (always):
   - **Hero — Requests waiting**: `pendingCount`, accent-tinted box, Inbox chip, label "Requests waiting". Whole box → `/bookings`. **v1 ships the count alone** (founder decision); the "N new today" pill is deferred (would need a small payload addition). Do **not** show a "% vs last week" trend — Inklee does not compute it; do not fake it.
   - **Satellite — Upcoming**: `upcomingCount`, CalendarDays/rosa → `/bookings/calendar`.
   - **Satellite — Deposits due** (conditional, only when `outstandingCount > 0`): overdue+awaiting count, tinted danger if any overdue → the deposits view (`(tabs)/bookings/deposits`). New money-shaped signal on Home.
   - **Satellite — This month**: `thisMonthCount` (requests received this month) → `/insights`. The single volume glance so no chart is needed on Home.
   - Zero-value satellites dim but keep their slot (constant grid shape = parseable in one fixation). For `isZeroRequest` artists the grid is replaced by the existing "share your booking link" activation card.
3. **Action required feed** (the centerpiece; rendered when it has items). One Card "Action required" + live count in the header. A single **urgency-ranked, interleaved** list (cap ~4-6, "+N more" → `/bookings`). Each row = client + one-line context + `StatusPill` (`humanStatusLabel`) + its **inline primary verb** (+ optional quiet secondary). Row tap (anywhere but the button) → `/bookings/[id]`.
   - **Ranking (decay-aware):** overdue deposits → oldest-unanswered pending requests → deposits awaiting (manual) → (today's confirmed appointments are a glance, not an action, so excluded from the feed).
   - **Row types & inline verbs (reuse `BookingActions` logic — no new backend, no copy drift):**
     - Pending request → **[Accept]** (one-tap `approveBooking`, optimistic: hero count drops) + **Pass** (two-step `ConfirmAction`, `rejectBooking`).
     - Overdue / awaiting **manual** deposit → **[Mark received]** (one-tap `markDepositReceived`).
     - (Optional) Pending request needing a deposit → **[Request deposit]** expands the existing inline `DepositRequestForm` in place (amount + dueAt), no detail round-trip.
     - Free-slot **waitlist** entry → **[Convert]** (`POST /waitlist/[id]/convert`) or a "View" → `/waitlist` if it needs context.
   - **Destructive actions (Refund, Cancel) stay detail-only** — not high-frequency; reserve red for action-required.
   - **Empty:** "You're all caught up." For `isZeroRequest`: the share-your-link activation row (Copy link / Preview inline).
4. **Ambient, demoted** (each conditional on its existing toggle):
   - **Guest spots** — up to 3 trip-leg rows, "Plan" → `/travel`, rows → `/travel/trips/[id]`. No inline action (none exists).
   - **Your pages** — Booking / Waitlist / Link Hub rows with inline Copy link / Preview (kept; those are real inline actions + matter for activation).
   - **Insights** — single quiet row → `/insights`. Never a chart on Home.
5. **All-hidden fallback** (preserved verbatim) → `/settings/dashboard`.

## 6. Rotating greeting

- **Cadence:** changes each **login** (new session / cold launch), not each app-open. Implementation: seed the pick by a per-session value (e.g. the session start, or a stored counter incremented on sign-in) so it is stable within a session but fresh next login.
- **State-aware where cheap:** prefer a line that reflects the live state when there is work ("3 requests waiting on you"), else a time-of-day / playful line. State beats sentiment.
- **Voice:** sentence case, no em-dashes, warm but operator-grade, a little playful, never cutesy. Reuse `humanStatusLabel` vocabulary; terminal punctuation only on full sentences.
- **Fallback:** when name/data is missing, fall back to the display name then "Home" (never a broken/empty greeting).
- **a11y:** greeting is decorative chrome; the counts/feed are the real, independently-labeled content.
- **Sample pool (curate ~8-12):** "What's up, {name}?" · "{name} returns." · "Good morning, {name}." · "3 requests waiting on you." · "All caught up. nice work." · "Back already? let's clear the queue." · "Your board's looking light today." · "A couple of things need you."

## 7. Keep / cut

**Keep:** the `/home` single aggregate + web parity (extend, don't fork) · per-widget toggles + all-hidden escape · books pill in the TopBar · big glanceable counts + "+N more" overflow (cap previews, never paginate on Home) · shared primitives + Accept/Pass + `humanStatusLabel` · zero/empty/loading/error/pull-to-refresh · the inline `DepositRequestForm` + `BookingActions` logic (reuse inline) · setup/bio nudges.

**Cut / change:** the standalone navigational-only Pending and Upcoming cards (counts fold into the grid, rows merge into the ranked feed) · the static "Overview" subline (→ rotating, state-aware greeting) · read-only action-less rows (every actionable row gets its verb inline) · the mobile-only big count on Upcoming (fixes the web/mobile drift) · any money/revenue hero (Inklee has none) · charts on Home.

## 8. Build plan

A proper slice; plan → build → adversarial review → verify, like the recent Link Hub work.

1. **API (`/api/mobile/home` + web `dashboard/page.tsx` read):** fold `thisMonthCount` (already on `/bookings/stats`) and the deposits-outstanding rollup (already on `/bookings/deposits`) into the home aggregate; add the per-item fields the feed needs (deposit state per booking, waitlist-convertible flag) and a stable urgency-ranking. Keep it one aggregate (one source of truth); the web dashboard consumes the same additions.
2. **Shared:** any ranking/derivation that both surfaces need goes in `packages/shared` or `apps/web/src/lib/server/*` (not duplicated). Reuse `deposit-state.ts` for deposit classification.
3. **Mobile (`(tabs)/index.tsx`):** new greeting helper (rotating, per-login, state-aware) → glance grid (hero + satellites) → action-required feed (ranked, inline verbs reusing `BookingActions`) → ambient (guest spots, pages, insights). Optimistic count updates on Accept/Pass/Mark-received + query invalidation.
4. **Web parity:** mirror the structure on the web dashboard (greeting, glance grid, action feed with inline server-action buttons). One-source-of-truth for the feed/ranking logic.
5. **Toggles:** the glance grid + action feed are **always-on** (not toggleable); **only the ambient cards keep per-widget toggles** (founder decision). Reconcile `dashboard-settings.ts`: the `pending_requests` + `upcoming_appointments` toggles fold away (those now live in the always-on grid/feed), keep toggles for `guest_spots` and `booking_link` ("Pages"); Insights stays always-on as today. Migrate/parse legacy values so existing artist settings don't break.
6. **Review + verify:** typecheck + lint + build (both apps) + the shared tests; adversarial review (data integrity of the inline mutations on Home, optimistic-update correctness, ranking, parity); then merge (web auto-deploys) + next Expo build for mobile.

## 9. Resolved decisions (2026-06-15)

- **Hero pill:** none for v1 — the hero ships the **count alone**; the "N new today" pill is deferred.
- **Deposits-due satellite:** shown **only when there are deposits outstanding** (`outstandingCount > 0`); hidden otherwise (no dimmed-at-zero box).
- **Toggle granularity:** **ambient cards only** keep per-widget toggles; the glance grid + action feed are always-on.
- **Scope:** **web + mobile together** in one slice (parity), not mobile-first.

## 10. Out of scope / risks

- No new financial/revenue concept (Inklee is not bookkeeping); "deposits" stay operational counts + a Mark-received action, never a revenue KPI.
- Inline mutations on Home increase the blast radius of a bad optimistic update — needs careful invalidation + the adversarial-review pass.
- Stripe is test-mode in prod (pre-launch); deposit actions on Home are exercised but no real charges move until a live key is set.
