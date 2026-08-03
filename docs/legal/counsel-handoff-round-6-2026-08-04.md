# Counsel handoff, round 6

**Date:** 2026-08-04
**Follows:** `docs/legal/counsel-handoff-round-5-2026-08-03.md`
**Subject:** three NEW questions surfaced by building the last answered-but-unbuilt
item (Q16 gallery notice-and-action), plus a status update on what shipped to
production since round 5, plus a pointer to the round-5 questions still awaiting
your answer.

We are not re-asking anything you have answered. Round-5 §7 lists what is
settled; nothing here reopens it. The three questions in §2 are genuinely new
and did not exist until the Q16 build made them concrete.

---

## 0. What changed since round 5: the build is now DEPLOYED (dark)

Round-5 §0.2 said "nothing in the consumer or goods build is deployed." That is
no longer true, and the change is structural enough that you should have it:

- **The full go-live schema and code are now in production, still dark.** Under
  an explicit founder go on 2026-08-03, migrations `0125-0154` were applied to
  the production database (catalog-verified object by object) and `master` was
  pushed and deployed. `consumer_sales_launch_approved` remains unrecorded and
  `GOODS_COMMERCE_ENABLED` remains unset, so **no commercial surface is live**:
  the shop routes 404, nothing sells. This is the "release candidate pushed,
  migrations applied" half of your §5.5(1) as-deployed condition, now satisfied;
  the approval-key half is untouched and still gates activation.
- **Connected-account webhook delivery was built and verified.** Your LO-10
  world involves real client money through Connect; the platform now receives
  and verifies `account.updated` from connected accounts (it did not before).
  No consumer or subscription surface is affected; this is Connect plumbing.
