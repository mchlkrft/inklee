# Accountant decision pack (Inklee Plus billing)

**For:** Inklee OU's accountant. **From:** Inklee (engineering). **Date:** 2026-07-23.
**Status:** Open decisions required before Inklee can charge subscription money.

This is not tax advice and does not assume answers. It lists the tax and
accounting decisions Inklee needs you to make (or confirm) before turning on paid
subscriptions, the assumption our system currently encodes for each, and how your
answer is recorded. Its legal companion is
[counsel-decision-pack.md](./counsel-decision-pack.md); items marked
**CO-OWNED** must be agreed between you and counsel.

## Context you need

- **Seller:** Inklee OU, Estonia (registry code 17497625).
- **Product:** "Inklee Plus", a low-price monthly subscription to professional
  booking-software features. Sold **business-first** (tattoo artists as
  businesses); a consumer path exists but stays switched off until counsel
  clears it (see the counsel pack).
- **Current documented posture:** below the Estonian VAT-registration threshold
  and **not VAT-registered**. We need you to confirm this still holds at go-live
  and to own the trigger for when it stops holding.
- **Hard rule the system enforces:** being below the domestic threshold does
  **not** by itself settle cross-border, place-of-supply, reverse-charge, or OSS
  obligations, so the treatment must be a deliberate decision **per customer
  class**, never a blanket "out of scope". Nothing charges live money until the
  posture is approved and recorded.
- **Who approves:** legal responsibility for the posture sits with Inklee's
  **management board**, which is the approving authority. A founder, developer,
  or single employee cannot substitute. **Your professional review is strongly
  recommended and is recorded as evidence, but the system does not treat it as
  legally mandatory** (we have not identified a statutory provision requiring
  it; if you identify one, tell us and we will reflect it).

## How the posture is recorded

The posture is written as a versioned `tax_policies` record plus a
`tax_policy_approved` approval, created from a **management-board approval** with
your review recorded as evidence, via a controlled script
(`scripts/billing/record-tax-approval.cjs`). If the posture later changes, the
approval is version-bound and automatically re-closes until re-approved. Each
customer class carries a **distinct treatment**, and the invoice wording is
generated from that treatment (a reverse-charge sale shows reverse-charge
wording; an exempt sale shows the exemption note; there is no single note for
all classes).

---

## Decisions

### A1. The tax posture and per-customer-class treatment
**Unblocks:** `tax_policy_approved` (required for business go-live).

We need the treatment for **each customer class below**, each a specific legal
basis (never a generic "out of scope"). Our starting point for an unregistered
Estonian small business is shown; please confirm or correct each line:

| Customer class | Starting treatment | Your view |
| --- | --- | --- |
| Estonian customer | Small-business exemption (no VAT while unregistered) | |
| EU business, valid VAT number | Reverse charge (recipient accounts for VAT) | |
| EU business, no VAT number | Manual review (ambiguous; your call) | |
| EU private consumer | Cross-border SME exemption under the 10,000 EUR threshold; customer-country VAT (OSS) above it | |
| Non-EU business | Place of supply outside Estonia | |
| Non-EU private consumer | Place of supply outside Estonia | |

Treatments the system supports: domestic standard, small-business exemption,
reverse charge, place of supply outside Estonia, customer-country VAT (OSS),
cross-border SME exemption, manual review.

Also confirm:
- Whether tax should be **computed by Stripe Tax** or not (starting point: not,
  since nothing is charged today; `calc_provider = none`).
- The **invoice note per treatment**. The system generates the note from the
  resolved treatment (so a reverse-charge sale shows a reverse-charge note and an
  exempt sale shows the exemption note, never one note for all); confirm the
  exact wording for each.

### A2. VAT / OSS registration posture and the trigger (**CO-OWNED with counsel**)
**Unblocks:** part of business go-live readiness (feeds A1).

- Confirm Inklee OU remains below the threshold and unregistered at go-live.
- Define the **trigger** that requires registration (turnover level, first
  taxable cross-border supply, or a date), and who monitors it.
- Whether any limited or OSS registration is needed for cross-border EU B2C
  before the consumer path opens.
- We track these thresholds in the system (`tax_thresholds`); please confirm the
  limits and who monitors each:
  - Estonian taxable turnover vs the **40,000 EUR** registration threshold.
  - Cross-border EU B2C electronically supplied services vs the **10,000 EUR**
    threshold.
  - Total Union turnover vs the cross-border **SME scheme** threshold.
  - Any **country-specific** SME threshold you rely on.

This intersects the legal obligation to register, which counsel co-owns
(see counsel pack C7).

### A3. Invoice, credit-note, and OSS export format
**Unblocks:** `invoice_config_approved` (required for business go-live).

- The **invoice** fields/format Inklee must issue for a B2B subscription
  (Stripe generates the invoice; we configure it).
- The **credit-note** format for a refund.
- If/when registered: the **OSS export** columns you need for filing.

### A4. Proration tax-adjustment on a mid-period withdrawal (**CO-OWNED with counsel**)
**Unblocks:** `proration_policy_approved` (consumer path only, later).

When a consumer withdraws mid-period, the law may allow a proportionate charge
for the service already supplied. Define the **tax-adjustment method** on that
partial refund/credit note (preserve the original rate and jurisdiction). This
pairs with counsel's proration and withdrawal decisions (counsel pack C4).

### A5. Billing and tax record retention (**CO-OWNED with counsel**)
**Unblocks:** business go-live readiness.

The retention period for billing and tax records, reconciled against Inklee's
account-deletion promise (some records must be kept for tax law even after a user
asks to be deleted). Counsel co-owns the deletion side (counsel pack C8).

### A6. Stripe Tax rates for OSS destinations (later)
**Unblocks:** consumer path only, later.

If the consumer path ever charges VAT across EU destinations, confirm whether
Stripe Tax's rates are acceptable for your filings, or name an alternative rate
source.

---

## Priority

For the **business (B2B) launch**, we need **A1, A2, A3, A5**. A4 and A6 are only
needed for the later consumer launch. Recording A1 (your signed tax posture) is
the single item that opens the tax gate; the rest are recorded as their own
named approvals as they land.

Cross-reference: [counsel-decision-pack.md](./counsel-decision-pack.md) ·
[billing-decision-pack.md](./billing-decision-pack.md) (the full engineering
return) · `docs/legal/vat-and-oss-architecture.md` (the tax architecture).
