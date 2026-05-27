# Artist subdomain deployment runbook

How to take the Slice 71 code (already on master) from "ready in app" to "live on `*.inkl.ee`". The app-level work was finished in Slice 71a–71c; everything below is DNS / SSL / Vercel domain configuration plus the env flag flip that activates the new URL form across the product.

**Read this in order.** Steps 0–6 are the prep + provisioning path. Step 7 is the env flip that actually makes artists see subdomain URLs in their dashboard. Step 8 is verification. Section 9 lists failure modes.

---

## 0. Verify the Vercel plan supports wildcard subdomains

Before adding any DNS records, confirm the Inklee Vercel project's plan allows wildcard custom domains (`*.inkl.ee` as a single domain entry).

- Vercel dashboard → Project settings → Domains → "Add domain". If the UI accepts a `*.inkl.ee` entry and shows a regular pending/verifying state (not a "this requires a Pro plan" upsell), the plan is fine.
- Otherwise: upgrade the project to a plan that allows wildcard custom domains, then continue.

The rest of this runbook assumes the plan check passed.

---

## 1. Pre-flight checklist

Confirm before starting:

- [ ] Slice 71a–71c code is on master and deployed to Production (`pnpm test` green, `pnpm build` green, middleware shows `Proxy (Middleware)` in the build output).
- [ ] `inkl.ee` apex is still on the existing redirect setup from Slice 54 (308 → `inklee.app`). The `vercel.json` rules from 2026-05-18 stay in place — they only match the apex host, not subdomains.
- [ ] Cloudflare access for the `inkl.ee` zone is available.
- [ ] You can edit Vercel project env vars (Production + Preview scopes).
- [ ] You have at least one test artist slug that resolves locally — `bert-grimm` is the conventional demo slug.

---

## 2. Add the wildcard domain in Vercel

1. Vercel dashboard → `mchlkrfts-projects/inklee` → **Settings → Domains**.
2. **Add domain** → enter `*.inkl.ee` → Add.
3. Vercel will display the DNS records it expects (CNAME or A — see Step 3).
4. Leave the apex `inkl.ee` entry untouched. It already serves the 308-redirect rules from `vercel.json`; do not delete it.

Vercel issues a wildcard SSL certificate via Let's Encrypt using the DNS-01 challenge — the certificate is provisioned automatically once the wildcard DNS record points at Vercel. No manual cert upload is required.

---

## 3. Configure the wildcard DNS record in Cloudflare

In the Cloudflare dashboard for the `inkl.ee` zone:

1. **DNS → Records → Add record.**
2. **Type:** CNAME
3. **Name:** `*` (just the asterisk — Cloudflare expands this to `*.inkl.ee`)
4. **Target:** the value Vercel showed in step 2 (typically `cname.vercel-dns.com`).
5. **Proxy status:** **DNS only** (grey cloud). Cloudflare's orange-cloud proxy must be **off** for this record. If it is on, Vercel cannot complete the DNS-01 ACME challenge and the wildcard certificate stays in a stuck "pending" state. The Slice 54 short-domain guardrails memo and the apex `inkl.ee` record use the same DNS-only setting.
6. **TTL:** Auto (Cloudflare default) is fine.
7. Save.

Verification: from a terminal, run `dig +short cname.vercel-dns.com` and `dig +short anyslug.inkl.ee`. The latter should resolve to a Vercel IP within a minute or two of the record being saved (Cloudflare propagation is usually faster than the public TTL suggests).

---

## 4. Wait for SSL provisioning

In Vercel → Domains, the `*.inkl.ee` entry will move from "Pending verification" → "Valid configuration" → SSL certificate "Issued" once Cloudflare propagation and the ACME DNS-01 challenge both complete. Typical wait: 2–15 minutes. Longest reasonable wait: 1 hour.

Do not flip the production env var until the SSL row reads "Issued" — until then, `https://<slug>.inkl.ee` will throw a browser certificate error.

---

## 5. Smoke test the routing layer (no env flip yet)

With wildcard DNS live and SSL issued, the middleware from Slice 71b is already serving artist subdomains correctly — but no UI surface has switched to advertising the subdomain URLs yet. Confirm the plumbing works before flipping the env var:

1. Pick an existing artist slug that has a Production profile row (e.g. `bert-grimm`).
2. In a browser, visit `https://bert-grimm.inkl.ee`. Expected: the artist's public booking page renders identically to `https://inklee.app/bert-grimm`. URL bar stays on the subdomain form.
3. Visit `https://bert-grimm.inkl.ee/waitlist`. Expected: the public waitlist form renders identically to `https://inklee.app/bert-grimm/waitlist`.
4. Visit `https://unclaimed-name.inkl.ee` (a slug that does not exist in Production). Expected: the "This name is still free — Claim {slug}" page from `src/app/[slug]/not-found.tsx` (subdomain mode) renders, with a "Claim {slug}" CTA pointing to `https://inklee.app/signup`. The slug is stashed in `localStorage["inklee_intended_slug"]` so the carryover into onboarding works.
5. Visit `https://app.inkl.ee/`. Expected: 308 redirect to `https://inklee.app/` (reserved-subdomain path in the middleware decision).
6. Visit `https://inkl.ee/` (apex). Expected: still 308 redirects to `https://inklee.app/` via the `vercel.json` rules from Slice 54.

If any of these fail, stop here and check Section 9 before continuing.

---

