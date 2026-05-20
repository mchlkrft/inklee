# Inklee Roadmap (Unified View)

**Last updated:** 2026-05-20
**Current prod commit:** `d5e9db1`
**Migrations applied:** 0000–0031
**Status:** MVP feature-complete as a solo-artist tool. Pre-launch closeout in flight. Legal package shipped + counsel-cleared; `inkl.ee` short domain live. No subscription/monetization layer in code yet.

**Purpose.** This is the single high-level view. For slice-level details see `SLICES_CONTINUATION.md`. For strategy and pricing details see `docs/business-model.md`. For the public template repo cadence see the memory file `project_inklee_template_repo.md`. This doc supersedes informal "what's next" summaries scattered across other places.

---

## 1. Current snapshot

10 SEO/GEO marketing pages live. Reworked About page. Public booking flow, trip planner, deposits (Stripe test mode), waitlist, slot mode, customer portal — all shipped. Stripe is deposit-only, not subscriptions. No plan/tier model in the schema. Studio multi-tenancy does NOT exist. Public template repo at `mchlkrft/tattoo-booking-form-template` v1.0.0 shipped 2026-05-15. Legal package (imprint/terms/dpa/AUP) shipped 2026-05-19 and counsel-cleared 2026-05-20 (Art. 28 satisfied by passive signup notice per counsel — no `legal_acceptances` table needed). `inkl.ee` short-domain pure-redirect surface live since 2026-05-18.

**The honest summary:** product is ready to launch in free mode. Monetization architecture starts after launch + first real artist + 4 weeks of clean data.

---

## 2. What's already shipped

| Milestone                                                | Status                                           | Reference                                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP product slices 0–23                                  | ✓ Shipped                                        | `SLICES.md`                                                                                                                                                                                                |
| Pre-v0.1 extension (Slices 24–31)                        | ✓ Shipped                                        | `SLICES_CONTINUATION.md`                                                                                                                                                                                   |
| Hardening package (Slices 32–40)                         | ✓ Shipped                                        | RLS, rate limiting, payment hardening                                                                                                                                                                      |
| Post-hardening work (Slices 41–53)                       | ✓ Shipped                                        | Trip Planner, Flash, admin, branding                                                                                                                                                                       |
| Security incident recovery (2026-05-10)                  | ✓ Closed                                         | Migrations 0026–0031                                                                                                                                                                                       |
| UI rework (app shell + page polish)                      | ✓ Shipped                                        | Commits `885f9f8` + `2a4af67`                                                                                                                                                                              |
| Slot location auto-tagging + studio library access       | ✓ Shipped                                        | Commit `f42f2d2`                                                                                                                                                                                           |
| 10 SEO/GEO pages live                                    | ✓ Shipped                                        | Slices 5–8, 11–16                                                                                                                                                                                          |
| Public template repo v1.0.0                              | ✓ Shipped                                        | github.com/mchlkrft/tattoo-booking-form-template                                                                                                                                                           |
| Reworked About page                                      | ✓ Shipped                                        | Editorial SEO layout                                                                                                                                                                                       |
| Analytics + roadmap A/B test docs                        | ✓ Shipped                                        | `docs/analytics-audit-2026-05-14.md` + Slices 62–69                                                                                                                                                        |
| Business model strategy doc v0.1                         | ✓ Shipped 2026-05-16                             | `docs/business-model.md`                                                                                                                                                                                   |
| `inkl.ee` short-domain redirect surface (Slice 54)       | ✓ Shipped 2026-05-18                             | Commits `d8cf2b2` + `7d58f3d`; DNS Zone→Cloudflare→Vercel; 308 catch-all to `inklee.app`                                                                                                                   |
| Legal package — imprint/terms/dpa/acceptable-use         | ✓ Shipped 2026-05-19, counsel-cleared 2026-05-20 | Verbatim from `legal/LEGAL-PACKAGE-DRAFT.md`; `src/app/(legal)/` + markdown pipeline; commits `421e91f` + `d5e9db1`; pending-review footnote disabled in prod via `NEXT_PUBLIC_LEGAL_PENDING_REVIEW=false` |
| Signup passive consent notice                            | ✓ Shipped 2026-05-19                             | Commit `3d13394`; counsel-confirmed sufficient for Art. 28 in lieu of recorded click-accept                                                                                                                |
| Homepage deposit feature card — exact required wording   | ✓ Shipped 2026-05-19                             | Closes the H1/K2 launch-blocker on the homepage surface                                                                                                                                                    |
| `/impressum` → `/imprint` 308 relocated to `vercel.json` | ✓ Shipped 2026-05-19                             | Edge-level, consistent with the inkl.ee redirect pattern                                                                                                                                                   |
| OT-05c imprint board confirmation                        | ✓ Closed 2026-05-18                              | Current imprint accepted as-is                                                                                                                                                                             |

