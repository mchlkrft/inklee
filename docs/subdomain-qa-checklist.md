# Artist subdomain manual QA checklist

Walk every row before announcing the subdomain rollout. Run on Production with `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN=inkl.ee` already set (per Step 7 of `docs/subdomain-deployment.md`).

A row failing on an environment where the test is "expected ✗" is a regression. A row failing on "expected ✓" is a blocker — fix before announcing.

## Public-traffic surfaces

| #   | Request                                                                                                      | Expected outcome                                                                                                                                                                                | Status |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | `https://bert-grimm.inkl.ee/`                                                                                | Public booking page renders. URL bar stays on subdomain. View source — `<link rel="canonical" href="https://bert-grimm.inkl.ee">` present                                                       | ☐      |
| 2   | `https://bert-grimm.inkl.ee/waitlist`                                                                        | Waitlist signup form renders. Submission works                                                                                                                                                  | ☐      |
| 3   | `https://bert-grimm.inkl.ee/flash/days/{anyExistingDayId}`                                                   | Flash day renders (if any public flash days exist for the test artist)                                                                                                                          | ☐      |
| 4   | `https://unclaimed-test-slug-123.inkl.ee/`                                                                   | "This name is still free — Claim {slug}" page renders. CTA goes to `https://inklee.app/signup`. `localStorage["inklee_intended_slug"]` is set to `unclaimed-test-slug-123` after the page loads | ☐      |
| 5   | Continuing #4: click "Claim {slug}" → land on signup → complete signup flow → reach `/onboarding/claim-slug` | Slug input is pre-filled with `unclaimed-test-slug-123` (carryover working)                                                                                                                     | ☐      |
| 6   | `https://app.inkl.ee/`                                                                                       | 308 redirect to `https://inklee.app/`                                                                                                                                                           | ☐      |
| 7   | `https://app.inkl.ee/pricing`                                                                                | 308 redirect to `https://inklee.app/pricing` (path preserved)                                                                                                                                   | ☐      |
| 8   | `https://www.inkl.ee/`                                                                                       | 308 redirect to `https://inklee.app/` (via vercel.json apex rule)                                                                                                                               | ☐      |
| 9   | `https://inkl.ee/` (apex)                                                                                    | 308 redirect to `https://inklee.app/` (via vercel.json apex rule)                                                                                                                               | ☐      |
| 10  | `https://ab.inkl.ee/` (slug too short, invalid format)                                                       | 308 redirect to `https://inklee.app/`                                                                                                                                                           | ☐      |
| 11  | `https://Bert-Grimm.inkl.ee/` (uppercase)                                                                    | Renders Bert Grimm's page (lowercased by parseHost)                                                                                                                                             | ☐      |

## Authenticated app surfaces

Log in as the founder (or test artist with at least one booking, slug `bert-grimm` if used for testing).

| #   | Surface                                                                | Expected to show subdomain URL                                                       | Status |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ |
| 12  | `inklee.app/dashboard` — BookingLinkWidget                             | Share URL reads `bert-grimm.inkl.ee` (not `inklee.app/bert-grimm`)                   | ☐      |
| 13  | `inklee.app/bookings/booking-form` — PublicPageClient share card       | Link row shows `bert-grimm.inkl.ee`. Copy button copies `https://bert-grimm.inkl.ee` | ☐      |
| 14  | `inklee.app/bookings/booking-form` — QR code                           | Scanning the QR resolves to `https://bert-grimm.inkl.ee`                             | ☐      |
| 15  | `inklee.app/bookings/overview?view=requests` — empty-state CTA         | Public URL shown is subdomain form                                                   | ☐      |
| 16  | `inklee.app/bookings/overview?view=clients` — same                     | Subdomain form                                                                       | ☐      |
| 17  | `inklee.app/bookings/overview?view=waitlist` — waitlist share          | Subdomain form with `/waitlist` suffix                                               | ☐      |
| 18  | `inklee.app/onboarding/done` — share-your-link section                 | Subdomain form (force-navigate to this route to see it)                              | ☐      |
| 19  | `inklee.app/travel` — "Preview public page →" link                     | Opens `https://bert-grimm.inkl.ee`                                                   | ☐      |
| 20  | `inklee.app/flash/items/{publishedId}` — public URL                    | `https://bert-grimm.inkl.ee/flash/{itemSlug}`                                        | ☐      |
| 21  | `inklee.app/flash/days` — public URL per public day                    | `https://bert-grimm.inkl.ee/flash/days/{dayId}`                                      | ☐      |
| 22  | `inklee.app/admin/accounts/{id}` (logged in as admin) — Public URL row | Subdomain form                                                                       | ☐      |

## Auth + protected paths should stay on inklee.app

These tests confirm the middleware does not hijack non-public traffic.

| #   | Request                                                               | Expected outcome                                                                                        | Status |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ |
| 23  | `inklee.app/dashboard` while logged out                               | Redirects to `/login` (auth gate fires)                                                                 | ☐      |
| 24  | `inklee.app/login` while logged in                                    | Renders login page                                                                                      | ☐      |
| 25  | `inklee.app/auth/mfa` flow                                            | Works as before (MFA challenge path in middleware untouched)                                            | ☐      |
| 26  | Customer magic link in a booking email (`inklee.app/request/{token}`) | Renders customer portal. Email body contains `inklee.app/request/...`, NOT `<slug>.inkl.ee/request/...` | ☐      |
| 27  | Stripe webhook callback                                               | Vercel logs show webhook hits `inklee.app/api/stripe/webhook`                                           | ☐      |

## Email content

Send yourself one of each by triggering the corresponding flow.

| #   | Email                                                       | Expected URL shape inside                   | Status |
| --- | ----------------------------------------------------------- | ------------------------------------------- | ------ |
| 28  | `artist_new_booking_request` — link to `/bookings/overview` | `https://inklee.app/bookings/overview`      | ☐      |
| 29  | `customer_booking_approved` — magic link to portal          | `https://inklee.app/request/{token}`        | ☐      |
| 30  | Waitlist confirmation / conversion / cancellation           | All magic links on `inklee.app/request/...` | ☐      |
| 31  | Reminder emails                                             | Magic links on `inklee.app/request/...`     | ☐      |

## Rollback path verified

| #   | Action                                                                                                       | Expected                                                    | Status |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------ |
| 32  | In Vercel: unset `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN`, redeploy. Visit `inklee.app/dashboard` — BookingLinkWidget | Reverts to `inklee.app/{slug}` URL. No code change required | ☐      |
| 33  | Restore env var, redeploy                                                                                    | Reverts to subdomain URLs across all surfaces               | ☐      |

Once every row is checked, drop a one-line note in the founder's launch tracker and tear down this checklist file (or move to an archive folder) — it's a one-shot artifact.
