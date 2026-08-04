# C1 — final implementation sign-off (counsel handoff)

**Prepared 2026-08-04. This is the ONE remaining counsel gate.** Everything
counsel has ruled across rounds 2 through 6 and the 2026-08-01 review batch is
now BUILT, deployed dark, and verified. This package asks for the single
consolidated confirmation against the FINISHED artifacts, per the agreed
sequence: build the complete product, submit the finished thing, apply any
corrections, then activate.

**Ground rule, unchanged.** The consumer / withdrawal / VAT / subscription
architecture and the artist-as-seller posture are settled. Nothing here reopens
them. Section 5 lists what must NOT be re-asked.

**What we are asking counsel to do.** Review the two final versioned legal
documents (Terms and Privacy, both version `2026-08-04`, deployed) plus the
evidence in Section 2, against the four launch-blocking conditions and the
goods-marketplace surface. Return either "approved as-is" or a correction list.
On approval, the founder records the approval keys against the final version
hashes (Section 4) — recording is the founder's act, not counsel's.

---

## 1. The final legal documents (deployed release candidate)

Both bumped to version `2026-08-04`, snapshots frozen and integrity-checked
(byte-identical, hashes computed; CI gate `legal-artifact-integrity.test.ts`
21/21). The version hash re-closes the approval key automatically until it is
re-recorded, so consumer billing stays gated until Section 4.

**Terms of Service — `inklee.app/terms` (version 2026-08-04).** Changes from
the 2026-07-24 version approved earlier, each mapped to its ruling:

| Change | Ruling |
| --- | --- |
| New **Section 13 "Goods orders"**: artist is seller/merchant of record; seller identity+address obligation; 14-day goods return right + per-product Art. 16(c) custom-made carve-out + buyer bears return cost; withdrawal notice to Inklee counts as received on receipt and is forwarded without delay; buyer invoices are the artist's obligation; goods platform fee (Free 5% / Plus 1%, not yet charged, 30-day advance notice on the Free fee) | CL2-CL5 (2026-08-01), R5 Q4, AC3 |
| **P2B (2019/1150) subsection** inside Section 13: plain-language agreement, restriction/suspension grounds + statement of reasons (30-day notice to end), 15-day Terms-change notice, no cross-artist ranking + no Inklee own-goods, small-enterprise recital | Q20 P2B half |
| Sections 13-20 renumbered to **14-21**; the Section 11 cross-reference retargeted to the renumbered Availability section | mechanical |
| Section 11 deletion-refund bullet, including: *"Deleting your account is never held up by a refund. If the refund cannot be completed at the time, we keep the limited records needed to pay it and complete it afterwards."* | R5 Q2 (in, as drafted) |
| Terms stay **silent** on withdrawal-window arithmetic (the full refund where no immediate-performance consent exists is Art. 14(4)(a)-required, not a departure) | R5 Q3 (ratify (a)) |
| "plan settings" → "account settings" | X2 |
| Dark-launch sentence replaced with a state-independent one; the artist client-photo consent is stated as a **continuing** obligation (§9); the false "you confirm business use at checkout" sentence corrected (no such control ships) | Riders 1/3/4, DPIA R2 |

**Privacy Policy — `inklee.app/privacy` (version 2026-08-04).** New **§3.5
"Guest shop buyers"**: email, order contents, and a hashed cart/wishlist token,
with lawful bases (Art. 6(1)(b) contract; 6(1)(c) for the retained financial
record), recipients (the artist as seller of record, and Stripe), and four
retention rows (completed order 7 years; cancelled-order email pseudonymised at
30 days; abandoned cart deleted at 30 days; wishlist at 12 months). This is the
R5 Q5 ruling (the guest-buyer transparency text belongs in Privacy, not Terms).

---

## 2. The seven-component evidence package (CL1 checklist)

