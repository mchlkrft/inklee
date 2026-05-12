# UI Rework — Current State Snapshot for Audit

> Frozen: 2026-05-12 · Branch: `master` (uncommitted, ~36 files modified, 4 new, 1 deleted)
> Last prod commit: `fbe438d`. Nothing in this rework is committed yet.
> This document is the briefing for an independent audit pass (Codex / second-opinion review).

---

## 1. Brief recap — what this rework is

User's intent (verbatim from kickoff brief):

> Rework the logged-in Inklee app shell and navigation layout so it feels closer to the provided mockups in structure and energy, while still clearly belonging to Inklee.

Constraints user locked in:

- Brand palette is the 7 colors (`mustard / rosa / cobalt / red / green / charcoal / bone`). No new hues. Token extension via `color-mix` is fine.
- Outlined cards. No bg-tone differentiation between cards and workspace.
- 1.5px line thickness system-wide.
- Mustard for primary CTAs, rosa for selected/active accents.
- Don't rework the public marketing site in this pass.
- Mobile + tablet usability must remain intact.

---

## 2. Architectural anchors (read before grading)

### 2.1 Design tokens — `src/app/globals.css`

Brand palette (locked):

```
--color-brand-mustard:  #e9b22b
--color-brand-rosa:     #db88b9
--color-brand-cobalt:   #0b3d9f
--color-brand-red:      #cf2e2c
--color-brand-green:    #105f2d
--color-brand-charcoal: #1e1e1e
--color-brand-bone:     #e5e1d5
```

New tokens introduced by this rework:

```
/* Shell (sidebar / dark chrome) */
--color-shell-bg:        #1e1e1e
--color-shell-fg:        #e5e1d5
--color-shell-fg-dim:    rgba(229,225,213, 0.55)
--color-shell-fg-mute:   rgba(229,225,213, 0.32)
--color-shell-border:    rgba(229,225,213, 0.18)
--color-shell-hover:     rgba(229,225,213, 0.12)
--color-shell-hover-strong: rgba(229,225,213, 0.2)

/* Workspace (bone content area) */
--color-workspace-bg:        var(--color-brand-bone)
--color-workspace-card:      #d9d4c7
--color-workspace-card-2:    #cdc7b6
--color-workspace-border:    rgba(30,30,30, 0.18)
--color-workspace-fg:        var(--color-brand-charcoal)
--color-workspace-fg-dim:    rgba(30,30,30, 0.6)
--color-workspace-hover:     rgba(30,30,30, 0.05)
--color-workspace-hover-strong: rgba(30,30,30, 0.09)

/* Soft tints — pastel chips, status badges, off-month calendar cells */
--color-tint-mustard / -rosa / -cobalt / -red / -green
  (color-mix of brand-color N% with workspace-card)

/* Elevation */
--shadow-card:  0 1px 2px rgba(30,30,30,0.04), 0 6px 18px rgba(30,30,30,0.05)
--shadow-shell: 0 24px 60px rgba(0,0,0,0.35)
```

Semantic `--border` / `--input` opacities bumped to 0.18 / 0.22 in all themes for stronger 1.5px line presence.

### 2.2 Global CSS rules (also in `globals.css`)

- **System-wide branded scrollbars** — `html` uses `scrollbar-color`, all `*::-webkit-scrollbar-*` get bone-tinted thumb by default, charcoal-tinted under `[data-appearance="light"]`. Thumb width 14px with 3px transparent border + `background-clip: padding-box` so the thumb floats as a capsule.
- **1.5px line thickness override** — overrides Tailwind's `border`/`border-2`/`border-4` + all directional + `divide-x/y` so every visible border in the app is 1.5px. Skips `.border-transparent` (used as toggle thumb padding).
- **Mustard CTA press-feel** — any `button` / `a` / `[role="button"]` with `.bg-brand-mustard` gets transition + hover-darken (`color-mix mustard 88% + charcoal`) + active translate-y-1px. Catches the ~50+ ad-hoc mustard buttons without per-file migration.
- **Outline-button affordance** — any button/link with `.border-border` and no filled brand bg gets transition + hover (`bg-foreground/6` + `border-foreground/35`) + active press. Catches outline buttons (Cancel/Copy/Preview/Edit/Resolve/etc.) without per-file migration.
- **Cursor restored** for `<button>` (Tailwind v4 dropped it). `not-allowed` on disabled.
- **`::selection`** — rosa block + charcoal text (kept from before).

