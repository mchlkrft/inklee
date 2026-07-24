# B2B billing sign-off package (Inklee Plus)

**For:** the management board, legal counsel, and the accountant.
**From:** engineering. **Date:** 2026-07-23.
**Purpose:** everything needed to sign off the remaining business (B2B) launch gate
keys, and exactly how each sign-off is recorded.

Live billing is **OFF** and stays off until the full B2B key set is recorded AND
a live Stripe Price exists AND the deployment runs in live mode (prod always
does). Recording any single key opens nothing on its own.

> **STRATEGY UPDATE — 2026-07-24 (see `plus-launch-strategy-decisions.md`).**
> Launch posture changed from B2B-only to **consumer-first** (decision D1), and
> Inklee stays **VAT-unregistered with no reverse-charge wording** (D2). Effect on
> this package: the **launch gate is now the b2c set**, not the b2b set; key 2
> (`business_declaration_approved`) is **deferred out of v1**; and the
> reverse-charge wording in keys 1 and 3 is **replaced** with non-VAT-registered
> wording. Per-key notes below; original text kept for history. Concrete steps in
> `plus-launch-followup.md`.

## Gate state (2026-07-23)

| Group | Recorded | Open |
|---|---|---|
| technical | 4/4 (schema_deployed, webhook_tested, reconciliation_tested, isolation_tested) | none |
| b2b | tax_policy_approved (v2, outside-VAT), refund_handling_tested, terms_approved, business_declaration_approved | invoice_config_approved, pricing_display_approved, stripe_prod_verified |
| b2c | consumer_classification_approved | (not needed for B2B; consumer launch is separately gated) |

> **b2b is 4/7.** Three remain: `invoice_config_approved` (accountant),
> `pricing_display_approved` (founder + accountant), `stripe_prod_verified`
> (founder + a live Price). See the "Correction applied" note below for the
> outside-VAT change and what it still gates.

> **UPDATE 2026-07-24:** the **launch gate is now the b2c group** (D1). The b2b
> keys remain valid for a later explicit business/studio tier but are no longer
> the path to first live charge.

Recorders live in `scripts/billing/`. The generic one is
`record-approval.cjs` (edit CONFIG, dry-run, then `--apply`). Each key below
gives the exact CONFIG to close it.

## Correction applied (2026-07-24)

Acting on counsel's cross-key dependency note, the reverse-charge treatment was
replaced with **outside-VAT** wording, because an unregistered EE seller cannot
apply reverse charge:

- **Terms section 11** "Business buyers and VAT" now states Inklee is a small
  business not currently registered for VAT in Estonia, so its supplies are
  outside the scope of Estonian VAT and no Estonian VAT is added. Terms version
  bumped to `2026-07-24`, hash
  `61c30c65ec3b25270acaf49cf8a95cfa5e08256abd7a7b379f6e5ae5877a5406`.
- **Tax posture** `eu_business_vat` changed from `reverse_charge` to
  `place_of_supply_outside_estonia`; posture re-recorded as `ee-unregistered-v2`.

On that corrected basis, and on counsel's sign-off that the Terms drafting
"stands either way" (below), **`terms_approved` (bound to the corrected hash) and
`business_declaration_approved` are now RECORDED.** Two follow-ups remain:
1. Counsel to confirm the exact corrected text (`2026-07-24` / `61c30c65...`) as a
   formality; the outside-VAT wording implements counsel's own analysis.
2. The accountant to confirm the C7/A2 registration obligation and whether a
   limited VAT-ID is needed; this still gates `invoice_config_approved` and live
   billing. If registration is required, the reverse-charge wording returns and
   both the Terms and the tax posture roll again.

---

## 1. `terms_approved` — OWNER: legal counsel

