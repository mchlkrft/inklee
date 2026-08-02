# Inklee — consolidated review package for counsel and the accountant

**Date: 2026 08 02. Prepared by: engineering. Status: nothing described here is
live.** Every item below is built, tested and switched off, waiting on the
answers in this document.

## How to read this

This is written to be self contained: you should not need the codebase, and you
should not need to have followed the build. Each item states what we built, the
provisional position we built against, the exact question we need answered, and
what changes if your answer differs from our assumption. Where an item is
already approved we say so and do not re-ask.

**One consolidated pass is the intent.** We deliberately did not stop to ask per
feature. If any answer requires rework we would rather do it once, now, before
anything is switched on.

**What "not live" means concretely.** Inklee has never taken a real payment. The
fee schedule that would charge artists is written but inactive. The goods shop
is behind a switch that is off. Consumer subscription sales require a database
approval record that does not exist. No customer has ever been charged, and no
artist has ever paid us. We can therefore still change anything, including
schema and money flows, without migrating real records.

---

# PART 1 — COUNSEL

## Background you already confirmed (not re-opened)

The consumer, withdrawal, VAT and subscription architecture was confirmed in the
2026 07 24 round and the 2026 07 25 walkthrough: digital service
classification, the withdrawal versus cancellation split, immediate performance
consent, the online withdrawal function, data preservation on withdrawal,
proportional compensation, versioned consent evidence, and artist as seller for
physical goods. The four launch blocking conditions from that round are built.
Nothing below reopens any of it.

## C1. The one thing genuinely new since you last looked: Inklee now hosts a shop

Until now, Inklee took deposits for tattoo appointments. We have since built a
**standalone goods shop**: a member of the public, with no account, can buy
physical products from an artist on a page we host, paying by card, with the
artist as the seller and Inklee taking a percentage fee. This is the component
our previous notes flagged as never reviewed, and it has grown considerably.

Concretely, a buyer can now: browse an artist's products, add them to a cart,
keep a wishlist across several artists, buy immediately or check out from the
cart, receive a receipt by email, and be refunded in whole or in part by the
artist. Each cart belongs to exactly one artist; products from different artists
can never be combined into one payment.

### C1.1 — Information duties on the checkout page

**Built:** the page shows the items, their prices, a server confirmed total on
the pay button, and names the artist as the counterparty ("Pay X to {artist}",
"pickup and delivery are arranged with the artist"). The button currently says
"Pay".

**Question:** does this page need the full pre contractual information set at
order time (seller identity and address, delivery terms, complaint route,
return rights), and must the button carry an explicit "order with obligation to
pay" style label?

**If your answer differs from our assumption:** we assumed the current, minimal
page is insufficient and expect to add a disclosure block. That is a
straightforward change while the shop is off; it is a migration of live orders
if we launch first.

### C1.2 — Return rights for physical goods

**Built:** the refund machinery is complete (full, partial, by line, by
quantity, with stock returned and any discount allowance restored). What does
not exist anywhere is the **wording**: nothing on the page or in the receipt
mentions a 14 day return right or the exemption for personalised items.

**Question:** the return right wording, who bears return postage, and where we
claim the personalised goods exemption. Tattoo related goods are often
custom made, so the exemption likely matters, but we have not assumed it.

### C1.3 — The order confirmation as a durable record

**Built:** the buyer receives an email listing the items, the total, the artist,
and a note that pickup or delivery is arranged with the artist directly. It does
**not** carry seller identity or address, return instructions, or terms.

**Question:** must the goods order confirmation carry the same information set
we already send for a Plus subscription purchase, and if so exactly what?

### C1.4 — Guest buyer personal data

**Built:** a buyer with no account gives an email address, which we store on the
order and use for the receipt and for the artist to arrange fulfilment. We also
now store a **cart**: a random token in a cookie, of which we keep only a hash,
plus the products they added. No name, no address, no payment details (those
stay with Stripe).

**Questions:** (a) the privacy notice this page needs and where it belongs; (b)
the records of processing entry; (c) **retention**, which is the one we cannot
resolve ourselves. A buyer's email sits on an order we must keep for seven years
as a financial record. An abandoned cart or a cancelled order is not a financial
record, and we currently have no rule that erases those. What is the correct
retention for each of: a completed order, a cancelled order, an abandoned cart,
a wishlist?

