# Inklee — payment flow & platform model (for legal counsel)

**Prepared 2026-06-03. Revised 2026-07-21.** This document describes, in plain
terms, how money moves through Inklee so counsel can advise on VAT, consumer
disclosure, refund policy, payment-intermediary/PSD2 status, and the artist
terms. It is self-contained; no code reading required. Open questions for
counsel are collected in §10.

> **What changed on 2026-07-21** (first live money test): in-app card deposits
> require the deposit **entitlement** as well as an active Stripe account (§3),
> Inklee can **waive its own fee** for an artist up to a capped budget (§4), the
> refund asymmetry is now actually implemented rather than in progress (§6), and
> artist identity documents can now be supplied in-app (§9). Nothing about who
> holds the money, who is merchant of record, or what the client pays has
> changed.

---

## 1. What Inklee is

Inklee is a **tattoo booking intake tool**. A tattoo artist gets a booking link
for their Instagram bio and a dashboard that organises incoming requests
(approve / decline / waitlist / deposit / calendar / guest-spot trips).

- **The entire booking product is free of any payment setup.** Intake,
  organisation, calendar, waitlist, etc. all work with no payment processing at
  all. Most of the product never touches money.
- **Deposit collection is one optional feature** layered on top. This document
  is only about that feature.

**Operator:** Inklee OÜ (Estonia), registry code 17497625. **Currently not
VAT-registered** (below threshold). Bank/settlement via Stripe.

---

## 2. The parties

| Party          | Role                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inklee OÜ**  | The platform. Provides the software. Facilitates (but does not hold) deposit payments. Charges artists a percentage platform fee on deposits collected in-app.                           |
| **The artist** | Inklee's customer (a tattoo artist). For any deposit collected in-app, the artist is the **merchant of record** — the deposit is the artist's money and is paid by their client to them. |
| **The client** | The artist's customer (the person getting tattooed). Pays the deposit.                                                                                                                   |
| **Stripe**     | The regulated payment service provider (PSP). Processes the card payment and moves funds. Inklee uses **Stripe Connect** (Express accounts + destination charges).                       |

The key posture: **Inklee is a platform/facilitator, not the seller and not a
money-holder.** Each artist receives deposits into the artist's _own_ Stripe
account. Inklee only ever receives its own platform fee.

---

## 3. The two deposit modes

When an artist accepts a booking request, they can optionally request a deposit.
There are two modes. An in-app card deposit requires **both** of the following;
if either is missing the request becomes a manual deposit instead:

1. the artist has an **active Stripe Connect account** (finished onboarding and
   Stripe reports charges enabled), and
2. the artist's account carries the **deposit entitlement** (the paid tier, or a
   comp granted by Inklee — see `docs/artist-account-and-payouts.md`).

Which mode applies is decided **before** any payment is attempted, and the
artist is told plainly which one they are about to use: the request screen
either says the client pays by card via a link in their booking email, or that
the artist will collect directly and mark it received. **A failure while setting
up the card payment never silently converts the request into a manual deposit**
(fixed 2026-07-21 after it did exactly that in production): the artist gets an
error and the booking is left untouched, with nothing sent to the client.

### 3a. In-app card deposit (artist has connected Stripe) — money flows via Inklee's platform

- The client pays the deposit by card on a secure page.
- The payment is processed through **Stripe Connect** so the deposit settles
  into the **artist's own Stripe account**.
- Inklee takes a **percentage platform fee** (see §4) for providing the
  software + facilitating the payment.
- Inklee never holds the deposit. It is the artist's money throughout.

### 3b. Manual deposit (artist not connected, or not entitled) — no Inklee money rails

- No card payment runs through Inklee. The artist tells the client how to pay
  them directly (e.g. bank transfer, in person), the client pays the artist
  directly, and the artist marks the deposit as received in the dashboard.
- **No money touches Inklee at all.** Inklee charges no fee here. Inklee's only
  role is tracking the booking status.