---

## 3. Horizon 1 — Now (next ~4 weeks)

Pre-launch closeout. Nothing else should accelerate until this horizon is clean. This is what blocks the public launch.

### 3.1 Pre-launch blockers (must close)

| ID         | Item                                                                                                                                                                   | Effort | Owner                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------- |
| OT-02      | Swap Stripe test → live keys (`sk_live_*`, `pk_live_*`, new webhook secret)                                                                                            | 30 min | Founder, before first real deposit |
| OT-01      | Supabase Storage bucket policy: restrict `bookings` bucket writes to service role, scope reads                                                                         | 1 day  | Engineering                        |
| ~~OT-05c~~ | ~~Imprint board confirmation~~ — ✓ Closed 2026-05-18 (see §2)                                                                                                          | ✓      | Founder                            |
| ~~OT-06~~  | ~~ToS lawyer review~~ — ✓ Closed 2026-05-20 for the published scope (imprint/terms/DPA/AUP). Privacy lawyer review moves to §3.5 once `/privacy` Section 4 is shipped. | ✓      | Founder → external lawyer          |

### 3.2 Pre-launch UX polish

Slice 60 was expanded 2026-05-16 into a platform-wide UX audit + restructure across four sub-slices (60a–60d). Slice 60e was added 2026-05-20 for the deposit UX surfaces flagged by the legal package (item E). Slice 61 (auth UI) stays distinct.

| Slice | Title                                             | Acceptance                                                                                                                                                                                                                                                                                                                         |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 60a   | Platform-wide UX audit + IA decision doc          | `docs/platform-ux-audit-slice-60a.md` + entry in `DECISIONS.md`. No code.                                                                                                                                                                                                                                                          |
| 60b   | Navigation + IA restructure (implementation)      | Sidebar/top-bar/mobile-nav rewired per 60a decision; redirects for any moved routes                                                                                                                                                                                                                                                |
| 60c   | Onboarding wizard extension + mobile optimization | Intro slides + 375px pass + feature-intro modal copy (closes OT-08)                                                                                                                                                                                                                                                                |
| 60d   | Flash feature thorough audit + flow integration   | `docs/flash-ux-audit-slice-60d.md` + flash sits cleanly in the unified booking list                                                                                                                                                                                                                                                |
| 60e   | Deposit UX surfaces (new, from legal item E)      | Artist deposit-settings UI + public booking-page deposit section + Stripe test-mode banner (yellow, when `pk_test_*`). Required exact wording present on each surface: _"Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features."_ Homepage card already done. |
| 61    | Auth UI pass                                      | `docs/nav-auth-ui-audit-slice-61.md` + visual/copy fixes (auth surfaces only)                                                                                                                                                                                                                                                      |

**Sequencing:** 60a must close first. 60b + 60c can run in parallel once 60a closes. 60d follows 60b. Slices 60e and 61 are independent and can run in parallel with the rest.

60a–60d + 61 are audit-and-targeted-fix slices, not redesigns; ship-blocking only if 60a's audit surfaces critical issues. 60e is a build-the-surface slice (the artist deposit-settings UI and the public booking-page deposit section do not exist today) and is ship-blocking only for any environment that still runs Stripe in test mode (the test-mode banner gate).

### 3.3 Phase D — Final MVP UX review (the gate)

Three options, run in order:

1. **Agent sweep** (10–15 min) — Explore subagent walks every public surface, returns a punch list.
2. **Together live** — founder describes flows, I sit alongside catching subtle UX problems.
3. **Both** (recommended).

Critical surfaces:

- Artist flow: signup → onboarding → first slot/trip → public preview → booking received → approve → deposit → cancel → 2FA enable
- Customer flow: `/start` ad page → demo `/bert-grimm` → submit booking → magic-link portal → reschedule/cancel
- Admin flow: `/admin` → roster → suspend/reactivate → analytics with tester exclusion
- Mobile pass: all above at 375px
- Edge cases: books closed → waitlist; cap reached → waitlist; flash booking; trip-scoped booking; honeypot + autofill

Output: prioritized punch list. Fix what matters. Then ship.

### 3.4 First real artist + 4-week soak

After punch list closes:

- Onboard at least 1 real tattoo artist outside the founder
- Run for 4 weeks with that artist using the product daily
- No upgrade prompts (Free tier only)
- Plausible firing reliably on pageviews
- No critical bugs in last 14 days

This is the gate that closes Business Model Phase 1 and unblocks Phase 2.

### 3.5 Legal next-sprint (not launch-blocking, ship in launch-week sprint)

The launch-blocker legal package (imprint/terms/dpa/AUP) shipped and was counsel-cleared on 2026-05-20. These are the remaining items from `legal/HANDOFF-TO-CLAUDE-CODE.md` §3 and `legal/COMPLIANCE-CHECK.md` §"Next-sprint fixes" — not launch-blocking, but should ship in the launch-week sprint or shortly after.

| ID  | Item                                                    | Source                                       | Notes                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-1 | Replace `/privacy` with the new copy + counsel review   | Draft Section 4                              | Adds legal bases per activity, controller/processor split, full subprocessor list (Stripe, Sentry, Upstash, Cloudflare, Google OAuth), international-transfers paragraph, minors, UK GDPR, magic-link disclosure, breach commitment, AKI/ICO complaint right. Slot the lawyer review (former OT-06 Privacy half) immediately after the text is shipped. |
| L-2 | Publish `/cookies`                                      | Draft Section 6                              | List Supabase auth cookies by name and expiry; remove the planned-flag from the footer Cookies entry.                                                                                                                                                                                                                                                   |
| L-3 | Publish `/subprocessors`                                | Draft Section 15                             | Confirm region and transfer mechanism per provider.                                                                                                                                                                                                                                                                                                     |
| L-4 | Section 8 `/[slug]` client notice                       | Draft Section 8                              | Notice block at the bottom of every public artist page incl. exact deposit wording and "artist is the seller, not Inklee" framing. Dovetails with Slice 60e.                                                                                                                                                                                            |
| L-5 | DSA notice-and-action route `/legal/report` (or `/dsa`) | Handoff §3 item 9 + draft `legal/report` row | Form + structured email acceptance; document internal moderation procedure.                                                                                                                                                                                                                                                                             |
| L-6 | Soften homepage "GDPR compliant" badge                  | Compliance R8/K1                             | Replace with "EU-hosted, GDPR-aligned" until a third-party assessment exists.                                                                                                                                                                                                                                                                           |

### 3.6 Counsel + founder open items (track to closure)

Open items from `legal/HANDOFF-TO-CLAUDE-CODE.md` §5 — these are _track to closure_ rather than build tasks. Most need counsel input; some are founder-side compliance hygiene.

| ID   | Item                                                                                      | Owner                    |
| ---- | ----------------------------------------------------------------------------------------- | ------------------------ |
| LO-1 | DPO confirmation under GDPR Art. 37 (current assumption: not required)                    | Counsel                  |
| LO-2 | PSD2 / merchant-of-record analysis for Stripe Connect deposit flow                        | Counsel                  |
| LO-3 | DSA Art. 19 micro/small-enterprise exemption scope                                        | Counsel                  |
| LO-4 | Liability-cap enforceability against sole-trader artists in Estonia                       | Counsel                  |
| LO-5 | DPIA for booking-image processing, magic-link tokens, Stripe deposit flow                 | Founder + technical lead |
| LO-6 | CCPA / CPRA monitoring threshold (when US traffic triggers a review)                      | Founder                  |
| LO-7 | Estonian VAT threshold tracking (re-issue imprint + invoicing when EUR 40k/yr is reached) | Founder                  |
| LO-8 | Marketing-claim substantiation for the "GDPR compliant" badge (closes with L-6 above)     | Founder                  |
| LO-9 | Trademark clearance for "Inklee" and "inkl.ee" (also in `DECISIONS.md` open)              | Founder                  |

