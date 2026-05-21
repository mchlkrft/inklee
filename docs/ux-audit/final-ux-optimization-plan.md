# Inklee Final UX Optimization Plan

**Date:** 2026-05-20
**Inputs synthesized:**

- `docs/ux-audit/claude-independent-ux-audit.md` (Claude, Phase 1)
- `docs/ux-audit/codex-independent-ux-audit.md` (Codex, Phase 1)
- `docs/ux-audit/claude-response-to-other-agent.md` (Claude, Phase 2)
- `docs/ux-audit/codex-response-to-other-agent.md` (Codex, Phase 2)

**Status:** Phase 3 — final implementation plan for Claude Code.
**Slice 1 scope (founder decision):** microcopy + small-flow quick wins (option A from the response analysis), not the bigger nav-rename + widget-logic slice. Sequencing is U1 → U2 → U3 → U4 → U5.
**Plan rules (locked in):**

- Preserve existing working functionality.
- No broad refactors. No new database schema.
- No new placeholder features.
- Avoid touching unrelated areas inside any slice.
- Every slice has a manual QA checklist. Uncertain items are marked **needs manual testing**.
- Every slice must run `pnpm typecheck` + `pnpm lint` clean and produce a single focused commit.

---

## A. Final UX strategy

**One sentence:** _Make every artist surface answer "what do I do with my booking link right now?" — and let the existing legal/feature/deposit work the team already shipped finally surface as one product instead of as parallel modules._

The two audits converged independently on the same diagnosis: Inklee has the right modules; the connective tissue is weak. The fix is _not_ a redesign. It is a sequence of small, focused passes that:

1. Replace raw-status leakage and generic-SaaS language with tattoo-native copy.
2. Rename a small set of high-traffic labels so the IA finally describes itself.
3. Make the booking link unmissable for first-time and zero-request artists.
4. Tell the daily artist exactly what each request action does (Accept / Pass / Request deposit / Mark deposit received).
5. Connect Waitlist and Travel as the demand-and-travel workflow they already are in the data model.
6. Address the highest-risk mobile surfaces — request lists and request detail, not chrome.

This plan ships those moves in five slices, each under a day's work, in sequence, with clear hand-back points.

---

## B. Product flow target

The product already supports this loop in the data layer. The goal is to make it visible.

```
1. Setup (onboarding)
   claim slug → choose booking mode → set books open + window
   → pick form fields → done → land on dashboard

2. Share
   booking link visible on dashboard + on /bookings/booking-form
   "preview public page" reachable from every settings surface
   that affects the public page

3. Public form (client side)
   contact → tattoo idea → placement → size → references → date
   short "what happens next" line above submit
   honest closed-books copy by reason (manual / window expired /
   cap reached / fixed-slots not posted)
   collapsed Section 8 legal notice (already shipped)

4. Request review (artist side)
   request lands in /bookings/overview (renamed Requests/Bookings)
   detail page summarises idea → logistics → client → history
   actions: Accept (or Approve) / Pass (or Reject) / Request deposit
   / Mark deposit received — each with one-line "what happens next"

5. Booking organisation
   accepted requests visible in /bookings/calendar
   approved bookings show placement + handle + date
   waitlist appears when books are closed or cap is reached

6. Demand + travel
   waitlist surfaces city demand (existing)
   travel/guest-spots reflect that demand and feed back into
   tagged requests
   each surface links to the other ("plan a guest spot here";
   "see waitlist demand for this city")

7. Settings (only the active 5)
   profile / emails / calendar / home widgets / account
   everything else lives under its owning section
   (Books & Availability under Bookings, etc.)
```

This is what the existing code already implements with a few seams missing. The plan closes those seams.

---

## C. Feature grouping recommendation

The mental groups artists should see (not new menus — just the way labels and links describe themselves):

| Mental group            | Surfaces                                | Existing routes                                                                                                                                                     |
| ----------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daily work**          | The artist's inbox + decision loop.     | `/dashboard`, `/bookings/overview`, `/bookings/requests/[id]`, `/bookings/calendar`, `/notifications`                                                               |
| **Booking link setup**  | Everything that shapes the public page. | `/bookings/booking-form` (share + fields + appearance), `/bookings/settings` (books open + slots + window), `/settings/profile` (display name + bio + logo + cover) |
| **Demand + travel**     | The "what's coming" workflow.           | `/bookings/waitlist`, `/travel`                                                                                                                                     |
| **Optional / advanced** | Powerful but secondary for new users.   | `/flash/*`, `/analytics`                                                                                                                                            |
| **Account settings**    | Plumbing.                               | `/settings/emails`, `/settings/calendar`, `/settings/dashboard` (renamed "Home widgets"), `/settings/account`                                                       |
| **Public legal**        | Compliance footer.                      | `/imprint`, `/terms`, `/dpa`, `/acceptable-use`, `/privacy`, `/cookies`, `/subprocessors`, `/legal/report`                                                          |

No new top-level nav items. No moves. Just clearer labels in the slices below.

---

## D. Priority fixes (master list, ordered)

