# Phase D — Code-level UX audit (agent sweep)

_Sweep date: 2026-05-24 · Prod commit: `49ce728`_

## How this was produced

- Read-only code audit by a Claude general-purpose subagent. No code or
  configuration was modified by this pass.
- **Surfaces covered** (all read end-to-end against the live prod commit):
  - Auth: login, signup, forgot-password, reset-password, MFA challenge,
    2FA enrollment.
  - Artist onboarding wizard (welcome slides → claim-slug → booking → availability
    → form → done) + logo upload.
  - Artist dashboard + booking-link widget + zero-request hero card.
  - Bookings overview (requests + clients tabs), waitlist, calendar, request
    detail + status actions, booking-form editor, books & availability,
    booking settings, slots.
  - Flash: items grid, instagram, days, request flow integration.
  - Travel / Guest Spots.
  - Public artist page (`/[slug]`), public booking form, books-closed +
    waitlist form, demo (`bert-grimm`) block.
  - Customer portal (`/request/[token]`), request/submitted page.
  - `/start` ad landing page + sticky CTA.
  - Admin analytics + accounts roster + account-detail actions.
  - Sidebar / mobile bottom nav config.
  - Server-action error strings on every `useActionState` we surface to the user.
  - Email templates (customer-facing booking emails).
  - Top-level `error.tsx` + `not-found.tsx`.
- **Not covered (live-walkthrough territory):**
  - Actual rendered visuals (color/spacing/typography on real device).
  - Real interaction friction (perceived speed, drag-and-drop feel, real keyboard
    flow, real screen-reader pass).
  - Live device testing (mobile Safari quirks, real iPhone HEIC upload,
    real Stripe Payment Element on iOS).
  - End-to-end gut feel — the kind of "this is confusing" that needs a real
    user clicking through.

## Findings

### High priority (a real user would hit this and be confused, stuck, or lose data)

