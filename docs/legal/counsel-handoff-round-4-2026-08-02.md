# Counsel handoff, round 4

**Date:** 2026-08-02
**Follows:** `docs/legal/counsel-handoff-round-3-2026-08-02.md` (round-3 answers are its §6 and §7)
**Subject:** four gaps in our implementation of your round-2 answers, plus three questions that
only surfaced once the code existed.

---

## 0. Orientation

Your round-2 answers are largely implemented. Eight of twelve items are faithful to what you
wrote. This document is about the other four, and about three questions the implementation raised
that nobody could have asked in advance.

**Three of the four are our errors, and one repeats a mistake you already corrected once.**

### How this was checked, and what that is worth

Three independent reviewers went over the implementation, each briefed on a single axis: can the
tests actually fail, do the migrations converge, and does the code match what you instructed. None
of them wrote any of the code they reviewed. The fidelity reviewer was told explicitly to treat
**over-implementation as seriously as under-implementation**, and that instruction is the only
reason §2 below was found at all.

They produced 21 findings between them. This document carries the ones that need your judgment
rather than ours.

**Most fixes in this build were written and tested by the same person.** Independent verification
is the exception here, not the rule. Stated once, rather than caveated line by line.

### Nothing in this document is deployed

Production carries an earlier build plus five defect fixes shipped separately this morning. The
consumer and goods surfaces have never been live: no live-mode charge has ever been taken, and the
goods commerce flag has never been enabled in any environment.

---

## 1. Two instructions we did not meet

### Q7 — the Terms clause your permission was conditioned on

Your Q7 answer approved naming Inklee as an alternative recipient for withdrawal notices,
**conditional on a Terms clause carrying the forwarding-without-delay rule**. We built the naming.
We did not write the clause, and it was not queued in the C1.9 input package.

The shipped state therefore names Inklee **without the condition that permits it**. This is the
more serious of the two, because the condition was the whole point of the permission.

Now queued.

### Q12 — the pro-rata refund clause exists only in a report

Deletion during an active paid subscription now ends the subscription and refunds the remainder
pro rata, as instructed. The implementing engineer drafted the corresponding Terms clause and
reported it to us. **It was never added to the C1.9 package**, so the behaviour ships without the
document that describes it.

Now queued. Nothing to decide unless you disagree with the drafted wording; we are reporting it
because the round-3 handoff implied both clauses were in hand and they were not.

### Q5 — a "scheduled fast-follow" that was nowhere scheduled

You accepted point of sale as the minimum and treated the product-page badge as a scheduled
fast-follow. We described it that way and then did not schedule it. Now on the worklist.

---

## 2. Something we did that you did not authorise

**The order receipt suppresses the model withdrawal form for all-custom-made orders.**

You gave no such carve-out. It rests on an Art. 6(1)(h) reading that engineering made itself and
did not put to you.

Deviation D6 exists precisely because we over-corrected once before and withdrew a commercial
claim nobody told us to withdraw. **This is the same shape, in code written while implementing
that correction.**

We are not asking you to bless it. We are asking which you want:

- **Restore the form unconditionally** and treat the carve-out as never having been proposed, or
- **Rule on the carve-out** if you think it is right, so that it rests on your reading and not
  ours.

**Until you answer we will restore it unconditionally**, on the basis that a self-made legal
determination sitting in shipped code is the worse of the two states.

---

## 3. Three questions only the implementation could raise

### 3.1 "The rate covers cost" is amount-dependent, and you wrote it as a cohort property

Your D6 condition renders the claim where the fee payer is Inklee **and** either the rate covers
processing cost or a founder approval exists. Working the arithmetic:

| Cohort | Break-even | Consequence |
|---|---|---|
| 3% | EUR 16.67 deposit | Covers cost above it, a subsidy below it. Worst case about EUR 0.25 per charge, under EUR 0.10 at a EUR 10 deposit. |
| 0.5% | never | Sits below Stripe's variable component alone, so the fixed term is not even what breaks it. Amount-INDEPENDENT. |

So the question is narrower than it first appears. **Only the 3% cohort has a threshold at all**,
and for the 0.5% cohort our cohort-level implementation is exactly correct rather than an
approximation.

**Question.** Does a sub-EUR-16.67 deposit at 3% count as a subsidy requiring the founder
approval, or as rounding?

We have deliberately **not** encoded the EUR 16.67 threshold. Doing so would pre-decide the
question, and it would arrive in the code later as an unexplained constant with no trace that
anyone had asked.

