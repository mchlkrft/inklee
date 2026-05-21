# Slice 60d — Flash feature restructure

**Date:** 2026-05-21
**Status:** In progress — 60d.1 implementation starting after this doc lands
**Predecessor:** Slices 60a–60c (UX audit pass) closed via `8a5ea32` + `25d0373`
**Origin:** the original Slice 60d scope was "Flash thorough audit + flow integration." The 60a multi-agent audit deliberately did not touch Flash (deferred to this slice). Founder collected friction notes from real first-touch with the feature; this doc synthesizes both into a concrete restructure plan.

---

## A. Why this slice exists

Flash is the second-most complex feature in Inklee after booking core. It crosses three surfaces (`/flash/items`, `/flash/days`, `/flash/instagram`), depends on an external integration (Instagram OAuth + media sync), and the data model is denser than the rest (`flash_items` has 18 columns, plus `flash_days`, plus `instagram_accounts`, plus `instagram_posts`). The current UX makes that complexity visible to the artist instead of hiding it behind a simpler mental model.

Real first-touch with the feature surfaced enough friction that the original "audit + targeted fix" framing isn't enough — Flash needs a small structural rework, not just copy and layout tweaks.

---

## B. Audit findings

The state of the Flash feature before this slice:

| #   | Surface            | Friction                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `/flash`           | Redirects straight to `/flash/items`. No landing/overview that frames "what is Flash, what's my next step." First-time artists land in a table with no flash items and no clear guidance toward Instagram connection (which is the easier path).                                                                                                                                   |
| F2  | `/flash/items`     | Desktop-only **table** layout (Item / Mode / Pending / Confirmed / Availability / Actions). Columns hide aggressively on mobile. For a feature that's fundamentally visual (tattoo designs), the absence of any preview image in the list is the biggest UX miss.                                                                                                                  |
| F3  | `/flash/items/new` | Full-page form with **15+ visible fields** (title, slug, status toggle, booking mode picker, description, image upload OR URL, IG URL, pricing, size, placement, two date pickers, flash day select). Cognitive overload — and most artists actually want to import from Instagram, not create from scratch.                                                                       |
| F4  | `/flash/instagram` | Only discoverable via sidebar sub-item or by scrolling. Not surfaced as the primary path from `/flash/items` empty state.                                                                                                                                                                                                                                                          |
| F5  | `/flash/days`      | Plain list of titles + dates + locations + item counts. No image previews. **"Location" is a free text field** — disconnected from the studio library (Trip Planner has structured studios with city + Google place ID).                                                                                                                                                           |
| F6  | `/flash/days/[id]` | Edit form + a "linked items" list, but **no way to attach existing items to the day from this page**. You have to go to each flash item individually and use the "Flash day" dropdown. Awkward.                                                                                                                                                                                    |
| F7  | Flash days         | Three+ different artist mental models (daily collection / attended event / hosted-at-studio event) are squeezed into one model with no surface to share publicly. The data model has `status (upcoming/active/past/cancelled)` but no `is_public` flag. **Flash days aren't independently shareable today.** The public page only lists flash _items_; flash _days_ are invisible. |
| F8  | Cross-feature      | An approved flash booking shows the item title + link on the request detail page (good), but flash items themselves don't show in `/bookings/overview` differently from custom bookings. That part is fine (consistency principle).                                                                                                                                                |
| F9  | Mode labels        | "Unique / Limited / Repeatable" booking mode is unintuitive without the helper text. Could be more concrete ("One-of-a-kind / Set a max / Always bookable").                                                                                                                                                                                                                       |
| F10 | Sidebar            | "Flash → Flash Items / Flash Days / Instagram" sub-nav structure prioritizes the developer-internal model over the artist's mental model (which would be "designs / events / where they come from").                                                                                                                                                                               |

---

## C. Founder thoughts (verbatim, 2026-05-21)