---

## 4. Horizon 2 — Next (1–3 months post-launch)

Three parallel tracks once launch is stable. They don't compete much — different cognitive surfaces.

### 4.1 SEO sprint continuation

| Slice / Task                                                                | Status                                    | Notes                                                                                                                       |
| --------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 17+ Resources/\* checklist pages                                            | ⏳ Planned (4 entries reserved in footer) | Start with `/resources/tattoo-booking-form-checklist`. Same ChatGPT-brief-then-assemble protocol.                           |
| Asset delivery for 5 remaining `PlaceholderVisual` heroes                   | ⏳ Waiting on assets                      | `/about`, `/vs-calendly`, `/best-booking-app`, `/tattoo-deposit-tool`, `/tattoo-artist-waitlist`                            |
| Asset delivery for 9 custom dashed-border placeholders                      | ⏳ Waiting on assets                      | `/dm-chaos` + `/guest-spots` (heroes + product cards + artist illustrations)                                                |
| Consistency pass: center/shrink heroes on 4 SEO pages                       | ⏳ Optional, ~1h work                     | Apply guest-spot `max-w-2xl` treatment to pillar + `/instagram-booking-link` + `/tattoo-booking-form` + `/vs-instagram-dms` |
| Density retrofit on `/vs-google-forms` (and optionally `/vs-instagram-dms`) | ⏳ Optional                               | Apply Slice 13's lighter rhythm                                                                                             |

### 4.2 Tracking + observability foundation

| Slice | Title                                         | Purpose                                                |
| ----- | --------------------------------------------- | ------------------------------------------------------ |
| 63    | Tracking foundation (Plausible custom events) | Unlocks A/B test phase. Audit (Slice 62) already done. |

Slice 63 ships 6 named events: `dm_chaos_view`, `dm_chaos_cta_click`, `signup_started`, `signup_completed`, `onboarding_started`, `booking_link_created`. Server-side `signup_completed` fires once at `/onboarding/done`. Internal exclusion via `ADMIN_EMAILS` + `inklee_internal=1` cookie. Meta Pixel scaffolded but disabled.

### 4.3 Short domain Phase A — ✅ COMPLETE

Slice 54 shipped 2026-05-18 (see §2). Pure artist-link redirect surface (Option A; campaign shortlinks cut); `inkl.ee/:path* → 308 → inklee.app/:path*`. Open follow-ups: scheduled 7-day `site:inkl.ee` indexability check (~2026-05-25, routine `trig_01RSxBg76SUpnRHybR6mLUnR`); `www.inkl.ee` not set up (apex only). Slices 55–59 remain in Horizon 3.

### 4.4 Business Model Phase 2 (pricing readiness)

Quiet preparation. No public commitment, no pricing page.

| Slice  | Title                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------- |
| BM-2.1 | Cost audit (concrete Stripe / VAT / Supabase / Vercel numbers; see `business-model.md` §6 questions) |
| BM-2.2 | Schema migration for `plan_tier` enum on `profiles` + subscription columns                           |
| BM-2.3 | Stripe Customer Portal + subscription product setup (test mode first)                                |
| BM-2.4 | `canAccess(profile, feature_key)` feature-gate primitive                                             |
| BM-2.5 | Webhook extension for subscription events                                                            |
| BM-2.6 | Founder internal dogfood end-to-end                                                                  |

Excluded: `/pricing` public page, customer-facing upgrade copy, any Plus features unlocked.

### 4.5 Public artist page round 2

Pending the user-provided mockup. When it arrives:

- Audit `src/app/[slug]/page.tsx` against mockup
- List deltas
- Ship as one focused PR

Logged in `inklee_followup.md`. Not slated for a particular week.

### 4.6 Public template repo cadence

Independent track, low touch.

| Week          | Date        | Task                                        |
| ------------- | ----------- | ------------------------------------------- |
| Week 3        | 2026-05-29  | New template + README polish                |
| Week 5        | 2026-06-12  | New comparison or resource doc              |
| Week 7        | 2026-06-26  | New example + internal link audit           |
| Monthly after | 2026-07-26+ | Link audits, version bumps, react to issues |

