# Inklee pricing model (consolidated handoff)

**Date:** 2026-07-25, status sections corrected 2026-07-28. **Owner:** founder (Michel Kraeft). **Compiled by:** engineering.

> **How to read status in this document (convention added 2026-07-28):** every
> factual claim belongs to exactly one of these classes, and the class is named
> where ambiguity is possible. **Proposed** = a recommendation nobody has
> ratified. **Approved** = ratified by the named owner (founder / counsel /
> accountant), with the date. **Test-mode configuration** = Stripe test-mode
> objects, never chargeable. **Production configuration** = live-mode objects.
> **Gate state** = what `scripts/billing/gate-status.cjs` prints against the
> production database at the stated date; the script is the source of truth and
> this document is a snapshot that goes stale. **Historical note** = true when
> written, kept for context, not current fact.
**Purpose:** the single overview of what Inklee charges, what each price buys, what
each stream nets, which pricing questions are still open, what each depends on, and
a direct recommendation per open question. Everything here is sourced from
`docs/business-model.md`, `DECISIONS.md`, `docs/product/account-tier-*.md`,
`docs/legal/*` (incl. the counsel Answers of 2026-07-24), and code truth
(`packages/shared/src/{entitlements,platform-fee}.ts`, migrations `0105`/`0106`,
the billing gate config). Where docs disagree, the disagreement is listed as an
open question rather than silently resolved.

---

## 1. The model in one paragraph

Inklee earns on **two engines plus one future tier**: (1) the **Plus subscription**
(EUR 3/month, consumer-first, sold web-only), whose economic job is to attach every
Stripe Custom Connect account to a payer; (2) a **3% transaction fee on card
deposits** (deposits are Plus-gated per decision D-d), which is the per-transaction
margin; and (3) a **Studio tier (~EUR 25/month, later)**, deliberately unpriced and
unbuilt until solo data justifies it (open question Q8). The free tier is the full
core booking workflow and is the trial (no time-limited trial exists). The client
never pays a surcharge anywhere; artists stay merchant of record on deposits;
Inklee is the seller only for the subscription.

---

## 2. Price card (current state)

