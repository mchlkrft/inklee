# Inklee Roadmap (Unified View)

**Last updated:** 2026-06-20 (ME-10 **MEDIUM drift register swept** on branch `chore/me10-drift-sweep` — 14 commits, local only, NOT merged; 13 register items single-sourced incl. a SECURITY sharp-guard (D15) and a slug-availability RLS bug fix (D17); gate green (web+mobile tsc, 513 tests, lint 0 errors); adversarial 13-agent review = 0 regressions; see ME-10 in §6.4. Earlier 2026-06-19: mobile↔web audit branch **MERGED to `master` + deployed to prod**, merge `8f2669f`, after a green gate: web tsc/lint(0 errors)/463 tests + mobile tsc all clean. The 2026-06-18 audit was a 44-agent parity / one-source-of-truth / security / launch-connectors sweep on branch `fix/mobile-web-audit-bugs`. Closed 8 verified drift bugs, 3 mobile parity features (native forgot/reset password, resolve-a-warning, custom booking-form answers on the request detail), and the 2 HIGH ME-10 single-sources (`deriveBooksOpen`, `createAppointmentCore`; `editAppointmentCore` too). Security clean (0 critical/high). Verdict: architecture sound, the real risk is drift, the launch gate is **config not code** (Stripe live + fail-closed env vars `UPSTASH_REDIS_*`/`SUPABASE_AUTH_HOOK_SECRET` + push send-half). Report `docs/mobile-web-audit-2026-06-18.md`; memory `mobile-web-audit-2026-06`. Earlier 2026-06-16: launch SEO sprint: full marketing audit -> sitemap submitted to GSC (inklee.app Domain property) + title/canonical/schema fixes + artist booking pages noindex-by-default + home->cluster internal linking, see §4.1; Link Hub socials expanded to 28 platforms with shared brand glyphs; template repo v1.3.0 pricing guide. Earlier 2026-06-15: dashboard triage-board redesign + deposits chase-overview & settings split + bolder greeting pool + block-based Link Hub merged to `master` (merge `4dd3b32`) + deployed; mobile API host fixed to `inklee.app` because the apex `inkl.ee` 308-redirect was stripping the bearer token. Earlier 2026-06-14: prod freeze RESOLVED, then monorepo RECONCILED onto `master` (merge `415a349`) so prod is git-tracked from `master` again; ME-11 Hub `*.l.inkl.ee` wildcard live + ME-11 slice 3 mobile editor done — see callouts below. Previous: 2026-06-12 mobile E-track E1–E11 + founder rounds 7–10; 2026-06-03 money-scope reset, §3 banner + `docs/restructure-money-scope-2026-06-03.md`)
**Current prod commit:** `master` `8f2669f` (mobile↔web audit fixes — 8 drift bugs + 3 mobile parity + 2 ME-10 single-sources) — deployed 2026-06-19 by Vercel **Git integration**, aliased to inkl.ee + inklee.app. Prod is git-tracked from `master`. Since the 2026-06-14 reconcile baseline (`415a349`, deploy `inklee-mgx5pywk2`), prod has taken: the dashboard / triage-board redesign + wordmark splash, the **Flash redesign FX-0..FX-11** (M2M day junction, public grid+modal, web+mobile folders; merges #4-#7), **ME-14** (custom Inklee iconset + guest-spot studio-library cards, #8 `9705b43`), the ME-test findings (`a23446f`), and now the **mobile↔web audit fixes** (`8f2669f`). **Stripe is test-mode in prod (no real payments yet).** **OPEN:** Flash Instagram import is blocked ~24h on a new Meta app + Business-portfolio verification (memory `flash-instagram-meta-setup`).
**✅ PRODUCTION FREEZE RESOLVED (2026-06-14).** Prod had been frozen since ~2026-06-04 (Vercel root dir `apps/web` vs pre-monorepo `master`, so master builds failed and Vercel kept serving the last good deploy). Unblocked by deploying `feat/mobile-e1` directly to prod via `vercel deploy --prod` (the root dir now matches the deployed branch). Live + verified: inkl.ee + inklee.app serve 200, the ME-11 Hub is live at `<slug>.l.inkl.ee` (wildcard `*.l.inkl.ee` attached, Let's Encrypt cert `CN=*.l.inkl.ee` issued), existing `*.inkl.ee` artist subdomains unaffected, and the parked legal-table fix shipped (feat/mobile-e1's `819505d`). **Then RECONCILED 2026-06-14:** the monorepo was merged onto `master` (merge `415a349`, fast-forward push, nothing lost) and Vercel Git integration redeployed `master` → **prod is git-tracked from `master` again** (inkl.ee = `inklee-mgx5pywk2`); the decoupling caveat is closed and `master` pushes build green. **One caveat remains:** Stripe is TEST-MODE in prod (no real payments) per the documented pre-launch state. Full detail: memory `production-deploy-state.md`.
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

**Launch SEO sprint (2026-06-16, all merged to master + deployed; backlog in memory [[seo-state]]).** Full marketing-surface audit via workflow `wr7ghu0bq` (titles/meta, internal linking, structured data/OG, technical/GEO). Foundation confirmed strong (metadataBase=inklee.app, self-canonicals, JSON-LD Org/WebSite/SoftwareApplication/WebPage/FAQ, OG images). **Shipped:** sitemap cleaned (dropped /login + /signup) + **submitted to GSC** (inklee.app Domain property) + **indexing requested for the top 10 pages**; `/help` indexing bug fixed (had inherited the home title + a canonical to `/`); em-dashes removed from titles; `/start` noindexed (homepage near-dup); home vs /tattoo-booking-software title dedup; `/download` description trimmed; **artist booking pages (`<slug>.inkl.ee`) set to noindex by default** (founder decision, reversible later via a per-artist "list me in search" opt-in + a dynamic sitemap); Org+WebSite JSON-LD moved to the root layout (now site-wide, home dup dropped); **home -> cluster internal links** (feature cards link to their landing pages + a "Compare Inklee" row); `/dm-chaos` WebPage schema + footer entry; `/help` de-orphaned with shared nav+footer. **Remaining (deferred):** P2 code = twitter `summary_large_image` sweep, BreadcrumbList schema, per-route OG images, remaining per-page Related-link tweaks; founder/off-page = **Bing Webmaster + IndexNow**, Product Hunt + directory listings (G2/Capterra/AlternativeTo/SaaSHub) for LLM citations, `guest-spot-booking`/`guest-spots` consolidation call, Review/AggregateRating schema once real reviews exist, German `/de` tree later. Note the benign GSC notice "Alternative Seite mit richtigem kanonischen Tag" is the canonical system working, not an error.

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

Independent track, low touch. ✅ **v1.3.0 shipped 2026-06-15** (`tattoo-pricing-and-quotes-guide.md`, pulled early as a pre-launch organic push); v1.2.0 2026-06-12 (waitlist signup template + guide). Next Week 7 (2026-06-26); monthly after. Repo: github.com/mchlkrft/tattoo-booking-form-template (local clone `A:\WORK\tattoo-booking-form-template`). Cadence + voice rules in memory `template-repo-cadence`.

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

- **Shipped 2026-06-15 (merge `4dd3b32` → master → prod):** Home **triage-board redesign** (web+app: hero "Requests waiting" + inline Action-required feed, one shared `getDashboardData`); deposits **chase overview** at `/bookings/deposits` with config moved to `/settings/deposits` (reworks ME-9's surface; shared `getDepositsOverview` + `relativeDueLabel` + `formatMoneyShort`); bolder rotating **greeting pool** (`packages/shared/src/greeting.ts`); **block-based Link Hub** (`bio_page.blocks` — up to 10 headlines/text/links, reorderable, socials fixed on top; reworks ME-11). Mobile **API host fixed to `inklee.app`** (apex `inkl.ee` 308-redirect was stripping the `Authorization` header → "missing bearer token"); `eas.json` preview+production env corrected + public-link base decoupled via `EXPO_PUBLIC_PUBLIC_BASE_URL`. Memory: `mobile-dashboard-redesign`, `production-deploy-state`.
- **ME-1 (blocks E12):** ◑ nearly closed 2026-06-12 — §A in-app assets + §C1 Play icon + §C2 feature graphic generated (`apps/mobile/assets/` + `assets/store/`); §F final store copy written and char-verified for both stores; iPad screenshots dropped (`supportsTablet: false`). ONLY remaining: phone screenshots per the §G capture guide (needs a device; no iOS simulator on Windows) + founder sign-off on copy/name + the EAS preview render check (shared with ME-2).
- **ME-2 (blocks E12, founder lead time):** ◑ D-U-N-S received 2026-06-12 (**988010563**); Google Play Console **ready**; Apple Developer Program enrollment **in progress**. **First EAS build succeeded 2026-06-14** — an Android **preview** APK (build `c2db233d`), proving the pipeline end-to-end: `EXPO_TOKEN` auth, env via the `eas.json` preview `env` block (public `EXPO_PUBLIC_*` → prod `inkl.ee`), cloud-generated Android keystore. Surfaced + fixed a first-build splash bug (`expo-splash-screen` lacked an `image` → `splashscreen_logo not found`; commit `ac8a001`). Still pending: iOS build (needs Apple enrollment + interactive cred setup), production profile, OTA (no `expo-updates`/`runtimeVersion`), store submission. Full state in memory `eas-build-state.md`.
- **ME-3:** ✅ closed 2026-06-12 — babel-plugin-transform-imports rewrites lucide member imports to per-icon modules (alias map + digit-aware kebab + existence check in babel.config.js; `LucideIcon` type now comes from `src/lib/icon-types.ts`). Verified with before/after `npx expo export`: Android Hermes bundle 7,695,078 → 5,908,641 bytes (**−1.79 MB, −23%**). Note: Metro logs a one-time "not listed in exports, falling back" WARN per icon on cold cache — expected and benign.
- **ME-4:** ✅ closed 2026-06-12 — `text-success-fg`/`text-danger-fg` tokens (light #105f2d/#a61f1d, dark #3fae71/#e8706e, all >=4.5:1 on their surfaces) swapped in at ~70 text/icon sites; fills and washes keep the literal brand atoms; fixed-dark chrome pins `palettes.dark.*`.
- **ME-5:** ✅ closed 2026-06-12 — booking + waitlist detail field rows bumped to the 14/16 readability standard, done-screen "More tab" copy fixed, ModeCard selection border now theme-aware accent.
- **ME-6:** ✅ closed 2026-06-12. Built: booking activity timeline (shared `@inklee/shared/booking-activity` labels, web sidebar refactored onto it), iCal export (new `/api/mobile/settings/calendar-export` GET/POST/DELETE + settings screen), calendar marker enrichment (guest spots + flash days on the month grid + agenda, web color vocabulary). Already shipped earlier: reference-image gallery (round 4), burger redesign + scroll-hide (round 3). Web-only-by-design (in-app handoffs exist; matches `docs/inklee-feature-scope.md` honesty notes): bio-page module editor, Instagram OAuth import. TWO items LEFT this list on founder override: the full form builder (round 7, `d86a875` — `/api/mobile/booking-form/*` mutation routes + `settings/booking-form/` editor screens, plus in-app booking-mode editing via `/api/mobile/settings/booking-mode`) and the slots manager (round 8, `c63f184` — one-source-of-truth core in `packages/shared/src/slot-pattern.ts` + `apps/web/src/lib/server/slots.ts` consumed by BOTH the web actions and the new `/api/mobile/slots*` routes; native screens `settings/slots/` list + pattern builder; the no-slots warning now auto-resolves on slot creation on both platforms). Goods accept-popup cluster: blocked on goods commerce un-parking, not a parity gap.

- **ME-8 (native email/password sign-up — added 2026-06-14):** ◑ BUILT, pending device/dashboard verification. The app previously shipped sign-in only; an app-only artist with an email/password account had no in-app way to register (Google/Apple already auto-provision). Built: `signUpWithPassword` in `auth.tsx` (Supabase `signUp`, dual outcome: live session when the project auto-confirms vs a confirmation email when it doesn't), a native `sign-up.tsx` screen mirroring the web signup action (email + password >= 8, terms/AUP/privacy links, "check your email" state) reusing the Google/Apple buttons, sign-in <-> sign-up cross-links, and a deep-link `auth-confirm.tsx` route that exchanges the confirmation code **on-device** (required because the mobile client is PKCE — the verifier lives in this device's SecureStore, so a web callback can't complete it). The auto-confirm path works end-to-end in code; the confirmation-email path needs: (1) `inklee://auth-confirm` added to the Supabase redirect allowlist, (2) Supabase "allow new signups" enabled, (3) a native-build device test (same gate family as ME-7). Verified: mobile tsc + lucide check clean.

- **ME-9 (deposits overview — added 2026-06-14):** ✅ built. New Bookings sub-tab **Deposits** (`(tabs)/bookings/deposits.tsx` + a 4th `SubNav` entry) — a cross-booking overview the web has **no standalone page for** (the web `/bookings/deposits` is the settings/defaults page, already mirrored under mobile Settings → Payments). New `GET /api/mobile/bookings/deposits` returns every booking carrying a deposit, classified awaiting / overdue / paid / refunded by the **shared** `apps/web/src/lib/deposit-state.ts` classifier (refunded via one batched `audit_log` lookup, capped at 200 most-recent) with outstanding + collected money rollups; shared types `MobileDepositListItem` + `MobileDepositsResponse`. Screen: two money summary tiles + Outstanding / Collected groups with color-coded state chips; each row taps through to the booking detail where the request / mark-received / refund actions live. Context (the deposit-UX audit that prompted it): an app-only artist already had the **full** deposit lifecycle in-app (per-booking actions in `BookingActions` + Settings deposit defaults/policy; only Stripe Connect KYC is the by-design in-app-browser handoff) — this just adds the missing at-a-glance view. Verified: mobile tsc + web tsc clean.

- **ME-10 (web↔app one-source-of-truth parity audit — added 2026-06-14, HIGH priority):** ◑ AUDIT RAN 2026-06-18 (44-agent sweep, report `docs/mobile-web-audit-2026-06-18.md` + memory `mobile-web-audit-2026-06`); the first round of fixes **MERGED to `master` + deployed 2026-06-19** (merge `8f2669f`). Both HIGH drift items extracted to one shared source — `deriveBooksOpen` (`@inklee/shared/books-settings`) and `createAppointmentCore` (`lib/server/bookings.ts`) — plus `editAppointmentCore` and `convertWaitlistEntryCore`. **MEDIUM drift register SWEPT 2026-06-20 on branch `chore/me10-drift-sweep` (14 commits, local only — NOT pushed, NOT merged; gate green: web+mobile tsc, 513 web tests +50, lint 0 errors; net −115 lines; adversarial 13-agent review found 0 regressions).** Done: D26 dead-code delete (`settings/templates/*`+`settings/fields/*`), **D15 SECURITY** (one `guardedSharp` decompression-bomb guard across all 7 sharp pipelines incl. the unauth booking form), D18/D19 (profile-validation + cover-colors), D23/D24 (`deriveSignInIdentity` + password policy), D20 (web bell relativeTime), D11/D10/D12 (EU price parse + goods option lists + `ownedGoodsStoragePath`), D13/D14 (trip caps + range/leg predicates), **D3** (reminder-settings with the write-OFF/read-ON boolean nuance + REMINDER_BOUNDS), D16 (strict `isBookingMode`, 5 write paths), D5 (deposit-defaults + policy-window bounds), D1 (`computeAnalytics`), **D17 BUG FIX** (slug-availability was RLS-blind to other artists' slugs post-0030 → service-client lookup) + D8 (iCal token core). **DEFERRED (rationale in commits/memory):** D2 (booking-form STD descriptor — needs `FormSettings` moved to `packages/shared` first, else loses `keyof FormSettings` typo safety); D21+D25 (Intl-free absolute date/time formatter — a deliberate date-format decision, US-`en` vs GB order + 12h/24h, and mobile is already Hermes-safe via `apps/mobile/src/lib/date.ts`); FU-18/D4 (atomic `image_urls` — needs migration 0054); D7 (calendar-grid); D22 (push payload — coupled to unbuilt server-push H4); the per-client detail aggregation sub-item of D6. Audit verdict: architecture sound, security clean (0 critical/high). Below is the original framing: For EVERY feature, web and app must derive the same result from the **same** source — no parallel/duplicated logic that can silently drift. Divergence is a latent system break (founder directive: "one source of truth, everything else will break the system at some point"). First instance found + fixed (during ME-9): **"deposit refunded" was derived three times independently** — web `bookings/requests/[id]/page.tsx` (ungated), the mobile detail route (paid-card gated), and the new deposits overview route (ungated) — equivalent only by accident. Collapsed into one classifier `apps/web/src/lib/deposit-state.ts` (`isDepositRefunded` / `depositState`) consumed by all three, locked by `deposit-state.test.ts`. **That helper is the pattern: pure, single-sourced, unit-tested.** TODO sweep (verify each has ONE definition shared by both surfaces, extract any stragglers; many already share via `packages/shared` + `apps/web/src/lib/server/*`, but verify, don't assume): booking status/FSM + human labels, deposit fee/refund math, slug rules, availability/slots generation, calendar/appointment derivation, client aggregation, notification/activity labels, money/date formatting, onboarding validation. Own slice; gates trust in the whole web↔app contract.

- **ME-11 (Inklee Hub — additive link-in-bio, added 2026-06-14):** ✅ web + app DONE (2026-06-14); `*.l.inkl.ee` wildcard live in prod. An OPTIONAL, standalone Linktree-style hub for artists who currently use Linktree etc. — an "extra goodie," NOT a replacement: the booking form/page stays the root `[slug]` and the first-priority feature, **untouched**. **Free** (no paywall gate). Own URL **`<slug>.l.inkl.ee`** ("Linklee", founder pick; canonical internal route `/<slug>/hub`); reachable only as its own URL, never from the booking page. Content (Linktree best-practice): avatar/name/tagline (reuses profile), a **social icon row** (new `socials[]`), and a stack of custom link buttons (reuses existing `bio_page.customLinks`); the artist can add their booking page as one of the links. Full web + app, one source of truth. Staged: **(1) DONE** — bio-page model moved to `packages/shared/src/bio-page.ts` (web lib now a re-export shim, booking page untouched) + new `socials[]` (per-platform dedupe + URL sanitization), unit-tested; **(2) IN PROGRESS** — public hub page built at `/<slug>/hub` (Linktree-style: avatar/name/bio, the booking page as a built-in "Book a tattoo" primary action, then the link-button stack; noindex'd so it never competes with the booking page's SEO; cover-header logic shared via `public-cover.ts`). The custom **LINKS were extracted out of the booking page** per founder direction (they were a surprise there) — links are now Hub-only; the booking-policy text stays on the booking page (shown before booking). (2) cont. DONE: **socials** — `socials[]` icon row on the Hub (web brand glyphs via `simple-icons`; app will use Ionicons logos), editor section (platform + URL, per-platform dedupe), shared `BIO_SOCIAL_META` labels; the editor moved to a **standalone `/link-hub` route** (out of `/settings`) surfaced as **"Link Hub" in the Tools nav** (old `/settings/bio-page` 308-redirects); editor preview now points at the Hub URL. Pretty URL: **`<slug>.l.inkl.ee`** ("Linklee", founder pick) — host routing DONE: `parseHost`/`decideHostRouting` rewrite `<slug>.l.inkl.ee` (+ `<slug>.l.localhost` dev) → `/<slug>/hub`, `publicHubUrl()` emits it (reuses `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN`), unit-tested. **(3) DONE (2026-06-14):** native editor `apps/mobile/app/settings/link-hub.tsx` (links + socials via Ionicons `logo-*`; per-platform add-chips; booking-policy + show toggles) + a "Link Hub" Tools-menu entry (`settings/index.tsx` + `_layout.tsx`) + `apps/web/src/app/api/mobile/settings/hub/route.ts` GET/POST wrapping the same shared `parseBioPageSettings` (merge without clobbering, revalidate `/<slug>/hub`). All limits/labels/types from `@inklee/shared/bio-page` (no duplication). Added `config.hubUrl(slug)`. A 4-lens adversarial review found NO blockers; fixes applied: social React key (was index), dropped-socials in the save note, and a latent shared `sanitizeBioLinkUrl` bug (bare email became `https://you@host` instead of `mailto:`; fixed for web+app, +tests). Verified GREEN: web+mobile typecheck/lint + bio-page unit tests (20). **Deploy/ship status:** `feat/mobile-e1` was deployed to prod 2026-06-14 (see top callout) and the **`*.l.inkl.ee` wildcard is attached + live** (Let's Encrypt `CN=*.l.inkl.ee`; `<slug>.l.inkl.ee` serves the Hub). Remaining: the NEW web hub route needs a redeploy (`vercel deploy --prod`) and the mobile editor ships with the next Expo/EAS build. Detail: memory `inklee-hub-feature.md`.

- **ME-7 (blocks E12, added 2026-06-14):** ☐ Apple + Google sign-in END-TO-END verification. The app **code + native config are complete and correct** — `auth.tsx` uses Supabase's documented native flows (Google: PKCE `signInWithOAuth` → `openAuthSessionAsync` → `exchangeCodeForSession`; Apple: native `signInAsync` → `signInWithIdToken`), `app.json` has `ios.usesAppleSignIn: true` + the `expo-apple-authentication` plugin + `scheme: "inklee"` + bundle `ee.inkl.app`, and the Supabase client is `flowType: "pkce"` on SecureStore. "Functional" is blocked on things NOT in the repo: (1) Supabase dashboard — Google **and** Apple providers enabled, with `inklee://auth-callback` (and the EAS preview scheme) in the redirect allowlist; (2) Google Cloud OAuth client (iOS client + the Supabase web callback as an authorized redirect); (3) Apple Developer — Sign in with Apple capability on `ee.inkl.app` + a Services ID/key configured in the Supabase Apple provider; (4) a native **dev/TestFlight build** (Apple Sign In does NOT run in Expo Go) + an on-device pass of both flows. Pairs with the ME-2 EAS build. Optional hardening once it works: add a nonce to the Apple flow (Supabase-recommended replay protection; currently omitted, functional without it).

- **ME-12 (onboarding wizard full pass — added 2026-06-15, founder-flagged):** ☐ End-to-end review/redesign of the onboarding wizard on BOTH surfaces — graphics/illustrations, step functionality, copy, layout, the whole flow. Founder is driving the direction (expect feedback/assets). Routes: web `(artist)/onboarding/*` (welcome → booking → profile → availability → claim-slug → form → done), mobile `app/onboarding/*`. Dedicated design+build slice; pairs with ME-8 (native signup feeds straight into onboarding).
- **ME-13 (dashboard final UI pass via mockup — added 2026-06-15):** ☐ The Home triage-board redesign shipped (web+app, merge `4dd3b32`); founder will deliver a **mockup** for final UI feedback. Apply mockup-driven refinements to `(artist)/dashboard/page.tsx` + `apps/mobile/app/(tabs)/index.tsx` (one shared `getDashboardData`). HOLD for the mockup. Context: memory `mobile-dashboard-redesign`.
- **ME-14 (guest spot studio-library cards + custom iconset — added 2026-06-15):** ✅ closed 2026-06-17 — shipped to prod via PR #8 (merge `9705b43`). The founder delivered a **25-icon American-traditional tattoo-badge set** (`Branding/illustrations/emoji library/17-06-26/Inklee-Emoji-01..25.svg`: panther, web, cobra, dice, skull, sacred-heart, om, devil, gentleman, pinup, piston-skull, rose, eagle-head, winged-panther, handshake, dagger, chalice, moth, dragon, mermaid, swallow, eagle, speed-skull, weeping-heart, cherub) — NOT travel glyphs. Built: **`packages/shared/src/inklee-icon-art.ts`** (auto-gen from the SVGs via `.scratch/gen-icon-art.cjs`; each normalized to a single `fill=currentColor`, defs/style/class stripped) as the ONE art source for both platforms (ME-10). The shared `travel-icons.ts` key list swapped from the 12 lucide keys to the 25 badge keys (export names `TRAVEL_ICON_KEYS`/`TravelIconKey`/`sanitizeTravelIcon` kept so all ~14 call sites compiled untouched; old stored keys sanitize to null on next save → fall back to the default glyph, no data loss). Render maps render the custom art (web inline `<svg>` tinted by CSS color; mobile react-native-svg `SvgXml` with the resolved color baked on the root) and fall back to the caller's lucide glyph for unknown/null. Both pickers show all 25. **Card redesign** (full-height square icon tile left + name / city+country / address right, actions pinned right): web `studio-list.tsx`, mobile `travel/studios/index.tsx`, mobile Home guest-spot rows in `(tabs)/index.tsx`. Verified: web + mobile typecheck + lint clean; em-dashes only in code comments. Caveat: new mobile icons need a fresh EAS build to appear on-device (web shows on deploy). Detail: memory `inklee-icon-set`.

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