---

## 5. Horizon 3 — Build (3–9 months)

The earnings layer. Heavier engineering. Studio is the headline.

### 5.1 Business Model Phase 3 — Solo Plus launch

Once Phase 2 architecture is dogfooded:

| Slice  | Title                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| BM-3.1 | Lock Solo Plus feature set (branding control, custom templates, more fields/trips/studios, short link, QR, lightweight analytics) |
| BM-3.2 | Wire feature gates on the locked feature set                                                                                      |
| BM-3.3 | Upgrade UI (dashboard banner → modal → Stripe Checkout → success → feature flip)                                                  |
| BM-3.4 | `/pricing` public page (drafted in `business-model.md` §7)                                                                        |
| BM-3.5 | Founder pricing window — first 100 subscribers at €24/year                                                                        |
| BM-3.6 | Email upgrade flow (welcome, receipts, payment-failure recovery)                                                                  |
| BM-3.7 | Downgrade / cancel flow (Customer Portal)                                                                                         |

**Locked pricing:** €3/month or €30/year (~17% off). Founder window: €24/year for first 100. No free trial.

### 5.2 A/B test phase (Slices 64–69)

Gated by Slice 63 firing reliably for ≥ 1 week.

| Slice | Title                                                                 |
| ----- | --------------------------------------------------------------------- |
| 64    | Marketing theme tokens (dark + bone-light)                            |
| 65    | `/dm-chaos` variant system (middleware-driven cookie assignment)      |
| 66    | Bone-light `/dm-chaos` variant                                        |
| 67    | Meta Pixel + consent gate (optional, requires cookie banner overhaul) |
| 68    | QA and data validation                                                |
| 69    | Test launch (150 EUR, 10 days), analysis, decision                    |

### 5.3 Short domain Phases B–F (Slices 55–59)

Sequencing rule: 54 → 55 → 56 (decision) → 57 / 58 / 59 in any order once 56 is resolved.

| Slice | Title                                                                   |
| ----- | ----------------------------------------------------------------------- |
| 55    | Campaign shortlinks (`src/lib/shortlinks.ts` config)                    |
| 56    | Artist shortlink decision doc (no code; output is `DECISIONS.md` entry) |
| 57    | Dashboard sharing tools (share card, QR download)                       |
| 58    | Artist public shortlinks (`inkl.ee/{slug}` per Slice 56 decision)       |
| 59    | QR + offline campaign layer                                             |

### 5.4 Studio MVP planning (Business Model Phase 4 scoping)

Design and prototype work only, NOT implementation. Trigger: Solo Plus stable for ≥ 3 months + at least 5 inbound studio inquiries.

Decisions to make before any code:

- Studio data model (new tables vs reusing existing `studios` library)
- Multi-artist permissions model
- Cancellation graceful-degradation flow
- Studio admin's visibility into artist data (privacy story for the artist)

### 5.5 Public artist page round 2 implementation

If the mockup arrived in Horizon 2, ship it in Horizon 3.

---

## 6. Horizon 4 — Later (9+ months)

### 6.1 Business Model Phase 4 — Studio MVP build

Heavy multi-tenancy work, after planning closes.

| Slice  | Title                                                              |
| ------ | ------------------------------------------------------------------ |
| BM-4.1 | Studio data model + RLS                                            |
| BM-4.2 | Artist invite + onboarding into a studio                           |
| BM-4.3 | Central inbox + request assignment                                 |
| BM-4.4 | Shared calendar + permissions                                      |
| BM-4.5 | Studio public page + per-artist links                              |
| BM-4.6 | Studio branding controls                                           |
| BM-4.7 | Studio subscription (€25/month)                                    |
| BM-4.8 | Migration path: Plus artist → joins studio (subscription handling) |

### 6.2 Business Model Phase 5 — Studio Pro / later expansion

Optional. Only if Studio MVP gets ≥ 10 paying studios and clear demand for advanced features.

| Possible feature                | Conditional                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| Studio analytics deep view      | If demanded by ≥ 3 customer studios                            |
| Guest-artist management         | If demanded                                                    |
| Demand analytics across studios | Anonymized aggregate                                           |
| Routing rules                   | Lightweight conditional assignment                             |
| Pricing differentiation         | Maybe Studio Pro at €60–80/month, or Studio + analytics add-on |