| # | Item | Price | Billing | Status |
|---|---|---|---|---|
| 1 | Free Starter | 0 EUR | n/a | **Live** (is the product today) |
| 2 | Inklee Plus, monthly | **3.00 EUR/month, final price (no VAT added)** (approved: founder ratified 2026-07-25) | Monthly, auto-renews, cancel any time, 14-day withdrawal | **Built, dark, launch HELD by founder decision 2026-07-28.** Production configuration exists (live Price via lookup `inklee_plus_monthly_eur` since 2026-07-25). Compliance gate: see §6. Sales stay off until the commercial-readiness gate passes and the founder records `consumer_sales_launch_approved` |
| 3 | Inklee Plus, yearly | 24 EUR first year, then 30 EUR/year | Yearly, auto-renews | **Built + enabled 2026-07-25** (counsel approved yearly billing; Prices `inklee_plus_yearly_eur` live in both modes, 30/year inclusive + auto first-year coupon `inklee-plus-yearly-first-year` 6 off once; `PLUS_YEARLY_ENABLED=true`; follow-up: renewal-reminder email due before the first renewals, mid-2027) |
| 4 | Founder window | First N subscribers at 24 EUR/year (~2 EUR/mo) | Via Stripe promotion code + `max_redemptions` | Mechanic resolved 2026-07-23; **N and window end open** (business-model.md recommends first 100) |
| 5 | Studio tier | ~25 EUR/month flat per studio (not per-seat, D7) | Monthly | **Teaser only.** Not priced, not built; gated on Q8 + ≥5 inbound studio inquiries |
| 6 | Appointment payment platform fee | **Free: not applicable / Plus 0.5%** of eligible tattoo-service value actually collected through Inklee (card collection is Plus-only, so there is NO Free rate) (confirmed 2026-07-28, `plus-product-spec.md` §10; SUPERSEDES the flat-3% OQ-7 ratification below). Stripe fees separately identified, never described as one combined Inklee fee | Per transaction | Code still implements flat 3% (`platform-fee.ts`); tier differentiation is Plus-package build work. Live since 2026-07-04, zero real transactions (G-5 unrun) |
| 7 | Goods platform fee | **Free 5% / Plus 1%** of the product subtotal after discounts, excluding VAT and shipping (confirmed 2026-07-28; SUPERSEDES D22's 5% + 3%-card-fee model). Fee schedule version stored per transaction. Goods selling available to FREE artists (3 active products; Plus 25) | Per transaction | Parked behind `GOODS_COMMERCE_ENABLED`; **currently coded at 0% take**; the confirmed model is Plus-package build work |
| 8 | Fee sponsorship | Admin waives Inklee's 3% per artist, optional expiry + budget cap (`fee_sponsor_cap_cents`, null = unlimited) | Per artist | Live; all-or-nothing per deposit; release only against settlement-booked amounts (migration 0100) |

Price identity in code (corrected 2026-07-28; the earlier `_test` lookup key
here was a historical note that had gone stale): prices are resolved by the
stable lookup keys `inklee_plus_monthly_eur` and `inklee_plus_yearly_eur`
(`lookupKeyForInterval`, `lib/server/billing/subscription.ts`). Both test-mode
and production configurations carry a Price under each key since 2026-07-25;
the same code path resolves whichever mode the running key belongs to. **No EUR
amount exists anywhere in code**; the amount lives in Stripe + the (unseeded)
`pricing_plans.marketing_display_minor` column. Billing is **web-only** (D17, no
Apple/Google IAP).

---

## 3. What each tier includes

| Feature | Free | Plus | `legacy_free_v1` (grandfather) |
|---|---|---|---|
| Core booking workflow (page, form, FSM, calendar, waitlist, reminders, portal, support) | ✓ full — never paywalled | ✓ | ✓ |
| Manual deposit tracking | ✓ | ✓ | ✓ |
| **In-app card deposits** (the one enforced gate) | ✗ | ✓ (+ needs live Connect) | ✗ unless comped |
| Remove "made with Inklee" footer (branding) | ✗ | ✓ | ✗ (never available free) |
| Custom email templates | ✗ | ✓ | ✓ (kept; downgrade = read-only, never revert) |
| Custom form fields | 3 | 30 *(ratified)* | max(3, count at cutover) |
| Active guest-spot trips | 3 | 100 *(ratified)* | max(3, count at cutover) |
| Studio library | 5 | 50 *(ratified)* | max(5, count at cutover) |
| Active goods products | 3 | 25 *(ratified 2026-07-28)* | not yet audited against legacy accounts (flagged, see `plus-capability-registry.ts` "Goods selling" row) |
| Advanced analytics | ✗ (basic operational totals only) | ✓ (Hub analytics + fee savings + goods sales trends) | ✗ (gated for all free, decided 2026-07-23) |
| Map presence, Linklee hub, Instagram import, guest-spot requests | ✓ free by locked principle | ✓ | ✓ |

**Corrected 2026-07-31 (founder Ruling 3).** The three caps above previously
read "*(proposed, pending confirm)*" while active trips alone read
"*(ratified)*" — an internal contradiction. All four caps (fields, trips,
studios, active goods products) are ratified: fields/trips/studios on
2026-07-25 (OQ-4, `DECISIONS.md`), active goods products on 2026-07-28.
`CANONICAL_CAPS` in `packages/shared/src/entitlements.ts` is the single
source.

Enforcement status: `deposits` and `branding` are both enforced in prod today
(`branding` un-parked 2026-07-29, founder confirmation, `DECISIONS.md`
2026-07-29 amendment); this line previously said "only `deposits`". The
custom-field / trip / studio-library caps are wired but stay dark behind the
`entitlement_caps` kill switch (BM-2.0 build, fail-open). The claim that
"the customer-facing PLUS_BENEFITS copy already promises '30 fields / 100
trips / 50 studios' verbatim" was never accurate: `PLUS_BENEFITS`
(`packages/shared/src/plus-benefits.ts`) is a five-line USP list and contains
no numbers anywhere.

---

## 4. Where the money goes (per stream)

| Stream | Who pays the client-facing price | Who is seller / MoR | Who pays Stripe's processing fee | Inklee's cut |
|---|---|---|---|---|
| Plus subscription | Artist (as consumer, per D1) | **Inklee** | Inklee (~1.5% + 0.25 EUR of the charge) | Whole price minus Stripe |
| Card deposit | Client pays exactly the deposit (no surcharge) | **Artist** (destination charge, `on_behalf_of`) | **Inklee** (`fees.payer: application`) | Full 3% `application_fee`, minus Stripe's fee billed to platform balance |
| Deposit refund (artist cancels) | Client refunded 100% | Artist balance debited | Inklee absorbs Stripe's non-refundable fee | Returns its 3%; **net loss per refund** |
| Sponsored deposit | Client pays deposit; artist keeps 100% | Artist | Inklee | **0** (waived) and still pays Stripe |

Structural cost facts: every active Custom Connect account costs Inklee **~2 EUR/
month**; there is **no fee floor** (a small deposit's Stripe cost exceeds Inklee's
3%, loss-making by design); losses backstop (`losses.payments: application`) is on
Inklee (accepted, final, 2026-07-21).

---

## 5. Unit economics snapshot

| Line | Gross | Costs | Net to Inklee |
|---|---|---|---|
| Plus monthly — **today (VAT-unregistered)** | 3.00 | Stripe ~0.30 | **~2.70/month** |
| Plus monthly — business-model.md model (assumes 20% VAT + Stripe Tax) | 3.00 | 0.50 VAT + 0.30 + 0.02 | ~2.18/month |
| Plus yearly 30 EUR (registered model) | 30.00 | 5.00 VAT + 0.70 + 0.15 | ~24.15 (~2.01/mo) |
| 200 EUR deposit | 6.00 fee | Stripe ~3.25 | **~2.75** |
| Custom Connect account | — | ~2.00/month each | — |
| Fixed infra (at ~100 users) | — | ~55–75/month | — |
| Support budget | — | ~20 min per Plus user per year | — |

**⚠️ The canonical ~2.18 EUR/month figure is stale.** business-model.md §4.1
assumes 20% VAT remitted, but under decision D2 Inklee is VAT-unregistered and
`calc_provider = none`, so nothing is remitted: **actual net today is ~2.70 EUR
per monthly charge** — comfortably above the ~2 EUR/month Connect account cost the
subscription must cover. If registration is later triggered and the price is kept
inclusive at 3.00, net falls back to ~2.18 and still covers the account cost, with
thinner slack. This asymmetry is why the display-convention decision (OQ-1 below)
matters.

Break-even sketch (today's posture): 1 Plus sub (~2.70) covers 1 active Connect
account (~2.00) with ~0.70 slack; deposit fees are margin on top; ~25–28 Plus subs
cover fixed infra.

---

## 6. Launch state (what blocks a real charge)

**Gate state as of 2026-07-28** (source of truth: `scripts/billing/gate-status.cjs`
against production; this is a snapshot): **technical 4/4 · b2b 7/7 · b2c 7/8.**
All 18 compliance keys were recorded by 2026-07-26 and every version-bound
artifact still resolves (validated by `scripts/legal/verify-legal-artifacts.cjs`,
green 2026-07-28).

The open key is deliberate. `consumer_sales_launch_approved` (added 2026-07-28)
is the founder's recorded go-live decision, distinct from compliance: the 18
keys say consumer sales are *allowed*, this one says they are *on*. The server
asserts the full b2c set before creating any Stripe checkout object, so consumer
billing is refused server-side regardless of `PLUS_CONSUMER_LAUNCH_ENABLED`
(which is UI visibility only, not a billing control).

**Launch is HELD by founder decision 2026-07-28** pending the commercial-readiness
gate: Plus must actually deliver its marketed package before it is sold. The
blocking facts at the time of the decision: `branding` (the one grant-shaped
Plus capability, and the Terms §11 headline perk) is parked in production
`DISABLED_CAPABILITIES`; the other three marketed capabilities are
restriction-shaped and currently permissive for every free account, so Plus
buys almost nothing distinct. See `DECISIONS.md` (2026-07-28 row) and the
commercial-readiness gate for the full launch criteria.

The historical per-key table that stood here (b2c 1/7, owners, pending
recordings) described the 2026-07-25 state and is superseded by the recorded
approvals; consult `gate-status.cjs` output rather than any table in a doc.
Counsel's four launch-blocking conditions: (1) credit-note flow finished — **done in
code**; (2) durable confirmation restates the immediate-start consent — **done in
code**; (3) price-adjacent-to-pay-button — **waiting on OQ-1**; (4) § 312k
cancellation button — **built** (in Settings next to account delete, per founder).

---

## 7. Open questions, dependencies, and recommendations

> **✅ FOUNDER APPROVAL 2026-07-25: every recommendation below is APPROVED and
> confirmed as the working decision** (recorded in `DECISIONS.md`, "Pricing
> ratifications" row). Co-owned gate keys still need their co-signer before
> recording: the accountant on OQ-1 (`consumer_pricing_display_approved` /
> `pricing_display_approved`) and OQ-2 (registration trigger →
> `invoice_config_approved`). The price-adjacent-to-button wiring (OQ-3) shipped
> with this approval; OQ-8's comp-expiry sweep and OQ-9's D21 instrumentation are
> the approved eng follow-ups.

Ordered by launch criticality. "Recommendation" is engineering's direct proposal to
make pricing match the current business model (consumer-first, VAT-unregistered,
subscription-covers-Connect-cost, fee-is-margin).

| # | Open question | Depends on | Owner | **Recommendation** |
|---|---|---|---|---|
| **OQ-1** | Exact live price display + Stripe `tax_behavior` (inclusive/exclusive) — **irreversible once the live Price is created** (`consumer_pricing_display_approved` + `pricing_display_approved`) | Nothing upstream; this IS the head of the chain. Must precede the live Price | Founder + accountant | **Approve "3.00 EUR per month, final price" with `tax_behavior = inclusive`.** Consumer law needs an all-in price anyway; unregistered today means nothing to add; and if VAT registration is ever triggered, an inclusive price keeps the consumer price stable at 3.00 (net drops ~2.70→~2.18, still above the ~2 EUR Connect cost) instead of forcing a public price rise and Terms repapering. Never `unspecified` (forces Price migration later). |
| **OQ-2** | C7/A2: does Inklee need a (limited) VAT-ID despite being under the 40,000 EUR threshold, and what is the bounded registration trigger? Gates `invoice_config_approved` + live billing | Accountant determination; management board records the posture | Accountant | **Proceed on the unregistered posture (D2)** — cross-border B2B does not count toward the threshold and the consumer path needs no reverse charge. Record the trigger as: earlier of (a) Estonian taxable turnover reaching 35,000 EUR (early warning at 87.5%), (b) cross-border EU B2C digital revenue reaching 8,000 EUR (early warning under the 10k OSS line), (c) the accountant's annual review. The `tax_thresholds` table already exists to track exactly this — assign quarterly monitoring to the accountant. |
| **OQ-3** | Checkout layout: price + key terms must sit on the SAME screen directly above "Order with obligation to pay" (counsel launch-blocking condition 3); the shipped draft still says "price is shown on the next step" | OQ-1 (the approved display string) | Eng (1-hour change once OQ-1 lands) | **Wire the approved string into the pre-checkout panel** ("Inklee Plus: 3.00 EUR per month, final price. Renews monthly until you cancel.") directly above the pay button, replacing the next-step sentence. Do it the day OQ-1 records. |
| **OQ-4** | Plus caps: `custom_fields = 30` and `studio_library = 50` were "proposed, pending confirm" in code as of 2026-07-25 (the "already promised verbatim in PLUS_BENEFITS copy" framing was never accurate — `PLUS_BENEFITS` carries no numbers, see §3 above) | Founder confirmation only | Founder | **Ratify 30 / 50 as-is.** They are already public copy; changing them now costs copy + counsel churn for no economic gain, and both are generous safe caps. **RATIFIED 2026-07-25 (DECISIONS.md), re-ratified 2026-07-31 (founder Ruling 3) alongside `active_trips = 100` and `active_products = 3/25`.** `CANONICAL_CAPS` in `entitlements.ts` is the single source; code no longer says "proposed". |
| **OQ-5** | Founder-window parameters: first 50 / 100 / 250, and when the 24 EUR first-year window ends (no end date defined anywhere) | Founder decision; yearly plan build (OQ-6) | Founder | **First 100** (business-model.md's own §4.4 recommendation), implemented as the already-resolved Stripe promotion code with `max_redemptions = 100`, and **bounded: expires at 100 redemptions or 6 months after consumer go-live, whichever first**. Run it on the yearly plan only; a 24 EUR/year offer against a 3 EUR/month anchor on monthly muddies the price story. |
| **OQ-6** | Yearly plan (24 first year → 30): planned but unbuilt; annual consumer billing deliberately disabled until annual proration is counsel-reviewed; renewal-reminder laws (FR/AT/RO/SE) target exactly annual tacit renewal | Counsel (annual proration + per-market reminders), then eng build | Founder to sequence | **Launch monthly-only** (already the wired state). Ship yearly as fast-follow only after (a) a renewal-reminder email exists and (b) counsel clears annual proration. When it ships, make yearly the *featured* option (12 dunning windows → 1) while keeping the 3 EUR monthly anchor visible — the anchor is the marketing hook ("reads as a coffee"). |
| **OQ-7** | Does the 3% deposit fee vary by tier? | ~~Ratified flat 3% 2026-07-25~~ **SUPERSEDED 2026-07-28: card collection is Plus-only, so Free is n/a and Plus pays 0.5%** (the full-package directive; fee differentiation is the measurable proof of Plus value in the confirmed message hierarchy). SoT `plus-product-spec.md` §10; DECISIONS.md 2026-07-28 row. Historical note: the 2026-07-25 flat-3% reasoning (the fee IS the margin) was written before the goods fee lane (5%/1%) and the full-package Plus scope existed; the margin argument now spans both fee lanes plus the subscription | Founder | Superseded; see left |
| **OQ-8** | Comp economics gap (audit C2): every comped beta artist costs Inklee ~2 EUR/month + refund/small-deposit exposure with zero subscription revenue, and **nothing sweeps `plan_expires_at`** — a lapsed comp silently stops card deposits | Founder comp policy + a small eng sweep | Founder + eng | **Keep comps for the beta cohort but give every comp an explicit expiry** (suggest 6 months), and build the expiry sweep + "your comp ends soon" notification BEFORE the first expiry (it is also launch-gate blocker 4's footnote). At expiry, offer the founder-window price as the conversion path. This converts the known silent-failure gap into the beta-to-paid funnel. |
| **OQ-9** | Is 3 EUR/month + 3% actually the right split (subscription-led vs transaction-led)? Zero live evidence exists: G-5 unrun, fee revenue never persisted, no churn/conversion data | G-5 live money test + D21 instrumentation (`platform_fee_collected_cents` + `stripe_fee_cents` per deposit) + funnel events (D20) | Founder (G-5), eng (D21) | **Do not change any price until instrumented.** Build order per the unit-economics doc: persist the two fee columns (D21) → plan-change events (D20) → funnel events. G-5 is the single most important missing pricing datapoint; run it before any pricing debate. |
| **OQ-10** | `past_due` grace period: was "proposed 7 days, not ratified" as of this table's original writing | Founder one-liner | Founder | **Ratify 7 days** — the code already implements `GRACE_DAYS = 7` aligned to Stripe Smart Retries (`reconcile.ts`). **RATIFIED 2026-07-25** per the approval banner above; this row is a closed record, not an open question. |
| **OQ-11** | A comped artist buys Plus then cancels/withdraws: revert to comp or to Free? | Founder | Founder | **Revert to Free (fail-safe), admin re-comps on request.** The grandfather-restore path already handles `legacy_free_v1` correctly; building automatic comp-restore for an edge case with (today) ~3 possible people is not worth the state-machine complexity. Document it in the admin runbook. |
| **OQ-12** | Studio tier price (Q8): 25 EUR is simultaneously "planned" and "open"; is the 2.0 guest-spot host studio the Studio tier? | Solo/Plus data + map claim-funnel metrics + ≥5 inbound studio inquiries | Founder | **No action now.** Keep "~25 EUR/month, coming later" as a teaser only. Price it when the business model's own gate (≥5 inbound inquiries) trips; per D8, comp studio owners during map bootstrap. |
| **OQ-13** | Goods take is decided (5% + 3%) but coded at 0% | Eng, before `GOODS_COMMERCE_ENABLED` ever flips | Eng | **Not launch-relevant** (goods parked). Add "wire `application_fee_amount` for the 5% goods take (D22)" as a hard precondition on the unpark checklist so commerce cannot relaunch at 0% take. |
| **OQ-14** | Deposit-fee legal residue: fee VAT/disclosure (counsel Q1/Q2/Q8), Custom-Connect confirmation (LO-10/Q11), client-cancel forfeit enforceability (Q9) | Counsel final round | Founder to schedule | **Bundle all into the one LO-10 counseling round** already planned. While unregistered, the fee carries no VAT either way; none of it blocks the consumer Plus launch, but close it before scaling real deposit volume (counsel's own framing: before beta artists take real client money). |
| **OQ-15** | Stale doc debt: business-model.md still shows the 2.18 net (pre-D2), §2 of payment-flow-for-counsel.md still says "Express", Phase 6 not updated for the 3% decision, b2b `pricing_display_approved` text still says reverse-charge | Doc owner | Eng (this doc partially supersedes) | **Treat THIS file as the pricing source of truth** and patch the four stale spots opportunistically. The counsel-facing Express line matters most (counsel must not be briefed on the wrong Connect type); fix it before the LO-10 round. |

---

## 8. The recommended decision bundle (one sitting)

To make pricing fully consistent with the current business model, the founder (with
the accountant where marked) can close the whole open set in one pass:

> **Status note, 2026-07-31:** items 3-5 below were executed as recommended
> (per the 2026-07-25 approval banner above) and item 3's caps sub-clause was
> re-ratified by founder Ruling 3 the same day this note was added. Item 3's
> "flat 3% stays" sub-clause is separately superseded: OQ-7 above records that
> the 2026-07-28 full-package directive replaced flat 3% with deposit fee
> differentiation (Free 3% / Plus 0.5%). This list is kept as the historical
> record of the 2026-07-25 recommendation, not a current to-do.

1. **Price display** (w/ accountant): "3.00 EUR per month, final price", Stripe
   `tax_behavior = inclusive` → record `consumer_pricing_display_approved` +
   `pricing_display_approved`. *(OQ-1)*
2. **Registration trigger** (w/ accountant): stay unregistered; triggers 35k EE /
   8k EU-B2C / annual review; accountant monitors quarterly → unlocks
   `invoice_config_approved`. *(OQ-2)*
3. **Ratify by one-liner each:** Plus caps 30/50 *(OQ-4, ratified 2026-07-25,
   re-ratified with active_trips=100 and active_products=3/25 by Ruling 3,
   2026-07-31)*; flat 3% stays, delete the "provisional" contradiction *(OQ-7,
   since superseded — see the status note above)*; 7-day grace *(OQ-10,
   ratified)*; cancel-reverts-to-Free *(OQ-11)*.
4. **Founder window:** first 100, yearly-only, bounded 6 months. *(OQ-5)*
5. **Sequencing:** monthly-only launch; yearly + reminders as fast-follow; comp
   expiries set + sweep built before first lapse; G-5 before any price change.
   *(OQ-6, OQ-8, OQ-9)*

After that, the remaining path to a live charge is purely mechanical: eng wires the
price into the checkout panel (OQ-3), the accountant/counsel keys are recorded, the
founder creates the live Price and runs one live checkout, and
`PLUS_CONSUMER_LAUNCH_ENABLED` flips.

---

## Cross-reference

`docs/business-model.md` (strategy + unit-economics model) ·
`docs/product/account-tier-*.md` (tiers, audit, unit-economics inputs) ·
`docs/legal/consumer-launch-signoff-package.md` + `plus-launch-signoff-request.md`
(counsel-facing pricing + Answers) · `docs/legal/plus-launch-strategy-decisions.md`
(D1–D3) · `docs/legal/vat-and-oss-architecture.md` §4.4 (tax_behavior) ·
`DECISIONS.md` (D-a/D-b/D-d, money scope) · `packages/shared/src/platform-fee.ts` +
`entitlements.ts` (code truth) · `scripts/billing/gate-status.cjs` (live gate state).
