# Claude's Response to Codex's Independent UX Audit

**Date:** 2026-05-20
**Inputs:** `docs/ux-audit/claude-independent-ux-audit.md` (mine, 2026-05-20) and `docs/ux-audit/codex-independent-ux-audit.md` (Codex, same day).
**Purpose:** Critique + merge before the final synthesis plan. Honest about where I was wrong, where Codex was wrong, where we agree.

---

## A. Agreement

The two audits converge cleanly on the diagnosis and on most of the direction. I agree with Codex on:

### Diagnosis (both audits independently arrive here)

- **Inklee is a strong set of modules that don't yet feel like one product.** Codex (6.5/10) and I (7/10) land within half a point. The product-shape problem is identical in both writeups: _"set up → share → receive → review → decide → organize → demand capture → travel"_ is a loop, but the UI doesn't visually expose that loop.
- **The booking link is the spine.** Both audits independently recommend making the link the through-line. Codex says "booking-link readiness checklist"; I say "booking link is the spine of the product." Same answer.
- **Beta-ready with caveats**, not as fully self-serve.

### Specific findings I agree with

- **Renaming nav labels to tattoo-native language**: `Booking Overview` → `Requests` / `Booking Inbox`; `Booking Settings` → `Books & Availability`; `Booking Form` → `Booking Link & Form`; `Travel` → `Guest Spots` (or `Guest Spots & Travel`). Codex's specific wording is better than my conservative "needs founder taste call" framing.
- **Action labels need explanation copy**: Approve / Reject / Request deposit need one-line "what happens next" helper text. Both audits identify this; Codex has the better concrete labels (`Accept request`, `Pass for now`, deposit "Use this when you want the client to pay a deposit before you confirm").
- **Fixed-slots-with-no-slots = bad first-share moment.** This is a real product-shape risk Codex caught precisely.
- **Mobile request review** needs decision actions kept near the summary, not pushed below dense detail.
- **Empty states need consistent shape**: what is happening, why it matters, what to do next.
- **Flash and Analytics shouldn't compete with the core loop for new users.**
- **Waitlist ↔ Travel cross-link**: city demand from waitlist should inform guest-spot planning, and vice-versa. Codex's exact cross-link framing is good.
- **"Preview public page" links from edit surfaces** (Profile, Travel, Booking Form). Both audits propose this.
- **De-emphasize Analytics until enough data exists** to be meaningful.
- **Closed-books reason-specific copy** (manual closed vs window expired vs cap reached vs fixed slots not posted): Codex's nuance is correct and worth the small branching effort.

### Specific findings Codex caught that I want to amplify

- **Status label drift "Waitlist Request" for converted entries** — small, real, XS to fix.
- **"Convert" waitlist action wording** is too vague; "Create booking" or "Move to booking" is clearer.
- **Email template variable syntax** (`{{customer_name}}`) is technical leakage; insertion helpers needed eventually.
- **Calendar export framing** as "Add bookings to Google/Apple Calendar" rather than "iCal export."

---

## B. Disagreement

### Where Codex is wrong (or imprecise)

**B.1 — Codex's stated coverage of redirect topology is mostly right; one fix to it.**

Codex lists `/settings/books`, `/settings/slots`, `/settings/fields`, `/settings/templates`, `/settings/reminders`, `/settings/calendar-export`, `/settings/travel` as "Old settings route redirects." That's correct — I verified directly: every one of them is a `redirect(...)` stub. Good.

However Codex states the redirect destinations imprecisely. The real targets are:

- `/settings/books` → `/bookings/books` → **(further redirects to)** → `/bookings/settings`
- `/settings/slots` → `/bookings/slots` → **(further redirects to)** → `/bookings/settings`
- `/settings/fields` → `/bookings/form` → **(further redirects to)** → `/bookings/booking-form`
- `/settings/reminders` → `/settings/emails`
- `/settings/templates` → `/settings/emails`
- `/settings/travel` → `/travel`
- `/settings/calendar-export` → `/settings/calendar`

