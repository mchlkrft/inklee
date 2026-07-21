# Counsel note — Stripe Connect model change (Express → Custom)

**Prepared:** 2026-07-21 · **For:** legal counsel (Estonia/EU commercial + payments)
**Companion brief:** `docs/payment-flow-for-counsel.md` (the full money-flow description, revised the same day)
**Roadmap item:** LO-10 (§3.6) · **For:** the final counseling round
**Status:** **the Custom model is a settled product decision and is not being
reconsidered.** This note exists so the round covers a detail that was never
accurately in front of you, not to re-open the choice.

> This note is written by the engineering team, not by a lawyer. It states facts
> about how the system is configured and asks questions. Nothing in it is a legal
> conclusion.

**What we are and are not asking.** We are **not** asking whether to use Stripe
Connect Custom. That was decided on 2026-06-04, re-examined on 2026-07-21, and
re-affirmed: it stays. We are asking what that choice obliges us to **disclose,
document and put in our terms**, and whether it changes any position previously
taken — so that the final round closes it rather than leaving it implicit.

---

## 0. Why you are receiving this

Two things were cleared previously:

- **2026-06-02 (LO-2):** that under our Stripe setup each **artist** is the
  merchant of record for a deposit, and Inklee is not the merchant/seller of
  record and does not hold artists' funds.
- **2026-06-05 (G-4):** the Custom Connect deposit **process**, at which point
  our published `/subprocessors` page was corrected from Express to Custom.

So the model itself has been before you. What has **not** been accurately before
you is the commercial and liability detail underneath it, for a specific and
avoidable reason: the money-flow brief you read
(`payment-flow-for-counsel.md`) still described **Express** economics until we
corrected it on 2026-07-21. It stated that the **artist's** account bore
Stripe's processing fee, and that Inklee "never fronts the money". Both are
wrong for the model we actually run, and both were wrong in the direction that
understates Inklee's exposure.

We found this while preparing the first live deposit and corrected our
documentation the same day. We are raising it rather than assuming the earlier
clearances reached a detail the brief misdescribed.

**There is no ongoing exposure to remediate**: no live deposit has ever been
processed and there are currently zero live connected accounts. The point at
which it starts to matter is the first beta artist taking a real deposit.

---

## 1. What changed, in plain terms

Stripe lets a platform choose how much of the relationship with the connected
account it owns. We moved from a lighter model to a heavier one.

| | Previously described (Express) | What actually ships (Custom) |
| --- | --- | --- |
| Who collects the artist's identity/bank details | Stripe, on Stripe's own pages | **Inklee**, inside our app |
| Does the artist have a Stripe dashboard | Yes | **No** |
| Who pays Stripe's card-processing fee | The artist's account | **Inklee's account** |
| Who backstops unrecoverable losses | Stripe | **Inklee** |

