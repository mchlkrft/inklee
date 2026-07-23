# Billing activation checklist

**Status:** Engineering design and repository audit. DRAFT for founder review, 2026-07-23. Not implementation, not legal advice. Every consumer-facing string is DRAFT requiring qualified counsel approval. Nothing here is legal or tax approval.

**Constraints honoured:** no live billing, no VAT registration, no production pricing change, no legal copy published.

**Label key:** `CONFIRMED LEGAL REQUIREMENT` (counsel must confirm) / `CURRENT IMPLEMENTATION` / `RECOMMENDED IMPLEMENTATION` / `FOUNDER DECISION` / `ACCOUNTANT DECISION` / `LEGAL-COUNSEL DECISION` / `UNRESOLVED QUESTION`. Sentence case, no em-dashes.

This doc owns the server-authoritative live-billing gate, the promo-code admin function, the implementation stages, the risk assessment, the test matrix, and the consolidated decisions across all five workstreams. Companions: `docs/product/billing-customer-classification.md`, `docs/legal/eu-billing-posture.md`, `docs/legal/eu-consumer-withdrawal-flow.md`, `docs/legal/vat-and-oss-architecture.md`.

---

## 1. Current-state findings (audit)

`CURRENT IMPLEMENTATION`

- **No billing. Deposits only.** Three Stripe env vars; one shared client `apps/web/src/lib/stripe.ts` that runs the live deposit/Connect/refund path; a webhook handling five deposit/Connect events; the 3% deposit fee single-sourced in `packages/shared/src/platform-fee.ts`. Grep for `stripe.(subscriptions|checkout|billingPortal|prices|invoices|promotionCodes|coupons)` returns zero. No Customer, Subscription, Checkout, Portal, Price, Product, Invoice, Stripe Tax, promotion code, or `max_redemptions` anywhere.
- **No tax model, no classification, no terms-at-purchase capture.** Inklee OU (Estonia, registry 17497625) is below the VAT threshold and not registered. The deposit refund is asymmetric full-refund-only; there is no subscription refund, proration, credit-note, or withdrawal logic. Ordinary cancellation is not a consumer withdrawal.
- **The entitlement foundation exists.** `packages/shared/src/entitlements.ts` (pure, `GrantSource`, `GrantPackage`, explain helpers) plus authored-not-applied migration 0105 (billing + limit + grandfather columns on the service-role-only `account_overrides`). Access resolves from the internal row, never a live Stripe call.
- **Patterns to reuse.** The capability kill switch (`isCapabilityDisabled`, `DISABLED_CAPABILITIES`); the human launch-gate checklist (`docs/launch-gate.md`); legal versioning with a SHA-256 `versionHash` and the `NEXT_PUBLIC_LEGAL_PENDING_REVIEW` banner (`apps/web/src/lib/legal/documents.ts`); the admin surface under `apps/web/src/app/admin/`; the money-path rules (converge to a target under a row lock, never a delta, never a silent degrade).

`FOUNDER DECISION` (2026-07-23) B2B-first professional software; a compliant B2C fallback is built but live consumer charging stays disabled behind a server-authoritative gate until counsel reviews the consumer terms, withdrawal wording, and Estonian implementation. 14-day withdrawal is law. Billing web-only (D17). Founder window is a Stripe promotion code plus an admin promo-code function, not a separate Price. Monthly-first.

---

## 2. The live-billing activation gate (P13)

`CONFIRMED LEGAL REQUIREMENT` (counsel must confirm the list is sufficient) and `FOUNDER DECISION`: exactly ONE server-authoritative gate stays closed until all required approvals are recorded; a frontend flag alone must never bypass it. Test-mode billing (dogfood) is allowed while the gate is closed; live charging is what the gate governs. Consumer-live stays closed even after business-live opens, until the consumer approvals land.

### 2.1 Two orthogonal axes, one assertion

`RECOMMENDED IMPLEMENTATION` Separate two things a single boolean would conflate:

- **Mode** = `test` or `live`, derived on the server from the Stripe secret-key prefix and cross-checked against a `BILLING_MODE` env. Mode is a fact about which Stripe environment we are in.
- **Gate** = the approvals ledger. It answers "is live charging authorized, and for which contract type".

Every live-charge path calls one function at the server core, immediately before the Stripe call:

```
assertLiveBillingAllowed(contractType: "business" | "consumer"): void
// throws BillingNotActivatedError unless ALL of:
//   1. mode === "live" AND BILLING_ENABLED, AND
//   2. every approval row in the required GROUP for contractType is present,
//      non-expired, and bound to the CURRENTLY ACTIVE artifact version
//      (terms versionHash, tax-policy version), AND
//   3. the billing_subscription capability is not in DISABLED_CAPABILITIES.
```

