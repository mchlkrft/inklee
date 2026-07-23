# Billing decision pack

**Status:** Engineering deliverable for the authorized Stage 0 / Stage 1 / test-mode Stage 2 pass, 2026-07-23. Not legal or tax advice. All consumer and legal copy remains DRAFT requiring qualified counsel. No live subscription money is enabled by anything here.

This pack records the founder amendments applied to the approved architecture, the Stripe responsibility and deposit-isolation maps, the B2B pricing options, the accountant and counsel decision sheets, and the exact approvals still blocking each live launch. Label key as in the companion docs.

---

## A. Amendments applied (founder 2026-07-23)

These correct and refine the committed design set and are authoritative where they differ from an earlier passage.

1. **Consumer classification is conservative and versioned.** Implement Inklee Plus as a continuously supplied digital service where starting access immediately does NOT automatically extinguish the withdrawal right. The consumer architecture must not depend on obtaining a complete withdrawal waiver. The service classification is a versioned, counsel-approved legal-policy row (`billing_legal_policies`), not hardcoded. Counsel still approves the exact classification and wording.
2. **VAT posture correction.** Being below the Estonian domestic threshold does NOT by itself determine cross-border subscription treatment, place of supply, reverse charge, OSS, or any limited-registration obligation. Live EU billing requires a **management-board-approved** tax posture (the board holds legal responsibility for it). A founder, developer, or single employee cannot substitute; professional (accountant/tax) review is strongly recommended and recorded as evidence, but is not treated as legally mandatory (enforced: the gate reads `tax_policies.management_board_approved`; superseded the earlier accountant-sign-off model in migration 0108).
3. **VIES failure behavior corrected.** Explicit states `not_submitted | validation_pending | valid | invalid | provider_unavailable | manual_review`. Only `valid` may auto-support reverse charge; `provider_unavailable` never silently becomes `valid` or `business_without_vat`; the charge is blocked or handled through an accountant-approved fallback; every attempt is stored append-only (`vies_validation_attempts`); revalidate after a material billing-identity change.
4. **Declarations are evidence, not truth.** The professional-use declaration is a classification input with a stored source, confidence, and review state (`classification_source` in `self_declared | vat_verified | manually_verified | system_inferred | conflicting_evidence | unresolved`, plus `classification_confidence` and `classification_review`). Where evidence conflicts, block the charge or route to review; never auto-deny consumer protections on a checkbox alone.
5. **Stripe responsibility boundary** (map in section B).
6. **Deposit and subscription isolation** (map in section C).
7. **Price and entitlement separation corrected.** Tax behavior is fixed for an individual Stripe Price, and Inklee may create a new Price and archive an old one; it is NOT one permanent business-wide choice. A B2B tax-exclusive Price, a future B2C tax-inclusive Price, and a grandfathered Price can coexist. Modeled as a stable commercial package + stable entitlement package + a replaceable, effective-dated Stripe Price (`pricing_plans`). Price ids never appear in an authorization check; tax behavior is never attached to an entitlement key.
8. **Schema scope.** Built the minimum coherent set (section D); `withdrawal_cases` and `billing_risk_events` are authored-schema-only; NO custom `promo_codes` table (use Stripe promotions, add an internal mapping only on a defined requirement).
9. **Tax snapshots reference Stripe, do not compete with it.** Each snapshot references the internal subscription, Stripe Customer, Subscription, Invoice, PaymentIntent or Charge, the Stripe Tax calculation, and the pricing-plan, tax-policy, and classification versions; corrections are new adjustment rows. Stripe remains the payment and invoice system.
10. **Consumer withdrawal function** is a hard prerequisite for consumer live (section F, B2C).
11. **Activation approval groups** are separate: `technical`, `b2b`, `b2c`. Approval for one never approves another (enforced by `billing_activation_approvals.approval_group`).

---

## B. Stripe responsibility map (amendment 5)

