# Plus launch: open decisions handoff

**Written 2026-07-31.** Code is done through Stage 2. Stage 0 correctness
fixes are complete. Everything below is what blocks Stages 3-6 and the launch
itself. Each item names the person who must act and what is waiting on them.

Sequencing SoT: `plus-remaining-work-plan.md`. Content SoT for each item is
cited inline.

---

## Critical dependency chain

```
A1 (price display) -> C2 (price-on-button) -> C3 (withdrawal copy) -> C1 (final sign-off) -> F12 (launch key)
A3 (fee V2 approval) -> fee differentiation (savings dashboard shows real numbers)
F8 (G-5 live test) -> pricing model validation (zero live transactions exist)
```

---

## Summary

| Owner      | Count | Blocking launch? |
|------------|------:|------------------|
| Founder    |    14 | 10 yes, 4 soft   |
| Accountant |     5 | 4 yes, 1 shared  |
| Counsel    |     4 | 3 yes, 1 soft    |
| Cross      |     4 | 3 yes, 1 no      |

---

## Founder decisions (14)

### F1: cover image: Free or Plus?

The spec says cover image is Plus-only, but 3 of 19 production artists already
have one. Stripping it breaks the grandfathering rule. Either make cover image
free for all, or grandfather the existing three and gate new ones behind Plus.

- **Blocks:** Terms wording for the booking-form customization boundary.
- **Current state:** built as grandfathered (Free keeps it via `freeTierView`),
  pending ruling.
- **Source:** `plus-commercial-packages.md` section 7;
  `plus-capability-registry.ts` form_custom row.

### F2: marketing claims: "full appointment payments" and "fully customisable template"

Two pricing-page claims need review against what P9 actually delivered. Confirm
the language matches the feature, or soften the copy.

- **Blocks:** commercial-readiness gate (every claim must match implementation).
- **Current state:** P9 appointment payments built (A1-A8). Marketing copy
  unreviewed.
- **Source:** `plus-commercial-packages.md` section 7 open items.

### F3: caps table: ratify the published numbers over the provisional ones

The spec's provisional caps (Free fields=5, Plus trips=10) conflict with the
ratified and published numbers (Free fields=3, Plus trips=100). Code and
advertised copy use the ratified numbers. A one-line confirmation that the
provisional table is superseded closes this.

- **Blocks:** documentation clarity. Code already enforces the ratified numbers.
- **Current state:** CANONICAL_CAPS in `entitlements.ts` enforces 3/30, 3/100,
  5/50, 3/25. The DECISIONS.md row from 2026-07-25 ratified these.
  `pricing-model.md` still says "proposed, pending confirm".

### F4: acknowledge the grandfathering dry-run report

The report is delivered: 19 profiles, 4 tagged legacy_free_v1, 0 further
eligible, zero behavior change. Review and acknowledge to unblock cap
enforcement.

