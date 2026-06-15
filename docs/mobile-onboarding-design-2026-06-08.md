# Mobile onboarding (E4) — design + build plan (2026-06-08)

The last remaining mobile launch blocker. Native first-run onboarding for the Expo
artist app. Grounded in a 5-agent discovery of the existing web onboarding + the
mobile substrate (see the discovery run; key files cited inline).

**North star (from `docs/mobile-implementation-plan.md:129`):** E4 = "Onboarding +
public booking link (first-10-minutes excellence)", single acceptance gate =
**"new artist → live shared booking link in <10 min."** Mandated as a **native
redesign** ("do NOT copy web UI"; onboarding is on the "Never web-view" list,
plan:68,173). The web 5-step wizard is the **content** source of truth, not a UI to
port.

## Locked decisions (founder, 2026-06-08)

1. **Wizard scope = "+ Books & booking mode."** Three actionable screens: claim-link →
   booking setup (booking mode + books open/closed) → you're-live. (Logo + deposits
   deferred to the More hub.)
2. **Hard gate.** Signed-in but not onboarded ⇒ the onboarding stack is the *only*
   thing available; no tab access until `onboardingCompleted`. (Diverges from web,
   which is soft; justified because the wizard is short.)
3. **Full native 3-slide intro story** opens the wizard (port of the web
   `welcome-slides` content; graphics are FU-13, placeholder-OK).

### Defaults locked by analysis (not asked — clear best choices)
- Route the 3rd state on the explicit `onboardingCompleted` flag (matches
  `GET /api/mobile/me` byte-for-byte; `me/route.ts:34`).
- `preferred_date` is the default mode; `fixed_slots` is offered but slot publishing
  stays on web (a fixed-slots artist isn't bookable until ≥1 slot exists —
  `[slug]/page.tsx:433-459`). The you're-live screen reflects this.
- Capture the **device timezone** (`expo-localization`) on profile create — a real
  improvement over web's hardcoded `Europe/Berlin` (`claim-slug/actions.ts:83`).
- **No slug-carryover on mobile** — it's a web-localStorage mechanism
  (`inklee_intended_slug`) with no native source; claim-link starts blank.
