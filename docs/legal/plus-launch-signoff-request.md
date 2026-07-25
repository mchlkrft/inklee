# Inklee Plus launch: sign-off requests (plain-language summary)

**Date:** 2026-07-24. **From:** Inklee engineering.
**For:** our lawyer (counsel), our accountant, and the founder.

This is a plain-language cover note that pulls together everything still waiting
for a sign-off before we can turn on paid Inklee Plus subscriptions. It is not
legal or tax advice. The detailed source packages are linked at the bottom; this
page just says, in normal words, what each person is being asked to confirm.

---

## The situation in four sentences

- We have fully built a paid plan, "Inklee Plus," including everything EU law
  asks for (clear checkout, a 14-day right to change your mind, refunds, receipts).
- It is switched **off**. No customer can be charged and no customer sees any of
  the new wording yet, because it sits behind a launch switch.
- We are launching to **consumers first** (individual artists buying for
  themselves), and Inklee is a small business **not registered for VAT**, so
  **no VAT is added** and the price shown is the final price.
- To flip the switch on, we need a handful of confirmations from the lawyer, the
  accountant, and the founder. This note lists exactly those.

---

## The prices everyone is signing off around

| Plan | Price (final, no VAT added) | Billing | Renews | Can cancel | 14-day change-of-mind refund |
|---|---|---|---|---|---|
| Free | 0 EUR | n/a | n/a | n/a | n/a |
| Inklee Plus, monthly | 3.00 EUR / month | Monthly | Automatically until cancelled | Any time, in-app | Yes |
| Inklee Plus, yearly (planned, not built yet) | 24 EUR first year, then 30 EUR / year | Yearly | Automatically until cancelled | Any time, in-app | Yes |

---

# Part 1: for our lawyer (counsel)

You already answered the big legal questions earlier (that Plus is a "digital
service" and the 14-day right applies). What is left is mostly **approving the
exact words customers will read**, plus four short yes/no confirmations.

### 1a. Approve the customer-facing wording

These are the real draft sentences a customer will see. We need you to confirm
they are fine, or send edits.

**A. The optional "start now" checkbox** (unticked by default, on the checkout
page):
> "I request that Inklee start my subscription immediately, before the 14-day
> withdrawal period ends. I understand that if I withdraw during this period, I
> pay a proportionate amount for the service already provided. I keep my right to
> withdraw."

**B. The "change your mind" (withdrawal) button and panel**, which is separate
from normal cancelling:
> Button: "Withdraw from contract here"
> Heading: "Withdraw from your contract"
> Explanation: "This is your 14-day right of withdrawal, which is different from
> cancelling. Withdrawing ends your Inklee Plus subscription now and refunds the
> part of the current period you have not used, or the full amount if you did not
> ask us to start immediately. Cancelling instead keeps your access until the end
> of the paid period. Either way you keep your account and all of your data. You
> do not need to give a reason or contact us."
> Confirm action: "Yes, withdraw from my contract"

**C. The confirmation email** we send when someone withdraws:
> Subject: "Your Inklee Plus withdrawal is confirmed"
> Body: "We have received your withdrawal from your Inklee Plus subscription.
> Your subscription has ended and your plan has been updated. Your account and
> all of your data are kept. A refund of [amount] is on its way to your original
> payment method. [shown only when a refund is due] This message is your
> acknowledgement of receipt on a durable medium."

**D. The short notice shown at checkout before paying:**
> Heading: "Before you order"
> Body: "Inklee Plus is a monthly subscription. It renews automatically each
> month until you cancel, and you can cancel any time from your plan settings.
> The price is shown on the next step before you pay."
> Pay button: "Order with obligation to pay"

**What we need:** a yes (or edits) that this wording is acceptable and meets the
rules (separate withdrawal button, always reachable, clear, sends a written
confirmation, no sneaky design).

### 1b. Confirm how refunds are calculated (shared with the accountant)

If someone asked us to "start now" and then withdraws part-way through a month,
we keep the fraction they already used and refund the rest. We never refund more
than they paid. If they did **not** ask to start now, they get a **full refund**.

**What we need:** confirm this refund method is acceptable (jointly with the
accountant).

### 1c. Four quick confirmations

1. **Full refund unless they opted in to "start now."** If the "start now" box is
   left unticked, a person who changes their mind gets everything back, with no
   proportionate deduction. Please confirm that is fine.
2. **We never tell a customer they have "lost" the right to change their mind.**
   For this monthly plan we treat that right as always available. Please confirm.
3. **Renewal reminders.** Do any countries require us to send "your plan is about
   to renew" reminder emails, and how often? Or is none required at launch?
4. **Cancelling is as easy as signing up.** Customers cancel in the app through
   Stripe's customer portal, no email or phone call needed. Please confirm that
   meets the standard.

### 1d. One formality

We corrected the Terms so they say Inklee is a small business not registered for
VAT (no reverse-charge wording). Please confirm the corrected Terms text reads
correctly (version `2026-07-24`, reference hash `61c30c65...`). You already
approved the drafting; this just confirms the corrected version.

---

# Part 2: for our accountant

You confirmed the basic tax position earlier (small business, no VAT charged).
What is left is confirming the paperwork and the "when does this change" trigger.

1. **Still below the VAT line at go-live?** Confirm Inklee is still under the
   Estonian VAT-registration threshold and stays unregistered when we launch.
2. **When would that change, and who watches it?** Agree the point at which we
   would have to register (a revenue level, a first cross-border sale, or a date)
   and who keeps an eye on it, so "stay unregistered" is a bounded decision rather
   than a permanent assumption. **This is the one item that also unlocks issuing
   invoices and going live**, so it matters most.
3. **Invoice and refund-receipt format.** Confirm what a subscription invoice and
   a refund credit-note should contain for a non-VAT-registered small business
   (no VAT line, no VAT number, no reverse-charge note).
4. **Refund maths on a part-month withdrawal** (shared with the lawyer). Confirm
   the tax handling on that partial refund (there is no VAT to adjust today, but
   confirm the method).
5. **How long we keep billing records** (shared with the lawyer), reconciled with
   our promise to delete a user's data on request (some tax records must be kept
   even then).