- **Blocks:** entitlement cap enforcement (section 3: "waits for the reviewed
  dry-run report").
- **Current state:** report in `plus-commercial-packages.md` section 6. Needs
  re-run immediately before enforcement since usage moves.

### F5: analytics: not gated at launch, but marketed as Plus

You decided not to gate analytics at launch. But "Advanced booking analytics" is
on the pricing page, and Free gets the same analytics Plus does. Either soften
the claim or re-decide gating.

- **Blocks:** commercial-readiness gate flags a marketed-but-free capability as
  a fail condition.
- **Current state:** analytics fully wired (P6 done, `canSeeAdvancedAnalytics`
  gates queries). Key stays paused = everyone sees everything.

### F6: fee schedule V2 activation

V2 rates are defined (appointments Plus 0.5%, goods Free 5% / Plus 1%) but the
active schedule is V1 (flat 3% deposits, 0% goods). Flipping to V2 is a
money-path change gated on accountant sign-off. See also A3.

- **Blocks:** fee differentiation. The savings dashboard shows zero under V1.
- **Current state:** V2 fully defined. Two legacy fee sources unified (A3).
  Stage 4 in the remaining work plan.

### F7: insert founder_offer_policy row

The offer table has 0 rows in production. The mechanism is built (first 100,
24 EUR/year, unique cohort position, concurrency-safe). Insert the policy row
to open it.

- **Blocks:** founder offer availability. Not a hard launch blocker but listed
  in Stage 5.
- **Source:** `plus-remaining-work-plan.md` Stage 5, item 6.

### F8: G-5: live money test

Complete Connect onboarding in LIVE mode and run one real card deposit
end-to-end. Nobody has ever observed the production server handle a real charge.
This is the single most important missing data point.

- **Blocks:** the entire pricing model validity. Also the first real
  end-to-end verification of the money path.
- **Current state:** zero real transactions. Zero live Connect accounts.

### F9: fresh EAS / iOS build

Current build is 0.3.0(4) from 2026-07-17, predating all P0-P9 work. Every
new capability has mobile routes and native screens, but no build since then
has been pushed to TestFlight. Trigger the build.

- **Blocks:** mobile parity. Also gates granting `goods_collections` (wire
  hazard: the old build crashes on the new block type).

### F10: re-record stale engineering approval keys

The 4 technical keys (`schema_deployed`, `webhook_tested`,
`reconciliation_tested`, `isolation_tested`) were recorded 2026-07-23, before
the ordering guard, founder-offer branch, and invoice parent path. They certify
code that no longer exists.

- **Blocks:** approval integrity chain.

### F11: subscribe webhook to charge.dispute.* events

The Stripe webhook endpoint must subscribe to `charge.dispute.created` and
`charge.dispute.closed`. Handler code is built and tested. This is a Stripe
Dashboard change.

- **Blocks:** chargeback visibility. Without the subscription, disputes are
  invisible.

### F12: record consumer_sales_launch_approved

The final go-live decision. `record-approval.cjs` enforces that no marketed
capability is still parked before allowing this. Without this key,
`createSubscriptionCheckout` refuses to create any Stripe object.

- **Blocks:** everything. This is the last gate, by design.

### F13: merge P5d collections branch

P5d passed Gate A re-review, Gate C, and base commit review. Approved but not
merged. Merging IS deploying (migrations 0121/0122/0124). Migration 0123 is
already in production.

- **Blocks:** `goods_collections` capability.
- **Current state:** known residuals: TOCTOU in deleteCollectionCore, incomplete
  fail-flat, missing DB tests for 0124 RPC.

### F14: legacy free v1 fee rates: undefined

What rate does a grandfathered artist with an existing Connect override pay
under V2? Currently flagged as UNDEFINED in the capability registry. The dry
run found zero such accounts, but the edge case needs a decision before V2.

- **Blocks:** fee schedule V2 edge case.

---

## Accountant decisions (5)

### A1: price display approval + Stripe tax_behavior (irreversible)

Co-sign "3.00 EUR per month, final price" with `tax_behavior = inclusive`. This
is irreversible once the live Price is created. The founder approved 2026-07-25;
the accountant co-sign is still needed.

- **Blocks:** head of the chain. The checkout copy (C2), the live Price
  creation, and the counsel price-on-button condition all wait on this.
- **Source:** `pricing-model.md` OQ-1; `plus-launch-signoff-request.md` Part 2.

### A2: VAT registration trigger + who monitors quarterly

Confirm the bounded triggers: alert at 35k EUR Estonian taxable turnover (limit
40k) + 8k EUR cross-border EU B2C digital (limit 10k OSS) + annual review.
Record who monitors quarterly. Unlocks `invoice_config_approved`.

- **Blocks:** invoice issuance and going live per the sign-off request.

### A3: fee schedule V2: approve fee and tax treatment

Before `ACTIVE_FEE_SCHEDULE_VERSION` flips from V1 to V2, approve the new
rates: appointment payments Plus 0.5%, goods Free 5% / Plus 1%. Gated on
"accountant re-confirmation against V2 specifically."

- **Blocks:** Stage 4 (fee differentiation). Same item as F6, from the
  accountant side.

### A4: invoice and credit-note format for non-VAT-registered business

Confirm what a subscription invoice and refund credit-note should contain (no
VAT line, no VAT number, no reverse-charge note). The credit-note flow being
"finished and tested" is counsel's launch-blocking condition 1.

- **Blocks:** counsel condition 1 (credit-note flow complete).

### A5: refund tax handling on part-month withdrawal

Confirm the tax handling on the partial refund for an immediate-start
withdrawal. While unregistered, it is plain time-based proration. Counsel
confirmed the method; accountant confirmation pending.

- **Blocks:** part of the shared counsel/accountant sign-off package.

---

## Counsel decisions (4)

### C1: final implementation sign-off (the one remaining counsel gate)

Single package: final Terms, checkout disclosures, withdrawal flow, goods
marketplace wording, and the implementation itself. Approval recorded against
the final versioned artifacts. Any Terms correction bumps the version hash,
invalidates `terms_approved`, and re-closes the b2c gate until re-recorded.

- **Blocks:** consumer billing activation. This is sequence-last by design; it
  cannot begin until the build is complete.

### C2: counsel condition 3: price adjacent to pay button

Total price, main characteristics, billing interval, and auto-renewal must
appear on the same screen as the order button. The current draft says "price is
shown on the next step." The wiring is a 1-hour engineering change once A1
(price display approval) lands.

- **Blocks:** one of four explicit counsel launch-blocking conditions.
- **Current state:** waiting on A1. Draft text prepared.

### C3: consumer withdrawal copy approval (E1-E5)

Five follow-up texts submitted for one-reply confirmation: E1 withdrawal email,
E2 purchase confirmation, E3 cancellation confirmation, E4 cancellation button,
E5 withdrawal deadline display. Unlocks `consumer_withdrawal_copy_approved`.

- **Blocks:** the b2c gate (`consumer_withdrawal_copy_approved` is a required
  key).
- **Current state:** all five texts built in code and submitted. No response
  recorded.

### C4: deposit-fee legal residue (LO-10 round)

Bundle of residual deposit-fee legal questions: fee VAT/disclosure,
Custom-Connect confirmation, client-cancel forfeit enforceability. Recommended
to bundle into the LO-10 counseling round.

- **Blocks:** not a hard Plus launch blocker, but should close before scaling
  real deposit volume.
- **Current state:** unscheduled. Needs the founder to schedule the LO-10 round.

---

## Answers (counsel + accountant review, 2026-07-31)

Positions for the C and A items. Founder items (F1-F14) and cross-cutting items
stay with their owners; where a legal condition attaches to one, it is noted.

### C2 — Confirmed; wire on A1, verify before C1

The requirement stands as stated (Art. 8(2) CRD: total price, main
characteristics, billing interval, and auto-renewal on the same screen as, and
directly above, the order button). The prepared draft text is approved in
substance. Once A1 lands: wire it, and include a screenshot of the final
checkout screen in the C1 package — this is one of the four launch-blocking
conditions and is verified visually, not by code review.

### C3 — Answered 2026-07-31 (see `plus-launch-handoff.md`, Answers section)

E1, E3, E5 confirmed; E4 wording confirmed with the behind-login placement held
as a recorded founder risk plus a pre-login cancellation route on the
fast-follow list; **E2 requires one edit** before recording: the purchase
confirmation must carry or attach the full Art. 8(7)/6(1) information set
(accepted Terms version, withdrawal instructions / model withdrawal
information, price and renewal terms) — a link to a mutable web page does not
satisfy the durable-medium requirement. If `billing_contract_confirmations`
already appends these to the same email, E2 is confirmed as-is; verify and
record which. `consumer_withdrawal_copy_approved` records once the E2 point and
the C2 wiring verification are done.

### C1 — Cannot be pre-answered; here is the sign-off checklist

Final sign-off is sequence-last by design. To make it a single-pass review,
the package must contain:

1. **Final Terms** at the launch version hash, folding in the X2 edit ("plan
   settings" → "account settings") and any E2-driven text, so the hash rolls
   once, not twice.
2. **Checkout screenshots** showing the C2 price-adjacent-to-button screen and
   the unticked immediate-start control.
3. **The E1-E5 texts as deployed** (post-E2-edit), plus evidence the durable
   confirmation email carries the Art. 8(7) set.
4. **Credit-note flow evidence** (counsel condition 1): one test withdrawal
   with a partial refund and its credit note.
5. **Goods marketplace wording** — flagged: this is the one C1 component never
   reviewed in any prior round, and it carries its own consumer-law surface:
   (a) the **artist is the seller** of goods and must be identified as such,
   with Inklee disclosed as intermediary, not a contract party; (b) goods
   carry their own 14-day **return** right, distinct from the services
   withdrawal right already built — including return-cost allocation and the
   **Art. 16(c) CRD exemption for personalised/custom-made items** (relevant
   for commissioned flash), which must be claimed expressly at checkout if
   relied on; (c) if artists sell to consumers through the platform at scale,
   the P2B Regulation (2019/1150) and DSA trader-traceability duties begin to
   attach. Do not treat the goods wording as boilerplate in the final pass —
   it is the only genuinely new legal content in C1.
6. **The ledger corrections** from the 2026-07-31 handoff review (business-
   declaration attribution) and F10's re-recorded technical keys, so the
   approval chain is clean at the moment the final key is recorded.

### C4 — Schedule the LO-10 round; preliminary directions on the three bundles

Bundling is correct. Directions so the round starts from positions rather than
blank questions:

- **Client-cancel deposit forfeiture:** a blanket "non-refundable when the
  client cancels" is the highest-risk term in the deposit system. The
  enforceable shape under EU consumer law: pre-payment disclosure of the
  forfeiture rule in clear terms; forfeiture proportionate to the artist's
  actual loss (a full forfeit long before the appointment drifts into unfair
  penalty territory under UCTD Art. 3 / Annex); mandatory-refund cases where
  the **artist** cancels or materially reschedules. Expect counsel to require
  a time-graduated or capped forfeiture rather than a flat rule.
- **Fee VAT/disclosure:** while unregistered (D2) the platform fee carries no
  VAT and no reverse-charge assertion; the open question for the round is
  **classification of fee revenue** (B2B service to the artist-as-merchant vs
  part of a consumer-facing supply), which decides which registration
  threshold fee revenue counts toward (feeds A2).
- **Custom Connect loss backstop (`losses.payments: application`):** the six
  LO-10 asks stand; the central one is whether absorbing losses moves Inklee
  from platform toward payment-intermediary posture under PSD2's commercial-
  agent exemption. Not a blocker for a founder-run test deposit (F8), **but
  close it before beta artists take real client money** — that boundary is
  already recorded in LO-10 and should be treated as binding.

### A1 — Co-sign recommended

"3.00 EUR per month, final price" with `tax_behavior = inclusive` is the
correct and consistent implementation of decisions D1 (consumer-first) and D2
(no VAT added while unregistered): the displayed price is the final price
precisely because no VAT line exists. The irreversibility concern is mitigated
by the replaceable-Price design (`pricing_plans`): a future registered-VAT
posture creates a **new** Price with its own tax behaviour and archives this
one; no existing subscriber is disturbed. One caution to record with the
co-sign: at future VAT registration, a 3.00 EUR inclusive price means Inklee
absorbs the VAT out of the 3.00 unless the price is re-set — note this in the
A2 trigger file so it is a decision, not a surprise.

### A2 — Confirm the triggers as proposed, with one addition

35k EUR Estonian taxable turnover (87.5% of the 40k limit) and 8k EUR
cross-border EU B2C digital (80% of the 10k OSS threshold), plus annual review,
are sensible early-warning margins. Recommended recording: **accountant
monitors quarterly** (calendar-quarter check against both counters),
**founder/board owns the re-approval decision** when an alert fires — the
existing auto-re-close of `tax_policy_approved` on threshold crossing is the
enforcement backstop, not the monitor. Addition: the monitoring query must
count **both subscription revenue and platform-fee revenue**, classified per
the C4 fee-classification answer; fee revenue against the wrong threshold is
the likeliest silent error.

### A3 — Approve V2 rates for tax treatment, with the two conditions from the 2026-07-31 review

Tax treatment while unregistered: all V2 fee lines carry the non-registered
small-undertaking wording, no VAT, no reverse charge (same as A4 invoices).
The rates themselves are a commercial decision already founder-approved. Two
conditions attach before `ACTIVE_FEE_SCHEDULE_VERSION` flips (carried over
from `plus-launch-handoff.md` F1 answer): (1) **Terms coverage + advance
notice** for the new Free goods fee (5% where currently 0% — a unilateral fee
introduction for existing users); (2) **F14 must be decided** (legacy_free_v1
Connect-override rate under V2) — zero affected accounts today, but the
schedule cannot contain an UNDEFINED cell when it activates.

---

## Processing outcome (engineering, 2026-07-31)

The answers above were processed in a six-item verification pass (recorded in
`docs/audit/findings.yaml`). What moved, and what still needs the named owner.

### Actioned in code

- **C2 (main-characteristics adjacency).** The consumer upgrade panel had 3 of 4
  Art. 8(2) elements adjacent to the order button (price, interval,
  auto-renewal); the 4th (main service characteristics) sat above the panel. A
  "What you get" summary sourced from `PLUS_BENEFITS` now renders directly above
  the Total line, so all four are adjacent. `upgrade-button.tsx` + `page.tsx`.
- **E2 (durable-medium hardening).** E2 is confirmed as-is: the purchase
  confirmation carries the full Art. 8(7) set inline (Terms version + snapshot
  text, withdrawal instructions, price + renewal). The one residual, a fail-soft
  path that could silently ship without the Terms text, now raises a Sentry
  warning so it can never happen unnoticed. `withdrawal.ts`.

### Actioned in docs

- **Ledger fix (V6).** `plus-launch-handoff.md` business-declaration row tightened
  to the real counsel date + D1 deferral; the stale flag narrative resolved.
- **Recorded risks (V5).** A1 VAT-absorption caution -> `accountant-decision-pack.md`
  A2; E4 pre-login cancellation fast-follow -> `plus-launch-followup.md`; C4
  LO-10 preliminary directions -> `counsel-note-custom-connect-2026-07-21.md`.

### Recorded, needs the named owner (not engineering)

- **F2 (fee-refund v1 cost-not-margin), founder + accountant + code.** Counsel
  approved "retain non-recoverable" on the cost-only condition, but the v1 code
  retains the whole fee (finding `PAY-RFD-002`). Must implement per-transaction
  Stripe-cost computation before `ACTIVE_FEE_REFUND_POLICY_VERSION` flips. Not
  live today (v1 inactive).
- **F14 (legacy_free_v1 rate under V2), founder.** Finding `PAY-FEE-004`. Pick
  the rate (Plus 0.5% / old 3% / 0% grandfather); it must be encoded before v2
  activates. Zero affected accounts today.
- **C2 null-price fallback, counsel.** Finding `BILL-UI-003`. When Stripe price
  resolution fails, the panel defers the total to Stripe Checkout. No silent
  charge (Checkout shows price before pay), but counsel should rule on whether
  the fail-safe copy is acceptable under Art. 8(2).

### Still founder / production writes (surfaced, not done)

Recording gate keys into `billing_activation_approvals` (A1 co-sign,
`consumer_withdrawal_copy_approved`, the launch keys), flipping the fee schedule,
and the E2 point + C2 screenshot that counsel wants in the C1 package. These
remain yours to record, and only after the E2 (confirmed) and C2 (now wired)
checks are captured for the C1 package.

### A4 — Format confirmed

Subscription invoice: seller identity + Estonian registry code, sequential
number, date, line description ("Inklee Plus subscription, [period]"), amount,
currency, the non-registered note ("VAT not applied — supplier is a
non-registered small undertaking, Estonia"), **no VAT line, no VAT number, no
reverse-charge note**. Credit note: mirrors the invoice, references the
original invoice number and date, negative amounts, same non-registered note,
same sequence or a dedicated CN sequence. Stripe-generated documents remain
acceptable while unregistered (per the 2026-07-25 walkthrough); the three
polish items stay optional. This closes counsel condition 1's document-format
half; the flow-tested half is engineering (F-side).

### A5 — Confirmed

While unregistered there is no VAT to adjust: the partial refund on an
immediate-start withdrawal is plain time-based proration of the gross amount,
documented by the A4 credit note. No tax adjustment entries arise. Method
matches the counsel-confirmed proration (1b, 2026-07-24). Revisit only at VAT
registration (the A1 caution and A2 trigger cover that path).

### Summary

| Item | Outcome |
|---|---|
| C1 | Checklist provided; goods-marketplace wording flagged as the one unreviewed component |
| C2 | Confirmed; wire on A1, screenshot into the C1 package |
| C3 | Answered in `plus-launch-handoff.md`: E2 edit + wiring verification, then record |
| C4 | Schedule LO-10; preliminary positions given; close before real client money |
| A1 | Co-sign recommended; record the VAT-absorption caution |
| A2 | Confirm 35k/8k + quarterly; count fee revenue too |
| A3 | Approve with two conditions (Terms+notice for Free goods fee; decide F14) |
| A4 | Format confirmed; closes the document half of counsel condition 1 |
| A5 | Confirmed; no tax adjustment while unregistered |

---

## Cross-cutting / engineering-gated-on-decisions (4)

### X1: custom SEO fields: blocked on indexation strategy

Artist pages are noindex by default; SEO strategy is ChatGPT-owned. Custom SEO
fields have no purpose until the indexation decision is made.

- **Blocks:** the only `blocked-decision` item in the capability registry. Not
  on the critical path.

### X2: Terms line 76: "plan settings" should say "account settings"

A residual C3 text edit. Must go through the versioned Terms workflow (bump +
snapshot + re-record), so it is bundled into Stage 6. Any Terms edit bumps the
hash and re-closes the b2c gate.

- **Blocks:** nothing independently. Deferred to Stage 6.

### X3: unpark 3 marketed capabilities (env change)

`custom_templates`, `analytics`, and `entitlement_caps` are still parked.
`record-approval.cjs` refuses the launch key while any marketed capability is
parked. For analytics specifically, this conflicts with F5 (founder decided not
to gate at launch).

- **Blocks:** launch key recording (F12). The unpark enforcement exits 3.

### X4: run deposits key migration against production

`scripts/entitlements/migrate-deposits-key.cjs` must be run against production
to add `card_deposit_collection` to any admin-granted deposits overrides before
the broad `deposits` key is fully retired.

- **Blocks:** fine-grained deposit entitlement enforcement.
- **Current state:** script written. Code call sites migrated. Production run
  pending.