- **[H1]** `src/app/start/page.tsx:311-312` — The `/start` ad landing page has a literal
  TODO visible to real visitors: _"↑ Replace with real quotes when available."_
  Below two placeholder testimonials ("Tattoo artist, Berlin" / "Freelance artist,
  Amsterdam"). This is a paid-ad landing page so users will see fake quotes plus
  a self-incriminating admission. **Suggested fix:** either pull real quotes,
  drop the testimonial section entirely, or replace with non-attributed product
  copy. The visible admission is the worst part — remove it today even if the
  fake quotes stay.

- **[H2]** `src/app/start/page.tsx:526-563` — `CalendarPreview` mockup hard-codes
  "May 2025". We're 12 months past that. To a 2026-05 visitor this reads as a
  stale demo. **Suggested fix:** either compute current month at render time
  (server component) or relabel as a generic illustration ("This month").

- **[H3]** `src/app/start/page.tsx:137-141` — `/start` mockup buttons say
  **"Approve / Decline"**, and the body copy below says "Review it, approve it,
  or pass" (line 199) and "Approve, decline, or request a deposit" (line 226).
  Visitors land on `/start` from an ad, then sign up, then see in-app verbs
  Accept / Pass. This is a conversion-funnel mismatch — the marketing
  language doesn't match the product language. **Suggested fix:** unify on
  Accept / Pass everywhere in `/start` so the user's mental model is
  consistent across the funnel.

- **[H4]** `src/app/(artist)/bookings/overview/page.tsx:9-16` — The
  `STATUS_FILTERS` chips at the top of `/bookings/overview` show labels
  **"Approved"** and **"Rejected"**, but the `StatusBadge` component
  (`src/components/status-badge.tsx:30`) renders the same statuses via
  `humanStatusLabel` as **"Accepted"** and **"Passed"**. So inside one
  table the user sees a filter chip "Approved" and rows with badge
  "Accepted" for the identical underlying status. This is the single
  most jarring vocabulary inconsistency in the product after the 60a verb sweep.
  **Suggested fix:** change the filter labels to "Accepted" / "Passed"
  (the URL value `status=approved` can stay since it's the DB enum).

- **[H5]** `src/lib/auth-error.ts:9-11` — The auth error messages for
  `?error=invalid-link` and `?error=link-expired` both end with **"or
  request a new link / a new confirmation link."** There is no resend-confirmation
  feature in the app (Slice 61 doc explicitly marked it out of scope). A real
  signup user who clicks an expired confirmation link is told to "request a
  new link" and then has no path to do so — they will email support or churn.
  **Suggested fix:** either (a) ship a minimal "resend confirmation" action on
  `/login` gated to `link-expired`, or (b) rewrite the copy to remove the
  promise — e.g. "That link has expired. Please sign up again with the same
  email." Picking (b) is the cheapest unblock for launch.

- **[H6]** `src/app/admin/accounts/[id]/account-actions.tsx:413` — The
  confirmation button on every admin destructive action shows
  **`"Deleting…"`** while pending, regardless of which action is being
  confirmed. So during a Suspend / Reactivate / Archive / Reset onboarding /
  Send password reset confirmation, the button reads "Deleting…". An admin
  could panic and double-click thinking they hit the wrong button.
  **Suggested fix:** map the action to its own verb, e.g.
  `pending ? actionPendingLabel(action) : "Confirm"`.

### Medium priority (should fix before public launch)

- **[M1]** `src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:33-60` —
  The three waitlist row action buttons are all lowercase ("contacted",
  "move to booking", "dismiss") and offer no error feedback. The underlying
  server actions (`markWaitlistContacted`, `dismissWaitlistEntry`) are
  declared `Promise<void>` and silently swallow failures with no toast or
  inline error. `convertWaitlistEntry` returns an `{ error }` shape but the
  client component throws it away with `void convertWaitlistEntry(...)`.
  **Suggested fix:** sentence-case the labels ("Mark contacted", "Move to booking",
  "Dismiss") and surface any returned error inline.

- **[M2]** `src/app/(artist)/bookings/waitlist/page.tsx:60-68` — Empty state
  copy reads _"No waitlist entries yet. Close your books to start collecting
  them."_ But waitlist entries can also come from cap-reached, fixed-slots-no-slots,
  and window-expired states (see `src/app/[slug]/page.tsx:331-351`). The empty
  state suggests only one cause. **Suggested fix:** broaden to
  "Waitlist signups appear here when your books are closed, full, or
  your slots run out."

- **[M3]** `src/app/[slug]/waitlist-form.tsx:17-20` — Waitlist success copy
  reads _"Got it — we'll be in touch when books open."_ For cap-reached and
  fully-booked artists this is inaccurate; the artist may never "open" books,
  they'll free up spots. **Suggested fix:** generalise to "Got it — we'll
  email you when there's an opening."

- **[M4]** `src/app/request/[token]/customer-portal.tsx:144-158` — In edit
  mode, the **Size radio buttons render the raw enum value** (`palm-sized`,
  `hand-sized`, `forearm`, `larger`) instead of the friendly labels used on
  the public booking form (`SIZE_LABELS` in `src/app/[slug]/booking-form.tsx:25-33`).
  A customer who already submitted "Palm-sized" and clicks Edit will see
  "palm-sized" verbatim — looks broken and unpolished.
  **Suggested fix:** import and use `SIZE_LABELS` here too.

- **[M5]** `src/app/[slug]/actions.ts:53-647` — Every server-action error
  string returned to the public booking form is lowercase with no terminal
  punctuation: _"invalid request origin"_, _"artist not found"_,
  _"placement is required"_, _"each image must be under 10mb"_, _"images
  must be jpg, png, or webp"_, _"please select a slot"_, _"something
  went wrong — try again"_, etc. These are the most user-visible error
  surfaces in the whole product (every public booking page hits them).
  Post-2026-05-21 the rest of the app is sentence-case. **Suggested fix:**
  sweep all 22+ error returns in this file to sentence case with a period.

- **[M6]** `src/app/request/[token]/actions.ts:32-200` — Same problem in
  the customer portal: all error strings are lowercase ("invalid link",
  "this link is no longer valid", "this link has expired", "too many
  requests — please try again later", "the slot could not be released
  — please try again", etc.). Customer-portal errors are particularly
  visible because the customer reaches the portal from an email link
  and is likely already mildly anxious. **Suggested fix:** same sentence-case
  sweep.

- **[M7]** `src/app/(artist)/bookings/actions.ts:45-211` — Artist-facing
  booking actions (`approveBooking`, `rejectBooking`, `markDepositReceived`)
  return lowercase errors too: _"not authenticated"_, _"booking not
  found"_, _"not authorised"_, _"the slot could not be confirmed
  — please try again"_, _"the slot could not be released — please
  try again"_. These render on the request detail page via
  `StatusActions`. **Suggested fix:** sentence-case + period sweep.

- **[M8]** `src/app/(artist)/bookings/requests/[id]/status-actions.tsx:170-172` —
  Tooltip text on the **Accept** button says _"Sends the client an
  **approval** email…"_. Verb mismatch with the button label. **Suggested
  fix:** "Sends the client an acceptance email…" or "Lets the client
  know you've accepted the request."

- **[M9]** `src/app/help/page.tsx:30,34` — `/help` FAQ still uses old verbs:
  - L30: _"only while the request is still pending (before you approve or reject it)"_
  - L34: _"Customers receive a confirmation when they submit, and an email
    when you **approve, reject, or cancel**."_
    Help is a frequent landing page for new artists. **Suggested fix:**
    rewrite to Accept / Pass.

- **[M10]** `src/app/help/page.tsx:26,34` — Help FAQ references stale path
  names. L26: _"Go to Settings -> Calendar export"_ (actual route:
  `/settings/calendar-export`, sidebar label "Calendar"); L34: _"Settings
  -> Email templates"_ (actual sidebar label "Emails", route
  `/settings/emails`). Also uses ASCII `->` which renders as literal
  characters instead of an arrow. **Suggested fix:** sync to current
  sidebar labels and use a proper arrow character.

- **[M11]** `src/app/error.tsx:21-25` and `src/app/not-found.tsx:8-12` —
  Both top-level error pages are entirely lowercase: _"something went
  wrong"_, _"an unexpected error occurred. try again or contact us if
  it persists."_, _"try again"_; _"page not found"_, _"this page
  doesn't exist or was moved."_, _"back to inklee"_. The rest of the
  app is sentence-case post-`8a5ea32`. **Suggested fix:** sentence-case
  pass with terminal punctuation.

- **[M12]** `src/app/(artist)/onboarding/welcome/welcome-slides.tsx:171-175` —
  The auto-advance timer fires every 6.5 s with no pause-on-tap and no
  pause-on-focus. A user reading the body copy will be interrupted
  mid-sentence. The tap zones (left/right) are also `cursor-default` and
  `aria-hidden` (lines 211-224), so the only discoverable navigation is the
  Next/Back buttons at the bottom — meaning the Instagram-story metaphor
  isn't actually delivered. **Suggested fix:** either remove the auto-advance
  entirely (let the user pace), or add a tap-to-pause + visible cursor
  hint. Lower-risk change: drop auto-advance and let the segmented bar
  fill only as the user progresses.

- **[M13]** `src/app/(artist)/onboarding/welcome/welcome-slides.tsx:209-224` —
  Story tap zones have `cursor-default`, `tabIndex={-1}`, `aria-hidden`,
  which means they're invisible to keyboard / screen-reader users and
  give no hover affordance to mouse users. Effectively the gesture is
  invisible — users who don't read the body just see static slides
  auto-advancing. **Suggested fix:** see M12; if you keep the tap
  zones, give them a hover state and remove `cursor-default`.

- **[M14]** `src/app/auth/mfa/page.tsx:40` — MFA challenge error
  `setError(cErr?.message ?? "Challenge failed")` — capitalized but no
  period, and "Challenge failed" is internal-jargon for a user. Same
  pattern in `src/app/(artist)/settings/account/two-factor-section.tsx:58`
  (`"Enrollment failed"`). **Suggested fix:** "We couldn't reach the
  authenticator service. Please try again."

- **[M15]** `src/lib/email/booking-templates.ts:99` — The
  `artist_new_booking_request` email body hard-codes
  `https://inklee.app/dashboard`. (a) The new request lives at
  `/bookings/requests/:id`, not `/dashboard`; (b) hard-coding the
  prod hostname breaks preview/staging environments — though for
  artist emails sent from prod it's fine. **Suggested fix:** use
  `{{magic_link}}`-style templating with `NEXT_PUBLIC_APP_URL` and link
  directly to the request detail.

- **[M16]** `src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:45-50`
  and `src/app/(artist)/bookings/calendar/appointment-drawer.tsx:85-94` —
  The `✕` close buttons have no `aria-label`. Screen readers will hear
  "button" with no clue what it does. Same goes for the calendar
  appointment-drawer close. **Suggested fix:** add `aria-label="Close"`.

- **[M17]** `src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:38` —
  Modal backdrop closes the modal on click but there's no keyboard
  Esc-to-close handler and no focus trap. Standard a11y miss on a
  custom modal. **Suggested fix:** add `useEffect` for Escape key and
  trap focus inside the modal while open.

- **[M18]** `src/components/app-shell/nav-config.ts:44` — The "Bookings"
  parent nav item expands to a child also called "Bookings", which
  navigates to the same `/bookings/overview` href. On hover/click the
  user sees "Bookings > Bookings" in the sidebar. **Suggested fix:**
  remove the duplicate child entry (the parent already routes there),
  or rename the child (e.g. "All requests").

### Low priority (polish; ship anyway)

- **[L1]** `src/components/app-shell/nav-config.ts:33-86` — Sidebar labels
  mix capitalization: "Books & Availability" (Title Case), "My Booking
  Form" (Title Case), "Guest Spots" (Title Case), "Home widgets"
  (sentence). Pick one; the rest of the post-`8a5ea32` IA pass leaned
  sentence case.

- **[L2]** `src/app/(artist)/bookings/calendar/page.tsx:42-44` — Page
  subhead: _"Approved bookings and appointments you've added yourself."_
  Uses "Approved" — the verb the verb sweep moved away from. Calendar
  also only shows `status="approved"` (which is post-acceptance, possibly
  post-deposit-received), so "approved" here is semantically muddy.
  **Suggested fix:** "Accepted bookings and appointments you've added
  yourself." (matches the verb sweep + still reads naturally).

- **[L3]** `src/app/admin/admin-client.tsx:278` and `src/app/admin/accounts/[id]/page.tsx:209` —
  Admin uses "Rejected" / "Cancelled" stat labels and a `bookingFunnel`
  bar labeled "Rejected". Admin is internal so this is acceptable, but
  it'd be cleaner to mirror the artist-facing wording.

- **[L4]** `src/app/page.tsx:236,296` — Homepage marketing copy uses
  "approve, reject" verbs ("Review, approve, reject, or request a deposit
  from a clean dashboard."). Marketing pages can argue for industry-standard
  verbs, but it's noise the new-artist funnel doesn't need.

- **[L5]** `src/app/(artist)/dashboard/requests/[id]/status-actions.tsx` and
  `src/app/(artist)/dashboard/calendar/*` and `src/app/(artist)/dashboard/waitlist/page.tsx`
  contain dead code (the old `dashboard/*` route lives only as a
  redirect to `/bookings/*` since the 60b restructure, but the original
  component files were left in place). Not user-visible, but `pnpm
build`-time it widens the surface area. **Suggested fix:** delete the
  pre-60b dashboard subroutes that are now just `redirect()` shells, and
  their abandoned siblings (`status-actions.tsx`, `calendar-view.tsx`, etc.).

- **[L6]** `src/app/(artist)/dashboard/page.tsx:121-125` — The dashboard
  greeting renders the artist's full `display_name` as the H1, with
  "Overview" as the subhead. On a long display name + the StatusPill
  on the same row this may wrap awkwardly on narrow screens. Worth
  checking visually; not a code defect per se.

- **[L7]** `src/app/(artist)/dashboard/page.tsx:283` and elsewhere — The
  "X spots remaining" copy is plural-incorrect for `capRemaining === 1`
  (would read "1 spots remaining"). One-liner: `${n} spot${n === 1 ? "" : "s"} remaining`.

- **[L8]** `src/app/(artist)/bookings/overview/page.tsx:194-205` — The
  desktop table renders the same `<Link>` six times per row (one per
  cell) which is harmless but redundant. The mobile card layout uses a
  single wrapping link — keep that pattern. Future cleanup: wrap the
  `<tr>` row body in a single anchor (or use `<TableRow asChild>` if
  shadcn is adopted later).

- **[L9]** `src/app/(artist)/onboarding/done/page.tsx:153-160` — Onboarding
  "Finish setup" button links to `/bookings/settings`, which is the
  Books & Availability page. For `fixed_slots` mode without slots,
  the user actually needs to add slots — they may not realise that
  Books & Availability is where slots live. **Suggested fix:** when
  the gap is "no slots", deep-link directly to the slots section
  (`/bookings/settings#slots` or `/bookings/slots`).

- **[L10]** `src/app/(artist)/flash/items/[id]/page.tsx:174` and similar —
  Multiple "View ... →" links across the app inconsistently use
  literal "→" arrow vs. `&rarr;` entity vs. lucide `<ArrowRight>` icon.
  Visual-only consistency item.

- **[L11]** `src/app/request/[token]/customer-portal.tsx:296-300` —
  Currency display is hard-coded to "EUR" with `Number.toFixed(2)`,
  which always renders as `EUR 200.00`. For non-EU artists this won't
  work, but multi-currency is post-launch territory. Flag for the
  post-launch list.

## Surface notes

### Artist signup + onboarding

- Signup form, "Check your email" success state, password show/hide, and
  consent copy all looked good — Slice 61 already swept this area.
- Welcome slides intro is well-built but the auto-advance + invisible tap
  zones (see M12, M13) are the only real friction points for the very
  first impression.
- `/onboarding/profile` correctly redirects to `/onboarding/booking` after
  the step was merged into claim-slug. No visible breakage.
- Onboarding "Done" page surfaces the right "you can't share yet" state
  for fixed-slots-no-slots; logo upload has the hardened client-side
  validation from `42ed7d9`.

### Artist dashboard

- Onboarding-incomplete banner (line 127), zero-request "your link is
  live" card (line 147), missing-bio nudge (line 182), and the optional
  Analytics card link (line 367) are all correctly conditional.
- "1 spots remaining" plural bug noted as L7.
- No findings on the empty-widget fallback (line 383-400) — handles the
  "all widgets hidden" case explicitly.

### Bookings (overview / waitlist / calendar / requests / settings / form)

- Mobile card vs. desktop table fork in overview is clean (line 148/189
  cutover at `md:`).
- Waitlist needs the most copy work (M1, M2).
- Calendar's `/bookings/calendar` page is clean; the new-appointment
  modal needs the a11y items in M16/M17.
- Request detail status actions (the "Accept / Request deposit / Pass"
  triad) work well; only the small tooltip-copy mismatch in M8.

### Flash

- `/flash` → `/flash/items` redirect is fine.
- Three empty-state variants (no IG / IG + no posts / IG + posts) at
  `flash/items/page.tsx:165-281` are good — possibly the most thoughtful
  empty state in the app.
- No findings here.

### Travel / Guest spots

- Page header + waitlist-demand callout (line 118) cross-link cleanly to
  `/bookings/waitlist`.
- No findings here.

### Public artist page + booking form

- `/[slug]` server page does the right slot-vs-preferred-date split,
  derives location from trip overlap, falls back to home studio.
- Books-closed precedence (window > manual > slots-empty > cap-reached)
  is well-implemented with per-reason copy.
- Demo block (Bert Grimm) is clearly framed.
- The big finding here is M5: lowercase error strings throughout. This
  is the public-facing error surface.

### Customer portal (`/request/[token]`)

- Four-state page (active / expired / used / cancelled / not-found) at
  `request/[token]/page.tsx:130-150` is correct.
- The Size-enum-raw rendering in edit mode (M4) is the standout issue.
- M6 covers the lowercase error sweep here.

### `/start` ad landing

- Worst surface for the audit: H1 (visible TODO), H2 (stale May 2025),
  H3 (Approve / Decline mockup). All three need to land before this
  page is paid-ad-ready.
- Pain/Solution/How-it-works/Trust sections are otherwise clean.

### Admin

- Roster + account-detail are well-structured. Internal-only, so the
  vocabulary inconsistencies are L-priority.
- The "Deleting…" button-label bug (H6) is the only real risk —
  during a normal Suspend or Reset Onboarding action an admin sees
  "Deleting…" mid-action.
- Stat boxes and the danger-zone require-DELETE-typing gate (`account-actions.tsx:367-413`)
  are responsibly built.

### Auth (login / signup / forgot / reset / MFA)

- Slice 61 cleaned up most of this surface. The remaining items are:
  - H5: copy promises a "request a new link" path that doesn't exist.
  - M14: a couple of internal-jargon error strings on MFA enroll/challenge.

## Patterns observed

- **The 2026-05-21 sentence-case + Accept/Pass verb sweep didn't reach
  three structural areas:**
  1. Server-action error strings in `src/app/[slug]/actions.ts`,
     `src/app/request/[token]/actions.ts`, and
     `src/app/(artist)/bookings/actions.ts` (M5/M6/M7).
  2. Top-level `error.tsx` + `not-found.tsx` (M11).
  3. The `/start` ad landing page mockups + body copy (H3) and the `/help`
     FAQ (M9).
     These three together account for ~half the findings; a single sweep
     PR closes most of the medium tier.

- **The "approved" / "Accepted" / "Approve" cluster has at least three
  different surfaces using different vocabularies for the identical
  underlying state:**
  - Filter chips on `/bookings/overview` say "Approved" / "Rejected".
  - StatusBadge component renders "Accepted" / "Passed" via `humanStatusLabel`.
  - Action button on request detail says "Accept" / "Pass", with a
    tooltip that says "approval email".
  - Marketing pages say "approve, reject".
    This is the deepest mental-model drift in the product. Worth deciding
    once and sweeping.

- **Waitlist messaging consistently assumes books-closed is the only
  trigger** (M2, M3, and similar copy elsewhere). In code, four
  conditions trigger waitlist (`src/app/[slug]/page.tsx:331-351`). Worth
  one pass to broaden the copy.

- **`useActionState`-returning waitlist actions don't always surface the
  return value** — `WaitlistActions` discards `convertWaitlistEntry`'s
  `{ error }` result and the void-returning `dismissWaitlistEntry` /
  `markWaitlistContacted` have no failure path at all (M1). A
  network blip or RLS hiccup will appear as nothing happening.

- **Modal a11y is patchy.** Close-X buttons missing `aria-label`,
  modals lacking focus trap and Esc handler (M16, M17). Affects the
  calendar new-appointment modal and the appointment drawer; the
  annotation modal (`src/app/[slug]/annotation-modal.tsx`) was not
  re-read but worth checking the same checklist.

- **Two stale-route subtrees still exist** as redirect-only files plus
  their original `actions.ts`/component siblings (L5). Pre-launch
  cleanup task, not a UX issue.
