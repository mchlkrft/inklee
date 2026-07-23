# EU consumer withdrawal flow

**Status:** Engineering design and repository audit. DRAFT for founder review, 2026-07-23. Not implementation, not legal advice. Every consumer-facing string below is DRAFT that requires qualified counsel approval. Nothing here is legal approval; it is an engineer proposing an architecture and flagging what counsel must decide.

**Constraints honoured:** no live billing, no VAT registration, no production pricing change, no legal copy published. The consumer withdrawal flow is BUILT but stays behind the activation gate's b2c group until counsel clears the wording and the tests pass.

**Label key:** `CONFIRMED LEGAL REQUIREMENT` (counsel must confirm) / `CURRENT IMPLEMENTATION` / `RECOMMENDED IMPLEMENTATION` / `FOUNDER DECISION` / `ACCOUNTANT DECISION` / `LEGAL-COUNSEL DECISION` / `UNRESOLVED QUESTION`. Sentence case, no em-dashes.

Covers P3 (immediate-performance consent), P6 (the withdrawal function, distinct from cancellation), P7 (proration and credit notes), P8 (product state after withdrawal), P9 (abuse prevention). Companions: `docs/product/billing-customer-classification.md`, `docs/legal/eu-billing-posture.md`, `docs/legal/vat-and-oss-architecture.md`, `docs/product/billing-activation-checklist.md`.

---

## 0. The pivotal legal question (surfaced, not assumed)

`LEGAL-COUNSEL DECISION` The single most important legal question this flow depends on: is Inklee Plus a "service" or "digital content" under the Consumer Rights Directive as implemented in Estonia. That determines whether, and how, the 14-day withdrawal right can be lost after performance begins, and therefore whether `lost_where_legally_valid` is ever a reachable state. This document does NOT assume an answer. It builds the machinery for a service-with-immediate-performance reading (the most common for an ongoing subscription) and defaults `lost_where_legally_valid` to never-reached until counsel defines it. **14-day withdrawal is law; there is no waiver.**

---

## 1. Current state (audit)

`CURRENT IMPLEMENTATION` There is no subscription billing, cancellation, refund, proration, or credit-note logic anywhere; this is greenfield. The only refund primitive is the deposit `refundDepositCore` (`apps/web/src/lib/server/bookings.ts`), which uses `reverse_transfer: true` + `refund_application_fee: true` to pull money back from the artist's Connect balance. **That is the opposite money direction to a subscription refund and must not be reused for mechanics, only for its engineering safeguards** (an idempotency key, audit-derived state, a 23505 unique-index guard, and never swallowing an error). A separate client-deposit withdrawal exemption exists (`packages/shared/src/deposit-policy.ts`) and is out of scope here. Reusable substrate: the Stage 2 entitlement downgrade plus `restoreGrandfatherPackage` (`packages/shared/src/entitlements.ts` plus the 0105 grandfather columns) is exactly the post-withdrawal downgrade path.

**A subscription refund is `stripe.refunds.create` on Inklee's OWN charge, with NO `reverse_transfer` and NO `refund_application_fee`** (the artist is paying Inklee, not the reverse). No withdrawal ever routes through `refundDepositCore`.

---

## 2. The immediate-performance consent (P3)

`CONFIRMED LEGAL REQUIREMENT` (counsel confirms the wording and mechanism) Do NOT use a blanket statement that the customer loses all withdrawal rights immediately when access begins. Inklee is an ongoing subscription service, so implement an express request for immediate performance through a separate, unchecked control, not preselected and not combined with general Terms acceptance.

`LEGAL-COUNSEL DECISION` DRAFT (do not ship as-is): "I expressly request that Inklee begin providing the subscription service immediately, before the 14-day withdrawal period has ended. I understand that, if I withdraw during this period, I may be required to pay a proportionate amount for the service provided before my withdrawal."

