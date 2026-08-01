# Plus build — consolidated review handoff (founder / counsel / accountant)

**Date: 2026-08-01. State: the complete intended Plus + goods product is BUILT,
integrated, tested and dark.** This is the one consolidated package the
2026-07-31 no-deferral directive pointed at: every decision that still needs a
human owner, in one place, grouped by who answers it. Reasoning and
alternatives for every provisional entry live in
`docs/product/plus-build-time-decisions.md` (cited by id); evidence lives in
`docs/audit/findings.yaml`; item history in
`docs/product/plus-open-decisions-handoff.md` (whose per-owner queues this
document supersedes as the review list).

**Build state in one paragraph.** Local `master` is ~95 commits ahead of
`origin/master`, unpushed. Migrations **0125-0137 are NOT applied to
production**; pushing master deploys code that expects them, so the release
requires the sequencer flow (apply catalog-verified, then push — never a casual
push). Everything money-adjacent is behind gates: `ACTIVE_FEE_SCHEDULE_VERSION`
= v1, fee-refund policy v0, `GOODS_COMMERCE_ENABLED` off,
`consumer_sales_launch_approved` unrecorded, three capabilities still parked.
The audit register holds 116 findings and 79 coverage areas; every remediation
this phase is either independently verified or explicitly marked with what is
NOT yet verified.

**The one hard line (unchanged).** Nothing in this document is an approval.
Building against a provisional call is not going live: no fee/refund flip, no
launch key, no irreversible Stripe object, no un-park happens on the strength
of an entry here.

---

## 1. FOUNDER — decisions and go-actions

### 1a. Confirm-or-override (provisional product calls, cheap to reverse)

| # | Decision taken (id) | Confirm |
|---|---|---|
| FD1 | Gallery rich blocks gated by `appearance_custom`, no new `page_blocks` key (D1) | Right gate? |
| FD2 | Gallery editing web-only at launch; native shows read-only summary (D4) | OK for launch? |
| FD3 | "Section layouts" = the shipped page-template layer, not a new multi-column system (D6) | Was that the intent? |
| FD4 | Gallery editor keeps the URL field beside Upload (GB2) | Keep or drop later? |
| FD5 | Standalone checkout page is self-contained v1; wishlist-cart integration deferred as UX polish (GC5) | OK for un-park? |
| FD6 | v1 refuses bundles containing variant-bearing products at checkout; variant-aware bundles = v2 (GC7) | Accept the v1 limitation? |
| FD7 | Surface visibility is per-surface and non-cascading; the standalone shop has its own toggle, the booking page its own (S2) | Right model? |
| FD8 | Hub goods block hides when the booking-page shop is hidden (link would break); re-targets to the standalone shop at un-park (S4) | OK? |
| FD9 | All C5 visibility toggles are Free; no `goods_tools` key minted (S5) | Confirm no paywall wanted. |
| FD10 | Distinct per-surface THEMING stays out of v1 (S1, survives ruling 19; inherited theming shipped) | Still not wanted? |
| FD11 | Legacy grandfather rate = 3% appointment / 5% Free goods under v2, encoded, activates at the flip (F14, ruling 14) | Final confirm of the 3%. |
| FD12 | Ruling 18's "partial refund / by-line refund forms" and native revise screen were left as at-launch polish (Track A leftovers by design) | Accept for launch, or pull forward? |
| FD13 | Replacement marketing claims for the two removed no-code-path claims (ruling 2 tail) — pending copy | Approve final wording. |

### 1b. Go-actions only the founder can execute (activation checklist, in order)

