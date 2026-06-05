# Inklee mobile app — planning handoff for ChatGPT

**Purpose:** a single self-contained brief to paste into ChatGPT to evaluate the **development scope** of an iOS + Android app for Inklee. Everything ChatGPT needs is below — product, platform, current feature set, constraints, the mobile rationale, and the open scope questions. (Companion internal doc: `docs/mobile-strategy.md`, 2026-05-24, which this updates to current state.)

**Date:** 2026-06-05. **Status:** scoping/planning, no stack committed, nothing built.

---

## 0. How to use this with ChatGPT

Paste sections 1–8 and ask it to: (a) pressure-test the recommended stack, (b) propose a v0.1 feature cut, (c) surface the App Store policy + technical risks, and (d) give a realistic effort/timeline range for a solo, AI-assisted founder. The actual decisions stay with the founder; ChatGPT is a scoping sparring partner.

---

## 1. Product in one paragraph

Inklee is the cleanest way for tattoo artists to turn Instagram attention into organized booking requests. A solo artist puts their Inklee link in their Instagram bio; clients submit structured booking requests (idea, placement, size, references, dates); the artist manages requests, slots, guest-spot travel, a waitlist, and optional card deposits — all from a calm, designer-first dashboard. Not a marketplace, not a full studio OS, not a generic scheduler. Target users: solo freelance tattoo artists, Instagram-first, often traveling/guest-spotting; small studios later. Live at `inklee.app`. Founder is a solo tattoo artist + UI/UX designer (not a full-stack engineer); development is AI-assisted (Claude Code). Company: Inklee OÜ (Estonia, EU).

## 2. Current platform / architecture (web, live)

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript. Route groups: `(artist)` dashboard, `(auth)`, `(legal)`, public `[slug]`, customer `request/[token]`, `admin`.
- **Styling:** Tailwind v4 with custom brand tokens (bone/charcoal/mustard/rosa).
- **Backend:** Supabase — auth (cookie sessions via `@supabase/ssr`), Postgres with Row-Level Security, Storage buckets (booking images, logos), service-role client for privileged writes. EU (Frankfurt).
- **Payments:** Stripe **Connect Custom** — artists onboard via in-app KYC (never visit Stripe), clients pay deposits by card that settle into the **artist's own** Stripe account (artist = merchant of record), Inklee takes a 3% platform fee and never holds funds. Embedded Stripe.js / PaymentIntents (no Stripe Checkout). Webhook at `/api/stripe/webhook`.
- **Email:** Resend (transactional). **Analytics:** Plausible (cookie-free). **Errors:** Sentry. **Hosting:** Vercel + Vercel Cron. **Rate limiting:** Upstash Redis.
- **Domains:** app on `inklee.app`; public artist pages also served on `*.inkl.ee` subdomains; `inkl.ee` apex 308-redirects.
- **CRITICAL ARCHITECTURE FACT:** the app is **Server-Action-heavy** — nearly every mutation is a Next.js `"use server"` function called from a client component via `useActionState`. **There is essentially no REST/JSON API layer; Server Actions ARE the API.** This is the single biggest factor in mobile-stack choice (see §6).

## 3. Feature inventory — split by where it should live

### 3a. Artist surfaces (the candidate "app")

Dashboard; Bookings (overview, calendar, requests detail, clients + client history, waitlist); Booking link & form settings; Flash (items + flash days); Guest Spots (trips + legs + studios library); Goods (showcase-only catalogue); Analytics; Notifications (in-app + email); Settings (profile, bio page, emails/templates, calendar/export, **payouts/Stripe Connect KYC**, slots, fields, travel, account, 2FA); **Deposits** (request, fee preview, refund, manual fallback). Books open/closed, booking cap.

### 3b. Public surfaces — STAY ON THE WEB (never behind app-store distribution)

The public artist bio/booking page `/[slug]` (+ `/[slug]/flash`, `/[slug]/waitlist`), the customer magic-link portal `/request/[token]` (clients view/edit/cancel + pay deposits — no account, email magic link), all marketing/SEO/GEO pages, and legal pages. These are discoverable URLs shared from Instagram bios and DMs; they must remain on `inklee.app` / `*.inkl.ee` for SEO + link-first sharing.

### 3c. Admin — web-only (`/admin`, internal, founder-only).

### 3d. Auth model (matters for mobile)

- **Artists:** Supabase email/password + Google OAuth, cookie sessions; 2FA/MFA recovery built.
- **Clients:** no account — 32-byte magic-link tokens emailed (SHA-256 hashed, rotated, 30-day expiry). The client side is entirely web.

## 4. Business model context (shapes mobile scope)

- **Free Starter** (€0): the full booking workflow, manual deposit tracking only.
- **Solo Plus** (€3/mo or €24/yr first-year): **in-app card-deposit collection** (gated behind this tier) + polish/branding/templates. Card deposits require the `deposits` entitlement; an internal admin system grants per-artist comp access + fee sponsorship for a private beta.
- **Studio** (~€25/mo): future, not built.
- Launch plan: a **private, comped beta** first (no public campaign, no paid billing yet), then paid Solo Plus.

