# Account tier unit economics inputs

**Status:** System definition, 2026-07-23 (roadmap slice BM-2.0). Companion to `docs/product/account-tier-business-model-map.md`. A structured list of the data required to validate the proposed tiers and prices, and where each input does or does not exist today.

This document invents no financial figures. It distinguishes evidence-based packaging decisions from assumptions, and it names the instrumentation to build before final pricing. Grounded in the growth cockpit audit (`docs/metric-definitions.md`, `docs/admin-growth-cockpit.md`, migration 0067 views and RPCs, `apps/web/src/lib/growth-queries.ts`).

Conventions: sentence case, no em-dashes.

---

## 1. The headline gap

The growth cockpit measures the funnel and deposit volume well. It measures almost nothing on the cost side or the willingness-to-pay side, and because there is no billing, several must-have pricing metrics have no data source at all. Two structural reasons:

1. **No billing means no conversion, churn, ARPU, MRR, or LTV data.** The only durable record of a tier grant is the admin action log (`set_plan` rows), which is a manual comp proxy, not a purchase.
2. **The margin thesis is unmeasured.** The 3% platform fee is set on the PaymentIntent but never persisted; Stripe processing cost is recorded nowhere. "3% is the margin" rests on a computed figure, not settled data.

Until these are instrumented, tier and price decisions are assumptions, not evidence. The audit recommends persisting fee and cost per deposit and adding a plan-change event and history table before or alongside billing, so conversion and margin are measurable from day one (decisions D20 and D21).

---

## 2. Required inputs, availability, and what to build

For each input: whether the data exists, where it is stored, reliability, missing instrumentation, the recommended event or metric, and whether it blocks a business-model decision.

| Input | Exists? | Where | Reliability | Missing instrumentation | Recommended metric or event | Blocks a pricing decision? |
| --- | --- | --- | --- | --- | --- | --- |
| Number of active artists | yes | `growth_artist_stats`, retention states; snapshot `total_artists` | high (activity plus presence proxy, only from 2026-07) | pre-2026-07 presence absent | keep; add `profiles.last_seen_at` | no |
| Number of active studios | partial | `studio_profiles` count | low (feature logged-in only, few owners) | no studio activity metric | studio activation and retention once the tier exists | yes (Studio pricing) |
| Account activation rate | yes | `growth_artist_stats`, `isActivated` (onboarding plus live page plus booking signal) | high | none | keep | no |
| Free-to-paid conversion rate | **no** (no billing) | `admin_action_log` `set_plan` only | low (comp grants, not purchases) | no self-serve upgrade, no `plan_changed` event, no history table | add `plan_changed` event plus `account_override_history` | yes (all pricing) |
| Studio claim rate | partial | `location_claims` plus `map_locations.claim_status` | medium | not surfaced as a funnel metric | claims per seeded studio per period | yes (Studio funnel) |
| Monthly churn (engagement) | yes | retention states (`classifyRetention`) | medium (threshold-based) | none | keep; label engagement not billing churn | no |
| Monthly churn (paid) | **no** | none | n/a | no subscription state, no renewal or expiry event stream | emit on plan expiry or downgrade; measure vs `plan_expires_at` and `current_period_end` | yes (LTV) |
| Annual churn | derivable from monthly | as above | as above | as above | derive once paid churn exists | yes |
| Average bookings per artist | yes | `growth_booking_series`, requests per active artist | high | none | keep | no |
| Deposit volume (paid) | yes | `growth_deposit_totals` by currency; `booking_series.deposits_paid`; snapshot | high | no cross-currency total (by design) | keep | no (measures the fee base) |
| Inklee gross fee revenue (3%) | derivable, not stored | compute from deposit volume; `platformFeeCents` | medium (recomputed, not settled) | no collected-fee column or metric | persist `platform_fee_collected_cents` on booking at settlement; add a revenue tile | yes (margin thesis) |
| Stripe processing cost | **no** | none | n/a | not captured from `balance_transaction.fee` | store `stripe_fee_cents` per deposit; derive net margin | yes (margin thesis) |
| Inklee net margin per deposit | **no** | none | n/a | depends on the two rows above | `net_margin_cents = fee - stripe_fee - sponsored_release` | yes (margin thesis) |
| Sponsored (foregone) fee | yes | `account_overrides.fee_sponsored_used_cents`; `booking_requests.deposit_fee_sponsorship_booked_cents` and `_released_cents` (0100) | high (row-locked ledger) | not aggregated in the cockpit | add a sponsorship-spend aggregate tile | no (already the one tracked cost line) |
| Merchandise sales volume | **no** (parked, 0% take) | `orders` (dormant) | n/a | commerce parked; goods take is 0% as coded | fix `application_fee_amount` for goods, then track goods GMV and take | yes (goods pricing) |
| Email volume | partial | send counts (`email_lifecycle_runs`, `email_sends`, `reminder_sent`) | medium | no cost model; `email_events` webhook effectively empty (open and click untrustworthy) | multiply sends by the Resend unit cost per period | no (small cost) |
| Storage use per artist | **no** | none | n/a | no per-artist byte accounting | periodic storage-usage snapshot per artist and bucket | no (small cost, IG is the driver) |
| Support cost | partial | `support_ticket_count`, support summary | low (counts only) | no first-response, resolution time, or agent cost | add first-response and resolution timestamps, per-tier slice | yes (the binding constraint) |
| Stripe fees | **no** (per transaction) | none | n/a | not captured | as the Stripe processing cost row above | yes |
| App-store fees | n/a today | none | n/a | no IAP (deposits are card, not in-app purchase) | only if in-app subscription is ever built | conditional |
| Infrastructure cost | partial | `docs/paid-plan-triggers.md` (stale, dated 2026-05-10) | low | not tracked live; amortized-per-user only in `business-model.md` | refresh the infra-tier tally at launch; track fixed monthly | no (fixed, small) |
| Moderation cost | partial | `admin_action_log`, `map_reports` counts | low | no handling time or cost | capture handling time per moderation action | no |
| Average studio seat count | **no** | none | n/a | no membership or seat model exists | only relevant if a per-seat Studio metric is chosen (not recommended) | conditional (Studio metric) |
| Feature usage by cohort | yes | acquisition-by-source, activation-by-age, feature adoption (12 features) | medium (small samples, sample guard) | not sliced by plan tier | add a plan-tier dimension once tiers are populated | no |
| Upgrade-trigger frequency | **no** | none | n/a | no `pricing_viewed`, no cap-hit event, no `plan_selected` | emit `pricing_viewed`, `cap_reached`, `plan_selected` | yes (conversion) |
| Willingness-to-pay (quantitative) | **no** | `founding_artist_applications` (qualitative: `monthly_request_volume`, `current_booking_method`, `primary_problem`, `career_stage`) | low | no pricing page, `pricing_viewed` unemitted | ship `/pricing`, emit `pricing_viewed` and `plan_selected`; run a price-sensitivity survey | yes (all pricing) |
| Deposit failure, refund, forfeit | yes | `audit_log` action counts (bookings tab) | high | none | keep (margin-leakage signal) | no |

