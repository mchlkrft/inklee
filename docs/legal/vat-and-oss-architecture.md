# VAT and OSS architecture

**Status:** Engineering design and repository audit. DRAFT for founder review, 2026-07-23. Not implementation, not tax or legal advice. Every tax or legal characterization is flagged for the accountant or counsel to confirm. The engine encodes their answers; it never guesses them.

**Constraints honoured:** no live billing, no VAT registration, no Stripe Tax enabled, no production pricing change, no legal copy finalized.

**Label key:** `CONFIRMED LEGAL REQUIREMENT` (as an engineering assumption counsel must confirm) / `CURRENT IMPLEMENTATION` / `RECOMMENDED IMPLEMENTATION` / `FOUNDER DECISION` / `ACCOUNTANT DECISION` / `LEGAL-COUNSEL DECISION` / `UNRESOLVED QUESTION`. Sentence case, no em-dashes.

Covers posture P11 (effective-dated tax policy, immutable per-transaction tax snapshot, Stripe Tax as calculation only) and P12 (pricing `tax_behavior`). Companions: `docs/product/billing-customer-classification.md` (owns VIES and the four axes), `docs/legal/eu-billing-posture.md`, `docs/legal/eu-consumer-withdrawal-flow.md`, `docs/product/billing-activation-checklist.md`.

---

## 1. Purpose and boundary

This workstream builds two durable structures and the code that maintains them:

1. An **effective-dated tax-policy config** (`tax_policies`): a founder-and-accountant-controlled, versioned declaration of Inklee's seller-side VAT posture over time, plus the rule set that derives a per-transaction treatment.
2. An **immutable per-transaction tax snapshot** (`transaction_tax_snapshots`): a write-once record, per settled transaction, of every tax-relevant fact as it stood at settlement, so a later rate, address, or policy change can never rewrite tax history.

It does not own customer classification and VIES (that is `billing-customer-classification.md`), the subscription lifecycle, pricing display copy, or the withdrawal case machinery. It consumes the classification result and produces the snapshot the refund/credit-note and accountant-export paths read.

---

## 2. Current state (audit)

`CURRENT IMPLEMENTATION` There is no tax model of any kind. A case-insensitive scan for `vat|oss|vies|tax_behavior|stripe tax|reverse_charge|credit_note` across `apps/web/src` and `packages/shared/src` returns zero source hits. Stripe is deposits-only (three env vars, one client, no Stripe Tax). The deposit fee (`platform-fee.ts`, flat 3%) carries no VAT logic; the artist is merchant of record for the deposit and Inklee never touches VAT on it. Inklee OU is below the VAT threshold and not registered (`docs/payment-flow-for-counsel.md` section 1; `docs/business-model.md` section 6). The only VAT discussion in the docs is open questions, not a model. Migration 0105 (authored) adds billing columns but no tax field; head is 0104; goods `orders` is reserved as 0106; tax tables land at 0107 and later in one coordinated authoring pass. `entitlements.ts` holds no price or tax field (correct, keep it that way).

**A precedent to mirror.** `booking_requests.deposit_policy_snapshot` (migration 0043) is a write-once policy snapshot frozen at payment and never rewritten by the webhook, which is idempotent and converges to a target. The tax snapshot reuses exactly this discipline. **Net: this is greenfield, the safe case; we design the immutable invariant in from the first row.**

---

## 3. Legal framing (counsel/accountant items, not engineering facts)

`CONFIRMED LEGAL REQUIREMENT` (counsel must confirm) An EU seller charging consumers across member states generally must determine the correct VAT treatment per transaction, issue a compliant document, and account for the VAT to the right jurisdiction, potentially via OSS. The engineering consequence, independent of the legal detail, is that we must be able to reconstruct immutably what treatment we applied to every transaction and why. That reconstructability is what this workstream guarantees. The architecture is deliberately posture-agnostic so the answer is a config value, not a code change.

- `ACCOUNTANT DECISION` (co-owned with counsel on the legal obligation, review F8): whether and when Inklee registers for VAT in Estonia and for OSS; the correct treatment per customer class; the rate source; whether the going-in posture (not registered) means "no VAT charged" vs "out of scope" on documents; and sign-off on the single active policy before go-live.
- `LEGAL-COUNSEL DECISION`: invoice/receipt/credit-note content and the reverse-charge legend; how VIES downtime may be treated; the interaction with the consumer-withdrawal disclosures.

---

## 4. Design

### 4.1 The effective-dated tax-policy config (`tax_policies`)

`RECOMMENDED IMPLEMENTATION` A versioned, effective-dated table. Exactly one policy is active at any instant, chosen by effective date, and none is usable for live billing until it carries an accountant approval stamp. A row represents every posture P11 requires: non-VAT-registered (default, resolves every class to no-VAT with a not-registered note), EE-domestic, OSS-destination, EU-reverse-charge (only with a VIES-valid number in another member state), non-EU, and manual-review (any combination the rules cannot resolve confidently, which blocks a live consumer charge rather than guessing).