### 6.3 Business Model Phase 6 — Payment / deposit monetization research

Research only. Output is `docs/payments-strategy.md` decision doc, version 1. NOT implementation. Open questions in `business-model.md` §5 Phase 6.

### 6.4 Phase E — v0.1 Android app

Pre-conditions: Phase D punch list closed + ≥ 1 real artist on the web product.

Decision points:

- Tech stack (React Native + Expo / TWA / native Kotlin)
- Audience (artist-only vs artist + customer)
- Push notifications for requests/reminders/deposits
- Distribution (Play Store identity tied to Inklee OÜ → OT-05 must be complete)
- Offline support (which flows, if any)

### 6.5 Business Model Phase 7 — Retention and expansion (continuous from Horizon 3)

- Onboarding improvements (reduce time-to-first-booking-link)
- Educational content (videos, deposit-policy guides — extends the public template repo)
- Booking-form template marketplace
- Short-domain shareability layer fully fleshed out
- Studio referrals
- Continued SEO/GEO acquisition
- Instagram marketing loop

---

## 7. Parallel tracks (always on)

These run alongside the horizon work and don't block other slices.

### 7.1 Public template repo bi-weekly cadence

See §4.6. Independent track. Memory: `project_inklee_template_repo.md`.

### 7.2 Open follow-ups (low-priority backlog)

| ID    | Item                                                                                  | Origin                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FU-1  | Public artist page round 2 mockup                                                     | UI rework Phase 3                                                                                                                       |
| FU-2  | Outline doubling at corners (1.5px border alpha-overlap at T-junctions)               | UI rework Phase 3. Five fixes tried + rolled back. Recommended next attempt: solid (non-alpha) `--border` color.                        |
| FU-3  | Sidebar nav sub-item font-size tuning                                                 | UI rework Phase 3                                                                                                                       |
| FU-4  | Fixed-slots in-flow onboarding (link directly to slot creation from onboarding done)  | Low priority                                                                                                                            |
| FU-5  | Instagram app secret rotation                                                         | Pasted in chat 2026-05-10; founder committed to rotating later                                                                          |
| FU-6  | Storage logos public-listing                                                          | Security Advisor warning, deferred. Files are intentionally public, just shouldn't be enumerable.                                       |
| FU-7  | Marketing components don't accept `ReactNode` in body fields                          | Blocks inline cross-links. Fix path: widen body types to `ReactNode`.                                                                   |
| FU-8  | SEO-page footers use local `LandingFooter`, not config-driven                         | Build `<MinimalFooter />` variant reading only Legal group                                                                              |
| FU-9  | Homepage footer grid fixed at `md:grid-cols-5`                                        | Make responsive to `groups.length` before activating Resources                                                                          |
| FU-10 | OT-08: Feature intro modal copy (Flash, Waitlist, Travel modals scaffolded but empty) | Slice 48                                                                                                                                |
| FU-11 | `www.inkl.ee` not set up (apex only)                                                  | Slice 54 follow-up. One Cloudflare CNAME + one Vercel domain add when wanted.                                                           |
| FU-12 | `NEXT_PUBLIC_LEGAL_PENDING_REVIEW` Preview env not written                            | Non-interactive Vercel CLI blocked the all-Preview write 2026-05-20; Production is set. Add via dashboard if a preview must look final. |

### 7.3 Marketing asset delivery (founder-driven)

- 5 `PlaceholderVisual` heroes waiting on assets (see §4.1)
- 9 custom dashed-border placeholders on `/dm-chaos` and `/guest-spots`
- Decorative comment-hooks placed in code on the newer SEO pages (3 spots total)

---

## 8. Dependency map (critical path)

