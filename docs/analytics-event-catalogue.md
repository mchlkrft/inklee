# Analytics event catalogue

The reference for every event that may enter the `analytics_events` table (growth cockpit, migration
`0067_growth_cockpit.sql`). The typed catalogue in
`apps/web/src/lib/growth/event-catalogue.ts` is the executable source of truth; this document
explains each event and where it fires. Adding or changing an event updates both in the same PR.

## The contract

- **Typed catalogue**: `GROWTH_EVENT_SCHEMAS` (zod, `.strict()`) defines the only event names and
  prop shapes that exist. Anything else is rejected before it reaches the database, so event naming
  can never sprawl.
- **Single writer**: `recordGrowthEvent()` in `apps/web/src/lib/growth/record-event.ts` is the only
  code that inserts into `analytics_events`. It is server-only and never throws, so analytics can
  never break the product. Once-only dedupe-keyed milestones at terminal moments (`page_published`,
  `onboarding_completed`, the claim and done step events) are awaited so serverless teardown cannot
  lose them; repeatable events (`booking_link_copied`) stay fire-and-forget
  (`void recordGrowthEvent(...)`).
- **Client-ingestible allowlist**: `CLIENT_INGESTIBLE_EVENTS` (`event-catalogue.ts`) lists the only
  events a client may submit through ingestion endpoints; today that is `booking_link_copied` alone.
  Milestone events are server-observed only: a client-asserted milestone would poison the once-only
  dedupe key and permanently block the genuine one.
- **Tester/admin exclusion at write time**: the writer drops events for `ADMIN_EMAILS`-matched
  accounts and for `profiles.is_tester` accounts (looked up when the caller does not pass the flag).
  The read side never has to re-clean supplemental events.
- **Props are coarse labels only**: enumerable values like a step name or a surface name. Never
  emails, names, handles, booking or client data, free text, IP addresses, or user agents. The strict
  zod schemas make it impossible to smuggle extra keys in.
- **Dedupe keys**: milestone events fire once per subject. `dedupeKeyFor()` derives the key and a
  partial unique index (`analytics_events_dedupe_idx` on `(event_name, dedupe_key)` where
  `dedupe_key IS NOT NULL`) enforces it in the database. A repeat insert fails with Postgres error
  23505, which the writer treats as expected, not as a failure.
- **Account deletion**: `artist_id` references `profiles(id) ON DELETE CASCADE`, so deleting an
  account removes all of its events automatically.
- **Retention**: the monthly retention purge (`/api/cron/retention-purge`) deletes
  `analytics_events` (and `artist_activity_days`) rows older than 24 months, matching the audit
  retention convention.

Stored columns per event: `event_name`, `artist_id`, `source` (`web` | `mobile`), `properties`
(jsonb, validated props only), `dedupe_key`, `occurred_at`.

## Events

### onboarding_step_completed

- **Props**: `{ step }` where `step` is one of `claim_slug`, `booking`, `availability`, `form`,
  `profile`, `done` (`ONBOARDING_STEPS`).
- **Dedupe**: `{artistId}:{step}`, so only the first completion of each step is stored.
- **Fires**:
  - `claim_slug`: `apps/web/src/app/(artist)/onboarding/claim-slug/actions.ts` (web, first
    null-to-slug claim only) and `apps/web/src/app/api/mobile/onboarding/profile/route.ts` (mobile,
    first claim only).
  - `booking`: `apps/web/src/app/(artist)/onboarding/booking/actions.ts`.
  - `availability`: `apps/web/src/app/(artist)/onboarding/availability/actions.ts`.
  - `form`: `apps/web/src/app/(artist)/onboarding/form/actions.ts`.
  - `profile`: `apps/web/src/app/(artist)/onboarding/profile/actions.ts`.
  - `done`: `apps/web/src/app/(artist)/onboarding/done/page.tsx` (web, on the genuine completion
    transition) and `apps/web/src/app/api/mobile/onboarding/complete/route.ts` (mobile).
- **Platform coverage**: web covers all six steps. Mobile currently covers `claim_slug` and `done`
  server-side (the mobile onboarding routes). The intermediate mobile steps are not yet recorded:
  milestone events are server-observed only (`/api/mobile/events` rejects them), so they need
  server-side recording in the mobile step routes, not the app-side `track()`.
- **Answers**: where artists stall inside the onboarding wizard, at step granularity, per platform.

### onboarding_completed

