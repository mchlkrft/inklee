# Branding + UI Audit — Pre-Rework Baseline

> Snapshot: 2026-05-11 · Repo: `A:/WORK/inklee` · Live: `inklee.app`
> Scope: artist app shell (`src/app/(artist)/**`) + shared primitives. Marketing site noted separately.
> Purpose: capture brand source-of-truth and current-state gaps before redesigning against the mockups.

---

## 1. Brand source of truth (locked)

### 1.1 Palette

| Token                    | Hex       | Role today                                                           | Notes                                                                  |
| ------------------------ | --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `--color-brand-mustard`  | `#e9b22b` | **Primary action** (≈80+ uses)                                       | Always paired with `brand-charcoal` text. The de-facto product accent. |
| `--color-brand-charcoal` | `#1e1e1e` | Dark surface / dark text on mustard                                  | Same as `--background` in dark mode.                                   |
| `--color-brand-bone`     | `#e5e1d5` | Light surface / light text in dark mode                              | **Inconsistency:** logo SVG variant uses `#f5f5f6`, not `#e5e1d5`.     |
| `--color-brand-rosa`     | `#db88b9` | Text selection highlight, "contacted" badge, marketing accent stripe | Under-deployed in product UI.                                          |
| `--color-brand-cobalt`   | `#0b3d9f` | "Converted" waitlist badge **only**                                  | Effectively unused.                                                    |
| `--color-brand-red`      | `#cf2e2c` | Destructive (mapped to `--destructive`), marketing stripe            | Doubles as semantic error.                                             |
| `--color-brand-green`    | `#105f2d` | **Not actively used in product.**                                    | "Approved" status uses generic Tailwind `green-500` instead.           |

**Brand identity signature:** `src/lib/brand-pick.ts` randomizes one of 6 brand colors per session; `RandomizedLogo` + `BrandLoader` always match. This is a real brand differentiator and should be preserved in the rework.

### 1.2 Typography

- **Sans:** Inter via `next/font/google` → `--font-sans`
- **Mono:** JetBrains Mono → `--font-mono` (declared, **not visibly used** in current surfaces)
- **No display/heading family** — Inter carries all weights. Headings use `font-weight: 600`, `line-height: 1.2` (set in `globals.css`).
- **Body:** 16px / 1.6
- **Scale in use:** mostly `text-xs / text-sm / text-base`; marketing pages reach up to `text-7xl`. Product UI rarely goes above `text-3xl`.

### 1.3 Radii & elevation

- `--radius: 0.5rem` (8px); derives `sm` (60%), `md` (80%), `lg` (100%), `xl` (140%).
- **In practice:** `rounded-md` is used in ~149 files; `rounded-lg` is the shadcn `Button` default. **This is inconsistent** — ad-hoc CTAs override it back to `rounded-md`. Pick one.
- No elevation system. No `--shadow-*` tokens; cards use 1px borders only.

### 1.4 Voice / motion

- **Brand voice (from copy):** plain-spoken, lowercased "inklee", direct ("DM chaos", "without the DM chaos"), uses em-dashes and short imperative CTAs.
- **Motion:** `inklee-float` (loader bob, 2.6s ease-in-out) + `hero-float` (subtle drift, 7s). Reduced-motion respected. No other animations in product surfaces.
- **Selection accent:** rosa block + charcoal text — a brand moment worth keeping.

### 1.5 Assets in `public/`

```
public/branding/
├── badges/         badge-gdpr.svg, badge-handmade.svg
├── illustrations/  artist.svg, easy-peasy.svg, feature-{booking,calendar,deposit,requests,travel,waitlist}.svg, key-visual.svg, spiderweb/{6 color variants}
└── logos/          inklee-logo-{bone,charcoal,mustard}.svg

public/logo/        6 brand-colored logo variants (used by RandomizedLogo)
public/icons/       dark/, light/ — favicons & app icons
```

---

## 2. Current-state inventory (artist app)

### 2.1 Layout & navigation

