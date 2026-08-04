# Inklee — complete counsel package

**Prepared 2026-08-04.** Everything that currently needs counsel, in one place.
Assembled from the 2026-08-01 consolidated review handoff (CL1–CL12), counsel
rounds 3–6, and the DSA/DPIA work completed 2026-08-03/04. Each open question is
quoted verbatim so it can be answered directly.

**Two ground rules, both from your prior guidance:**

1. **The architecture is settled — this reopens nothing.** The consumer /
   withdrawal / VAT / subscription design, and the artist-as-seller posture for
   goods, are confirmed. Nothing below re-asks them.
2. **Nothing here is an approval, and the final C1 sign-off is not a finished
   thing yet.** The single consolidated implementation sign-off (C1) is
   sequence-last *by design*: it needs the answers in §1 first, then the final
   Terms written, then two pieces of evidence captured. §4 states exactly how
   far it is and why it cannot be submitted as "approve this" today.

**How to use it.** Send §1 (the open rulings) and commission §2 (the two
independent-review items) now. §3 is one overdue instruction. §4 is the C1 map
so you can see what the answers unlock. §5 is the do-not-re-ask list, so you are
not paying to re-confirm settled points.

---

## §1 — Open questions: answer these

Ten numbered questions plus one passive FYI. Grouped by what each unblocks.

### 1A. Gate the final consumer Terms being *written* (answer first)

The C1.9 Terms edit is **one** version bump, sent once. It cannot start until
Q5 is answered (it decides which file the text lands in); Q2–Q4 are riders that
must be resolved *inside* that same pass so the version hash rolls once, not
three times.

**R5 Q5 — guest-buyer privacy text: which document?** *(gates the edit starting)*
> The decision we are asking for. `content/legal/privacy.md` or
> `content/legal/terms.md`. Both land in the same C1.9 version.

**R5 Q2 — failed-refund disclosure sentence: in or out?**
> The decision we are asking for. Add this sentence to the Q12 bullet, or leave
> the clause silent:
> > Deleting your account is never held up by a refund. If the refund cannot be
> > completed at the time, we keep the limited records needed to pay it and
> > complete it afterwards.

Engineering will not add it without a ruling.

**R5 Q3 — ratify or overturn the "same arithmetic" departure.** The code
full-refunds the period where no immediate-performance request exists (more than
pro rata; the gap favours the consumer). The Terms are currently silent on the
arithmetic inside the withdrawal window.
> The decision we are asking for. Either:
> - (a) Ratify the deferral wording as drafted, and the Terms stay silent on the
>   arithmetic inside the withdrawal window; or
> - (b) Overturn it and tell us the wording you want, if you intended the Terms
>   to state a pro-rata result in that window (in which case the code, not the
>   clause, is what has to change).

**R5 Q4 — Q7 clause is artist-directed but a buyer receives it.**
> The decision we are asking for. Accept the artist-directed phrasing as
> drafted, or give us dual-audience phrasing for the same clause.

### 1B. Gate the shop switching on (`GOODS_COMMERCE_ENABLED`)

