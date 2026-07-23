# Counsel decision pack (Inklee Plus billing)

**For:** Inklee OU's legal counsel. **From:** Inklee (engineering). **Date:** 2026-07-23.
**Status:** Open legal decisions required before Inklee can charge subscription
money (business first; consumer strictly gated on your review).

This is not legal advice and every consumer-facing string it references is a
**DRAFT** requiring your approval. It lists the legal decisions and wording
Inklee needs from you, the draft or assumption our system currently encodes, and
how your answer is recorded. Its accounting companion is
[accountant-decision-pack.md](./accountant-decision-pack.md); items marked
**CO-OWNED** must be agreed between you and the accountant.

## Context you need

- **Seller:** Inklee OU, Estonia (registry code 17497625).
- **Product:** "Inklee Plus", a continuously supplied monthly subscription to
  professional booking-software features.
- **Posture:** **business-first**. The consumer purchase path is fully built but
  cannot charge live money until you clear the items below; the software enforces
  this with an approval gate (nothing consumer-facing charges until your sign-off
  is recorded).
- **Assumptions we have deliberately NOT made for you:**
  - We treat Inklee Plus as a **continuously supplied digital service** where
    starting access immediately does **not** automatically extinguish the 14-day
    withdrawal right, and we do **not** rely on any complete waiver of that
    right. You decide the correct classification (C1).
  - **14-day withdrawal is law**; we build the machinery but never assume it away.

## How your answers are recorded

Each decision maps to a named approval the software checks before any live
charge. Terms and the business-use declaration open the **business** gate;
the classification and withdrawal wording open the **consumer** gate. Approvals
are version-bound to the exact artifact you approve (for example the Terms
version hash), so amending an approved document automatically re-closes the gate
until you re-approve.

---

## Decisions

### C1. Service vs digital content classification (the pivotal question)
**Unblocks:** `consumer_classification_approved` (required for consumer go-live).

Is Inklee Plus a "service" or "digital content" under the Consumer Rights
Directive as implemented in Estonia? This determines whether, and how, the 14-day
withdrawal right can be lost after performance begins. Our machinery is built for
a service-with-immediate-performance reading and defaults "withdrawal lost" to
**never reached** until you define it. We record your decision as a versioned
legal-policy value.

### C2. Customer Terms and the billing Privacy notice
**Unblocks:** `terms_approved` (business go-live), and the consumer variant later.

- The **Customer Terms** for the B2B subscription (and later the consumer
  variant).
- The **billing Privacy** notice covering the payment/subscription data flow
  (Stripe as processor, VAT-ID and billing-address collection).

### C3. Business-use declaration wording and mechanism
**Unblocks:** `business_declaration_approved` (business go-live).

At B2B checkout we ask the buyer to declare they are purchasing as a business,
via a **separate, unchecked control** (not preselected, not bundled with Terms
acceptance). Confirm:
- The declaration **wording**.
- That a separate unchecked control is the correct mechanism.
- That we may treat the declaration as **evidence** (recorded with confidence and
  a review state), not absolute truth, and route conflicting evidence to manual
  review rather than auto-denying consumer protections.

### C4. Consumer withdrawal and immediate-performance wording
**Unblocks:** `consumer_withdrawal_copy_approved` (consumer go-live).

DRAFT strings live in `docs/legal/eu-consumer-withdrawal-flow.md` (do not ship as
is). Confirm:
- The **immediate-performance request** wording (a separate, unchecked control)
  and that no blanket rights-waiver appears anywhere.
- The **model withdrawal information** and the online **withdrawal function**
  wording (distinct from cancellation, no dark patterns, no forced support
  contact).
- The default **proration** method on a mid-period withdrawal (time-based,
  preserving the original tax). This pairs with the accountant's tax-adjustment
  method (accountant pack A4). **CO-OWNED.**
- Whether "withdrawal lost where legally valid" is ever reachable, and under what
  conditions.

### C5. Pre-contract disclosure and the pay-button wording
**Unblocks:** part of `terms_approved` / business checkout.

- The **pre-contract disclosure set** shown before payment (price, what is
  billed, renewal, cancellation, withdrawal).
- The **obligation-to-pay** pay-button wording (an unambiguous "order with
  obligation to pay"-style label).

### C6. VIES downtime handling on a live sale
**Unblocks:** business go-live operating rule.

For a B2B sale where the EU VAT-ID verification service (VIES) is down, our
default is to **block or route to manual review** rather than provisionally
treat the buyer as a verified business. Confirm this default, or define an
approved provisional treatment (which becomes a policy rule, never ad-hoc code).

### C7. VAT-registration legal obligation (**CO-OWNED with accountant**)
**Unblocks:** business go-live readiness.

The legal obligation (as distinct from the tax mechanics) to register for VAT/OSS
and its trigger. Pairs with the accountant's registration posture (accountant
pack A2).

### C8. Data retention vs deletion for tax records (**CO-OWNED with accountant**)
**Unblocks:** business go-live readiness.

How Inklee reconciles the statutory retention of billing/tax records with its
account-deletion promise (which records survive a deletion request, and the
lawful basis). Pairs with the accountant's retention period (accountant pack A5).

---

## Priority

For the **business (B2B) launch**, we need **C2, C3, C5, C6, C7** (plus the
accountant items). The **consumer** launch additionally needs **C1, C4, C8** and
the built withdrawal/proration flow, and stays switched off until they land.

Cross-reference: [accountant-decision-pack.md](./accountant-decision-pack.md) ·
[billing-decision-pack.md](./billing-decision-pack.md) (the engineering return) ·
`docs/legal/eu-consumer-withdrawal-flow.md` (the draft withdrawal wording) ·
`docs/legal/eu-billing-posture.md` · `docs/product/billing-customer-classification.md`.
