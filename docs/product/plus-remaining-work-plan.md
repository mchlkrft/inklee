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

## Stage 0: correctness fixes — DONE

All seven items are resolved. One residual text edit in the Terms (C3,
line 76: "plan settings" → "account settings") is deferred to Stage 6 because
it must go through the versioned Terms workflow.

| id | item | status |
|---|---|---|
| C1 | Account deletion cancels subscription | DONE: step 2b in account-deletion.ts:166-218 |
| C2 | Yearly Plus unselectable | DONE: yearly option renders for everyone (no longer gated on founder-offer eligibility) |
| C3 | Cancellation copy points at wrong page | DONE (code strings): Stripe custom_text, upgrade-button, withdrawal copy all say "account settings". DEFERRED (Terms line 76): must go through Stage 6 versioned workflow |
| C4 | Lost webhook has no recovery path | DONE: reconcile has 3 callers (webhook, cron backstop, checkout-return) |
| C5 | Consent evidence cannot be tied to contract | DONE: consent_hash + ip + user_agent written on all consent records; IMMEDIATE_PERFORMANCE_TEXT hash enforced by billing-consent-copy.test.ts |
| C6 | Em-dashes in upgrade-button | DONE: `23f3ec6` |
| C7 | close-sales.cjs | DONE: script + runbook |

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

~~Bundles~~; the `shop` and `guestSpots` appearance surfaces that exist in the
vocabulary with no renderer; ~~detailed sales analytics~~. Page:
~~`image_gallery` block type~~, section layouts, custom SEO fields.

**Bundles DONE 2026-07-31** (management complete, gated OFF + dark): backend
(migration 0132: `product_bundles` + `product_bundle_items`, per-command RLS +
composite FKs, convergent; shared model + savings; `goods_bundles` entitlement +
gate; server CRUD with archive-first delete and item cap; 40 tests) `5e094d0`;
web editor + public shop display + nav `cb01199`; native route + screen `df9e85a`;
payable-checkout DECOMPOSITION proven `bundleGoodsLine` -> goods-fee base on the
BUNDLE price under v1 (0%) and v2 (5%/1%), 8 tests. Only the live checkout WIRING
remains, deferred to the goods-commerce un-park (P7) per decision B5; it reuses
`bundleGoodsLine`. DB RLS tests (`bundles-rls`, `bundle-items-rls`) need
`pnpm test:db` / CI to run. Decisions B1-B5 in `plus-build-time-decisions.md`.

**`image_gallery` block DONE 2026-07-31**: a Plus rich block (the artist's own
images) added across the shared model (`bio-page.ts`: union, guards,
`sanitizeImageUrl`, parser, caps), the web public render (`hub/page.tsx` +
`feature-blocks.tsx`), the web editor (`link-hub/*`: add/reorder images,
captions, grid/carousel), the mobile route + native editor (read-only "edit on
web" summary, gated add). Gated on the `appearance_custom` entitlement (rich
blocks per `features.ts`): the hub stays free, the block is Plus, preserved in
settings but hidden on downgrade like `featured_collection`. 13 new parser
tests. Native editing is web-only for v1 and rollout is gated behind a fresh EAS
build (breaking wire change), both recorded in `plus-build-time-decisions.md`
(D1-D5) and `web-native-parity.md`.

**Section layouts: already built (P2), the work-plan line was stale.** The
page-level layout system exists end to end: four templates (clean / portfolio /
bold / editorial) in `page-template-styles.ts`, the picker in the appearance
editor (`settings/appearance/appearance-form.tsx`, the "Layout" fieldset), the
write path (`appearance-write.ts` persists `template`), the render
(`hub/page.tsx` + booking page apply `templateStyles(appearance.resolved.template)`),
and the entitlement boundary (`surfaceAppearance` -> `freeTierView` resets Free
to `clean`). The image_gallery block additionally added a per-section layout
(grid / carousel). See `plus-build-time-decisions.md` D6. **Remaining page work:
custom SEO fields only** (blocked on X1, the indexation decision).

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

**Hard preconditions before the flip (recorded 2026-07-31 from the answers):**

