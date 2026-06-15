# Phase D — live walkthrough findings

**Date:** 2026-05-27 (resumed 2026-06-04)
**Format (revised 2026-06-04):** the live narrate-along proved unproductive. Founder instead runs an intense solo test pass across **smartphone + iPad + desktop**, writes down everything, and hands the batch to Claude in one go. Claude then triages each item into the findings list with a severity, groups related issues, proposes a fix order, and batch-fixes (capture-then-fix, same as Slice 77 + the agent sweep). Notes shape per item: device, screen/URL, what's wrong vs expected.
**Goal:** prioritized punch list. Ship the fixes, then announce.

Severity legend:

- **B** Blocker — must fix before launch.
- **H** High — fix before launch if possible; otherwise within first week.
- **M** Medium — fix in first launch sprint.
- **L** Low — nice-to-have, parking-lot.

---

## Surfaces covered

- [ ] Artist flow: signup → onboarding → first slot/trip → public preview → booking received → accept → deposit → cancel → 2FA enable
- [ ] Customer flow: `/start` → demo `/bert-grimm` (or via subdomain `bert-grimm.inkl.ee`) → submit booking → magic-link portal → reschedule → cancel
- [ ] Admin flow: `/admin` → roster → suspend/reactivate → analytics with tester exclusion
- [ ] Mobile pass: all of the above at 375px on the floating-pill chrome
- [ ] Edge cases: books closed → waitlist; cap reached → waitlist; flash booking; trip-scoped booking; honeypot + autofill; `/[slug]/waitlist`; subdomain not-found "claim this name" page (Slice 71)

---

## Findings

### Round 1 — Desktop (founder solo pass, 2026-06-04)

IDs `DT-n`. Severity B/H/M/L. "Future" = founder will write a dedicated slice/prompt later; do not build now.

**Layout / first-viewport**