`RECOMMENDED IMPLEMENTATION` Store, per contract, in the single append-only consent-evidence table (review F3, referenced by id from the contract): the consent text version, the consent timestamp, the subscription service start, the withdrawal-period start, the withdrawal deadline, the immediate-performance request timestamp, the confirmation delivery status, whether withdrawal is currently available, and the legal or policy reason for the state.

`FOUNDER DECISION` (review F4, do not hard-assert in a test) If the immediate-performance box is left unchecked, either (a) hold activation until day 15, or (b) activate the service but treat an in-period withdrawal as a full refund with no proportionate deduction. Both are legally defensible (no proportionate charge without the express request, P3). Record the founder decision, then align the flow and the test (the test matrix currently pins one branch; it must test both until the decision lands).

---

## 3. The withdrawal function (P6), distinct from cancellation

`CONFIRMED LEGAL REQUIREMENT` (counsel confirms the flow satisfies the duty) A consumer withdrawal function separate from subscription cancellation. The eligible consumer must submit an online withdrawal statement without contacting support manually. The function:

1. Confirms the relevant contract.
2. Displays the withdrawal deadline.
3. Explains the difference between withdrawal and cancellation.
4. Accepts an unequivocal withdrawal statement.
5. Records the exact receipt time.
6. Issues an immediate durable acknowledgement.
7. Creates an internal refund and tax-adjustment case.
8. Revokes or schedules removal of paid entitlements per the approved policy.
9. Preserves the account and data.
10. Records completion and refund evidence.

`RECOMMENDED IMPLEMENTATION` A separate server core (`withdrawSubscriptionCore`) and a separate route, never sharing the cancellation path. A `withdrawal_cases` table (service-role only) holds the case machine; the consent and evidence live in the consent-evidence table referenced by id. National-law wording is content-versioned so it changes without a schema change. **No dark patterns, no forced support contact, no retention prompts, no demand for a reason.** Ordinary cancellation (end-of-period, no proration unless policy says so) is a distinct path and never conflated with withdrawal; a cancellation never affects the withdrawal right.

---

## 4. Proration and credit notes (P7)

`CONFIRMED LEGAL REQUIREMENT` (counsel confirms the method; do NOT activate for live consumers until then) Configurable and policy-versioned. Default time-based: the service begins when paid access is granted; the used period ends when the withdrawal statement is received; compute the proportion of the current service period already supplied; never charge more than the amount paid for that period; refund the remainder; preserve the original tax rate and jurisdiction in the credit calculation.

`RECOMMENDED IMPLEMENTATION` Store, per withdrawal: original gross, net, VAT, and VAT rate; the service period; the used period; the retained proportion; the refund amount; the tax correction; the Stripe refund id; the credit-note id; and the calculation policy version. The credit note is a NEW immutable tax snapshot (`kind='credit_note'`) referencing the original and preserving its rate and jurisdiction (`vat-and-oss-architecture.md` section 4.2). The refund is `stripe.refunds.create` on Inklee's own charge, idempotency-keyed, converging to a target, never a silent success. `ACCOUNTANT DECISION` the proration tax-adjustment method and the credit-note format. Ordinary cancellation is not a withdrawal and does not trigger proration.

---

## 5. Product state after withdrawal (P8)

`CONFIRMED LEGAL REQUIREMENT` (counsel confirms) After a valid withdrawal: revoke Plus or Studio promptly; do NOT delete the account, bookings, clients, transactions, or configuration; preserve access to legally or operationally necessary data; make paid-only configuration read-only where appropriate; prevent creation of additional paid-only records; allow active booking and payment obligations involving third parties to complete safely; do NOT automatically refund tattoo deposits, client payments, merchandise purchases, or other separate transactions; and never use access to the user's existing data as leverage against withdrawal.

