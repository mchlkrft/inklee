# Account Deletion — Draft Positions on the "True Counsel" Decisions

**Prepared:** 2026-06-08 · **For:** legal counsel review (Estonia/EU)
**Companion:** `docs/account-deletion-for-counsel.md` (the brief and the Q1–Q8 questions)

> **What this is.** Engineering's *proposed* positions on the four decisions that
> genuinely need counsel, drafted by analogy to how comparable booking/marketplace
> platforms and Stripe Connect handle the same problems. **None of this is legal
> advice or a legal conclusion.** Each position is written so counsel can either
> confirm it (and we implement immediately) or correct it. Citations are to public
> sources, not to authority binding on Inklee OÜ.
>
> **How to read it.** Each section gives: (a) the decision, (b) what comparable
> systems do, (c) our proposed position, (d) the residual question only counsel can
> close.

---

## Decision A — Controller / processor status (drives Q4)

**The decision.** Is Inklee a *processor* for client data (artist = controller, as
the brief assumes), or is Inklee a *controller / joint controller* in its own right?
This determines who owes the client erasure duties and what must happen to client
data on artist deletion.

**What comparable platforms do.** Booking platforms that sit between a merchant
(salon/artist) and an end-customer (client) generally do **not** treat themselves as
pure processors of the merchant's customer data. When a client books through Booksy,
the client's information is provided to **both Booksy and the specific business** —
i.e. the platform holds and uses the data for its own purposes (account servicing,
abuse prevention, platform analytics), which is controller-type processing, while the
merchant is also a controller for its own client relationship. Booksy operates its
own client-facing privacy policy and its own in-app/email deletion route, and on a
client deletion it both deletes its own copy **and** notifies the business to delete
external data. Fresha similarly publishes a Data Protection Addendum and provides the
business tooling to satisfy access/rectification/erasure. The practical pattern across
these platforms is **joint or independent controllership for the data the platform
itself uses**, with a separate processor-style flow only for data it strictly handles
on the merchant's instructions.

**Proposed position.** Treat Inklee as an **independent or joint controller** for the
client data it actively uses for platform purposes (booking servicing, audit/abuse
logs, the 3% fee records, anti-fraud), and as a **processor** only for the narrow set
of data it holds purely on the artist's instruction (e.g. the artist's private client
notes and client-uploaded reference photos, which Inklee never uses for its own ends).
Consequences we would implement under this position:

- Maintain Inklee's **own** Art. 6 lawful basis for the controller-side client data
  (contract / legitimate interest), documented in the Art. 30 record.
- Because we cannot realistically hold an Art. 28 **DPA with every individual artist**,
  cover the processor-side relationship in the **artist Terms** (the artist instructs
  Inklee to process client notes/photos on their behalf; standard Art. 28(3) terms
  baked into the ToS rather than per-artist contracts).
- On **artist deletion**, follow the Booksy pattern: delete Inklee's controller-side
  client data per our own retention rules, **and** treat the processor-side data
  (notes, photos) under Art. 28(3)(g) — delete or return. See Decision C for photos.

**Residual question for counsel.** Confirm the split above (which categories are
controller vs processor), and whether a **joint-controller arrangement** (Art. 26,
with an "essence of the arrangement" disclosure to clients) is required rather than
independent controllership. The brief's clean "artist = controller, Inklee = processor"
should **not** be relied on for the data Inklee uses for its own purposes.

---

## Decision B — Retention field set, period, and start point (Q1 / Q2)

**The decision.** What financial/tax data must Inklee keep after deletion, for how
long, from when, and which fields are stripped.

**What comparable systems do.** Two anchors:

- **Estonian Accounting Act § 12** requires accounting source documents (and the
  ledgers/contracts behind them) to be preserved **7 years from the end of the
  financial year** in which the transaction was recorded. This is the standard period
  every Estonian OÜ retains financial source documents for.
- **Stripe** independently retains the underlying transaction records and the
  connected account's KYC data under its own AML/KYC obligations, regardless of what
  the platform deletes — so the *counterparty-identifying* layer of a transaction
  already lives at Stripe as an independent controller.

**Proposed position.**