- **DT-1 [H]** ✅ **SHIPPED as Slice 78d (2026-06-04).** Root cause: `onboarding/layout.tsx` used `flex justify-center overflow-y-auto`, which traps content taller than the viewport _above_ the scroll origin (can't scroll up → top cut off). Fixed with the canonical pattern: outer div owns the scroll, inner `min-h-full` flex wrapper centers short content but grows + scrolls from the top when tall. Fixes both welcome-slides and `/onboarding/done`.

**Dashboard**

- **DT-2 [M]** The booking-link widget should also include the **waitlist link**, and the widget should be **renamed** to something that covers both (it's no longer just the booking link). Home-widgets config in `/settings/dashboard`.

**Bookings › Request (revises Slice 77 B3)**

- **DT-3 [M]** Size in the artist view should show **only the measurement** (`~ 15-20 cm`), not `Forearm · ~ 15-20 cm`. The label ("Forearm") reads as placement and is confusing. Fix: change `formatSize()` in `src/lib/booking-schema.ts` to return the hint only (raw fallback kept); update the `formatSize` test. The public form keeps label+hint (it uses `SIZE_LABELS` directly, not `formatSize`).

**Analytics**

- **DT-4 [M]** ✅ **SHIPPED as Slice 78e (2026-06-04).** Added a per-day calendar (Mon-start month grid, heatmap-shaded by volume, each day shows its request count) below the monthly bars in the analytics volume section. Server computes a `dayMap` for the most recent active month; client renders via bucketed `bg-brand-mustard/{30,60,90}` classes. Multi-month / detailed drilldown remains DT-4b (future).
- **DT-4b [Future]** Deeper per-day / detailed analytics drill-down — founder will provide a detailed plan + prompt when it's time for the slice. Parking-lot, do not build now.

**Waitlist — artist backend restructure**

- **DT-5 [H]** ✅ **SHIPPED as Slice 78c (2026-06-04).** Waitlist view (`bookings/overview` WaitlistView) now lists only active (waiting/contacted) entries; dismissed + converted moved into a collapsed, greyed-out `<details>` "History (n)" section. Converted entries read "Added to requests" instead of the raw status. Conversion now stamps `form_data.source = "waitlist"` (no enum migration), and the requests list (mobile + table) + detail show a neutral "Waitlist" chip; detail subtitle reads "Added from waitlist".

**Waitlist — public page (`src/app/[slug]/waitlist/page.tsx`)**

- **DT-6 [H]** Link to the artist page is **incorrect/broken** now.
- **DT-7 [L]** City/location helper text: remove the trailing `— helps them plan future guest spots.`
- **DT-8 [M]** "Join the waitlist" button → **brand color**.
- **DT-9 [M]** Headline → `{artistname} waitlist`.
- **DT-10 [M]** Subheadline → `Leave your details and join the waitlist`.

**Goods — "mark interest" regression (restructure side-effect)**

- **DT-11 [H]** ✅ **SHIPPED as Slice 78a (2026-06-04).** The "mark interest" functionality was gone because `interestEligible` (and the submit-time capture + `getInterestEligibleProducts`) gated on `isGoodsCommerceEnabled()`, which RS-3 turned OFF when it parked goods commerce. Fix: interest-marking now gates on the per-artist goods module (`canUseGoods`) — `[slug]/page.tsx`, `[slug]/actions.ts` (always reads the payload, drops it only when no eligible products so the booking always goes through), `addon-products.ts:getInterestEligibleProducts`. Payable add-on checkout (`request/[token]`, `getAddonProducts`) stays parked on `isGoodsCommerceEnabled()`. Artist interest view + Accept-time availability popup ride on `booking_interests` presence (never flag-gated), so the double-confirmation works. No money path reachable. typecheck/lint clean, 287 tests green.

**Bookings › Deposit page (`/bookings/deposits`)**

- **DT-12 [H]** UI is messy and off-brand (orange warning text on bone reads poorly). Needs a cleaner, on-brand UI **and its own slice** with full workflow testing — was not properly tested after the money-scope restructure.

**Payouts**

- **DT-13 [H]** Must be reviewed **together with deposits** as one payment-system operation (Connect onboarding + deposit + fee + refund + payout). Pairs with DT-12 into a payment-system slice.

**Bookings › My booking form › Appearance**

- **DT-14 [M]** Drop the "Appearance" section — not needed under the current brand-color system.

**Bookings › Booking settings**

- **DT-15 [M]** ✅ **SHIPPED as Slice 78d (2026-06-04).** Added `IconChip` section icons to `/bookings/settings` (Availability/mustard, Booking mode/rosa, Slots/cobalt, Studios/green) so the page scans at a glance.

**Flash › Designs**

- **DT-16 [M]** ✅ **SHIPPED as Slice 78f (2026-06-04).** Flash item Edit now opens an inline modal (`flash-edit-modal.tsx`) instead of navigating to `/flash/items/[id]`, mirroring the goods edit-modal pattern: new `loadFlashItemForEditAction` fetches the item + flash days on open, the modal reuses the existing `FlashItemForm` (added an `onSuccess` callback to close on save). New already used the quick-create modal. The `[id]` + `/new` subpages stay as deep-link fallbacks.
- **DT-16b [Future]** Establish as a backend principle: artist-backend item editing happens in **modals/overlays**, not subpages, to reduce navigation and keep overview. Apply going forward.

#### Round 1 status

- ✅ **Quick-wins batch shipped 2026-06-04** (commit + deploy): **DT-2** (dashboard widget → "Your links", booking + waitlist rows, Preview uses absolute URL), **DT-3** (size cm-only), **DT-6** (waitlist back-link via `publicArtistUrl`), **DT-7** (helper text + em-dash removed), **DT-8** (Join button → brand mustard), **DT-9** (headline), **DT-10** (subheadline), **DT-14** (dropped booking-form Appearance section). Also fixed in passing: dashboard widget "Copied!" exclamation removed; widget Preview link no longer uses raw `/${slug}` (same subdomain bug class as DT-6).
- ⏳ **Held for a slice (after the full cross-device batch):** DT-1 (intro/`onboarding/done` first-viewport — responsive, overlaps mobile round), DT-15 (booking-settings icons/declutter).
- ⏳ **Dedicated slices pending:** DT-11 (goods interest decouple), DT-12+DT-13 (payment-system: deposit page + payouts), DT-5 (waitlist artist-backend restructure), DT-4 (analytics calendar), DT-16 (Flash edit-in-modal).
- 🅿️ **Future (founder will prompt):** DT-4b (detailed analytics), DT-16b (modal-everywhere principle).

### Future feature — Bio Page (Linktree-style), prompt pending

- **FEAT-Bio [Future]** A dedicated per-artist link-sharing page (Linktree-like) with custom link fields — a **standalone page**, not just custom links inside the contact form. Founder will send the full feature + slice-defining prompt later. Do not build until then. (Relates to the existing Slice 72 Bio Page modules / `custom_links` work — reconcile with that when scoping.)

### Round 2 — iPad (founder solo pass, 2026-06-04)

**⚠️ Almost certainly ONE root cause, not 7 bugs — likely a BLOCKER.** Everything broken is driven by client-side JS (modals, popovers, the top-right nav toggle, item-grid taps, file-input `ref.click()` triggers, custom buttons/links). Everything that still works is native HTML (branded link/submit buttons). That pattern = **the client JS bundle is not executing on the iPad** (hydration not running). Strong candidate: the iPad's Safari version is **below the Next.js 16 build target**, so the bundle errors on parse/eval and no React handlers attach. App-wide (fails on the public contact form AND the artist backend), and these features long predate the 2026-06-04 work, so pre-existing, not introduced this session. Code recon found no lookbehind regex, no custom browserslist, and only an ES5-safe global script — nothing in our own code obviously breaks Safari.

- **IP-1 [B]** Flash overview: items not click-responsive (no buttons surface); "New flash" opens no modal.
- **IP-2 [B]** Goods: same (grid + modal unresponsive).
- **IP-3 [B]** Guest-spot items: tap shows only full charcoal, not responsive.
- **IP-4 [B]** Top-right navbar (account menu) does not open on tap.
- **IP-5 [B]** Contact form: almost nothing works.
- **IP-6 [B]** All custom buttons / links / popovers appear non-functional.
- **IP-7 [B]** Settings › Profile logo + banner upload trigger not responsive.
- **Common thread:** only the branded mustard buttons (mostly links / form submits) respond.

### Round 3 — Phone / smartphone (founder solo pass, 2026-06-04)

- **No further issues found.** Phone pass clean. (Note: if the phone runs iOS 16.4+/17/18 it would not have hit IP-ROOT regardless; the iPad on 16.0–16.3 was the affected device.)

### Round 4 — Uploads (founder, 2026-06-04)

- **UP-1 [H]** Uploading an 11.6 MB PNG as a flash design → 500 + full black screen (no explanation). Same class as Slice 77 **B4** (profile banner): a file over Vercel's ~4.5 MB request-body cap is rejected by the platform before the server action runs → unhandled error → root `error.tsx` (and, pre-IP-ROOT, a truly blank screen on the iPad). Founder requirement: **uploads must never black-screen; always show an explanation.**
- **Audit — 6 upload entry points:** profile logo+cover (✅ hardened in B4), public booking references (✅ already client-compresses via `compressImageInBrowser`), **flash item form**, **flash quick-create modal**, **goods product images**, **onboarding logo**.
- **✅ FIXED + DEPLOYED (UP-1):** added shared `prepareImageUpload()` + `applyFileToInput()` to `src/lib/image-compress.ts` (validate type, reject HEIC, client-compress via the existing helper, guard against >4 MB after compress → `{file}|{error}`). Wired into the three unfixed forms (flash item form, flash quick-create modal, goods picker) with an inline error message and the input's file swapped for the compressed one. Onboarding logo already validated client-side + had `sharp` in try/catch (no change needed). Added `sharp` try/catch to the flash + goods server actions (defense in depth). Result: an 11.6 MB PNG is compressed to a sub-MB WebP before upload (well under Vercel's body cap), and any bad pick shows a specific inline message instead of a 500/black screen. typecheck + lint clean, 287 tests green.
- **✅ ROOT CAUSE FOUND + FIXED + DEPLOYED (IP-ROOT) [B]** (commit `6a3d493`, prod `inklee-ct0hojdgn`, aliased to inkl.ee — **founder to retest on the iPad to confirm**): device is iPad Air 5 / iPadOS 16 / Chrome (WebKit 16). The built client bundle ships a **class static initialization block** — `class y extends Component{static{this.contextType=AppRouterContext}}` (Next.js 16 compiled output) — which is **Safari/WebKit 16.4+ only**. On iPadOS 16.0–16.3 WebKit throws a SyntaxError parsing the chunk → whole client bundle fails to evaluate → no hydration → every JS interaction dead app-wide; only native links/submits survive. Explains IP-1…IP-7 as one cause. No lookbehind regex in the bundle (ruled out). **Fix shipped:** added a `browserslist` target (safari/ios 15.6+ + evergreen floors) to `package.json` so SWC down-compiles the static block. Verified after rebuild: no `static{` / lookbehind / `Array.fromAsync` remain in the `.next` client JS. Deployed to prod. Still need the founder to retest on the actual iPad to confirm interactivity is restored.