`RECOMMENDED IMPLEMENTATION` Reuse the Stage 2 `paid -> free` downgrade verbatim, including `restoreGrandfatherPackage` when the account is a `legacy_free_v1` member (so a grandfathered consumer who bought Plus and withdrew returns to their grandfather state, not bare Free). Downgrade behavior is per entitlement (the Stage 2 per-feature rules: over-cap items read-only and kept, custom-template body kept sending read-only, existing fields stay on the public form). A withdrawal never touches deposits or client money (those are the artist's separate merchant-of-record transactions).

---

## 6. Abuse prevention (P9)

`CONFIRMED LEGAL REQUIREMENT` (counsel confirms the boundary) The statutory withdrawal right must remain available where applicable. Anti-abuse controls may include: one promotional trial and one introductory discount per billing identity; payment-method fingerprint and business-identity matching; repeated-withdrawal and chargeback pattern detection; risk scoring; manual review of future purchases; removal from future discretionary promotions; blocking repurchase while a refund or dispute remains unresolved; and explicit admin reasoning for any future contracting restriction.

Do NOT: charge a withdrawal penalty; delay the statutory withdrawal flow; force support contact; demand a reason; delete data as punishment; automatically deny the current withdrawal because of earlier withdrawals; or represent a promotional restriction as removal of statutory rights.

`RECOMMENDED IMPLEMENTATION` Create auditable **risk events** (a `risk_events` table with a type, subject, evidence, and admin reasoning), never scattered boolean flags. A risk event may restrict a FUTURE discretionary promotion or repurchase; it never gates the CURRENT statutory withdrawal. The current withdrawal is always honoured in full.

---

## 7. Schema and files (authored, not applied)

`RECOMMENDED IMPLEMENTATION` In the coordinated migration pass (review F2, sequential numbers after 0106, one owner per file): `withdrawal_cases` (the case machine, service-role only); `risk_events` (append-only, service-role only); the credit-note snapshot rows live on `transaction_tax_snapshots` (the VAT workstream). The per-contract withdrawal fields (axis D withdrawal status, the deadlines) live here, not on the per-artist classification profile (the review-confirmed placement). New server core `withdrawSubscriptionCore`, a route, the proration calculator (pure, policy-versioned), the durable acknowledgement sender. Reuse the Stage 2 downgrade and `restoreGrandfatherPackage`. Do not touch the deposit refund path.

---

## 8. Decisions required

- `FOUNDER DECISION` the missing-immediate-performance-consent behavior (hold activation vs activate-with-full-refund, section 2); whether ordinary cancellation offers any goodwill proration (default no); the risk-event thresholds.
- `ACCOUNTANT DECISION` the tax adjustment on a mid-period withdrawal and the credit-note format; whether the going-in unregistered posture changes the credit calculation.
- `LEGAL-COUNSEL DECISION` the pivotal service-vs-digital-content classification (section 0); the DRAFT immediate-performance and withdrawal wording, the model withdrawal information, and confirmation that no blanket rights-waiver appears anywhere; the default time-based proration method and any Estonian-implementation constraints; whether `lost_where_legally_valid` is ever reachable and under what conditions; the interaction with the deposit-context forfeiture question (kept distinct); data retention for withdrawal and refund records vs the account-deletion promise.

---

## 9. Risks

Conflating cancellation with withdrawal (mitigated by a separate core, route, and case machine). Reusing the deposit refund mechanics (mitigated by an explicit "no reverse_transfer, no refund_application_fee" rule and never routing through `refundDepositCore`). A dark pattern or a forced-support step breaching consumer law (mitigated by the no-dark-patterns rules and the online self-service function). Auto-denying a repeat withdrawal (forbidden; the current statutory withdrawal is always honoured). Deleting data as punishment (forbidden; account and data preserved). Activating live consumer proration before counsel confirms the method (mitigated by the b2c activation-gate group keeping consumer-live closed until `refund_proration_tested` and `consumer_withdrawal_copy_approved` are recorded).

**Confidence:** high on the audit (greenfield; the deposit refund is the opposite direction; the Stage 2 downgrade is the reuse) and on the flow shape. Deliberately zero on the legal determinations, which the machinery encodes but never makes; the pivotal service-vs-digital-content question is surfaced for counsel, not assumed.