> - Flash day location should be linked to studio library.
> - Flash intro should promote connect instagram account as main goal, because its easier to navigate and use the flash tool.
> - Flash main page should look similar to current instagram subpage: each item is presented via picture and title. Artists will include here probably many items so it would be good to have grid with 5-8 items per row. Goal is a good overview and easy access to main functionality. Artists might just want to quickly mark items as booked.
> - New items should open via modal, like other features as well. Before showing all fields to insert data it should only ask if the user wants to add a new item from instagram or custom by hand (choose better wording).
> - Flash day functionality is not clear enough. Flash days should be sharable and list all added flash sheets. Use case for flash days: 1. artist is using it for daily workflow, just collecting everything inside, because its easy to have everything in one place. 2. artist is attending flashday events and wants to add a certain custom choice of flash designs for this event only. 3. artists offer their own flashday at the studio and want to use the flashday as a sharable page to advertise bookings for the event.
> - Some artists even use their dedicated second instagram account with flash sheets only and just want to make it bookable.

---

## D. Synthesized decisions

### D1. Information architecture

No route moves. Three sub-page roles get clearer:

| URL                                  | Role today                     | Role after restructure                                                                                         |
| ------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `/flash`                             | Redirect to `/flash/items`     | **Landing page.** Overview + entry points. Empty state pushes Instagram-connect first.                         |
| `/flash/items`                       | Desktop table                  | **Visual grid** — preview-first tiles, mobile-friendly.                                                        |
| `/flash/items/new`                   | Full form                      | **Removed as primary path.** Modal-driven creation from `/flash/items`. Page stays accessible for direct URLs. |
| `/flash/items/[id]`                  | Full form                      | Stays. Could become modal later but not in this slice.                                                         |
| `/flash/days`                        | List                           | **Visible list** with day-card previews + visibility state.                                                    |
| `/flash/days/[id]`                   | Form + linked items            | Gains an "Add items" multi-select from the artist's library.                                                   |
| `/flash/instagram`                   | Account connect + post browser | Unchanged structurally; prominently linked from `/flash` empty state.                                          |
| **NEW** `/{slug}/flash/days/{dayId}` | —                              | Public shareable flash-day page (only when `is_public = true`).                                                |

### D2. Sidebar relabel

| Now                                            | After                                |
| ---------------------------------------------- | ------------------------------------ |
| `Flash → Flash Items / Flash Days / Instagram` | `Flash → Designs / Days / Instagram` |

Routes unchanged. Short labels, less internal-jargon.

### D3. Schema changes (minimal)

Single migration covers both flash-day needs:

```sql
-- 0033_flash_days_extension.sql
ALTER TABLE flash_days
  ADD COLUMN studio_id UUID REFERENCES studios(id) ON DELETE SET NULL,
  ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Add a public-read policy so /{slug}/flash/days/[dayId] resolves for anon
-- (the day page itself reads via serviceClient per the 0030 hardening pattern,
-- so an anon policy is technically not required — but the day's linked
-- flash_items still need their existing "public can read published flash items"
-- path. No new policy needed if we stick with serviceClient on the public route.)
```

The existing `flash_days.location TEXT` column stays for the "external venue not in my library" case. UI prefers structured `studio_id` when set.

### D4. The three flash-day use cases — one model

All three founder use cases collapse into one model with two new flags:

| Use case                                          | Day setup                                                                                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Daily workflow** ("everything in one place") | Auto-created day per artist titled e.g. "My flash". `is_public = false`, no `scheduled_on`, no `studio_id`. Acts as the default container when an artist hits "+ New design" without picking a day. |
| **2. Attending external flash event**             | New day, optional `location` free text (external venue), `is_public = true` if the artist wants to share that subset.                                                                               |
| **3. Hosting flash day at own studio**            | New day, `studio_id` from library, `is_public = true`, `scheduled_on` set. Becomes a shareable booking-promo page at `/{slug}/flash/days/[dayId]`.                                                  |

**The "auto-create My flash day" question is deferred** — it's a UX simplification but adds first-write semantics on a new table. Default behaviour stays: flash items can sit dayless (current `flash_day_id NULL`), and the public flash overview at `/{slug}/flash` lists all dayless + day-linked published items. Adding the auto-default later is non-breaking.

### D5. The new-item modal split

