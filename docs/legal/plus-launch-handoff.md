# Plus launch: counsel and accountant handoff

**For:** Inklee's counsel and accountant. **From:** Inklee (engineering).
**Date:** 2026-07-31. **Replaces:** nothing (new document).

This document lists every remaining approval, confirmation, and review needed
from counsel and accountant before Plus can charge live money. Each item
references its source of truth and what the system does when the approval
lands. Items already approved are listed at the end so you know what is
settled.

---

## Status at a glance

| Gate group   | Score | Blocking items                                                  |
| ------------ | ----- | --------------------------------------------------------------- |
| Technical    | 4/4   | None                                                            |
| B2B          | 6/7   | `refund_handling_tested` (eng, not counsel/accountant)           |
| B2C          | 7/8   | `consumer_sales_launch_approved` (founder go-live key)          |
| Fee schedule | v1    | v2 activation gated on accountant sign-off (see F1 below)       |
| Standalone   | 0/2   | `consumer_sales_launch_approved` + `business_sales_launch_approved` (founder) |

**Counsel and accountant do not hold a blocking gate key.** Every counsel and
accountant approval is already recorded. What remains is:

1. **One-glance confirmation** of five follow-up texts (counsel, see C1).
2. **Fee schedule v2 sign-off** before activation (accountant, see F1).
3. **Fee refund policy v1 sign-off** before activation (accountant + counsel, see F2).
4. **Final Terms re-confirm** if the text changes for launch (counsel, see C2).

---

## Counsel items

### C1. Confirm five follow-up texts (E1-E5)

**Source:** `docs/legal/plus-launch-signoff-request.md`, section "Follow-up
texts E1-E5" (shipped 2026-07-25, commits `cd2296a`, `81c80a4`, `55ea3b0`).

Five customer-facing texts were drafted after the initial 2026-07-24 approval
and sent for one-glance confirmation:

| ID  | Text                                      | Where it appears                     |
| --- | ----------------------------------------- | ------------------------------------ |
| E1  | Withdrawal confirmation email             | Transactional email on withdrawal    |
| E2  | Purchase confirmation email               | Transactional email on subscription  |
| E3  | Cancellation confirmation email           | Transactional email on cancel        |
| E4  | Cancellation button (German BGB 312k)     | Account settings, always visible     |
| E5  | Withdrawal deadline display               | Confirmation email + account page    |

**Action needed:** One reply confirming all five, or edits. No code change is
needed for a confirmation; edits trigger the versioned workflow (see C2).

### C2. Final Terms version (if text changes)

**Source:** `apps/web/content/legal/terms.md` (current version `2026-07-24`).

The Terms source is integrity-locked: CI enforces that the live file is
byte-identical to its frozen snapshot, and checkout acceptance is bound to the
snapshot's SHA-256 hash. Any text edit (e.g., activating Plus language for
launch) requires:

1. Version bump in frontmatter.
2. New frozen snapshot in `apps/web/content/legal/_versions/`.
3. Re-approval of the `terms_approved` gate key (the gate auto-closes on hash
   mismatch).

**Action needed:** If the launch text differs from `2026-07-24`, counsel
re-confirms the new version. If unchanged, no action.

### C3. Dispute/chargeback handling (non-blocking)

Appointment-payment disputes are handled by `settlePaymentRequestDispute` in the
webhook (A4, 2026-07-31): allocation statuses flip to disputed/dispute_won/
dispute_lost, and the payment request transitions accordingly. Subscription
disputes are unhandled (no subscription-specific code path).

**Internal runbook (counsel C3 condition):** On any dispute notification, before
responding to Stripe: (1) check whether the customer exercised their withdrawal
right on the same subscription period — a chargeback plus a withdrawal is a
double refund; (2) check the refund ledger for the PI — partial refunds already
issued reduce the disputed amount; (3) for appointment-payment disputes, the
webhook has already transitioned the allocation and request statuses. Only
subscription disputes need manual status reconciliation until that code path is
built.

---

## Accountant items

### F1. Fee schedule v2 activation

**Source:** `packages/shared/src/fee-schedule.ts`.