```
[Phase 1: Free launch] ─┬─ Pre-launch blockers (OT-02, OT-01)
                        ├─ Slices 60a–60d + 60e + 61
                        ├─ Phase D MVP gate
                        └─ First real artist + 4-week soak
                                ↓
        ┌───────────────────────┴───────────────────────┐
        ↓                                               ↓
[Phase 2: Pricing ready]                    [Slice 63: tracking foundation]
        │                                               │
        └─────────────┬─────────────────────┬───────────┘
                      ↓                     ↓
              [Phase 3: Solo Plus]    [Slices 64–69: A/B test phase]
                      │
                      ↓ (≥ 3 months stable)
              [Phase 4: Studio MVP scoping]
                      ↓
              [Phase 4: Studio MVP build]
                      ↓ (≥ 10 paying studios)
              [Phase 5: Studio Pro]

Independent: [Short domain Slice 54] (parallel with Phase 2/3)
Independent: [Short domain Slices 55–59] (sequential after 54)
Independent: [Phase 6: Payment research] (no implementation)
Independent: [Phase 7: Retention] (continuous from Phase 3)
Independent: [Phase E: Android] (after first real artist)
```

**Single longest critical chain:** Pre-launch → Phase 1 close → Phase 2 → Phase 3 Solo Plus → Phase 4 Studio scoping → Phase 4 Studio build. Each step is months. Studio realistically lands 6–12 months from now.

---

## 9. What's blocked by what (at-a-glance)

| If you want to ship...             | You must first complete...                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Public launch                      | OT-02, OT-01, Slices 60a–60d + 60e + 61, Phase D punch list                   |
| Any Plus feature gate              | Phase 2 (pricing readiness)                                                   |
| Public `/pricing` page             | Phase 2 + first 4 weeks of Free-tier real usage                               |
| A/B test on `/dm-chaos`            | Slice 63 firing reliably for ≥ 1 week                                         |
| Meta Pixel                         | Slice 67 (consent gate overhaul + cookie banner copy + privacy page revision) |
| `inkl.ee` shortlinks               | Slice 54 (DNS + redirect plumbing)                                            |
| `inkl.ee/{slug}` artist shortlinks | Slice 56 decision doc                                                         |
| Studio MVP                         | Solo Plus stable ≥ 3 months + 5 inbound inquiries                             |
| Studio Pro                         | Studio MVP ≥ 10 paying studios                                                |
| Android app                        | First real artist successful on web                                           |

---

## 10. Document map

When you need to know something, this is where it lives:

| Topic                                          | Source of truth                                  |
| ---------------------------------------------- | ------------------------------------------------ |
| High-level roadmap (this doc)                  | `docs/roadmap.md`                                |
| Slice-level technical details (slices 11+)     | `SLICES_CONTINUATION.md`                         |
| Slice-level technical details (slices 0–10)    | `SLICES.md`                                      |
| Business model + pricing                       | `docs/business-model.md`                         |
| Analytics state + A/B test plan                | `docs/analytics-audit-2026-05-14.md`             |
| Paid-plan infra upgrade triggers               | `docs/paid-plan-triggers.md`                     |
| SEO pages: which exist + density rules         | Memory: `project_inklee_seo.md`                  |
| Public template repo (separate GitHub) cadence | Memory: `project_inklee_template_repo.md`        |
| Founder follow-ups (low priority)              | Memory: `inklee_followup.md`                     |
| Architectural decisions                        | `DECISIONS.md`                                   |
| Operational runbook                            | `RUNBOOK.md`                                     |
| Agent contributor guardrails                   | `AGENTS.md`                                      |
| Public template repo content                   | github.com/mchlkrft/tattoo-booking-form-template |

---

## 11. Update protocol

Update this doc when:

1. **A slice ships** — move it from horizon section to §2 "What's shipped"
2. **A horizon transition happens** — pre-launch closes, Plus launches, etc. Bump everything down.
3. **A new follow-up or open task appears** — add to §7.2
4. **A dependency changes** — update §8 and §9
5. **Business Model phase advances** — sync this doc's BM-N entries with `business-model.md` §5

Don't:

- Duplicate slice-level details that already live in `SLICES_CONTINUATION.md`
- Duplicate strategy content from `business-model.md`
- Use this doc as a TODO list — it's a structural view; the TODO is wherever the next slice lives (memory + SLICES_CONTINUATION.md)

This doc should stay ≤ 500 lines. If it grows beyond that, the per-horizon detail has crept too deep — push it back to the slice docs.

---

**Last sanity check:** Is anything I'm working on RIGHT NOW not represented here? If yes, add it. If something here has gone stale, mark it. If a dependency I noted is wrong, fix it. The doc is only useful while it's current.