| # | Component | Status |
| --- | --- | --- |
| 1 | **Final Terms** at the launch hash | ✅ deployed, version 2026-08-04 (above) |
| 2 | **Checkout screenshots** — price + main characteristics + interval + auto-renewal directly above the "Order with obligation to pay" button, and the UNTICKED immediate-start control | ⏳ TO ATTACH before sending: capture from the production build at the release-candidate commit with the launch flag enabled for an internal test account, commit hash recorded alongside (per the agreed evidence standard). The wiring is built + verified; this is the last visual capture |
| 3 | **E1-E5 withdrawal texts + Art. 8(7) durable medium** | ✅ as deployed; the purchase confirmation carries the full Art. 8(7) set inline (accepted Terms version + text, withdrawal instructions, price + renewal), independently verified. Residual disclosed in §3(4) |
| 4 | **Credit-note flow evidence** (one test withdrawal + partial refund + its credit note) | ⏳ TO ATTACH before sending: a test-mode withdrawal with a proportionate refund and the generated credit note (append-only `transaction_tax_snapshots`, `kind='credit_note'`). Code built + unit-tested; the run recipe is ready |
| 5 | **Goods-marketplace wording as implemented** | ✅ deployed dark: the "Order with obligation to pay" button, the seller-disclosure block, per-row custom-made markers, the catalogue-state return notice (an all-custom shop shows the custom-made notice, not a blanket return promise — R5 Q1(c)), the Art. 8(7)-conforming receipt, and the guest privacy notice at the email field |
| 6 | **Ledger state** (a clean approval chain at recording time) | the two rows recorded before their preconditions (`consumer_withdrawal_copy_approved`, and `consumer_refund_creditnote_tested`) are voided and re-recorded against the deployed artifacts at Section 4; the technical keys are re-recorded against the release candidate |
| 7 | **Hosted-photo controls + LO-5 DPIA** | ✅ private `gallery`/`gallery-archive` buckets with signed 15-minute URLs (the stronger of the two options offered — Q18), object deleted (not just hidden) on takedown/downgrade, notice-and-action route live; the LO-5 DPIA is complete. Provenance disclosed in §3(1) and §3(9) |

---

## 3. Cover-note disclosures

Each is already ruled or independently verified; none is a new question. They
are surfaced so the sign-off is against a complete and honest record.

1. **The LO-5 DPIA is controller-signed, not counsel-reviewed**, and was amended
   on 2026-08-04 (dated factual corrections, below) the day after signing. The
   controller is initialling and dating those corrections before the independent
   qualified review; the review is **commissioned, not concluded** (it is one of
   the two standing §5.0 exceptions, with LO-10).
2. **DPIA-GAL-001:** the DPIA's "the gallery capability was never granted to any
   artist" was corrected to the verified claim, "never **exercised**" (0 gallery
   objects, 0 gallery blocks in production). The only account holding the
   entitlement is a founder-confirmed internal/test account.
