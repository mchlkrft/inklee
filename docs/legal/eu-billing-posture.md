# EU billing posture

**Status:** Engineering design and repository audit. DRAFT for founder review, 2026-07-23. Not implementation, not legal advice. Every consumer-facing or legal string below is DRAFT that requires qualified counsel approval. Nothing here is legal or tax approval; it is an engineer proposing an architecture and flagging what counsel and the accountant must decide.

**Constraints honoured:** no live billing, no VAT registration, no production pricing change, no legal copy published.

**Label key:** `CONFIRMED LEGAL REQUIREMENT` (counsel must confirm) / `CURRENT IMPLEMENTATION` / `RECOMMENDED IMPLEMENTATION` / `FOUNDER DECISION` / `ACCOUNTANT DECISION` / `LEGAL-COUNSEL DECISION` / `UNRESOLVED QUESTION`. Sentence case, no em-dashes.

Covers P0 (B2B-first, consumer charging gated), P2 (checkout collection, VIES B2B verification), P4 (pre-payment disclosure, unambiguous pay button, one server-authoritative quote), P5 (durable confirmation), P12 (pricing display). Companions: `docs/product/billing-customer-classification.md`, `docs/legal/vat-and-oss-architecture.md`, `docs/legal/eu-consumer-withdrawal-flow.md`, `docs/product/billing-activation-checklist.md`.

---

## 1. Current state (audit)

`CURRENT IMPLEMENTATION` Stripe is deposit-only Connect Custom (`apps/web/src/lib/stripe.ts`, fee single-sourced in `platform-fee.ts`, `fees.payer=application`). No Stripe Customer, Subscription, Checkout, Portal, Invoice, Price, Product, or Tax; only three Stripe env vars. No subscription checkout UI. Legal pages under `apps/web/content/legal/` carry a default-on pending-review banner (`NEXT_PUBLIC_LEGAL_PENDING_REVIEW`); `terms.md` has a paid-plan placeholder; `imprint.md` holds the Inklee OU identity and below-threshold VAT status. Identity is one artist per auth user with no customer classification, VAT, address, or terms-at-purchase capture. Migration 0105 (authored) plus the engine foundation are the downstream target. Pricing is draft only (`docs/business-model.md`).

---

## 2. B2B-first posture and the gate (P0)

`FOUNDER DECISION` Paid Plus and Studio are professional software for tattoo artists and studios. Build the compliant B2C fallback, but keep live consumer charging disabled until counsel reviews the consumer terms, withdrawal wording, and Estonian implementation. Do not enable live EU billing merely because the technical flow works.

`RECOMMENDED IMPLEMENTATION` **Review reconciliation F5: the activation-gate ledger is the single authority.** Any env switches (`BILLING_ENABLED`, and a separate consumer switch) are at most necessary-not-sufficient operational off-switches layered on top of `assertLiveBillingAllowed` (see `billing-activation-checklist.md` section 2), never a substitute for it and never able to open charging on their own. Business-live and consumer-live are separate approval groups; consumer-live stays closed after business-live opens until the b2c approvals land. A live charge on an `unresolved` classification fails closed. Prod is always live-mode (it holds `sk_live`); test-mode dogfooding runs only on staging or preview with `sk_test`; a key-prefix vs `BILLING_MODE` mismatch fails closed (review F6).

---

## 3. Checkout data collection (P2)

`CONFIRMED LEGAL REQUIREMENT` (counsel must confirm the set) At checkout, collect and store (all server-authoritative): legal name; trading or studio name; billing country (ISO alpha-2, the customer country, never `profiles.stripe_account_country`); full billing address; a **business-use declaration as a separate unchecked control**; a VAT number where available with its VIES validation status; the classification source; the terms version accepted (store the SHA-256 `versionHash`, not just the date); the acceptance timestamp; and IP plus user agent where lawful. These write the classification (`billing-customer-classification.md`) and a consent-evidence row (single append-only table, review F3).

`LEGAL-COUNSEL DECISION` DRAFT business-use declaration (do not ship as-is): "I confirm that I am purchasing Inklee for purposes related to my trade, business, craft, or profession, and not primarily for private use." A separate, unchecked control; not required as a VAT number is not the only way to establish business status.

**VIES B2B verification (P2).** Where a VAT number is supplied, validate it via VIES (or the approved provider), and store the submitted value, the normalized value, the status, the timestamp, and the provider response reference; revalidate periodically and when billing identity changes. **VIES downtime must never silently grant the reverse charge**: on `unavailable` the account stays `business_without_vat` or `manual_review` (which blocks the live charge), never the reverse-charge state (P2, enforced structurally in the classification model).

---

## 4. Pre-payment disclosure and the pay button (P4)

`CONFIRMED LEGAL REQUIREMENT` (counsel confirms the exact list and wording) Directly before payment, show: the product and tier; the main service characteristics; the billing interval; the net price; the VAT amount or treatment; the total payable; the renewal behavior; the minimum contract duration if any; the cancellation behavior; the withdrawal information where applicable; and the Inklee OU legal identity and contact.

