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

### C3. Dispute/chargeback handling (non-blocking, future)

No `charge.dispute.*` webhook handling exists. Disputes reach no Inklee code
path today. When dispute volume warrants it, the policy and code path need
counsel input. Not blocking launch.

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
| Business declaration | Accountant | 2026-07-25 | `business_declaration_approved` |
| Invoice config path (Levels 1-3) | Both | 2026-07-25 | `invoice_config_approved` |
| Pricing display (price adjacent to button) | Both | 2026-07-25 | `pricing_display_approved` |
| Stripe production verification | Eng | 2026-07-25 | `stripe_prod_verified` |
| Record retention 7 years | Counsel | 2026-07-24 | n/a |
| Corrected Terms approach (non-VAT small business) | Counsel | 2026-07-24 | n/a |
| Fee schedule v2 rates | Founder | 2026-07-28 | n/a (activation gated) |

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