**Review reconciliation F5 (the ledger is the authority).** `BILLING_ENABLED` and `CONSUMER_CHARGING_ENABLED` are at most necessary, never sufficient, operational off-switches layered on top of the ledger. They can never open charging on their own. The single authority is `assertLiveBillingAllowed` reading the database ledger, called at the server core, never only in the UI. This is the exact anti-bypass P13 requires.

**Review reconciliation F6 (prod is always live-mode).** Prod holds `sk_live` for deposits, so in prod mode is always `live` and every billing path is always ledger-gated (safe). True test-mode dogfooding runs only on a staging or preview deployment holding `sk_test`. A mismatch between the key prefix and `BILLING_MODE` must FAIL CLOSED (refuse), never trust the env to downgrade a live key to a test path, consistent with the money-path rule that a card path never silently degrades.

### 2.2 The approval ledger

`RECOMMENDED IMPLEMENTATION` A service-role-only table `billing_activation_approvals` (RLS enabled, zero policies), additive. Each row: `approval_key` (PK), `approval_group` (`core | b2b | b2c`), `approved`, `approved_by`, `approved_at`, `evidence_ref` (a link to the signed counsel email, accountant confirmation, or passing test-run id), `bound_artifact` (the terms `versionHash` or tax-policy version this approval was given against), `notes`. Binding to `bound_artifact` is the anti-stale defence: if the Terms hash or the active tax policy changes after sign-off, the gate treats the approval as not matching the active artifact and closes until re-approved. `LEGAL-COUNSEL DECISION` confirm a material change to a bound artifact should re-close the gate (recommended yes).

The required approvals (the closed-until list, P13):

| Key | Group | Owner | Meaning |
| --- | --- | --- | --- |
| `stripe_prod_verified` | core | founder | Live keys verified, live webhook with the subscription events enabled, live Prices created. |
| `tax_policy_approved` | core | accountant | The active effective-dated tax policy is accountant-approved. |
| `ee_vat_oss_posture_confirmed` | core | accountant + counsel + founder | Estonian VAT / OSS posture confirmed and matches the active policy (review F8: counsel co-owns the legal obligation). |
| `terms_approved` | core | counsel | Customer Terms cleared, bound to the `versionHash`. |
| `privacy_approved` | core | counsel | Privacy notice for the billing data (address, VAT number, IP/UA) cleared. |
| `webhook_reconciliation_tested` | core | eng | Subscription webhook branches plus reconciler tested convergent under replay. |
| `accountant_export_tested` | core | accountant | The per-transaction tax-snapshot export the accountant needs is produced and accepted. |
| `invoice_creditnote_tested` | core | eng | Invoice and credit-note generation plus durable delivery tested. |
| `business_declaration_approved` | b2b | counsel | The business-use declaration wording cleared. |
| `consumer_withdrawal_copy_approved` | b2c | counsel | Consumer withdrawal plus immediate-performance wording cleared. |
| `withdrawal_function_tested` | b2c | eng | The online withdrawal function tested end to end. |
| `refund_proration_tested` | b2c | eng + accountant | Proration/refund/credit-note calculation tested and its policy version accountant-approved. |

Business-live opens when every `core` and `b2b` key is approved-and-bound. Consumer-live opens only when `core`, `b2b`, and `b2c` all are. `UNRESOLVED QUESTION` whether `invoice_creditnote_tested` is `core` or `b2b`-only at launch (accountant decides).

### 2.3 Admin surface for the gate

`RECOMMENDED IMPLEMENTATION` A read-mostly `admin/billing-activation` page rendering the ledger as a launch-gate-style checklist with a live status banner ("Business live: CLOSED, 2 of 8 approvals recorded"; "Consumer live: CLOSED"). Writes go through a service-role admin action, audit-logged. The page states prominently that ticking a box records an off-platform approval (a signed counsel email, an accountant confirmation, a passing test-run id), not the approval itself. `FOUNDER DECISION` whether ledger writes need two-person control.

---

## 3. Promo-code admin function

`FOUNDER DECISION` The founder window is a Stripe promotion code with `max_redemptions`, plus a customizable admin function, not a separate Price.

