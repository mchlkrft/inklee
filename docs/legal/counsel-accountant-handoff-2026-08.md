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