### 3.2 Q1 — the tax-ledger purge only reaches deleted accounts

We scoped the purge to de-identified rows, so it reaches snapshots belonging to deleted accounts
only. **A live artist's eight-year-old snapshot is retained indefinitely.** You were never asked
about the live-account case; we took the conservative direction and retained.

**Question.** Should the horizon apply to live accounts too?

### 3.3 Q13 — seven years is no longer an upper bound

The Connect pointer purge is conditioned on teardown completing, and teardown requires a zero
balance across every bucket. An account with a permanently non-zero balance therefore **never
completes, and its pointer is never purged**.

That follows directly from what you specified. It does mean the stated seven-year period is not
actually a maximum.

**Question.** Do you want a backstop: a hard deletion deadline regardless of teardown state, or an
operator escalation path?

---

## 4. What is built, and what that claim is worth

| Item | State |
|---|---|
| Q2 / D1 | Mixed bundles blocked at creation; our earlier rule withdrawn. Zero existing mixed bundles, verified against production. |
| Q8 | `orders` and `order_items` are service-role-write-only. A seller can no longer rewrite a disclosure on a completed sale. |
| Q11 | Public intake carries the five abuse controls. Production has never received a submission, so the retention gap is prospective only. |
| C1.10 | Refund ledger survives deletion. The §11 cross-check you ordered has now actually been performed and recorded. |
| D3 / D4 / Q14 | Weekly cadence, event-anchored clock, dry-run with evidence and per-block alerting. |
| Q1 / Q12 / Q13 | Tax-ledger horizon, deletion refund, Connect teardown. Subject to §3 above. |

### One compliance guard has no test that can fail it

The append-only guard your Q1 answer depends on has three DELETE conditions. **Only one is
covered.** Removing the horizon check from the trigger leaves the whole suite green, so nothing
would catch a future edit that removes it.

Being fixed. Recorded because "tested" and "tested against removal" are different claims, and we
have conflated them before.

---

## 5. What is not done

- **The Q14 dry-run has never executed against a deployed database.** Two of your three elements
  are built and tested; the third has not happened. The honest description is "implemented,
  monitored, never executed in production", and we are deliberately not using your phrase
  "implemented with monitored execution" until a real run exists.
- **The LO-5 DPIA still has no owner and no date**, which you named as the largest open risk in
  the package. Its scope has grown three times and it remains absent from the ordered plan.
- **The upload-consent gap is now reached by two independent routes**: your Q15 answer on
  direct-upload attestation, and separately a cross-check finding that reference images carry no
  affirmative consent gate at the point of upload, only a discouragement in the privacy notice.

---

## 6. Sign-off conditions, unchanged

Your §5.5 conditions stand. Approval is recorded against artifacts **as deployed** — release
candidate pushed, migrations applied, and the confirmation screenshot taken from the live surface
— before any approval key is recorded.

The activation gates (`consumer_sales_launch_approved`, `GOODS_COMMERCE_ENABLED`) remain closed
and will not be opened on a provisional answer.

---

Every claim above is traceable to a commit, a file, or an entry in `docs/audit/findings.yaml`.
Where we say something is unverified, that is a statement about our evidence rather than a hedge.

---

## 7. Answers (counsel review, round 4, 2026-08-02)

### 7.1 On §1 — the two missed conditions and the unscheduled fast-follow

Acknowledged, with one requirement: **both clauses (Q7 forwarding-without-delay, Q12
delete-and-refund) land in the single C1.9 Terms version** — not a later one. The Q7 lapse is
the instructive one: a conditional permission was implemented without its condition. Since the
surface is dark there is no live gap, but the pattern to fix is procedural — when an answer
says "conditional on a Terms clause," the clause enters the C1.9 input package **in the same
work item** as the code, so the two cannot separate again. Q5's scheduling is accepted as now
done; the worklist entry is what "scheduled" means, nothing less.

### 7.2 On §2 — the carve-out is ratified on the correct legal basis, with two conditions

Restoring unconditionally while awaiting a ruling was the right default, and raising this
rather than defending it was the right instinct. Now the ruling, which **ratifies the
carve-out** — engineering's reading lands in the right place, though the cleaner basis is the
pairing of Art. 6(1)(h) with Art. 6(1)(k): the model-form duty applies **where a right of
withdrawal exists**; where it does not, the required content is instead the **statement that
the consumer will not benefit from a right of withdrawal**. For an order in which every line
validly carries the custom-made claim, no withdrawal right exists, so the form is not owed —
the 6(1)(k) statement is. Two conditions:

