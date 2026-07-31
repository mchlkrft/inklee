# Plus: the remaining work, ordered

**Written 2026-07-29** after the post-merge launch-readiness audit (5 lenses,
adversarial verification, 2 of 10 blocking claims confirmed and 8 refuted or
downgraded).

**This is a SEQUENCING document, not a second source of truth.** Content lives
where it already lives: `plus-payments-architecture.md` (what P5b is),
`plus-product-spec.md` (what Plus is), `plus-build-plan.md` (stage table),
`plus-commercial-packages.md` (commercial), `pricing-model.md` (pricing). Where
this document and one of those disagree about WHAT something is, they win. This
one only says in what ORDER and why.

---

## The founder decision that selected this plan

Two tracks were put up on 2026-07-29:

- **Track A, full package**, 10-15 working weeks, dominated by P5b.
- **Track B, re-cut** the marketed list to the seven capabilities that already
  enforce, 4-6 weeks.

**Track A was chosen**, by directing appointment payments as the next milestone.
Track B is recorded here rather than deleted, because it stays available if the
date ever matters more than the scope, and because the reasoning behind it is
the useful part.

---

## The finding this plan exists to fix

> The working differentiation is entirely unsold, and the sold differentiation
> is largely non-working.

Verified in production on 2026-07-29:

- **2 of 5 marketed benefits genuinely differentiate.** Card deposits and
  branding. The other three (custom email templates, higher limits, advanced
  analytics) are free for every account.
- **7 capabilities enforce correctly and NONE of them is marketed**:
  `large_projects`, `appearance_custom`, `form_custom`, `form_conditional`,
  `goods_discounts`, `goods_scheduling`, `goods_collections`.
- The **live Terms section 11** names four benefit families, three of which are
  currently free. That is a shipped contractual document, live today,
  independent of any launch flag.

Nothing can be charged today: both `consumer_sales_launch_approved` and
`business_sales_launch_approved` are absent from `billing_activation_approvals`,
verified live. The hold is working. That is what makes the above a scheduling
problem rather than an incident.

---

## Stage 0: correctness fixes (parallel to everything, ~1-1.5 weeks)

None of these depend on P5b, and none should wait for it. Ordered by what a
paying customer would hit first.

| id | item | why now | size |
|---|---|---|---|
| C1 | **Account deletion never cancels the subscription**, and all eight billing/tax tables are `ON DELETE CASCADE` on `profiles`, so the records Terms promises to retain are destroyed. Downstream, later `invoice.paid` events carry a deleted `artist_id`, reconcile hits 23503, the handler 500s, and Stripe eventually disables the endpoint for everyone. | Charging someone after they delete their account is a consumer-law and chargeback problem, not a bug. Latent only because zero subscriptions exist. | M+L |
| C2 | **Yearly Plus is advertised and unselectable.** `upgrade-button.tsx:47-48` renders the yearly option only when `yearlyFirstYearLabel !== null`, which resolves only for a founder-offer-eligible viewer. `founder_offer_policy` has 0 rows, so it never renders, while `/pricing` hardcodes the yearly price unconditionally. | At the flip every visitor is quoted a yearly price they cannot select. | S |
| C3 | **Cancellation copy points at the wrong page.** Five customer-facing strings (Terms line 76, pricing FAQ, Stripe checkout `custom_text`, confirmation email) say cancel from plan settings; the control lives on `/settings/account`. | The `withdrawal_policy` record asserts `as_easy_as_signup`. | S |
| C4 | **A permanently lost webhook has no recovery path.** Reconcile has three callers, none a cron, admin action or checkout-return handler. Orphan path returns 200 and drops the event. | Card charged, account stays Free, no tooling to fix it. | M |
| C5 | **Consent evidence cannot be tied to a contract.** No contract reference on `billing_consent_records`; `ip`/`user_agent` declared and never written; `IMMEDIATE_PERFORMANCE_TEXT` has no hash or snapshot, so it can be edited without a version bump while CI stays green. | This is the text that makes a proportionate withdrawal deduction enforceable. Counsel will ask at final sign-off. | M |
| C6 | **Two em-dashes** in `upgrade-button.tsx:112` and `:123`. | Founder copy rule, on the one screen where a consumer commits to a recurring charge. | S |
| C7 | **`close-sales.cjs`**: a ~20-line script plus three runbook lines to revoke the launch keys. | There is a documented way to open sales and no rehearsed way to close them. | S |

---

## Stage 1: P9 appointment payments — DONE

**All 8 slices committed on master** (A1 `0b42f2d` through A8 `290ee50`).
Spec: `plus-payments-architecture.md`. Naming: P5b was used twice in the build
plan; this is **P9** (the goods letter sequence keeps P5a-P5d).

---

## Stage 2: P6 insights — DONE

Downstream of P9 because it consumes payment actuals. Carries the **advanced
analytics** benefit, which is one of the three currently-free marketed claims
and the only one needing a real build.

Boundary is canonical in spec §19: Free gets current operational state and all
raw records; Plus gets history, comparisons, attribution, conversion and trends.
Enforce at the query and server layer, never navigation only.

**Analytics wiring DONE 2026-07-31** (`f5d4737`): migration 0130 (two tables,
enums, RLS), `/api/artist-events/collect` (hub click beacon), `HubAnalytics`
client component (event delegation via `data-track` attributes on the RSC hub
page), daily rollup in the cleanup cron (wa pageviews + click events + booking
conversions + goods conversions), `getArtistHubAnalytics` gated by
`canSeeAdvancedAnalytics` (first production call site), artist `/analytics`
page gains Bookings/Hub tabs, mobile `/api/mobile/analytics` returns
`hubAnalytics`, 36 pure-function tests, parity register and capability registry
updated. `analytics` is still paused (everyone sees everything); unparking is
a Stage 5/P7 action.

