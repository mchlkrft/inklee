# Counsel handoff, round 5

**Date:** 2026-08-03
**Follows:** `docs/legal/counsel-handoff-round-4-2026-08-02.md` (round-4 answers are its §7)
**Subject:** seven decisions. One blocks the shop switching on, five block the final sign-off,
one blocks nothing today but its boundary has moved much closer. Plus a list of your earlier
instructions we have not yet met, with no question attached to them.

---

## 0. The LO-5 DPIA, first line, as you required it

Round 4 §7.6 said: *"owner and date recorded in the ordered worklist before the next handoff
round; if the next round arrives without it, that round's first line should say why."*

**It is done, and more than done.** The LO-5 DPIA is complete and signed: owner Michel Kraeft
(founder and controller, confirmed 2026-08-02), controller decision recorded and signed
2026-08-03, at `docs/legal/lo-5-dpia.md`. Sections 1-5 were prepared by engineering from
evidenced facts; sections 6-8 (necessity, risk acceptance, sign-off) were adopted by the
controller, not by the engineer who built the system. Outcome: residual risk **not high** within
Art. 35(7)/36, no prior consultation required, seven risks dispositioned in §7, three of them
(R3 direct-upload attestation, R4 signed gallery URLs, R6 intake purge) wired as named
preconditions in the activation-gate ledger rather than as prose conditions.

**One thing is still wrong and we are not smoothing it.** The ordered worklist row you actually
asked to be fixed still reads `TARGET DATE: NOT SET`
(`docs/product/go-live-worklist.md:172`). The document moved and the worklist row did not. So
the literal instruction, "recorded in the ordered worklist", is met on owner and stale on date.
That is a bookkeeping failure in the exact artifact you named, and it is the second time in this
build that a thing was true in a document and false in the plan.

**A second gap in the same family, reported rather than found later.** R1 of the DPIA (the Q16
notice-and-action route) was adopted as a mitigation by the controller but was **not** given a
gate key, unlike R3, R4 and R6. So the gallery capability can be granted with R1 unbuilt. See
§4.2.

---

## 0.1 Round-5 numbering is independent of every earlier round

**Q1 to Q7 in this document are round-5 numbers only.** They are not continuations of the
Q1-Q20 series in `counsel-handoff-2026-08-02.md`, and they have no relationship to round 4's
§3.1-§3.3. Round-5 Q1 is not round-2 Q1.

We are stating this because the ambiguity has already produced one error here: an internal
open-items list carried round-2 "Q1, tax-ledger purge scope" as an unanswered question **after**
round 4 §7.4 had answered it, and it was queued for re-asking. Re-asking an answered question
invites a second, possibly contradictory answer, which is the failure mode this whole process is
built to avoid. When we refer to an earlier round's question we will always write it as
"round-2 Q1" or "round-4 §3.2", never bare.

---

## 0.2 Deployment status, and one thing that changed

Nothing in the consumer or goods build is deployed. Local `master` is 213 commits ahead of the
deployed branch (it was 186 when you wrote the as-deployed condition), with migrations 0125-0150
unapplied. `GOODS_COMMERCE_ENABLED` has never been enabled in any environment and no shop has
ever been visible to a buyer. `consumer_sales_launch_approved` is unrecorded.

**What changed: a live-money charge now exists.** On 2026-08-03 the G-5 test ran against
production with real money on an internal account: a live card deposit of EUR 1.00 created and
paid, routed as a destination charge, the booking flipped by the live webhook, the fee
sponsorship booked at settlement and released on refund. Recorded as FD14 in
`docs/product/plus-build-time-decisions.md:1692`. This does not touch the consumer surfaces, and
it is not a subscription charge. It matters here for one reason only: your LO-10 boundary is
"close before beta artists take real client money", and the founder-run test that used to sit
before that boundary has now happened. See Q7.

---

## 1. What blocks the shop switching on

One question. It is the only item in this round that is specific to the goods surface and would
not otherwise be caught by the sign-off chain.