| Concern | Owner | Note |
| --- | --- | --- |
| Subscription payment collection | **Stripe** (Billing + Checkout) | `mode: subscription` Checkout Session created from the internal quote. |
| Payment methods, invoices, billing details, tax IDs, ordinary cancellation | **Stripe** (Customer Portal) | The supported self-service surface. No custom portal. |
| Recurring scheduling, dunning, retries, invoice generation | **Stripe** | No custom recurring scheduler, no replacement invoice engine, no custom card form. |
| Customer classification (4 axes), business-use declaration | **Inklee** | `account_billing_profiles`, evidence model. |
| Terms and consent evidence | **Inklee** | `billing_consent_records` (append-only). |
| Server-authoritative quotes | **Inklee** | `billing_quotes`; the single source of the display price and the Stripe amount. |
| Billing activation approvals (the live gate) | **Inklee** | `billing_activation_approvals`. |
| Entitlement resolution and grandfathering | **Inklee** | The pure engine + `account_overrides`. |
| Consumer withdrawal and refund policy decisions | **Inklee** | `withdrawal_cases`, the proration policy. |
| Tax-policy versions and the internal transaction snapshot | **Inklee** | `tax_policies`, `transaction_tax_snapshots` (the basis, not the invoice). |

`billing_subscriptions` is a reconciled access-control mirror of Stripe, never a competing financial source of truth. Stripe is the payment and invoice system; the internal record exists so entitlement access resolves without a live Stripe call.

---

## C. Deposit versus subscription isolation map (amendment 6)

Shared only: the low-level Stripe client init and generic safe utilities. Everything else is separate, with distinct namespaces.

| Axis | Deposits (existing) | Subscriptions (new) |
| --- | --- | --- |
| Server module | `lib/server/bookings.ts` (`requestDepositCore`, `refundDepositCore`) | new `lib/server/billing/subscription.ts` + `.../subscription-refund.ts` |
| Webhook handler | `api/stripe/webhook/route.ts` (deposit/Connect events) | new `api/stripe/billing-webhook/route.ts` (subscription/invoice events) |
| Reconciliation | Connect account sync | new `lib/server/billing/reconcile.ts` |
| Idempotency-key namespace | `deposit-intent-*`, `refund-deposit-*` | `sub-*`, `sub-refund-*` |
| Metadata namespace | `booking_id`, `artist_id`, `sponsored_fee_cents` | `billing_subscription_id`, `pricing_plan_id`, `contract_customer_type` |
| Refund command | `reverse_transfer: true` + `refund_application_fee: true` (Connect) | `stripe.refunds.create` on Inklee's own charge, **NO `reverse_transfer`, NO `refund_application_fee`, NO connected-account behavior** |
| Audit events | `deposit_*` | `subscription_*` |
| Permission check | booking ownership | subscription ownership + the activation gate |
| Tests | deposit suite | subscription suite + a **cross-path regression suite** |

**Regression tests (required):** prove a subscription operation cannot trigger a deposit transfer, a reversal, or connected-account behavior, and that a deposit operation cannot touch a subscription record. This is the guard against the two money paths bleeding into each other.

---

## D. Final schema and migration list (deliverables 1, 2)

**Migration `0106_billing_core.sql` (authored, NOT applied).** Numbering: 0105 (`account_overrides` billing + grandfather) is authored; 0106 is the next sequential number; the deferred goods `orders` migration renumbers to a later slot when authored (AGENTS.md: never author an earlier number later).

Built now (the minimum coherent foundation):

- `billing_legal_policies` (versioned service classification, counsel-approved) [added beyond the founder list because amendment 1 requires a versioned, non-hardcoded home]
- `tax_policies` (versioned tax posture, management-board-approved; 0108) [added because the snapshot references a tax-policy version and the gate requires a management-board-approved posture, amendments 2 and 9]
- `pricing_plans` (stable package + replaceable per-Price, effective-dated, amendment 7)
- `account_billing_profiles` (4 axes + evidence model + VIES state, amendments 3 and 4)
- `vies_validation_attempts` (append-only, amendment 3)
- `billing_subscriptions` (reconciled Stripe mirror, amendment 5)
- `billing_consent_records` (append-only consent evidence)
- `billing_quotes` (server-authoritative quote)
- `billing_activation_approvals` (three groups, amendment 11)
- `transaction_tax_snapshots` (immutable, references Stripe + versions, amendment 9)
- `billing_contract_confirmations` (append-only durable confirmation evidence)

