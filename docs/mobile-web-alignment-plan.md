I now have everything I need, including the critical insight that the web app already ships its own native-target IA in `MOBILE_BOTTOM_NAV` (Dashboard, Flash, Bookings-as-center-FAB, Guest Spots, Goods) and a floating top-bar pill pattern. This is the authoritative blueprint. I'll write the plan now.

Below is my complete transformation plan, returned as the final response.

---

# Mobile Rebuild: Mirror the Web App's IA + Inklee Character

**Status:** Plan / not yet started
**Branch target:** new `feat/mobile-mirror-web` off `master` (current work is on `feat/mobile-e1`)
**Author:** Mobile architecture
**Date:** 2026-06-10

## 0. The decisive finding that anchors this plan

The founder's premise ("the web app was deliberately designed to be transferable to a native structure") is not just a philosophy: the web repo already ships its own native IA. `apps/web/src/components/app-shell/nav-config.ts:114-130` exports `MOBILE_BOTTOM_NAV`, and `apps/web/src/components/app-shell/mobile-bottom-nav.tsx` + `mobile-top-bar.tsx` render it. The web team already solved "what does this IA look like on a phone" and shipped it as the responsive mobile web experience.

**The Expo app diverged from a solution that already exists.** Our job is largely to port the web's *own mobile decisions* into native, not to invent a new mapping. This is the single most important reframing: where the current Expo app and the web's `MOBILE_BOTTOM_NAV` disagree, the web wins.

The web's mobile IA is:

- **Bottom nav (5 slots):** Dashboard Â· Flash Â· **Bookings (center FAB)** Â· Guest Spots Â· Goods
  (`nav-config.ts:120-130`)
- **Floating top-bar pill** on every screen: logo (â†’ Dashboard), Books-status pill, notification bell, hamburger account menu (Settings / view booking form / view flash page / sign out)
  (`mobile-top-bar.tsx:43-138`)
- Bookings sub-areas are **tabs inside one screen** (Overview Â· Calendar Â· Deposits Â· My Booking Form Â· Booking Settings as children; Requests Â· Clients Â· Waitlist as in-page tabs) (`nav-config.ts:50-56`, web-ia report).

The current Expo tabs are **Home Â· Requests Â· Calendar Â· Clients Â· More** (`apps/mobile/app/(tabs)/_layout.tsx:21-65`). That is a different, flatter IA that buries Flash / Goods / Guest Spots two taps deep in a "More" hub (`apps/mobile/app/(tabs)/more.tsx:174-240`) â€” exactly the divergence the founder wants reversed.

---

## 1. Goal & principles

**Goal:** Rebuild `apps/mobile`'s structure and visual system so it reads as the same product as `apps/web` â€” same information architecture, same navigation hierarchy, same "Inklee character" â€” while keeping native-quality interaction mechanics.

**The tradeoff philosophy (state it once, apply it everywhere):**