- **What Inklee must retain (B1).** Because the artist is merchant of record, the
  deposit principal is the **artist's** revenue, not Inklee's. Inklee's own accounting
  source document is the record of its **3% platform fee** (Inklee's revenue) and the
  data needed to substantiate it — which necessarily includes the **deposit amount it
  was calculated from**, currency, the Stripe reference, status, and timestamps.
  Inklee should **not** need to retain booking content or client identity to satisfy
  *its own* accounting obligation, because the identifying layer sits at Stripe.
- **Retained field set (B2).** Keep `{ fee amount, deposit amount (as fee basis),
  currency, Stripe payment-intent / checkout-session ID, status, timestamps, internal
  booking/order UUID }`. Strip `{ client email, client handle/name, free-text booking
  answers, client notes }`. Goods **line-item detail** stays out unless counsel says a
  valid tax record needs itemisation, in which case we retain **anonymised** line items
  (product descriptor + price, no client PII).
- **Period & start point (B3).** **7 years from the end of the financial year** in
  which the transaction was recorded (§ 12). Implement as one constant + a scheduled
  purge keyed to financial-year-end, not to the deletion date.
- **Re-label (B4 — engineering correctness, not a counsel call).** This retained set
  is **pseudonymised, not anonymised**: the Stripe IDs and internal UUIDs are
  re-identifiable (joinable via Stripe or the audit tombstone). It stays **in scope of
  GDPR** with Art. 6(1)(c) / Art. 17(3)(b) as its basis. We will stop calling it
  "anonymised" in code and docs.

**Residual question for counsel.** Confirm (i) that Inklee's accounting obligation
attaches only to its **own fee revenue** (not the full deposit/booking) given the MoR
structure; (ii) whether a valid retained tax/accounting record must identify the
**counterparty (client)** or whether amount + Stripe reference suffices with identity
living at Stripe; and (iii) the 7-year period + financial-year-end start point for
this specific data.

---

## Decision C — DPIA requirement & special-category condition for client photos (Q4b)

**The decision.** Are client-uploaded reference photos (tattoo placement / possibly
identifiable body images) **special-category data** under Art. 9, and is a **DPIA**
(Art. 35) required for this feature?

**What the guidance says.** Photographs are **not automatically** special-category
data. A photo becomes Art. 9 data only where it is **biometric data used for the
purpose of uniquely identifying** a person, or where it **reveals** another special
category (e.g. health). Tattoo placement images stored for a booking are generally
**not** biometric-for-identification (Inklee does not run facial/biometric matching),
so the mere storage is unlikely to trigger Art. 9 on the biometric limb — but such
images can be **sensitive in substance** (body/skin, possibly health-revealing) and
sit at the high end of risk. Separately, regulators expect a **DPIA for processing
likely to result in high risk**, which large-scale handling of potentially
health-adjacent images of identifiable people plausibly is.

**Proposed position.**

- **Art. 9 (C1).** Treat the photos as **ordinary personal data of elevated
  sensitivity** for storage purposes (no biometric identification use ⇒ Art. 9 not
  triggered on that limb), but apply special-category-grade **safeguards** anyway
  (access control, encryption, strict deletion). If counsel concludes any subset
  *reveals* health, we add an Art. 9(2) condition — most likely **explicit consent**
  at upload — and gate accordingly.
- **DPIA (C2).** **Conduct a DPIA before launch** covering: the photos, the financial
  data, the erasure-vs-retention blocking logic, and the cross-border Stripe transfer.
  Document the rationale either way (including the "not biometric-for-ID" finding).
  Treat the DPIA as a release-gating deliverable, not a post-launch artifact.
- **Deletion of photos on artist deletion (C3, ties to Decision A).** Under the
  processor characterisation of the notes/photos, deleting on artist deletion is
  defensible (Art. 28(3)(g)). Following the Booksy pattern, where the **client** has an
  independent relationship/claim (e.g. an unresolved deposit), preserve the client's
  route before destroying their images — i.e. don't let photo deletion strand a client
  mid-transaction.

**Residual question for counsel.** Confirm (i) the Art. 9 classification (and whether
explicit consent at upload is needed), and (ii) that a DPIA is required and what its
scope must cover. The brief's default ("just delete the photos on artist deletion") is
probably fine **mechanically** but should not ship without the Art. 9 + DPIA calls
made.

---

## Decision D — Stripe transfer mechanism & KYC retention lawfulness (Q5)

**The decision.** Is it lawful to leave the artist's Stripe account (holding KYC PII)
active at Stripe for the retention window, and what is the transfer mechanism for the
US processing?

**What the Stripe model establishes.** For Connect, Stripe acts as **both controller
and processor**. For identity-verification / KYC data specifically, Stripe is an
**independent controller** — it uses and retains that data for **its own** AML/KYC
legal obligations, and will continue to retain it even on a deletion request where a
legal retention duty applies. The platform's relationship with Stripe is governed by
the **Stripe DPA**, and Stripe provides the transfer safeguards (SCCs / Data Privacy
Framework participation) for processing in the US.

**Proposed position.**

- **KYC retention (D1).** Leaving the artist's KYC PII at Stripe for the window is
  **lawful from Inklee's standpoint**, because for that data **Stripe is the
  independent controller** retaining it under its **own** AML/KYC legal obligation —
  it is not Inklee's data to delete, and Inklee disabling app-side routing does not
  change Stripe's duty. Inklee should keep only a **pointer** (the connected-account
  ID), which is pseudonymous on Inklee's side and covered by the same 7-year window.