```
[ + New design ]   ← single button on /flash/items

  ↓ click

╭──────────────────────────────────╮
│ Add a flash design               │
│                                  │
│  ┌────────────────────────────┐ │
│  │ 📷 Pick from Instagram     │ │  ← greyed when not connected,
│  │    (N synced posts)        │ │    with "Connect Instagram" CTA
│  └────────────────────────────┘ │
│                                  │
│  ┌────────────────────────────┐ │
│  │ ✎ Upload my own            │ │  ← founder asked for better wording
│  │    (image + details)       │ │    than "custom by hand"
│  └────────────────────────────┘ │
╰──────────────────────────────────╯
```

Wording draft: **"Pick from Instagram"** vs **"Upload my own"** (instead of "custom by hand"). Open to refinement during 60d.2.

### D6. The grid tile

Each tile on `/flash/items` displays:

- Preview image (square aspect, object-cover)
- Title (single line, truncate)
- Small status indicator (only shown when NOT default state — i.e., show "Draft" / "Archived" / "Not bookable" but no pill for plain published-and-bookable items)
- Hover/tap → opens the edit page
- One quick action (top-right overlay): **toggle `is_bookable`** as the "mark as booked" / "mark unbookable" quick lever. Uses the existing `is_bookable` boolean (NOT a separate "booked" flag). For artists in `unique` mode whose item just got booked: the availability label already auto-shows "Booked"; the quick action is for _pre-emptive_ "I'm not taking more requests for this design."

Counts (pending/confirmed) and detailed availability stay on the edit page — not on the tile.

### D7. Second-Instagram-account question (deferred)

Today `instagram_accounts.artist_id` is UNIQUE — one IG per artist. That account also feeds `/{slug}` profile thumbnails (cached in `logos/`).

For artists with a flash-only second IG, two paths:

- **A. Allow two accounts per artist, tagged.** Add `instagram_accounts.kind TEXT CHECK ('primary','flash')`. Drop UNIQUE on artist_id; add UNIQUE on (artist_id, kind). The flash-only account never feeds the main profile.
- **B. Allow swapping which IG is "connected for flash" without persisting two.** Simpler but the artist has to disconnect-and-reconnect to swap.

Decision: **defer to a separate decision doc** (`docs/flash-second-ig-decision.md`) after one real artist asks for it. Today's UNIQUE constraint isn't blocking the slice work.

### D8. What stays untouched

- Public booking flow for flash items (`/{slug}/flash/[flashSlug]` page + actions) — works fine, no friction reported.
- `computeFlashAvailability` logic — accurate.
- `booking_requests.flash_item_id` cross-feature integration — flash bookings already surface correctly in the dashboard and request-detail page.
- Instagram OAuth flow (commits `6ed5575` + `c12590f`) — stable.
- `flash_items` schema beyond what's already there — 18 columns is many but each one has a real product role.

---

## E. Sub-slice breakdown

Three independent commits. Each must pass `pnpm typecheck` + `pnpm lint` + `pnpm build` clean.

### Slice 60d.1 — Flash landing + visual grid

**Goal:** Replace `/flash` redirect + `/flash/items` table with a landing page and a visual grid. Make Instagram-connect the obvious first step. Mobile-friendly throughout.

**Scope:**

- `/flash/page.tsx` (rewrite from `redirect()` to a real overview page):
  - If `flash_items.count === 0` AND no `instagram_accounts` row: **empty state pushes Instagram-connect as the primary CTA**, with "Or create one manually" as a secondary link.
  - If `instagram_accounts` exists but `flash_items.count === 0`: show "You have N synced Instagram posts — pick a few to make bookable" with a CTA to `/flash/instagram`.
  - If `flash_items.count > 0`: redirect to `/flash/items` (or render the grid inline, decision during implementation).