| Surface              | File                                                    | Pattern                                                                                                             |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Root layout          | `src/app/layout.tsx`                                    | `<html class="dark">` — dark mode **forced**, light mode only on `[data-appearance="light"]` (public booking form). |
| Artist shell         | `src/app/(artist)/layout.tsx`                           | `min-h-screen flex flex-col` → `NavBar` → `main max-w-5xl px-4 py-6 pb-28 md:px-6 md:py-8 md:pb-8`                  |
| Top nav              | `src/components/nav-bar.tsx`                            | Desktop: sticky `h-14`, 6 links + bell + account menu. Mobile: `h-12` logo + bell + account only.                   |
| Bottom tabs (mobile) | `src/components/nav-bar.tsx` (same file)                | Fixed bottom, `h-[4.5rem]`, 5 tabs, safe-area inset, `translate-z(0)` to prevent iOS viewport wobble.               |
| Sub-navs             | `bookings-nav.tsx`, `settings-nav.tsx`, `flash-nav.tsx` | Tabbed strips under top nav, varying patterns.                                                                      |

### 2.2 Primitives (shadcn/ui)

**Only one primitive lives in `src/components/ui/`:** `Button` (Base UI + cva). Every other piece of UI in the artist app is hand-rolled with raw Tailwind on native elements:

- ❌ No `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`
- ❌ No `Card`, `Dialog`, `Sheet`, `DropdownMenu`, `Popover`, `Tooltip`
- ❌ No `Tabs`, `Badge` (StatusBadge is custom), `Avatar`, `Skeleton`

**Consequence:** primary CTAs are repeated as raw `<button>` with the **exact same class string** in 30+ files:

```
rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50
```

This is the single biggest rework opportunity. One canonical `<Button variant="brand">` replaces ~50+ instances.

### 2.3 Custom shared components

| Component                                                 | Purpose                       | Notes                                                                  |
| --------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `RandomizedLogo`                                          | Session-randomized brand logo | Keep — identity signature.                                             |
| `BrandLoader`                                             | Spiderweb floater             | Keep — identity signature.                                             |
| `StatusBadge`                                             | Booking/waitlist status pills | Convert into a real `Badge` primitive with variants.                   |
| `NavBar` / `BookingsNav` / `SettingsNav` / `FlashNav`     | Section navs                  | Consolidate into a single `<SectionNav items />` primitive.            |
| `NotificationBell`                                        | Header bell + unread count    | OK.                                                                    |
| `FeatureIntroModal` / `SlotsPromptModal` / `CookieBanner` | Modals                        | Three different modal patterns. Standardize on one `Dialog` primitive. |
| `CustomFieldInput` / `DateInput` / `TimeInput`            | Form inputs                   | Build proper `Input` primitive that these can extend.                  |
| `Spinner` / `CopyButton`                                  | Misc                          | OK.                                                                    |

### 2.4 Composite patterns (artist surfaces)

| Pattern                    | Locations                                                           | State                                                                                     |
| -------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dashboard widget card      | `dashboard/page.tsx`                                                | `space-y-3 rounded-md border border-border p-5` — repeated 4×. Make `<Widget>` component. |
| Filter chip row            | `bookings/overview/page.tsx`, `bookings/calendar/calendar-view.tsx` | Pill toggles `rounded-full px-3 py-1` — make `<FilterChips>` primitive.                   |
| Empty state                | Dozens of places                                                    | `rounded-md border ... text-center` — make `<EmptyState>` primitive.                      |
| List row                   | Bookings, waitlist, flash items                                     | Ad-hoc — converge on `<ListRow>` with leading/trailing/meta slots.                        |
| Form section               | Settings forms                                                      | All inline — needs `<FormSection>` + `<Field label hint error>` primitives.               |
| Action bar (sticky bottom) | Calendar new appointment, booking form                              | Inconsistent across modals.                                                               |

### 2.5 Sub-routes inventory (artist)