This document's commercial and legal questions concern **mode 3a** only.

---

## 4. The platform fee and the money split (in-app deposits)

**Fee = 3% of the deposit, "all-in" and deducted** (founder decision
2026-06-03):

- The **client pays exactly the deposit amount** — there is **no surcharge** to
  the client. The deposit they agreed with the artist is exactly what leaves
  their card.
- The artist's all-in cost is **~3% of the deposit**, which already includes
  the card-processing cost. Inklee absorbs Stripe's standard processing fee out
  of its own cut rather than adding it on top of the artist.
- The fee is **deducted from the artist's side** of the payment, never added to
  the client's.

### Worked example — a €200 deposit

| Party                                                  | Amount                                          |
| ------------------------------------------------------ | ----------------------------------------------- |
| Client pays                                            | **€200.00** (exactly the deposit, no surcharge) |
| Artist receives (into the artist's own Stripe account) | **€194.00** (a 3% all-in deduction)             |
| Inklee receives (the application fee, gross)           | **€6.00** (the full 3%)                         |
| Stripe bills Inklee (card processing)                  | **~€3.25** (charged to Inklee's balance)        |
| **Inklee net**                                         | **~€2.75**                                      |

The artist's deduction is exactly €6 in every case. Stripe's cost is a separate
charge against **Inklee's** balance, so the variability between card types
lands on Inklee's margin rather than on the artist. The client always pays
exactly €200.

### How this is implemented in Stripe (plain terms)

The deposit is a Stripe Connect **destination charge** with three properties:

1. **`on_behalf_of` = the artist's connected account.** This makes the **artist
   the merchant of record / settlement merchant**: the charge settles in the
   artist's country and currency, and the artist's name is the business of
   record.
2. **`transfer_data.destination` = the artist's connected account.** The funds
   land in the artist's Stripe balance, not Inklee's.
3. **`application_fee_amount` = the full 3%.** Under the Custom model the
   connected account is configured with `fees.payer = application`, so **Stripe
   bills its own processing fee to Inklee's platform balance separately**
   instead of deducting it from the charge. The application fee is therefore the
   whole 3%, and Inklee's *net* is that 3% minus what Stripe charges Inklee.

**Inklee never takes custody of the deposit.** Stripe moves the gross amount to
the artist's account and routes only Inklee's fee to Inklee.

> **Corrected 2026-07-21.** An earlier revision of this document said the
> artist's account bore Stripe's processing fee and that Inklee's fee was sized
> as "3% minus Stripe's fee". That described the **Express** model this product
> no longer uses. Under the Custom model actually in production, Stripe's cost
> sits on **Inklee's** balance. The artist's deduction is always exactly 3%,
> and the variability sits with Inklee, not the artist. Everything below
> reflects the shipped configuration.

### Edge cases (for completeness)

- **Foreign / premium cards** carry a higher Stripe processing fee than the
  standard rate Inklee sizes against. Because Stripe bills Inklee rather than
  the artist, that excess is borne by **Inklee**: the artist still loses exactly
  3% and the client still pays exactly the deposit. On an expensive card Inklee's
  margin narrows and can go negative.
- **Very small deposits.** There is **no fee floor**. Inklee still takes the full
  3% application fee, but Stripe's fixed per-charge component is billed to
  Inklee, so on a small enough deposit Stripe's cost exceeds Inklee's 3% and
  **Inklee makes a loss on that transaction**. The artist is unaffected and still
  pays exactly 3%. (A €1 test deposit therefore costs Inklee money by design.)
- **Sponsored fees.** Inklee can waive its own 3% for a given artist, typically
  a beta artist, for a period and up to a spending cap. The client still pays
  exactly the deposit and the artist still receives it in full; the only
  difference is that Inklee's `application_fee_amount` is set to zero, so Inklee
  earns nothing on that deposit and still bears Stripe's processing cost. The
  waiver is decided per deposit against the remaining budget, so a single
  deposit can never take the total past the cap. Because the fee is fixed when
  the payment is created and cannot be partially waived afterwards, a waiver is
  all-or-nothing per deposit.

---

## 5. Merchant of record (prior clearance — please re-confirm)

Counsel previously cleared (item "LO-2", 2026-06-02) that under a Stripe
destination charge with `on_behalf_of`, **each artist is the merchant of
record** for the deposit, and Inklee is **not** the merchant/seller of record
and does **not** hold the artist's funds.

The only change since that clearance is the addition of the
`application_fee_amount` (Inklee's platform fee). Inklee believes this does not
change the merchant-of-record analysis (Inklee is taking a platform service fee,
not becoming the seller), but **asks counsel to confirm** that adding a platform
fee on top of the destination charge does not shift merchant-of-record or
fund-holding status to Inklee. (See §10, Q5.)

### Material change since that clearance: Express → Custom (please review)

The clearance was given while the product used Stripe **Express** connected
accounts. Production now uses **Custom** connected accounts, configured so that:

- **Inklee collects verification, not Stripe** (`requirement_collection:
  application`). The artist never visits Stripe and has **no Stripe dashboard**
  (`stripe_dashboard: none`). Inklee's interface is the only place they can
  supply identity information or see their payout status.
- **Inklee pays Stripe's processing fee** (`fees.payer: application`), as set
  out in §4.
- **Inklee is liable for payment losses** (`losses.payments: application`).
  Chargebacks and disputes on a deposit fall on **Inklee's** balance, not the
  artist's.

The last point is the one Inklee most wants reviewed. It sits uneasily beside
"the artist is merchant of record and Inklee never holds or fronts the funds":
Inklee does not hold the money, but it does carry the downside if a client
disputes a charge. **Counsel is asked whether accepting payment-loss liability
affects the merchant-of-record analysis, Inklee's regulatory position, or what
must be disclosed to artists and clients.** (See §10, Q11.)

---

## 6. Refunds — who keeps the deposit depends on who cancels

The intended policy (founder direction 2026-06-03) is **asymmetric**, matching
how tattoo deposits normally work:

- **If the client cancels**, the deposit is **non-refundable** — the artist
  keeps it (it protected the artist's reserved time/preparation). No money moves;
  the booking is simply cancelled. (The artist may still choose to refund as a
  goodwill gesture, but that is discretionary, not the default.)
- **If the artist cancels**, the client did nothing wrong, so the deposit is
  **refunded in full** to the client. The artist bears the cost of their own
  cancellation.

**Mechanics of the artist-cancellation refund:**

- The refunded amount is **reversed from the artist's Stripe account** (the
  artist holds the money as merchant of record). If the artist has already
  withdrawn it, Stripe's standard negative-balance handling recovers it from the
  artist's account — i.e. "the artist pays" is enforced by Stripe, and **Inklee
  never fronts the money**.
- **Inklee returns its platform fee** — Inklee keeps nothing on an
  artist-cancelled deposit.
- **Stripe does not return its processing fee** on a refund (standard for any
  card refund). Because that fee was billed to Inklee in the first place (§4),
  the non-refundable cost falls on **Inklee**, not the artist.
- The **client receives the full deposit amount back.**

So on an artist-cancelled €200 deposit: the client gets €200 back, the €200
comes back out of the artist's balance, Inklee returns its €6 application fee,
and Inklee absorbs Stripe's ~€3.25. **A refunded deposit is a net loss to
Inklee**, which is the correct incentive but worth stating plainly.

The artist has **no Stripe dashboard** under the Custom model, so the in-app
refund is not a convenience: it is the only route available to them. A refund
can otherwise only be issued by Inklee from the platform's own Stripe account.

**The asymmetry is implemented as described** (verified 2026-07-21). An artist
cancelling a booking with a paid deposit triggers the refund automatically, and
a client cancelling from their portal is shown, before they confirm, that their
deposit is non-refundable and the artist keeps it. The legal question below (Q9)
still drives how strict that default may be.

**Sponsored deposits and refunds.** When Inklee had waived its fee on a deposit
that is later refunded, Inklee returns nothing (there was nothing to return) and
the waiver is credited back to that artist's sponsorship budget, so a refunded
deposit does not consume their allowance. This is internal accounting between
Inklee and the artist and does not change what the client receives.

---

## 7. What money Inklee actually receives

Inklee's only revenue from this feature is the **platform fee** (the
`application_fee_amount`), which arrives in Inklee's own Stripe balance. On the
€200 example, that is ~€2.75. Inklee:

- never receives the deposit itself;
- never holds client or artist funds in transit;
- receives only its platform service fee, after Stripe has routed the rest to
  the artist.

(Inklee's other intended revenue line, separate from this, is a software
subscription. That is not implemented yet and is out of scope here.)

---

## 8. Out of scope (so counsel knows the boundaries)

- **Goods / merchandise:** artists can display products on their public page,
  but there is **no in-app checkout for goods** — it is display-only. No money
  flows for goods. (An earlier in-app goods-checkout was removed from the live
  flow.)
- **Subscriptions / plan billing:** not implemented.

---

## 9. Data handling (brief)

- **Card data** is entered directly into Stripe's hosted fields; Inklee never
  sees or stores card numbers.
- **Artist identity data for payouts** (name, date of birth, address, phone,
  IBAN, and any identity document Stripe asks for) is collected inside Inklee,
  because Inklee runs Stripe Connect in the mode where the platform collects
  verification rather than sending the artist to Stripe. It is forwarded
  straight to Stripe from memory and is **never written to an Inklee database,
  never placed in Inklee's file storage, and never logged**. Only the resulting
  account status is stored. Identity documents were previously impossible to
  supply in-app at all; that was closed on 2026-07-21.
- Inklee stores booking metadata (the client's handle/email, the request
  details, the deposit amount/status, and Stripe identifiers such as the
  payment-intent ID and refund ID) to run the booking workflow.
- The client receives the deposit request and confirmation by email.

(Full privacy/DPA documentation exists separately; this is only a pointer.)

---

## 10. Questions for counsel

1. **VAT on Inklee's platform fee.** Inklee OÜ is Estonian and currently not
   VAT-registered (below threshold). The platform fee is Inklee's revenue from
   facilitating a payment for an artist who may be in another EU country (B2B)
   or potentially outside the EU.
   - Is the platform fee a VATable supply of services? If so, where is it
     supplied (artist's country / reverse charge / Estonia)?
   - Does collecting this fee count toward the Estonian VAT-registration
     threshold (ties to prior item "LO-7"), and at what point must Inklee
     register?
   - What invoicing obligation does Inklee have to the artist for the fee
     (Stripe records the `application_fee`; is a separate Inklee invoice
     required)?

2. **Customer (client) disclosure.** Under the deducted model the client pays
   **exactly the deposit** with **no surcharge** — the fee is entirely between
   Inklee and the artist. Does any EU consumer-law / surcharge-transparency
   obligation require disclosing Inklee's fee to the _client_, or is it purely a
   B2B matter between Inklee and the artist that needs no client-facing
   disclosure?

3. **Artist disclosure wording.** The artist is shown, before requesting a
   deposit: _"Inklee fee (3%, incl. card processing): −€X · You receive €Y."_ Is
   this adequate disclosure of the fee to the artist, and is the "incl. card
   processing" framing (Inklee absorbing Stripe's standard fee) acceptable given
   foreign/premium cards can make the artist's effective cost slightly exceed
   3%?

4. **Refund-of-fee policy.** Is the refund design in §6 acceptable — Inklee
   returns its fee, the client is made whole, and the artist bears Stripe's
   non-refundable processing fee? Are there consumer-law constraints on deposit
   refunds (refund windows, mandatory full refunds in certain cases) Inklee
   should reflect, given the artist sets their own deposit/cancellation policy?

5. **Merchant of record with a platform fee.** Please re-confirm (per §5) that
   adding `application_fee_amount` to the existing destination charge +
   `on_behalf_of` does **not** make Inklee the merchant of record or a holder of
   artist/client funds.

6. **Payment-intermediary / PSD2 status.** Inklee facilitates payments but
   **never holds funds** (Stripe is the regulated PSP; deposits settle directly
   to the artist's Stripe account; Inklee receives only its own fee). Does this
   facilitation, together with charging a platform fee, create any obligation
   for Inklee under PSD2 / payment-institution or money-remittance rules, or is
   Inklee covered by Stripe's regulated status + a platform/commercial-agent
   position?

7. **Terms.** What clause(s) should be added to the artist-facing Terms to cover
   the platform fee (rate, that it is deducted from deposits collected in-app,
   refund behaviour, and that the artist is merchant of record for deposits)?

8. **VAT on the deposit itself (not Inklee's fee).** The deposit is the artist's
   income, and the artist is merchant of record. We assume any VAT on the
   _deposit_ is the artist's responsibility, not Inklee's. Please confirm Inklee
   has no VAT obligation on the deposit amount (only potentially on its own fee
   per Q1).

9. **Non-refundable deposit on client cancellation (forfeiture).** The intended
   default (§6) is that a deposit is **non-refundable when the client cancels**
   (the artist keeps it) and **fully refunded when the artist cancels**. Is a
   "non-refundable on client cancellation" deposit enforceable under EU consumer
   law for a service like this, and are there constraints we must build in — e.g.
   a distance-selling right of withdrawal / cooling-off period, a requirement
   that the term be clearly disclosed before the client pays, limits on the
   forfeitable amount (deposit vs. unfair penalty), or scenarios where a
   partial/full refund is mandatory regardless of who cancels? Inklee can present
   the artist's deposit/cancellation policy to the client before payment if
   required — please specify what disclosure is needed and any hard limits.

10. **Fee waivers for beta artists.** Inklee waives its entire 3% for selected
    artists during the beta, for a period and up to a spending cap (§4). Those
    deposits therefore run with no platform fee at all while Inklee still pays
    Stripe's processing cost. Does waiving the fee for some artists and not
    others create any issue we should be aware of (pricing transparency toward
    artists, the terms we publish, or the VAT treatment in Q1 when the fee is
    zero)?

11. **Payment-loss liability under the Custom model (new, please review).** As
    set out in §5, the connected accounts are configured with
    `losses.payments: application`, so **Inklee bears chargeback and dispute
    losses** on deposits, and with `fees.payer: application`, so Inklee pays
    Stripe's processing fees. Inklee still never holds the deposit and the
    artist remains merchant of record. Does accepting loss liability change the
    merchant-of-record or payment-intermediary analysis previously cleared under
    the Express model, does it create any licensing/regulatory exposure, and
    what must be disclosed to artists (who are shielded from those losses) and
    to clients (whose disputes Inklee, not the artist, ultimately absorbs)?

---

## Appendix — one-line summary of the money flow

> Client pays the agreed deposit by card → Stripe routes the full deposit to the
> **artist's own** Stripe account (artist = merchant of record via
> `on_behalf_of` + destination charge) → Inklee receives a **3% all-in platform
> fee**, deducted from the artist's side → Stripe bills its own processing cost
> to **Inklee's** balance separately, so Inklee's net is that 3% minus Stripe's
> cut → Inklee never holds the deposit, but does carry payment-loss liability.
> Refunds reverse the deposit to the client, Inklee returns its fee, and
> Stripe's non-refundable processing cost falls on **Inklee**.