Design points: a posture change is a **new row** with a new `effective_from`, never an edit, so a historical snapshot keeps pointing at the policy version that was active when it was written. Approval is a hard gate stored on the row (`approved_by`, `approved_at`, `accountant_ref` null until the accountant signs off); the activation gate reads "is there an active row, approved, effective now". The rule set is data (`treatment_rules` JSON), not code, so a rate correction or national nuance is a new version, not a deploy; no rate or posture is hardcoded. For OSS destinations the **rate** comes from the calculator at transaction time (the policy declares that OSS applies and which calculator is authoritative), so a 27-jurisdiction rate table never goes stale in our config.

**Review reconciliation F7 (append-only enforced, not conventional).** Apply the same enforcement discipline the snapshot uses: block UPDATE of a policy row's `treatment_rules`, `approved_by/at`, and `effective_from` once it is approved or effective (a trigger raises); any change is a new row. This makes "a posture change is a new row" a database invariant.

### 4.2 The immutable per-transaction tax snapshot (`transaction_tax_snapshots`)

`RECOMMENDED IMPLEMENTATION` One row per settled billing transaction (an invoice paid, a refund, a credit note), written once and never updated. It copies values in rather than referencing mutable rows, so it survives later rate, address, and policy changes. Fields (all copied at settlement): seller state (`seller_vat_registered`, `seller_vat_number`, `seller_country`); customer state copied from the classification result (country, billing address, VAT number submitted and normalized, VIES result and provider ref and checked-at, location evidence, contract customer type, VAT customer status); derived treatment stored not implicit (`tax_treatment`, jurisdiction, rate, code, `reverse_charge_applied`, `oss_included`); amounts (`currency`, `net_cents`, `vat_cents`, `gross_cents`, `price_tax_behavior`); provenance (`tax_policy_id` + version, `calc_provider`, `stripe_tax_calculation_ref`, `stripe_object_type` + id, `subscription_id`, `artist_id`); correction linkage (`corrects_snapshot_id`, `kind` = charge | refund | credit_note); and immutability markers (`created_at`, a `content_hash` over the tax-relevant fields).

Written at settlement in the new subscription webhook (`invoice.paid`, and refund/credit-note events for corrections), service-role, idempotency-guarded (a unique index on `(stripe_object_type, stripe_object_id, kind)`; a redelivery no-ops; there is no update branch). **Immutability, three layers:** service-role-only RLS (zero policies), a `BEFORE UPDATE OR DELETE` trigger that raises even for the service role, and the `content_hash` the accountant export re-verifies. Corrections never mutate: a refund or withdrawal writes a NEW snapshot with `kind='refund'` or `'credit_note'`, negative amounts, `corrects_snapshot_id` set, and the original `tax_rate` and `tax_jurisdiction` preserved (P7). The customer's tax history is an append-only ledger.

### 4.3 Stripe Tax for calculation only

`RECOMMENDED IMPLEMENTATION` Use Stripe Tax purely as a rate and amount calculator; keep Inklee's own snapshot plus policy as the record of decision. The engine calls Stripe Tax to obtain the rate and VAT amount for a transaction whose **treatment the policy already decided**, stores the calculation reference as evidence, and never reads classification, registration posture, or withdrawal treatment back out of Stripe as gospel (P11 is explicit). Why it matters: Stripe Tax will compute a number even if our registration or classification is wrong; if we treated Stripe's output as the classification, a Stripe default could silently become our filed position. If Stripe Tax is unavailable or disagrees with our policy decision, the transaction resolves to `manual-review` and does not auto-charge a live consumer (the gate prefers a blocked sale over a wrong tax position). The server-authoritative quote (P4/P12) carries the policy-derived treatment plus the calculator's rate; the display and the Stripe amount both come from it; VAT is never computed only client-side.

### 4.4 Pricing `tax_behavior`, fixed at Price creation (P12)

`CONFIRMED` (Stripe platform fact) A Stripe Price has a `tax_behavior` of inclusive, exclusive, or unspecified, and it **cannot be changed after the Price is created**. Enabling Stripe Tax later against `unspecified` Prices forces creating new Prices and migrating subscribers.

`RECOMMENDED IMPLEMENTATION` Decide `tax_behavior` deliberately at Price creation, before any live billing, as a direct consequence of the pricing-display decision. Do not create Prices with `unspecified`. The chosen behavior is recorded in the pricing config and copied into every snapshot (`price_tax_behavior`) so the net/VAT/gross split is self-describing. Do NOT couple the entitlement package identifier to a tax-inclusive price; the entitlement key (`plus`) is stable, while the Price id, currency, tax behavior, and marketing display price live in the pricing config and can change without re-gating a feature. `FOUNDER DECISION` (with accountant input) the display convention (consumer VAT-inclusive, base plus country VAT, or B2B-net vs B2C-gross), which then fixes `tax_behavior`. Do not assume "EUR 3/mo" is net or gross. **This decision must precede the first live Price because it is expensive to reverse.**