Books and Slots are both already collapsed onto `/bookings/settings`. **That means the "Books & Availability" page Codex proposes already structurally exists** — it just needs a rename and stronger framing. Same with form fields living on `/bookings/booking-form`.

This sharpens, not contradicts, Codex's recommendation: the canonical surfaces exist; the labels and headings just don't acknowledge that yet.

**B.2 — "Approve" → "Accept request" / "Reject" → "Pass for now"**

I partially disagree. Codex's tone is right for a tattoo-native voice, but:

- `Approve` is shorter, scannable, and unambiguous in a button. `Accept request` is gentler but adds length and a noun the artist already knows the row is about. Worth A/B'ing with real artists — not an obvious win.
- `Pass for now` is more humane than `Reject`, but the status under the hood stays `rejected`. A label/status mismatch could confuse anyone debugging or reading the audit log. If you ship this label, the status badge on the request list also needs a humane label, or there will be visible inconsistency between the action verb and the resulting badge.

**Recommendation:** ship `Accept` (short) and `Pass` (short) rather than the longer forms. Or stay with `Approve` / `Reject` and put all the warmth in the helper text below. Both audits should treat this as **needs manual testing** rather than treating it as a settled rename.

**B.3 — Booking Overview rename to "Requests"**

Codex proposes `Booking Overview` → `Requests` (or `Booking Inbox`). I had marked this as a "needs founder taste call." After re-reading the page: it currently has two tabs (Requests / Clients). If the page is renamed `Requests`, the Clients tab name becomes confusing. Two options:

1. Rename the section `Bookings` (top-level remains; the sub-page becomes `Bookings` containing both tabs); inside it the Requests and Clients tabs stay as today.
2. Split the page into two top-level destinations: `Requests` and `Clients`. More aligned with Codex's framing but a navigation change.

Option 1 is XS and unblocked. Option 2 is M and worth thinking about post-launch. **Recommendation: rename to "Requests" only if Clients tab gets its own destination; otherwise rename to "Bookings" (current sidebar already calls it Bookings, so this is internal-only).**

**B.4 — Renaming "Booking Settings" to "Books & Availability"**

Strong yes. But on inspection, the current `/bookings/settings` page is now also the merged destination of `/bookings/books` and `/bookings/slots` redirects (B.1 above). That means the page is genuinely doing four things: books open/closed, booking window, cap, AND slot setup (for fixed-slot accounts). The Codex name `Books & Availability` covers the first three; slots is its own concept. A more accurate label might be `Availability & Slots` or `Booking availability`. **Sub-recommendation:** verify what `/bookings/settings` actually renders today (it might still split into sections) before locking the label. **Needs manual testing.**

### Where I am wrong (genuine corrections)

**B.5 — My "Settings is half-hidden" finding (K4) was overblown.**

I claimed that 12 settings routes exist but only 5 are in the sidebar, and proposed exposing more in the sidebar. After verifying: seven of the "hidden" routes are redirect-only legacy stubs. The actual active settings are exactly the 5 in the sidebar (Profile, Emails, Calendar, Dashboard, Account). Codex correctly identified all those routes as redirects in their `Redirected, Duplicate, Hidden, or Partial Surfaces` table.

**Retraction:** K4 in my audit ("Add a `/settings` landing page; expand sidebar with Books/Slots/Fields/Reminders") is wrong. Those things already live correctly under their owning sections (`/bookings/settings`, `/bookings/booking-form`, `/settings/emails`). The redirects are doing the discoverability work. No new sidebar items needed. **K4 should be removed from the priority list.**

What remains valid from K4: the **`/settings` route should not redirect to `/settings/profile`** — instead it should be a landing page listing the 5 settings categories briefly. That's a small discoverability win without restructuring anything. (XS — change one page.)

**B.6 — I missed the `/start` placeholder text.**

Codex flagged "Replace these with real screenshots once available." appears live on `/start`. I verified — it's on line 254 of `src/app/start/page.tsx`. This is a public-facing trust killer. XS to fix, **add to the critical list**. Acknowledged as an audit miss.

**B.7 — I missed the public-form field-order issue.**