> **UPDATE 2026-07-24 (D2 + D1):** remove the section 11 statement that
> cross-border EU B2B supplies are reverse-charged; replace with non-VAT-registered
> wording (e.g. "VAT not applied — supplier is a non-registered small undertaking,
> Estonia"). This re-rolls the version hash below and re-closes `terms_approved`
> until re-approved. Because v1 sells to consumers (D1), the consumer 14-day
> withdrawal terms are now **live launch terms**, not forward-only.

**Artifact:** Terms of Service, version `2026-07-23`.
**Version hash (bind to this):**
`72fa7e113ed953ee1113f1f5f7121a9c3c646b9ebf326a4d5c30ee12ca0720c7`

**What changed:** section 11 ("Future paid plans" placeholder) was replaced with
real "Inklee Plus subscription" terms carrying the C5 pre-contract disclosure
set: what you get; price and billing period (price shown before payment,
VAT-inclusive for consumers); automatic renewal at the then-current price;
how to cancel (in-app, no support contact, as easy as subscribing); Stripe as
processor and the payment authorisation; ordering with an obligation to pay;
business buyers and VAT (cross-border EU reverse-charge per C7); the consumer
14-day withdrawal right with a proportionate amount on withdrawal (per C1);
invoice and records retention with the C8 invoice-identity carve-out.

**Where to review:** the live `/terms` page, or `apps/web/content/legal/terms.md`
(section 11). The hash is over the frozen snapshot at
`apps/web/content/legal/_versions/2026-07-23/terms.md`.

**What counsel confirms:** the drafted section 11 wording is acceptable as the
B2B Customer Terms (and forward consumer variant), and the billing privacy notice
per C2 is in place. Any edit re-rolls the hash and this key must then bind to the
new hash.

**RECORDED 2026-07-24**, bound to the corrected outside-VAT Terms hash
`61c30c65ec3b25270acaf49cf8a95cfa5e08256abd7a7b379f6e5ae5877a5406` (version
`2026-07-24`), per counsel's "drafting stands either way" sign-off. See
"Correction applied" above. Counsel's explicit confirmation of the corrected
text is a recommended formality.

---

## 2. `business_declaration_approved` — OWNER: legal counsel

> **UPDATE 2026-07-24 (D1): DEFERRED out of the v1 launch gate.** v1 sells to
> everyone on the consumer path with **no business-use declaration**; a VAT-ID
> becomes an optional invoice field, not a gate. This key and its
> conflicting-signal / manual-review machinery return only with a future explicit
> B2B/studio tier. Not required for launch.

**Control:** a separate, unchecked, required checkbox at pre-checkout on
`/settings/plan`, gating an "Order with obligation to pay" button (disabled until
ticked). Version `c3-business-declaration-2026-07-23`.

**Exact wording (counsel C3, verbatim):**
> "I confirm that I am purchasing Inklee Plus for my trade, business, craft or
> profession, and not as a consumer."

**Mechanism (matches C3):** the checkbox is not pre-selected and is not bundled
with Terms acceptance. On order it is recorded to `billing_consent_records` as a
`business_use_declaration` row (with a separate `terms_acceptance` row bound to
the Terms hash), written before any Stripe object is created. It is stored as
**evidence**, not treated as absolute truth.

**Known deferral to flag:** conflicting-evidence routing to manual review (C3) is
not yet built, because the B2B checkout collects no signal that would conflict
with the declaration. Please confirm this is acceptable for the B2B launch, or
specify the conflicting signals to collect and the manual-review trigger.

**RECORDED 2026-07-24** (counsel APPROVED). The pre-scaling VIES condition is
tracked as an engineering to-do before scaling B2B volume; it does not block
launch.

---

## 3. `invoice_config_approved` — OWNER: accountant

> **UPDATE 2026-07-24 (D2):** drop the reverse-charge note on cross-border EU B2B
> invoices. Invoices are issued as a non-VAT-registered small-undertaking supply
> (no VAT line, no VAT number, no reverse-charge). Accountant confirms the exact
> document note per customer class; the **management board** approves the tax
> posture (`tax_policies.management_board_approved`) with accountant review
> recorded as evidence.

**What to confirm:** the subscription invoice configuration (seller identity and
registry code, VAT treatment shown per customer class, the reverse-charge note on
cross-border EU B2B invoices, currency, sequential numbering, retention). Pairs
with the recorded tax posture (`ee-unregistered-v1`) and accountant pack A1/A3.

**To record:** `record-approval.cjs` with `approval_key: "invoice_config_approved"`,
`approval_group: "b2b"`, `approved_by` (accountant), `evidence_ref`,
`APPROVED: true`, `--apply`.

---

## 4. `pricing_display_approved` — OWNER: founder + accountant

**What to confirm:** the displayed Plus price and how it is shown (VAT-inclusive
for consumers, net + reverse-charge note for EU business), on the future
`/pricing` page and at checkout. Depends on the chosen price (see key 5).

**To record:** `record-approval.cjs` with `approval_key: "pricing_display_approved"`,
`approval_group: "b2b"`, `approved_by`, `evidence_ref`, `APPROVED: true`, `--apply`.

---

## 5. `stripe_prod_verified` — OWNER: founder

**What to do:** in the LIVE Stripe dashboard, create the Plus Price with lookup
key `inklee_plus_monthly_eur_test` (or update the lookup key the code resolves),
confirm the live billing webhook endpoint + `STRIPE_BILLING_WEBHOOK_SECRET`, and
run one live checkout end to end (this doubles as G-5 for subscriptions).

**To record:** `record-approval.cjs` with `approval_key: "stripe_prod_verified"`,
`approval_group: "b2b"`, `approved_by` (founder), `evidence_ref` (the live
checkout id), `APPROVED: true`, `--apply`.

---

## Counsel sign-off (2026-07-23)

Counsel-owned keys reviewed and approved as recorded below. Keys 3–5 are
accountant/founder-owned and are not counsel determinations; the one legal
dependency touching them (invoice reverse-charge wording) is noted at the end.

### Key 1 — `terms_approved`: APPROVED
The section 11 "Inklee Plus subscription" wording is acceptable as the B2B
Customer Terms and forward consumer variant, and the billing privacy notice per
C2 is in place. The pre-contract disclosure set (C5), the automatic-renewal and
in-app cancellation terms, the obligation-to-pay ordering, the C1 withdrawal
statement, and the C8 invoice-identity retention carve-out are all correctly
reflected. Approval binds to version hash
`72fa7e113ed953ee1113f1f5f7121a9c3c646b9ebf326a4d5c30ee12ca0720c7`; any edit
re-rolls the hash and re-closes the key.

**One dependency:** section 11 states cross-border EU B2B supplies are
reverse-charged. That statement is accurate only once the invoice/registration
posture is reconciled (see "Cross-key dependency" below). The wording is
approved; its factual accuracy is gated on that reconciliation.

### Key 2 — `business_declaration_approved`: APPROVED
The mechanism is correct: a separate, unchecked, non-bundled required control
carrying the verbatim C3 wording, recorded to `billing_consent_records` as
evidence (not absolute truth) before any Stripe object is created, with a
distinct `terms_acceptance` row bound to the Terms hash.

**On the deferral:** operating without conflicting-evidence routing to manual
review is **acceptable for the B2B launch**, subject to one condition. The claim
that B2B checkout "collects no signal that would conflict with the declaration"
is not quite exact: the VAT-ID and VIES-verification outcome (collected per C6)
is precisely such a signal. A buyer who declares business use but cannot supply
a VAT-ID that VIES validates is a weak-but-real conflict under the CRD's
predominant-purpose test, which bars reliance on a declaration the trader has
reason to doubt. **Condition:** wire the VIES outcome as the first
conflicting-signal trigger — a failed or absent verification routes the order to
manual review rather than silently accepting the business declaration — before
scaling B2B volume. Absence of a VAT-ID alone is not conclusive (sub-threshold
businesses need none) and does not auto-deny; it flags for review.

### Cross-key dependency — invoice reverse-charge vs `ee-unregistered-v1`
Keys 1 and 3 assert a reverse-charge treatment on cross-border EU B2B invoices.
Reverse charge presupposes Inklee is a VAT-identified taxable person that states
a VAT number on the invoice; an `ee-unregistered` seller generally cannot, and
its supplies fall outside VAT rather than being reverse-charged. Cross-border
B2B service supplies do **not** count toward Estonia's €40,000 domestic
registration threshold, so high B2B turnover does not by itself force
registration — but whether Inklee must nonetheless obtain a (limited) VAT-ID to
apply the reverse charge and file the recapitulative/VIES report is the open
C7/A2 registration-obligation question. **This must be locked with the
accountant before `invoice_config_approved` and live billing**, so the Terms and
invoice wording either (a) reflect a registered/VAT-identified Inklee applying
reverse charge, or (b) drop the reverse-charge note in favour of correct
outside-VAT wording. Counsel approval of the Terms *drafting* stands either way;
this reconciliation fixes which wording is factually correct.

### References
Estonian VAT registration threshold and cross-border B2B place-of-supply scope
(<https://1office.co/blog/vat-registration-in-estonia-guide/>,
<https://arvello.ee/en/guides/estonian-vat-2026>); reverse-charge mechanism for
intra-EU B2B services; and `docs/legal/counsel-decision-pack.md` C1/C3/C5/C6/C7/C8.

---

## After all five are recorded

Run `node scripts/billing/gate-status.cjs` to confirm b2b is 7/7. Live billing
then requires only that a live Price exists and the deployment is in live mode
(prod is). Do a final G-5 live-money subscription test before announcing.

## Cross-reference

`docs/legal/counsel-decision-pack.md` (C1-C10 answers) ·
`docs/legal/accountant-decision-pack.md` ·
`docs/legal/billing-decision-pack.md` ·
`docs/legal/vat-and-oss-architecture.md`. The consumer (B2C) gate additionally
needs the Article 11a withdrawal function + proration and the remaining b2c keys;
it is out of scope for this B2B package.
