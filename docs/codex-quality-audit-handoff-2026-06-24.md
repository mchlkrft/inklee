# Inklee full quality audit handoff

**Audit date:** 2026-06-24  
**Auditor:** Codex  
**Code baseline:** app code at `ffb1e05`; audit brief added at `4766de0` as `docs/codex-audit-brief.md`.  
**Repo audited:** `A:\WORK\inklee`

## Health rating

**C+ until the money/idempotency fixes land.** The baseline is much cleaner than a typical pre-launch app: mobile API auth is consistently present, recent RLS migrations mostly have the right shape, image processing now has a shared pixel guard, and the travel/icon work is not the obvious injection hole it could have been.

The remaining risk is concentrated in three places:

1. Stripe deposit state transitions and idempotency.
2. User/customer-controlled URLs and HTML-ish mail/calendar surfaces.
3. Instagram OAuth/thumbnail import and mobile push completion.

There are no blocker findings, but the high findings should be treated as launch-gating for Android/push and any production money ramp.

## Coverage table

| Surface | Result |
| --- | --- |
| Stripe webhook, deposits, refunds | Findings `MONEY-01` through `MONEY-04`. |
| Customer token portal and add-on checkout | Main allowlist is good; status races remain covered by `MONEY-01` and `MONEY-03`. |
| Public booking intake | Core validation/rate-limit/honeypot shape OK; unsafe reference URL scheme in `INJ-01`. |
| Mobile API routes | 78 route handlers checked; 0 missing `requireMobileUser`. Device-token ownership risk in `MOBILE-01`. |
| Service-role sites | No broad cross-tenant write found in spot checks; add compile-time fence in `HARDEN-01`. |
| RLS migrations | Recent tables enable RLS and avoid new anon SELECT in static review. Live `pg_policies` query was not run. |
| Admin and crons | Admin actions gate through `getAdminId`; cron routes fail closed on `CRON_SECRET`. |
| Travel map/icons | Shared sanitizers are in place; no finding beyond copy drift `COPY-01`. |
| Email/iCal/JSON-LD | Findings `INJ-02`, `INJ-03`, `SEO-01`. |
| Instagram OAuth/import | Findings `AUTH-01`, `SSRF-01`. |
| Push notifications | Server send-half absent and token upsert ownership issue, `MOBILE-01` and `DRIFT-01`. |

## Fix order for Claude

1. Fix `MONEY-01`, `MONEY-02`, and `MONEY-03` together. They are the same class of bug: read-before-write status decisions without an atomic row gate.
2. Add durable idempotency for refund/deposit audit rows (`MONEY-04`) with a migration, then update webhook and in-app writers.
3. Add one shared URL sanitizer for customer/public URLs and reuse it for booking reference links, email CTA links, and any future `href`/native-open sink (`INJ-01`, `INJ-02`).
4. Harden Instagram state and thumbnail fetch (`AUTH-01`, `SSRF-01`).
5. Complete push sending only after fixing device token ownership (`MOBILE-01`, `DRIFT-01`).
6. Sweep low findings and add regression tests.

Run at least `pnpm test` for changed packages plus the existing lint/type gate used in this repo before handing back. Add targeted tests where the repo already has coverage seams; do not invent large integration harnesses unless necessary.

---

## High findings

### MONEY-01 - Stripe deposit webhook can approve stale bookings and replay side effects

**severity:** high  
**dimension:** money, FSM, idempotency  
**scope:** in-scope-master  
**location:** `apps/web/src/app/api/stripe/webhook/route.ts:213`, `apps/web/src/app/api/stripe/webhook/route.ts:327`, `apps/web/src/app/api/stripe/webhook/route.ts:346`, `apps/web/src/app/api/stripe/webhook/route.ts:373`

**evidence:** The webhook counts prior `deposit_paid` audit rows at lines 213-218, then later updates `booking_requests` at lines 327-337 with only `.eq("id", bookingId)`. It does not require `status = "deposit_pending"`, does not require `deposit_paid_at is null`, and does not `.select("id")` to prove one row changed. Side effects then run unconditionally: `deposit_paid` audit insert at 346-363, token rotation, emails/notifications, and fee-sponsorship read/write at 373-385.