- **Props**: `{}` (none).
- **Dedupe**: `artistId`, once per artist ever.
- **Fires**: `apps/web/src/app/(artist)/onboarding/done/page.tsx` (web) and
  `apps/web/src/app/api/mobile/onboarding/complete/route.ts` (mobile), both only on the genuine
  first completion transition (guarded by the permanent `signup_event_fired` flag, so an admin
  onboarding reset followed by re-completion cannot re-fire).
- **Platform coverage**: web and mobile, both live.
- **Answers**: supplies the completion timestamp the canonical settings boolean lacks. Feeds
  `onboarding_completed_event_at` in `growth_artist_stats` and the median-days-to-activation metric
  (measurable from 2026-07 onward only).

### page_published

- **Props**: `{}` (none).
- **Dedupe**: `artistId`, once per artist ever.
- **Fires**: `apps/web/src/app/(artist)/onboarding/claim-slug/actions.ts` (web) and
  `apps/web/src/app/api/mobile/onboarding/profile/route.ts` (mobile), both on the first successful
  slug claim only. The page is live the moment the slug exists, so this is the publish moment.
- **Platform coverage**: web and mobile, both live.
- **Answers**: when each booking page went live, as a durable timestamp (the profile row only stores
  the claim time implicitly).

### booking_link_copied

- **Props**: `{ surface }` where `surface` is one of `onboarding_done`, `dashboard`, `link_hub`,
  `mobile_app`.
- **Dedupe**: none; repeatable, every copy is stored.
- **Fires**: web copy buttons call the server action `recordBookingLinkCopiedAction` in
  `apps/web/src/app/(artist)/growth-track-actions.ts`, which allowlists the three web surfaces
  (`onboarding_done`, `dashboard`, `link_hub`) and resolves the artist from the session. The
  `mobile_app` surface is reserved for `/api/mobile/events` once the app-side tracker is on.
- **Platform coverage**: web live; mobile pending the tracker flip.
- **Answers**: whether artists actively share their booking link, and from which surface. A leading
  indicator ahead of first requests; individual copies appear on the artist growth timeline
  (`/admin/accounts/[id]`).

## The mobile ingestion endpoint

`POST /api/mobile/events` (`apps/web/src/app/api/mobile/events/route.ts`):

- **Auth**: mobile bearer token via `requireMobileUser`; the artist id and email come from the
  session, never from the body.
- **Rate limit**: 120 events per artist per hour (sliding window), shared with the web link-copy
  action, so one account cannot flood `analytics_events`.
- **Body**: `{ events: [{ event, props, occurredAt? }] }`, non-empty, at most 20 events per request
  (`MAX_BATCH`).
- **Validation**: each entry is validated against the catalogue individually; unknown names or
  invalid props are dropped per event, never stored. Events outside `CLIENT_INGESTIBLE_EVENTS`
  (everything except `booking_link_copied` today) are dropped too: milestone events are
  server-observed only. Response: `{ accepted, dropped }`.
- **Clock-skew guard**: a client `occurredAt` is accepted only within 24 hours back and 5 minutes
  forward of server time; outside that window the server timestamp is used, so a wrong device clock
  cannot rewrite history.
- **Durability**: the batch is awaited before the response is sent, so serverless teardown cannot
  lose accepted events (the recorder never throws, so awaiting is safe).
- **Current status**: the server contract is live. The app-side `track()` is still a no-op, so no
  mobile client events flow yet; flipping it on is a pure mobile change scheduled for the next EAS
  build, with zero server work remaining.

## Adding a new event

All four steps ship in one PR:

1. Add the event name and strict zod prop schema to `GROWTH_EVENT_SCHEMAS` in
   `apps/web/src/lib/growth/event-catalogue.ts`, and its dedupe rule to `dedupeKeyFor()` (return
   `null` only if the event is genuinely repeatable). Props must stay coarse, enumerable labels.
2. Call `recordGrowthEvent(...)` from the server code path that owns the moment (server action,
   page, or API route), never from the client directly. Await it for once-only dedupe-keyed
   milestones at terminal moments (serverless teardown could otherwise lose the write; the recorder
   never throws, so awaiting is safe); fire repeatable events as `void recordGrowthEvent(...)`. Add
   the event to `CLIENT_INGESTIBLE_EVENTS` only if clients may submit it; milestones stay
   server-observed only.
3. Document the event in this file: props schema, dedupe rule, fire locations, platform coverage,
   and the question it answers.
4. Extend the tests in `apps/web/src/lib/growth/__tests__/event-catalogue.test.ts`.

An event that reaches `analytics_events` without a catalogue entry is impossible by construction;
an event that reaches the catalogue without this documentation is a review failure.