3. **DPIA-GAL-002:** the §7 gate-key mechanism is not yet wired into the live
   gallery path, so a recorded key is presently an attestation, not a technical
   gate; the real enforcement is the upload attestation + the private bucket,
   both live. The founder's decision is to wire the guard before the gallery
   opens generally (counsel's recommendation).
4. **BILL-CONF-001:** on a degraded path the Plus purchase confirmation can send
   without inline Terms text. It now emits a monitoring event and has a
   corrective-resend runbook (`docs/runbooks/billing-confirmation-resend.md`);
   an alert rule is being configured. Carried as a disclosed residual with a
   remedy.
5. **Typography:** the shop-level empty-basket notice (R5 Q1(c)) uses counsel's
   approved words with the em-dash normalized to a period per the house copy
   rule ("...applies to all other items. Details at checkout.").
6. **`consumer_refund_creditnote_tested`** was, like the withdrawal-copy row,
   recorded before its evidence existed; the §6.3 void-and-re-record ruling is
   applied to it as well (Section 4).
7. **Hosted photos (Q18):** the dated fast-follow was delivered as the *stronger*
   response — signed URLs shipped before the capability is granted — so the
   option-(i) nightly-audit alternative is not owed.
8. **C1.6 hosting grant:** both conjunctive conditions are discharged — signed
   URLs (R4) and the notice-and-action route (Q16/R1, built + independently
   verified) — shown here rather than assumed.
9. **The Rider-1 withdrawal sentence** ("the online withdrawal function is
   available from your account settings") reads as a current-availability
   statement while consumer sales are still dark; it is accurate at launch and
   forward-looking before it. Confirm the phrasing or return a correction.
10. **C1.7** (the deposit fee-refund retained-cost clause) is **not** in this
    Terms version by founder decision; it rides its own re-roll with the later
    fee-refund-policy activation. This version therefore keeps the current
    "Inklee returns its platform fee" deposit language.

---

## 3A. Counsel confirmations (2026-08-04)

The confirm-or-correct points in the legal documents are resolved here, so the
two artifacts stand as final.

1. **Deletion during an active paid subscription (Terms Section 11).** Confirmed:
   account deletion ends the subscription immediately and refunds the unused
   portion of the current period pro rata (within the 14-day window, processed as
   a withdrawal on the same arithmetic). This is carried in the Section 11
   deletion provisions alongside the refund-completion sentence, so the consumer
   is told, before the irreversible act, what happens to the paid period.

2. **Rider-1 withdrawal-availability phrasing (§3(9)) — approved as a statement,
   not an open item.** "The online withdrawal function is available from your
   account settings" is accurate: a consumer encounters it only once subscribed,
   at which point the function is live. Approved as phrased; no correction.

3. **P2B notice wording (Terms Section 13).** Confirmed: the 30-day prior-notice
   obligation attaches to **termination** of an artist's shop; suspension and
   restriction carry a statement of reasons but not the 30-day period. The clause
   states the 30-day notice against termination specifically, so Inklee does not
   overstate its own obligation. The 15-day Terms-change notice, the
   statement-of-reasons requirement, and the no-cross-artist-ranking /
   no-Inklee-own-goods positions stand as drafted.

4. **Privacy Policy §3.5 retention wording.** Confirmed: the cancelled-order-email
   and abandoned-cart rows read "**within** 30 days" rather than a fixed "30
   days," so the stated period is never exceeded. The completed-order (7 years)
   and wishlist (12 months) rows stand as drafted. **APPLIED 2026-08-04**: both
   rows now read "within 30 days"; the privacy snapshot was re-frozen and the
   integrity test is green. This was the only text change of the four; points
   1-3 confirmed existing wording unchanged.

With these confirmations the Terms (version 2026-08-04) and Privacy Policy
(version 2026-08-04) read as **final and counsel-confirmed**. What remains before
consumer sales activate: the founder records the approval keys against these
final hashes (Section 4), attaches the two evidence captures (Section 2 #2, #4),
the accountant signs off the v2 fee, and the 30-day goods-fee notice period runs.

---

## 4. After approval (the founder's acts, for reference — not counsel's)

Once counsel confirms against the final deployed artifacts: the founder records
`terms_approved` (bound to the new Terms hash), `privacy_notice_approved` (a new
version-bound key on the privacy hash), and re-records
`consumer_withdrawal_copy_approved` and `consumer_refund_creditnote_tested`
against the deployed artifacts with the evidence attached. Any counsel
correction that touches a legal document re-rolls the version and repeats this
step — that is the version-bound design working, not a failure. Consumer sales
activate only after the full key set, the accountant's fee sign-off, and the
30-day goods-fee notice period.

---

## 5. Already answered — do NOT re-open

- **Counsel rounds 3 and 4** — answered in-document 2026-08-02.
- **Rounds 5 and 6** — answered 2026-08-04 (all rulings implemented above).
- **The goods-marketplace surface (CL2-CL6)** — answered 2026-08-01; these are
  now built, returning only as the evidence in Section 2.
- **Q15 (depicted-person consent → R3), Q16 (notice-and-action → R1), Q18
  (signed URLs → R4), Q20 P2B** — answered; do not re-approve.
- The **settled architecture** (consumer/withdrawal/VAT/subscription,
  artist-as-seller), the **E1-E5 texts**, the **invoice/credit-note format**,
  the **stay-unregistered VAT posture**, and **part-month proration without tax
  adjustment**.

**Separately in flight, not part of this C1 sign-off:** the LO-10 deposit-fee
round (to be scheduled within two weeks; hard boundary — no beta artist takes
real client money before it closes) and the independent LO-5 DPIA review.