## 5. Why a mobile app (the rationale, ranked)

1. **Push notifications for inbound booking requests** — the single most time-sensitive event in the product. Web push on iOS is weak; a native app is the right channel. **This is the killer reason.**
2. **Artist mobile usage** — artists live in Instagram on their phones; a home-screen app fits their workflow in a way a bookmarked web app doesn't.
3. **Distribution + trust** — an App Store / Play Store presence builds credibility.
4. **Deep links** — Instagram → app handoff.
   There is **no functional pressure** today — the product launches as a web app. Mobile is additive. **Pre-condition (from roadmap):** don't build until ≥1 real artist uses the web product daily for 4 weeks (the beta soak).

## 6. Transferability + recommended stack (from `docs/mobile-strategy.md`)

The honest summary: **business logic + TypeScript types + Supabase contracts transfer well; Next.js-specific UI + Server Actions do not transfer cleanly to a rewrite.**

| Stack                                   | Reuse                      | Notes                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capacitor (web shell)** ← recommended | Highest (≈ whole codebase) | Wraps the existing Next.js artist app in a native WebView + native plugins (push/camera/deep links). Solo-designer-friendly, fastest to "I have both apps." Risks: App Store "web-wrapper" review (mitigated by real native features like push), WKWebView cookie/auth quirks, and the Server-Actions-cross-origin problem. |
| RN + Expo                               | Medium                     | Pure TS `lib/*` carries over; all UI + the Server-Action layer must be rewritten (RN primitives + a REST/JSON façade). Most native feel, most work.                                                                                                                                                                         |
| PWA + TWA                               | High (Android), weak iOS   | iOS PWA push/cookies are flaky; not a dual-platform answer.                                                                                                                                                                                                                                                                 |
| Native Swift + Kotlin                   | Lowest                     | Full rewrite + a full API. Out of scope for a solo founder.                                                                                                                                                                                                                                                                 |

**Public booking page stays on the web in every option** — only the artist surface ships as an app.

## 7. Constraints

- Solo founder: UI/UX designer, not a full-stack engineer; AI-assisted development.
- Minimal budget + time; maintenance burden of two app stores + web is a real cost.
- EU / Estonia OÜ; GDPR-conscious; EU data residency preferred.
- Must not regress the web product or its SEO/sharing model.

## 8. Open scope questions for ChatGPT to evaluate

1. **Stack:** confirm or challenge Capacitor vs RN/Expo for a solo AI-assisted founder optimizing for time-to-both-stores + reuse. What would change the answer?
2. **The Server-Actions-as-API problem:** Capacitor's local shell calling Vercel-hosted Server Actions is cross-origin (CORS + auth-cookie posture). Options: host the Capacitor build under the same domain, run the Next server and load it in the webview (remote-URL Capacitor), or build a thin REST façade. Which is least work + most robust, and what does each cost?
3. **v0.1 feature cut:** which artist surfaces must be in the app for v0.1 vs deferred? (Likely core: notifications/push, bookings list + request detail + accept/deposit/cancel, calendar. Likely defer: full settings, analytics, flash/guest-spots admin.) Propose a minimal but useful cut.
4. **Push architecture:** FCM (Android) + APNs (iOS) via Capacitor Push; triggered from the existing in-app notification system. What's the server-side work (device-token storage, send-on-event)?
5. **⚠️ App Store payment policy (critical):** clients pay **tattoo deposits** (real-world physical services) → generally EXEMPT from Apple/Google in-app-purchase rules (IAP is for digital goods). But the **Solo Plus subscription** is a digital subscription → if sold inside the app, Apple/Google may require IAP (15–30% cut). Confirm: keep subscription purchase on the web only? Does the deposit flow (Stripe in a webview) pass review? This materially affects scope + economics.
6. **Auth in-app:** Supabase cookie session inside WKWebView vs a token/`supabase-js` approach. Reliability + effort.
7. **Review risk:** what's needed to clear Apple's "minimum functionality / not just a web wrapper" bar (push + camera + deep links likely suffice — confirm).
8. **Effort/timeline/cost:** realistic range for a solo, AI-assisted founder to ship v0.1 to both stores, and the ongoing maintenance load.

## 9. What NOT to plan yet

Native rewrite; offline-first/local DB; the client (customer) side as an app (it stays web); studio/multi-artist mobile; in-app subscription billing (keep on web to avoid IAP cut unless ChatGPT shows otherwise).

---

_Source of truth for product/architecture: this repo's `docs/roadmap.md`, `docs/business-model.md`, `docs/mobile-strategy.md`, `DECISIONS.md`. Keep this handoff in sync if the web product changes materially before mobile work starts._
