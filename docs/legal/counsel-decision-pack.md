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

## Answers (counsel review, 2026-07-23)

> **STRATEGY UPDATE — 2026-07-24 (see `plus-launch-strategy-decisions.md`).**
> Launch posture is now **consumer-first** (D1) and Inklee stays
> **VAT-unregistered with no reverse-charge** (D2). This promotes C1 and C4 to
> launch-critical, **defers C3 out of v1**, and revises C7 and C8. Section notes
> below; concrete steps in `plus-launch-followup.md`.

### C1 — Classification: Inklee Plus is a digital service

> **UPDATE 2026-07-24 (D1): now LAUNCH-CRITICAL.** Record
> `consumer_classification_approved` = digital service before the first live
> charge; it is a launch prerequisite, not a B2C-later item.
Inklee Plus is a **digital service** under the Consumer Rights Directive as
implemented in Estonia, not digital content. The CJEU confirmed in *Sky
Österreich Fernsehen* (C-234/25, judgment of 9 July 2026) that a dynamic
subscription offering going beyond the stable provision of specific content is a
digital service; a continuously supplied, evolving software subscription falls
squarely within that reading, and Recital 30 of Directive (EU) 2019/2161
resolves any residual doubt toward the service rules. Consequences, which the
built machinery already reflects:

- The digital-content exception (withdrawal extinguished at first performance,
  Art. 16(m) CRD) is **not available**. No reliance is placed on it.
- The withdrawal right lapses only on **full performance** with prior express
  consent and acknowledgment (Art. 16(a)); within a monthly subscription period
  this is not reached during the 14-day window, so `withdrawal_lost` remains
  **never reached** as encoded.
- A consumer who requests immediate performance and later withdraws owes a
  **proportionate amount** for the service supplied (Art. 14(3)), satisfied by
  the time-based proration in C4.

`consumer_classification_approved`: record as **digital service / immediate
performance with surviving withdrawal right**, versioned against this section.

### C2 — Terms and billing privacy notice
The B2B Customer Terms and the billing privacy notice proceed as scoped. The
billing privacy notice discloses: Stripe as processor for payment data (with the
SCC/Data Privacy Framework transfer basis, consistent with
`docs/account-deletion-handoff.md` §7); collection of VAT-ID and billing address
on the basis of Article 6(1)(c) GDPR (VAT and accounting obligations); and the
retention rule in C8.

### C3 — Business-use declaration: confirmed as built

> **UPDATE 2026-07-24 (D1): DEFERRED for v1.** No business-use declaration ships
> at launch; all buyers take the consumer path. The mechanism below is correct and
> retained for a future explicit B2B/studio tier, but is not part of the v1 gate.
The separate, unchecked, non-bundled control is the correct mechanism. The
declaration is treated as **evidence, not absolute truth**: under the CRD's
predominant-purpose approach to dual-purpose contracts, a trader may not rely on
a declaration it has reason to disbelieve, so conflicting evidence routes to
**manual review** rather than automatic denial of consumer protections. Wording
for the control:

> "I confirm that I am purchasing Inklee Plus for my trade, business, craft or
> profession, and not as a consumer."

### C4 — Withdrawal flow: statutory withdrawal function now applies

> **UPDATE 2026-07-24 (D1): now LAUNCH-CRITICAL.** Because v1 sells to consumers,
> the Article 11a withdrawal function, durable confirmation, and proration are
> launch prerequisites, not later work.
Since **19 June 2026**, Directive (EU) 2023/2673 (new Article 11a CRD) makes an
online **withdrawal function** mandatory for distance contracts concluded
through an online interface. This is no longer a wording-approval matter; the
consumer flow must conform to the statutory specification before go-live:

- A withdrawal function that is **continuously available, prominently
  displayed**, and labelled **"withdraw from contract here"** (or equivalent
  unambiguous wording), leading to a confirmation step and followed by an
  acknowledgment of receipt on a **durable medium**.
- The function must be as easy to use as the sign-up path; no dark patterns and
  no forced support contact (the existing draft's constraints are confirmed and
  are now statutory).
- The **immediate-performance request** remains a separate, unchecked control;
  no blanket rights-waiver appears anywhere (confirmed).
- **Proration** on mid-period withdrawal is **time-based, preserving the
  original tax treatment**, paired with accountant pack A4 (CO-OWNED,
  confirmed).
- "Withdrawal lost where legally valid" is **not reachable** for the monthly
  subscription (see C1) and stays unimplemented.

`consumer_withdrawal_copy_approved` opens only once the withdrawal function
conforms to Article 11a and the strings in
`docs/legal/eu-consumer-withdrawal-flow.md` are aligned to it.

