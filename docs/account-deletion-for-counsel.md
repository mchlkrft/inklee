# Account Deletion — Counsel Brief & Sign-off Request

**Prepared:** 2026-06-08 · **For:** legal counsel (Estonia/EU data-protection + commercial)
**Companion brief:** `docs/payment-flow-for-counsel.md` (the deposit-fee / merchant-of-record model — read first for the money-flow context).
**Status:** the feature is **built and code-complete but NOT yet released**; it is gated on your sign-off on the questions in §4.

> This brief is written by the engineering team, not by a lawyer. Where it says
> "our default," that is the conservative behaviour we have already implemented;
> please confirm it is lawful or tell us how to change it. Nothing here is a legal
> conclusion — the questions in §4 are the decisions we need from you.

---

## 0. Why this exists / what's at stake

Two independent requirements force Inklee to build in-app account deletion now:

1. **Apple App Store Guideline 5.1.1(v):** any app that supports account creation
   must let the user **initiate account deletion from inside the app** (a "manage
   on the web" link or a mere deactivation is rejected). This blocks our iOS launch.
2. **GDPR Article 17 (right to erasure):** a data subject can request deletion of
   their personal data. Today Inklee has **no self-service deletion at all** (only
   a manual admin action), which is itself a standing Art. 17 gap.

The hard part is that deletion collides with **financial / tax record-keeping
obligations** and with **client money held in flight** (because of how our deposit
model works — see §2). We need your sign-off to resolve that collision lawfully
before we ship.

---

## 1. The company & the parties

- **Controller:** Inklee OÜ (Estonia). *(Please confirm the exact legal entity and
  its data-controller status for each data category below.)*
- **Two classes of data subject:**
  - **Artists** — our direct users. They create the account being deleted.
  - **Clients** — the artists' customers, whose personal data the **artist** has
    entered/collected through Inklee (booking details, email/handle, and
    client-uploaded reference photos). For this data, the **artist is the
    controller and Inklee is the processor** *(please confirm this characterisation)*.
- **Jurisdiction:** Inklee is Estonian; artists and clients are EU-wide. The
  retention questions below turn on **Estonian accounting/tax law** and **EU GDPR**.

---

## 2. The relevant data & money flows (facts counsel must reason from)

### 2.1 What personal data Inklee holds about an artist (deleted on account deletion)
- **Artist identity/profile:** name, email, Instagram handle, bio, location, profile/cover images.
- **Client data the artist collected** (artist = controller): booking requests
  (client email/handle, free-text answers, preferred dates), private client notes,
  waitlist entries, and **client-uploaded reference photos** (tattoo placement
  images — potentially body/skin images that can be personal/sensitive).
- **Financial/transaction data:** deposit records (amounts, currency, Stripe
  payment-intent IDs, paid/refunded timestamps), any goods orders, and **Inklee's
  3% platform-fee records**.
- **Auth + technical:** login email (in the auth system), push tokens, audit logs.
- **Stripe Connect account:** see §2.3.

### 2.2 The deposit money model (critical to the deletion design)
Inklee uses **Stripe Connect (Custom)**. Per the companion brief:
- The **artist is the merchant of record (MoR)** for each deposit. When a client
  pays a deposit, the money settles into the **artist's** Stripe balance.
- **Inklee keeps a 3% platform fee** (an `application_fee`) on each in-app deposit —
  **this 3% is Inklee's own revenue** and is the financial transaction Inklee is a
  party to. The deposit principal is the artist's, between artist and client.
- Refunds reverse the transfer from the artist and return Inklee's fee.

**Consequence for deletion:** if an artist deletes their account while a client has
**paid a deposit that hasn't been refunded**, that money sits in the artist's Stripe
balance, and deleting our records destroys the in-app path to refund it — the client
could be left out of pocket with no recourse through us.

### 2.3 Stripe-side retention (independent of Inklee)
Stripe **independently retains** the underlying transaction records and the artist's
**KYC data** (legal name, date of birth, address, bank/IBAN, uploaded ID documents)
under Stripe's own AML/KYC obligations, regardless of what Inklee deletes. Deleting
the Stripe Connect account is only possible at a **zero balance** and **forecloses
any future refund** of that account's past charges.

---

## 3. What we have built (the conservative defaults awaiting your confirmation)

A single deletion routine runs, in order:

1. **Money pre-flight — BLOCK.** If the artist has any **paid-but-not-refunded
   deposit** or a **non-zero Stripe balance**, deletion is **refused** with a message
   telling them to resolve/refund those first. *(Nothing is deleted on a block.)*
2. Cancel any unpaid pending card payments (so no client can pay into a gone account).
3. **Anonymise-and-retain a financial subset:** before deleting, we copy a
   **PII-stripped** financial snapshot into a separate retention table. We keep
   **money amounts, currency, Stripe IDs, and timestamps**; we **strip** client
   email/handle/name, free-text answers, and notes.
4. **Hard-delete everything else:** the artist's profile, all client data the artist
   collected (booking PII, notes, waitlist), all uploaded images in storage, and the
   login/auth record.
5. **Retain the Stripe Connect account pointer** (we do **not** delete the Stripe
   account at deletion time — see Q5), tagged with a deletion date.
6. Keep a minimal pseudonymous **audit "tombstone"** (a bare user-ID, no other PII)
   recording that the account was deleted and when.

We have **not** fixed: the exact list of retained financial fields, the **retention
period**, or the timing of the eventual Stripe-account deletion — those are your call.

---

## 4. The questions we need you to sign off on

### Q1 — Retention vs erasure: what financial/tax records must Inklee keep, and for how long?
**Tension:** GDPR Art. 17 says delete; Estonian accounting/tax law (and Art. 17(3)(b),
processing necessary for a **legal obligation**) may require **keeping** financial
records. **Our default:** retain an anonymised financial snapshot (amounts, currency,
Stripe IDs, timestamps), delete the rest.
- **Q1a.** Does Estonian law require Inklee to retain records of the **deposit
  transactions** at all, given the **artist is MoR** and the deposit principal is the
  artist's money — or does Inklee only need to retain records of its **own 3% fee
  revenue** (which Stripe also holds)? *(This determines whether we retain anything
  tied to the booking, or essentially nothing locally.)*
- **Q1b.** What is the **retention period**? (We have heard "7 years" for Estonian
  accounting source documents — please confirm the exact period and start point.)
- **Q1c.** After the period elapses, may we **hard-delete** the retained snapshot and
  the Stripe account (see Q5)? We can schedule that automatically.

### Q2 — Anonymisation: exactly which fields may we keep vs must we strip?
**Our default:** keep `{ amount, currency, Stripe payment-intent / checkout-session
ID, deposit/goods/fee amounts, status, timestamps, internal booking/order UUIDs }`;
strip `{ client email, client handle/name, free-text booking answers, client notes }`.
- **Q2a.** Is that the right line? In particular, does a valid retained **tax/
  accounting record require identifying the counterparty** (the client), or is an
  amount + Stripe reference sufficient (the client's identity living at Stripe)?
- **Q2b.** Goods **line-item detail** (what was sold, unit price) currently is **not**
  retained (only order totals). If the tax record needs itemisation, tell us and we
  will retain anonymised line items (product descriptors, no client PII).

### Q3 — May we block account deletion while client money is unresolved? (artist-as-MoR / consumer protection)
**Our default:** **block** deletion (do not delete) until paid-unresolved deposits are
refunded/resolved and the Stripe balance is zero. Rationale: not stranding a client's
paid deposit; not leaving the artist (MoR) with an un-refundable obligation; and
Stripe won't delete an account with a balance anyway.
- **Q3a.** Is conditioning deletion on "resolve your financial obligations first"
  compatible with the **Art. 17 erasure right**? We read this as Art. 17(3)(b)/(e)
  (retention for legal claims / legal obligation) rather than a refusal of erasure,
  and as a **consumer-protection** measure to avoid stranding client money — please
  confirm the framing and that "block until resolved" is defensible, **or** tell us we
  must instead **delete the account but auto-refund** the client first (we can build
  auto-refund; it has cost/edge-case implications for Inklee that we'd want to discuss).
- **Q3b.** If an artist with unresolved deposits **insists on erasure** and won't
  resolve them, what is the lawful path (e.g. we anonymise the artist's PII but retain
  the financial/claim records and the client's refund route)?

### Q4 — Client-uploaded reference photos (third-party personal data)
The `bookings` storage holds **client-uploaded photos** (tattoo placement, possibly
identifiable body images). The **artist** is the controller for these; on **artist**
deletion they become controllerless. **Our default:** **delete** them (a routine
already deletes them 30 days after a booking is rejected/cancelled).
- **Q4a.** Is deleting the client's photos on **artist** deletion correct, or does the
  **client** have a retention claim to their own images / must we offer the client
  anything before deleting?
- **Q4b.** Should these images be treated as **special-category** data (Art. 9, if
  they reveal e.g. health/biometric/identifiable body features), and does that change
  anything about how/whether we store, retain, or delete them more broadly?

### Q5 — Stripe Connect account & its KYC data: delete now or retain for the window?
**Facts:** the artist's Stripe account holds KYC PII (name, DOB, address, IBAN, ID
docs) **at Stripe**; Stripe retains it independently for AML/KYC. Deleting it requires
a zero balance and **forecloses future refunds** of past charges. **Our default:**
**do not delete** the Stripe account at deletion time; retain the account pointer for
the retention window, then delete it via a scheduled job at window-end.
- **Q5a.** Is it lawful to leave the artist's Stripe account (and its KYC PII) **active
  at Stripe** for the retention window, given Stripe's own AML retention duty — or must
  we **disable/disconnect** it immediately (even though our app can no longer route
  charges to it once the artist's records are gone)?
- **Q5b.** Confirm the window for the scheduled Stripe-account deletion (same as Q1b?).

### Q6 — Pseudonymous audit retention
We retain a **bare user-ID** (a random UUID, no name/email) in a deletion "tombstone"
and an admin moderation log, indefinitely, for security/abuse-defence and to prove the
deletion occurred. **Q6:** Is indefinite retention of a pseudonymous identifier (no
other PII) acceptable, or must it also be time-boxed/erased?

### Q7 — Consent/intent capture (confirmation vs re-authentication)
**Our default:** the user must **type "DELETE"** to confirm, on a dedicated screen,
behind their authenticated session. **Q7:** Is type-to-confirm sufficient to evidence
informed intent for an irreversible deletion, or do you advise requiring
**re-authentication** (re-entering credentials / re-doing Sign in with Apple) before we
execute it? (Apple's rule is satisfied either way; this is about consent robustness and
preventing unauthorised deletion.)

### Q8 — Privacy-policy alignment
Our published privacy policy currently states artist data is kept "**plus 30 days**"
after deletion and audit logs for **24 months**, and qualifies erasure as "subject to
legal retention requirements." **Q8:** Does the implemented behaviour (immediate
hard-delete of most data + the anonymised financial-record retention in Q1) **match the
published policy**, and does the policy need updating to disclose the
financial-record retention, the Stripe-side KYC retention (Q5), and the money-block
(Q3)? Please mark any required policy text changes.

---

## 5. What a sign-off looks like (so we can implement immediately)

Each answer maps to a concrete code/config change we can make in hours:

| Decision | What we set on your answer |
|---|---|
| Q1b retention window | one constant + a scheduled purge job |
| Q2a/Q2b retained field set | the explicit allowlist of retained columns (+ line items if needed) |
| Q3 block vs auto-refund | keep block (built) **or** build auto-refund-before-delete |
| Q4 client photos | keep delete (built) **or** add a client-notice/retention step |
| Q5 Stripe timing | keep "retain + scheduled delete" (built) **or** disable-immediately |
| Q6 audit window | keep indefinite (built) **or** add a purge |
| Q7 re-auth | keep type-to-confirm (built) **or** add re-authentication |
| Q8 policy text | we update the privacy policy to the wording you provide |

**Bottom line we need confirmed:** (1) the **retained financial field set + window**,
(2) the **lawfulness of blocking deletion** while client money is unresolved (or the
mandate to auto-refund instead), and (3) the **Stripe-account retention timing** and
**privacy-policy wording**. Items Q4/Q6/Q7 are lower-risk confirmations.

---

*Engineering references (for counsel's technical advisor, optional): design +
data-flow detail in `docs/account-deletion-design-2026-06-08.md`; the deposit/MoR/fee
model in `docs/payment-flow-for-counsel.md`.*