- `/flash/items/page.tsx`:
  - Replace `<table>` with a **responsive grid**: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`. Founder asked for 5–8 per row — 5 at `lg` and 6 at `xl` matches; we can bump to 7–8 if `2xl` proves cramped.
  - Each tile: square preview image with `object-cover`, title below, small status badge only when status ≠ published OR `is_bookable` = false. Tap on tile → goes to `/flash/items/[id]`.
  - One quick action top-right: toggle `is_bookable`. Renders as a small icon button with checked/unchecked state. Form-action + `useTransition`-driven; no full page reload.
  - Mobile (375px): 2-column grid, ~150px tiles. Still scrollable, still tap-targetable.
- `/flash/items` still has the `+ New design` button in the header — for now still routes to `/flash/items/new` (modal comes in 60d.2).
- Empty state on `/flash/items` directly: if no items, render the same Instagram-first empty state as `/flash`.

**Affected files:**

- `src/app/(artist)/flash/page.tsx` (full rewrite)
- `src/app/(artist)/flash/items/page.tsx` (rewrite — grid replaces table)
- `src/app/(artist)/flash/items/actions.ts` (add `toggleFlashItemBookableAction` for the quick action)
- `src/components/app-shell/nav-config.ts` (label tweak: "Flash Items" → "Designs", "Flash Days" → "Days")
- `src/components/flash-nav.tsx` (matching mobile sub-nav labels)

**Things not to touch in 60d.1:**

- Edit page (`/flash/items/[id]`)
- New item creation flow (`/flash/items/new`) — comes in 60d.2
- Flash days surfaces
- Public `/{slug}/flash` page
- Schema

**Acceptance criteria:**

- `/flash` renders a landing page with Instagram-first empty state (or grid passthrough if items exist).
- `/flash/items` renders as a responsive grid at every breakpoint (375px, 768px, 1024px, 1440px).
- Each tile has a preview image (fallback gracefully when null), title, and a quick `is_bookable` toggle.
- Sidebar reads "Flash → Designs / Days / Instagram".
- `pnpm typecheck` + `pnpm lint` (0 new errors) + `pnpm build` all clean.
- Single commit.

### Slice 60d.2 — New-design modal split

**Goal:** Replace direct navigation to `/flash/items/new` with a modal that forks "Pick from Instagram" vs "Upload my own."

**Scope:**

- New client component `src/components/flash-new-item-modal.tsx` matching the `FeatureIntroModal` shape — centered overlay, backdrop, escape-dismiss.
- Modal body: two large tap targets. "Pick from Instagram" → routes to `/flash/instagram`; greyed if no IG connected, with a Connect CTA. "Upload my own" → routes to `/flash/items/new` (existing form).
- `/flash/items` "+ New design" button opens the modal instead of navigating.
- `/flash/items/new` page remains accessible for direct URLs (e.g., from the modal itself, from old bookmarks).

**Affected files:**

- `src/components/flash-new-item-modal.tsx` (new)
- `src/app/(artist)/flash/items/page.tsx` (swap button → modal trigger)
- `src/app/(artist)/flash/page.tsx` (if the landing-page empty state also has a "+ New" affordance, wire it the same way)

**Things not to touch:**

- The existing `/flash/items/new` form page itself.
- IG connection flow.
- Schema.

**Acceptance criteria:**

- Clicking "+ New design" on `/flash/items` (or the landing empty state) opens a centered modal with two options.
- "Pick from Instagram" navigates to `/flash/instagram` when IG is connected, OR triggers the connect flow when not.
- "Upload my own" navigates to `/flash/items/new`.
- Modal closes on escape, backdrop click, and option-tap.
- Wording verified with founder before commit ("Upload my own" vs "Create from scratch" vs "Add manually").
- Single commit. Gates clean.

### Slice 60d.3 — Flash day overhaul

**Goal:** Make flash days (a) studio-aware, (b) publicly shareable when wanted, (c) easier to attach designs to from the day-detail page.

**Scope:**

- Migration `0033_flash_days_extension.sql`:
  - `ADD COLUMN studio_id UUID REFERENCES studios(id) ON DELETE SET NULL`
  - `ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false`
- `/flash/days/flash-day-form.tsx`:
  - Replace free-text "Location" with a studio dropdown (artist's studio library) + an "Other (external venue)" fallback that keeps the existing `location` TEXT field.
  - Add "Visible to clients" toggle (controls `is_public`).
  - Help text below toggle: "When on, this day appears on your public page and gets a shareable link."
- `/flash/days/page.tsx`:
  - Show a visibility indicator on each day card (eye icon for public, eye-off for private).
  - If `is_public = true` and the artist has a slug, show a "Share" affordance with copy-link to `/{slug}/flash/days/[dayId]`.
- `/flash/days/[id]/page.tsx`:
  - Add an "Add designs" multi-select section that pulls the artist's `flash_items` and lets them attach multiple to this day in one go. Currently the only way is to open each item and use the dropdown.
- New route `src/app/[slug]/flash/days/[dayId]/page.tsx`:
  - Public page rendered via `serviceClient` (matching the 0030 hardening pattern).
  - 404 unless `is_public = true`.
  - Header: day title, scheduled date, studio name (from library) or fallback location text, description.
  - Body: same flash card grid as `/{slug}/flash` but scoped to items linked to this day (`flash_items WHERE flash_day_id = X AND status = 'published'`).
  - Footer: standard public-page footer (Terms / Privacy / Powered by Inklee).
- Optional: surface a "Days" section on `/{slug}/flash` listing public days, so a visitor on the main flash page can see "Flash day at Studio X on June 12 →" before drilling into items. Decide during 60d.3 implementation based on whether the data justifies it.

**Affected files:**

- `supabase/migrations/0033_flash_days_extension.sql` (new)
- `src/app/(artist)/flash/days/flash-day-form.tsx` (studio picker + public toggle)
- `src/app/(artist)/flash/days/page.tsx` (visibility indicator + share link)
- `src/app/(artist)/flash/days/[id]/page.tsx` (attach-items multi-select)
- `src/app/(artist)/flash/days/actions.ts` (extend create/update actions for new fields; new `attachFlashItemsToDayAction` for bulk attach)
- `src/app/[slug]/flash/days/[dayId]/page.tsx` (new — public day page)
- `src/lib/flash.ts` (helpers if needed for day-public state)

**Things not to touch:**

- The flash-item schema or its existing public route.
- The Instagram integration.
- The 60d.1 grid or 60d.2 modal.

**Acceptance criteria:**

- Migration 0033 applies cleanly (founder runs the SQL in Supabase editor first).
- Studio picker on the day form shows the artist's studios + an "Other / external" option.
- `is_public` toggle reflects in the day list as a visibility indicator.
- `/{slug}/flash/days/[dayId]` resolves with 200 when `is_public = true`, 404 when false (or day doesn't exist).
- Multi-select on day-detail attaches selected items in one round-trip.
- `pnpm typecheck` + `pnpm lint` + `pnpm build` all clean.
- Single commit.

---

## F. Open questions (track to closure)

| ID  | Question                                                                                                                       | Status                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Q-1 | Second Instagram account per artist (flash-only IG separate from profile IG) — schema lift, defer to a real-artist request     | ⏳ deferred to `docs/flash-second-ig-decision.md` once a real artist surfaces the need |
| Q-2 | Auto-create "My flash" default day at first design creation — UX simplification, not strictly needed                           | ⏳ revisit after 60d.3 ships; non-breaking to add later                                |
| Q-3 | "+ New design" button wording — founder asked for better than "custom by hand"                                                 | Resolved during 60d.2 (proposed: "Upload my own")                                      |
| Q-4 | Mode label rename — "Unique / Limited / Repeatable" → "One-of-a-kind / Set a max / Always bookable" — copy clarity, deferrable | ⏳ Not in 60d scope; file as a microcopy follow-up                                     |
| Q-5 | Should `/{slug}/flash` surface a "Days" section above the item grid?                                                           | Decided during 60d.3 implementation based on whether the data warrants it              |

---

## G. Out-of-scope follow-ups

- Studio multi-tenancy (Phase 4 of the business model) — Flash will need rework when studios become first-class. Don't pre-design for it now.
- Flash-item search/filter on `/flash/items` (by mode, by day, by availability) — add only when the artist's library exceeds ~30 items and the visual grid becomes a scroll problem.
- Bulk-edit on the flash items grid (e.g., shift-click select + change status for many) — defer until a real artist asks.
- IG sync frequency / webhook-driven freshness — out of scope; current manual resync is sufficient.

---

## H. Sequencing

60d.1 ships first (visible win, lowest risk, no schema). 60d.2 follows (modal pattern is established; small lift). 60d.3 lasts (schema migration + new public route, highest lift). Each is independently shippable — if 60d.2 or 60d.3 slips, 60d.1's wins are still on prod.

Implementation starts immediately after this doc lands.

---

## I. As-built notes (post-implementation, 2026-05-21)

All three sub-slices shipped in one bundled commit (founder requested batching after QA). Tracking the deviations and scope expansions that landed during implementation:

### Deviations from the original plan

1. **`/flash` redirect kept** instead of becoming a separate landing page. The empty-state landing lives at `/flash/items` directly — one less surface to maintain, and the "Instagram-first intro" framing happens naturally at the empty state where it's most relevant. Plan section D1 originally proposed splitting them; the simpler merged version landed.
2. **Bookable toggle went through 4 iterations** before the final design:
   - v1: green check icon top-right, always visible
   - v2: hover-revealed "Booked" pill on desktop, grey check on mobile
   - v3: always-visible inline button row with text labels
   - v4 (final): centered vertical action stack, hidden by default, revealed on hover (desktop) or tap (mobile)
3. **Action set expanded.** Original plan had only the bookable toggle on each tile. Founder requested adding Publish + Edit buttons during implementation. Schema unchanged — new `publishFlashItemAction` added to `actions.ts`. Status-conditional button set: draft → Booked + Publish + Edit; published → Booked + Edit; archived → Edit only.
4. **Title hides on reveal.** Title strip stays visible by default (so artist scans the grid by name), then fades out when the action stack reveals to keep the overlay clean.
5. **Public-page menu split.** Mid-slice, founder asked to differentiate the "View public page" menu entries across all three account menus (workspace top bar, mobile top bar, sidebar account drawer) into `View booking form` + `View flash page` — done across all three surfaces. Wasn't in the original plan but lives naturally inside this slice.
6. **"View flash page →" affordance on the Designs header** — surfaced from this same founder ask. Mirrors the "Preview public page" affordance on `/settings/profile` and `/travel` but scoped to the flash page.
7. **Draft tiles visibly muted** via `opacity-80 grayscale` on the tile. Founder spotted the doubled-Draft-label issue early (chip + tile label) and pushed for visual differentiation instead of two text indicators.
8. **Sidebar relabel landed in 60d.1** (not deferred): "Flash Items → Designs", "Flash Days → Days".

### Components added during implementation

- `src/app/(artist)/flash/items/flash-tile.tsx` — single-file client component owning state for reveal toggle, bookable state, publish action, and the centered button stack. Replaced the earlier `flash-bookable-toggle.tsx` and the inline `FlashTile` server function in the page.
- `src/app/(artist)/flash/items/flash-new-item-button.tsx` — modal trigger for the Instagram / Upload manually fork.
- `src/app/(artist)/flash/days/[id]/flash-day-items-manager.tsx` — two-section attach + detach manager for the day-detail page.
- `src/app/[slug]/flash/days/[dayId]/page.tsx` — new public day page.

### Components removed

- `src/app/(artist)/flash/items/flash-bookable-toggle.tsx` — superseded by `flash-tile.tsx` consolidation.
- The inline `FlashTile` function in `src/app/(artist)/flash/items/page.tsx` — moved to its own client-component file.

### Still open after 60d

- **Q-1** Second-Instagram-account decision doc — unchanged from plan, deferred until a real artist surfaces the need.
- **Q-2** Auto-create "My flash" default day — unchanged, non-breaking to add later.
- **Q-4** Mode label rename ("Unique / Limited / Repeatable" → "One-of-a-kind / Set a max / Always bookable") — not in this slice, file as a microcopy follow-up.
- **Inline Instagram pick grid in the new-item modal** — founder noted in the 60d.2 iteration that "less navigation to sub sites" is the longer-term direction. Today the modal routes to `/flash/instagram`. A future iteration could embed the post grid + multi-select directly in the modal so the artist never leaves `/flash/items`. Filed as a 60d.4-or-later follow-up.

### Migration

- `0033_flash_days_extension.sql` adds `studio_id UUID REFERENCES studios(id) ON DELETE SET NULL` and `is_public BOOLEAN NOT NULL DEFAULT false` on `flash_days`. **Must be applied in the Supabase SQL editor before the new form can save against prod** — without it, the create/update actions throw "column flash_days.studio_id does not exist".

### Acceptance — all green

- `pnpm typecheck` clean
- `pnpm lint` 11 pre-existing warnings, 0 new errors
- `pnpm build` 94/94 pages prerendered cleanly
