# Plus appointment payments: architecture

**Status:** approved scope, founder direction 2026-07-28. Design only; **nothing here is activated**. Companion to `plus-product-spec.md` (what Plus is), `plus-build-plan.md` (stages), `plus-capability-registry.md` (per-capability truth). Money-path rules in AGENTS.md apply to every line of this.

Conventions: sentence case, no em-dashes.

---

## 1. Capability boundary

**All Inklee card payment collection is Plus-only.** Free artists keep manual and offline payment tracking exactly as today and cannot collect card payments through Inklee at launch.

| Capability | Free | Plus |
|---|---|---|
| Manual / offline deposit tracking | preserved | included |
| Card deposit collection | not available | included |
| Remaining balance collection | not available | included |
| Full tattoo price collection | not available | included |
| Additional itemized lines | not available | included |
| Appointment payment insights | not available | included |
| Appointment payment platform fee | **not applicable** | **0.5%** |

There is no Free card-payment rate. Any "Free 3%" found anywhere is stale and gets removed, not reconciled.

**Connected accounts:** never created for a Free artist in anticipation of an upgrade. The Stripe connected account is created or activated only inside the Plus payment-onboarding flow, so an artist who never upgrades never costs a Connect account.

## 2. Entitlement vocabulary

One broad `deposits` key must not stand for all payment behaviour. Shipped in `packages/shared/src/entitlements.ts`:

`manual_deposit_tracking` (the only Free-baseline feature), `card_deposit_collection`, `appointment_balance_collection`, `full_appointment_payment_collection`, `appointment_payment_line_items`, `appointment_payment_refunds`, `appointment_payment_insights`.

They resolve together as one Plus payment package commercially while staying distinct in the system, so a later package change is a resolution change rather than a rewrite. The legacy `deposits` key stays as the live gate until P7 migrates its call sites, so nothing changes under existing accounts in the meantime.

## 3. Payment request model

A payment request is an **immutable revision**. Sending one freezes the client-visible amount and the line-item snapshot.

**Lifecycle:** draft, ready, sent, viewed, payment processing, partially paid, paid, expired, cancelled, partially refunded, refunded, disputed, failed.

If the artist changes the price or lines after sending, the unpaid request is **cancelled and replaced** or a **new revision** is created. A request the client has already reviewed is never silently modified: the amount someone agreed to and the amount charged must be the same object.

**Line items** carry: name, optional description, quantity, unit amount, line total, classification, tax treatment, refund status, source, and an optional linked goods product or order. The client sees the itemized breakdown before paying. There is no unstructured "additional amount" field, because an unexplained delta on a payment screen is exactly what erodes trust in an artist's page.

**Classifications:** `tattoo_service`, `additional_service`, `physical_goods`, `discount`, `tip`, `tax`, `shipping`, `manual_review`.

## 4. Outstanding balance

```
remaining = final tattoo price + eligible extras - allocated successful payments - eligible discounts
```

A payment counts against the balance only when it is successfully collected, allocated to the same appointment or project, not fully refunded, not disputed in a way that invalidates it, and not cancelled or failed.

Rules that follow from that: the collected deposit is shown plainly; the artist confirms or updates the final price (it is **never inferred from the deposit**); collection above the authoritative outstanding amount is refused server-side; and a zero balance produces no request at all rather than a €0 one.

Full payment does **not** require a prior deposit. Deposit-then-balance, full-payment-only, deposit-equals-full-price, and pay-after-the-session are all the same model with different starting states.

## 5. Mixed service and goods

A payment may contain both. Fee calculation must separate them, and **the two fees are never charged on the same value**.

When a line is an existing Inklee goods product it links to that product, creates or updates the goods order, applies inventory rules, the goods tax treatment, and the goods fee schedule, and preserves fulfilment and refund responsibilities. Goods remain the artist's to sell and fulfil; Inklee is infrastructure.

## 6. Fee bases

| Lane | Base | Free | Plus |
|---|---|---|---|
| Appointment payment | eligible tattoo-service value successfully collected | n/a | 0.5% |
| Goods | product subtotal after discounts, ex VAT and shipping | 5% | 1% |

**Excluded from both:** VAT or equivalent, tips, shipping, refunded value, failed payments, cancelled payments, pure pass-through statutory charges, and the other lane's value.

