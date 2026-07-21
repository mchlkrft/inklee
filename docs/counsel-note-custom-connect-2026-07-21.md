# Counsel note — Stripe Connect model change (Express → Custom)

**Prepared:** 2026-07-21 · **For:** legal counsel (Estonia/EU commercial + payments)
**Companion brief:** `docs/payment-flow-for-counsel.md` (the full money-flow description, revised the same day)
**Status:** no live deposit has been processed yet. We are asking for review **before** the first real money moves.

> This note is written by the engineering team, not by a lawyer. It states facts
> about how the system is configured and asks questions. Nothing in it is a legal
> conclusion.

---

## 0. Why you are receiving this

On 2026-06-02 you cleared item **LO-2**: that under our Stripe setup each
**artist** is the merchant of record for a deposit, and Inklee is not the
merchant/seller of record and does not hold artists' funds.

We are writing because **the description you were given at that time no longer
matches what we run**, in ways that go beyond the point you were asked about.
The brief you read described Stripe **Express** connected accounts. Production
uses Stripe **Custom** connected accounts, configured so that Inklee takes on
two things the earlier description explicitly placed elsewhere: **Stripe's
processing costs** and **liability for payment losses**.

We discovered the mismatch on 2026-07-21 while preparing the first live deposit,
and we corrected our own documentation the same day. We are flagging it rather
than assuming the earlier clearance still covers us.

**Nothing is urgent in the sense of ongoing exposure**: no live deposit has ever
been processed, and there are currently zero live connected accounts. It becomes
urgent at the moment we onboard the first paying beta artist, which is the next
step we intend to take.

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

## 5. One internal inconsistency you should know about

Our own records disagree about whether you have already signed off this model.
One document records that counsel signed off the Custom Connect process; another
records that LO-2 was cleared for the **Express** framing and that the Custom
model "is not formally signed".

We are treating it as **not signed**, for a reason that holds either way: the
brief describing the money flow said the artist bore Stripe's processing fee and
that Inklee never fronts money, and both statements were wrong for the model we
run. So even if a sign-off was given, it was given against a description that
did not match the code. That is the gap this note exists to close.

---

## 6. What we are doing meanwhile

- No live deposit will be taken from a real client until you have responded,
  beyond a founder-run test of a few euros against the founder's own account.
- Our internal documentation has been corrected (`payment-flow-for-counsel.md`
  §4, §5, §6, §9 and a new `artist-account-and-payouts.md`).
- **If you advise against this arrangement, reversing it is not a small
  change.** We originally wrote that it was, and that was wrong; we are
  correcting it here rather than let you rely on it. Stripe does not allow the
  fee-payer or the loss backstop to sit with the connected account under
  platform-collected onboarding, and it offers no option at all to place the
  loss backstop on the artist. Moving either one back means switching to
  Stripe-collected onboarding (the Express-style model), which would mean:
  - every artist is redirected to Stripe's own branded signup, which is the
    friction the product deliberately removed;
  - existing connected accounts cannot be converted, so every artist would have
    to onboard again from scratch;
  - the artist's headline cost changes from a flat 3% to a variable one,
    because Stripe's processing fee would once more come off their side.

  So this is a product-shape decision, not a settings toggle. That is precisely
  why we would rather hear your view before onboarding beta artists than after.