> **Mirror the web's STRUCTURE and CHARACTER. Adapt the MECHANICS to native.**
>
> - **Structure** (which sections exist, how they nest, what they're called) = copied faithfully from the web. No new sections, no renamed sections, no re-grouping. The web's `MOBILE_BOTTOM_NAV` is the contract.
> - **Character** (color, type hierarchy, the 1.5px border, 20px card radius, icon chips, mustard/rosa accents, density/breathing room) = ported faithfully into the NativeWind token layer.
> - **Mechanics** (how a list scrolls, how you switch a tab, how a row responds to touch) = native-idiomatic. Tables become cards, hover becomes press, multi-column becomes stacked sections, dropdowns become sheets. These substitutions are *expected* and *good* â€” they are where Expo earns its keep.

**Three principles, in priority order:**

1. **Faithful IA first.** If a label, grouping, or hierarchy exists on web, it exists in the same place on mobile. Vocabulary comes from `packages/shared/src/status-labels.ts` and the web nav config, never re-invented (CLAUDE.md copy rules).
2. **Character is a token-and-primitive problem, not a per-screen problem.** Bring the design tokens and a small primitive set across once; the screens inherit the character for free. The mobile-now report's core diagnosis is correct: "Mobile has the *palette* but not the *character*." We fix the character at the system layer.
3. **Native mechanics are a feature.** Pull-to-refresh, haptics on Accept/Pass, sheet transitions, press affordances â€” keep and extend these. We are not making a webview.

---

## 2. Target IA

### 2.1 Recommendation: keep bottom tabs, but **realign the 5 tabs to the web's `MOBILE_BOTTOM_NAV`**, and replace the "More" hub with a top-bar account menu.

**Why bottom tabs (not a drawer / sectioned home):**

- The web *already chose bottom tabs for mobile* (`mobile-bottom-nav.tsx`). Mirroring the structure means mirroring this choice. A drawer would diverge from the web's own mobile decision.
- Bottom tabs are the native-idiomatic primitive for 5 flat primary destinations, and the mobile-now report correctly lists the 5-tab nav as a "good to keep."
- The web's sidebar (`sidebar.tsx`) is the *desktop* expression of the same IA; its mobile expression is the bottom nav. We port the mobile expression.

**The change is which tabs, not whether tabs.** Current Expo tabs optimize for a "bookings triage" mental model (Requests/Calendar/Clients as peers). The web treats those three as *sub-areas of Bookings* and promotes Flash/Goods/Guest Spots to primary. We adopt the web's model.

### 2.2 Target navigation tree

```
Bottom tab bar (5 slots â€” exact order from web MOBILE_BOTTOM_NAV)
â”œâ”€â”€ 1. Dashboard          â†’ (tabs)/index.tsx       [web: /dashboard]
â”œâ”€â”€ 2. Flash              â†’ (tabs)/flash.tsx        [web: /flash]
â”œâ”€â”€ 3. Bookings (CENTER)  â†’ (tabs)/bookings.tsx     [web: /bookings/overview]   â† raised/accent treatment
â”œâ”€â”€ 4. Guest Spots        â†’ (tabs)/travel.tsx       [web: /travel]
â””â”€â”€ 5. Goods              â†’ (tabs)/goods.tsx        [web: /goods]

Top-bar pill (persistent on every tab â€” mirrors mobile-top-bar.tsx)
â”œâ”€â”€ Logo                  â†’ Dashboard
â”œâ”€â”€ Books-status pill     â†’ opens Booking Settings sheet/screen   [web: status pill]
â”œâ”€â”€ Notification bell     â†’ /notifications                        [web: bell]  (NotificationBell.tsx already exists)
â””â”€â”€ Account menu (â‹¯/menu) â†’ sheet:
        â”œâ”€â”€ Settings       â†’ settings/ stack (Profile, Booking settings, Payouts, Deposit defaults, Account)
        â”œâ”€â”€ View booking form â†—  (external)
        â”œâ”€â”€ View flash page â†—     (external)
        â””â”€â”€ Sign out

Bookings tab â€” in-screen sub-nav (mirrors web Bookings children + overview tabs)
â”œâ”€â”€ Segmented/tab strip:  Overview Â· Calendar Â· Deposits Â· Booking form Â· Booking settings   [web children]
â””â”€â”€ Overview sub-tabs:    Requests Â· Clients Â· Waitlist                                       [web overview tabs]
       â””â”€â”€ Request row â†’ bookings/[id].tsx  (stack push, detail + Accept/Pass/Deposit)
       â””â”€â”€ Client row  â†’ clients/[email].tsx (stack push)

Flash tab â€” in-screen sub-nav
â””â”€â”€ Segmented:  Designs Â· Days Â· Instagram     [web flash children: nav-config.ts:63-67]
       â””â”€â”€ flash/items/[id].tsx, flash/days/[id].tsx (stack push)

Goods tab â€” in-screen sub-nav
â””â”€â”€ Segmented:  Products Â· Sales               [web goods children: nav-config.ts:74-77]
       â””â”€â”€ goods/[id].tsx (stack push)

Guest Spots tab
â””â”€â”€ Trips list + Studios section               [no web sub-nav; matches travel/page.tsx]
       â””â”€â”€ travel/trips/[id].tsx, travel/studios/[id].tsx (stack push)

Settings stack (reached only from account menu â€” config, not a daily destination)
â””â”€â”€ Profile Â· Booking settings Â· Payouts Â· Deposit defaults Â· Account/Delete
    (mirrors web Settings children where mobile has a screen for it; see Â§9 open Q on Bio page/Emails/Calendar/Home widgets)
```

### 2.3 Every web section â†’ its new mobile home

| Web section (`nav-config.ts`) | Web URL | New mobile home |
|---|---|---|
| Dashboard | `/dashboard` | Tab 1 |
| Bookings â€º Overview | `/bookings/overview` | Tab 3 (center), Overview sub-tab |
| Bookings â€º Calendar | `/bookings/calendar` | Tab 3, Calendar sub-tab (reuse `(tabs)/calendar.tsx` logic) |
| Bookings â€º Deposits | `/bookings/deposits` | Tab 3, Deposits sub-tab |
| Bookings â€º My Booking Form | `/bookings/booking-form` | Tab 3, Booking form sub-tab |
| Bookings â€º Booking Settings | `/bookings/settings` | Tab 3, Booking settings sub-tab (reuse `settings/books.tsx`) |
| Bookings â€º Requests/Clients/Waitlist tabs | in-page | Overview sub-tabs (Clients = absorb `(tabs)/clients.tsx`; Waitlist = absorb `waitlist.tsx`) |
| Flash â€º Designs/Days/Instagram | `/flash/*` | Tab 2 + segmented |
| Goods â€º Products/Sales | `/goods*` | Tab 5 + segmented |
| Guest Spots | `/travel` | Tab 4 |
| Analytics | `/analytics` | Dashboard widget + account menu link (reuse `insights.tsx`) |
| Notifications | `/notifications` | Top-bar bell |
| Settings â€º * | `/settings/*` | Account menu â†’ Settings stack |

### 2.4 What changes vs. current 5-tab/More structure

- **Removed tabs:** Requests, Calendar, Clients, More.
- **New tabs:** Flash, Bookings (center), Guest Spots, Goods.
- **Requests/Calendar/Clients** demote from top-level tabs to **sub-areas of the Bookings tab** (their screen code is reused, not deleted).
- **The "More" hub is deleted** (`apps/mobile/app/(tabs)/more.tsx`). Its contents redistribute: Flash/Goods/Guest Spots/Insights/Waitlist were already-real destinations that now live in their proper homes; Account/Payments/About move into the **top-bar account menu** (mirrors `mobile-top-bar.tsx:94-131`).
- **Notifications** moves from a standalone stack entry surfaced ad-hoc to the **persistent top-bar bell** on every tab.
- **Books status** becomes a **persistent top-bar pill** (currently only reachable via Booking settings).

---

## 3. Design-system port

Bring the web's character into the mobile token layer **before** touching screens. Two files own this: `apps/mobile/src/lib/tokens.ts` and `apps/mobile/tailwind.config.js` (kept in sync per their own comments).

### 3.1 Colors â€” add the semantic roles, not just the palette

Mobile currently has the 7 brand colors + a partial `shell.*` set (`tokens.ts:4-19`). The web (`globals.css:32-87`) layers **semantic roles** on top: `workspace.*` (the bone content surface), a `tint.*` system, and richer shell tokens. Mobile uses a dark shell everywhere and never renders the bone workspace, so we adopt a **mobile-appropriate subset**:

Add to `tokens.ts` + `tailwind.config.js`:

```
shell.hover         rgba(229,225,213,0.12)   // press/hover wash on dark surfaces
shell.hoverStrong   rgba(229,225,213,0.20)
shell.fg            #e5e1d5                   // already present
tint.mustard        // dark-shell equivalent of web's tinted icon-chip bg (see Â§3.5)
tint.rosa
tint.cobalt
tint.red
tint.green
```

Mobile stays **dark-shell-dominant** (charcoal bg, bone fg). We do **not** port the web's bone workspace surface â€” on a phone the whole app is the dark shell. This is a deliberate, defensible divergence from the web's two-tone split (web-design report Â§4), justified by native: dark UI reads better on OLED phones and the web's "shell vs workspace" split is a desktop affordance.

### 3.2 Type scale â€” replace ad-hoc sizes with named tokens

Web uses a restrained, weight-driven hierarchy (web-design Â§1). Mobile is currently ad-hoc (`text-xs`/`text-sm`/`text-2xl` scattered). Add a semantic scale (as a `type` export in `tokens.ts` and/or NativeWind classes documented in one place):

| Token | Size / weight / line-height | Web counterpart | Use |
|---|---|---|---|
| `display` | 28 / 700 / 1.2 | `text-3xl font-semibold` h1 | Page titles |
| `title` | 20 / 600 / 1.25 | card title | Card / section titles |
| `subtitle` | 16 / 500 / 1.4 | | Secondary headers |
| `body` | 16 / 400 / 1.5 | `16px / 1.6` base | Body copy |
| `label` | 13 / 600 / 1.2 | `text-sm font-medium` | Field labels, row labels |
| `caption` | 12 / 400 / 1.3 | `text-xs muted` | Helper / meta text |
| `overline` | 11 / 600 / 1.2, letter-spacing 1.4 | `text-[10px] uppercase tracking-[0.14em]` | Section header eyebrows |

### 3.3 The 1.5px border motif (signature element)

Web overrides *every* border to 1.5px (`globals.css:235-280`); the mobile-now report confirms this is absent on mobile (borders are just `shell.border` opacity, default hairline). RN can't do a global CSS override, so we encode it as a token and bake it into primitives:

- Add `borderWidth: { hairline: 1, brand: 1.5 }` semantics. Every Inklee primitive (Card, ListRow, TextField, SectionCard, dividers) uses `borderWidth: 1.5` explicitly. Code-review/lint note in the slice: "no raw `border` on Inklee surfaces; use the primitive."

### 3.4 Radius & density

- **Card radius â†’ 20** (web `rounded-[20px]`, `card.tsx:9`). Mobile cards are currently `rounded-2xl` (16). Bump to 20 in the Card primitive.
- **Card padding â†’ match web's generosity.** Web is `p-6` (24); mobile is `p-4` (16) (`Card.tsx:9`). Move to a `cardPadding: 20` token (a sensible native midpoint; 24 can feel loose on small phones â€” this is a defensible native density tradeoff).
- **Buttons â†’ fully rounded** (`rounded-full`) to match web `button.tsx`. Mobile is `rounded-xl` (`Button.tsx`). Adopt pill buttons.
- **Spacing scale** (currently none in `tailwind.config.js`): add `space: { xs:4, sm:8, md:12, lg:16, xl:24, 2xl:32 }` to enforce the web's `space-y-6`/`gap-3` rhythm.

### 3.5 Icon chips â€” the missing character primitive

Web's `IconChip` (`card.tsx:29-68`) is the visual-hierarchy workhorse: a circular solid-tint badge leading every section/widget header. Mobile has **zero** equivalent. Port it (see Â§4). Tint mapping mirrors web `TINT_CLASSES`:

```
mustard â†’ bg mustard / charcoal icon
rosa    â†’ bg rosa    / charcoal icon
cobalt  â†’ bg cobalt  / bone icon
red     â†’ bg danger  / bone icon
green   â†’ bg success / bone icon
bone    â†’ bg charcoal/ bone icon   (inverted neutral)
```

### 3.6 Status pills â€” go solid (high-visibility), matching web

Mobile `StatusPill.tsx:6-17` uses **soft 20%-opacity tints**; web `status-badge.tsx` uses **solid full-saturation fills** (web-design Â§2). This is a flagged divergence. Port the solid mapping exactly:

```
pending          â†’ bg mustard  / charcoal text
deposit_pending  â†’ bg rosa     / charcoal text
approved         â†’ bg charcoal / bone text   (solid, "confirmed")
rejected         â†’ bg danger   / bone text
cancelled        â†’ bg charcoal/10 / charcoal-dim text
waiting          â†’ bg mustard  / charcoal
converted        â†’ bg success  / bone
contacted        â†’ bg rosa     / charcoal
dismissed        â†’ muted
```

Label text continues to come from `humanStatusLabel` (`@inklee/shared/status-labels`) â€” already correct (`StatusPill.tsx:2`).

### 3.7 Native character extensions (port + extend)

- **Press affordance:** web mustard buttons translate down 1px + darken on active (`globals.css:318-339`). Native equivalent: `Pressable` with `pressed` â†’ `translateY(1)` + slight darken; add light **haptic** (`expo-haptics`) on primary actions (Accept/Pass/Deposit).
- **Active-nav accent:** web uses a 3px rosa bar (sidebar) and a rosa/mustard center FAB (bottom nav). Mobile center "Bookings" tab gets the **raised accent treatment** mirroring `mobile-bottom-nav.tsx:37-64` (mustard when active, rosa when not), with mustard active tint on the other 4.
- **Selection / accents:** rosa is the secondary accent. Apply it the way web does (active center-nav idle state, deposit/contacted status, section-header chips) instead of leaving it buried as it is today.

---

## 4. Component vocabulary

Map web hierarchy primitives to RN. Legend: **Keep** (good as-is), **Restyle** (apply Â§3 tokens), **Add** (new).

| Mobile primitive | Action | Web counterpart | Notes |
|---|---|---|---|
| `Screen.tsx` | **Restyle** | `(artist)/layout.tsx` main | Add `pt` to clear the new floating top-bar pill; keep safe-area logic. |
| `Card.tsx` | **Restyle** | `ui/card.tsx` Card | radius 20, padding 20, border 1.5px. |
| `CardHeader` + `IconChip` | **Add** | `ui/card.tsx` CardHeader/IconChip | The single biggest character win. Circular tint chip + title + optional trailing link. |
| `SectionCard` / `SectionHeader` | **Add** | settings section pattern (`bookings/settings/page.tsx:72-82`) | Icon chip + overline label + optional description + 1.5px bottom border. Used by Settings, Booking detail, Dashboard widgets. |
| `PageHeader` | **Add** | web h1 + subtitle pattern | display-type title + optional subtitle + optional trailing action. Replaces the inline `<Text>"More"</Text>` titles (e.g. `more.tsx:129`). |
| `ListRow` | **Add** | divide-y list rows + `ui/card.tsx` row pattern | Unify the 4+ hand-rolled rows (RequestCard, ClientRow, FlashItemRow, ProductRow per mobile-now report). Variants: base / interactive (chevron) / with-status-pill / with-thumbnail. 1.5px `divide-y` style separators. |
| `StatusPill.tsx` | **Restyle** | `status-badge.tsx` | Solid fills (Â§3.6). |
| `Segmented.tsx` | **Keep + Restyle** | web tab strips / section-nav | Becomes the in-screen sub-nav for Bookings/Flash/Goods. Add mustard underline/active treatment to match web tab indicator. |
| `TopBar` (pill) | **Add** | `mobile-top-bar.tsx` | Floating dark pill: logo, Books pill, bell, account menu. |
| `BooksStatusPill` | **Add** | web status pill | Compact Books Open / Books Closed (+ remaining slots) in the top bar; taps to Booking settings. Reuse `BooksToggle.tsx` logic for the mutation. |
| `AccountMenuSheet` | **Add** | `mobile-top-bar.tsx:76-134` menu | Native bottom sheet replacing the dropdown. Holds Settings / view booking form / view flash page / sign out. |
| `Chip` / `FilterChip` | **Add** | status filter chips (`overview/page.tsx:19-26`) | For Requests status filters (All/Pending/Accepted/â€¦) + trip filter. |
| `EmptyState.tsx` | **Restyle** | empty-state card | Add an optional bone-tinted Lucide icon (web has visual warmth; mobile is text-only). |
| `ErrorState.tsx` | **Keep** | â€” | Good factoring; leave logic, inherit restyle via EmptyState. |
| `Button.tsx` | **Restyle** | `ui/button.tsx` | `rounded-full`, add `xs/sm/lg` sizes + press translate + haptics. |
| `SettingsRow.tsx` | **Keep** | â€” | Good; will be superseded by `ListRow` over time but keep for Settings stack now. |
| `TextField` / `TextArea` | **Restyle** | inputs | 1.5px border, focus ring in rosa; logic unchanged. |
| `NotificationBell.tsx` | **Keep** | `notification-bell` | Already correct (rosa badge); just relocate into `TopBar`. |
| `BookingActions` / calendar primitives / `RadioList` / `ImageUploadField` / `DangerButton` / `SocialAuthButtons` | **Keep** | â€” | Functional; inherit restyle via shared primitives. |

**Lucide on native:** web uses `lucide-react`. Use `lucide-react-native` for parity of the exact icon set (and the `Spiderweb` custom icon must be ported to RN SVG for the Flash tab to match `nav-config.ts:13`).

---

## 5. Screen-by-screen restructure

Prioritized by the daily loop (web-ia "daily-use flows"): triage requests â†’ manage deposits â†’ manage books.

### 5.1 Dashboard â€” `(tabs)/index.tsx` (HIGH)
Web pattern: hero header + widget grid of `Card`s each led by an `IconChip` (web-screens Dashboard).
- `PageHeader` "Dashboard".
- Widget cards using `CardHeader` + `IconChip`: **Pending requests** (mustard Inbox) â†’ big stat + list â†’ tap to Overview; **Upcoming** (rosa CalendarDays); **Waitlist** (cobalt Users); **Guest Spots** (cobalt MapPin); **Booking link** widget; **Analytics** link card â†’ `insights.tsx`.
- Replace the current flat stats/lists with the icon-chip widget rhythm. Keep pull-to-refresh.

### 5.2 Bookings tab â€” new `(tabs)/bookings.tsx` (HIGH â€” the center FAB)
- `PageHeader` "Bookings".
- `Segmented` sub-nav: **Overview Â· Calendar Â· Deposits Â· Booking form Â· Booking settings**.
- **Overview** body: nested sub-tabs **Requests Â· Clients Â· Waitlist** + `FilterChip` row (All/Pending/Accepted/Awaiting deposit/Passed/Cancelled, status labels from shared module).
  - Requests/Clients/Waitlist reuse the existing screen bodies (`requests.tsx`, `clients.tsx`, `waitlist.tsx`) recomposed as `ListRow` lists.
- **Calendar** body: reuse `MonthGrid`/`DayAgenda` from current `calendar.tsx`.
- **Deposits / Booking form / Booking settings**: reuse `settings/deposit-defaults.tsx`, the booking-form config, and `settings/books.tsx` respectively.
- Native tradeoff: web's responsive table â†’ `ListRow` cards on mobile (web already does this at its `md` breakpoint, `overview/page.tsx:138-180`).

### 5.3 Booking detail â€” `bookings/[id].tsx` (HIGH)
Currently "a wall of text" (mobile-now). Web is a two-column detail (`requests/[id]/page.tsx`). Native: **stacked single column**.
- Back header (native stack) + title + inline `StatusPill` + submitted-time caption.
- `SectionCard`s with icon chips: **Tattoo** (placement/size), **Tattoo images** (gallery), **Client info**, **Deposit** (if applicable), **Interested in buying** (if goods marked).
- **Actions in a sticky footer / action bar** (Accept / Pass / Request deposit) instead of the web's right sidebar â€” with haptics. Verbs are **Accept / Pass** (CLAUDE.md copy rule).

### 5.4 Flash tab â€” `(tabs)/flash.tsx` (MED)
- `PageHeader` "Flash" + trailing "New" action.
- `Segmented`: **Designs Â· Days Â· Instagram**. Designs = responsive tile grid (mirror web `grid-cols-2`, `flash/items/page.tsx:86`). Days/Instagram reuse existing flash subscreens.

### 5.5 Goods tab â€” `(tabs)/goods.tsx` (MED)
- `PageHeader` "Goods" + "New product". `Segmented`: **Products Â· Sales**. Products = tile grid (same as Flash). Sales reuses sales analytics.

### 5.6 Guest Spots tab â€” `(tabs)/travel.tsx` (MED)
- `PageHeader` "Guest spots" + waitlist link + "New trip". Trips list (`ListRow`/cards) + Studios `SectionCard`. Reuse `trip-manager` logic.

### 5.7 Settings stack (from account menu) (MED)
- Each screen gets `PageHeader` + `SectionCard`+`IconChip` headers matching web's section pattern (`bookings/settings/page.tsx:72-82`). Profile / Booking settings / Payouts / Deposit defaults / Account+Delete. Forms keep labelâ†’inputâ†’helper grouping (web-screens forms).

### 5.8 Notifications / Analytics (LOW)
Reuse `notifications.tsx` / `insights.tsx`; reskin with `PageHeader` + `ListRow`/`SectionCard`. Notifications opens from the top-bar bell.

---

## 6. Framework tradeoffs (what "as close as reasonable" means)

| Web mechanic | Why it can't be 1:1 | Native substitute |
|---|---|---|
| Persistent left **sidebar** | No room on a phone | Bottom tabs (web already does this in `mobile-bottom-nav.tsx`) |
| **Two-tone shell + bone workspace** split | Desktop affordance; OLED prefers dark | Dark-shell-dominant everywhere (Â§3.1) |
| **Tables** (overview, clients) | No horizontal room / no native table | `ListRow` cards (web does this at `md`) |
| **Hover** states | No pointer | `Pressable` press wash (`shell.hover`) + long-press for secondary actions |
| **Two-column detail** (main + action sidebar) | No width | Stacked `SectionCard`s + sticky **action footer** (Â§5.3) |
| **Dropdown menus** (account, trip filter) | Awkward as native popovers | Bottom **sheets** + `FilterChip` rows |
| **In-page anchor scroll** (`#studios`) | No URL anchors | Sections in one scroll view or a sub-segment |
| **Section-nav as URL tabs** | Routing differs | `Segmented` in-screen sub-nav (state, not separate routes) |
| Global **1.5px CSS border** override | No global CSS | Token + baked into primitives (Â§3.3) |
| `::selection` rosa highlight, custom scrollbars | N/A on native | Drop (no native analog); rosa lives in accents instead |

Net: the **structure and character survive intact**; only the *delivery mechanism* of each pattern changes, and every substitution is the conventional native idiom.

---

## 7. What to keep

The mobile-now report's central judgment holds: the app is **well-engineered; only its visual identity and IA need work.** Preserve:

- **Bottom-tab nav as the model** (just realign the slots â€” Â§2).
- **Auth/onboarding gate** (`app/_layout.tsx:89-216`) â€” three-state routing, splash, retry, cache-clear on user change. Do not touch the gate logic; only add tab screens under the `onboarded` guard.
- **Component factoring:** `Card`, `Button`, `TextField`, `TextArea`, `StatusPill`, `SettingsRow`, `EmptyState`/`ErrorState`, `BooksToggle`, `NotificationBell`, `Segmented`, `RadioList`, calendar primitives. Restyle, don't rewrite.
- **Data layer:** `useApiQuery`, react-query client config (`_layout.tsx:21-25`), pull-to-refresh + `ListEmptyComponent` pattern.
- **Shared vocabulary:** `humanStatusLabel` from `@inklee/shared/status-labels`; `tokens.ts â†” tailwind.config.js` sync discipline.
- **Push deep-linking** (`usePushResponseObserver`) and telemetry/`captureError`.

---

## 8. Sequenced slices (lowest-risk-first, explicitly non-big-bang)

Each slice ships independently and leaves the app runnable. Design system and primitives land **before** any IA change, so the new tabs are built with finished primitives.

> **Slice MB-1 â€” Token & type-scale foundation**
> Scope: extend `tokens.ts` + `tailwind.config.js` with semantic shell/tint colors, the named type scale, spacing scale, radius/border tokens (Â§3.1â€“3.4). No screen changes.
> Accept: tokens compile; existing screens render unchanged; new tokens referenced by a throwaway storybook screen or the existing UI.

> **Slice MB-2 â€” Restyle existing primitives**
> Scope: Card (radius 20 / pad 20 / 1.5px), Button (pill + press translate + haptics), StatusPill (solid Â§3.6), TextField/TextArea (1.5px + rosa focus), EmptyState (optional icon).
> Accept: every existing screen still works; status pills now solid; visual diff review against web `status-badge.tsx` / `card.tsx`. No IA change.

> **Slice MB-3 â€” Add character primitives**
> Scope: `IconChip` + `CardHeader`, `SectionCard`/`SectionHeader`, `PageHeader`, `ListRow` (all variants), `Chip`/`FilterChip`. Port `Spiderweb` icon to RN SVG. Adopt `lucide-react-native`.
> Accept: primitives demoed on one non-critical screen (e.g. Settings/Profile) and reviewed against web counterparts; no nav change yet.

> **Slice MB-4 â€” Top-bar pill + account menu + persistent bell/Books pill**
> Scope: `TopBar`, `AccountMenuSheet`, `BooksStatusPill` (reuse `BooksToggle` mutation), relocate `NotificationBell`. Wire into `Screen`/tab layout. Mirrors `mobile-top-bar.tsx`.
> Accept: top-bar pill shows on all current tabs; bell deep-links; account menu opens Settings/external links/sign-out; Books pill toggles status. Old "More" still present (not yet removed).

> **Slice MB-5 â€” Re-slot the bottom tabs to web `MOBILE_BOTTOM_NAV`** (the IA pivot)
> Scope: rewrite `(tabs)/_layout.tsx` to Dashboard Â· Flash Â· **Bookings (center FAB)** Â· Guest Spots Â· Goods, with center accent treatment mirroring `mobile-bottom-nav.tsx`. Create thin `(tabs)/flash.tsx`, `(tabs)/bookings.tsx`, `(tabs)/travel.tsx`, `(tabs)/goods.tsx` that initially **embed the existing screen bodies**. Delete the **More** hub (`more.tsx`); its links now live in the account menu / proper tabs.
> Accept: 5 tabs match web order/labels exactly; center FAB styled; every former "More" destination reachable in â‰¤ the web's tap count; no orphaned routes; onboarding gate untouched.

> **Slice MB-6 â€” Bookings tab in-screen sub-nav**
> Scope: `Segmented` sub-nav (Overview Â· Calendar Â· Deposits Â· Booking form Â· Booking settings) + Overview sub-tabs (Requests Â· Clients Â· Waitlist) + `FilterChip` row. Reuse existing requests/clients/calendar/waitlist/deposits/books bodies as `ListRow` lists.
> Accept: all five Bookings sub-areas reachable from the Bookings tab; status filters work; labels mirror `nav-config.ts:50-56` and overview tabs.

> **Slice MB-7 â€” Dashboard widget recomposition**
> Scope: rebuild `(tabs)/index.tsx` with `PageHeader` + icon-chip widget cards (Â§5.1).
> Accept: widgets match web dashboard set + tints; pending-requests widget taps through to Overview.

> **Slice MB-8 â€” Booking detail recomposition**
> Scope: `bookings/[id].tsx` â†’ `SectionCard`s + sticky action footer + haptics (Â§5.3).
> Accept: sections + headers mirror web `requests/[id]`; Accept/Pass/Deposit work with haptics; verbs are Accept/Pass.

> **Slice MB-9 â€” Flash / Goods / Guest Spots tab polish**
> Scope: segmented sub-nav + tile grids + `PageHeader` (Â§5.4â€“5.6).
> Accept: Flash (Designs/Days/Instagram), Goods (Products/Sales), Guest Spots (Trips/Studios) match web sub-nav and grid layouts.

> **Slice MB-10 â€” Settings stack + Notifications/Analytics reskin**
> Scope: apply `PageHeader`/`SectionCard`/`IconChip` to settings, notifications, insights (Â§5.7â€“5.8).
> Accept: settings sections mirror web pattern; copy-rule sweep (no em-dashes) across all new user-visible strings.

> **Slice MB-11 â€” Native-quality pass**
> Scope: haptics audit, press affordances everywhere, sheet transitions, empty-state icons, swipe-between-segments if low-risk.
> Accept: primary actions have haptics; no flat/un-pressed surfaces; review against the web-design "Inklee character" checklist.

---

## 9. Risks & open questions (need founder decisions)

1. **Bookings as the center FAB** is the boldest structural change and the load-bearing daily surface. The web makes it the raised center item; confirm we mirror that (recommended) rather than putting Dashboard center.
2. **Web Settings has children with no mobile screen:** Bio page, Emails, Calendar (settings), Home widgets (`nav-config.ts:93-99`). Mobile only has Profile/Books/Deposits/Payouts. Do we (a) build these mobile settings screens for full parity, or (b) accept a smaller mobile Settings and link "Manage on web" for the rest? Recommendation: ship (b) now, build (a) later â€” these are low-frequency config surfaces.
3. **Flash â€º Instagram and Goods â€º Sales** sub-areas: do mobile screens/endpoints exist yet, or are these new builds? The glob shows `flash/days` and `goods` but no `instagram`/`sales` routes. Confirm scope per slice MB-6/MB-9.
4. **Dark-shell-only vs. web's two-tone** (Â§3.1): confirm we drop the bone workspace on mobile (recommended for native/OLED) rather than reproducing the split.
5. **Card padding 20 vs web's 24** (Â§3.4): confirm the native density midpoint is acceptable, or insist on exact 24.
6. **"My Booking Form" editing on mobile:** is full form-builder parity in scope, or is mobile read-only with "edit on web"? Affects MB-6 sizing.
7. **Branching strategy:** current mobile work sits on `feat/mobile-e1`. Confirm this rebuild starts a fresh branch off `master` and whether `feat/mobile-e1`'s in-flight work (push tokens, image upload â€” see recent commits) must merge first.

---

**Suggested filename for this doc:** `A:\WORK\inklee\docs\mobile-mirror-web-plan.md`

**Key files this plan touches or cites:**
- Nav contract (web): `A:\WORK\inklee\apps\web\src\components\app-shell\nav-config.ts` (`MOBILE_BOTTOM_NAV` lines 114-130, `SIDEBAR_NAV` 34-104)
- Web mobile IA: `A:\WORK\inklee\apps\web\src\components\app-shell\mobile-bottom-nav.tsx`, `mobile-top-bar.tsx`
- Web character primitives: `A:\WORK\inklee\apps\web\src\components\ui\card.tsx` (IconChip), `status-badge.tsx`, `globals.css` (tokens 32-87, 1.5px border 235-280)
- Mobile tokens: `A:\WORK\inklee\apps\mobile\src\lib\tokens.ts`, `A:\WORK\inklee\apps\mobile\tailwind.config.js`
- Mobile nav to rewrite: `A:\WORK\inklee\apps\mobile\app\(tabs)\_layout.tsx`; hub to delete: `A:\WORK\inklee\apps\mobile\app\(tabs)\more.tsx`
- Mobile gate to preserve: `A:\WORK\inklee\apps\mobile\app\_layout.tsx` (89-216)
- Mobile primitives: `A:\WORK\inklee\apps\mobile\src\components\` (Card, Button, StatusPill, SettingsRow, Segmented, NotificationBell, BooksToggle, EmptyState/ErrorState, TextField/TextArea)