**R5 Q1 — the shop's browse panel promises a 14-day return before anything is
picked.** On the standalone shop's browse step, an empty basket (the normal
landing state) prints the full 14-day return notice, so an all-custom-made
artist's shop headline-promises a return right that applies to nothing on sale.
The seller block above it is approved verbatim and says "(see below)", pointing
at exactly this notice, so suppressing it strands approved copy.
> The decision we are asking for. One of:
> - (a) Leave as is. …
> - (b) Suppress the return notice on an empty basket and reword the seller
>   block's "(see below)". Note what this costs: it edits approved C1.1 verbatim
>   copy … It also makes the empty state carry the seller block with a reference
>   to a notice that is not on screen unless we supply replacement wording.
> - (c) Derive the empty-state panel from the CATALOGUE's composition rather than
>   the selection, so an all-custom-made shop shows the custom-made notice and a
>   fully returnable shop shows the return notice. This is the option we would
>   pick if forced … It has a gap you should price in: a mixed catalogue with an
>   empty basket has no approved wording today. … Choosing (c) means either
>   approving a shop-level variant ("Some items in this shop are custom-made and
>   cannot be returned:") or telling us to reuse the existing mixed wording with
>   that substitution.

**Embedded follow-up:** if you pick (c), we also need the shop-level wording
variant approved (or authorisation to reuse the mixed wording with the
substitution). This is the only open item that blocks the shop flip.

### 1C. Clean approval chain (not launch-blocking, but close it before the final key)

**R5 Q6 — an approval row recorded before its own preconditions.** The live
production ledger, re-queried against prod on 2026-08-04, holds:

> `consumer_withdrawal_copy_approved` — approved TRUE, by "Legal counsel (relayed
> by founder M. Kraeft, 2026-07-25)", at 2026-07-25 07:57 UTC, bound to
> `withdrawal-policy-2026-07-23`.

It was recorded **2026-07-25, before both preconditions counsel later attached to
it** (the E2 durable-medium edit and the C2 checkout verification). It binds to
the `withdrawal_policy` version label, **not** the Terms hash — so a Terms re-roll
does not re-close it, and this 2026-07-25 approval is *currently satisfying a b2c
gate slot*.
> The decision we are asking for. Once we have re-queried and can show you the
> current state: should that row be voided and re-recorded against the deployed
> artifacts, rather than merely explained in the cover note?

(The re-query is done — the row is quoted above.)

### 1D. DSA build inputs (not launch-blocking; one migration is held out of prod until Q1)

**R6 Q1 — the small-enterprise ceiling figure for the DSA Section-4 trigger.**
> The decision we are asking for. The exact ceiling (in EUR) to seed as the
> Section-4 trigger, and confirmation that the small-enterprise ceiling (not the
> micro one) is the right alert point. If the answer is "monitor staff headcount
> too," tell us and we will add that input.

Our reading is Recommendation 2003/361 ("< 50 staff **and** annual turnover or
balance-sheet total ≤ €10 million"), but we will not put a statutory figure in
code without confirmation. The migration that seeds it is deliberately held out
of production until you answer.

**R6 Q2 — the citation: Article 29 / Section 4 vs Article 19 / Section 3.**
> The decision we are asking for. Confirm the citation for the threshold's
> revisit trigger: is it Article 29 / Section 4 (our reading, since the row
> monitors the trader-traceability trigger), and should the older Article 19 /
> Section 3 line stay as a separate note about the Section 3 platform duties, or
> be corrected? We will write exactly what you confirm and nothing else.

**R6 Q3 — takedown window for the "image of me without consent" category.** This
is the one genuinely new legal choice the gallery notice-and-action build (Q16)
produced. The category currently inherits the generic SLA (acknowledge 24h,
decide/act 14 days). Our own view is 72h or "expedite".
> The decision we are asking for. The target window (and whether it is a firm
> commitment or a "we aim to") for the image-without-consent category
> specifically. We will put exactly that in the procedure and, if you want, in
> the acknowledgement copy.

### 1E. Passive — flag with an objection window, not a question

**R5 §4.5 — unreadable Connect balance folds into the §7.5 escalation.** A
persistently failing balance *read* also produces a permanent blocked state, so
an unreadable balance is indistinguishable in outcome from a non-zero one.
> We will build the escalation to cover both, unless you tell us otherwise, and
> we are noting it because your reasoning turned on the balance being the legal
> claim, which is not true of an unreadable balance.

---

## §2 — Two items that warrant genuine independent qualified review

Your own round-3 §5.0 ruling: the answers to date are "compliance-review
positions, founder-verified, not an external law firm's opinion letter," and it
named **two standing exceptions warranting independent qualified review — and
both remain open.**

**(1) The LO-5 DPIA (hosted client photos + booking images).** It is **complete
and signed by the controller** (M. Kraeft, 2026-08-03; outcome: residual risk
not high, no Art. 36 prior consultation) — but it is **not counsel-reviewed**,
and the document's own §8 says independent qualified review "remains the standing
recommendation and is not superseded by this sign-off." **Disclosure for the
review:** the signed document was **amended on 2026-08-04** (the day after
signing) with dated factual corrections to §2, §3, §7 and §10 (see DPIA-GAL-001
and DPIA-GAL-002 below) and has not been re-signed.

**(2) The LO-10 deposit-fee round (= R5 Q7).** Still unscheduled. The boundary
is "before beta artists take real client money," which is now the next step (the
founder-run live-money test ran 2026-08-03).
> The decision we are asking for. Schedule the round, to close:
> 1. The enforceable shape of client-cancel deposit forfeiture. Your preliminary
>    direction expected a time-graduated or capped rule rather than a flat
>    non-refundable term (UCTD Art. 3 and Annex).
> 2. Confirmation of platform-fee revenue classification for the Estonian and
>    OSS registration thresholds. …
> 3. Whether absorbing losses under Custom Connect (`losses.payments:
>    application`) moves Inklee from platform toward payment-intermediary posture
>    under the PSD2 commercial-agent exemption.

---

## §3 — One overdue instruction (not a question — it is on the DPIA's record)

**SEED-DEL-001 — the unexplained 1,363-row deletion mechanism.** Counsel's
round-2 §5.4 instruction was to "determine the mechanism (who or what could
issue it) and record it now, not at DPIA time." The DPIA carries it forward
("carried, not waived"); the audit register still has it `open` /
`not-started`; the mechanism is still unidentified. Flagging so it is not
discovered later.

