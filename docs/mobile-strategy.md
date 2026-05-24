# Inklee mobile strategy — iOS + Android v0.1

**Status:** scoping decision doc · 2026-05-24
**Scope:** Phase E of `docs/roadmap.md` §6.4 — dual-platform mobile app.
**Pre-condition for implementation:** Phase D punch list closed + ≥ 1 real artist using the web product daily for 4 weeks.

This document is the deliverable from the "next-session" mobile scoping investigation. It does **not** commit to a stack; it answers the transferability question the founder posed: _"how much of the current Next.js web app can be transferred to iOS + Android, vs rewritten?"_

---

## 1. Context

Inklee is a Next.js 15 + Supabase + Stripe artist-booking web app, live at `inklee.app`. The dashboard side is solo-artist-only today; the public side is the booking page each artist shares from their Instagram bio.

The original Phase E plan (set 2026-05-07) was **Android-only**, with TWA as a leading option. The founder expanded scope to **iOS + Android** on 2026-05-24 and explicitly asked: what transfers, what doesn't?

There is no functional pressure to build a native app today. The product launches as a web app. The reasons a mobile app is being scoped now:

- **Artist mobile usage.** Artists are heavy mobile users (Instagram is their world); a native app can sit in the home-screen rotation in a way a bookmarked web app cannot.
- **Push notifications.** Inbound booking requests are the most time-sensitive event in the product. Push is the right channel; the web app has no good push story on iOS today.
- **Distribution.** A real App Store / Play Store presence is part of trust-building.
- **Compounding.** A native app + the web product reinforce each other; the public booking page stays on the web (SEO/GEO; sharing through DMs is link-first, not app-first).

---

## 2. The transferability question, made concrete

The founder's actual question is not "should we build native". It's: **for each major piece of the web codebase, does it carry over, partially carry over, or get rewritten?** That's the lens this doc applies.

The honest answer up front: **transferability is high for business logic + types + Supabase contracts, and low for UI + Next.js-specific patterns**. The candidates differ mostly in where they sit on that spectrum.

---

## 3. Current web-app architecture inventory

Counts as of `49ce728`:

| Surface                             | Count   |
| ----------------------------------- | ------- |
| `page.tsx` files                    | 91      |
| Server components (no use client)   | 82      |
| Client components (`"use client"`)  | 78      |
| `actions.ts` files (Server Actions) | 42      |
| `"use server"` files                | ~44     |
| `src/lib/*` utility modules         | 48      |
| Stripe touchpoints                  | 9 files |
| Image / file-upload sites           | 41      |

Key infrastructure pieces:

- **Next.js 15 App Router** — server + client components, server actions, route groups (`(artist)`, `(auth)`, `(legal)`).
- **React 19** — `useActionState`, `useOptimistic`, Suspense.
- **Tailwind v4** with custom brand tokens (`--color-brand-mustard` etc., system-wide 1.5px borders).
- **Supabase** — auth (cookie sessions via `@supabase/ssr`), Postgres with RLS, Storage buckets (`bookings`, `logos`), service-role client for privileged writes.
- **Stripe** — `paymentIntents` (deposit-only, no subscriptions), webhook at `/api/stripe/webhook`.
- **sharp** — server-side image resizing for logos + booking refs.
- **Email** — Supabase auth webhook (`/api/auth/email-hook`) signs Standard-Webhook payloads and sends via a custom `sendEmail` lib.
- **Plausible** + **Sentry** + **Vercel hosting** + **Vercel Cron** + `inkl.ee` short-domain redirect surface.

The product is **server-action-heavy**: nearly every mutation is a `"use server"` function called from a client component via `useActionState`. There is essentially no REST/JSON API layer — Server Actions ARE the API.

---

## 4. Gap analysis — what transfers vs what doesn't

For each subsystem, by candidate stack:

| Subsystem                              | Capacitor (web shell)                                     | RN + Expo                                                 | PWA + TWA                              | Native Swift + Kotlin          |
| -------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- | ------------------------------ |
| **Next.js App Router**                 | ✅ Runs in webview                                        | ❌ Doesn't run; mirror routing in Expo Router             | ✅ Runs as-is                          | ❌ Rewrite                     |
| **Server Components**                  | ✅ Render on server, html ships                           | ❌ N/A; everything is client                              | ✅ Same                                | ❌ N/A                         |
| **Server Actions (42 files)**          | ✅ Call from webview                                      | ⚠️ Need REST/JSON façade or call as POST endpoints        | ✅ Same                                | ❌ Need full API; rewrite      |
| **Client components (78 files)**       | ✅ Run unchanged                                          | ❌ Rewrite to RN primitives (View/Text)                   | ✅ Same                                | ❌ Rewrite                     |
| **Tailwind v4 tokens + classes**       | ✅ As-is                                                  | ⚠️ NativeWind 4 supports most; some tokens rewrite        | ✅ As-is                               | ❌ Rewrite styles              |
| **`src/lib/*` (48 utility modules)**   | ✅ As-is                                                  | ✅ Pure TS modules carry over                             | ✅ As-is                               | ❌ Rewrite                     |
| **Supabase auth (cookie sessions)**    | ⚠️ Cookies work in webview; iOS WKWebView storage caveats | ⚠️ Swap to `@supabase/supabase-js` + AsyncStorage adapter | ⚠️ iOS PWA cookie persistence is flaky | ❌ Manual JWT handling         |
| **Supabase Storage (signed URLs)**     | ✅ As-is                                                  | ✅ Same client                                            | ✅ As-is                               | ⚠️ Use REST API                |
| **Stripe (paymentIntents, web embed)** | ✅ Stripe.js works in webview                             | ⚠️ Use Stripe RN SDK; payment sheet UI differs            | ✅ As-is                               | ⚠️ Use Stripe iOS/Android SDKs |
| **sharp (image resize)**               | ✅ Stays on server                                        | ✅ Stays on server                                        | ✅ Stays on server                     | ✅ Stays on server             |
| **next/image**                         | ✅ Renders in webview                                     | ❌ Use RN `<Image>` + optimization service                | ✅ As-is                               | ❌ Native image views          |
| **Plausible**                          | ⚠️ Webview pageviews count                                | ⚠️ Custom-event firing                                    | ✅ As-is                               | ⚠️ Custom-event firing         |
| **Sentry**                             | ✅ Capacitor SDK                                          | ✅ RN SDK                                                 | ✅ Web SDK                             | ✅ Native SDKs                 |
| **Push notifications**                 | ✅ Capacitor Push plugin (FCM/APNs)                       | ✅ Expo Notifications                                     | ⚠️ iOS 16.4+ only; weak                | ✅ Native APIs                 |
| **Camera / photo picker**              | ✅ Capacitor Camera plugin                                | ✅ Expo ImagePicker                                       | ⚠️ Limited                             | ✅ Native APIs                 |
| **Deep links (Instagram → app)**       | ✅ App links + universal links                            | ✅ Same                                                   | ⚠️ TWA only on Android                 | ✅ Native                      |
| **Public artist page (`/[slug]`)**     | N/A — stays on web                                        | N/A — stays on web                                        | N/A — stays on web                     | N/A — stays on web             |

**The "stays on web" row matters.** The public booking page is a discoverable URL; it should never live behind app-store distribution. So in every candidate, the public side stays on `inklee.app`. Only the artist surface ships as an app.

---

## 5. Candidate stacks — pros, cons, and what implementation actually looks like

### 5.1 Capacitor / Ionic — wraps the existing Next.js app

**What it is.** Capacitor packages your existing web app into a native iOS + Android binary with a WKWebView (iOS) / WebView (Android), plus a plugin layer for native APIs (push, camera, status bar, splash, deep links).

**Implementation shape.**

- Statically export the artist-side routes (or run a self-hosted Next.js server alongside).
- Configure Capacitor with iOS + Android targets.
- Add `@capacitor/push-notifications`, `@capacitor/camera`, `@capacitor/app` plugins for the parts that need native.
- Ship to both stores from a single TS codebase.

**Pros.**

- Highest code reuse — essentially the entire current codebase.
- Solo-designer-friendly — no new framework to learn.
- Fastest path to "I have an iOS app and an Android app".
- Future native features add incrementally via Capacitor plugins.

**Cons / unknowns.**

- App-store review: Apple has tightened on "web view wrappers"; needs at least one native feature (push counts) and meaningful integration to pass review.
- Webview feel: scrolling and gestures don't always match native expectations; mitigable but real.
- Cookie + auth quirks on iOS WKWebView (third-party cookie restrictions for embedded resources). Supabase's cookie-based auth needs validation in a Capacitor build.
- Server Actions in a Capacitor build: when the app shell is local but the server actions live on Vercel, every action becomes a cross-origin call. CORS + auth-cookie posture needs work; the cleanest path is hosting the Capacitor build under the same domain as the API or moving actions behind a thin REST façade.

**Best fit when.** You want one codebase + both app stores + minimal new learning.

---