---

## 3. The minimum instrumentation to build before final pricing

Ranked by how load-bearing each is for a pricing decision:

1. **Persist margin actuals** (D21): `platform_fee_collected_cents` and `stripe_fee_cents` per deposit at settlement, so net margin per deposit is measurable. Without this, the entire "3% is the margin" model cannot be validated, and the loss-making-small-deposit exposure is invisible.
2. **Plan-change event and history** (D20): a `plan_changed` analytics event plus an `account_override_history` table, so comp-to-paid and future self-serve conversions and churn are measurable from day one. Distinguishing `comp`, `beta`, `paid`, and `grandfathered` sources (D11) is a prerequisite.
3. **Conversion funnel events**: `pricing_viewed` (already reserved with no emitter in the public analytics registry), `cap_reached`, and `plan_selected`. These make the free-to-paid funnel visible before any real subscription exists.
4. **Support cost timestamps**: first-response and resolution times per ticket, per tier. Support time is the founder-stated binding constraint on the thin Plus tier; counts alone cannot price it.
5. **Goods take fix and tracking**: fix `application_fee_amount` for goods, then track goods GMV and take, before goods commerce is a real revenue line.

The first two are the highest priority, because they turn the two most consequential unknowns (does the deposit fee actually make margin, and does anyone convert to paid) into measurable quantities. Neither requires billing to exist; both should be built alongside or ahead of BM-2.3.

---

## 4. What can be decided today versus what must wait for data

**Can be decided today (structural, evidence-independent):**

- Keep the hybrid entitlement architecture (D1) and the internal-state source of truth (D2).
- Keep one account type; studio is a scope (D3).
- Keep artist billing web-only (D17).
- Wire the five inert entitlements and fix the mobile predictor drift (D18, D19).
- The tier shape (Free, Plus, Studio) and the feature-to-tier assignments in the matrix.

**Must wait for the instrumentation above:**

- Whether Plus at approximately 3 euro per month covers its support and payment overhead (needs support-cost timestamps and margin actuals).
- The final Plus and Studio prices and the founder-window shape (needs willingness-to-pay data and conversion funnel events).
- Whether to lead with transaction revenue or subscription (needs G-5 deposit-adoption evidence, then margin actuals).
- The goods take rate (needs the goods fee fix and GMV tracking).
- Studio pricing (needs studio activation and claim-funnel metrics and Q8 resolution).

The single most important piece of missing evidence is the first live money test (launch gate G-5): whether real artists connect Stripe and whether real clients pay deposits by card. Everything about whether the model should be transaction-led or subscription-led hinges on it, and it is unrun.