### Q1 — the shop's browse panel promises a 14-day return before anything is picked

**Situation.** On the standalone shop's browse step (`/{slug}/shop/checkout`, the "pick" phase),
the disclosure panel derives from the current selection. With an empty basket,
`summarizeReturnDisclosure([])` returns `"empty"`, and the panel treats `"empty"` identically to
`"all_returnable"`, printing the full return notice: *"Right of return. You may withdraw from
this purchase within 14 days of the day you (or someone you nominate) receive the goods, without
giving a reason..."*

An empty basket is the **normal landing state** of a browse surface. So for an artist whose
entire catalogue is custom-made, the shop's headline disclosure promises a return right that
applies to nothing on sale.

**Evidence.**

- `packages/shared/src/consumer-disclosures.ts:349` — `if (items.length === 0) return "empty";`
- `apps/web/src/app/[slug]/shop/checkout/shop-checkout.tsx:489-491` — the pick-screen summary is
  computed over selections plus persisted cart lines, so it is `"empty"` on landing.
- `apps/web/src/app/[slug]/shop/checkout/shop-checkout.tsx:149-151` —
  `{(disclosure === "all_returnable" || disclosure === "empty") && <p>{returnNotice}</p>}`. This
  is the line in question.
- `apps/web/src/app/[slug]/shop/checkout/shop-checkout.tsx:862-866` — the panel on the pick
  screen.
- `packages/shared/src/consumer-disclosures.ts:119` — the approved C1.1 seller block, rendered
  directly above: *"You have a 14-day right of return (see below). Items marked 'custom-made'
  cannot be returned."*
- `packages/shared/src/consumer-disclosures.ts:373` — the appointment add-on lane does the
  opposite: `if (summary === "empty") return [];`, so it renders no disclosure sections at all on
  an empty basket, seller block included.
- Written up in full at `docs/product/plus-open-decisions-handoff.md:470-508`.

**What engineering believes, and why we did not fix it.** We think this is genuinely arguable in
both directions, and we deliberately did not act.

- *Why the current behaviour is not obviously wrong.* The C1.1 seller block renders above the
  notice, is approved verbatim, and already names the carve-out. Its "(see below)" is a reference
  to exactly the notice in question, and every catalogue row carries its per-row custom-made
  marker. Suppressing the notice on an empty basket would leave approved copy pointing at
  nothing.
- *Why it might still be wrong.* Your round-2 Q5 reasoning was that surfacing "no return right"
  late invites misleading-omission arguments under the UCPD and, more practically, disputes. A
  prominent affirmative return promise on a shop where nothing is returnable is the stronger
  version of that concern.
- *The two payable surfaces differ, and both are internally coherent.* The add-on lane has no
  dangling reference because it renders nothing; the standalone shop always renders the panel.

We did not change it because any fix is a judgement about what approved consumer copy must say
and when, and that is yours. Deviation D6 and the round-4 §2 carve-out are both instances of
engineering making that call itself and having to unwind it. **We are flagging, not deciding.**

**The decision we are asking for.** One of:

- **(a) Leave as is.** The seller block above carries the carve-out, the per-row markers carry
  it, and the empty-basket state is transient. Nothing changes.
- **(b) Suppress the return notice on an empty basket and reword the seller block's
  "(see below)".** Note what this costs: it edits approved C1.1 verbatim copy, which is why we
  will not do it on our own initiative. It also makes the empty state carry the seller block with
  a reference to a notice that is not on screen unless we supply replacement wording.
- **(c) Derive the empty-state panel from the CATALOGUE's composition rather than the selection**,
  so an all-custom-made shop shows the custom-made notice and a fully returnable shop shows the
  return notice. This is the option we would pick if forced, because it keeps the approved C1.1
  block intact and truthful and makes the empty-state panel describe the shop rather than a
  basket that does not exist. **It has a gap you should price in:** a mixed catalogue with an
  empty basket has no approved wording today. The existing mixed wording says "Some items in your
  order are custom-made", which is false of an empty basket. Choosing (c) means either approving
  a shop-level variant ("Some items in this shop are custom-made and cannot be returned:") or
  telling us to reuse the existing mixed wording with that substitution.

