# Inklee Roadmap (Unified View)

**Last updated:** 2026-06-12 (mobile E-track refresh: E1–E11 shipped on `feat/mobile-e1` + founder rounds 7–10; **production-deploy freeze discovered — see ⚠️ below**; previous: 2026-06-03 money-scope reset, §3 banner + `docs/restructure-money-scope-2026-06-03.md`)
**Current prod commit:** `2f98b53` (branch `feat/bio-page-goods`) — deployed to production via `vercel --prod` as `inklee-ffnck6791`, aliased to inkl.ee (2026-05-29). NOTE: prod predates the restructure.
**⚠️ PRODUCTION DEPLOYS ARE FROZEN (found 2026-06-12).** The Vercel project `inklee` has `rootDirectory: "apps/web"` (set during the E-M0 monorepo migration, anticipating the monorepo landing on master), but `master` is still the PRE-monorepo layout (code at repo root, no `apps/web/`). So every production build from master fails on the missing path and Vercel keeps serving the last good deploy (live `Age` ~7.7d ≈ 2026-06-04). Nothing merged to master since is live. Founder decision to unblock (their call — don't toggle prod config mid-migration unilaterally): set Vercel root dir back to `.` to match master + redeploy, OR land the monorepo on master. The `/cookies` + `/subprocessors` legal-table fix is correct, build-verified, and parked on master (`ef3f466` + `4a64dc2`) — it ships automatically once this is resolved. Full detail: memory `production-deploy-state.md`.
**Migrations applied:** 0000–0049 on the remote DB (verified 2026-06-12). Bookkeeping had diverged (remote recorded only 0000–0019); per AGENTS.md every 0020–0047 effect was verified live via the Management API query endpoint before `migration repair --status applied`, then `0048` (perf indexes — turned out genuinely UNAPPLIED) + `0049` (travel `icon` columns) were pushed and verified present. File numbering skips 0041/0042 (0040 → 0043). `inventory_movements` optional, not created.
**Status:** MVP feature-complete as a solo-artist tool. All original pre-launch hard blockers + every UX-polish slice (60a–60e + 61) closed. Phase D agent sweep done; all Highs closed; ~half the Mediums closed. Marketing redesign (Slice 70) shipped 2026-05-26. Artist subdomain bio layer (Slice 71) fully live 2026-05-27 (`*.inkl.ee`). **Pre-launch gate expanded 2026-05-28:** the founder added a major pre-launch feature cluster — the **tattoo-native Bio Page + Goods module + Appointment Add-ons** (Slices 72–76, see §3.8 + `docs/bio-page-goods-plan.md`), shipping **before public launch**. This makes **Stripe Connect a new pre-launch blocker** (OT-12) for production goods money, and pushes the first-artist soak (§3.4) and Phase E mobile (§6.4) behind the cluster. No subscription/monetization layer in code yet; the cluster adds paywall _readiness_ only (flags + a `canUseGoods()` helper), no billing. **⚠️ Reframed 2026-06-03 (§3 banner): goods are now showcase-only; the money model is optional deposit collection with an Inklee platform fee (transaction-fee revenue) — `docs/restructure-money-scope-2026-06-03.md`.**

**Purpose.** This is the single high-level view, focused on current priorities, next phases, and unresolved decisions. For slice-level detail see `SLICES_CONTINUATION.md`. For strategy + pricing see `docs/business-model.md`. The shipped log (§2) is a pointer, not a changelog — git history + the slice docs + memory hold the detail.

---

## 1. Current snapshot

**All 16 marketing surfaces redesigned** (Slice 70 closed 2026-05-26): homepage, `/dm-chaos`, `/about`, `/start`, `/download` (new), 8 product SEO pages, 3 comparison pages, `/best-booking-app-for-tattoo-artists`. All on the bone/charcoal/mustard/rosa design language with shared `marketing-v2` components. Public booking flow, trip planner, waitlist, slot mode, customer portal — all shipped. No plan/tier model in the schema. Studio multi-tenancy does NOT exist. Legal package counsel-cleared 2026-05-20 (deposit-fee model not yet formally re-signed under Custom — G-4). `inkl.ee` short-domain live since 2026-05-18; `*.inkl.ee` artist subdomains live since 2026-05-27.

**Deposit money feature (revised 2026-06-05):** pivoted from the old deposit-only/no-Connect mode to **Stripe Connect Custom in-app KYC** (Slice 79) + **multi-currency** (Slice 79d) — artist onboards entirely inside Inklee (never visits Stripe), money routes straight to the artist (merchant of record), Inklee keeps a full-3% `application_fee` and never holds funds. Goods are showcase-only (commerce parked behind `GOODS_COMMERCE_ENABLED`). Branch `payment-stripe`. **Code is ~90% complete; the four-lens audit (`docs/payment-audit-2026-06-05.md`, tracked as Slice 80) found it not launch-ready** — see §3.3.

**Mobile app (NEW, active 2026-06-05):** Phase E pulled forward — the iOS+Android **artist** app becomes the primary surface for the beta. Locked stack **Expo/React Native** + in-place pnpm monorepo + a new `/api/mobile` layer; full plan at `docs/mobile-implementation-plan.md`; slice track E0→E-M0→E1..E12 in §6.4. Foundation runs in parallel with the beta soak.

**The honest summary (revised 2026-06-05):** the free-mode product has long been launchable; the deposit money feature is now the gating work. The launch path is: **Slice 80 Tier 0 code blockers → founder gates (apply migration 0044, sandbox money-path verification, the D-d unit-economics decision, counsel sign-off) → Phase D live walkthrough.** D-d matters most strategically: Custom's per-account costs mean deposit revenue alone is net-negative for low-volume artists, so the subscription layer (Horizon 2, §4.4) is the assumed margin cover and 3% stays provisional. Monetization architecture still starts only after launch + first real artist + 4 weeks of clean data.

---

## 2. What's already shipped

Pointer, not a changelog — detail lives in git history, `SLICES.md` / `SLICES_CONTINUATION.md`, and the memory files.

| Area                                                                                                | Status                         | Where the detail lives                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core MVP + hardening (Slices 0–53)                                                                  | ✓                              | `SLICES.md`, `SLICES_CONTINUATION.md` — product, RLS, rate limiting, payment hardening, Trip Planner, Flash, admin, branding                                                                                 |
| Security incident recovery (RLS, 2026-05-10)                                                        | ✓                              | Migrations 0026–0031; memory `project_inklee_roadmap.md` "Security incident" section                                                                                                                         |
| UI rework — app shell + page polish                                                                 | ✓                              | Commits `885f9f8` + `2a4af67`                                                                                                                                                                                |
| SEO/GEO (10 pages) + reworked About + public template repo v1.x                                     | ✓                              | Slices 5–8, 11–16; memory `project_inklee_seo.md`; github.com/mchlkrft/tattoo-booking-form-template                                                                                                          |
| Legal package (imprint/terms/DPA/AUP/privacy/cookies/subprocessors + Section 8 notice + DSA report) | ✓ counsel-cleared 2026-05-20   | memory `project_inklee_legal_package.md`; commits `421e91f`→`063052a`. Remaining track-to-closure items in §3.5 + §3.6                                                                                       |
| OT-01 storage bucket policy audit                                                                   | ✓ 2026-05-20                   | `0022_storage_policies.sql`; service-role writes only on both buckets; FU-6 listing tightening still open                                                                                                    |
| Pre-launch UX polish (Slices 60a–60e + 61)                                                          | ✓                              | §3.2; commits `8a5ea32`, `25d0373`, `d95d1af`, `ee21328`, `49ce728`                                                                                                                                          |
| Phase D agent sweep + High-tier closure + copy/UX sweeps                                            | ✓ (Mediums partial — see §3.3) | `docs/phase-d-audit-2026-05-24.md`; commits `ee6c714`, `055aa0f`, `a1ea006`, `ec4c61d`                                                                                                                       |
| Stripe live keys (OT-02) + deposit UX (Slice 60e)                                                   | ✓ 2026-05-22/24                | Deposits live; defaults in `profiles.settings.deposit_defaults`                                                                                                                                              |
| Marketing redesign (Slice 70a–e) — 16 surfaces + `/download` + slug carryover                       | ✓ 2026-05-26                   | memory `project_inklee_marketing_redesign.md`; merge `9ca25af`; migration 0034                                                                                                                               |
| Artist subdomain bio layer (Slice 71a–d) — `*.inkl.ee` live                                         | ✓ 2026-05-27                   | memory `project_inklee_subdomain_routing.md`; `docs/subdomain-deployment.md`; §3.7                                                                                                                           |
| inkl.ee apex redirect (Slice 54)                                                                    | ✓ 2026-05-18                   | memory `project_inklee_short_domain_guardrails.md`                                                                                                                                                           |
| Strategy + analytics + mobile-strategy docs                                                         | ✓                              | `docs/business-model.md`, `docs/analytics-audit-2026-05-14.md`, `docs/mobile-strategy.md`                                                                                                                    |
| Pre-walkthrough UX + branding bug sweep (Slice 77)                                                  | ✓ 2026-06-04                   | `SLICES_CONTINUATION.md` Slice 77 — mobile nav (Goods/Settings), Size-radio mobile layout + full-label transport, banner-upload error handling, unified branded email shell + real logo + deposit trust copy |
| Phase D cross-device fixes — desktop quick-wins + IP-ROOT (iPad) + UP-1 (uploads)                   | ✓ 2026-06-04                   | `docs/phase-d-walkthrough-2026-05-27.md` rounds 1–4; commits `e32fb6d`, `6a3d493`, `85773c6`. Remaining punch-list = Slice 78 cluster (§3.3)                                                                 |

---

## 3. Horizon 1 — Now (pre-launch closeout)

Nothing else should accelerate until this horizon is clean. This is what blocks the public launch.

> **⚠️ MONEY SCOPE RESET — 2026-06-03.** During OT-12 testing the founder reset the monetization scope. New model: **the booking process is universal and free of any payment setup (no tradeoffs); deposit collection is an optional opt-in where money flows through Inklee and Inklee adds a percentage platform fee (transaction-fee revenue); artists stay merchant of record (Connect destination charge + new `application_fee`); goods are showcase-only (no checkout/add-ons).** This supersedes the "Bio Page + Goods commerce cluster" framing below — see the full process-flow audit, interconnected-blocker list, and restructure-slice plan (RS-1…RS-8) in **`docs/restructure-money-scope-2026-06-03.md`**, and the decision in `DECISIONS.md` (2026-06-03). OT-12 is **not dropped** — it narrows to deposit-Connect + platform fee; the goods-money parts are removed. The restructure (RS-2…RS-8) is the new pre-launch payment workstream.

### 3.1 Pre-launch blockers (must close)

| ID            | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Effort          | Owner            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------- |
| **OT-12**     | **Stripe Connect for DEPOSITS** (rescoped 2026-06-03; was "for goods"). Connect stays — it routes optional deposit money to the artist (destination charge + `on_behalf_of` + `transfer_data` + **new** `application_fee`), keeping the artist merchant of record. The goods-checkout/add-ons parts are removed (goods → showcase). Now blocked behind the restructure slices, not the old `checkout_addons` flip. See `docs/restructure-money-scope-2026-06-03.md`. | Build + counsel | Founder          |
| **RS-2…RS-8** | **Money-scope restructure** (2026-06-03) — gate deposits on Connect (RS-2, also closes a live MoR exposure), goods→showcase (RS-3), platform fee (RS-4), onboarding friction (RS-5), refunds (RS-6), marketing/legal reframe (RS-7), OT-12.3/runbook rewrite + Phase D re-audit (RS-8). Full plan: `docs/restructure-money-scope-2026-06-03.md`.                                                                                                                     | Build + counsel | Founder + Claude |

✓ **Closed:** OT-02 (Stripe live keys, 2026-05-22), OT-01 (storage bucket policy, 2026-05-20), OT-05c (imprint board, 2026-05-18), OT-06 (ToS + Privacy counsel review, 2026-05-20). Detail in §2 + memory.

The 2026-05-28 scope change reopened the launch line: launch now also gates on the Bio Page + Goods cluster (§3.8) and, for production goods money, OT-12. UX polish (§3.2) and the Phase D gate (§3.3) still stand.

### 3.2 Pre-launch UX polish — ✅ COMPLETE

Slice 60 expanded 2026-05-16 into a platform-wide UX audit + restructure (60a–60d); 60e added 2026-05-20 for deposit UX; 61 (auth UI) distinct. **All closed by 2026-05-24:**

- **60a** — UX audit + IA decision (`8a5ea32`). Decision: Option A, keep flat structure. Artifacts in `docs/ux-audit/`.
- **60b** — Nav/IA label rename (`8a5ea32`); no route moves.
- **60c** — Mobile pass + onboarding intro 3-slide story (`25d0373` / `42ed7d9`).
- **60d** — Flash audit + restructure; migration 0033 (`d95d1af`).
- **60e** — Deposit UX surfaces; `/settings/deposits` + `profiles.settings.deposit_defaults` (`ee21328`).
- **61** — Auth UI audit + fixes; `PasswordInput`, `?error=` surfacing (`49ce728`). Audit doc `docs/nav-auth-ui-audit-slice-61.md`.

### 3.3 Phase D — Final MVP UX review (the gate)

**Plan: option 3 (Both).** Agent sweep first, then a live walkthrough with the founder.

**Status:**

- ✅ **Agent sweep done** — `docs/phase-d-audit-2026-05-24.md` (6 High + 18 Medium + 11 Low).
- ✅ **All 6 High closed** (`ee6c714`).
- ✅ **~10 of 18 Medium closed** across copy sweeps (`055aa0f`, `a1ea006`, `ec4c61d`). Remaining: M1 (waitlist actions don't surface errors), M16 + M17 (calendar new-appointment modal a11y). Lows L5/L7/L11 tracked in `inklee_followup.md`.
- ✅ **Pre-walkthrough bug sweep done (Slice 77, 2026-06-04)** — five founder-collected UX/branding issues cleared first so the walkthrough starts clean: mobile nav (Goods/Settings), Size-radio mobile layout + full-label transport to the artist backend + emails, banner-upload error handling, and a unified branded email shell with a real logo + deposit-email trust copy. Detail in `SLICES_CONTINUATION.md` Slice 77.
- ✅ **Live walkthrough ran as a solo cross-device pass (2026-06-04)** — format revised: founder tested phone + iPad + desktop and handed over batches; Claude triaged into the punch list (`docs/phase-d-walkthrough-2026-05-27.md`). Shipped already: 8 desktop quick-wins (DT-2/3/6/7/8/9/10/14), **IP-ROOT** (iPad blanked on iPadOS 16.0–16.3: Next 16 shipped a Safari-16.4-only class static block, fixed via `browserslist`), **UP-1** (all image uploads now client-compress + validate, no more 500/black screen). Phone pass clean.
- ✅ **Slice 78 cluster shipped** — 78a goods-interest decouple, 78c waitlist restructure, 78d onboarding-viewport + booking-settings, 78e analytics calendar, 78f Flash edit-in-modal (commits `f318352`, `043284d`, `e2dcc62`, `eef92da`, `3e80b94`). 78b (payment deposit/payouts UI + test pass) rolled into Slice 79.
- ✅ **Slice 79 + 79d shipped (code)** — the deposit money feature pivoted to Stripe Connect **Custom** in-app KYC onboarding (artist never visits Stripe; full-3% fee under `fees.payer:application`; artist stays MoR) + multi-currency deposits. See `SLICES_CONTINUATION.md` Slices 79/79d.
- ⏳ **THE launch gate is now the payment money path, not UX.** A four-lens audit (2026-06-05, `docs/payment-audit-2026-06-05.md`) found the feature ~90% code-complete but not launch-ready. **Remaining launch gate = Slice 80 Tier 0 code blockers + Tier 3 founder gates + the Phase D live walkthrough:**
  - **Slice 80 Tier 0** (deploy-blocking code): delete orphaned `dashboard/actions.ts` (P0-1), wire refund-on-cancellation/D-f (P0-2), surface KYC requirements (P0-3), customer-portal test-mode banner (P0-4), copy ship-rule sweep (P0-5), multi-currency webhook leak (P0-6).
  - **Tier 3 founder gates:** ✅ **G-1 done** (migration 0044). ✅ **G-2 ACCEPTED AS WORKING 2026-06-05** (`docs/g2-sandbox-verification.md`): in-app Custom KYC onboarding (no redirect), EUR deposit exact 3% split (artist €194 / Inklee €6, MoR via on_behalf_of), webhook flip, Slice 81 entitlement gate, and ALL cancellation/refund directions (4.1 artist-cancel→refund, 4.2 client-cancel→forfeit, 4.3 unpaid-cancel→intent canceled) verified against real Stripe data. **Postponed (low-risk, not individually launch-blocking):** 4.4 dashboard-refund reconciliation, Phase 3 non-EUR multi-currency, Phase 5 manual/declined/reuse edges. ✅ **G-3 DECIDED** (D-d: gate deposits behind Solo Plus, €24/yr first-year, keep 3%; see DECISIONS.md + business-model.md). ✅ **G-4 CLEARED 2026-06-05** — counsel signed off the Custom-Connect deposit process; live `/subprocessors` wording corrected Express→Custom (version 2026-06-05). **Remaining to launch: Stripe live setup + deploy + first real-charge check (see `docs/beta-launch-checklist.md`).**
  - **Found during G-2:** G2-F1 (deposit card shows "Due <date>" after the deposit is paid — should show "Paid"); local `stripe listen` tunnel flakiness (operational, not a code bug — confirm prod webhook endpoint at deploy).
  - **Phase D live walkthrough** (G-5) must now re-cover the deposit/fee/refund money path.
- Deferred to future prompts: FEAT-Bio (Linktree page), DT-4b, DT-16b. Slice 80 Tier 1/2 = fast-follow + hardening (not launch-blocking).

Critical surfaces: artist flow (signup → onboarding → slot/trip → public preview → booking → accept → deposit → cancel → 2FA); customer flow (`/start` → demo `/bert-grimm` → submit → magic-link portal → reschedule/cancel); admin flow (`/admin` roster → suspend/reactivate → analytics with tester exclusion); mobile at 375px; edge cases (books closed → waitlist, cap reached → waitlist, flash, trip-scoped, honeypot + autofill, `/[slug]/waitlist`, subdomain claim page).

Output: prioritized punch list. Fix what matters. Then ship.

### 3.4 First real artist + 4-week soak

**Now sits behind the §3.8 commerce cluster** (founder decision 2026-05-28 — launch ships with Bio Page + Goods). After the Phase D punch list closes AND Slices 72–76 ship AND OT-12 (Stripe Connect) is live:

- Onboard at least 1 real tattoo artist outside the founder
- Run for 4 weeks with that artist using the product daily
- No upgrade prompts (Free tier only); Plausible firing reliably; no critical bugs in last 14 days

This is the gate that closes Business Model Phase 1 and unblocks Phase 2.

### 3.5 Legal next-sprint (not launch-blocking, ship in launch-week sprint)

The launch-blocker legal package shipped + counsel-cleared 2026-05-20. Remaining items L-1 through L-5 are **all closed** (privacy, cookies, subprocessors, Section 8 `/[slug]` notice, DSA `/legal/report`) — see §2. **L-6** (soften homepage "GDPR compliant" badge) was **dropped 2026-05-20** (founder decision: badge stays; residual UCPD risk accepted, tracked as LO-8). Sources: `legal/HANDOFF-TO-CLAUDE-CODE.md` §3, `legal/COMPLIANCE-CHECK.md`.

### 3.6 Counsel + founder open items (track to closure)

Open items from `legal/HANDOFF-TO-CLAUDE-CODE.md` §5 — track to closure rather than build tasks. Note LO-2 + LO-5 + LO-7 also bear on the commerce cluster's seller-of-record / VAT review (see `docs/bio-page-goods-plan.md` §7).

| ID   | Item                                                                         | Owner                    |
| ---- | ---------------------------------------------------------------------------- | ------------------------ |
| LO-1 | DPO confirmation under GDPR Art. 37 (assumption: not required)               | Counsel                  |
| LO-2 | PSD2 / merchant-of-record analysis for Stripe Connect deposit + goods flow   | Counsel                  |
| LO-3 | DSA Art. 19 micro/small-enterprise exemption scope                           | Counsel                  |
| LO-4 | Liability-cap enforceability against sole-trader artists in Estonia          | Counsel                  |
| LO-5 | DPIA for booking-image processing, magic-link tokens, Stripe flow            | Founder + technical lead |
| LO-6 | CCPA / CPRA monitoring threshold (US traffic trigger)                        | Founder                  |
| LO-7 | Estonian VAT threshold tracking (re-issue imprint + invoicing at EUR 40k/yr) | Founder                  |
| LO-8 | Marketing-claim substantiation for the "GDPR compliant" badge (L-6 dropped)  | Founder                  |
| LO-9 | Trademark clearance for "Inklee" and "inkl.ee" (also in `DECISIONS.md` open) | Founder                  |

### 3.7 Slice 71 DNS provisioning + env flip — ✅ CLOSED 2026-05-27

Wildcard `*.inkl.ee` live in production. The working path was migrating `inkl.ee` nameservers Cloudflare → `*.vercel-dns.com` at Zone.ee (the Cloudflare A-record path doesn't issue wildcard SSL). Let's Encrypt cert issued; 4/4 routing branches smoke-tested; auth on `inklee.app` unaffected; `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN=inkl.ee` set on Production. Rollback = unset the env + redeploy (single knob; DNS/SSL stay harmlessly). Full rollout log + 6 failure modes in `docs/subdomain-deployment.md`; 33-row logged-in QA at `docs/subdomain-qa-checklist.md` still useful (not a launch blocker). Architecture summary in memory `project_inklee_subdomain_routing.md`.

### 3.8 Bio Page + Goods + Appointment Add-ons (NEW pre-launch cluster, Slices 72–76)

> **⚠️ SUPERSEDED IN PART — 2026-06-03 (money-scope reset).** The **Appointment Add-ons** (in-app goods checkout, Slices 74–75) are **dropped** — goods are now **showcase-only** (display on the bio page, no checkout). The Bio Page (72) + Goods data model/CRUD/cards (73) stay as a showcase. Deposit money still flows via Connect but now carries an Inklee **platform fee** and is gated on the artist being connected. See `docs/restructure-money-scope-2026-06-03.md` (RS-3 removes the checkout path). The cluster framing below is historical; read the restructure doc first.

Added 2026-05-28. The next major Inklee direction: evolve the public page into a **tattoo-native Bio Page**, add a native **Goods** module, and let clients add artist goods to their deposit payment in one checkout (**Appointment Add-ons**). Full plan, audit, DB/Stripe/UI design, legal caution, and QA in `docs/bio-page-goods-plan.md`. Slice-level detail in `SLICES_CONTINUATION.md`.

Locked decisions: (D1) whole cluster ships **before public launch**; (D2) keep embedded **PaymentIntents** — one combined intent, itemized in Inklee's own `order_items`, no Checkout Session in v1 (locked in `DECISIONS.md`); (D3) **Stripe Connect gates production goods money** (OT-12) — built/tested in test mode first, `checkout_addons` OFF in prod until Connect lands; (D4) add-ons attach to the deposit-payment moment in `/request/[token]`; (D5) appointment pickup only, one artist + one booking per checkout, no shipping/cart/buyer-accounts/discounts; (D6) paywall **readiness** only (flags + `canUseGoods()`), no billing.

| Slice | Title                                                                               | DB                                                   | Risk   | Status                      |
| ----- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ | --------------------------- |
| 72    | Bio Page modular structure + custom links + booking policy + shop placeholder       | none (JSONB)                                         | Low    | ✓ built                     |
| 73    | Goods data model + dashboard CRUD + variants + public shop cards                    | 0035 `products`, `product_variants`                  | Medium | ✓ built                     |
| 74    | Pre-checkout add-ons page + combined total + PaymentIntent amount update            | none                                                 | Medium | ✓ built (test mode)         |
| 75    | Order + webhook order creation + inventory + booking-detail goods + itemized emails | 0036 `orders`, `order_items`, `inventory_movements?` | High   | ✓ built (test mode)         |
| 76    | Paywall readiness flags + analytics + QA hardening                                  | none                                                 | Low    | ◑ flags + tests; QA ongoing |

Sequencing: 72 → 73 → 74 → 75 → 76 — **all built in code** (migrations 0035 + 0036 applied; `src/lib/features.ts` flags live; 213 vitest tests green as of 2026-05-29). Per D3, goods money stays in **test mode**: `checkout_addons` is OFF in production until **OT-12 Stripe Connect** is live and artists are onboarded as connected accounts. Remaining before launch: the Phase D walkthrough (§3.3), OT-12, and a manual QA pass of the live add-ons flow (plan §10).

---

## 4. Horizon 2 — Next (1–3 months post-launch)

Parallel tracks once launch is stable — different cognitive surfaces.

### 4.1 SEO sprint continuation

Asset delivery, hero sizing, and density retrofits all closed via Slice 70. Remaining: **17+ Resources/\* checklist pages** (⏳ planned, 4 entries reserved in footer) — start with `/resources/tattoo-booking-form-checklist`, born in the marketing-v2 design language. Detail in memory `project_inklee_seo.md`.

### 4.2 Tracking + observability foundation

**Slice 63 — Tracking foundation (Plausible custom events).** Unlocks the A/B test phase; audit (Slice 62) done (`docs/analytics-audit-2026-05-14.md`). Ships 6 named events (`dm_chaos_view`, `dm_chaos_cta_click`, `signup_started`, `signup_completed`, `onboarding_started`, `booking_link_created`); server-side `signup_completed` at `/onboarding/done`; internal exclusion via `ADMIN_EMAILS` + `inklee_internal=1` cookie; Meta Pixel scaffolded but disabled. (The commerce cluster's optional analytics in Slice 76 should align with this event taxonomy.)

### 4.3 Short domain Phases A + B — ✅ COMPLETE

Phase A (apex redirect, Slice 54) shipped 2026-05-18; Phase B (artist subdomain serving, Slice 71) shipped + live 2026-05-27 (§3.7). Closed Slice 56 (subdomain-over-path decision); dropped Slice 58 (path-based shortlinks). Slice 57 (sharing tools) partially in place. Remaining campaign-shortlink work (Slices 55, 59) stays in Horizon 3.

### 4.4 Business Model Phase 2 (pricing readiness)

Quiet preparation. No public commitment, no pricing page.

| Slice  | Title                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| BM-2.1 | Cost audit (concrete Stripe / VAT / Supabase / Vercel numbers; `business-model.md` §6)                                   |
| BM-2.2 | Schema migration for `plan_tier` enum on `profiles` + subscription columns                                               |
| BM-2.3 | Stripe Customer Portal + subscription product setup (test mode first)                                                    |
| BM-2.4 | `canAccess(profile, feature_key)` feature-gate primitive (extends the commerce cluster's `canUseGoods()` readiness work) |
| BM-2.5 | Webhook extension for subscription events                                                                                |
| BM-2.6 | Founder internal dogfood end-to-end                                                                                      |

Excluded: `/pricing` public page, customer-facing upgrade copy, any Plus features unlocked.

### 4.5 Public artist page round 2

Pending the user-provided mockup. When it arrives: audit `src/app/[slug]/page.tsx` against the mockup, list deltas, ship as one focused PR. **Note (2026-05-28):** this overlaps Slice 72 (Bio Page modular structure) — fold the round-2 mockup into Slice 72's module design rather than running it separately. Logged in `inklee_followup.md`.

### 4.6 Public template repo cadence

Independent track, low touch. ✅ Week 5 shipped 2026-06-12 (v1.2.0: waitlist signup template + waitlist guide); next Week 7 (2026-06-26); monthly after. Repo: github.com/mchlkrft/tattoo-booking-form-template (local clone `A:\WORK\tattoo-booking-form-template`).

---

## 5. Horizon 3 — Build (3–9 months)

The earnings layer. Heavier engineering. Studio is the headline.

### 5.1 Business Model Phase 3 — Solo Plus launch

Once Phase 2 architecture is dogfooded. The Bio Page + Goods cluster's paywall-readiness flags (`bio_page_modules`, `goods_module`, `checkout_addons`) become real gate points here.

| Slice  | Title                                                                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BM-3.1 | Lock Solo Plus feature set (branding control, custom templates, more fields/trips/studios, short link, QR, lightweight analytics, **native appointment add-ons + unlimited goods + variants + inventory**) |
| BM-3.2 | Wire feature gates on the locked feature set                                                                                                                                                               |
| BM-3.3 | Upgrade UI (dashboard banner → modal → Stripe Checkout → success → feature flip)                                                                                                                           |
| BM-3.4 | `/pricing` public page (drafted in `business-model.md` §7)                                                                                                                                                 |
| BM-3.5 | Founder pricing window — first 100 subscribers at €24/year                                                                                                                                                 |
| BM-3.6 | Email upgrade flow (welcome, receipts, payment-failure recovery)                                                                                                                                           |
| BM-3.7 | Downgrade / cancel flow (Customer Portal)                                                                                                                                                                  |

**Locked pricing:** €3/month or €30/year (~17% off). Founder window: €24/year for first 100. No free trial.

### 5.2 A/B test phase (Slices 64–69)

Gated by Slice 63 firing reliably for ≥ 1 week. 64 theme tokens → 65 variant system → 66 bone-light variant → 68 QA → 69 test launch (150 EUR, 10 days). Slice 67 (Meta Pixel + consent gate) independent/optional. Detail in `SLICES_CONTINUATION.md`.

### 5.3 Short domain remaining slices (55, 57, 59)

Optional, sequential. 55 campaign shortlinks (layer above the wildcard rule); 57 dashboard sharing-tool polish (base exists in PublicPageClient); 59 QR + offline campaign layer. Slices 54, 56, 58, 71 already resolved (§4.3).

### 5.4 Studio MVP planning (Business Model Phase 4 scoping)

Design + prototype only, NOT implementation. Trigger: Solo Plus stable ≥ 3 months + ≥ 5 inbound studio inquiries. Decisions before code: studio data model (new tables vs reusing `studios`), multi-artist permissions, cancellation graceful-degradation, studio-admin visibility into artist data. **Note:** the Goods module's pickup-by-location + staff-fulfillment extensions are part of this Studio scope (per `docs/bio-page-goods-plan.md` §8).

### 5.5 Public artist page round 2 implementation

If the mockup arrived in Horizon 2, ship it in Horizon 3 (or as part of Slice 72 — see §4.5).

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

Optional, only if Studio MVP gets ≥ 10 paying studios. Possible: studio analytics deep view, guest-artist management, cross-studio demand analytics (anonymized), routing rules, pricing differentiation (Studio Pro €60–80/month or analytics add-on).

### 6.3 Business Model Phase 6 — Payment / deposit monetization research

Research only. Output `docs/payments-strategy.md` v1. NOT implementation. Open questions in `business-model.md` §5 Phase 6. (The commerce cluster's Stripe Connect work feeds this.)

### 6.4 Phase E — mobile app (iOS + Android) — ⚡ NOW ACTIVE (pulled forward 2026-06-05)

**Status:** the mobile app is now a strategic priority — the **primary artist surface** for onboarding the critical, visual, mobile-first beta. Pulled forward from "Later"; foundation work (M0 monorepo + the `/api/mobile` layer) runs in parallel with the §3.4 beta soak; the full app build soft-gates on having a real artist using the web product.

**Decision (locked 2026-06-05, supersedes the old Capacitor recommendation): Expo / React Native + Expo Router + NativeWind** — a real native app, NOT a WebView/Capacitor wrapper. Full artist feature set, delivered in slices. Repo becomes an **in-place pnpm monorepo** (`apps/web` + `apps/mobile` + `packages/shared`); new **`/app/api/mobile/*` Bearer-JWT layer** over shared `/lib/server/*` (there is no REST API today — Server Actions are the web API). App is **artists-only**; public bio pages, client magic-link portal, marketing, legal, admin stay WEB-ONLY.

**Authoritative plan:** `docs/mobile-implementation-plan.md` (orchestrator + 5 specialist agents, 2026-06-05) — 15 deliverables incl. feature parity matrix, IA (5 tabs: Home/Requests/Calendar/Clients/More), endpoint list, `device_tokens` model, ~50-screen inventory, slice plan, acceptance gates, risk register, store-readiness. `docs/mobile-strategy.md` (the older Capacitor-leaning scoping doc) is superseded on the stack decision. `DECISIONS.md` has the locked row.

**Hard constraints:** no in-app subscription billing (Apple/Google IAP — deposits are real-world services, exempt); Sign in with Apple required (Google offered); in-app account deletion required (also a web GDPR gap to build); Stripe KYC via in-app browser; minimal-PII push payloads.

**Mobile slice plan (E-track) — refreshed 2026-06-12.** The full app shipped on branch `feat/mobile-e1` through MB-1..MB-13 (web-IA realign, `docs/mobile-web-alignment-plan.md`) plus ten founder-feedback/quality rounds. Recent: round 7 `d86a875` (settings hub rework, NATIVE booking-form builder replacing the web handoff, in-app booking-mode editing, status-bar charcoal lens, profile cover-behind-photo header); round 8 `c63f184` (NATIVE slots manager on a one-source-of-truth core shared web↔mobile) + `d6dc6b6` (bookings tab joins scroll-hide); round 9 `60e6acb` (goods editor parity: 3+variant multi-image, variants, hardcoded currency picker); `58fde9d` (branded splash overlay); round 10 `072aa4f` (top/bottom pill height match, page-header nav-icon chips, dashboard "upcoming" count, artist-side trip/studio icon library — migration `0049`). Slice-level detail lives in git history + memory (`mobile-realign-mirror-web.md`); this table is the status view only. NOTE: all of this is on `feat/mobile-e1`, NOT production — see the ⚠️ deploy-freeze callout at the top.

| Slice | Title                                                                                        | Status             |
| ----- | -------------------------------------------------------------------------------------------- | ------------------ |
| E0    | Audit + architecture + Expo-vs-Capacitor spike                                               | ✅ done (the plan) |
| E-M0  | Monorepo migration (`apps/web` + workspace) — own PR, web-build-green + Vercel root-dir gate | ✅ on `feat/mobile-e1`; Vercel root=`apps/web` set BUT migration never landed on master → ⚠️ freezes prod (see top callout) |
| E1    | Expo foundation + auth (incl. Apple/Google) + `/api/mobile` reads + 5-tab web-IA shell       | ✅ shipped |
| E2    | Booking core (inbox, detail, accept/pass/cancel, deposits incl. refunds, attachments)        | ✅ shipped (signed reference images + annotation lightbox, round 4) |
| E3    | Notifications + push (device tokens, deep link)                                              | ◑ feed + bell + `devices` endpoints + deep-link allowlist wired; on-device push E2E + migration 0046 verification pending |
| E4    | Onboarding + public booking link (first-10-minutes)                                          | ✅ shipped |
| E5    | Calendar + artist-authored appointments (slots stay web-only)                                | ✅ shipped |
| E6    | Clients + waitlist (detail pages, city demand, convert)                                      | ✅ shipped |
| E7    | Flash · E8 Guest spots · E9 Goods (showcase, create-with-photo)                              | ✅ shipped |
| E10   | Analytics + polish (insights, theme system, accent contrast, button system)                  | ✅ shipped (founder rounds 1–6) |
| E11   | Settings parity (profile, books, payouts, deposits, emails, templates, KYC handoff, deletion)| ✅ shipped |
| E12   | Beta release readiness (TestFlight + Play internal)                                          | ☐ open — gated on the punch list below |

**E-track open punch list (pre-store/EAS build, added 2026-06-12):**

- **ME-1 (blocks E12):** ◑ nearly closed 2026-06-12 — §A in-app assets + §C1 Play icon + §C2 feature graphic generated (`apps/mobile/assets/` + `assets/store/`); §F final store copy written and char-verified for both stores; iPad screenshots dropped (`supportsTablet: false`). ONLY remaining: phone screenshots per the §G capture guide (needs a device; no iOS simulator on Windows) + founder sign-off on copy/name + the EAS preview render check (shared with ME-2).
- **ME-2 (blocks E12, founder lead time):** ◑ D-U-N-S received 2026-06-12 (**988010563**); Google Play Console **ready**; Apple Developer Program enrollment **in progress**; EAS production profile dry run still pending.
- **ME-3:** ✅ closed 2026-06-12 — babel-plugin-transform-imports rewrites lucide member imports to per-icon modules (alias map + digit-aware kebab + existence check in babel.config.js; `LucideIcon` type now comes from `src/lib/icon-types.ts`). Verified with before/after `npx expo export`: Android Hermes bundle 7,695,078 → 5,908,641 bytes (**−1.79 MB, −23%**). Note: Metro logs a one-time "not listed in exports, falling back" WARN per icon on cold cache — expected and benign.
- **ME-4:** ✅ closed 2026-06-12 — `text-success-fg`/`text-danger-fg` tokens (light #105f2d/#a61f1d, dark #3fae71/#e8706e, all >=4.5:1 on their surfaces) swapped in at ~70 text/icon sites; fills and washes keep the literal brand atoms; fixed-dark chrome pins `palettes.dark.*`.
- **ME-5:** ✅ closed 2026-06-12 — booking + waitlist detail field rows bumped to the 14/16 readability standard, done-screen "More tab" copy fixed, ModeCard selection border now theme-aware accent.
- **ME-6:** ✅ closed 2026-06-12. Built: booking activity timeline (shared `@inklee/shared/booking-activity` labels, web sidebar refactored onto it), iCal export (new `/api/mobile/settings/calendar-export` GET/POST/DELETE + settings screen), calendar marker enrichment (guest spots + flash days on the month grid + agenda, web color vocabulary). Already shipped earlier: reference-image gallery (round 4), burger redesign + scroll-hide (round 3). Web-only-by-design (in-app handoffs exist; matches `docs/inklee-feature-scope.md` honesty notes): bio-page module editor, Instagram OAuth import. TWO items LEFT this list on founder override: the full form builder (round 7, `d86a875` — `/api/mobile/booking-form/*` mutation routes + `settings/booking-form/` editor screens, plus in-app booking-mode editing via `/api/mobile/settings/booking-mode`) and the slots manager (round 8, `c63f184` — one-source-of-truth core in `packages/shared/src/slot-pattern.ts` + `apps/web/src/lib/server/slots.ts` consumed by BOTH the web actions and the new `/api/mobile/slots*` routes; native screens `settings/slots/` list + pattern builder; the no-slots warning now auto-resolves on slot creation on both platforms). Goods accept-popup cluster: blocked on goods commerce un-parking, not a parity gap.

### 6.5 Business Model Phase 7 — Retention and expansion (continuous from Horizon 3)

Onboarding improvements, educational content, booking-form template marketplace, short-domain shareability fully fleshed out, studio referrals, continued SEO/GEO, Instagram marketing loop.

---

## 7. Parallel tracks (always on)

### 7.1 Public template repo bi-weekly cadence

See §4.6. Independent track. Memory: `project_inklee_template_repo.md`.

### 7.2 Open follow-ups (low-priority backlog)

Full detail in memory `inklee_followup.md`. Open: **FU-1** public artist page round-2 mockup (overlaps Slice 72, §4.5); **FU-2** outline-doubling at 1.5px corners (5 fixes tried — next: solid `--border`); **FU-3** sidebar sub-item font; **FU-4** fixed-slots in-flow onboarding; **FU-5** Instagram app-secret rotation; **FU-6** storage logos public-listing; **FU-7** marketing components don't accept `ReactNode` bodies; **FU-8** SEO footers not config-driven; **FU-9** homepage footer grid fixed at `md:grid-cols-5`; **FU-10** OT-08 feature-intro modal copy; **FU-11** `www.inkl.ee` not set up; **FU-12** `NEXT_PUBLIC_LEGAL_PENDING_REVIEW` Preview env unset; **FU-13** onboarding intro slide graphics; **FU-14** Phase D Mediums M1/M16/M17; **FU-15** Phase D Lows L5/L7/L11; **FU-16** mobile FAB scroll-grow not firing (5 approaches tried, prod state safe); **FU-17** `fix/phase-d-mediums-m1-m16-m17` branch pushed not merged; **FU-18** goods `image_urls` read-modify-write has no optimistic-concurrency guard (web save + mobile image POST/DELETE; a cross-device POST/DELETE interleave can resurrect a deleted URL whose storage object is gone — fix with an `updated_at` compare-and-set across all three writers together).

### 7.3 Marketing asset delivery (founder-driven)

Most placeholders closed via Slice 70. Remaining decorative comment-hooks on a few newer SEO pages.

---

## 8. Dependency map (critical path)

```
[Phase 1: Free launch] ─┬─ Pre-launch blockers (OT-02 ✓; OT-12 Stripe Connect ⏳)
                        ├─ Slices 60a–60e + 61 ✓
                        ├─ Phase D MVP gate
                        ├─ Bio Page + Goods cluster (Slices 72–76)  ← NEW pre-launch gate
                        │     (72 → 73 → 74 → 75 → 76; goods checkout gated on OT-12)
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
              [Phase 4: Studio MVP scoping] → [Studio MVP build] → (≥ 10 paying studios) → [Phase 5: Studio Pro]

Independent: [Short domain 54 + 71 done; 55/57/59 optional, Horizon 3]
Independent: [Phase 6: Payment research] (no implementation)
Independent: [Phase 7: Retention] (continuous from Phase 3)
Independent: [Phase E: mobile] (after first real artist AND after the Bio Page + Goods cluster is stable — it reshapes booking/payment/webhook logic a Capacitor shell would otherwise wrap blind)
```

**Single longest critical chain:** Pre-launch (incl. Bio Page + Goods cluster) → Phase 1 close → Phase 2 → Phase 3 Solo Plus → Phase 4 Studio scoping → Studio build. Each step is months.

---

## 9. What's blocked by what (at-a-glance)

| If you want to ship...             | You must first complete...                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Public launch                      | Phase D punch list + Bio Page + Goods cluster (Slices 72–76) + OT-12 Stripe Connect (OT-02 + 60a–60e + 61 ✓ done) |
| Native goods checkout (production) | OT-12 Stripe Connect live + artists onboarded as connected accounts                                               |
| Bio Page modular structure (72)    | Nothing — low-risk, buildable now after plan approval                                                             |
| Goods dashboard + add-ons (73–75)  | Slice 72 structure + migrations 0035/0036                                                                         |
| Any Plus feature gate              | Phase 2 (pricing readiness)                                                                                       |
| Public `/pricing` page             | Phase 2 + first 4 weeks of Free-tier real usage                                                                   |
| A/B test on `/dm-chaos`            | Slice 63 firing reliably for ≥ 1 week                                                                             |
| Meta Pixel                         | Slice 67 (consent gate overhaul + cookie banner copy + privacy page revision)                                     |
| Studio MVP                         | Solo Plus stable ≥ 3 months + 5 inbound inquiries                                                                 |
| Studio Pro                         | Studio MVP ≥ 10 paying studios                                                                                    |
| Mobile app (Phase E)               | First real artist successful on web + Bio Page + Goods cluster stable                                             |

---

## 10. Document map

| Topic                                          | Source of truth                           |
| ---------------------------------------------- | ----------------------------------------- |
| High-level roadmap (this doc)                  | `docs/roadmap.md`                         |
| Slice-level detail (slices 11+)                | `SLICES_CONTINUATION.md`                  |
| Slice-level detail (slices 0–10)               | `SLICES.md`                               |
| Business model + pricing                       | `docs/business-model.md`                  |
| Bio Page + Goods + Add-ons plan (Slices 72–76) | `docs/bio-page-goods-plan.md`             |
| Mobile app strategy (Phase E)                  | `docs/mobile-strategy.md`                 |
| Analytics state + A/B test plan                | `docs/analytics-audit-2026-05-14.md`      |
| Paid-plan infra upgrade triggers               | `docs/paid-plan-triggers.md`              |
| SEO pages: which exist + density rules         | Memory: `project_inklee_seo.md`           |
| Public template repo cadence                   | Memory: `project_inklee_template_repo.md` |
| Founder follow-ups (low priority)              | Memory: `inklee_followup.md`              |
| Architectural decisions                        | `DECISIONS.md`                            |
| Operational runbook                            | `RUNBOOK.md`                              |
| Agent contributor guardrails                   | `AGENTS.md`                               |

---

## 11. Update protocol

Update this doc when: a slice ships (condense it into the §2 pointer table — do not paste a changelog); a horizon transitions; a new follow-up appears (§7.2 + memory `inklee_followup.md`); a dependency changes (§8 + §9); a Business Model phase advances (sync BM-N with `business-model.md` §5).

Don't: duplicate slice-level detail (lives in `SLICES_CONTINUATION.md` + the plan docs); duplicate strategy from `business-model.md`; use this as a TODO list (it's a structural view).

**Keep this doc ≤ 500 lines.** If it grows past that, the historical/per-slice detail has crept back in — push it to the slice docs, the plan docs, or the §2 pointer table.

---

**Last sanity check:** Is anything being worked on RIGHT NOW not represented here? If yes, add it. If something here has gone stale, mark it. If a dependency is wrong, fix it. The doc is only useful while it's current.
