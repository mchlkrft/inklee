# Invoice configuration: pre-approved founder implementation path

**Date:** 2026-07-25. **Status:** PRE-APPROVED by counsel + accountant (relayed by
the founder in the 2026-07-25 walkthrough, recorded on `invoice_config_approved`).

**The decision (A-2):** while Inklee is VAT-unregistered, the Stripe-generated
subscription invoices are acceptable **as-is**: no VAT line, no VAT number, no
reverse-charge note, no additional invoice wording is required at the moment.
The enhanced configuration below does not need to ship now, **but must be
implementable at any time**. Counsel and the accountant have pre-approved this
path: **implementing it exactly as written here counts as approved** — no further
sign-off round is needed. Deviating from it (different wording, different
trigger) re-opens the normal approval process.

---

## Level 1: optional polish (implement any time, zero dependencies)

1. **Small-undertaking footer note** on Stripe invoices. In the Stripe dashboard
   (Settings → Invoice template → Default footer), or via API
   (`invoice_settings.footer` on the customer / account default), set exactly:
   > "VAT not applied. Supplier is a non-registered small undertaking (Inklee OU,
   > Estonia, registry code 17497625)."
2. **Seller identity block**: confirm the account's public business details
   (name "Inklee OÜ", registry code, address) render on the invoice header.
3. **Numbering**: keep Stripe's sequential invoice numbering; set the prefix to
   `INK-` (Settings → Invoice template → Invoice numbering) if a branded series
   is wanted. Stripe's account-level sequence satisfies the sequential-numbering
   requirement; do NOT run a parallel manual series for subscriptions.

## Level 2: at VAT registration (the A-1 trigger: founder alerted at 35,000 EUR
Estonian taxable turnover; hard limit 40,000)

Implement together, in this order, within the registration's effective window:

1. **Re-record the tax posture** via `scripts/billing/record-tax-approval.cjs`:
   new version label (e.g. `ee-registered-v1`), `seller_vat_registered: true`,
   the VAT number, per-class treatments updated per the accountant's registration
   advice (domestic standard 24%; cross-border EU B2B → reverse charge returns;
   EU consumer per OSS status). The version bump auto-re-closes
   `tax_policy_approved` until the management board re-approves — intended.
2. **Terms section 11**: replace the outside-VAT wording with the registered
   wording (VAT number stated; reverse-charge sentence returns for cross-border
   EU B2B). This re-rolls the Terms hash and re-closes `terms_approved` for a
   counsel re-approval — intended, and pre-agreed as part of this path.
3. **Stripe**: enable Stripe Tax (the calculator only — the treatment stays
   policy-decided per `vat-and-oss-architecture.md` §4.3); add the VAT number to
   the account's invoice details; the Price stays `tax_behavior: inclusive`
   (founder-approved 2026-07-25), so the consumer price REMAINS 3.00 EUR and
   Inklee absorbs the VAT out of it (net ~2.70 → ~2.18/month).
4. **Invoice wording per customer class** is generated from the treatment
   (`invoiceNoteForTreatment` in `packages/shared/src/billing.ts`) — already
   built; it activates automatically once the posture carries the registered
   treatments. Never one blanket note for all classes.
5. **Credit notes**: the withdrawal credit-note snapshots
   (`transaction_tax_snapshots`, kind `credit_note`) start carrying the real
   rate/jurisdiction automatically (the writer copies the charge snapshot). No
   code change needed.
6. **OSS**, if the 10,000 EUR cross-border B2C line is what triggered: register
   for OSS, set `oss_registered: true` in the posture, treatments for
   `eu_consumer` become `customer_country_vat`.

## Level 3: artist fee statements (gated on counsel Q1, separate track)

If counsel's open Q1 (`payment-flow-for-counsel.md`) concludes Inklee must
self-issue invoices/statements for the 3% deposit fee to artists, that is
implemented in the Control Tower accounting feature (handoff R-14), not here.

---

**Bookkeeping note:** this path is referenced from the recorded
`invoice_config_approved` approval. When Level 2 executes, the re-closed keys
(`tax_policy_approved`, `terms_approved`) follow their normal re-approval flow;
everything else on this page is pre-approved as written.