---

# Part 3: for the founder (Michel)

These are the operational go-live steps only you can do. None of them are legal
or tax sign-offs.

1. **Create the real (live) price in Stripe** and run one real test payment end
   to end. This proves live billing works before we announce it.
2. **Approve the price and how it is displayed** (with the accountant).
3. **Set up the Stripe customer portal** so people can cancel and manage the plan.
4. **Put up a public `/pricing` page** (coordinate with SEO).
5. **Do the live money test (G-5)**: one real small deposit paid and refunded, to
   confirm the whole money path works.
6. **Flip the launch switch** (`PLUS_CONSUMER_LAUNCH_ENABLED`) when everyone above
   has signed off. Note: flipping it slightly changes the Terms text, which needs
   a quick re-confirmation from the lawyer.

---

## What happens after everyone signs off

Engineering records each confirmation in the system's approval ledger. Two of the
remaining technical items are already done and just need recording; one small one
(the refund receipt / "credit note") is still being finished by engineering. Once
the lawyer, the accountant, and the founder items above are all in, plus a live
price exists, we flip the switch and Inklee Plus goes live.

---

## Answers (counsel review, 2026-07-24)

**Overall:** the four customer-facing strings are well-drafted and match the EU
rules for a monthly digital *service* sold to consumers. Approve as written,
subject to the conditions below. Two things are real launch conditions, not
wording nits: the refund/credit-note flow must actually be finished (it is what
makes the approved withdrawal wording truthful), and the German cancellation
button needs a specific check. Details follow.

### Part 1 — counsel

**1a. Wording — approved, with notes.**

- **A (immediate-start checkbox): approved.** It correctly makes an *express
  request* to begin during the withdrawal period, states the proportionate charge
  on withdrawal (Art. 14(3) CRD), and does not claim the withdrawal right is lost
  — right for a service classification. **Condition:** the durable confirmation
  email (C) must restate this immediate-start consent. If it does not, the
  proportionate charge is unenforceable and the customer owes nothing for the
  period used (Art. 14(4)(a)). So A and C are linked.
- **B (withdrawal button/panel): approved.** "Withdraw from contract here" is the
  model label; separating withdrawal from cancellation, "no reason needed", and
  "no need to contact us" all meet the Article 11a standard and avoid dark
  patterns. Keep it continuously reachable and as easy to reach as sign-up.
- **C (confirmation email): approved**, provided it (i) acknowledges receipt on a
  durable medium (it says so — good), (ii) identifies the contract withdrawn and
  the effective date, and (iii) restates the immediate-start consent where the
  customer opted into A. Add the contract reference/date if not already present.
- **D (pre-order notice + pay button): approved wording.** "Order with obligation
  to pay" is the exact Art. 8(2) formulation. **Condition:** the *total price,
  main characteristics, billing interval, and auto-renewal* must appear on the
  **same screen as the pay button, directly above it** — the phrase "price is
  shown on the next step" must resolve to price-adjacent-to-button, not a separate
  screen. Verify the final checkout layout.