### 2.3 App shell — `src/app/(artist)/layout.tsx`

```
<div bg-shell-bg p-3 text-brand-bone>           ← thin charcoal matte on desktop
  <div data-appearance="light" rounded-[28px]   ← bone workspace, rounded
       bg-workspace-bg text-workspace-fg flex>
    <Sidebar />                                  ← floating charcoal pill (hidden md:flex, m-3 rounded-[22px], w-228)
    <MobileTopBar />                             ← md:hidden
    <div flex-1 min-w-0>
      <WorkspaceTopBar />                        ← hidden md:flex, top-right cluster
      <main max-w-5xl px-4 pb-28 md:px-8 md:pb-12>
        {children}
      </main>
    </div>
  </div>
  <MobileBottomNav />                            ← md:hidden, floating charcoal pill
</div>
```

Critical trick: every artist page is rendered against `[data-appearance="light"]`, so all `text-foreground` / `bg-background` / `border-border` etc. semantic tokens resolve to the bone palette without touching individual pages. The sidebar/mobile-pill use explicit `bg-brand-charcoal` so they stay dark inside the cascade.

### 2.4 Sidebar nav — `src/components/app-shell/nav-config.ts`

Hierarchical IA. Top-level renders always; children only render when that section is active (URL match).

```
GENERAL
  Dashboard           /dashboard
  Bookings            /bookings/overview      [+ 5 children: Overview, Calendar, Waitlist, Booking Settings, Booking Form]
  Flash               /flash                  [+ 3 children: Flash Items, Flash Days, Instagram]
  Travel              /travel
TOOLS
  Analytics           /analytics
  Notifications       /notifications
  Settings            /settings/profile       [+ 5 children: Profile, Emails, Calendar, Dashboard, Account]
```

Active state convention:

- **Sidebar parent active** → rosa text + 3px rosa left bar
- **Sidebar sub-item active** → rosa text + `font-medium`
- **Mobile bottom pill active** → rosa-pill bg behind icon+label

### 2.5 Workspace top-bar — `src/components/app-shell/workspace-top-bar.tsx`

Desktop-only cluster in the top-right corner of the workspace:

1. `BooksStatusPill` — books open/closed indicator with green dot + remaining-count detail. Links to `/bookings/settings`.
2. `NotificationBell` — unread badge in brand-red, full-charcoal notification panel restyled (still under `data-appearance="light"`, so it inherits bone surface with rosa unread highlight).
3. `IconButton` to Settings (gear).
4. Rosa avatar circle with dropdown menu (edit profile, view public page, sign out).

All four elements have the same hover treatment: full-charcoal bg + bone text on hover. Reads as "press me" coherently.

### 2.6 Sub-navs — `src/components/section-nav.tsx`

One shared `SectionNav` primitive. `BookingsNav` / `SettingsNav` / `FlashNav` are 10-line wrappers passing an `items` array. On desktop the sidebar's nested children replace these; on mobile the section layouts render them inside `<div className="md:hidden">` so sub-pages stay reachable from the bottom-tab IA.

Active treatment: container has `border-b border-border` (gray underline); active tab gets a 1.5px mustard underline via an absolute-positioned `<span className="absolute inset-x-0 -bottom-[1.5px] h-[1.5px] bg-brand-mustard">`. Pixel-aligned, avoids negative-margin sub-pixel issues.

### 2.7 Primitives — `src/components/ui/card.tsx`

```ts
Card        — rounded-[20px] border border-border p-6
CardHeader  — flex items-center gap-3
IconChip    — circular chip, solid brand bg per tint
```

`IconChip` tints (solid brand colors, not pastel):

- `mustard / rosa` → solid pastel bg + charcoal icon
- `cobalt / red / green` → solid deep brand bg + bone icon
- `bone` (the "neutral") → inverted: brand-charcoal bg + bone icon

### 2.8 Status pills

`src/components/status-badge.tsx` (booking/waitlist statuses) and the inline `StatusPill` / `ModePill` / `DayStatusPill` definitions on flash pages all converged on the same shape:

- `bg-[color:var(--color-tint-X)] text-brand-charcoal` (solid pastel + charcoal text) for active states
- `bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]` for neutral/passive states
- `rounded-full px-2.5 py-0.5 text-xs font-medium`

No more `green-500` / `amber-500` / `blue-500` generics anywhere in the artist app.

---

## 3. Page-by-page polish status

Page title pattern across the artist app: `text-3xl font-semibold tracking-tight text-foreground` H1 + `mt-1 text-sm text-muted-foreground` sub-line.
Section header pattern: `text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3` ("eyebrow") + `mt-1.5 text-sm text-foreground` body.

| Surface                                     | State                    | Notes                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`                                | ✅ reworked              | 4 widget cards using `Card` + `IconChip` (mustard/green/rosa/cobalt tints). Booking-link widget too. Onboarding nudge + Analytics banners use the same outlined card pattern with sm IconChip.                                                                                                                                                                            |
| `/bookings/overview` (Requests)             | ✅ polished              | Requests/Clients tabs use the new absolute-positioned mustard underline. Table container `rounded-[20px] border border-border`. Header bg is workspace-hover. Column labels small-caps.                                                                                                                                                                                   |
| `/bookings/overview` (Clients)              | ✅ polished              | Same container language. Hover bg is workspace-hover.                                                                                                                                                                                                                                                                                                                     |
| `/bookings/calendar`                        | ✅ polished              | Container `rounded-[20px] border border-border overflow-hidden`. Header bg = workspace-hover, weekday labels small-caps. Today indicator = mustard circle. Event chips: artist-created → tint-mustard, customer-request → tint-rosa. Off-month cells: `bg-brand-mustard/[0.04]` + `text-muted-foreground/45` for the date number. Legend dots are tint-\* round capsules. |
| `/bookings/waitlist`                        | ✅ polished              | Demand-by-city block uses `Card` + `IconChip MapPin tint=cobalt`. Entry list uses `IconChip Users tint=rosa size=sm` per row. MapPin lucide icon replaces 📍 emoji.                                                                                                                                                                                                       |
| `/bookings/requests/[id]`                   | ✅ polished              | Real H1 (handle + inline status badge) + sub-line (relativeTime + booking mode). Back-link "← Booking Overview". All info containers `rounded-[20px] border border-border divide-y divide-border`. Section labels small-caps eyebrow.                                                                                                                                     |
| `/bookings/settings`                        | ✅ polished              | Title bumped. Section headers in eyebrow pattern.                                                                                                                                                                                                                                                                                                                         |
| `/bookings/booking-form`                    | ✅ polished              | Same as above. Availability indicator (Open/Closed): green dot + brand-green text (was `text-green-500`).                                                                                                                                                                                                                                                                 |
| `/flash/items`                              | ✅ polished              | Inline `StatusPill` + `ModePill` brought into the brand-tint system. Table radius bumped, column labels small-caps. Off-brand `text-green-500` on Availability swapped to `text-brand-green font-medium`.                                                                                                                                                                 |
| `/flash/days`                               | ✅ polished              | `DayStatusPill` brought into brand-tint system (`upcoming` → cobalt, `active` → green, `past` → neutral, `cancelled` → red). List radius bumped to `rounded-[20px]`.                                                                                                                                                                                                      |
| `/flash/instagram`                          | unchanged                | Already a server-controlled "not configured" notice in dev; user said skip.                                                                                                                                                                                                                                                                                               |
| `/travel`                                   | ⚠️ minimal polish        | Page title bumped. Inner `TripManager` + `StudioList` components are dense and use `border-2 border-border` patterns; system override makes them visually fine but inner card structure has not been touched. Heavy structural touch deferred.                                                                                                                            |
| `/settings/profile`                         | ✅ polished              | Title + max-width bump. Form unchanged (inherits system tokens).                                                                                                                                                                                                                                                                                                          |
| `/settings/account`                         | ✅ polished              | All 5 section headers converted to eyebrow pattern. Booking-mode summary card `rounded-[20px]`.                                                                                                                                                                                                                                                                           |
| `/settings/calendar`                        | ✅ polished              | Title + iCal display card bumped.                                                                                                                                                                                                                                                                                                                                         |
| `/settings/dashboard`                       | ✅ polished              | Title + max-w bump.                                                                                                                                                                                                                                                                                                                                                       |
| `/settings/emails`                          | ✅ polished              | Title + section eyebrows. Inner `EmailTemplatesList` + `RemindersForm` not touched (inherit tokens).                                                                                                                                                                                                                                                                      |
| `/settings/templates`                       | unchanged                | Not visited this pass.                                                                                                                                                                                                                                                                                                                                                    |
| `/settings/reminders`                       | (rendered inside emails) | n/a                                                                                                                                                                                                                                                                                                                                                                       |
| `/settings/fields`                          | unchanged                | Not visited this pass.                                                                                                                                                                                                                                                                                                                                                    |
| `/notifications`                            | unchanged                | Not visited this pass.                                                                                                                                                                                                                                                                                                                                                    |
| `/analytics`                                | unchanged                | Not visited this pass.                                                                                                                                                                                                                                                                                                                                                    |
| `(auth)` layout + login/signup/forgot/reset | ✅ polished              | Auth layout wraps form in `rounded-[20px] border border-border p-7` card. Logo moved above the card and now uses `RandomizedLogo` so the auth screen also gets the per-session random brand color. All 4 page titles bumped to `text-2xl tracking-tight`.                                                                                                                 |
| `/auth/mfa`                                 | unchanged                | Not visited this pass.                                                                                                                                                                                                                                                                                                                                                    |
| `/[slug]` public artist page + booking form | unchanged                | Customer-facing surface — explicitly deferred.                                                                                                                                                                                                                                                                                                                            |

---

## 4. Open follow-ups (need user direction)

Logged in `memory/inklee_followup.md`:

1. **Outline doubling at corners (Phase 3)** — with 1.5px system borders, internal `divide-y` meeting outer `border border-border` produces a visually thicker corner. **Root cause**: `--border` is `rgba(30,30,30,0.18)` semi-transparent → at the T-junction the horizontal divider's pixel and the vertical container border's pixel both paint the same coordinates → alpha double-blends to `1 - (1-0.18)² ≈ 0.33` → corner pixel ~80% darker than rest of the line. Sub-pixel rendering of 1.5px on varied DPI displays amplifies the artifact.

   **Failed attempts (do not repeat verbatim — each rolled back):**
   1. _Drop outer `border border-border`, keep `divide-y`_ — user: "looks naked". The rounded clip alone wasn't enough containment.
   2. _Tab indicator `border-b-2 -mb-[1.5px]` overlap math_ — should theoretically overlap container's `border-b` perfectly. Failed: 1.5px is sub-pixel, browser anti-aliases unevenly. Negative margin doesn't land on a clean device pixel.
   3. _Tab indicator as absolutely-positioned `<span>` at `-bottom-[1.5px] h-[1.5px] bg-brand-mustard`_ — span sits exactly where container's `border-b` lives. Still visible double-line in screenshot. Likely the span paints on top of the container border pixel underneath, both drawn → cumulative paint on the same coord.
   4. _`box-shadow: inset 0 0 0 1.5px var(--border)` instead of `border`_ — inset shadow inside padding box, theoretically lets children overlap cleanly. Failed: children with backgrounds (e.g., `bg-workspace-hover` on thead) cover the shadow at those positions — outline disappears there. Where it IS visible, same alpha-overlap T-junction issue persists.
   5. _`outline: 1.5px solid var(--border); outline-offset: -1.5px`_ — outline doesn't affect layout, renders on top of children. Same alpha-overlap math at T-junctions. Same visible doubled corner.
   6. _Inset pseudo-element dividers — custom `.divide-y-inset` CSS class_ — pseudo `::before` absolutely positioned with `left: 16px; right: 16px; height: 1.5px`. NO T-junction at all. Visually correct, no doubling — but user said "its getting worse and worse" — the inset dividers read as floating short lines, broke the "table tightness" feel. Rolled back.

   **Approaches not yet tried, in priority order:**
   - **Solid (non-alpha) `--border` color, theme-scoped.** Eliminates the double-alpha math entirely — painting the same solid color twice on the same pixel is identical to painting it once. Trade-off: borders look uniform across all bg surfaces (no subtle blending). Most likely correct fix; try this first.
   - **Drop `divide-y` for stacked outlined cards with `space-y-2`** — each row its own outlined card, dividers replaced by gap. No shared container border = no T-junction. Trade-off: more "card stack" than "table".
   - **Scope solid `--border` only to container-with-internal-divider pattern** via a class. Keeps alpha for solo cards. Surgical but more code.
   - **Move to native `<table>` with `border-collapse: collapse`** — only fixes actual tabular surfaces (booking-overview Requests). Won't help non-table lists.

   **Recommendation**: try solid `--border` system-wide first. One token change, fixes everywhere.

   Current on-disk state: borders restored, `divide-y divide-border` standard, T-junctions visible. User chose to live with this until audit.

2. **Sidebar nav font-size** — `text-sm` (14px) for sub-items felt right after `text-xs` (12px) was too small, but user wants one more tuning pass.

---

## 5. New files added by this rework

```
docs/branding-ui-audit.md                                  (pre-rework audit)
docs/ui-rework-state-2026-05-12.md                          (this file)
src/components/app-shell/index.tsx                          (barrel)
src/components/app-shell/nav-config.ts                      (sidebar IA)
src/components/app-shell/sidebar.tsx                        (desktop sidebar)
src/components/app-shell/sidebar-item.tsx                   (top-level nav row)
src/components/app-shell/sidebar-sub-item.tsx               (indented sub-row)
src/components/app-shell/sidebar-account.tsx                (currently UNUSED — account moved to top-bar)
src/components/app-shell/mobile-top-bar.tsx                 (logo + bell + account menu)
src/components/app-shell/mobile-bottom-nav.tsx              (5-tab floating pill)
src/components/app-shell/workspace-top-bar.tsx              (desktop top-right cluster)
src/components/app-shell/books-status-pill.tsx              (open/closed indicator)
src/components/section-nav.tsx                              (shared sub-nav primitive)
src/components/ui/card.tsx                                  (Card, CardHeader, IconChip)
```

Deleted: `src/components/nav-bar.tsx` (orphaned after shell rework).

---

## 6. Verification (as of snapshot)

- `tsc --noEmit` — 0 errors
- `next lint` — 0 errors, 13 pre-existing warnings (none from new code)
- `next build` — full production build passes, all routes compile
- Visual verification: user has walked through every reworked surface in the session, given iterative feedback that has been applied.

---

## 7. Things the audit should specifically grade

For Codex / second-pair-of-eyes review:

1. **Token architecture** — does the split between `shell-*`, `workspace-*`, and semantic `--background/--foreground/--border` make sense? Is `[data-appearance="light"]` the right mechanism for the dual-tone shell or is there a cleaner CSS-cascade-layers approach?
2. **System-wide CSS overrides (1.5px lines, mustard hover, outline-button hover)** — are these maintainable, or do they create surprise behavior elsewhere?
3. **Sidebar IA decision** — promoting sub-pages into nested sidebar children vs keeping them in tab strips. Sub-nav still rendered on mobile only. Is the asymmetry confusing or correct?
4. **Outline doubling at corners** — read section 4.1 of follow-ups. Is there a clean CSS-only solution that doesn't change the visual pattern significantly?
5. **`Card` + `IconChip` API** — is the tint mapping (`mustard/rosa/cobalt/red/green/bone`) the right shape? `bone` is intentionally inverted (charcoal bg, bone icon) — confusing naming?
6. **Status badges + pills** — all converged on `bg-tint-* + text-brand-charcoal` for active states. Is the contrast accessible (WCAG AA) across all brand tints?
7. **The 50+ ad-hoc `bg-brand-mustard` button strings** — covered by the global CSS hover rule but never migrated to a canonical `<Button>` primitive. Is that an acceptable long-term position or should they be swept into `src/components/ui/button.tsx`?
8. **Calendar grid** — outer `rounded-[20px] border border-border overflow-hidden` + cells with `border-b border-r` and conditional `border-r-0` on SUN / `border-b-0` on last row. T-junctions at the cell borders meeting the container's outer borders. Acceptable visual or needs structural rework?

---

## 8. How to run / verify locally

```
cd A:/WORK/inklee
pnpm dev               # http://localhost:3000
pnpm exec tsc --noEmit # typecheck
pnpm exec eslint "src/**/*.{ts,tsx}"
```

E2E artist account: `michel.kraeft@gmail.com` / slug `ouchy`.

Note: `gitignore` doesn't ignore this doc — when committing, group with the other docs or include with the rework commit so the audit is part of the diff narrative.