```
dashboard/                    — overview widgets
bookings/
  overview/                   — requests + clients tabs
  calendar/                   — month grid + appointment drawer
  waitlist/                   — list
  slots/                      — slot management
  settings/                   — availability, booking mode, appearance
  booking-form/               — field builder
  requests/[id]/              — request detail + status actions
  clients/[email]/            — client history
  public-page/                — slug + QR
flash/
  items/                      — flash item CRUD
  days/                       — flash day CRUD
  instagram/                  — IG sync UI
travel/                       — trips + studio library + leg manager
settings/
  profile / emails / templates / calendar / dashboard / account / fields / reminders / slots
analytics/                    — KPIs, funnels
notifications/                — unread list
onboarding/                   — 5-step flow
```

---

## 3. Gap analysis (severity)

### 🔴 High — block consistent rework

1. **No primitive layer.** Only `Button` exists in `ui/`. Cards, dialogs, inputs, badges, tabs are all reinvented per file → impossible to redesign without a token+primitive baseline.
2. **Ad-hoc primary button class repeated 50+ times.** Any visual change to CTAs requires sweeping edits.
3. **Surface tokens too thin.** `--card == --secondary == --muted == --accent == #252525` in dark mode. No way to express layered elevations (page bg / card / popover / overlay) without inventing inline values.
4. **Two competing radii (`md` vs `lg`).** Pick one canon.

### 🟡 Medium — visible inconsistencies

5. **Logo `bone` variant `#f5f5f6` ≠ brand-bone token `#e5e1d5`.** Same name, different hex.
6. **Off-token charcoals** (`#0e0e10`, `#09090b`, `#1A1A1D`) in deposit form Stripe theme, OG image, and public-page QR. Should be brand-charcoal or properly tokenized.
7. **"Approved" status uses Tailwind `green-500`** instead of `brand-green`. Brand green is declared but unused.
8. **Cobalt + green tokens declared, almost never reach a pixel.** Either commit to using them or drop from the brand palette.
9. **Mono font declared, never used.** Either find a role (timestamps, IDs, code) or drop.

### 🟢 Low — polish

10. **Sub-navs inconsistent** between Bookings/Settings/Flash. Different active styles, different containers.
11. **No skeleton/loading states** beyond `BrandLoader`. Page transitions feel empty.
12. **Density:** padding scale uneven — `p-4`, `p-5`, `p-6` all appear without rule.
13. **Marketing pages mix mustard hero-block with otherwise dark theme** — direction-finding moment for the rework.

---

## 4. Mobile readiness

**Strong** ✅

- Bottom 5-tab nav with safe-area inset and iOS viewport-wobble fix.
- Container `max-w-5xl px-4` works at 375px+.
- `pb-28` on `<main>` clears bottom nav.

**Weak** ⚠️

- Sub-navs (Bookings/Settings/Flash) horizontally overflow on small viewports — no scroll containment.
- Modals are inline-positioned (no `Sheet`/bottom-sheet pattern) — feels desktop-first.
- Form actions use desktop right-aligned button rows. Need full-width primary on mobile.
- Tap targets on filter chips `px-3 py-1` ≈ 28px — below the 44px iOS guideline.
- No haptic affordances (active scale, press-down feedback) — feels web, not native.
- Dashboard widgets are `grid-cols-1 md:grid-cols-2` — works, but cards aren't tuned for thumb-zone reach.

**For a mobile-first rework** (the explicit goal): the bottom-nav + container baseline is fine, but we should design the **interactions** (modals → sheets, lists → swipeable rows, primary actions → bottom-anchored on mobile) as if they were native. The web app then becomes the visual+interaction spec for the Android port.

---

## 5. Recommended token extension (palette locked, tokens grow)

Adds, no new hues. Brand-locked.