**What it blocks.** The shop switching on (`GOODS_COMMERCE_ENABLED`, worklist FA12). Nothing
today: the surface is dark.

**Honest limit on our evidence.** No shop has ever been published, so the all-custom-made
catalogue is a prospective configuration rather than an observed one. We think it is a likely
first configuration for a tattoo artist selling commissioned pieces, but we cannot show you one.

---

## 2. What blocks the final sign-off

Five questions. All five ride inside the single C1.9 confirmation pass or the approval chain
around it, which is upstream of the shop flip too. The buckets in this document are ordered, not
disjoint: everything in this section must close before §1 can matter.

Four of the five (Q2 to Q5) are narrow rulings we want folded into the one consolidated
confirmation pass on the rendered Terms, **not treated as a separate round**. We are not asking
you to reopen anything.

### Q2 — the Q12 deletion clause is silent on a failed refund

**Situation.** Your round-2 Q12 answer required a Terms clause: account deletion ends the
subscription immediately and refunds the unused part of the current period pro rata. That clause
is drafted and queued in the C1.9 package. It says nothing about what happens if the refund
fails at the moment of deletion.

**Evidence.**

- `docs/legal/c1.9-terms-edit-inputs.md:359-364` — the drafted Section 11 bullet.
- `docs/legal/c1.9-terms-edit-inputs.md:382-398` — the optional sentence, drafted and held back.
- `apps/web/src/lib/server/billing/deletion-refund.ts:48-60` — the implementation records
  `refundState: "pending"` with the charge id and the amount owed, in the retained financial
  archive, and never blocks erasure. This follows your account-deletion §3 ("erasure is not
  blocked on financial resolution"). The code comment flags that you never addressed the failure
  case and that the opposite reading is defensible.

**What engineering believes.** The behaviour is right and matches your instruction. Whether to
disclose it is a consumer-copy judgement, and disclosing a failure path you have not ruled on is
the same shape as the round-4 §2 carve-out you had to ratify after the fact. So we drafted the
sentence, wrote "do not add it without a ruling" next to it, and left it out.

**The decision we are asking for.** Add this sentence to the Q12 bullet, or leave the clause
silent:

> Deleting your account is never held up by a refund. If the refund cannot be completed at the
> time, we keep the limited records needed to pay it and complete it afterwards.

**What it blocks.** The C1.9 Terms version (worklist FA9), which blocks the consolidated approval
(CL1) and `consumer_sales_launch_approved` (FA10). It must be answered **in** the confirmation
pass, because C1.9 is one version bump sent once.

### Q3 — we departed from your "same arithmetic" parenthetical, deliberately, and want it ratified

**Situation.** Your Q12 answer said that inside the 14-day window a deletion is *"simply
processed as a withdrawal, same arithmetic, existing machinery"*. The first and third are exactly
what was built. **The middle one is not true of the code**, and the gap favours the consumer.

**Evidence.**

- `packages/shared/src/billing.ts`, `computeWithdrawalProration` — refunds the **whole** period
  unless the consumer expressly requested immediate performance
  (`fullRefund = immediatePerformanceRequested !== true`), because without that request no
  proportionate deduction is lawful.
- So a deletion on day three by someone who never asked for immediate performance is refunded in
  full, not pro rata.
- `docs/legal/c1.9-terms-edit-inputs.md:366-380` — the departure, flagged there when the clause
  was drafted.

**What engineering believes.** Writing "the same calculation" into the Terms would promise a
smaller refund than the code actually pays, which is the wrong direction for a consumer term. So
the drafted clause says "we handle it as a withdrawal instead, under the consumer withdrawal
right in this section" and stops there, letting the withdrawal paragraph govern. **This is an
engineering judgement inside proposed Terms wording, and we are asking you to ratify or overturn
it rather than letting it pass unremarked.**

**The decision we are asking for.** Either:

- **(a) Ratify the deferral wording** as drafted, and the Terms stay silent on the arithmetic
  inside the withdrawal window; or
- **(b) Overturn it** and tell us the wording you want, if you intended the Terms to state a
  pro-rata result in that window (in which case the code, not the clause, is what has to change).

**What it blocks.** Same as Q2: the C1.9 version, therefore FA9, CL1, FA10.

### Q4 — the Q7 clause is written to the artist, but a buyer receives it too

**Situation.** Your round-2 Q7 permission to name Inklee as an alternative recipient for
withdrawal notices was conditioned on a Terms clause carrying the forwarding-without-delay rule.
That clause is now drafted and queued (round-4 §7.1 required it in this version, and it is in).
It addresses the **artist**, because `terms.md` is an artist-facing document throughout.

**Evidence.**

- `docs/legal/c1.9-terms-edit-inputs.md:291-295` — the drafted Section 13 clause.
- `docs/legal/c1.9-terms-edit-inputs.md:302-311` — the placement note raising this.
- The goods receipt reproduces the current Terms snapshot in full on the durable medium (your
  Q6(b); `buildOrderReceiptBody`'s terms section, sourced from the versioned snapshot in
  `apps/web/src/lib/server/goods-checkout.ts`), **so a buyer receives this document and will read
  a clause written to the artist.**
- The buyer-facing statement of the same rule already exists in plainer terms on the model-form
  page: `packages/shared/src/consumer-disclosures.ts:235-241`, *"A withdrawal sent to Inklee
  counts as received on the day Inklee receives it, and Inklee passes it to the artist without
  delay. Choosing Inklee costs you no time on the 14-day deadline."*

**What engineering believes.** The clause states the rule correctly and the buyer-facing version
already exists elsewhere, so we think single-audience phrasing is acceptable. We are surfacing it
because we would rather you look at it once than have it re-read later as an artist-only
undertaking.

**The decision we are asking for.** Accept the artist-directed phrasing as drafted, or give us
dual-audience phrasing for the same clause.

**What it blocks.** Same as Q2 and Q3.

### Q5 — does the C1.4 guest-buyer privacy text belong in the privacy policy rather than the Terms?

**Situation.** Your C1.4 answer approved a guest-buyer privacy notice plus a four-case retention
table. The notice text and the purges are implemented. What remains for the document layer is a
short pointer confirming the retention windows are documented. Most Inklee privacy language lives
in `content/legal/privacy.md`, not `terms.md`.

**Evidence.**

- `docs/legal/c1.9-terms-edit-inputs.md:197-217` — the item, and the open placement question.
- `docs/legal/c1.9-terms-edit-inputs.md:414-416` — execution-checklist step 2 holds the edit until
  you answer.
- Implemented already: the notice verbatim under the email input in `shop-checkout.tsx`; the four
  retention purges in `shop-retention.ts`, run by the `retention-purge` cron.

**What engineering believes.** It reads as privacy-policy material to us, but the retention
windows are commercially load-bearing for the goods sale, and you bundled it into the C1.9
version either way. We will not choose the document.

**The decision we are asking for.** `content/legal/privacy.md` or `content/legal/terms.md`. Both
land in the same C1.9 version.

**What it blocks.** The C1.9 edit cannot start without it, so FA9, CL1, FA10.

### Q6 — one approval row in the production ledger, recorded before its own preconditions

**Situation.** You asked in round-2 §5.5 that the §4.3 record be reconciled in the same pass,
because *"a ledger row nobody can explain fails the standard this process is built on"*. We have
now identified the row concretely, and it is worse than a bookkeeping mismatch. We are bringing
you the finding, not the reconciliation, and one correction to the reasoning in §4.3.

**Evidence.**

- `docs/legal/counsel-handoff-2026-08-02.md` §4.3 — the original: two legal documents say pending,
  an internal data pack says the production database shows the consumer withdrawal copy approval
  recorded on 2026-07-25.
- Still contradictory in HEAD today: `apps/web/src/lib/plus-launch-config.ts:7-12`,
  `docs/product/plus-open-decisions-handoff.md:82`, and
  `docs/product/plus-consolidated-review-handoff.md:94` all treat the key as unrecorded. The
  production query recorded on 2026-08-01 and `docs/product/pricing-model.md:146-150` say
  recorded.
- `scripts/billing/record-legal-approval.cjs:71` — the batch recorder that wrote the other legal
  keys **explicitly refuses to write this one**: `NOT recorded (preconditions): terms_approved,
  business_declaration_approved, consumer_withdrawal_copy_approved`. So the row was placed by a
  hand-edited run of the generic `scripts/billing/record-approval.cjs`, which leaves no committed
  trace of who ran it or against what artifact.
- `docs/legal/plus-launch-handoff.md:222-226` and `:317-319` — the two preconditions you attached
  to recording this key: the E2 durable-medium edit, and the C2 price-adjacent-to-button
  verification. The row predates both.
- **The correction to §4.3.** Your stated reason for calling the discrepancy moot was that the
  Terms hash change closes the key either way. That does not hold for this key.
  `apps/web/src/lib/server/billing/artifacts.ts:47-60` binds
  `consumer_withdrawal_copy_approved` to the `legal_policies` `withdrawal_policy` version label;
  only `terms_approved` binds to the Terms hash. If the withdrawal policy row was never
  re-versioned, and the E2 point was closed by verification rather than by a policy edit, the
  2026-07-25 approval is still current and is presently satisfying a b2c gate slot that three
  internal documents believe is empty.

**What engineering believes.** This is an unexplained row that is holding a gate, not a harmless
artifact. It should not survive into the sign-off.

**What we could not determine.** We could not determine who recorded the row, on what basis, or
against what artifact version, because the only writer that could have placed it leaves no
committed trace. We also did not re-query the production database for this round: the "recorded"
side rests on a query captured on 2026-08-01, and the binding claim above is a code-level
inference from `artifacts.ts`, not an observed fact. The read-only check
(`scripts/billing/gate-status.cjs`) is cheap and we will run it before the sign-off package is
assembled either way.

**The decision we are asking for.** Once we have re-queried and can show you the current state:
should that row be **voided and re-recorded against the deployed artifacts**, rather than merely
explained in the cover note?

**What it blocks.** The clean approval chain at the moment the final key is recorded. It does not
block the C1.9 edit.

---

## 3. What blocks nothing today

### Q7 — please schedule the LO-10 round; its boundary is now the next step

**Situation.** On 2026-07-31 you gave substantive **preliminary directions** on three deposit-fee
bundles and said they were positions to start the round from, not the round. Round 2 listed the
LO-10 round as unscheduled; round 3 §6.5 restated that LO-10 and the LO-5 DPIA "both remain
open"; round 4 did not close it. The DPIA is now closed. LO-10 is the last of the two.

**Evidence.**

- `docs/counsel-note-custom-connect-2026-07-21.md:230-254` — §7, the three bundles as recorded in
  the LO-10 brief.
- `docs/legal/counsel-handoff-2026-08-02.md:439` — "LO-10 round | Your standing item |
  Unscheduled. Boundary: close before real client money."
- `docs/legal/counsel-handoff-round-3-2026-08-02.md:235-243` — restated open, and listed as a
  standing item.
- `docs/product/go-live-worklist.md` Gate 3, CL8 — unchecked.
- Partially answered outside the round: AC4 (2026-08-01) classified the goods platform fee as a
  B2B service to the artist-as-trader, but told us to count everything to the threshold alert
  "until LO-10 confirms".
- `docs/product/plus-build-time-decisions.md:1692` (FD14) — the live-money test ran 2026-08-03.

**What engineering believes.** Nothing here is ours to decide. What has changed is timing: the
founder-run live test that sat before your boundary has happened, so "before beta artists take
real client money" is the next step rather than a distant one.

**The decision we are asking for.** Schedule the round, to close:

1. The **enforceable shape of client-cancel deposit forfeiture**. Your preliminary direction
   expected a time-graduated or capped rule rather than a flat non-refundable term (UCTD Art. 3
   and Annex).
2. **Confirmation of platform-fee revenue classification** for the Estonian and OSS registration
   thresholds. This feeds A2/AC2 and currently keeps threshold monitoring on the conservative
   over-counting rule.
3. Whether **absorbing losses under Custom Connect** (`losses.payments: application`) moves Inklee
   from platform toward payment-intermediary posture under the PSD2 commercial-agent exemption.

**What it blocks.** Not the Plus launch and not the shop flip. Its boundary is real client money
through beta artists, which is now the next step, and it keeps threshold monitoring conservative
until it resolves.

---

## 4. Your earlier instructions we have not yet met

No questions attached to any of these. They are ours to build, and we are listing them so the
gap is on the record rather than discovered later. Round 4 §7.1 told us that when an answer is
conditional, the condition travels with the code in the same work item. Two of the items below
are that rule failing again.

### 4.1 Round-2 Q20's P2B section is not in the C1.9 package

You ruled that the P2B Regulation applies at any size and that a short P2B section in the artist
Terms lands **in the same C1.9 version**. It is not in the package. A repository-wide search for
"P2B" or "2019/1150" hits only your own question and answer and one unrelated lockfile. There is
no P2B text, no code, and no worklist item.

This is the dangerous one, because C1.9 is a one-shot version bump: if the section is not in the
package when the edit runs, discharging Q20 costs a second Terms version and a second
`terms_approved` re-record. **We are drafting it into the package before the edit runs.** Nothing
for you to answer; the ruling is complete.

The second half of Q20 is also unbuilt: the micro/small enterprise threshold trigger for DSA
Section 4 was never added alongside the VAT thresholds. The threshold table
(`apps/web/supabase/migrations/0108_tax_posture_approval_model.sql:36-48`, extended by `0145`)
enumerates four threshold types and has no micro/small status row.

### 4.2 Round-2 Q16's four elements are all unbuilt, and the route has no owner

Your Q16 answer specified four concrete elements, and said that once they exist the second
condition of the C1.6 hosting grant for gallery images is discharged. None of the four is built:

- `apps/web/src/app/legal/report/actions.ts:21-29` — the report categories are illegal content,
  IP infringement, impersonation, harassment, spam or fraud, directory listing, other. There is
  no "image of me without consent" category. Element (1), half unbuilt.
- `apps/web/src/components/legal/legal-page-layout.tsx:16`, the map detail page, and the data
  attribution page are the only three links to `/legal/report` in the app. None is on a gallery,
  bio page or hub surface. Element (1), other half unbuilt.
- `apps/web/src/app/legal/report/actions.ts:49-53` — the action emails the operator inbox and
  sends an Art. 16(5) acknowledgement. There is no queued moderation item and no removal action,
  so nothing removes a storage object. Element (2) unbuilt.
- `docs/dsa-moderation-procedure.md` — 134 lines, zero occurrences of "galler". Element (3)
  unbuilt.

The DPIA adopted this as mitigation R1, but R1 has no gate key while R3, R4 and R6 do, and Q16
appears in no worklist entry. **So the gallery capability grant currently rests on an
undischarged condition with nothing to stop it.** We are adding the gate key and the worklist
entry. Your answer is complete and we are not re-asking it.

### 4.3 Round-4 §7.2's code-comment citation has not been applied

You ratified the model-form carve-out on the Art. 6(1)(h)/(k) pairing and instructed us to "cite
this section in the code comment, so the determination rests here and not in engineering". The
behaviour is correct and both of your conditions look satisfied (snapshot-frozen per line via
`custom_made_snapshot`; the no-withdrawal statement per line and in the summary). But
`packages/shared/src/consumer-disclosures.ts:454-458` still grounds the suppression in
engineering's own Art. 16(c) reading, with no reference to Art. 6(1)(k) or to your §7.2. The code
landed fourteen minutes after your rulings were committed and did not pick them up.

That is precisely the state round-4 §2 objected to, surviving the ruling that was meant to cure
it. Comment-only fix, ours, in flight.

*One thing we have not verified and are not claiming:* we confirmed the snapshot-frozen and
per-line legs by reading the code. We did **not** independently verify that the custom-made claim
was actually surfaced at point of sale for every line, which is the "validly disclosed" leg of
your condition 1. Treat that leg as unverified.

### 4.4 Round-4 §7.4 (live-account tax horizon) is ruled and unbuilt

You extended the seven-year horizon to all snapshots regardless of account status, with a
dispute, audit or litigation-hold carve-out that is flagged rather than silently skipped, and
said to build it while the trigger is being corrected. Both gates are still scoped to deleted
accounts: the RPC predicate at
`apps/web/supabase/migrations/0148_tax_ledger_purge_and_connect_teardown.sql:220-231` and the
independent trigger exemption at `:129-135`. A database test currently asserts the old behaviour
(`apps/web/tests/db/tax-ledger-purge.test.ts:186-194`) and will be inverted. There is no
litigation-hold column anywhere yet, so your carve-out has no storage. Ours to build; no question.

### 4.5 Round-4 §7.5 (Connect teardown escalation) is ruled and unbuilt

You rejected a hard deletion deadline and required an operator escalation at the seven-year mark
plus a documented, per-account annual review recording the unresolved balance, the amount, and
what resolution requires. What exists is one aggregate Sentry warning per cron run
(`apps/web/src/lib/server/connect-account-teardown.ts:254`) and a free-text error column. Migration
0148 adds no column that could hold a case, a review date, or an amount.

**One case your §7.5 premise did not cover, flagged rather than assumed away.** A persistently
failing balance **read** also produces a permanent blocked state: `balanceIsZero(null)` is false
and any non-"already gone" retrieve error writes blocked
(`connect-account-teardown.ts:96-99, 160-170`). So an unreadable balance is indistinguishable in
outcome from a non-zero one. We will build the escalation to cover both, unless you tell us
otherwise, and we are noting it because your reasoning turned on the balance being the legal
claim, which is not true of an unreadable balance.

### 4.6 The as-deployed condition is not encoded in the plan

Your §5.5(1) condition (release candidate pushed, migrations applied, C2 screenshot taken from
the deployed surface, all before any approval key is recorded) is restated unchanged in round 3
§6.6 and round 4 §6. It appears in **no** worklist entry and in **no** step of the C1.9 execution
checklist, and `docs/product/go-live-worklist.md` orders the consolidated approval (Gate 3, CL1)
before the release (Gate 4), which reads backwards against it. The final key recording is in fact
in Gate 5, so the plan is not actually wrong, but the condition is nowhere written down and
survives only in your handoffs. We are encoding it in both places. No question.

### 4.7 Your round-2 answers were not committed to the repository

Part 5 of `docs/legal/counsel-handoff-2026-08-02.md`, which contains your round-2 answers
including Q16, Q20, D6 and §5.5, exists in our working tree and is **not committed**. Round 4's
rulings had the same problem and were rescued by a commit whose message is literally
"commit counsel's round-4 rulings, which existed only in the worktree". Twice is a pattern. Both
are being committed. No question, and no effect on anything you have ruled.

---

## 5. Where engineering has made a judgement call in this round

Collected in one place, because D6 and round-4 §2 are both cases of a self-made legal
determination sitting in shipped code, and the fix is to name them rather than to stop having
opinions.

| Call | Where | What we did | Ask |
|---|---|---|---|
| C5 empty-basket notice | `shop-checkout.tsx:149-151` | Deliberately **did not** change approved behaviour | Q1: rule |
| Q12 failed-refund disclosure | `c1.9-terms-edit-inputs.md:382-398` | Drafted the sentence, held it out | Q2: rule |
| Q12 "same arithmetic" departure | `c1.9-terms-edit-inputs.md:366-380` | Wrote the clause to defer to the withdrawal paragraph, because the code pays more than pro rata | Q3: ratify or overturn |
| Q7 single-audience phrasing | `c1.9-terms-edit-inputs.md:302-311` | Wrote it to the artist | Q4: ratify or reword |
| C1.4 document placement | `c1.9-terms-edit-inputs.md:213-217` | Refused to choose | Q5: choose |
| Unreadable-balance blocking | `connect-account-teardown.ts:96-99` | Will fold into the §7.5 escalation | §4.5: correct us if wrong |

---

## 6. Sign-off conditions, unchanged

Your §5.5 conditions stand and we are not asking about them. Approval is recorded against
artifacts **as deployed**: release candidate pushed, migrations applied, confirmation screenshot
taken from the deployed surface, before any approval key is recorded. It is not satisfiable today
(Gate 4 has not started) and it is now encoded in the plan rather than only in your handoffs, per
§4.6.

`consumer_sales_launch_approved` and `GOODS_COMMERCE_ENABLED` remain closed and will not be
opened on a provisional answer.

---

## 7. Checked and NOT asking about

Scope for this round was pruned deliberately. Each of these was re-verified against the code and
the record, found already settled, and **removed** rather than re-sent. Re-asking an answered
question invites a contradictory second answer.

| Item | Why it is settled |
|---|---|
| Round-2 D6, the withdrawn fee claim | You ruled "re-scope, don't withdraw" (§5.1), and CR4-1 ratified the resulting implementation as final, expressly ruling against encoding the EUR 16.67 threshold. Remaining work is committing a split patch, not a decision. |
| Round-2 Q1, tax-ledger purge scope | Answered by round-4 §7.4: the horizon applies to live accounts, with a dispute/hold carve-out. Unbuilt, tracked at §4.4 above. |
| Round-2 Q13, seven years as an upper bound | Answered by round-4 §7.5: no hard delete, operator escalation plus documented annual review. Unbuilt, tracked at §4.5 above. |
| The model-form carve-out for all-custom-made orders | Ratified by round-4 §7.2 on the Art. 6(1)(h)/(k) basis. The code is in the ratified end state; only the comment citation is outstanding (§4.3). |
| Round-2 Q16, notice-and-action for galleries | You specified four concrete elements and said the condition is discharged once they exist. Complete as an answer; unbuilt as work (§4.2). |
| Round-2 Q20, P2B and DSA Section 4 | Two-regime ruling given in full: P2B duties now in the C1.9 version, DSA Section 4 excluded while micro or small with a recorded trigger. Unbuilt and unplaced (§4.1). |
| C2, price adjacent to the pay button | Answered 2026-07-31 and built. The one residual you deferred back (a null price rendering an obligation-to-pay button with no total) was closed by founder ruling 16 on 2026-08-01: the order is now blocked with a retryable no-charge message. What remains is a screenshot in the C1 package and the accountant price co-sign, neither of which is a counsel question. |
| C3, consumer withdrawal copy E1-E5 | Answered 2026-07-31. E2 was the only conditional element and the durable-medium check was performed: the confirmation carries the full Art. 8(7) set inline. Nothing left. The associated ledger row is a separate matter, at Q6. |
| C1, final implementation sign-off | Open by design, not un-answered. You gave the checklist on 2026-07-31 and it has since grown to seven components. What it needs is a package assembled and submitted, not a question. |
| LO-5 DPIA | Complete and signed 2026-08-03 by the controller (§0). |

---

Every claim above is traceable to a commit, a file, or an entry in `docs/audit/findings.yaml`.
Where we say we could not determine something, that is a statement about our evidence rather
than a hedge, and Q6 is the one place in this round where it changes what we are asking for.