### C1.5 — Photographs of clients hosted by us

**Built:** artists can upload images to a gallery on their page. These are
stored in a bucket that is public but unlisted (reachable only by an unguessable
URL, not indexed or browsable). If an artist stops paying, we stop rendering the
gallery but do not delete the files. Deletion on removal and on account closure
are both built.

**Why we are flagging it:** tattoo photographs are images of an identifiable
person's skin and are arguably health adjacent.

**Question:** is public but unlisted acceptable, or do these need signed, expiring
URLs? The latter is moderate rework and we would rather know now.

### C1.6 — Importing an image from a web address

**Built:** an artist can paste a URL and we fetch that image server side and
store our own copy, rather than linking to someone else's server. We did this
deliberately, so a public page never depends on a third party host.

**Question:** does an artist instructed import need an attestation from them
about rights to the image, and does hosting our own copy change our position
compared with linking?

### C1.7 — Refunds and the retained processing cost

**Built:** when an artist cancels and refunds a client, we return our fee to
them except for the card processing cost we actually incurred and cannot
recover. We retain only the evidenced amount, never a flat charge, never more
than once.

**Question:** the Terms wording that covers retaining that cost. This is the last
condition on activating the refund policy.

### C1.8 — Partial refunds

**Built:** an artist can refund one line, part of a quantity, a custom amount, or
everything, on both appointment payments and goods orders.

**Question:** what the buyer must be told when a refund is partial. This likely
folds into C1.2's answer, since a partial return of a multi item order is exactly
the case the return right wording has to cover.

### C1.9 — Terms edit and final sign off

Everything above lands in one versioned Terms edit. Our process makes an
unversioned edit impossible: changing the live document without publishing a
new version fails our automated checks. Once you return the wording we produce
the final document and send it back for the single consolidated approval, which
we then record against that exact version.

### C1.10 — One engineering matter with a legal question inside it

Our Terms and Privacy documents currently promise that certain billing and tax
records are retained after an account is deleted. Our deletion routine may
delete some of them. We can make the code match the promise or the promise match
the code, and we need to know which is correct before we change either.

---

# PART 2 — ACCOUNTANT

## Already answered (not re-opened)

Stay unregistered for now with a threshold alert; Stripe invoices as they are
while unregistered, with a pre approved path for later; proration on part month
withdrawal without a tax adjustment; the invoice and credit note format. Nothing
below revisits these.

## A1. Price display co sign — first, because it is irreversible

**Built:** Plus is 3.00 EUR per month, displayed as a final price with tax
treated as included. The Stripe price object carrying that treatment already
exists.

**Why it is first:** the tax behaviour on a Stripe price cannot be changed after
creation. Every other money decision waits behind this one.

**Question:** confirm the display and the inclusive treatment, and note the
caution we recorded: while unregistered we absorb no VAT, so the net figure is
higher than the earlier model assumed. Our current estimate of net revenue per
subscriber per month is approximately 2.70 EUR rather than the 2.18 EUR in the
older planning document.

## A2. Registration thresholds and who watches them

**Built:** alerts at 35k domestic and 8k EU cross border.