Codex caught that the default field order on `/bert-grimm` puts Reference Link before tattoo description. The natural cognitive flow is: contact → idea → placement/size → references → date. My audit recommended "section the form" but didn't notice the within-form ordering. Codex is right; XS fix (reorder via `buildDefaultFieldOrder` or the per-artist `field_order` setting).

**B.8 — I missed the live a11y/visual bug on size labels.**

Codex flagged `Palm-sized~ 5 cm` and `Larger20 cm+` rendering without a space between the label and the hint. Concrete bug. XS fix.

**B.9 — I missed the unlabeled extra textbox visible after preferred-date.**

Codex flagged this is likely the honeypot or a date helper that's not properly hidden from assistive tech. Real a11y issue. Worth verifying that the honeypot has `aria-hidden="true"` and `sr-only` (which I saw in `report-form.tsx` for the DSA route, but the public booking form's honeypot rendering needs the same treatment). XS to verify and fix.

**B.10 — I didn't deeply consider `Travel` → `Guest Spots` rename.**

I deferred to "founder taste." Codex's reasoning is clean: tattoo artists use "guest spot," not "travel." The data model can stay `trips` / `trip_legs` / `studios`; only the user-facing label changes. **Accepted as a valid rename, not a taste call.** XS.

---

## C. Missing points from Codex's audit

### Points I caught that Codex missed

**C.1 — Name collision: `Settings → Dashboard` vs top-level `Dashboard`.**

Codex's sidebar audit didn't flag the fact that the Settings sub-item labeled "Dashboard" sends users to widget toggles, while the top-level "Dashboard" is the home screen. A user clicking the wrong one ends up in a different mental model. XS fix (rename the sub-item to "Home widgets" or "Customize home").

**C.2 — Onboarding step 1 label drift.**

The `OnboardingProgress` component labels step 1 as "Profile," but the actual page is `/onboarding/claim-slug` (picking your URL slug + display name; full profile editing lives at `/settings/profile`). Codex didn't catch this. XS fix.

**C.3 — `BookingLinkWidget` is gated by `widgets.booking_link` in dashboard settings.**

The link can be hidden by a user setting. For zero-request artists this widget is precisely what they need most. Codex recommended "make booking link prominent" but didn't identify the toggle-gating as the concrete code path. The fix is to force-on the widget when `received_requests_count === 0`. S effort.

**C.4 — Status leak `deposit_pending` raw via `status.replace("_", " ")`.**

Bookings overview empty state shows `No deposit_pending requests` (still has the underscore replaced by space, but the label is raw). Codex's audit asks for human action labels but didn't identify this specific code-level leak. XS fix (introduce `humanStatusLabel(status)`).

**C.5 — `/bookings/` double-hop redirect.**

`/bookings` → `/bookings/requests` → `/bookings/overview`. Codex flagged this as "multiple redirects" but didn't propose the precise one-line fix (redirect `/bookings` directly to `/bookings/overview`). XS.

**C.6 — Feature-intro modal pattern is under-used.**

`FeatureIntroModal` covers 5 features (overview, waitlist, travel, flash-items, flash-days). The pattern is strong (auto-show when empty, dismissible, returns after 7 days). It is **not configured for** the dashboard zero-state, the booking-form admin page, or the slots/availability screens. Codex didn't recommend extending the pattern; I think this is the cheapest leverage for guidance density. S effort to add 2-3 more feature keys.

**C.7 — Per-page verification of dashboard subroute stubs.**

I confirmed `(artist)/dashboard/calendar`, `(artist)/dashboard/clients`, `(artist)/dashboard/waitlist`, `(artist)/dashboard/requests/[id]` are all `redirect`-only stubs. Codex correctly identified them as "Old dashboard … pages" but said "Some redirect, some duplicate components remain." Actually all are redirect-only. Worth being precise — there is no duplicated UI to clean up; only the redirect files themselves (which are harmless and can stay).

### Points Codex caught that I should have caught

(See B.5–B.10 above — already acknowledged.)

### Points neither audit dug into deeply (flag for synthesis)