`RECOMMENDED IMPLEMENTATION` **One server-authoritative quote** (`billing_quotes`, a stored row) is the single source of both the displayed price and the Stripe amount; VAT is never computed only client-side. The quote carries the policy-derived tax treatment (`vat-and-oss-architecture.md`) and the calculator's rate.

`LEGAL-COUNSEL DECISION` DRAFT pay-button copy: "Subscribe and pay EUR X" or "Start paid subscription for EUR X per month." The button must unambiguously state the obligation to pay; the ambiguous words Continue, Confirm, Complete, Activate, and Start now are banned.

---

## 5. Durable contract confirmation (P5)

`CONFIRMED LEGAL REQUIREMENT` (counsel confirms content and that email is a valid durable medium) After purchase, send a durable confirmation (email via Resend, or an approved durable medium) containing: the customer and supplier identity; the purchased product; the interval; the total and VAT; the renewal and cancellation conditions; the terms version; the withdrawal instructions and model withdrawal information where applicable; the immediate-performance request and its wording; the invoice or receipt; and the effective contract date.

`RECOMMENDED IMPLEMENTATION` Store evidence that the confirmation was generated and delivered or attempted (`billing_contract_confirmations`, append-only, with delivery status). Do not rely only on a mutable web page. On a delivery failure, record the attempt, retry, and surface it for follow-up.

---

## 6. Pricing display (P12)

`FOUNDER DECISION` (with accountant input) the display convention: consumer price fixed VAT-inclusive, base price plus country-specific VAT, or different B2B-net vs B2C-gross conventions. Do not assume "EUR 3/mo" is net or gross. This decision fixes the Stripe Price `tax_behavior`, which is irreversible after Price creation (`vat-and-oss-architecture.md` section 4.4), so it must precede the first live Price.

`RECOMMENDED IMPLEMENTATION` An effective-dated `pricing_plans` config declares, per plan: the marketing display price; the tax behavior; the currency; the billing interval; the eligible customer type; the effective date; the Stripe Price id; and the entitlement package. The entitlement package key (`plus`) is never coupled to a tax-inclusive price (P12); price, currency, and tax behavior can change without re-gating a feature. Monthly-first: annual is present in the config but disabled for consumers until proration is counsel-reviewed (P10). The founder-window discount is a promotion code, not a separate Price (`billing-activation-checklist.md` section 3).

---

## 7. Schema and files (authored, not applied)

`RECOMMENDED IMPLEMENTATION` In the coordinated migration pass (review F2, sequential numbers, one owner per file, after 0106): `billing_quotes` (the server-authoritative quote, referenced by checkout and settlement), `billing_contract_confirmations` (append-only, delivery evidence), `pricing_plans` (effective-dated pricing config). The single append-only **consent-evidence table** (`billing_consent_records`, review F3) is the one home for every discrete consent event (terms acceptance, business-use declaration, immediate-performance request, withdrawal acknowledgement), each control its own row; other tables reference the consent by id and never re-store the version, hash, or timestamp. New server modules for the quote, the VIES client, the checkout core, and the confirmation sender; a checkout route; `content/legal/subscription-terms.md` kept DRAFT behind the pending-review banner. Do not bump the shared `stripe.ts` apiVersion.

---

## 8. Decisions required

> **RESOLVED 2026-07-24 (see `plus-launch-strategy-decisions.md`).** The
> "decline consumer sales at launch / declaration declined" question is closed:
> there is **no business-use declaration at v1** (D1) — all buyers take the
> consumer path, so the **b2c group is the launch gate**. Inklee stays
> **VAT-unregistered with no reverse-charge** (D2); VIES becomes optional invoice
> enrichment, not a classification gate. The `FOUNDER`/`LEGAL-COUNSEL`/`ACCOUNTANT`
> items below are superseded to that extent.

- `FOUNDER DECISION` the pricing display convention (fixes `tax_behavior`); what happens when the business-use declaration is declined (route to the consumer flow, or decline consumer sales at launch); the quote lifetime.
- `ACCOUNTANT DECISION` confirm the current no-VAT posture and the convention trigger date; the VIES revalidation cadence; the IP-evidence retention.
- `LEGAL-COUNSEL DECISION` the DRAFT subscription terms, withdrawal wording, and business-use declaration; whether Inklee may decline consumer sales at launch (B2B-only), which would keep the b2c group permanently gated until a later decision; the declaration's sufficiency; email as a durable medium; the full disclosure list and the pay-button wording; VIES reliance and downtime handling.

---

## 9. Risks

Frontend gate bypass (mitigated by the ledger authority, review F5); client-side VAT display or charge mismatch (mitigated by the one server quote); silent reverse charge on VIES downtime (forbidden structurally); the coordinated-migration collision (mitigated by one authoring pass, review F2); classification used as a consumer-rights trap (forbidden by P9). The single most dangerous conflation in a Connect-plus-billing system, the deposit Connect account vs the billing Customer, is kept distinct everywhere (the Connect account receives client deposit money in; the billing Customer is the artist paying Inklee out).

**Confidence:** high on the audit (grep-verified). Medium on the exact legal field and disclosure lists and the pay-button wording, all counsel-gated; and on the sibling-workstream table seams, resolved by the reconciliations noted here and in the compliance review.