**Questions:** confirm those figures and the review cadence, confirm that
**platform fee revenue counts toward them** (it is our revenue, not the
artist's), and confirm who owns the re approval when a threshold is approached.

## A3. Fee schedule version 2

**Built and inactive.** The active schedule charges a flat 3% on appointment
deposits and 0% on goods. Version 2 is fully written and switched off:

| | Appointment payments | Physical goods |
|---|---|---|
| Free artist | not offered | 5% |
| Plus artist | 0.5% | 1% |
| Grandfathered free artist | 3% | 5% |

The third row exists because a small number of artists were promised card
collection while free. They keep the capability at their original 3% rate; they
do not get Plus pricing without a Plus subscription.

Every transaction records which schedule version and which rate tier applied, so
a historical charge can always be reproduced. Fees are calculated on the
subtotal after discounts, excluding VAT and shipping.

**Questions:** approve the rates and their tax treatment, and confirm the two
conditions we already noted: the new goods fee needs Terms coverage and advance
notice to artists before it activates.

## A4. Standalone goods sales — the flow, for confirmation

**Built:** the artist is the seller of record. The buyer's money goes to the
artist's own connected Stripe account. Inklee takes only its percentage fee from
that transaction. We never hold the goods revenue.

**Question:** confirm this changes nothing in the agreed model, and confirm how
goods fee revenue classifies for the thresholds in A2.

## A5. Goods invoicing

**Built:** the buyer gets a receipt email from Inklee "on behalf of the artist".
No invoice document is produced for a goods sale; the invoice format you approved
covered Plus subscriptions only.

**Question:** does an artist as seller goods sale need a document beyond that
email, and whose obligation is it to issue? Our assumption is that it is the
artist's obligation and Inklee's role is to provide the record; please confirm or
correct.

## A6. Partial refund allocation — the method, for approval

**Built:** when part of an order is refunded:

1. our percentage fee is returned in proportion to the amount refunded;
2. the card processing cost we actually incurred is retained, but only up to what
   is evidenced, only up to the fee attributable to that refund, and never twice
   across successive partial refunds;
3. a permanent per line record is written for every refund event;
4. if the per line records and the order total ever disagree, the refund is
   **refused** rather than adjusted to fit.

**Questions:** confirm the allocation method matches the intended treatment,
confirm how a partially refunded transaction should classify, and tell us whether
a retained processing cost needs to be presented separately from a returned fee
in the books.

## A7. A commercial claim we suspended pending your answer

Our payouts page told artists the 3% fee had "card processing included", which is
true today because we absorb Stripe's cost from that fee. Under version 2 the
Plus rate is 0.5%, and we do not know that the same claim holds at that rate. We
have made the sentence conditional on the 3% rate, so it simply does not appear
for Plus artists until you tell us whether it can.

## A8. Variant level records on bundles

**Built:** when a bundle of products is sold, we store a snapshot of exactly what
was in it, including the specific variant and its list price at the time, so a
refund years later restocks the right item even if the product was since deleted.

**Question:** reconciliation impact only, and we believe it is minor. Worth one
look at whether those component list prices are ever needed for the books or
remain records only.

---

# PART 3 — WHAT IS GATED ON THESE ANSWERS

Nothing activates until the relevant answer is in. For transparency, the
sequence is:

| Gate | Waits on |
|---|---|
| Publish final Terms | C1.1 to C1.8 wording |
| Activate consumer subscription sales | A1, then C1.9's consolidated approval |
| Activate fee schedule version 2 | A3, plus Terms coverage and artist notice |
| Activate the refund policy that retains processing cost | C1.7 and A6 |
| Switch the goods shop on | C1.1 to C1.6, A4, A5, and a live money test we run ourselves |

We are continuing to build and to fix engineering defects while these are open.
We are not switching anything on.

## What we need back, in one pass

1. Wording for C1.1, C1.2, C1.3, C1.7, C1.8.
2. A decision on C1.4 retention and C1.5 image hosting.
3. A yes or no on C1.6 attestation and a direction on C1.10.
4. The A1 co sign, and approvals for A3 and A6.
5. Confirmations for A2, A4, A5, A7, A8.

If any of it needs a conversation rather than a written answer, we would rather
have the conversation than receive an assumption.

---

# PART 4 — ANSWERS (counsel + accountant review, 2026-08-02)

Consistent with the 2026-07-24/25/31 and 2026-08-01 rounds; nothing settled is
reopened. Draft wording is provided where Part 3 asked for wording; square
brackets are variables. All drafts are for the single C1.9 Terms/copy version.

## Counsel

### C1.1 — Yes to both. Wording:

Your assumption is correct: the current page is insufficient. Required changes:

**Button:** replace "Pay" with **"Order with obligation to pay"** (Art. 8(2)
CRD; a consumer is not bound by an order placed through a non-conforming
button).

**Disclosure block on the checkout screen, above the button:**

> Sold by **[artist trading name]**, [artist address].
> Inklee hosts this shop and processes the payment on the artist's behalf.
> Your purchase contract is with the artist.
>
> Pickup or delivery is arranged with the artist directly. Any delivery cost
> is agreed with the artist and is not included in this total.
>
> You have a 14-day right of return (see below / [link]). Items marked
> "custom-made" cannot be returned.
>
> Questions or complaints: contact the artist at [artist contact]; if
> unresolved, contact Inklee at [support email].

Prerequisite: the artist Terms must oblige artists to provide and keep current
their seller name, address, and contact — the platform can only display what
it holds. Artists without complete seller data cannot enable the shop.

### C1.2 — Return-right wording; postage; where 16(c) is claimed

**Standard return notice (checkout + confirmation):**

> **Right of return.** You may withdraw from this purchase within 14 days of
> the day you (or someone you nominate) receive the goods, without giving a
> reason. To do so, tell the artist ([artist contact]) or Inklee
> ([support email]) in a clear statement before the period ends; you may use
> the model withdrawal form [link/attached]. Send the goods back to the artist
> within 14 days of telling us. **You bear the direct cost of returning the
> goods.** The refund — including standard delivery cost, if you paid one —
> is made within 14 days of your withdrawal, though it may be withheld until
> the goods are back or you prove you sent them. You are liable only for any
> diminished value from handling beyond what a shop would allow.

**Personalised-goods exemption:** claimed **per product**, by an artist-set
"custom-made" flag, rendered at the product, in the cart, at checkout, and in
the confirmation as:

> **Custom-made item: no right of return.** This item is made to your
> specification or clearly personalised, so the 14-day right of return does
> not apply (Art. 16(c), Consumer Rights Directive).

Never claim it in the Terms alone; an undisclosed or blanket claim fails, and
an undisclosed return right extends the window to 12 months (Art. 10).

### C1.3 — Yes; the confirmation must be the durable record

Add to the receipt email (in the body or a PDF attachment — not only a link):
the C1.1 seller block (identity + address); items, prices, total; the delivery
arrangement; the C1.2 return notice and model form, or the custom-made claim
for flagged items; the complaint route; and the applicable terms text. Close
with: "This message is your order confirmation on a durable medium." This
mirrors the approved Plus E2 pattern.

### C1.4 — Retention rules (the four cases) + notice + RoP

- **Completed order:** retain 7 years from the end of the financial year
  (Accounting Act § 12; Art. 6(1)(c)/17(3)(b)); guest email stays on the order
  as part of the financial record.
- **Cancelled order:** no financial-record basis. **Erase or pseudonymise the
  guest email 30 days after cancellation** (operational window for disputes
  about the cancellation itself); keep the de-identified row for statistics if
  wanted.
- **Abandoned cart:** delete **30 days after last activity**. The hashed token
  design is good; the products list without contact data may be kept
  de-identified.
- **Wishlist (guest, token-based):** keep while active; delete after **12
  months of inactivity**.

**Privacy notice at the email field:**

> We use your email for your receipt and so [artist] can arrange delivery. It
> is kept as part of the order record. [Privacy policy]

**RoP:** add one entry — guest goods orders (categories: email, order
contents, cart token hash; recipients: the artist, Stripe; bases: Art. 6(1)(b)
contract, 6(1)(c) retention; the retention table above).

Build the purge jobs before the shop switches on — the cancelled-order purge
is the one with no current path and no lawful anchor without it.

### C1.5 — Conditional pass; signed URLs as a dated fast-follow

Public-unlisted is acceptable **at launch only**, on all of: high-entropy
paths, no listing/indexing, and — the correction — **on downgrade, stop the
objects being publicly reachable**, not only the render: relocate to
non-public storage or invalidate the URLs within a short grace window (60
days is defensible; the artist may resubscribe, so relocation rather than
deletion is the right default; deletion on removal and account closure stay
as built). Unguessable URLs are not access control for images of identifiable
people's skin. Move to **signed, expiring URLs** as a dated fast-follow —
same discipline as the E4 pre-login route — before any gallery marketing
push. Fold the gallery into the still-uncompleted **LO-5 DPIA**, which the
account-deletion handoff already makes release-gating.

### C1.6 — Yes to the attestation; hosting a copy is the right call with two guards

Storing your own copy is a reproduction, so Inklee hosts content rather than
framing it — **more** responsibility than hotlinking, but the correct
engineering choice, and the legal position is standard UGC hosting provided:
(1) **attestation at import** — a required confirmation on the URL-import
action: "I confirm I have the right to use this image on my page," logged
with the import (append-only, like other consent records); (2) the
**notice-and-action route** (the Q14/DSA machinery) covers gallery images, so
a rights-holder complaint gets the hosting-liability protection of prompt
removal. With both, the artist bears primary responsibility and Inklee keeps
the host's position. No attestation = no import.

### C1.7 — Terms clause for the retained processing cost

> **Refunds of our fee.** If you cancel and refund a payment, we return the
> platform fee we charged on it, less the card-processing cost we were
> charged by our payment provider for that payment and cannot recover. We
> retain only the amount actually evidenced by the payment provider, at most
> once per payment, and never more than the fee being returned. The amount
> retained is shown on your refund statement.

Conditions from the prior rounds stand: this enters the Terms in the single
C1.9 version **before** the refund-policy flip; evidenced cost only; the
client's own refund is never reduced by it.

### C1.8 — Partial-refund communication

On any partial refund, the buyer receives:

> We have refunded [amount] for [items/lines, or "part of your order"]. The
> refund goes to your original payment method, typically within 5–10 business
> days. The rest of your order is unchanged, and your right of return for the
> remaining items (where it applies) is unaffected.

Where the artist retains items or the refund follows a return, reference it
("following your return of [item]"). This does fold into C1.2: the return
notice covers the entitlement; this covers the event.

### C1.9 — Process confirmed

One versioned Terms edit carrying C1.1–C1.3, C1.7, C1.8, the C1.4 privacy
text, and the earlier X2 line-76 fix; one consolidated approval recorded
against that hash. Send the final render for the confirmation pass.

### C1.10 — Make the code match the promise

The promise is the legally required side: billing and tax records **must**
survive account deletion (Accounting Act § 12; Art. 17(3)(b) — the position
already implemented for deposits in `account-deletion-handoff.md` §§4–5 as
pseudonymised retention). A deletion routine that erases them would put
Inklee in breach of a legal obligation to cure a documentation mismatch —
never the right trade. **Fix the code:** the deletion routine carves out the
retained financial subset (pseudonymised per the handoff), and the
Terms/Privacy promise stands as written. Verify the carve-out against the
handoff's §11 implementation table while you are in there.

## Accountant

### A1 — Co-sign recommended

Inclusive display at 3.00 EUR is the correct implementation of the
consumer-first + unregistered posture; since no VAT is remitted, ~2.70 EUR
net (after Stripe's fee) is the right planning figure and supersedes the 2.18
model. Record the standing caution: at future VAT registration the 3.00
inclusive price absorbs VAT unless re-priced — that decision is parked with
the A2 trigger, deliberately.

### A2 — Confirmed, with the conservative counting rule

35k/8k alerts and quarterly cadence confirmed; accountant monitors,
founder/board owns re-approval. **Yes, platform-fee revenue counts** — it is
Inklee's own turnover. Until the LO-10 round settles fee classification,
count **all** fee revenue toward the 35k domestic alert; over-counting toward
an alert is safe, under-counting is the silent failure.

### A3 — Approved as encoded, conditions unchanged

Rates and the grandfathered 3%/5% row approved; no VAT on any fee line while
unregistered. The flip still waits on: Terms coverage of the new Free goods
fee + **30 days' advance notice** to existing artists, via the C1.9 version.
Per-transaction version/tier stamps satisfy the reproducibility requirement.

### A4 — Confirmed

Artist as seller of record with destination charges and an application fee
leaves the agreed model unchanged. Classification: the goods fee is a **B2B
service to the artist-as-trader** (selling goods to the public is trade
activity regardless of the consumer-framed subscription). Fees to Estonian
artists count toward the domestic counter; fees to other-EU artists are
customer-country supplies — but apply the A2 conservative rule until LO-10.

### A5 — Assumption confirmed

Buyer-facing invoicing for goods is the **artist's** obligation as seller;
consumer sales need no invoice unless requested or local law requires. Inklee
provides the order record and the (upgraded, per C1.3) receipt "on behalf of
the artist." Inklee's own document is its **fee invoice to the artist** once
the goods fee is non-zero — A4 non-registered format. Add one line to the
artist Terms: buyer-requested invoices are the artist's to issue; Inklee
supplies the data.

### A6 — Method approved; present the retained cost separately

The allocation (proportional fee return, evidenced-cost retention capped at
the attributable fee and never double-counted, append-only lines,
fail-closed on mismatch) is approved — fail-closed is the right choice.
Books: a partial refund reverses the refunded proportion of fee revenue; the
**retained processing cost is presented as its own line**, both on the
artist-facing refund statement and in the books (retained-fee income
offsetting the Stripe expense), not netted invisibly into the fee reversal.
That separation is also what makes the C1.7 Terms clause auditable.

### A7 — The claim binds to who pays Stripe, not to the rate

"Card processing included" is true whenever Inklee absorbs the processing
cost (`fees.payer: application`) — at 0.5% it is simply a subsidy, since
Stripe's ~1.5% + 0.25 exceeds the fee. It may carry at the Plus rate **if**
the founder records the per-transaction subsidy as intended policy; and the
copy should be bound to the fee-payer setting, not the rate, so a future
model change cannot silently make it false. Robust wording for all rates:
**"no separate card-processing fees."** Keep suppressed until the founder
records the intent.

### A8 — Records only

Component list-price snapshots are operational records for restock/refund
mechanics and audit trail; the books recognise only the actual amounts
charged and refunded. No reconciliation entries needed. Confirmed as minor.

## The one-pass return, mapped

| Asked (Part 3) | Answered |
|---|---|
| Wording C1.1/C1.2/C1.3/C1.7/C1.8 | Drafts above, for the single C1.9 version |
| C1.4 retention decision | 7y / 30d / 30d / 12m table + purge jobs before shop-on |
| C1.5 image hosting | Conditional pass; relocate-on-downgrade now, signed URLs dated fast-follow, into LO-5 DPIA |
| C1.6 attestation | Yes — required, logged; DSA notice route covers galleries |
| C1.10 direction | Code matches promise; retention carve-out stands |
| A1 co-sign | Recommended; caution recorded |
| A3, A6 approvals | Approved; A3 conditions unchanged; A6 separate presentation |
| A2, A4, A5, A7, A8 | Confirmed as detailed above |

**Standing items this pass does not close:** the LO-10 round (schedule it;
close before real client money), the LO-5 DPIA (release-gating, now including
the gallery and guest checkout), and the E4 pre-login cancellation
fast-follow.

---

# PART 5 — QUESTIONS ARISING FROM IMPLEMENTING YOUR ANSWERS (2026-08-02)

Three items surfaced while building the answers above. Each is a decision we
should not make alone; each is small; none blocks the rest of the work.

## Q1 [COUNSEL + ACCOUNTANT] — one ledger cannot be purged, by design

Your C1.4 answer and the general position are that indefinite retention is not
applied. We implemented the seven-year purge for the billing records that
survive an account deletion, and four of the five tables now purge correctly.

**The fifth cannot.** `transaction_tax_snapshots` carries an append-only
database trigger that refuses every delete unconditionally, with the message
"corrections are new rows". That control was added deliberately, as an
accounting-ledger immutability guarantee, and we are not willing to weaken it
on our own judgement.

So that table is currently retained **permanently**, not for seven years. A
consequence worth stating: because nearly every real subscription generates at
least one tax event, the subscription rows those snapshots point at are
effectively retained permanently too.

**The question:** is permanent retention of the tax ledger the correct and
intended position (which is common accounting practice, and would mean your §8
"no indefinite retention" applies to everything except this ledger), or should
the ledger become deletable after a defined period, which would mean amending
a deliberate immutability control?

We would rather have the answer than the guess. If it is the former, we will
record it as an explicit, documented exception rather than an unexamined gap.

## Q2 [COUNSEL] — a bundle containing one custom-made item

Your C1.2 answer claims the personalised-goods exemption **per product**, via a
flag rendered at the product, in the cart, at checkout and in the confirmation.
We implemented exactly that.

Bundles were not addressed. An artist can sell several products together as one
priced unit, and one component may be custom-made while the others are not.

Our provisional rule, which engineering chose and which we are flagging rather
than settling: **a bundle is non-returnable if any component is custom-made.**
That is the conservative direction, but it is a legal determination we made.

**The question:** is a mixed bundle wholly non-returnable, partially returnable
(and if so, how is a partial return of a single priced unit even expressed), or
must it simply not be sold as one unit?

## Q3 [ACCOUNTANT] — A7 needs one founder decision recorded before we can use it

Your A7 answer says the "no separate card-processing fees" claim may carry at
the Plus rate **if** the founder records the per-transaction subsidy as
intended policy, and that the copy should bind to the fee-payer setting rather
than the rate.

We have implemented the binding and left the claim suppressed. This is not a
question for you; it is a note that the claim stays off our pages until that
founder decision exists, so nobody expects to see it.