| # | Action | Blocks |
|---|---|---|
| FA1 | **Release the build**: apply migrations 0125-0137 to prod (catalog-verified, release-sequencer flow), then push master | Everything below; nothing is deployable before it |
| FA2 | G-5 live-money test (real Connect onboarding + charge + refund) — no real charge has EVER been observed end-to-end | Any external payment use |
| FA3 | Fresh EAS build — current `da93749b` predates image-gallery, bundles, featured_collection, the payments screens | Granting `goods_collections` / `goods_bundles` / gallery block capabilities |
| FA4 | Stripe dashboard: verify the dispute events subscription on the LIVE webhook (F11; handler is built + tested) | Dispute handling live |
| FA5 | Un-park `custom_templates` / `analytics` / `entitlement_caps` (X3); re-run the legacy recompute IMMEDIATELY before cap enforcement (F4 tail) | F12 |
| FA6 | Run `migrate-deposits-key.cjs` against prod (X4) | Payment entitlement cutover |
| FA7 | Insert the `founder_offer_policy` row at release (F7; offer stays closed until then) | Founder offer |
| FA8 | Re-record the 4 engineering approval keys against the final release candidate (F10) | F12 |
| FA9 | Stage-6 versioned Terms edit (includes X2 line-76 wording + the GS/PAY items counsel returns) via the enforced snapshot workflow, counsel re-confirm | F12, fee v2 flip, refund v1 flip |
| FA10 | Record `consumer_sales_launch_approved` — the final gate, by design (F12) | Consumer sales |
| FA11 | Flip `ACTIVE_FEE_SCHEDULE_VERSION` to v2 AFTER accountant sign-off (A3) + Terms/advance notice | Real fee revenue |
| FA12 | Un-park `GOODS_COMMERCE_ENABLED` — only after GS1-GS4 + GA1-GA2 below are answered AND FA2 | The whole goods shop |

---

## 2. COUNSEL — one batch, queued with the C1 final sign-off package

The consumer/withdrawal/VAT/subscription ARCHITECTURE is confirmed; none of
this reopens it. These are the final-implementation items, including the one
surface counsel has NEVER seen: the standalone goods shop (guest consumers
buying physical goods from artists on Inklee-hosted checkout).