- **Transfer mechanism (D2).** Document the **Stripe DPA + SCCs / DPF** as the
  Art. 44–46 mechanism for the US transfer in Inklee's records and **disclose the
  Stripe-side processing in the privacy policy** (this is currently missing — see the
  Q8 policy-alignment gap).
- **Timing of Stripe-account deletion (D3).** Keep "retain pointer + scheduled delete
  at window-end," aligned to the **same 7-year clock as Decision B**, since deleting
  the Stripe account requires a zero balance and forecloses future refunds.

**Residual question for counsel.** Confirm (i) that Inklee may rely on **Stripe's
independent-controller AML retention** rather than having to force-disconnect the
account at deletion time; (ii) that the **Stripe DPA + SCCs/DPF** is the correct
transfer basis to cite; and (iii) the window for the scheduled Stripe-account deletion
(same as Decision B).

---

## One-line summary of proposed positions

| # | Decision | Proposed position (for counsel to confirm) |
|---|---|---|
| A | Controller/processor | Inklee = controller/joint-controller for data it uses; processor (via ToS) only for notes/photos |
| B | Retention set/period | Keep pseudonymised fee+deposit-amount+Stripe-ref+timestamps; **7 yrs from financial-year-end**; strip client PII |
| C | DPIA / Art. 9 photos | Not biometric-for-ID ⇒ Art. 9 likely not triggered, but apply high safeguards + **run a DPIA before launch** |
| D | Stripe KYC / transfer | Lawful to leave KYC at Stripe (Stripe = independent controller for AML); cite Stripe DPA + SCCs/DPF; delete at window-end |

---

## Sources (public, illustrative — not authority binding on Inklee)

- Stripe — Connect data roles & KYC: <https://support.stripe.com/questions/know-your-customer-(kyc)-requirements-for-connected-accounts>
- Stripe — identity data deletion / independent controller: <https://support.stripe.com/questions/managing-your-id-verification-information>
- Stripe — Data Processing Agreement: <https://stripe.com/legal/dpa>
- Booksy — client account deletion (in-app + 7-day business deletion): <https://help.booksy.com/hc/en-gb/articles/21595880211730-How-can-I-delete-my-Booksy-account>
- Booksy — GDPR / data shared with both platform and business: <https://biz.booksy.com/en-gb/blog/ensuring-your-salon-is-gdpr-compliant-a-step-by-step-guide>
- Fresha — Data Protection Addendum / GDPR tooling: <https://terms.fresha.com/data-protection>
- Estonian Accounting Act § 12 (7-year retention): <https://www.riigiteataja.ee/en/eli/530102013006/consolide>
- Estonian Tax & Customs Board — source-document retention: <https://www.emta.ee/en/admin/content/handbook_article/118>
- ICO — special category data / photographs & biometrics: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/>