**Savings dashboard DONE 2026-07-31** (`bbf3dba`): `fee-savings.ts` types +
`formatCentsEur`, `fee-savings-query.ts` server query gated by
`canSeeAdvancedAnalytics` (deposit fees from `booking_requests` + goods fees
from `orders`, hypothetical comparison under the other tier using per-transaction
`fee_schedule_version`, subscription cost from `billing_subscriptions`), Savings
tab on the analytics page, mobile route returns `feeSavings`. Under V1 (active
schedule) both tiers pay 3% on appointments and 0% on goods, so savings = 0 and
the UI explains this. P9 appointment-payment fees (stored only as Stripe
`application_fee_amount`, not a database column) are not yet included; they are
also 3%/3% under V1 so the gap is dormant. When V2 activates (Stage 4),
real differentiation appears. 3 additional tests.

Unparking `analytics` remains a P7 action.

---

## Stage 3: goods and page remainder (~3-5 weeks, parallelisable)

Bundles; the `shop` and `guestSpots` appearance surfaces that exist in the
vocabulary with no renderer; ~~detailed sales analytics~~. Page:
`image_gallery` block type, section layouts, custom SEO fields.

**Sales analytics DONE 2026-07-31**: `/goods/sales` gains Plus-gated trends
section above the existing raw ledger: this-month vs last-month stat cards with
percentage change, top products ranked by revenue (capped at 8), monthly
revenue/orders/items summary (last 6 months). Computed from existing order data
via `computeSalesAnalytics` (extracted to `goods-sales-analytics.ts`, 13 pure
tests). Free tier keeps the raw ledger + totals unchanged. Mobile route
`GET /api/mobile/goods/sales` serves the same data. Gated by
`canSeeAdvancedAnalytics` (same boundary as hub analytics and fee savings).

---

## Stage 4: fee schedule v2 (~0.5-1 week)

**Unify the two fee sources FIRST** (see A3). Only then flip
`ACTIVE_FEE_SCHEDULE_VERSION`, as one deliberate money-path change with
accountant re-confirmation against v2 specifically. Under v1 both paths compute
600 so the divergence is invisible; under v2 they would set 600 vs 100 or 0.

---

## Stage 5: P7 commercial closure (~1 week)

Order matters here and is easy to get wrong:

1. ~~**Refresh `plus-capability-registry.ts` first.**~~ DONE 2026-07-31: added
   card deposit collection + appointment payments rows, updated goods tools
   (P5d collections + discounts + scheduling), templates page gate, fee
   unification, featured_collection block, founder offer C2 fix.
2. ~~**Write `commercial-readiness.cjs`**~~ DONE 2026-07-31: reads
   DISABLED_CAPABILITIES + database launch keys + founder offer + fee schedule.
3. ~~**Migrate the legacy `deposits` call sites onto the fine payment keys.**~~
   DONE 2026-07-31: deposit-collection.ts, bookings.ts, mobile/me/route.ts,
   admin entitlements all check `card_deposit_collection`. Kill switch stays
   `deposits`. Migration script: `scripts/entitlements/migrate-deposits-key.cjs`
   (run against prod before launch).
4. Re-run `legacy-free-recompute.cjs`, then **unpark `entitlement_caps`**.
5. ~~**Unpark `custom_templates`.**~~ Page gate DONE 2026-07-29 (1c914ca):
   settings/emails/page.tsx shows banner + disables buttons when !entitled.
   The actual unpark (removing from DISABLED_CAPABILITIES) is an env change.
6. Insert the `founder_offer_policy` row (0 rows today, so the offer is closed
   by default and never opens on its own).
7. G-5: complete Connect onboarding in LIVE mode and run one real card deposit.
8. Fresh iOS build (still `0.3.0(4)` from 2026-07-17, predating everything).

**Make unparking a hard precondition on recording the launch key.** Nothing
mechanically enforces that today, and it is the difference between selling three
benefits that exist and three that do not.

---

## Stage 6: P8 endgame (~1-1.5 weeks plus counsel turnaround)

Final Terms through the **versioned workflow** (bump, snapshot, re-record) or CI
fails. Checkout disclosures generated FROM finished behaviour. Submit the
finished package for the ONE counsel gate. Apply corrections. Record approvals
against the final versioned artifacts. Record `consumer_sales_launch_approved`.
Flip. Then a real verification purchase plus a withdrawal and a refund.

**Sequencing constraint that catches people:** correcting the benefit claims
means editing `terms.md`, which bumps the version and hash, which invalidates
`terms_approved` and re-closes the b2c gate until re-recorded. Correcting the
marketing is not free. Budget the re-record.

---

## Before the flip, execute these once

The audit could not verify them because they are writes, and each is exactly the
kind of claim this repo has been burned by:

- **Nobody has ever observed the production server refuse a real checkout.** The
  refusal is proven at unit level (34 tests, mocked reader) plus a live
  evaluation of the pure gate against real production rows. That is two strong
  pieces of evidence composed into a sequence, not the sequence itself.
- **The open-to-closed gate transition has never been exercised**, because the
  key has never been recorded.
- **Webhook idempotency and out-of-order convergence have never run against real
  Postgres**, only against an in-memory fake of PostgREST.
- The four engineering approval keys were recorded 2026-07-23, before the
  ordering guard, the founder-offer branch and the invoice parent path landed.
  **They certify code that no longer exists** and should be re-recorded.

---

## Honest total

**10-15 working weeks**, dominated by P9 at roughly a third. P6 is second and
cannot start early. Everything else parallelises or is small.