| #   | Slice          | Priority | Effort | Files / components                                                                                                                                                             | Problem                                                                                                                                                                                                                                                 | Recommended fix                                                                                                                                                                                                                                                                                                                                                                                             | Expected benefit                                                          | Risk                                                                                                                        | Needs manual QA                                                                                                                                  |
| --- | -------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | U1             | Critical | XS     | `src/lib/format.ts` (or new `src/lib/status-labels.ts`) + `src/app/(artist)/bookings/overview/page.tsx` and every other consumer of `status.replace("_", " ")`                 | Raw DB status leaks (`No deposit_pending requests`).                                                                                                                                                                                                    | Create `humanStatusLabel(status)`; replace `status.replace("_", " ")` everywhere.                                                                                                                                                                                                                                                                                                                           | Less ugly copy; better trust.                                             | None.                                                                                                                       | Yes — grep after change to confirm no raw replace pattern remains.                                                                               |
| D2  | U1             | Critical | XS     | `src/app/start/page.tsx:254`                                                                                                                                                   | "↑ Replace these with real screenshots once available." is visible on the public marketing page.                                                                                                                                                        | Delete that line + any sibling placeholder copy.                                                                                                                                                                                                                                                                                                                                                            | Public trust during beta.                                                 | None.                                                                                                                       | Yes — eyeball `/start` after deploy.                                                                                                             |
| D3  | U1             | Critical | XS     | `src/app/[slug]/booking-form.tsx` (`SIZE_LABELS` rendering)                                                                                                                    | `Palm-sized~ 5 cm` and `Larger20 cm+` render without a space between label and hint.                                                                                                                                                                    | Either add a space in the rendered string or split into two elements with `gap-1`.                                                                                                                                                                                                                                                                                                                          | Visual + accessible-text fix.                                             | None — only adds whitespace.                                                                                                | Yes — open `/bert-grimm` on a real phone and screen-reader.                                                                                      |
| D4  | U1             | Critical | XS     | `src/app/[slug]/booking-form.tsx` (honeypot input) + `src/lib/honeypot.ts`                                                                                                     | The honeypot may render visibly in some browsers' DOM tree to assistive tech if `sr-only` + `aria-hidden` + `tabIndex={-1}` aren't all present. Codex flagged seeing an unlabeled extra textbox in the live DOM snapshot near the preferred-date input. | Verify all three attributes on the public booking honeypot; fix if missing.                                                                                                                                                                                                                                                                                                                                 | A11y compliance + no visible-mystery-field.                               | None.                                                                                                                       | Yes — inspect DOM; run an axe-style audit on `/bert-grimm`.                                                                                      |
| D5  | U1             | Critical | XS     | `src/lib/form-settings.ts` (`buildDefaultFieldOrder`) + verify on `/bert-grimm` and on a fresh-account onboarding `/onboarding/form`                                           | Default field order on the public form puts Reference Link before tattoo description. Cognitive flow should be: contact → idea → placement → size → references → date.                                                                                  | Reorder the default array so description sits immediately after contact, before placement/size; references after size; date last. Existing per-artist `field_order` overrides are respected, so this only affects fresh accounts.                                                                                                                                                                           | More complete client submissions.                                         | Low — existing accounts unaffected.                                                                                         | Yes — create a fresh test account and walk the onboarding to confirm new default.                                                                |
| D6  | U1             | Critical | XS     | `src/app/[slug]/booking-form.tsx`                                                                                                                                              | No visible "what happens next" line above the submit button (the Section 8 notice is now collapsed).                                                                                                                                                    | Add a single muted-foreground text-xs paragraph directly above the submit button: _"You'll get a confirmation email with a link to edit or cancel before {artistFirstName} replies."_                                                                                                                                                                                                                       | Higher trust at the decision moment.                                      | None.                                                                                                                       | Yes — confirm wording renders on `/bert-grimm` for fresh visitor (no prior submission).                                                          |
| D7  | U1             | Critical | XS     | `src/app/(artist)/dashboard/page.tsx` (pending-requests card row template)                                                                                                     | Pending-requests card shows only `@handle`. The Upcoming card already shows placement.                                                                                                                                                                  | Mirror the Upcoming card pattern: show `form_data.placement` (truncated) under each handle.                                                                                                                                                                                                                                                                                                                 | Faster glance triage.                                                     | None.                                                                                                                       | Yes — confirm on accounts with and without `form_data.placement` set.                                                                            |
| D8  | U1             | Critical | XS     | `src/app/(artist)/bookings/page.tsx`                                                                                                                                           | Double-hop redirect (`/bookings` → `/bookings/requests` → `/bookings/overview`).                                                                                                                                                                        | Redirect `/bookings` directly to `/bookings/overview`. Keep `/bookings/requests` as-is for inbound bookmarks.                                                                                                                                                                                                                                                                                               | Cleaner network trace; tidier IA.                                         | None.                                                                                                                       | No — typecheck/lint only.                                                                                                                        |
| D9  | U1             | Critical | XS     | `src/components/onboarding-progress.tsx` (`STEPS[0]`)                                                                                                                          | Onboarding step 1 progress label is "Profile" but the actual page is "claim a slug."                                                                                                                                                                    | Change `STEPS[0]` from `"Profile"` to `"Link"`.                                                                                                                                                                                                                                                                                                                                                             | Removes a small but real conceptual confusion at the first step.          | None — label-only change.                                                                                                   | Yes — walk `/onboarding/welcome → /onboarding/claim-slug` and confirm progress bar reads "Step 1 of 5 — Link."                                   |
| D10 | U1             | Critical | XS     | `src/components/app-shell/nav-config.ts` (Settings group → "Dashboard" sub-item label)                                                                                         | Sidebar Settings sub-item "Dashboard" collides with top-level "Dashboard."                                                                                                                                                                              | Rename the sub-item label to "Home widgets." Route stays `/settings/dashboard`.                                                                                                                                                                                                                                                                                                                             | Eliminates the name collision.                                            | None.                                                                                                                       | Yes — confirm sidebar renders "Home widgets" under Settings; click still lands at `/settings/dashboard`.                                         |
| D11 | U2             | High     | S      | `src/components/app-shell/nav-config.ts` + `src/components/bookings-nav.tsx` + matching `<h1>`s on `bookings/overview`, `bookings/settings`, `bookings/booking-form`, `travel` | Nav labels are generic-SaaS or ambiguous.                                                                                                                                                                                                               | Renames: **Booking Overview → Bookings** (the sidebar already calls it Bookings; rename the page H1 to match); **Booking Settings → Books & Availability** (the page actually controls books open + window + cap + slots); **Booking Form → Booking Link & Form** (the page is also the share-link surface); **Travel → Guest Spots** (tattoo-native term; data model stays `trips`/`trip_legs`/`studios`). | The IA finally describes itself. Fewer "what does this page do?" moments. | Medium — touches several `<h1>` strings, `nav-config.ts`, `bookings-nav.tsx`, and `/help` FAQs that reference older labels. | Yes — click every renamed surface; spot-check `/help`.                                                                                           |
| D12 | U2             | High     | S      | `src/app/(artist)/dashboard/page.tsx` (force-on logic)                                                                                                                         | Booking-link widget is gated by `widgets.booking_link` in `parseDashboardWidgets`. Zero-request artists may not see the link.                                                                                                                           | When `total_received_requests === 0` OR `(profile.created_at within 7 days)`, force the `BookingLinkWidget` to render regardless of the toggle. Once the artist has a request, respect the toggle again.                                                                                                                                                                                                    | Higher first-share rate.                                                  | Low — single conditional, no behaviour change for established artists.                                                      | Yes — create a fresh account with zero requests and confirm widget appears; toggle it off in `/settings/dashboard` and confirm it stays visible. |
| D13 | U2             | High     | S      | `src/app/(artist)/dashboard/page.tsx`                                                                                                                                          | No setup card for the post-onboarding zero-request artist beyond removing the "Finish setting up" banner.                                                                                                                                               | Render a single one-time "Your booking link is live" card when `onboarding_completed === true` AND `total_received_requests === 0`. The card has: short message ("Your link is at inklee.app/{slug}"), Copy button, Preview button, "Add to Instagram bio" helper link. Replace the brittle `?just_finished=1` approach (Codex's call).                                                                     | Strong sense of completion + drives first share.                          | Low — purely additive.                                                                                                      | Yes — fresh account, complete onboarding, confirm card renders; receive a test request and confirm card disappears.                              |
| D14 | U3             | High     | S      | `src/app/(artist)/bookings/requests/[id]/status-actions.tsx`                                                                                                                   | Approve / Reject / Request deposit / Mark deposit received do not explain consequences at the action moment.                                                                                                                                            | Add a one-line helper below each action button: **Accept**: "Sends the client an approval email and adds this to your bookings." **Pass**: "Sends the client a polite decline; you can still message them in the sidebar." **Request deposit**: "Sends the client a payment link via email. Booking is confirmed once paid." **Mark deposit received**: "Marks this as paid and adds to your bookings."     | Confident artist decisions.                                               | Low — text-only, no logic change.                                                                                           | Yes — open a real test request and confirm helpers render under each button; verify the action still works.                                      |
| D15 | U3             | High     | XS     | Same file                                                                                                                                                                      | Action labels "Approve" / "Reject" are accurate but cool.                                                                                                                                                                                               | Rename **"Approve" → "Accept"** and **"Reject" → "Pass"**. Status badges still read `approved` / `rejected` internally; humanStatusLabel maps them to "Accepted" / "Passed" for display.                                                                                                                                                                                                                    | Tattoo-native voice.                                                      | Low — label-only. Needs status-badge consistency check.                                                                     | Yes — see D1 helper; confirm overview list badge reads "Accepted"/"Passed" via humanStatusLabel.                                                 |
| D16 | U3             | High     | S      | `src/app/(artist)/bookings/requests/[id]/status-actions.tsx` + relevant action server actions                                                                                  | Destructive actions (Pass / Cancel) may not have a confirm step.                                                                                                                                                                                        | Add a lightweight inline confirm pattern (two-tap: button → "Are you sure? Tap again to confirm" with a 4-second cancel window). Or a small `confirm()` modal. **Needs manual testing** of current behaviour before deciding which pattern to use.                                                                                                                                                          | Prevents accidental rejections.                                           | Low if inline; Medium if a modal is needed.                                                                                 | Yes — current behaviour first; then ship the confirm pattern; verify it doesn't fight keyboard nav.                                              |
| D17 | U4             | High     | XS     | `src/app/(artist)/bookings/waitlist/page.tsx` empty state + `src/components/status-badge.tsx`                                                                                  | Waitlist "Convert" action wording + the `Waitlist Request` status label are confusing.                                                                                                                                                                  | Rename action **"Convert" → "Move to booking"** (or "Create booking from waitlist"). Rename the status label `Waitlist Request` (used for converted entries) → `Converted`.                                                                                                                                                                                                                                 | Less mystery on what an action does.                                      | Low — needs grep to find all status-badge consumers.                                                                        | Yes — convert a test waitlist entry; confirm the new label appears on overview list + detail page.                                               |
| D18 | U4             | High     | XS     | `src/app/(artist)/bookings/waitlist/page.tsx` empty CTA + `src/app/(artist)/travel/page.tsx`                                                                                   | Waitlist and Travel don't cross-link, but the data tells one story: city demand → guest spot planning.                                                                                                                                                  | Add a small "See waitlist demand for this city" link in the trip editor (`TripManager`). Add a "Plan a guest spot for this demand" link in the waitlist city-demand card.                                                                                                                                                                                                                                   | Connects two adjacent features.                                           | Low — both surfaces already exist; this is two `<Link>` additions.                                                          | Yes — confirm both directions of the cross-link work and that the trip editor's link doesn't appear when waitlist is empty.                      |
| D19 | U4             | High     | S      | `src/app/[slug]/page.tsx` + `src/app/[slug]/books-closed-block.tsx`                                                                                                            | `BooksClosedBlock` shows the same message regardless of _why_ books are closed.                                                                                                                                                                         | Make the closed-state copy reason-specific: **manual close** → artist's custom message; **window expired** → "Books were open until {date} and are now closed"; **cap reached** → "{artist} is fully booked for now"; **fixed-slots-no-slots-posted** → "{artist} hasn't posted slots yet — check back soon." All four still expose the existing `WaitlistForm`.                                            | Honest, less generic copy for closed clients.                             | Low — branch logic uses existing data fields.                                                                               | Yes — manually toggle each reason and verify the right copy appears; test that WaitlistForm still works in all four.                             |
| D20 | U4             | High     | XS     | `src/app/(artist)/bookings/booking-form/page.tsx` (share section)                                                                                                              | If the artist chose `fixed_slots` mode but added no slots, sharing the link results in a closed-books page. Codex flagged this as the worst first-share failure mode.                                                                                   | If `bookingMode === "fixed_slots"` and slot count is 0, show a warning banner on the share section: "⚠️ Your booking link will appear closed until you post slots. Add slots in Books & Availability first."                                                                                                                                                                                                | Prevents a bad first-share moment.                                        | Low — additive warning, no behaviour change.                                                                                | Yes — create a test fixed-slots account with 0 slots, confirm warning appears; add a slot, confirm warning disappears.                           |
| D21 | U4             | High     | XS     | `/bookings/booking-form` + `/settings/profile` + `/travel`                                                                                                                     | These three pages each affect the public page, but only `/bookings/booking-form` has a visible "preview" affordance.                                                                                                                                    | Add a "Preview public page →" link near the H1 of `/settings/profile` and `/travel` (when at least one trip is visible-on-form).                                                                                                                                                                                                                                                                            | Reduces "did this work?" anxiety after edits.                             | Low — single link per page.                                                                                                 | Yes — click each; confirm the link opens the right `/[slug]` in a new tab.                                                                       |
| D22 | U5             | Medium   | M      | `src/app/(artist)/bookings/overview/page.tsx` (Requests table → cards on mobile) + `src/app/(artist)/bookings/waitlist/page.tsx` (rows → cards)                                | On mobile, the request table hides columns instead of becoming a decision-friendly card list. Same for waitlist rows.                                                                                                                                   | Add a `md:hidden` card layout that surfaces: `@handle` + `placement` + `size`/`date` + `status badge` + `relativeTime`. Keep the `hidden md:table` version for desktop.                                                                                                                                                                                                                                     | Phone-friendly daily workflow.                                            | Medium — two surfaces; new component shape but no logic.                                                                    | Yes — open `/bookings/overview` and `/bookings/waitlist` on a real iPhone 14 + Android 375px; confirm rows readable and tappable.                |
| D23 | U5             | Medium   | M      | `src/app/(artist)/bookings/requests/[id]/page.tsx` + `status-actions.tsx`                                                                                                      | Request-detail page on mobile may push StatusActions below dense detail.                                                                                                                                                                                | On mobile (`md:hidden`), render a compact sticky-bottom action bar with Accept / Pass / Request deposit shortcuts. Tap → expands to the full action UI. Keep the desktop two-column layout.                                                                                                                                                                                                                 | Faster mobile decisions.                                                  | Medium — sticky bar competes with browser chrome / safe-area.                                                               | Yes — real-device test multiple actions; verify safe-area + keyboard interactions.                                                               |
| D24 | U6             | Medium   | XS     | Several `<h1>`/`<h2>`/`<p>` strings across `/dashboard`, `/bookings/*`, `/travel`, `/settings/*`                                                                               | Generic-SaaS verbs ("Manage", "Configure") show up in helper text.                                                                                                                                                                                      | Targeted sweep, NOT a blind find/replace: change them to "Edit" / "Set up" / "Tweak" on user-facing pages. Skip third-party labels (Stripe, Google), error logs, and `/help` until D11's rename pass closes.                                                                                                                                                                                                | Tattoo-native voice consistency.                                          | Low — but **must be a manual diff review**, not regex replace.                                                              | Yes — diff scan + spot-check on each touched page.                                                                                               |
| D25 | Defer          | Medium   | M      | `src/app/(artist)/bookings/calendar/calendar-view.tsx`                                                                                                                         | Calendar month-grid likely cramped on mobile.                                                                                                                                                                                                           | Add a mobile agenda/list mode behind a small "Agenda / Month" toggle.                                                                                                                                                                                                                                                                                                                                       | Better phone calendar UX.                                                 | Medium — calendar logic is denser than the rest.                                                                            | Yes — and a real-device test for week boundaries / DST edges.                                                                                    |
| D26 | Defer          | Medium   | S/M    | `src/app/(artist)/settings/emails/*`                                                                                                                                           | Template variable syntax `{{customer_name}}` is technical.                                                                                                                                                                                              | Add an "Insert" button next to each template textarea with a small dropdown of available variables (rendered as `{Client name}` style chips). Keep the underlying `{{customer_name}}` syntax.                                                                                                                                                                                                               | Non-technical artists can edit templates.                                 | Medium — small UI but real interaction.                                                                                     | Yes.                                                                                                                                             |
| D27 | Don't ship yet | n/a      | M      | `src/app/(artist)/travel/trip-manager.tsx`                                                                                                                                     | Trip→Leg→Studio nesting is heavier than artists need for a single-leg guest spot.                                                                                                                                                                       | Single-form quick-add for the one-leg case.                                                                                                                                                                                                                                                                                                                                                                 | Reduces cognitive overhead.                                               | Medium — UI restructure.                                                                                                    | First ship D18 + D21; then re-evaluate whether quick-add is necessary.                                                                           |
| D28 | Don't ship yet | n/a      | XS     | `/dashboard/{calendar,clients,waitlist,requests}` redirect stubs                                                                                                               | Legacy redirect files.                                                                                                                                                                                                                                  | Delete after confirming no bookmarks.                                                                                                                                                                                                                                                                                                                                                                       | Code tidiness only — not UX.                                              | Founder call; do at any time.                                                                                               |

The first 21 items (D1–D21) are the active work in U1–U4. D22–D24 are U5/U6. D25–D27 are deferred. D28 is housekeeping.

---

## E. Copy and naming improvements (consolidated)

### Navigation labels

| Where                                                  | Current            | New                                                           | Slice    |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------------- | -------- |
| Sidebar "Settings → Dashboard" sub-item                | `Dashboard`        | `Home widgets`                                                | U1 (D10) |
| Sidebar "Bookings" sub-nav: `Booking Overview` page H1 | `Booking Overview` | `Bookings` (page H1) — the sidebar item is already "Bookings" | U2 (D11) |
| Sidebar "Bookings" sub-nav: `Booking Settings`         | `Booking Settings` | `Books & Availability`                                        | U2 (D11) |
| Sidebar "Bookings" sub-nav: `Booking Form`             | `Booking Form`     | `Booking Link & Form`                                         | U2 (D11) |
| Top-level sidebar: `Travel`                            | `Travel`           | `Guest Spots`                                                 | U2 (D11) |

### Onboarding

| Where                                                                  | Current   | New                                                                                                                                | Slice                    |
| ---------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `OnboardingProgress` STEPS[0]                                          | `Profile` | `Link`                                                                                                                             | U1 (D9)                  |
| `/onboarding/booking` mode picker copy (helper under "Preferred date") | existing  | Add: "Choose this if you want to review ideas first and propose a date together."                                                  | U2 (extends D11 wording) |
| `/onboarding/booking` (helper under "Fixed slots")                     | existing  | Add: "Choose this if you want clients to pick from exact times you publish. You'll need to post at least one slot before sharing." | U2                       |

### Dashboard

| Where                             | Current                                        | New                                                                                                                                                                        | Slice                    |
| --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Pending-requests card rows        | `@{handle}` only                               | `@{handle}` + truncated `form_data.placement` (matches Upcoming card)                                                                                                      | U1 (D7)                  |
| All-widgets-hidden fallback       | `All widgets are hidden. Configure dashboard.` | `Show some widgets again →` (link target unchanged)                                                                                                                        | U2 (extends D13 wording) |
| New zero-request setup card (new) | n/a                                            | Title: `Your booking link is live`. Body: `Share it in your Instagram bio. Most artists get their first request within a week of sharing.` Buttons: Copy / Preview / Help. | U2 (D13)                 |

### Public booking form

| Where                    | Current                                                                                 | New                                                                                               | Slice    |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Above submit button      | (nothing)                                                                               | `You'll get a confirmation email with a link to edit or cancel before {artistFirstName} replies.` | U1 (D6)  |
| Size labels              | `Palm-sized~ 5 cm` (no space)                                                           | `Palm-sized · ~5 cm` (or proper flex gap)                                                         | U1 (D3)  |
| Default field order      | Instagram → email → reference link → placement → size → description → references → date | Instagram → email → description → placement → size → references (link + images) → date            | U1 (D5)  |
| Books-closed reason copy | Single generic message                                                                  | Reason-specific per cause                                                                         | U4 (D19) |

### Request actions

| Where                       | Current   | New                                                                          | Slice    |
| --------------------------- | --------- | ---------------------------------------------------------------------------- | -------- |
| Approve button              | `Approve` | `Accept`                                                                     | U3 (D15) |
| Reject button               | `Reject`  | `Pass`                                                                       | U3 (D15) |
| Below Accept                | (nothing) | `Sends the client an approval email and adds this to your bookings.`         | U3 (D14) |
| Below Pass                  | (nothing) | `Sends the client a polite decline; you can still message them.`             | U3 (D14) |
| Below Request deposit       | (nothing) | `Sends the client a payment link via email. Booking is confirmed once paid.` | U3 (D14) |
| Below Mark deposit received | (nothing) | `Marks this as paid and adds to your bookings.`                              | U3 (D14) |

### Waitlist

| Where                            | Current                               | New                                    | Slice    |
| -------------------------------- | ------------------------------------- | -------------------------------------- | -------- |
| Convert action button            | `Convert`                             | `Move to booking`                      | U4 (D17) |
| Status badge (converted entries) | `Waitlist Request`                    | `Converted`                            | U4 (D17) |
| Empty state CTA                  | links to `/bookings/books` (redirect) | links directly to `/bookings/settings` | U4 (D17) |

### Status labels (humanStatusLabel)

| Status               | Display label      |
| -------------------- | ------------------ |
| `pending`            | `Pending`          |
| `approved`           | `Accepted`         |
| `rejected`           | `Passed`           |
| `deposit_pending`    | `Awaiting deposit` |
| `cancelled`          | `Cancelled`        |
| Waitlist `waiting`   | `Waiting`          |
| Waitlist `converted` | `Converted`        |

Used in: dashboard cards, overview list, request detail, waitlist list, empty-state interpolation.

### Marketing

| Where             | Current                                                 | New               | Slice   |
| ----------------- | ------------------------------------------------------- | ----------------- | ------- |
| `/start` line 254 | `↑ Replace these with real screenshots once available.` | (delete the line) | U1 (D2) |

---

## F. Mobile UX improvements

### In U1

- D3 (size label spacing) — affects mobile readability directly.
- D6 ("what happens next" line) — sits above submit, visible on small screens.

### In U2

- D11 nav-label rename improves mobile bottom-nav clarity (Bookings, Guest Spots labels become cleaner).

### In U5 (dedicated mobile pass)

- D22 — `/bookings/overview` + `/bookings/waitlist` mobile card layouts.
- D23 — `/bookings/requests/[id]` mobile sticky action bar.
- **Single dedicated mobile QA pass** — real-device test of all redesigned surfaces + the public form, on iPhone 14 + Android 375px. **Needs manual testing.**

### Deferred

- D25 — calendar agenda view (M effort, post-beta).
- Sticky-footer submit on the public form — deliberately not in U5 because of safe-area / keyboard / legal-text interactions Codex flagged. Re-evaluate after U5 ships.

---

## G. Public booking form improvements

### In U1 (D2–D6)

- D2: `/start` placeholder removal (adjacent, but public).
- D3: size-label spacing bug.
- D4: honeypot a11y verification.
- D5: default field order reorder.
- D6: pre-submit "what happens next" line.

### In U4 (D19, D20)

- D19: closed-books reason-specific copy.
- D20: fixed-slots no-slot warning in the share section.

### Honored constraints

- Section 8 legal notice stays collapsed behind the existing Learn more toggle (founder decision 2026-05-20). Do not re-expose.
- The honeypot field name (`inklee_hp_check`) and its `isHoneypotTriggered()` logic stay unchanged. Only verify rendering attributes.
- "Powered by Inklee" footer stays low-contrast and present.

### Out of scope (do not touch)

- Auto-opening annotation modal on upload — Codex flagged as potentially surprising; **needs manual testing** before deciding whether to defer the auto-open. Park as a follow-up question, not a slice item.

---

## H. Dashboard workflow improvements

### In U1

- D7: placement in pending-requests card rows.
- D1: humanStatusLabel removes raw-status leaks.

### In U2

- D12: force-on booking-link widget for zero-request artists.
- D13: zero-request setup card.

### In U3

- D14–D16: action labels + helper copy + confirm patterns on Accept/Pass/Request deposit/Mark deposit received.

### In U4

- D18: waitlist ↔ travel cross-link.
- D21: "Preview public page" links from Profile, Travel, Booking Link & Form.

### Defer

- Analytics IA changes — both audits agree on de-emphasis. Quickest move (post-U5): hide the Analytics callout on `/dashboard` when received-request count is under a threshold. **Not in any current slice; flag for follow-up.**
- Dashboard widget customisation lock-out for required widgets (`pending_requests`, `books_status`) — Codex flagged the "could surprise existing customizers" risk. Resolution: only the _new_ zero-request setup card (D13) is force-rendered; the existing widget toggles stay user-controllable. **No change to the toggle UI.**

---

## I. Onboarding and empty-state improvements

### In U1

- D9: progress label "Profile" → "Link".

### In U2

- D13: new zero-request setup card replaces the `?just_finished=1` query-param idea (Codex's safer pattern).
- Helper copy under booking-mode picker (E section).

### In U4

- D19: closed-books reason-specific copy (an empty-state for clients).

### General empty-state principle (consolidated)

- Every empty state should answer three things: what's happening, why it matters, what to do next.
- Where possible, surface a `FeatureIntroModal` (the auto-show explainer modal that already exists for 5 features). Extend it to the dashboard zero-state when D13 is implemented — share the underlying component if it makes sense, otherwise the bespoke setup card is fine.

---

## J. Things NOT to change yet

These are deliberately deferred. Listed here so the implementer doesn't get drawn into adjacent work mid-slice.

1. **Settings IA expansion / `/settings` landing page** — verified that 7 of the "hidden" settings routes are redirect stubs. The active 5 are correct as-is. Do not add sidebar items, do not build a landing page.
2. **Deleting legacy redirect stubs** (`(artist)/dashboard/*`, `/bookings/{form,public-page,requests,clients}`, `/settings/{books,slots,fields,reminders,templates,travel,calendar-export}`). Codex correctly noted these are cheap, preserve bookmarks, and not user-first. Hands off.
3. **Trip quick-add restructure (`TripManager`)** — D27 is parked. First ship D18 + D21 and re-evaluate.
4. **Calendar mobile agenda view** — D25 is M-effort and post-beta.
5. **Sticky-footer submit on the public form** — risky (safe-area, keyboard, legal copy). Don't bundle into U5.
6. **Email template variable insertion helpers (D26)** — Medium effort, real but secondary to the daily booking loop.
7. **Flash IA changes** (moving it out of top-level nav) — needs founder input; the feature-intro modal already gates new-user attention.
8. **Analytics IA / dashboard de-emphasis** — XS follow-up after U5 if needed.
9. **Design-system consolidation** — Codex correctly classed as L effort, deferred.
10. **Database schema changes** — none required. Don't add any.
11. **`legal_acceptances` table or any recorded-acceptance flow** — explicitly resolved by counsel earlier this session; remains a deliberate no-build.
12. **Public marketing page redesigns** — D2 removes the visible placeholder; otherwise out of scope.
13. **Slice 60a–60e and Slice 61 (the platform UX restructure)** — those slices, scoped in `SLICES_CONTINUATION.md`, are the larger product-shape work that lives downstream of this audit. U1–U5 here are not Slice 60. **Do not conflate.**

---

## K. Implementation slices

Five active slices. One commit per slice. Each slice is independent and shippable.

### Slice U1 — Microcopy & flow quick wins (~half a day)

**Goal:** Ship the highest-leverage XS fixes — visible improvement, near-zero risk, sets the cadence.

**Affected files:**

- `src/lib/format.ts` (or new `src/lib/status-labels.ts`)
- `src/app/(artist)/bookings/overview/page.tsx`
- `src/app/(artist)/dashboard/page.tsx`
- `src/app/(artist)/bookings/page.tsx`
- `src/app/[slug]/booking-form.tsx`
- `src/lib/form-settings.ts` (`buildDefaultFieldOrder`)
- `src/lib/honeypot.ts` (verify only)
- `src/app/start/page.tsx`
- `src/components/onboarding-progress.tsx`
- `src/components/app-shell/nav-config.ts`

**Exact UX changes:** D1, D2, D3, D4, D5, D6, D7, D8, D9, D10 (ten items, all XS).

**Things NOT to touch in U1:**

- No new components.
- No layout changes.
- No rename pass beyond D9 + D10.
- No StatusActions changes.
- No dashboard widget logic changes.
- No mobile-specific layouts.
- No legal copy changes.

**Acceptance criteria:**

- `pnpm typecheck` clean.
- `pnpm lint` clean (or 0 new errors; the 11 pre-existing `<img>`/unused-var warnings are unchanged).
- `pnpm build` succeeds.
- `humanStatusLabel(...)` exists and is used by `bookings/overview` empty-state copy (and by the dashboard pending-requests card if it renders status).
- `/start` does not contain "Replace these with real screenshots".
- `/bert-grimm` shows: size labels with proper spacing, form fields in the new default order, the "what happens next" line directly above the submit button.
- Honeypot field on the public form has all three: `tabIndex={-1}`, `aria-hidden="true"`, `className="sr-only"`.
- `/dashboard` pending-requests card rows show `placement` under `@handle`.
- `/bookings` does a single redirect to `/bookings/overview` (verify in network trace).
- Onboarding progress bar shows "Step 1 of 5 — Link".
- Sidebar Settings sub-item label reads "Home widgets" (route still works).

**Manual QA checklist:**

1. Open `/start`. Confirm no placeholder text visible.
2. Open `/bert-grimm` on a desktop browser. Confirm field order: Instagram handle → Email → Description → Placement → Size → References → Date.
3. On the same page, scroll to the submit button. Confirm the "what happens next" line is visible directly above it.
4. Inspect the size-label rendering. Confirm visible space between label and hint (e.g. `Palm-sized · ~5 cm`).
5. Inspect the honeypot field via DOM. Confirm `tabIndex="-1"`, `aria-hidden="true"`, and `sr-only` class are all present.
6. Open `/bookings/overview` with no requests. Confirm the empty-state text uses humanised status labels (e.g. "No requests awaiting deposit", not "No deposit_pending requests").
7. Open `/dashboard` on an account with pending requests. Confirm each row shows placement under the handle.
8. Click sidebar "Bookings". Confirm a single redirect (network trace: 308 → `/bookings/overview`).
9. Walk `/onboarding/welcome → claim-slug`. Confirm progress shows "Step 1 of 5 — Link".
10. Hover Settings in the sidebar. Confirm sub-item reads "Home widgets". Click; confirm landing at `/settings/dashboard`.

**Commit message template:**

```
feat(ux): Slice U1 — microcopy + flow quick wins

- humanStatusLabel helper; replaces status.replace("_", " ") leaks
- /start: remove placeholder screenshot copy
- public form: fix size-label spacing; verify honeypot a11y;
  reorder default fields to contact → idea → placement → size →
  references → date; add "what happens next" line above submit
- dashboard pending-requests rows: add placement under handle
- /bookings → /bookings/overview (single redirect, drop the /bookings/requests hop)
- onboarding progress: step 1 label "Profile" → "Link"
- sidebar: rename Settings → "Dashboard" sub-item to "Home widgets"

No new components, no layout changes, no behaviour changes beyond
the explicit microcopy/order/redirect items.
```

---

### Slice U2 — Navigation rename + booking-link spine (~half a day)

**Goal:** Rename the high-traffic labels so the IA finally describes itself, and make the booking link unmissable for first-time and zero-request artists.

**Affected files:**

- `src/components/app-shell/nav-config.ts` (sidebar labels)
- `src/components/bookings-nav.tsx` (mobile sub-nav labels)
- `src/app/(artist)/bookings/overview/page.tsx` (H1)
- `src/app/(artist)/bookings/settings/page.tsx` (H1)
- `src/app/(artist)/bookings/booking-form/page.tsx` (H1)
- `src/app/(artist)/travel/page.tsx` (H1)
- `src/app/help/page.tsx` (FAQ text referring to old labels)
- `src/app/(artist)/dashboard/page.tsx` (force-on widget logic + new zero-request setup card)
- `src/app/(artist)/onboarding/booking/page.tsx` (helper copy under each mode card)

**Exact UX changes:** D11, D12, D13.

**Things NOT to touch:**

- No URL changes (slugs stay).
- No rename of internal status/database values.
- No changes to action labels (Accept/Pass come in U3).
- No new top-level nav items.
- No deleting redirect stubs.

**Acceptance criteria:**

- Sidebar reads: General — `Dashboard`, `Bookings`, `Flash`, `Guest Spots`. Tools — `Analytics`, `Notifications`, `Settings`.
- Bookings sub-nav reads: `Bookings`, `Calendar`, `Waitlist`, `Books & Availability`, `Booking Link & Form`.
- Page H1s match.
- `/help` FAQ text uses the new label names where it referred to the old ones.
- On a fresh test account with `onboarding_completed === true` and zero received requests, `/dashboard` renders the new "Your booking link is live" card with Copy/Preview/Help actions, regardless of `widgets.booking_link`.
- On an account with at least one received request, `/dashboard` respects the `widgets.booking_link` toggle (existing behaviour preserved).
- Booking-mode picker shows the new helper text under each option.

**Manual QA checklist:**

1. Click every sidebar item. Confirm new labels.
2. Click every Bookings sub-nav item (sidebar expanded + mobile sub-nav). Confirm labels.
3. Open `/help`. Confirm no "Booking Overview" / "Booking Settings" / "Booking Form" / "Trip Planner" references remain.
4. Fresh test account: complete onboarding. Land on `/dashboard`. Confirm the "Your booking link is live" card is visible.
5. Receive one test request. Reload `/dashboard`. Confirm the setup card disappears (or transitions to the standard pending-requests card).
6. Open `/settings/dashboard` (renamed Home widgets). Toggle `Booking link` off. Reload `/dashboard`. On the fresh account (zero requests), confirm the link card is STILL visible (force-on works). On an account with requests, confirm it's now hidden (toggle respected).
7. Walk `/onboarding/booking`. Confirm helper text under each mode option.

**Commit message template:**

```
feat(ux): Slice U2 — nav rename + booking-link spine

- sidebar/labels: Booking Overview → Bookings; Booking Settings →
  Books & Availability; Booking Form → Booking Link & Form;
  Travel → Guest Spots
- /help FAQ updated to use new labels
- dashboard: zero-request setup card (Copy/Preview/Help) shown
  while onboarding_completed && received_requests = 0
- dashboard: BookingLinkWidget force-rendered for the same
  zero-request condition regardless of widgets.booking_link toggle
- /onboarding/booking: explicit helper copy under each mode card

URLs unchanged. Status/database values unchanged. No rename of
action labels (those land in U3).
```

---

### Slice U3 — Request action explainer + tattoo-native labels (~half a day)

**Goal:** Make the daily artist confident about every Accept / Pass / Request deposit / Mark deposit received decision.

**Affected files:**

- `src/app/(artist)/bookings/requests/[id]/status-actions.tsx`
- `src/lib/status-labels.ts` (or wherever `humanStatusLabel` from U1 lives) — extend for "Accepted" / "Passed"
- `src/components/status-badge.tsx` if it interpolates raw labels

**Exact UX changes:** D14, D15, D16.

**Things NOT to touch:**

- No status-value changes in the database (status stays `approved` / `rejected` internally).
- No new server actions.
- No changes to email-send logic (helper copy describes what the existing action already does; only verify it's accurate).
- No deposit-settings UI build (that's Slice 60e).

**Acceptance criteria:**

- Action buttons read `Accept` / `Pass` / `Request deposit` / `Mark deposit received`.
- Each button has a one-line helper directly below explaining the consequence.
- Status badges across the app (overview list, dashboard, request detail) display "Accepted" / "Passed" / "Awaiting deposit" via `humanStatusLabel`.
- Pass and Cancel actions have a confirm step. Pattern: **needs manual testing** to decide between inline two-tap or `confirm()` modal. Document the choice in `DECISIONS.md`.
- `humanStatusLabel` accuracy verified by reading the actual server action behaviour (do the helper sentences match the code).

**Manual QA checklist:**

1. Open a test pending request. Confirm Accept / Pass / Request deposit buttons render with helper text.
2. Click Accept. Verify the helper sentence's promise actually happens (email sent? Status changes? Calendar shows it?).
3. Repeat for Pass, Request deposit, Mark deposit received.
4. Confirm the confirm step on Pass / Cancel can't be triggered accidentally with a single click.
5. Open `/bookings/overview` with a mix of statuses. Confirm badges read in human language.
6. Open the dashboard pending-requests card. Confirm same.

**Commit message template:**

```
feat(ux): Slice U3 — request action explainer + tattoo-native labels

- status-actions.tsx: rename Approve → Accept, Reject → Pass;
  add one-line consequence helper under each of Accept, Pass,
  Request deposit, Mark deposit received
- status-actions.tsx: confirm step on destructive actions (Pass,
  Cancel) — see DECISIONS.md for the chosen pattern
- humanStatusLabel: extend with Accepted / Passed / Awaiting deposit
- StatusBadge consumers reviewed to use humanStatusLabel

No status-value changes in the database. No new server actions.
Helper text describes the existing action behaviour verbatim
(verified against the action implementations).
```

---

### Slice U4 — Waitlist + Travel + closed-books copy (~half a day)

**Goal:** Connect Waitlist and Travel as the demand-and-travel workflow; make the public closed-books page honest about why.

**Affected files:**

- `src/app/(artist)/bookings/waitlist/page.tsx` + `waitlist-actions.tsx` + the `StatusBadge` consumer for `Waitlist Request`
- `src/app/(artist)/travel/page.tsx` + `trip-manager.tsx`
- `src/app/[slug]/page.tsx` + `src/app/[slug]/books-closed-block.tsx`
- `src/app/(artist)/bookings/booking-form/page.tsx` (share section warning)
- `src/app/(artist)/settings/profile/page.tsx` + `src/app/(artist)/travel/page.tsx` ("Preview public page" links)

**Exact UX changes:** D17, D18, D19, D20, D21.

**Things NOT to touch:**

- No new database fields for waitlist or trips.
- No trip-quick-add UI restructure (D27 stays parked).
- No new "Visible on form" toggle behaviour.
- No marketing-side guest-spot SEO page changes.

**Acceptance criteria:**

- Waitlist "Convert" action button reads "Move to booking" (or "Create booking from waitlist").
- StatusBadge for waitlist-converted entries reads "Converted".
- Waitlist empty CTA links directly to `/bookings/settings` (not through a redirect).
- Waitlist city-demand card has a "Plan a guest spot →" link to `/travel`.
- Trip editor shows "See waitlist demand for {city} →" when matching city demand exists.
- `BooksClosedBlock` shows reason-specific copy for each of: manual close, window expired, cap reached, fixed-slots-no-slots.
- `/bookings/booking-form` share section shows a warning banner when `bookingMode === "fixed_slots"` and slot count is 0.
- `/settings/profile` and `/travel` each have a visible "Preview public page →" link near the H1.

**Manual QA checklist:**

1. Create a test waitlist entry. Convert it. Confirm action button reads "Move to booking"; resulting status badge reads "Converted".
2. Open `/bookings/waitlist` with no entries. Confirm CTA links directly to `/bookings/settings` (network trace: no intermediate redirect).
3. Add waitlist demand for "Berlin". Open `/travel`. Confirm the cross-link appears in the trip editor.
4. Reverse: open `/bookings/waitlist`. Confirm "Plan a guest spot →" link points to `/travel`.
5. Open `/bert-grimm` (or a test artist) with books manually closed. Confirm message reads the manual-close text.
6. Set a booking-window end date in the past. Confirm message reads window-expired text.
7. Set `booking_cap` at the current request count. Confirm message reads cap-reached text.
8. Switch the artist to `fixed_slots` mode with zero slots. Confirm message reads fixed-slots-no-slots-posted text.
9. In the same fixed-slots-no-slots state, open `/bookings/booking-form`. Confirm the warning banner appears in the share section.
10. Open `/settings/profile`. Click "Preview public page". Confirm `/bert-grimm` opens in a new tab.
11. Open `/travel`. Same.

**Commit message template:**

```
feat(ux): Slice U4 — waitlist + guest spots + closed-books honesty

- waitlist: Convert → Move to booking; Waitlist Request badge →
  Converted; empty CTA links direct to /bookings/settings
- cross-links: waitlist city demand → /travel; trip editor →
  waitlist demand for matching city
- /[slug] BooksClosedBlock: reason-specific copy for manual close /
  window expired / cap reached / fixed-slots-no-slots-posted
- /bookings/booking-form share section: warning when fixed_slots
  + zero slots posted
- /settings/profile + /travel: "Preview public page" link near H1

No schema changes. No new top-level nav. Trip quick-add (D27)
intentionally not in this slice.
```

---

### Slice U5 — Mobile request list + waitlist cards + request-detail action bar (~one day)

**Goal:** Make the daily mobile workflow phone-friendly. Lists become cards; request detail gets a sticky action bar.

**Affected files:**

- `src/app/(artist)/bookings/overview/page.tsx` (Requests + Clients tabs — mobile card layout)
- `src/app/(artist)/bookings/waitlist/page.tsx` (mobile cards)
- `src/app/(artist)/bookings/requests/[id]/page.tsx` (mobile sticky action bar)
- `src/app/(artist)/bookings/requests/[id]/status-actions.tsx` (compact mobile variant)

**Exact UX changes:** D22, D23.

**Things NOT to touch:**

- No desktop layout changes (use `md:hidden` / `hidden md:block`).
- No filter-bar restructure.
- No sticky-footer submit on the public form (deferred).
- No calendar mobile agenda view (deferred).
- No new components in unrelated areas.

**Acceptance criteria:**

- On `/bookings/overview` at <768px width, requests render as cards with `@handle` + placement + size/date + status badge + relativeTime.
- Same on `/bookings/waitlist`.
- Same on `/bookings/overview?view=clients`.
- On `/bookings/requests/[id]` at <768px width, an action bar sticks to the bottom of the viewport with Accept / Pass / Request deposit icons or short labels. Tap → expands to the full action UI (with helpers from U3).
- Desktop layout (≥768px) is unchanged.
- Safe-area-inset-bottom respected on the sticky bar (don't get cut off by iPhone home indicator).

**Manual QA checklist (on real devices: iPhone 14, Android Chrome at 375px or actual hardware):**

1. Open `/bookings/overview` on a phone. Confirm cards render; columns no longer hide as the table did.
2. Tap a card. Confirm it navigates to the request detail page.
3. Open `/bookings/waitlist` on the phone. Confirm waitlist rows are cards.
4. Open `/bookings/overview?view=clients` on the phone. Confirm client rows are cards.
5. Open a request detail on the phone. Confirm sticky action bar is visible at the bottom.
6. Scroll through the long detail content. Confirm the action bar stays sticky.
7. Open the system keyboard via tapping the message textarea (if exposed). Confirm the action bar does not push the keyboard or hide behind it.
8. Tap an action in the sticky bar. Confirm it either expands to the full action UI or triggers the action with the same confirm-pattern as desktop.
9. iPhone safe-area: confirm the sticky bar sits above the home indicator on a notched device.
10. Desktop sanity check: open the same pages at full desktop width. Confirm layout is unchanged.

**Commit message template:**

```
feat(ux): Slice U5 — mobile lists + request detail action bar

- /bookings/overview (Requests + Clients) and /bookings/waitlist:
  md:hidden card layout, hidden md:block keeps the existing table
- /bookings/requests/[id]: md:hidden sticky bottom action bar
  with safe-area respect; taps expand into the U3 action UI
- no desktop layout changes; no sticky submit on public form;
  no calendar agenda view (deferred)

Manual real-device QA documented in the commit description /
QA checklist in docs/ux-audit/final-ux-optimization-plan.md.
```

---

### Slice U6 (post-U5, optional) — generic-SaaS verb sweep (~1–2 hours)

**Goal:** Targeted copy review of high-traffic surfaces to replace "Manage" / "Configure" with "Edit" / "Set up" / "Tweak".

**Affected files (audit first, then edit):** likely a handful of strings under `/dashboard`, `/bookings/*`, `/travel`, `/settings/*`. Scope is XS but the safe path is to grep + diff + spot-check.

**Things NOT to touch:**

- Stripe / Google / third-party labels.
- Error logs and developer-only strings.
- The legal pages.

**Acceptance criteria:** every replaced verb passes a "would a tattoo artist write this?" eyeball check.

---

## L. First implementation prompt — Slice U1

Paste this verbatim to Claude Code when ready to start.

```
Implement Slice U1 from docs/ux-audit/final-ux-optimization-plan.md.

Scope is exactly D1–D10 in the priority list of that document.
Touch only the files listed in the U1 section. Do not start any
other slice. Do not touch StatusActions, the dashboard widget
logic, the booking-mode picker copy, mobile-specific layouts, or
the public-form Section 8 notice.

Required outcomes (single commit when all are done):

1. Create src/lib/status-labels.ts with a humanStatusLabel(status)
   helper returning:
   pending → "Pending"; approved → "Accepted"; rejected → "Passed";
   deposit_pending → "Awaiting deposit"; cancelled → "Cancelled";
   waitlist statuses waiting → "Waiting"; converted → "Converted".
   Replace every status.replace("_", " ") usage in src/. The known
   site is src/app/(artist)/bookings/overview/page.tsx — grep the
   whole src/ tree to confirm there are no others.

2. src/app/start/page.tsx: delete the line that reads
   "↑ Replace these with real screenshots once available." (line
   254 today; verify by grep before editing).

3. src/app/[slug]/booking-form.tsx: fix the SIZE_LABELS rendering
   so "Palm-sized · ~5 cm" (or equivalent) renders with a visible
   space between the label and the hint. The current snapshot
   shows "Palm-sized~ 5 cm" run together. Either insert a · or use
   a flex span with gap-1 — your call, but keep it consistent
   across all four entries.

4. src/app/[slug]/booking-form.tsx: confirm the honeypot input
   already has all three of: tabIndex={-1}, aria-hidden="true",
   className="sr-only". If any are missing, add them. Do NOT
   change the honeypot field name or its server-side detection
   logic in src/lib/honeypot.ts.

5. src/lib/form-settings.ts buildDefaultFieldOrder: reorder the
   default array so the canonical order is contact (Instagram +
   email) → description → placement → size → references (link +
   images) → preferred_date. Respect existing per-artist
   field_order overrides (only fresh accounts use the default).

6. src/app/[slug]/booking-form.tsx: directly above the submit
   button (above the by-submitting paragraph if needed for visual
   hierarchy), add a muted-foreground text-xs paragraph reading:
   "You'll get a confirmation email with a link to edit or cancel
   before {artistFirstName} replies." Wire {artistFirstName} from
   the existing artistFirstName prop (already passed to the form).

7. src/app/(artist)/dashboard/page.tsx pending-requests card:
   show form_data.placement (truncated if long) under each
   @handle row. Match the Upcoming card's existing pattern
   (truncate class, text-xs text-muted-foreground).

8. src/app/(artist)/bookings/page.tsx: change the redirect target
   from "/bookings/requests" to "/bookings/overview" directly.
   Leave /bookings/requests/page.tsx untouched (it stays as a
   bookmark-preserving stub).

9. src/components/onboarding-progress.tsx: change STEPS[0] from
   "Profile" to "Link".

10. src/components/app-shell/nav-config.ts: Settings group, the
    sub-item currently labeled "Dashboard" — rename the label to
    "Home widgets". The href stays "/settings/dashboard".

Hard requirements:

- pnpm typecheck must pass clean.
- pnpm lint must pass with no NEW errors (the existing 11
  pre-existing img/unused-var warnings are unchanged).
- pnpm build must succeed and prerender every page that already
  prerenders today (no statically-rendered route should go
  dynamic, and vice versa).
- Single commit. Commit message template is in section K of the
  plan doc.
- Do NOT add new dependencies.
- Do NOT introduce new components.
- Do NOT change any URL.
- Do NOT change any database schema, migration, or RLS policy.
- Do NOT touch any legal page or the signup/auth pages.
- Do NOT touch the StatusActions component (request approve/reject).
- Do NOT touch /dashboard widget toggle logic.

After implementation, run the manual QA checklist for U1 in
section K of the plan doc and report which items you verified
and which need a real-device or test-account pass from the
founder.

Do not push without explicit founder approval.
```

---

## Closing constraints reminder

- This plan is the source of truth for the implementation. Treat it as the contract.
- Every uncertain item is marked **needs manual testing** — do not silently treat them as facts when implementing.
- If a slice surfaces something the audit missed, surface it back as a question before extending scope; do not silently expand a slice.
- The plan is conservative on purpose. Most items are XS or S. The two largest items in U5 (mobile cards + sticky action bar) are still M, not L.
- The plan honours the existing decisions: counsel-cleared legal package stays untouched; the per-doc `pendingReview` mechanism stays as a future toggle; the legal-consent signup notice stays passive; `inkl.ee` short domain stays redirect-only; the Section 8 notice stays collapsed by default.
- The plan is sequenced so that each slice is independently shippable. If U2 needs to slip, U1's wins are still on prod.
