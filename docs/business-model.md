# Inklee Business Model and Pricing Roadmap

**Status:** Working draft, 2026-05-16. Not implementation-ready. No public pricing commitments until Phase 2 cost audit is signed off.

**Purpose:** Single document that both Claude Code and ChatGPT can reference to stay aligned on positioning, target users, pricing direction, and what NOT to build yet. Update this doc when strategic direction changes.

**Owner:** Michel Kraeft (founder, tattoo artist, Inklee OÜ).

---

## 1. Business Model Source of Truth

> Copy this section verbatim into ChatGPT prompts to keep planning aligned. Stays short on purpose.

**Positioning.** Inklee is the cleanest way for tattoo artists to turn Instagram attention into organized booking requests. Not an all-in-one studio OS, not a client-facing marketplace, not a generic scheduler. (Scoped 2026-07-17: the Inklee 2.0 guest spot map is artist-facing discovery of studios and shops, which is a stated competitive stance; the guardrail that clients come from the artist's own audience stays intact.)

**Target users (in order).** Solo freelance tattoo artists. Beginner to 1–3 years professional. Instagram-first. Traveling / guest-spot artists. Small tattoo studios later.

**Pricing direction (planned, not implemented).**

| Tier             | Approx price                                 | Purpose                                                                                                        |
| ---------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Free Starter** | €0                                           | Real alternative to Instagram DMs and Google Forms. Genuinely usable. **Manual deposit tracking only.**        |
| **Solo Plus**    | **€3/month or €24/year (first-year window)** | Polish + control **+ in-app card-deposit collection (Stripe Connect).** The flagship upgrade.                  |
| **Studio**       | ~€25/month                                   | Future paid layer for studios. **"Coming later" teaser only — not priced/built until solo data justifies it.** |

No free-forever promises. Decision locked 2026-05-16: monthly anchor €3. **Updated 2026-06-05 (resolves D-d):** yearly **first-year window = €24** (standard €30 later); **in-app Stripe-connected card deposits are GATED behind Solo Plus**, so every Custom Connect account is attached to a paying subscriber (the subscription offsets Stripe's ~€2/mo per-active-account cost; the **3% deposit fee stays** as the margin). Free artists collect deposits **manually** (bank transfer + mark-received). **Implication: a minimal subscription/billing layer (BM-2) + a deposit feature-gate become a LAUNCH dependency** — deposits can't be Plus-gated without billing. See `DECISIONS.md` D-d + roadmap §3/§4.4.

**Competitive stance vs Venue Ink.** Don't try to be Venue with fewer features. Compete by being sharper, lighter, Instagram-first, guest-spot-native, GDPR-conscious, less fee-heavy. Request-intake-first, not business-OS.

**What NOT to build yet.**

- Subscription billing infrastructure (Phase 2)
- Studio multi-tenancy (Phase 4 — doesn't exist today)
- Stripe Connect payout splits, commission accounting (Phase 5 at earliest)
- 5+ plan ladders, "Enterprise" tiers, transaction-fee dependencies
- Public pricing page (Phase 3)

**Monetization principles.**

1. Adoption first; the free tier must be usable, not crippled.
2. Solo pricing stays almost frictionless.
3. Studios are the main paid layer later.
4. No transaction-fee dependency at launch.
5. Monetize advanced structure, not basic survival.
6. Tattoo-native language; no corporate SaaS framing.

---

## 2. Current Feature Stack Audit

Source: as of prod commit `7c9d470` (2026-05-16), migrations 0000–0031, with reference to `SLICES.md`, `SLICES_CONTINUATION.md`, the trip-planner audit, and the analytics audit.

### 2.1 Shipped and stable (Free-tier candidates)

| Feature                              | State                   | Notes                                                                                                         |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Auth (email/password + Google OAuth) | ✅ stable               | Supabase Auth, MFA recovery built                                                                             |
| Artist profile + slug system         | ✅ stable               | `RESERVED_SLUGS`, claim flow                                                                                  |
| Public booking page `/[slug]`        | ✅ stable               | Server component, charcoal/bone theme                                                                         |
| Structured booking form              | ✅ stable               | Idea, placement, size, references, contact                                                                    |
| Custom fields                        | ✅ stable               | Slice 11/12                                                                                                   |
| Standard-field toggles               | ✅ stable               | Slice 14 (profile.settings.form_settings)                                                                     |
| Image upload                         | ✅ stable               | Client-side compression for Vercel Hobby 4.5MB cap                                                            |
| Honeypot anti-spam                   | ✅ stable               | `inklee_hp_check` field                                                                                       |
| Artist dashboard + bookings views    | ✅ stable               | Overview / calendar / waitlist / requests                                                                     |
| Approve / reject / status actions    | ✅ stable               | Plus cancel-by-artist with customer notification                                                              |
| Deposit STATE workflow               | ✅ stable               | Slice 16 — status columns, due dates, notes                                                                   |
| Deposit payment (Stripe TEST mode)   | ✅ stable, ⚠️ test keys | Slice 17. Live keys swap = OT-02 pre-launch task                                                              |
| Email notifications                  | ✅ stable               | Supabase + Resend-style flow                                                                                  |
| Editable email templates             | ✅ stable               | Per-artist overrides                                                                                          |
| Customer magic-link portal           | ✅ stable               | `/request/[token]`, view/reschedule/cancel                                                                    |
| Calendar (artist-side)               | ✅ stable               | Dashboard + bookings calendar views                                                                           |
| Books open/closed                    | ✅ stable               | `BooksClosedBlock` on `/[slug]`                                                                               |
| Booking cap                          | ✅ stable               | Tied to `books_settings`                                                                                      |
| Slot mode (`fixed_slots`)            | ✅ stable               | Plus slot↔trip location auto-tag (slice f42f2d2)                                                              |
| Waitlist                             | ✅ stable               | Books-closed and cap-reached funnel into waitlist                                                             |
| Trip Planner (guest spots)           | ✅ stable               | Trips + trip_legs + studios (Slice 41, polished Slice 52)                                                     |
| Studios library                      | ✅ stable               | Per-artist with visibility_mode (`public_exact_address`, `public_area_only`, `after_approval_only`, `hidden`) |
| Client history                       | ✅ stable               | Slice 50                                                                                                      |
| Notification center                  | ✅ stable               | In-app, also email digest                                                                                     |
| Artist analytics                     | ✅ stable               | Personal dashboard view                                                                                       |
| Admin analytics + tester exclusion   | ✅ stable               | Slice 51                                                                                                      |
| Onboarding (5-step)                  | ✅ stable               | Welcome → claim-slug → … → done                                                                               |
| Legal/privacy pages                  | ✅ stable               | Imprint with Estonian registrikood, privacy mentions Plausible only                                           |
| Observability (Sentry)               | ✅ stable               | Slice 11                                                                                                      |
| Rate limiting                        | ✅ stable               | Slice 34, Upstash Redis                                                                                       |
| Authorization hardening              | ✅ stable               | Slices 33 + 0030/0031 RLS sweep                                                                               |
| Cleanup cron                         | ✅ stable               | Stale booking cleanup, Instagram refresh, reminders                                                           |
| Flash feature                        | ✅ stable               | Flash items + flash days                                                                                      |
| Instagram thumbnail caching          | ✅ stable               | Slice (`6ed5575`), cached to `logos` bucket                                                                   |
| 10 SEO/GEO marketing pages           | ✅ live                 | Pillar + 4 product + 3 comparison + listicle + brand pages                                                    |
| Plausible analytics (passive)        | ✅ live                 | Pageviews only; no custom events yet                                                                          |

### 2.2 Partially built or not production-ready

| Feature                       | State                                  | Gap                                                                                   |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| Stripe LIVE keys for deposits | ⏳ pending OT-02                       | Test mode today. Swap before first real payment.                                      |
| Instagram OAuth + sync        | ✅ shipped, ⚠️ secret rotation pending | App secret pasted in chat 2026-05-10, rotation deferred                               |
| Reminder customization        | ⚠️ minimal                             | Customer reminder + deposit reminder crons exist but per-artist customization is thin |
| Custom email templates        | ✅ exists but unclear how heavily used | UI for editing exists; few default templates                                          |
| HEIC image support            | ⏳ deferred                            | Requires libheif in Vercel sharp build                                                |

### 2.3 Planned but not started (roadmap-only)

| Feature                                    | Slice                      | Notes                                         |
| ------------------------------------------ | -------------------------- | --------------------------------------------- |
| Short domain `inkl.ee` redirect-only setup | 54 (post-launch)           | Gated by stable launch                        |
| `inkl.ee/{slug}` artist shortlinks         | 56–58 (post-launch)        | Decision doc first (56), implementation later |
| Dashboard share card + QR                  | 57 (post-launch)           | Per-artist sharing UI                         |
| QR code asset generation                   | 59 (post-launch)           | Print/offline campaign layer                  |
| Public-launch UX polish                    | 60–61 (pre-launch)         | Flash UX audit + nav/auth audit               |
| Plausible custom events                    | 63 (post-launch A/B phase) | dm_chaos_view, signup_completed, etc.         |
| Marketing theme tokens (light)             | 64 (post-launch A/B phase) | Bone-light variant                            |
| /dm-chaos variant system                   | 65 (post-launch A/B phase) | Middleware-driven                             |
| Meta Pixel + consent gate                  | 67 (post-launch A/B phase) | Requires cookie banner overhaul               |
| Resources/\* checklist pages               | 17+ (SEO sprint)           | Footer entries reserved                       |
| **Subscription billing**                   | **NOT in current roadmap** | This doc proposes Phase 2 below               |
| **Studio multi-tenancy**                   | **NOT in current roadmap** | This doc proposes Phase 4 below               |

### 2.4 Honest summary

The product is **feature-complete as a solo-artist MVP**. What's missing for monetization:

1. **No plan/tier model in the schema.** Adding it is a Phase 2 task.
2. **No subscription billing.** Stripe exists for per-booking deposits only.
3. **No multi-tenancy.** Studios are not a concept the data model supports.
4. **No feature gating primitive.** Right now every feature is on for every artist.
5. **Public launch checklist is not closed.** Slices 60 + 61, OT-02 (Stripe live), OT-03c (board confirmation), OT-06 (legal review) all pending per `project_inklee_roadmap.md`.

**Pricing should not ship before launch. The free tier IS the launch.**

---

## 3. Recommended Free / Solo Plus / Studio Split

The principle: Free is generously useful. Plus adds polish + brand control. Studio unlocks multi-artist workflow that simply doesn't exist in Free or Plus.

### 3.1 Free Starter

**Goal.** A solo tattoo artist can put `inklee.app/{slug}` in their Instagram bio and replace DMs / Google Forms / spreadsheets, no upgrade required.

**Includes (all already shipped):**

- Account + Google OAuth
- Artist profile + claimed slug
- Public booking page with charcoal/bone default theme
- Structured booking form (idea, placement, size, references, dates, contact)
- Image uploads (5 images max, compressed)
- Booking dashboard with calendar, requests, waitlist, clients views
- Approve / reject / cancel actions + customer email notifications
- Deposit status workflow (pending → received), with the safe wording locked in
- Customer magic-link portal
- Books open / closed + booking cap
- Slot mode (`fixed_slots`)
- Waitlist
- Trip planner with up to N trips/legs/studios (limit decided in Phase 2 cost audit)
- Standard email templates (read-only or limited edit)
- Default Inklee branding on public page (subtle footer, not intrusive)

**Soft limits to set in Phase 2 (don't pick numbers yet):**

- Active trips at a time (suggested: 2–3)
- Active studios in library (suggested: 3–5)
- Custom fields per artist (suggested: 0–3)
- Open booking requests per month (suggested: unlimited but with rate-limit + abuse caps)
- Image attachment retention (suggested: 6–12 months, then archival)

**Free should NOT include:**

- Removal of "Powered by Inklee" footer on public booking page
- Custom email-template wording
- More than ~3 custom fields
- Short `inkl.ee/{slug}` (when shipped — slice 58)
- Lightweight per-artist analytics beyond Plausible pageviews

### 3.2 Solo Plus

**Goal.** A €2/month-feels upgrade that signals "I'm taking this seriously" without acting like a business expense.

**Includes (mostly already-built features, gated):**

- **Branding control.** Remove or reduce "Powered by Inklee" on the public booking page. Custom cover image + cover color (already shipped — just gate the toggle).
- **Custom email templates.** Full edit access on all template types (`customer_booking_submitted`, `customer_booking_approved`, etc.).
- **More custom fields.** Lift cap from 3 → 10 (numbers tentative).
- **More active trips / studios.** Lift trip cap (suggested 10), studio library cap (suggested 15).
- **Expanded waitlist controls.** Per-trip waitlist, priority hints (already exists at data layer; surface as UI toggle).
- **Short `inkl.ee/{slug}` link.** When shipped (slice 58). Default redirect target.
- **QR code download.** When shipped (slice 57/59).
- **Reminder customization.** Custom reminder windows, custom wording.
- **Lightweight personal analytics.** Booking-status breakdown, conversion rate from view→submit, basic source attribution (UTMs).
- **Priority feature access.** Beta access to new features one cycle before Free.

**Solo Plus should NOT include (avoid scope creep):**

- Multi-artist support (Studio territory)
- Payment processing fees built into the plan
- Advanced studio routing
- Anything requiring elevated trust on day one (cross-account data access, AI features, etc.)
- "Custom domain" support — that's a complexity black hole

### 3.3 Studio

**Goal.** A real product layer for studios with multiple artists. Has to be Built Before Charged.

**Includes (mostly NOT YET BUILT — these need Phase 4):**

- Studio account (separate entity model: `studios` becomes multi-artist context)
- Studio profile / page (central booking surface)
- Multiple artists per studio
- Per-artist booking links + a central studio link
- Central request inbox (all artists' incoming requests)
- Assign / reassign requests between artists
- Shared calendar view across artists
- Per-artist permissions (booking-only, admin, etc.)
- Studio-level branding (logo, cover, color, slug)
- Studio-level waitlist (cross-artist)
- Studio-level guest-spot overview
- Studio analytics (per-artist + aggregate)
- Routing rules (lightweight: e.g. "Black-and-grey requests → Artist A")
- Guest-artist add (temporary access for a guest)

**Studio should NOT start with:**

- Payout splitting (Stripe Connect, complex)
- Commission accounting
- Tax-document automation
- Full studio finance suite
- Marketplace features

Those are post-Studio-Pro, much later, and gated by real Studio customer demand.

---

## 4. Pricing Strategy + €2/month Viability Analysis

### 4.1 Cost model (rough, EU, gross prices VAT-inclusive)

**Fixed monthly infra at modest volume (~100 active users):**

- Vercel Pro: ~€20/month (needed once Hobby caps bite)
- Supabase Pro: ~€25/month (needed for PITR window, HIBP, log retention)
- Plausible: €9/month (currently free trial; will require subscription)
- Resend or equivalent transactional email: ~€0–20/month at this volume
- Sentry: free tier sufficient
- Domain renewals: ~€10/year amortized
- **Total fixed: ~€55–75/month**

**Variable per Solo Plus subscriber per €3 charge (monthly billing):**

- Gross: €3.00
- VAT (avg 20% across EU): -€0.50 (Inklee remits)
- Net: €2.50
- Stripe card fee (1.5% + €0.25, EU recurring): -€0.30
- Stripe Tax service (0.5%): -€0.02
- **Net to Inklee per monthly charge: ~€2.18**

**Variable per Solo Plus subscriber for €30 charge (annual billing):**

- Gross: €30.00
- VAT (avg 20%): -€5.00
- Net: €25.00
- Stripe card fee: -€0.70
- Stripe Tax: -€0.15
- **Net to Inklee per annual charge: ~€24.15 = €2.01/month equivalent**

Note: at these prices monthly is actually slightly more profitable per charge than yearly (€2.18 vs €2.01/month equivalent), because Stripe's percentage fee compounds while the fixed €0.25 component is amortized 12× on monthly. Yearly still wins net because it collapses 12 retry/dunning windows into 1, eliminates partial-month churn, and dramatically reduces both failed-payment ops cost and support burden.

### 4.2 Contribution per user

Subtract amortized infra per active user (at 100 users, €65 fixed ÷ 100 = €0.65/user):

- **Monthly Plus contribution: ~€1.53/user/month** (€2.18 − €0.65 amortized infra)
- **Annual Plus contribution: ~€1.36/user/month** (€2.01 − €0.65 amortized infra)

At 500 active users, amortized infra drops to ~€0.13/user. Annual contribution rises to ~€1.88/user/month; monthly to ~€2.05/user/month.

At 1000 active users, amortized infra ~€0.07/user. Monthly contribution ~€2.11/user/month → ~€2,110 monthly net at that scale.

### 4.3 The support-time constraint

**Support time remains the dominant operational risk, even at €3.**

- 1 hour of founder time per Plus user per year (at €60/hr) = €5/year = €0.42/month
- At €3/month that wipes ~25% of margin (vs 30–60% at €2)
- A single refund (Stripe doesn't refund the €0.25 fixed fee) wipes 1.5 months of contribution

A solo founder can afford **roughly 20 minutes of support time per Plus user per year** at €3/month before margins compress to unworkable. €3 buys real breathing room compared to €2, but the binding constraint is still operational, not Stripe-fee math.

### 4.4 Recommendation (3-tier model preserved)

**Solo Plus pricing (locked 2026-05-16):**

| Option              | Recommendation                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Public anchor**   | **€3/month**                                                                                               |
| **Yearly billing**  | **€30/year** (≈ €2.50/month equivalent, ~17% off)                                                          |
| **Monthly billing** | **€3/month**                                                                                               |
| **Founder pricing** | First 100 Plus subscribers get €24/year (≈ €2/month equivalent). Locks them in, builds early word-of-mouth |
| **Free trial**      | None at launch. Free Starter is the trial.                                                                 |

**Why these specific numbers:**

- **€3 / €30** is the cleanest pair of round numbers in this range. €36/year yields slightly better unit economics but the "save ~17%" yearly framing is more honest at €30.
- **€3/month** sits in the "tiny upgrade" psychological zone without crossing into "this isn't real software" territory. At €2 the price reads amateur; at €5 it reads as a budget decision. €3 reads as a coffee.
- **Founder pricing at €24/year** rewards early adopters with the original €2 anchor while keeping unit economics defensible.
- **No free trial.** Free Starter IS the trial. A separate trial layer adds churn at the worst time (post-payment) and lengthens time-to-revenue.

**Studio pricing:** €25/month works at very different math. At €25 with similar Stripe fees:

- Gross €25, net €20.83, Stripe ~€0.63, net €20.20/month
- Studios have higher support tolerance (they're paying enough that 30 minutes/month feels reasonable)
- Margin per studio at 20 active studios = €400+/month contribution
- Monthly billing is fine here; annual a 10% discount option (€270/year)

### 4.5 What the €3/month price signals (and risks)

**Signals (good):**

- "Small upgrade from inside the scene" not "business software"
- Tiny enough that it feels frictionless, big enough that it doesn't read as amateur
- Tattoo-native pricing, not SaaS pricing
- Defensible vs Venue (which charges substantially more)
- Leaves room to raise to €4 or €5 later if needed without breaking the brand promise

**Risks (worth tracking):**

- Still on the thin side; high support load on any single user wipes margin
- Refund / dispute handling proportionally expensive
- Pricing-up later is still hard psychologically; better to grandfather than to raise
- Some price-sensitive beginners may still find €36/year intimidating despite the "€3" anchor

**Mitigation:**

- Lead with the **€3/month** anchor on the pricing page; show yearly as an option below ("Save 17% with yearly")
- Founder pricing for first 100 catches the most price-sensitive segment without committing to a permanent lower tier
- Keep Free Starter genuinely useful so Plus is the upgrade for those who want more, not the rescue from a crippled tier
- Position Plus as "support the project + get a few extras" not as "unlock the real product"

---

## 5. Business Model Roadmap (Phases 1–7)

Each phase = a stage gate. Don't enter Phase N+1 until N's checklist is met.

### Phase 1 — Launch Free Product

**Status:** ⏳ In progress. Pre-launch checklist mostly met; final UX polish in flight.

**Goal:** Ship Inklee publicly with Free tier as the only experience. No pricing surfaces, no upgrade prompts, no plan model in schema.

**Slices:**

- **1.1 Pre-launch closeout** — finish OT-02 (Stripe live keys), OT-06 (legal review). OT-05c (board confirmation) closed 2026-05-18 — imprint accepted as-is. Tracked in `project_inklee_roadmap.md`.
- **1.2 Slices 60 + 61** — Flash UX audit + nav/auth UI pass.
- **1.3 First real artist onboarding** — at least one paying-customer-grade artist completes signup → onboarding → public booking page → first real booking. No upgrade pressure.
- **1.4 Free tier feature freeze** — Document which features are Free, in code or in this doc. Nothing else moves.

**Excluded:** Any subscription work, any pricing page, any feature-gate primitive.

**Risk:** Adding pricing too early kills adoption. Adoption is the moat.

**Decision needed:** When is "launched"? Suggestion: 2 real artists actively using, no critical bugs in 7 days, Plausible firing pageviews reliably.

### Phase 2 — Pricing Readiness

**Status:** Not started. Cannot start until Phase 1 closed.

**Goal:** Quietly prepare the subscription architecture without committing to public pricing.

**Slices:**

- **2.1 Cost audit** — Hard numbers on Vercel Pro / Supabase Pro upgrade triggers (see `docs/paid-plan-triggers.md`), Stripe EU rates, Plausible subscription, email costs, VAT/OSS registration overhead.
- **2.2 Schema for plans** — Add `plan_tier` on `profiles` (enum `free | plus | studio`), `subscription_status`, `current_period_end`, `plan_started_at`. Migration tagged but kept as TBD until 2.3.
- **2.3 Stripe Customer Portal + subscription product** — Decision: build directly on Stripe Subscriptions API vs Stripe Checkout + Customer Portal. Recommendation: Checkout + Customer Portal (lowest custom UI).
- **2.4 Feature gate primitive** — `canAccess(profile, "feature_key")` helper. Returns boolean; centralizes plan-to-feature mapping. Used everywhere feature gating happens.
- **2.5 Webhooks** — Extend `src/app/api/stripe/webhook/route.ts` to handle subscription events (`customer.subscription.created`, `.updated`, `.deleted`, `invoice.payment_failed`).
- **2.6 Internal dogfood** — Founder runs through Plus signup end-to-end on test mode, confirms everything.
- **2.7 No public commitment.** No `/pricing` page yet. No Plus features unlocked in UI yet.

**Excluded:** Any public mention of pricing. Customer-facing copy. Public upgrade prompts.

**Risks:**

- Stripe Tax setup for EU compliance is non-trivial
- OSS VAT registration takes weeks
- Refund-handling policy needs to exist before first paying customer

**Decisions needed:**

- Yearly default vs monthly default in checkout
- Founder pricing window: first 50, 100, or 250?
- Whether to expose monthly at €3 or remove it entirely

### Phase 3 — Solo Plus Launch

**Status:** Not started. Gated by Phase 2.

**Goal:** Ship Solo Plus to the public with the feature set defined in section 3.2.

**Slices:**

- **3.1 Finalize Solo Plus feature set** — Confirm the section 3.2 list against actual code, lock numbers (custom-field cap, trip cap, etc.).
- **3.2 Feature gates wired** — Branding toggle, email-template editor full access, expanded caps, etc. all guard on `plan_tier`.
- **3.3 Upgrade UI** — In-app upgrade flow: dashboard banner (subtle, dismissable) → upgrade modal → Stripe Checkout → success state → feature flip in next page load.
- **3.4 `/pricing` public page** — Tattoo-native copy (draft in section 8 below). Three-card layout.
- **3.5 Founder pricing window** — Coupon code or pricing-page conditional for first N subscribers.
- **3.6 Email upgrade flow** — Welcome email on Plus signup, billing receipts, payment-failure recovery emails.
- **3.7 Downgrade / cancel flow** — Customer Portal handles it. App downgrades feature access at period end, doesn't break their setup.

**Excluded:** Studio anything. Multi-currency. Custom-domain support.

**Risks:**

- Free-to-Plus conversion lower than expected at first (this is OK — give it 3 months before changing)
- Plus subscriber asking for features that are "obviously" Plus-tier but weren't included
- VAT invoice complaints from EU consumers — make sure Stripe Tax invoicing is on

**Decisions needed:**

- Soft launch (existing artists only) vs full public launch
- Whether to show Studio "coming soon" on the pricing page

### Phase 4 — Studio MVP

> **Strategy revision, founder decision 2026-07-17.** The Studio tier's identity is redefined by the Inklee 2.0 track (guest spot map + studio network, planning SoT in `docs/product/`): a studio owner is a guest spot host with a public map page, a guest spot request inbox, workspace management, and a studio group. The multi-artist BOOKING multi-tenancy slices below (4.1 to 4.9) are no longer the Studio tier's definition; they become a possible later expansion of it. The `studios_v2` name is retired in favor of the 2.0 namespacing (`docs/product/inklee-2-schema-proposal.md`). The 2.0 track is planned and built now, ahead of this phase's stability gate; that override applies to the BUILD only. When studio owners start paying, and whether that is this tier or a variant, stays open as 2.0 open question Q8. The phase gate below still governs the booking-multi-tenancy expansion.

**Status:** Not started. Heavy build phase. Gated by Phase 3 stable for ≥ 3 months and at least 5 inbound studio inquiries.

**Goal:** Add multi-tenancy and ship a real Studio tier that delivers genuine value at €25/month.

**Slices:**

- **4.1 Studio data model** — New `studios_v2` table (current `studios` is per-artist venue library; this is the multi-tenancy entity). Relations: studio has many artists, artist belongs to at most one studio. RLS for studio scope.
- **4.2 Invite + onboarding flow** — Studio admin creates studio → invites artists by email → artist accepts → joins studio.
- **4.3 Central inbox** — Cross-artist request feed; assign / reassign UI.
- **4.4 Shared calendar** — Multi-artist view with per-artist color/filter.
- **4.5 Studio public page** — One central booking page for the studio + per-artist booking links beneath.
- **4.6 Permissions model** — `studio_admin`, `studio_artist`, `studio_guest` roles. Most-restrictive default.
- **4.7 Studio branding** — Logo, cover image, color, custom slug.
- **4.8 Studio subscription** — €25/month, billed monthly default. Replaces (or supplements) individual artists' subscriptions.
- **4.9 Migration path** — Existing Plus artist who joins a studio → studio absorbs their subscription if applicable.

**Excluded:** Payout splitting. Commission accounting. Cross-studio features. Marketplace-style discovery.

**Risks:**

- Multi-tenancy is the highest-risk architectural change. Test rigorously.
- RLS gets harder. Trip planner audit showed how careful policies need to be.
- Studio admin can theoretically see all artist booking data — privacy story for the artist needs care.
- Studio cancellation when artists depend on it = nightmare. Cancellation flow needs to gracefully degrade artists to Free or Plus.

**Decisions needed:**

- Build greenfield Studio surface vs retrofit existing artist app
- Whether artists in a studio have their own Plus subscription too, or whether studio subscription covers them

### Phase 5 — Studio Pro / Later Studio Expansion

**Status:** Not started. Optional. Triggered by Studio MVP stability + at least 10 paying studios + measurable demand for advanced features.

**Goal:** Add deeper studio capabilities for studios that need them, possibly as a higher-tier "Studio Pro".

**Slices:**

- **5.1 Studio analytics** — Per-artist performance, peak times, conversion funnels, demand by city
- **5.2 Guest-artist management** — Time-bounded studio membership for visiting artists. Note 2026-07-17: the 2.0 base studio role already ships a version of this (the 14-day group guest window); if Studio Pro happens, this slice becomes the advanced form, not the first form.
- **5.3 Demand analytics** — Cross-studio aggregate (anonymized) to help artists pick guest-spot cities. Note 2026-07-17: the 2.0 map's anonymous artist counts are adjacent; keep the Pro version distinct (demand, not presence) or reassign consciously.
- **5.4 Routing rules** — Light-weight conditional assignment ("blackwork → artist A")
- **5.5 Payout research** — Document feasibility of Stripe Connect splits. Don't build. Decision only.
- **5.6 Pricing differentiation** — Maybe Studio at €25 stays the same, Studio Pro at €60–80/month. Or Studio at €25 with add-on "Studio Analytics" at €15/month. Decide based on actual customer feedback.

**Excluded:** Anything that requires Stripe Connect implementation until Phase 6 research is done.

### Phase 6 — Payment / Deposit Monetization Research

**Status:** Research only. Don't implement. Output is a decision doc.

**Goal:** Decide whether Inklee monetizes deposit/payment processing at all, and if so, how.

**Open questions:**

- Should Inklee take a percentage of deposits? (Likely no — adds artist resistance, complicates pricing story)
- Should Inklee pass through Stripe's deposit fees, or absorb them? (Currently absorbed)
- Stripe Connect Express vs Standard? (Express = Inklee acts as platform, more legal exposure)
- KYC/AML obligations if Inklee handles funds vs pure pass-through
- Multi-artist studio payout splits — needed at all, or studio admin handles?

**Output:** A `docs/payments-strategy.md` decision doc, version 1. Not code.

**Excluded:** Implementation.

### Phase 7 — Retention and Expansion

**Status:** Continuous from Phase 3 onward.

**Goal:** Grow the funnel above the pricing layer (acquisition + activation) and keep paid users engaged.

**Slices:**

- **7.1 Onboarding improvements** — Reduce time-to-first-booking-link
- **7.2 Educational content** — How-to videos, deposit-policy guides (the public template repo is part of this)
- **7.3 Templates marketplace** — Curate share-able booking-form templates artists can copy
- **7.4 Short-domain shareability layer** — `inkl.ee/{slug}` + QR + Instagram bio link tools (Slices 54–59 from existing roadmap)
- **7.5 Studio referrals** — One artist sees Studio in action, refers their studio, gets a credit
- **7.6 SEO/GEO acquisition** — Continue the resource page sprint (Resources footer group)
- **7.7 Instagram marketing loop** — User-generated Instagram bio links → traffic → signups

---

## 6. Cost and Risk Questions to Answer Before Phase 2

These are the things Claude or ChatGPT can't answer for the founder — they need real research with concrete numbers.

1. **Stripe EU recurring pricing — exact rate.** Card 1.5% + €0.25 is the public rate but enterprise tiers exist. Worth a sales conversation if volume is >€1k/month.
2. **OSS (One Stop Shop) VAT registration.** Estonian companies selling B2C across EU need OSS. Registration steps, monthly returns, accounting cost.
3. **Stripe Tax service cost vs DIY VAT.** Stripe Tax is 0.5% on transaction; DIY tax handling is "free" but adds founder time.
4. **Refund / chargeback policy.** EU consumer law gives 14-day cooling-off period for digital services. How does Plus handle a refund-after-13-days request?
5. **Plausible subscription tier.** Currently on free trial probably. The "10k pageviews/month" tier is $9 or so.
6. **Resend transactional email pricing at scale.** Free up to a point, then per-email pricing.
7. **Vercel Pro upgrade trigger volume.** Hobby has hard limits; at what active-user count do they bite? (`docs/paid-plan-triggers.md` tracks this.)
8. **Supabase Pro upgrade trigger volume.** Same question for HIBP, PITR, egress.
9. **Founder hours available per week.** Realistic capacity for support, especially in the first 3 months post-launch.
10. **Support automation potential.** What % of likely support tickets can be deflected via docs, in-app help, video?
11. **Multi-tenancy schema migration risk.** What's the rough effort estimate to add Studio account? (Could be 2 weeks, could be 2 months.)
12. **Pricing-currency strategy.** EUR-only at launch is safest. When does a USD/GBP option pay back its complexity?

---

## 7. Pricing Page Messaging Draft

For when Phase 3 finally lands. Tattoo-native, no SaaS framing. Keep it short.

### Header

```
Pricing
```

(No "Plans and pricing", no "Choose your plan", no "Find the right fit". Just the word.)

### Subhead

```
Three options. The free one is genuinely useful.
```

### Free Starter card

```
Free Starter
€0

Use Inklee like you use Instagram.
Free for solo tattoo artists.

What you get:
- One public booking page with your link
- A structured tattoo request form
- Booking review, approval, deposit status, waitlist
- Trip planner for guest spots
- Email notifications
- Customer portal

Get started →
```

### Solo Plus card

```
Solo Plus
€3/month
(or €30/year — save 17%)

A small upgrade for solo artists who want more polish and control.

Everything in Free, plus:
- Remove "Powered by Inklee" on your booking page
- Custom email templates
- More custom fields, trips, and studios
- Short inkl.ee link + QR code
- Reminder customization
- Booking analytics
- Beta access to new features

Upgrade when you're ready.
```

### Studio card

```
Studio
€25/month

For studios with multiple artists.

Everything in Plus, plus:
- A studio profile and booking page
- Multiple artists under one studio
- Central request inbox
- Assign and reassign requests
- Shared calendar
- Per-artist permissions and visibility
- Studio branding

Built for the way real studios work.
```

### Footer

```
Built by a tattoo artist, for tattoo artists. No fake testimonials. No "free forever" lies. Cancel any time.
```

### What NOT to put on the pricing page

- Comparison tables longer than the cards themselves
- "Most popular" badges (we don't know yet)
- Discounts presented as "save 50%" (they're not — they're billing differences)
- Trial countdowns
- Email-capture lead magnets before the pricing CTA
- Anything mentioning "enterprise"
- Anything mentioning competitors by name

---

## 8. Strategic Warnings (where €3/month still gets risky)

1. **Support time is the binding constraint, not Stripe fees.** Watch this monthly. If average support time per Plus user exceeds 20 min/year, margins compress fast. €3 gives ~2× headroom vs €2 but doesn't eliminate the risk.
2. **Refund handling.** Stripe doesn't refund fixed fees. Set a clear refund policy at Phase 2: full refund within 14 days (legal minimum in EU), no refund after that. Document.
3. **EU VAT complexity.** OSS registration is mandatory. Stripe Tax is the path of least resistance. Don't DIY VAT in 27 jurisdictions.
4. **Migration to higher pricing later is hard.** €3 → €4 or €5 in 12–18 months is plausible without major backlash if Plus value has clearly grown. Always grandfather existing subscribers when raising.
5. **Free tier cannibalization.** If Plus features feel like obvious add-ons rather than genuinely useful upgrades, artists won't upgrade. The Plus value prop has to be tangible (branding control, customization, share tools) not artificial gating.
6. **The €3 price still reads slightly indie.** This is mostly a feature, not a bug — it matches the tattoo-native brand. But it does cap perceived seriousness for studio-evaluation conversations. The Studio tier at €25 carries the "we're serious about this" signal; don't try to make Plus carry it too.
7. **Currency.** EUR-only is fine for EU artists. US/UK artists may bounce. Address this only if it becomes a real demand signal, not preemptively.
8. **Studio at €25 is the real economic lever.** Plus is mostly defensive (so Free doesn't look gateway-locked). Plan accordingly: don't burn founder time on Plus features if it slows Studio.

---

## 9. Next Implementation Step

**Do not implement pricing yet.**

The current step is **Phase 1 closeout**, not Phase 2. Specifically:

1. **Finish OT-02** — swap Stripe live keys when ready for first real deposit
2. ~~**OT-05c**~~ — ✓ Closed 2026-05-18, imprint accepted as-is
3. **Finish OT-06** — legal review of ToS and Privacy
4. **Ship Slices 60 + 61** — Flash UX audit + nav/auth UI pass
5. **Onboard first real artist** — anyone outside the founder
6. **Run for 4 weeks** with the real artist using the product, no upgrade prompts
7. **Then** start Phase 2 with the cost audit (section 6 questions answered)

The "do nothing about pricing yet" answer is the right answer for the next ~6 weeks. Phase 2 starts when:

- ≥ 2 real artists are actively using the product
- Plausible has 4 weeks of reliable data
- No critical bugs in the last 14 days
- Founder has bandwidth for 3 weeks of subscription-architecture work without breaking the SEO sprint pace

---

## 10. Alignment notes for future Claude/ChatGPT prompts

When prompting either AI for Inklee work, reference this doc explicitly:

> "Refer to `docs/business-model.md` for current positioning, pricing direction, and the Free/Plus/Studio split. Do not invent feature placements; ask if a feature belongs in Free, Plus, or Studio when it's unclear."

Update this doc when:

- Pricing changes
- A new feature ships that needs a tier assignment
- Strategic direction changes
- Cost audit completes (Phase 2 section needs concrete numbers)
- Studio MVP launches (sections 3.3 and 4 need state updates)
