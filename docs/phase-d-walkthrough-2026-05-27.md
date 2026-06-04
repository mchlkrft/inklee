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

- **DT-1 [H]** Onboarding intro (`onboarding/welcome/welcome-slides.tsx`) and `/onboarding/done` (`onboarding/done/page.tsx`) are cut off at the top — content overflows the first viewport. Goal: full content visible in the first viewport without scrolling, on **all** devices (confirmed broken on desktop). Likely a vertical-centering / min-height / fixed-chrome offset issue.

**Dashboard**

- **DT-2 [M]** The booking-link widget should also include the **waitlist link**, and the widget should be **renamed** to something that covers both (it's no longer just the booking link). Home-widgets config in `/settings/dashboard`.

**Bookings › Request (revises Slice 77 B3)**

- **DT-3 [M]** Size in the artist view should show **only the measurement** (`~ 15-20 cm`), not `Forearm · ~ 15-20 cm`. The label ("Forearm") reads as placement and is confusing. Fix: change `formatSize()` in `src/lib/booking-schema.ts` to return the hint only (raw fallback kept); update the `formatSize` test. The public form keeps label+hint (it uses `SIZE_LABELS` directly, not `formatSize`).

**Analytics**

- **DT-4 [M]** "Requests per Month" should render a **calendar** with each day showing its request count (heatmap-style).
- **DT-4b [Future]** Deeper per-day / detailed analytics drill-down — founder will provide a detailed plan + prompt when it's time for the slice. Parking-lot, do not build now.

**Waitlist — artist backend restructure**

- **DT-5 [H]** The main waitlist view should **not** openly list people. Move dismissed + converted entries into a **collapsed "history" section** (find a better name), expandable on click, greyed out to signal they're not active states. Converted state is unclear: relabel converted entries **"added to requests"** in the waitlist. In Requests, a converted-from-waitlist entry should show a **"waitlist request" chip in the same color as the "request" chip**.

**Waitlist — public page (`src/app/[slug]/waitlist/page.tsx`)**

- **DT-6 [H]** Link to the artist page is **incorrect/broken** now.
- **DT-7 [L]** City/location helper text: remove the trailing `— helps them plan future guest spots.`
- **DT-8 [M]** "Join the waitlist" button → **brand color**.
- **DT-9 [M]** Headline → `{artistname} waitlist`.
- **DT-10 [M]** Subheadline → `Leave your details and join the waitlist`.

**Goods — "mark interest" regression (restructure side-effect)**

- **DT-11 [H]** The "mark interest" functionality is gone. **Root cause:** `src/app/[slug]/page.tsx:236-239` gates `interestEligible` on `isGoodsCommerceEnabled()`, which RS-3 turned OFF when it parked goods **commerce/checkout**. Parking paid checkout wrongly also killed interest-**marking**. Intended behavior: clients can mark interest in specific items from the booking form (as before), **decoupled** from deposit/payment; the artist sees interested items in the booking overview; the existing double-confirmation on accept (appointment + guest spot + goods together) still works. Fix: gate interest-marking on goods-module availability (e.g. `canUseGoods()`), not on the paid-checkout master switch — without re-enabling checkout.

**Bookings › Deposit page (`/bookings/deposits`)**

- **DT-12 [H]** UI is messy and off-brand (orange warning text on bone reads poorly). Needs a cleaner, on-brand UI **and its own slice** with full workflow testing — was not properly tested after the money-scope restructure.

**Payouts**

- **DT-13 [H]** Must be reviewed **together with deposits** as one payment-system operation (Connect onboarding + deposit + fee + refund + payout). Pairs with DT-12 into a payment-system slice.

**Bookings › My booking form › Appearance**

- **DT-14 [M]** Drop the "Appearance" section — not needed under the current brand-color system.

**Bookings › Booking settings**

- **DT-15 [M]** Add **icons** and reduce the plain/cluttered layout; currently hard to scan/understand.

**Flash › Designs**

- **DT-16 [M]** Edit + new item open a **subpage**; they should use a **modal** matching the goods/guest-spots modal style (an older version did this). No full-page navigation for item edit.
- **DT-16b [Future]** Establish as a backend principle: artist-backend item editing happens in **modals/overlays**, not subpages, to reduce navigation and keep overview. Apply going forward.

#### Round 1 status

- ✅ **Quick-wins batch shipped 2026-06-04** (commit + deploy): **DT-2** (dashboard widget → "Your links", booking + waitlist rows, Preview uses absolute URL), **DT-3** (size cm-only), **DT-6** (waitlist back-link via `publicArtistUrl`), **DT-7** (helper text + em-dash removed), **DT-8** (Join button → brand mustard), **DT-9** (headline), **DT-10** (subheadline), **DT-14** (dropped booking-form Appearance section). Also fixed in passing: dashboard widget "Copied!" exclamation removed; widget Preview link no longer uses raw `/${slug}` (same subdomain bug class as DT-6).
- ⏳ **Held for a slice (after the full cross-device batch):** DT-1 (intro/`onboarding/done` first-viewport — responsive, overlaps mobile round), DT-15 (booking-settings icons/declutter).
- ⏳ **Dedicated slices pending:** DT-11 (goods interest decouple), DT-12+DT-13 (payment-system: deposit page + payouts), DT-5 (waitlist artist-backend restructure), DT-4 (analytics calendar), DT-16 (Flash edit-in-modal).
- 🅿️ **Future (founder will prompt):** DT-4b (detailed analytics), DT-16b (modal-everywhere principle).
