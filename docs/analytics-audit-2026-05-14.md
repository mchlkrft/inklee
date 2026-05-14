# Inklee Analytics & Conversion Tracking Audit

**Date:** 2026-05-14
**Auditor:** Claude Code (automated codebase inspection)
**Scope:** Pre-implementation audit for the post-launch `/dm-chaos` dark-vs-bone-light A/B test. No code changes made. Output is the input to the Tracking Foundation slice in `SLICES_CONTINUATION.md`.

**Headline:** Plausible is installed but only collects pageviews. No custom event helper, no backend analytics beyond `audit_log` (security/admin), no signup tracking. The cookie banner explicitly promises _"no tracking cookies"_ — Meta Pixel cannot ship until that promise + the privacy policy are revised. There is a clean once-only firing point for `signup_completed` at `/onboarding/done`, and admin exclusion infrastructure already exists.

---

## 1. Audit answers (13 questions)

### 1.1 Is Plausible installed?

**Yes — passive only.** Loaded in the root layout with `strategy="afterInteractive"` and `data-domain="inklee.app"`. CSP already permits the `plausible.io` host.

**Evidence:** `src/app/layout.tsx:54-59`, `next.config.ts:19,22`.

### 1.2 Where is it initialized?

**Root `RootLayout` body**, runs on every route (marketing + app), no per-page guard.

**Evidence:** `src/app/layout.tsx:54-59`.

### 1.3 Are custom events already tracked?

**No.** Searched the entire `src/` tree for `plausible(`, `window.plausible`, and `trackEvent` — zero matches. The script collects pageviews implicitly; nothing else is fired.

### 1.4 Is there a current backend analytics system?

**No — but `audit_log` exists for security and admin events**, not analytics. Categories are `booking`, `auth`, `settings`, `admin`, `system`. It is not a usable analytics surface for conversion tracking.

**Evidence:** `supabase/migrations/0000_calm_gressill.sql` (table definition), `supabase/migrations/0015_audit_log_category.sql` (category column), `src/lib/audit.ts` (writer).

### 1.5 What events does the backend system track?

Security / admin only. Examples:

- `admin_page_accessed` — `src/app/admin/page.tsx:22-26`
- Account security events (password change, MFA enrol, etc.) — `src/app/(artist)/settings/account/actions.ts`
- MFA recovery — `src/app/api/auth/mfa/recover/route.ts`

Signup flow does **not** write to `audit_log`.

### 1.6 Is signup completion currently tracked?

**No.** `src/app/(auth)/signup/actions.ts:8-44` calls `supabase.auth.signUp` and redirects to `/onboarding/welcome` (line 41). No analytics call, no audit write, no event firing.

### 1.7 Is signup handled through Supabase Auth?

**Yes**, with two flows:

- **Email + password** (with email confirmation): `src/app/(auth)/signup/actions.ts:20-26`
- **Google OAuth**: `src/app/(auth)/signup/page.tsx:100`

Both paths converge on the same post-confirmation callback.

### 1.8 Is there a reliable post-signup success state or route?

**Yes — two steps:**

1. `auth.signUp` → `/onboarding/welcome` (or `{ sent: true }` if email confirmation pending)
2. After email confirmation: `/auth/callback` exchanges code for session, checks profile existence, redirects to `/onboarding/welcome` if no profile

The "true success" (profile claimed + onboarding done) lives at `/onboarding/done`.

**Evidence:** `src/app/(auth)/signup/actions.ts:41`, `src/app/auth/callback/route.ts:26`.

### 1.9 Can we safely fire `signup_completed` only once?

**Yes — but at the right point.** `profiles.created_at` exists but profile creation happens at `/onboarding/claim-slug`, not at `auth.signUp`. The recommended firing point is **`/onboarding/done`** (or whatever server action flips `onboarding_completed = true`), because:

- Profile is fully created by then
- That action only ever runs once per user
- Variant + UTM context (carried via cookies from `/dm-chaos`) is still readable at that boundary

Firing at `/signup` is unsafe — an auth user can exist with no profile (mid-onboarding drop-off), which doesn't represent a real conversion.

**Duplicate-prevention strategy:** a `signup_event_fired: boolean` flag in `profiles.settings` JSONB, set in the same server action that fires the event. Re-runs (back button, F5) check the flag and short-circuit.

### 1.10 Are logged-in users identifiable on marketing pages?

**Not currently.** `src/app/dm-chaos/page.tsx` is a pure server component with no `getUser()` / `getSession()` call. The same is true for `/`, `/about`, and the 5 SEO pages.

Identifying a logged-in visitor on `/dm-chaos` requires either:

- Reading the Supabase auth cookie in middleware before render (cheap), or
- A client component that calls `supabase.auth.getSession()` after hydration (more reliable, slight delay)

Middleware is the safer choice for the A/B test — it can lock logged-in users to the dark variant and skip variant assignment entirely.