**repro:** Let a Stripe `payment_intent.succeeded` delivery fetch a booking while it is `deposit_pending`. Before the webhook reaches the update, have the artist reject/cancel or another webhook delivery process the same intent. The webhook still writes `approved` over the current state or duplicates side effects. Duplicate deliveries can also both pass the pre-count and increment `fee_sponsored_used_cents`.

**why it matters:** This is the money settlement file. A stale or replayed webhook can create inconsistent booking state, duplicate audit rows, duplicate notification/email fan-out, and over-count sponsored fee usage.

**suggested fix:** Make the booking-side webhook update the idempotency gate:

- Update with `.eq("id", bookingId).eq("status", "deposit_pending").is("deposit_paid_at", null).select("id")`.
- If zero rows changed, re-read the booking and treat it as replay/orphan according to the actual state. Do not run booking-side side effects.
- Insert `deposit_paid`, rotate token, send mail/notifications, and account for sponsored fees only when the gated update changed exactly one row.
- Add a DB-level unique/idempotency guard for deposit-paid processing keyed by booking plus payment intent, or a dedicated processed Stripe events table.
- Change fee sponsorship accounting to an atomic increment RPC or SQL update under the same once-only gate.

**confidence:** high

### MONEY-02 - Re-requested card deposits can store a new amount after Stripe update fails

**severity:** high  
**dimension:** money, consistency  
**scope:** in-scope-master  
**location:** `apps/web/src/lib/server/bookings.ts:754`, `apps/web/src/lib/server/bookings.ts:771`

**evidence:** In `requestDepositCore`, the existing-intent reuse path calls `stripe.paymentIntents.update(...)` at lines 754-763. The catch at 764-769 only reports to Sentry, then the code still updates the booking row at 771-785 with the new `deposit_amount`, `deposit_currency`, due date, policy, and `status: "deposit_pending"` while keeping the old live intent/client secret.

**repro:** A booking has a live EUR 50 PaymentIntent. Artist re-requests EUR 80. Stripe update fails because the intent is already processing, canceled, stale, or unavailable. Inklee stores EUR 80 and sends the old client secret. If the client pays the old intent, the webhook amount check compares Stripe's EUR 50 to the DB's EUR 80 and flags an orphaned paid deposit.

**why it matters:** The database becomes more authoritative than the live Stripe object. That creates customer charges that the app refuses to reconcile.

**suggested fix:** Treat Stripe update failure as a hard branch, not best-effort:

- On update failure, leave the booking unchanged and return a clear error, or cancel/null the old intent and fall back to manual deposit.
- Only write the new DB amount/currency/client state after Stripe confirms the live intent was updated.
- Add a regression test that simulates `paymentIntents.update` throwing and asserts the booking row is not rewritten to the new amount.

**confidence:** high

### MONEY-03 - Deposit request status writes are last-writer-wins

**severity:** high  
**dimension:** money, FSM  
**scope:** in-scope-master  
**location:** `apps/web/src/lib/server/bookings.ts:771`, `apps/web/src/lib/server/bookings.ts:796`, `apps/web/src/lib/server/bookings.ts:872`

**evidence:** `approve`, `reject`, `markDepositReceived`, and `cancel` all use conditional status updates. `requestDepositCore` does not. The existing-intent reuse update at 771-785, fallback/manual update at 796-812, and new-intent/manual update at 872-887 all only use `.eq("id", id)`.

**repro:** Artist opens the request-deposit modal while a booking is `pending`. Another tab or webhook changes the booking before submit. The stale submit writes the booking back to `deposit_pending` and can attach/send a PaymentIntent link.

**why it matters:** This reopens the exact FSM race pattern already fixed in neighboring booking cores. In the money path it can create live payment links for bookings that have moved on.

**suggested fix:** Add SQL-level gates to all `requestDepositCore` booking updates:

- `.eq("id", id).eq("status", booking.status).select("id")`.
- Return a "booking changed, refresh" error on zero rows.
- Consider claiming the row before creating/updating Stripe intents to avoid orphan PaymentIntents when the DB write loses the race.

**confidence:** high

### INJ-01 - Customer reference links accept unsafe schemes and render as web hrefs

**severity:** high  
**dimension:** injection, XSS, cross-surface drift  
**scope:** in-scope-master  
**location:** `packages/shared/src/booking-schema.ts:41`, `apps/web/src/app/[slug]/actions.ts:522`, `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:348`, `apps/web/src/app/request/[token]/customer-portal.tsx:267`, `apps/mobile/app/bookings/[id].tsx:241`

