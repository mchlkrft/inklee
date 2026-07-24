# Consumer (B2C) launch counsel sign-off package (Inklee Plus)

**For:** Inklee OU's legal counsel (co-owned items are shared with the accountant).
**From:** engineering. **Date:** 2026-07-24.
**Purpose:** everything counsel needs to sign off the CONSUMER launch of Inklee
Plus, and exactly how each sign-off is recorded. This is the D1 consumer-first
launch path (see `plus-launch-strategy-decisions.md`); the whole consumer flow is
BUILT but stays dark behind the b2c activation gate and a launch flag until these
items are cleared.

Companion to `b2b-signoff-package.md` (the earlier business path) and
`counsel-decision-pack.md` (C1-C10, already answered). Nothing here is legal
advice; every consumer-facing string below is a DRAFT requiring your approval.

## Status

- Live billing is **OFF**. A consumer charge needs the full b2c key set + a live
  Stripe Price + live mode, and the consumer UI is additionally gated by
  `PLUS_CONSUMER_LAUNCH_ENABLED` (currently false) so this DRAFT copy is not shown
  to real users until you clear it.
- Gate state (`node scripts/billing/gate-status.cjs`): technical 4/4, b2b 4/7,
  **b2c 1/7** (`consumer_classification_approved` recorded).

## Pricing overview

| Plan | Price (final; no VAT added) | Billing period | Renewal | Consumer withdrawal |
|---|---|---|---|---|
| Free | 0 EUR | n/a | n/a | n/a |
| Inklee Plus, monthly | 3.00 EUR per month | Monthly | Automatic until cancelled | 14-day right |
| Inklee Plus, yearly (planned) | 24 EUR first year, then 30 EUR per year | Yearly | Automatic until cancelled | 14-day right |

Notes for your review:
- Inklee is **not registered for VAT** in Estonia (small-undertaking posture,
  `tax_policies` version `ee-unregistered-v2`), so **no VAT is added**: the price
  shown to a consumer is the final price. This is what the consumer VAT-inclusive
  display resolves to today (nothing to add).
- Monthly is wired for launch (lookup key `inklee_plus_monthly_eur_test`, to be
  replaced by a live Price). Yearly is a planned option, not yet built.
- The exact live price + its display are pending `consumer_pricing_display_approved`
  (founder + accountant), separate from your sign-off.

## The consumer flow being signed off

Checkout: the buyer sees the pre-contract disclosure, an optional immediate-
performance request, and an "Order with obligation to pay" button, then Stripe
Checkout (which shows the price before payment). Withdrawal: a self-serve
"Withdraw from contract here" function on the plan page, separate from
cancellation, that ends the subscription, refunds per a time-based proration, and
sends a durable acknowledgement. All strings below are the exact shipped DRAFTs.

---

## A. `consumer_classification_approved` (C1): RECORDED, for information

You confirmed Inklee Plus is a **digital service** with a surviving 14-day
withdrawal right (CJEU C-234/25); this is recorded in `billing_legal_policies`
(`service-classification-2026-07-23`) and the gate key is set. No further action,
unless the pricing or product changes the analysis.

---

## B. `consumer_withdrawal_copy_approved` (C4): the DRAFT strings to approve

This is the main consumer sign-off. Please confirm each string, or return edits.
Only the immediate-performance string (B1) carries a version constant
(`apps/web/src/lib/billing-consent-copy.ts`); the withdrawal-UI strings (B2) live
in `withdraw-button.tsx`, the emails (B3) in `withdrawal.ts`, and the checkout
disclosure (B4) in `upgrade-button.tsx`, hardcoded inline and not yet
version-bound (an edit changes them directly).

### B1. Immediate-performance request (P3) — a separate, unchecked, optional control

> "I request that Inklee start my subscription immediately, before the 14-day
> withdrawal period ends. I understand that if I withdraw during this period, I
> pay a proportionate amount for the service already provided. I keep my right to
> withdraw."

Mechanism: a separate, unchecked, optional checkbox on the consumer checkout, not
pre-selected and not bundled with Terms acceptance, carrying **no** blanket
rights-waiver. **Founder decision F4(b) for your confirmation:** if the box is
left unticked, the subscription still starts immediately and a mid-period
withdrawal is a **full refund** (no proportionate deduction is taken without the
express request). Please confirm F4(b) is acceptable.

### B2. Withdrawal function (Art. 11a) copy

Prominent control label:
> "Withdraw from contract here"

Panel heading (once opened):
> "Withdraw from your contract"

Explanation shown on the function (distinct from cancellation, no reason asked, no
forced support):
> "This is your 14-day right of withdrawal, which is different from cancelling.
> Withdrawing ends your Inklee Plus subscription now and refunds the part of the
> current period you have not used, or the full amount if you did not ask us to
> start immediately. Cancelling instead keeps your access until the end of the
> paid period. Either way you keep your account and all of your data. You do not
> need to give a reason or contact us."