### 1.11 Can internal/admin users be excluded?

**Yes — infrastructure already exists.**

- **`ADMIN_EMAILS`** env var (comma-separated list)
- **`getAdminEmails()`** + **`isAdminEmail()`** helpers in `src/lib/admin-guard.ts:4-13`
- **`requireAdmin()`** gates `/admin` and friends

Recommended exclusions for the A/B test:

1. `ADMIN_EMAILS` (server-side, always-on)
2. **Internal cookie** `inklee_internal=1` set by visiting `/dm-chaos?internal=1` once (founder's phone + laptop, etc.)
3. Cookie persists 90 days; bypasses variant assignment and suppresses all conversion events

### 1.12 Is there already any Meta Pixel implementation?

**No.** No `fbq`, no `facebook.net`, no `FB_PIXEL_ID`, no Facebook domain in the CSP `connect-src` allow-list.

### 1.13 Is there a consent/cookie/privacy implication to handle before Meta Pixel is enabled?

**Yes — this is the most important finding in this audit.**

The current cookie banner explicitly tells users:

- _"No tracking cookies"_ — `src/components/cookie-banner.tsx:26`
- _"Plausible analytics is cookie-free"_ — `src/components/cookie-banner.tsx:130`

The privacy policy reinforces this:

- _"Plausible — privacy-friendly analytics. No cookies. No personal data collected."_ — `src/app/privacy/page.tsx:117-119`
- _"EU-based company, takes data protection seriously, GDPR principles not just compliance."_ — `src/app/privacy/page.tsx:24-29`

**Meta Pixel breaks every part of that promise:** it sets cookies, fingerprints visitors, and forwards data to Meta. Shipping it without:

1. updating the banner copy to disclose Meta Pixel,
2. revising the privacy policy section on third-party data,
3. building a real opt-in consent gate (not just dismissal),
4. extending CSP `connect-src` to include `connect.facebook.net`,

would be a GDPR exposure and a brand-trust break. The audit recommends keeping Meta Pixel **out of the first A/B test entirely** — the test can be decided on Plausible alone. Treat Meta Pixel as a separate slice (Slice 67) that lights up only when paid Instagram ads are about to start, after the consent flow is updated.

---

## 2. Recommended implementation path

### 2.1 Plausible first, Meta Pixel later

The 150 EUR Instagram + Reddit test does not need Meta Pixel. Every metric in the brief (`dm_chaos_view`, `dm_chaos_cta_click`, `signup_started`, `signup_completed`, etc.) is firable as a Plausible custom event. Meta Pixel is for the _next_ phase when paid Instagram ads need Conversions API attribution.

### 2.2 Variant assignment via middleware

`/dm-chaos` stays the only canonical URL (no duplicate route, no SEO duplication, no cloaking). Middleware reads a `inklee_variant` cookie; if missing and the visitor is not logged-in and not internal, it assigns `dark` or `light` 50/50 and sets the cookie (HttpOnly off so the client can read for any client-side hydration needs, secure + sameSite=Lax, 30-day expiry). The server component reads the cookie at render time and applies `data-marketing-theme="dark|light"` to the page wrapper.

Why middleware over client-side:

- No flash of wrong theme
- SSR'd HTML is correct for both crawlers and humans
- Variant decision is server-authoritative, harder to game

### 2.3 Theme tokens, not a forked component tree

A second `data-marketing-theme="light"` selector in `globals.css` overrides the existing dark token set with bone-light values. Components don't change. The `/dm-chaos` JSX stays identical between variants — only the surrounding CSS-var resolution flips. This makes the light theme cleanly reusable on other pages later (e.g., if light wins, we can apply it to the 5 SEO pages without rewriting them).

### 2.4 `signup_completed` fires server-side at `/onboarding/done`

The variant cookie and UTM params (persisted into `profiles.settings.signup_attribution` JSONB during claim-slug, since cookies may be cleared mid-onboarding) are read at the onboarding-done server action. The event fires once, `profiles.settings.signup_event_fired` is flipped to `true`, re-runs short-circuit.

### 2.5 Internal & logged-in exclusion at every layer

| Layer                           | Exclusion                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Middleware (variant assignment) | Skip if `inklee_internal=1`, skip if Supabase auth cookie present                            |
| Plausible event helper          | Skip if `inklee_internal=1`, skip if user email in `ADMIN_EMAILS` (server-side at fire time) |
| Analysis                        | Filter Plausible by `internal=false` property (set on every event)                           |

Three layers of redundancy because variant data is the most expensive part of the test to pollute.

---

## 3. Event schema (proposed)

Every Plausible custom event should carry these properties where applicable:

| Property    | Source                                    | Example values                                    |
| ----------- | ----------------------------------------- | ------------------------------------------------- |
| `variant`   | cookie `inklee_variant`                   | `dark`, `light`                                   |
| `source`    | `utm_source` or `document.referrer` parse | `instagram`, `reddit`, `direct`, `unknown`        |
| `medium`    | `utm_medium`                              | `social`, `community`, `paid_social`, `shortlink` |
| `campaign`  | `utm_campaign`                            | `dm_chaos_ab_test`                                |
| `device`    | `window.matchMedia` or UA parse           | `mobile`, `desktop`                               |
| `path`      | `window.location.pathname`                | `/dm-chaos`                                       |
| `logged_in` | session check                             | `true`, `false`                                   |
| `internal`  | `inklee_internal` cookie + email check    | `true`, `false`                                   |

**Event list:**

- `dm_chaos_view` — fired once per visit on the page
- `dm_chaos_cta_click` — every CTA click on the page (with `cta_label` property)
- `signup_started` — fired on the signup page if the visitor arrived from `/dm-chaos` (referrer or attribution cookie)
- `signup_completed` — fired server-side at `/onboarding/done`, once per user
- `onboarding_started` — fired on first onboarding step
- `booking_link_created` — fired when the artist claims their slug

---

## 4. Risks and guardrails

### 4.1 SEO safety

- `/dm-chaos` stays the only canonical URL. No `/dm-chaos-light` or `/dm-chaos-dark` indexable routes.
- Same JSON-LD, same `<title>`, same meta description for both variants.
- No cloaking — Googlebot sees the same variant assignment logic as a real visitor (in practice, Googlebot has no `inklee_variant` cookie on first hit, so middleware assigns it a random variant just like a human; that's fine — Googlebot is not in the conversion funnel and its variant assignment has no SEO consequence).

### 4.2 Tracking pitfalls

- Plausible events fire after script load (`afterInteractive`). For pageview-equivalent events like `dm_chaos_view`, that's fine. For CTA clicks, attach the handler only after Plausible is ready or fall back to a no-op.
- `signup_completed` server-side means the Plausible HTTP API (not the JS SDK) — needs the `PLAUSIBLE_API_TOKEN` env var added.

### 4.3 Statistical honesty

- 150 EUR / 10 days = roughly 1500–3000 visitors per variant (assuming 50 EUR/day Instagram + organic Reddit reach). At a 2% baseline signup rate that's 30–60 conversions per variant — directional, not significant. The phase preamble must say this out loud so the team doesn't over-interpret the first run.

### 4.4 Consent

- No Meta Pixel until banner + privacy + consent gate are revised. This is a hard line in the roadmap.
- Plausible is already disclosed and is cookie-free per its own docs — no change needed for it.

---

## 5. Quick-reference checklist for Slice 63 (Tracking Foundation)

- [ ] Create `src/lib/track.ts` with `trackEvent(name, props)` helper (client) + `trackServerEvent(name, props)` helper (server, uses Plausible HTTP API)
- [ ] Add `PLAUSIBLE_API_TOKEN` to Vercel env (Production + Preview)
- [ ] Wire `signup_completed` into the `/onboarding/done` server action with `profiles.settings.signup_event_fired` guard
- [ ] Wire `signup_started` into the signup page client component
- [ ] Wire `booking_link_created` into the claim-slug server action
- [ ] Build `inklee_internal=1` cookie setter at `/dm-chaos?internal=1` (no UI surface — query param only)
- [ ] Extend `src/lib/admin-guard.ts` exports if the email-list helpers are needed in track.ts
- [ ] Smoke test all six events in Plausible dashboard from a staging deploy before any variant work begins

---

## 6. Files referenced

| Path                                              | Purpose                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `src/app/layout.tsx`                              | Plausible script init                                        |
| `next.config.ts`                                  | CSP (Plausible domain already allowed)                       |
| `src/app/(auth)/signup/actions.ts`                | Email/password signup server action                          |
| `src/app/(auth)/signup/page.tsx`                  | Signup UI + Google OAuth                                     |
| `src/app/auth/callback/route.ts`                  | Post-confirmation OAuth callback                             |
| `src/app/dm-chaos/page.tsx`                       | The A/B test page (server component)                         |
| `src/lib/admin-guard.ts`                          | `ADMIN_EMAILS` + `isAdminEmail()`                            |
| `src/lib/audit.ts`                                | Backend security/admin event writer (not used for analytics) |
| `src/components/cookie-banner.tsx`                | Current "no tracking cookies" promise                        |
| `src/app/privacy/page.tsx`                        | Privacy policy (mentions Plausible only)                     |
| `supabase/migrations/0000_calm_gressill.sql`      | `profiles`, `audit_log` schema                               |
| `supabase/migrations/0015_audit_log_category.sql` | Audit log categories                                         |

---

**Next:** see Slices 62–69 in `SLICES_CONTINUATION.md` under "Post-Launch Phase: Conversion Testing — Dark vs Bone-Light `/dm-chaos`".