```css
/* Surfaces — layered elevation (dark mode) */
--surface-0: var(--color-brand-charcoal); /* page bg = #1e1e1e */
--surface-1: #252525; /* current --card */
--surface-2: #2d2d2d; /* raised — modals, popovers */
--surface-3: #353535; /* highest — toasts, tooltips */

/* Surfaces — layered elevation (light mode) */
--surface-0: var(--color-brand-bone); /* #e5e1d5 */
--surface-1: #d9d4c7; /* current --card */
--surface-2: #ccc7ba;
--surface-3: #bfbaad;

/* Tints / state shades — derived from brand colors */
--brand-mustard-soft: color-mix(
  in oklab,
  var(--color-brand-mustard) 15%,
  transparent
);
--brand-mustard-strong: color-mix(
  in oklab,
  var(--color-brand-mustard) 100%,
  black 10%
);
/* ... same pattern for rosa, cobalt, red, green */

/* Semantic */
--success: var(--color-brand-green); /* finally puts brand-green on pixels */
--warning: var(--color-brand-mustard);
--danger: var(--color-brand-red);
--info: var(--color-brand-cobalt);

/* Elevation */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25);
--shadow-md: 0 6px 18px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 18px 40px rgba(0, 0, 0, 0.4);

/* Mobile rhythm */
--tap-min: 44px; /* hard floor for interactive elements */
--safe-bottom: env(safe-area-inset-bottom);
```

This stays inside the 7-color palette (no new hues) but unlocks elevation, state, and semantic clarity — which the rework will lean on hard.

---

## 6. Open questions for the mockup review

When you paste the mockups, I'll evaluate them against this baseline. Specific things I'll flag:

1. **Colors** that aren't in our 7-color palette → call out for replacement.
2. **Decorative elements** (textures, gradients, photographic backgrounds, off-brand iconography) → flag as "unnecessary" per your brief.
3. **Layout signals** I'll extract from mockups: card style, list rhythm, nav treatment, modal/sheet pattern, hero motion, type scale, density.
4. **Mobile-first cues** specifically: bottom-sheet patterns, sticky CTAs, gesture affordances.
5. **Identity moments** to preserve: randomized brand color, spiderweb loader, rosa selection, lowercase "inklee" voice.

---

## 7. Architectural rework plan (proposed, pending mockup eval)

Step-by-step. Each step independently shippable.

1. **Token layer expansion** (Section 5) — one PR, no visual change yet, adds variables.
2. **Primitive layer** — build `Card`, `Input`, `Field`, `Badge`, `Dialog`, `Sheet`, `Tabs`, `EmptyState` in `src/components/ui/`. Match shadcn API for muscle-memory.
3. **Canonical Button variants** — extend existing `Button` with `variant="brand"` (mustard/charcoal) + `variant="brand-outline"`. One PR.
4. **CTA migration sweep** — replace the 50+ ad-hoc `bg-brand-mustard...` strings with `<Button variant="brand">`. Mechanical, scriptable.
5. **Composite components** — `Widget`, `SectionNav`, `FilterChips`, `ListRow`, `FormSection` extracted from current pages.
6. **Surface rework per route** — drive from mockup direction: dashboard first (highest-traffic), then bookings, flash, travel, settings.
7. **Mobile interaction layer** — modals → sheets, sticky bottom CTAs, swipe affordances. Web becomes the visual baseline for the Android port (Phase E in the roadmap).
8. **Marketing site pass** — separate sweep; landing pages stay editorial and can absorb the new tokens without identical primitives.

**Risk note:** the artist app is in production with the e2e tester account (`ouchy`). Each phase ships to preview first, then prod after a manual smoke test. Phases 1–3 are zero-visual-change; visible changes start at phase 4.

---

## 8. What stays untouched

- `globals.css` brand palette constants (lines 33-40) — locked.
- `brand-pick.ts` randomization — locked.
- `RandomizedLogo`, `BrandLoader` behavior — locked, may get styling polish.
- Rosa selection highlight — locked.
- Logo SVG assets — only normalize the `bone` hex inconsistency if you want it pixel-aligned with the token.
- Bottom-nav 5-tab structure — locked (mobile IA already validated in Slice 41).