**evidence:** `bookingSchema.reference_link` uses `z.string().url(...)` at lines 41-45. Zod's URL validation accepts non-http schemes such as `javascript:` and `data:` because it delegates to URL parsing semantics. The public booking action stores the parsed value in `form_data.reference_link` at lines 522-525. Web artist detail and customer portal render the stored value directly as `<a href={...}>`. Mobile noticed the problem and locally gates reference links with `/^https?:\/\//i` before `Linking.openURL`, which confirms the shared schema is too broad for the intended behavior.

**repro:** Submit a public booking with `reference_link=javascript:alert(document.domain)` or a `data:` URL. The value passes shared validation and is stored. The artist dashboard and customer portal render it as a clickable link.

**why it matters:** This is unauthenticated customer input reaching an authenticated artist surface as an executable/link sink. Even if browsers mitigate some `javascript:` target behavior, this is a stored phishing/XSS class bug and an obvious Claude-style "valid URL means safe href" mistake.

**suggested fix:** Add a shared `sanitizeExternalHttpUrl` or `httpUrlSchema` helper that accepts only `http:` and `https:` and normalizes through `new URL`. Use it in `bookingSchema` so unsafe values never store. Also defensively sanitize before rendering existing legacy data in web and mobile. Add tests for `javascript:`, `data:`, `mailto:`, protocol-relative, whitespace/control prefixes, and normal `https://`.

**confidence:** high

### AUTH-01 - Instagram OAuth state is replayable and not bound to the signed-in artist

**severity:** high  
**dimension:** auth, CSRF, account attach  
**scope:** in-scope-master  
**location:** `apps/web/src/app/api/instagram/callback/route.ts:15`, `apps/web/src/app/api/instagram/callback/route.ts:28`, `apps/web/src/app/api/instagram/callback/route.ts:43`, `apps/web/src/lib/instagram.ts:60`, `apps/web/src/lib/instagram.ts:75`

**evidence:** `generateOAuthState` signs `{ artistId, nonce, ts }` statelessly. `verifyOAuthState` only checks HMAC and 15-minute age, compares `sig !== expected`, and returns the embedded artist id. The callback is an unauthenticated GET and upserts `instagram_accounts` for that artist id with `serviceClient`.

**repro:** If a valid state for artist A leaks through browser history, logs, referrers, or a copied URL within the 15-minute window, another party can complete OAuth with their own Instagram `code` and attach that account to artist A. There is no nonce consumption and no current-session check that the callback user is artist A.

**why it matters:** A third-party social account can be connected to the wrong artist, and imported media then becomes trusted content in that artist's flash workflow.

**suggested fix:** Store OAuth state server-side with nonce, artist id, expiry, and consumed timestamp. On callback, consume exactly once. Also verify the signed-in user, if cookies survive the OAuth round trip, matches the state artist id. If cookie binding is not reliable, at least make the DB state row one-time and created only by the logged-in initiation action. Use `timingSafeEqual` for the HMAC comparison.

**confidence:** medium-high

---

## Medium findings

### MONEY-04 - Refund idempotency is count-based in both webhook and in-app flow

**severity:** medium  
**dimension:** money, idempotency  
**scope:** in-scope-master  
**location:** `apps/web/src/lib/server/bookings.ts:1031`, `apps/web/src/lib/server/bookings.ts:1068`, `apps/web/src/app/api/stripe/webhook/route.ts:105`, `apps/web/src/app/api/stripe/webhook/route.ts:113`

**evidence:** `refundDepositCore` checks count of `audit_log` rows with `action = "deposit_refunded"` at lines 1031-1039, then inserts at 1068-1078. The Stripe `charge.refunded` webhook repeats the same count-then-insert pattern at lines 105-123. No unique constraint or upsert key enforces one refund audit row.

**repro:** Artist clicks refund and Stripe sends `charge.refunded` at the same time. Both readers see count 0, then both insert `deposit_refunded`.

**why it matters:** Stripe's idempotency key protects the refund money movement in the in-app path, but the audit/UI layer can duplicate the refund state. That creates confusing reconciliation and downstream logic risk.

**suggested fix:** Add durable idempotency. Options:

- Partial unique index on `audit_log` for `(booking_id)` where `action = 'deposit_refunded'` if Inklee supports one full refund only.
- Or add a structured refund/event table keyed by Stripe `refund_id` or `payment_intent_id`.
- Update both in-app and webhook paths to use upsert/on-conflict and treat duplicate as success.

