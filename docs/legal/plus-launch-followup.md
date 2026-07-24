# Plus launch — follow-up changes (Claude Code handoff)

**Date:** 2026-07-24. **Owner:** engineering (Claude Code).
**Source of decisions:** `docs/legal/plus-launch-strategy-decisions.md` (D1–D3).
**Why:** the launch posture changed to **consumer-first** (D1), Inklee stays
**VAT-unregistered with no reverse-charge** (D2), and live billing waits for the
**Phase-1 gate** (D3). This file lists every concrete change those decisions
trigger. Docs already carry inline `UPDATE 2026-07-24` markers pointing here.

**How to use this file.** Work top to bottom. Each item has a checkbox, the
file(s) to touch, and the acceptance check. Nothing here enables live billing —
the activation-gate ledger still governs that. Do **not** publish legal copy or
create a live Stripe Price as part of this pass.

---

## 1. Launch gate → b2c (D1)

- [ ] **Make the b2c approval group the launch gate.** The b2b group keys stay
  valid for a future business/studio tier but are no longer the path to first
  live charge.
  - Files: `scripts/billing/`, `billing_activation_approvals` usage; gate-status
    tooling (`scripts/billing/gate-status.cjs`).
  - Check: `gate-status` reports the b2c set as the blocking group for consumer
    live; b2b keys do not open charging on their own.
- [ ] **Drop the business-use declaration from v1 checkout** (defer, don't
  delete). Remove the required control and its gating from the checkout flow;
  keep the `billing_consent_records` schema and the code path behind a flag for a
  later B2B tier.
  - Files: checkout collection step; `account_billing_profiles`; the declaration
    control component.
  - Check: a buyer can reach the pay button with no business-use checkbox; no
    `business_use_declaration` row is required to purchase.
- [ ] **VAT-ID becomes optional invoice enrichment**, not a classification gate.
  A supplied VAT-ID still triggers a VIES attempt (append-only log retained), but
  a missing/failed VIES result **does not block** checkout on the consumer path.
  - Files: VIES client; `vies_validation_attempts`; classification resolver.
  - Check: checkout completes with no VAT-ID; VIES `provider_unavailable` never
    blocks a consumer sale.

## 2. Consumer path is launch-critical (D1)

- [ ] **Withdrawal function (Article 11a)** live and tested end to end —
  continuously available, prominently placed, "withdraw from contract here"
  label, confirmation step, durable-medium acknowledgment.
  - Gate key: `withdrawal_function_operational`.
- [ ] **Durable confirmation** flow tested (`billing_contract_confirmations`,
  append-only, delivery status).
  - Gate key: `durable_confirmation_operational`.
- [ ] **Time-based proration + credit note** on mid-period withdrawal, preserving
  the original tax treatment.
  - Gate keys: `proration_policy_approved`, `consumer_refund_creditnote_tested`.
- [ ] **Record consumer classification** = digital service (per C1) in
  `billing_legal_policies`.
  - Gate key: `consumer_classification_approved`.
- [ ] **Consumer (VAT-inclusive) price display** approved and wired.
  - Gate key: `consumer_pricing_display_approved`.

## 3. VAT posture: unregistered, no reverse-charge (D2)

- [ ] **Remove reverse-charge wording** from Terms section 11 and from invoice
  config; replace with non-VAT-registered small-undertaking wording (no VAT line,
  no VAT number, no reverse-charge note). Exact document note per customer class
  is accountant-confirmed.
  - Files: `apps/web/content/legal/terms.md` (section 11) and the frozen snapshot
    under `apps/web/content/legal/_versions/`; invoice config.
  - Check: no invoice or Terms string asserts reverse charge; Terms re-hash done.
- [ ] **Re-roll the Terms version hash** after the section 11 edit; `terms_approved`
  re-closes until re-approved (bind the key to the new hash).
- [ ] **Tax posture approval by the management board**
  (`tax_policies.management_board_approved`), accountant review recorded as
  evidence — not a separate accountant sign-off.
- [ ] **Record a future registration trigger** (revenue/volume) agreed with the
  accountant, so "stay unregistered" is bounded, not permanent by default.

## 4. Launch discipline (D3)

- [ ] **Do not enable live mode / record `stripe_prod_verified`** until: ≥2 real
  artists actively using the free product, 4 weeks of reliable Plausible data, no
  critical bugs in the last 14 days (`docs/business-model.md` §9).
- [ ] If the gate is intentionally re-baselined, **record the new criteria in
  `docs/business-model.md`** rather than letting it drift.

## 5. Consistency sweep

- [ ] Grep the repo and `docs/` for "reverse charge" / "reverse-charge" and
  "business-use declaration"; ensure every remaining live-path reference is either
  removed or explicitly marked as a deferred future-tier item.
- [ ] Confirm the inline `UPDATE 2026-07-24` markers in
  `b2b-signoff-package.md`, `counsel-decision-pack.md`, and `eu-billing-posture.md`
  match the implemented behavior once these items land.

---

## Deferred (not part of v1 — do not build now)

- Business-use declaration + conflicting-signal/manual-review routing (returns
  with an explicit B2B/studio tier).
- VAT registration / OSS (revisit at the D2 trigger).
- Studio tier and multi-tenancy (per `business-model.md` phases).

## Cross-reference

`plus-launch-strategy-decisions.md` (the decisions) ·
`billing-decision-pack.md` (gate groups, schema) ·
`counsel-decision-pack.md` (C1–C10 with 2026-07-24 notes) ·
`b2b-signoff-package.md` (per-key notes) · `business-model.md` (phase gate).