**Related, owed by engineering (round-3 Art. 33(5) records).** The Q9 sibling
accountability record (with the Stripe cross-reference answering "did any deleted
account have financial activity requiring retention?"), the hosting
deployment-history lookup, the 90-day logging-review date in the Q10 memo, and
formal standing for both records. Not questions — instructed work still in
progress. Listed so the gap stays visible.

---

## §4 — The final C1 sign-off: what it will contain, and why it is not submittable yet

C1 is the ONE remaining counsel gate and blocks consumer billing activation. It
is a **single consolidated approval recorded against the final versioned
artifacts** — final Terms hash + evidence. Here is the honest state of its seven
components. **Only #7 is complete.**

| # | Component | Status | Blocker |
|---|---|---|---|
| 1 | **Final Terms** at the launch version hash | **NOT WRITTEN** — only an input package exists (`c1.9-terms-edit-inputs.md`, itself marked "NOT approved Terms text"). Live `terms.md` is still the 2026-07-24 version with no "Goods orders" section. | Can't start until **R5 Q5**; Q2/Q3/Q4 ride inside it |
| 2 | **Checkout screenshots** (price adjacent to pay button; unticked immediate-start) | **NOT CAPTURED.** Wiring built + verified; no screenshot artifact exists. Must be from the *deployed* surface, which sits behind `PLUS_CONSUMER_LAUNCH_ENABLED` — how to render it without activating is unresolved. | Evidence capture |
| 3 | **E1–E5 texts + Art. 8(7) durable-medium** | **ANSWERED, evidence not assembled.** Texts final; the confirmation email carries the full Art. 8(7) set inline (verified). Residual to disclose: `BILL-CONF-001` — on a degraded path the email can still send with no Terms text (only the silent failure was fixed). | Assemble the bundle |
| 4 | **Credit-note flow evidence** (test withdrawal + partial refund + its credit note) | **NOT CAPTURED.** Code built + unit-tested; no executed end-to-end run exists. **Flag:** the b2c key was recorded without this evidence (see R5 Q6). | Run one test |
| 5 | **Goods-marketplace wording** (CL2–CL5) | **PARTIAL.** Product surface implemented to counsel's approved wording (obligation-to-pay button, seller block, return-right + Art. 16(c) per-line flag, conforming receipt, guest privacy notice, purge jobs). **Terms side undrafted** — no Section 13. | R5 Q1 + the C1.9 write |
| 6 | **Ledger corrections + re-recorded technical keys** | **PARTIAL.** Business-declaration attribution fixed. The four technical keys (`schema_deployed`, `webhook_tested`, `reconciliation_tested`, `isolation_tested`, recorded 2026-07-23 by Engineering) still "certify code that has since changed" — must be re-recorded against the final release candidate (F10/FA8). Plus the R5 Q6 row. | F10/FA8 + R5 Q6 |
| 7 | **CL6 photo controls + LO-5 DPIA** | **COMPLETE.** Signed-URL move (R4, migration 0151, private buckets) exceeded the interim ask. All four DPIA keys recorded in prod 2026-08-04, each independently verified. **Two caveats to disclose in the cover note:** DPIA-GAL-002 (the DPIA §7 gate keys have no caller in the live path — a recorded key is an attestation, not a technical gate; real enforcement is the upload attestation + private bucket) and DPIA-GAL-001 (the "never granted" premise was false as worded; the true claim is "never *exercised*" — 0 objects/blocks; the one entitled account is a founder-confirmed internal/test account). See §2(1). |

**Five more Terms-content items that must ride the *same* C1.9 version bump** (each
otherwise forces a second `terms_approved` re-record — the exact cost the one-shot
design avoids), and are currently in no package:

1. The **dark-launch sentence** still live in Terms §11 ("Consumer sales are not
   enabled until that flow is live") must be removed/updated at go-live.
2. **A3's goods-fee Terms coverage** + 30-day advance notice for the new Free
   goods 5% fee (accountant condition on the fee-v2 flip) — no fee clause in the
   package.
3. The **DPIA R2 artist-Terms clause** ("client consent is the artist's
   continuing obligation") — live §9 has only a generic line.
4. A **factual inaccuracy in §11** ("you buy as a business and confirm this at
   checkout" — the business-use declaration was deferred out of v1, so no such
   control ships).
5. A **cross-reference that breaks under the proposed §13 renumbering** (§11's
   "Section 13 applies" would silently redirect to "Goods orders").

**So the C1 submission sequence is:** answer §1A → write the single C1.9 Terms
version (folding in the five items above) → capture the checkout screenshot + run
the credit-note test → *then* submit the finished package for the one consolidated
sign-off. It cannot be a "sign this" package before those answers and that
evidence exist.

**Two formalities also still open** (from the b2b sign-off): counsel's explicit
confirmation of the corrected 2026-07-24 Terms text / hash `61c30c65…` (called "a
recommended formality," no record it was given); and, before the **yearly** plan,
the C9 renewal-reminder requirements (France/Austria/Romania/Sweden; Digital
Fairness Act to monitor) — not needed for the monthly plan.

---

## §5 — Do NOT re-ask (already answered — sending these wastes counsel time)

- **Counsel rounds 3 and 4** — every item answered in-document (2026-08-02). The
  answers created follow-on *build* obligations (Art. 33(5) records, the §7.4 tax
  horizon, the §7.5 Connect escalation), tracked in §3/§4, not re-openable.
- **The goods-marketplace surface (CL2–CL6)** — answered 2026-08-01 with specific
  requirements (obligation-to-pay button + full Art. 6 seller set; the 14-day
  goods return right + per-product Art. 16(c) flag + return-cost allocation;
  Art. 8(7)-conforming confirmation; guest-buyer privacy notice + RoP +
  cancelled-order purge; hosted-photo conditional pass). These are **build
  obligations now**, mostly built; they return to counsel only as C1 evidence.
- **Round-2 Q15 (depicted-person consent → R3), Q16 (gallery notice-and-action →
  R1, built + independently verified), Q18 (signed-URL timing → R4, the stronger
  of the two options you offered was taken), Q20 P2B half (drafted into C1.9).**
  Round 6 states plainly: "we are not asking you to re-approve Q16." Its one new
  downstream ask is R6 Q3 (above).
- **Already approved, do not re-ask:** consumer strings E1–E5, refund method,
  cancel parity, price-adjacent-to-pay (built + verified), invoice/credit-note
  *format* for Plus subscriptions, part-month proration without tax adjustment,
  the stay-unregistered posture, and the 20 founder rulings of 2026-07-31.

---

## Engineering / founder items — NOT counsel (listed so the picture is honest)

- **DPIA-GAL-002** (unwired gallery gate) — an engineering/founder decision (wire
  the guard, or accept attestation-only and correct the §7 prose). Only *flagged*
  to counsel because option (b) would amend a sentence in the signed DPIA.
- **DPIA-GAL-001** (the "never granted" wording) — resolved; the DPIA is
  corrected and the account is founder-confirmed internal/test. Residual founder
  call: whether that comp/test grant should carry `rich_content_blocks`
  pre-launch.
- **DSA-QUE-001** — closed (queue write made load-bearing, independently verified).
- **Art. 17 statement delivery** is manual today (ops, not counsel); one stale
  cross-reference in the DSA procedure (one-line docs fix).

---

# §6 — ANSWERS (counsel review, 2026-08-04)

Standing note: compliance-review positions, founder-verified — not an external
firm's opinion (round-3 §5.0). Answers are given as favourably to Inklee as the
record supports; where the strict answer is given, it is because the strict
answer is the one that protects Inklee.

## 6.1 §1A — the Terms-edit gate

**R5 Q5 — `privacy.md`.** Transparency content (Art. 13/14) belongs in the
privacy notice, not the contract; the Terms reference it, and the short
point-of-collection notice at the email field (already built) links it. Both
documents ride the same C1.9 pass; if `privacy.md` is not yet hash-bound,
bind it in the same mechanism now — this pass is the cheapest moment.

**R5 Q2 — IN.** The sentence is accurate, consumer-favourable, and
pre-empts the only bad argument available ("deletion extinguished my
refund"). Include as drafted.

**R5 Q3 — ratify (a), and reframe it: the code is not generous, it is
required.** Where no immediate-performance request exists, Art. 14(4)(a) CRD
means the consumer owes **nothing** for the withdrawal period — a full refund
is the legally mandated result, not a departure. The pro-rata arithmetic
applies only to the immediate-start case, and the withdrawal notice already
states exactly that. The Terms staying silent on window arithmetic is correct;
adding a pro-rata statement for the non-consent case would make the Terms
*wrong*. Ratified as drafted, code unchanged.

**R5 Q4 — accept the artist-directed clause, with the buyer-side sentence
placed where the buyer meets it.** The clause governs Inklee's conduct in the
artist relationship and reads correctly there. The buyer's protection does not
belong in that clause — it belongs on the **model-withdrawal-form page**,
which per the round-4 Q7 ruling must already state: "a withdrawal received by
Inklee counts as received when Inklee receives it and is forwarded to the
artist without delay." Verify that sentence is on the page; if it is, nothing
further. No dual-audience redraft.

## 6.2 §1B — the shop flip

**R5 Q1 — (c), and (a) is not available.** An all-custom shop
headline-promising a 14-day return that applies to nothing on sale is a
misleading commercial practice problem, not a cosmetic one — so deriving the
empty-state panel from the catalogue is not merely the preferred option, it is
the only compliant one of the three. The shop-level variant is **approved as
follows** (and reuse of the mixed wording with this substitution is
authorised):

> **Mixed catalogue, empty basket:** "Some items in this shop are custom-made
> and cannot be returned. The 14-day right of return applies to all other
> items — details at checkout."
> **All-custom catalogue:** the approved custom-made notice.
> **Fully returnable catalogue:** the approved return notice.

The seller block's "(see below)" remains satisfied in every state because a
notice always renders — no approved C1.1 copy is edited. The catalogue-state
derivation must recompute when the catalogue changes (event-driven or on
render, not cached stale). With this, the last counsel blocker on
`GOODS_COMMERCE_ENABLED` is closed; the remaining flip conditions are
engineering evidence (FA-series), not rulings.

## 6.3 §1C — the ledger row

**R5 Q6 — void and re-record. Not a cover-note explanation.** The row was
recorded before both of its later-attached preconditions, binds to the wrong
artifact (a policy label rather than the Terms/deployed set), and is currently
satisfying a live gate slot. The entire value of the version-bound ledger is
that a recorded key is evidence; an explained-but-standing defective row
converts the ledger from evidence into narrative. Void it, and re-record at C1
against the deployed artifacts with the E2 and C2 evidence attached. This is
the strict answer and the favourable one: a clean chain is what makes every
*other* row in that ledger worth something if anyone ever asks.

## 6.4 §1D — DSA build inputs

**R6 Q1 — confirmed: the small-enterprise ceiling, both limbs.**
Recommendation 2003/361: small enterprise = **fewer than 50 staff AND annual
turnover or balance-sheet total ≤ EUR 10,000,000**. Seed **10,000,000 EUR** as
the turnover ceiling **and add the headcount input (50)** — status is lost
when *either* limb is exceeded, so alert on either. Two refinements: set the
early-warning alert at **EUR 8,000,000** (80%, consistent with the house
threshold style); and note in the row that under Annex Art. 4(2) of the
Recommendation, status changes only after the ceiling is exceeded over **two
consecutive accounting periods** — so an alert is a review trigger, not an
automatic loss of the exclusion. Release the held migration once seeded.

**R6 Q2 — your reading is correct; keep both lines.** The trader-traceability
trigger row cites **Article 29 / Section 4** (that is what the row monitors).
The **Article 19 / Section 3** line stays as a separate note covering the
platform-duty exclusion (Arts. 20–28) — different section, different
exclusion, both accurate. Correct nothing; separate them clearly.

**R6 Q3 — 72 hours, as a stated aim, with an immediate-interim measure for
the worst case.** Adopt: acknowledge 24h (unchanged); **"we aim to decide
within 72 hours"** for the image-without-consent category — an aim, not a
firm contractual SLA (DSA Art. 16 requires timely, diligent, non-arbitrary
handling; a stated target satisfies that without manufacturing a breach claim
out of every miss). One addition: where the reported image is manifestly
intimate or the report is credible on its face, **temporarily disable the
image on receipt pending the decision** — interim removal is the lower-risk
error in both directions. Put the aim in the procedure and the
acknowledgement copy; put the interim-disable rule in the procedure only.

## 6.5 §1E — approved

Build the §7.5 escalation to cover the unreadable balance. The correction to
the earlier reasoning is accepted: an unreadable balance is not a legal claim,
it is an evidentiary failure, and it belongs in the escalation path. Addition:
a *persistently* unreadable balance (beyond the retry window) is an
operational incident to raise with Stripe support at escalation time, not a
state to carry silently into annual review.

## 6.6 §2 — both independent reviews: commission now

**(1) LO-5 DPIA review** — commission, with the amendment disclosure exactly
as drafted. One records instruction first: the 2026-08-04 factual corrections
to a signed document must be **initialled and dated by the controller** (a
signed instrument amended post-signature without re-execution is a records
defect; the fix costs a signature). Re-sign or initial the corrections before
the reviewer sees it.

**(2) LO-10 round** — schedule within **two weeks**, hard-stopped by the
boundary: **no beta artist takes real client money before it closes.** The
founder-run live test (2026-08-03) was inside the boundary; the next step is
not. The three asks stand as listed; the forfeiture item should arrive at the
round with the time-graduated/capped shape as the working draft, per the
standing preliminary direction.

## 6.7 §3 — the overdue instruction, now time-boxed

**SEED-DEL-001:** one investigation pass, **one week**. If the mechanism can
be determined, record it. If it cannot, record *that* formally — the finding
becomes "unexplained privileged write access, mechanism undetermined," and the
compensating control is the credential remediation already sitting at the top
of the Art. 32 backlog (round-2 §5.4): scope or rotate the eleven-endpoint
credential and record the two together. An unexplained deletion plus an
unscoped master credential is one finding, not two. Either way the register
row closes with a dated record; it does not stay `open/not-started` a third
round. The Q9-sibling records proceed as instructed; no change.

## 6.8 §4 — the C1 map: confirmed, plus the three unblocks it needs

The sequence is confirmed as stated (answers → one Terms version → evidence →
one sign-off). Three specific unblocks:

1. **The screenshot problem (#2) is resolved as follows:** the deployed-
   artifact condition's purpose is that what is approved is what runs — not
   that consumer sales be publicly active before approval. **Evidence
   standard: a screenshot from the production build (same commit hash as the
   release candidate) with the launch flag enabled for an internal test
   account, captured with the commit hash recorded alongside.** That satisfies
   the condition; public activation is not required to produce evidence.
2. **The five ride-along Terms items are confirmed as mandatory riders** on
   the single C1.9 bump — item 4 (the §11 "you buy as a business" sentence)
   is not optional cleanup: it describes a control that does not ship, and a
   Terms document asserting a nonexistent checkout control fails on its face.
   Items 1 and 5 are go-live-mechanical; 2 and 3 carry the accountant and
   DPIA conditions already ruled.
3. **The two formalities are closed here:** (i) the corrected 2026-07-24
   Terms text (hash `61c30c65…`) is **confirmed** — the substance was reviewed
   and approved 2026-07-24/31; this sentence is the explicit record that was
   missing. (ii) C9 renewal reminders are confirmed as a **pre-yearly-plan
   item only**; the monthly launch is unaffected; monitor the Digital Fairness
   Act proposal alongside it.

**BILL-CONF-001 disclosure (component #3):** acceptable to carry as a
disclosed residual *only if* the degraded path (email sends without Terms
text) also emits a monitoring event and a follow-up resend is part of the
runbook. An Art. 8(7)-defective confirmation that nobody notices is a silent
compliance failure; one that alerts and gets a corrective resend is an
incident with a remedy.

**DPIA-GAL-002 (flagged, not asked):** the counsel view, for the founder
decision: **wire the guard (option a).** The recorded keys were written as
gate preconditions by the signed DPIA; making them attestation-only requires
amending a signed document a second time. If (b) is nonetheless chosen, the
§7 amendment follows the same initial-and-date rule as 6.6(1).

## 6.9 Answer index

| Item | Ruling |
|---|---|
| R5 Q5 | `privacy.md`; same C1.9 pass; hash-bind it |
| R5 Q2 | In, as drafted |
| R5 Q3 | Ratify (a) — the full refund is Art. 14(4)(a)-required, not a departure |
| R5 Q4 | Accept as drafted; verify the buyer-side sentence on the model-form page |
| R5 Q1 | (c); shop-level variant approved verbatim above; (a) unavailable |
| R5 Q6 | Void and re-record at C1 against deployed artifacts |
| R6 Q1 | EUR 10m ceiling + 50-staff input, alert on either; 8m early warning; two-period rule noted |
| R6 Q2 | Art. 29/Section 4 for the trigger; Art. 19/Section 3 stays as a separate note |
| R6 Q3 | Aim of 72h + 24h acknowledge + interim-disable for manifest cases |
| §1E | Approved; persistent unreadability = operational incident |
| §2(1) | Commission; controller initials the post-signature amendments first |
| §2(2) | Schedule ≤ 2 weeks; hard boundary before beta client money |
| §3 | SEED-DEL-001 time-boxed one week; pair with the credential remediation |
| §4 | Sequence confirmed; screenshot standard defined; five riders mandatory; both formalities closed |