**1b. Refund method — confirmed.** Keep the fraction used, refund the rest, never
more than paid, for immediate-start withdrawals; full refund where the customer
did not opt in. This matches Art. 14(3) (proportionate to what was supplied) and
Art. 13 (full reimbursement otherwise). Time-based proration is the accepted
method for an evenly-supplied monthly service.

**1c. Four confirmations.**

1. **Full refund unless "start now" was ticked — confirmed.** Where performance
   did not begin at the consumer's express request, no proportionate deduction
   applies (Art. 14(4)); full reimbursement is correct.
2. **Never say the right is "lost" — confirmed.** For a rolling monthly service
   the withdrawal right lapses only on full performance with prior consent
   (Art. 16(a)), which a monthly period does not reach. Treating it as always
   available is correct.
3. **Renewal reminders — jurisdiction-dependent; not a uniform EU mandate.** The
   baseline CRD requires only that you *disclose* auto-renewal and its terms
   (notice D does this). There is **no EU-wide reminder mandate**, but several
   member states impose reminder/notice rules that go beyond the baseline —
   notably **France (Loi Chatel), Austria, Romania, and Sweden**. These mostly
   target fixed-term contracts with tacit renewal, so a **monthly, cancel-anytime
   plan carries low exposure**, but if you actively sell to consumers in those
   countries, confirm per-market. **Recommendation:** not a launch blocker for the
   monthly plan; revisit before the *yearly* plan launches (annual tacit renewal
   is exactly what those laws target), and monitor the Digital Fairness Act, which
   will likely harmonise renewal reminders.
4. **Cancel as easy as sign-up — confirmed in substance, with one condition.**
   In-app cancellation via the Stripe customer portal, no email/phone, meets the
   general standard. **Condition (Germany):** § 312k BGB requires a clearly
   labelled, **permanently and directly accessible cancellation button**
   ("Verträge hier kündigen"), and German case law has read "directly accessible"
   strictly (reachable without first logging in, in some rulings). A portal link
   behind login may not suffice for German consumers. Since you are already
   building the Article 11a withdrawal button, add/verify a parallel cancellation
   button meeting § 312k if you sell to consumers in Germany. This is separate
   from, and additional to, the withdrawal button.

**1d. Corrected Terms — approach confirmed; verify the rendered text.** Removing
the reverse-charge language and stating Inklee as a non-VAT-registered small
business is the correct fix (matches decision D2). Counsel should read the actual
`2026-07-24` text/hash `61c30c65...` to confirm the rendered wording; the change
of substance is approved.

### Part 2 — legal-shared items (the rest are the accountant's call)

- **Item 4 (refund tax on a part-month withdrawal): confirmed method.** While
  unregistered there is no VAT to adjust, so the refund is the plain time-based
  proration in 1b with no tax line. Revisit if/when Inklee registers.
- **Item 5 (record retention vs deletion): confirmed.** Billing/accounting records
  survive a deletion request and are retained **7 years from the end of the
  financial year** (Estonian Accounting Act § 12), on the Art. 6(1)(c) /
  Art. 17(3)(b) basis. For a non-registered supply the record follows the
  accountant's confirmed document format rather than the VAT-invoice identity
  mandate. Consistent with `account-deletion-handoff.md` §4 and C8.
- Items 1–3 (below-threshold status, registration trigger, invoice/credit-note
  format) are accountant determinations; item 2 (the registration trigger and who
  monitors it) is correctly flagged as the critical-path unlock and should be
  recorded as a bounded decision, not a standing assumption.

### Part 3 — founder / operational

Out of counsel scope. One legal dependency to respect: do **not** flip
`PLUS_CONSUMER_LAUNCH_ENABLED` until the **consumer refund / credit-note flow is
finished and tested** — the approved withdrawal and refund wording (A–C, 1b) is
only truthful once refunds actually execute end to end. The re-confirmation of the
switched-on Terms text (step 6) is a quick counsel check, noted.

---

## Follow-up for counsel (2026-07-25): the shipped texts, one-glance confirm

Your conditions from the Answers above are now built. Conditions 1 (refund /
credit-note flow), 2 (consent restated on the durable medium), and 4 (the
cancellation button) are done in code; condition 3 (price directly above the pay
button) is waiting on the price-display approval and will be wired the day it
lands. Below are the exact texts as shipped, with the additions your conditions
required. **We need one reply: confirm, or send edits.** Square brackets mark
variable parts; bracketed lines appear only in the case described.