| Lane                | v1 (live)          | v2 (approved, not active)         |
| ------------------- | ------------------ | --------------------------------- |
| Deposit (Free)      | 3%                 | 3%                                |
| Deposit (Plus)      | 3%                 | 0.5%                              |
| Appointment (Free)  | n/a (cannot transact) | n/a (cannot transact)          |
| Appointment (Plus)  | n/a (not built)    | 0.5%                              |
| Goods (Free)        | 0%                 | 5%                                |
| Goods (Plus)        | 0%                 | 1%                                |

v2 was founder-approved 2026-07-28 (`plus-product-spec.md`). Activation is a
one-line constant change (`ACTIVE_FEE_SCHEDULE_VERSION`). The version is stored
per transaction, so existing v1 transactions are unaffected.

**Action needed:** Accountant confirms the fee rates and their tax treatment
(are platform fees a service subject to reverse charge for B2B EU customers?
Are they part of the taxable base for B2C? What invoice line item description?).

### F2. Fee refund policy v1 activation

**Source:** `packages/shared/src/fee-refund-policy.ts`.

| Refund reason          | v0 (live)             | v1 (approved, not active)      |
| ---------------------- | --------------------- | ------------------------------ |
| Voluntary full         | Return full fee       | Return full fee                |
| Voluntary partial      | Return proportional   | Return proportional            |
| Artist cancellation    | **Return full fee**   | **Retain non-recoverable**     |
| Dispute/fraud          | Retain where permitted| Retain where permitted         |
| Inklee error           | Return full fee       | Return full fee                |

The delta: artist cancellation currently returns the full platform fee; v1
retains non-recoverable costs.

**Action needed:** Accountant confirms the refund fee treatment (credit note
format, revenue recognition impact of retained fees). Counsel confirms that
"retain non-recoverable" is defensible under the Terms and applicable consumer
law.

### F3. Below-VAT-line confirmation at go-live

**Source:** `docs/legal/accountant-decision-pack.md`, item A2.

Before flipping the launch switch, accountant confirms Inklee OU's revenue is
still below the Estonian 40,000 EUR VAT threshold and the 10,000 EUR
cross-border SME exemption threshold. This is a point-in-time check, not a
system change.

### F4. Registration trigger ownership

**Source:** `docs/legal/accountant-decision-pack.md`, item A2.

Who monitors the VAT threshold approach and triggers registration? Flagged in
the accountant pack as "the critical-path unlock." The system has an automatic
re-close mechanism: crossing the threshold re-closes `tax_policy_approved`,
which blocks new subscriptions until re-approved with the new posture.

### F5. Invoice/credit-note format

**Source:** `docs/legal/invoice-config-implementation-path.md`.

The invoice path is pre-approved (counsel + accountant, 2026-07-25 walkthrough).
While VAT-unregistered, Stripe-generated invoices are acceptable. Three optional
polish items (small-undertaking footer, seller identity block, `INK-` prefix)
need no further approval. Level 2 triggers automatically at VAT registration.

---

## Already approved (no action needed)

These are recorded for completeness. Do not re-review unless something changed.

| Item | Approved by | Date | Gate key |
| --- | --- | --- | --- |
| 4 customer-facing strings (A-D) | Counsel | 2026-07-24 | multiple |
| Refund method (proportionate proration) | Counsel | 2026-07-24 | `proration_policy_approved` |
| Immediate-start + withdrawal architecture | Counsel | 2026-07-24 | `consumer_withdrawal_copy_approved` |
| Consumer digital-service classification | Counsel | 2026-07-24 | `consumer_classification_approved` |
| Terms version `2026-07-24` | Counsel | 2026-07-24 | `terms_approved` |
| Tax posture (per-customer-class) | Accountant | 2026-07-25 | `tax_policy_approved` |
| Business declaration mechanism (C3) | Counsel | 2026-07-23 (confirmed; deferred out of v1 per D1, 2026-07-24) | `business_declaration_approved` (b2b, not recorded) |
| Invoice config path (Levels 1-3) | Both | 2026-07-25 | `invoice_config_approved` |
| Pricing display (price adjacent to button) | Both | 2026-07-25 | `pricing_display_approved` |
| Stripe production verification | Eng | 2026-07-25 | `stripe_prod_verified` |
| Record retention 7 years | Counsel | 2026-07-24 | n/a |
| Corrected Terms approach (non-VAT small business) | Counsel | 2026-07-24 | n/a |
| Fee schedule v2 rates | Founder | 2026-07-28 | n/a (activation gated) |