Confirmation action:
> "Yes, withdraw from my contract"

### B3. Durable-medium acknowledgement email (sent on withdrawal)

Subject: "Your Inklee Plus withdrawal is confirmed"
> "We have received your withdrawal from your Inklee Plus subscription.
>
> Your subscription has ended and your plan has been updated. Your account and
> all of your data are kept.
>
> A refund of [amount] is on its way to your original payment method. [shown only
> when a refund is due]
>
> This message is your acknowledgement of receipt on a durable medium."

### B4. Pre-contract disclosure at checkout (before payment)

Heading:
> "Before you order"

Body:
> "Inklee Plus is a monthly subscription. It renews automatically each month until
> you cancel, and you can cancel any time from your plan settings. The price is
> shown on the next step before you pay."

Order button: "Order with obligation to pay". Terms line: "By placing this order
you agree to the Terms of Service, which include your 14-day right to withdraw."
The purchase confirmation email (durable medium) reads: "Your Inklee Plus
subscription is confirmed. You can manage or cancel it any time from your plan
settings. This message is your confirmation on a durable medium."

**What to confirm for B:** the wording of B1-B4; that the immediate-performance
control and the withdrawal function meet Art. 11a and the CRD (separate function,
continuously available, unequivocal statement, durable acknowledgement, no dark
patterns); and that no blanket rights-waiver appears anywhere.

**To record (after sign-off):** `record-approval.cjs` with
`approval_key: "consumer_withdrawal_copy_approved"`, `approval_group: "b2c"`,
`bound_artifact: "withdrawal-policy-2026-07-23"` (the current withdrawal policy
version), `approved_by`, `evidence_ref`, `APPROVED: true`.

---

## C. `proration_policy_approved` (C4, CO-OWNED with the accountant)

The refund on a mid-period withdrawal is **time-based** (policy version
`time-based-v1`): the fraction of the current period already supplied is retained,
the remainder is refunded, never more than was paid, preserving the original tax
treatment (0 while VAT-unregistered). Without an immediate-performance request it
is a full refund. Please confirm the method with the accountant.

**To record:** `record-approval.cjs` with `approval_key: "proration_policy_approved"`,
`approval_group: "b2c"`, `approved_by` (counsel + accountant), `evidence_ref`,
`APPROVED: true`.

---

## D. Consumer Terms (section 11): already drafted, bound to `terms_approved`

The consumer 14-day withdrawal terms are already in the Terms (version
`2026-07-24`, hash `61c30c65...`), which you approved as drafting. The relevant
bullet:
> "Consumer withdrawal right. If you buy Inklee Plus as a consumer you have a
> 14-day right of withdrawal. Because Inklee Plus is a continuously supplied
> digital service, starting to use it does not remove this right. If you ask us to
> start immediately and then withdraw within the 14 days, you pay a proportionate
> amount for the period already supplied. A separate withdrawal function and full
> withdrawal information are provided in the consumer purchase flow. Consumer sales
> are not enabled until that flow is live."

Please confirm this reads correctly alongside the B strings. No separate recording:
it is covered by `terms_approved`. **Note:** the final sentence ("Consumer sales
are not enabled until that flow is live") is the dark-launch statement; at consumer
go-live it must be removed or updated, which re-rolls the Terms version hash and
re-closes `terms_approved` for a quick re-approval.

---

## Open confirmations for counsel

1. F4(b): no proportionate deduction without the express immediate-performance
   request (full refund otherwise). Confirm.
2. That `withdrawal_lost_where_legally_valid` stays **not reachable** for this
   monthly subscription (per C1), so no wording claims the right is lost.
3. Auto-renewal reminder obligations per consumer market (C9) before consumer
   go-live: confirm which markets and cadence, or that none applies at launch.
4. Cancellation parity (C10): cancellation is offered in-app via the Stripe
   Customer Portal, as easy as sign-up. Confirm this satisfies the standard.

## After sign-off

Record `consumer_withdrawal_copy_approved` + `proration_policy_approved` as above.
Of the **three** eng-owned b2c keys, `withdrawal_function_operational` and
`durable_confirmation_operational` are ready for engineering to record now;
`consumer_refund_creditnote_tested` is still **open** (it needs a credit-note /
tax snapshot on refund, largely moot while VAT-unregistered but the key requires
it). Remaining before a consumer charge: those three eng keys +
`consumer_pricing_display_approved` (founder + accountant) + a live Stripe Price,
then flip `PLUS_CONSUMER_LAUNCH_ENABLED`. Run
`node scripts/billing/gate-status.cjs` to confirm b2c is 7/7.

## Cross-reference

`counsel-decision-pack.md` (C1-C10) · `plus-launch-strategy-decisions.md` (D1-D3) ·
`eu-consumer-withdrawal-flow.md` (the flow design) · `b2b-signoff-package.md` ·
`plus-launch-followup.md` (the engineering checklist).