**confidence:** high

### INJ-02 - Email CTA URL lines and footer notes are inserted as raw HTML

**severity:** medium  
**dimension:** injection, email security  
**scope:** in-scope-master  
**location:** `apps/web/src/lib/email/booking-templates.ts:118`, `apps/web/src/lib/email/booking-templates.ts:126`, `apps/web/src/lib/email/layout.ts:23`, `apps/web/src/lib/email/layout.ts:47`, `apps/web/src/lib/email/send-booking-email.ts:246`, `apps/web/src/lib/email/reminder-emails.ts:19`

**evidence:** `renderBody` escapes normal text, but standalone URL lines matching `/^https?:\/\/\S+$/` go into `ctaButton` without passing through `sanitizeHrefForEmail` or HTML escaping. `ctaButton` interpolates the URL directly into two `href` attributes and visible text. Separately, `renderEmailShell` injects `footerNote` directly into a `<p>`, while caller-provided footer notes include `artistName`.

**repro:** A custom email template line like `https://example.com/" style="color:red` passes the regex and breaks the href attribute. An artist display name containing HTML-like text reaches `footerNote` in customer-facing deposit/reminder emails.

**why it matters:** Many email clients strip scripts, but attribute/body injection can still spoof links, alter content, and weaken the anti-phishing footer on money-related emails.

**suggested fix:** Reuse `sanitizeHrefForEmail` inside `renderBody`; if a URL line is not safe after parsing, render it as escaped text. Escape `footerNote` inside `renderEmailShell`, or split the API into `footerText` and trusted `footerHtml` so untrusted names cannot be passed as HTML. Add tests for quotes and `<img>` in artist names and template URL lines.

**confidence:** high

### INJ-03 - iCal escaping misses carriage returns

**severity:** medium  
**dimension:** injection, calendar  
**scope:** in-scope-master  
**location:** `apps/web/src/app/api/ical/[token]/route.ts:8`, `apps/web/src/app/api/ical/[token]/route.ts:40`, `apps/web/src/app/api/ical/[token]/route.ts:46`

**evidence:** `icalEscape` escapes backslash, semicolon, comma, and LF. It does not escape bare CR or CRLF as a unit. Customer/artist text reaches `SUMMARY`, `DESCRIPTION`, and `X-WR-CALNAME`.

**repro:** A booking description or placement with `\rATTENDEE;CN=x:mailto:x@example.com` can become a raw carriage return in the generated `.ics`. Some calendar parsers treat bare CR as a line break and parse injected properties or events.

**why it matters:** The calendar feed is a long-lived shareable URL containing customer data. Calendar property injection is a realistic class of data integrity/phishing bug.

**suggested fix:** Normalize all newline variants in `icalEscape`, for example escaping `\r\n|\r|\n` to `\\n`, while still escaping backslash, semicolon, and comma. Add tests for LF, CR, and CRLF.

**confidence:** high

### SSRF-01 - Instagram thumbnail importer fetches unbounded attacker-influenced URLs

**severity:** medium  
**dimension:** SSRF, resource exhaustion  
**scope:** in-scope-master  
**location:** `apps/web/src/lib/instagram-storage.ts:20`, `apps/web/src/lib/instagram-storage.ts:28`, `apps/web/src/lib/instagram-storage.ts:32`, `apps/web/src/app/api/instagram/callback/route.ts:57`, `apps/web/src/app/(artist)/flash/instagram/actions.ts:45`

**evidence:** `downloadInstagramThumbnail(sourceUrl, ...)` calls `fetch(sourceUrl)` directly and reads the entire response with `arrayBuffer()` before `guardedSharp`. There is no `https` check, host allowlist, redirect/private-IP guard, content-type check, content-length cap, or streamed byte cap. Both OAuth callback sync and signed-in manual sync pass Instagram `media_url`/`thumbnail_url` into this helper.

**repro:** If Instagram Graph returns, is coerced to return, or is replaced in a future path with a URL pointing at internal infrastructure or a very large file, the server fetches it with service credentials and memory-loads it.

**why it matters:** Graph media URLs are more trusted than arbitrary user input, so this is not a blocker, but server-side thumbnail import is still an SSRF/resource boundary.