---

## Answers (counsel review, 2026-07-31)

### C1 — E1–E5: four confirmed, one edit, one recorded risk

**E1 (withdrawal acknowledgement email): CONFIRMED.** The effective date is
stated, the Art. 14(3) proportionate-charge restatement appears exactly and only
in the immediate-start case, and the durable-medium acknowledgement is present.
The earlier conditions on string C are satisfied.

**E2 (purchase confirmation email): EDIT REQUIRED before recording.** The
immediate-start consent restatement is correct and discharges the Art. 14(4)(a)
enforceability condition. However, Article 8(7) CRD requires the durable-medium
confirmation to include the **full Article 6(1) information set** unless already
provided on a durable medium. E2 as drafted carries only the consent restatement
and a settings pointer. Required: the email must **carry or attach** the accepted
Terms version, the withdrawal instructions / model withdrawal information, and
the price and renewal terms (an attached PDF or included text satisfies this; a
link to a mutable web page does not). If the `billing_contract_confirmations`
flow already appends these to the same email, E2 is confirmed as the cover text —
verify and record which it is.

**E3 (cancellation confirmation email): CONFIRMED.** Receipt date and time plus
the effective end date is exactly what § 312k(3) BGB requires.

**E4 (cancellation button): wording CONFIRMED; placement stands as a recorded
risk.** The two-step flow and copy are acceptable, and an "equally unambiguous
formulation" is the correct approach for an English-only build. The behind-login
placement deviates from German case law reading § 312k's "directly and easily
accessible" as reachable **without** login (a customer who has lost credentials
must still be able to cancel). Accepted for launch as a recorded founder decision
given low initial German exposure, on two conditions: (1) a **pre-login
cancellation route** (public page → emailed magic link → confirm) goes on the
fast-follow list; (2) the placement is revisited before any German-locale build
or Germany-targeted marketing. This note must not quietly become permanent.

**E5 (withdrawal deadline display): CONFIRMED.** A concrete date computed from
the same subscription start the refund logic enforces is the right construction.

**Pre-recording verification:** the 2026-07-25 note deferred condition 3 (total
price and key terms directly above the pay button) until pricing-display
approval, which landed the same day. **Verify the wiring shipped** before
recording `consumer_withdrawal_copy_approved` — the approval postdates the note
that promised the wiring.

### C2 — Confirmed as designed

The hash-bound auto-close makes this self-enforcing. No action unless the launch
text differs from version `2026-07-24`.

### C3 — Non-blocking agreed, with a runbook note

Acceptable at launch volume. One caveat: a chargeback on a subscription whose
customer also holds a live withdrawal right can produce a double refund if
handled manually without checking state. Add a one-paragraph internal runbook —
"on dispute: check withdrawal/refund state before responding" — before first
live charge. Not a gate.

### F1 — Fee schedule v2: the embedded legal question, answered

On "are platform fees a service subject to reverse charge for B2B EU
customers": **while Inklee is VAT-unregistered (decision D2), no reverse-charge
assertion may appear on fee invoices either** — fee lines carry the same
non-registered small-undertaking wording as subscription invoices. The question
becomes live only at VAT registration (the F4 trigger), at which point platform
fees to EU business artists become reverse-charged supplies.

**Condition on v2 activation (counsel):** v2 introduces a 5% goods fee for Free
users where the current rate is 0%. Introducing a fee for existing users is a
unilateral change requiring (1) Terms coverage of the fee and the change
mechanism, and (2) reasonable advance notice to affected users, before
`ACTIVE_FEE_SCHEDULE_VERSION` flips. It also re-opens the still-unclosed
payment-flow §10 fee-disclosure items — close them together.

### F2 — Fee refund policy v1: "retain non-recoverable" APPROVED, on three conditions