## 6. Verify the marketing app + auth still work on `inklee.app`

The subdomain rewrites are scoped strictly to `*.inkl.ee` hosts. Confirm the marketing+app surface is unaffected:

1. Visit `https://inklee.app/` → marketing homepage.
2. Visit `https://inklee.app/dashboard` while logged out → redirects to `/login` (the auth gate still fires for `inklee.app` hosts).
3. Log in. Visit `/dashboard` while logged in → loads.
4. Log out. Visit `/about`, `/download`, `/dm-chaos` → all marketing pages render.

If any of these regresses, the middleware change is implicated. Roll back by reverting Slice 71b's commit.

---

## 7. Flip the env var

Vercel dashboard → Project settings → **Environment Variables**.

Add a new env var:

- **Key:** `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN`
- **Value:** `inkl.ee`
- **Scopes:** Production **and** Preview (leave Development unset so local dev keeps using path-mode by default — see `docs/subdomain-local-dev.md` for switching it on locally).

Trigger a redeploy (Vercel → Deployments → re-deploy the latest Production deploy, or push any commit).

Once the redeploy is live, every public-URL surface across the dashboard, settings, onboarding-done, admin, flash items + days, travel preview, booking-form share card, and the `/[slug]` canonical metadata switches to emitting `https://<slug>.inkl.ee` URLs. No code change required — this is the single rollout knob.

---

## 8. Post-flip verification

Within 5 minutes of the redeploy:

1. Log in as the founder. Visit `/dashboard`. The BookingLinkWidget share-link should now read `<slug>.inkl.ee`, not `inklee.app/<slug>`.
2. Visit `/bookings/booking-form`. The PublicPageClient share box should show the subdomain form. The QR code regenerates automatically — scan it; it should resolve to `https://<slug>.inkl.ee`.
3. Visit `/bookings/overview?view=clients`. Empty-state CTA shows the subdomain share URL.
4. Visit `/bookings/overview?view=waitlist`. Waitlist share URL ends in `/waitlist` under the subdomain form.
5. Visit `/onboarding/done` (force-navigate from `/dashboard`). Share-your-link section shows the subdomain URL.
6. View `<slug>.inkl.ee/` in an incognito tab. View page source. Find the `<link rel="canonical">` tag — it should point at `https://<slug>.inkl.ee`. The OpenGraph `og:url` should match.
7. Submit the subdomain URL to Google Search Console as a separate property (`https://*.inkl.ee` isn't a property type — submit at least the canonical `https://inklee.app` property keeps signals consolidated; the canonical tag from step 6 does the consolidation).

---

## 9. Failure modes

### 9.1 SSL certificate stuck in "pending"

Most common cause: Cloudflare proxy is on (orange cloud) for the wildcard record. Vercel's DNS-01 ACME challenge can't reach the origin. Fix: set the wildcard CNAME to DNS only (grey cloud), wait 5 minutes for re-validation.

Second most common cause: a conflicting wildcard A record. If a previous `A` record for `*` exists in Cloudflare, the CNAME may have been rejected. Delete the A record and re-add the CNAME.

### 9.2 Subdomain returns 308 to inklee.app for a real artist

Cause: middleware doesn't recognize the slug as an artist subdomain. Either:

- Slug fails the format check (`isValidSlugFormat` in `src/lib/slug.ts`) — verify the slug matches `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` and is 3–30 chars.
- Slug is in `RESERVED_SLUGS` — verify against the list in `src/lib/slug.ts`. If a real artist somehow has a reserved name (shouldn't be possible because `validateSlug` gates creation, but check), the reserved list needs editing.

The 308 target indicates a `shortlink-reserved-subdomain` or `shortlink-invalid-subdomain` host-routing decision. Console-log `parseHost` in the middleware to confirm which.

### 9.3 Subdomain renders apex 404 instead of "Claim this name" page

Cause: the request rewrote successfully (`/<slug>` route fired), but `/[slug]/page.tsx` couldn't find a profile and triggered the global root not-found instead of the custom `src/app/[slug]/not-found.tsx`. Check that `src/app/[slug]/not-found.tsx` exists and exports a default function. If it does, confirm the middleware set the `x-host-routing: subdomain` header — without it the page renders apex-mode copy.

### 9.4 Dashboard still shows `inklee.app/<slug>` after env flip

Cache. Trigger a redeploy (not just a re-publish) so the new env value is baked into server-rendered output. Hard-refresh the browser to bust any local cache.

### 9.5 Customer magic-link email points to `<slug>.inkl.ee`

Should not happen. The Slice 71c helper `publicArtistUrl` is only used for the artist's public bio URL. Customer portal links (`${appUrl}/request/${token}`) were intentionally left on `${NEXT_PUBLIC_APP_URL}`. If a customer email contains a subdomain magic-link, an email template was modified by mistake — grep for `publicArtistUrl` usage in `src/lib/email/` and revert any that aren't supposed to be there.

### 9.6 Need to roll back

Unset `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN` in Vercel env (Production + Preview), trigger a redeploy. The app reverts to emitting path-mode URLs (`inklee.app/<slug>`) across every surface within one deploy cycle. The wildcard DNS + SSL stay in place — leaving them up is harmless because the subdomain middleware keeps working; only the UI's choice of URL changes.

For a deeper rollback (also turning off the subdomain middleware): revert the Slice 71b commit. Slices 71a and 71c are passive when the env var is unset and can stay shipped.