### C5 — Pre-contract disclosure and pay button
The pay button carries an unambiguous **"Order with obligation to pay"**-style
label (Art. 8(2) CRD). The pre-contract disclosure set shown before payment
includes: the **VAT-inclusive** price for consumers; what is billed and the
billing period; **automatic renewal** and how to cancel; and the withdrawal
right including the Article 11a function. These are conditions of
`terms_approved` for the respective gate.

### C6 — VIES downtime: block/manual-review confirmed
The default — **block or route to manual review**, never provisionally treat the
buyer as a verified business — is confirmed. A provisional treatment is legally
available (Implementing Regulation (EU) 282/2011, Art. 18: other evidence of
taxable status plus reasonable verification) and may be adopted later as an
approved policy rule; until then the conservative default stands. Retry VIES
before blocking.

### C7 — VAT/OSS registration (CO-OWNED)

> **UPDATE 2026-07-24 (D2): decision made — stay unregistered.** Inklee remains
> **not VAT-registered** at launch; supplies are issued as a non-registered
> small-undertaking supply with **no reverse-charge assertion**. Define a future
> registration trigger (revenue/volume) with the accountant. The **management
> board** approves the tax posture; accountant review is evidence. OSS applies only
> if/when consumer cross-border sales are later brought into scope. The paragraph
> below is superseded to the extent it asserts reverse-charge treatment.

For the B2B launch, cross-border EU supplies are **reverse-charge** (customer
accounts for VAT; invoice must state this), gated on VIES verification per C6;
domestic Estonian supplies follow Estonian registration status. The **€10,000
EU-wide threshold and OSS registration** become relevant only at consumer
cross-border go-live and must be resolved with the accountant (pack A2) before
the consumer gate opens.

### C8 — Retention vs deletion for billing records (CO-OWNED)

> **UPDATE 2026-07-24 (D2):** invoices are non-VAT-registered supplies, so the
> mandatory VAT-invoice identity fields no longer apply *as a VAT requirement*.
> Retain invoice/accounting records for 7 years per § 12 (unchanged); the
> counterparty-identity note follows the accountant's confirmed document format for
> a non-registered supply rather than the VAT-invoice mandate described below.

Billing and tax records survive an account-deletion request on the basis of
Article 6(1)(c) / Article 17(3)(b) GDPR and § 12 of the Estonian Accounting Act:
**seven years from the end of the financial year** in which the transaction was
recorded, consistent with `docs/account-deletion-handoff.md` §4. One deliberate
divergence from the deposit-record position: **invoices retain counterparty
identity** (buyer name, address, VAT-ID) because Estonian VAT invoice
requirements mandate it — invoice data is not PII-stripped. The account-deletion
promise and privacy notice state this carve-out expressly.

### C9 (added) — Auto-renewal reminders and the Digital Fairness Act
Member-state auto-renewal reminder obligations are to be confirmed for each
consumer market before consumer go-live. The **Digital Fairness Act** (proposal
expected Q4 2026) is expected to tighten subscription renewal, cancellation, and
choice-architecture rules; monitor and revisit C4/C5 wording when the proposal
is published. Not a launch blocker.

### C10 (added) — Cancellation flow parity
The Article 11a "as easy as buying" standard is applied to the ordinary
**cancellation** flow as well as withdrawal: cancellation is available in-app,
without forced support contact, with parity to the sign-up path.

**Gate summary:** C2, C3, C5, C6, C7 open the **business** gate as answered
above. The **consumer** gate additionally requires the Article 11a-conformant
withdrawal function (C4), the C1 classification recording, and C8's disclosed
carve-out.

### References
CJEU C-234/25 *Sky Österreich Fernsehen*, 9 July 2026
(<https://www.insideprivacy.com/consumer-protection/cjeu-decides-when-streaming-subscriptions-are-subject-to-the-right-of-withdrawal/>);
Directive (EU) 2023/2673 / Art. 11a CRD withdrawal function, applicable 19 June 2026
(<https://www.scrive.com/resources/knowledge-hub/news/new-eu-withdrawal-function-rules-are-coming-in-june-2026>);
Digital Fairness Act legislative status
(<https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act>);
Implementing Regulation (EU) 282/2011 Art. 18; Estonian Accounting Act § 12
(<https://www.riigiteataja.ee/en/eli/530102013006/consolide>).

---

## Priority

For the **business (B2B) launch**, we need **C2, C3, C5, C6, C7** (plus the
accountant items). The **consumer** launch additionally needs **C1, C4, C8** and
the built withdrawal/proration flow, and stays switched off until they land.

Cross-reference: [accountant-decision-pack.md](./accountant-decision-pack.md) ·
[billing-decision-pack.md](./billing-decision-pack.md) (the engineering return) ·
`docs/legal/eu-consumer-withdrawal-flow.md` (the draft withdrawal wording) ·
`docs/legal/eu-billing-posture.md` · `docs/product/billing-customer-classification.md`.