### E1. Withdrawal acknowledgement email (your condition on string C)

Subject: "Your Inklee Plus withdrawal is confirmed"

> We have received your withdrawal from your Inklee Plus subscription.
>
> Your withdrawal takes effect on [date]. *(NEW: the effective date you required)*
>
> Because you asked us to start your subscription immediately, we kept a
> proportionate amount of [amount] for the time provided before your withdrawal,
> and refunded the rest. *(NEW: shown only when the customer opted into
> immediate start AND a proportionate amount was kept — the Art. 14(3)/(4)
> restatement you required)*
>
> Your subscription has ended and your plan has been updated. Your account and
> all of your data are kept.
>
> A refund of [amount] is on its way to your original payment method. *(shown
> only when a refund is due)*
>
> This message is your acknowledgement of receipt on a durable medium.

### E2. Purchase confirmation email (your condition linking A to C)

Subject: "Your Inklee Plus subscription is confirmed"

> Your Inklee Plus subscription is confirmed.
>
> You asked us to start your subscription immediately, before the end of the
> 14-day withdrawal period. If you withdraw during that period, you pay a
> proportionate amount for the time already provided. *(NEW: shown only when
> the customer ticked the immediate-start box — the durable-medium restatement
> that makes the proportionate charge enforceable, Art. 8(7)/14(4)(a))*
>
> You can manage or cancel it any time from your plan settings.
>
> This message is your confirmation on a durable medium.

### E3. Cancellation confirmation email (NEW, part of your § 312k condition)

Sent when a subscriber uses the new cancellation function (E4). States the
receipt date and time and the date the termination takes effect, per § 312k(3).

Subject: "Your Inklee Plus cancellation is confirmed"

> We have received your cancellation of your Inklee Plus subscription.
>
> We received your cancellation on [date] at [time].
>
> Your subscription will end on [date], and you keep Plus until then.
>
> Your account and all of your data are kept.
>
> This message is your confirmation of receipt on a durable medium.

### E4. The cancellation button (§ 312k), as built — founder placement decision

A two-step cancellation function now sits in Settings, in its own "Subscription"
section directly above "Delete account", visible to any active subscriber:

> Step 1 explainer: "Cancelling ends your Inklee Plus subscription at the end of
> the current paid period. You keep Plus until then, and your account and all of
> your data are kept."
> Step 1 button: "Cancel your subscription here"
> Step 2 confirm: "Your Inklee Plus subscription will end on [date]. You keep
> Plus until then, and there is no refund for the current period. Your account
> and all of your data are kept."
> Step 2 buttons: "Cancel now" / "Keep my subscription"

Two notes for your file: (1) **founder decision:** the button lives behind login
(Settings), accepting your note that some German rulings read "directly
accessible" as possibly pre-login; (2) the app is English-only today, so the
wording is an "equally unambiguous formulation" rather than the literal
"Verträge hier kündigen" / "jetzt kündigen"; a German-locale build would use the
literal wording (noted in code).

### E5. Withdrawal deadline display (Art. 11a step 2, now complete)

The withdrawal panel now shows the concrete deadline: "Your 14-day withdrawal
period ends on [date]." (or "ended on [date]" after expiry), computed from the
same subscription start the refund logic enforces.

**What we need:** one confirmation (or edits) covering E1–E5. On your confirm we
record `consumer_withdrawal_copy_approved`. Nothing here is live: all of it stays
behind the launch switch until the full gate is recorded.

### Launch-blocking conditions (counsel view)

1. Refund/credit-note flow complete and tested (makes A–C truthful).
2. Durable confirmation email (C) restates the immediate-start consent (A).
3. Total price + key terms on the same screen as the "Order with obligation to
   pay" button (D).
4. German § 312k cancellation button verified if selling to consumers in Germany.

Renewal reminders (1c.3) and the yearly plan are **not** launch blockers for the
monthly plan but should be resolved before the annual plan ships.

## Where the detail lives (source packages)

- Consumer sign-off detail: `docs/legal/consumer-launch-signoff-package.md`
- Business-tier keys (shared invoice/pricing/Stripe items):
  `docs/legal/b2b-signoff-package.md`
- Accountant decisions in full: `docs/legal/accountant-decision-pack.md`
- Lawyer decisions already answered (background):
  `docs/legal/counsel-decision-pack.md`
- Engineering checklist and strategy:
  `docs/legal/plus-launch-followup.md`, `docs/legal/plus-launch-strategy-decisions.md`