**C.8 — `StatusActions` (request approve/reject/deposit flow) was not opened by either audit.**
Both audits recommend "add action helper copy" without inspecting the component. The synthesis pass should open `src/app/(artist)/bookings/requests/[id]/status-actions.tsx` and check: are there confirmation prompts? Is destructive-action UI (reject, cancel) protected? Does the deposit-request action have any client-feedback at all? Until that's checked, the size of the copy/confirmation work is unknown.

**C.9 — `/request/[token]` customer portal not deeply inspected.**
Both audits mention it. Neither traced its post-submit experience step by step. Worth one read pass during synthesis.

**C.10 — Mobile real-device testing.**
Both audits flagged this as "needs manual testing" multiple times. The synthesis plan should include a single "mobile QA pass" slice with concrete devices/widths to test rather than scattering "needs manual testing" notes across slices.

**C.11 — Email template surface.**
Codex called it out; I underweighted it. The template variable syntax `{{customer_name}}` and "Add approved bookings to Google/Apple Calendar" reframing are concrete S-effort improvements. Should be sliced.

---

## D. Overstated or risky recommendations

### From Codex's audit

**D.1 — Mobile cards everywhere (request lists, waitlist rows).**

Codex recommends `mobile card layout for requests/waitlist` (M effort). I agree on the destination but the _risk_ is non-trivial: the current table relies on column visibility for status filtering, and the existing list-rendering code is in three places (overview Requests tab, Clients tab, Waitlist page). Three components to refactor with mobile-specific layouts. **This should be a deliberate slice, not bundled with other work**, and the effort estimate should be M-leaning-to-L. Don't promise it as part of the same critical-path slice.

**D.2 — Calendar mobile agenda view.**

Codex flagged this M/L and said defer if scope tight. Agree — agenda mode is a real M effort and not on the critical path. **Defer to post-beta.**

**D.3 — "De-emphasize Analytics" without specifying what changes.**

Codex's recommendation is solid in spirit but vague in execution. "De-emphasize" could mean: hide the callout card on the dashboard when request count is low, OR move Analytics out of the Tools group in the sidebar, OR rename it. Each is a different size of change. The synthesis should pick one concrete option.

**Recommendation:** for now, hide the Analytics dashboard callout when `receivedRequests < 10` and keep the sidebar item. XS effort, real signal.

**D.4 — "Approve" → "Accept request" rename**

As noted in B.2, this isn't a clear win in isolation. **Treat as needs-testing, not a settled rename.**

**D.5 — Codex's `Critical M` priority for "booking-link readiness path"**

Codex labels this Critical/M. I'd downgrade the effort if it's well-scoped: most of the pieces (welcome screen, claim-slug, booking-mode, availability, form, done, dashboard booking-link widget) already exist. The real work is wiring them with explicit "Next: do X" arrows, plus the `?just_finished=1` celebration card. That's High priority, S effort, not Critical M. The Critical effort would only be needed if we redesign onboarding which isn't the call.

### From my own audit

**D.6 — My K4 "Settings landing page + sidebar expansion"**

Already retracted in B.5. Removed.

**D.7 — My K19 "Customize link at bottom of dashboard for widget toggles"**

Lower priority than I rated; the widget toggles are accessible via Settings → Dashboard already. The only fix needed is renaming that sub-item. Drop K19 in favor of just K5 (rename).

**D.8 — My "force-on booking-link widget" (K1)**

Still a strong recommendation, but the _condition_ needs more thought than I had time for. "Force-on while requests count is zero" — what about an artist who has 1 demo request from themselves but hasn't shared yet? Two safer conditions:

- "Force-on for the first 7 days after `onboarding_completed = true`", OR
- "Force-on while the user has never copied the booking link" (would need a tiny new flag).

Simplest: force-on for the first 7 days post-onboarding. S effort.

---

## E. Strongest combined insights

Below is the merged "high-quality findings" list. Each row has the source (Claude / Codex / Both), effort, and a one-line statement.