1. **A3 conditions (accountant + counsel).** The new **Free goods fee (5%, where
   the current rate is 0%)** is a unilateral fee introduction for existing users,
   so before the flip: (a) Terms coverage of the fee and the change mechanism,
   and (b) reasonable advance notice to affected users. This also re-opens the
   still-unclosed payment-flow §10 fee-disclosure items; close them together.
   While unregistered, all v2 fee lines carry the non-registered small-undertaking
   wording (no VAT, no reverse charge).
2. **F14: no UNDEFINED cell (founder).** The schedule must not activate with an
   undefined cell. `fee-schedule.ts` keys on tier `free | plus`, and
   `legacy_free_v1` resolves to `free` via `effectivePlanTier`. So under v2 a
   grandfathered artist who carries the deposits override would be charged the
   **free appointment rate (`null` -> `feeMinorUnits` returns 0 = 0% fee)** and
   the **free goods rate (5%)**. Nobody has decided whether that is the intended
   grandfather benefit or leakage. Flagged UNDEFINED at
   `plus-capability-registry.ts:411` (deposit) and `:435` (goods). Founder must
   pick the legacy rate (Plus 0.5% / old 3% / 0% grandfather) and it must be
   encoded before the flip. Zero affected accounts today, but the schedule cannot
   ship an ambiguous cell.

### Fee refund policy v1 (separate flip, F2) — cost-only REMEDIATED 2026-07-31

`ACTIVE_FEE_REFUND_POLICY_VERSION` is still v0. Counsel approved v1's "retain
non-recoverable" on three conditions (`plus-launch-handoff.md` F2). Condition (3)
client-unaffected already held. **Condition (2) cost-not-margin (finding
`PAY-RFD-002`) is now implemented:**

- **Engine** (`fee-refund-policy.ts`): `feeRefundOutcome` takes the actual
  `nonRecoverableCostMinor` + `alreadyRetainedMinor` and returns a `retainMinor`
  / `returnMinor` split. `retain_non_recoverable` retains `min(cost, fee)`
  proportional to the refund, capped so cumulative retention never exceeds the
  real cost or the fee, and returns the margin. With no cost it returns null
  (fail-safe), never the whole fee.
- **Core** (`appointment-payment-refund.ts`): resolves the policy version from
  the persisted collection stamp (never client input), reads the actual cost
  from `payment_collections`, returns the margin via a partial application-fee
  refund, records retained cost to prevent double-retention, and **returns the
  full fee (retains nothing) when the cost is unavailable** rather than retaining
  an unproven amount.
- **Settlement** (`appointment-payment-settlement.ts`): captures the actual
  Stripe cost from the charge's `balance_transaction` and stamps the policy
  version + application fee on the collection.
- **Migration 0131**: persists cost, source, status, policy stamp, app fee and
  retained-so-far on `payment_collections` (service-role only).
- Proven by 8 engine unit tests + 8 real-core end-to-end tests (two mutations
  confirmed they discriminate). Recorded in `docs/audit/findings.yaml`
  (`PAY-RFD-002`, remediation fixed-unverified).

**Activation gate (still CLOSED).** `ACTIVE_FEE_REFUND_POLICY_VERSION` stays v0
and settlement stamps v1 only when `FEE_REFUND_V1_ACTIVATION_ENABLED` (env
`FEE_REFUND_V1_ACTIVATION`) is on. Before flipping it on: (a) run 0131 against
prod; (b) confirm settlement is capturing the per-transaction cost; (c) real
reconciliation of the cost; (d) the fee-refund approval key current against this
implementation; (e) F2 condition (1) Terms disclosure of the retained-cost rule.
The v1-specific path has not run against real Stripe or real Postgres yet (tests
mock both), so the exact application-fee-refund semantics are validated at
activation (G-5), not now.

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

**Make unparking a hard precondition on recording the launch key.** ~~Nothing
mechanically enforces that today~~ ENFORCED 2026-07-31: `record-approval.cjs`
reads `DISABLED_CAPABILITIES` and refuses to record either launch key while any
marketed capability (`branding`, `custom_templates`, `entitlement_caps`,
`analytics`) is still parked. Exits 3 with the specific list.

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