`RECOMMENDED IMPLEMENTATION` A promotion code sits on a coupon; the admin function creates both (`stripe.coupons.create` for the discount, `stripe.promotionCodes.create` for the code, cap, and expiry). Stripe cannot restrict a code by our custom customer type, so **eligibility by customer type is enforced server-side at checkout**: before applying a submitted code the checkout core reads the classification and refuses the code if `eligible_customer_type` does not match. A live promotion code is a live-charge precondition, so its creation calls `assertLiveBillingAllowed` too. A `promo_codes` mirror table (service-role only) records code, coupon/promotion ids, mode, tier, `entitlement_package` (decoupled from any tax-inclusive price, P12), `eligible_customer_type`, discount kind and value, currency, `cap_max_redemptions`, `redeemed_count_cache`, expiry, active, created_by. Every create/deactivate audit-logs; the authoritative redemption count is Stripe's, reconciled by the same reconciler. Admin surface `admin/promo-codes`: list plus a create form plus deactivate. `FOUNDER DECISION` confirm the founder-window shape (monthly-only founder discount, or business-only annual since consumer annual stays off) and the cap (first 100 per `business-model.md`).

---

## 4. Implementation stages (dependency-ordered)

Each stage is a gate; do not enter N+1 until N is done.

- **Stage 0 (foundation, in flight).** Engine foundation shipped; 0105 authored. Apply 0105, verify effects, deploy the `entitlements-server.ts` reader (respect the ordering hazard). Register `billing_subscription` and `consumer_withdrawal` capabilities in `CAPABILITIES` (BLOCKER-2). Blocks everything.
- **Stage 1 (schema, config, gate).** In one coordinated migration authoring pass against the then-current head, one owner per file (review F2): the classification profile (`account_billing_profile`); the tax policy and immutable snapshot tables; the pricing config; the single append-only consent-evidence table (review F3); the activation-gate ledger; the promo-code mirror. Plus the server-authoritative `getQuote()`. Blocks the live paths.
- **Stage 2 (technical billing, TEST mode).** On the current Stripe apiVersion, no `rk_` swap in this diff (HIGH-3). Build the Customer, monthly Price(s), a Checkout Session from `getQuote()`, the subscription webhook branches, the converge writer into the 0105 columns (idempotent, converge to a target under a row lock, never a delta), the Customer Portal, and the downgrade that restores the grandfather package on `paid -> free` (HIGH-4). Guard the F-2 duplicate subscription (query Stripe for an active sub before session creation; never overwrite a different active `stripe_subscription_id`). Dogfood on staging with `sk_test`; adversarial money-path review of the diff. Gate closed; no live money.
- **Stage 3 (B2B checkout).** P2 collection (legal name, trading name, country, address, the separate unchecked business-use declaration DRAFT, VAT number, VIES status, classification source, terms `versionHash`, acceptance timestamp, IP/UA where lawful). P4 pre-payment summary and an unambiguous pay button DRAFT ("Subscribe and pay EUR X"; never Continue/Confirm/Complete/Activate/Start now). P5 durable confirmation with delivery evidence. Write the tax snapshot per transaction. Stays behind the gate's b2b group.
- **Stage 4 (B2C fallback, built, live-disabled).** The immediate-performance consent (separate unchecked control, DRAFT, not preselected, not bundled with Terms); the withdrawal function distinct from cancellation; the proration/refund/credit-note engine (policy-versioned, not activated for live consumers until counsel confirms); post-withdrawal downgrade (revoke Plus/Studio, delete nothing, reuse the Stage 2 per-feature downgrade and grandfather-restore); anti-abuse as auditable risk events. See `eu-consumer-withdrawal-flow.md`. Stays behind the gate's b2c group.
- **Stage 5 (activation, post-counsel).** Record approvals as they land; when core plus b2b complete, flip the operational switches and enable the capability: business-live opens. Consumer-live opens only when b2c completes. Create the founder-window live promotion code. Publish `/pricing` (coordinate with the SEO owner).
- **Stage 6 (fast-follow).** Annual consumer billing once proration is counsel-reviewed; Stripe Tax as the calculation engine; the OSS export; the analytics split; plan-change history, dunning, Studio tier; any global apiVersion bump or `rk_` swap as a separate adversarially-reviewed deposit-path change.

**Stage-to-launch:** B2B-launch-minimal = stages 0-3 plus the core+b2b activation. B2C-fallback = stage 4 (live-disabled). Post-counsel = the b2c activation.

---

## 5. Risk assessment