**suggested fix:** In `downloadInstagramThumbnail`, parse the URL and require `https`. Allowlist known Instagram/Facebook CDN host suffixes, or reject private/link-local/loopback IPs after redirects. Disable or limit redirects if the runtime allows. Check `content-type` starts with `image/`, enforce `content-length` when present, and stream with a max byte cap before Sharp.

**confidence:** medium-high

### MOBILE-01 - Device token upsert can transfer a push token across artists

**severity:** medium  
**dimension:** mobile, authz, privacy  
**scope:** open-deferred-confirmed  
**location:** `apps/web/src/app/api/mobile/devices/route.ts:32`, `apps/web/supabase/migrations/0046_device_tokens.sql:7`, `apps/web/supabase/migrations/0046_device_tokens.sql:21`

**evidence:** `device_tokens.token` is globally unique and the mobile route upserts with `{ onConflict: "token" }`, writing `artist_id: userId`. RLS policy is `USING (artist_id = auth.uid()) WITH CHECK (artist_id = auth.uid())`.

**repro:** Artist B obtains or presents artist A's Expo push token and POSTs it. Depending on Postgres/Supabase upsert plus RLS behavior on the conflicting row, the request either errors or can transfer the token to B. The code intends global ownership transfer, as the migration comment says re-registering the same device updates owner/last_seen.

**why it matters:** The server push send-half is not implemented yet, so this is a medium deferred issue. Once push sends exist, token ownership determines who receives private booking notifications.

**suggested fix:** Decide ownership semantics before wiring push send:

- Prefer unique `(artist_id, token)` and delete only the current artist's row on sign-out.
- If one token must belong to one artist globally, use a service-side RPC that refuses cross-owner transfer unless a trusted re-auth/ownership proof exists.
- Push sender must load tokens by `artist_id` and delete only provider-confirmed dead tokens.

**confidence:** medium

### DRIFT-01 - Server push send-half is still absent

**severity:** medium  
**dimension:** mobile, feature completeness  
**scope:** open-deferred-confirmed  
**location:** no `apps/web/src/lib/server/push.ts`; `apps/web/src/lib/notifications.ts:27`; `apps/web/src/app/api/mobile/devices/route.ts:11`; `apps/mobile/src/lib/push.ts:87`

**evidence:** Mobile registers Expo tokens and routes tapped notifications. Web inserts notification rows through `createNotification`. There is no server module that reads `device_tokens` and POSTs to `https://exp.host/--/api/v2/push/send`; search found no Expo server send call.

**why it matters:** Android launch can show an in-app notification feed, but actual push delivery will never occur. This is not a security bug, but it is a product gap tied to the device-token risk above.

**suggested fix:** After `MOBILE-01`, add a server push helper that reads current artist tokens, sends to Expo in batches, handles `DeviceNotRegistered`, and wires into `createNotification` or a transactional outbox. Gate production with the required EAS/FCM/APNs setup.

**confidence:** high

### AUTH-02 - Supabase auth email hook does not reject stale Standard Webhooks timestamps

**severity:** medium-low  
**dimension:** auth, replay hardening  
**scope:** in-scope-master  
**location:** `apps/web/src/app/api/auth/email-hook/route.ts:10`, `apps/web/src/app/api/auth/email-hook/route.ts:19`

**evidence:** The hook verifies `webhook-id`, `webhook-timestamp`, and `webhook-signature`, but unlike the Resend webhook it never checks timestamp freshness. A captured valid signed payload can be replayed later and trigger another auth email for the embedded token hash while Supabase still accepts it.

**why it matters:** This is not an unauthenticated bypass because the attacker needs a valid signed payload. It is still inconsistent with the Resend webhook and weakens replay resistance on auth mail.

**suggested fix:** Parse `webhook-timestamp` and reject timestamps outside a small window, such as 5 minutes, matching `api/email/webhook/route.ts`.

**confidence:** medium

---

## Low findings

### SEO-01 - JSON-LD script output is not script-breakout safe

**severity:** low  
**dimension:** XSS hardening, SEO  
**scope:** in-scope-master  
**location:** `apps/web/src/components/seo/json-ld.tsx:7`, `apps/web/src/components/seo/json-ld.tsx:14`

**evidence:** `JsonLd` injects raw `JSON.stringify(data)` into a script tag. Current usage appears to be static marketing/site data, but the component is generic and would become unsafe if future user-controlled text includes `</script>` or U+2028/U+2029.