### 4.5 Interaction with the classification axes

`RECOMMENDED IMPLEMENTATION` Tax treatment is a pure function of inputs owned elsewhere, and the result is stored:

```
tax_treatment = deriveTreatment(vat_customer_status, customer_country, contract_customer_type, active_tax_policy)
```

The four axes stay separate fields, never derived from tier or role (P1). The engine reads the first two axes plus country to derive the third and writes it into the snapshot. A business with no VAT number resolves to `business_without_vat`, a normal taxable sale, NOT zero-rated; the engine never infers "business => reverse charge" (reverse charge requires a VIES-valid number in another member state). `unresolved` on any input the policy cannot safely resolve becomes `manual-review` and blocks the live consumer charge. The derivation is a deterministic, unit-testable pure function.

### 4.6 The accountant export

`RECOMMENDED IMPLEMENTATION` A read-only admin export over `transaction_tax_snapshots` for a period, grouped by treatment / jurisdiction / code / rate, summing net/VAT/gross with charges and negative refunds netted so it reconciles to what was collected and returned; line-level detail with the Stripe object id, calc ref, policy version, and re-verified `content_hash`; CSV and JSON, generated from immutable rows, paged (PostgREST caps a response near 1000 rows), admin-only, service-role read, audit-logged. `ACCOUNTANT DECISION` the exact columns and grouping the filing needs. `LEGAL-COUNSEL DECISION` whether the export doubles as a statutory record or a separate invoice archive is required.

---

## 5. Schema (authored, not applied; numbers assigned in the coordinated pass)

`RECOMMENDED IMPLEMENTATION` Both tables service-role-only (RLS enabled, zero policies), like `account_overrides` (0045), so no client grants or seed mirror. `tax_policies` (version label, seller country and VAT-registered flag and number, OSS flag, calc provider, `treatment_rules` jsonb, `effective_from`/`effective_to`, `is_current` with a partial unique index, `approved_by`/`approved_at`/`accountant_ref`) with the review-F7 append-only trigger on approved/effective rows. `transaction_tax_snapshots` (the section 4.2 fields) with the `(stripe_object_type, stripe_object_id, kind)` unique index and the `BEFORE UPDATE OR DELETE` raise trigger. New pure modules `packages/shared/src/tax/policy.ts` (`deriveTreatment` plus types, DB-free) and `tax/snapshot.ts` (builder plus `content_hash`); a service module `apps/web/src/lib/tax/tax-server.ts`; the snapshot writer called from the new subscription webhook; the export route. Do not touch `platform-fee.ts`, the deposit webhook, or the shared `stripe.ts` client (enabling Stripe Tax must not ride the deposit client, HIGH-3). The deposit-fee VAT questions (`payment-flow-for-counsel.md` Q1/Q8) are a separate counsel track, out of scope here.

---

## 6. Decisions required

- `FOUNDER DECISION` the pricing display convention (fixes `tax_behavior` before the first live Price); confirm Stripe Tax as the calculator (accepting the ~0.5%/transaction cost); confirm an approved active policy is a hard gate item; the coordinated migration numbers.
- `ACCOUNTANT DECISION` the registration posture and trigger; the active tax policy content and its sign-off; the correct treatment per class while unregistered and the document note; whether Stripe Tax rates are acceptable for OSS; the export grouping and columns.
- `LEGAL-COUNSEL DECISION` invoice/receipt/credit-note content and the reverse-charge legend; VIES-downtime treatment on a live sale (defaults to manual-review/block; counsel confirms any provisional treatment, which becomes a policy rule not code); whether the snapshot plus export satisfies record-keeping or a separate immutable invoice archive is required; the interaction of the pre-payment tax disclosure with the withdrawal disclosures; the VAT-registration/OSS legal obligation (co-owned with the accountant, review F8).

---

## 7. Risks

Price `tax_behavior` is irreversible (mitigated by making the display decision a blocker before the first live Price). Treating Stripe Tax as classification (mitigated by storing our own policy version plus treatment and using Stripe only for the number). Snapshot mutation (mitigated by the append-only trigger plus service-role-only plus `content_hash`). A silent wrong treatment while unregistered (mitigated by an explicit, accountant-approved "no VAT, not registered" policy, and the gate refusing an absent or unapproved policy). Deposit-vs-subscription tax conflation (kept separate; this engine is subscription-only). Coupling entitlement to price (must not happen; `entitlements.ts` stays price-free).

**Confidence:** high on the audit and the architecture shape (effective-dated policy plus append-only snapshot plus calculator-not-source-of-truth, reusing the deposit-snapshot freeze and the converge-to-target webhook). Deliberately zero on the legal and tax determinations, which the engine encodes but never makes.