Authored-schema-only (no operational system until Stage 4):

- `withdrawal_cases` (the withdrawal case machine, built in Stage 4)
- `billing_risk_events` (the anti-abuse event store, built in Stage 4)

Deferred and why:

- **`promo_codes`** (custom table): NOT built. Stripe promotion codes cover the founder window; an internal mapping is added only on a defined product requirement (amendment 8). Eligibility by customer type is enforced server-side at checkout when a code is applied.

Table-independence challenge (amendment 8): `billing_legal_policies` and `tax_policies` are kept separate because they have different owners (counsel vs accountant) and different content; `vies_validation_attempts` is a table rather than a JSON blob because the attempt log is legally material and must be append-only. No table here lacks a current authoritative behavior, except the two explicitly authored-only ones, which exist so the foreign keys and the coherent shape land in one pass rather than two.

---

## E. B2B pricing display options (deliverable 7)

The display convention fixes the Stripe Price `tax_behavior` per Price (amendment 7); the options can coexist across Prices.

| Option | tax_behavior | Display | Fit |
| --- | --- | --- | --- |
| **B2B net (recommended for launch)** | exclusive | "EUR X per month + VAT" / net price, VAT shown as a line | Business buyers expect net pricing and reclaim or reverse-charge VAT. Matches the B2B-first posture. |
| Consumer gross (later, B2C) | inclusive | "EUR X per month (VAT included)" | Consumer law and expectation. A separate Price with `tax_behavior=inclusive`. |
| Grandfathered | either, versioned | preserved | A separately versioned Price so a preserved price survives a convention change. |

`FOUNDER DECISION` (with accountant input): confirm B2B launches net/exclusive; confirm the consumer gross convention for the later B2C Price. Do not assume "EUR 3/mo" is net or gross; `pricing_plans.tax_behavior` + `marketing_display_minor` declare it explicitly. The entitlement package (`plus_v1`) is stable across all of these.

---

## F. Approvals still blocking each live launch (deliverables 10, 11)

The three activation groups. Approval for one never approves another (amendment 11).

**Technical test mode** (allowed now; the gate is closed for live): schema deployed; Stripe test configuration; Checkout tested; webhook idempotency tested; reconciliation tested; deposit-vs-subscription regression tests passed.

**Blocking B2B live** (all technical, plus):
- `tax_policy_approved` (management board) — a management-board-approved active tax posture (accountant/tax review recorded as evidence).
- `business_declaration_approved` (counsel) — the professional-use declaration wording.
- `terms_approved` (counsel) — B2B terms.
- `invoice_config_approved` (accountant) — invoice configuration.
- `pricing_display_approved` (founder + accountant) — the B2B display convention.
- `stripe_prod_verified` (founder) — production Stripe review, live keys, live webhook, live Prices.
- `refund_handling_tested` (eng) — subscription refund tested (no reverse_transfer).

**Blocking B2C live** (all of the above, plus):
- `consumer_classification_approved` (counsel) — the service-vs-digital-content classification (`billing_legal_policies`).
- `consumer_withdrawal_copy_approved` (counsel) — withdrawal information + immediate-performance wording.
- `withdrawal_function_operational` (eng) — the online withdrawal function tested end to end.
- `durable_confirmation_operational` (eng) — the durable confirmation flow tested.
- `proration_policy_approved` (accountant + counsel) — the proration and credit-note method.
- `consumer_refund_creditnote_tested` (eng) — the consumer refund and credit-note flow.
- `consumer_pricing_display_approved` (founder + accountant) — the consumer (gross) display.

---

## G. Accountant decision sheet (deliverable 8)

