# Conversion measurement (Plausible custom events)

Implemented 2026-07-02 per the canonical strategy's P0 (`docs/seo/inklee-seo-strategy.md`). Plausible is the only analytics platform: cookie-free, no fingerprinting, no advertising scripts, no Meta Pixel, no Google Analytics.

## Events

| Event | Fires when | Fired from | Once-only? |
| --- | --- | --- | --- |
| `marketing_cta_click` | An important account-creation CTA is clicked (hero, mid, final sections, the persistent nav "Get started", guide CTAs) | Browser (`TrackedCtaLink`, `src/components/tracked-cta-link.tsx`) | No |
| `signup_started` | The signup form is submitted (email) or the Google flow is started | Browser (`/signup` page) | No |
| `signup_completed` | Onboarding is genuinely completed for a NEW account (the `settings.onboarding_completed` false to true transition) | Browser on `/onboarding/done` (web) or server on `POST /api/mobile/onboarding/complete` (mobile app) | **Yes, once per account** |
| `booking_link_created` | The artist successfully claims their public booking slug for the first time (null to slug transition) | Server (`claimSlugAction` on web, `POST /api/mobile/onboarding/profile` on mobile) | **Yes, once per account** |

## Event properties

Attached automatically where available:

| Property | Meaning |
| --- | --- |
| `entry_path` | First-touch landing pathname on this browser (e.g. `/tattoo-booking-software`) |
| `referrer` | External referrer origin only (e.g. `https://www.instagram.com`); same-origin referrers are dropped |
| `source` / `medium` / `campaign` | From `utm_source` / `utm_medium` / `utm_campaign` on the first-touch URL |
| `current_path` | Page the event fired on (client events) |
| `cta` | Stable CTA position id (`hero-signup`, `mid-signup`, `final-signup`, `nav-get-started`) on `marketing_cta_click` |
| `method` | `email` or `google` on `signup_started` |
| `platform` | `web` or `mobile_app` on the two conversion events |

Device and country are NOT sent as custom props: Plausible derives them itself (screen size/UA client-side; forwarded `User-Agent` and `X-Forwarded-For` for server-side events).

**Never sent:** email addresses, names, Instagram handles, tattoo descriptions, reference links, booking or client data, deposit values, or any other personal data. Attribution values are length-clamped and allowlisted server-side (`attributionPropsFromForm`).

## Attribution model

First-touch, stored once per browser in `localStorage` (`inklee_attribution`), captured by `AnalyticsBootstrap` in the root layout. Later internal navigation never overwrites it, so `signup_completed` fired days later still carries the original marketing entry page. No cookies are used (the site's documented cookie-free position is preserved). Mobile-app conversions have no marketing entry and report `platform: mobile_app` only.

## Duplicate prevention

- `signup_completed` is gated by the permanent `profiles.settings.signup_event_fired` flag, set in the same write that flips `onboarding_completed`. The admin "reset onboarding" action preserves it, so re-completing onboarding never re-fires. Web and mobile share the same flag, so cross-platform double completion cannot double-fire. Accounts that completed onboarding before this instrumentation never fire retroactively.
- `booking_link_created` fires only when the profile had no slug before the claim (re-submits and own-slug re-claims are no-ops).
- Decision logic is pure and unit-tested: `src/lib/analytics-gates.ts` + `src/lib/analytics-gates.test.ts` (13 tests, including reset/re-complete and cross-platform cases).

## Internal-user exclusion

Three layers; internal traffic produces NO conversion events:

1. **Browser mark (founder/internal devices):** open any inklee.app page with `?internal=1` once per browser (e.g. `https://inklee.app/?internal=1`). This stores `inklee_internal=1` in localStorage; every `trackEvent` call is then a no-op in that browser. Undo with `?internal=0`. Do this on every browser/profile you use, including mobile browsers.
2. **Admin accounts:** any account whose email is in the `ADMIN_EMAILS` env var is excluded from the server-gated events (`signup_completed`, `booking_link_created`).
3. **Tester accounts:** any profile with `is_tester = true` (set in `/admin/accounts/<id>`) is excluded from the server-gated events. Flag test/demo artist accounts there.

Automated tests hit local/dev domains, which Plausible ignores for the `inklee.app` domain; localhost traffic is never counted.

## Founder actions (one-time)

1. **Plausible dashboard** (plausible.io, site `inklee.app`) → Site settings → Goals → add four custom-event goals with these exact names: `marketing_cta_click`, `signup_started`, `signup_completed`, `booking_link_created`.
2. Site settings → Custom properties → add: `entry_path`, `referrer`, `source`, `medium`, `campaign`, `current_path`, `cta`, `method`, `platform`. (Plausible only shows props that are registered.)
3. Mark your browsers internal: visit `https://inklee.app/?internal=1` once per browser/device.
4. Flag any existing test artist accounts as testers in `/admin/accounts`.

## Environment variables

None new. The Plausible domain is hardcoded to `inklee.app` (matching the existing `data-domain` in `app/layout.tsx`); `ADMIN_EMAILS` already exists.

## Code map

| File | Role |
| --- | --- |
| `src/lib/track.ts` | Client helper: internal-flag handling, first-touch capture, `trackEvent` |
| `src/lib/track-server.ts` | Server helper: Plausible events API, fire-and-forget |
| `src/lib/analytics-gates.ts` | Pure once-only/exclusion decision logic + attribution form fields |
| `src/components/analytics-bootstrap.tsx` | Root-layout bootstrapper (`?internal`, first-touch capture) |
| `src/components/tracked-cta-link.tsx` | CTA link wrapper emitting `marketing_cta_click` |
| `src/components/attribution-fields.tsx` | Hidden form fields carrying attribution into the claim-slug action |
| `src/app/(artist)/onboarding/done/page.tsx` + `signup-completed-tracker.tsx` | Web `signup_completed` boundary |
| `src/app/api/mobile/onboarding/complete/route.ts` | Mobile `signup_completed` boundary |
| `src/app/(artist)/onboarding/claim-slug/actions.ts` | Web `booking_link_created` |
| `src/app/api/mobile/onboarding/profile/route.ts` | Mobile `booking_link_created` |
