# Inklee Roadmap (Unified View)

**Last updated:** 2026-05-16
**Current prod commit:** `8ba71e5`
**Migrations applied:** 0000–0031
**Status:** MVP feature-complete as a solo-artist tool. Pre-launch closeout in flight. No subscription/monetization layer in code yet.

**Purpose.** This is the single high-level view. For slice-level details see `SLICES_CONTINUATION.md`. For strategy and pricing details see `docs/business-model.md`. For the public template repo cadence see the memory file `project_inklee_template_repo.md`. This doc supersedes informal "what's next" summaries scattered across other places.

---

## 1. Current snapshot

10 SEO/GEO marketing pages live. Reworked About page. Public booking flow, trip planner, deposits (Stripe test mode), waitlist, slot mode, customer portal — all shipped. Stripe is deposit-only, not subscriptions. No plan/tier model in the schema. Studio multi-tenancy does NOT exist. Public template repo at `mchlkrft/tattoo-booking-form-template` v1.0.0 shipped 2026-05-15.

**The honest summary:** product is ready to launch in free mode. Monetization architecture starts after launch + first real artist + 4 weeks of clean data.

---

## 2. What's already shipped

| Milestone                                          | Status               | Reference                                           |
| -------------------------------------------------- | -------------------- | --------------------------------------------------- |
| MVP product slices 0–23                            | ✓ Shipped            | `SLICES.md`                                         |
| Pre-v0.1 extension (Slices 24–31)                  | ✓ Shipped            | `SLICES_CONTINUATION.md`                            |
| Hardening package (Slices 32–40)                   | ✓ Shipped            | RLS, rate limiting, payment hardening               |
| Post-hardening work (Slices 41–53)                 | ✓ Shipped            | Trip Planner, Flash, admin, branding                |
| Security incident recovery (2026-05-10)            | ✓ Closed             | Migrations 0026–0031                                |
| UI rework (app shell + page polish)                | ✓ Shipped            | Commits `885f9f8` + `2a4af67`                       |
| Slot location auto-tagging + studio library access | ✓ Shipped            | Commit `f42f2d2`                                    |
| 10 SEO/GEO pages live                              | ✓ Shipped            | Slices 5–8, 11–16                                   |
| Public template repo v1.0.0                        | ✓ Shipped            | github.com/mchlkrft/tattoo-booking-form-template    |
| Reworked About page                                | ✓ Shipped            | Editorial SEO layout                                |
| Analytics + roadmap A/B test docs                  | ✓ Shipped            | `docs/analytics-audit-2026-05-14.md` + Slices 62–69 |
| Business model strategy doc v0.1                   | ✓ Shipped 2026-05-16 | `docs/business-model.md`                            |

---

## 3. Horizon 1 — Now (next ~4 weeks)

Pre-launch closeout. Nothing else should accelerate until this horizon is clean. This is what blocks the public launch.

### 3.1 Pre-launch blockers (must close)

| ID     | Item                                                                                           | Effort   | Owner                              |
| ------ | ---------------------------------------------------------------------------------------------- | -------- | ---------------------------------- |
| OT-02  | Swap Stripe test → live keys (`sk_live_*`, `pk_live_*`, new webhook secret)                    | 30 min   | Founder, before first real deposit |
| OT-05c | Imprint board confirmation — confirm "Michel Kraeft, sole member of Management Board"          | 10 min   | Founder                            |
| OT-06  | ToS + Privacy lawyer review (EU/Estonian)                                                      | External | Founder → external lawyer          |
| OT-01  | Supabase Storage bucket policy: restrict `bookings` bucket writes to service role, scope reads | 1 day    | Engineering                        |

### 3.2 Pre-launch UX polish

| Slice | Title                         | Acceptance                                               |
| ----- | ----------------------------- | -------------------------------------------------------- |
| 60    | Flash feature UX optimization | `docs/flash-ux-audit-slice-60.md` + high-impact fixes    |
| 61    | Navigation + auth UI pass     | `docs/nav-auth-ui-audit-slice-61.md` + visual/copy fixes |

Both are audit-and-targeted-fix slices, not redesigns. Ship-blocking only if their audits surface critical issues.

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

### 4.3 Short domain Phase A

| Slice | Title                        | Purpose                                                                                   |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| 54    | Short domain technical setup | `inkl.ee` connected to Vercel, root → 301 → `inklee.app`, 3 hardcoded campaign shortlinks |

Pre-conditions met when launch is stable + at least 1 real artist + Plausible firing reliably. Slice 54 is the only inkl.ee work in Horizon 2. The rest of the short-domain phase (55–59) sits in Horizon 3.

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

| ID    | Item                                                                                  | Origin                                                                                                           |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| FU-1  | Public artist page round 2 mockup                                                     | UI rework Phase 3                                                                                                |
| FU-2  | Outline doubling at corners (1.5px border alpha-overlap at T-junctions)               | UI rework Phase 3. Five fixes tried + rolled back. Recommended next attempt: solid (non-alpha) `--border` color. |
| FU-3  | Sidebar nav sub-item font-size tuning                                                 | UI rework Phase 3                                                                                                |
| FU-4  | Fixed-slots in-flow onboarding (link directly to slot creation from onboarding done)  | Low priority                                                                                                     |
| FU-5  | Instagram app secret rotation                                                         | Pasted in chat 2026-05-10; founder committed to rotating later                                                   |
| FU-6  | Storage logos public-listing                                                          | Security Advisor warning, deferred. Files are intentionally public, just shouldn't be enumerable.                |
| FU-7  | Marketing components don't accept `ReactNode` in body fields                          | Blocks inline cross-links. Fix path: widen body types to `ReactNode`.                                            |
| FU-8  | SEO-page footers use local `LandingFooter`, not config-driven                         | Build `<MinimalFooter />` variant reading only Legal group                                                       |
| FU-9  | Homepage footer grid fixed at `md:grid-cols-5`                                        | Make responsive to `groups.length` before activating Resources                                                   |
| FU-10 | OT-08: Feature intro modal copy (Flash, Waitlist, Travel modals scaffolded but empty) | Slice 48                                                                                                         |

### 7.3 Marketing asset delivery (founder-driven)

- 5 `PlaceholderVisual` heroes waiting on assets (see §4.1)
- 9 custom dashed-border placeholders on `/dm-chaos` and `/guest-spots`
- Decorative comment-hooks placed in code on the newer SEO pages (3 spots total)

---

## 8. Dependency map (critical path)

```
[Phase 1: Free launch] ─┬─ Pre-launch blockers (OT-02, OT-05c, OT-06, OT-01)
                        ├─ Slices 60 + 61
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
| Public launch                      | OT-02, OT-05c, OT-06, OT-01, Slices 60 + 61, Phase D punch list               |
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