### 5.2 React Native + Expo — separate native UI

**What it is.** A new RN/Expo project that reuses `src/lib/*` and Supabase contracts, but rewrites every page in RN primitives (`<View>`, `<Text>`, `<Pressable>`) with NativeWind for Tailwind-like styling. Routing via Expo Router (file-based, App-Router-shaped).

**Implementation shape.**

- New repo or monorepo workspace.
- Lift `src/lib/*` into a shared package (or copy).
- Replace 78 client + 82 server pages with RN screens — likely a slimmer artist-only set (~20–30 screens for v0.1).
- Wire `@supabase/supabase-js` + Stripe RN SDK + Expo Notifications.
- Server Actions become POST endpoints in the Next.js app, called via `fetch` from RN.

**Pros.**

- True native feel — gestures, animations, scrolling.
- Strongest long-term ceiling if the app grows complex.
- Push, camera, biometrics, etc. are first-class.

**Cons.**

- Most rewriting of any high-reuse option. Realistically 4–8 weeks for a solo designer-developer to ship a credible v0.1, before polish.
- Two codebases to keep aligned for any shared feature.
- NativeWind v4 covers most Tailwind classes but not every custom token; the `--color-brand-*` and 1.5px-border system need a styling-system pass.

**Best fit when.** You can budget 1–2 months of focused mobile work and want a strong long-term mobile platform.

---

### 5.3 PWA install + TWA wrapper — the lowest-effort path

**What it is.** Keep the web app exactly as-is. Add a proper manifest + service worker so artists can "Add to Home Screen" on iOS. For Android, package the same site as a Trusted Web Activity and ship to Play Store. iOS does not have a real equivalent — you cannot ship a PWA-only app to the App Store reliably.

**Pros.**

- Zero new codebase.
- Updates ship instantly (no app-store review for content changes).

**Cons.**

- iOS App Store presence: effectively impossible without doing Capacitor-like work anyway, so this option does not actually deliver "an iOS app".
- iOS PWA install UX is buried (Share → Add to Home Screen). Most users will never find it.
- Push on iOS: only iOS 16.4+, only after install, and the API is limited.
- This option was attractive when scope was Android-only; with iOS in scope, **this is no longer a complete answer** — it solves Android but not iOS.

**Best fit when.** You want a 2-day win on Android only, while you decide on iOS.

---

### 5.4 Native Swift + Kotlin — two codebases

Two separate apps, written natively. No web reuse beyond the type contracts you write by hand for the API.

For a solo designer-developer who is "designer-first, not full dev" (per the user profile), this is **not a credible path** for v0.1. It would be the right call only if a critical capability (deep ML, heavy hardware integration) demanded it. Inklee has no such capability today.

Included for completeness; not recommended.

---

## 6. Comparison matrix

| Criterion                        | Capacitor                | RN + Expo       | PWA + TWA               | Native    |
| -------------------------------- | ------------------------ | --------------- | ----------------------- | --------- |
| % of current code reused         | ~95%                     | ~30% (lib only) | 100%                    | ~5%       |
| Time to first install (estimate) | 1–2 weeks                | 4–8 weeks       | 2–3 days (Android only) | 3+ months |
| iOS App Store presence           | ✅ (with native plugins) | ✅              | ❌ effectively          | ✅        |
| Play Store presence              | ✅                       | ✅              | ✅ (TWA)                | ✅        |
| Native feel                      | Medium                   | High            | Low                     | Highest   |
| Push notifications (iOS)         | ✅                       | ✅              | ⚠️ iOS 16.4+            | ✅        |
| Maintenance overhead (one human) | Low                      | High            | None                    | Very high |
| Long-term ceiling                | Medium                   | High            | Low                     | Highest   |
| Risk of App Store rejection      | Medium                   | Low             | High (iOS)              | Low       |
| Solo-designer-friendly           | ✅                       | ⚠️              | ✅                      | ❌        |

---

## 7. Audience-driven scope — what actually needs to be a "mobile app"?

**Artist surface — strong case for app.**

- Long sessions, complex forms, image uploads, dashboard, request triage.
- Push notifications are the killer feature: a new request firing as a push beats refreshing a tab.

**Customer surface — weak case for app.**

- Customers visit the public artist page from Instagram, submit one request, then receive emails for the rest.
- The magic-link portal at `/request/[token]` is a few interactions over weeks.
- A customer app would have ~3 sessions per booking, and would compete with email + browser. Not worth the build.

**v0.1 scope should be: artist app only.** The customer experience stays on the web.

This dramatically reduces the mobile build:

