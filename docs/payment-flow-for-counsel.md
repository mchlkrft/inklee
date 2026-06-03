# Inklee — payment flow & platform model (for legal counsel)

**Prepared 2026-06-03.** This document describes, in plain terms, how money
moves through Inklee so counsel can advise on VAT, consumer disclosure, refund
policy, payment-intermediary/PSD2 status, and the artist terms. It is
self-contained; no code reading required. Open questions for counsel are
collected in §10.

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
There are two modes, depending on whether the artist has connected Stripe:

### 3a. In-app card deposit (artist has connected Stripe) — money flows via Inklee's platform

- The client pays the deposit by card on a secure page.
- The payment is processed through **Stripe Connect** so the deposit settles
  into the **artist's own Stripe account**.
- Inklee takes a **percentage platform fee** (see §4) for providing the
  software + facilitating the payment.
- Inklee never holds the deposit. It is the artist's money throughout.

### 3b. Manual deposit (artist has NOT connected Stripe) — no Inklee money rails

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
| Inklee keeps (platform fee)                            | **€2.75**                                       |
| Stripe keeps (card processing)                         | **€3.25**                                       |

So of the artist's €6 (3%) total deduction, Inklee nets ~€2.75 and Stripe takes
~€3.25. The exact split varies slightly with card type (see "edge cases"
below), but the client always pays exactly €200 and the artist's headline cost
is presented as a flat 3%.

### How this is implemented in Stripe (plain terms)

The deposit is a Stripe Connect **destination charge** with three properties:

1. **`on_behalf_of` = the artist's connected account.** This makes the **artist
   the merchant of record / settlement merchant**: the charge settles in the
   artist's country and currency, the artist's name is the business of record,
   and Stripe's processing fee is borne by the artist's account.
2. **`transfer_data.destination` = the artist's connected account.** The funds
   land in the artist's Stripe balance, not Inklee's.
3. **`application_fee_amount` = Inklee's fee.** Inklee receives only this
   platform fee. (It is sized as "3% of the deposit minus Stripe's standard fee"
   so that the artist's all-in cost lands at ~3% and Inklee absorbs the
   standard processing cost — see §4 example.)

**Inklee never takes custody of the deposit.** Stripe moves the gross amount to
the artist's account and routes only Inklee's fee to Inklee.

### Edge cases (for completeness)

- **Foreign / premium cards** carry a higher Stripe processing fee than the
  standard rate Inklee sizes against. That excess is borne by the **artist's**
  account (consistent with the artist being merchant of record), so on those
  cards the artist's effective cost is slightly above 3%. The client still pays
  exactly the deposit.
- **Very small deposits (under ~€17)**: Stripe's fixed component already exceeds
  the entire 3%, so Inklee's fee is floored at €0 (Inklee keeps nothing) and the
  artist covers the small processing shortfall.

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

---

## 6. Refunds

If a deposit needs to be returned (e.g. the artist cancels), the artist can
trigger a **full refund** from within Inklee. Mechanics:

- The refunded amount is **reversed from the artist's Stripe account** (the
  artist holds the money as merchant of record).
- **Inklee returns its platform fee** — Inklee keeps nothing on a refunded
  deposit.
- **Stripe does not return its processing fee** on a refund (this is Stripe's
  standard behaviour, true for any card refund). That non-refundable processing
  cost falls on the **artist's** account — identical to the artist issuing a
  refund from their own Stripe dashboard.
- The **client receives the full deposit amount back.**

So on a refunded €200 deposit: client gets €200 back, Inklee returns its €2.75,
and the artist's account absorbs Stripe's ~€3.25 (which Stripe keeps).

The in-app refund is a convenience; because the artist is merchant of record and
holds the funds, the artist can also refund directly from their own Stripe
dashboard.

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

---

## Appendix — one-line summary of the money flow

> Client pays the agreed deposit by card → Stripe routes the full deposit to the
> **artist's own** Stripe account (artist = merchant of record via
> `on_behalf_of` + destination charge) → Inklee receives only a **3% all-in
> platform fee** (deducted from the artist's side, Stripe's processing cost
> absorbed within it) → Inklee never holds the funds. Refunds reverse the
> deposit to the client, Inklee returns its fee, and Stripe's non-refundable
> processing cost falls on the artist.
