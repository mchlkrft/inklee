# Email verification cutover (artist accounts)

How to turn on mandatory email verification for **artist** accounts in production.
Scope: this gates Supabase Auth email/password signups only. OAuth (Google/Apple)
artists arrive pre-verified. Customers who submit the public booking/contact form
are **not** auth users (they get custom booking-management magic links) and are
never affected.

## What ships in code (this branch)

- `supabase/config.toml`: `[auth.email] enable_confirmations = true` and
  `email_sent = 30`/hr. **Local-only** — this drives `supabase start` (Inbucket).
  It does NOT change production by itself.
- Branded auth emails (`src/lib/email/auth-templates.ts`): Inklee mustard-pill CTA
  + charcoal, brand-voice copy. Dedicated `emailChangeEmail`. Subjects in
  `api/auth/email-hook/route.ts` are sentence case + "Inklee".
- Send Email hook now deep-links native confirmations: a custom-scheme
  `redirect_to` (`inklee://auth-confirm`) gets the `token_hash`/`type` directly so
  the mobile app verifies on-device (`apps/mobile/app/auth-confirm.tsx` now
  handles `verifyOtp`). Web keeps routing through `/auth/confirm`.
- Recovery links always land on `/reset-password` (`/auth/confirm` route).
- Login surfaces a distinct "confirm your email first" message for unconfirmed
  artists without leaking account existence for bad credentials.

## Production cutover (Supabase dashboard — founder)

Do these **before** flipping the toggle:

1. **Send Email hook is live.** Auth -> Hooks -> Send Email Hook -> URI
   `https://inklee.app/api/auth/email-hook`. `SUPABASE_AUTH_HOOK_SECRET` is set in
   Vercel env AND matches the dashboard secret (the route returns 500 without it).
2. **Resend sending domain verified.** SPF/DKIM/DMARC green for the
   `EMAIL_FROM` domain (`noreply@inklee.app`); `RESEND_API_KEY` set in prod.
3. **Rate limit.** Auth -> Rate Limits -> emails sent ~= 30/hr (matches
   `config.toml`).
4. **Redirect allowlist.** Auth -> URL Configuration. Site URL
   `https://inklee.app`; allowlist includes `https://inklee.app`,
   `https://inklee.app/auth/callback`, `https://inklee.app/auth/confirm`, the
   mobile deep links `inklee://auth-confirm` and `inklee://auth-callback`, and any
   EAS/Vercel preview origins. An `emailRedirectTo` not on the allowlist is
   dropped once confirmations is ON (mobile depends on this).

Then flip it:

5. **Enable confirmation.** Auth -> Providers -> Email -> "Confirm email" = ON.
   (config.toml is local-only; the repo flip does not enable prod.)

## Must-test after the flip

- Web email/password signup -> branded email -> confirm link -> `/onboarding/welcome`.
- Password reset -> recovery email -> `/reset-password` set-password form -> login.
- **Mobile** email/password signup on a **native build** (deep link -> in-app
  confirm -> session). This is the highest-risk path; do not announce live until
  it passes on a device (ME-7/ME-8 gate).
- Sanity: Google/Apple signup still instant; a customer booking submission still
  works with no verification step.