| # | Decision | Needed by |
| --- | --- | --- |
| 1 | The active tax-posture content and its formal approval by the management board (`tax_policies.management_board_approved`), with accountant/tax review recorded as evidence. Below-threshold does NOT settle obligations (amendment 2). | Before any live charge. |
| 2 | Estonian VAT-registration and OSS posture and the trigger to register. | Before B2B live. |
| 3 | The correct treatment per customer class while unregistered (no-VAT vs out-of-scope on documents; the document note). | Before B2B live. |
| 4 | Whether Stripe Tax rates are acceptable for OSS destinations, or an alternative rate source. | Before consumer live. |
| 5 | Invoice, credit-note, and OSS export format and the columns needed. | Before B2B live (invoice) / B2C live (credit-note). |
| 6 | The proration tax-adjustment method on a mid-period withdrawal (with counsel). | Before B2C live. |
| 7 | The billing and tax record retention period, reconciled with the account-deletion promise. | Before B2B live. |

## H. Counsel decision sheet (deliverable 9)

| # | Decision | Needed by |
| --- | --- | --- |
| 1 | The service-vs-digital-content classification and its versioned value (`billing_legal_policies`), on the conservative continuous-service assumption (amendment 1). | Before B2C live. |
| 2 | Customer Terms (B2B, then consumer) and the billing Privacy notice. | B2B terms before B2B live; consumer before B2C live. |
| 3 | The business-use declaration wording and that a separate unchecked control is the right mechanism (treated as evidence, amendment 4). | Before B2B live. |
| 4 | The consumer withdrawal and immediate-performance wording, that no blanket rights-waiver appears, and the model withdrawal information. | Before B2C live. |
| 5 | The pre-contract disclosure set and the obligation-to-pay pay-button wording. | Before B2B live. |
| 6 | VIES-downtime handling on a live sale (default block/manual-review; any provisional treatment becomes a policy rule, not code). | Before B2B live. |
| 7 | The VAT-registration and OSS legal obligation (co-owned with the accountant). | Before B2B live. |
| 8 | Data retention vs deletion reconciliation for tax records. | Before B2B live. |

---

## I. Test-mode checkout flow and the webhook/reconciliation plan (deliverables 5, 6)

**Checkout flow (test mode, B2B).** 1. Artist opens the web billing page. 2. Collection step writes `account_billing_profiles` (axis A from the declaration, evidence model) and a `billing_consent_records` row per control; a VAT number triggers a `vies_validation_attempts` write and resolves `vies_state`. 3. The tax-policy engine resolves the treatment and a `billing_quotes` row is written server-side. 4. The pre-payment summary renders from the quote; the pay button is unambiguous. 5. `assertLiveBillingAllowed('business')` is called; in test mode it returns without the ledger, so dogfooding works with the gate closed. 6. A Checkout Session (`mode: subscription`) is created from the quote's Price; the quote is marked consumed. 7. On completion the webhook writes `billing_subscriptions` + the tax snapshot + the durable confirmation.

**Webhook and reconciliation plan.** A new isolated `api/stripe/billing-webhook` handles `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`. Each is idempotent and converges to a target (write the resolved state from the event's current truth, never a delta), reusing the deposit webhook's dedup and conditional-update discipline but in a separate handler and namespace. The resolver writes `account_overrides.plan_tier` from the subscription status so `canAccess` never touches Stripe. A daily reconciler lists Stripe subscriptions, re-derives the internal mirror, and flags any customer with more than one active subscription as an incident (the duplicate-subscription guard). On `paid -> free` it calls `restoreGrandfatherPackage` when `policy_id` is set. **These modules are the next code slices; they are specified here and built with mocked Stripe unit tests, since live Stripe cannot be exercised from the build environment.**

---

## J. Confirmation (deliverable 12)

**No live subscription money is enabled.** This pass authored schema (not applied) and this pack. No production Stripe Price was created, no live subscription was charged, consumer checkout is not enabled, no draft legal language was published, tax collection was not activated, no VAT or OSS registration was performed, and no tax policy was applied. Live billing remains structurally impossible until the `billing_activation_approvals` groups are recorded.
