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
  obligations. So the tax treatment must be your explicit decision, not our
  assumption. Nothing charges live money until your sign-off is recorded; a
  founder or developer approval can never substitute for yours (this is enforced
  in code: only an accountant-signed field opens the tax gate).

## How your answers are recorded

Each decision below maps to a named approval that the software checks before any
live charge. Your tax posture is written as a versioned `tax_policies` record
plus a `tax_policy_approved` approval, both created only from your written
sign-off, via a controlled script (`scripts/billing/record-tax-approval.cjs`).
If the posture later changes, the approval is version-bound and automatically
re-closes until you re-approve.

---

## Decisions

### A1. The tax posture and per-customer-class treatment
**Unblocks:** `tax_policy_approved` (required for business go-live).

We need the tax treatment for **each class of customer**. Our current assumption
for an unregistered Estonian seller is "no VAT charged to anyone" (each class
treated as out of scope). Please confirm or correct each line:

| Customer class | Our assumption | Your decision |
| --- | --- | --- |
| EU VAT-registered business (different member state) | No VAT (out of scope); no reverse-charge issued while unregistered | |
| EU business without a VAT number | No VAT (out of scope) | |
| EU private consumer | No VAT (out of scope) | |
| Non-EU business | No VAT (out of scope) | |

Also confirm:
- The **document note** to display on the receipt/invoice (for example "VAT not
  applicable, small business, Estonia").
- Whether tax should be **computed by Stripe Tax** or not (our assumption: not,
  since nothing is charged; `calc_provider = none`).

### A2. VAT / OSS registration posture and the trigger (**CO-OWNED with counsel**)
**Unblocks:** part of business go-live readiness (feeds A1).

- Confirm Inklee OU remains below the threshold and unregistered at go-live.
- Define the **trigger** that requires registration (turnover level, first
  taxable cross-border supply, or a date), and who monitors it.
- Whether any limited or OSS registration is needed for cross-border EU B2C
  before the consumer path opens.

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