- 91 page.tsx → ~20–25 artist screens in mobile scope.
- Public `[slug]/*` routes (~10 files) stay on web.
- Legal pages stay on web (linked from the app via in-app browser).
- `/start` ad landing stays on web.
- Admin stays on web (founder-only).

---

## 8. Recommendation

**Lead with Capacitor.**

Reasoning:

1. The web app is the source of truth for ~3+ months minimum (Phase D + first artist + 4-week soak). Any rewrite started in parallel would diverge.
2. The codebase is server-action-heavy. Capacitor preserves that contract by keeping the artist UI as the existing web app and only adding native shell + push + camera plugins.
3. A solo designer-developer can ship Capacitor to both stores inside 1–2 weeks of focused work; RN/Expo realistically needs a month-plus.
4. If Capacitor's webview feel becomes a problem **specifically** (gestures, scrolling), the migration story is clear: lift `src/lib/*` into a shared package, rewrite screens in RN. The first-pass work isn't wasted — it ships an app to both stores and validates push + camera + auth flows in a mobile shell.

**Treat RN + Expo as a Phase 2 option** if (a) artist feedback explicitly cites "feels like a website", or (b) the app grows features that webview cannot deliver.

**Cut PWA + TWA from the candidate list** now that iOS is in scope — it does not deliver an iOS app.

**Cut native** for v0.1.

---

## 9. Open questions for the founder

These need answers before implementation can be scoped concretely:

1. **Audience.** Confirmed artist-only for v0.1, or do you want a customer app too? (Recommend: artist-only.)
2. **Push notification triggers.** Which events fire pushes? Almost certainly: new request received, deposit paid, customer cancelled / rescheduled. Anything else? (Reminders are already in cron.)
3. **Camera integration.** Should the artist app give first-class camera capture for booking annotations, or just photo-picker access? (Recommend: photo-picker for v0.1.)
4. **Deep link from Instagram.** Should `inkl.ee/{slug}` deep-link into the app when installed, or always open the web page? Likely the web page (the public side IS the marketing).
5. **OT-05 status.** Distribution requires Apple Developer + Google Play accounts under Inklee OÜ. Are those set up, or is that part of Phase E pre-conditions?
6. **Auth UX on mobile.** Magic link on mobile is awkward (email → Safari → app). Are we comfortable with email confirmation on signup but session persistence after that, or should the mobile app push toward Google sign-in by default?
7. **Offline scope.** Any flows that need to work offline? (Recommend: none for v0.1.)
8. **Branding / app icon / splash.** These need design work distinct from the web brand. Scoped separately from this doc.

---

## 10. Pre-conditions before implementation

Per `docs/roadmap.md` §6.4, **none of this work starts until**:

- Phase D punch list closes.
- ≥ 1 real artist (outside the founder) uses the web product daily for 4 weeks.
- OT-05 (legal entity registrations) is complete on the App Store + Play Store side.

If those conditions hold, the implementation sequence for the Capacitor path is roughly:

1. Add `@capacitor/core` + iOS / Android targets to the existing repo (or to a `/mobile` workspace if a monorepo is preferred).
2. Configure splash + icon + permissions manifest.
3. Wire `@capacitor/push-notifications` to Supabase Edge Functions (or Vercel API) that listen for `booking_requests` insert events and fan out to APNs / FCM.
4. Validate the Supabase cookie auth posture inside WKWebView; if it breaks, switch the mobile build to bearer-token auth using the same `@supabase/supabase-js` client.
5. Build + submit to TestFlight + Play Internal Testing.
6. Iterate on review feedback.
7. Production submit.

Timeline estimate, solo: **1–2 weeks of focused work**, after the pre-conditions clear, to ship a first build to both stores.

---

## 11. What this doc is NOT

- Not a commit to a stack. The recommendation can be revised based on the founder's answers in §9.
- Not an implementation plan. Implementation work is gated by §10.
- Not an exhaustive native-feature audit. Things like in-app purchase, App Tracking Transparency, App Privacy nutrition labels, etc. are downstream of the stack decision.

---

## 12. Decision needed before next steps

The founder needs to either:

- **Sign off on the Capacitor recommendation** (default path), or
- **Push back with reasons to prefer RN + Expo** (e.g. "I want true native feel even at higher cost"), or
- **Add constraints** that change the analysis (e.g. "we want a customer app too" — that would tilt toward RN since customer apps need to feel native at app-store competition level).

Once one of those is locked, this doc becomes the seed of `docs/mobile-implementation-plan.md` for Phase E proper.