| # | Item | What exists (provisional posture) | What counsel decides |
|---|---|---|---|
| CL1 | **C1 final sign-off package** | Final Terms draft, checkout disclosures, declarations, withdrawal flow, the implementation itself; 6-point checklist in the old handoff. Goods-marketplace wording = the never-reviewed component, now materially widened by CL2-CL6. | The one consolidated approval, recorded against versioned artifacts. |
| CL2 | **GS1 — distance-selling duties on the standalone checkout** | Items, prices, server-confirmed total on the pay button, artist named as counterparty; plain "Pay" button. | Full Art. 6/8 CRD information set at order time? "Order with obligation to pay" button label? |
| CL3 | **GS2 — goods return right** | Refund machinery exists (full/partial, restock, cap release); NO return-right or Art. 16(c) personalised-goods disclosure anywhere. | Return-right wording, return-cost allocation, where 16(c) is claimed. |
| CL4 | **GS3 — durable goods order confirmation** | Buyer receipt email: items, total, artist, "arranged with the artist directly". No seller identity/address, no return instructions, no terms. | Must it carry the Art. 8(7)-style set, and exactly what content? |
| CL5 | **GS4 — guest-buyer GDPR** | Guest email stored on the order, used for receipt + fulfilment. No privacy notice on the page, no records-of-processing entry. NEW since the last board: cancelled/abandoned standalone orders retain the guest email with no purge path (the 24h sweep cancels the row but nothing erases it; flagged in SHOP-ORD-001's remediation note). | Privacy notice, RoP entry, retention rule for cancelled-order emails vs the 7-year financial-records rule. |
| CL6 | **GB3 — hosted client photos** | Gallery images on the public-unlisted bucket; downgrade hides the render, not the object; deletion paths built. Tattoo photos are health-adjacent personal data on skin. | Public-unlisted OK, or direct signed URLs (moderate rework)? |
| CL7 | **PAY-RFD-002 Terms half** | Artist-cancellation refunds retain only the evidenced processor cost (built + verified). | Terms coverage of the retained-cost rule BEFORE the fee-refund policy v1 flip. |
| CL8 | **C4 / LO-10 round** | Preliminary directions given; brief written. | Schedule + close before real client money. |
| CL9 | **C3 administrative tail** | E1-E5 approved and verified in-product. | Record `consumer_withdrawal_copy_approved` once the C2 screenshot is in the C1 package; E4 pre-login cancellation fast-follow stays logged in `plus-launch-followup.md`. |

## 3. ACCOUNTANT — one batch

| # | Item | What exists | What the accountant confirms |
|---|---|---|---|
| AC1 | **A1 — price display co-sign** (head of the launch chain, irreversible Stripe Price semantics) | 3.00 EUR/mo inclusive, `tax_behavior=inclusive`, live Price exists; VAT-absorption caution drafted. | Co-sign; record the caution. |
| AC2 | **A2 — thresholds + monitoring** | 35k EE / 8k EU-B2C alerts built; quarterly cadence proposed (accountant monitors, founder owns re-approval). | Confirm numbers, cadence, and that FEE revenue counts toward them. |
| AC3 | **A3 — fee schedule v2 sign-off** | v2 fully encoded (Plus 0.5% / legacy 3% appointment; Free 5% / Plus 1% goods), inactive; per-transaction version + tier stamps now persisted (Track D). Conditions already named: Terms + advance notice for the new Free goods fee. | Sign off the flip preconditions. |
| AC4 | **GA1 — standalone goods flow classification** | Artist merchant of record (`on_behalf_of` + destination charge); Inklee's only take = `application_fee_amount` (0% under v1). | Model unchanged? How goods fee revenue classifies for the thresholds (ties into AC2/LO-10). |
| AC5 | **GA2 — goods invoicing** | Receipt email "on behalf of the artist"; no invoice document for goods (A4 covered Plus subscriptions only). | Whether artist-as-seller goods sales need a document beyond the email, and whose obligation it is. |
| AC6 | **GC2 — discount-cap release on full refund** | A fully refunded order deletes its redemption, freeing the code's cap. | Matches intended discount semantics (minor). |
| AC7 | **D2 — "(card processing included)" at 0.5%** | The parenthetical is now conditional on the shown rate being exactly 300 bps; at Plus 0.5% it is suppressed pending this answer. | Can the 0.5% rate's cost/margin split ever carry that claim, or does it need its own wording? |
| AC8 | **PAY-RFD-002 fee treatment** | Retained-processor-cost refunds built + verified, policy v1 inactive. | Fee/tax treatment of the retained cost BEFORE the v1 flip. |

---

## 4. Sequence (who is blocked on whom)

```
AC1 price co-sign ──► CL1 final package (incl. CL2-CL7 answers) ──► FA9 Terms re-roll ──► FA10 launch key
AC3 + FA9 ─────────► FA11 fee v2 flip
CL7 + AC8 + FA9 ───► fee-refund policy v1 flip
CL2-CL5 + AC4/AC5 + FA2 + FA3 ──► FA12 goods un-park
FA1 (migrations + push) precedes ALL of the above reaching production.
```

## 5. Engineering tail (no owner decision needed — listed so the picture is honest)

Not for this review, tracked in the register: the round-3 test-gap batch
(TEST-VAC-004..007, in flight), SHOP-FUL-004's behavioural verification once
its tests land, migrations 0125-0137 + the db suites in CI (no local Postgres
has ever run them), PAY-RFD-008's Stripe test-mode reproduction, the two new
mobile settings routes awaiting native screens, and the Stripe-side
cancel-vs-confirm race exercise flagged in SHOP-ORD-002's residual.

## 6. Already approved — do not re-ask

Consumer strings E1-E5, refund method, cancel parity, price-adjacent-to-pay
(built + verified), invoice/credit-note format for Plus subscriptions,
part-month proration without tax adjustment, stay-unregistered posture +
Stripe-invoices-as-is (2026-07-25 walkthrough), the 18/18 activation gate's
recorded keys, and the 20 rulings of 2026-07-31 (operating model, caps,
analytics boundary, fee encoding, scope completions). Re-asking these is the
overhead the no-deferral rule exists to prevent.