- **Q16 (this document's subject) is being built now.** Your round-2 Q16
  notice-and-action for gallery images, adopted as DPIA mitigation R1, was the
  last of your answers that was fully specified and unbuilt. It is in progress:
  the "image of me without consent" report category and its Article 16(5)
  acknowledgement have shipped to the branch; the durable moderation queue, the
  storage-object takedown action, and the DSA-procedure section are next. This
  discharges R1; **we are not asking you to re-approve Q16.**

None of the above changes an answer you gave. It is the context for the three
questions below, two of which are Q16/Q20 implementation details and one of
which is a citation check.

---

## 1. Why these three, and not more

Building Q16 and the DSA Section 4 trader-traceability trigger (your round-2 Q20
second half) forced three decisions that we cannot make ourselves because each
is a legal figure, a legal citation, or a legally-loaded timing choice. Everything
else the build raised, we decided and logged under the build-first mandate (for
example: the moderation queue is a real database table rather than email-only,
because "a queued item in the moderation workflow" has no durable home
otherwise; the takedown deletes the underlying storage object in the private
gallery buckets, not merely the on-page render). Those are engineering calls.
The three below are yours.

---

## 2. Three new questions

### Q1 (round-6) — the small-enterprise ceiling to seed into the threshold monitor

**Situation.** Your round-2 Q20 answer said the DSA Section 4 trader-traceability
duties are excluded while Inklee is micro or small, and told us to add that
trigger to the same monitoring table as the VAT thresholds so one quarterly
check covers both. We built the row. The monitor needs a NUMBER: the turnover /
balance-sheet ceiling at which Inklee stops being a **small** enterprise under
Recommendation 2003/361 (the exclusion survives while EITHER micro OR small, so
the trigger that matters is crossing the *small* ceiling, not the micro one).

**What we believe, and why we will not put a figure in code.** Recommendation
2003/361's small-enterprise ceiling is < 50 staff **and** annual turnover or
balance-sheet total ≤ EUR 10 million. But which of turnover or balance sheet
governs, whether the linked/partner-enterprise aggregation rules apply to
Inklee's structure, and the exact figure to alert on are a legal determination,
and our own rule (learned the hard way on the VAT thresholds) is that a
statutory figure is never invented in engineering. The row ships with the
correct SHAPE and a documented placeholder; **the migration is not applied to
production with a real figure until you confirm the number.**

**The decision we are asking for.** The exact ceiling (in EUR) to seed as the
Section-4 trigger, and confirmation that the small-enterprise ceiling (not the
micro one) is the right alert point. If the answer is "monitor staff headcount
too," tell us and we will add that input.

**What it blocks.** Only the accuracy of one monitoring row. Not the launch:
Section 4 duties are excluded today regardless, and the row already alerts
conservatively. But an alert set to the wrong figure is worse than none.

### Q2 (round-6) — Section 3 or Section 4? a citation to get right before we write it into the record

**Situation.** Our DSA moderation procedure's "revisit if Inklee stops being a
micro enterprise" note currently cites **Article 19 excluding Inklee from
Section 3**. Your round-2 Q20 answer framed the trader-traceability exclusion as
**Section 4, excluded by Article 29** ("as Section 3 was by Article 19"). Both
statements can be true at once (Art. 19 excludes small/micro from Section 3's
platform duties; Art. 29 excludes them from Section 4's trader-traceability
duties), but the note that will sit next to the new monitoring row needs to cite
the exclusion that actually governs **that row**, and the row is about Section 4
trader traceability.

**The decision we are asking for.** Confirm the citation for the threshold's
revisit trigger: is it Article 29 / Section 4 (our reading, since the row
monitors the trader-traceability trigger), and should the older Article 19 /
Section 3 line stay as a separate note about the Section 3 platform duties, or
be corrected? We will write exactly what you confirm and nothing else.

**What it blocks.** Only the legal citation in an internal procedure document.
Cheap to get right, embarrassing to get wrong in a document a regulator could
one day read.

### Q3 (round-6) — the takedown window for an "image of me without consent" complaint

**Situation.** The Q16 route lets a person depicted in a hosted tattoo photo ask
for it to come down. That complaint is health-adjacent and privacy-loaded (a
tattoo photograph can reveal a body, a location, an identity). Our general DSA
procedure gives a flat 14-day decide-and-act target and already allows "shorter
for serious cases." We think this category should sit at the fast end, but the
exact commitment we publish is a legal choice, not ours.

**What we believe.** A shorter, explicit window for this category (for example,
act within 72 hours of a well-formed request, or expedite pending review) both
serves the data subject and reduces the misleading-omission / distress exposure
of leaving a non-consensual image up while a generic 14-day clock runs. But
committing to a window we then miss is its own liability, so the figure is yours.

**The decision we are asking for.** The target window (and whether it is a firm
commitment or a "we aim to") for the image-without-consent category
specifically. We will put exactly that in the procedure and, if you want, in the
acknowledgement copy.

**What it blocks.** The wording of one procedure section and, optionally, one
line of the automated acknowledgement. Not the launch.

---

## 3. Still open from round 5, awaiting your answer (NOT re-asked)

These are round-5 questions you have not yet answered; we list them so round 6
does not read as if they lapsed. Full text and evidence are in round 5; nothing
has changed on them.

- **Round-5 Q1** — the standalone shop's browse panel prints the full 14-day
  return notice on an empty basket. One decision (a/b/c). **This is the only
  item that blocks the shop switching on.**
- **Round-5 Q2-Q5** — four narrow C1.9 rulings to fold into the single
  consolidated confirmation pass (the failed-refund disclosure sentence; the
  "same arithmetic" deferral wording; the Q7 single-audience phrasing; the C1.4
  privacy-text placement).
- **Round-5 Q6** — the unexplained `consumer_withdrawal_copy_approved` ledger
  row; whether to void and re-record it against the deployed artifacts.
- **Round-5 Q7 / LO-10** — schedule the deposit-fee round. Its boundary (real
  client money through beta artists) is now the next step, and the live-money
  test that used to sit before it has happened (round-5 §0.2).

## 4. Still owed to you from round 3, unchanged

The round-3 §6-§7 record work remains ours to complete and is not a question:
the Article 33(5) breach records (the Q9 sibling record with the Stripe
cross-reference, the Q10 record's amendments, the hosting-history lookup). We
flag it so the gap stays on the record rather than being discovered later.

---

## 5. The one remaining gate is still C1

Everything above feeds the single consolidated C1 sign-off, which is open by
design, not un-answered. The product and the drafts now largely exist and are
deployed dark; what C1 needs is the finished package submitted and confirmed
against the artifacts as deployed. Round 6 does not change that; it removes three
build-time unknowns and reminds you of the round-5 items in flight.

Every claim above is traceable to a commit, a migration, a file, or an entry in
`docs/audit/findings.yaml`.