In Stripe's configuration these are the properties `requirement_collection:
application`, `stripe_dashboard: none`, `fees.payer: application`, and
`losses.payments: application`. We can supply the exact account configuration on
request.

**These were not four independent choices.** Only the first was a product
decision (collect the artist's details ourselves rather than send them to
Stripe). The other three follow from it: Stripe does not permit
platform-collected onboarding while leaving fees or loss-backstopping
elsewhere. Our own sandbox testing on 2026-06-04 confirmed that Stripe rejects
`fees.payer: account` in this configuration. So the commercial and liability
consequences described below are a **package** that comes with not sending the
artist to Stripe, not a set of terms we selected individually.

---

## 2. What this changes in practice

**a) The artist never interacts with Stripe.** They enter their name, date of
birth, address, phone, and IBAN into Inklee's own form, and Inklee forwards it
to Stripe. Since 2026-07-21 that also includes **identity documents** (for
example a passport photo) when Stripe asks for one. We forward these straight to
Stripe from memory; we do not store them, place them in our file storage, or log
them. Only the resulting verification status is retained.

Because the artist has no Stripe dashboard, Inklee's interface is the **only**
place they can supply this information, see their payout status, or issue a
refund.

**b) The commercial split is different from what the earlier brief stated.** The
client still pays exactly the deposit with no surcharge, and the artist still
receives the deposit minus a flat 3%. What changed is where Stripe's cost sits:

- Inklee's fee on the payment is the **full 3%**, not "3% minus Stripe's fee".
- Stripe bills its own processing cost (roughly 1.5% + €0.25) to **Inklee**
  separately.
- So on a €200 deposit: client pays €200, artist receives €194, Inklee receives
  €6 and is separately charged about €3.25, netting about €2.75.
- The artist's cost is now **always exactly 3%**, whatever card is used. The
  variation between card types falls on Inklee.
- On small deposits Stripe's fixed component can exceed our 3% entirely, so
  **Inklee makes a loss on that transaction**. There is no floor. This is a
  deliberate accepted cost, not an oversight.

**c) Inklee backstops unrecoverable losses.** The precise mechanic matters, and
we want to state it accurately rather than dramatically. If a client disputes a
deposit, the amount is debited from the **artist's** Stripe balance first. The
setting we carry (`losses.payments: application`) determines who is liable when
**the artist's account cannot repay a resulting negative balance**. Under the
previous model that fell to Stripe; under ours it falls to **Inklee**.

In practice the realistic exposure is: an artist takes a deposit, withdraws it
to their bank, the client later disputes the charge, and the artist has no
balance left and does not repay. Inklee absorbs that. It is not "Inklee pays all
chargebacks", but it is a real uncapped downside that Inklee did not carry
before, and Inklee still never custodies the deposit itself.

Note that Stripe offers no option to place this liability on the connected
account: the only permitted values are the platform or Stripe. Putting it back
on Stripe means abandoning platform-collected onboarding (see §6).

**d) A refund is a net loss to Inklee.** Inklee returns its 3% fee in full, and
Stripe does not return its processing fee on a refund. Since that fee was billed
to Inklee in the first place, Inklee absorbs it.

**e) Fee waivers.** During the beta we intend to waive our entire 3% for
selected artists, for a limited period and up to a spending cap. Those deposits
run with no platform fee at all while Inklee still pays Stripe's cost.

---

## 3. What we believe is unchanged

We do not think the following moved, and we are not asking you to re-open them
unless the above changes your view:

- The **artist is the merchant of record** for the tattoo service and the
  deposit; Inklee is a technical service provider, not the seller.
- **Inklee never takes custody of the deposit.** Stripe routes the money to the
  artist's own account; only our fee comes to us.
- The **client pays exactly the agreed deposit**, with no surcharge and no
  Inklee-imposed cost.
- The refund policy is unchanged in substance: full refund when the artist
  cancels, forfeiture when the client cancels (subject to your Q9 answer in the
  companion brief, which remains open).

---

## 4. What we would like from you

1. **Does accepting payment-loss liability change the merchant-of-record
   analysis you cleared under LO-2?** We do not hold the funds, but we absorb
   disputes. Does that make Inklee something other than a facilitator for these
   purposes?

2. **Does either property create a regulatory or licensing exposure** in Estonia
   or the EU that the Express description did not — in particular around
   payment-intermediary / PSD2 status, given that Inklee now both collects the
   artist's KYC data and carries the loss?

3. **What must we disclose, and to whom?** Specifically: do artists need to be
   told that Inklee absorbs disputes on their behalf and pays Stripe's
   processing cost, and do clients need to be told anything different from today
   about who they are transacting with?

4. **Does Inklee collecting and forwarding identity documents** (rather than
   Stripe collecting them directly) change our data-protection position or
   require a change to our privacy documentation or DPA? We do not retain them,
   but we do handle them in transit.

5. **Do selective fee waivers** for some artists and not others raise any issue
   we should be aware of — pricing transparency toward artists, our published
   terms, or the VAT treatment of our fee when it is zero?

6. **Is our record of the Connected Account Agreement sufficient?** Acceptance
   is captured in-app with a timestamp and the artist's IP address at the moment
   they submit their payout details.

Questions 1 to 5 are also reproduced as Q10 and Q11 in the companion brief so
the two documents stay in step.

---

## 5. How our own records read, for transparency

Our internal records were briefly inconsistent on this and we would rather you
heard it from us. Two documents record the Custom process as cleared on
2026-06-05 (G-4); a third, written the same day, listed it as an open gate and
said the Custom model was "not formally signed". Read together, the most likely
reading is that the third was written earlier that day and never updated, and
that G-4 genuinely was cleared. The corrected `/subprocessors` page from the
same date supports that.

We have aligned the records on "cleared". The reason this note still exists is
narrower and unaffected by which reading is right: the **money-flow brief itself
carried Express economics until 2026-07-21**, so the fee-payer and
loss-backstop detail was not something any sign-off could have covered
accurately. That specific detail is what we are bringing to the final round.

---

## 6. Where this sits

- **The model is settled.** Inklee has re-examined the choice with the fee and
  liability consequences fully explicit and is keeping Custom. The record of
  that decision, including what is being knowingly accepted, is in Inklee's
  internal `DECISIONS.md` and can be shared.
- **We would rather you knew why reversing is not on the table.** Stripe does
  not permit the fee-payer or the loss backstop to sit with the connected
  account under platform-collected onboarding, and offers no option at all to
  place the loss backstop on the artist. Moving either back means switching to
  Stripe-collected onboarding, which would mean every artist redirected to
  Stripe's own branded signup (the friction the product exists to remove), every
  existing account re-onboarded from scratch, and the artist's flat 3% becoming
  a variable rate. It is a product-shape change, not a settings toggle. (An
  earlier draft of this note said the opposite; that was our error and it is
  corrected here.)
- **So the useful output of this round is not a verdict on the model** but the
  concrete consequences: what goes in the artist terms, what the client is told,
  whether our privacy documentation needs to change for identity documents, and
  whether anything about our regulatory position moves.
- Inklee's own documentation has been corrected to match the code
  (`payment-flow-for-counsel.md` §4, §5, §6, §9, and a new
  `artist-account-and-payouts.md` describing the account model end to end).