| #   | Source | Effort | Insight                                                                                                                           |
| --- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Both   | XS     | The booking link is the spine. Every artist surface should answer "what do I do with my link right now?"                          |
| 2   | Both   | XS     | `humanStatusLabel(status)` helper; use everywhere instead of `status.replace("_", " ")`.                                          |
| 3   | Codex  | XS     | Reorder default booking-form fields: contact → idea → placement/size → references → date.                                         |
| 4   | Codex  | XS     | Public form size-label spacing bug (`Palm-sized~ 5 cm`) — visual + a11y.                                                          |
| 5   | Codex  | XS     | Honeypot field on public form needs `aria-hidden + sr-only` (verify).                                                             |
| 6   | Codex  | XS     | Remove `/start` "Replace these with real screenshots" placeholder text from production.                                           |
| 7   | Both   | XS     | Rename nav labels to tattoo-native: Bookings (top-level), Requests (sub), Books & Availability, Booking Link & Form, Guest Spots. |
| 8   | Codex  | XS     | Add helper copy under Approve / Reject / Request deposit actions: "Client gets an email", "Adds to your calendar", etc.           |
| 9   | Codex  | XS     | Rename Waitlist "Convert" action to "Create booking"; rename "Waitlist Request" status label to "Converted."                      |
| 10  | Claude | XS     | Onboarding step 1 progress label: "Profile" → "Link".                                                                             |
| 11  | Claude | XS     | Settings → Dashboard sub-item rename: "Home widgets" (resolves the name collision with top-level Dashboard).                      |
| 12  | Claude | XS     | `/bookings` → redirect directly to `/bookings/overview` (skip the `/bookings/requests` hop).                                      |
| 13  | Both   | XS     | Add a one-line "what happens next" message above the public-form submit button.                                                   |
| 14  | Both   | XS     | Add `placement` to the dashboard's pending-requests card rows (already shown on Upcoming).                                        |
| 15  | Both   | XS     | "Preview public page" links from Profile, Travel, and Booking-Form-admin pages.                                                   |
| 16  | Codex  | XS     | Fixed-slots empty-state warning ("Add at least one slot before sharing your booking link").                                       |
| 17  | Both   | XS     | Replace generic-SaaS verbs ("Manage" / "Configure") with "Edit" / "Set up" / "Tweak."                                             |
| 18  | Codex  | S      | Closed-books reason-specific copy: manual vs window-expired vs cap-reached vs no-slots-posted.                                    |
| 19  | Codex  | S      | Email-template variable insertion helpers (replace bare `{{customer_name}}` syntax).                                              |
| 20  | Both   | S      | Force-on `BookingLinkWidget` for the first 7 days post-onboarding.                                                                |
| 21  | Claude | S      | Disallow hiding the Pending-Requests + Books-Status widgets entirely.                                                             |
| 22  | Both   | S      | `?just_finished=1` post-onboarding celebration card on dashboard.                                                                 |
| 23  | Both   | S      | Mobile section grouping on public form (2-3 `<section>` headers: Your tattoo / When / About you).                                 |
| 24  | Codex  | S      | Mobile-friendly request rows on `/bookings/overview` (decision-friendly cards instead of column-hiding tables).                   |
| 25  | Both   | S      | Cross-link Waitlist ↔ Travel: waitlist city demand → "plan a guest spot"; trip editor → "see waitlist demand for this city".      |
| 26  | Claude | S      | `/settings` should be a landing page listing the 5 categories, not a redirect to Profile.                                         |
| 27  | Codex  | S      | Inspect/clarify `StatusActions` — confirmation prompts on destructive actions, deposit explanation.                               |
| 28  | Both   | M      | Mobile real-device QA pass — request detail, public form, calendar, modals.                                                       |
| 29  | Codex  | M      | One-form quick-add for single-trip in `TripManager` (hide Trip→Leg→Studio nesting when not needed).                               |
| 30  | Codex  | M      | Sticky-footer submit on the public booking form when mobile detected.                                                             |

Items deliberately downgraded or deferred:

- Calendar mobile agenda — M/L, defer post-beta.
- Design-system consolidation — L, defer (founder is already on top of this with the existing pattern library; we don't gain enough early).
- Flash IA changes (moving Flash out of top-level) — needs founder input; defer.
- Analytics IA changes — XS hide-callout is enough for now; defer larger moves.
- `legal_acceptances` table or any signup acceptance recording — explicitly out of scope (resolved by counsel earlier this session).

---

## F. Revised priority list

Reorganized from the merged-insights table, applying real priority labels.

### Critical (ship in the first slice, all XS)

1. Reorder public-form default field order (contact → idea → placement → size → references → date). [#3]
2. Add "what happens next" sentence above the public-form submit button. [#13]
3. Fix the size-label spacing bug on the public form (`Palm-sized~ 5 cm`). [#4]
4. Verify and fix the honeypot field's a11y attributes. [#5]
5. Remove the `/start` placeholder text. [#6]
6. `humanStatusLabel(status)` helper, applied everywhere. [#2]
7. Add `placement` to dashboard pending-requests card rows. [#14]
8. `/bookings` redirect → `/bookings/overview` directly. [#12]
9. Onboarding step 1 label rename "Profile" → "Link." [#10]
10. Settings → Dashboard sub-item rename "Home widgets." [#11]

### High (next slice)

11. Action-explainer helpers under Approve / Reject / Request deposit. [#8]
12. Waitlist "Convert" → "Create booking" + status label "Converted." [#9]
13. Closed-books reason-specific copy. [#18]
14. Fixed-slots no-slot warning. [#16]
15. "Preview public page" links from Profile / Travel / Booking-Form-admin. [#15]
16. Nav-label rename pass (Booking Overview → Requests/Bookings, Booking Settings → Books & Availability or Availability & Slots, Booking Form → Booking Link & Form, Travel → Guest Spots). [#7]
17. Force-on `BookingLinkWidget` for first 7 days post-onboarding. [#20]
18. `?just_finished=1` celebration card. [#22]
19. `/settings` landing page. [#26]

### Medium (after the high slice)

20. Cross-link Waitlist ↔ Travel. [#25]
21. Email-template insertion helpers (or even just clearer placeholder labels). [#19]
22. Mobile sectioning on public booking form. [#23]
23. `StatusActions` audit + confirmation prompts. [#27]
24. Generic-SaaS verb sweep. [#17]
25. Disallow hiding required widgets in Settings → Home widgets. [#21]

### Lower / deferred (post-beta or needs founder input)

26. Mobile-friendly request rows (cards instead of tables). [#24]
27. Mobile QA pass — single dedicated slice. [#28]
28. Trip quick-add single-form. [#29]
29. Sticky-footer submit on mobile public form. [#30]
30. Hide Analytics callout when `receivedRequests < 10` (XS, but lower urgency than the above).

---

## G. What Claude Code should implement first

**One slice. Tight scope. All XS.** The Critical list above should ship together as **Slice U1 — Microcopy + flow-clarity quick wins**.

This slice is deliberately the smallest possible piece of UX work that meaningfully improves the product:

| Item                                                | File(s)                                                                                                                             | Change                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Reorder public-form default field order          | `src/lib/form-settings.ts` (`buildDefaultFieldOrder`) + verify `/bert-grimm` rendering                                              | Move references/links after description; date stays last                                                                                                                             |
| 2. Add "what happens next" line above submit        | `src/app/[slug]/booking-form.tsx`                                                                                                   | Single `<p className="text-center text-xs text-muted-foreground">` above the submit button: "You'll get a confirmation email with a link to edit or cancel before {artist} replies." |
| 3. Fix size-label spacing bug                       | `src/app/[slug]/booking-form.tsx` (`SIZE_LABELS` rendering)                                                                         | Add a space between `label` and `hint`, or wrap with `<span>` and `gap-1` flex                                                                                                       |
| 4. Verify honeypot a11y                             | `src/app/[slug]/booking-form.tsx`                                                                                                   | Confirm `tabIndex={-1}` + `aria-hidden="true"` + `className="sr-only"` are all present on the honeypot input                                                                         |
| 5. Remove `/start` placeholder text                 | `src/app/start/page.tsx:254`                                                                                                        | Delete the "↑ Replace these with real screenshots once available." line                                                                                                              |
| 6. `humanStatusLabel` helper                        | New `src/lib/status-labels.ts` (or extend `src/lib/format.ts`) + replace `status.replace("_", " ")` in `bookings/overview/page.tsx` | One helper, two-line replacements                                                                                                                                                    |
| 7. Add placement to dashboard pending-requests rows | `src/app/(artist)/dashboard/page.tsx` (pending requests card)                                                                       | Show `form_data.placement` next to `@handle`, matching Upcoming card                                                                                                                 |
| 8. `/bookings` direct redirect                      | `src/app/(artist)/bookings/page.tsx`                                                                                                | Change destination from `/bookings/requests` to `/bookings/overview`                                                                                                                 |
| 9. Onboarding step 1 label                          | `src/components/onboarding-progress.tsx`                                                                                            | `STEPS[0]` from `"Profile"` to `"Link"`                                                                                                                                              |
| 10. Settings → Dashboard sub-item label             | `src/components/app-shell/nav-config.ts`                                                                                            | Settings group, "Dashboard" sub-item label → `"Home widgets"` (route stays `/settings/dashboard`)                                                                                    |

**Total effort:** under a day. **No new components. No new database schema. No layout changes.**

**Acceptance criteria for the slice:**

- `pnpm typecheck` + `pnpm lint` clean.
- `/bert-grimm` renders form in the new field order with the new "what happens next" line above submit.
- Size labels render with proper spacing.
- `/start` no longer shows the placeholder line.
- Bookings overview empty state shows "No requests awaiting deposit" (not "No deposit_pending requests").
- Dashboard pending-requests card rows show placement under each handle.
- `/bookings` redirects directly to `/bookings/overview`.
- Onboarding progress bar shows "Step 1 of 5 — Link" instead of "Profile."
- Sidebar Settings sub-item reads "Home widgets" (route still works as `/settings/dashboard`).

**Manual QA checklist for the slice:**

- Open `/bert-grimm` on a mobile-width browser. Confirm field order and confirm new helper line is visible above the submit button.
- Open `/start`. Confirm no placeholder text is visible.
- Open `/dashboard`. Confirm pending-requests card shows placement under each handle (when any exist).
- Go through `/onboarding/welcome` → `claim-slug`. Progress bar should say "Link" on step 1.
- Click sidebar Settings → "Home widgets" (formerly "Dashboard"). Should land on `/settings/dashboard`.
- Click sidebar "Bookings". Should land directly on `/bookings/overview` (network trace shows one redirect, not two).
- Status badge tooltip / empty-state text for any `deposit_pending` filter should read in human language.

**Things NOT to change in Slice U1:**

- Nav-label rename pass — that's a separate slice (Slice U2) because it touches the sidebar config + every page heading + every internal link copy, and needs a deliberate find/replace.
- Approve/Reject/Deposit action labels and helpers — separate slice (Slice U3) because it requires inspecting `StatusActions`.
- Force-on `BookingLinkWidget`, `?just_finished=1` celebration — separate slice (Slice U4) because they touch dashboard state logic.
- Public booking form mobile section grouping — separate slice (Slice U5).

This first slice is **microcopy + small flow polish only**. Nothing structural. That's deliberate — it builds confidence that the audit-merge process produces low-risk shippable improvements, before we get to the medium-effort items.

---

## Closing notes for the synthesis step

Two audits, independently written, converged on:

1. The booking-link spine.
2. Tattoo-native renaming.
3. Action explanation copy.
4. Mobile-first risks on dense surfaces.
5. Connect the Waitlist ↔ Travel signals.
6. Empty-state consistency.

Where Codex was sharper: live-snapshot bugs (size spacing, honeypot, field order), the `/start` placeholder leak, action-label warmth proposals.

Where I was sharper: dashboard-name collision, onboarding label drift, the booking-link widget gating, the status-label code leak, redirect-topology precision.

Both audits agree on what NOT to do: no broad refactors, no design-system reset, no premature Studio features, no schema changes, no killing the existing FeatureIntroModal pattern.

The merged priority list is conservative on purpose. **Slice U1 is the right first move** — small enough to ship in an afternoon and verify on `/bert-grimm`, big enough to make the product visibly tighter to first-time and daily users alike.