**suggested fix:** Escape `<` to `\\u003c` at minimum, and also escape U+2028/U+2029 before `dangerouslySetInnerHTML`. Add a tiny unit test with `"</script><script>alert(1)</script>"`.

**confidence:** medium-high

### COPY-01 - Public travel card renders an em dash in user-visible copy

**severity:** low  
**dimension:** copy, just-shipped  
**scope:** just-shipped  
**location:** `apps/web/src/app/[slug]/travel-card.tsx:88`

**evidence:** The public travel card renders an em dash between `fmt(s.startsOn)` and `fmt(s.endsOn)`, which the project copy rules prohibit.

**suggested fix:** Replace with `to`, for example `{fmt(s.startsOn)} to {fmt(s.endsOn)}`.

**confidence:** high

### HARDEN-01 - Service-role client relies on runtime guard instead of compile-time server-only fence

**severity:** low  
**dimension:** service-role boundary, Claude-mistake hardening  
**scope:** in-scope-master  
**location:** `apps/web/src/lib/supabase/service.ts:1`

**evidence:** The service-role module has a `typeof window !== "undefined"` runtime guard and the env key is not public, but it does not import Next's `server-only` package. A future client import would be caught later than necessary.

**suggested fix:** Add `import "server-only";` at the top of the module. Keep the runtime guard as defense in depth if desired.

**confidence:** high

---

## Confirmed false positives and areas not to chase

- **Mobile API auth:** static check found 78 mobile route handlers and 0 missing `requireMobileUser`. `requireMobileUser` calls `supabase.auth.getUser()` with the Bearer token and returns an RLS-scoped client.
- **Waitlist convert:** the shared `convertWaitlistEntryCore` now claims with `.neq("status", "converted").select("id")` before inserting the approved booking. Do not reopen BUG-3.
- **Mobile studio `icon_color`:** `normalizeStudioInput` maps `iconColor` to `icon_color` before shared schema parsing, preserving tri-state. Do not reopen BUG-4.
- **Image decompression bombs:** all found server-side Sharp entry points use `guardedSharp`, and `image-guard.test.ts` exists.
- **Link Hub URLs:** `packages/shared/src/bio-page.ts` sanitizes hub link/social URLs and tests drop `javascript:`. The public hub page renders sanitized settings.
- **Travel icons:** `studio-validation` and mobile travel normalization constrain `icon` and `icon_color` to shared enums/sanitizers. `TravelIcon` uses static generated icon art, not DB-provided SVG.
- **Travel map URL:** `safeMapsUrl` only accepts strings starting with literal `https://` and otherwise falls back to a Google Maps coordinate URL. A URL parser would be nicer, but I did not find a concrete bypass.
- **Cron auth:** all four cron route files checked gate on `Authorization: Bearer ${CRON_SECRET}` and fail closed when unset.
- **Admin surface:** admin pages/actions use `requireAdmin` or `getAdminId`; `needsMfaStepUp` fails closed; destructive self-target guards are present.
- **Recent RLS static review:** recent tables such as `orders`, `order_items`, `booking_interests`, `account_overrides`, `device_tokens`, `deleted_account_records`, `flash_folders`, and `flash_day_items` enable RLS. I did not run live `pg_policies` queries.
- **Public bio/flash/hub over-fetch:** spot checks did not reveal client serialization of private service-role reads. Server components use selected data server-side.
- **Open redirect in auth confirm:** `safeNextPath` rejects absolute/protocol-relative next paths before redirect.
- **Mobile account deletion re-auth:** mobile DELETE now checks server-side `lastSignInAt` freshness and confirmation text.

## Resolution log stub

| Finding | Owner | Fix commit | Verification |
| --- | --- | --- | --- |
| MONEY-01 | Claude |  |  |
| MONEY-02 | Claude |  |  |
| MONEY-03 | Claude |  |  |
| INJ-01 | Claude |  |  |
| AUTH-01 | Claude |  |  |
| MONEY-04 | Claude |  |  |
| INJ-02 | Claude |  |  |
| INJ-03 | Claude |  |  |
| SSRF-01 | Claude |  |  |
| MOBILE-01 | Claude |  |  |
| DRIFT-01 | Claude |  |  |
| AUTH-02 | Claude |  |  |
| SEO-01 | Claude |  |  |
| COPY-01 | Claude |  |  |
| HARDEN-01 | Claude |  |  |