The retention applies to the **artist's** platform-fee refund on artist
cancellation. Artists transact with Inklee in a trade capacity, so the consumer
unfair-terms regime is not the binding constraint; Estonian Law of Obligations
general fairness and the Terms are. Defensible provided:

1. **Terms first.** The artist Terms disclose the retained-cost rule before v1
   activates; the edit re-rolls the Terms hash and re-closes `terms_approved`
   (C2 path), with reasonable advance notice to existing subscribers. Activation
   before Terms coverage would be unenforceable against existing artists.
2. **Cost, not margin.** "Non-recoverable" means the actual third-party cost
   (Stripe's unreturned processing fee), calculated auditably per transaction.
   Anything above cost drifts toward an unenforceable penalty.
3. **Client unaffected.** On artist cancellation the client's deposit refund
   stays whole; the retention operates strictly in the Inklee↔artist relation.
   State this expressly in the policy text.

Accountant items in F2 (credit-note format, revenue recognition of retained
fees) remain the accountant's to confirm.

### F3–F5 — Accountant determinations, no counsel addition

F4 noted as correctly designed: the threshold-crossing auto-re-close of
`tax_policy_approved` is the right mechanism; the open item is only **who**
monitors, which is an ownership decision, not a legal one.

### Ledger flag — "Business declaration, approved by Accountant"

The Already-approved table records the business declaration as approved by the
**accountant** on 2026-07-25. Two inconsistencies: (1) decision D1
(`plus-launch-strategy-decisions.md`) deferred the declaration out of v1
entirely; (2) if it returned for the business lane, the declaration mechanism
was a **counsel** item (counsel-decision-pack C3), not an accountant one.
Correct the ledger row — either re-attribute to the recorded counsel approval of
C3, or mark the key as deferred per D1. A misattributed approval in the ledger
defeats the purpose of the version-bound design.

**Resolved 2026-07-31.** The row is corrected to attribute C3 to counsel
(confirmed 2026-07-23, version `c3-business-declaration-2026-07-23`) and marked
deferred out of v1 per D1 (2026-07-24), with the b2b key not recorded. Both
edits were applied together because neither attribution alone is right: "counsel,
no date" implies an approved v1 item, and "deferred only" drops the real counsel
confirmation. This flag is kept verbatim as the record of why. (The accountant
never owned the declaration: the accountant pack is A1-A6 and contains no
declaration item.)

### Summary

| Item | Outcome |
|---|---|
| E1, E3, E5 | Confirmed |
| E2 | Edit: carry/attach the Art. 8(7) information set, then confirmed |
| E4 | Wording confirmed; placement = recorded risk + pre-login fast-follow |
| C2 | Confirmed, self-enforcing |
| C3 | Non-blocking; add dispute runbook paragraph |
| F1 | No reverse charge while unregistered; v2 activation conditioned on Terms + notice for the new Free goods fee |
| F2 | Approved on three conditions (Terms first, cost-only, client unaffected) |
| Ledger | Correct the business-declaration attribution |

Recording `consumer_withdrawal_copy_approved` is appropriate once the E2 edit
and the price-adjacent-to-button verification are done; nothing else in this
review blocks the launch sequence.

---

## Version-bound gate behaviour

Keys marked "version-bound" (`terms_approved`, `tax_policy_approved`,
`consumer_classification_approved`, `consumer_withdrawal_copy_approved`) store
a SHA-256 hash of the approved artifact. If the artifact changes (e.g., a Terms
edit), the key auto-closes and blocks new subscriptions until re-approved
against the new hash. This is by design: it means counsel/accountant can never
be surprised by a silent edit.

---

## Sequence to launch

1. Counsel confirms E1-E5 texts (or sends edits).
2. Accountant confirms fee schedule v2 tax treatment.
3. Accountant + counsel confirm fee refund policy v1.
4. Accountant confirms below-threshold at go-live + threshold monitor ownership.
5. If Terms text changed: counsel re-confirms new version.
6. Eng activates fee schedule v2 + refund policy v1.
7. Eng runs `refund_handling_tested` (last eng gate).
8. Founder records `consumer_sales_launch_approved` and/or
   `business_sales_launch_approved`.
9. Live.