1. Suppression triggers **only** when every line of the order carries a validly disclosed,
   snapshot-frozen custom-made claim (the Q8 hardening makes that snapshot trustworthy — the
   two answers depend on each other).
2. When suppressed, the receipt must carry the no-withdrawal statement **prominently** (the
   approved custom-made notice satisfies this if rendered per line and in the summary).

Any order with even one standard line gets the form. The failure mode to respect: if a
custom-made claim is ever invalid (mis-flagged, undisclosed), the suppressed form compounds
the Art. 10 exposure — which is exactly why condition 1 is strict. Re-apply the carve-out on
this basis and cite this section in the code comment, so the determination rests here and not
in engineering.

### 7.3 On §3.1 — rounding, and do not encode the threshold

The claim "no separate card-processing fees" states who bears the cost, and it is true at any
amount in both cohorts. The founder-approval condition exists to record **subsidy by design**
— a rate that cannot cover cost at any amount, which is the 0.5% cohort and only that cohort.
A sub-EUR-16.67 deposit at 3% is incidental rounding inside a rate that covers cost in the
ordinary case: **no founder approval required, cohort-level implementation stands.** The
decision not to encode EUR 16.67 is expressly endorsed — record this ruling in the decision
log instead, so the constant never appears and the reasoning survives.

### 7.4 On §3.2 — yes, the horizon applies to live accounts

The retention basis for a tax snapshot is the accounting obligation, which is time-bound —
seven years from financial-year end — and **indifferent to whether the account still exists.**
A live artist's eight-year-old snapshot has exhausted its Art. 6(1)(c) basis and storage
limitation applies. Extend the purge to all snapshots past the horizon regardless of account
status, with one carve-out: rows subject to an open dispute, audit, or litigation hold are
excluded case-by-case (Art. 17(3)(e)), flagged rather than silently skipped. First eligible
row is years away; build it now while the trigger is already being corrected (§4), and note
the same fix must cover the trigger-test gap — a compliance guard is tested only when its
**removal** fails the suite. Adopt mutation-style verification as the standard for every
guard this process has created.

### 7.5 On §3.3 — escalation path, not a hard delete

No blind deletion deadline: force-deleting a Connect account with a non-zero balance orphans
money and forecloses refunds — a worse outcome than retention, and the retention has a lawful
basis while the balance is unresolved (Art. 17(3)(e); the balance *is* the legal claim). What
is not acceptable is **silent** indefinite retention. Backstop: at the seven-year mark, an
uncompleted teardown raises an **operator escalation** — an alert and a case — and the
continued retention becomes a documented, per-account decision reviewed **annually** with the
reason recorded (unresolved balance, amount, what resolution requires). The stated period then
remains honest: seven years, or documented cause.

### 7.6 On §4 and §5 — acknowledgments and one escalation

The Q2/Q8/Q11/C1.10/D3/D4/Q14 completions are acknowledged; the §11 cross-check being
actually performed closes that instruction. The refusal to use "implemented with monitored
execution" before a real Q14 run exists is precisely right — keep the honest phrasing until
the first production dry-run report exists. The upload-consent gap arriving by two
independent routes confirms the Q15 answer's priority: build the direct-upload attestation
**together with the LO-5 DPIA work**, not after it.

**The escalation: the LO-5 DPIA is now the critical path, and this is its third consecutive
round without an owner or a date.** It is release-gating by prior decision, its scope has
grown three times (booking images → gallery + guest checkout → intake form + seeded dataset +
upload consent), and every other launch-blocking item now has an owner and a state. This
cannot be cured by another counsel round — it is a founder assignment. **Requirement: owner
and date recorded in the ordered worklist before the next handoff round; if the next round
arrives without it, that round's first line should say why.**

### 7.7 Answer index

| Item | Ruling |
|---|---|
| §1 Q7/Q12 | Both clauses into the single C1.9 version; condition-and-code travel together from now on |
| §2 carve-out | Ratified on Art. 6(1)(h)/(k) basis; strict all-lines-valid trigger + prominent no-withdrawal statement |
| §3.1 | Rounding — no founder approval at 3%; threshold stays unencoded; ruling recorded in decision log |
| §3.2 | Horizon applies to live accounts; dispute/hold carve-out; mutation-test the guard |
| §3.3 | No hard delete; operator escalation at 7 years + documented annual review |
| §5 LO-5 | Founder must assign owner + date before the next round; now the critical path |