Stripe processing fees are always identified separately and never described as part of the Inklee fee. The effective fee-schedule version is stored on every payment (`packages/shared/src/fee-schedule.ts`); the approved v2 rates are defined but **not active** pending P7 and accountant approval of the final fee and tax treatment.

## 7. Allocation

Every collected amount is explicitly allocated across components: deposit, tattoo-service balance, full price, additional service, physical goods, tip, tax, shipping, discount, refund adjustment. **Never one unclassified total.**

The allocation is what makes accurate refunds, per-lane fee calculation, tax reporting, goods fulfilment, artist analytics, client receipts, reconciliation and dispute evidence possible. Storing a single number forecloses all of them, and no later migration recovers the breakdown.

## 8. Double-charge prevention

Layered, because no single mechanism covers all of it:

- **Idempotency keys** on every Stripe call.
- **Immutable revisions**: paying against a superseded revision is refused.
- **Server-authoritative outstanding balance**: the displayed amount and the Stripe charge come from the same quote, computed server-side.
- **Explicit allocations**: one deposit cannot be applied to two appointments.
- **Webhook idempotency** plus converge-to-a-target (never add a delta) per the money-path rules.
- **Reconciliation against Stripe** as the backstop.

Covered failure modes: duplicate requests, duplicate charges, replays, concurrent attempts, collecting an already-paid balance, collecting above outstanding, cross-appointment deposit application, unrelated payments on the wrong client, payment after cancellation, payment against an obsolete revision.

## 9. Refunds

Supported: full, partial, single line item, proportional, deposit, goods item, and mixed service-and-goods.

For mixed payments each component refunds by its classification with its own fee-refund rule. The original transaction is preserved and adjustments are immutable records. **Deposit transfer-reversal behaviour is not executed unless that specific money path requires it** — deposit, appointment-payment and goods refunds may share low-level utilities but stay separate business commands, because their Connect semantics differ.

**Fee-refund policy** (versioned data, not scattered conditions):

| Case | Inklee fee |
|---|---|
| Full voluntary client refund | returned |
| Partial refund | returned proportionally |
| Chargeback / dispute | retained where legally and contractually permitted |
| Fraudulent or prohibited | retained where permitted |
| Artist cancellation | only non-recoverable Inklee costs retained |
| Inklee system error | returned |

Stripe processing costs stay separate because their recoverability depends on Stripe's rules.

## 10. Scope boundary

Plus v1 is deposits, balances, full price, a bounded number of line items, linked goods, refunds, reconciliation and insights. **This is not a general invoice platform.**

Deferred unless separately approved: general invoicing, open-ended invoice creation, recurring client billing, instalment plans beyond deposit-plus-balance, buy-now-pay-later, point of sale, revenue splitting, studio commission distribution, artist-defined taxes, arbitrary fee categories.

## 11. Client experience

The client sees artist identity, the related appointment or project, the tattoo service price, the deposit already paid, earlier payments, additional lines, discounts, tax, shipping where applicable, total previously paid, current amount due, refund and cancellation information, a clear action, and a durable confirmation.

Button copy states the amount: **"Pay €X now"**. Never "Continue", "Confirm", "Finish" or "Submit" — an ambiguous button on a payment screen is how people pay amounts they did not mean to.

## 12. Test obligations

Deposit-then-balance; full payment without deposit; deposit equal to final price; final below deposit; final above estimate; additional service line; linked goods line; mixed payment; discount; tax component; tip and shipping exclusion; duplicate request; duplicate webhook; concurrent attempts; payment after replacement; payment after cancellation; full, partial and single-line refunds; deposit refund then new full payment; dispute; failed payment; expired link; downgrade after sending a request; subscription expiry mid-processing; grandfathered account without card access; studio versus personal scope; and deposit / appointment-payment / goods money-path isolation.

## 13. Launch requirement

Plus does not launch until the full payment scope is operational: deposits, balances, full payments, itemized charges, correct mixed-goods handling, server-authoritative totals, duplicate-charge protection, refunds, reconciliation, payment analytics, correct fees, correct entitlement scope, final pricing claims, final contractual wording, and final counsel sign-off. The full-payment claim is not published before the capability genuinely works.
