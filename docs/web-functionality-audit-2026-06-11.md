# Inklee web functionality audit — 2026-06-11

> Exhaustive inventory of every artist-facing function in the web app (`apps/web`), the authoritative source of shipped functionality (the artist surfaces are auth-gated, so the codebase, not the logged-out site, is the complete reference). Generated from a 16-surface, 32-agent audit. Companion: `docs/mobile-parity-plan-2026-06-11.md`.

## Surfaces

1. Dashboard + home widgets — 27 functions
2. Bookings: requests / overview + request detail — 43 functions
3. Bookings: calendar + appointments — 35 functions
4. Bookings: clients — 24 functions
5. Bookings: waitlist — 29 functions
6. Deposits (collection + refunds) — 39 functions
7. Booking form builder + fields + public page + slots/books — 44 functions
8. Flash: designs / days / Instagram — 42 functions
9. Goods: products / variants / sales — 49 functions
10. Guest spots / travel — 32 functions
11. Analytics — 13 functions
12. Notifications + reminders — 43 functions
13. Settings: profile + bio page — 27 functions
14. Settings: emails + templates — 31 functions
15. Settings: payouts (Stripe Connect / KYC) — 19 functions
16. Settings: account + security + onboarding — 34 functions

---

## 1. Dashboard + home widgets

The Dashboard is the artist's home overview at /dashboard, the landing page after login. It is a server component that reads the signed-in artist's profile (slug, display_name, settings, timezone, bio) and conditionally runs up to five parallel Supabase queries to populate a grid of configurable "home widgets": Pending requests, Upcoming guest spots, Upcoming appointments, Waitlist, and Your links (booking + waitlist share links). Each widget is gated by a per-artist visibility toggle stored in profiles.settings.dashboard_widgets and parsed via parseDashboardWidgets (with a legacy books_status to guest_spots fallback). Above the grid, the page surfaces contextual onboarding/setup nudges (finish onboarding, add a bio) and a zero-request convenience that force-shows the links widget so a brand-new artist can immediately share their page. Below the grid sits an always-present Analytics entry card and an all-widgets-hidden empty state. The companion surface at /settings/dashboard lets the artist flip each widget on or off via switches and Save, persisting to the same settings JSON through the saveDashboardWidgetsAction server action (which revalidates both pages). All widget rows are deep links into the relevant booking, calendar, travel, and analytics surfaces, and timezone-aware date filtering ensures "upcoming" reflects the artist's local today.

### Dashboard heading with artist display name
- **What it does:** Renders the artist's display_name as the H1 (falling back to the literal 'Dashboard' when no display name exists), with an 'Overview' subheading.
- **Why needed:** Confirms the artist is in their own workspace and personalizes the home screen they see every login.
- **How it works:** Server component reads profiles.display_name for user!.id via supabase.auth.getUser() + a single profiles select. Renders {profile?.display_name ?? "Dashboard"}. No input/action.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:25-29`, `apps/web/src/app/(artist)/dashboard/page.tsx:146-151`

### Finish onboarding nudge card
- **What it does:** Shows a tappable 'Finish setting up your account' card linking to /onboarding/booking when onboarding is not yet completed.
- **Why needed:** Drives a new artist to complete the booking-page setup so their public page actually works before they expect requests.
- **How it works:** onboardingCompleted = profileSettings.onboarding_completed === true. When false, renders a Link to /onboarding/booking with a Sparkles IconChip (rosa). Pure navigation; no server action.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:31-32`, `apps/web/src/app/(artist)/dashboard/page.tsx:153-171`

### Add a bio nudge card
- **What it does:** Shows a dashed 'Add a short bio' card linking to /settings/profile, only when onboarding is complete but the profile bio is empty.
- **Why needed:** Encourages artists to add style context that helps clients decide to book, improving conversion on the public page.
- **How it works:** Condition: onboardingCompleted && !profile?.bio. Renders a Link to /settings/profile with a Sparkles IconChip (bone). Bio is read in the profiles select. Pure navigation.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:27`, `apps/web/src/app/(artist)/dashboard/page.tsx:179-197`

### Pending requests widget
- **What it does:** Shows the exact count of pending booking requests as a large number plus the 3 most recent pending requests (client label + placement + a 'Pending' status badge), each linking to the request detail. Shows '+N more' when more than 3 exist, or 'No pending requests.' when zero.
- **Why needed:** Pending requests are the artist's primary actionable queue; surfacing the count and newest few lets them triage bookings the moment they open the app.
- **How it works:** Gated by widgets.pending_requests. Query: booking_requests select id, customer_handle, customer_email, created_at, form_data with count:'exact', filtered artist_id = user, status='pending', ordered created_at desc, limit 3. Renders pendingCount (count) and maps rows; row label via customerLabel(handle,email), placement from form_data.placement, StatusBadge status='pending' (humanStatusLabel => 'Pending'). Rows link to /bookings/requests/{id}; header 'View all' links to /bookings/overview?view=requests. Read-only.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:44-57`, `apps/web/src/app/(artist)/dashboard/page.tsx:99-100`, `apps/web/src/app/(artist)/dashboard/page.tsx:200-255`, `apps/web/src/components/status-badge.tsx:28-36`, `packages/shared/src/booking-domain.ts:29-39`

### Pending requests 'View all' link
- **What it does:** Header link that opens the full requests list filtered to the requests view.
- **Why needed:** Lets the artist jump from the 3-item preview into the complete request queue.
- **How it works:** Link href='/bookings/overview?view=requests'. Pure navigation.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:207-212`

### Upcoming guest spots widget
- **What it does:** Lists up to 3 upcoming guest-spot trip legs (studio name or trip title, with date or date range), or 'No upcoming guest spots.' when none. Each row deep-links to the request overview pre-filtered to that leg's parent trip.
- **Why needed:** Gives traveling artists a quick glance at their guest-spot/travel pipeline and lets them jump straight to requests tied to that trip without bouncing through /travel.
- **How it works:** Gated by widgets.guest_spots. Query: trips select id, title, trip_legs(id, starts_on, ends_on, studios(name)) where artist_id = user. JS flattens trips x legs into UpcomingLeg[], filters endsOn >= today (timezone-aware), sorts by startsOn asc, slices 3. Row title = studioName ?? tripTitle; date via formatDate, range when starts != ends. Rows link to /bookings/overview?view=requests&trip={tripId}; header 'Plan' links to /travel. Note: this widget pivoted from the old books_status card (legacy key fallback in parseDashboardWidgets).
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:88-96`, `apps/web/src/app/(artist)/dashboard/page.tsx:105-134`, `apps/web/src/app/(artist)/dashboard/page.tsx:257-310`, `packages/shared/src/dashboard-settings.ts:26-32`

### Upcoming guest spots 'Plan' link
- **What it does:** Header link to the travel planner.
- **Why needed:** Lets the artist manage trips/legs/studios from the dashboard.
- **How it works:** Link href='/travel'. Pure navigation.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:266-271`

### Upcoming appointments widget
- **What it does:** Lists up to 3 upcoming approved bookings (client label + placement + preferred date), or 'No upcoming appointments.' when none. Each row links to the booking detail.
- **Why needed:** Lets the artist see what's confirmed and coming up next so they can plan their day/week at a glance.
- **How it works:** Gated by widgets.upcoming_appointments. Query: booking_requests select id, customer_handle, customer_email, preferred_date, form_data where artist_id = user, status='approved', preferred_date not null, preferred_date >= today (timezone-aware), ordered preferred_date asc, limit 3. Row label via customerLabel, placement from form_data.placement, date via formatDate(preferred_date) else '-'. Rows link to /bookings/requests/{id}; header 'Calendar' links to /bookings/calendar. Read-only.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:59-71`, `apps/web/src/app/(artist)/dashboard/page.tsx:312-357`

### Upcoming appointments 'Calendar' link
- **What it does:** Header link to the bookings calendar.
- **Why needed:** Lets the artist move from the preview into the full calendar view.
- **How it works:** Link href='/bookings/calendar'. Pure navigation.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:317-322`

### Waitlist widget
- **What it does:** Shows the count of waiting waitlist entries as a large number with a 'Person/People waiting' caption, and a 'View' link to the waitlist. Only renders when the count is greater than 0.
- **Why needed:** Tells the artist how much pent-up demand they have so they can decide to open books or reach out to people waiting.
- **How it works:** Gated by widgets.waitlist AND waitlistCount > 0. Query: waitlist_entries select head:true count:'exact' where artist_id = user, status='waiting'. Renders waitlistCount; caption singular 'Person' when count === 1 else 'People'. Header 'View' links to /bookings/overview?view=waitlist. Read-only; hidden entirely when zero waiting.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:73-79`, `apps/web/src/app/(artist)/dashboard/page.tsx:102`, `apps/web/src/app/(artist)/dashboard/page.tsx:359-378`

### Waitlist 'View' link
- **What it does:** Header link to the waitlist view of the overview.
- **Why needed:** Lets the artist open the full waitlist to contact or convert people.
- **How it works:** Link href='/bookings/overview?view=waitlist'. Pure navigation.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:364-369`

### Your links widget (booking + waitlist share links)
- **What it does:** Displays the artist's public booking link and waitlist link with the protocol stripped, each with a 'Copy link' button and a 'Preview' button that opens the real public URL in a new tab. Header has an 'Edit' link to the booking form.
- **Why needed:** The share link is how an artist actually gets bookings (Instagram bio, DMs); fast copy/preview from home removes friction in sharing it.
- **How it works:** Rendered when (widgets.booking_link || isZeroRequest) && profile?.slug. publicUrl = publicArtistUrl(slug); waitlistUrl = publicArtistUrl(slug, {subpath:'/waitlist'}) (subdomain vs path mode per env). Client LinkRow strips https?:// for display, copy via navigator.clipboard.writeText with a 2s 'Copied' state, Preview is an <a target=_blank rel=noopener>. Header 'Edit' links to /bookings/booking-form. No server action.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:136-137`, `apps/web/src/app/(artist)/dashboard/page.tsx:380-382`, `apps/web/src/app/(artist)/dashboard/booking-link-widget.tsx:1-70`, `apps/web/src/lib/public-url.ts:67-76`

### Copy booking/waitlist link button
- **What it does:** Copies the full (with-protocol) URL to the clipboard and flips the label to 'Copied' for 2 seconds.
- **Why needed:** One-tap copy lets the artist paste their link into Instagram bio or a DM instantly.
- **How it works:** navigator.clipboard.writeText(url).then(setCopied(true)); setTimeout reverts after 2000ms. Copies the absolute url (includes https://), even though the displayed text strips the protocol. Client-side only.
- **Source:** `apps/web/src/app/(artist)/dashboard/booking-link-widget.tsx:14-19`, `apps/web/src/app/(artist)/dashboard/booking-link-widget.tsx:28-33`

### Preview booking/waitlist link button
- **What it does:** Opens the real public URL in a new browser tab.
- **Why needed:** Lets the artist see exactly what a client sees before sharing.
- **How it works:** <a href={url} target=_blank rel=noopener noreferrer>. Uses the absolute url so it resolves under subdomain or path routing.
- **Source:** `apps/web/src/app/(artist)/dashboard/booking-link-widget.tsx:34-41`

### Your links 'Edit' link
- **What it does:** Header link to the booking form editor.
- **Why needed:** Lets the artist tweak the form that the shared link points to.
- **How it works:** Link href='/bookings/booking-form'. Pure navigation.
- **Source:** `apps/web/src/app/(artist)/dashboard/booking-link-widget.tsx:59-64`

### Zero-request force-show links convenience (D12/D13)
- **What it does:** For a post-onboarding artist with a slug and zero total received requests, the Your links widget is shown even if the booking_link toggle is off.
- **Why needed:** A brand-new artist with no requests most needs to share their link; this guarantees the link is in front of them regardless of widget config.
- **How it works:** isZeroRequest = onboardingCompleted && !!profile?.slug && totalReceivedCount === 0. totalReceivedCount from booking_requests count head:true where artist_id = user (only run when onboardingCompleted). Used in the render gate (widgets.booking_link || isZeroRequest) and to suppress the all-hidden empty state.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:81-86`, `apps/web/src/app/(artist)/dashboard/page.tsx:103`, `apps/web/src/app/(artist)/dashboard/page.tsx:139-142`, `apps/web/src/app/(artist)/dashboard/page.tsx:380-382`

### Analytics entry card
- **What it does:** Always-visible card linking to /analytics, captioned 'Conversion, volume, and client return rate'.
- **Why needed:** Gives the artist a persistent route into performance metrics from their home screen.
- **How it works:** Static Link href='/analytics' with a BarChart3 IconChip (bone). Not gated by any widget toggle. Pure navigation.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:385-399`

### All-widgets-hidden empty state
- **What it does:** When every widget toggle is off and the artist is not in the zero-request convenience case, shows a centered card 'All widgets are hidden.' with a 'Show some widgets again' link to /settings/dashboard.
- **Why needed:** Prevents a confusing blank grid and gives a one-click recovery path back to the widget settings.
- **How it works:** Condition: !pending_requests && !guest_spots && !upcoming_appointments && !waitlist && !booking_link && !isZeroRequest. Renders a Card with a link to /settings/dashboard. Note: Analytics card and nudges still render outside this condition.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:401-418`

### Per-widget conditional querying (performance convenience)
- **What it does:** Each widget's underlying Supabase query only runs when that widget's toggle is enabled; disabled widgets resolve to a cheap stub.
- **Why needed:** Keeps the dashboard fast and avoids fetching data the artist has chosen not to see.
- **How it works:** In Promise.all, each entry is a ternary: e.g. widgets.pending_requests ? supabase... : Promise.resolve({data:null,count:null}). All five queries fire in parallel via Promise.all. totalReceived query is gated on onboardingCompleted rather than a widget.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:37-97`

### Timezone-aware 'today' filtering
- **What it does:** Computes 'today' in the artist's configured timezone and uses it to filter upcoming appointments (preferred_date >= today) and upcoming guest spots (endsOn >= today).
- **Why needed:** Ensures 'upcoming' reflects the artist's local day, not server/UTC, so appointments and trips don't drop a day early or linger.
- **How it works:** today = todayInTimeZone(profile?.timezone ?? 'Europe/Berlin') using Intl.DateTimeFormat en-CA in the given timeZone. Used in the appointments query .gte and the guest-spot JS filter.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:35`, `apps/web/src/app/(artist)/dashboard/page.tsx:68`, `apps/web/src/app/(artist)/dashboard/page.tsx:132`, `packages/shared/src/date-utils.ts:25-41`

### Customer label fallback rendering
- **What it does:** Renders each request/appointment client as '@handle', else the email, else 'Client' — never a bare '@'.
- **Why needed:** Clients may supply Instagram OR email; the artist still needs a sensible, non-broken name on every row.
- **How it works:** customerLabel(customer_handle, customer_email) from shared booking-domain; trims handle, prefixes '@', falls back to trimmed email, then 'Client'.
- **Source:** `apps/web/src/app/(artist)/dashboard/page.tsx:234`, `apps/web/src/app/(artist)/dashboard/page.tsx:339-341`, `packages/shared/src/booking-domain.ts:29-39`

### Dashboard loading skeleton
- **What it does:** While the server component fetches, shows an animated skeleton: a title bar plus a 2-column grid of 4 placeholder widget cards.
- **Why needed:** Gives immediate visual feedback so the home screen doesn't appear frozen on each load.
- **How it works:** Next.js route-level loading.tsx renders pulsing divs (h-8 title, 4 bordered cards). Automatic Suspense fallback; no data.
- **Source:** `apps/web/src/app/(artist)/dashboard/loading.tsx:1-19`

### Widget visibility settings page
- **What it does:** At /settings/dashboard, presents a titled page ('Dashboard' / 'Choose which widgets appear on your dashboard overview.') with the widget toggle form.
- **Why needed:** Lets each artist tailor their home screen to the widgets they actually use.
- **How it works:** Server component reads profiles.settings for user, parses via parseDashboardWidgets, and renders DashboardWidgetsForm with current values.
- **Source:** `apps/web/src/app/(artist)/settings/dashboard/page.tsx:5-33`

### Widget toggle switches (5)
- **What it does:** Five accessible on/off switches: Pending requests, Upcoming appointments, Upcoming guest spots, Waitlist, Booking link. Toggling flips local state and the visual switch immediately.
- **Why needed:** Direct, granular control over which home widgets the artist sees.
- **How it works:** Client form maps over DashboardWidgets keys; each row has a hidden input name={key} value={String(values[key])} and a role=switch button with aria-checked. toggle(key) updates useState. Labels from WIDGET_LABELS. State is staged until Save.
- **Source:** `apps/web/src/app/(artist)/settings/dashboard/widgets-form.tsx:9-60`

### Save dashboard widgets action
- **What it does:** Persists the five toggle values to the artist's profile settings and revalidates the dashboard and settings pages, showing 'Saved.' or an inline error.
- **Why needed:** Makes the artist's widget choices stick across sessions and reflect immediately on the dashboard.
- **How it works:** Form action=saveDashboardWidgetsAction (useActionState). Server action: getUser (returns {error:'not authenticated'} if missing), reads current settings, builds widgets where each key = formData.get(key) === 'true', updates profiles.settings = {...current, dashboard_widgets} + updated_at, on DB error returns {error: message} else revalidatePath('/settings/dashboard') and '/dashboard' and returns {success:true}. Submit button shows 'Saving…' while pending and is disabled.
- **Source:** `apps/web/src/app/(artist)/settings/dashboard/widgets-form.tsx:22-25`, `apps/web/src/app/(artist)/settings/dashboard/widgets-form.tsx:62-76`, `apps/web/src/app/(artist)/settings/dashboard/actions.ts:9-48`

### Widget settings inline feedback (error / Saved)
- **What it does:** Shows a destructive-colored error message when the save fails, or 'Saved.' on success.
- **Why needed:** Confirms to the artist whether their preference change took effect.
- **How it works:** Reads useActionState state: if 'error' in state render <p class=text-destructive>{state.error}; if 'success' in state render 'Saved.'
- **Source:** `apps/web/src/app/(artist)/settings/dashboard/widgets-form.tsx:62-67`

### Widget settings parsing with legacy fallback
- **What it does:** Parses stored dashboard_widgets into a typed object, defaulting all widgets to visible, and reading the legacy books_status key into guest_spots when guest_spots isn't yet stored.
- **Why needed:** Ensures artists who configured widgets before the books_status->guest_spots rename keep their intended visibility and that new artists default to a full dashboard.
- **How it works:** parseDashboardWidgets(raw): if not an object returns DEFAULT (all true); per key uses stored boolean else true; guest_spots = r.guest_spots boolean else r.books_status boolean else true. Used by both dashboard page and settings page.
- **Source:** `packages/shared/src/dashboard-settings.ts:13-45`, `apps/web/src/app/(artist)/dashboard/page.tsx:33`, `apps/web/src/app/(artist)/settings/dashboard/page.tsx:18`

**Notes:** Scope boundary: the persistent app shell (sidebar, WorkspaceTopBar, MobileTopBar, BooksStatusPill 'books open/closed' pill, notifications bell with unread count, account menu, MobileBottomNav) lives in apps/web/src/app/(artist)/layout.tsx and wraps the dashboard but is a separate surface; the dashboard page comments note the books-open/closed status was intentionally moved to that top-bar pill (2026-05-24/05-25) and the old 'books status' widget was repurposed to guest spots. Edge behaviors: (1) The Pending and Waitlist widgets show exact counts via count:'exact' while only listing the top 3 rows; pending shows '+N more' but waitlist does not list rows. (2) Waitlist widget is doubly gated — hidden if the toggle is off OR if zero people are waiting, so an empty waitlist never renders even when enabled. (3) booking_link widget also requires profile?.slug to exist, so a slug-less artist never sees it even with the toggle on or in the zero-request case. (4) The zero-request convenience and the bio/onboarding nudges all depend on onboarding_completed and bio fields read from the same single profiles select. (5) Copy button copies the absolute URL (with protocol) but displays it stripped. (6) The all-hidden empty state does not suppress the Analytics card or nudges, which always render. (7) The settings page has no per-widget descriptions — just labels and switches — and all changes are staged in local state until Save (no autosave). (8) Public URL form (subdomain vs path) is environment-driven via NEXT_PUBLIC_PUBLIC_BIO_DOMAIN / NEXT_PUBLIC_APP_URL, so the same widget code emits different link shapes per env. (9) Copy strings reviewed: no em-dashes in user-visible text; guest-spot date ranges use an en-dash ('–') separator, not an em-dash.


---

## 2. Bookings: requests / overview + request detail

This surface is the heart of an artist's day-to-day booking management. /bookings/overview is a single, tabbed page (Requests, Clients, Waitlist) that lists every inbound booking request, rolls them up into unique-client and city-demand views, and links each row to a detail page. /bookings/requests redirects to it (a legacy alias). The request-detail page (/bookings/requests/[id]) is where the artist actually decides and transacts: it shows the full submission (Instagram, email, placement, size, preferred date, slot time, location, reference link, custom-question answers, description, annotated reference images, and "interested in buying" goods), and exposes the entire decision toolbar -- Accept, Pass, Request deposit (in-app card via Stripe Connect or manual), Mark deposit received, Refund deposit, Cancel booking, and Mark goods picked up. A goods/studio confirmation popup fires on accept when the booking has a guest spot or pending goods interests, letting the artist confirm availability per item before the client is emailed. A Communication panel surfaces a human-readable activity timeline (submitted, accepted, passed, deposit requested/paid, reminders, client edits/cancellations) plus one-tap "Send deposit reminder" / "Send reconfirmation" buttons. All money-path and status-change actions are thin Server-Action wrappers over a shared core in lib/server/bookings.ts (the same code the mobile API calls), each guarded by an FSM, ownership checks, conditional concurrency-safe writes, audit logging, customer emails, slot updates, and cache revalidation across every booking view.

### Requests / Clients / Waitlist tab switcher
- **What it does:** Three top-level tabs on the overview page that swap the body between the requests list, the unique-clients roll-up, and the waitlist manager.
- **Why needed:** An artist needs one screen to triage new requests, look up a returning client's history, and manage city/guest-spot interest without hunting through separate pages.
- **How it works:** Tabs are Links to /bookings/overview?view=requests|clients|waitlist. The page reads searchParams.view (default 'requests') and conditionally renders ClientsView, WaitlistView, or RequestsView. Active tab is underlined with a mustard bar; no client JS, pure URL state.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:631`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:665`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:688`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:715`

### Requests list (mobile cards + desktop table)
- **What it does:** Lists every booking request for the artist, newest first, with handle/email, placement, size, preferred date, status badge, and submitted-relative-time. Renders as stacked cards on mobile and a 6-column table on desktop.
- **Why needed:** This is the artist's inbox: the at-a-glance queue of who wants a tattoo, what they want, and whether a decision is still pending.
- **How it works:** Server component queries booking_requests (id, status, customer_handle, customer_email, preferred_date, form_data, created_at) scoped to artist_id and ordered by created_at desc. Each row links to /bookings/requests/{id}. customerLabel() picks @handle then email then 'Client'; formatSize maps the size enum to a human hint; formatDate / relativeTime format dates. Responsive columns hide Size/Date/Submitted on smaller breakpoints.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:60`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:138`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:182`, `apps/web/src/lib/booking-domain.ts:29`

### Status filter chips
- **What it does:** Filters the requests list by status: All, Pending, Accepted, Deposit pending, Passed, Cancelled.
- **Why needed:** Lets the artist focus on what needs action (Pending) or chase money (Deposit pending) without scrolling past finished requests.
- **How it works:** STATUS_FILTERS array maps human labels to DB enum URL values (e.g. Accepted->approved, Passed->rejected) so bookmarks/deep links survive. Selecting a chip navigates to /bookings/overview?view=requests&status=<value>; the server query adds .eq('status', status) when status !== 'all'. Active chip is mustard-filled.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:19`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:68`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:83`, `apps/web/src/app/(artist)/bookings/overview/filter-row.tsx:82`

### Trip filter chips
- **What it does:** A second filter group that narrows requests to a specific trip (guest-spot tour), with an 'All trips' reset option.
- **Why needed:** Travelling artists who run guest spots need to see only the requests tied to a given trip when planning that leg.
- **How it works:** Only rendered when the artist has trips. Loads trips (id, title) for the artist; each option navigates to ...&trip=<id>; server query adds .eq('trip_id', trip) when trip !== 'all'. buildHref preserves the other group's active value so toggling status never drops the trip filter and vice versa. Accepts legacy ?leg= param as a fallback for trip.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:54`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:69`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:95`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:644`

### Collapsible Filter pill (threshold + active-filter summary)
- **What it does:** A single 'Filter' pill that expands to reveal the chip rows; collapsed it shows the currently active filter labels.
- **Why needed:** Keeps short lists uncluttered while still letting power users filter, and tells someone who arrived via a deep link what they're filtered to and how to clear it.
- **How it works:** Client component. Renders nothing when count < threshold (8) AND no filter is active. When a status/trip filter differs from its resetValue it's summarised after the pill ('· Pending · Berlin'). Clicking toggles the chip rows open/closed via useState. count is the total request count from a head/count query.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/filter-row.tsx:31`, `apps/web/src/app/(artist)/bookings/overview/filter-row.tsx:44`, `apps/web/src/app/(artist)/bookings/overview/filter-row.tsx:56`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:653`

### Waitlist origin tag on requests
- **What it does:** Shows a muted 'Waitlist' chip next to requests that originated from a waitlist conversion.
- **Why needed:** Lets the artist instantly recognise that a request came from someone they pulled off the waitlist rather than a fresh public submission.
- **How it works:** Renders WaitlistTag when form_data.source === 'waitlist' (set by convertWaitlistEntry). Appears in both mobile cards and the desktop table, and again on the detail page header.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:171`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:221`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:392`, `apps/web/src/app/(artist)/bookings/actions.ts:244`

### Requests empty state with share link
- **What it does:** When no requests match, shows guidance and (for the unfiltered All view) a Copy-link button and Preview link to the public booking page.
- **Why needed:** A new artist with zero requests needs an obvious next step (share my link); a filtered empty view needs to say what's empty.
- **How it works:** If bookings is empty: status==='all' -> 'No requests yet — share your booking link...' plus CopyButton(publicUrl) and a Preview anchor (target=_blank); otherwise 'No {humanStatusLabel} requests.' publicUrl = publicArtistUrl(profile.slug).
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:115`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:122`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:660`

### Clients roll-up view
- **What it does:** Aggregates all requests into one row per unique customer email, showing handle/email, booking count, latest status badge, and last-booking relative time; links to a per-client page.
- **Why needed:** Artists think in terms of people, not individual requests; this shows who's a repeat client and their most recent state.
- **How it works:** Queries booking_requests with customer_email not null, dedupes into a Map keyed by email (first row wins for handle/latestStatus, increments bookingCount). Renders count of unique customers, an empty state with share link, and rows linking to /bookings/clients/{encodeURIComponent(email)}.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:281`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:294`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:339`

### Waitlist view: shareable waitlist link
- **What it does:** Displays an always-available public waitlist URL with Copy and Preview, even when the artist's books are open.
- **Why needed:** Lets a travelling artist collect city-specific interest at any time without flipping their books closed.
- **How it works:** waitlistPublicUrl = publicArtistUrl(profile.slug, { subpath: '/waitlist' }). Shows the URL with protocol stripped, a CopyButton, and a Preview anchor. Always rendered (independent of books-open state).
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:506`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:661`

### Waitlist view: demand-by-city chart
- **What it does:** Bar-style ranking of waitlist demand grouped by city, with a link to plan a guest spot for that demand.
- **Why needed:** Helps an artist decide where to travel next by surfacing which cities have the most people waiting.
- **How it works:** buildCityDemand normalises city_text (trim/lowercase, title-cased for display), counts occurrences, sorts desc. Each row's bar width scales to the top city's count. Links to /travel to plan a guest spot.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:372`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:553`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:587`

### Waitlist entries: active list + collapsed history
- **What it does:** Lists active waitlist entries (waiting/contacted) with handle, status, email, city, note, and time; tucks converted/dismissed entries into a greyed, collapsible History section.
- **Why needed:** Keeps the main waitlist focused on who is still waiting, while preserving a record of who was added or dropped.
- **How it works:** Entries from waitlist_entries (id, customer_handle, customer_email, note, status, created_at, city_text). activeEntries = waiting|contacted; historyEntries = converted|dismissed. Converted entries read 'Added to requests' instead of the raw status. History uses a <details> disclosure; muted rows hide action buttons.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:471`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:413`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:598`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:612`

### Waitlist action: Mark contacted
- **What it does:** Marks a 'waiting' waitlist entry as 'contacted'.
- **Why needed:** Lets the artist track which people on the waitlist they've already reached out to.
- **How it works:** Button (only when status==='waiting') calls markWaitlistContacted(entryId) server action, which updates waitlist_entries.status='contacted' scoped to artist_id and revalidates /bookings/overview. Errors surface inline.
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:40`, `apps/web/src/app/(artist)/bookings/actions.ts:133`

### Waitlist action: Move to booking (convert)
- **What it does:** Converts a waitlist entry into an accepted booking request and emails the client a magic link to confirm details.
- **Why needed:** When an artist is ready to book someone off the waitlist, this creates the request and invites the client in one click.
- **How it works:** convertWaitlistEntry inserts a booking_requests row (status='approved', origin='artist_created', form_data.source='waitlist', note as description) with a fresh hashed magic-link token, sets the waitlist entry to 'converted', and sends sendWaitlistConversionEmail with link {APP_URL}/request/{token}. Revalidates booking views. Sentry-captures insert errors.
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:49`, `apps/web/src/app/(artist)/bookings/actions.ts:208`, `apps/web/src/app/(artist)/bookings/actions.ts:235`

### Waitlist action: Dismiss
- **What it does:** Dismisses a waitlist entry, moving it to History.
- **Why needed:** Lets the artist clear out people who are no longer relevant without deleting the record.
- **How it works:** dismissWaitlistEntry updates waitlist_entries.status='dismissed' scoped to artist_id and revalidates /bookings/overview. Converted/dismissed entries hide all action buttons.
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:65`, `apps/web/src/app/(artist)/bookings/actions.ts:188`

### Feature intro modal (Overview)
- **What it does:** A first-run explainer modal for the Bookings overview, keyed to whether the artist has zero requests.
- **Why needed:** Onboards a new artist to what the bookings overview does before they have any data.
- **How it works:** FeatureIntroModal featureKey='overview' isEmpty={requestCount===0}. requestCount is a head/count query of booking_requests for the artist.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:682`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:653`

### Requests list loading skeleton
- **What it does:** Animated placeholder (title, 6 filter pills, 5 table rows) shown while the requests route streams.
- **Why needed:** Avoids a blank screen on slow networks so the artist sees the page is loading.
- **How it works:** Next.js loading.tsx for the /bookings/requests segment renders pulsing muted blocks.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/loading.tsx:1`

### Legacy /bookings/requests redirect
- **What it does:** Redirects the old /bookings/requests route (and any ?status/?leg params) to /bookings/overview.
- **Why needed:** Keeps old bookmarks/links working after the requests list was folded into the unified overview.
- **How it works:** RequestsPage ignores searchParams and calls redirect('/bookings/overview').
- **Source:** `apps/web/src/app/(artist)/bookings/requests/page.tsx:1`

### Request detail header (identity, status, origin)
- **What it does:** Shows the customer label as the page title, the live status badge, a Waitlist chip if applicable, and a 'Submitted {time}' line annotated with origin ('Added from waitlist' / 'Added by you').
- **Why needed:** Gives the artist immediate context on who this is, where the request is in the pipeline, and how it entered the system.
- **How it works:** Server component loads the booking via select('*, booking_images, flash_items, trips->trip_legs->studios, slots, profiles!artist_id') scoped by id + artist_id (.single()); notFound() if absent. Header uses customerLabel, StatusBadge, relativeTime(created_at); origin text branches on form_data.source and booking.origin==='artist_created'. Back link to /bookings/overview.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:37`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:244`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:262`

### Request detail fields block
- **What it does:** A labeled detail table: Flash item (link), Instagram, Email, Placement, Size, Preferred date, Slot time, Location, Reference link, and any custom-question answers.
- **Why needed:** This is the actual brief the artist needs to judge the request: body part, size, dates, references, and answers to the artist's own custom intake questions.
- **How it works:** Reads form_data for placement/size/reference_link/custom_answers. Slot time via formatSlotDisplay(slots.starts_at, duration_minutes, artistTimeZone). Location resolved from the trip leg whose date range contains preferred_date (studio name, else trip title). formatSize maps size enum to a hint. Flash item links to /flash/items/{id}. Custom answers rendered via formatCustomAnswer per snapshot. Reference link opens in a new tab.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:297`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:75`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:97`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:347`

### Request description block
- **What it does:** Renders the free-text idea description the client submitted, preserving line breaks.
- **Why needed:** The client's own words about the tattoo are central to scoping the piece.
- **How it works:** Shown only when form_data.description is a string; rendered with whitespace-pre-wrap.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:356`

### Reference image gallery with annotations + lightbox
- **What it does:** Thumbnail grid of the client's reference images; each thumbnail shows an annotation-count badge and opens a full-screen lightbox with numbered markers overlaid on the image and a corresponding comment list. Markers can be individually hidden.
- **Why needed:** Artists work from references; annotated markers let them read exactly which part of an image the client is pointing at.
- **How it works:** Server generates 1-hour signed URLs from the 'bookings' storage bucket for each booking_images.storage_path and passes annotations. AnnotatedImageGallery (client) renders the grid; clicking opens an overlay with prev/next arrows, Esc/Arrow-key navigation, position counter, percentage-positioned numbered markers, a comment list, and an eye toggle per annotation to show/hide its marker. (A simpler ImageLightbox component without annotations also exists.)
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:225`, `apps/web/src/app/(artist)/bookings/requests/[id]/annotated-image-gallery.tsx:11`, `apps/web/src/app/(artist)/bookings/requests/[id]/annotated-image-gallery.tsx:71`, `apps/web/src/app/(artist)/bookings/requests/[id]/image-lightbox.tsx:5`

### Interested-in-buying (goods) section
- **What it does:** Lists products the client flagged interest in at submit time, with title/variant, quantity, price, an availability status chip (pending/available/unavailable), and any decline note.
- **Why needed:** Surfaces add-on merch demand so the artist can confirm what's in stock alongside the tattoo.
- **How it works:** Queries booking_interests (with products image join) scoped by booking_id + artist_id, normalises the product image embed, computes line totals via formatPrice(unitPrice*quantity, currency). Status chip colour-coded; decline note shown when unavailable. Pending interests also drive the Accept confirmation popup.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:161`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:379`

### Accept booking
- **What it does:** Approves a pending or deposit_pending request, confirms its slot, and emails the client an acceptance with a magic link to confirm details.
- **Why needed:** The core 'yes' action: an artist taps Accept to take the job and notify the client.
- **How it works:** Button calls approveBooking(id) -> approveBookingCore: FSM canTransition guard, cancels any live unpaid deposit intent, mints a fresh hashed magic-link token, conditional UPDATE (.eq('status', priorStatus)) to status='approved', flips slot to 'booked' (rolls back on failure), inserts status_changed audit, sends customer_booking_approved email with resolved studio. Optimistic UI updates status immediately and reverts on error. Verbs are 'Accept/Pass' per copy rules.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:457`, `apps/web/src/app/(artist)/bookings/actions.ts:41`, `apps/web/src/lib/server/bookings.ts:153`

### Accept confirmation popup (studio + goods availability)
- **What it does:** A modal that fires on Accept (or Request deposit) when the booking is a guest spot and/or has pending goods interests, letting the artist confirm the studio location and tick each item available/unavailable with an optional decline note.
- **Why needed:** Before the client is emailed, the artist confirms the exact studio they'll attend and which add-on items are actually available, avoiding wrong-location or out-of-stock promises.
- **How it works:** needsAcceptPopup = confirmStudio || pendingInterests.length>0. Studio block uses resolveBookingGuestSpotStudio(id) (trip-leg/slot/explicit studio). Each pending interest has a checkbox (default available) and, when unchecked, a 300-char note textarea. Confirm builds InterestDecisionPayload[] and calls approveBookingWithInterestDecisions (accept path) or applyInterestDecisions then opens the deposit form (deposit path). Decisions are surfaced in the approval email as goodsDecisions.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:117`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:234`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:115`, `apps/web/src/lib/server/bookings.ts:251`

### Pass booking (reject with confirm)
- **What it does:** Declines a request after an inline confirm step, releases its slot, and emails the client a polite decline.
- **Why needed:** Artists must be able to turn down work cleanly, with a courteous client notification and a deliberate confirm to avoid misclicks.
- **How it works:** First click flips confirmReject to show 'Pass on this request?' / 'Yes, pass' / 'Cancel'. Confirm calls rejectBooking(id) -> rejectBookingCore: FSM guard; refuses to reject a PAID deposit (tells artist to cancel instead); cancels a live unpaid intent; conditional UPDATE to 'rejected' guarded by .is('deposit_paid_at', null) to close the webhook TOCTOU; reopens slot; audit; sends customer_booking_rejected email. Available in both the pending and deposit_pending UIs.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:612`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:420`, `apps/web/src/app/(artist)/bookings/actions.ts:81`, `apps/web/src/lib/server/bookings.ts:467`

### Request deposit (inline form: amount, due date, note)
- **What it does:** Opens an inline form to request a deposit: amount (in the artist's currency), due-by date, and an optional note to the customer; sends a deposit-request email and moves the booking to deposit_pending.
- **Why needed:** Securing a deposit is how artists protect their time; this lets them set the amount/deadline and collect by card or instruct manual payment.
- **How it works:** Form pre-fills from per-artist deposit_defaults (amount, due_days, note). Client validation: amount required, parseable, >0; due date required. handleRequestDeposit calls requestDeposit(id, amount, dueAt, note) -> requestDepositCore: FSM guard, deposit-request rate limit, server floor (>=1), max 100000, 2-decimal-precision check, due-date must be YYYY-MM-DD today+. Snapshots deposit policy + currency (artistDepositCurrency from stripe_account_country). If entitled + Connect-routable, creates a Stripe PaymentIntent (on_behalf_of + transfer_data.destination, application_fee_amount = 3% or 0 if fee-sponsored, idempotencyKey deposit-intent-{id}); otherwise a manual deposit (null intent). Persists deposit fields, audits status_changed, rotates magic-link token, sends deposit-requested email.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:189`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:476`, `apps/web/src/app/(artist)/bookings/actions.ts:89`, `apps/web/src/lib/server/bookings.ts:638`

### Deposit fee breakdown preview
- **What it does:** As the artist types a deposit amount, shows the 3% processing fee and the net they'll receive (only for in-app Connect deposits).
- **Why needed:** Artists need to see exactly what Inklee takes and what lands in their account before sending the request.
- **How it works:** showFeeBreakdown = canCollectInApp && amount>0. Renders 'Processing fee (3%): −{platformFeeEur} · You receive {artistNetEur}' using PLATFORM_FEE_PERCENT and the artist's currency. Hidden for manual deposits (no fee).
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:224`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:554`, `apps/web/src/lib/platform-fee.ts:45`

### Manual-vs-in-app deposit messaging + Connect nudge
- **What it does:** Adapts the deposit form copy and helper text based on whether the artist has an active Stripe Connect account, with a 'Connect Stripe' link when they don't.
- **Why needed:** Sets correct expectations: connected artists collect by card in-app; unconnected artists collect directly and mark received, and are nudged to connect.
- **How it works:** canCollectInApp = getConnectRoutingForArtist(user.id).routeCharges (server). When false, the form shows a 'collect directly' notice and a link to /settings/payouts. Sub-button helper text and the deposit_pending UI both branch on this and on hasDepositIntent (whether THIS booking has a live card intent).
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:73`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:488`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:499`

### Stripe test-mode warning banner
- **What it does:** Shows a yellow banner in the deposit form warning that no real payment will be taken when Stripe is in test mode.
- **Why needed:** Prevents an artist in a dev/preview environment from believing a real card charge occurred.
- **How it works:** detectStripeMode(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) returns 'test' for pk_test_* keys; banner renders only when canCollectInApp && stripeMode==='test'.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:523`, `apps/web/src/lib/deposit-settings.ts:49`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:67`

### Deposit_pending state: waiting-for-card panel
- **What it does:** When a booking awaits an in-app card deposit, shows a 'Waiting for card payment' panel explaining the webhook auto-confirms it, plus a collapsible 'Client paying another way?' override.
- **Why needed:** Tells the artist the system will confirm automatically when the client pays, and offers an escape hatch if the client pays by another method.
- **How it works:** isDepositPending && hasDepositIntent renders the panel. The <details> override exposes 'Mark received manually' which calls markDepositReceived (cancelling the card intent so the client isn't double-charged).
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:371`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:388`

### Mark deposit received
- **What it does:** Manually confirms a deposit as paid and moves the booking to approved (for manual deposits this is the primary button; for in-app it's a demoted override).
- **Why needed:** Lets the artist confirm a bank-transfer/cash deposit, or override when a client paid outside the card flow.
- **How it works:** Calls markDepositReceived(id) -> markDepositReceivedCore: FSM guard (deposit_pending->approved), cancels any live card intent (avoids double charge), conditional UPDATE to status='approved' + deposit_paid_at=now, flips slot to 'booked' (rolls back deposit_paid_at on failure), audits status_changed via 'deposit_received'. Optimistic status update.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:393`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:408`, `apps/web/src/app/(artist)/bookings/actions.ts:109`, `apps/web/src/lib/server/bookings.ts:923`

### Deposit summary card
- **What it does:** Shows the requested deposit amount, due date, and note; once paid in-app, exposes the Refund button or a 'Refunded ...' note.
- **Why needed:** Gives the artist a record of what was asked and the controls to reverse it if needed.
- **How it works:** Renders when booking.deposit_amount exists. formatPrice(deposit_amount, deposit_currency). Refund state derived from the audit log (deposit_refunded entry). hasPaidInAppDeposit = deposit_payment_intent_id && deposit_paid_at gates the DepositRefundButton.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:455`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:135`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:484`

### Refund deposit
- **What it does:** Fully refunds a paid in-app card deposit to the client after an inline confirm.
- **Why needed:** Artists need a one-click way to return a client's deposit (e.g. the artist can no longer do the piece) without leaving the app for the Stripe dashboard.
- **How it works:** DepositRefundButton -> refundDeposit(id) -> refundDepositCore: requires deposit_payment_intent_id + deposit_paid_at; idempotency guard checks audit_log for an existing deposit_refunded; creates a Stripe refund with reverse_transfer + refund_application_fee (idempotencyKey refund-deposit-{id}); logs deposit_refunded with amount/currency/intent. Confirm copy spells out Inklee returns its fee, Stripe's card fee stays on the artist.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/deposit-refund-button.tsx:7`, `apps/web/src/app/(artist)/bookings/actions.ts:117`, `apps/web/src/lib/server/bookings.ts:1009`

### Cancel booking (approved, with refund disclosure)
- **What it does:** Cancels an approved booking after an inline confirm, reopening the slot, notifying the client, and auto-refunding any paid card deposit.
- **Why needed:** Plans change; an artist needs to cancel a confirmed appointment cleanly and ensure the client is made whole.
- **How it works:** CancelBookingButton (shown only when status==='approved') -> cancelBooking(id) -> cancelBookingCore: FSM guard (approved->cancelled); if a paid card deposit exists, refunds first (aborting the cancel if the refund fails so money is never stranded), else cancels a live unpaid intent; conditional UPDATE to 'cancelled'; reopens slot; audits status_changed by='artist'; sends customer_booking_cancelled_by_artist email. Confirm copy adapts based on refundsDeposit (= hasPaidInAppDeposit && !depositRefunded).
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/cancel-booking-button.tsx:13`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:500`, `apps/web/src/app/(artist)/bookings/actions.ts:125`, `apps/web/src/lib/server/bookings.ts:1090`

### Goods order panel + Mark goods picked up
- **What it does:** Shows an attached paid goods order (line items, total, fulfillment state) and a button to mark the goods as collected at the appointment.
- **Why needed:** When a client buys merch alongside the tattoo, the artist needs to track payment and hand-off at the session.
- **How it works:** Loads the most recent order for the booking (status, goods_amount, fulfillment_status, product order_items). Status text reflects picked_up / paid·awaiting pickup / pending payment. GoodsPickupButton (shown when status='paid' && fulfillment='pending_pickup') -> markGoodsPickedUp(orderId): verifies order is paid + owned, sets fulfillment_status='picked_up', revalidates the request detail.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:196`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:516`, `apps/web/src/app/(artist)/bookings/requests/[id]/goods-pickup-button.tsx:6`, `apps/web/src/app/(artist)/bookings/actions.ts:154`

### Communication activity timeline
- **What it does:** A human-readable, icon-coded chronological log of everything that happened on the booking: submitted, accepted, passed, deposit requested/paid, reminders sent (manual flagged), client edits, client cancellations.
- **Why needed:** Gives the artist an audit trail of what the client has seen and what's been done, so they know the booking's history at a glance.
- **How it works:** Server loads up to 30 audit_log rows (action, timestamp, details) for the booking. CommunicationSidebar.describe() maps raw actions to label/icon/colour; status_changed details.to drives Accepted/Passed/Deposit requested/Cancelled; internal actions (token_rotated, unknown) return null and are hidden. Empty state: 'No activity yet.'
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:125`, `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:43`, `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:174`

### Send deposit reminder (manual)
- **What it does:** Sends a one-off deposit-overdue reminder email to the client (and the artist) for a deposit_pending booking with a due date.
- **Why needed:** Lets the artist nudge a client who hasn't paid yet without waiting for the automated reminder cron.
- **How it works:** Button shown when status==='deposit_pending' && hasDepositDueDate -> sendManualDepositReminderAction(bookingId): once-per-day guard (audit_log type='deposit_overdue'), reminder rate limit, sends sendDepositOverdueCustomer + sendDepositOverdueArtist, writes reminder_sent audit (manual:true), revalidates the detail page. Inline 'Sent.' / error feedback that clears after 3s.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:125`, `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:146`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:94`

### Send reconfirmation (manual)
- **What it does:** Sends a reconfirmation-request email with a fresh magic link to a client whose appointment is upcoming.
- **Why needed:** Lets the artist proactively re-confirm an approved appointment that's still in the future.
- **How it works:** Button shown when status==='approved' && hasMagicLink && hasUpcomingDate (preferred_date on/after today in the artist timezone) -> sendManualReconfirmationAction(bookingId): once-per-day guard, rotates the magic-link token, sends sendReconfirmationRequest with resolved studio (rolls back the token if the email fails), writes reminder_sent audit (manual:true), revalidates. Inline feedback.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:127`, `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:157`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:566`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:176`

### Show more details disclosure
- **What it does:** A collapsible section with low-signal metadata: Submitted time, Decided time, Magic link state (Active/None), and Origin.
- **Why needed:** Keeps rarely-needed plumbing out of the way while still available when the artist wants to verify a magic link or decision time.
- **How it works:** <details> disclosure rendering relativeTime(created_at), relativeTime(decided_at) when present, customer_token_hash ? 'Active' : 'None', and origin with underscores replaced by spaces.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:583`

### Responsive action placement (mobile-top / desktop-right)
- **What it does:** Renders the StatusActions toolbar above the detail block on mobile/tablet and in the right column on large screens.
- **Why needed:** On a phone the artist should be able to Accept/Pass without scrolling past a dense detail block.
- **How it works:** StatusActions is rendered twice with lg:hidden and hidden lg:block wrappers, both fed identical props (booking, depositDefaults, stripeMode, canCollectInApp, currency, hasDepositIntent, confirmStudio, pendingInterests).
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:274`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:434`

### Optimistic status + concurrency-safe transitions (FSM)
- **What it does:** Every status action updates the UI immediately, reverts on error, and is guarded server-side by a finite-state-machine plus conditional writes so concurrent changes can't be clobbered.
- **Why needed:** Makes the toolbar feel instant while guaranteeing the artist can't, e.g., accept a booking the deposit webhook just confirmed, or pass a paid booking.
- **How it works:** Client uses useOptimistic/useTransition; on a returned {error} it restores booking.status and shows the message. Server core functions call canTransition(from,to) (TRANSITIONS map: pending->approved/rejected/deposit_pending/cancelled, deposit_pending->approved/rejected/cancelled, approved->cancelled, rejected/cancelled terminal) and use conditional UPDATEs (.eq('status', priorStatus)) returning 'This booking just changed. Refresh and try again.' on a 0-row result.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:84`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:174`, `apps/web/src/lib/booking-fsm.ts:3`, `packages/shared/src/booking-fsm.ts:9`

### Status badges + brand vocabulary
- **What it does:** Colour-coded status chips throughout (Pending=mustard, Awaiting deposit=rosa, Accepted=charcoal, Passed=red, Cancelled=muted) using tattoo-native labels.
- **Why needed:** Status is the single most important signal; consistent, high-visibility chips let the artist scan state instantly.
- **How it works:** StatusBadge maps DB enum to humanStatusLabel (approved->Accepted, rejected->Passed, deposit_pending->Awaiting deposit, plus waitlist labels) and a solid brand fill. Used in the list, detail header, clients view, and waitlist rows.
- **Source:** `apps/web/src/components/status-badge.tsx:28`, `packages/shared/src/status-labels.ts:8`

### Cache revalidation across all booking views
- **What it does:** After any successful status/money mutation, refreshes the overview, calendar, dashboard mirrors, and this booking's detail pages.
- **Why needed:** Ensures the artist sees consistent state everywhere immediately after acting, with no stale list/calendar drift.
- **How it works:** Web Server Actions call revalidateBookingViews(id) on success, which revalidatePath()s /bookings/overview, /bookings/calendar, /dashboard, /dashboard/calendar, and the request detail mirrors. (The shared core itself performs no revalidation; the web wrappers own it.)
- **Source:** `apps/web/src/app/(artist)/bookings/actions.ts:45`, `apps/web/src/lib/revalidate-bookings.ts:15`

**Notes:** Web-only/subtle behaviors worth flagging: (1) /bookings/requests is a pure redirect to /bookings/overview; the real list lives in overview's RequestsView. (2) The overview is one page with three URL-driven tabs (view=requests|clients|waitlist), and filters are URL params (status, trip, legacy leg) so the list state is fully bookmarkable/deep-linkable. (3) The FilterRow chips are intentionally hidden until there are >=8 requests, UNLESS a filter is already active via deep link. (4) Money-path/status logic is shared with the mobile JSON API via lib/server/bookings.ts; the web actions are thin wrappers that add cookie auth + revalidation, so web and mobile never diverge. (5) Deposit currency is the artist's settlement currency derived from stripe_account_country (artistDepositCurrency), not always EUR; formatPrice renders as 'CUR 0.00'. (6) Two distinct deposit modes: in-app card (Stripe Connect destination charge, 3% application fee, auto-confirmed by webhook) vs manual (no PaymentIntent, artist marks received). The deposit form, helper text, fee preview, and deposit_pending panel all branch on canCollectInApp (current Connect state) and hasDepositIntent (this booking's intent). (7) In-app deposits are also gated behind a 'deposits' entitlement (Solo Plus/admin comp); un-entitled artists silently fall through to manual even when Connect is active. Fee sponsorship can waive the 3%. (8) Reject refuses a PAID deposit (steers to Cancel, which refunds) and guards the write with .is('deposit_paid_at', null) to avoid a webhook TOCTOU. (9) Cancel refunds-first then cancels, aborting if the refund fails so client money is never stranded; refund/cancel both reverse_transfer + refund_application_fee so Stripe's card fee stays on the artist. (10) Refund state is derived from the audit_log (no dedicated column); refund is idempotent via an audit check + Stripe idempotency key. (11) Server-side deposit validation hardens the client form: amount >=1, <=100000, max 2 decimals, valid YYYY-MM-DD due date today+, plus a per-artist deposit-request rate limit. (12) Manual reminder/reconfirmation buttons only appear for the right status and have once-per-day-per-type guards; reconfirmation rotates and rolls back the magic-link token if the email send fails. (13) The annotated gallery uses 1-hour signed Storage URLs and supports keyboard nav (Esc/Arrows) and per-marker show/hide; a separate non-annotated ImageLightbox component also exists in the folder. (14) The Accept popup's per-item availability decisions are persisted (applyInterestDecisions) before the deposit form opens on the deposit path, and surfaced in the approval email on the accept path.


---

## 3. Bookings: calendar + appointments

This surface is the artist's month-grid calendar plus the appointment-management tooling that hangs off it. The main page at /bookings/calendar (also reached from the mobile sub-nav "Calendar" tab and from legacy /dashboard/calendar which redirects here) renders a 6-week month grid that overlays four data sources on the same canvas: approved booking_requests (colour-coded by origin), guest-spot trip legs (faint cobalt band + city label), and scheduled flash days (green chips). From any cell the artist can click to add a new appointment pre-filled with that date, click a booking chip to open a right-side appointment drawer (view/edit/cancel), or open a "+N more" day popover on busy days. The New Appointment modal creates an artist-authored approved booking with optional client confirmation email and magic link. The drawer's edit form rewrites the booking's handle/date/placement/size/description/email; its cancel path delegates to the shared cancelBookingCore so a paid card deposit is refunded and the slot released before the booking is cancelled and the client emailed. Adjacent settings power the calendar's data and export: /bookings/settings hosts the fixed-slot manager (single slot, block-of-slots, and a recurring pattern builder across weekdays or specific dates) whose open slots feed the booking flow, and /settings/calendar (plus the legacy /settings/calendar-export redirect) generates/revokes a private iCal token that serves a read-only .ics feed of approved bookings at /api/ical/[token] for subscription in Google/Apple Calendar. All booking mutations call revalidateBookingViews so the calendar, overview, dashboard, and request-detail views never drift.

### Month-grid calendar view
- **What it does:** Renders a fixed 42-cell (6-week) month grid, Monday-first, with day-of-week headers, each cell showing its date number and any entries for that day. Out-of-month cells are faintly tinted; today's date number is highlighted in a mustard pill.
- **Why needed:** Gives a tattoo artist a single at-a-glance picture of their commitments for the month so they can see how booked-up they are and spot free days.
- **How it works:** Server component CalendarPage queries booking_requests (status='approved', preferred_date not null) for the signed-in artist, maps them to CalendarEvent objects (date, handle, placement, size, description, email, origin, status), and passes them to the client CalendarView. buildMonthGrid computes the grid with startOffset=(firstDay.getDay()+6)%7. Day keys use localDateKey for timezone-stable comparison. No server action; pure read.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/page.tsx:5`, `apps/web/src/app/(artist)/bookings/calendar/page.tsx:11`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:28`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:198`

### Previous / next month navigation
- **What it does:** Two arrow buttons (‹ ›) flanking the 'Month Year' label step the grid backward/forward one month, rolling the year over at December/January boundaries.
- **Why needed:** Lets the artist look ahead to plan future availability or back to review past appointments.
- **How it works:** Client state year/month initialised from new Date(). prev() decrements month (wraps to Dec of prior year at month 0); next() increments (wraps to Jan of next year at month 11). Purely client-side; the event list is already fully loaded so no refetch.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:137`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:156`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:165`

### Approved-booking chips (colour-coded by origin)
- **What it does:** Each approved booking renders as a clickable coloured chip in its day cell, labelled with the customer label (@handle, else email, else 'Client'). Bookings the artist created show in mustard tint; client-submitted requests show in rosa tint.
- **Why needed:** Distinguishes appointments the artist manually added from real inbound client requests, and gives a one-tap entry into each appointment's details.
- **How it works:** visibleEvents are grouped by date into byDate. Each marker of kind 'booking' renders a button whose tint switches on ev.origin==='artist_created'. Label comes from customerLabel(handle,email). Clicking sets selected=ev which opens the AppointmentDrawer.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:275`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:281`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:287`, `packages/shared/src/booking-domain.ts:29`

### Flash-day chips
- **What it does:** Scheduled flash days appear as green chips in their day cell, titled with the flash day's title and linking to that flash day's detail page.
- **Why needed:** Lets the artist see flash-sheet sale days alongside regular appointments and jump to manage them.
- **How it works:** CalendarPage queries flash_days (scheduled_on not null) for the artist and passes {id,date,title}. Grouped into flashByDate; rendered as a Next Link to /flash/days/[id]. e.stopPropagation prevents the cell's add-appointment click from also firing.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/page.tsx:61`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:111`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:291`

### Guest-spot / trip-leg overlay
- **What it does:** Days covered by a trip leg get a faint cobalt background band and a small MapPin + city/studio label pinned bottom-left of each covered cell. Overlapping legs stack their cities joined by ' · '. Deliberately not rendered as a chip so guest-spot days don't read like customer appointments.
- **Why needed:** Shows the artist where they'll be travelling (guest spots) so they don't accept home-studio bookings on days they're away.
- **How it works:** CalendarPage queries trips with nested trip_legs(starts_on,ends_on,studios(name,city)), flattens to {startsOn,endsOn,label}. eachDayKey expands each leg to an inclusive list of YYYY-MM-DD keys (guarded at 400 days). tripDays set + tripLabelsByDay map drive the band and the labels. Label falls back city→studio name→trip title.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/page.tsx:37`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:66`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:123`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:316`

### Per-cell entry cap with '+N more' popover
- **What it does:** Each cell shows at most 3 markers; if more entries exist a '+N more' button appears. Clicking it opens a centred modal popover listing every booking and flash day for that day (plus the trip city labels), each item clickable to open the booking drawer or the flash day link.
- **Why needed:** Keeps busy days legible while still letting the artist drill into every appointment on a packed day.
- **How it works:** markers = bookings + flash for the day; shownMarkers = first 3; extraMarkers = remainder. '+N more' sets dayDetail=key. The popover renders dayBookings, dayFlashList and dayLabels for that key; selecting a booking sets selected and clears dayDetail. Backdrop click and ✕ close it.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:215`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:302`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:373`

### Click-cell-to-add-appointment
- **What it does:** Clicking anywhere on a day cell (the full-bleed background button, not an event chip) opens the New Appointment modal pre-filled with that date. A faint Plus icon appears top-right on hover as a desktop affordance.
- **Why needed:** Fast way to book a walk-in or DM client straight onto a known free day without retyping the date.
- **How it works:** An absolutely-positioned z-0 button covers the cell. onClick sets newDate to the cell's key (or null if the date is past/today, because the modal's date input has min=tomorrow and would otherwise be invalid) and showNew=true. isPastOrToday = key <= TODAY. aria-label announces the date.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:226`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:243`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:256`

### '+ New appointment' header button
- **What it does:** A mustard pill button in the calendar header opens the New Appointment modal with no pre-filled date, so the artist picks the date fresh.
- **Why needed:** A discoverable primary action to add an appointment from anywhere in the month without first finding the target cell.
- **How it works:** onClick sets newDate=null and showNew=true. The modal then starts with an empty controlled dateValue.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:172`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:361`

### New Appointment modal — create appointment
- **What it does:** Modal form to create an artist-authored approved booking. Fields: Instagram handle (with leading @ prefix shown), Date (custom date picker, min=tomorrow), Placement (free text), Size (select), Description (optional textarea), and a 'Send confirmation email to customer' checkbox that reveals an email field.
- **Why needed:** Lets the artist record appointments booked off-platform (DMs, in person, phone) so they show on the calendar and feed the client's portal/email if an address is given.
- **How it works:** Submits to createAppointmentAction(formData). Server strips leading @ and trims handle; trims placement/description; reads size, optional email, send_email checkbox. Validates handle, date, placement, size all present (returns specific error strings). Inserts booking_requests with status='approved', origin='artist_created', form_data={placement,size,description}, decided_at/updated_at=now, and a token hash only if an email was given. Writes audit_log action='booking_created'. If email+send_email, looks up profile display_name/slug and sends 'customer_booking_approved' email with a magic_link /request/{token}. Calls revalidateBookingViews(bookingId). Client closes modal on success, shows server error inline on failure.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:38`, `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:85`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:11`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:32`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:42`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:65`

### New Appointment — Instagram handle field
- **What it does:** Text input with a non-editable '@' prefix glyph; required; autocomplete off.
- **Why needed:** Most tattoo clients are identified by Instagram handle; this is the primary client identifier on the calendar chip.
- **How it works:** Input name=customer_handle, required at the HTML level. Server re-strips a leading @ and trims, then rejects empty with 'Instagram handle is required.'
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:91`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:20`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:32`

### New Appointment — Date picker (min tomorrow, controlled)
- **What it does:** Custom brand-styled date picker (not the native input) constrained to tomorrow onward. Tracks its value in state so a cell-click pre-fill is reliably reflected.
- **Why needed:** Prevents the artist from accidentally booking a new appointment in the past and gives a themed, mobile-friendly picker.
- **How it works:** DateInput name=preferred_date, required, min=tomorrow() (addDaysToDateKey(localDateKey(),1)). value=dateValue/onChange controlled because defaultValue alone could be cleared by the browser when below min. The picker disables days < min and submits an ISO YYYY-MM-DD via an sr-only field. Server requires date present ('Date is required.').
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:9`, `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:107`, `apps/web/src/components/date-input.tsx:138`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:33`

### New Appointment — Placement field
- **What it does:** Required free-text input for body placement, with a placeholder ('Left forearm, inner wrist...').
- **Why needed:** Placement is core to scoping a tattoo and shows in the drawer and iCal summary.
- **How it works:** Input name=placement required. Server trims and rejects empty with 'Placement is required.' Stored in form_data.placement.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:119`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:24`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:34`

### New Appointment — Size select
- **What it does:** Required dropdown of the four canonical sizes (palm-sized, hand-sized, forearm, larger) with a 'Select size' empty placeholder. In the new modal it lists the raw size keys.
- **Why needed:** Size drives session length and deposit expectations; standardising it keeps the artist's records consistent.
- **How it works:** Select name=size required, options from SIZES. Empty default value forces a choice. Server rejects empty with 'Size is required.' Stored as the key in form_data.size; rendered later via formatSize (which shows the measurement hint, e.g. '~ 15-20 cm').
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:130`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:35`, `packages/shared/src/booking-schema.ts:3`, `packages/shared/src/booking-schema.ts:26`

### New Appointment — Description textarea (optional)
- **What it does:** Optional 3-row textarea for free-text notes about the piece.
- **Why needed:** Captures design context the artist needs at the chair.
- **How it works:** textarea name=description, no required. Server trims (defaults to ''). Stored in form_data.description; shown whitespace-preserved in the drawer and as the iCal DESCRIPTION.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:146`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:26`

### New Appointment — Send confirmation email toggle + email field
- **What it does:** A checkbox 'Send confirmation email to customer'; when checked, reveals an email input. If both are present, the client gets a branded approval email containing a magic link to their request portal.
- **Why needed:** Lets the artist instantly confirm a manually-booked appointment to the client and give them a self-service portal link, without a separate message.
- **How it works:** Checkbox name=send_email (value 'on'), controlled emailEnabled toggles the conditional email input name=customer_email. Server stores customer_email (and a customer_token_hash) only if an email was given. Email only sent when both email present AND send_email==='on', via sendBookingEmail type='customer_booking_approved' with magic_link=`${appUrl}/request/${token}`. The raw token is emailed; only its sha256 hash is stored.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/new-appointment-modal.tsx:157`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:28`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:49`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:65`

### Appointment drawer — view details
- **What it does:** Right-side slide-over panel opened by clicking a booking chip. Read mode shows Date (formatted), Placement, Size (as measurement), Email (if any), Description (if any, whitespace-preserved), and Origin ('Added by you' vs 'Booking request'). Header shows the customer label.
- **Why needed:** One place to review everything about a given appointment before deciding to edit or cancel it.
- **How it works:** AppointmentDrawer receives the selected CalendarEvent. Renders Row components for each field; formatDate(event.date) and formatSize(event.size) format values. Origin label maps artist_created→'Added by you' else 'Booking request'. Closes on backdrop click, ✕, or Escape (all reset editing/confirmCancel state).
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:126`, `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:141`, `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:41`

### Appointment drawer — edit appointment
- **What it does:** Edit mode form (toggled by the 'Edit' button) lets the artist change Instagram handle, Date, Placement, Size (select shows label · hint), Description, and Customer email, then Save or Cancel.
- **Why needed:** Plans change: the client reschedules, the placement/size shifts, or a typo needs fixing, without re-creating the booking.
- **How it works:** Save submits editAppointmentAction(event.id, formData). Server re-fetches the booking, asserts artist ownership (else 'Not found.'), strips @/trims handle, reads date/placement/size/description/email, then updates booking_requests setting customer_handle, customer_email (null if blank), preferred_date, form_data merged with {placement,size,description}, updated_at=now. Writes audit_log action='booking_edited'. Calls revalidateBookingViews(id). NOTE: the edit action does not re-validate required fields server-side (relies on the form's required attributes). On success the drawer closes; errors show inline.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:56`, `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:195`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:92`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:122`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:135`

### Appointment drawer — edit Size select (label + hint)
- **What it does:** In edit mode the size dropdown shows each option as 'Label · hint' (e.g. 'Forearm · ~ 15-20 cm'), defaulted to the booking's current size.
- **Why needed:** Gives the artist concrete measurements when reclassifying the piece size.
- **How it works:** Options built from SIZES with SIZE_LABELS[s].label · SIZE_LABELS[s].hint. select name=size required, defaultValue=event.size. (Distinct from the New modal which shows bare keys.)
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:217`, `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:225`, `packages/shared/src/booking-schema.ts:9`

### Appointment drawer — cancel appointment (with confirm + refund)
- **What it does:** 'Cancel appointment' button reveals an inline confirm box ('Cancel this appointment?', plus 'client@email will be notified' if an email exists) with 'Yes, cancel' / 'Keep it'. Confirming cancels the booking, refunds any paid card deposit, releases the slot, emails the client, and removes the chip from the grid.
- **Why needed:** Cancellations are routine and must be money-safe: a tattoo artist cancelling on a client should return the client's deposit automatically rather than leaving them out of pocket.
- **How it works:** 'Yes, cancel' calls cancelAppointmentAction(event.id), which delegates to the shared cancelBookingCore. Core: ownership check; FSM guard canTransition(status,'cancelled') (only pending/deposit_pending/approved are cancellable); if a paid card deposit exists it refunds first via refundDepositCore (reverse_transfer + refund_application_fee, idempotency key refund-deposit-{id}) and aborts the cancel if the refund fails (money never stranded); a live unpaid intent is cancelled instead; conditional UPDATE to status='cancelled' (guarded on prior status); releases the slot to status='open' with rollback on failure; audit_log status_changed by='artist'; emails 'customer_booking_cancelled_by_artist' if an email exists. The web action then revalidateBookingViews(id). Client optimistically adds the id to a cancelled set so the chip disappears.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:73`, `apps/web/src/app/(artist)/bookings/calendar/appointment-drawer.tsx:159`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:146`, `apps/web/src/app/(artist)/bookings/calendar/actions.ts:161`, `apps/web/src/lib/server/bookings.ts:1090`, `apps/web/src/lib/server/bookings.ts:1108`

### Optimistic chip removal on cancel
- **What it does:** After a successful cancel, the booking's chip vanishes from the grid immediately without a full reload.
- **Why needed:** Immediate visual confirmation that the cancel took effect.
- **How it works:** onCancelled(id) adds the id to a cancelled Set; visibleEvents filters out any event whose id is in that set. revalidateBookingViews still refreshes server data underneath.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:99`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:101`, `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:355`

### Calendar legend
- **What it does:** A four-item legend below the grid mapping the tint colours to their meaning: rosa=Booking request, mustard=Added by you, cobalt=Guest spot, green=Flash day.
- **Why needed:** Makes the colour-coding self-explanatory so the artist can read the calendar at a glance.
- **How it works:** Static markup with coloured swatches keyed to the same CSS tint variables used by the chips/band.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/calendar-view.tsx:331`

### Calendar loading skeleton
- **What it does:** While the server component fetches, shows a pulsing skeleton: header bars plus a 7-column header row and 35 placeholder day cells.
- **Why needed:** Avoids a blank screen and signals the calendar is loading.
- **How it works:** Next.js loading.tsx automatically shown during the page's async render.
- **Source:** `apps/web/src/app/(artist)/bookings/calendar/loading.tsx:1`

### Calendar sub-nav entry (mobile)
- **What it does:** A 'Calendar' tab in the bookings sub-navigation pointing at /bookings/calendar (rendered only on mobile; desktop reaches it via the sidebar).
- **Why needed:** Navigation to reach the calendar from other booking sub-pages on small screens.
- **How it works:** BookingsNav config item {label:'Calendar', href:'/bookings/calendar'}; the bookings layout renders BookingsNav inside a md:hidden wrapper.
- **Source:** `apps/web/src/components/bookings-nav.tsx:5`, `apps/web/src/app/(artist)/bookings/layout.tsx:11`

### Slots manager — entry point and listing
- **What it does:** The fixed-slots manager (legacy /bookings/slots redirects here) lives in the Books & Availability settings page. It only appears when booking_mode='fixed_slots'. It lists every non-cancelled slot (date, time + duration, timezone, status badge) sorted ascending, with a delete control on open slots.
- **Why needed:** Artists who book by published time slots (rather than 'preferred date') need to create and curate the bookable inventory that clients pick from; these slots back the calendar's booked appointments.
- **How it works:** BookingSettingsPage reads profile.timezone + booking_mode, queries slots (artist's, status != 'cancelled', ordered by starts_at), formats each via formatSlotDisplay(starts_at,duration,timezone). SlotList renders rows with StatusBadge; only 'open' slots show a 'delete' link. The Slots section is conditional on bookingMode==='fixed_slots'.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/page.tsx:3`, `apps/web/src/app/(artist)/bookings/settings/page.tsx:30`, `apps/web/src/app/(artist)/bookings/settings/page.tsx:106`, `apps/web/src/app/(artist)/bookings/slots/slot-list.tsx:37`

### Slots — delete open slot
- **What it does:** A 'delete' link on each open slot removes it; the row disappears immediately. Only open (unbooked) slots are deletable.
- **Why needed:** Lets the artist pull back availability they no longer want to offer, without affecting already-booked slots.
- **How it works:** deleteSlotAction(slotId) deletes from slots where id=slotId AND artist_id=user AND status='open' (so booked/cancelled slots can't be deleted via this path), revalidatePath('/bookings/slots'). Client optimistically adds the id to a deleted set.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-list.tsx:18`, `apps/web/src/app/(artist)/bookings/slots/slot-list.tsx:52`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:197`

### Slots — empty state
- **What it does:** When no slots exist, shows 'no slots yet. add one above.'
- **Why needed:** Guides a first-time fixed-slots artist to create their first slot.
- **How it works:** SlotList renders the empty card when visible (non-deleted) slots length is 0.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-list.tsx:27`

### Slots — Add time slot (modal + pattern builder)
- **What it does:** An '+ Add time slot' dashed button opens a modal hosting the SlotPatternBuilder: define one or more time windows and apply them to either specific dates or selected weekdays across a date range. Shows a live preview count of slots to be created.
- **Why needed:** Bulk-publishing availability (e.g. 'every Tue/Thu 10-14 for the next month') is far faster than adding slots one at a time.
- **How it works:** AddSlotButton toggles the modal. SlotPatternBuilder collects windows[] (add/remove time windows, each needs start<end), apply mode toggle (Specific dates vs Weekdays), weekday pills, From/To date pickers (min=tomorrow) OR an add-date list of specific dates. slotCount = validWindows × dateCount preview. Submit posts windows_json, apply_mode, and weekdays_json+from_date+to_date OR dates_json to createSlotsFromPatternAction. Server re-validates windows (end>start), weekday/date ranges, generates one slot per window per matching date via localToUTC, inserts all with status='open', revalidatePath('/bookings/settings'), returns {success,count}. Auto-closes ~1s after success.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/add-slot-button.tsx:11`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:116`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:96`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:171`

### Slots — time-window add/remove
- **What it does:** In the pattern builder, '+ Add time window' adds another start–end pair; each extra window has an × to remove it. Each window becomes one appointment slot per chosen date.
- **Why needed:** Supports multiple sittings per day (e.g. a morning and afternoon slot) in one bulk create.
- **How it works:** windows state array; addWindow appends {id:crypto.randomUUID(),start,end}; removeWindow filters by id; updateWindow edits a field. validWindows keeps only those with start && end && end>start. Helper text notes times are in the artist's {timezone}.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:65`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:103`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:182`

### Slots — apply to Weekdays mode
- **What it does:** Toggling 'Weekdays' shows Mo–Su pills (multi-select) plus From/To date pickers; slots are created for every matching weekday in the range for each window.
- **Why needed:** Sets up a recurring weekly schedule (e.g. works Tue/Thu) across a span of weeks at once.
- **How it works:** toggleDay adds/removes weekday indices (Mon=0). countDatesInRange previews. Server applyMode==='weekdays' parses weekdays_json + from_date/to_date, iterates dates via addDaysToDateKey, includes a date if (getDay()+6)%7 is in weekdays. Client validates at least one weekday and a valid range before submit; server re-validates ('Select at least one weekday.', 'Date range is required.').
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:84`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:245`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:132`

### Slots — apply to Specific dates mode
- **What it does:** Toggling 'Specific dates' shows a date picker + Add button that builds a list of chosen dates (each shown as a removable chip); slots are created for exactly those dates.
- **Why needed:** Handles irregular availability (one-off open days, guest-spot dates) that don't fit a weekday pattern.
- **How it works:** addDate pushes the picked date into a sorted, de-duped specificDates list; removeDate filters it. Server applyMode==='dates' parses dates_json, requires at least one ('Add at least one date.'). Same per-window-per-date slot generation.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:92`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:286`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:155`

### Slots — single-slot and block create (createSlotForm)
- **What it does:** An alternative CreateSlotForm (with Single slot / Block of slots tabs) creates either one slot (date+start time+duration) or a block (date+start+end+duration) that auto-splits the window into back-to-back sub-slots, with a live count and success message.
- **Why needed:** Quick way to add a single appointment slot or chop a working block (e.g. 10:00-18:00 into 2-hour slots).
- **How it works:** Single mode → createSlotAction (localToUTC start, ends_at = start + duration*60000, status='open', revalidate /bookings/slots). Block mode → createSlotBlockAction → generateSubSlots(date,start,end,duration,tz) which packs as many full duration slots as fit (returns 'No slots can fit in that time range.' if none), bulk-inserts. Durations offered: 30/60/90/120/150/180/240 min. countSubSlots previews. (NB: this component exists in the slots folder; the settings page wires the pattern builder via AddSlotButton.)
- **Source:** `apps/web/src/app/(artist)/bookings/slots/create-slot-form.tsx:26`, `apps/web/src/app/(artist)/bookings/slots/create-slot-form.tsx:38`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:10`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:51`, `packages/shared/src/timezone.ts:62`

### Slot status badge
- **What it does:** Each slot row shows a status badge (open / booked / etc.) and the delete control is gated to 'open'.
- **Why needed:** Tells the artist at a glance which slots are still available vs already taken so they don't delete booked time.
- **How it works:** StatusBadge renders slot.status; SlotList only renders the delete button when status==='open'. Booked slots are flipped by the approve path (slots.status='booked') and released ('open') on reject/cancel.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-list.tsx:51`, `apps/web/src/lib/server/bookings.ts:201`, `apps/web/src/lib/server/bookings.ts:1154`

### Calendar export — generate iCal feed link
- **What it does:** On /settings/calendar (and the legacy /settings/calendar-export which redirects there) a 'Generate feed link' button mints a private iCal subscription URL; once present the page shows the feed URL in monospace with subscription instructions.
- **Why needed:** Lets the artist see their Inklee approved bookings inside the calendar app they already live in (Google/Apple Calendar) instead of checking the dashboard.
- **How it works:** Form action generateIcalToken: server generates crypto.randomBytes(16).hex token, merges it into profiles.settings.ical_token, revalidatePath('/settings/calendar'). The page then builds feedUrl=`${appUrl}/api/ical/${token}`.
- **Source:** `apps/web/src/app/(artist)/settings/calendar/page.tsx:32`, `apps/web/src/app/(artist)/settings/calendar/page.tsx:59`, `apps/web/src/app/(artist)/settings/calendar/actions.ts:7`, `apps/web/src/app/(artist)/settings/calendar-export/page.tsx:1`

### Calendar export — revoke and regenerate
- **What it does:** 'Revoke and generate new link' deletes the current token (invalidating the old feed URL) so a new one can be generated; useful if a feed URL leaked.
- **Why needed:** The feed URL is an unauthenticated bearer link to the artist's booking data; revocation is the kill-switch if it's shared or compromised.
- **How it works:** Form action revokeIcalToken: removes settings.ical_token from the profile and revalidatePath('/settings/calendar'). After revoke the page returns to the no-feed state with the 'Generate feed link' button.
- **Source:** `apps/web/src/app/(artist)/settings/calendar/page.tsx:44`, `apps/web/src/app/(artist)/settings/calendar/actions.ts:37`

### iCal feed endpoint (.ics)
- **What it does:** GET /api/ical/[token] returns a text/calendar .ics document of the artist's approved bookings (one all-day VEVENT per booking: SUMMARY 'customer — placement', optional DESCRIPTION). Downloads as inklee.ics and is cache-disabled so calendar apps always see fresh data.
- **Why needed:** This is the actual subscribable feed standing behind the export link; it keeps the artist's external calendar continuously in sync with approved Inklee bookings.
- **How it works:** Route handler looks up the profile by settings->>ical_token using the service client (RLS-bypassing, because the request is unauthenticated and the token is the credential); 404 if no match. Queries booking_requests (artist's, status='approved', preferred_date not null). Builds VCALENDAR with X-WR-CALNAME='{display_name} — inklee', DTSTART;VALUE=DATE (all-day), icalEscape on summary/description. Returns Content-Type text/calendar; charset=utf-8, Content-Disposition attachment filename inklee.ics, Cache-Control no-store. Token is the only authz; revoking it via settings immediately breaks the feed.
- **Source:** `apps/web/src/app/api/ical/[token]/route.ts:12`, `apps/web/src/app/api/ical/[token]/route.ts:18`, `apps/web/src/app/api/ical/[token]/route.ts:28`, `apps/web/src/app/api/ical/[token]/route.ts:55`, `apps/web/src/app/api/ical/[token]/route.ts:67`

**Notes:** Routing/redirect map: /bookings/slots redirects to /bookings/settings (the slot manager UI lives in the Books & Availability settings page, gated on booking_mode='fixed_slots'); /dashboard/calendar redirects to /bookings/calendar; /settings/calendar-export redirects to /settings/calendar. The two settings pages (calendar and calendar-export) and their action files are near-identical clones differing only in their revalidatePath target — both render 'Calendar export' and share the same generate/revoke logic against profiles.settings.ical_token.

Data sources on the calendar are all read-only fetches in the page server component; only the calendar drawer/modal actions (create/edit/cancel) mutate, and all three call revalidateBookingViews which refreshes /bookings/overview, /bookings/calendar, /dashboard, /dashboard/calendar and (for id) the request-detail pages — so the calendar and overview never drift. The calendar only ever shows status='approved' bookings; pending/rejected/cancelled never appear here. deposit_pending bookings also do not appear until approved.

Validation asymmetry worth noting: createAppointmentAction validates handle/date/placement/size server-side with specific messages, but editAppointmentAction does NOT re-validate required fields server-side (it trusts the form's required attributes), so a crafted request could blank fields on edit. The New modal's size select shows bare keys while the drawer's edit select shows 'Label · hint' — inconsistent presentation of the same field. The New modal date input enforces min=tomorrow; clicking a past/today cell deliberately opens with no pre-fill to avoid an invalid-below-min state.

Money-safety conveniences are concentrated in cancelBookingCore (shared with the booking-detail and mobile cancel paths): artist cancel refunds a paid card deposit first and aborts the cancel if the refund fails (client money never stranded behind a cancelled booking), cancels a live unpaid intent otherwise, and is idempotent against an already-recorded refund. Slot release/booking flips happen with rollback (restoreBookingAfterSlotFailure) if the slots update fails.

iCal security model: the feed is an unauthenticated bearer URL served via the RLS-bypassing service client, keyed only on a 16-byte random token stored in profiles.settings.ical_token; the only mitigation against leakage is the revoke button. The slots delete action is scoped to status='open' and artist ownership, so booked slots can't be deleted out from under a client. Slot creation timezone math (localToUTC/generateSubSlots) uses the artist's profile.timezone, defaulting to Europe/Berlin when unset.


---

## 4. Bookings: clients

The Clients surface is the artist's lightweight CRM, derived entirely from booking requests (there is no separate "client" record). It has two screens. The list screen lives as a tab inside the unified Bookings overview: `/bookings/clients` is a pure redirect to `/bookings/overview?view=clients`, where the `ClientsView` server component aggregates every booking request by `customer_email` into one row per unique customer, showing handle, email, lifetime booking count, latest status badge, and relative time since last booking. Tapping a client opens the detail screen at `/bookings/clients/[email]` (the email is URL-encoded), which shows the client's identity (handle or email), a "N bookings - M approved" summary, a private free-text Notes editor saved via the `saveClientNotesAction` server action into the RLS-protected `client_notes` table (one row per artist+email, upserted), and a full reverse-chronological booking history where each row links to the corresponding booking request detail at `/bookings/requests/[id]`. Empty states on both screens prompt the artist to copy/preview their public booking link. The whole surface is read-derived from `booking_requests`; the only writable data is the per-client notes. Older `/dashboard/clients` and `/dashboard/clients/[email]` routes redirect into this surface for backward compatibility. There is no free-text search, sort control, or column toggle on this surface; ordering is fixed and clients are grouped purely by email presence.

### Client list (unique customers, aggregated by email)
- **What it does:** Renders one row per unique customer email across all of the artist's booking requests, deduplicating multiple bookings from the same person into a single client entry.
- **Why needed:** A tattoo artist gets repeat clients and multiple requests from the same person; this collapses the noisy request feed into a clean roster of actual people so the artist can see who their clients are and who books repeatedly.
- **How it works:** Server component ClientsView queries booking_requests (customer_email, customer_handle, status, created_at) for the current user, filtering out null emails (.not('customer_email','is',null)), ordered created_at desc. It folds rows into a Map keyed by email; the first (most recent) row seeds handle/lastBookingAt/latestStatus, and subsequent rows only increment bookingCount. RLS scopes to artist_id = auth.uid() via the bookings query .eq('artist_id', user.id). No pagination, no search, no server-side filter; the full set is materialized client-side into the list.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:281-370`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:287-308`

### Clients route redirect into Bookings overview tab
- **What it does:** The standalone /bookings/clients URL immediately redirects to /bookings/overview?view=clients so the client list is shown as a tab of the unified Bookings page.
- **Why needed:** Keeps a stable, bookmarkable /bookings/clients URL (used by breadcrumbs and legacy links) while consolidating the actual UI into the single Bookings overview with Requests/Clients/Waitlist tabs.
- **How it works:** clients/page.tsx is a server component that calls redirect('/bookings/overview?view=clients'). The overview page reads searchParams.view and renders ClientsView when view === 'clients'.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/page.tsx:1-5`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:631-732`

### Clients tab selector in Bookings overview
- **What it does:** Provides Requests / Clients / Waitlist tabs at the top of the Bookings overview; selecting Clients shows the client roster and keeps the tab visually active.
- **Why needed:** Lets the artist switch between the raw request feed, the people-centric client view, and the waitlist without leaving the page.
- **How it works:** tabs array {Requests,Clients,Waitlist}; each is a Link to /bookings/overview?view=<value>. isActive = view === tab.value drives the mustard underline. Selecting Clients sets view=clients which branches to <ClientsView>.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:665-713`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:715-716`

### Unique-customer count summary
- **What it does:** Shows a header line above the list: 'N unique customers' (singular 'customer' when N === 1).
- **Why needed:** Gives the artist an at-a-glance sense of their total distinct client base size.
- **How it works:** Renders clients.length with a singular/plural switch. clients is the materialized array from the email-keyed Map.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:313-317`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:310`

### Client row: handle / email identity display
- **What it does:** Each list row shows '@handle' as the primary line when a handle exists, otherwise falls back to the raw email; the email is always shown as a secondary muted line.
- **Why needed:** Artists recognize clients by their Instagram handle far more than by email, but email is the stable key, so both are surfaced.
- **How it works:** Primary line: client.handle ? `@${client.handle}` : client.email. Secondary line: client.email (truncated). handle comes from the most-recent booking's customer_handle (may be empty string).
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:346-353`

### Client row: lifetime booking count
- **What it does:** Shows 'N bookings' (singular 'booking' when N === 1) per client row.
- **Why needed:** Lets the artist instantly spot repeat clients vs one-time requesters when scanning the roster.
- **How it works:** client.bookingCount, incremented once per booking_requests row sharing that email, with singular/plural switch.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:354-358`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:305-307`

### Client row: latest status badge
- **What it does:** Renders a colored StatusBadge for the client's most recent booking status (Pending/Accepted/Awaiting deposit/Passed/Cancelled).
- **Why needed:** Tells the artist where their last interaction with this person stands without opening the detail page (e.g. is there an outstanding pending request?).
- **How it works:** StatusBadge status={client.latestStatus}; latestStatus is the status of the first (most recent) booking row for that email. StatusBadge maps DB enum to humanStatusLabel text and a solid brand fill (pending=mustard, deposit_pending=rosa, approved=charcoal, rejected=red, cancelled=muted).
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:359`, `apps/web/src/components/status-badge.tsx:12-35`, `packages/shared/src/status-labels.ts:8-31`

### Client row: relative last-booking time
- **What it does:** Shows a relative timestamp (e.g. '3d ago', 'just now') for the client's most recent booking, hidden on the smallest screens.
- **Why needed:** Helps the artist gauge recency / re-engagement and prioritize follow-ups.
- **How it works:** relativeTime(client.lastBookingAt) inside a span hidden below the sm breakpoint. relativeTime buckets the diff into just now / Xm ago / Xh ago / Xd ago.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:360-362`, `packages/shared/src/format.ts:3-12`

### Client row: open client detail (navigation)
- **What it does:** Each client row is a full-row link that opens the client detail page; the email is URL-encoded into the path.
- **Why needed:** Gives the artist a tap target to drill into a single person's notes and full booking history.
- **How it works:** Link href={`/bookings/clients/${encodeURIComponent(client.email)}`}. Hover highlights the row (workspace-hover color). Layout stacks on mobile and goes row-wise at md.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:340-365`

### Empty state with copy/preview booking link
- **What it does:** When the artist has zero clients, shows 'No clients yet. Share your booking link to start accepting requests.' plus a CopyButton and a 'Preview ->' link to the public page (only if the artist has a slug).
- **Why needed:** A new artist with no clients needs a clear next action (share the link) rather than a dead-end empty screen.
- **How it works:** Branch when clients.length === 0. publicUrl is derived in the overview page via publicArtistUrl(profile.slug). CopyButton copies publicUrl to clipboard; Preview is an external <a target=_blank> to the public booking page.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:319-337`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:653-660`

### Client detail page (per-email view)
- **What it does:** Renders the dedicated client page for one customer email: breadcrumb, identity header, booking summary, notes editor, and booking history.
- **Why needed:** Gives the artist a single consolidated profile for a person before a session: who they are, what they have requested, and the artist's private notes.
- **How it works:** ClientDetailPage decodes encodedEmail via decodeURIComponent, then runs two parallel Supabase queries: booking_requests (id,status,preferred_date,created_at,customer_handle,form_data) filtered by artist_id and customer_email ordered created_at desc, and client_notes (notes) single() filtered by artist_id+customer_email. If no bookings exist, calls notFound() (404). handle/approved-count derived from the bookings array.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:8-107`, `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:21-38`

### Client detail: 404 for unknown email
- **What it does:** Returns a not-found page if the email has no booking requests for this artist.
- **Why needed:** Prevents showing a hollow profile for an email the artist never received a booking from (and enforces that clients only exist as a projection of bookings).
- **How it works:** if (!bookings || bookings.length === 0) notFound(); This also doubles as an authorization guard since the query is scoped to artist_id = user.id, so another artist's client email yields 404.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:38`

### Client detail: breadcrumb back to Clients
- **What it does:** Shows 'Clients / @handle (or email)' breadcrumb; 'Clients' links back to the client list.
- **Why needed:** Easy one-tap return to the roster after viewing a client.
- **How it works:** Link href='/bookings/clients' (which redirects to the Clients tab). Current segment shows `@${handle}` when handle present else the decoded email.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:45-56`

### Client detail: identity header (handle + email)
- **What it does:** Large title showing '@handle' (or email fallback) with the email as a sub-line.
- **Why needed:** Confirms exactly which client is being viewed, surfacing both the recognizable handle and the canonical email.
- **How it works:** h1 = handle ? `@${handle}` : customerEmail; sub-paragraph always the customerEmail. handle taken from bookings[0].customer_handle (most recent).
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:58-62`

### Client detail: bookings + approved summary
- **What it does:** Shows 'N bookings - M approved' (singular 'booking' when N === 1).
- **Why needed:** Quick measure of how engaged/valuable a client is and how many of their requests turned into accepted work.
- **How it works:** bookings.length with plural switch; approved = bookings.filter(b => b.status === 'approved').length. Note 'approved' is the DB enum (the human-facing verb elsewhere is 'Accepted'); this summary line uses the literal word 'approved'.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:63-66`, `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:41`

### Private client notes editor
- **What it does:** A multi-line textarea (5 rows, non-resizable) for free-text private notes about the client, pre-filled with any saved notes, with a 'Save notes' button.
- **Why needed:** Lets the artist record private context (allergies, preferences, prior session details, no-show history, deposit arrangements) that should never be visible to the client.
- **How it works:** NotesEditor (client component) wraps a form bound via useActionState to saveClientNotesAction. Hidden input carries customer_email; textarea name='notes' defaultValue=defaultNotes (from client_notes.notes or ''), placeholder 'Private notes - only visible to you'. Submit posts FormData to the server action.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/notes-editor.tsx:9-49`, `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:69-75`

### Save notes server action (upsert)
- **What it does:** Persists the notes for this artist+client, creating or updating the single client_notes row.
- **Why needed:** Durable storage of the artist's private client notes across sessions and devices.
- **How it works:** saveClientNotesAction: requires an authenticated user (else {error:'not authenticated'}); reads customer_email and notes from FormData; trims notes; rejects when email missing ({error:'missing customer email'}). Upserts into client_notes {artist_id, customer_email, notes, updated_at:now} with onConflict 'artist_id,customer_email' (the unique constraint), so it overwrites in place. On DB error returns {error: error.message}. On success returns {success:true} and revalidatePath(`/bookings/clients/${encodeURIComponent(email)}`). RLS policy artists_manage_own_client_notes restricts to artist_id = auth.uid().
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/actions.ts:8-37`, `apps/web/supabase/migrations/0008_client_notes.sql:1-18`

### Notes editor: save feedback states (error / saved / pending)
- **What it does:** Shows inline feedback: an error message in destructive color on failure, 'Saved.' in muted text on success, and a spinner on the button while pending.
- **Why needed:** Confirms to the artist that their notes actually persisted (or surfaces why they didn't) so they don't lose context they typed.
- **How it works:** useActionState returns [state, action, pending]. If state has 'error' renders <p text-destructive>{state.error}</p>; if 'success' renders 'Saved.'; button disabled while pending and shows <Spinner/> instead of 'Save notes'. The textarea uses defaultValue (uncontrolled) so its content survives the round trip.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/notes-editor.tsx:16-46`

### Notes whitespace trimming / empty allowed
- **What it does:** Trims leading/trailing whitespace from notes before saving and allows saving an empty notes string (effectively clearing notes).
- **Why needed:** Keeps stored notes clean and lets the artist wipe a note by clearing the field and saving.
- **How it works:** notes = (formData.get('notes') as string).trim(); empty result is permitted (no min-length check); column default is '' and is NOT NULL. Only the email is required.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/actions.ts:19-21`, `apps/web/supabase/migrations/0008_client_notes.sql:5`

### Booking history list (per client, reverse chronological)
- **What it does:** Lists every booking request from this client, newest first, each row showing placement, preferred date (or 'No date'), relative submission time, and a status badge.
- **Why needed:** Gives the artist the full request history for a person in one place to understand context and decide on new requests.
- **How it works:** Iterates the bookings array (already ordered created_at desc). Per row: fd = booking.form_data; placement = fd?.placement ?? '-'; date line = (preferred_date ? formatDate : 'No date') + ' - submitted ' + relativeTime(created_at); StatusBadge status={booking.status}.
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:77-104`

### Booking history row: open request detail (navigation)
- **What it does:** Each booking history row links to the full booking request detail page.
- **Why needed:** Lets the artist jump from a client's history straight into a specific request to accept/pass it, view images, or manage deposits.
- **How it works:** Link href={`/bookings/requests/${booking.id}`} per row, with hover highlight (hover:bg-muted/20).
- **Source:** `apps/web/src/app/(artist)/bookings/clients/[email]/page.tsx:83-101`

### Client list loading skeleton
- **What it does:** Shows an animated placeholder skeleton (title, sub-line, and 5 shimmer rows) while the clients route segment loads.
- **Why needed:** Gives immediate visual feedback so the artist isn't staring at a blank screen during data fetch.
- **How it works:** Next.js loading.tsx for the /bookings/clients segment renders pulse-animated divs (h-8/h-4 header, 5 rows with name/sub/count/badge placeholders).
- **Source:** `apps/web/src/app/(artist)/bookings/clients/loading.tsx:1-23`

### Legacy dashboard/clients redirects
- **What it does:** Old routes /dashboard/clients and /dashboard/clients/[email] redirect to the new /bookings/clients and /bookings/clients/[email] locations.
- **Why needed:** Preserves old bookmarks, emails, and deep links after the surface was relocated from the dashboard into Bookings.
- **How it works:** dashboard/clients/page.tsx calls redirect('/bookings/clients'); dashboard/clients/[email]/page.tsx awaits params then redirect(`/bookings/clients/${email}`). (Note: the [email] redirect forwards the already-encoded segment.)
- **Source:** `apps/web/src/app/(artist)/dashboard/clients/page.tsx:1-4`, `apps/web/src/app/(artist)/dashboard/clients/[email]/page.tsx:1-9`

### Mobile Bookings sub-nav entry (Overview, includes Clients tab)
- **What it does:** On mobile, the Bookings layout renders a section nav with an 'Overview' item that lands on the page hosting the Clients tab.
- **Why needed:** Mobile users reach the clients roster through the Overview sub-nav since the desktop sidebar isn't shown on small screens.
- **How it works:** BookingsLayout renders <BookingsNav> only on md:hidden. BookingsNav lists Overview -> /bookings/overview (which defaults to the Requests tab; the artist taps the Clients tab from there). There is no standalone 'Clients' item in this nav.
- **Source:** `apps/web/src/app/(artist)/bookings/layout.tsx:9-16`, `apps/web/src/components/bookings-nav.tsx:3-13`

**Notes:** Key subtleties: (1) There is NO "client" entity in the DB; the entire client list and detail are projections of booking_requests, deduped by customer_email. The only writable client data is the per-artist notes in the client_notes table. (2) Clients with a NULL customer_email are excluded from the list (.not('customer_email','is',null)), so handle-only requests without an email never appear as clients. (3) No free-text search, no sort control, no column toggles, no filter chips exist on the Clients surface (unlike the Requests tab, which has a FilterRow with Status+Trip groups). Ordering is fixed: list is created_at desc, deduped keeping the most recent row's handle/status/time; detail history is created_at desc. (4) The detail summary line literally says 'approved' (the raw enum word) at page.tsx:65, whereas the StatusBadge and humanStatusLabel render the brand verb 'Accepted' for the same status. This is an inconsistency with the Slice-60a Accept/Pass copy unification. (5) Notes validation is minimal: email required, notes trimmed, empty allowed; upsert is keyed on the (artist_id, customer_email) unique constraint. The action re-checks auth and relies on RLS (artist_id = auth.uid()) for tenant isolation. (6) The standalone /bookings/clients page is a pure redirect into the overview tab; the real list UI is the ClientsView server component inside overview/page.tsx. (7) Empty states (both list and detail-absent) and the list both depend on profile.slug to render the public booking link Copy/Preview affordances; with no slug those controls are hidden. (8) handle can be an empty string (customer_handle ?? '') so the '@handle vs email' fallback hinges on truthiness of the handle string. (9) The legacy [email] redirect forwards the raw (already-encoded) email segment, which works because the destination expects an encoded segment.


---

## 5. Bookings: waitlist

The waitlist surface lets an artist collect interest from clients who want a tattoo when no booking slot is currently available, and manage that queue. There is no longer a standalone /bookings/waitlist page: both that route and the legacy /dashboard/waitlist route now redirect to /bookings/overview?view=waitlist, where Waitlist is the third tab on the unified Bookings page (alongside Requests and Clients). The artist-facing view surfaces an always-shareable public waitlist link, a "Demand by city" bar chart aggregated from signup cities, a list of active entries (waiting/contacted) with per-row actions, and a collapsed History section for converted/dismissed entries. Per entry the artist can Mark contacted, Move to booking (which creates an approved booking_request, fires a magic-link "spot for you" email, and tags the request with a Waitlist chip), or Dismiss. The public side is a single reusable WaitlistForm captured on two surfaces: the dedicated, always-open /[slug]/waitlist page and the books-closed state of the artist's main /[slug] booking page. The form captures Instagram handle, email, optional city, and an optional 280-char note, protected by a honeypot field and a 3-per-IP-per-hour rate limit, and on success sends the client a waitlist-confirmation email. The same status-change actions back the mobile API so web and mobile do not diverge.

### Standalone /bookings/waitlist route redirect
- **What it does:** The old dedicated waitlist page no longer renders its own UI; it server-redirects to /bookings/overview?view=waitlist.
- **Why needed:** Artists who bookmarked the old waitlist page or follow stale in-app links still land on the live waitlist tab instead of a 404.
- **How it works:** Server component calls redirect("/bookings/overview?view=waitlist"). Comment notes it was moved 2026-05-24 because it took sidebar space it didn't earn for most artists.
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/page.tsx:1-9`

### Legacy /dashboard/waitlist route redirect
- **What it does:** An even older dashboard-era waitlist URL also redirects to the new waitlist tab.
- **Why needed:** Preserves any historic deep links from the pre-overview information architecture.
- **How it works:** Server component calls redirect("/bookings/overview?view=waitlist").
- **Source:** `apps/web/src/app/(artist)/dashboard/waitlist/page.tsx:1-5`

### Waitlist tab on the Bookings overview
- **What it does:** Adds a 'Waitlist' tab to the Bookings page tab bar (Requests / Clients / Waitlist); selecting it renders the waitlist view.
- **Why needed:** Keeps the waitlist next to requests and clients so the artist manages their whole pipeline in one place.
- **How it works:** BookingOverviewPage reads ?view searchParam (default 'requests'). The tab Links point to /bookings/overview?view=waitlist; the active tab gets a mustard underline. view==='waitlist' renders <WaitlistView>.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:665-732`

### Shareable waitlist link card
- **What it does:** Shows the artist's public always-open waitlist URL (slug + /waitlist) with explanatory copy, a Copy-link button, and a Preview link.
- **Why needed:** Lets an artist collect city-specific interest while travelling without flipping their main books closed, since this link accepts signups regardless of books-open state.
- **How it works:** waitlistPublicUrl is built via publicArtistUrl(profile.slug, { subpath: '/waitlist' }). URL is rendered with protocol stripped for display; CopyButton copies the full URL; Preview opens it in a new tab (target=_blank, rel=noopener noreferrer). Card only renders when the profile has a slug.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:506-533`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:660-663`, `apps/web/src/lib/public-url.ts:67-76`, `apps/web/src/components/copy-button.tsx:1-34`

### Empty-state for zero waitlist entries
- **What it does:** When the artist has no waitlist entries, shows guidance that signups appear here from the public page or shareable link, plus a link to Booking Settings.
- **Why needed:** Tells a new artist where waitlist entries come from instead of presenting a blank panel.
- **How it works:** When list.length === 0, renders bordered empty card; the 'Open Booking Settings' link (Link to /bookings/settings) renders only when publicUrl is truthy (profile has a slug).
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:535-549`

### Demand by city chart
- **What it does:** Aggregates waitlist entries by their city_text into a horizontal bar chart sorted by descending count, with a per-row 'N person/people' label and total 'N on waitlist'.
- **Why needed:** Shows an artist which cities have the most pent-up demand so they can plan future guest spots where clients actually are.
- **How it works:** buildCityDemand normalizes city_text (trim + lowercase key, Title-cased label), counts occurrences, skips blank cities, and sorts by count desc. Bar width = round(count/topCount*120)px (min 12px). Renders only when list.length > 0; shows a fallback line when no entry has a city.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:372-387`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:552-595`

### Plan a guest spot link from demand
- **What it does:** Below the city chart (when there is demand), a link to /travel inviting the artist to plan a guest spot for that demand.
- **Why needed:** Turns observed city demand directly into the action of scheduling a trip/guest spot.
- **How it works:** Renders only when cityDemand.length > 0; Link href='/travel' with text 'Plan a guest spot for this demand'.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:586-593`

### Active waitlist entries list
- **What it does:** Lists entries with status 'waiting' or 'contacted' as rows showing handle, status badge, email, city (with map-pin icon), note (line-clamped to 2 lines), and relative signup time, plus action buttons.
- **Why needed:** Shows the artist exactly who is still waiting and the context they provided so the artist can decide who to contact or book.
- **How it works:** WaitlistView queries waitlist_entries for the cookie-session artist (id, customer_handle, customer_email, note, status, created_at, city_text) ordered by created_at desc; filters to waiting/contacted as activeEntries; each renders a non-muted <WaitlistEntryRow> with a rosa Users IconChip. Falls back to 'No active waitlist entries right now.' when none.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:471-499`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:400-469`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:597-608`

### History (converted + dismissed) collapsible section
- **What it does:** A collapsed, greyed-out accordion listing terminal entries (converted/dismissed) with a count, expandable via a chevron.
- **Why needed:** Keeps resolved entries out of the way while preserving a record of who was queued and where they went.
- **How it works:** historyEntries = entries with status 'converted' or 'dismissed'. Rendered in a native <details>/<summary> with 'History (N)' and a ChevronDown that rotates on open. Each row is a muted <WaitlistEntryRow muted /> (opacity-60, action buttons hidden). Section only renders when historyEntries.length > 0.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:496-498`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:610-624`

### Converted-entry 'Added to requests' label
- **What it does:** Converted entries display an 'Added to requests' chip instead of the raw 'Converted' status badge.
- **Why needed:** Tells the artist a queued person was promoted into the real requests pipeline, so they know where that person went rather than seeing an opaque status word.
- **How it works:** In WaitlistEntryRow, when entry.status === 'converted' a charcoal-tint chip reads 'Added to requests'; otherwise a normal <StatusBadge status=...> renders (Waiting=mustard, Contacted=rosa, Dismissed=muted).
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:431-438`, `apps/web/src/components/status-badge.tsx:19-24`, `packages/shared/src/status-labels.ts:20-27`

### Mark contacted action
- **What it does:** Marks a 'waiting' entry as 'contacted' so the artist tracks that they have reached out.
- **Why needed:** Lets the artist remember which queued clients they've already messaged so they don't double-message or lose track.
- **How it works:** Button shown only when status==='waiting'. Calls markWaitlistContacted(entryId) server action: resolves cookie user, updates waitlist_entries.status='contacted' scoped by id + artist_id, revalidates /bookings/overview. Returns {error} on auth failure or DB error, surfaced inline; wrapped in a useTransition with disabled-while-pending.
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:40-48`, `apps/web/src/app/(artist)/bookings/actions.ts:133-151`

### Move to booking (convert) action
- **What it does:** Promotes a waitlist entry into an approved booking request, emails the client a magic link to view their booking, and marks the entry 'converted'.
- **Why needed:** When a slot opens, the artist can pull a waiting client straight into the booking pipeline in one click instead of re-entering their details.
- **How it works:** convertWaitlistEntry({entryId, customerEmail, customerHandle, note}) server action: resolves cookie user; loads artist display_name; mints a 32-byte token + sha256 token_hash; inserts a booking_requests row with status 'approved', origin 'artist_created', form_data {description: note, source:'waitlist'}, decided_at/updated_at=now; updates waitlist_entries.status='converted'; sends sendWaitlistConversionEmail (subject "<artist> has a spot for you", magicLink ${APP_URL}/request/<token>, valid 30 days); revalidateBookingViews(). DB insert errors are captured to Sentry and returned inline. Button always available for non-terminal entries.
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:49-64`, `apps/web/src/app/(artist)/bookings/actions.ts:208-269`, `apps/web/src/lib/email/send-booking-email.ts:122-150`

### Dismiss action
- **What it does:** Marks an entry 'dismissed', removing it from the active list and moving it into History.
- **Why needed:** Lets the artist clear out queued people who are no longer relevant (spam, already booked elsewhere, not a fit) without deleting the record.
- **How it works:** dismissWaitlistEntry(entryId) server action: resolves cookie user, updates waitlist_entries.status='dismissed' scoped by id + artist_id, revalidates /bookings/overview. Inline error on failure. Dismiss button text turns destructive-red on hover.
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:65-71`, `apps/web/src/app/(artist)/bookings/actions.ts:188-206`

### Action buttons hidden for terminal entries
- **What it does:** WaitlistActions renders nothing once an entry is converted or dismissed.
- **Why needed:** Prevents re-acting on an entry that's already been resolved.
- **How it works:** Client component returns null when status==='converted' || status==='dismissed'. (History rows are additionally rendered with muted=true so WaitlistActions isn't even mounted.)
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:26`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:458-466`

### Inline action error + pending state
- **What it does:** Each entry's action group disables all buttons while an action is in flight and shows any returned error message under the buttons.
- **Why needed:** Gives immediate feedback if a status change fails (e.g. session expired) instead of silently dropping the click.
- **How it works:** useTransition pending disables buttons (disabled:opacity-50). The run() wrapper clears error, awaits the action, and if the result has an 'error' key sets it into state to render a destructive-text paragraph.
- **Source:** `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:23-35`, `apps/web/src/app/(artist)/bookings/waitlist/waitlist-actions.tsx:72-74`

### Waitlist chip on converted requests in the Requests tab
- **What it does:** Booking requests that originated from a waitlist conversion show a muted 'Waitlist' tag next to their status in the Requests list/table.
- **Why needed:** Lets the artist tell at a glance which requests came from the waitlist versus the public form, so they remember the context.
- **How it works:** RequestsView reads form_data.source; when fd.source === 'waitlist' it renders <WaitlistTag /> (charcoal-tint pill labeled 'Waitlist') in both the mobile card and the desktop table Handle cell. The source value is written during convertWaitlistEntry.
- **Source:** `apps/web/src/app/(artist)/bookings/overview/page.tsx:169-172`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:221-225`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:389-398`, `apps/web/src/app/(artist)/bookings/actions.ts:243-244`

### What is this? intro modal (waitlist key)
- **What it does:** An info button in the Bookings header opens a 'How it works' modal; for an empty feature it can auto-show. The 'waitlist' config explains queuing clients while books are closed.
- **Why needed:** Onboards an artist to the waitlist concept (collect interest while booked, move entries into bookings, keep the pipeline warm) without leaving the page.
- **How it works:** FeatureIntroModal featureKey is 'overview' on this page, but the CONFIGS map includes a 'waitlist' entry (title, description, 3 bullets, CTA 'Open Booking Settings' to /bookings/settings). Auto-show is gated by isEmpty + a 7-day localStorage re-show window; Escape / backdrop / 'Maybe later' dismiss; CTA is a Link.
- **Source:** `apps/web/src/components/feature-intro-modal.tsx:69-80`, `apps/web/src/components/feature-intro-modal.tsx:137-257`, `apps/web/src/app/(artist)/bookings/overview/page.tsx:682-686`

### Public dedicated waitlist page /[slug]/waitlist
- **What it does:** An always-available public page that renders the join form regardless of whether the artist's books are open, closed, capped, or window-expired.
- **Why needed:** Gives the artist a stable link to share (e.g. while travelling) that collects signups even when their main page is taking live bookings.
- **How it works:** Server component loads profile by slug via serviceClient; notFound() if missing. Renders a light-appearance page with a back-link to the main artist page (publicArtistUrl), an '<artist> waitlist' heading, and <WaitlistForm artistSlug=slug>. generateMetadata sets a per-artist title/description and robots noindex,nofollow.
- **Source:** `apps/web/src/app/[slug]/waitlist/page.tsx:11-84`

### Books-closed waitlist on the main /[slug] page
- **What it does:** When an artist's books are closed (manual close, window expired, no slots, or cap reached), the main booking page swaps the booking form for the same WaitlistForm inside a 'books closed' block.
- **Why needed:** Converts a dead end ('books closed') into captured demand so the artist doesn't lose interested clients.
- **How it works:** PublicArtistPage computes isClosed from books_settings (books_open, booking_window_ends_at expiry, fixed-slots-with-no-slots, booking_cap reached). When isClosed it renders <BooksClosedBlock><WaitlistForm artistSlug=slug/></BooksClosedBlock>, else the full BookingForm.
- **Source:** `apps/web/src/app/[slug]/page.tsx:433-459`, `apps/web/src/app/[slug]/page.tsx:607-624`

### Instagram handle field (required)
- **What it does:** Required text field with a leading @ adornment for the client's Instagram handle.
- **Why needed:** Instagram is how most tattoo clients are identified and contacted; the artist needs a handle to recognize and reach the person.
- **How it works:** Input name='instagram_handle', required, autoComplete off. Server strips a leading @ then requires handle.length >= 1, else returns {error:'Instagram handle is required.', field:'instagram_handle'} shown inline under the field.
- **Source:** `apps/web/src/app/[slug]/waitlist-form.tsx:42-60`, `apps/web/src/app/[slug]/actions.ts:709-723`

### Email field (required, validated)
- **What it does:** Required email field; the channel the artist's whole flow runs over.
- **Why needed:** The waitlist confirmation and any later 'spot for you' magic link are delivered by email, so a valid address is essential.
- **How it works:** Input name='email', type=email, required. Server validates against /^[^\s@]+@[^\s@]+\.[^\s@]+$/; on failure returns {error:'A valid email is required.', field:'email'}.
- **Source:** `apps/web/src/app/[slug]/waitlist-form.tsx:62-76`, `apps/web/src/app/[slug]/actions.ts:724-725`

### City / location field (optional)
- **What it does:** Optional free-text city field with placeholder examples and helper text.
- **Why needed:** Feeds the 'Demand by city' chart so the artist can see where interest concentrates and plan guest spots accordingly.
- **How it works:** Controlled input name='city_text', maxLength 100 client-side, placeholder 'Berlin, Amsterdam, New York…'. Server trims and slices to 100 chars; empty becomes null and is stored in waitlist_entries.city_text.
- **Source:** `apps/web/src/app/[slug]/waitlist-form.tsx:78-96`, `apps/web/src/app/[slug]/actions.ts:715-716`, `apps/web/src/app/[slug]/actions.ts:743-749`

### Brief note field with live counter (optional, max 280)
- **What it does:** Optional 2-row textarea for what the client wants, with a live character counter that turns red past 280.
- **Why needed:** Gives the artist context about the desired piece so they can prioritize and prepare when reaching out.
- **How it works:** Controlled textarea name='note', placeholder 'What are you looking for?'. Counter shows note.length/280 and turns destructive over 280. Server rejects note.length > 280 with {error:'Note must be 280 characters or fewer.', field:'note'}; empty note stored as null.
- **Source:** `apps/web/src/app/[slug]/waitlist-form.tsx:98-122`, `apps/web/src/app/[slug]/actions.ts:726-730`, `apps/web/src/app/[slug]/actions.ts:743-748`

### Join the waitlist submit + success state
- **What it does:** Submits the form; while submitting the button reads 'Joining...' and disables; on success the form is replaced with a confirmation message.
- **Why needed:** Confirms to the client they're queued and prevents duplicate submits during the request.
- **How it works:** useActionState(submitWaitlistAction). Button disabled while pending with label swap. On state {ok:true} the component renders "Got it — we'll email you when there's an opening." instead of the form.
- **Source:** `apps/web/src/app/[slug]/waitlist-form.tsx:8-21`, `apps/web/src/app/[slug]/waitlist-form.tsx:124-131`

### Waitlist entry insertion (server)
- **What it does:** Persists a validated signup as a waitlist_entries row tied to the artist with default status 'waiting'.
- **Why needed:** This is the write that actually puts a client into the artist's queue.
- **How it works:** submitWaitlistAction looks up profile by artist_slug (serviceClient); returns {error:'Artist not found.'} if missing; inserts {artist_id, customer_email, customer_handle, note|null, city_text}. status defaults to 'waiting' and created_at defaults to now in the schema. DB errors captured to Sentry and surfaced as a generic 'Something went wrong. Try again.'
- **Source:** `apps/web/src/app/[slug]/actions.ts:732-754`, `apps/web/src/db/schema.ts:297-310`

### Waitlist confirmation email to client
- **What it does:** After a successful signup, emails the client to confirm they're on the artist's waitlist.
- **Why needed:** Reassures the client they're queued and sets the expectation that the artist will reach out when an opening appears.
- **How it works:** sendWaitlistConfirmation({to: email, artistName}) builds a branded HTML email, subject "You're on the waitlist for <artist>". Best-effort: failures are logged, never block the signup success response.
- **Source:** `apps/web/src/app/[slug]/actions.ts:756-759`, `apps/web/src/lib/email/send-booking-email.ts:96-120`

### Honeypot bot protection
- **What it does:** A hidden off-screen input traps bots; a triggered honeypot silently 'succeeds' without writing a row.
- **Why needed:** Keeps the artist's waitlist clean of automated spam signups.
- **How it works:** Hidden input name=HONEYPOT_FIELD ('inklee_hp_check'), tabIndex -1, aria-hidden, positioned off-screen. Server isHoneypotTriggered returns true for URL-shaped or >80-char fills; on trigger submitWaitlistAction returns {ok:true} so the bot can't tell it was blocked.
- **Source:** `apps/web/src/app/[slug]/waitlist-form.tsx:29-36`, `apps/web/src/app/[slug]/actions.ts:702-703`, `apps/web/src/lib/honeypot.ts:10-20`

### Waitlist rate limiting
- **What it does:** Caps public waitlist submissions at 3 per IP+artist per hour.
- **Why needed:** Prevents a single source from flooding an artist's waitlist or mail-bombing prospective clients via the confirmation email.
- **How it works:** After looking up the artist, checkWaitlistRateLimit(ip, profile.id) uses an Upstash sliding window (3 / 1h, prefix 'inklee:waitlist', key '<artistId>:<ip>'). On limit returns {error:'Too many requests. Try again later.'}. Fails open in dev, closed in prod when Upstash is unconfigured.
- **Source:** `apps/web/src/app/[slug]/actions.ts:705-707`, `apps/web/src/app/[slug]/actions.ts:740-741`, `apps/web/src/lib/ratelimit.ts:37-44`

### Mobile parity for waitlist status changes
- **What it does:** A mobile API endpoint mirrors Mark contacted / Dismiss so the phone app can update entries.
- **Why needed:** Keeps the artist's waitlist management consistent between web and the mobile app.
- **How it works:** POST /api/mobile/waitlist/:id with {status:'contacted'|'dismissed'} requires a mobile user, updates waitlist_entries scoped by id + artist_id, returns 404 if no row matched. 'Move to booking' (convert) is intentionally web-only for now per the route comment.
- **Source:** `apps/web/src/app/api/mobile/waitlist/[id]/route.ts:9-49`

**Notes:** Architecture: the standalone /bookings/waitlist page is purely a redirect; the real UI lives in apps/web/src/app/(artist)/bookings/overview/page.tsx (WaitlistView + WaitlistEntryRow), with per-row actions in the sibling waitlist/waitlist-actions.tsx and server actions in bookings/actions.ts. The public WaitlistForm (apps/web/src/app/[slug]/waitlist-form.tsx) is reused on BOTH the dedicated /[slug]/waitlist page and the books-closed state of /[slug]/page.tsx, so any client signup flows into the same waitlist_entries table regardless of entry surface.\n\nStatus model: waitlist_entries.status enum is waiting -> contacted (Mark contacted) and waiting/contacted -> converted (Move to booking) or dismissed (Dismiss). Defaults: status 'waiting', created_at now (db schema). humanStatusLabel maps these to Waiting/Contacted/Converted/Dismissed, but the overview UI overrides 'converted' to read 'Added to requests'. StatusBadge tints: waiting=mustard, contacted=rosa, converted=green, dismissed=muted.\n\nConvenience details worth noting: (1) the shareable waitlist link card explicitly works even while books are OPEN, distinguishing it from the books-closed form. (2) Demand-by-city is case-insensitive de-duplicated and Title-cased, sorted desc, with proportional bar widths. (3) History uses a native <details> accordion and renders rows muted with actions suppressed. (4) The convert action stamps form_data.source='waitlist' (no enum migration) which drives the 'Waitlist' chip back in the Requests tab, and origin='artist_created' / status='approved' so the converted person appears as an already-accepted request. (5) Convert mints a 30-day magic-link token and emails the client; both waitlist emails are best-effort (logged, never blocking). (6) Empty-state CTA links and the shareable-link card only render when the profile has a slug. (7) Copy compliance note: the public success message and the convert email still contain em-dashes (\"Got it — we'll email you...\" in waitlist-form.tsx:18, and \"Good news.\" plus the body in send-booking-email.ts), which technically violate the project's no-em-dash copy rule for user-visible strings (waitlist-form.tsx success string uses an em-dash). The 280-char note limit is enforced both client-side (counter) and server-side; city is capped at 100 chars server-side. Rate limit is 3/IP+artist/hour for waitlist vs 5 for the booking form.


---

## 6. Deposits (collection + refunds)

The Deposits surface spans three workflows: (1) a settings page at /bookings/deposits where the artist configures per-booking deposit DEFAULTS (amount, due window, note) and a structured cancellation/refund POLICY (refund window, late-cancel forfeit %, optional last-minute 100%-forfeit window) that is shown to clients and frozen onto each booking at payment time; (2) the per-booking deposit request/collect flow embedded in the booking-detail StatusActions component, where the artist requests a deposit (auto in-app card collection via Stripe Connect when connected, or a manual "client pays directly" deposit otherwise), watches it auto-confirm by webhook, or marks it received manually; and (3) the refund/cancellation path, where the artist refunds a paid card deposit in full (reverse-transfer + application-fee return) or cancels an approved booking (which auto-refunds). The client-facing side lives at /request/[token], where the client reads the frozen policy, accepts it, and pays the deposit by card via Stripe Payment Element, or sees deposit-due details for manual deposits, or forfeits a paid deposit by cancelling. A 3% all-in platform fee applies only to in-app card deposits routed through the artist's connected account; manual deposits carry no Inklee fee. The surface enforces test-mode banners, an entitlement gate (deposits feature), Connect routing, currency selection by the artist's Stripe country, server-side amount/date validation, rate limiting, idempotency, and audit logging throughout. Settings used to live at /settings/deposits, which now permanently redirects to /bookings/deposits.

### Deposit collection status banner (in-app card on/off)
- **What it does:** At the top of /bookings/deposits, shows whether the artist can collect card deposits in-app, driven by their Stripe Connect routing state (routeCharges), not the global publishable-key mode.
- **Why needed:** An artist needs to know at a glance whether clients can pay deposits by card here (Connect done) or must pay them directly, and what cut Inklee takes.
- **How it works:** Server component calls getConnectRoutingForArtist(user.id); canCollectInApp = routeCharges. On=green CheckCircle2 panel stating the deposit lands in the artist's own connected Stripe account and a 3% (PLATFORM_FEE_PERCENT) processing fee is deducted. Off=neutral Info panel saying you can still request deposits paid directly, with a 'Connect Stripe' link to /settings/payouts.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/page.tsx:21-77`, `apps/web/src/app/(artist)/bookings/deposits/page.tsx:97-114`, `apps/web/src/lib/stripe-connect.ts:104-135`

### Test-mode deposits banner (settings page)
- **What it does:** Shows a mustard 'Deposits are in test mode in this environment. No real charges will be made.' warning when Stripe is in test mode.
- **Why needed:** Prevents an artist on a preview/dev deployment from believing real money is moving.
- **How it works:** detectStripeMode(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) returns 'test' for keys starting pk_test_; banner renders only when stripeMode==='test'.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/page.tsx:66-74`, `apps/web/src/app/(artist)/bookings/deposits/page.tsx:94-96`, `packages/shared/src/deposit-settings.ts:49-56`

### Default deposit amount field
- **What it does:** Optional EUR amount that pre-fills the deposit amount on every accepted request; blank means force per-request entry.
- **Why needed:** Most artists charge a consistent deposit; setting it once avoids retyping on every booking.
- **How it works:** Controlled number input (min 0, step 0.01, EUR prefix). saveDepositDefaultsAction: trims; blank => null; rejects non-finite/negative ('Default amount must be a positive number.'); rejects > MAX_AMOUNT 100,000; 0 normalises to null; else rounds to 2dp. Stored in profiles.settings.deposit_defaults JSONB.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposits-form.tsx:27-53`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:29-43`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:56-82`, `packages/shared/src/deposit-settings.ts:26-44`

### Default 'Due within' days field
- **What it does:** Required number of days from send date used to pre-fill the deposit due date on every request.
- **Why needed:** Lets the artist set a standard payment deadline (e.g. 7 days) so deposits don't sit open indefinitely.
- **How it works:** Number input min 1 max 90, default String(defaults.due_days) (fallback 7). saveDepositDefaultsAction parses int, requires 1..MAX_DUE_DAYS(90) else error 'Due window must be between 1 and 90 days.'. In StatusActions it seeds depositDueAt = today + due_days.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposits-form.tsx:55-80`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:46-50`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:93-95`, `packages/shared/src/deposit-settings.ts:16-20`

### Default note to client field
- **What it does:** Optional default note (max 300 chars) included in the deposit-request email; editable per request.
- **Why needed:** Lets the artist pre-write bank-transfer details, what the deposit covers, or refund terms so they aren't retyped each time (and for manual deposits this is where payment instructions go).
- **How it works:** Textarea rows=3 maxLength=300. saveDepositDefaultsAction trims and slices to MAX_NOTE(300). Stored in deposit_defaults.note; pre-fills depositNote in StatusActions.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposits-form.tsx:82-103`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:52-54`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:96`

### Save defaults action + feedback
- **What it does:** Persists the three default fields and shows 'Saved.' or an inline error.
- **Why needed:** Commits the artist's standing deposit configuration.
- **How it works:** useActionState wraps saveDepositDefaultsAction (server action). Requires auth ('Not authenticated.'). Merges into existing profiles.settings, sets updated_at, revalidates /bookings/deposits and /bookings/requests layout. Button disabled + 'Saving…' while pending.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposits-form.tsx:14-17`, `apps/web/src/app/(artist)/bookings/deposits/deposits-form.tsx:105-119`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:19-83`

### Refund window setting (deposit policy)
- **What it does:** Sets how long before the appointment a client gets a FULL refund if they cancel (value + days/hours unit).
- **Why needed:** Defines the artist's fair-cancellation grace period that clients see and agree to before paying.
- **How it works:** Number input (min 0) + UnitSelect (days/hours). saveDepositPolicyAction.parseWindowField: int 0..max (720 for hours, 365 for days) else 'Each window must be between 0 and {max} {unit}.'. Stored in profiles.settings.deposit_policy.refundWindow.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:82-108`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:88-103`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:115-120`, `packages/shared/src/deposit-policy.ts:20-27`

### Late-cancel forfeit % chooser
- **What it does:** Constrained radio choice (25 / 50 / 100%) of how much of the deposit the artist keeps when a client cancels after the refund window.
- **Why needed:** Lets the artist set a forfeit penalty without writing an unenforceable free-text 'non-refundable' clause the platform forbids.
- **How it works:** Radio group from FORFEIT_PCT_OPTIONS [25,50,100]. saveDepositPolicyAction validates the value is in the list else 'Pick a forfeit percentage from the list.'. Stored as lateCancelForfeitPct. 100% renders 'the full deposit is kept' in client lines.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:110-132`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:122-128`, `packages/shared/src/deposit-policy.ts:14-15`, `packages/shared/src/deposit-policy.ts:100-109`

### Last-minute 100%-forfeit window toggle + window
- **What it does:** Optional checkbox enabling a tight window before the appointment in which the FULL deposit is forfeited; reveals a value+unit input when on.
- **Why needed:** Protects the artist against very-last-minute cancellations that can't be rebooked, even within the normal forfeit band.
- **How it works:** Checkbox name=last_minute_enabled toggles lastMinuteOn (defaults from initial.lastMinute!==null); when on, value input (min 0) + UnitSelect (default 24 hours). saveDepositPolicyAction only parses when last_minute_enabled==='on', same 0..max validation; stored as lastMinute or null.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:134-166`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:130-141`, `packages/shared/src/deposit-policy.ts:25-26`

### Reciprocity disclosure (platform-enforced)
- **What it does:** Read-only panel telling the artist that if THEY cancel, the client always gets a full refund, set by Inklee and not overridable.
- **Why needed:** Makes the artist aware their own cancellations are always fully refunded, a legal/fairness guarantee they can't disable.
- **How it works:** Static info panel in the policy form; reciprocity is hard-coded in app refund logic (cancelBookingCore auto-refunds), not stored in deposit_policy. Client policy lines include 'If the artist cancels, your full deposit is returned.'
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:168-175`, `packages/shared/src/deposit-policy.ts:5-8`, `packages/shared/src/deposit-policy.ts:115`, `apps/web/src/lib/server/bookings.ts:1083-1123`

### Live policy preview (as the client sees it)
- **What it does:** Renders the exact client-facing policy sentences in real time as the artist edits the form.
- **Why needed:** Lets the artist see precisely what wording the client will read and agree to before saving.
- **How it works:** Builds a preview DepositPolicy from current form state and maps depositPolicyLines(preview) into a list. Lines cover refund window, forfeit %, optional last-minute, artist-cancel reciprocity, no-client-fee, and EU 14-day-withdrawal exemption.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:65-78`, `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:177-186`, `packages/shared/src/deposit-policy.ts:100-121`

### Draft-default policy nudge
- **What it does:** Shows a 'These are conservative starting values. Adjust each field...' hint when the policy is still the untouched default (7 days / 50% / no last-minute).
- **Why needed:** Prompts the artist to tailor the placeholder policy to how they actually work rather than shipping the generic draft.
- **How it works:** isDraftDefaultPolicy(preview) compares against DEPOSIT_POLICY_DEFAULT; banner renders only when true.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:188-193`, `packages/shared/src/deposit-policy.ts:33-37`, `packages/shared/src/deposit-policy.ts:74-82`

### Save deposit policy action + feedback
- **What it does:** Persists the structured policy and shows 'Saved.' or an inline error; only the three constrained parameters are accepted (no free text).
- **Why needed:** Commits the cancellation/refund terms that get frozen onto future bookings.
- **How it works:** useActionState wraps saveDepositPolicyAction. Requires auth, validates each field, merges into profiles.settings.deposit_policy with updated_at, revalidates /bookings/deposits. Button shows 'Saving…' while pending.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:43-46`, `apps/web/src/app/(artist)/bookings/deposits/deposit-policy-form.tsx:202-209`, `apps/web/src/app/(artist)/bookings/deposits/actions.ts:105-166`

### Terms/DPA + 'where deposits live' reference links
- **What it does:** Static helper text linking to /terms (section 12) and /dpa, plus a panel explaining the 'Request deposit' option appears on the booking detail after accepting, and the client receives a secure payment link by email; links to /bookings/overview.
- **Why needed:** Orients the artist on the legal basis and on where in the workflow deposits actually get requested.
- **How it works:** Static JSX with Next Link components; no server action.
- **Source:** `apps/web/src/app/(artist)/bookings/deposits/page.tsx:128-171`

### /settings/deposits redirect
- **What it does:** Permanently redirects the old /settings/deposits URL to /bookings/deposits.
- **Why needed:** Keeps old bookmarks and any cached onboarding CTA working after deposits moved into the booking workflow (2026-05-24).
- **How it works:** Server component calls redirect('/bookings/deposits').
- **Source:** `apps/web/src/app/(artist)/settings/deposits/page.tsx:1-9`

### Request deposit button + inline form (per booking)
- **What it does:** On a pending booking detail, opens an inline form to request a deposit with amount, due-by date, and optional note; needsAcceptPopup may first prompt for studio/goods confirmation.
- **Why needed:** This is the core action: telling a client to pay a deposit before the artist confirms the booking.
- **How it works:** StatusActions 'Request deposit' button (pre-filled from depositDefaults). If confirmStudio or pendingInterests exist, opens a confirm popup first; deposit branch persists goods decisions via applyInterestDecisions, then opens the form. handleRequestDeposit validates amount>0 and a due date client-side, then calls requestDeposit server action; optimistic status -> deposit_pending.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:189-214`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:476-610`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:130-172`

### Deposit amount input with currency + fee breakdown
- **What it does:** Amount field (currency prefix = artist's settlement currency) that, for in-app deposits, live-previews the 3% processing fee and net the artist receives.
- **Why needed:** Lets the artist see exactly what they'll net after Inklee's cut before sending the request.
- **How it works:** Number input min 1 step 0.01. showFeeBreakdown = canCollectInApp && amount>0; renders 'Processing fee (3%): -{platformFeeEur} · You receive {artistNetEur}'. Fee math from @/lib/platform-fee (3% of cents). Manual deposits hide the breakdown (no Inklee fee).
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:221-228`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:535-565`, `packages/shared/src/platform-fee.ts:45-63`

### Deposit due-by date input
- **What it does:** Date picker (min = tomorrow) for the deposit deadline, pre-filled from defaults.due_days.
- **Why needed:** Sets the client's payment deadline; surfaces in the email and powers reminders.
- **How it works:** DateInput with min=tomorrow(); handleRequestDeposit requires a non-empty value client-side; server requestDepositCore re-validates isDateKey & not before today else 'Deposit due date must be a valid date, today or later.'
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:566-576`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:195-198`, `apps/web/src/lib/server/bookings.ts:676-681`

### Deposit note-to-customer input (per request)
- **What it does:** Optional per-request note (max 300) included in the deposit email; pre-filled from defaults.
- **Why needed:** For manual deposits this carries bank-transfer/payment details; for any deposit it explains what the deposit covers.
- **How it works:** Text input maxLength=300; passed as note to requestDeposit (trimmed, '' => null). Stored on booking_requests.deposit_note and sent in sendDepositRequestedEmail.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:577-590`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:202-208`, `apps/web/src/lib/server/bookings.ts:621-630`

### Send deposit request (server: requestDepositCore)
- **What it does:** Transitions the booking to deposit_pending, creates/updates a Stripe PaymentIntent for in-app card collection (or a manual deposit), snapshots the policy + currency, rotates the magic-link token, emails the client a fresh pay link, and audit-logs.
- **Why needed:** Performs the actual money-path setup so the client can pay, while protecting the artist from typos, double-charges, and stale links.
- **How it works:** requestDeposit -> requestDepositCore. Authorises booking owner; canTransition(status,'deposit_pending'); rate-limited 20/artist/hr; amount must be finite >=1, <=100,000, <=2dp; due date valid+future. Snapshots deposit_policy + deposit_policy_snapshot. Currency = artistDepositCurrency(stripe_account_country). Entitlement gate: in-app card only if canAccess(overrides,'deposits') AND Connect routeCharges+account; fee sponsorship may set application_fee_amount 0. Creates intent on_behalf_of + transfer_data.destination with application_fee_amount=3% (idempotencyKey deposit-intent-{id}); else MANUAL (null intent). Re-request reuses a live intent only if still routable and currency unchanged, else cancels + falls back to manual. Writes deposit_* fields, audit_log status_changed, calls notifyDepositRequested. Web wrapper revalidates booking views.
- **Source:** `apps/web/src/lib/server/bookings.ts:638-921`, `apps/web/src/app/(artist)/bookings/actions.ts:89-107`, `apps/web/src/lib/server/bookings.ts:633-636`

### Magic-link token rotation + deposit email
- **What it does:** On each deposit request, rotates the client's secure token (storing only the new hash) and emails the client a fresh /request/{token} payment link with amount, currency, due date, and note.
- **Why needed:** Gives the client a working, secure, single-active link to pay; rotation invalidates the prior link so old emails can't be reused.
- **How it works:** notifyDepositRequested generates a 32-byte token, stores sha256 hash on booking_requests.customer_token_hash, audit-logs token_rotated, then sendDepositRequestedEmail with the magic link. Best-effort: never blocks the request.
- **Source:** `apps/web/src/lib/server/bookings.ts:577-631`

### In-app deposit: 'Waiting for card payment' state
- **What it does:** When a deposit_pending booking has a live card intent, shows a 'Waiting for card payment' panel explaining it auto-confirms when the deposit lands.
- **Why needed:** Sets the artist's expectation that they don't need to do anything; the webhook will confirm automatically.
- **How it works:** hasDepositIntent (from booking.deposit_payment_intent_id) drives this branch; copy says the booking confirms automatically and the artist is notified. The Stripe webhook payment_intent.succeeded sets deposit_paid_at, status approved, books the slot, and notifies.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:371-405`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:281`, `apps/web/src/app/api/stripe/webhook/route.ts:150-365`

### Mark received manually (override for in-app deposit)
- **What it does:** A demoted 'Client paying another way?' disclosure with a 'Mark received manually' button that confirms the booking and cancels the outstanding card request.
- **Why needed:** Covers the case where the client pays the artist by another method even though a card link was sent, without risking a double charge.
- **How it works:** run(markDepositReceived,'approved'). markDepositReceivedCore cancels deposit_payment_intent_id (best-effort), sets status approved + deposit_paid_at, books the slot (with restore-on-failure), audit-logs via:deposit_received.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:388-404`, `apps/web/src/lib/server/bookings.ts:923-1001`

### Mark deposit received (manual deposit, primary)
- **What it does:** For a manual deposit (no card intent), a prominent 'Mark deposit received' button confirms the booking.
- **Why needed:** For artists collecting by bank transfer/cash, this is how they tell the system the money arrived and lock the booking.
- **How it works:** Shown when !hasDepositIntent in deposit_pending. run(markDepositReceived,'approved') -> markDepositReceivedCore (same approve + slot-book + audit path; no intent to cancel).
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:406-418`, `apps/web/src/lib/server/bookings.ts:923-1001`

### Refund deposit button (artist, paid card deposit)
- **What it does:** On an approved booking with a paid in-app card deposit, a 'Refund deposit' button with a confirm step that fully refunds the client.
- **Why needed:** Lets the artist return a client's card deposit (goodwill, error, mutual reschedule) without leaving the app or the Stripe dashboard.
- **How it works:** DepositRefundButton shown only when hasPaidInAppDeposit && !depositRefunded. Confirm panel explains full refund, Inklee returns its fee, Stripe's processing fee stays on the artist. Calls refundDeposit -> refundDepositCore: requires intent + deposit_paid_at; idempotency guard via audit_log deposit_refunded + Stripe idempotencyKey refund-deposit-{id}; stripe.refunds.create with reverse_transfer + refund_application_fee; audit-logs deposit_refunded. After refund the detail shows 'Refunded {amount} to the client.'
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/deposit-refund-button.tsx:1-77`, `apps/web/src/lib/server/bookings.ts:1003-1081`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:132-139`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:476-496`

### Cancel booking button (auto-refunds paid deposit)
- **What it does:** On an approved booking, cancels it; if a paid card deposit exists, the client is fully refunded automatically and the slot reopens.
- **Why needed:** When the artist must cancel, this makes the client whole (reciprocity) and frees the slot in one action.
- **How it works:** CancelBookingButton with confirm step; copy varies on refundsDeposit (hasPaidInAppDeposit && !depositRefunded). Calls cancelBooking -> cancelBookingCore: refunds first (skips if already refunded) via refundDepositCore, or cancels a live unpaid intent; only then sets cancelled, reopens the slot, audits, emails the client. Aborts cancellation if the refund fails so money is never stranded.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/cancel-booking-button.tsx:1-83`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:500-514`, `apps/web/src/lib/server/bookings.ts:1083-1180`

### Deposit summary card (artist detail)
- **What it does:** Sidebar card on the booking detail showing the deposit amount, due date, note, and refund status.
- **Why needed:** Gives the artist an at-a-glance record of the deposit terms and whether it was refunded.
- **How it works:** Rendered when booking.deposit_amount set; formatPrice(amount,currency); shows Due {date} and the note; if a deposit_refunded audit entry exists shows 'Refunded {amount} to the client.', else if paid in-app shows the refund button.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:455-498`

### Pass (reject) action during deposit_pending
- **What it does:** Lets the artist decline a request even after a deposit was requested, with a confirm step that emails a polite decline.
- **Why needed:** The artist may decide not to proceed before the deposit is paid; this closes the request cleanly.
- **How it works:** confirmReject toggles a destructive confirm; run(rejectBooking,'rejected') -> rejectBookingCore sends customer_booking_rejected email. Available in both the pre-deposit and deposit_pending states.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:420-453`, `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:612-645`

### Manual-deposit guidance + Connect nudge (request form)
- **What it does:** When the artist isn't Connect-routable, the request form shows a panel explaining the deposit is collected directly (no in-app card) and links to /settings/payouts to Connect Stripe.
- **Why needed:** Sets correct expectations for un-connected artists and nudges them toward card collection.
- **How it works:** Renders when !canCollectInApp; static copy + Connect Stripe link. canCollectInApp comes from getConnectRoutingForArtist on the server.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:499-522`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:70-74`

### Test-mode banner in the request form
- **What it does:** Inside the deposit request form, warns that Stripe is in test mode so no real payment will be taken (only when card collection is on).
- **Why needed:** Stops an artist on a preview deployment from thinking a real charge will occur.
- **How it works:** Renders when canCollectInApp && stripeMode==='test'.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/status-actions.tsx:523-534`

### Send deposit reminder (communication sidebar)
- **What it does:** A 'Send deposit reminder' action that emails the client a nudge to pay an outstanding deposit.
- **Why needed:** Chases an unpaid deposit before the due date without the artist composing an email.
- **How it works:** Shown when status==='deposit_pending' && hasDepositDueDate. Calls sendManualDepositReminderAction(bookingId); on success logs a reminder_sent (manual) audit row shown in the timeline.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:125-156`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:94-96`

### Deposit event timeline (communication log)
- **What it does:** Chronological log of deposit-related events: deposit requested, reminder sent, deposit paid, etc.
- **Why needed:** Gives the artist an audit trail of what happened with the deposit and when.
- **How it works:** Reads up to 30 audit_log rows for the booking; describe() maps actions (deposit_paid, reminder_sent, status_changed->deposit_pending = 'Deposit requested') to labeled rows with icons.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:55-93`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:125-130`

### Client pre-payment disclosure + policy acceptance (request/[token])
- **What it does:** On the client's payment page, shows the deposit amount + the FROZEN policy lines and requires the client to tick 'I have read and accept the deposit policy.' before the Pay button enables.
- **Why needed:** Gives the artist an enforceable, durable record that the client agreed to the cancellation/refund terms (legal §9/§12).
- **How it works:** DepositPaymentForm renders depositPolicyLines(policy) where policy = parseDepositPolicy(booking.deposit_policy) frozen at request time; checkbox toggles accepted; submit disabled until accepted; Stripe confirmPayment runs with redirect:'if_required'.
- **Source:** `apps/web/src/components/deposit-payment-form.tsx:42-105`, `apps/web/src/app/request/[token]/page.tsx:197-204`

### Client deposit card payment (Stripe Payment Element)
- **What it does:** Renders the Stripe Payment Element so the client pays the deposit by card; on success shows 'Payment received'.
- **Why needed:** This is how the deposit money actually reaches the artist's connected account in-app.
- **How it works:** DepositPaymentForm loads Stripe with the publishable key (memoised) and clientSecret; theme 'night'; confirmPayment; the webhook reconciles deposit_paid. Lazy-loaded; AddonsCheckout variant used when confirmed goods add-ons exist.
- **Source:** `apps/web/src/components/deposit-payment-form.tsx:107-170`, `apps/web/src/app/request/[token]/customer-portal.tsx:289-323`

### Client manual-deposit notice (no card secret)
- **What it does:** When there's no client secret (manual deposit), shows 'Deposit requested', the amount, due date, the artist's note, and 'Once your deposit is received, the artist will confirm your booking.'
- **Why needed:** Tells the client a deposit is owed and how the artist wants to be paid (via the note) when no card flow exists.
- **How it works:** Renders the fallback block when !depositClientSecret || !stripePublishableKey while status==='deposit_pending'.
- **Source:** `apps/web/src/app/request/[token]/customer-portal.tsx:324-351`

### Client test-mode payment notice
- **What it does:** Warns the client 'Test mode: this is a test payment form. No real card will be charged.'
- **Why needed:** Prevents confusion on preview deployments.
- **How it works:** Renders when detectStripeMode(booking.stripePublishableKey)==='test'.
- **Source:** `apps/web/src/app/request/[token]/customer-portal.tsx:289-296`

### Client cancel with deposit-forfeit warning
- **What it does:** Client cancel flow warns that a paid deposit is non-refundable on client cancellation (artist keeps it), then records the forfeiture (or cancels an unpaid intent).
- **Why needed:** Enforces the artist's protection: a client who paid and then cancels forfeits per policy; the artist is shown the forfeiture.
- **How it works:** depositForfeitedOnCancel = status approved && depositAmount!=null; confirm copy spells out the artist keeps it. cancelCustomerBookingAction sets cancelled, reopens slot, and if deposit_paid_at logs deposit_forfeited (no refund); else cancels a live unpaid intent. Notifies the artist.
- **Source:** `apps/web/src/app/request/[token]/customer-portal.tsx:76-79`, `apps/web/src/app/request/[token]/customer-portal.tsx:376-417`, `apps/web/src/app/request/[token]/actions.ts:162-244`

### Deposit webhook auto-confirmation + receipt
- **What it does:** On payment_intent.succeeded, marks deposit_paid_at, confirms the booking (approved), books the slot, notifies the artist (deposit_received), and emails the client a durable receipt with the policy snapshot.
- **Why needed:** Closes the loop without artist action and gives the client the legally-required durable medium of the agreed terms.
- **How it works:** Webhook validates amount, idempotency (audit_log deposit_paid / status), updates booking_requests, records the gross 3% application fee + sponsored-fee tracking, sends deposit receipt using deposit_policy_snapshot. Failed cards log deposit_payment_failed; dashboard/charge.refunded mirrors deposit_refunded.
- **Source:** `apps/web/src/app/api/stripe/webhook/route.ts:87-365`, `apps/web/src/app/api/stripe/webhook/route.ts:548-560`

### Artist settlement currency for deposits
- **What it does:** Denominates the deposit amount, fee preview, and PaymentIntent in the artist's Stripe-country settlement currency (e.g. EUR/CZK) rather than always EUR.
- **Why needed:** Avoids FX loss at payout for non-eurozone artists and shows amounts in their currency.
- **How it works:** artistDepositCurrency(stripe_account_country) sets the currency prefix in the request form and is stored as deposit_currency; the PaymentIntent uses it; goods add-ons are refused on non-EUR deposits to avoid mis-charge.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:61-66`, `apps/web/src/lib/server/bookings.ts:694-699`, `apps/web/src/app/request/[token]/actions.ts:376-384`

**Notes:** Architecture: all money-path actions in the web app are thin wrappers in apps/web/src/app/(artist)/bookings/actions.ts that delegate to shared cores in apps/web/src/lib/server/bookings.ts (the SAME implementation the mobile API calls), then revalidate the web cache; business logic must stay in the cores so web/mobile never diverge. Deposit DEFAULTS and POLICY are stored in profiles.settings JSONB (deposit_defaults, deposit_policy) with no migration; the policy is FROZEN onto each booking at request time (deposit_policy + deposit_policy_snapshot, migration 0043) so later edits never change what a client agreed to. Two distinct deposit modes: in-app card (requires both the 'deposits' entitlement and active Stripe Connect routing) vs MANUAL (client pays the artist directly, no PaymentIntent, no 3% Inklee fee). Money mechanics use destination charges with on_behalf_of (artist = merchant of record) and application_fee_amount = full 3%; refunds use reverse_transfer + refund_application_fee (Stripe's processing fee is non-refundable and stays on the artist). Direction asymmetry: ARTIST cancel => full client refund (reciprocity, hard-coded); CLIENT cancel of a paid deposit => forfeiture (no refund, just an audit record). Safety: server-side floor (>=1), cap (<=100,000), 2-decimal precision guard, future-date guard, 20/artist/hour rate limit, Stripe idempotency keys (deposit-intent-{id}, refund-deposit-{id}), audit-log idempotency guards for refund, and slot-restore on failure. Re-requesting a deposit reuses a live intent only if the artist is still routable AND the currency is unchanged (PaymentIntent currency is immutable), otherwise it cancels the dead intent and falls back to manual. The fee-sponsorship path (Slice 81) can waive the 3% (application_fee 0) while stamping the foregone fee on the intent for budget tracking. The /settings/deposits route is now only a redirect to /bookings/deposits. Goods add-on checkout shares the deposit PaymentIntent (prepareCheckoutAction) but is parked behind a commerce flag and is only reached when confirmed-available interest rows exist and the deposit is EUR.


---

## 7. Booking form builder + fields + public page + slots/books

This surface is where a tattoo artist configures the public booking experience clients see: the form fields, the booking mode (preferred-date vs fixed time slots), whether books are open, and how to share the public booking page. After a route reshuffle (Slice 60b), the live destinations are two pages under /bookings: "My Booking Form" (/bookings/booking-form) and "Books & Availability" (/bookings/settings). Many older routes are now thin redirect stubs: /bookings/form, /bookings/slots, /bookings/books, /bookings/public-page, and the entire settings/fields, settings/slots, settings/books trees all redirect into the two live pages. On /bookings/booking-form the artist shares the public link (copy URL, open preview, download a printable QR code), sees a live open/closed availability summary, and edits a unified, drag-reorderable list that interleaves eight standard fields (Instagram, email, reference link, placement, size, description, reference images, preferred date/slot) with unlimited custom questions of seven types. Each standard field has show/required sub-toggles (email is locked on+required; preferred date is always on), and custom fields can be added, edited, toggled active, reordered by drag, and removed (soft-deleted if any booking already used them). On /bookings/settings the artist toggles books open/closed (audit-logged), sets an optional booking cap and auto-close date and a closed-page message, chooses booking mode, and in fixed-slots mode publishes time slots via single/block/pattern builders. All config persists into the profile's settings JSON (form_settings, field_order, books_settings) or dedicated tables (custom_fields, slots) and is consumed by the public /[slug] booking page.

### Page: My Booking Form (/bookings/booking-form)
- **What it does:** The live landing page for editing the public booking form. Renders the public-link share widget, a fixed-slots warning, an availability summary card, and the unified form-field editor. Loads custom fields, profile settings (slug, settings, timezone, booking_mode), and the count of open slots.
- **Why needed:** Central place for an artist to control exactly what clients see and to grab their shareable link, without touching multiple settings screens.
- **How it works:** Server component. Parallel queries: custom_fields (deleted_at null, ordered by position), profiles (slug/settings/timezone/booking_mode), and slots count where status=open. Parses form_settings via parseFormSettings, books_settings via parseBooksSettings, derives field_order (or buildDefaultFieldOrder), publicUrl via publicArtistUrl(slug). Computes isOpen = books_open && !windowExpired, and isFixedSlotsWithoutSlots when booking_mode='fixed_slots' and openSlotCount=0.
- **Source:** `apps/web/src/app/(artist)/bookings/booking-form/page.tsx:11-157`

### Redirect stubs into the live pages
- **What it does:** Old routes redirect to current destinations: /bookings/form, /bookings/public-page → /bookings/booking-form; /bookings/slots, /bookings/books → /bookings/settings; settings/fields → /bookings/form, settings/slots → /bookings/slots, settings/books → /bookings/books (chained).
- **Why needed:** Preserves bookmarks and old links after the bookings IA was reorganized; an artist who navigates to a stale URL still lands on the right config screen.
- **How it works:** Each page.tsx calls Next.js redirect() to the new path. settings/* stubs redirect into bookings/* which themselves redirect, so chains resolve to the two live pages.
- **Source:** `apps/web/src/app/(artist)/bookings/form/page.tsx:1-5`, `apps/web/src/app/(artist)/bookings/public-page/page.tsx:1-5`, `apps/web/src/app/(artist)/bookings/slots/page.tsx:1-5`, `apps/web/src/app/(artist)/bookings/books/page.tsx:1-5`, `apps/web/src/app/(artist)/settings/fields/page.tsx:1-4`, `apps/web/src/app/(artist)/settings/slots/page.tsx:1-4`, `apps/web/src/app/(artist)/settings/books/page.tsx:1-4`

### Mobile-only bookings sub-nav
- **What it does:** Shows a BookingsNav tab bar on small screens; on desktop the sub-pages are reached via the sidebar instead.
- **Why needed:** Lets artists on phones jump between bookings sub-screens (form, settings, requests, etc.) where there is no sidebar.
- **How it works:** bookings/layout.tsx wraps all bookings children, rendering <BookingsNav/> inside a md:hidden container.
- **Source:** `apps/web/src/app/(artist)/bookings/layout.tsx:1-17`

### Copy public booking link
- **What it does:** Copies the artist's public booking URL to the clipboard and flashes 'Copied!' for 2 seconds. Displays the URL with the protocol stripped in monospace.
- **Why needed:** Artists paste this link into their Instagram bio, stories, and DMs; one-click copy is their primary distribution action.
- **How it works:** Client component. navigator.clipboard.writeText(publicUrl); sets copied=true then resets after 2000ms. publicUrl built server-side by publicArtistUrl(slug) which switches between subdomain (slug.bio-domain) and path (appUrl/slug) modes by env.
- **Source:** `apps/web/src/app/(artist)/bookings/public-page/public-page-client.tsx:26-31`, `apps/web/src/app/(artist)/bookings/public-page/public-page-client.tsx:46-55`, `apps/web/src/lib/public-url.ts:67-76`

### Preview public page
- **What it does:** Opens the artist's live public booking page (/{slug}) in a new tab.
- **Why needed:** Lets the artist verify what clients actually see after changing fields, slots, or open/closed state.
- **How it works:** Anchor to /{slug} with target=_blank rel=noopener noreferrer.
- **Source:** `apps/web/src/app/(artist)/bookings/public-page/public-page-client.tsx:56-63`

### QR code generation + download
- **What it does:** Renders a QR code of the public URL on a canvas and offers a 'Download PNG' button that saves it as {slug}-qr.png.
- **Why needed:** For in-person and print sharing (studio flyers, business cards, conventions) so walk-ins can scan straight to the booking form.
- **How it works:** useEffect runs QRCode.toCanvas(canvas, publicUrl, {width:96, margin:1, dark #1e1e1e / light #e5e1d5}). downloadQR() converts the canvas to a data URL and triggers an anchor download named `${slug}-qr.png`.
- **Source:** `apps/web/src/app/(artist)/bookings/public-page/public-page-client.tsx:16-41`, `apps/web/src/app/(artist)/bookings/public-page/public-page-client.tsx:66-83`

### Fixed-slots-with-no-slots warning banner
- **What it does:** Shows an orange warning that the booking link will appear closed because the artist is in fixed-slots mode with zero open slots, linking to Books & Availability to add slots.
- **Why needed:** Prevents an artist from sharing a link that silently appears closed to clients because no slots were posted.
- **How it works:** Rendered when (booking_mode ?? 'preferred_date')==='fixed_slots' && openSlotCount===0. The link points to /bookings/settings.
- **Source:** `apps/web/src/app/(artist)/bookings/booking-form/page.tsx:55-57`, `apps/web/src/app/(artist)/bookings/booking-form/page.tsx:83-102`

### Availability summary card (read-only) with Edit link
- **What it does:** Shows a status row: 'Currently accepting requests' / 'Closed to new requests', a green/grey Open/Closed dot+label, and an Edit → link to /bookings/settings.
- **Why needed:** At-a-glance confirmation of whether the public page is taking requests, right next to the share link.
- **How it works:** isOpen = books_open && !windowExpired (windowExpired computed via isDateKeyBefore(booking_window_ends_at, todayInTimeZone(timezone))). Pure display; editing happens on the linked settings page.
- **Source:** `apps/web/src/app/(artist)/bookings/booking-form/page.tsx:48-54`, `apps/web/src/app/(artist)/bookings/booking-form/page.tsx:104-134`

### Unified form-field list (interleaved standard + custom)
- **What it does:** A single ordered list showing eight standard fields and all custom fields together, each row draggable, with per-field controls. Order here is exactly what clients see.
- **Why needed:** Artists want the public form to ask questions in their own logical order and mix built-in fields with bespoke ones (e.g. skin type) in one place.
- **How it works:** buildRows(order, customFields) maps the saved field_order into std/custom rows, appending any standard/custom fields missing from the order (backwards compat). STD config lists the 8 standard ids with toggle/required keys. Component keyed by fields.length to remount on add/remove.
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:25-116`, `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:172-197`, `apps/web/src/app/(artist)/bookings/booking-form/page.tsx:148-153`

### Drag-to-reorder fields
- **What it does:** Lets the artist drag any field row (standard or custom) to a new position; persists the new order optimistically.
- **Why needed:** Control the question sequence on the public form (e.g. ask description before placement) for a smoother client experience.
- **How it works:** HTML5 drag handlers (onDragStart/Over/Drop/End) compute newKeys by splicing the dragged index into the drop index over the current row key list, setOrder locally, then call saveFieldOrderAction(newKeys). That action writes settings.field_order on profiles with NO revalidatePath (optimistic UI already reflects it).
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:225-263`, `apps/web/src/app/(artist)/bookings/form/form-settings-actions.ts:52-77`

### Standard field visibility toggle (show/hide)
- **What it does:** Per standard field, a switch to include or exclude it from the public form. Hidden rows dim to 60% opacity. Email and preferred date show 'Always on' instead of a toggle.
- **Why needed:** Not every artist wants every default question (e.g. some skip size or reference link); they curate which appear.
- **How it works:** For fields with a toggleKey (show_instagram_handle, show_reference_link, show_placement, show_size, show_description, show_image_upload), Toggle calls updateSetting(key,v) → saveFormSettingsAction(key,value). The action forces show_preferred_date and show_email to true regardless of input. parseFormSettings also forces show_email and show_preferred_date true on read.
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:275-348`, `apps/web/src/app/(artist)/bookings/form/form-settings-actions.ts:31-50`, `apps/web/src/lib/form-settings.ts:85-110`

### Standard field 'Required' sub-toggle
- **What it does:** When a standard field is on, a 'Required' sub-toggle appears beneath it controlling whether clients must fill it. Email shows 'Always required'.
- **Why needed:** Artists decide which inputs are mandatory (e.g. make placement required but reference link optional) to balance friction vs information.
- **How it works:** Sub-toggles render the requiredKey (require_instagram_handle, require_reference_link, require_placement, require_size, require_description, require_image_upload) via updateSetting → saveFormSettingsAction. Defaults: placement/size/description required, instagram/reference/images optional (DEFAULT_FORM_SETTINGS).
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:281-335`, `apps/web/src/lib/form-settings.ts:34-42`

### Photo annotations toggle (reference images extra)
- **What it does:** Under the Reference images field, an extra 'Photo annotations' sub-toggle that lets clients tap an uploaded photo to mark spots with notes.
- **Why needed:** Artists get precise placement/detail guidance pinned to the client's own photo, reducing back-and-forth.
- **How it works:** extraSubs:[{key:'allow_photo_annotations'}] on the image_upload std row; toggles allow_photo_annotations via saveFormSettingsAction. Consumed by the public booking form's annotation modal.
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:57-67`, `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:281-286`, `apps/web/src/lib/form-settings.ts:41`

### Add custom field
- **What it does:** Opens an inline form to create a new custom question (label, type, options, placeholder, help text, required) and appends it to the form.
- **Why needed:** Every artist asks different things (allergies, age confirmation, budget, skin type); custom fields extend the form beyond the built-ins.
- **How it works:** '+ Add custom field' reveals <FieldForm onDone>. createFieldAction validates raw via fieldConfigSchema; key auto-derived from label (labelToKey) if blank; computes next position = max+1; inserts into custom_fields (active:true). Appends new id into settings.field_order via insertFieldId (before image_upload/preferred_date). 23505 → 'a field with key X already exists'. revalidatePath('/bookings/form').
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:433-445`, `apps/web/src/app/(artist)/bookings/form/field-form.tsx:28-209`, `apps/web/src/app/(artist)/bookings/form/actions.ts:19-114`, `apps/web/src/lib/form-settings.ts:74-83`

### Custom field types (7 options)
- **What it does:** Type dropdown offering Short text, Long text, Number, Dropdown (select), Radio group, Checkbox, Date.
- **Why needed:** Different questions need different inputs (a yes/no checkbox for consent vs a dropdown of skin types vs a date).
- **How it works:** CUSTOM_FIELD_TYPES enum drives the <select>; TYPE_LABELS maps to friendly names. fieldConfigSchema.type = z.enum(CUSTOM_FIELD_TYPES). Type controls which extra inputs show (options for select/radio, placeholder for text/number/date).
- **Source:** `apps/web/src/app/(artist)/bookings/form/field-form.tsx:18-26`, `apps/web/src/app/(artist)/bookings/form/field-form.tsx:95-109`, `apps/web/src/lib/custom-fields.ts:3`, `packages/shared/src/custom-fields.ts:3-13`

### Custom field label + auto-generated key
- **What it does:** Required label input (max 100 chars). A machine key is auto-derived from the label as you type and stored in a hidden field; the key is immutable after creation.
- **Why needed:** Artists think in human labels ('Skin type'); the stable key keeps historical answers linked even if the label is later edited.
- **How it works:** Label change updates state; useEffect sets key=labelToKey(label) until the user touches key (keyTouched). labelToKey lowercases, replaces spaces with _, strips non a-z0-9_, ensures leading letter, slices to 50. fieldConfigSchema enforces key regex ^[a-z][a-z0-9_]*$, 2-50 chars. updateFieldAction intentionally omits key (immutable).
- **Source:** `apps/web/src/app/(artist)/bookings/form/field-form.tsx:42-93`, `apps/web/src/app/(artist)/bookings/form/actions.ts:44`, `apps/web/src/app/(artist)/bookings/form/actions.ts:146-149`, `packages/shared/src/custom-fields.ts:39-71`, `packages/shared/src/custom-fields.ts:75-82`

### Custom field options editor (select/radio)
- **What it does:** For Dropdown and Radio types, an inline editable list of options with add (+ Add option) and remove (x) buttons; each option max 100 chars. Requires at least 2.
- **Why needed:** Lets artists offer fixed choices (e.g. budget bands, skin tone, placement areas) rather than free text.
- **How it works:** NEEDS_OPTIONS={select,radio}; options stored in state, serialized into hidden input as JSON. Server parseOptions JSON-parses and filters to non-empty strings. fieldConfigSchema.superRefine errors '<type> fields require at least 2 options' if <2.
- **Source:** `apps/web/src/app/(artist)/bookings/form/field-form.tsx:10-16`, `apps/web/src/app/(artist)/bookings/form/field-form.tsx:111-145`, `apps/web/src/app/(artist)/bookings/form/actions.ts:281-292`, `packages/shared/src/custom-fields.ts:60-71`

### Custom field placeholder + help text + required checkbox
- **What it does:** Optional placeholder (shown for short/long text, number, date; max 200) , optional help text (max 500), and a 'Required field' checkbox.
- **Why needed:** Guides clients on what to enter (placeholder/help) and lets the artist force critical answers (required).
- **How it works:** NEEDS_PLACEHOLDER={short_text,long_text,number,date} controls placeholder visibility. fieldConfigSchema caps placeholder<=200, help_text<=500. required submitted as 'on' checkbox, parsed to boolean. Saved on custom_fields row.
- **Source:** `apps/web/src/app/(artist)/bookings/form/field-form.tsx:11-16`, `apps/web/src/app/(artist)/bookings/form/field-form.tsx:147-183`, `apps/web/src/app/(artist)/bookings/form/actions.ts:30-36`, `packages/shared/src/custom-fields.ts:53-58`

### Edit custom field
- **What it does:** Inline-edits an existing custom field's label, type, options, placeholder, help text, and required flag (key stays fixed).
- **Why needed:** Artists refine wording or change a field's input type without recreating it and losing its identity.
- **How it works:** 'Edit' sets editingId; FieldForm pre-filled with field. updateFieldAction re-validates with fieldConfigSchema and updates custom_fields by id+artist_id, deliberately not writing key. revalidatePath('/bookings/form'). Edit button uses onMouseDown stopPropagation so a click on a draggable row doesn't start a drag.
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:356-362`, `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:404-411`, `apps/web/src/app/(artist)/bookings/form/actions.ts:116-165`

### Toggle custom field active/inactive
- **What it does:** Per custom field, a switch to include/exclude it from the live form without deleting it; inactive rows dim.
- **Why needed:** Artists temporarily retire a question (e.g. a seasonal promo field) and re-enable it later without losing the definition.
- **How it works:** Toggle calls updateFieldActive(id,active) → toggleFieldActiveAction(id,active) updating custom_fields.active by id+artist_id. Local state updated optimistically. revalidatePath('/bookings/form').
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:208-213`, `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:399-402`, `apps/web/src/app/(artist)/bookings/form/actions.ts:167-184`

### Remove custom field (soft/hard delete)
- **What it does:** Deletes a custom field after a confirm() prompt. If any booking already answered it, it is soft-deleted (hidden but preserved); otherwise hard-deleted.
- **Why needed:** Lets artists clean up the form while keeping historical bookings' answers intact and readable.
- **How it works:** confirm('Remove X? This cannot be undone.') then removeField → deleteFieldAction. Action checks via serviceClient whether any booking_requests.form_data contains custom_answers with this key. If count>0: update deleted_at+active=false; else delete row. Also filters the field id out of settings.field_order. revalidatePath('/bookings/form').
- **Source:** `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:215-221`, `apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx:413-426`, `apps/web/src/app/(artist)/bookings/form/actions.ts:219-279`

### Field-form inline validation + error display
- **What it does:** Shows the first zod validation error inline (e.g. key/option/length errors) and disables submit with a spinner while pending. Auto-closes the form on success.
- **Why needed:** Immediate feedback so artists fix bad field definitions before they reach clients.
- **How it works:** useActionState wraps create/update actions; state.error rendered in destructive text; pending disables submit; useEffect calls onDone() when state has 'success'. Errors surfaced from fieldConfigSchema.issues[0].message.
- **Source:** `apps/web/src/app/(artist)/bookings/form/field-form.tsx:36-78`, `apps/web/src/app/(artist)/bookings/form/field-form.tsx:185-207`, `apps/web/src/app/(artist)/bookings/form/actions.ts:38-39`

### Empty state for custom fields
- **What it does:** When no custom fields exist (in the standalone field-list variant), shows 'No custom fields yet. Add one to extend your booking form.'
- **Why needed:** Tells new artists the section is empty and nudges them to add their first question.
- **How it works:** field-list.tsx renders the message when fields.length===0 and mode!=='add'. (Note: the live page uses unified-field-list, which always shows the 8 standard rows so it is never truly empty.)
- **Source:** `apps/web/src/app/(artist)/bookings/form/field-list.tsx:46-50`

### Page: Books & Availability (/bookings/settings)
- **What it does:** The live config page for availability, booking mode, slots (in fixed mode), and a link to the studio library. Title 'Books & Availability'.
- **Why needed:** One screen where artists control when/how they accept work and publish slots.
- **How it works:** Server component loads profiles(timezone, booking_mode, settings) and slots (status != cancelled, ordered by starts_at). Formats slots via formatSlotDisplay. Computes windowExpired. Renders AvailabilityForm, BookingModeForm, conditional Slots section (only fixed_slots), and a Studios link to /travel#studios.
- **Source:** `apps/web/src/app/(artist)/bookings/settings/page.tsx:13-148`

### Accept booking requests toggle (open/close books, instant save)
- **What it does:** A switch that opens or closes the artist's books immediately, with an inline Open/Closed status pill. When off, the public page shows a closed message and waitlist form.
- **Why needed:** The core 'I'm accepting work / I'm not' control; artists flip it when they fill up or go on break.
- **How it works:** AvailabilityForm toggle calls toggleBooksOpenAction(newValue) immediately (optimistic; reverts on error). The action merges books_open into settings.books_settings (preserving other fields via parseBooksSettings) and writes an audit row (books_opened/books_closed). status pill shows Open only when books_open && !windowExpired. revalidatePath('/bookings/settings').
- **Source:** `apps/web/src/app/(artist)/bookings/settings/availability-form.tsx:18-85`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:45-84`

### Booking cap setting
- **What it does:** Optional numeric cap that auto-closes books once the number of active requests reaches it. Counts pending, approved, and deposit-pending requests.
- **Why needed:** Prevents an artist from being flooded; they can say 'take 20 requests then stop' without manually closing.
- **How it works:** Number input (min 1, step 1). saveAvailabilityAction parses booking_cap: only >0 numbers kept, else null; merges into books_settings preserving books_open. On the public page, isCapReached = active count >= cap (status in pending/approved/deposit_pending) and closes the page with 'fully booked' copy.
- **Source:** `apps/web/src/app/(artist)/bookings/settings/availability-form.tsx:89-110`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:136-141`, `apps/web/src/app/[slug]/page.tsx:445-457`

### Close books on (auto-close date)
- **What it does:** Optional date after which books auto-close at midnight. Drives the windowExpired/closed state everywhere.
- **Why needed:** Artists running time-boxed openings ('books open until June 30') can set-and-forget instead of remembering to close.
- **How it works:** DateInput name=booking_window_ends_at; saveAvailabilityAction stores the string or null. windowExpired = isDateKeyBefore(booking_window_ends_at, todayInTimeZone(timezone)). Closed copy on public page: 'Books were open until <date> and are now closed.'
- **Source:** `apps/web/src/app/(artist)/bookings/settings/availability-form.tsx:112-129`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:142-143`, `apps/web/src/app/(artist)/bookings/settings/page.tsx:52-57`, `apps/web/src/app/[slug]/page.tsx:466-469`

### Closed message editor (280-char counter)
- **What it does:** Optional message shown on the public page when books are closed/full, with a live N/280 character counter that turns red over the limit.
- **Why needed:** Lets artists set expectations when closed (e.g. 'Books reopen in September, join the waitlist').
- **How it works:** Textarea bound to state; counter message.length/280. saveAvailabilityAction trims to null if empty and rejects >280 with 'closed message must be 280 characters or fewer'. Shown on public page only for manual-close case (books_open false).
- **Source:** `apps/web/src/app/(artist)/bookings/settings/availability-form.tsx:131-158`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:145-149`, `apps/web/src/app/[slug]/page.tsx:470-472`

### Availability form save (cap + window + message)
- **What it does:** Saves cap, auto-close date, and closed message together; books_open is intentionally NOT touched here (managed only by the toggle).
- **Why needed:** Batch-edit the supporting availability settings without accidentally flipping open/closed state.
- **How it works:** useActionState(saveAvailabilityAction); shows inline error or 'Saved.' The action re-reads settings, merges parseBooksSettings(current) then overrides cap/window/message but preserves books_open from DB. revalidatePath('/bookings/settings').
- **Source:** `apps/web/src/app/(artist)/bookings/settings/availability-form.tsx:88-174`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:126-180`

### Booking mode selector (preferred date vs fixed slots)
- **What it does:** Two radio cards: 'Preferred date' (clients suggest a date, artist confirms) and 'Fixed slots' (artist publishes slots, clients pick). Save button enabled only when changed; shows 'active' on the current saved mode.
- **Why needed:** Different artists work differently; this picks the whole booking interaction model clients experience.
- **How it works:** BookingModeForm posts booking_mode to saveBookingModeAction which validates it's preferred_date|fixed_slots, updates profiles.booking_mode + updated_at, writes audit 'booking_mode_changed'. revalidatePath('/bookings/settings'). Save disabled unless selected !== savedMode.
- **Source:** `apps/web/src/app/(artist)/bookings/settings/booking-mode-form.tsx:8-121`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:12-43`

### Slot setup modal on switching to fixed slots
- **What it does:** After saving a switch into fixed-slots mode (from a non-fixed mode), a modal opens with the slot pattern builder, plus a 'Skip for now. I'll set up slots later' link.
- **Why needed:** Guides artists to immediately publish slots so their link isn't dead-on-arrival after switching modes.
- **How it works:** On successful save where selected==='fixed_slots' && prevSaved!=='fixed_slots', setModalOpen(true). Skip calls skipSlotSetupAction, which (deduped) creates a high-priority system_warning notification 'No time slots set up yet' with CTA to /bookings/settings.
- **Source:** `apps/web/src/app/(artist)/bookings/settings/booking-mode-form.tsx:38-67`, `apps/web/src/app/(artist)/bookings/settings/booking-mode-form.tsx:123-159`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:86-124`

### Slots section (fixed-slots only)
- **What it does:** Visible only in fixed_slots mode: 'Add time slot' button plus a list of all non-cancelled slots with date/time/timezone and status, in the artist's timezone.
- **Why needed:** Artists who work by fixed appointments need to publish and manage the exact times clients can book.
- **How it works:** page.tsx renders the section when bookingMode==='fixed_slots'. Slots queried (status != cancelled, ordered by starts_at), formatted with formatSlotDisplay(starts_at, duration, timezone) into {date,time,tz,status}.
- **Source:** `apps/web/src/app/(artist)/bookings/settings/page.tsx:30-50`, `apps/web/src/app/(artist)/bookings/settings/page.tsx:106-123`

### Add time slot modal (pattern builder entry)
- **What it does:** '+ Add time slot' opens a modal with the SlotPatternBuilder and a close (×) button.
- **Why needed:** Primary entry point to bulk-create slots without leaving the availability page.
- **How it works:** AddSlotButton holds open state; modal renders <SlotPatternBuilder timezone onDone={close}>.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/add-slot-button.tsx:6-52`

### Slot pattern builder: time windows
- **What it does:** Define one or more start–end time windows; add/remove windows. Each window becomes one bookable appointment slot on each chosen date.
- **Why needed:** Artists often run several appointment blocks per day (morning/afternoon); this models them as discrete bookable slots.
- **How it works:** windows state array with TimeInput pairs; validWindows = those with start && end && end>start. On submit windows serialized to windows_json. Server createSlotsFromPatternAction validates each window has start<end else error.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:44-80`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:181-222`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:113-127`

### Slot pattern builder: apply to specific dates
- **What it does:** Pick individual calendar dates (add via DateInput + Add; remove via chips). Slots created for each window on each date.
- **Why needed:** For artists who open scattered, non-recurring days (e.g. one-off guest spots).
- **How it works:** applyMode='dates'; specificDates state (deduped, sorted, min tomorrow). On submit dates_json sent; server parses, requires >=1 date, builds slots per window per date with localToUTC(date, time, timezone).
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:92-99`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:286-323`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:155-167`

### Slot pattern builder: apply to weekdays over a date range
- **What it does:** Select weekdays (Mo–Su) and a From/To date range; generates slots for every matching weekday in the range.
- **Why needed:** For artists with a recurring weekly schedule (e.g. every Tue/Thu for the next two months).
- **How it works:** applyMode='weekdays'; weekdays toggle buttons, From/To DateInputs (min tomorrow). Server iterates dateKeys from from_date..to_date, includes those whose (getDay()+6)%7 is in weekdays. Requires >=1 weekday and a valid range. Slots built per window per matched date.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:84-88`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:245-284`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:132-154`

### Slot pattern builder: live count preview + create
- **What it does:** Shows 'Creates N slots.' live (validWindows × dateCount), submit button labeled 'Create N slots', client-side guards, success message, and auto-close after ~1s.
- **Why needed:** Confidence about how many slots a bulk action will generate before committing.
- **How it works:** slotCount = validWindows.length * dateCount. Submit disabled when slotCount===0. createSlotsFromPatternAction inserts all slots (status:open) and returns {success,count}; UI shows '<count> slots added.' then onDone after 1000ms. revalidatePath('/bookings/settings').
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:101-175`, `apps/web/src/app/(artist)/bookings/slots/slot-pattern-builder.tsx:326-356`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:96-195`

### Single slot + block-of-slots creator (create-slot-form, legacy)
- **What it does:** Alternate slot creator with two modes: Single slot (one date+time+duration) and Block of slots (date + start/end window subdivided by duration into back-to-back slots), with a live sub-slot count.
- **Why needed:** Quick ways to add either one appointment or a full day chopped into fixed-length appointments.
- **How it works:** createSlotAction inserts one slot (startsAt=localToUTC, endsAt=+duration). createSlotBlockAction calls generateSubSlots(date,start,end,duration,tz) and bulk-inserts; errors 'No slots can fit in that time range.' if none. DURATIONS=[30,60,90,120,150,180,240]. Note: this component lives under slots/ but the live settings page uses AddSlotButton/SlotPatternBuilder instead.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/create-slot-form.tsx:9-175`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:10-94`

### Slot list + delete
- **What it does:** Lists slots with date, time·timezone and a status badge; open slots get a 'delete' action. Optimistically hides deleted rows.
- **Why needed:** Artists remove mistakenly-posted or no-longer-available slots; booked ones can't be deleted.
- **How it works:** SlotList delete → deleteSlotAction which deletes only where id+artist_id and status='open' (booked/cancelled slots are protected). Optimistic local 'deleted' set hides the row on success.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-list.tsx:15-65`, `apps/web/src/app/(artist)/bookings/slots/actions.ts:197-215`

### Slot list empty state
- **What it does:** When there are no slots, shows 'no slots yet. add one above.' in a bordered card.
- **Why needed:** Signals to fixed-slots artists that they still need to publish availability.
- **How it works:** SlotList returns the empty card when visible.length===0.
- **Source:** `apps/web/src/app/(artist)/bookings/slots/slot-list.tsx:27-35`

### Studios secondary entry point
- **What it does:** A 'Open studio library →' link to /travel#studios, explaining slots auto-pick up trip locations when a trip leg covers the slot date.
- **Why needed:** Travelling/guest-spot artists tie slots to physical studio locations managed in the travel section.
- **How it works:** Static Link to /travel#studios; no server action on this surface.
- **Source:** `apps/web/src/app/(artist)/bookings/settings/page.tsx:125-145`

### Form appearance selector (orphaned/unwired)
- **What it does:** A dark/light/auto theme picker for the public form (auto = follow visitor's system). Defined and wired to saveFormAppearanceAction (writes books_settings.form_appearance, revalidates settings + booking-form + /[slug]), but the component is not imported by any live page.
- **Why needed:** Would let artists match their public form theme to their brand; currently dead UI (the action persists form_appearance but nothing renders the chooser).
- **How it works:** FormAppearanceForm posts form_appearance (dark|light|auto) to saveFormAppearanceAction. parseBooksSettings reads form_appearance (default 'dark'). Grep confirms the only reference to FormAppearanceForm is its own file — no page renders it.
- **Source:** `apps/web/src/app/(artist)/bookings/settings/form-appearance-form.tsx:1-97`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:182-229`, `packages/shared/src/books-settings.ts:41-45`

### Old books-form variant (orphaned)
- **What it does:** An older single-form Books settings page (open toggle, cap, window, message) with its own saveBooksSettingsAction that overwrites the whole books_settings object (and writes a books_opened/books_closed audit).
- **Why needed:** Superseded by AvailabilityForm; behavior differs (it overwrites form_appearance back to default since it omits it). Only reachable if bookings/books rendered it, but bookings/books just redirects.
- **How it works:** BooksForm + saveBooksSettingsAction set settings.books_settings = {books_open, booking_cap, booking_window_ends_at, books_closed_message} (no form_appearance preserved). revalidatePath('/bookings/books','/bookings/settings'). Not rendered by the live redirecting page.
- **Source:** `apps/web/src/app/(artist)/bookings/books/books-form.tsx:11-132`, `apps/web/src/app/(artist)/bookings/books/actions.ts:9-71`

### Custom-answer validation (downstream of field config)
- **What it does:** On public-form submit, validates client answers against the artist's active custom fields: rejects unknown keys, enforces required, type-checks numbers, normalizes checkboxes, and validates select/radio against allowed options; snapshots label+type+value with each answer.
- **Why needed:** Ensures the artist's custom-field rules (required, options, types) are actually enforced and that answers stay readable even if the field later changes.
- **How it works:** validateCustomAnswers(rawValues, fields) returns {ok, answers} or an error+field id (cf_<key>). formatCustomAnswer renders booleans as yes/no and dates as dd Mon yyyy. Snapshots stored in booking_requests.form_data.custom_answers (which delete checks reference).
- **Source:** `packages/shared/src/custom-fields.ts:84-169`, `apps/web/src/app/(artist)/bookings/form/actions.ts:233-237`

**Notes:** Route reality (Slice 60b reshuffle): only TWO pages are live — /bookings/booking-form (form builder + share + fields) and /bookings/settings (availability + booking mode + slots). The directories named in the prompt (bookings/form, bookings/public-page, bookings/slots, bookings/books, settings/fields, settings/slots, settings/books) are ALL redirect stubs whose page.tsx only calls redirect(); their action/component files are reused by the live pages or are orphaned. Specifically: (a) bookings/form/* actions + field-form + unified-field-list ARE used by booking-form/page.tsx (it imports ../form/unified-field-list and ../public-page/public-page-client); (b) bookings/slots/* (add-slot-button, slot-pattern-builder, slot-list, actions) ARE used by bookings/settings/page.tsx; (c) bookings/form/field-list.tsx and standard-fields.tsx are NOT used by the live page (unified-field-list replaced them) — field-list still holds the up/down arrow reorder + 'No custom fields yet' empty state; standard-fields holds a separate last-contact-method guard (can't disable the last of Instagram/email); (d) FormAppearanceForm is fully orphaned though its server action works; (e) bookings/books/books-form.tsx + actions.ts is an older Books form, orphaned behind a redirect, and notably overwrites books_settings without preserving form_appearance; (f) the entire settings/fields, settings/slots, settings/books component+action sets are duplicated/orphaned behind redirecting page.tsx files.

Persistence model: form visibility/required flags live in profiles.settings.form_settings; field ordering in profiles.settings.field_order; availability/cap/window/closed-message/appearance in profiles.settings.books_settings; custom field defs in the custom_fields table (soft-delete via deleted_at); appointment slots in the slots table. parseFormSettings always forces show_email and show_preferred_date true; saveFormSettingsAction also forces those two true even if a false is submitted. Reordering custom fields' DB position uses the reorder_custom_field RPC (SECURITY INVOKER, auth.uid scoped) only in the legacy field-list arrows; the unified drag list persists ordering purely via settings.field_order (it does not change custom_fields.position).

Subtle behaviors: drag reorder skips revalidatePath for snappy optimistic UI; deleting a field that has historical answers soft-deletes instead of hard-deletes; the booking cap counts pending+approved+deposit_pending; window auto-close compares date keys in the artist's timezone; public closed-copy precedence is window-expired > manual-close > fixed-slots-no-slots > cap-reached. The single/block slot creator restricts new slots to dates from tomorrow onward (min=tomorrow); delete only works on open (unbooked) slots. Custom field key is immutable after creation; label edits keep the key so historical answers stay linked. There is a copy-rule deviation worth flagging: several user-visible strings here are lowercase rather than sentence case (e.g. 'not authenticated', 'a field with key X already exists', 'no slots yet. add one above.', and the standard-fields labels/descriptions like 'instagram handle'), which conflicts with the project's sentence-case copy rule.


---

## 8. Flash: designs / days / Instagram

The Flash surface is the artist's library of bookable tattoo designs and the tooling to populate it. It has three sub-tabs surfaced via FlashNav (Designs, Days, Instagram). "Designs" (/flash/items) is the grid of bookable flash pieces with inline tile actions (mark booked, publish, edit) plus a quick-create modal and a full edit page; each item carries pricing, availability windows, booking modes (unique/limited/repeatable), draft/published/archived status, and a public slug. "Days" (/flash/days) groups designs into a scheduled, optionally-public event (a studio flash day or themed drop) with a date, studio/external location, description, and a shareable public page; the day detail page lets the artist attach/detach designs in bulk. "Instagram" (/flash/instagram) is the fastest way to fill the library: the artist OAuth-connects their Instagram Business account, the app syncs up to 50 recent posts (caching thumbnails to Supabase storage), and the artist multi-selects posts to import as draft flash items. Background plumbing includes the OAuth callback route that exchanges codes for long-lived tokens and a cron route that refreshes tokens nearing expiry (marking dead accounts disconnected). The whole surface is built around turning an artist's existing Instagram presence and curated designs into directly-claimable bookings rather than generic time slots.

### Flash sub-navigation (Designs / Days / Instagram)
- **What it does:** Renders a section nav with three tabs linking the three Flash sub-pages.
- **Why needed:** Lets the artist move between their design library, their grouped flash-day events, and the Instagram importer without leaving the Flash context.
- **How it works:** FlashNav passes a fixed ITEMS array (Designs -> /flash/items, Days -> /flash/days, Instagram -> /flash/instagram) to SectionNav. Rendered only on mobile inside FlashLayout (md:hidden); on desktop these are reached via the app sidebar. /flash itself redirects to /flash/items.
- **Source:** `apps/web/src/components/flash-nav.tsx:3`, `apps/web/src/app/(artist)/flash/layout.tsx:11`, `apps/web/src/app/(artist)/flash/page.tsx:4`

### Designs grid (flash items list)
- **What it does:** Shows all of the artist's flash items as a responsive tile grid, newest first, with per-item availability labels.
- **Why needed:** The artist's at-a-glance inventory of bookable designs and their current state (booked, draft, fully booked, expired, etc.).
- **How it works:** Server component queries flash_items for the user (id,title,status,preview_image_url,booking_mode,max_bookings,is_bookable,available_from,available_until,slug) ordered by created_at desc. For each item it computes availability via computeFlashAvailability using a count of active booking_requests (status in pending/approved/deposit_pending) looked up in one batched query. Availability label is hidden for the common happy path (bookable + unlimited) to keep tiles clean; otherwise formatFlashAvailabilityLabel renders Booked/Fully booked/Not yet available/Expired/Disabled/Draft/Archived/N remaining.
- **Source:** `apps/web/src/app/(artist)/flash/items/page.tsx:40`, `apps/web/src/app/(artist)/flash/items/page.tsx:78`, `apps/web/src/app/(artist)/flash/items/page.tsx:134`, `apps/web/src/lib/flash.ts:38`, `apps/web/src/lib/flash.ts:72`

### View flash page link (public preview)
- **What it does:** Shows a 'View flash page' link that opens the artist's public flash page in a new tab.
- **Why needed:** Lets the artist see exactly what clients see and grab the public URL to share.
- **How it works:** Rendered only when items exist and the profile has a slug; href is `${NEXT_PUBLIC_APP_URL}/${slug}/flash`, target=_blank with rel=noopener noreferrer.
- **Source:** `apps/web/src/app/(artist)/flash/items/page.tsx:68`, `apps/web/src/app/(artist)/flash/items/page.tsx:104`

### Tile action: Booked toggle (pause/resume bookings)
- **What it does:** Marks a design as booked (not accepting requests) or reverts it, directly from the tile overlay.
- **Why needed:** Fast way to take a piece off the market (e.g. it sold) without archiving or editing, or to reopen it.
- **How it works:** Tile button (hidden unless status is not archived) optimistically flips local is_bookable and calls toggleFlashBookableAction(id, bookable). Action verifies auth, updates flash_items.is_bookable scoped to id+artist_id, revalidates /flash/items. On error the optimistic state is reverted. Button variant shows mustard 'active' when currently booked, ghost when bookable.
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-tile.tsx:52`, `apps/web/src/app/(artist)/flash/items/flash-tile.tsx:116`, `apps/web/src/app/(artist)/flash/items/actions.ts:248`

### Tile action: Publish (draft -> published)
- **What it does:** Publishes a draft design straight from the tile, making it live on the public flash page.
- **Why needed:** Removes friction between importing/creating a draft and actually offering it; one click to go live.
- **How it works:** Publish button shows only for draft items. Calls publishFlashItemAction(id) which sets status='published' scoped to id+artist_id and revalidates /flash/items and /flash/items/[id]. Draft tiles are visually dimmed (opacity-80 grayscale) until published.
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-tile.tsx:64`, `apps/web/src/app/(artist)/flash/items/flash-tile.tsx:129`, `apps/web/src/app/(artist)/flash/items/actions.ts:269`

### Tile action: Edit (inline edit modal)
- **What it does:** Opens an inline modal to edit the full design without navigating away from the grid.
- **Why needed:** Lets the artist tweak title/price/availability/status quickly while staying in their grid.
- **How it works:** Edit button opens FlashEditModal, which calls loadFlashItemForEditAction(itemId) to fetch the item (ownership-scoped) plus the artist's upcoming/active flash days, then renders FlashItemForm with onSuccess that closes the modal. Shows a spinner while loading and a destructive error if the item can't be found. Escape closes; backdrop click closes.
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-tile.tsx:140`, `apps/web/src/app/(artist)/flash/items/flash-edit-modal.tsx:19`, `apps/web/src/app/(artist)/flash/items/actions.ts:291`

### Tile reveal interaction (hover / tap)
- **What it does:** Reveals the action overlay (Booked/Publish/Edit) on hover (desktop) or tap (mobile), and shows the title strip otherwise.
- **Why needed:** Keeps the grid visually clean while still exposing per-item controls on demand.
- **How it works:** Tile div is role=button/tabIndex=0; click or Enter/Space toggles `revealed`; mouseleave resets it. Overlay opacity is driven by `revealed` OR group-hover. Title strip fades out when revealed. Keyboard focus ring uses brand-mustard.
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-tile.tsx:75`, `apps/web/src/app/(artist)/flash/items/flash-tile.tsx:109`, `apps/web/src/app/(artist)/flash/items/flash-tile.tsx:152`

### + New design fork modal (Instagram vs Upload manually)
- **What it does:** Header button that opens a chooser: import from Instagram or upload a design manually.
- **Why needed:** Steers the artist toward the fastest path (Instagram) while still allowing custom uploads.
- **How it works:** FlashNewItemButton renders '+ New design' (shown when items already exist). Click opens a fork dialog. 'Pick from Instagram' links to /flash/instagram with a dynamic subtitle (e.g. 'Choose from N synced posts', 'Resync to fetch your latest posts', or 'Connect your account first'). 'Upload manually' opens the FlashQuickCreateModal inline. Escape and backdrop dismiss the fork. Cancel button closes it.
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-new-item-button.tsx:41`, `apps/web/src/app/(artist)/flash/items/flash-new-item-button.tsx:57`, `apps/web/src/app/(artist)/flash/items/flash-new-item-button.tsx:97`

### Quick-create flash design modal
- **What it does:** Lightweight image-first modal to create a new flash item with optional title/price and a 'More settings' disclosure for everything else.
- **Why needed:** Lowers the barrier to adding a design: drop an image and save, refine later.
- **How it works:** FlashQuickCreateModal posts to createFlashItemAction via useActionState. Centrepiece is an image drop zone (file input accept png/jpeg/webp); chosen file is compressed/validated client-side by prepareImageUpload then re-applied with applyFileToInput; preview via object URL; image errors shown inline. Title is optional (defaults to 'Untitled flash' server-side). Price block: select request/fixed/from with a euro amount when not 'request'. 'More settings' reveals Status (draft/published), Accepting bookings toggle, Booking availability (unique/limited/repeatable with required max_bookings when limited), short description, Instagram post URL, size info, placement, available from/until date inputs, and flash-day association (when days exist). Closes on success (action revalidates the grid). Escape and backdrop dismiss; Cancel button closes. Submit shows a spinner while pending.
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-quick-create-modal.tsx:34`, `apps/web/src/app/(artist)/flash/items/flash-quick-create-modal.tsx:104`, `apps/web/src/app/(artist)/flash/items/flash-quick-create-modal.tsx:216`, `apps/web/src/app/(artist)/flash/items/actions.ts:56`

### Create flash item (server action)
- **What it does:** Inserts a new flash_items row from the create form/modal, including optional image upload.
- **Why needed:** Persists a new bookable design owned by the artist.
- **How it works:** createFlashItemAction: requires auth; generates a UUID; title falls back to 'Untitled flash'; slug derived from explicit slug or slugified title or `flash-<uuid8>`; booking_mode validated against unique/limited/repeatable (default unique); limited requires max_bookings>=1 else error; price_type validated against fixed/from/request (default request), price nulled when 'request'; preview image: if a file is present it is read, capped at 5MB, resized to 1200x1200 inside via sharp and converted to webp@85, uploaded to the public 'logos' bucket at `${artistId}/flash/${itemId}.webp` (upsert) with a cache-busting ?t=; failed decode/upload silently yields no image; is_bookable defaults true unless 'false'; status='published' only when explicitly published else draft. Inserts into flash_items scoped to artist_id. Duplicate-slug DB error mapped to a friendly message. Revalidates /flash/items and returns {success,id}.
- **Source:** `apps/web/src/app/(artist)/flash/items/actions.ts:56`, `apps/web/src/app/(artist)/flash/items/actions.ts:23`, `apps/web/src/app/(artist)/flash/items/actions.ts:106`

### Full flash item create/edit form
- **What it does:** The complete design editor used on the detail page and inside the edit modal: title, slug, status, bookable toggle, booking mode cards, description, image, IG URL, pricing, size/placement, availability window, flash-day link.
- **Why needed:** Gives the artist full control over how a design is presented and booked.
- **How it works:** FlashItemForm chooses create vs update action by presence of initial.id. Title required; slug required and auto-derived from title (slugify) until the artist edits it manually; live public-URL preview shown. Status select (draft/published/archived). 'Accepting bookings' switch maps to hidden is_bookable. Booking availability rendered as three selectable radio cards (Unique/Limited/Repeatable); Limited reveals a required max_bookings number input (min 1) with helper noting only approved bookings consume capacity. Image: upload (client-compressed via prepareImageUpload, object-URL preview, broken-image hide via onError) or paste an image URL. Optional Instagram post URL, pricing select with euro field, size info, placement notes, two DateInput availability fields, and a flash-day select (only when days exist). Create redirects to the new item's detail page; edit-in-modal closes on success and shows 'Saved.'; errors rendered in destructive text.
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-item-form.tsx:40`, `apps/web/src/app/(artist)/flash/items/flash-item-form.tsx:88`, `apps/web/src/app/(artist)/flash/items/flash-item-form.tsx:177`, `apps/web/src/app/(artist)/flash/items/flash-item-form.tsx:269`

### Update flash item (server action)
- **What it does:** Saves edits to an existing flash item, with ownership check and optional image replacement.
- **Why needed:** Lets the artist change any attribute of a design after creation.
- **How it works:** updateFlashItemAction: requires auth and id; performs an ownership lookup (id+artist_id) and 404s if not found; applies the same lenient title/slug rules and booking_mode/price_type validation as create; replaces preview image only if a new file is uploaded, otherwise keeps the pasted URL or the existing image; updates flash_items scoped to id+artist_id; duplicate-slug error friendly-mapped; revalidates /flash/items and /flash/items/[id].
- **Source:** `apps/web/src/app/(artist)/flash/items/actions.ts:137`, `apps/web/src/app/(artist)/flash/items/actions.ts:150`, `apps/web/src/app/(artist)/flash/items/actions.ts:196`

### Flash item detail page (stats sidebar)
- **What it does:** Full edit page for a single design plus a stats sidebar (availability, pending, confirmed, capacity, price) and contextual links.
- **Why needed:** Deep-dive management of one design with live booking counts.
- **How it works:** /flash/items/[id] loads the ownership-scoped item, the artist's upcoming/active flash days, and the profile slug. Separately counts approved (confirmed) and pending booking_requests for the item. Renders FlashItemForm pre-filled. Sidebar shows availability (green when bookable), pending/confirmed counts, capacity (confirmed/max) for limited mode, and formatted price. Breadcrumb back to Flash Items. notFound() when the item doesn't exist.
- **Source:** `apps/web/src/app/(artist)/flash/items/[id]/page.tsx:24`, `apps/web/src/app/(artist)/flash/items/[id]/page.tsx:43`, `apps/web/src/app/(artist)/flash/items/[id]/page.tsx:108`

### Detail page: View public page link
- **What it does:** Opens the design's live public page, or explains why it can't yet.
- **Why needed:** Quick QA / sharing of a published design.
- **How it works:** Shown only when status='published' and the profile has a slug; builds URL via publicArtistUrl(slug, {subpath:`/flash/${item.slug}`}); otherwise shows 'Publish this item to make it publicly visible.'
- **Source:** `apps/web/src/app/(artist)/flash/items/[id]/page.tsx:59`, `apps/web/src/app/(artist)/flash/items/[id]/page.tsx:146`

### Detail page: Pause/Resume bookings + Archive
- **What it does:** Sidebar buttons to toggle bookable on/off and to archive the item (with confirm).
- **Why needed:** Stop taking requests temporarily, or permanently retire a design.
- **How it works:** FlashItemActions: 'Pause bookings'/'Resume bookings' optimistically toggles and calls toggleFlashBookableAction(id, next). 'Archive item' shows a window.confirm warning then calls archiveFlashItemAction(id) which sets status='archived' and is_bookable=false scoped to id+artist_id and revalidates /flash/items. When the item is already archived the component renders only an 'Archived' label.
- **Source:** `apps/web/src/app/(artist)/flash/items/[id]/flash-item-actions.tsx:12`, `apps/web/src/app/(artist)/flash/items/[id]/flash-item-actions.tsx:20`, `apps/web/src/app/(artist)/flash/items/actions.ts:230`

### Detail page: View related bookings link
- **What it does:** Links to the bookings overview filtered to requests when the item has any pending/confirmed bookings.
- **Why needed:** Jump from a design to the actual booking requests it generated.
- **How it works:** Rendered only when confirmedCount+pendingCount>0; links to /bookings/overview?view=requests.
- **Source:** `apps/web/src/app/(artist)/flash/items/[id]/page.tsx:171`

### Designs empty state (3 context-aware variants)
- **What it does:** When the artist has no designs, shows a tailored CTA based on Instagram connection/sync state.
- **Why needed:** Guides a new artist to the fastest way to populate their library.
- **How it works:** FlashEmptyState branches: (1) IG connected + posts synced -> 'You have N synced Instagram posts' with 'Pick from Instagram' + 'Or upload a design manually'; (2) IG connected but 0 posts -> '@username connected, no posts synced' with 'Open Instagram settings'; (3) no IG -> 'Start with Instagram' with 'Connect Instagram' when configured (else a note that IG isn't configured) plus 'Or upload a design manually'. isInstagramConfigured() gates the connect CTA.
- **Source:** `apps/web/src/app/(artist)/flash/items/page.tsx:127`, `apps/web/src/app/(artist)/flash/items/page.tsx:162`, `apps/web/src/app/(artist)/flash/items/page.tsx:241`

### Or upload a design manually (empty-state shortcut)
- **What it does:** Inline link in empty states that opens the quick-create modal instead of navigating.
- **Why needed:** Lets the artist add a manual design without losing the empty-state context.
- **How it works:** FlashUploadManuallyLink toggles open the same FlashQuickCreateModal used by '+ New design', passing the artist's flashDays.
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-upload-manually-link.tsx:15`, `apps/web/src/app/(artist)/flash/items/page.tsx:203`

### Legacy /flash/items/new redirect
- **What it does:** Old dedicated create page now redirects to the items grid (where the modal lives).
- **Why needed:** Keeps cached bookmarks/in-app links working after the create flow moved to a modal.
- **How it works:** NewFlashItemRedirect calls redirect('/flash/items').
- **Source:** `apps/web/src/app/(artist)/flash/items/new/page.tsx:8`

### Flash item availability engine
- **What it does:** Computes whether a design is bookable and why, plus remaining capacity for limited mode.
- **Why needed:** Drives every availability label and the public bookable/closed state consistently.
- **How it works:** computeFlashAvailability returns not-bookable for draft/archived/disabled; checks available_from/until against today's local date key (not_yet/expired); repeatable is always bookable; unique is booked once activeRequestCount>=1; limited computes remaining = max(0, max_bookings - activeRequestCount) and is full at 0. formatFlashAvailabilityLabel maps reasons to copy. formatPrice formats euro fixed/from/request.
- **Source:** `apps/web/src/lib/flash.ts:38`, `apps/web/src/lib/flash.ts:72`, `apps/web/src/lib/flash.ts:97`

### Days list page
- **What it does:** Lists all flash days with status pill, public/private badge, date, location, design count, and per-row actions.
- **Why needed:** Overview of the artist's flash-day events and their visibility.
- **How it works:** Server component queries flash_days for the user joined to studios(name,city) and flash_items(id) for counts, ordered by scheduled_on desc, plus the profile slug. Renders a DayStatusPill (upcoming/active/past/cancelled with tinted styles) and a Public/Private badge. Location resolves to 'studio name · city' or the free-text location. Each row: title, date (or 'No date set'), location, and 'N designs'.
- **Source:** `apps/web/src/app/(artist)/flash/days/page.tsx:42`, `apps/web/src/app/(artist)/flash/days/page.tsx:7`, `apps/web/src/app/(artist)/flash/days/page.tsx:94`

### Day row actions: Copy link / View / Edit
- **What it does:** Per-day actions to copy the public URL, open the public page, and edit the day.
- **Why needed:** Share a day's link to clients and jump into editing.
- **How it works:** When the day is public and slug exists, a public URL is built via publicArtistUrl(slug,{subpath:`/flash/days/${day.id}`}). CopyButton copies it to clipboard (navigator.clipboard, shows 'Copied!' for 2s); 'View ↗' opens it in a new tab. 'Edit' links to /flash/days/[id]. Copy/View are hidden for private days.
- **Source:** `apps/web/src/app/(artist)/flash/days/page.tsx:138`, `apps/web/src/app/(artist)/flash/days/page.tsx:155`, `apps/web/src/components/copy-button.tsx:18`

### Days empty state + New day buttons
- **What it does:** Empty-state prompt to create the first day and header '+ New day' button.
- **Why needed:** Onboards the artist into grouping designs into events.
- **How it works:** When no days exist, shows an explanatory card with 'Create your first day' linking /flash/days/new. Header always shows '+ New day' linking the same route.
- **Source:** `apps/web/src/app/(artist)/flash/days/page.tsx:70`, `apps/web/src/app/(artist)/flash/days/page.tsx:79`

### Flash day create/edit form
- **What it does:** Form to create or edit a flash day: title, date, status, location (studio or external), description, public toggle.
- **Why needed:** Defines the event clients see and book against.
- **How it works:** FlashDayForm picks create vs update by initial.id. Title required. Date is an optional DateInput. Status select (upcoming/active/past/cancelled). Location is a single select: 'None', an optgroup of the artist's studios (studio name — city, country), or 'Other / external venue' which reveals a free-text 'External venue name' input; a hidden studio_id carries the chosen studio id (cleared for external). When the artist has no studios, a helper links to /travel#studios. Description textarea optional. 'Visible to clients' switch maps to a hidden is_public. Create redirects to the new day's detail page; edit shows 'Saved.'; errors in destructive text.
- **Source:** `apps/web/src/app/(artist)/flash/days/flash-day-form.tsx:27`, `apps/web/src/app/(artist)/flash/days/flash-day-form.tsx:103`, `apps/web/src/app/(artist)/flash/days/flash-day-form.tsx:172`

### Create flash day (server action)
- **What it does:** Inserts a new flash_days row.
- **Why needed:** Persists a new event owned by the artist.
- **How it works:** createFlashDayAction requires auth and a non-empty title (else 'Title is required.'). resolveLocationFields picks studio_id (and nulls location) when a studio is chosen, otherwise stores free-text location. Inserts title, scheduled_on, studio_id/location, description, status (default 'upcoming'), is_public (='true' check). Returns {success,id} and revalidates /flash/days.
- **Source:** `apps/web/src/app/(artist)/flash/days/actions.ts:28`, `apps/web/src/app/(artist)/flash/days/actions.ts:19`

### Update flash day (server action)
- **What it does:** Saves edits to an existing flash day, ownership-scoped.
- **Why needed:** Lets the artist change the event's details and visibility.
- **How it works:** updateFlashDayAction requires auth and title; resolves studio/external location the same way; updates flash_days scoped to id+artist_id; revalidates /flash/days and /flash/days/[id].
- **Source:** `apps/web/src/app/(artist)/flash/days/actions.ts:63`

### New flash day page (studio prefetch)
- **What it does:** Standalone create page that preloads the artist's studios for the location picker.
- **Why needed:** So the day's location can be tied to a real studio.
- **How it works:** NewFlashDayPage queries studios (id,name,city,country) for the user ordered by name and renders FlashDayForm with them.
- **Source:** `apps/web/src/app/(artist)/flash/days/new/page.tsx:10`

### Flash day detail page
- **What it does:** Edit a day plus manage which designs are attached to it.
- **Why needed:** Curate the exact set of pieces shown for the event.
- **How it works:** /flash/days/[id] loads the ownership-scoped day, the artist's studios, and all non-archived flash items; splits items into linked (flash_day_id===id) and unattached (flash_day_id===null) client-side; renders FlashDayForm pre-filled plus FlashDayItemsManager. Breadcrumb back to Days; notFound() when the day doesn't exist.
- **Source:** `apps/web/src/app/(artist)/flash/days/[id]/page.tsx:18`, `apps/web/src/app/(artist)/flash/days/[id]/page.tsx:43`

### Day items manager: attach designs (multi-select)
- **What it does:** Multi-select tile grid of the artist's unattached designs with a single 'Attach N' action.
- **Why needed:** Quickly populate a day with several existing designs in one go.
- **How it works:** FlashDayItemsManager tracks a Set of selected ids; tiles toggle on click and show a ✓ badge; 'Attach N' appears when something is selected and calls attachFlashItemsToDayAction(dayId, ids). That action verifies day ownership, updates flash_items.flash_day_id=dayId for the chosen ids scoped to artist_id, and revalidates /flash/days/[id] and /flash/items. Selection clears on success; errors shown in destructive text.
- **Source:** `apps/web/src/app/(artist)/flash/days/[id]/flash-day-items-manager.tsx:47`, `apps/web/src/app/(artist)/flash/days/[id]/flash-day-items-manager.tsx:142`, `apps/web/src/app/(artist)/flash/days/actions.ts:104`

### Day items manager: attached list + detach + edit
- **What it does:** Lists designs currently on the day with thumbnail/status, an Edit link, and a Remove (detach) button.
- **Why needed:** Remove a piece from an event or jump to edit it.
- **How it works:** Each attached row shows thumbnail (or placeholder), title, status. 'Edit' links /flash/items/[id]. 'Remove' calls detachFlashItemFromDayAction(dayId,itemId) which sets flash_day_id=null scoped to itemId+artist_id+flash_day_id=dayId, and revalidates /flash/days/[id] and /flash/items. When the library is entirely empty the manager shows a prompt linking to /flash/items.
- **Source:** `apps/web/src/app/(artist)/flash/days/[id]/flash-day-items-manager.tsx:61`, `apps/web/src/app/(artist)/flash/days/[id]/flash-day-items-manager.tsx:87`, `apps/web/src/app/(artist)/flash/days/actions.ts:140`

### Instagram page: account connection panel
- **What it does:** Shows whether IG is configured, and either a Connect button or the connected @username with last-sync time and Resync/Disconnect.
- **Why needed:** Central place to link/manage the Instagram source for flash imports.
- **How it works:** FlashInstagramPage checks isInstagramConfigured(); if not configured it lists the required env vars. If no connected account, shows a 'Connect Instagram' form posting connectInstagramAction. If connected, shows @username, a localized 'Last synced' date, and AccountActions (Resync/Disconnect). Page maxDuration=60 because resync downloads thumbnails.
- **Source:** `apps/web/src/app/(artist)/flash/instagram/page.tsx:29`, `apps/web/src/app/(artist)/flash/instagram/page.tsx:112`, `apps/web/src/app/(artist)/flash/instagram/page.tsx:124`

### Connect Instagram (OAuth start)
- **What it does:** Begins the Instagram OAuth flow.
- **Why needed:** Authorizes Inklee to read the artist's posts so they can become flash.
- **How it works:** connectInstagramAction requires auth (else redirect /login), generates a stateless HMAC-signed OAuth state embedding artistId+nonce+timestamp via generateOAuthState, then redirects to the Instagram authorize URL (scope instagram_business_basic) built by buildOAuthUrl.
- **Source:** `apps/web/src/app/(artist)/flash/instagram/actions.ts:16`, `apps/web/src/lib/instagram.ts:60`, `apps/web/src/lib/instagram.ts:99`

### Instagram OAuth callback (token exchange + initial sync)
- **What it does:** Handles the redirect back from Instagram, stores the account, and performs the first post sync.
- **Why needed:** Completes the connection and immediately fills the synced-posts gallery.
- **How it works:** GET /api/instagram/callback verifies state via verifyOAuthState (rejects denied/missing params -> ?error=denied; bad signature/expired -> ?error=state). Exchanges code -> short token -> long-lived token, fetches the IG user, upserts instagram_accounts (connected=true, token_expires_at, last_sync_at) on conflict artist_id. Fetches up to 50 media, downloads/transcodes each thumbnail to the logos bucket via downloadInstagramThumbnail, and upserts instagram_posts on conflict (artist_id,instagram_media_id). Redirects to /flash/instagram?connected=1; failures -> ?error=exchange. maxDuration=60.
- **Source:** `apps/web/src/app/api/instagram/callback/route.ts:15`, `apps/web/src/app/api/instagram/callback/route.ts:43`, `apps/web/src/app/api/instagram/callback/route.ts:57`

### Resync Instagram posts
- **What it does:** Re-fetches the latest posts from Instagram and refreshes the cached gallery.
- **Why needed:** Pulls in new posts the artist published after connecting.
- **How it works:** AccountActions 'Resync' button posts syncInstagramAction inside a transition (shows spinner + 'Caching thumbnails' note). The action requires a connected account (else redirect ?error=not_connected), fetches up to 50 media with the stored token, downloads thumbnails, upserts instagram_posts (onConflict artist_id,instagram_media_id), updates last_sync_at, then redirects ?synced=1. Any failure -> ?error=sync_failed.
- **Source:** `apps/web/src/app/(artist)/flash/instagram/account-actions.tsx:19`, `apps/web/src/app/(artist)/flash/instagram/actions.ts:27`

### Disconnect Instagram
- **What it does:** Marks the connected account as disconnected.
- **Why needed:** Lets the artist revoke the link (e.g. wrong account or privacy).
- **How it works:** AccountActions 'Disconnect' posts disconnectInstagramAction which sets instagram_accounts.connected=false (token row retained) scoped to artist_id and revalidates /flash/instagram. Synced posts gallery disappears since it's gated on a connected account.
- **Source:** `apps/web/src/app/(artist)/flash/instagram/account-actions.tsx:34`, `apps/web/src/app/(artist)/flash/instagram/actions.ts:88`

### Synced posts gallery + multi-select import
- **What it does:** Grid of synced IG posts with caption, 'View on Instagram' link, multi-select, and an 'Add to Flash' import action; already-imported posts are badged 'Added'.
- **Why needed:** The fast path to turn Instagram content into draft flash designs in bulk.
- **How it works:** Page loads up to 100 instagram_posts (newest first), resolves each preview_image_path to a public logos-bucket URL, and marks already_linked by matching instagram_post_id on existing flash_items. PostsBrowser lets the artist click selectable (non-linked) tiles to toggle selection (✓ badge), shows a running selected count, and 'Add to Flash (N)' calls importPostsAsFlashItemsAction(ids). View-on-Instagram links stopPropagation so they don't toggle selection. Result banner reports created count or error. Empty gallery shows a 'Resync to fetch' hint.
- **Source:** `apps/web/src/app/(artist)/flash/instagram/page.tsx:37`, `apps/web/src/app/(artist)/flash/instagram/posts-browser.tsx:32`, `apps/web/src/app/(artist)/flash/instagram/posts-browser.tsx:93`

### Import posts as flash items (server action)
- **What it does:** Creates draft flash items from selected Instagram posts, skipping already-linked posts.
- **Why needed:** Bulk-converts a curated selection of posts into bookable designs without manual entry.
- **How it works:** importPostsAsFlashItemsAction requires auth and a non-empty postIds list; loads those posts scoped to artist_id; excludes posts whose instagram_post_id already backs a flash item (error if all selected are already linked). For each remaining post it derives a title from the caption (titleFromCaption: first line minus #hashtags/@mentions, 60 chars; fallback 'Flash Design'), a unique slug `<slug>-<uuid8>`, status 'draft', price_type 'request', booking_mode 'unique', is_bookable true, preview_image_url from the cached preview path (or null), instagram_post_url=permalink, and instagram_post_id linking back. Inserts the batch into flash_items; revalidates /flash/items and /flash/instagram; returns {created}.
- **Source:** `apps/web/src/app/(artist)/flash/instagram/actions.ts:104`, `apps/web/src/app/(artist)/flash/instagram/actions.ts:141`, `apps/web/src/lib/instagram.ts:209`

### Instagram status banners (connected / synced / error)
- **What it does:** Top-of-page success/error banners reflecting the result of connect/sync via query params.
- **Why needed:** Tells the artist whether the connection or sync worked, and what to do on failure.
- **How it works:** Reads searchParams: connected=1 -> green 'Instagram connected...'; synced=1 -> green 'posts synced successfully'; error maps denied/not_connected/sync_failed/other to specific destructive messages.
- **Source:** `apps/web/src/app/(artist)/flash/instagram/page.tsx:83`, `apps/web/src/app/(artist)/flash/instagram/page.tsx:93`

### Instagram token refresh cron
- **What it does:** Background job that refreshes long-lived IG tokens nearing expiry and disconnects dead ones.
- **Why needed:** Keeps the Instagram connection alive without artist intervention; flags accounts that need reconnecting.
- **How it works:** GET /api/cron/instagram-refresh requires Authorization: Bearer ${CRON_SECRET} (else 401). Selects connected accounts with token_expires_at within 7 days; for each it calls refreshLongLivedToken and updates access_token+token_expires_at, counting refreshed; on failure it logs, marks the account connected=false, and counts failed. Returns {refreshed,failed}. Runs on the nodejs runtime.
- **Source:** `apps/web/src/app/api/cron/instagram-refresh/route.ts:7`, `apps/web/src/app/api/cron/instagram-refresh/route.ts:35`, `apps/web/src/lib/instagram.ts:150`

### Instagram thumbnail caching
- **What it does:** Downloads each IG CDN image, transcodes to WebP, and stores it in the public logos bucket; soft-fails per post.
- **Why needed:** Gives flash items permanent images that don't expire like IG CDN URLs, and keeps a 50-post sync from breaking on one bad asset.
- **How it works:** downloadInstagramThumbnail fetches the source (8s abort timeout), resizes to 1200px inside via sharp, writes webp@82 to logos at `${artistId}/instagram/${mediaId}.webp` (upsert keyed by stable media id so resyncs overwrite cleanly), and returns the path or null on any error. Used by both the callback and Resync.
- **Source:** `apps/web/src/lib/instagram-storage.ts:20`, `apps/web/src/lib/instagram-storage.ts:42`

### Feature intro modals (Designs / Days)
- **What it does:** 'What is this?' explainer modals on the Designs and Days headers that auto-show for empty features.
- **Why needed:** Educates artists on what flash and flash days are and nudges them to set up.
- **How it works:** FeatureIntroModal featureKey='flash-items' on Designs and 'flash-days' on Days. Auto-opens when the feature is empty and not dismissed this session / not within 7 days of last dismissal (localStorage). Shows title, description, bullets, a 'Maybe later' dismiss, and a mustard CTA (Create your first flash / Create your first flash day). Always reachable via the 'What is this?' button. Escape/backdrop dismiss.
- **Source:** `apps/web/src/app/(artist)/flash/items/page.tsx:116`, `apps/web/src/app/(artist)/flash/days/page.tsx:66`, `apps/web/src/components/feature-intro-modal.tsx:95`

### Client-side image compression/validation
- **What it does:** Compresses and validates images before upload in both the quick-create and full item forms.
- **Why needed:** Keeps uploads under the 5MB server cap and reduces wait time for large phone photos.
- **How it works:** On file pick, prepareImageUpload(f) validates/compresses; on error the input is cleared and an inline message shown; on success applyFileToInput writes the processed file back to the input and an object-URL preview is shown. The server action additionally re-validates (5MB cap, sharp re-encode to webp).
- **Source:** `apps/web/src/app/(artist)/flash/items/flash-quick-create-modal.tsx:133`, `apps/web/src/app/(artist)/flash/items/flash-item-form.tsx:304`, `apps/web/src/app/(artist)/flash/items/actions.ts:28`

**Notes:** Ownership/security: every flash-item and flash-day mutation re-checks auth and scopes by artist_id; the IG callback validates an HMAC-signed, 15-minute-expiry state param; the cron requires a Bearer CRON_SECRET. Capacity semantics: the Designs grid counts active requests as pending/approved/deposit_pending, but the item detail page's 'Confirmed' count and limited-mode capacity use only status='approved' (and 'Pending' uses status='pending'), so the grid's availability and the detail page's capacity can diverge slightly. The form helper text claims 'only confirmed (approved) bookings count against this limit' yet the grid availability includes pending/deposit_pending in its active count — a subtle inconsistency. Image bucket reuse: both flash and Instagram images live in the public 'logos' bucket (no auth), flash at `${artistId}/flash/${itemId}.webp` and IG at `${artistId}/instagram/${mediaId}.webp`; created flash items get a cache-busting ?t= suffix while imported ones use the bare public URL. Instagram is gated by isInstagramConfigured() which needs INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and (INSTAGRAM_STATE_SECRET OR CRON_SECRET); the state secret falls back to CRON_SECRET. Sync limits: 50 posts fetched per sync/callback, gallery displays up to 100 stored posts. Web-only conveniences: hover-reveal tile actions, optimistic booked/pause toggles with rollback, inline edit modal that lazy-loads the item, multi-select attach/import flows with single round-trips, clipboard copy for day links, legacy /flash/items/new and /flash redirects, and a maxDuration=60 bump on the IG page and callback to accommodate thumbnail caching. Empty/edge states are thorough: 3-variant Designs empty state, Days empty state, empty synced-posts gallery hint, 'all already linked' import guard, broken-image onError hide, and not-configured IG messaging. The detail-page 'View related bookings' link points to /bookings/overview?view=requests rather than a per-item filter.


---

## 9. Goods: products / variants / sales

The Goods surface is the artist's merch catalog manager. It lives under /goods with two sub-tabs in the app-shell nav: "Products" (/goods) and "Sales" (/goods/sales). On Products, the artist sees a responsive grid of square tiles for every product they own (sorted by sort_order then created_at), each showing a hero image, title, price, a draft marker, a status badge, and a multi-image count badge. Products are created and edited entirely in inline modals (no page navigation): a quick-create modal and an edit modal that lazily loads the full product + active variants. The shared product form captures images (multi-image picker with browser-side compression and a per-variant image cap), title, optional quantity, price + currency, description, optional variant rows (name/price-override/stock), a required publish-vs-draft visibility choice, and a collapsible "More settings" block (category, fine-grained status, pickup note, and a checkout add-on toggle). Tiles also expose two quick actions on hover/tap: a sold-out/available toggle and Edit. Variant edits are reconciled non-destructively on save so historical booking/order pointers survive (referenced variants are soft-hidden rather than deleted). The Sales tab is a read-only bookkeeping ledger of every paid product line item a client bought (deposits excluded), with items-sold and revenue summary cards, a per-line table (date, client, item+variant, qty, amount, pickup/fulfillment state), and refunded lines dimmed. A legacy /goods/[id] edit page and /goods/new redirect remain for old links. All product writes are server actions enforcing artist ownership and revalidating both /goods and the artist's public page.

### Products grid (list view)
- **What it does:** Renders every product the artist owns as square tiles in a responsive grid (2 cols mobile, up to 4 on md), in the artist's chosen showcase order.
- **Why needed:** A tattoo artist needs an at-a-glance catalog of all their merch (prints, shirts, stickers, flash sheets, originals) to manage what shows on their public page and at checkout.
- **How it works:** Server component queries products (id,title,image_url,image_urls,price_amount,currency,status,is_public_visible) filtered by artist_id=user.id, ordered by sort_order asc then created_at asc. Each row maps to a GoodsTileItem; image hero = first of image_urls (fallback to legacy image_url); status coerced to a valid ProductStatus (defaults active). Tiles keyed on `${id}-${status}` so a status change remounts with fresh local state.
- **Source:** `apps/web/src/app/(artist)/goods/page.tsx:21-98`, `apps/web/src/app/(artist)/goods/page.tsx:27-34`, `apps/web/src/app/(artist)/goods/page.tsx:86-95`

### Goods page header + description
- **What it does:** Shows the 'Goods' heading and explanatory copy telling the artist these products appear on their public page and as checkout add-ons.
- **Why needed:** Sets expectations about where products surface (public page + deposit-checkout add-ons) so the artist understands the dual purpose.
- **How it works:** Static heading and paragraph in the server component; the Add product button renders next to it only when products.length > 0.
- **Source:** `apps/web/src/app/(artist)/goods/page.tsx:61-73`

### Empty state with first-product CTA
- **What it does:** When the artist has no products, shows a dashed-border panel with guidance copy and an 'Add your first product' button.
- **Why needed:** Onboards a new artist who has never added merch, giving a single clear next action instead of a blank screen.
- **How it works:** products.length === 0 branch renders the panel; the CTA reuses GoodsNewButton with label='Add your first product', which opens the same quick-create modal.
- **Source:** `apps/web/src/app/(artist)/goods/page.tsx:75-84`, `apps/web/src/app/(artist)/goods/goods-new-button.tsx:12-31`

### Add product button (quick-create entry)
- **What it does:** Opens the inline quick-create modal to add a new product without leaving the page.
- **Why needed:** Lets the artist add merch fast inline, matching the flash '+ New design' pattern they already know.
- **How it works:** Client button toggles local `open` state; when open it mounts GoodsQuickCreateModal. Default label 'Add product'; the empty-state passes 'Add your first product'. Appears in the header only when products exist, and always in the empty state.
- **Source:** `apps/web/src/app/(artist)/goods/goods-new-button.tsx:12-31`, `apps/web/src/app/(artist)/goods/page.tsx:72`

### Quick-create product modal
- **What it does:** Modal dialog containing the full product form to create a new product; closes on success, Escape, backdrop click, Cancel, or the X.
- **Why needed:** Gives the artist a focused, dismissible surface to enter all product details (images, price, variants, visibility) in one place.
- **How it works:** useActionState bound to createProductAction. On {success:true} it calls onClose (auto-dismiss). Escape key listener and backdrop onClick also close. Conditionally mounted so each open starts fresh and discards state on close. Submit button shows a spinner and is disabled while pending; Cancel disabled while pending.
- **Source:** `apps/web/src/app/(artist)/goods/goods-quick-create-modal.tsx:14-102`, `apps/web/src/app/(artist)/goods/goods-quick-create-modal.tsx:19-34`, `apps/web/src/app/(artist)/goods/goods-quick-create-modal.tsx:86-97`

### Create product (server action)
- **What it does:** Validates and inserts a new product row, processes its images, and reconciles its variants.
- **Why needed:** Persists the artist's new merch item so it can appear on the public page and at checkout.
- **How it works:** createProductAction: re-auth via supabase.auth.getUser (rejects if no user); parseProductFields + parseVariants; computes new sort_order = current product count for the artist; inserts into products (artist_id, title, description, category, price_amount, currency, status, pickup_note, is_public_visible, is_checkout_addon, quantity, sort_order); then processProductImages with maxImages derived from variant count and writes image_urls/image_url; then reconcileVariants. revalidatePath('/goods') and revalidates the artist's public page by slug. Returns {success:true} or {error}.
- **Source:** `apps/web/src/app/(artist)/goods/actions.ts:443-510`

### Edit product modal (from grid tile)
- **What it does:** Opens an inline modal that lazily loads a product's full details + active variants for editing, with a delete control inside.
- **Why needed:** Lets the artist tweak any product (price, images, variants, visibility, pickup note) directly from the catalog without page navigation.
- **How it works:** GoodsEditModal mounts when a tile's Edit is clicked. On mount it calls loadProductForEditAction(productId); shows a spinner until loaded, or a destructive error message on failure. Renders a hidden id input + ProductFormFields(initial, variants) + DeleteProductButton. useActionState bound to updateProductAction; closes on success/Escape/backdrop/Cancel/X. Save button disabled while pending or until loaded.
- **Source:** `apps/web/src/app/(artist)/goods/goods-edit-modal.tsx:22-143`, `apps/web/src/app/(artist)/goods/goods-edit-modal.tsx:36-46`, `apps/web/src/app/(artist)/goods/goods-edit-modal.tsx:94-116`

### Load product for edit (server action)
- **What it does:** Fetches a single owned product plus its active variants, mapped into the form's value shape.
- **Why needed:** The grid tile only has thumbnail data; editing needs the full record (description, pickup note, add-on flag, all images, variant rows).
- **How it works:** loadProductForEditAction(id): auth check; selects the product by id AND artist_id (ownership); returns 'Product not found.' if absent. Selects active product_variants (id,name,price_amount_override,stock_quantity) ordered by sort_order. Coerces price via toPriceNumber, category/status via validators, builds imageUrls from image_urls or legacy image_url. Hidden (soft-archived) variants are excluded.
- **Source:** `apps/web/src/app/(artist)/goods/actions.ts:657-756`, `apps/web/src/app/(artist)/goods/actions.ts:699-704`

### Update product (server action)
- **What it does:** Validates and updates an existing owned product, diffs/processes images, and reconciles variants.
- **Why needed:** Saves edits the artist makes to an existing merch item.
- **How it works:** updateProductAction: auth; requires non-empty id ('Missing product id.'); verifies ownership via select id where id+artist_id ('Product not found.'); parseProductFields + parseVariants; fetches prev image_urls/image_url to diff; processProductImages (uploads new, keeps kept, deletes dropped from storage); updates products row (all fields + image_urls/image_url + updated_at) scoped by id+artist_id; reconcileVariants(id). Revalidates /goods, /goods/[id], and the public page.
- **Source:** `apps/web/src/app/(artist)/goods/actions.ts:512-593`, `apps/web/src/app/(artist)/goods/actions.ts:522-532`, `apps/web/src/app/(artist)/goods/actions.ts:543-585`

### Legacy edit page /goods/[id]
- **What it does:** Server-rendered standalone edit page for a single product, with a back link to Goods, the same ProductForm, and a delete control.
- **Why needed:** Preserves deep links to a specific product's editor; the primary edit path is now the modal but old links must still work.
- **How it works:** EditProductPage awaits params.id, selects the product by id+artist_id (notFound() if missing) and active variants by sort_order, maps to ProductFormValues, renders ProductForm (bound to updateProductAction) and DeleteProductButton. Shows a 'Goods' back link with an ArrowLeft icon.
- **Source:** `apps/web/src/app/(artist)/goods/[id]/page.tsx:38-131`, `apps/web/src/app/(artist)/goods/[id]/page.tsx:49-57`, `apps/web/src/app/(artist)/goods/product-form.tsx:16-49`

### /goods/new redirect
- **What it does:** Immediately redirects /goods/new to /goods.
- **Why needed:** Old 'add product' links shouldn't 404 now that creation moved into the modal.
- **How it works:** NewProductPage calls redirect('/goods'). No UI.
- **Source:** `apps/web/src/app/(artist)/goods/new/page.tsx:5-7`

### Multi-image picker (grid + add tile)
- **What it does:** Lets the artist add, preview, and remove multiple product images in a thumbnail grid with a count indicator and an 'Add image' dashed tile.
- **Why needed:** Merch sells on visuals; multiple angles/variants per product help clients decide, and one image per option keeps a variant gallery clear.
- **How it works:** ProductFormFields holds imageEntries (existing URLs + new Files). A hidden trigger file input (multiple, accept png/jpeg/webp) feeds addImageFiles, which runs prepareImageUpload (HEIC/type rejection + browser compression) on each pick, creates object-URL previews, and caps additions to remaining slots. Each entry has an X remove button (revokes blob URLs). Counter shows `entries / maxImages`. Existing kept URLs post via hidden existing_image_urls JSON; each new File renders its own hidden NewFileInput named 'images'.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:108-191`, `apps/web/src/app/(artist)/goods/product-form-fields.tsx:260-329`, `apps/web/src/app/(artist)/goods/product-form-fields.tsx:193-208`

### Per-image hidden inputs (NewFileInput)
- **What it does:** Ensures every picked file is posted to the server even when picked one-at-a-time across multiple selections.
- **Why needed:** A shared multi-file input would strand earlier picks; the artist expects every image they added to upload.
- **How it works:** Each new File gets a dedicated hidden <input name='images' type='file'> that receives its File once via DataTransfer on mount and is then untouched, so the browser serializes one entry per input in form order.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:67-85`, `apps/web/src/app/(artist)/goods/product-form-fields.tsx:312-317`

### Image cap (variant-aware)
- **What it does:** Limits the number of images per product: 3 for a variant-less product, otherwise variantCount + 1.
- **Why needed:** Keeps galleries sensible (one image per size/option plus a shared hero) and bounds storage/cost.
- **How it works:** Client maxImages computed live from rows with a non-empty name; helper text updates accordingly. Server enforces maxProductImages(variantCount) in processProductImages, returning 'You can have at most N image(s) for this product.' if keep+new exceeds it.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:138-144`, `apps/web/src/app/(artist)/goods/actions.ts:258-260`, `apps/web/src/app/(artist)/goods/actions.ts:302-306`

### Browser-side image validation + compression
- **What it does:** Rejects HEIC/unsupported files with friendly copy and shrinks large images before upload.
- **Why needed:** Prevents iPhone HEIC photos and oversized files from black-screening the form, and keeps uploads under the platform body cap.
- **How it works:** prepareImageUpload: detects HEIC/HEIF by type or extension and returns guidance; rejects non png/jpeg/webp; compressImageInBrowser canvas-resizes to max 1600px webp@0.82 (skips files <500KB, keeps original if larger); rejects results > 4MB with the measured size. Errors surface via imageError text in the picker.
- **Source:** `apps/web/src/lib/image-compress.ts:81-116`, `apps/web/src/lib/image-compress.ts:19-57`, `apps/web/src/app/(artist)/goods/product-form-fields.tsx:171-189`

### Server image processing + storage write
- **What it does:** Re-validates each uploaded image server-side, resizes to a canonical 800x800 WebP, stores it, and composes the final ordered image list; deletes dropped images.
- **Why needed:** Guarantees a consistent thumbnail size/format regardless of client and cleans up storage when the artist removes images.
- **How it works:** uploadProductImage checks type in [png,jpeg,webp] and size <=5MB, runs sharp resize(800,800 cover)+webp(82), uploads to 'logos' bucket at `${userId}/goods/${productId}/${uuid}.webp` via service client (no upsert), returns public URL. processProductImages keeps only previously-present URLs, uploads new files (rolling back on failure), and removes dropped URLs from storage. Final array written as image_urls with image_url=first.
- **Source:** `apps/web/src/app/(artist)/goods/actions.ts:181-215`, `apps/web/src/app/(artist)/goods/actions.ts:270-345`

### Title field
- **What it does:** Required text field for the product name.
- **Why needed:** Every merch item needs a name clients recognize (e.g. 'Spiderweb print A4').
- **How it works:** Input name='title', required, maxLength 80 (MAX_PRODUCT_TITLE), placeholder example. Server trims and rejects empty ('Title is required.') or > 80 chars ('Title must be 80 characters or fewer.').
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:333-346`, `apps/web/src/app/(artist)/goods/actions.ts:66-70`

### Quantity field (variant-less stock)
- **What it does:** Optional total stock for a product without options; hidden once the product has variants.
- **Why needed:** Lets the artist cap how many of a single-SKU item (e.g. an original) they can sell; blank means unlimited.
- **How it works:** Input name='quantity' type=number min=0 inputMode numeric, placeholder '∞'; only rendered when !hasOptions. Server parseQuantity: blank => null (unlimited), else parseInt; rejects negatives/non-finite ('Quantity must be 0 or more.').
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:347-363`, `apps/web/src/app/(artist)/goods/actions.ts:52-61`

### Price field
- **What it does:** Required numeric price for the product.
- **Why needed:** Sets the amount a client pays for the item on the public shop / at checkout.
- **How it works:** Input name='price' type=number min=0 step=0.01 inputMode decimal, required. Server parsePriceInput: blank => 'Enter a price.', negative/non-finite => 'Price must be a positive number.', > 100000 => 'Price cannot exceed 100,000.'; rounds to 2 decimals.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:367-384`, `apps/web/src/lib/goods.ts:93-104`

### Currency selector
- **What it does:** Dropdown to choose the product's currency from 17 ISO codes (EUR default).
- **Why needed:** A traveling artist can price merch in the local currency of a guest spot.
- **How it works:** Select name='currency' defaultValue DEFAULT_CURRENCY('eur'), options from CURRENCIES (eur,usd,gbp,thb,aud,cad,chf,jpy,sek,nok,dkk,pln,czk,sgd,nzd,mxn,brl) shown uppercased. Server validates via isCurrency, lowercases, defaults to EUR if invalid. Note: only deposit-currency goods combine as checkout add-ons.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:385-401`, `apps/web/src/lib/goods.ts:42-69`, `apps/web/src/app/(artist)/goods/actions.ts:75-78`

### Description field
- **What it does:** Optional multi-line text describing the product.
- **Why needed:** Lets the artist note size, material, or anything the client should know before buying.
- **How it works:** Textarea name='description' rows=3 maxLength 500 (MAX_PRODUCT_DESCRIPTION), resize-none. Server trims, slices to 500, empty => null.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:405-418`, `apps/web/src/app/(artist)/goods/actions.ts:90-93`

### Variants toggle ('This product has options')
- **What it does:** Checkbox that enables per-option variant rows (sizes, etc.) and hides the single-product quantity field.
- **Why needed:** Many merch items (shirts, prints) come in sizes/variations each needing its own price/stock.
- **How it works:** Checkbox bound to hasOptions; toggling on seeds one empty row if none exist. When on, the variant editor renders and the top-level Qty field disappears (per-variant stock takes over).
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:421-429`, `apps/web/src/app/(artist)/goods/product-form-fields.tsx:210-223`

### Variant rows (name / price / stock + add/remove)
- **What it does:** Editable list of variant rows, each with a name, optional price override, optional stock, and a remove button, plus an 'Add option' button.
- **Why needed:** Captures each size/option's own pricing and inventory (e.g. S/M/L shirts at different prices).
- **How it works:** rows state with freshKey + nullable persisted id. Name input slices to 40 (MAX_VARIANT_NAME); Price number min0 step0.01 placeholder '—'; Stock number min0 placeholder '∞'. Trash2 button removes the row; 'Add option' appends an empty row. Helper text: 'Leave price empty to use the product price. Leave stock empty for unlimited.' Serialized to a hidden 'variants' JSON input (id,name,priceOverride,stock).
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:431-501`, `apps/web/src/app/(artist)/goods/product-form-fields.tsx:225-252`

### Variant parsing + validation (server)
- **What it does:** Parses the variants JSON, caps to 20, skips nameless rows, and validates each price override and stock.
- **Why needed:** Keeps variant data clean and bounded before it hits the database.
- **How it works:** parseVariants: JSON.parse (error 'Could not read the variants. Try again.'); slices to MAX_VARIANTS=20; trims/slices name to 40 and skips empty names; treats blank/invalid id as new; parseOptionalPriceInput for override (error 'Variant "X": ...'); parseInt stock rejecting negatives ('Variant "X": stock must be 0 or more.'). Returns VariantInput[] {id,name,priceOverride,stock}.
- **Source:** `apps/web/src/app/(artist)/goods/actions.ts:127-179`

### Non-destructive variant reconcile
- **What it does:** On save, updates existing variants in place, inserts new ones, and either hard-deletes or soft-hides removed variants depending on FK references.
- **Why needed:** Prevents an edit from nulling historical booking/order pointers, so past sales and interest records stay intact even as the artist tweaks options.
- **How it works:** reconcileVariants(productId, variants): loads existing variants; for each posted row with a known id, UPDATE name/price_override/stock/sort_order and resurrect status='active' (scoped by id+product_id); rows without id INSERT. For removed rows, counts references in booking_interests.variant_id and order_items.variant_id; if any exist, UPDATE status='hidden' (soft-archive keeps the FK); else DELETE. All scoped by product_id so foreign ids no-op.
- **Source:** `apps/web/src/app/(artist)/goods/actions.ts:363-431`, `apps/web/src/app/(artist)/goods/actions.ts:401-430`

### Visibility radio (Publish vs Save as draft)
- **What it does:** Required two-option choice to publish the item to the public page or keep it as a draft.
- **Why needed:** Prevents accidental publishing or silent hiding; the artist explicitly decides whether clients see the item.
- **How it works:** Two radios name='is_public_visible' value 'on'/'off', both required, styled with checked highlight. defaultChecked reflects initial.isPublicVisible. Server requires the value to be exactly 'on' or 'off' (else 'Choose whether to publish this item or save it as a draft.') and stores is_public_visible accordingly.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:506-536`, `apps/web/src/app/(artist)/goods/actions.ts:104-109`

### More settings (collapsible)
- **What it does:** Expandable section holding category, status, pickup note, and the checkout add-on toggle.
- **Why needed:** Keeps advanced/less-frequent options out of the way while still accessible on every create/edit.
- **How it works:** Button toggles moreOpen (aria-expanded, rotating ChevronDown). The add-on hidden input is always rendered (state-backed) so its value posts even if the section was never opened.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:546-623`, `apps/web/src/app/(artist)/goods/product-form-fields.tsx:538-544`

### Category selector
- **What it does:** Dropdown to classify the product among 8 categories.
- **Why needed:** Helps organize and label merch (print, shirt, sticker, zine, flash sheet, original, patch, other) for the artist and the public shop.
- **How it works:** Select name='category' (default 'print' in form, though loaded value seeds it) with options from PRODUCT_CATEGORIES using PRODUCT_CATEGORY_LABELS. Server validates via isProductCategory, defaulting to 'other' if invalid.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:562-578`, `apps/web/src/lib/goods.ts:5-26`, `apps/web/src/app/(artist)/goods/actions.ts:80-83`

### Status selector (active / hidden / sold out)
- **What it does:** Dropdown to set the product's lifecycle status from the form.
- **Why needed:** Lets the artist take an item off-shop (hidden) or flag it sold out while keeping the record.
- **How it works:** Select name='status' default 'active', options from PRODUCT_STATUSES with PRODUCT_STATUS_LABELS. Server validates via isProductStatus, default 'active'. Note: this is independent of the quick sold-out toggle on the tile.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:579-595`, `apps/web/src/lib/goods.ts:28-35`, `apps/web/src/app/(artist)/goods/actions.ts:85-88`

### Pickup note field
- **What it does:** Optional short note about how/where the client collects the item.
- **Why needed:** Tattoo goods are typically handed over at the appointment; the artist can tell the client e.g. 'Collect at your appointment.'
- **How it works:** Input name='pickup_note' maxLength 200 (MAX_PICKUP_NOTE) under More settings. Server trims, slices to 200, empty => null.
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:598-610`, `apps/web/src/app/(artist)/goods/actions.ts:94-97`

### Checkout add-on toggle
- **What it does:** Checkbox to offer the product as an add-on when a client pays their deposit.
- **Why needed:** Increases merch sales by surfacing items at the high-intent moment of deposit checkout.
- **How it works:** Checkbox bound to isCheckoutAddon (default true). Value posts via an always-rendered hidden input name='is_checkout_addon' ('on'/'off'). Server stores is_checkout_addon = (value === 'on'). Add-on eligibility additionally requires active EUR product (see addon-products).
- **Source:** `apps/web/src/app/(artist)/goods/product-form-fields.tsx:612-621`, `apps/web/src/app/(artist)/goods/actions.ts:122`, `apps/web/src/lib/goods.ts:150-154`

### Product tile hero image + placeholder
- **What it does:** Shows the product's first image as a cover thumbnail, or a placeholder icon when none.
- **Why needed:** Visual recognition of each merch item at a glance in the catalog grid.
- **How it works:** GoodsTile renders an <img> of item.imageUrl (lazy) or a centered ImageIcon placeholder. Sold-out/hidden tiles get opacity-70 grayscale.
- **Source:** `apps/web/src/app/(artist)/goods/goods-tile.tsx:70-85`, `apps/web/src/app/(artist)/goods/goods-tile.tsx:66-68`

### Tile status badge
- **What it does:** Shows a small uppercase badge (e.g. SOLD OUT / HIDDEN) on the tile for any non-active product.
- **Why needed:** The artist instantly sees which items aren't live without opening them.
- **How it works:** When status !== 'active', renders PRODUCT_STATUS_LABELS[status] in a top-right pill. Local status state updates optimistically on toggle.
- **Source:** `apps/web/src/app/(artist)/goods/goods-tile.tsx:87-92`

### Tile multi-image badge (+N)
- **What it does:** Shows a '+N' badge when a product has more than one image.
- **Why needed:** Tells the artist at a glance which items have a gallery vs a single photo.
- **How it works:** When item.imageCount > 1, renders a bottom-left pill '+{imageCount-1}'. imageCount derived from image_urls length on the server.
- **Source:** `apps/web/src/app/(artist)/goods/goods-tile.tsx:94-100`, `apps/web/src/app/(artist)/goods/page.tsx:38-52`

### Tile title strip with price + draft marker
- **What it does:** Overlays the product title, formatted price, and a ' · draft' suffix for unpublished items along the bottom of the tile.
- **Why needed:** Confirms name/price at a glance and flags items not yet visible to clients.
- **How it works:** Gradient strip shows item.title (truncated), formatPrice(price,currency) ('CUR 00.00'), and ' · draft' when !isPublicVisible. Strip hides on hover/reveal to expose actions.
- **Source:** `apps/web/src/app/(artist)/goods/goods-tile.tsx:139-152`, `apps/web/src/lib/goods.ts:115-117`

### Tile reveal interaction (hover/tap)
- **What it does:** Reveals the action overlay (sold-out toggle + Edit) on desktop hover or touch tap, and keyboard activation.
- **Why needed:** Keeps the grid clean while making quick actions one interaction away on any device.
- **How it works:** Tile is role=button tabIndex 0; click/Enter/Space toggle a `revealed` state; mouseleave resets it; group-hover also reveals on desktop. focus-visible ring for accessibility.
- **Source:** `apps/web/src/app/(artist)/goods/goods-tile.tsx:55-69`, `apps/web/src/app/(artist)/goods/goods-tile.tsx:102-137`

### Quick sold-out / available toggle (tile)
- **What it does:** One-tap button on the tile to mark a product sold out or back to available without opening the editor.
- **Why needed:** Inventory changes fast at conventions; the artist can flip availability instantly from the grid.
- **How it works:** toggleSoldOut sets next status (sold_out<->active) optimistically, then calls setProductStatusAction(id,next) in a transition; reverts local status on error. Button label/icon swaps between Check 'Sold out' and RotateCcw 'Available'; disabled while pending.
- **Source:** `apps/web/src/app/(artist)/goods/goods-tile.tsx:41-51`, `apps/web/src/app/(artist)/goods/goods-tile.tsx:110-126`

### Set product status (server action)
- **What it does:** Updates a single product's status (active/hidden/sold_out) with ownership and value validation.
- **Why needed:** Backs the quick tile toggle and any status flip without a full product save.
- **How it works:** setProductStatusAction(id,status): auth; isProductStatus guard ('Invalid status.'); UPDATE products set status + updated_at where id+artist_id; revalidatePath('/goods') and the public page. Returns {success} or {error}.
- **Source:** `apps/web/src/app/(artist)/goods/actions.ts:760-781`

### Edit button (tile)
- **What it does:** Opens the inline edit modal for the product.
- **Why needed:** Direct path to change any product detail from the catalog.
- **How it works:** Mustard 'Edit' button in the tile action stack sets editOpen=true, mounting GoodsEditModal with the product id.
- **Source:** `apps/web/src/app/(artist)/goods/goods-tile.tsx:127-136`, `apps/web/src/app/(artist)/goods/goods-tile.tsx:155-160`

### Delete product (confirm + action)
- **What it does:** Two-step delete control (inline confirm) that permanently removes a product and its images.
- **Why needed:** Lets the artist retire merch they no longer offer, with a guard against accidental deletion.
- **How it works:** DeleteProductButton shows 'Delete product'; click reveals a confirm panel ('Delete this product? This cannot be undone.') with 'Yes, delete' / Cancel. Confirm calls deleteProductAction(id) in a transition, shows errors, and on success router.push('/goods'). Server deleteProductAction: auth; snapshots image URLs; DELETE products where id+artist_id (variants cascade via FK); removes all owned storage paths (per-image + legacy single) re-validated via ownedGoodsStoragePath; revalidates /goods + public page.
- **Source:** `apps/web/src/app/(artist)/goods/delete-product-button.tsx:7-60`, `apps/web/src/app/(artist)/goods/actions.ts:595-652`

### Goods sub-navigation (Products / Sales tabs)
- **What it does:** Provides the two child nav links under Goods: Products (/goods) and Sales (/goods/sales).
- **Why needed:** Lets the artist switch between managing the catalog and reviewing what's been sold.
- **How it works:** nav-config defines the Goods group with children Products->/goods and Sales->/goods/sales; match ['/goods'] keeps the parent highlighted. Goods is also a mobile bottom-nav tab.
- **Source:** `apps/web/src/components/app-shell/nav-config.ts:69-78`, `apps/web/src/components/app-shell/nav-config.ts:129`

### Sales ledger (paid goods line items)
- **What it does:** Read-only table of every product line item a client has paid for, newest first.
- **Why needed:** Gives the artist a simple bookkeeping record of merch sales separate from deposits.
- **How it works:** GoodsSalesPage selects orders (id,created_at,status,fulfillment_status,booking_id, order_items(type,title_snapshot,variant_snapshot,quantity,total_amount)) where artist_id=user.id and status in paid/refunded/partially_refunded, ordered created_at desc. Flattens order_items filtered to type='product' into rows; resolves client names from booking_requests in one extra query. Renders a table: Date, Client, Item, Qty, Amount, Pickup.
- **Source:** `apps/web/src/app/(artist)/goods/sales/page.tsx:31-98`, `apps/web/src/app/(artist)/goods/sales/page.tsx:146-185`

### Sales summary cards (items sold + revenue)
- **What it does:** Two summary stats above the table: total items sold and total goods revenue (excluding refunded lines).
- **Why needed:** Quick totals for bookkeeping without summing the table by hand.
- **How it works:** totalRevenue sums amount of non-refunded rows; totalItems sums qty of non-refunded rows. Refunded determined by order.status !== 'paid'. Revenue formatted via formatPrice (EUR display default).
- **Source:** `apps/web/src/app/(artist)/goods/sales/page.tsx:100-144`

### Sales row: client name resolution
- **What it does:** Displays the buying client as their @handle or email per sale row.
- **Why needed:** Identifies who bought what for fulfillment and records.
- **How it works:** Collects distinct booking_ids, queries booking_requests(id,customer_handle,customer_email), maps each booking to '@handle' or email (or '—'). Row.client falls back to '—' when unresolved.
- **Source:** `apps/web/src/app/(artist)/goods/sales/page.tsx:48-68`, `apps/web/src/app/(artist)/goods/sales/page.tsx:83`

### Sales row: item + variant snapshot
- **What it does:** Shows the product title and variant as captured at purchase time, joined with ' · '.
- **Why needed:** Sales records must reflect what was actually bought even if the product/variant was later renamed or deleted.
- **How it works:** Uses order_items.title_snapshot and variant_snapshot (point-in-time copies) rather than live product data. Variant appended only when present.
- **Source:** `apps/web/src/app/(artist)/goods/sales/page.tsx:91`

### Sales row: pickup / fulfillment status
- **What it does:** Shows each line's pickup state: Refunded, Picked up, Cancelled, or Awaiting pickup.
- **Why needed:** Tells the artist which sold goods still need to be handed to the client.
- **How it works:** Refunded rows (order.status !== 'paid') show 'Refunded'; otherwise maps fulfillment_status: 'picked_up'->'Picked up', 'cancelled'->'Cancelled', else 'Awaiting pickup'. The fulfillment value is set elsewhere via markGoodsPickedUp on the booking detail page (Mark goods as picked up button).
- **Source:** `apps/web/src/app/(artist)/goods/sales/page.tsx:172-180`, `apps/web/src/app/(artist)/bookings/requests/[id]/goods-pickup-button.tsx:6-29`

### Sales: refunded line dimming
- **What it does:** Visually dims refunded / partially-refunded sale rows and excludes them from totals.
- **Why needed:** Distinguishes money actually earned from reversed sales for accurate bookkeeping.
- **How it works:** Row gets opacity-60 when refunded; refunded rows contribute 0 to totalRevenue/totalItems. Orders with status 'refunded'/'partially_refunded' are still listed (included in the query) but marked refunded.
- **Source:** `apps/web/src/app/(artist)/goods/sales/page.tsx:159-160`, `apps/web/src/app/(artist)/goods/sales/page.tsx:100-104`

### Sales empty state
- **What it does:** Shows guidance when no goods have been sold yet.
- **Why needed:** Explains why the ledger is empty and when sales will appear.
- **How it works:** rows.length === 0 renders a dashed panel: 'No goods sold yet. Sales show up here once a client pays for goods with their deposit.'
- **Source:** `apps/web/src/app/(artist)/goods/sales/page.tsx:118-124`

### Public page revalidation on writes
- **What it does:** Refreshes the artist's public Bio Page after any product create/update/delete/status change.
- **Why needed:** Ensures the public shop reflects catalog changes immediately (new item, hidden item, sold-out flag).
- **How it works:** revalidatePublicPage looks up profiles.slug for the user and revalidatePath(`/${slug}`). Called from create/update/delete/setStatus actions in addition to revalidatePath('/goods').
- **Source:** `apps/web/src/app/(artist)/goods/actions.ts:433-441`

**Notes:** Architecture notes and subtle behaviors: (1) Two status systems coexist - the per-tile quick toggle only swaps active<->sold_out, while the More-settings Status dropdown can also set 'hidden'. They write the same products.status column. (2) Visibility (is_public_visible draft/publish) is orthogonal to status; a product can be 'active' but still a draft (shown as ' · draft' on the tile). (3) Variant edits are deliberately non-destructive: removed variants that are referenced by booking_interests/order_items are soft-hidden (status='hidden') not deleted, and hidden variants are excluded from the edit list, so re-adding a same-named variant creates a new id. Resurrection: editing an existing-id row back into the active list flips its status to 'active'. (4) Image security is heavily defended: ownedGoodsStoragePath validates every storage path is under `${userId}/goods/${productId}/` (or the legacy single-image path) before any storage.remove, and processProductImages only honors keep-list URLs already present in the product's current image_urls, blocking cross-artist URL grafting/deletion. Server uses the service-role client for storage (bypasses RLS) but always re-scopes by userId/productId. (5) Multi-image is migration 0038; legacy rows fall back to single image_url throughout (image_urls ?? [image_url]). image_url is kept synced to image_urls[0]. (6) Image cap is variant-aware: 3 images variant-less, but exactly variantCount+1 once variants exist - so a single-variant product is capped at 2 images, which the helper text explains. (7) Create computes sort_order as the current product count (append to end); there is no UI on this surface to reorder products (sort is read-only here). (8) The Sales page is intentionally read-only bookkeeping - no actions, sorts, or filters; the only mutable thing it reflects (fulfillment 'picked_up') is set from the booking detail page's 'Mark goods as picked up' button, not here. Deposits are excluded; only order_items.type==='product' rows appear. (9) Client image compression (max 1600px webp@0.82, <500KB skipped) is separate from the server's canonical 800x800 webp@82 resize; both enforce png/jpeg/webp and reject HEIC. Server image size cap is 5MB; client upload cap is 4MB (Vercel body limit). (10) /goods/new is a legacy redirect to /goods; /goods/[id] is a legacy standalone editor that still works alongside the modal. (11) A parallel mobile API exists at /api/mobile/goods (route.ts, [id]/route.ts, [id]/image/route.ts) reusing lib/goods + lib/mobile-goods validators, but that is outside this web surface. (12) formatPrice renders 'CUR 00.00' (uppercased code + space + 2dp) rather than locale currency symbols; the Sales totals call formatPrice without a currency arg so they always display as EUR regardless of the underlying line currency - a potential mismatch for multi-currency sellers.


---

## 10. Guest spots / travel

The Guest Spots surface (route /travel, labeled "Guest Spots" in nav, redirected from the legacy /settings/travel route) is where a tattoo artist plans their travel and guest-spot schedule and manages the studio library that backs it. It has two main blocks on one page: a Trip manager (create/edit/delete trips, add/remove dated "stops" / legs, toggle each trip's visibility on the public booking form) and a Studio library (create/edit/delete studios with Google Places autofill, per-studio public visibility mode, public note, and a single primary/home studio flag). Trips and legs are tagged with optional studios, and per-leg studio visibility drives exactly what a client sees: the public artist page shows an "Upcoming trips" popover, an active-trip banner with dates and a maps-linked studio name, and the booking form reactively surfaces the location for the chosen date (collapsing overlapping guest spots into a "I'll confirm where" notice). The page also shows a waitlist-demand nudge when there is city-level waitlist demand, a "Preview public page" link, and a feature-intro modal for first-time users. Server actions enforce auth and artist ownership on every studio/trip/leg mutation, validate dates (YYYY-MM-DD, start <= end) and studio ownership, dedup studios by Google Place ID, and keep at most one primary studio. The same data feeds confirmation/reminder emails (which studio the client should go to) and the mobile travel API.

### Page header, intro copy and Guest Spots nav entry
- **What it does:** Renders the 'Guest Spots' heading with helper copy ('Plan guest spots and travel dates. Toggle visibility to control which trips appear on your public booking form.') and is reached via the 'Guest Spots' nav item (MapPin icon) at /travel.
- **Why needed:** Gives the artist a single, clearly labeled home for everything related to traveling, guest spots, and where they work, separate from their home-studio booking flow.
- **How it works:** Server component TravelPage loads the current user, their profile slug, trips (with legs+studios), studios, and waitlist count in one Promise.all. Nav entry defined twice (desktop submenu under a parent, and a top-level entry).
- **Source:** `apps/web/src/app/(artist)/travel/page.tsx:92-115`, `apps/web/src/components/app-shell/nav-config.ts:79`, `apps/web/src/components/app-shell/nav-config.ts:128`

### Legacy /settings/travel redirect
- **What it does:** Old route /settings/travel immediately redirects to /travel.
- **Why needed:** Preserves old bookmarks/links from before the surface was re-slotted, so the artist never lands on a dead settings page.
- **How it works:** OldTravelRoute server component calls next/navigation redirect('/travel').
- **Source:** `apps/web/src/app/(artist)/settings/travel/page.tsx:1-5`

### Preview public page link
- **What it does:** Shows a 'Preview public page ->' link that opens the artist's live public booking page in a new tab.
- **Why needed:** Lets the artist immediately verify how their trips, studio locations, and visibility settings actually appear to clients before relying on them.
- **How it works:** Only rendered when profile.slug exists; href built by publicArtistUrl(profile.slug), target=_blank rel=noopener.
- **Source:** `apps/web/src/app/(artist)/travel/page.tsx:103-112`

### Feature intro modal (travel)
- **What it does:** First-run educational modal titled 'Planning a guest spot? Add it here.' with bullets and an 'Add your first trip' CTA to /travel.
- **Why needed:** Onboards artists who have never used guest spots, explaining that adding a trip auto-publishes city/dates/studio to their booking page.
- **How it works:** FeatureIntroModal featureKey='travel' isEmpty={trips.length===0}; copy/CTA defined in feature-intro-modal config under key 'travel'.
- **Source:** `apps/web/src/app/(artist)/travel/page.tsx:114`, `apps/web/src/components/feature-intro-modal.tsx:82-93`

### Waitlist demand nudge (plan your next trip)
- **What it does:** Conditional banner linking to /bookings/overview?view=waitlist with copy 'See waitlist demand by city to plan your next trip ->'.
- **Why needed:** Connects city-level client demand (people who joined the waitlist with a city) to trip planning, so the artist travels where there is proven interest.
- **How it works:** Rendered only when waitlistCount > 0; count comes from waitlist_entries where artist_id = user, status='waiting', city_text not null (head:true exact count).
- **Source:** `apps/web/src/app/(artist)/travel/page.tsx:36-42`, `apps/web/src/app/(artist)/travel/page.tsx:117-125`

### Trip list with status badges and empty state
- **What it does:** Lists every trip as a clickable summary card showing title, an Active/Upcoming status chip, a date range ('<first date> + N more' or 'No dates'), and an 'On form'/'Hidden' visibility chip. Shows an empty-state line when there are no trips.
- **Why needed:** Gives the artist an at-a-glance overview of all their planned travel and which trips are currently live to clients.
- **How it works:** TripManager maps trips to TripSummaryCard. isActive = any leg spanning localDateKey() today; isUpcoming = any future leg; dateRange formatted from sorted legs. Trips arrive pre-sorted by created_at desc; legs sorted ascending by startsOn server-side. Empty state: 'No trips yet — click the card above to create your first one.'
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:961-1011`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:1049-1061`, `apps/web/src/app/(artist)/travel/page.tsx:44-66`

### New trip (create) action
- **What it does:** 'New trip ->' dashed card opens a modal to create a trip with Title, optional Description, a list of stops, and a 'Show on booking form' toggle, then persists it.
- **Why needed:** Core action: lets the artist publish a guest spot / travel block so clients can request location-specific bookings during those dates.
- **How it works:** CreateTripModal submits to createTripAction (useActionState). Server: requires auth; title required (trimmed); description trimmed or null; show_on_booking_form defaults true (only 'false' string disables); legs parsed from legs_json via validateTripLegsPayload; studio ownership validated via validateOwnedStudios; inserts trips row, then bulk-inserts trip_legs (rolls back the trip via delete if leg insert fails); revalidatePath('/travel'). Modal closes on success.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:355-629`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:1041-1047`, `apps/web/src/app/(artist)/travel/actions.ts:232-298`

### Trip Title field (required) and Description field (optional)
- **What it does:** Text input for trip Title (required, e.g. 'Berlin guest spot') and an optional 2-row Description textarea ('Briefly describe this trip or guest spot.').
- **Why needed:** Title names the guest spot for both artist and client; description lets the artist add context (e.g. what's offered on that trip).
- **How it works:** Title is HTML-required and re-validated server-side (trimmed, non-empty else 'Title is required.'). Description trimmed to null if blank. Same fields appear in edit mode with defaultValue.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:428-452`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:818-842`, `apps/web/src/app/(artist)/travel/actions.ts:242-246`, `apps/web/src/app/(artist)/travel/actions.ts:310-315`

### Add stop / leg (in create modal, staged client-side)
- **What it does:** '+ Add stop' reveals a From date, To date, optional Studio select, and optional Notes input; 'Add stop' adds the stop to an in-modal list; each staged stop shows its date range, studio name, and notes with a 'Remove' link.
- **Why needed:** A trip can span multiple studios/cities/date ranges; stops let the artist describe each segment of the trip precisely.
- **How it works:** confirmStop requires both From and To (button disabled otherwise) and pushes a PendingStop with a crypto.randomUUID id; stops serialized into a hidden legs_json field submitted with the trip. removeStop filters by id. Dates chosen via DateInput.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:347-353`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:391-412`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:454-573`

### Add stop / leg (in edit modal, server-persisted)
- **What it does:** Inline AddLegForm with From (required), To (required), optional Studio, optional Notes that immediately saves a new leg to an existing trip.
- **Why needed:** Lets the artist extend an already-published trip with extra date ranges/studios without recreating it.
- **How it works:** Submits to createTripLegAction: requires auth and trip_id; validateTripLeg enforces YYYY-MM-DD and start<=end; verifies the trip belongs to the artist ('Trip not found.' otherwise); validates studio ownership; inserts trip_legs row; revalidatePath('/travel'). Form collapses and clears on success.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:633-744`, `apps/web/src/app/(artist)/travel/actions.ts:367-422`

### Trip date / leg validation
- **What it does:** Validates each stop's dates: must be YYYY-MM-DD format and start date must be on or before end date.
- **Why needed:** Prevents nonsensical or malformed travel ranges that would break the public location-by-date matching and emails.
- **How it works:** validateTripLeg (shared package) uses zod + isDateKey/isDateKeyAfter; messages: 'each trip stop must include valid start and end dates', 'trip stop dates must use the YYYY-MM-DD format', 'trip stop start date must be on or before the end date'. validateTripLegsPayload also rejects non-array / unparseable JSON.
- **Source:** `apps/web/src/lib/trip-validation.ts:1-3`, `apps/web/packages/shared/src/trip-validation.ts:27-58`

### Overlapping-dates warning (OverlapNotice)
- **What it does:** When two or more stops' date ranges overlap, shows a mustard notice explaining overlaps are fine if working multiple studios at once, but clients on those days will see every matching studio and be asked to wait for confirmation.
- **Why needed:** Overlapping guest spots are allowed but ambiguous to clients; this warns the artist to manually tell each client which studio to attend.
- **How it works:** rangesOverlap compares all leg pairs (a.startsOn <= b.endsOn && b.startsOn <= a.endsOn). Rendered in both create modal (staged stops) and edit modal (saved legs). Purely advisory, never blocks save.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:318-343`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:494`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:920`

### Edit trip (open + save changes)
- **What it does:** Clicking a trip card opens an Edit trip modal to change Title, Description, visibility, manage stops, and save.
- **Why needed:** Plans change; the artist needs to rename, re-describe, re-date, or re-target a trip after creating it.
- **How it works:** EditTripModal renders for modal.type==='edit'; 'Save changes' submits the edit-trip-form to updateTripAction (auth required, title required, show_on_booking_form set from hidden input ==='true', updates trips by id+artist_id). Closes on success.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:746-869`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:933-954`, `apps/web/src/app/(artist)/travel/actions.ts:300-326`

### Show on booking form toggle (per trip)
- **What it does:** A switch on each trip controlling whether the trip (and its location-by-date behavior) appears on the public booking form. Card shows 'On form' or 'Hidden'.
- **Why needed:** Lets the artist draft trips privately and only publish them to clients when ready, or hide a trip without deleting it.
- **How it works:** In create modal the toggle sets a hidden show_on_booking_form input. In edit modal the toggle calls toggleTripVisibilityAction(trip.id, next) optimistically (state flips immediately) which updates trips.show_on_booking_form by id+artist_id and revalidates. The public page only queries trips with show_on_booking_form=true.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:575-604`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:794-800`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:844-868`, `apps/web/src/app/(artist)/travel/actions.ts:328-347`, `apps/web/src/app/[slug]/page.tsx:298-299`

### Stops list in edit modal with 'Now' indicator and remove
- **What it does:** Lists a trip's saved legs (sorted by start date) showing each date range, a green 'Now' badge if the leg spans today, the studio name, notes, and a 'Remove' action. Shows 'No stops yet.' empty line.
- **Why needed:** Lets the artist see and prune the exact date/studio segments of a trip and know which segment is currently active.
- **How it works:** legActive = leg.startsOn <= today && leg.endsOn >= today (localDateKey). 'Remove' calls handleDeleteLeg -> deleteTripLegAction(id) which verifies ownership via trip_legs join trips.artist_id ('Trip stop not found.' otherwise) and deletes. Per-row pending state shows '…'.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:776-782`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:871-924`, `apps/web/src/app/(artist)/travel/actions.ts:424-445`

### Delete trip (with confirm)
- **What it does:** 'Delete trip' link in the edit modal removes the trip and all its dates after a confirm dialog.
- **Why needed:** Cancelled trips must be removable so they stop showing on the booking page and in the upcoming-trips popover.
- **How it works:** handleDeleteTrip shows confirm('Delete this trip and all its dates? This cannot be undone.'), then deleteTripAction(trip.id) (auth + by id+artist_id; trip_legs cascade-delete via FK). Modal closes after. Shows 'Deleting…' state.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:784-792`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:933-941`, `apps/web/src/app/(artist)/travel/actions.ts:349-365`, `apps/web/src/db/schema.ts:274-288`

### Studio select with inline add (in stop forms)
- **What it does:** A studio dropdown ('None' + grouped 'Your studios' list + '+ Add studio') used when assigning a studio to a stop; choosing '+ Add studio' opens an inline QuickAddStudio panel without leaving the trip flow.
- **Why needed:** An artist often needs to add the destination studio at the moment they're planning the trip, not beforehand.
- **How it works:** StudioSelectWithAdd renders option labels as 'Name — City, Country'. Selecting the ADD_NEW sentinel shows QuickAddStudio; on save the new studio is appended to the in-memory list and auto-selected. A hidden input carries the real studio id while the add panel is open.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:247-316`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:517-528`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:697-708`

### Quick-add studio (inline, from trip flow)
- **What it does:** Inline panel to add a new studio (Google Maps search, Name required, City, Country, optional Address) saved straight to the library and selected for the current stop; defaults to hidden visibility and non-primary.
- **Why needed:** Removes friction: the artist can capture a new studio while planning the trip rather than context-switching to the studio library.
- **How it works:** QuickAddStudio requires a non-empty name (else 'Studio name is required'), builds FormData (name/city/country/address, plus Google place fields when a place is picked), forces visibility_mode='hidden' and is_primary='false', and calls createStudioAndReturnAction which dedups by google_place_id and returns the studio id/name/city/country.
- **Source:** `apps/web/src/app/(artist)/travel/trip-manager.tsx:88-245`, `apps/web/src/app/(artist)/travel/actions.ts:161-228`

### Studio library list with badges and empty state
- **What it does:** A 'Studio library' card listing each studio with name, a 'Primary' badge, a visibility badge (Public / Area only / After approval / Hidden), and a location line (formatted address, else City, Country, else address, else 'No location'). Shows empty-state copy when none saved.
- **Why needed:** Central place to manage every location the artist works from, and to see at a glance what each studio exposes to clients.
- **How it works:** StudioList maps studios (sorted by name asc server-side); visibilityBadge maps visibility_mode to a short label. Empty state (when not adding): 'No studios saved yet. Add a studio to display your location on your public booking form.'
- **Source:** `apps/web/src/app/(artist)/travel/studio-list.tsx:471-574`, `apps/web/src/app/(artist)/travel/page.tsx:29-35`, `apps/web/src/app/(artist)/travel/page.tsx:129-131`

### Add studio (full form)
- **What it does:** '+ Add' reveals the full StudioForm (Google search, Name required, City, Country, Address, visibility radio cards, Public note, Primary toggle) and creates a studio.
- **Why needed:** Lets the artist build the studio library used for both guest-spot legs and their home studio, with full control over public exposure.
- **How it works:** AddStudioForm submits to createStudioAction: auth required; parseStudioFormData (zod) validates; if is_primary, demotes any existing primary first; inserts studios row; revalidatePath('/travel'). Form collapses on success.
- **Source:** `apps/web/src/app/(artist)/travel/studio-list.tsx:444-469`, `apps/web/src/app/(artist)/travel/studio-list.tsx:508-515`, `apps/web/src/app/(artist)/travel/actions.ts:38-84`

### Edit studio
- **What it does:** 'Edit' opens a modal with the studio's data prefilled (StudioForm) to change any field and save.
- **Why needed:** Studios move, rename, or need their public exposure adjusted over time.
- **How it works:** EditStudioModal submits to updateStudioAction: auth + id required; parseStudioFormData validated; if is_primary, demotes other primaries (excluding self via neq id); updates studios by id+artist_id, sets updated_at; revalidatePath('/travel'). Closes on success.
- **Source:** `apps/web/src/app/(artist)/travel/studio-list.tsx:401-442`, `apps/web/src/app/(artist)/travel/studio-list.tsx:546-551`, `apps/web/src/app/(artist)/travel/actions.ts:86-140`

### Delete / remove studio (with confirm)
- **What it does:** 'Remove' deletes a studio from the library after confirm('Remove this studio from your library?').
- **Why needed:** Keeps the studio library clean; removes locations the artist no longer uses.
- **How it works:** handleDelete -> deleteStudioAction(id) (auth + by id+artist_id). Per-row pending shows '…'. Note: trip_legs.studio_id and booking_requests.studio_id are ON DELETE SET NULL, so deleting a studio nulls its references rather than cascading.
- **Source:** `apps/web/src/app/(artist)/travel/studio-list.tsx:486-493`, `apps/web/src/app/(artist)/travel/studio-list.tsx:552-559`, `apps/web/src/app/(artist)/travel/actions.ts:142-158`, `apps/web/src/db/schema.ts:279-281`

### Google Places autofill for studios
- **What it does:** A 'Search on Google Maps' autocomplete that, on selecting a place, auto-fills Name, City, Country, and Address, captures place_id, formatted_address, lat/lng, and a Google Maps URL, and offers an 'Open in Google Maps' link.
- **Why needed:** Saves typing and produces an accurate, mappable address + maps link that clients can use to find the studio.
- **How it works:** GooglePlacesPicker (dynamic, ssr:false) lazy-loads the Maps JS SDK using NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and uses Autocomplete with fields place_id/name/formatted_address/geometry/url/address_components; parses locality->city and country->country. Hidden inputs carry google_place_id, formatted_address, latitude, longitude, google_maps_url. The whole block only renders when the API key is set (else fields are typed manually, and on edit existing place data is preserved via hidden inputs).
- **Source:** `apps/web/src/components/google-places-picker.tsx:1-147`, `apps/web/src/app/(artist)/travel/studio-list.tsx:146-226`, `apps/web/src/app/(artist)/travel/trip-manager.tsx:160-172`

### Studio name / city / country / address fields and validation
- **What it does:** Name (required, max 100), City (max 100), Country (max 100), Address (optional, max 300) inputs, plus stored google_place_id/formatted_address/lat/lng/maps_url with bounds.
- **Why needed:** Captures both a human-readable location and precise mappable data for the public page and emails.
- **How it works:** studioSchema (zod, shared) enforces: name min 1 ('Name is required') max 100; city/country max 100 default ''; address max 300; formatted_address max 500; latitude [-90,90]; longitude [-180,180]; google_maps_url max 1000; public_note max 500. parseStudioFormData trims and coerces lat/lng via parseFloat. ZodError surfaces issues[0].message.
- **Source:** `apps/web/src/app/(artist)/travel/studio-list.tsx:228-284`, `apps/web/packages/shared/src/studio-validation.ts:19-57`, `apps/web/src/app/(artist)/travel/actions.ts:48-55`

### Studio public visibility mode (4 options)
- **What it does:** Radio cards choosing how much of a studio is public: Full address, City/area only, After approval (city public, full address shared after approval), or Hidden.
- **Why needed:** Privacy/safety control: artists often don't want their exact studio address public until they've vetted/approved a client.
- **How it works:** VISIBILITY_OPTIONS (public_exact_address, public_area_only, after_approval_only, hidden) stored in hidden visibility_mode input; validated by zod enum VISIBILITY_MODES (default 'hidden'). Drives public studio label: exact shows 'Name · City, Country', others show 'City, Country', hidden shows nothing; public page query excludes hidden studios via .neq('visibility_mode','hidden').
- **Source:** `apps/web/src/app/(artist)/travel/studio-list.tsx:114-140`, `apps/web/src/app/(artist)/travel/studio-list.tsx:286-327`, `apps/web/packages/shared/src/studio-validation.ts:3-17`, `apps/web/src/app/[slug]/page.tsx:329-338`

### Studio public note
- **What it does:** Optional 2-row textarea (max 500) for a public note like 'By appointment only · Ring the doorbell'.
- **Why needed:** Lets the artist give clients location-specific instructions (entry, parking, hours) without exposing more address detail.
- **How it works:** name='public_note', maxLength 500 client-side and zod max(500); trimmed to null when blank; stored and surfaced publicly with the studio.
- **Source:** `apps/web/src/app/(artist)/travel/studio-list.tsx:329-343`, `apps/web/packages/shared/src/studio-validation.ts:30`, `apps/web/src/app/(artist)/travel/actions.ts:74-78`

### Primary (home) studio toggle with single-primary enforcement
- **What it does:** 'Primary studio on booking form' switch marking one studio as the default/home location shown to clients; enforces that only one studio is primary.
- **Why needed:** Defines the artist's home base used as the fallback location on the booking form and in emails when a booking isn't tied to a trip.
- **How it works:** is_primary hidden input ('true'/'false'). On create/update/createStudioAndReturn, if is_primary is set the action first updates all other studios for the artist to is_primary=false (update excludes self via neq id on edit). Public page loads the single is_primary=true non-hidden studio as primaryStudio and passes its id as studioId to the booking form; resolveStudioForBooking falls back to the primary studio for non-trip bookings.
- **Source:** `apps/web/src/app/(artist)/travel/studio-list.tsx:345-375`, `apps/web/src/app/(artist)/travel/actions.ts:57-63`, `apps/web/src/app/(artist)/travel/actions.ts:108-115`, `apps/web/src/app/(artist)/travel/actions.ts:197-203`, `apps/web/src/app/[slug]/page.tsx:386-394`, `apps/web/src/lib/booking-studio.ts:156-163`

### Studio ownership validation for legs
- **What it does:** Rejects assigning a studio to a trip/leg that the artist doesn't own.
- **Why needed:** Security: prevents tampering so an artist can't tag another artist's studio onto their trip.
- **How it works:** validateOwnedStudios dedups requested studio ids and confirms count matches studios owned by artist_id; on mismatch returns 'one or more selected studios are invalid'. Called in createTripAction and createTripLegAction.
- **Source:** `apps/web/src/app/(artist)/travel/actions.ts:14-34`, `apps/web/src/app/(artist)/travel/actions.ts:259-264`, `apps/web/src/app/(artist)/travel/actions.ts:404-409`

### Studio dedup by Google Place ID
- **What it does:** When quick-adding a studio that has a Google Place ID matching an existing studio, reuses the existing studio instead of creating a duplicate.
- **Why needed:** Prevents the library filling up with duplicate entries for the same physical studio added across different trips.
- **How it works:** createStudioAndReturnAction queries studios by artist_id + google_place_id (maybeSingle); if found returns that studio; otherwise inserts and returns the new one.
- **Source:** `apps/web/src/app/(artist)/travel/actions.ts:183-195`

### Public: Upcoming trips popover (TravelCard)
- **What it does:** On the public artist page, a 'Upcoming trips' pill (Plane icon) opens a popover listing each future leg as 'dates · location' (MapPin rows), earliest first.
- **Why needed:** Advertises the artist's travel schedule to clients so they know where and when they can be booked away from home.
- **How it works:** TravelCard receives futureTrips (only legs with ends_on >= today, with public location labels). Renders nothing if no trips. Flattens legs, sorts by startsOn, shows date range and locationLabel (null label hidden). Esc/backdrop close, body scroll lock.
- **Source:** `apps/web/src/app/[slug]/travel-card.tsx:1-104`, `apps/web/src/app/[slug]/page.tsx:367-383`, `apps/web/src/app/[slug]/page.tsx:545-556`

### Public: active-trip banner
- **What it does:** On the public page header, when a trip leg spans today, shows the date range and (if set) the studio name as a Google Maps link.
- **Why needed:** Tells visiting clients 'I'm here right now' with a one-tap map link, maximizing in-person bookings during a guest spot.
- **How it works:** activeTrip/activeLeg = the visible trip leg spanning todayStr (artist timezone). activeLegData carries startsOn/endsOn/studioName/studioMapsUrl; rendered with formatDateKey; studioName links to studioMapsUrl when present.
- **Source:** `apps/web/src/app/[slug]/page.tsx:340-365`, `apps/web/src/app/[slug]/page.tsx:557-588`

### Public: location-by-date on booking form
- **What it does:** On the booking form, after a client picks a preferred date, surfaces the matching guest-spot location: a single 'Location: <studio>' (and hidden trip_id submitted) when one leg matches, or 'Possible locations: …' plus an 'I'll confirm where' note when overlapping legs match. In fixed-slot mode each slot shows its location/trip title.
- **Why needed:** Routes the booking to the correct trip/studio automatically and tells the client where they'd be tattooed, all derived from the artist's trip data.
- **How it works:** locationsForDate collects every leg spanning the chosen date across futureTrips; one match -> hidden trip_id + label; multiple -> distinctLocationLabels joined by ' · ' and a confirm message; no match -> nothing rendered. trip_id then drives studio resolution in emails (resolveBookingGuestSpotStudio / resolveStudioForBooking).
- **Source:** `apps/web/src/app/[slug]/booking-form.tsx:63-85`, `apps/web/src/app/[slug]/booking-form.tsx:279-287`, `apps/web/src/app/[slug]/booking-form.tsx:689-732`, `apps/web/src/lib/booking-studio.ts:44-114`

**Notes:** Architecture: one page (/travel) hosts both the Trip manager and the Studio library; the legacy /settings/travel route only redirects. Mutations are React 19 server actions in travel/actions.ts (not REST), each enforcing auth + artist_id ownership; the parallel mobile REST API lives at apps/web/src/app/api/mobile/travel/* and is out of scope for this web surface but shares the same tables and validation. Sorting/empty states: trips sorted by created_at desc with legs sorted ascending by startsOn (server); studios sorted by name asc; there are no client-side filters/sorts on this surface. Convenience details: Escape-to-close and backdrop-click-close on all modals; optimistic visibility toggle in the edit modal; inline quick-add studio defaults to hidden+non-primary so quickly-added studios don't accidentally leak an address; studio dedup by google_place_id; single-primary enforcement across create/update/quick-add. Copy nuance worth flagging for the founder: the page H1 and several status chips use Title Case ('Guest Spots', 'Show on booking form' fine, but 'Primary'/'Active'/'Upcoming' are single-word chips) and the overlap notice / studio remove dialog use em-dash-free copy except the in-app date ranges which render a literal '—' between dates (apps/web/src/app/(artist)/travel/trip-manager.tsx:469, :889 and travel-card.tsx:88) — these are display separators, not prose, but they are the em-dash the copy rule warns about. Two subtle behaviors: createTripAction defaults show_on_booking_form to true unless the literal string 'false' is sent, while updateTripAction treats it as true only when exactly 'true' (asymmetric defaulting). Deleting a studio sets trip_legs.studio_id and booking_requests.studio_id to NULL (ON DELETE SET NULL), so a guest-spot leg silently loses its studio rather than the trip breaking. The same trip data is the source of truth for which studio/address goes into confirmation and reminder emails via booking-studio.ts.


---

## 11. Analytics

The Analytics surface is a single read-only dashboard at /analytics that gives a solo tattoo artist a headline view of their own booking-request funnel and activity. It is a Next.js App Router page: page.tsx is a Server Component that authenticates the artist (supabase.auth.getUser()), pulls all of the artist's booking_requests rows (id, status, customer_email, deposit_amount, created_at) within a selected date range, and computes every metric server-side before handing a flat metrics/months/calendar payload to the analytics-client.tsx Client Component for rendering. The artist gets a date-range toggle (Last 30 days, Last 90 days, All time) that re-runs the server query via the URL ?range= param, a row of metric cards (total requests, conversion rate, rejection rate, unique clients with return rate, and conditionally deposit collection), a 6-month requests-per-month bar chart, and a per-day calendar heatmap of the most recent active month. There are no write actions, exports, or per-row drill-downs here. An empty state replaces the body when there are zero requests in the period, and loading.tsx renders a skeleton during the server fetch. A parallel mobile JSON endpoint (/api/mobile/analytics) mirrors the same computation for the Expo app, minus the day grid. Notably, this artist-facing surface applies NO tester/is_tester exclusion (that exclusion lives only in the separate admin analytics); the artist always sees their own raw data scoped by artist_id.

### Date-range toggle (Last 30 days / Last 90 days / All time)
- **What it does:** Three pill buttons let the artist scope every metric and chart to the last 30 days, last 90 days, or all time. The currently active range is highlighted (mustard fill); the default on first load is 90 days.
- **Why needed:** An artist wants to judge recent demand (is my book filling this season?) separately from lifetime totals, e.g. to decide whether to open/close books or change pricing.
- **How it works:** RANGES = [{30},{90},{all}] in analytics-client.tsx:34. Clicking a button calls setRange(value) which clones the current searchParams, sets range=value, and router.push(`/analytics?range=...`) (analytics-client.tsx:54-58, 67-81). The server page reads searchParams.range (default '90') and getCutoff(range) maps '30'->now-30d ISO, '90'->now-90d ISO, anything else ('all')->null=no cutoff (page.tsx:4-9,16,22). When a cutoff exists the booking query adds .gte('created_at', cutoff) (page.tsx:30). No client-side state; the range round-trips through the URL so it is shareable/bookmarkable and triggers a fresh server fetch.
- **Source:** `apps/web/src/app/(artist)/analytics/analytics-client.tsx:34-38`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:54-58`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:67-81`, `apps/web/src/app/(artist)/analytics/page.tsx:4-9`, `apps/web/src/app/(artist)/analytics/page.tsx:16`, `apps/web/src/app/(artist)/analytics/page.tsx:22`, `apps/web/src/app/(artist)/analytics/page.tsx:30`

### Booking data source (own artist_id scope, no tester exclusion)
- **What it does:** Loads the artist's own booking_requests rows (id, status, customer_email, deposit_amount, created_at) ordered oldest-first, optionally cut off by the selected range. Every metric on the page is derived from this one query.
- **Why needed:** It is the raw funnel data an artist needs: how many people asked, how many were accepted/passed, who came back, and whether deposits got paid.
- **How it works:** supabase.from('booking_requests').select('id, status, customer_email, deposit_amount, created_at').eq('artist_id', user!.id).order('created_at', asc), plus .gte('created_at', cutoff) when range is 30/90 (page.tsx:24-32). rows = bookings ?? [] so a null result degrades to empty. Scope is the logged-in artist only (user!.id from getUser, layout already redirects unauthenticated users). NOTE: unlike the admin analytics (lib/admin-queries.ts uses is_tester to exclude testers), this artist surface does NOT filter out tester accounts or tester rows; the artist sees all their own requests including any test bookings.
- **Source:** `apps/web/src/app/(artist)/analytics/page.tsx:17-32`, `apps/web/src/app/(artist)/layout.tsx:20-25`, `apps/web/src/lib/admin-queries.ts:37`, `apps/web/src/lib/admin-queries.ts:43-54`

### Total requests metric card
- **What it does:** Shows the count of all booking requests in the selected range as a headline number with no suffix.
- **Why needed:** Top-of-funnel volume tells the artist how much inbound interest they are getting in the period.
- **How it works:** total = rows.length (page.tsx:36). Rendered by <MetricCard label='Total requests' value={metrics.total} suffix='' /> (analytics-client.tsx:95-99). total also gates the whole non-empty render (empty = metrics.total === 0).
- **Source:** `apps/web/src/app/(artist)/analytics/page.tsx:36`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:95-99`

### Conversion rate metric card (approved / submitted)
- **What it does:** Percentage of requests that the artist accepted, shown with a '%' suffix and the hint 'approved ÷ submitted'. Counts both 'approved' and 'deposit_pending' statuses as approved.
- **Why needed:** An artist wants to know what share of inquiries they actually take on; a low rate can mean too much off-brief inbound or an overloaded book.
- **How it works:** approved = rows where status === 'approved' || status === 'deposit_pending' (page.tsx:37-39); conversionRate = total>0 ? round(approved/total*100) : 0 (page.tsx:41). Rendered with suffix '%' and hint 'approved ÷ submitted' (analytics-client.tsx:100-105). 'deposit_pending' = 'Awaiting deposit' per humanStatusLabel; including it means a request that was accepted and is now awaiting a deposit still counts as a conversion.
- **Source:** `apps/web/src/app/(artist)/analytics/page.tsx:37-41`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:100-105`, `packages/shared/src/status-labels.ts:12-17`

### Rejection rate metric card (rejected / submitted)
- **What it does:** Percentage of requests the artist passed on, with '%' suffix and hint 'rejected ÷ submitted'.
- **Why needed:** Lets the artist gauge how much inbound they decline (in-app verb is 'Pass'/'Passed'); a high rate may signal mismatched inquiries or a need to tighten the intake form.
- **How it works:** rejected = rows where status === 'rejected' (page.tsx:40); rejectionRate = total>0 ? round(rejected/total*100) : 0 (page.tsx:42). Rendered suffix '%', hint 'rejected ÷ submitted' (analytics-client.tsx:106-111). 'rejected' maps to the human label 'Passed'. Note conversion% + rejection% need not sum to 100 because pending/cancelled requests are in neither numerator.
- **Source:** `apps/web/src/app/(artist)/analytics/page.tsx:40`, `apps/web/src/app/(artist)/analytics/page.tsx:42`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:106-111`, `packages/shared/src/status-labels.ts:14-15`

### Unique clients card with return-rate label
- **What it does:** A metric card whose big value is a text label: '<n>% return' when there are repeat clients, otherwise 'first-time only'. Hint reads 'clients with 2+ bookings'.
- **Why needed:** Repeat-client rate is a key loyalty signal for a tattoo artist (returning clients = sustainable business and word-of-mouth), distinct from one-off walk-in inquiries.
- **How it works:** emailCounts Map tallies requests per non-null customer_email (page.tsx:44-52); uniqueClients = emailCounts.size; repeatClients = count of emails with >1 booking; returnRate = uniqueClients>0 ? round(repeatClients/uniqueClients*100) : 0 (page.tsx:53-56). The card passes value={total>0 ? undefined : 0} and rawLabel = returnRate>0 ? `${returnRate}% return` : 'first-time only' (analytics-client.tsx:112-121). MetricCard renders rawLabel verbatim when present (analytics-client.tsx:225). Identity is by email address, so the same person using two emails counts as two clients; rows with null email are ignored.
- **Source:** `apps/web/src/app/(artist)/analytics/page.tsx:44-56`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:112-121`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:208-230`

### Deposit collection card (conditional, paid / requested)
- **What it does:** Percentage of deposit-requested bookings whose deposit was paid, shown with '%' and hint 'paid ÷ requested'. The card only renders when at least one request in the period had a deposit amount.
- **Why needed:** Deposits protect against no-shows; an artist wants to see whether clients actually pay the deposits they ask for, which validates the deposit flow and pricing.
- **How it works:** depositRequested = rows where deposit_amount !== null; depositPaid = rows where status === 'approved' && deposit_amount !== null; depositRate = depositRequested>0 ? round(depositPaid/depositRequested*100) : null (page.tsx:58-65). Card is wrapped in {metrics.depositRate !== null && (...)} so it is hidden entirely when no deposits were requested (analytics-client.tsx:122-129). 'Paid' here is proxied by status==='approved' with a non-null deposit_amount (it counts accepted requests, not a literal payment-confirmation flag); deposit_pending requests are NOT counted as paid.
- **Source:** `apps/web/src/app/(artist)/analytics/page.tsx:58-65`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:122-129`

### Requests-per-month bar chart (last 6 active months)
- **What it does:** A horizontal row of vertical bars, one per month, showing how many requests came in that month, capped to the 6 most recent months that have data. Each bar shows its count above and the month label (e.g. 'Jan 25') below; bar height is scaled to the busiest month. Hover title shows 'label: count'.
- **Why needed:** Shows demand trend over time so the artist can spot seasonality and busy/slow stretches when planning their book.
- **How it works:** monthMap tallies rows by created_at.slice(0,7) ('YYYY-MM') (page.tsx:68-72); months = entries sorted ascending, slice(-6), mapped to {label: toLocaleDateString('en',{month:'short',year:'2-digit'}), count} (page.tsx:73-82). Client computes maxCount = max(counts,1) and renders each bar at height round(count/maxCount*100)% with minHeight 4px so a non-zero small month is still visible (analytics-client.tsx:60,138-160). Section only renders when months.length>0 (analytics-client.tsx:133). Months with no requests are simply absent (it is a list of active months, not a continuous axis).
- **Source:** `apps/web/src/app/(artist)/analytics/page.tsx:67-82`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:60`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:132-162`

### Per-day calendar heatmap (DT-4, most recent active month)
- **What it does:** A Monday-start 7-column calendar grid for the most recent month that has requests. Each day cell shows the day number and, if there were requests, the count, shaded by volume (a mustard heatmap with three intensity buckets). Section header shows 'Requests per day · <Month YYYY>'. Hover title reads e.g. 'June 2026 14: 3 requests'.
- **Why needed:** Lets an artist see which specific days drive inquiries (e.g. after a post or a market), useful for timing announcements and understanding weekly patterns.
- **How it works:** dayMap tallies rows by created_at.slice(0,10) ('YYYY-MM-DD') (page.tsx:85-89). latestMonthKey = most recent month key, fallback current month (page.tsx:90-91). Builds calendar: daysInMonth from new Date(calYear,calMonth,0).getDate(); leadingBlanks = Monday-shifted weekday of the 1st ((getDay()+6)%7); cells = each day with its count; maxDay = max(counts,1); label = toLocaleDateString long month + numeric year (page.tsx:92-109). Client renders WEEKDAYS header (Mon..Sun), leadingBlanks empty aria-hidden cells, then day cells. heatClass(count,max): 0 -> bordered/no fill; ratio>0.66 -> bg-brand-mustard/90; >0.33 -> /60; else -> /30 (intensity bucketed with literal Tailwind classes so JIT picks them up) (analytics-client.tsx:22-32,164-201). Count number only shown when count>0.
- **Source:** `apps/web/src/app/(artist)/analytics/page.tsx:84-109`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:15-32`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:164-201`

### Empty state (no requests in period)
- **What it does:** When there are zero requests in the selected range, the metric cards / charts / calendar are all replaced by a single centered bordered panel reading 'No bookings yet in this period — data will appear once requests come in.'
- **Why needed:** A new artist or one viewing a quiet 30-day window gets clear reassurance instead of a wall of zeros, and is told data will populate over time.
- **How it works:** empty = metrics.total === 0 (analytics-client.tsx:61). When true, the component short-circuits to the empty panel (analytics-client.tsx:84-90); the range toggle stays visible above it so the artist can switch to 'All time'. Note the empty-state copy contains an em-dash, which conflicts with the project copy rule banning em-dashes in user-visible strings.
- **Source:** `apps/web/src/app/(artist)/analytics/analytics-client.tsx:61`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:84-90`

### Loading skeleton
- **What it does:** While the server component fetches and computes, Next.js shows a skeleton: a title placeholder, three range-pill placeholders, four metric-card placeholders, and a 5-bar chart placeholder, all pulse-animated.
- **Why needed:** Gives the artist immediate visual feedback that analytics are loading rather than a blank screen, matching the page's eventual layout.
- **How it works:** loading.tsx is the route-level Suspense fallback auto-wired by App Router; pure presentational markup with animate-pulse, no data (loading.tsx:1-40).
- **Source:** `apps/web/src/app/(artist)/analytics/loading.tsx:1-40`

### Metric card hint sublabels
- **What it does:** Most cards render a small grey hint line under the value explaining the formula ('approved ÷ submitted', 'rejected ÷ submitted', 'clients with 2+ bookings', 'paid ÷ requested').
- **Why needed:** Makes each percentage self-explanatory so the artist trusts and correctly interprets the numbers without docs.
- **How it works:** MetricCard accepts an optional hint prop and renders {hint && <p ...>{hint}</p>} (analytics-client.tsx:227). Hints are passed inline per card (analytics-client.tsx:104,110,120,127). The 'Total requests' card has no hint by design.
- **Source:** `apps/web/src/app/(artist)/analytics/analytics-client.tsx:104`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:110`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:120`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:127`, `apps/web/src/app/(artist)/analytics/analytics-client.tsx:208-228`

### Mobile analytics API parity endpoint
- **What it does:** GET /api/mobile/analytics?range=30|90|all returns the same headline metrics as JSON for the Expo mobile app: total, approved, rejected, conversionRate, rejectionRate, uniqueClients, repeatClients, returnRate, depositRequested, depositPaid, depositRate, and a 6-month months[] array (month + count). It deliberately omits the per-day calendar grid.
- **Why needed:** Lets the artist see the same booking analytics on mobile; documents the canonical metric definitions shared between web and mobile.
- **How it works:** requireMobileUser(req) auth gate -> mobileError on failure (route.ts:28-29). Same query (eq artist_id, optional gte cutoff) and identical formulas as the web page; returns MobileAnalytics (route.ts:27-97; type in packages/shared/src/mobile-api.ts:172-187). Default range '90'. runtime='nodejs'. Like the web surface it does NOT apply tester exclusion. Not part of the /analytics route folder but is the documented mobile mirror of this surface.
- **Source:** `apps/web/src/app/api/mobile/analytics/route.ts:18-97`, `packages/shared/src/mobile-api.ts:172-187`

**Notes:** EDGE BEHAVIORS / SUBTLETIES: (1) Tester exclusion: the prompt asks about it, but this artist-facing surface applies NO is_tester filtering. Tester exclusion exists only in the admin analytics (apps/web/src/lib/admin-queries.ts:37,43-54 building a NOT IN list of tester artist_ids). The artist always sees their own raw booking_requests scoped only by artist_id. (2) 'Approved' for conversion AND for unique-clients/deposit purposes counts both status 'approved' and 'deposit_pending' for the conversion numerator (page.tsx:37-39), but the deposit 'paid' count uses status==='approved' ONLY (page.tsx:59-61), so a deposit_pending request is a conversion yet not a 'paid' deposit. (3) Conversion% and rejection% do not necessarily sum to 100 because 'pending' and 'cancelled' requests fall in neither bucket. (4) 'Deposit paid' is inferred from status==='approved' + non-null deposit_amount, not a literal payment-confirmation flag, so it is a proxy. (5) Client identity for unique/return clients is the customer_email string; rows with a null email are excluded from the client tally entirely, and one person with two emails counts as two unique clients. (6) Charts are lists of ACTIVE months only (slice(-6) of months that have data), not a continuous time axis, so gaps don't appear as empty bars; similarly the calendar shows only the single most-recent active month. (7) All metrics are computed in the server component with plain JS Math.round (integer percentages); deposit card is conditionally hidden when depositRate is null. (8) Range state lives entirely in the URL (?range=), making the view shareable/bookmarkable; default is 90 days. (9) Auth: the (artist) layout redirects unauthenticated users to /login before the page renders, and page.tsx uses the non-null assertion user!.id. (10) COPY ISSUE: the empty-state string 'No bookings yet in this period — data will appear once requests come in.' uses an em-dash, violating the project's no-em-dash copy rule. (11) There are NO write actions, exports, downloads, per-row drill-downs, custom date pickers, or comparison/previous-period features on this surface; it is purely read-only with one toggle. (12) Months bar labels use 2-digit year ('Jan 25'); calendar uses full month + 4-digit year.


---

## 12. Notifications + reminders

This surface is the artist's notification and reminder system, split across four loci. (1) The full-page in-app feed at /notifications lists the artist's last 100 notifications (booking activity, client updates, deposit payments, and system warnings), newest first, with unread highlighting, a Critical badge, and per-row CTA links. (2) A NotificationBell in both the desktop and mobile top bars shows an unread-count badge, opens a 360px dropdown panel that lazy-loads the latest 60 notifications, pins system warnings at the top, groups repeated activity, and supports per-row read, mark-all-read, and resolve-warning actions. (3) The Reminders configuration lives inside Settings > Emails (the /settings/reminders route is a permanent redirect to /settings/emails): three toggles (deposit-overdue, appointment reminder, reconfirmation request) plus two numeric "days before" fields, all persisted to the artist's profile.settings JSON. (4) A daily Vercel cron at /api/cron/reminders (09:00 UTC, fra1) scans bookings and sends the three reminder email types to clients (and the artist for overdue deposits), honoring each artist's toggles and day windows, with de-dup, a 10-email-per-artist cap, and audit logging. Artists can also fire deposit reminders and reconfirmations manually from a booking's Communication sidebar, rate-limited to 3 per booking/type/day. Notifications themselves are written automatically by other flows (new request, flash request, client cancellation, deposit paid, no-slots warning).

### Notifications full-page feed (list of last 100)
- **What it does:** Renders the artist's notifications newest-first in a single scrollable card list at /notifications, capped at 100 rows.
- **Why needed:** Gives a tattoo artist a durable, scannable history of booking activity, client updates, and system warnings beyond the small bell dropdown, so nothing important is missed.
- **How it works:** Server component reads supabase.auth.getUser(); if no user redirects to /login. Queries notifications where artist_id = user.id, order created_at desc, limit 100 (RLS plus explicit artist_id filter scope to the artist). Rows typed as Notification[]. No pagination, filters, or sort controls; fixed query.
- **Source:** `apps/web/src/app/(artist)/notifications/page.tsx:13-97`, `apps/web/src/app/(artist)/notifications/page.tsx:21-28`

### Unread highlight + Unread badge (feed row)
- **What it does:** Visually distinguishes unread notifications with a tinted (brand-rosa/10) row background and an uppercase 'Unread' chip next to the title.
- **Why needed:** Lets the artist instantly see which events they have not yet acted on.
- **How it works:** Per row, className adds bg-brand-rosa/10 when !notification.is_read; an inline 'Unread' pill renders when !is_read. Purely derived from the row's is_read column; no action on the page marks feed rows read (the page has no mark-read control).
- **Source:** `apps/web/src/app/(artist)/notifications/page.tsx:54-56`, `apps/web/src/app/(artist)/notifications/page.tsx:64-68`

### Critical priority badge (feed row)
- **What it does:** Shows a red 'Critical' chip on notifications whose priority is 'critical'.
- **Why needed:** Surfaces the most urgent items (e.g. severe system warnings) so the artist triages them first.
- **How it works:** Conditional render when notification.priority === 'critical'. Priority is one of critical/high/medium/low (NotificationPriority). Display-only; no current write path sets 'critical' (callers use 'high'), so this is forward-looking.
- **Source:** `apps/web/src/app/(artist)/notifications/page.tsx:69-73`, `packages/shared/src/notification-types.ts:7`

### Per-row CTA link (feed)
- **What it does:** Renders a deep-link (e.g. 'View request', 'View booking', 'Set up slots') that navigates to the related record when both cta_href and cta_label are present.
- **Why needed:** Turns a notification into a one-click jump to the booking/setting that needs attention.
- **How it works:** next/link to notification.cta_href with notification.cta_label text, rendered only when both are non-null. Hrefs are set by the producing flow (e.g. /bookings/requests/{id}, /bookings/settings). No mark-read side effect on click in the full-page feed.
- **Source:** `apps/web/src/app/(artist)/notifications/page.tsx:82-89`

### Notification timestamp formatting (feed)
- **What it does:** Displays each notification's created_at as a medium date + short time.
- **Why needed:** Lets the artist see when an event happened.
- **How it works:** Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short' }) over new Date(created_at). Uses the viewer's locale/timezone at render.
- **Source:** `apps/web/src/app/(artist)/notifications/page.tsx:6-11`, `apps/web/src/app/(artist)/notifications/page.tsx:78-80`

### Feed empty state
- **What it does:** Shows a bordered 'No notifications yet.' card when the artist has zero notifications.
- **Why needed:** Reassures a new artist the feature works and there is simply nothing to show.
- **How it works:** Branch when rows.length === 0 and no error. Static copy.
- **Source:** `apps/web/src/app/(artist)/notifications/page.tsx:45-48`

### Feed error state
- **What it does:** Shows a destructive-styled 'Notifications could not be loaded.' card if the Supabase query errors.
- **Why needed:** Communicates a transient failure rather than silently showing an empty page.
- **How it works:** Branch when the select returns error (checked before the empty/list branches). Generic message; the raw error is not surfaced to the artist.
- **Source:** `apps/web/src/app/(artist)/notifications/page.tsx:41-44`

### Notification bell button + unread count badge
- **What it does:** A bell icon button in the top bar that shows a numeric unread badge ('9+' when >9) and toggles the notification dropdown.
- **Why needed:** Always-visible, at-a-glance signal of pending booking activity from anywhere in the workspace without navigating to the feed.
- **How it works:** Client component seeded with initialUnreadCount (computed server-side in the artist layout). Badge renders when unreadCount > 0; shows unreadCount or '9+'. onClick toggles open and, on first open, lazy-loads notifications. Rendered in both desktop and mobile top bars.
- **Source:** `apps/web/src/components/notification-bell.tsx:64-82`, `apps/web/src/components/notification-bell.tsx:177-182`, `apps/web/src/components/app-shell/workspace-top-bar.tsx:59`, `apps/web/src/components/app-shell/mobile-top-bar.tsx:63`

### Server-computed initial unread count (layout)
- **What it does:** Computes the unread-notification count once per page render and feeds it to the bell badge and the sidebar 'Notifications' nav badge.
- **Why needed:** Shows an accurate unread count immediately on load without a client round-trip.
- **How it works:** In (artist)/layout.tsx, a head:true count query on notifications where artist_id = user.id and is_read = false; wrapped in try/catch, errors logged and unreadCount defaults to 0. Passed to Sidebar, MobileTopBar, and WorkspaceTopBar.
- **Source:** `apps/web/src/app/(artist)/layout.tsx:54-73`, `apps/web/src/app/(artist)/layout.tsx:100-114`

### Sidebar Notifications nav badge
- **What it does:** Shows the unread count as a badge on the 'Notifications' item in the left sidebar nav.
- **Why needed:** A second persistent unread indicator tied to the nav entry that opens the full feed.
- **How it works:** Sidebar passes badgeCount={unreadCount} only to the item whose label === 'Notifications'. Same unreadCount value as the bell.
- **Source:** `apps/web/src/components/app-shell/sidebar.tsx:57-61`, `apps/web/src/components/app-shell/sidebar.tsx:11-14`

### Bell dropdown panel (lazy load latest 60)
- **What it does:** Opens a 360px panel below the bell that loads and shows the artist's most recent 60 notifications.
- **Why needed:** Quick triage of recent events in place, without leaving the current screen.
- **How it works:** First handleOpen triggers fetchNotificationsAction inside a transition: server action re-checks auth and selects notifications for artist_id, order created_at desc, limit 60; sets notifications, recomputes unreadCount from the loaded rows, stores any error, marks loaded. Subsequent opens reuse cached state. Closes on outside mousedown.
- **Source:** `apps/web/src/components/notification-bell.tsx:88-99`, `apps/web/src/components/notification-bell.tsx:185-263`, `apps/web/src/app/(artist)/notifications/actions.ts:13-35`

### Bell loading skeleton
- **What it does:** Shows three animated placeholder rows while the dropdown's first fetch is in flight.
- **Why needed:** Signals progress so the panel does not look broken during load.
- **How it works:** Renders LoadingSkeleton while !loaded; replaced by content/empty/error once the fetch resolves.
- **Source:** `apps/web/src/components/notification-bell.tsx:200-203`, `apps/web/src/components/notification-bell.tsx:380-394`

### Bell empty state
- **What it does:** Shows 'No notifications yet.' inside the panel when there are no notifications.
- **Why needed:** Clarifies an empty inbox versus a load failure.
- **How it works:** Renders EmptyState when loaded and notifications.length === 0.
- **Source:** `apps/web/src/components/notification-bell.tsx:210-211`, `apps/web/src/components/notification-bell.tsx:396-402`

### Bell inline error banner
- **What it does:** Shows a small destructive banner with the error message inside the panel when fetch or a mutation fails.
- **Why needed:** Tells the artist if marking read/resolving or loading failed.
- **How it works:** error state is set from fetchNotificationsAction's error or from a mutation result's error; rendered above the list. Cleared on the next successful mutation.
- **Source:** `apps/web/src/components/notification-bell.tsx:205-209`, `apps/web/src/components/notification-bell.tsx:101-151`

### Warnings pinned section (bell)
- **What it does:** Groups unresolved system_warning notifications into a 'Warnings' section pinned at the top of the panel, sorted by priority.
- **Why needed:** Operational problems (e.g. no booking slots configured) get top billing so the artist fixes them before they block clients.
- **How it works:** warnings = notifications filtered to category === 'system_warning' && !is_resolved, sorted by PRIORITY_ORDER (critical>high>medium>low). Rendered as WarningRow list under a 'Warnings' label; an 'Activity' subheading appears only when warnings exist.
- **Source:** `apps/web/src/components/notification-bell.tsx:153-156`, `apps/web/src/components/notification-bell.tsx:214-238`, `apps/web/src/components/notification-bell.tsx:265-322`

### Activity grouping + count (bell)
- **What it does:** Collapses repeated non-warning notifications of the same type+CTA into a single row labeled like '3x New booking request' showing the latest message.
- **Why needed:** Prevents the panel from being flooded by many similar events (e.g. several new requests), keeping it scannable.
- **How it works:** Non-warning notifications are sorted by priority then created_at desc, then grouped by key `${type}__${cta_href}`. Each group shows count, latest title/message; when count>1 prefixes 'NxTitle' and 'Latest: message'. A group is unread if any member is unread.
- **Source:** `apps/web/src/components/notification-bell.tsx:42-62`, `apps/web/src/components/notification-bell.tsx:157-165`, `apps/web/src/components/notification-bell.tsx:324-378`

### Category icons + priority dots (bell)
- **What it does:** Shows an emoji per category (booking_activity, client_update, system_warning, info) and a colored priority dot on warning rows.
- **Why needed:** Fast visual classification of event type and urgency.
- **How it works:** CATEGORY_ICON and PRIORITY_DOT lookup maps keyed by the row's category/priority. Dots: critical=red, high=orange, medium=blue, low=muted.
- **Source:** `apps/web/src/components/notification-bell.tsx:28-40`, `apps/web/src/components/notification-bell.tsx:280-291`

### Relative time display (bell)
- **What it does:** Renders 'just now' / 'Nm ago' / 'Nh ago' / 'Nd ago' for each row's created_at.
- **Why needed:** Recency at a glance is more useful than absolute timestamps for a quick inbox.
- **How it works:** relativeTime() computes the diff from Date.now() and bucketizes minutes/hours/days.
- **Source:** `apps/web/src/components/notification-bell.tsx:17-26`, `apps/web/src/components/notification-bell.tsx:297-299`, `apps/web/src/components/notification-bell.tsx:358-360`

### Mark a row/group read on click (bell)
- **What it does:** Marks the clicked warning or activity group's unread items as read (optimistically) and decrements the unread badge.
- **Why needed:** Lets the artist clear the unread state as they review items.
- **How it works:** Clicking a WarningRow calls onRead -> handleMarkRead([id]) only if unread; an ActivityRow gathers its unread member ids and calls handleMarkRead. handleMarkRead runs markReadAction(ids): server action re-auths and updates notifications set is_read=true where id in ids AND artist_id=user.id. UI optimistically sets is_read and reduces unreadCount; errors revert to the error banner. Empty ids short-circuit to success.
- **Source:** `apps/web/src/components/notification-bell.tsx:114-135`, `apps/web/src/components/notification-bell.tsx:220-227`, `apps/web/src/components/notification-bell.tsx:239-251`, `apps/web/src/app/(artist)/notifications/actions.ts:37-61`

### Mark all read (bell)
- **What it does:** A header 'Mark all read' link that clears every unread notification at once.
- **Why needed:** One click to zero out a noisy inbox.
- **How it works:** Shown only when hasUnread. handleMarkAllRead calls markAllReadAction: re-auths and updates notifications set is_read=true where artist_id=user.id AND is_read=false. UI sets all rows read and unreadCount=0; errors show the banner.
- **Source:** `apps/web/src/components/notification-bell.tsx:190-198`, `apps/web/src/components/notification-bell.tsx:101-112`, `apps/web/src/app/(artist)/notifications/actions.ts:63-84`

### Resolve a system warning (bell)
- **What it does:** A 'Resolve' button on each warning row that dismisses it from the pinned warnings list and marks it read.
- **Why needed:** Lets the artist acknowledge/clear an operational warning once handled (e.g. after creating slots), so it stops being pinned.
- **How it works:** WarningRow's Resolve button (stopPropagation so it doesn't also trigger read) calls handleResolve(id) -> resolveWarningAction(id): re-auths and updates notifications set is_resolved=true, is_read=true where id and artist_id. UI sets is_resolved+is_read, which removes it from the warnings filter. Errors show the banner.
- **Source:** `apps/web/src/components/notification-bell.tsx:137-151`, `apps/web/src/components/notification-bell.tsx:308-317`, `apps/web/src/app/(artist)/notifications/actions.ts:86-110`

### Bell CTA link with panel close (activity/warning)
- **What it does:** Per-row CTA link in the dropdown that navigates to the related record; activity-row CTAs also close the panel.
- **Why needed:** Jump straight to the booking from the bell.
- **How it works:** Rendered when cta_href && cta_label. ActivityRow CTA onClick stopPropagation (so it doesn't trigger mark-read) and calls onClose -> setOpen(false). WarningRow CTA simply links.
- **Source:** `apps/web/src/components/notification-bell.tsx:300-307`, `apps/web/src/components/notification-bell.tsx:361-372`

### Notification feed sources (auto-created events)
- **What it does:** Defines the set of events that produce in-app notifications: new booking request, new flash booking request, booking cancelled by client, deposit paid, and the no-slots system warning.
- **Why needed:** These are the actual signals an artist receives; the feed/bell are only as useful as the events that feed them.
- **How it works:** createNotification(serviceClient insert into notifications) is called from: booking submit ([slug]/actions.ts, type booking_request, priority high, CTA View request), flash booking ([slug]/flash/.../actions.ts, booking_request, 'New flash booking request'), customer cancellation (request/[token]/actions.ts, booking_cancelled_by_client, client_update), Stripe webhook deposit paid (deposit_received, booking_activity, 'Deposit paid'), and bookings/settings (system_warning 'No time slots set up yet', deduped via metadata.warning_type). Each sets title/message/priority/category/cta and is_read=false.
- **Source:** `apps/web/src/lib/notifications.ts:27-54`, `apps/web/src/app/[slug]/actions.ts:628-638`, `apps/web/src/app/[slug]/flash/[flashSlug]/actions.ts:184-194`, `apps/web/src/app/request/[token]/actions.ts:264-274`, `apps/web/src/app/api/stripe/webhook/route.ts:482-491`, `apps/web/src/app/(artist)/bookings/settings/actions.ts:104-121`

### Reminders route redirect (/settings/reminders -> /settings/emails)
- **What it does:** The standalone /settings/reminders page permanently redirects into the consolidated Settings > Emails page.
- **Why needed:** Keeps reminder configuration co-located with email templates so artists manage all client-facing email in one place; preserves old links.
- **How it works:** RemindersPage is a server component that calls redirect('/settings/emails'). The actual reminder UI is rendered inside EmailsPage's 'Reminders' section via the RemindersForm component.
- **Source:** `apps/web/src/app/(artist)/settings/reminders/page.tsx:1-6`, `apps/web/src/app/(artist)/settings/emails/page.tsx:96-106`

### Deposit overdue reminder toggle (setting)
- **What it does:** On/off switch controlling whether overdue-deposit reminder emails are sent to client and artist.
- **Why needed:** Lets the artist automate chasing unpaid deposits so bookings don't silently lapse, while allowing artists who prefer manual follow-up to disable it.
- **How it works:** ARIA switch backed by a hidden input deposit_overdue_enabled='true'|'false'. On save, saveReminderSettingsAction parses it === 'true' into ReminderSettings.deposit_overdue_enabled, merged into profiles.settings.reminder_settings. Default true. Read by the cron via parseReminderSettings.
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:33-58`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:59-78`, `apps/web/src/lib/reminder-settings.ts:9-15`

### Appointment reminder toggle (setting)
- **What it does:** On/off switch for sending the client an appointment reminder email N days before their booking.
- **Why needed:** Reduces no-shows by reminding clients of their upcoming tattoo appointment.
- **How it works:** ARIA switch + hidden input appointment_reminder_enabled. Parsed === 'true' into appointment_reminder_enabled. Default true. Toggling it on reveals the days field. Read by the cron appointment block.
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:60-84`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:61-69`

### Appointment reminder days-before field (setting + validation)
- **What it does:** Numeric input setting how many days before the appointment the reminder fires (1-14).
- **Why needed:** Different artists want different lead times (e.g. 3 days for aftercare prep vs longer for travel).
- **How it works:** Number input min=1 max=14, only shown when the toggle is on; client onChange falls back to 3 on NaN. Server clamps with Math.min(14, Math.max(1, parseInt||3)). parseReminderSettings also re-validates 1..14 (else default 3). The cron sends when booking.preferred_date === today + appointment_reminder_days in the artist timezone.
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:85-112`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:63-69`, `apps/web/src/lib/reminder-settings.ts:29-34`, `apps/web/src/app/api/cron/reminders/route.ts:199-208`

### Reconfirmation request toggle (setting)
- **What it does:** On/off switch for sending a 'are you still coming?' email with a fresh cancel/magic link before the appointment.
- **Why needed:** Recovers slots from clients whose plans changed, so the artist can rebook the time.
- **How it works:** ARIA switch + hidden input reconfirmation_enabled, parsed === 'true' into reconfirmation_enabled (default true). Toggling on reveals the days field. The cron reconfirmation block rotates the booking's customer_token_hash and emails a fresh magic link.
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:115-140`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:70-77`, `apps/web/src/app/api/cron/reminders/route.ts:267-339`

### Reconfirmation days-before field (setting + validation)
- **What it does:** Numeric input setting how many days before the appointment the reconfirmation fires (3-30).
- **Why needed:** Gives the artist enough lead time to rebook a cancelled slot.
- **How it works:** Number input min=3 max=30, shown only when toggle is on; client onChange falls back to 14 on NaN. Server clamps Math.min(30, Math.max(3, parseInt||14)). parseReminderSettings re-validates 3..30 (else default 14). Cron sends when preferred_date === today + reconfirmation_days in artist timezone.
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:141-168`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:71-77`, `apps/web/src/lib/reminder-settings.ts:39-44`, `apps/web/src/app/api/cron/reminders/route.ts:271-279`

### Save reminder settings (form submit + feedback)
- **What it does:** Persists all five reminder settings to the artist's profile and shows 'Saved.' or an inline error; Save button shows a spinner while pending.
- **Why needed:** Commits the artist's reminder configuration so the cron behaves as configured.
- **How it works:** useActionState form posts to saveReminderSettingsAction: re-auths, reads profiles.settings, merges reminder_settings (clamped) and bumps updated_at, updates profiles where id=user.id, revalidatePath('/settings/emails'). On DB error returns lowercased error. Form shows state.error (destructive) or 'Saved.'; submit disabled while pending (Spinner). Local form state is optimistic; reload reflects saved values.
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:15-32`, `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:171-185`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:42-92`

### Reminder settings load + defaults (Emails page)
- **What it does:** Loads the artist's saved reminder settings (or sensible defaults) and renders them into the form.
- **Why needed:** Ensures a never-configured artist still gets working defaults (all on; 3-day appt; 14-day reconfirm).
- **How it works:** EmailsPage reads profiles.settings, runs parseReminderSettings(settings.reminder_settings) which falls back to DEFAULT_REMINDER_SETTINGS per-field, and passes the result to RemindersForm. Section heading 'Reminders' with helper 'Choose when automated emails go out to clients.'
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:53-59`, `apps/web/src/app/(artist)/settings/emails/page.tsx:96-106`, `apps/web/src/lib/reminder-settings.ts:9-46`

### Reminder cron job (daily automated sender)
- **What it does:** A scheduled endpoint that, once per day, scans bookings and sends the three reminder email types per the artist's settings, returning a JSON tally.
- **Why needed:** This is the engine that actually delivers automated client reminders without the artist lifting a finger.
- **How it works:** GET /api/cron/reminders (Node runtime). Requires Authorization: Bearer CRON_SECRET else 401. Scheduled in vercel.json at '0 9 * * *' (09:00) region fra1. Processes three blocks (deposit overdue, appointment, reconfirmation), each with per-artist setting checks, de-dup, and an email cap. Returns counts { deposit_overdue, appointment_reminder, reconfirmation, errors, capped }.
- **Source:** `apps/web/src/app/api/cron/reminders/route.ts:83-95`, `apps/web/src/app/api/cron/reminders/route.ts:20`, `apps/web/vercel.json:9-12`, `apps/web/vercel.json:2`

### Cron: deposit-overdue scan + dual email
- **What it does:** Finds bookings stuck in deposit_pending whose deposit_due_at is past and emails both the client (pay-now) and the artist (follow-up/cancel).
- **Why needed:** Automates deposit chasing and keeps the artist informed of stalled bookings.
- **How it works:** Selects booking_requests where status='deposit_pending' and customer_email not null. Per booking: skip if artist's deposit_overdue_enabled is false; skip if deposit_due_at missing or >= today (artist tz); skip if alreadySentToday; enforce withinCap. Sends sendDepositOverdueCustomer and (if artist email known) sendDepositOverdueArtist, then inserts audit_log reminder_sent {type:'deposit_overdue'}.
- **Source:** `apps/web/src/app/api/cron/reminders/route.ts:108-180`, `apps/web/src/lib/email/reminder-emails.ts:23-79`

### Cron: appointment-reminder scan + email
- **What it does:** Finds approved bookings whose date is exactly the artist's configured lead-time away and emails the client an appointment reminder.
- **Why needed:** Automated no-show prevention.
- **How it works:** Selects status='approved' with preferred_date in a today+1..today+15 window. Per booking: skip if appointment_reminder_enabled false; require preferred_date === today + appointment_reminder_days (artist tz, via relativeDateKeyFromToday); skip if alreadySentToday; enforce cap. Sends sendAppointmentReminder (includes placement from form_data, studio resolved per booking), logs audit reminder_sent {type:'appointment_reminder', days_out}.
- **Source:** `apps/web/src/app/api/cron/reminders/route.ts:182-250`, `apps/web/src/lib/email/reminder-emails.ts:81-115`

### Cron: reconfirmation scan + token rotation + email
- **What it does:** Finds approved bookings at the reconfirmation lead time, rotates the customer magic-link token, and emails a fresh cancel/confirm link.
- **Why needed:** Lets clients cancel with a fresh secure link so the artist can recover and rebook the slot.
- **How it works:** Selects status='approved' with preferred_date in today+3..today+31 and customer_token_hash not null. Per booking: skip if reconfirmation_enabled false; require preferred_date === today + reconfirmation_days (artist tz); skip if alreadySentToday; enforce cap. Generates a new 32-byte token, stores its sha256 hash on the booking; if the email send throws, restores the old hash (rollback). Logs audit reminder_sent {type:'reconfirmation', days_out}.
- **Source:** `apps/web/src/app/api/cron/reminders/route.ts:252-347`, `apps/web/src/lib/email/reminder-emails.ts:117-154`

### Cron: per-artist daily email cap (10)
- **What it does:** Caps the number of reminder emails the cron sends per artist per run at 10, counting capped overflow.
- **Why needed:** Protects against a misconfiguration or data anomaly blasting a client list and harming sender reputation/cost.
- **How it works:** ARTIST_EMAIL_CAP=10; withinCap(artistId) increments a per-run Map and returns false past 10. When exceeded the booking is skipped and results.capped++. Applies across all three reminder types within a single run.
- **Source:** `apps/web/src/app/api/cron/reminders/route.ts:97-104`, `apps/web/src/app/api/cron/reminders/route.ts:136-139`

### Cron: per-day de-duplication (alreadySentToday)
- **What it does:** Prevents sending the same reminder type for the same booking more than once per day.
- **Why needed:** Avoids spamming a client with duplicate reminders if the job runs twice or overlaps with a manual send.
- **How it works:** alreadySentToday queries audit_log count where booking_id, action='reminder_sent', details->>type = type, timestamp >= startOfTodayUtc(artist tz). Shared logic with manual sends (both write the same audit rows), so a manual send also blocks the automated one that day and vice versa.
- **Source:** `apps/web/src/app/api/cron/reminders/route.ts:63-81`, `apps/web/src/app/api/cron/reminders/route.ts:127-135`

### Cron: per-artist snapshot caching
- **What it does:** Caches each artist's display name, timezone, and parsed reminder settings (and email) for the duration of a run.
- **Why needed:** Avoids redundant profile/auth lookups when one artist has many bookings, keeping the job fast.
- **How it works:** getArtistSnapshot/getArtistEmail use in-memory Maps keyed by artistId; first lookup hits profiles / auth.admin.getUserById, then serves from cache.
- **Source:** `apps/web/src/app/api/cron/reminders/route.ts:29-61`

### Manual: send deposit reminder (Communication sidebar)
- **What it does:** A booking-page button letting the artist immediately send the overdue-deposit reminder to client (and artist).
- **Why needed:** Lets the artist chase a specific client on demand rather than waiting for the daily cron.
- **How it works:** Button shown only when status==='deposit_pending' && hasDepositDueDate. Calls sendManualDepositReminderAction(bookingId): re-auths, loads the booking scoped to artist_id, requires customer_email, blocks if alreadySentTodayManual('deposit_overdue'), and enforces checkReminderRateLimit (3 / artist / booking / type / 24h). Sends customer + artist emails, writes audit reminder_sent {type:'deposit_overdue', manual:true}, revalidates the booking page. UI shows 'Sending...' then 'Sent.' or the error for 3s.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:125-156`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:94-174`, `apps/web/src/lib/ratelimit.ts:77-88`

### Manual: send reconfirmation (Communication sidebar)
- **What it does:** A booking-page button to immediately send the reconfirmation email with a freshly rotated magic link.
- **Why needed:** On-demand way to confirm a specific upcoming client and free the slot if they cancel.
- **How it works:** Button shown when status==='approved' && hasMagicLink && hasUpcomingDate. Calls sendManualReconfirmationAction(bookingId): re-auths, requires customer_email and customer_token_hash, blocks if alreadySentTodayManual('reconfirmation'), generates+stores a new token hash, sends the email (on send failure restores the old hash and errors), writes audit reminder_sent {type:'reconfirmation', manual:true}, revalidates. Note: this action does NOT call checkReminderRateLimit (unlike the deposit one); de-dup is the once-per-day audit check.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:127-167`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:176-251`

### Manual: send appointment reminder action (implemented, not UI-wired)
- **What it does:** A server action to manually send the appointment reminder for a booking, mirroring the deposit/reconfirmation manual sends.
- **Why needed:** Would let an artist nudge a specific client about their upcoming appointment on demand.
- **How it works:** sendManualAppointmentReminderAction(bookingId): re-auths, loads booking scoped to artist, requires customer_email, blocks if alreadySentTodayManual('appointment_reminder'), sends sendAppointmentReminder, writes audit reminder_sent {type:'appointment_reminder', manual:true}, revalidates. The Communication sidebar imports only the deposit and reconfirmation actions, so this action currently has no button wired in the web UI (dead/forward path).
- **Source:** `apps/web/src/app/(artist)/settings/reminders/actions.ts:253-308`, `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:16-19`

### Communication log: reminder_sent rows (auto + manual distinction)
- **What it does:** The booking's Communication timeline shows each reminder send as a 'Reminder sent' or 'Reminder sent (manual)' entry with a bell icon and timestamp.
- **Why needed:** Gives the artist a per-booking record of exactly which reminders went out and when, automated vs manual.
- **How it works:** describe() maps audit action 'reminder_sent' to a Bell-icon mustard pill, labeling '(manual)' when details.manual === true. Both the cron and the manual actions write these audit_log rows; token_rotated and unknown actions are hidden. formatWhen renders day/month + HH:MM.
- **Source:** `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:59-66`, `apps/web/src/app/(artist)/bookings/requests/[id]/communication-sidebar.tsx:174-199`

### Reminder email templates (content + anti-phishing footer)
- **What it does:** Builds the actual email bodies/subjects for the four reminder messages (deposit-overdue to customer, deposit-overdue to artist, appointment reminder, reconfirmation), including studio details and a 'Sent by Inklee on behalf of {artist}' footer on customer mail.
- **Why needed:** Professional, trustworthy client-facing emails that won't be mistaken for phishing when they say 'pay now' or contain a cancel link.
- **How it works:** reminder-emails.ts composes plaintext bodies into buildEmailHtml with optional studio block and onBehalfOf footer, then calls sendEmail with type-specific subjects. Customer deposit-overdue includes amount/currency/dueAt and optional artist payment note; reconfirmation embeds the magic link; appointment/reconfirmation include placement and studio address/maps link. Copy is sentence-case and em-dash-free per brand rules.
- **Source:** `apps/web/src/lib/email/reminder-emails.ts:1-154`

**Notes:** Edge behaviors and subtleties worth flagging: (1) The full-page /notifications feed is read-only: it has NO mark-read, mark-all-read, resolve, or filter/sort controls; only the bell dropdown exposes those mutations. Opening the feed page does not clear unread state, so the bell badge can persist after visiting the feed. (2) The bell's unread count is computed in (artist)/layout.tsx and is only refreshed on full page navigation; it is recomputed client-side from the loaded 60 rows on first open. (3) Notifications are scoped by both RLS and explicit artist_id equality filters; all mutation actions re-check auth and constrain by artist_id, so an artist cannot mark/resolve another artist's notifications. (4) De-dup for reminders is shared between cron and manual via audit_log action='reminder_sent' filtered by details->>type and start-of-today in the artist's timezone, so a manual send blocks that day's automated send of the same type and vice versa. (5) Asymmetry in manual actions: sendManualDepositReminderAction enforces an Upstash rate limit (3 per artist/booking/type/24h) but sendManualReconfirmationAction and sendManualAppointmentReminderAction do not (they rely solely on the once-per-day audit check). (6) sendManualAppointmentReminderAction is fully implemented but not wired to any button in the web Communication sidebar (only deposit + reconfirmation buttons exist). (7) The cron caps at 10 emails per artist per run and tallies capped/errors but does not retry capped bookings; a large backlog would drip out across days. (8) Reconfirmation (cron and manual) rotates the booking's customer_token_hash and rolls it back if the email send throws, so a failed send doesn't invalidate the client's existing link. (9) Reminder day-window validation is enforced in three places (client onChange fallback, server clamp in saveReminderSettingsAction, and parseReminderSettings on read) so out-of-range values can't reach the cron. (10) The cron uses CRON_SECRET bearer auth and runtime='nodejs'; scheduled at 09:00 in vercel.json (UTC on Vercel) in region fra1. (11) The hardcoded copy 'in 3 days' and 'confirming in 2 weeks' in the appointment/reconfirmation email subjects/bodies is static text and does not reflect the artist's configured days value if changed from defaults. (12) The /settings/reminders route is a permanent redirect; the real settings UI lives under Settings > Emails.


---

## 13. Settings: profile + bio page

This surface is two sibling artist-settings pages that together control how an artist presents themselves on their public Inklee booking page. The Profile page (/settings/profile) edits the identity block that sits in the public page header: round logo, full-width cover image, cover color, display name, Instagram handle, a 280-character bio, timezone, and location. The Bio page (/settings/bio-page) edits the optional modules that render below the booking form on the same public page: a reorderable list of custom links (Instagram, website, aftercare, portfolio, etc.), a free-text booking policy, and a Shop visibility toggle, each with a per-section Show/hide checkbox. Both pages are server-rendered from the signed-in artist's profiles row, save through Next.js server actions that re-validate and sanitize everything server-side (image type/size, sharp resizing, URL safety, length caps, brand-color allowlist), and persist cover + bio-page config into the profiles.settings JSONB so no migration is needed. Both pages also surface a "Preview public page" link, and the bio-page save revalidates the live public route so changes appear immediately. The artist reaches both pages via the settings sub-nav (mobile) or the desktop sidebar, with /settings redirecting to /settings/profile.

### Profile page header + Preview public page link
- **What it does:** Renders the Profile settings heading, an explainer that the info appears on the public booking page, and a 'Preview public page' link that opens the artist's live page in a new tab when a slug exists.
- **Why needed:** Lets the artist immediately see the real public result of their identity edits, and reassures them which fields are public.
- **How it works:** Server component loads the signed-in user via supabase.auth.getUser() then selects the full profiles row by id. The preview anchor is built as `${NEXT_PUBLIC_APP_URL ?? 'https://inklee.app'}/${profile.slug}`, target=_blank rel=noopener noreferrer, and is only shown when profile.slug is set. No write.
- **Source:** `apps/web/src/app/(artist)/settings/profile/page.tsx:4-41`

### Logo upload + preview + Change button
- **What it does:** Lets the artist set a circular avatar/logo shown on the public page header. Shows a live round preview (or a 'None' placeholder), a 'Change' button that opens a hidden file picker, and helper text 'PNG, JPG, or WebP - max 2 MB - resized to 512x512'.
- **Why needed:** A tattoo artist's logo/brand mark is the visual anchor of their booking page and Instagram-driven traffic; it builds recognition and trust at the top of the page.
- **How it works:** Hidden file input name='logo' accepts image/png,image/jpeg,image/webp. On change, client validateImageFile() rejects wrong types ('Use a PNG, JPG, or WebP image.') or >2MB ('Image must be under 2 MB.'), clears the input, and shows fileError; valid files set an object-URL preview. On submit the server action re-validates ALLOWED_TYPES and MAX_SIZE (2MB), resizes with sharp to 512x512 cover/centre webp q85, uploads via the service-role client to the 'logos' bucket at `${user.id}/logo.webp` (upsert), then writes profiles.logo_url to the public URL with a `?t=Date.now()` cache-buster. Upload failure returns 'Logo upload failed. Try again.'; unprocessable images return 'Could not process that image...'.
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:44-60`, `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:78-152`, `apps/web/src/app/(artist)/settings/profile/actions.ts:10-11`, `apps/web/src/app/(artist)/settings/profile/actions.ts:66-103`, `apps/web/src/app/(artist)/settings/profile/actions.ts:188`

### Cover image upload / Replace / Remove with live preview
- **What it does:** Lets the artist set a wide banner image shown behind their name in the public page header. A 128px preview box shows the current image (or the chosen cover color, or charcoal fallback), with an Upload/Replace button and, when an image exists, a Remove button. Helper text: 'PNG, JPG, or WebP - max 4 MB - resized to 1600x600' and 'Shown behind your name on your public booking page. Falls back to your cover color or charcoal.'
- **Why needed:** A custom banner gives the booking page a polished, on-brand hero that matches the artist's aesthetic, separating it from a generic form.
- **How it works:** Hidden file input name='cover_image'. Client validateImageFile() caps at MAX_COVER_BYTES = 4MB (deliberately under Vercel's ~4.5MB request body cap) and the three allowed types; failures show fileError and clear the input. Upload sets an object-URL preview and clears removeCover. Remove sets removeCover=true, clears the preview, and renders a hidden input name='remove_cover_image' value='1'. Server action: if remove flag set, best-effort deletes `${user.id}/cover.webp` from the 'logos' bucket and sets coverImageUrl=null; else if a file is present it re-validates type + MAX_COVER_SIZE (note: server constant is 4MB but the returned message says 'under 5 MB'), resizes via sharp to 1600x600 cover/centre webp q80, uploads (upsert), and builds the public URL with `?t=` cache-buster. The value is merged into profiles.settings.cover_image_url (deleted from JSONB when cleared) without clobbering sibling settings keys.
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:154-239`, `apps/web/src/app/(artist)/settings/profile/actions.ts:13-16`, `apps/web/src/app/(artist)/settings/profile/actions.ts:105-145`, `apps/web/src/app/(artist)/settings/profile/actions.ts:158-178`

### Cover color picker (brand swatches + None)
- **What it does:** Lets the artist pick a header background color used when no cover image is set: a 'None' chip plus five brand swatches (Mustard #e9b22b, Rosa #db88b9, Cobalt #0b3d9f, Red #cf2e2c, Green #105f2d). The selected chip is highlighted; the choice updates the cover preview box in real time. Label note: '(used when no image is set)'.
- **Why needed:** Gives artists a fast, on-brand way to style the page hero without sourcing a banner image, keeping the page looking intentional.
- **How it works:** Client state coverColor (initialized from profile.settings.cover_color) is written into hidden input name='cover_color'; clicking a swatch sets the brand id, clicking 'None' sets ''. Server sanitizeCoverColor() lowercases/trims and accepts only the five brand names in COVER_COLOR_NAMES or a hex matching /^#[0-9a-f]{3,8}$/; anything else is ignored. Empty string clears it (delete settings.cover_color); a valid value is merged into profiles.settings.cover_color. The public page maps brand names (plus charcoal/bone) to hex and accepts raw hex too.
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:32-38`, `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:241-288`, `apps/web/src/app/(artist)/settings/profile/actions.ts:18-33`, `apps/web/src/app/(artist)/settings/profile/actions.ts:147-178`, `apps/web/src/app/[slug]/page.tsx:55-73`

### Display name field (required)
- **What it does:** Text input for the artist's public display name shown as the H1 on the public page and used in SEO/OpenGraph titles.
- **Why needed:** This is the name clients book under and search for; it is the single most important identity field on the page.
- **How it works:** Input name='display_name', defaultValue from profile, HTML required. Server action trims it and returns 'Display name is required.' if empty; otherwise writes profiles.display_name. The public page renders it as the header H1 and derives the metadata title and the closed-books 'first name' copy from it.
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:290-302`, `apps/web/src/app/(artist)/settings/profile/actions.ts:46-62`, `apps/web/src/app/(artist)/settings/profile/actions.ts:182-183`, `apps/web/src/app/[slug]/page.tsx:518-519`

### Instagram handle field (@-stripped)
- **What it does:** Text input for the artist's Instagram handle, rendered with a fixed '@' prefix in the UI. Appears on the public header as a clickable @handle linking to instagram.com.
- **Why needed:** Instagram is the primary discovery + portfolio channel for tattoo artists; linking it from the booking page closes the loop between feed and booking.
- **How it works:** Input name='instagram_handle' (UI shows a non-editable '@' span). Server trims the value and strips a leading '@' via .replace(/^@/, ''); empty becomes null in profiles.instagram_handle. Public page links `https://instagram.com/${handle}` with target=_blank rel=noopener noreferrer.
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:304-321`, `apps/web/src/app/(artist)/settings/profile/actions.ts:47-49`, `apps/web/src/app/(artist)/settings/profile/actions.ts:184`, `apps/web/src/app/[slug]/page.tsx:527-536`

### Bio textarea with 280-char live counter
- **What it does:** Multi-line bio shown under the name on the public page. A live counter shows current length over 280 and turns red (text-destructive) when over the limit.
- **Why needed:** A short bio sets expectations (style, vibe, what the artist tattoos) before a client commits to a booking request.
- **How it works:** Controlled textarea name='bio' (3 rows), state-bound so the counter `${bio.length}/280` updates per keystroke. The counter only restyles past 280; it does not hard-block typing. Server trims and enforces bio.length > 280 -> 'Bio must be 280 characters or fewer.'; empty becomes null. Public page renders it under the header name.
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:77`, `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:323-342`, `apps/web/src/app/(artist)/settings/profile/actions.ts:50`, `apps/web/src/app/(artist)/settings/profile/actions.ts:63-64`, `apps/web/src/app/[slug]/page.tsx:540-544`

### Timezone select
- **What it does:** Dropdown selecting the artist's timezone from a curated list of 19 zones (Europe, Americas, Asia, Australia, Pacific), shown with underscores replaced by spaces.
- **Why needed:** Slot times and date logic on the public page are rendered in the artist's timezone; getting this right prevents clients booking the wrong local time.
- **How it works:** Select name='timezone', defaultValue from profile or 'Europe/Berlin'. Options come from the hardcoded TIMEZONES array. Server writes the chosen string to profiles.timezone (no allowlist re-check on the server beyond what the select offers). Downstream, the public page uses profile.timezone for slot display, today calculation, and booking-window expiry.
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:10-30`, `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:344-360`, `apps/web/src/app/(artist)/settings/profile/actions.ts:51`, `apps/web/src/app/(artist)/settings/profile/actions.ts:185`, `apps/web/src/app/[slug]/page.tsx:290-291`

### Location field
- **What it does:** Free-text city/location input (placeholder 'City') shown next to the Instagram handle on the public header and woven into the page's SEO description.
- **Why needed:** Clients search for tattoo artists by city; showing the location helps local discovery and sets travel expectations.
- **How it works:** Input name='location', defaultValue from profile. Server trims; empty becomes null in profiles.location. Public header shows it (with a '·' separator before the handle when both exist) and generateMetadata folds it into the description (' in {location}').
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:362-374`, `apps/web/src/app/(artist)/settings/profile/actions.ts:52`, `apps/web/src/app/(artist)/settings/profile/actions.ts:186`, `apps/web/src/app/[slug]/page.tsx:106-114`, `apps/web/src/app/[slug]/page.tsx:521-526`

### Save profile submit + success/error/disabled states
- **What it does:** Submits the whole profile form. While pending, the button shows a spinner and is disabled; on success a green 'Profile updated.' message appears; field/file errors show in red above the form.
- **Why needed:** Gives the artist clear, single-action confirmation that their public-facing identity changes were saved.
- **How it works:** Form uses React useActionState(updateProfileAction). pending disables the submit and swaps the label for a Spinner. State is a discriminated union: {error} renders text-destructive, {success:true} renders 'Profile updated.' in brand-green. fileError (client validation) renders separately at the top. The action returns error.message.toLowerCase() on a DB update failure.
- **Source:** `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:72-108`, `apps/web/src/app/(artist)/settings/profile/profile-form.tsx:376-383`, `apps/web/src/app/(artist)/settings/profile/actions.ts:180-206`

### Latent booking_mode parameter on the profile action
- **What it does:** The profile server action will accept and persist a booking_mode value ('preferred_date' | 'fixed_slots') and write an audit log entry if one is posted, but the Profile form does NOT render any control that submits it, so on this surface it is effectively a no-op/forward-compat hook. (Booking mode is actually edited at bookings/settings.)
- **Why needed:** Documenting it matters because a reader of the action could assume profile settings change booking mode; in practice booking mode is owned by a different surface.
- **How it works:** updateProfileAction reads formData.get('booking_mode'); if truthy it adds booking_mode to the profiles update and fires writeAudit({action:'booking_mode_changed', category:'settings', details:{to}}). No input name='booking_mode' exists in profile-form.tsx (confirmed by grep); the real toggle lives in bookings/settings/booking-mode-form.tsx.
- **Source:** `apps/web/src/app/(artist)/settings/profile/actions.ts:53-56`, `apps/web/src/app/(artist)/settings/profile/actions.ts:189`, `apps/web/src/app/(artist)/settings/profile/actions.ts:197-204`, `apps/web/src/lib/audit.ts:18-26`, `apps/web/src/app/(artist)/bookings/settings/booking-mode-form.tsx`

### Bio page header + Preview public page link
- **What it does:** Renders the Bio page heading and explainer ('Your public page is more than a booking form. Add your links and booking policy, and choose what shows. Booking stays the main action.') plus a 'Preview public page' link with an external-link icon.
- **Why needed:** Frames the bio-page modules as additive to (not replacing) the booking form, and lets the artist jump straight to the live result.
- **How it works:** Server component selects only slug + settings for the user, parses settings.bio_page via parseBioPageSettings, and computes publicUrl via publicArtistUrl(slug) (subdomain or path mode by env). The preview anchor (target=_blank rel=noopener noreferrer) renders only when slug exists.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/page.tsx:7-49`, `apps/web/src/lib/public-url.ts:67-76`

### Custom links: add link
- **What it does:** Adds a new empty link row (label + url + Active) to the editable list. The 'Add link' button disappears once the list reaches the 12-link cap.
- **Why needed:** Lets artists surface their off-platform presence (Instagram, website, aftercare guide, portfolio, shop) right under the booking form, turning the page into a true link-in-bio.
- **How it works:** addLink() appends makeLink() (crypto.randomUUID() id, empty label/url, isActive=true) but no-ops when links.length >= MAX_LINKS (12). The button is conditionally rendered only while under the cap. All link state is client-only until Save.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:21-27`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:57-60`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:157-166`, `apps/web/src/lib/bio-page-settings.ts:41`

### Custom links: label field (60-char cap)
- **What it does:** Per-link text input for the display label (placeholder 'Label (e.g. Instagram)'), hard-capped at 60 characters as you type.
- **Why needed:** A clear, short label ('Instagram', 'Aftercare', 'Portfolio') makes each link scannable on the public page.
- **How it works:** onChange slices to MAX_LINK_LABEL (60). On save the parser re-trims and re-slices to 60; if the label is blank it falls back to using the URL as the label.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:97-106`, `apps/web/src/lib/bio-page-settings.ts:40`, `apps/web/src/lib/bio-page-settings.ts:86-89`

### Custom links: URL field with safety sanitization
- **What it does:** Per-link URL input (placeholder 'https://… or you@email.com', inputMode='url'). Accepts full URLs, bare domains, and email/mailto addresses.
- **Why needed:** Artists paste links in many shapes; the field tolerates that while blocking dangerous URLs so the public page can't host an XSS/phishing vector.
- **How it works:** Stored verbatim client-side. On save, sanitizeBioLinkUrl() trims, accepts mailto: only if the address matches a basic email regex, prepends https:// when there is no scheme, parses via URL(), and rejects anything whose protocol is not http:/https: (so javascript:, data:, etc. are dropped). A link whose URL fails sanitization is dropped entirely; the public CustomLinksBlock renders the anchor with rel='noopener noreferrer nofollow' target=_blank.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:136-142`, `apps/web/src/lib/bio-page-settings.ts:54-96`, `apps/web/src/app/[slug]/custom-links-block.tsx:20-34`

### Custom links: Active toggle (per link)
- **What it does:** Per-link 'Active' checkbox that controls whether that link actually appears on the public page, independent of saving it.
- **Why needed:** Lets an artist keep a link configured but temporarily hide it (e.g. a seasonal shop or paused waitlist) without deleting and re-typing it.
- **How it works:** Checkbox bound to link.isActive via updateLink. Persisted as isActive on the link object. The public page filters customLinks to only isActive links (activeLinks) before rendering CustomLinksBlock.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:143-152`, `apps/web/src/lib/bio-page-settings.ts:94`, `apps/web/src/app/[slug]/page.tsx:170`, `apps/web/src/app/[slug]/page.tsx:630-632`

### Custom links: reorder up/down
- **What it does:** Per-link 'Move link up' / 'Move link down' arrow buttons that swap a link with its neighbor; the top item's up arrow and the bottom item's down arrow are disabled.
- **Why needed:** Ordering matters for link-in-bio pages; the artist wants their most important link (e.g. Instagram or aftercare) first.
- **How it works:** move(index, dir) swaps adjacent entries in the links array, bounded so it no-ops at the ends; buttons disabled via i===0 / i===links.length-1. Order is preserved in the serialized JSON and rendered in that order on the public page.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:49-56`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:107-126`

### Custom links: delete (Trash)
- **What it does:** Per-link trash button that removes the link row from the list.
- **Why needed:** Lets the artist permanently drop links they no longer want.
- **How it works:** removeLink(id) filters the link out of client state; the change is persisted on Save (the deleted link is simply absent from the serialized custom_links JSON).
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:47-48`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:126-133`

### Custom links: empty state
- **What it does:** When there are no links, shows 'No links yet.' in muted text.
- **Why needed:** Tells the artist the section is empty rather than broken, and implies the next step is to add a link.
- **How it works:** Rendered when links.length === 0, alongside the still-visible 'Add link' button.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:88-90`

### Custom links: Show/hide module toggle
- **What it does:** A 'Show' checkbox on the Links section header that controls whether the entire Links block appears on the public page.
- **Why needed:** Lets the artist keep configured links but hide the whole section from the public page at once.
- **How it works:** Checkbox name='show_links' bound to showLinks state. Because unchecked checkboxes are absent from FormData, the action treats absence as hidden: if formData.get('show_links') !== 'on' it pushes 'links' into the hidden[] array stored in bio_page.hidden. The public page's visibleModules() filters hidden modules out.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:39`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:76-84`, `apps/web/src/app/(artist)/settings/bio-page/actions.ts:26-30`, `apps/web/src/lib/bio-page-settings.ts:121-131`

### Booking policy textarea (1000-char cap + counter)
- **What it does:** Free-text booking/deposit/cancellation policy with a 5-row textarea, a live `length/1000` counter, and a worked-example placeholder. Renders as its own bordered 'Booking policy' card below the booking form on the public page.
- **Why needed:** Lets the artist set client expectations up front (deposit rules, cancellation/reschedule terms, minimum size, what work they take), reducing back-and-forth and no-shows.
- **How it works:** Controlled textarea name='booking_policy' with HTML maxLength=MAX_BOOKING_POLICY (1000) and a live counter. Server trims and converts empty to null; the parser re-trims and re-slices to 1000. Stored at bio_page.bookingPolicy. The public page only mounts BookingPolicyBlock when the policy module is visible AND bookingPolicy is non-empty; it renders with whitespace-pre-line so line breaks are preserved.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:35-37`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:191-203`, `apps/web/src/app/(artist)/settings/bio-page/actions.ts:23-24`, `apps/web/src/lib/bio-page-settings.ts:39`, `apps/web/src/lib/bio-page-settings.ts:102-105`, `apps/web/src/app/[slug]/page.tsx:633-639`, `apps/web/src/app/[slug]/booking-policy-block.tsx:6-15`

### Booking policy: Show/hide module toggle
- **What it does:** A 'Show' checkbox on the Booking policy section header controlling whether the policy block appears publicly.
- **Why needed:** Lets the artist keep a drafted policy but hide it from the public page when they're not ready to show it.
- **How it works:** Checkbox name='show_policy' bound to showPolicy. Absence in FormData => action pushes 'policy' into hidden[]. visibleModules() removes it on the public page (which also independently requires bookingPolicy to be set).
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:40-42`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:181-189`, `apps/web/src/app/(artist)/settings/bio-page/actions.ts:28`

### Shop module Show/hide toggle (architectural slot)
- **What it does:** A 'Show' checkbox on the Shop section that controls whether the shop/goods section is allowed to appear on the public page. Copy notes 'The Goods module ships next; this controls whether the shop section can show on your public page.'
- **Why needed:** Lets artists pre-control visibility of their for-pickup goods showcase ahead of/alongside the goods feature, so they can opt the section in or out.
- **How it works:** Checkbox name='show_shop' bound to showShop; absence => action pushes 'shop' into hidden[]. On the public page, products are only queried + the Shop teaser shown when isModuleVisible(bioPage,'shop') AND canUseGoods(settings) (per-artist goods feature flag, default on). The shop renders as a header teaser (ShopTeaser), not inline in the module list.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:43`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:205-226`, `apps/web/src/app/(artist)/settings/bio-page/actions.ts:29`, `apps/web/src/app/[slug]/page.tsx:177-178`, `apps/web/src/lib/features.ts:45-47`

### Save bio page submit + success/skip-note/error states
- **What it does:** Submits the bio-page form. While pending the button shows 'Saving…' and is disabled; on success shows 'Saved.' or a note about dropped links; on error shows the DB message in red.
- **Why needed:** Confirms the artist's links/policy/visibility changes persisted and warns them when some links were rejected as unsafe.
- **How it works:** useActionState(saveBioPageAction). The action JSON-parses the hidden custom_links field (returns 'Could not read the links. Try again.' on parse failure), round-trips the whole config through parseBioPageSettings (URL safety, length caps, module-key filtering, 12-link cap), and compares input vs surviving link count. If links were dropped it returns success with note 'Saved. N link(s) skipped (unsafe or invalid URL).'; otherwise success 'Saved.' Pending state swaps the label to 'Saving…'.
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:29-33`, `apps/web/src/app/(artist)/settings/bio-page/bio-page-form.tsx:228-244`, `apps/web/src/app/(artist)/settings/bio-page/actions.ts:32-51`, `apps/web/src/app/(artist)/settings/bio-page/actions.ts:74-80`

### Bio page save persistence + public-page revalidation
- **What it does:** Persists the parsed bio_page config into profiles.settings and immediately revalidates both the settings page and the artist's live public page so changes appear without a manual refresh.
- **Why needed:** Artists expect their public page to reflect edits instantly; stale caching would make them think the save failed.
- **How it works:** The action loads current profiles.settings, spreads it, and writes {...current, bio_page: settings} plus updated_at so sibling settings keys (cover image, form settings, books settings, features, etc.) are preserved. On success it calls revalidatePath('/settings/bio-page') and, when a slug exists, revalidatePath(`/${profile.slug}`).
- **Source:** `apps/web/src/app/(artist)/settings/bio-page/actions.ts:53-72`, `apps/web/src/lib/bio-page-settings.ts:98-119`

### Public bio-page composition (module order + fixed order)
- **What it does:** Defines how the saved settings actually render on the public page: identity header (logo, cover image with charcoal scrim, cover color fallback, name, location/Instagram, bio), then the booking form, then the visible bio modules in fixed order (links, then policy), with shop shown as a header teaser.
- **Why needed:** This is the payoff of everything edited on this surface: it is the real public artist page clients see and book through.
- **How it works:** ArtistPublicPage reads the profiles row by slug via the service client, resolves cover image (only http/https/protocol-relative allowed) and cover color (brand-name or hex), parses bio_page, filters active links, and iterates visibleModules() in BIO_MODULE_ORDER ['links','policy','shop'] rendering CustomLinksBlock and BookingPolicyBlock below the booking form. Booking stays the primary action; modules are additive and any hidden/unset ones are skipped.
- **Source:** `apps/web/src/app/[slug]/page.tsx:148-169`, `apps/web/src/app/[slug]/page.tsx:481-505`, `apps/web/src/app/[slug]/page.tsx:627-643`, `apps/web/src/lib/bio-page-settings.ts:13-17`

### Settings sub-navigation (mobile tabs + desktop sidebar) and /settings redirect
- **What it does:** Provides the in-app navigation that gets an artist to these two pages. On mobile a scrollable tab strip lists Profile, Bio page, Emails, Calendar, Payouts, Dashboard, Account with a mustard active underline; on desktop the sidebar serves the same links. Bare /settings redirects to /settings/profile.
- **Why needed:** Artists need a discoverable, consistent way to move between settings sections; profile is the sensible default landing page.
- **How it works:** SettingsLayout renders SettingsNav (md:hidden) which feeds an ITEMS list into the generic SectionNav (active state via isActiveItem on usePathname, mustard underline). /settings/page.tsx is a server redirect() to /settings/profile.
- **Source:** `apps/web/src/app/(artist)/settings/layout.tsx:1-17`, `apps/web/src/components/settings-nav.tsx:1-16`, `apps/web/src/components/section-nav.tsx:12-63`, `apps/web/src/app/(artist)/settings/page.tsx:1-4`

**Notes:** Edge behaviors and subtleties: (1) Cover image size mismatch — the server constant MAX_COVER_SIZE is 4MB (4*1024*1024) but the rejection message says 'Cover image must be under 5 MB.'; the client cap (MAX_COVER_BYTES) is 4MB with a matching 'under 4 MB' message and the helper text reads 'max 4 MB', so a 4-5MB file would be blocked client-side by the 4MB check before the 5MB message could ever surface. (2) Logo and cover are both uploaded to the SAME 'logos' Supabase storage bucket via the service-role client at `${user.id}/logo.webp` and `${user.id}/cover.webp` (upsert), with a `?t=Date.now()` query appended to bust CDN/browser cache after replace. (3) All cover + bio_page data lives in the profiles.settings JSONB (not dedicated columns), and both actions deliberately merge into existing settings to avoid clobbering siblings like form_settings, books_settings, features, deposit_defaults. (4) booking_mode is read+audited by the profile action but no profile-form control posts it (confirmed via grep) — it is effectively forward-compat dead input on this surface; the real booking-mode UI is bookings/settings/booking-mode-form.tsx. (5) The bio counter (280) and policy counter (1000) differ in enforcement: bio has NO maxLength attribute (counter just turns red, server rejects >280), while the policy textarea has a hard HTML maxLength=1000. (6) Link URL sanitization is defense-in-depth: client stores verbatim, server drops unsafe/unparseable links silently and reports how many were skipped; the public anchor adds rel='nofollow'. (7) Web-only conveniences: live image object-URL previews, real-time cover-color preview, drag-free up/down reordering, instant 'Preview public page' deep-links, and revalidatePath so the public page updates immediately after a bio-page save. (8) The 'Show' checkboxes use FormData absence-as-hidden semantics, which is robust but means a future change to how the form serializes could silently flip module visibility. (9) Profile page selects the full profiles row ('*') while bio-page selects only slug+settings — a minor over-fetch on profile.


---

## 14. Settings: emails + templates

This surface is the artist's control center for every transactional email Inklee sends on their behalf around bookings, plus the automated reminder schedule. The live route is /settings/emails (the old /settings/templates path now just redirects here). The page has two stacked sections. The first, "Email templates", lists five per-status booking emails (booking received, approved, rejected, you-cancelled, and the new-request notice to the artist) as a clickable card list; clicking a card opens a modal editor where the artist rewrites the plain-text body, sees the live subject and the allowed merge variables, watches a 0/2000 character counter, toggles that specific email on or off, resets a customized template back to the system default (with an inline confirm), and saves. Saved bodies are stored per artist+type in email_templates and merged at send time over hardcoded DEFAULT_BODIES; disabled types are recorded in profiles.settings.disabled_emails and suppressed by the actual send path. The second section, "Reminders", lets the artist enable/disable and time three automated lifecycle emails (deposit overdue, appointment reminder with a days-before value, reconfirmation request with a days-before value), persisted to profiles.settings.reminder_settings. All bodies render through one shared branded email shell (logo header, white card, footer) with HTML escaping, URL-only CTA buttons, and optional studio/goods/custom-answer blocks. The surface gives a solo tattoo artist branded, on-brand client communication without writing any HTML, plus an off switch for noise and a schedule for nudges.

### Email templates card list (5 per-status templates)
- **What it does:** Renders a bordered, divided list of exactly five booking email templates, each as a full-width clickable button row showing its human label, its (read-only) subject line in mono font, an On/Off status word, and a right arrow.
- **Why needed:** A solo artist needs to see at a glance which client/self emails exist and which are switched on, then jump straight into editing one, without leaving the Emails page.
- **How it works:** page.tsx builds the list from the const TEMPLATE_TYPES array (5 fixed types) plus DEFAULT_SUBJECTS / DEFAULT_BODIES and the saved rows from email_templates (select type, body where artist_id = user). email-templates-list.tsx maps each TemplateData to a <button> that calls open(type), which sets openType state and shows the <dialog>. No server call on click; purely opens the modal.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:12`, `apps/web/src/app/(artist)/settings/emails/page.tsx:61`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:60`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:66`

### "Edited" badge on customized templates
- **What it does:** Shows a small rounded "Edited" chip next to a template's label in the card list when the artist's saved body differs from the shipped system default.
- **Why needed:** Lets the artist instantly tell which emails they have personalized versus which are still Inklee's stock copy, so they know what they're responsible for maintaining.
- **How it works:** In email-templates-list.tsx the row computes isCustomised = body !== systemDefault. systemDefault is DEFAULT_BODIES[type] passed from page.tsx (line 66); body is the saved row or the default. When true, the chip renders. Purely client-side comparison, no fetch.
- **Source:** `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:64`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:77`, `apps/web/src/app/(artist)/settings/emails/page.tsx:66`

### On/Off status indicator per template (list)
- **What it does:** Each card shows the literal word "On" or "Off" reflecting whether that email type is currently enabled.
- **Why needed:** The artist can confirm at a glance whether, for example, the rejection email is currently silenced, before opening the editor.
- **How it works:** page.tsx computes enabled = !disabledSet.has(type) where disabledSet comes from profiles.settings.disabled_emails (page.tsx:54). email-templates-list.tsx renders the word and colors it foreground when on, muted when off.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:54`, `apps/web/src/app/(artist)/settings/emails/page.tsx:67`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:88`

### Template editor modal (native <dialog>)
- **What it does:** Opens a centered modal over the page for the clicked template, with a header (label + subject), a variables reference strip, the body editor, and footer controls. Closes on the × button, on backdrop click, or on Escape.
- **Why needed:** Gives the artist a focused space to edit one email at a time without navigating away or losing the list context.
- **How it works:** email-templates-list.tsx keeps openType state; a useEffect calls dialogRef.showModal()/close() to sync. handleBackdropClick closes when the click target is the dialog element itself; onClose (native Escape) resets state via handleDialogClose. activeTemplate is found by type and feeds the header/editor. The editor is keyed by type so switching templates remounts fresh state.
- **Source:** `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:29`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:36`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:52`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:102`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:143`

### Allowed merge-variables reference strip
- **What it does:** Displays, inside the modal, the full set of placeholders the artist may use in the body, each shown as code in {{var}} form (customer_handle, artist_name, artist_slug, date, placement, size, magic_link).
- **Why needed:** The artist must know exactly which dynamic fields are supported so the email actually personalizes (greeting, dates, placement, the magic link) instead of printing literal braces.
- **How it works:** page.tsx passes allowedVars={[...ALLOWED_VARS]} (from booking-templates.ts). email-templates-list.tsx maps each over a <code>{{v}}</code>. At send time substituteVars() replaces any {{key}} that is in ALLOWED_VARS with the real value and warns+blanks any unknown key.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:92`, `apps/web/src/app/(artist)/settings/emails/email-templates-list.tsx:131`, `apps/web/src/lib/email/booking-templates.ts:6`, `apps/web/src/lib/email/booking-templates.ts:59`

### Email body editor (textarea)
- **What it does:** A multi-line (8-row), resizable, mono-font textarea pre-filled with the current body where the artist rewrites the plain-text email content.
- **Why needed:** This is the core function: a non-technical artist rewrites their booking emails in plain language, no HTML required.
- **How it works:** template-editor.tsx holds body in state seeded from defaultBody; onChange updates body and clears any pending reset confirm. The field is disabled when the template is toggled off. Submitting posts the hidden type + body via the form action saveTemplateAction.
- **Source:** `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:37`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:80`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:88`

### Character counter (0/2000) with over-limit warning
- **What it does:** Shows a live "{n}/2000" counter beneath the editor; the number turns destructive/red once the body exceeds 2000 characters.
- **Why needed:** Booking emails must stay short and within the enforced server limit; the artist gets immediate feedback before hitting Save and failing validation.
- **How it works:** template-editor.tsx renders body.length and conditionally applies text-destructive when body.length > 2000. The 2000 cap is hard-enforced server-side by templateBodySchema (.max(2000)).
- **Source:** `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:93`, `apps/web/src/lib/email/booking-templates.ts:23`

### Save template action
- **What it does:** Persists the edited body for that template type, shows "Saved." on success or an inline error, then auto-closes the modal ~700ms later.
- **Why needed:** Commits the artist's customized copy so it is used the next time that booking event fires.
- **How it works:** Form action -> saveTemplateAction(prev, formData). Reads type + trimmed body, validates with templateBodySchema.safeParse; on failure returns the first issue message. On success upserts into email_templates {artist_id, type, subject: DEFAULT_SUBJECTS[type] ?? 'inklee', body} onConflict (artist_id,type), fires writeAudit('email_template_edited'), and revalidatePath('/settings/emails'). template-editor.tsx watches state for success and calls onSaveSuccess (close) after a 700ms timeout so "Saved." is visible.
- **Source:** `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:33`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:62`, `apps/web/src/app/(artist)/settings/emails/actions.ts:20`, `apps/web/src/app/(artist)/settings/emails/actions.ts:38`, `apps/web/src/app/(artist)/settings/emails/actions.ts:47`

### Body validation (length + anti-injection refinements)
- **What it does:** Rejects an empty body, bodies over 2000 chars, any HTML tags, javascript: URIs, and inline event handlers (onclick=, etc.), returning a specific error message.
- **Why needed:** Prevents the artist (or a malicious actor with their session) from injecting markup/script into outbound branded mail, and keeps emails plain-text safe; protects deliverability and recipients.
- **How it works:** templateBodySchema in booking-templates.ts is a zod string: .min(1,'Body is required').max(2000,'Max 2000 characters') plus three .refine() checks: no /<[^>]*>/ ('HTML tags are not allowed'), no /javascript:/i, no /on\w+\s*=/i ('Event handlers are not allowed'). saveTemplateAction returns parsed.error.issues[0].message on failure; the message renders in red above the textarea.
- **Source:** `apps/web/src/lib/email/booking-templates.ts:20`, `apps/web/src/app/(artist)/settings/emails/actions.ts:33`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:73`

### Per-template enable/disable toggle (switch)
- **What it does:** An accessible switch inside the editor that turns this specific email type on or off; when off, the textarea, reset link, and Save button are all disabled.
- **Why needed:** Lets an artist silence a particular notice (e.g. the rejection email, or their own new-request email) without deleting their custom copy.
- **How it works:** template-editor.tsx handleToggle flips local enabled state immediately (optimistic) and starts a transition calling toggleTemplateAction(type, next). The action loads profiles.settings, mutates a Set built from disabled_emails (delete on enable, add on disable), and writes settings.disabled_emails back, then revalidatePath('/settings/emails'). At send time send-booking-email.ts checks disabled.includes(type) and returns early, suppressing the email. role=switch with aria-checked for a11y.
- **Source:** `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:43`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:135`, `apps/web/src/app/(artist)/settings/emails/actions.ts:84`, `apps/web/src/app/(artist)/settings/emails/actions.ts:107`, `apps/web/src/lib/email/send-booking-email.ts:57`

### Reset to default (with inline confirm)
- **What it does:** For a customized template, shows a "Reset to default" link; clicking it swaps in an inline confirm ("Restore system default?" with "Yes, reset" / "Cancel"). Confirming deletes the saved row and reverts the editor to the shipped default copy.
- **Why needed:** If an artist mangles their copy or just wants Inklee's polished default back, they can undo all customization for that one email in two clicks.
- **How it works:** template-editor.tsx only shows the Reset link when isCustomised (body !== systemDefault) and not currently confirming and the template is enabled. setConfirmingReset(true) reveals the confirm; handleReset starts a transition calling resetTemplateAction(type) and sets body back to systemDefault. resetTemplateAction deletes from email_templates where artist_id+type, fires writeAudit('email_template_reset'), revalidatePath('/settings/emails'). "Resetting…" label shows during the pending transition.
- **Source:** `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:51`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:101`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:111`, `apps/web/src/app/(artist)/settings/emails/actions.ts:58`, `apps/web/src/app/(artist)/settings/emails/actions.ts:65`

### Save/Reset disabled-while-off and pending states
- **What it does:** Disables Save and Reset while the template is toggled off; shows a Spinner in the Save button while saving and "Resetting…" while resetting; disables toggle while its own request is in flight.
- **Why needed:** Prevents the artist from editing/saving an email they've intentionally switched off, and gives clear feedback that an action is processing so they don't double-submit.
- **How it works:** template-editor.tsx: Save button disabled={pending || !enabled} renders <Spinner/> when pending; Reset link disabled={resetting || !enabled}; toggle disabled={toggling}. pending comes from useActionState; toggling/resetting from useTransition.
- **Source:** `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:39`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:156`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:105`

### Save feedback messages (Saved / error)
- **What it does:** Shows a green "Saved." message on a successful save and a red error message (the validation/server message) on failure, above the textarea.
- **Why needed:** Confirms the change stuck (or explains exactly why it failed) so the artist trusts the email will go out as edited.
- **How it works:** template-editor.tsx renders from useActionState state: 'error' in state -> red state.error; 'success' in state -> green "Saved.". Errors include validation messages from zod and any Supabase error.message.
- **Source:** `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:73`, `apps/web/src/app/(artist)/settings/emails/template-editor.tsx:76`

### Customer: Booking received template
- **What it does:** The email the customer gets right after submitting a request, confirming receipt and giving placement/size/preferred-date plus a 30-day edit/cancel magic link.
- **Why needed:** Reassures the client their request landed and gives them a self-serve link, reducing back-and-forth DMs for the artist.
- **How it works:** type customer_booking_submitted, label 'Booking received (to customer)', subject 'Booking request received'. Default body lives in DEFAULT_BODIES. At send, send-booking-email.ts applies CTA label 'View my request' and renders via buildEmailHtml.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:13`, `apps/web/src/lib/email/booking-templates.ts:72`, `apps/web/src/lib/email/booking-templates.ts:121`, `apps/web/src/lib/email/send-booking-email.ts:23`

### Customer: Booking approved template
- **What it does:** The email sent when the artist Accepts the request, confirming the date and including the cancel magic link, plus optional goods and studio blocks.
- **Why needed:** Tells the client they're booked and where to come, and surfaces any goods decisions the artist made on accept.
- **How it works:** type customer_booking_approved, subject 'Your booking has been accepted', CTA 'View my booking'. buildEmailHtml additionally renders goodsDecisions ('About your goods', available vs declined with notes) and the studio 'Where to come' block when passed.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:17`, `apps/web/src/lib/email/booking-templates.ts:85`, `apps/web/src/lib/email/booking-templates.ts:191`, `apps/web/src/lib/email/booking-templates.ts:218`

### Customer: Booking rejected template
- **What it does:** The email sent when the artist Passes on a request, politely declining and inviting a future request. No magic link.
- **Why needed:** Lets the artist decline gracefully and consistently without writing an awkward DM each time.
- **How it works:** type customer_booking_rejected, label 'Booking rejected (to customer)', subject 'About your booking request'. Default body has no URL so no CTA button renders; CTA_LABELS has no entry for this type.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:21`, `apps/web/src/lib/email/booking-templates.ts:98`, `apps/web/src/lib/email/send-booking-email.ts:22`

### Customer: You cancelled template
- **What it does:** The email sent when the artist cancels an already-existing booking, informing the client and pointing them to Instagram for questions.
- **Why needed:** Covers the artist-initiated cancellation case (illness, scheduling) with clear, branded copy.
- **How it works:** type customer_booking_cancelled_by_artist, label 'You cancelled (to customer)', subject 'Your booking has been cancelled'. No magic link / CTA.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:25`, `apps/web/src/lib/email/booking-templates.ts:104`

### Artist: New request notification template
- **What it does:** The email sent to the artist themselves when a new booking request arrives, summarizing handle/placement/size/date with a link to Bookings.
- **Why needed:** Alerts the artist to act on new requests even when they're not in the app; the only self-addressed template here.
- **How it works:** type artist_new_booking_request, label 'New request (to you)', subject 'New booking request from {{customer_handle}}' (subject itself uses a variable). CTA 'Open bookings'. send-booking-email.ts falls back customer_handle to 'a new client' for non-customer types so it never renders a bare '@'.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:29`, `apps/web/src/lib/email/booking-templates.ts:110`, `apps/web/src/lib/email/booking-templates.ts:125`, `apps/web/src/lib/email/send-booking-email.ts:76`

### Branded email shell (rendered around every body)
- **What it does:** Wraps the artist's body in a consistent HTML shell: hosted Inklee PNG logo header, white rounded card, and a footer tagline; this is the visual chrome the artist's copy renders inside.
- **Why needed:** Guarantees every email looks professional and on-brand regardless of what the artist types, and renders reliably across Gmail/Outlook (PNG logo, table layout, inline styles).
- **How it works:** renderEmailShell() in layout.ts builds the full document with logoUrl from NEXT_PUBLIC_APP_URL + /branding/logos/inklee-email-logo.png, drops contentHtml into the card, and prints the footer (default tagline or an override). buildEmailHtml wraps the rendered body in a <p white-space:pre-line> and calls renderEmailShell.
- **Source:** `apps/web/src/lib/email/layout.ts:15`, `apps/web/src/lib/email/layout.ts:22`, `apps/web/src/lib/email/booking-templates.ts:232`

### Automatic CTA-button rendering for link lines
- **What it does:** Any standalone http(s) URL line in the body (e.g. the {{magic_link}} line) is auto-rendered as a tappable mustard rounded button plus the raw link beneath it.
- **Why needed:** The artist just pastes/keeps the magic link on its own line and gets a polished, accessible call-to-action without knowing HTML, and the raw link still works in clients that strip styled buttons.
- **How it works:** renderBody() splits the substituted body on newlines; lines matching /^https?:\/\/\S+$/ become ctaButton(url, ctaLabel) (button + 'Or paste this link...' + raw link), everything else is escapeHtml'd. ctaLabel is per-type (CTA_LABELS) defaulting to 'View details'.
- **Source:** `apps/web/src/lib/email/booking-templates.ts:131`, `apps/web/src/lib/email/booking-templates.ts:139`, `apps/web/src/lib/email/send-booking-email.ts:22`

### Variable substitution + safe fallbacks at send time
- **What it does:** Replaces {{var}} placeholders in the saved/default body and subject with real booking values; unknown placeholders are blanked (with a server warning); a missing customer_handle falls back to 'there' (customer mail) or 'a new client' (artist mail).
- **Why needed:** Makes the artist's template personalize correctly for each booking and prevents broken-looking emails ('Hi ,' or '@') when a client only provided Instagram or email.
- **How it works:** substituteVars() in booking-templates.ts regex-replaces {{(\w+)}} against ALLOWED_VARS. send-booking-email.ts computes displayVars with the handle fallback, then substitutes both subject and body and calls buildEmailHtml.
- **Source:** `apps/web/src/lib/email/booking-templates.ts:59`, `apps/web/src/lib/email/send-booking-email.ts:70`, `apps/web/src/lib/email/send-booking-email.ts:82`

### Custom-answer + studio + goods append blocks
- **What it does:** Beyond the artist's body, the renderer can append an 'Additional details' list (custom intake answers), an 'About your goods' section, and a 'Where to come' studio block with an optional Google Maps link.
- **Why needed:** The artist's editable copy stays short while Inklee automatically appends booking-specific specifics (answers, reserved goods, studio address) so clients get everything in one email.
- **How it works:** buildEmailHtml opts: customAnswers -> escaped label:value lines; goodsDecisions -> available 'ready for pickup' + declined 'not available' with notes; studio -> name/address + sanitizeHrefForEmail(mapsUrl) which only allows http(s) URLs and escapes for the href. Driven by send-booking-email.ts passing studio/goodsDecisions/customAnswers.
- **Source:** `apps/web/src/lib/email/booking-templates.ts:181`, `apps/web/src/lib/email/booking-templates.ts:191`, `apps/web/src/lib/email/booking-templates.ts:218`, `apps/web/src/lib/email/booking-templates.ts:46`

### Reminders: Deposit overdue toggle
- **What it does:** A switch that enables/disables the automated 'deposit overdue' reminder sent to client and artist when a deposit is past due.
- **Why needed:** Automates chasing unpaid deposits so the artist doesn't have to track due dates manually, while letting them turn it off if undesired.
- **How it works:** reminders-form.tsx keeps deposit_overdue_enabled in local state with a hidden input value=String(...); the switch toggles it. On submit, saveReminderSettingsAction reads deposit_overdue_enabled === 'true' and writes it into profiles.settings.reminder_settings. revalidatePath('/settings/emails').
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:34`, `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:42`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:60`

### Reminders: Appointment reminder toggle + days-before
- **What it does:** A switch to enable the pre-appointment reminder, and (when on) a numeric input for how many days before the appointment to send it.
- **Why needed:** Reduces no-shows by nudging clients before their session, with the artist controlling the lead time.
- **How it works:** reminders-form.tsx: appointment_reminder_enabled switch; conditional number input appointment_reminder_days (min 1, max 14, defaults to 3 on bad input). saveReminderSettingsAction clamps with Math.min(14, Math.max(1, parseInt||3)). parseReminderSettings also validates the stored value to the 1–14 range on read.
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:60`, `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:94`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:63`, `apps/web/src/lib/reminder-settings.ts:29`

### Reminders: Reconfirmation request toggle + days-before
- **What it does:** A switch to enable a 'still coming?' reconfirmation email (with a fresh cancel link), and (when on) a numeric days-before input.
- **Why needed:** Lets the artist free up slots in advance by asking clients to reconfirm far-out bookings, again with artist-controlled timing.
- **How it works:** reminders-form.tsx: reconfirmation_enabled switch; conditional number input reconfirmation_days (min 3, max 30, defaults 14). saveReminderSettingsAction clamps Math.min(30, Math.max(3, parseInt||14)). The reconfirmation email itself rotates the booking's customer_token_hash so a new magic link is issued (see manual send path).
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:115`, `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:150`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:70`, `apps/web/src/lib/reminder-settings.ts:39`

### Reminders: Save action with Saved/error feedback
- **What it does:** Saves all three reminder settings at once; shows a Spinner while pending, then 'Saved.' or a red error.
- **Why needed:** Commits the artist's reminder preferences/timings in one action so the automated jobs use them.
- **How it works:** reminders-form.tsx form action -> saveReminderSettingsAction. The action loads current profiles.settings, builds a fully-validated ReminderSettings object, and merges it under settings.reminder_settings with updated_at; on Supabase error returns error.message.toLowerCase(). page.tsx seeds the form via parseReminderSettings(settings.reminder_settings).
- **Source:** `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:15`, `apps/web/src/app/(artist)/settings/reminders/reminders-form.tsx:178`, `apps/web/src/app/(artist)/settings/reminders/actions.ts:42`, `apps/web/src/app/(artist)/settings/emails/page.tsx:59`

### Page header + section descriptions / empty-of-config guidance
- **What it does:** Shows the 'Emails' title with the sub-copy 'Customize email templates and configure automated reminders.', and two section headers ('Email templates' / 'Reminders') each with helper text ('Click a template to edit its content.', 'Choose when automated emails go out to clients.').
- **Why needed:** Orients the artist to what the page does and how to start (click a card), serving as the page's onboarding/empty guidance since there is no separate empty state.
- **How it works:** Static JSX in page.tsx; copy follows the project's sentence-case, no-em-dash rules.
- **Source:** `apps/web/src/app/(artist)/settings/emails/page.tsx:70`, `apps/web/src/app/(artist)/settings/emails/page.tsx:81`, `apps/web/src/app/(artist)/settings/emails/page.tsx:96`

### Settings nav entry "Emails"
- **What it does:** Adds an 'Emails' item to the settings navigation that routes to /settings/emails (shown via SettingsNav on mobile; the sidebar on desktop).
- **Why needed:** Provides discoverable navigation to this surface from anywhere in settings.
- **How it works:** components/settings-nav.tsx ITEMS includes { label: 'Emails', href: '/settings/emails' }, rendered by SectionNav. settings/layout.tsx shows SettingsNav on md:hidden.
- **Source:** `apps/web/src/components/settings-nav.tsx:6`, `apps/web/src/app/(artist)/settings/layout.tsx:11`

### Legacy /settings/templates redirect
- **What it does:** The old /settings/templates route immediately redirects to /settings/emails.
- **Why needed:** Preserves any old links/bookmarks to the templates page after the surface was consolidated under Emails, so artists never hit a dead page.
- **How it works:** settings/templates/page.tsx is a server component that calls redirect('/settings/emails'). The directory still contains an older actions.ts and template-editor.tsx (an earlier copy without reset/audit), but they are not reachable through this redirecting page.
- **Source:** `apps/web/src/app/(artist)/settings/templates/page.tsx:1`, `apps/web/src/app/(artist)/settings/templates/actions.ts:19`, `apps/web/src/app/(artist)/settings/templates/template-editor.tsx:15`

### Audit logging of template edits/resets
- **What it does:** Records an audit-log entry when a template is saved (email_template_edited) or reset (email_template_reset), tagged with the template type.
- **Why needed:** Gives the artist (and support) a trail of who changed which outbound email and when, important for trust/compliance on customer communications.
- **How it works:** saveTemplateAction and resetTemplateAction call writeAudit({ action, actor: user.id, category: 'settings', details: { template_type: type } }) (fire-and-forget via void). Note the toggle on/off action does NOT write an audit entry.
- **Source:** `apps/web/src/app/(artist)/settings/emails/actions.ts:47`, `apps/web/src/app/(artist)/settings/emails/actions.ts:73`

### Auth/ownership guard on all template actions
- **What it does:** Every server action verifies an authenticated user and scopes all reads/writes to that artist's own rows.
- **Why needed:** Ensures one artist can never view or edit another artist's email templates or disabled-emails settings.
- **How it works:** saveTemplateAction / resetTemplateAction / toggleTemplateAction each call supabase.auth.getUser() and return { error: 'Not authenticated.' } if absent; all queries filter by artist_id = user.id / id = user.id. The upsert uses onConflict (artist_id,type) so saves are per-artist.
- **Source:** `apps/web/src/app/(artist)/settings/emails/actions.ts:24`, `apps/web/src/app/(artist)/settings/emails/actions.ts:62`, `apps/web/src/app/(artist)/settings/emails/actions.ts:88`

**Notes:** Key subtleties: (1) The subject line is NOT editable on this surface — it is read-only in the UI and forced server-side to DEFAULT_SUBJECTS[type] (or 'inklee') on every save, so artists can only edit bodies, not subjects. (2) There is NO preview, test-send, or send-to-myself feature anywhere on this surface; artists cannot see the rendered branded email before it goes out. (3) Toggling a template off does not delete the saved custom body, and the off-state suppresses send via disabled_emails in send-booking-email.ts; turning it back on restores the prior custom copy. (4) The toggle action is the one mutation here that is NOT audit-logged (save and reset are). (5) /settings/templates is a pure redirect to /settings/emails; the templates/ directory still ships an older actions.ts + template-editor.tsx (missing the reset-to-default control and the audit writeAudit calls) that are effectively dead code now. (6) Reminder settings live on the same page but are persisted under profiles.settings.reminder_settings via a different action (reminders/actions.ts), and are read back through parseReminderSettings which independently re-validates the day ranges (appointment 1–14, reconfirmation 3–30) on every load, so a tampered stored value is clamped/ignored. (7) Defaults: deposit overdue on, appointment reminder on at 3 days, reconfirmation on at 14 days. (8) Several other transactional emails (waitlist, deposit requested/paid/receipt, goods order, customer-cancellation notice to artist) are built from the same shell but are NOT artist-customisable and do not appear on this surface. (9) Anti-injection is layered: zod refines block HTML/js/event-handlers at write time, escapeHtml escapes at render time, and sanitizeHrefForEmail guards the only free-text URL (studio maps link). (10) The over-2000 counter only colors red client-side; the hard stop is the server zod .max(2000).


---

## 15. Settings: payouts (Stripe Connect / KYC)

This is the artist-facing Payouts settings page, the single surface where a tattoo artist sets up and manages getting paid for card deposits taken through Inklee. It runs on Stripe Connect Custom accounts (Slice 79): the artist completes all identity/KYC entirely inside Inklee (an in-app form, never a Stripe-hosted redirect), and that data is forwarded straight to Stripe and never stored in an Inklee table. The page shows a live connection-status card (Not connected / Onboarding in progress / Connected / Action needed / Disabled), surfaces exactly which KYC items Stripe still needs, renders an in-app KYC form (name, DOB, email, phone, address, IBAN, plus a one-time country picker), and a Refresh status button that re-syncs the account from Stripe while verification is pending. It also explains the economics: payouts are optional and reversible, each deposit lands in the artist's own bank account, and Inklee deducts a flat 3% processing fee. The workflows supported are: first-time onboarding, fixing a restricted/pending account by re-submitting missing fields, checking verification progress, and reading payout capability flags (charges enabled, payouts enabled, country, last synced). Status also changes passively via Stripe webhooks (account.updated, account.application.deauthorized). The page is auth-gated by the (artist) layout (redirect to /login if not signed in) and is noindexed.

### Connection status card (5-state badge + label + description)
- **What it does:** Shows the artist's current Stripe Connect account state as a colored pill plus a one-line label and a longer explanatory paragraph. Five states: unset='Not connected' (grey), pending='Onboarding in progress' (amber), active='Connected' (emerald), restricted='Action needed' (orange), disabled='Disabled by Stripe' (red/destructive).
- **Why needed:** An artist needs an at-a-glance answer to 'can my clients pay deposits by card right now, or do I still have to do something?' The descriptions tell them the exact next action (e.g. update details, or use Refresh status).
- **How it works:** Server component reads profiles.stripe_account_status for the signed-in user via supabase.auth.getUser(). Raw value is validated with isConnectStatus(); anything unrecognized falls back to 'unset'. STATUS_LABEL/STATUS_DESCRIPTION maps drive the copy; PLATFORM_FEE_PERCENT (3) is interpolated into the fee copy. StatusBadge() picks the tone class per status. No action; pure render from persisted state.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/page.tsx:11`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:19`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:44`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:80`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:146`, `apps/web/src/lib/stripe-connect.ts:37`

### Account capability details panel (Country / Charges enabled / Payouts enabled / Last synced)
- **What it does:** For accounts in active, restricted, or disabled state (and only when an account id exists), renders a definition-list of: Country (uppercased ISO code), Charges enabled (Yes/No), Payouts enabled (Yes/No), and Last synced (localized timestamp).
- **Why needed:** Lets the artist verify the concrete payout capabilities Stripe granted — confirming card charges and bank payouts are actually turned on, in which country/currency, and how fresh the data is — without leaving Inklee.
- **How it works:** Reads stripe_account_country, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_updated_at from the profile. chargesEnabled/payoutsEnabled are coerced to booleans; country is .toUpperCase()'d; updatedAt is rendered via new Date(updatedAt).toLocaleString(). Hidden for unset/pending or when accountId is null. Each field is individually conditional (country and last-synced only render if present).
- **Source:** `apps/web/src/app/(artist)/settings/payouts/page.tsx:49`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:87`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:91`

### Outstanding-requirements list ('Stripe still needs:')
- **What it does:** When the account is pending or restricted, shows a bulleted, de-duplicated, human-readable list of exactly which KYC items Stripe still requires (e.g. 'Date of birth', 'A photo of your ID document', 'Bank account (IBAN) for payouts').
- **Why needed:** Because this is Custom Connect, the artist never visits Stripe, so the only way they can finish onboarding is if Inklee tells them precisely what is missing. This makes a stuck account self-serviceable.
- **How it works:** On page load, page.tsx calls getConnectRequirements(accountId) only when status is pending or restricted; that does a read-only stripe.accounts.retrieve and returns requirements.currently_due (empty array on any error, never throws). The array is passed into ConnectKycForm as requirementsDue and run through describeRequirements(), which maps Stripe field codes to friendly labels via REQUIREMENT_LABELS, humanises unknown codes (strip namespace, replace underscores), and de-dupes (several DOB/ToS codes collapse to one label). After a submit, the fresh currently_due returned by the action replaces the load-time list.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/page.tsx:56`, `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:79`, `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:85`, `apps/web/src/lib/stripe-connect.ts:316`, `packages/shared/src/connect-requirements.ts:9`, `packages/shared/src/connect-requirements.ts:47`

### Country picker (one-time, account-creation only)
- **What it does:** A <select> of ~33 supported countries (EEA + GB, CH, US, CA, AU), defaulting to Germany, shown only for an unset account. Includes helper copy 'Where you are based. This can't be changed once set.'
- **Why needed:** A Stripe connected account's country is fixed at creation and determines payout currency (e.g. EUR vs GBP vs PLN). Defaulting to the platform country surfaced as US in the sandbox, wrong for EU artists, so the artist must choose up front.
- **How it works:** Options come from CONNECT_COUNTRIES; defaultValue is DEFAULT_CONNECT_COUNTRY ('DE'). Only rendered when status==='unset'. On submit, the action validates the chosen code with isSupportedConnectCountry(); if invalid it falls back to an existing profile country (on re-submit) or DEFAULT_CONNECT_COUNTRY. The country is passed to ensureConnectAccount/createConnectAccount where stripe.accounts.create locks it. payoutCurrencyForCountry() derives the bank-account currency (NON_EUR_CURRENCY map; everything else EUR).
- **Source:** `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:97`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:66`, `packages/shared/src/connect-countries.ts:11`, `packages/shared/src/connect-countries.ts:48`, `packages/shared/src/connect-countries.ts:52`, `packages/shared/src/connect-countries.ts:74`

### In-app KYC form fields (first name, last name, DOB, email, phone, address line 1, city, postal code, IBAN)
- **What it does:** The full identity/bank-detail form the artist fills inside Inklee: First name, Last name, Date of birth (native date input), Email (prefilled with the account email), Phone (tel, '+49…' placeholder), Address (street + number), City, Postal code, and IBAN (with a formatted placeholder). All inputs are HTML required and carry autoComplete hints.
- **Why needed:** Stripe requires this KYC to verify the artist as an individual before it will enable card charges and bank payouts. Collecting it in-app (not a Stripe redirect) keeps the artist inside Inklee and is the core of the Custom Connect onboarding.
- **How it works:** Rendered by the reusable Field component (label + required <input>) plus a native <input type=date> for DOB and an email<->/tel typed inputs. Submitting fires submitConnectKycAction via useActionState. The action trims each field, splits DOB 'YYYY-MM-DD' into integer day/month/year, strips whitespace from the IBAN, and uses the typed KYC email or falls back to the account email. PII is forwarded to Stripe via updateConnectKyc (stripe.accounts.update with individual{}, business_profile{ mcc:7299, url }, external_account bank_account, tos_acceptance) and is never written to any Inklee table or logged. The form is only shown when status is unset/pending/restricted (hidden for active/disabled).
- **Source:** `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:21`, `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:120`, `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:125`, `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:149`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:81`, `apps/web/src/lib/stripe-connect.ts:250`

### Submit button — 'Set up payouts' / 'Update details' (create-or-update KYC)
- **What it does:** The form's primary action. Label is 'Set up payouts' when unset, 'Update details' when re-submitting a pending/restricted account, and 'Saving…' (disabled) while in flight. Creates the Connect account on first submit and forwards KYC to Stripe; on re-submit it reuses the same account to clear outstanding requirements.
- **Why needed:** This is the one button that actually starts payouts and the one the artist returns to in order to fix a restricted/pending account by supplying whatever Stripe still needs.
- **How it works:** Calls submitConnectKycAction(prev, formData). Flow: getUser (else 'Not authenticated.'); rate-limit check checkConnectKycRateLimit(user.id) (10/hour) returning 'Too many attempts…' if exceeded; require an email; read profile (stripe_account_id, stripe_account_country, slug); resolve country (submitted > existing > default); ensureConnectAccount creates a Custom account (controller.requirement_collection=application, stripe_dashboard.none, losses+fees=application, business_type individual, card_payments+transfers requested, idempotencyKey connect-create-<userId>) and persists id/status; presence-check all fields (else 'Please fill in every field.'); compute business_profile.url from publicArtistUrl(slug), falling back to https://inkl.ee in local dev (Stripe rejects non-https); capture client IP for tos_acceptance.ip; call updateConnectKyc (accounts.update then accounts.retrieve then persist derived status); on success revalidatePath('/settings/payouts') and return {ok, status, requirementsDue}. Idempotent re-submit reuses the same account.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:176`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:37`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:73`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:112`, `apps/web/src/lib/stripe-connect.ts:153`, `apps/web/src/lib/stripe-connect.ts:211`

### Post-submit result message (verified / still-needed / verifying)
- **What it does:** After a successful submit shows one of three messages: active => 'You're verified. Deposits can now be paid by card.'; still has requirements => 'Saved. Stripe still needs the items listed above. Add them and submit again, or use Refresh status to recheck.'; otherwise => 'Saved. Stripe is verifying your details. Check back shortly with Refresh status.'
- **Why needed:** Closes the loop after the artist submits so they know whether they're done, blocked on more fields, or just waiting on Stripe's review.
- **How it works:** Reads the action's returned state ({ok:true, status, requirementsDue}). Branches on state.status==='active' and state.requirementsDue.length. The requirements list above the message is simultaneously refreshed from the same requirementsDue.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:191`

### Inline form error message
- **What it does:** Renders the server action's error string in destructive-colored text below the submit button (e.g. 'Please fill in every field.', 'Too many attempts. Please try again in a little while.', 'Your account needs an email before setting up payouts.', or a Stripe-originated message like 'Could not save your payout details.').
- **Why needed:** Tells the artist precisely why a submit failed (validation, rate limit, missing email, or Stripe rejection) so they can correct it.
- **How it works:** If the action returns {error}, the form shows state.error. Errors deliberately surface Stripe's own message string and never echo back the submitted PII (H-1/H-2 privacy guard in updateConnectKyc/stripeMessage).
- **Source:** `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:188`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:45`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:109`, `apps/web/src/lib/stripe-connect.ts:445`

### Refresh status button (re-sync account from Stripe)
- **What it does:** A button (RefreshCcw icon, spins while pending) labeled 'Refresh status' / 'Checking with Stripe…' that re-fetches the Connect account from Stripe and persists the freshly derived status, then shows 'Status is now <status>.' Only rendered when the artist already has a Connect account.
- **Why needed:** After submitting KYC the account is often in pending while Stripe verifies; this lets the artist poll for the result without waiting on a webhook or reloading the dashboard, and confirm when they flip to active.
- **How it works:** PayoutsControls receives only a boolean hasAccount (the raw acct_ id is intentionally never serialized to the client) and returns null when false. Submitting fires syncConnectAccountAction: getUser; read stripe_account_id + stripe_account_status; guard H-4 returns 'No payout account to refresh yet.' if no id or status==='unset' (deauthorized accounts) so Stripe isn't called for an account we don't control; otherwise syncConnectAccount does stripe.accounts.retrieve + persistConnectAccount (writes status, charges/payouts enabled, country, updated_at via service client); revalidatePath('/settings/payouts'); returns {ok, status}.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/payouts-controls.tsx:15`, `apps/web/src/app/(artist)/settings/payouts/payouts-controls.tsx:29`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:155`, `apps/web/src/lib/stripe-connect.ts:333`, `apps/web/src/lib/stripe-connect.ts:379`

### Refresh-status result / error message
- **What it does:** Below the Refresh button, shows 'Status is now <status>.' on success or the error string in destructive text on failure (e.g. 'No payout account to refresh yet.', or a Stripe error 'Could not refresh account status.').
- **Why needed:** Gives immediate feedback on the re-sync so the artist knows whether the status changed and whether the call succeeded.
- **How it works:** Reads syncState from useActionState; renders state.status on ok and state.error otherwise.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/payouts-controls.tsx:42`

### Set-up / Your-details card heading + privacy reassurance
- **What it does:** Wraps the KYC form in a card titled 'Set up payouts' (unset) or 'Your details' (re-submit), with subtext 'You complete this here. Your details go straight to Stripe for verification and are not stored by Inklee.' Hidden when status is active or disabled.
- **Why needed:** Reassures a privacy-conscious artist that their identity and bank data isn't being warehoused by Inklee, lowering friction on a sensitive form, and frames re-submission for fixing a restricted account.
- **How it works:** Conditional block status!=='active' && status!=='disabled'. Heading copy switches on status==='unset'. Pure render.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/page.tsx:118`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:120`

### Stripe Connected Account Agreement / ToS acceptance
- **What it does:** Static copy under the form: 'By submitting, you agree to the Stripe Connected Account Agreement. Inklee passes these details to Stripe to verify you and pay out deposits; we do not store them.' Submitting the form is the act of acceptance.
- **Why needed:** Stripe requires explicit ToS acceptance (with date + IP) to enable a connected account; the artist must agree before payouts can be enabled.
- **How it works:** On submit, updateConnectKyc sets tos_acceptance { date: now (unix seconds), ip: tosIp }, where tosIp comes from getClientIp(headers()) (leftmost x-forwarded-for entry, trimmed, 'unknown' fallback). The requirements 'tos_acceptance.date'/'tos_acceptance.ip' map to the friendly label 'Acceptance of the Stripe agreement'.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/connect-kyc-form.tsx:170`, `apps/web/src/app/(artist)/settings/payouts/actions.ts:112`, `apps/web/src/lib/stripe-connect.ts:284`, `apps/web/src/lib/get-client-ip.ts:12`

### Page intro + optionality / fee explainer copy
- **What it does:** Page header 'Payouts' plus an intro paragraph and a closing paragraph stressing setup is optional and reversible, each deposit lands in the artist's own account, a 3% processing fee (card processing included) is deducted, and that without it the artist can still collect deposits manually.
- **Why needed:** Sets correct expectations: the artist understands they aren't forced onto Inklee's card rail, exactly what the fee is, and that Inklee never holds their money.
- **How it works:** Static copy with PLATFORM_FEE_PERCENT (3, from PLATFORM_FEE_BPS=300) interpolated in three places (intro, status descriptions, footer). Pure render.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/page.tsx:63`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:137`, `packages/shared/src/platform-fee.ts:33`, `packages/shared/src/platform-fee.ts:36`

### 'Not connected' empty state
- **What it does:** For a brand-new (unset) account the page shows the grey 'Not connected' badge, the optionality description, no details panel, the 'Set up payouts' card with the country picker + KYC form, and no Refresh button (since no account exists yet).
- **Why needed:** Gives a clear zero-state path: an artist who has never set up payouts sees exactly one call to action (set up) and no confusing capability flags.
- **How it works:** Driven by status==='unset' and accountId===null. The details panel (active/restricted/disabled only) and PayoutsControls (hasAccount=false => returns null) are both suppressed.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/page.tsx:44`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:135`, `apps/web/src/app/(artist)/settings/payouts/payouts-controls.tsx:25`

### Disabled-account terminal state
- **What it does:** When Stripe has disabled the account, shows the red 'Disabled by Stripe' badge with 'Stripe disabled this account. Contact Stripe support for next steps.', the details panel, but hides the KYC form (no self-serve fix available).
- **Why needed:** An artist with a rejected/disabled account needs to know there's nothing they can resubmit in-app and that the resolution path is Stripe support, not Inklee.
- **How it works:** deriveConnectStatus returns 'disabled' when account.disabled_reason is set or requirements.disabled_reason starts with 'rejected'. page.tsx hides the form for active/disabled; the details panel still renders for disabled.
- **Source:** `apps/web/src/app/(artist)/settings/payouts/page.tsx:26`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:118`, `apps/web/src/lib/stripe-connect.ts:78`

### Auth gating + noindex on the surface
- **What it does:** Requires a signed-in artist; unauthenticated visitors are redirected to /login. The whole (artist) area is marked robots noindex/nofollow.
- **Why needed:** Payouts contains sensitive financial state and a KYC form; it must be reachable only by the authenticated artist and must never be indexed by search engines.
- **How it works:** The (artist) layout calls supabase.auth.getUser() and redirect('/login') when no user; metadata.robots index:false, follow:false. The page itself also reads user!.id directly, relying on the layout gate.
- **Source:** `apps/web/src/app/(artist)/layout.tsx:11`, `apps/web/src/app/(artist)/layout.tsx:25`, `apps/web/src/app/(artist)/settings/payouts/page.tsx:41`

### Settings sub-navigation entry ('Payouts')
- **What it does:** The Payouts tab/link within the settings section navigation (mobile sub-nav strip and desktop sidebar) that routes the artist to /settings/payouts; the active item gets a mustard underline.
- **Why needed:** It's how an artist actually finds and lands on this surface from the rest of their settings.
- **How it works:** SettingsNav lists { label:'Payouts', href:'/settings/payouts' } in ITEMS, rendered by SectionNav (active state via isActiveItem against the pathname). The settings layout shows this strip on mobile; desktop reaches it via the sidebar. /settings (index) redirects to /settings/profile.
- **Source:** `apps/web/src/components/settings-nav.tsx:3`, `apps/web/src/components/section-nav.tsx:31`, `apps/web/src/app/(artist)/settings/layout.tsx:8`, `apps/web/src/app/(artist)/settings/page.tsx:3`

### Passive status sync via Stripe webhooks
- **What it does:** The displayed status, capability flags, country, and last-synced timestamp can update without the artist clicking anything, driven by Stripe's account.updated webhook (re-derives + persists state) and account.application.deauthorized (artist disconnected Inklee from their Stripe dashboard => status reset to 'unset', charges/payouts false, but account id retained for history).
- **Why needed:** Stripe verifies asynchronously; the webhook means an artist who comes back later sees the correct status even if they never hit Refresh, and a disconnection is reflected so Inklee stops routing charges through an account it no longer controls.
- **How it works:** POST /api/stripe/webhook verifies the signature, then for account.updated calls persistConnectAccountFromEvent (looks up the artist by stripe_account_id, persists deriveConnectStatus + flags), and for account.application.deauthorized calls clearConnectAccountByExternalId (resets status to unset, charges/payouts false, keeps stripe_account_id). The Refresh button's H-4 guard relies on this id-retained-but-status-unset state.
- **Source:** `apps/web/src/app/api/stripe/webhook/route.ts:57`, `apps/web/src/app/api/stripe/webhook/route.ts:72`, `apps/web/src/lib/stripe-connect.ts:360`, `apps/web/src/lib/stripe-connect.ts:419`

### Mobile connect-link bridge into this web page (in-app browser handoff)
- **What it does:** Not a web button on this page, but a related convenience: the native app can mint a single-use magic link that signs the artist into a web session inside an in-app browser and lands them on /settings/payouts (this surface), where they complete KYC in the existing web form. The native app also exposes a read-only payouts status GET and a Refresh-status POST that reuse the same backend.
- **Why needed:** Keeps KYC PII out of any native JSON body (a deliberate plan risk-register decision) by always typing it into this web form; the artist gets one consistent KYC surface across web and mobile.
- **How it works:** POST /api/mobile/settings/connect-link mints a Supabase magiclink (generateLink) for the already-authenticated mobile user, builds an /auth/confirm URL with next allowlisted via resolveConnectNext (defaults to /settings/payouts; CONNECT_LINK_ALLOWED_NEXT prevents open redirect), and is rate-limited by the same checkConnectKycRateLimit. GET/POST /api/mobile/settings/payouts return MobilePayouts (status, chargesEnabled, payoutsEnabled, country) and re-run syncConnectAccount with the same H-4 'no_account' guard.
- **Source:** `apps/web/src/app/api/mobile/settings/connect-link/route.ts:25`, `apps/web/src/app/api/mobile/settings/payouts/route.ts:25`, `apps/web/src/app/api/mobile/settings/payouts/route.ts:42`, `apps/web/src/lib/mobile-settings.ts:215`

**Notes:** Validation specifics: the KYC form inputs are all HTML `required`, and the server action does its own presence check across first/last name, phone, address line1, city, postal code, IBAN, and integer DOB day/month/year (returns 'Please fill in every field.'). IBAN whitespace is stripped server-side; DOB is parsed from a native 'YYYY-MM-DD' date input; the KYC email defaults to the account email if blank. Country is the only field that is irreversible — fixed at account creation; on re-submit the form omits the picker entirely and the action reuses the stored country. Privacy is a load-bearing design point: name/DOB/address/phone/IBAN go straight to stripe.accounts.update and are never written to any Inklee table or logged; only derived status + capability booleans + country + updated_at are persisted (via the service-role client). Error messages surface Stripe's own message via stripeMessage() and never echo submitted PII. Security guards worth noting: PayoutsControls receives only a boolean hasAccount, never the raw acct_ id, so the account id is never serialized to the client; the Refresh action's H-4 guard refuses to call Stripe when there's no id or status==='unset' (avoids 403/404 leaking the id back to the UI). Rate limit: KYC submits and the mobile connect-link are capped at 10/artist/hour (checkConnectKycRateLimit); in production with Upstash unconfigured the limiter fails closed (denies). Economics: PLATFORM_FEE_BPS=300 (flat 3% all-in) under Custom Connect (controller fees.payer=application, so Stripe's processing fee is billed to Inklee's platform balance and the full 3% is the application_fee_amount). business_profile.url falls back to https://inkl.ee in local dev because Stripe rejects non-https URLs. The account is created with capabilities card_payments+transfers requested, business_type individual, mcc 7299 (miscellaneous personal services, closest fit for tattoo), idempotencyKey connect-create-<userId>. There is no explicit empty/loading skeleton inside the page beyond conditional rendering; the route relies on the (artist) loading.tsx. The page intentionally has no toggle to turn payouts off in-app — disconnection happens from the Stripe side (reflected via the deauthorized webhook).


---

## 16. Settings: account + security + onboarding

This surface bundles the artist's account-management hub (`/settings/account`), the GDPR/data flows that hang off it (JSON data export at `/settings/export`, self-service account deletion), the 2FA/security stack (TOTP enrol, recovery codes, the login-time MFA challenge at `/auth/mfa` plus its recover endpoint at `/api/auth/mfa/recover`), and the full 5-step onboarding wizard (`/onboarding/welcome → claim-slug → booking → availability → form → done`). The account page lets an artist edit their personal/display name, change their login email (double opt-in), change or recognise the absence of a password (Google-only accounts), enable/disable two-factor authentication with downloadable recovery codes, export all their data, and permanently delete the account behind a re-authentication + type-to-confirm gate. The onboarding wizard is what a brand-new artist hits the first time they have no profile: it claims their public booking-link slug, captures their public profile (artist name, Instagram, location, bio), picks a booking mode (preferred-date vs fixed-slots), sets books open/closed, configures default booking-form fields, optionally uploads a logo, and lands them on a "you're ready" recap with their shareable link. The proxy middleware enforces both the AAL2 MFA step-up and the "no profile → go to onboarding" redirect, so these surfaces are the gatekeepers between a fresh signup and the working app. Almost every mutation runs through a Next.js Server Action with server-side validation; deletion and MFA-recover additionally enforce server-side re-auth freshness and rate limiting respectively.

### Account page section overview
- **What it does:** Renders the artist's full account surface as stacked sections: Booking mode (read-only summary with a deep link), General (name + email), Security (password + sign out), Two-factor authentication, Data export, and Delete account.
- **Why needed:** Gives a tattoo artist one place to manage who they are, how they log in, and how their data leaves or is destroyed, separate from the booking-product settings.
- **How it works:** Server component loads the cookie-session user via supabase.auth.getUser(), reads profiles (first_name, last_name, display_name, booking_mode), derives hasPassword from user.identities (provider === 'email'), derives the oauthProvider for OAuth-only accounts, and calls supabase.auth.mfa.listFactors() to detect a verified TOTP factor. No writes; purely composes the child forms.
- **Source:** `apps/web/src/app/(artist)/settings/account/page.tsx:8-131`

### Booking-mode summary card (read-only) with deep link
- **What it does:** Shows whether the artist is on 'Fixed slots' or 'Preferred date' with a one-line explanation, plus an 'Edit in Books & Availability →' link.
- **Why needed:** Booking mode is a core operational choice; surfacing it here orients the artist but routes the actual edit to the canonical Books & Availability screen so the setting lives in one place.
- **How it works:** Reads profile.booking_mode; if 'fixed_slots' shows fixed-slots copy else preferred-date copy. The link is a static Next <Link href='/bookings/settings'>; the value is not editable on this page.
- **Source:** `apps/web/src/app/(artist)/settings/account/page.tsx:45-69`

### Edit first name / last name
- **What it does:** Lets the artist set or change their personal first and last name (both optional).
- **Why needed:** Internal identity for the artist's own records and any place first/last name is used; distinct from the public artist name.
- **How it works:** GeneralForm posts first_name/last_name to saveGeneralAction (useActionState). Action trims both, stores '' as null, updates profiles, sets updated_at, revalidates /settings/account and /dashboard. Returns {success:true} → 'Saved.' or {error}. Both fields optional.
- **Source:** `apps/web/src/app/(artist)/settings/account/general-form.tsx:33-104`, `apps/web/src/app/(artist)/settings/account/actions.ts:45-76`

### Edit artist (display) name — required
- **What it does:** Sets the public-facing name clients see on the booking page; marked required with an asterisk.
- **Why needed:** This is the artist's brand name on their public booking link, so it must always be present.
- **How it works:** display_name field (required attr client-side). saveGeneralAction trims and rejects empty with 'Artist name is required.'; on success writes display_name to profiles and revalidates /settings/account + /dashboard (so the dashboard greeting updates).
- **Source:** `apps/web/src/app/(artist)/settings/account/general-form.tsx:69-104`, `apps/web/src/app/(artist)/settings/account/actions.ts:55-75`

### Change login email (double opt-in)
- **What it does:** Lets the artist request a change to their account email; the change only takes effect after they confirm via a link sent to the NEW address.
- **Why needed:** Email is the login identifier and notification target; changing it safely (without locking themselves out) matters.
- **How it works:** A 'Change' button reveals an inline form (showEmailForm state). requestEmailChangeAction lowercases/trims new_email, validates with /^[^\s@]+@[^\s@]+\.[^\s@]+$/, rejects if equal to current email ('This is already your email.'), then calls supabase.auth.updateUser({email}). Success copy: 'Confirmation sent. Check your new email inbox.' Cancel button hides the form. Email does not change until the link is clicked.
- **Source:** `apps/web/src/app/(artist)/settings/account/general-form.tsx:106-174`, `apps/web/src/app/(artist)/settings/account/actions.ts:78-97`

### Change password (with current-password verification)
- **What it does:** Lets a password-based artist change their password after proving they know the current one.
- **Why needed:** Routine account hygiene; verifying the current password prevents a hijacked session from silently locking the owner out.
- **How it works:** SecurityForm posts current_password/new_password/confirm_password to changePasswordAction. Validates: all fields required; new >= 8 chars; new === confirm; new !== current. Re-verifies via supabase.auth.signInWithPassword (returns 'Current password is incorrect.' on failure), then supabase.auth.updateUser({password}). Writes an audit log entry action 'password_changed' (category auth). Success copy: 'Password updated.' Includes a 'Forgot current password?' link to /forgot-password.
- **Source:** `apps/web/src/app/(artist)/settings/account/security-form.tsx:20-101`, `apps/web/src/app/(artist)/settings/account/actions.ts:99-143`

### Google-only account: 'No password set' state
- **What it does:** For accounts that authenticate only via Google, replaces the password form with an explanatory panel.
- **Why needed:** Avoids confusing OAuth artists with a password form they can't use, and explains why.
- **How it works:** page.tsx derives hasPassword from identities; when false, SecurityForm renders the 'No password set / Your account uses Google sign-in.' panel instead of the change-password form.
- **Source:** `apps/web/src/app/(artist)/settings/account/security-form.tsx:102-110`, `apps/web/src/app/(artist)/settings/account/page.tsx:20-22`

### Sign out
- **What it does:** Ends the current session and returns the artist to the login screen.
- **Why needed:** Standard session control, e.g. on a shared studio machine.
- **How it works:** A form posts to logoutAction (imported from the signup actions): supabase.auth.signOut() then redirect('/login').
- **Source:** `apps/web/src/app/(artist)/settings/account/security-form.tsx:112-122`, `apps/web/src/app/(auth)/signup/actions.ts:56-60`

### Two-factor status indicator (On/Off)
- **What it does:** Shows whether TOTP 2FA is active with a colored On/Off pill and a one-line description.
- **Why needed:** At-a-glance confirmation of the account's security posture.
- **How it works:** page.tsx computes mfaEnabled from listFactors() (totp[0].status === 'verified') and passes isEnabled + factorId to TwoFactorSection. The 'idle' view shows green 'On' (active, code at each login) or muted 'Off'.
- **Source:** `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:282-321`, `apps/web/src/app/(artist)/settings/account/page.tsx:29-97`

### Enable 2FA — TOTP enrolment (QR + manual key)
- **What it does:** Starts authenticator-app enrolment: generates a QR code and a manual secret to add Inklee to Google Authenticator/Authy/1Password.
- **Why needed:** Lets an artist harden their account, which is holding client PII and money flows, against password theft.
- **How it works:** startEnroll() calls supabase.auth.mfa.enroll({factorType:'totp', friendlyName:'Inklee authenticator'}), stores qr_code/secret/factorId, moves to 'enrolling' step showing the QR image and 'Manual key:' secret. Errors surface inline. A Spinner shows while pending.
- **Source:** `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:49-70`, `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:185-242`

### Verify & activate 2FA (6-digit code)
- **What it does:** Confirms enrolment by entering the current 6-digit authenticator code.
- **Why needed:** Proves the authenticator was set up correctly before 2FA is enforced, preventing self-lockout.
- **How it works:** verifyEnroll() calls supabase.auth.mfa.challengeAndVerify({factorId, code}) (whitespace stripped). On error: 'Invalid code. Try again.' On success: generates 8 recovery codes, calls saveMfaRecoveryCodesAction, logs 2fa_enabled (method totp) via logAuthEventAction, advances to 'codes' step. Verify button disabled until 6 digits; input is numeric inputMode, maxLength 6, autocomplete one-time-code.
- **Source:** `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:72-93`, `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:205-239`

### Recovery codes generation + 'Save your recovery codes' step
- **What it does:** Shows 8 single-use 8-character recovery codes, a 'Copy all' button, and a mandatory confirmation checkbox before finishing.
- **Why needed:** Lets the artist regain access if they lose their authenticator device, which otherwise would lock them out of an account holding all their bookings.
- **How it works:** generateCodes() builds 8 codes from charset ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no ambiguous chars). Codes are SHA-256 hashed server-side by saveMfaRecoveryCodesAction and stored in profiles.settings.mfa_recovery_codes (service-role write, merged into existing settings). The 'I have saved my recovery codes' checkbox gates the 'Done. 2FA is active' button (disabled until checked). CopyButton copies all codes newline-joined.
- **Source:** `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:15-23`, `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:143-183`, `apps/web/src/app/(artist)/settings/account/actions.ts:158-192`

### Disable 2FA (re-prompt for current code)
- **What it does:** Turns off two-factor by requiring a current authenticator code, then unenrols the factor and clears recovery codes.
- **Why needed:** Lets the artist remove 2FA (e.g. switching devices) deliberately rather than accidentally.
- **How it works:** startDisable() → 'disabling' step with a focused 6-digit input. confirmDisable() runs challengeAndVerify (error: 'Invalid code. Try again.'), then supabase.auth.mfa.unenroll({factorId}), clearMfaRecoveryCodesAction (removes settings.mfa_recovery_codes via service role), logs 2fa_disabled, shows a 'disabled' confirmation with a 'Re-enable' link back to idle. Disable button styled destructive, disabled until 6 digits.
- **Source:** `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:95-141`, `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:244-279`, `apps/web/src/app/(artist)/settings/account/actions.ts:194-213`

### Client-side auth-event audit logging (logAuthEventAction)
- **What it does:** Records 2FA enable/disable events to the audit log even though the 2FA flow runs client-side via supabase-js.
- **Why needed:** Keeps a tamper-evident security trail of who turned 2FA on/off, useful for the artist and for support.
- **How it works:** logAuthEventAction(action, details) re-reads the cookie user server-side and calls writeAudit({action, actor:user.id, category:'auth', details}); invoked with '2fa_enabled' / '2fa_disabled'.
- **Source:** `apps/web/src/app/(artist)/settings/account/actions.ts:146-156`, `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:88-88`, `apps/web/src/app/(artist)/settings/account/two-factor-section.tsx:116-116`

### Login-time MFA challenge (TOTP) at /auth/mfa
- **What it does:** The screen shown at login when the account has verified TOTP but the session is only AAL1: enter the 6-digit code to step up.
- **Why needed:** Enforces 2FA at every login for artists who enabled it, protecting client data behind a second factor.
- **How it works:** proxy middleware redirects to /auth/mfa when getAuthenticatorAssuranceLevel() shows nextLevel aal2 / currentLevel aal1. handleTotp() lists factors, challenges, then verify({factorId, challengeId, code}); on success router.replace('/dashboard'); on error 'Invalid code — try again.' Submit disabled until 6 digits.
- **Source:** `apps/web/src/app/auth/mfa/page.tsx:25-100`, `apps/web/src/proxy.ts:94-105`

### Login-time recovery-code path (toggle + submit) + recover endpoint
- **What it does:** At the MFA challenge, lets a locked-out artist switch to 'Use a recovery code instead', submit one of their 8-char codes, and regain access (which unenrols TOTP back to AAL1).
- **Why needed:** Account-recovery safety net when the authenticator device is lost; without it a lost phone means a permanently locked account.
- **How it works:** MfaPage toggles mode totp↔recovery (clears code/error). submitRecovery posts {code} to POST /api/auth/mfa/recover. The route: requires auth (401 else); rate-limits 5/user/hour via checkMfaRecoverRateLimit (429 'Too many attempts. Try again later.'); validates 8-char code (400 'Invalid recovery code'); SHA-256 hashes and matches against profiles.settings.mfa_recovery_codes (400 'No recovery codes on file' / 'Invalid recovery code'); removes the used code; unenrols the TOTP factor; persists remaining codes; writes audit '2fa_recovery_code_used' with codes_remaining; returns {ok:true} → router.replace('/dashboard'). Input upper-cased, maxLength 8, submit disabled <8 chars.
- **Source:** `apps/web/src/app/auth/mfa/page.tsx:101-147`, `apps/web/src/app/auth/mfa/use-recovery-code.ts:9-30`, `apps/web/src/app/api/auth/mfa/recover/route.ts:17-104`, `apps/web/src/lib/ratelimit.ts:118-130`

### Data export (download all data as JSON)
- **What it does:** Downloads a single JSON file containing the artist's profile, all bookings, client notes, custom fields, and recent audit log.
- **Why needed:** GDPR Art.15/20 portability plus practical backup; lets a tattoo artist take their whole business record with them.
- **How it works:** An <a href='/settings/export' download> hits GET route.ts (runtime nodejs). Requires auth (401 else). In parallel selects profiles (slug/display_name/bio/location/instagram_handle/timezone/booking_mode/created_at), booking_requests (full booking + deposit fields, newest first), client_notes, custom_fields (active, not soft-deleted); then audit_log for those booking ids (last 500, newest first). Returns JSON with exported_at + artist{id,email,...profile} and arrays, Content-Disposition attachment filename inklee-export-YYYY-MM-DD.json.
- **Source:** `apps/web/src/app/(artist)/settings/account/page.tsx:100-117`, `apps/web/src/app/(artist)/settings/export/route.ts:6-74`

### Delete account — irreversible self-service deletion
- **What it does:** Permanently deletes the artist's Inklee account: booking history, client data, uploaded photos, public page, then signs them out and sends them to /login.
- **Why needed:** GDPR Art.17 right-to-erasure self-service; closes the web deletion gap so an artist can leave without contacting support.
- **How it works:** DeleteAccountSection calls deleteOwnAccountAction(confirm). Server: requires auth; requires confirm === 'DELETE'; requires isReauthFresh(last_sign_in_at) within a 5-min window (else 'For your security, sign in again and then delete your account.'). Then deleteOwnAccountCore(userId,{surface:'web'}) which: cancels live-unpaid Stripe PaymentIntents (transient ERROR + retry copy if Stripe unreachable or a cancel can't be confirmed); archives a pseudonymised 7-year financial record into deleted_account_records BEFORE the cascade; deletes the profiles row (the cascade trigger); purges 'logos' and 'bookings' storage by {userId}/ prefix; deletes the auth user; redacts surviving audit_log/admin_action_log detail blobs; deletes the person's mobile_waitlist row; writes an account_deleted tombstone. On success the client calls auth.signOut() and router.replace('/login'). Deletion is NEVER blocked on financial state.
- **Source:** `apps/web/src/app/(artist)/settings/account/delete-account-section.tsx:64-78`, `apps/web/src/app/(artist)/settings/account/actions.ts:20-43`, `apps/web/src/lib/server/account-deletion.ts:117-341`

### Delete account — password re-authentication gate
- **What it does:** For password accounts, requires re-entering the password ('Confirm') before the delete button is usable; shows 'Identity confirmed.' on success.
- **Why needed:** Prevents a walk-up attacker on an open session from destroying the artist's entire business with one click.
- **How it works:** reauth() calls supabase.auth.signInWithPassword({email,password}); on error 'Incorrect password.'; on success sets reauthed=true (which bumps last_sign_in_at so the server-side freshness check passes). reauthNeeded = hasPassword && !reauthed; canDelete also requires confirm === 'DELETE'.
- **Source:** `apps/web/src/app/(artist)/settings/account/delete-account-section.tsx:31-44`, `apps/web/src/app/(artist)/settings/account/delete-account-section.tsx:88-119`, `apps/web/src/lib/server/account-deletion.ts:37-45`

### Delete account — OAuth re-verify gate (Google/Apple)
- **What it does:** For OAuth-only accounts, offers 'Re-verify with {Provider}' which does a provider round-trip returning to /settings/account, satisfying the re-auth requirement.
- **Why needed:** Same anti-walk-up protection for artists who never set a password.
- **How it works:** reauthOAuth() calls supabase.auth.signInWithOAuth({provider, options:{redirectTo: origin + '/auth/callback?next=/settings/account'}}). The callback honours ?next and the real sign-in bumps last_sign_in_at; state is not preserved across redirect, so the user returns, types DELETE, and the server enforces the 5-min freshness window. providerLabel capitalises the provider name.
- **Source:** `apps/web/src/app/(artist)/settings/account/delete-account-section.tsx:46-62`, `apps/web/src/app/(artist)/settings/account/delete-account-section.tsx:120-134`, `apps/web/src/app/(artist)/settings/account/page.tsx:23-27`

### Delete account — type-DELETE confirmation
- **What it does:** Requires the artist to literally type DELETE into a field before the destructive button enables.
- **Why needed:** A deliberate friction step so the irreversible action can't be a slip.
- **How it works:** A text input bound to confirm state (autocomplete off); canDelete requires confirm === 'DELETE' (and re-auth done and not pending). The button shows 'Deleting…' while the transition is pending; errors render inline above it.
- **Source:** `apps/web/src/app/(artist)/settings/account/delete-account-section.tsx:136-161`

### Settings sub-nav (mobile) with Account entry
- **What it does:** On mobile, renders the settings section nav including the 'Account' tab; on desktop the sidebar covers it.
- **Why needed:** Navigation to reach the account page on small screens.
- **How it works:** SettingsLayout renders <SettingsNav /> only in a md:hidden wrapper. SettingsNav passes a static ITEMS list (Profile, Bio page, Emails, Calendar, Payouts, Dashboard, Account) to SectionNav. /settings itself redirects to /settings/profile.
- **Source:** `apps/web/src/app/(artist)/settings/layout.tsx:8-17`, `apps/web/src/components/settings-nav.tsx:3-15`, `apps/web/src/app/(artist)/settings/page.tsx:1-4`

### Onboarding gating (no-profile redirect + AAL2 step-up)
- **What it does:** Forces a brand-new artist with no profile into onboarding, and forces 2FA-enabled artists through the MFA challenge before any artist path loads.
- **Why needed:** Guarantees every working artist has claimed a slug/profile, and that 2FA is actually enforced rather than client-only.
- **How it works:** proxy.ts matches ARTIST_PATHS (dashboard, bookings, flash, travel, settings, onboarding, analytics, etc.). Unauthenticated → /login. AAL1-with-pending-aal2 → /auth/mfa (except /auth/mfa itself). For non-onboarding/non-admin paths, if no profiles row exists → /onboarding/welcome. loginAction also redirects to /onboarding/welcome when the user has no profile.
- **Source:** `apps/web/src/proxy.ts:5-129`, `apps/web/src/app/(auth)/login/actions.ts:34-44`

### Onboarding welcome — Instagram-story intro slides
- **What it does:** A 3-slide auto-advancing story intro (booking link, sorted requests, accept/pass) with tap-to-navigate, press-and-hold to pause, Back/Next, 'Start setup →', and 'Skip intro'.
- **Why needed:** Sells the value and orients a first-time tattoo-artist user before asking them to configure anything.
- **How it works:** WelcomeSlides renders SLIDES with a segmented progress timer (ActiveSegment runs a rAF tick over SLIDE_DURATION 6500ms, respecting press-and-hold pause). Tap zones: left third = back, right two-thirds = next; release <300ms counts as a tap. Final slide shows 'Start setup →' linking to /onboarding/claim-slug; 'Skip intro' and 'Back' also present. No server calls.
- **Source:** `apps/web/src/app/(artist)/onboarding/welcome/welcome-slides.tsx:122-376`, `apps/web/src/app/(artist)/onboarding/welcome/page.tsx:1-5`

### Onboarding step 1 — claim booking-link slug (live availability check)
- **What it does:** Captures artist name (required) + booking-link slug (required, with live availability), optional Instagram handle, optional location; the slug becomes inklee.app/{slug}.
- **Why needed:** The slug is the artist's permanent public booking URL they share in their Instagram bio; it must be unique, valid, and not collide with reserved routes.
- **How it works:** Slug input forces lowercase + [a-z0-9-] only; debounced 300ms via useDebounce, then checkSlugAvailability runs validateSlug (3-30 chars, must start with a letter, single dashes, reserved-list block) and a profiles lookup, returning available/owned/error → hint shows 'Checking…', 'Available ✓', 'Already taken', 'This is your current link', or a format error. Submit (claimSlugAction) re-validates slug + requires display_name, checks the slug isn't owned by another user ('That slug is already taken.'), then upserts profiles (slug, display_name, instagram_handle sans @, location, timezone default Europe/Berlin) and redirects to /onboarding/booking. Pre-fills slug from localStorage key inklee_intended_slug set by the /start landing page.
- **Source:** `apps/web/src/app/(artist)/onboarding/claim-slug/page.tsx:21-204`, `apps/web/src/app/(artist)/onboarding/claim-slug/actions.ts:9-91`, `packages/shared/src/slug.ts:107-134`

### Onboarding step 2 — choose booking mode (preferred date vs fixed slots)
- **What it does:** Radio-card choice between 'Preferred date' (clients suggest a date you confirm) and 'Fixed slots' (clients pick from times you publish), with a warning when fixed-slots is chosen.
- **Why needed:** Determines the entire booking workflow; the warning prevents an artist from shipping a fixed-slots page with no slots (which would be closed).
- **How it works:** Two styled radio labels toggle selectedMode. Selecting fixed_slots reveals an orange warning that the page stays closed until slots are published. saveOnboardingBookingAction requires booking_mode ('Select a booking mode.'), updates profiles.booking_mode, redirects to /onboarding/availability.
- **Source:** `apps/web/src/app/(artist)/onboarding/booking/page.tsx:10-116`, `apps/web/src/app/(artist)/onboarding/booking/actions.ts:8-34`

### Onboarding step 3 — availability (books open/closed + closed message)
- **What it does:** Choose whether the booking page is open for requests now or 'open later', with an optional closed-message shown to visitors; includes a Skip link.
- **Why needed:** Lets an artist stand up a page without immediately taking requests, with a friendly message explaining why.
- **How it works:** Two clickable cards set booksOpen state into a hidden input; when closed, a books_closed_message text input (maxLength 280) appears. saveOnboardingAvailabilityAction reads books_open (!== 'false') and the trimmed message, merges into profiles.settings.books_settings (via parseBooksSettings, preserving existing closed message when open), redirects to /onboarding/form. 'Skip' links straight to /onboarding/form.
- **Source:** `apps/web/src/app/(artist)/onboarding/availability/page.tsx:11-125`, `apps/web/src/app/(artist)/onboarding/availability/actions.ts:9-52`

### Onboarding step 4 — booking-form default fields (toggles)
- **What it does:** Three toggle cards set form defaults: reference image upload, require a description, and a reference-link field (all default on); includes a Skip link.
- **Why needed:** Pre-configures what clients must/can include so requests arrive with the info a tattoo artist needs to quote.
- **How it works:** Each toggle flips a boolean in local state mirrored into hidden inputs (show_image_upload, require_description, show_reference_link). saveOnboardingFormAction parses === 'true', merges into profiles.settings.form_settings (via parseFormSettings), redirects to /onboarding/done. Static note clarifies clients always provide Instagram handle, placement, and preferred date. 'Skip' links to /onboarding/done.
- **Source:** `apps/web/src/app/(artist)/onboarding/form/page.tsx:19-149`, `apps/web/src/app/(artist)/onboarding/form/actions.ts:9-52`

### Onboarding step 5 — done recap, readiness, share link, optional logo, next steps
- **What it does:** Final recap: marks onboarding complete, shows a checklist (profile, booking mode, availability, form ready), states 'You are ready' vs 'Almost ready', exposes the booking link with Preview/Finish-setup, an optional logo upload, a primary CTA to dashboard or availability setup, and a grid of optional features.
- **Why needed:** Confirms setup succeeded, hands the artist their shareable link, and routes fixed-slots artists who still have zero slots to finish before sharing.
- **How it works:** Server component loads profile (slug/display_name/booking_mode/settings/logo_url); redirects to claim-slug if no slug; sets settings.onboarding_completed=true if not already; for fixed_slots counts open slots, computes hasRequiredAvailability/isReadyToShare. Renders completedItems checklist, publicArtistUrl(slug) with 'Preview your page' (new tab) and conditional 'Finish setup', <LogoUpload>, and a primary CTA (dashboard if ready, else /bookings/settings). Optional features grid links to Flash items, Guest spots, Email templates, Deposit collection.
- **Source:** `apps/web/src/app/(artist)/onboarding/done/page.tsx:38-196`

### Onboarding logo upload (client + server validation, resize)
- **What it does:** Optional avatar/logo upload with live preview, client-side validation, server-side re-validation, and automatic resize to a 512px webp.
- **Why needed:** Brands the artist's public booking page with their logo/avatar.
- **How it works:** LogoUpload: a hidden file input (accept png/jpeg/webp) auto-submits on change after client checks (rejects HEIC/HEIF with a tailored message, non-allowed types, >2MB). uploadOnboardingLogoAction re-checks type/HEIC/size, uses sharp to resize 512x512 cover → webp q85, uploads to 'logos' bucket at {userId}/logo.webp (upsert, service role), writes a cache-busted logo_url to profiles, revalidates /onboarding/done. Shows Spinner while pending, 'Logo saved.' on success, inline errors otherwise. Button label toggles Choose image / Replace.
- **Source:** `apps/web/src/app/(artist)/onboarding/done/logo-upload.tsx:14-127`, `apps/web/src/app/(artist)/onboarding/done/actions.ts:13-87`

### Onboarding optional profile fields step (bio etc.) — legacy/redirect
- **What it does:** An older onboarding profile step that captured location/Instagram/bio (bio max 280); now merged into claim-slug.
- **Why needed:** Captures the artist's public bio and contact details; retained as a redirect so mid-flow users continue smoothly.
- **How it works:** /onboarding/profile/page.tsx redirects to /onboarding/booking. The still-present saveOnboardingProfileAction trims location/instagram_handle (strips @)/bio, enforces bio <=280 chars ('Bio must be 280 characters or fewer.'), updates profiles, redirects to /onboarding/booking. The actual public-profile capture now lives in claim-slug.
- **Source:** `apps/web/src/app/(artist)/onboarding/profile/page.tsx:1-7`, `apps/web/src/app/(artist)/onboarding/profile/actions.ts:8-41`

### Onboarding progress bar with back-navigation to completed steps
- **What it does:** Shows the 5-step progress (Link, Booking, Availability, Form, Done) with completed steps clickable to revise an earlier answer.
- **Why needed:** Orientation through a multi-step wizard plus the ability to go back and fix a mistake.
- **How it works:** OnboardingProgress({current}) renders STEPS; steps < current render as clickable <Link> to their route (aria-labelled), the active step is outlined, future steps muted. Footer reads 'Step N of 5 — {label}'.
- **Source:** `apps/web/src/components/onboarding-progress.tsx:6-74`

### Onboarding full-viewport layout
- **What it does:** Onboarding owns the whole screen (no sidebar/top bar/bottom nav) and centers content while staying scrollable on tall screens.
- **Why needed:** A distraction-free first-run setup experience.
- **How it works:** OnboardingLayout uses fixed inset-0 overflow-y-auto with an inner min-h-full flex centering wrapper; app-shell components hide their chrome on /onboarding/*.
- **Source:** `apps/web/src/app/(artist)/onboarding/layout.tsx:5-23`

### Old calendar-export route redirect
- **What it does:** Legacy /settings/calendar-export path redirects to /settings/calendar.
- **Why needed:** Keeps old bookmarks/links working after the calendar settings were consolidated.
- **How it works:** calendar-export/page.tsx is a server component that calls redirect('/settings/calendar').
- **Source:** `apps/web/src/app/(artist)/settings/calendar-export/page.tsx:1-4`

**Notes:** Architecture/edge behaviors worth flagging for the paper: (1) Re-auth for deletion is enforced server-side via last_sign_in_at freshness (REAUTH_WINDOW_MS = 5 min) in lib/server/account-deletion.ts, not just client-side; OAuth re-verify loses in-page state across the redirect so the user must re-type DELETE on return. (2) Account deletion is NEVER blocked on money: live-unpaid Stripe intents are cancelled (transient ERROR + retry only if Stripe is unreachable / a cancel can't be confirmed), and every paid deposit's pseudonymised record is retained 7 years in deleted_account_records for Estonian tax law and to preserve the client's refund route. The same deleteOwnAccountCore serves web/mobile/admin. (3) Recovery codes are SHA-256 hashed and stored in profiles.settings.mfa_recovery_codes via the service-role client (saveMfaRecoveryCodesAction / clearMfaRecoveryCodesAction); the 8-code set uses an unambiguous charset (no 0/O/1/I). (4) MFA-recover endpoint is rate-limited 5/user/hour keyed by user id (so IP rotation can't widen brute force) and unenrolling TOTP via a recovery code drops the session back to AAL1. (5) MFA enrol/verify/disable all run client-side through supabase-js in two-factor-section.tsx; the server only persists/clears recovery hashes and writes audit rows. (6) Email change is double opt-in (supabase.auth.updateUser only emails the new address; nothing changes until confirmed). (7) The slug validator and reserved-slug list live in packages/shared (re-exported via @/lib/slug); claim-slug pre-fills from localStorage 'inklee_intended_slug' set on the /start landing page. (8) The onboarding 'profile' step is now a redirect — public-profile capture (artist name, Instagram, location) happens in claim-slug; bio is captured elsewhere (settings/bio-page). (9) Data export is a GET route that streams JSON with a dated attachment filename and caps the audit log at 500 rows. (10) onboarding_completed is set as a settings flag on the done page (not a column), and proxy gating only checks for a profile row's existence, not the completed flag — so a user can leave onboarding early and still reach the app once a slug exists.