- **Central risk (P0): going live on "tech works alone."** A passing test flow or a flipped env flag must not result in charging real EU consumers before the consumer terms, withdrawal wording, VAT treatment, and Estonian implementation are reviewed. Mitigated structurally by the section 2 gate: live charging requires a DB ledger bound to active artifacts, business-live and consumer-live are separate groups, and every live path calls `assertLiveBillingAllowed`. Residual: an admin with service-role access could tick the ledger without the real approval; mitigated by audit logging and the record-of-off-platform-approval framing, not eliminated. `FOUNDER DECISION` whether ledger writes need two-person control.
- **Compliance:** VAT mis-treatment, withdrawal-right failure, disclosure failure, weak terms-at-purchase evidence. Mitigated by the tax engine, the withdrawal flow, P4 disclosure, and storing the `versionHash` at purchase; consumer-live stays closed until tested and copy-approved.
- **Money path:** deposit-path regression from a shared-client version or key change (build on the current version; a key/version change is a separate reviewed change re-running G-5); webhook non-convergence / duplicate-subscription double-charge (converge to a target, query Stripe before session creation); silent degrade (fail closed, return 5xx so Stripe retries); grandfather loss on downgrade (restore the manifest).
- **Data protection:** new personal data at checkout (address, VAT number, IP/UA) must be covered by the Privacy notice and retention rules; `LEGAL-COUNSEL DECISION` reconcile billing/tax record retention (tax law may require multi-year retention) against the account-deletion promise. Card data never touches Inklee.
- **Operational:** support time per Plus user is the binding margin constraint; a refund/withdrawal is proportionally expensive at EUR 3/month; keep consumer annual disabled until proration is proven.

---

## 6. Test matrix (P15)

`RECOMMENDED IMPLEMENTATION` Concrete specs; all run in test mode first, the live subset re-runs at stage 5 as activation evidence. Full worked table in the design record; the load-bearing rows:

- Classification and tax (T01-T11, T19-T23): verified EU VAT business (reverse charge, VIES ref in the snapshot), EU business without VAT (not reverse charge), EU consumer (OSS destination, consumer-live blocked until b2c), EE business/consumer (EE domestic), non-EU, invalid VAT (never silent reverse charge), VIES downtime (manual review, blocked), address change (new snapshot, prior immutable), tax-policy transition (re-close the `tax_policy_approved` binding), tax-inclusive vs exclusive display, reverse charge, OSS inclusion, credit note.
- Withdrawal (T12-T18): **T12 missing immediate-performance consent tests BOTH branches** (held-until-day-15 AND activated-with-full-refund-on-withdrawal) pending the founder decision (review F4, do not hard-assert an unresolved decision); withdrawal within period (proportionate charge, remainder refunded, credit note, entitlement revoked, account/data preserved); withdrawal after expiry (not available, reason recorded, no punitive action); cancellation within period (distinct from withdrawal, right unaffected); repeated withdrawal (current honoured in full, a risk event logged, no penalty on the statutory flow); partial refund; full refund.
- Money path and gate (T24-T33): webhook replay (converge, one snapshot, no double grant); refund failure (no silent success, case left open, retried convergently); durable-confirmation delivery failure (recorded, retried, not dependent on a mutable page); duplicate-subscription race (second refused, reconciler flags); gate-closed live attempt (throws, no live object created, no silent downgrade); business-live-open consumer-live-closed (business allowed, consumer refused); stale-approval re-close; promo eligibility mismatch (refused server-side); promo cap reached; downgrade restores grandfather.

---

## 7. Consolidated decisions

- `FOUNDER DECISION` Plus caps `custom_fields=30` and `studio_library=50` (only `active_trips=100` ratified); the founder-window shape and cap; `past_due` grace (propose 7 days); whether a comped artist who buys Plus then cancels reverts to comp or Free; the pricing display convention (P12, which fixes Price `tax_behavior` before the first live Price); the `legacy_free_v1` package and cutover; Customer Portal at launch vs manual cancel; whether ledger writes need two-person control; confirm the gate approval list is complete. (`rk_` vs `sk_live` is deferred to a separate reviewed deposit-path change.)
- `ACCOUNTANT DECISION` the active tax policy and its approval; the Estonian VAT/OSS registration posture and trigger; whether Stripe Tax is the calculator; VAT treatment per customer axis and the invoice/credit-note/OSS export format; the proration tax-adjustment method; the billing/tax record retention period.
- `LEGAL-COUNSEL DECISION` whether the approval list is legally sufficient and whether a bound-artifact change re-closes the gate; the customer Terms and the billing Privacy notice; the business-use declaration wording and mechanism; the consumer withdrawal and immediate-performance wording, that no blanket rights-waiver appears, and the model withdrawal information; the proration policy and any Estonian-implementation constraints; the pre-contract disclosure set and pay-button wording; the VAT-registration/OSS legal obligation (co-owned with the accountant); the data-retention vs deletion reconciliation.
- `UNRESOLVED QUESTION` the classification holder placement; `invoice_creditnote_tested` group; the coordinated migration numbering; whether the founder window can be business-only annual at launch.

**The gate is the load-bearing safety mechanism: it is what makes "the flow works" unable to become "we are charging EU consumers" without the recorded approvals.**