- Endpoints built **inline** (mirroring `settings/books/route.ts`), reusing the shared
  `validateSlug`/`RESERVED_SLUGS` from `@inklee/shared/slug` so validation can't drift.
  (No `lib/server/onboarding.ts` exists; the writes are trivial upserts — extraction
  isn't warranted. Web onboarding actions are left untouched → web cannot regress.)
- Deposits/Connect-KYC stay **out** of the critical path — in-app-browser handoff from
  More later; Plus-gated + comped-for-beta; **no IAP/subscription CTA anywhere**
  (plan:151).
- Extract a small `TextField` primitive (onboarding has 4 fields; the bordered input is
  currently hand-copied in `sign-in.tsx` + `account/delete.tsx`).

## Why the wizard can be short

Only one web step is load-bearing: `claim-slug` **creates the profile row** (slug +
display_name; `claim-slug/actions.ts:77-85`) and, because `DEFAULT_BOOKS_SETTINGS.books_open
= true` (`books-settings.ts:11-17`), a `preferred_date` artist is **live and bookable
the instant the row exists**. `booking_mode`, `books_open`, `form_settings`, and `logo`
all have working defaults. The profile row's existence (not the flag) is the web's real
activation boundary (`proxy.ts:101-114`).

## Routing architecture (the `_layout.tsx` refactor)

Today: 2-state `Stack.Protected guard={!!session}` (sign-in ↔ tabs). New: a third state
keyed on `/me`.

- Add an `enabled?: boolean` option to `useApiQuery` (TanStack supports it natively) so
  `/me` only fetches once a session exists.
- In `RootNavigator`: read `const me = useApiQuery<MobileMe>("/me", { enabled: !!session })`.
  - `loading` (session) **or** `!!session && !me.data && me.loading` → charcoal splash
    (so a fresh sign-in never flashes the tabs before onboarding status is known).
  - `!!session && me.error && !me.data` → a retry splash (don't guess the gate).
- Three `Stack.Protected` groups:
  - `guard={!session}` → `sign-in`
  - `guard={!!session && me.data && !me.data.onboardingCompleted}` → **`onboarding/` stack**
  - `guard={!!session && me.data && me.data.onboardingCompleted}` → `(tabs)` + the
    existing detail routes (bookings/[id], clients/[email], account/delete,
    notifications, insights, waitlist).
- **On completion:** `complete` succeeds → invalidate `["api","/me"]` (+ `/home`,
  `/settings/profile`) → `onboardingCompleted` flips true → the guard swaps groups → the
  app lands the artist on the tabs automatically (the same elegant pattern as the session
  gate). `invalidateBookingViews` covers `/home` but **not** `/me` — onboarding needs its
  own `invalidateIdentity(client)` helper.

### Wizard internal routing (resume-aware)
The onboarding stack picks its start screen from `/me`:
- **Brand-new (slug === null):** intro → claim-link → booking-setup → you're-live.
- **Resume (slug present, not completed — abandoned web/mobile onboarding):** jump
  straight to **you're-live** (one tap to finish; booking settings keep prior/default
  values, adjustable in More). No re-collecting the slug.

## Screens

0. **Intro (3-slide story)** — `src/components/onboarding/OnboardingIntro.tsx`. Auto-advancing
   slides (mirror web `welcome-slides.tsx` content: your link / triage requests / get
   booked), progress dots, press-hold pause, Skip + final "Get started" CTA. Graphics =
   FU-13 (placeholder illustrations OK for v1).
1. **Claim your link** (`app/onboarding/claim.tsx`) — the hero. `TextField` for display
   name (required) + slug with live availability (debounced `slug-check`, client-side
   `validateSlug`, `{slug}.inkl.ee` preview, owned-slug = re-claimable), optional Instagram
   + location, a **"Clients see this"** chip on public fields. Captures device tz. Submit →
   `POST onboarding/profile` → booking-setup.
2. **Booking setup** (`app/onboarding/booking.tsx`) — booking mode radio (preferred_date
   default · "I publish fixed slots (set up on web)") + a single **Books OPEN/CLOSED** pill
   toggle (default open; "open later" reveals an optional closed message). Submit →
   `POST onboarding/booking` → you're-live.
3. **You're live** (`app/onboarding/done.tsx`) — readiness-aware:
   - preferred_date + open → "**jane.inkl.ee** is live and open for requests" + Books OPEN
     pill, Copy/Share, "Send yourself a test request" (opens the public page), pointers
     ("Add a logo / set up deposits later in **More**"), **"Start using Inklee"** →
     `POST onboarding/complete` → invalidateIdentity → tabs.
   - fixed_slots → "Your link is claimed — **publish slots on the web** to start taking
     bookings" + link out; finish still completes onboarding (mirrors web `isReadyToShare`).

## Endpoints (net-new; inline, `settings/books` pattern)

All `requireMobileUser` → RLS-scoped client (satisfies the own-row INSERT policy
`0032`, `WITH CHECK auth.uid()=id`), `mobileOk`/`mobileError`, `writeAudit` on writes.
Shared response types added to `packages/shared/src/mobile-api.ts`.

1. `GET /api/mobile/onboarding/slug-check?slug=<s>` → `{ available, owned, error }`.
   Ports `checkSlugAvailability`: `validateSlug` first, then `profiles` lookup; own
   existing slug → `{available:true, owned:true}`.
2. `POST /api/mobile/onboarding/profile` `{ slug, displayName, instagramHandle?,
   location?, timezone? }` → `validateSlug` + require displayName + uniqueness pre-check
   (`.eq(slug).neq(id).maybeSingle()`) → upsert `profiles` (id, slug, display_name,
   instagram_handle, location, timezone ?? 'Europe/Berlin'). Catch the DB
   `profiles_slug_unique` violation (the check↔upsert race) → **409** "That link was just
   taken." Returns `{ slug, displayName }`.
3. `POST /api/mobile/onboarding/booking` `{ bookingMode, booksOpen, booksClosedMessage? }`
   → update `profiles.booking_mode` + merge `settings.books_settings` (via
   `parseBooksSettings`, preserving other keys). Collapses the web `booking` + `availability`
   steps into one screen's write.
4. `POST /api/mobile/onboarding/complete` → guard `slug` present (else 400) → read-modify-
   write `settings.onboarding_completed=true` (preserve other keys) → `writeAudit`. Ports
   `done/page.tsx:53-61` (which today is only set by *rendering* the web page — there is no
   API for it).

Reused as-is: nothing (the existing `settings/books` POST is superseded here by the
combined `onboarding/booking` write; keep `settings/books` for the Home toggle).

## Slice plan (each: build → parallel review → fix → typecheck/bundle → commit)

- **O0 — backend (4 endpoints + shared types + tests).** Unblocks the UI. No web change
  (additive) → web cannot regress. Tests: slug-check validation + owned-slug; profile
  uniqueness/race; complete's slug guard.
- **O1 — router 3rd state.** `enabled` on `useApiQuery`; `_layout.tsx` 3-group gate +
  combined loading/retry splash; `invalidateIdentity` helper; a stub onboarding screen.
  Verify the two existing paths (signed-out→sign-in, onboarded→tabs) don't regress and
  un-onboarded → onboarding.
- **O2 — claim-link screen** + `TextField` primitive (live slug-check, validateSlug,
  device tz, Clients-see-this chip).
- **O3 — booking-setup + you're-live + complete** (readiness-aware; share/test-request;
  invalidateIdentity → tabs).
- **O4 — 3-slide intro story** (native `OnboardingIntro`; graphics placeholder/FU-13).
- **O5 (optional, post-launch)** — logo step (image picker + `POST onboarding/logo` server
  sharp + RECORD_AUDIO cleanup), in-app-browser payouts/KYC handoff from More.

### Per-slice acceptance gates (plan:143) — apply to every onboarding screen
empty/loading/error states; saves give feedback; no client PII in analytics; web does
not regress; `pnpm typecheck` + tests green; `expo export` bundles; (founder) on-device
iPhone+Android + the <10-min run-through.

## Open follow-ups / notes
- The "send yourself a test request → **push**" magic moment depends on E3 push (APNs/FCM
  not yet configured). For now the test request shows in the inbox via pull-to-refresh;
  the push hook lands once E3 ships. Use a generic push title when it does (minimal-PII).
- `fixed_slots` slot creation has no mobile endpoint (web-only) — the you're-live screen
  routes those artists to web.
- Logo/HEIC: iPhone camera roll defaults to HEIC (web rejects it); the O5 logo endpoint
  must convert or reject with guidance.
- Wizard ⇄ More hub share the same endpoints/components so a skipped step is resumable
  from More→SET UP / ACCOUNT, never a dead end (plan:72-73).
