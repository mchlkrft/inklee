# Counsel handoff — 2026-08-02 (second round)

**Prepared by:** engineering
**Follows:** `docs/legal/counsel-accountant-handoff-2026-08.md` (question set, your answers in Part 4, and three questions we raised back in Part 5)
**Repository state described:** local `master` at `feb191a4`; deployed branch `origin/master` at `c69c95ac`

---

> **Provenance of this document, stated because the same standard is applied to everything in it.**
> It was assembled by six parallel evidence-gathering passes over the repository and the production
> database, then drafted. Three adversarial review passes were planned — overstated claims,
> already-answered questions, legal conclusions asserted as fact — and **all three failed to run**.
> The supervising engineer independently verified the load-bearing factual claims by hand: the
> deployment topology and the 186-commit gap, the five live defects, that the refund ledger is still
> `ON DELETE CASCADE` and absent from both retention migrations, that no alerting is wired to the
> threshold monitor, and the 102-day figure in Q10. That is spot-checking, not the full adversarial
> pass this document was meant to receive. Treat unverified detail accordingly, and tell us if
> anything reads as overstated.
>
> One further caveat we cannot resolve internally: your answers reach us as a section inside an
> engineering-prepared file, and nothing in our repository distinguishes text you actually returned
> from a position drafted in-house. We have treated Part 4 of the previous package as genuinely
> yours. **If any answer attributed to you is not in fact yours, please say so** — implementation
> decisions rest on them.

## What this document is

Your answers landed on 2026-08-02 and we implemented against them the same day. This document reports what was built, flags where we departed from what you actually wrote, puts the new questions to you, and states plainly what is still not done.

**What we are asking for, in one pass:**

1. Review the six deviations in §1.3. Each looked sensible to us; none was your instruction as written.
2. Answer the new questions in Part 2 (Q4-Q20). Q1 and Q2 from the last round are still outstanding and are restated there unchanged.
3. Note Part 3, which needs no action but which you should not learn about later.
4. Tell us whether anything in Part 4 changes the scope or the sequencing of the final sign-off.

**What we are deliberately not re-asking.** The eight confirmed inputs in the product spec (digital service classification, withdrawal-versus-cancellation split, immediate-performance consent, online withdrawal function, data preservation on withdrawal, proportional compensation, versioned consent evidence, artist-as-seller for goods), the consumer withdrawal copy E1-E5, the price-adjacent-to-pay condition, the stay-unregistered VAT posture, and the proportional-compensation method. We checked each new item against that list; none of Q4-Q20 reopens any of them. Where something looks adjacent (Q5 touches artist-as-seller, Q6 touches durable medium) the question is about a disclosure or a delivery mechanism, not about the underlying classification.

---

## Read this first: what is live, and what is not

The last package opened with "nothing described here is live." **That sentence is still accurate for the Plus, goods and billing build, and it should stay in your file. It is not accurate for everything in this document, and the difference matters.**

**The Plus / goods / billing build is dark, and this is unchanged.** Inklee has never taken a live-mode charge. There are zero paying customers. `billing_subscriptions`, `transaction_tax_snapshots`, `billing_consent_records`, `billing_contract_confirmations`, `withdrawal_cases` and `deleted_account_records` are all zero rows in production. The goods shop is behind `GOODS_COMMERCE_ENABLED`, which is set in no environment file. The gallery capability has never been granted to any artist. Consumer subscription sales require a database approval row that does not exist.

**The deployment topology, which the last package did not explain and which changes how you should read every "fixed" below.** Production is a Vercel git deployment from `origin/master`. Local `master` is **186 commits ahead and unpushed** (`git rev-list --left-right --count origin/master...HEAD` returns `0 186`). Essentially everything described in this document — every fix, every implementation of your answers — exists only in an undeployed working tree.

Two separate migration ceilings, and our own gatherers reported these differently, so both are stated precisely:

- Highest migration **file on the deployed branch**: `0127_payment_request_intent.sql` (verified by `git ls-tree -r origin/master apps/web/supabase/migrations/`).
- Highest migration **applied to the production database**: `0124` (production query, 2026-08-02).

So migrations `0125-0127` are deployed as code but unapplied, and `0128-0145` — which carry the entire implementation of your answers — exist nowhere but locally.

**Five defects are genuinely live in production right now.** These are older, already-deployed paths, not part of the Plus build. Each was confirmed by reading the deployed file, not inferred:

| Defect | What is live | Verified |
|---|---|---|
| `AUTH-MFA-001` | MFA step-up gate fails open on error, no logging on either failure path | `git show origin/master:apps/web/src/proxy.ts` lines 97-107 |
| `CRON-CLN-001` | Daily 03:00 UTC cleanup job's 7-year financial-retention guard fails toward deletion | `git show origin/master:apps/web/src/app/api/cron/cleanup/route.ts` — `const { data: moneyOrders }`, no error binding |
| `BDEL-PAY-002` | Account deletion's deposit read discards its error; can skip both the PaymentIntent cancellation and the mandated retained record | `git show origin/master:.../account-deletion.ts` lines 85 and 89 both bind `data` only |
| `WEB-XSS-001` | Stored XSS on the public studios page (raw `JSON.stringify` into `dangerouslySetInnerHTML`) | deployed line 181; **unreachable** — production has zero approved studio claims |
| `ABUSE-PUB-001` | Unauthenticated public intake form with no rate limit, honeypot, origin check, MIME allowlist or dedupe | grep count for `ratelimit\|honeypot` in that file is 0 on both branches |

Fixes exist locally for the first four. All are unpushed. **Where the defect was live, it is still live at the time of writing.** Population context for calibration: 28 auth accounts in total, at most 5 plausible external users, 0 paying customers.

---

## A single statement about verification, made once

**123 of 150 register findings have never been checked by anyone who did not write the fix.** Most fixes described in this document were tested by their author, in the same session, often within hours of the defect being found. The counsel-wave fixes specifically carry `verification.independent: false` in the audit register.

Two consequences you should carry through every line below:

- "Implemented" generally means the code exists and its author's tests pass. It rarely means an independent party reproduced the defect, applied the fix, and re-verified.
- Several behaviours have never been exercised at all. The gallery relocation control has only ever run against a mocked storage client with its migration unapplied. No checkout has been run, no receipt sent, no purge fired against real expiring data.

We are not caveating each item individually. Assume this everywhere unless an item says otherwise.

One further calibration point: **your answers and their implementation are the same calendar day.** That is fast, and it is a reason to weight §1.3 and Part 2 more heavily than the volume of green ticks in §1.1.

---

# PART 1 — IMPLEMENTATION REPORT

## 1.1 Scoreboard

| Item | Subject | Status |
|---|---|---|
| C1.1 | Checkout information duties, obligation-to-pay button | Partial — one of two checkout lanes |
| C1.2 | Return right, return postage, Art. 16(c) per-product exemption | Partial — see Q4, Q5; deviation D1 |
| C1.3 | Order confirmation as the durable record | **Partial — two of your enumerated contents are missing** |
| C1.4 | Guest-buyer retention, privacy notice, records of processing | Implemented — deviations D2, D3, D4 |
| C1.5 | Gallery hosting: relocate on downgrade, signed URLs, DPIA | Partial — deviation D5; two of your conditions unowned |
| C1.6 | Rights attestation on URL import; DSA notice-and-action | Partial — condition (1) built, condition (2) assumed |
| C1.7 | Terms clause for the retained card-processing cost | Not started (correctly staged) |
| C1.8 | Partial-refund buyer communication | Implemented |
| C1.9 | One versioned Terms edit, single consolidated approval | Partial — input package only |
| C1.10 | Financial records must survive account deletion | **Partial — the refund ledger is still destroyed** |
| A1 | Price display co-sign (3.00 EUR inclusive) | Implemented (pre-dated the answer) |
| A2 | Registration thresholds 35k / 8k, cadence, ownership | **Partial — there is no alert** |
| A3 | Fee schedule v2 rates and tax treatment | Implemented, inactive; both activation conditions unbuilt |
| A4 | Standalone goods flow, destination charges | Implemented, no change required |
| A5 | Goods invoicing is the artist's obligation | Not started (correctly staged) |
| A6 | Partial-refund allocation, separate presentation of retained cost | Partial — books presentation absent; ledger not permanent |
| A7 | "No separate card-processing fees" bound to the fee payer | **Deviated** — see D6 |
| A8 | Variant-level bundle snapshots are records only | Implemented, no change required |

## 1.2 Item detail

Only where there is something to report beyond "built as instructed."

### C1.1 — Checkout information duties

**Built.** The verbatim seller disclosure block and the "Order with obligation to pay" button label live in one shared module (`packages/shared/src/consumer-disclosures.ts`, lines 16 and 53-65) and render on the standalone shop checkout. Your prerequisite that an artist without complete seller data cannot enable the shop is enforced at three independent layers including the money path, not only in the interface (`goods/actions.ts`, `shop/checkout/page.tsx:95`, `lib/server/goods-checkout.ts`).

**Gap.** There is a **second** payable goods surface. The appointment add-on checkout sells the same `custom_made` catalogue through the same shared line compositor, and its button still reads "Pay deposit and selected items" (`apps/web/src/app/request/[token]/addons-checkout.tsx:395-396`, confirmed by direct read). We added your disclosure block to that path but not your button label. → **Q4.**

**Gap.** Your prerequisite that the artist Terms oblige artists to keep seller data current exists only as proposed wording (`docs/legal/c1.9-terms-edit-inputs.md:85-88`). The live Terms document is still version 2026-07-24 and has no goods section at all (verified: frontmatter reads `version: "2026-07-24"`).

### C1.2 — Return right and the Art. 16(c) exemption

**Built.** Your return-right notice and custom-made notice are reproduced verbatim. `products.custom_made` was added with sale-time snapshots on `order_items` and `order_item_bundle_components`, so a later catalogue edit cannot change what a past buyer was told. A mixed cart renders both notices. A model withdrawal form page exists.

**Gap.** On the add-on lane the flag is aggregated into a single block, so a buyer is told "some of your selected items" without being told which. Our reading of your warning about blanket claims is that this is the shape you cautioned against, but we are not deciding it. → **Q4.**

**Gap, wider than we first understood.** The shared `PublicProduct` type has **no** custom-made field at all (`packages/shared/src/goods.ts` — grep for `customMade` returns nothing). A buyer browsing an artist's public shop therefore sees no exemption notice; the claim first appears at checkout. → **Q5.** Note that the audit register's own coverage row asserts this field "was added to the shared type"; that is wrong, and we verified against code.

### C1.3 — The durable record

This is the item where the implementation most clearly falls short of what you wrote, and where our own internal documentation most clearly overstated it.

**Built.** `buildOrderReceiptBody()` assembles the seller block, itemised lines, total, the correct return or custom-made notice, and your verbatim closing line.

**Gap 1.** You required "the C1.2 return notice **and model form**." The parameter exists, is unit-tested, and **is passed by no production call site.** We verified by repository-wide grep: the only production caller is the checkout *page* (`shop/checkout/page.tsx:323,335`). Both email send sites omit it (`lib/server/goods-checkout.ts:962-970`, `lib/email/send-booking-email.ts:201-213`), and the notice builder drops the entire "you may use the model withdrawal form" sentence when the reference is absent. **The model form is missing from both receipts.**

**Gap 2.** The add-on goods confirmation passes no Terms text at all. The standalone receipt supplies it; the add-on receipt does not.

**Gap 3, and a disagreement between our own reviewers.** One reviewer described the form as "linked at checkout." A closer read found it is rendered as **plain text** inside a pre-formatted paragraph, with no anchor element anywhere in the repository, so a buyer would have to retype the path. The closer read is the one to trust. → **Q6.**

**Correction to something you may already have read.** `docs/legal/c1.9-terms-edit-inputs.md:137-143` tells you C1.3 is "already implemented," with neither caveat. That is the single worst overstatement in the package. Similarly, `docs/product/go-live-worklist.md:15-16` lists C1.9 among items "worked off in three waves," which reads as done when only an input package exists.

### C1.4 — Guest-buyer retention

**Built.** All four cases (7 years completed / 30 days cancelled / 30 days abandoned cart / 12 months wishlist) are implemented with real database tests. The financial-year cutoff correctly anchors on end-of-financial-year rather than row date. Your privacy notice renders verbatim at the email field. The records-of-processing entry exists (`docs/legal/records-of-processing-guest-shop.md`).

Three departures follow in §1.3 (D2, D3, D4).

### C1.5 — Gallery hosting

**Built.** Objects relocate between the public bucket and a private archive bucket on downgrade and back on resubscribe, hooked into billing reconciliation, the comp-expiry sweep, and a nightly state-driven retry. Relocate, never delete, as you required.

**Not done.** The signed-URL fast-follow you dated has no date, no owner and no ticket. The LO-5 DPIA, which you made release-gating, appears nowhere in the ordered go-live worklist. → Part 4, and **Q18**.

**Deviation.** We relocate immediately; you offered a grace window. → D5, and the reading ambiguity in **Q18**.

**You should know** that this control shipped with a defect that made it silently and permanently mark itself complete for an affected artist. Caught by independent review, not by test. → Part 3 and **Q18**.

### C1.6 — Rights attestation

**Built, and built well.** The attestation is enforced server-side on the submitted data rather than on a checkbox, refuses the import otherwise, and writes an append-only consent record **before** the outbound fetch, failing closed if the evidence write fails. Your sentence is reproduced verbatim in the interface.

**Gap.** Your second condition was that the notice-and-action route covers gallery images. We have a generic infringement category on an existing report form, but that form predates this work, and the moderation procedure document contains no mention of galleries and was not touched by any commit in this wave. **Condition (2) rests on an assumption, not on work.** → **Q16.**

**Scope point you may not have intended.** The attestation covers URL import only. A tattoo photograph uploaded directly as a file — the normal case — carries no attestation and no record of consent from the person depicted. → **Q15.**

### C1.7 — Retained card-processing cost

**Correctly staged, with one correction.** Our Part 1 text last round told you "when an artist cancels and refunds a client, we return our fee to them except for the card processing cost we actually incurred." **In the live code that is false today.** The active policy version is v0, whose artist-cancellation case returns the fee in full; the retaining behaviour lives in an inactive v1 (verified: `ACTIVE_FEE_REFUND_POLICY_VERSION = FEE_REFUND_POLICY_V0.version`). The machinery is built; the behaviour is not on. Your clause exists only as a proposal, and the live Terms currently say the opposite of it.

### C1.9 — The Terms edit

**No Terms edit has occurred.** The live document is unchanged, no new snapshot exists, and the approval has not been re-recorded. What exists is an honest input package that states plainly it does not touch the live Terms.

The process control you relied on is real and verified: the approval key is bound to a version hash, so a silent edit fails the automated check, and any edit auto-closes the key. Nothing has yet been sent to you to sign off.

### C1.10 — Financial records surviving deletion

**Built.** The last of the eleven cascading tables was repointed, and the appointment-payment tables are now archived through allowlisted pseudonymisation with a real database test. Surviving records now carry the 7-year end date they previously lacked. (Note the correct count is **eleven** cascading tables, not the eight our planning document states.)

**The loudest gap in this document.** The refund ledger is **not** in the carve-out. Verified directly: `apps/web/supabase/migrations/0139_refund_ledger.sql` lines 214 and 403 declare `refunds.artist_id` and `refund_lines.artist_id` as `on delete cascade`, the migration's own comment names account deletion as the path that destroys the immutable refund history, and a grep of `account-deletion.ts` finds no reference to either table. This is the exact record the accountant approved in A6 as "a permanent per line record," and the one your C1.7 clause depends on for auditability. A6 and C1.10 were implemented by different passes and neither noticed the other's table.

**Second gap.** You instructed us to "verify the carve-out against the handoff's §11 implementation table while you are in there." `docs/account-deletion-handoff.md` was not touched by any commit in this wave. **The cross-check you explicitly ordered was not performed.**

### A2 — Registration thresholds [ACCOUNTANT]

**The largest gap between what you were told and what existed.** Last round told you "Built: alerts at 35k domestic and 8k EU cross border." That was false when written, and the implementing module's own documentation says so: nothing maintained the counter and the figures existed only in prose.

A rollup now exists and writes a status column. **Nothing reads it.** We verified by grep: the string `approaching` appears nowhere in the application outside the rollup module itself. There is no email, no alert, no admin surface. If the domestic threshold is crossed, the row flips to "exceeded" and no human is told. Additionally, only the domestic counter is computed; **the 8k cross-border figure you confirmed has no rollup behind it at all.** Cadence is monthly, which satisfies your quarterly requirement.

### A3, A5, A6 — [ACCOUNTANT]

**A3.** Rates are encoded exactly as approved and correctly inactive. **Both** activation conditions remain unbuilt: there is no mechanism for the 30 days' advance notice to existing artists, and Terms coverage of the new Free-tier goods fee is staged only. The notice condition has a lead time, not a checkbox: if a flip is planned, notice has to start a month earlier and there is currently nothing to send it with.

**A5.** Correctly deferred into the single Terms version. One dependency worth naming: A5's fee-invoice half becomes a live obligation the moment fee schedule v2 activates, so it must land in the **same** Terms version as A3's coverage, not after.

**A6.** The allocation method is faithfully built and the artist-facing separate presentation is real. Two things you assumed are not yet true: the retained cost has **no presentation in any books artifact** (the amount is stored per refund event; nothing reports it as its own line), and the append-only ledger is **not permanent** — see C1.10 above.

## 1.3 Deviations — the section to read

Six places where the implementation departs from your instruction as written. Each looked defensible to the team; none was reviewed by you. Where we state a view it is the engineering team's provisional view, not a conclusion.

### D1 — Bundles: we made a legal determination [C1.2]

Your answer requires the exemption to be claimed per product and does not address bundles. Engineering chose the rule "any custom-made component makes the whole bundle non-returnable" and shipped it. It is flagged in code comments as an engineering judgment call. This is **Q2** from the last round, still unanswered.

### D2 — "Erase" became "pseudonymise with a constant" [C1.4]

Your text said "erase or pseudonymise." Erasure turned out not to be literally implementable: a database check constraint forbids a null buyer email on an order without a booking, so the purge writes a fixed placeholder value instead. Team's provisional view: this satisfies the pseudonymise limb. It was not a choice we made freely.

### D3 — A 30-day rule delivers up to about 60 days [C1.4]

The purge cron runs monthly (`"0 5 1 * *"`, verified on the deployed configuration). A row that becomes eligible on the 2nd waits until the 1st of the following month. Your 30-day retention periods are therefore, in practice, up to roughly 60 days.

### D4 — The cancelled-order clock can restart [C1.4]

The 30-day cancelled-order period is measured from `orders.updated_at`, not from a cancellation timestamp, so any later touch of the row restarts it. Minor, but it is not the clock you specified.

### D5 — No grace window at all [C1.5]

You offered a "short grace window (60 days is defensible)" and noted the artist may resubscribe. We relocate immediately on downgrade. That is stricter for privacy and stricter on the artist than you contemplated. It also depends on which of two readings of your sentence is correct → **Q18**.

### D6 — A live, currently-true commercial claim was withdrawn as a side effect [A7]

The structural binding is exactly as instructed: the "no separate card-processing fees" claim is now tied to the fee payer, requires a founder-recorded approval, and is suppressed because no such approval row exists.

**But the previous copy "(card processing included)" is live in production today** for every artist at the 3% rate — a cohort where the accountant says it is a straightforward margin and plainly true. We verified: the deployed payouts page carries that phrase in four places; the local working tree carries it in none. So the pending change **withdraws a true, live claim from a cohort nobody asked us to withdraw it from.** The accountant's suppression condition was written about the Plus subsidy rate.

To be precise about liveness, because it cuts both ways: the claim is still showing in production right now, and the withdrawal is unpushed along with everything else.

---

# PART 2 — NEW QUESTIONS

Numbering continues from the last round's Part 5. **Q1 and Q2 are still outstanding** and are restated first, unchanged. Q3 was labelled a note rather than a question and is reclassified below.

## Carried forward

### Q1 [COUNSEL + ACCOUNTANT] — one ledger cannot be purged, by design

Unchanged and unanswered. Four of five billing tables now purge at 7 years. `transaction_tax_snapshots` carries an unconditional append-only delete trigger ("corrections are new rows"), so it is retained permanently — and because nearly every real subscription generates a tax event, the subscription rows those snapshots reference become effectively permanent too. Is permanent tax-ledger retention the intended documented exception, or must the ledger become deletable, which means amending a deliberate immutability control?

A worker's note in our build log guesses "likely yes." Please disregard that; it is a guess, not a position we are asking you to ratify.

### Q2 [COUNSEL] — a bundle containing one custom-made item

Unchanged and unanswered. Wholly non-returnable, partially returnable, or not sellable as one unit? One sharpening since last time: the middle option may be incoherent in our data model. A bundle is a single priced unit, and the accountant's A8 answer confirms the component list-price snapshots are records only and explicitly **not** a billing basis, so there is no per-component price a partial refund could be computed against. That likely forces the answer to option one or option three.

Note also that the conservative rule we shipped **suppresses** a return right that may actually exist, which is the direction that risks the Art. 10 extension you warned about.

### Q3 — reclassified, no longer for the accountant

Q3 was a note that the A7 claim stays suppressed pending a founder decision. The blocking party is the founder, not an adviser. It has moved to the internal decision log. Nothing is owed by you. See D6 for the part that did change.

## New

### Q4 [COUNSEL] — the second goods checkout

**Facts.** There are two payable surfaces selling the same `custom_made` catalogue, not one. Your C1.1-C1.3 answers were written against "the checkout page" as a single surface, and we did not correct that premise at the time. The appointment add-on lane charges a service deposit and optional goods on one confirmation, through the booking portal. It now carries your seller disclosure block and a receipt, but (a) its button reads "Pay deposit and selected items," not your label, and (b) it presents the custom-made flag only in aggregate — "some of your selected items" — with no per-row marker.

**Team's provisional position.** We implemented the disclosures on the assumption that the obligations are identical, and we left the button alone on the assumption that a deposit-led basket is a different animal. Those two assumptions are in tension with each other, which is itself a reason to ask.

**What a decision unblocks.** Whether the add-on lane needs the Art. 8(2) label and per-row markers before the goods shop is switched on. Your own warning that an undisclosed exemption extends the window to twelve months is what makes us unwilling to assume.

### Q5 [COUNSEL] — where "per product" must be claimed: display or sale

**Facts.** Your answer requires the exemption to be claimed per product, never in the Terms alone. Today it is claimed at checkout and in the confirmation. It is **not** claimed on the artist's public shop page, because the shared public product type carries no custom-made field at all, so there is nothing for the browsing surface to render.

**Question.** Does "per product" mean at the point of **display**, where the buyer first encounters the item, or at the point of **sale**?

**What a decision unblocks.** If display, the shared type and the public shop surface both need work before sign-off, and this is a schema change rather than a copy change.

### Q6 [COUNSEL] — the contents of the durable record

**Facts.** Three separate shortfalls against your C1.3 enumeration, all verified in code: the model withdrawal form is referenced in **neither** receipt; the add-on receipt carries **no** Terms text; and on the one screen that does reference the form, the reference is plain text rather than a link.

**Team's provisional position.** We believe the first two are defects to fix, not positions to defend, and we intend to fix them. We are asking rather than assuming because of the third: your wording is "[link/attached]," and your C1.3 answer separately ruled out "only a link" for the durable record.

**Question.** (a) Must the model form be reproduced in, or attached to, the confirmation, or does a reference suffice? (b) Is a confirmation with no applicable Terms text non-compliant on its face, or curable by the buyer having accepted terms at checkout?

### Q7 [COUNSEL] — the model withdrawal form's actual wording

**Facts.** You referenced a model form; you did not supply its text. We wrote it from the Directive's Annex I(B). It addresses the artist as seller and names Inklee as an alternative contact, is noindex, and is gated identically to the checkout page. **It is the only consumer-facing surface in this set with no counsel-authored source, and it has no dedicated test.**

**Question.** Review the wording as part of the single Terms version, in particular whether addressing the form to the artist as seller with Inklee as an alternative recipient is correct given your line that the purchase contract is with the artist.

### Q8 [COUNSEL] — evidence the seller can rewrite

**Facts.** The custom-made snapshot frozen on a completed order exists to prove what was disclosed at sale. The row-level security policy on that table is a single `FOR ALL` policy permitting the artist's own authenticated session to write, so **the seller can retroactively rewrite the consumer-rights disclosure on a historical order**, alongside item titles and amounts. The policy survived every review because it is named "artist can read own order items." The sibling bundle-component table is correctly read-only, so only this one table is exposed. No production exposure: the goods build is undeployed and goods commerce has never been enabled.

**Team's provisional position.** We can make these tables service-role-write-only before the shop switches on. We think we should.

**Question.** (a) Does this evidence need to be tamper-evident against the **seller** for the exemption to be validly claimed and disclosed? (b) If a buyer later disputes a refused return, does a mutable snapshot shift any burden onto Inklee as the party that hosted and stored it? We want to know whether the hardening is required or merely prudent.

### Q9 [COUNSEL] — two live fail-open defects on retention and erasure paths

**Facts.** Both are running in production right now.

- The account-deletion routine's deposit read discards its error. A transient failure yields an empty result, so deletion proceeds believing there is nothing to cancel and nothing to retain, skipping both the client's PaymentIntent cancellation and the retained financial record. Widened during the fix: a failed profile read would archive a Connect account identifier as null for an artist who had one, writing a false premise into the retained record; and a failed auth lookup makes the launch-waitlist purge a silent no-op, so a deleted person's email address survives a deletion whose purpose was erasing it. **Account deletion has executed 8 times in production**, between 2026-05-04 and 2026-07-26.
- The daily cleanup job reads the orders table to decide which stale bookings must be retained for 7 years, and discards that read's error. On failure the protected set collapses and the remainder are hard-deleted, cascading their orders and audit rows away.

**The defining property of both: a swallowed error leaves no trace.** We cannot determine whether either ever fired. The retained-records table is empty, which is consistent both with "none of the 8 deletions had records to retain" and with "the read silently failed." Both fixes are written and unpushed.

**Question.** (a) Does an unquantifiable historical failure of this shape — potentially an Art. 17 erasure failure and potentially a statutory 7-year retention failure — require any assessment, record, or notification, or is fixing forward and documenting sufficient? (b) Should we retrospectively sweep the launch-waitlist table against deleted accounts? (c) Does the accountability principle require us to be able to demonstrate that the retention guard held on every past run, which we cannot?

**Sequencing note we would like your view recorded on.** The destructive path runs again tonight, and every night, until we push.

### Q10 [COUNSEL] — a live authentication fail-open, and a disagreement between our own reviewers

**Facts, agreed.** The MFA step-up gate has two independent fail-open paths in nine lines: a `catch` block whose entire body is a comment saying to continue without gating, and a destructuring that ignores the error so a non-throwing failure leaves the level unset. The page it would redirect to has a matching fail-open that routes to the dashboard. Neither backstops the other. There is **no Sentry event and no log on either path**, and a fail-open renders an ordinary 200 that is indistinguishable in any access log from a user with no MFA enrolled. Production has zero rows in the auth audit table and no authentication events of any kind in the application's own audit log. Fail-open was a documented deliberate choice made on 2026-04-22, two hours after the feature shipped. It has been deployed for roughly 102 days and is deployed now. The administrative area was never exposed through this path — it fails closed independently.

**Where our reviewers disagree, and we are not resolving it for you.**

- One assessment rates this the second most urgent live item, on the basis that nine artist-facing prefixes were gated only by this check and one of them has no secondary protection.
- The other assessment queried production and found **the precondition was never met**: the MFA factor table has held exactly one row in the platform's history, unverified, never challenged, on an internal tester account; there have been zero MFA challenges ever; zero sessions at the elevated level; and no MFA entries in the authentication-method records. Because the redirect can only trigger for a **verified** factor, the gate was a no-op for every real account, and the fail-open therefore never changed the outcome of any request.

The second reading rests on four converging observations rather than an immutable log; a factor enrolled, verified and later removed would leave no trace, and the auth audit table is empty. Platform and hosting logs outside the repository were not checked, but even a complete access log could not distinguish the two cases.

**Question.** (a) Does a live period of this shape require any assessment or record, given the evidence that the precondition never existed but cannot be proven to have never existed? (b) Is the absence of **any** authentication-event logging itself an accountability gap — noting it is the same absence that makes (a) unanswerable?

### Q11 [COUNSEL] — an unauthenticated public form with no abuse controls

**Facts.** A public project-intake form, reachable by anyone who knows an entitled artist's page address, accepts up to 12 files totalling 40 MB, processes them, stores them, writes a record, and **sends Inklee-branded email to an address supplied in the request**. It applies no honeypot, no origin check, no rate limit, no MIME allowlist and no deduplication. Its direct sibling, the booking form, applies all five to the same shape of work. It is the only public form in the codebase importing neither of the relevant helper modules. Real mitigations exist and we record them: an entitlement check runs before any file processing, and decoded image size is capped. Live in production; the population of entitled artists was not checked and may be small or empty.

**Question.** Two threads. (a) An arbitrary third party's address can be made to receive mail from our sending domain at whatever rate an attacker chooses. (b) The form ingests a name, an email address and reference photographs from a member of the public with no rate limit and, as far as we can establish, **no retention rule and no cleanup path** for the resulting records and images. Does this intake need the same treatment your C1.4 answer gave the goods shop — a privacy notice at the field, a records-of-processing entry, and a defined retention for abandoned or rejected submissions?

**Team's provisional position.** We suspect the C1.4 logic transfers wholesale. The surface was never put to you.

### Q12 [COUNSEL] — account deletion versus an active paid subscription

**Facts.** The Terms ratify period-end semantics for an explicit **cancel** action, and 14-day withdrawal with proportionate compensation for **withdrawal**. Both exist in code on deliberately separated paths. The **deletion** clause mentions no subscription, no refund, no paid period and no charge stopping. The delete confirmation screen lists booking history, client data, photos and the public page, and says nothing about the subscription. The mobile route requires only a typed confirmation and re-authentication. No production exposure: no subscription has ever existed.

**Question.** Three semantics are defensible and each has money attached: period-end keeps a paid period alive that the user has no account left to use; immediate without refund silently forfeits the remainder; immediate with proration is a third thing. Which is correct, and what must the delete confirmation tell a consumer before an irreversible act that forfeits something they paid for?

**What a decision unblocks.** This should land in the single Terms version rather than become a post-launch discovery. It is the one genuine consumer-law gap in this area that the last package did not touch.

### Q13 [COUNSEL] — the Connected Account after an erasure request

**Facts.** Your ratified decision on this directs three things: retain the account pointer only, schedule the payment-processor account's deletion at window-end with a zero balance required, and do not force-disconnect at deletion time. Clauses 1 and 3 are implemented. **Clause 2 does not exist anywhere** — no deletion or rejection call appears in the codebase, no scheduled job references the pointer, and deletion performs **no balance check of any kind**, so the zero-balance precondition is unenforced. Compounding this: the retention purge deletes the archive record at 7 years, taking the pointer with it, after which the account is permanently orphaned with nothing to find it by. No orphan exists yet; the archive table is empty.

**Question.** (a) Is leaving a live Connected Account at the processor indefinitely after an erasure request acceptable on the basis that the processor holds identity data as an independent controller, as our privacy notice asserts, or does the artist's data there need an affirmative action from us? (b) What did "window-end" mean — the seven-year financial window, or something shorter? (c) Should the pointer purge be conditioned on the account action having completed first, since otherwise the scheduled deletion becomes impossible to perform even manually?

### Q14 [COUNSEL] — a retention control that has never executed

**Facts.** The retention purge is deployed and runs monthly. **It has never deleted a row and cannot until 2028**: every cutoff is older than the oldest data that exists, and the platform's account history begins 2026-04. Its boundary tests use synthetic dates. Structurally it is eight sequential blocks each returning an error status on failure, so a failure in block 3 leaves blocks 4-8 unexecuted with no retry for a month. "It runs monthly without erroring" is currently indistinguishable from "it is a no-op."

**Question.** This is evidentiary rather than about the rule. Does the accountability principle require positive evidence that a retention control has actually executed against real expiring data, given ours cannot demonstrate that for roughly 20 months and its first non-trivial run will be unattended, monthly and bulk? If a demonstrable purge is expected before we can describe the retention schedule as implemented, we would rather engineer a proving path now than assert compliance from a job that has only ever matched zero rows.

### Q15 [COUNSEL] — consent for the person depicted, on direct upload

**Facts.** Your C1.6 attestation covers **URL import** only, and it is properly built. We checked the obvious parity hazard and it is clean: the mobile route offers upload only, with no import affordance, so there is no unattested native path. But a tattoo photograph uploaded **directly as a file** — which is the normal case — carries no attestation and no record of consent from the person depicted. Your C1.5 answer treats these images as health-adjacent images of identifiable people.

**Question.** Does the depicted client's consent need any record on our side, or is that entirely the artist's obligation as controller of their own client relationship? We suspect this belongs in the LO-5 DPIA rather than a separate round, but we are not filing it as a decision we made.

### Q16 [COUNSEL] — DSA notice-and-action coverage for gallery images

**Facts.** You granted the hosting position on **both** conditions together. Condition (1), the attestation, is properly built and evidenced. Condition (2) was assumed satisfied by a pre-existing generic report form. **Nobody verified or documented that a rights-holder complaint about a gallery image actually reaches a removal workflow**, and the moderation procedure document contains no mention of galleries.

**Question.** Confirm what condition (2) requires concretely, so we can build to it rather than assert it. We are telling you this half rests on an assumption because your grant was conjunctive.

### Q17 [COUNSEL] — abandoned image uploads with no cleanup path

**Facts.** Both gallery upload surfaces write the object to storage **before** the artist saves. The removal sweep compares previously-persisted images against images being saved, so a file that never reached a save appears in neither set and no sweep will ever include it. Abandonment is ordinary: closing the editor, navigating away, the app backgrounding. The orphan sits in the **public** bucket. No production exposure: the capability has never been granted.

**We flag a gap in our own analysis.** We did not read the account-closure storage purge to determine whether it sweeps by prefix, which would cover orphans, or by referenced path, which would not. So we cannot currently tell you whether an abandoned upload survives account closure.

**Question.** Does the storage-limitation logic you applied to the abandoned cart in C1.4 transfer to an abandoned image upload, or does the sensitivity of the content warrant something shorter? We would rather implement a rule than leave the case unnamed.

### Q18 [COUNSEL] — the relocation control's failure class, and the 60-day reading

**Facts, part one.** The control your conditional pass depends on shipped with a defect in which a transient read failure produced no image paths, the move reported success with zero images moved, and the completion marker was stamped — and because the nightly retry selects only unmarked artists, **that artist was permanently excluded from every future retry**, leaving their client photographs in the public bucket indefinitely. Symmetric on restore. The trap is that a genuinely zero-image artist and a failed read produce byte-identical results. Found by an independent reviewer, in code written earlier the same day to satisfy your answer, and caught by review rather than by test. Fixed, unpushed, and never realised in production because the capability has never been granted. The relocation behaviour has only ever been exercised against a mocked storage client with its migration unapplied.

**Facts, part two.** Your wording — "relocate to non-public storage or invalidate the URLs within a short grace window (60 days is defensible; the artist may resubscribe)" — reads either as "you have up to 60 days to comply" or as "wait 60 days before acting." We implemented the first, stricter reading, and relocate immediately.

**Question.** (a) Does a compliance control with that failure class change your conditional pass, and specifically should the signed-expiring-URL fast-follow be pulled forward from "before any gallery marketing push" to "before the capability is granted to anyone"? (b) Which reading of the grace window did you intend?

### Q19 [COUNSEL] — the rights-attestation record's basis and retention

**Facts.** The attestation is written into the **billing** consent table, with a consent type, a version, a timestamp, and the artist-supplied third-party source address in its context. That table is one of the billing tables governed by a purge scoped to rows belonging to **deleted** accounts, at 7 years from financial-year end. So an attestation on a **live** account has no end date at all, and after deletion it is retained on a financial-records clock that is not its own basis. Zero such records exist; this is a design question, not an incident. It is not separately recorded in our audit register, which is itself worth stating.

**Question.** (a) What are the lawful basis and retention period for a rights attestation, given it is neither a financial record nor a billing consent yet inherits an accounting clock? (b) Is storing the third-party source address in the consent context necessary for the evidentiary purpose?

### Q20 [COUNSEL] — P2B and DSA marketplace duties

**Facts.** This was raised in the 2026-07-31 checklist — "if artists sell to consumers through the platform at scale, the P2B Regulation (2019/1150) and DSA trader-traceability duties begin to attach" — and then **fell out of the package** between 2026-07-31 and 2026-08-01. It does not appear in the last handoff's questions or answers. Our DSA analysis covers only notice-and-action and the micro-enterprise exclusion; the marketplace-specific duties are not analysed anywhere.

**Question.** Conditional on scale, so arguably not launch-blocking. But the standalone shop turns Inklee into a platform where consumers conclude distance contracts with traders, which is the trigger. We would like either an explicit ask answered now, or an explicit deferral with a recorded threshold at which it returns.

---

# PART 3 — FOR AWARENESS, PROBABLY NO ACTION

Defects found and fixed, and exposure assessments, that you should not learn about later. **Unless stated otherwise, none of these ever reached production and none carries a question.**

**Never live, fixed.**

- **Two anonymous read policies** would have exposed every sent payment request and its line items via the public API key — any row that had ever been sent, with no match against the caller's token. Caught pre-ship by review and dropped in a later migration. **Firm no exposure**: the migration that introduced them has never been applied to production. We mention it because it is the clearest evidence the pre-ship review layer works, and because if it had shipped it would have been a live disclosure of customer identities and payment amounts.
- **A stale-order sweep** cancelled orders while leaving their PaymentIntents live and payable, so a late-paying buyer would have been charged with no order, no goods, no receipt and no artist visibility. It is the exact failure your C1.3 durable-record answer guards against, approached from the opposite direction. Fixed, never reachable.
- **A discarded read in a read-modify-write** destroyed an artist's entire settings record. The sweep it triggered found the same shape at 20 further live call sites, now routed through a shared helper that makes the destructive path a compile error. One named consequence touches live artists: a default meant an unrelated save could silently reopen a closed artist's books. Data integrity, not a consumer or data-protection question.

**Live but unarmed.**

- **Stored cross-site scripting on the public studios page.** Live code, and it would execute on the same origin as the artist dashboard. **Currently unreachable**: it requires an approved studio claim, and production has zero. It arms the moment the first claim is approved. The fix is unpushed.

**Open, hardening backlog, no question for you.**

- **One credential authorises eleven production endpoints**, including bulk deletion of personal data and outbound customer email, with no per-endpoint scoping, and is exposed to a CI runner on a public repository. It also doubles as a signing key. We flag it because if a documented Art. 32 hardening backlog is ever needed, this is the top of it. We are not asking you to design a credential model.
- **Every production table grants a table-emptying privilege to the authenticated role**, from platform defaults rather than our migrations, and row-level security does not gate that operation. No reachable path was found and the reviewer said so plainly. Availability hygiene.
- **Raw database error messages are returned to clients from 91 call sites**, reachable only by an authenticated artist acting on their own rows. No personal data is disclosed. Its practical consequence is a copy-rules breach, not a legal one.

**Facts you may want to know.**

- **1,363 rows of scraped studio data were hard-deleted from production** on 2026-07-21 with no audit record, while the tracked roadmap describes the wave as a soft delete. The arithmetic reconciles exactly, so we know it happened; we cannot identify the mechanism. If any of those rows described sole traders they were personal data. We would fold the underlying issue — the lawful basis and consent scope for the seeded studio dataset generally, which no counsel round has covered — into the LO-5 DPIA rather than raise it separately, unless you disagree.
- **A backstop that catches subscriptions with lost webhooks can be starved** by deleted-profile rows that are re-selected forever. Never live, and the chain to a consumer harm is not established. We would fix it before consumer launch and not put it to you.
- **Register staleness, in case anyone re-checks our work.** Two findings still show as in-progress with no fix commit although both were fixed on 2026-08-02. One coverage row asserts a field "was added to the shared type" that was never added (see C1.2). The register moved during the session that produced this document; the 150-finding figure quoted above is a snapshot.

---

# PART 4 — WHAT IS NOT DONE

## 4.1 Not built

| Item | Owed to | State |
|---|---|---|
| The versioned Terms edit | C1.9, and the home for C1.1's seller-data obligation, C1.7 and A5 | Input package only. Live document untouched at version 2026-07-24, with no goods section at all. |
| The refund ledger carve-out | C1.10 | Ledger still cascade-deletes with the artist. We intend to fix unless you say otherwise. |
| The §11 cross-check | C1.10, instructed explicitly | Not performed, not recorded. |
| Model form in the durable record; Terms text on the add-on receipt | C1.3 | Missing. See Q6. |
| Art. 8(2) label and per-row markers on the add-on lane | C1.1, C1.2 | Missing. See Q4. |
| Custom-made claim on the public shop surface | C1.2 | Schema field does not exist. See Q5. |
| Signed, expiring URLs | C1.5, dated by you | No date, no owner, no ticket. |
| LO-5 DPIA | C1.5 and prior rounds; release-gating | **Absent from the ordered go-live worklist entirely.** The largest tracking gap we found. |
| DSA notice-and-action coverage for galleries | C1.6 condition (2) | Assumed, not verified. See Q16. |
| Threshold alerting; the 8k cross-border counter | A2 | A status column nobody reads; the cross-border figure is not computed. |
| 30 days' advance notice of the fee change | A3 condition | No mechanism. Has a one-month lead time. |
| Retained cost as its own line in the books | A6 | Stored per event; presented nowhere. |
| Pre-login cancellation route | E4, a condition on an accepted founder risk | Open, with a trip-wire on any German-locale build or German marketing. |
| LO-10 round | Your standing item | Unscheduled. Boundary: close before real client money. |

## 4.2 Two internal documents currently overstate the position

Recorded because you may be shown them: the Terms input package describes C1.3 as already implemented, with neither of its two gaps; and the go-live worklist's summary lists C1.9 among items worked off. A third document still carries a superseded net-price figure that drives its contribution-margin section.

Separately, that worklist's sign-off gate still lists a batch of your answered items as pending, which — read literally — would send answered questions back to you. Its real residue is the final sign-off, the LO-10 round, Q1, Q2, the DPIA, and the tails above. We are correcting it.

## 4.3 One unreconciled record

Whether the consumer withdrawal copy approval is currently recorded in production: two legal documents say pending, and an internal data pack says the production database shows it approved on 2026-07-25. We did not settle it. It is moot for planning, because the Terms hash change closes it either way, but the records should be reconciled.

## 4.4 What the remaining sign-off gate actually covers

Your C1.9 answer asked for one versioned Terms edit and one consolidated approval recorded against that hash, and for the final render to be sent for a confirmation pass. That gate is the only counsel gate our internal rules preserve. Concretely it covers:

1. The final Terms version, including a goods section that does not exist yet, the seller-data obligation, your C1.7 clause and the A5 line.
2. Checkout disclosures and the obligation-to-pay button as rendered, which you said you would verify visually rather than by code review.
3. The withdrawal flow and its copy.
4. Credit-note and invoice evidence.
5. The model withdrawal form's wording (Q7).
6. The completed LO-5 DPIA.

**Sequencing.** Nothing can be signed off until the Terms edit produces a final hash, because the approval binds to that hash and any later edit auto-closes it. A batch of already-approved, version-bound keys will mechanically re-open on that hash change and need re-recording. **That is the confirmation pass you asked for, not a reopening of anything.**

**One thing the gate does not currently cover, and should.** Everything in this document is undeployed. Whatever you sign off will be approved against code that has never run in production, on a branch 186 commits ahead of the deployed one, with 18 unapplied migrations. We would rather you knew that before signing than after.

---

# PART 5 — ANSWERS (counsel review, 2026-08-02, second round)

## 5.0 The provenance question, answered first

You asked whether the Part 4 answers attributed to counsel are genuinely the
reviewer's. They are: this document's answers and the previous package's Part 4
come from the same review stream, and the founder has verified each round
before it was recorded. The standing characterisation applies to both rounds
equally: these are **compliance-review positions, founder-verified — not an
external law firm's opinion letter.** Where an item warrants independent
qualified review, the answers say so (the LO-10 round and the LO-5 DPIA are the
two standing examples). Treat that consistently, and keep this paragraph in the
file so the provenance is never ambiguous again.

## 5.1 The six deviations

**D1 (bundle rule)** — resolved by Q2 below: the shipped rule is withdrawn in
favour of blocking mixed bundles. See Q2.

**D2 (pseudonymise with a constant) — accepted.** A fixed placeholder with no
mapping retained is irreversible for that field, which satisfies the
pseudonymise limb (in substance it anonymises the field). Verify no other
field on the order re-identifies the guest; if the email was the only
identifier, this is closed.

**D3 (30 days delivering up to ~60) — cure it one of two ways.** A stated
retention period must be honest. Either raise the purge cadence to weekly
(preferred; cheap), or amend the RoP and privacy notice to "no later than 60
days after cancellation / last activity." Do not leave a documented 30-day
rule with a 60-day reality.

**D4 (clock restarts on row touch) — fix.** Retention runs from the event
(cancellation), not from `updated_at`. Add a `cancelled_at` timestamp (or use
the status-change event) and key the purge to it. A clock any later touch can
restart is not the specified rule and will drift silently.

**D5 (no grace window) — approved as built.** The intended reading was "up to
60 days to comply," not "wait 60 days" (Q18(b) below). Immediate relocation is
compliant, stricter for privacy, and acceptable to the artist because
restore-on-resubscribe exists. Keep it.

**D6 (withdrawn true claim) — re-scope, don't withdraw.** The suppression
condition was written about the **Plus 0.5% subsidy rate**. For the 3% cohort
the claim is true and the accountant said so; withdrawing it from them was not
instructed. Correct implementation: the claim renders for any cohort where
`fees.payer: application` holds **and** either the rate covers cost (3%) or a
founder-recorded subsidy approval exists (0.5%). Restore the sentence for the
3% cohort in the same push that ships the binding.

## 5.2 Carried-forward questions

### Q1 — the tax ledger must become deletable at the horizon

Permanent retention is not the intended exception, and it should not be
documented as one: the legal obligation is seven years, and append-only
immutability is a **control**, not a lawful basis for indefinite retention.
Storage limitation wins at the horizon. Amend the control so it is immutable
against *edits and corrections* (corrections stay new rows) but deletable by
exactly one path — the retention purge at 7 years from financial-year end.
The subscription rows the snapshots reference then purge on their own
schedule. This is a deliberate, documented amendment to a deliberate control;
record it as such in the register.

### Q2 — mixed bundles: block them (option three)

Your sharpening settles it. With no per-component billing basis (A8), partial
returnability is incoherent; and the shipped rule (whole bundle
non-returnable) suppresses a real return right on the standard components —
exactly the Art. 10 direction to avoid, and legally weak: a bundle is not
"made to the consumer's specification" because one component is.
**Rule: a bundle may not contain both custom-made and standard products.**
Enforce at bundle creation. An artist who wants both sells them as separate
items in one cart, which preserves per-line rights cleanly. This is
consistent with the existing v1 refusal of variant-bearing bundles. Revisit
only if per-component pricing is ever built.

## 5.3 New questions

### Q4 — the add-on lane carries the same duties

Information duties attach to the **distance contract**, not to the surface.
The add-on lane concludes a contract that includes goods, so it needs (a) a
conforming Art. 8(2) label — "Pay deposit and selected items" is arguably an
unambiguous payment formulation, but do not spend risk on "arguably":
standardise on the approved label with the total ("Order with obligation to
pay — [total]: deposit and selected items"); and (b) **per-row custom-made
markers**. The aggregated "some of your selected items" is precisely the
blanket-claim shape the C1.2 answer prohibits — an exemption claimed against
an unidentified item is claimed against no item, and the unmarked items'
return windows extend under Art. 10. Both before the shop switches on. Your
two assumptions were indeed in tension; the disclosure assumption was the
right one.

### Q5 — "per product" means per product at the point of sale; display is a fast-follow

The legal minimum is pre-contractual: the buyer must see the per-product
claim **before being bound**, which checkout plus confirmation satisfies. The
public shop page omission is therefore not sign-off-blocking. But add the
schema field and the product-page badge as a scheduled fast-follow: surfacing
"no return right" only at checkout invites misleading-omission arguments
under the UCPD and, more practically, disputes. Until the field exists, the
browsing surface must not say anything that implies returnability.

### Q6 — the durable record: reproduce, don't reference

(a) The model form must be **reproduced in or attached to** the confirmation.
Art. 6(1)(h) requires the form to be *provided*, and the Art. 8(7)
confirmation must carry the Art. 6 information on the durable medium itself
unless already so provided. A plain-text path reference satisfies neither.
The form is short — include its text in the email body or attach it.
(b) A confirmation with no Terms text is **non-compliant on its face** for
the same reason; checkout acceptance of terms on a mutable web page does not
cure it. Fix both, as intended. The team's instinct that these are defects,
not positions, is correct.

### Q7 — the model form wording: construction approved, review in the C1.9 pass

Annex I(B) as the base is right. Addressing the form to the **artist as
seller** is correct — the withdrawal is from the contract with the artist —
and naming Inklee as an alternative recipient is permitted and useful,
provided the page and the Terms state that a withdrawal received by Inklee is
forwarded to the artist **without delay** and counts as received when Inklee
receives it (the buyer must not lose days in forwarding). Render the artist's
name and address into the form, not placeholders. Include the final text in
the C1.9 package; it will be reviewed there as the sixth artifact.

### Q8 — tamper-evidence is required, not prudent

(a) Yes. The burden of proving that pre-contractual information was given
sits with the trader; a snapshot the seller can rewrite cannot discharge
anyone's burden and is not evidence — it is a draft. The exemption's validity
depends on what was disclosed *at sale*, provable. (b) Yes: as host and
record-keeper, Inklee relying on a seller-mutable record for its own refund
enforcement would put it in the position of having facilitated the rewrite.
Make both order-evidence tables **service-role-write-only before the shop
switches on.** The RLS policy name that hid this ("artist can read own order
items" permitting `FOR ALL`) is worth a register entry of its own.

### Q9 — the erasure/retention fail-opens: assess, record, sweep, and push

(a) No supervisory notification on current facts. The waitlist non-erasure is
an Art. 17 compliance failure, not a security breach. The cleanup job's
over-deletion path *is* within the Art. 4(12) definition (accidental
destruction), but with no evidence it fired, a tiny population, and low risk
to individuals, the correct treatment is an **internal breach-register entry
under Art. 33(5)**: defect, window, population (8 deletions, ≤5 external
users), evidence examined, conclusion, fix. No Art. 33 notification unless
the sweep in (b) finds actual unerased or destroyed data changing that
assessment. (b) **Yes — run the retrospective waitlist sweep** against
deleted accounts; it is cheap and completes the erasures if any survived.
(c) Accountability requires documented controls, an honest record of the
defect, and the fix — not proof that every historical run held. The record
in (a) plus the sweep plus fix-forward is sufficient.
**Sequencing, recorded as requested:** the destructive path runs nightly
until pushed. Cherry-pick the five live-defect fixes ahead of the 186-commit
batch if the batch cannot ship this week. Waiting for the full release to fix
live fail-opens on erasure and retention paths is the wrong trade.

### Q10 — the MFA fail-open: record it, and fix the logging gap it exposed

(a) No notification. The four converging observations (one unverified factor
ever, zero challenges, zero elevated sessions, empty auth records) support
"the precondition never existed" strongly enough that a dated internal
assessment memo — facts, window (~102 days), evidence, the acknowledged limit
that removal would leave no trace, conclusion — is the proportionate
response. Absolute proof is not the standard; documented reasonable
assessment is. (b) **Yes** — zero authentication-event logging is itself an
Art. 32 gap (no ability to verify the effectiveness of the measure), and it
is exactly what made (a) hard. Minimum fix alongside the fail-closed change:
log fail-open/fail-closed events and MFA challenges to Sentry and the audit
table. The same memo can note both reviewers' positions; they are not
actually in conflict — the first rates the *design*, the second the
*realised* exposure.

### Q11 — the intake form: C1.4 transfers wholesale, plus Art. 32 controls

Your suspicion is confirmed on both threads. (a) The unthrottled
Inklee-branded email to an attacker-supplied address is an abuse/reputation
issue — apply the sibling booking form's full control set (rate limit,
honeypot, origin check, MIME allowlist, dedupe) and do not send to the
supplied address more than once per submission window. (b) The intake
ingests name, email, and reference photographs — health-adjacent, same as
booking images: privacy notice at the field (adapt the C1.4 text), RoP
entry, and a defined retention: rejected or unactioned submissions purge at
**90 days**; accepted ones merge into the booking lifecycle and follow its
rules. This surface is live now: it belongs in the same expedited push as
Q9/Q10, and its images belong in the LO-5 DPIA scope.

### Q12 — deletion with an active subscription: end now, refund the remainder

Adopt one rule, disclosed on the confirmation screen and in the Terms:
**account deletion ends the subscription immediately and refunds the unused
part of the current period pro rata** (inside the 14-day window it is simply
processed as a withdrawal, same arithmetic, existing machinery). Rationale:
period-end semantics leave a paid period attached to a destroyed account;
silent forfeiture is the unfair-term shape; and at a 3.00 EUR price the
refund is trivial against the risk and support cost. Confirmation-screen
line: "Your Inklee Plus subscription ends now. We will refund the unused
part of your current period." Add the clause to the single C1.9 Terms
version — agreed that this was the one genuine gap in the prior package.

### Q13 — the Connected Account: build clause 2, define window-end, order the purge

(a) Stripe's independent-controller status covers *Stripe's* retention of
KYC data; it does not justify Inklee leaving a **live, open** account
indefinitely. The affirmative action owed at window-end is the one already
ratified: request deletion/deauthorisation of the connected account. (b)
"Window-end" means the **seven-year financial window** — same clock as the
retained records, deliberately, so the refund-foreclosure risk dies with the
records. (c) **Yes**: condition the pointer purge on the Stripe-side action
having completed; a purge that can outrun the deletion it enables is a
design fault. Build order: the balance check and purge-ordering constraint
now (cheap, prevents the orphan class); the scheduled deletion job itself is
not launch-blocking (first window-end ~2033) but must exist before the first
archive row ages out.

### Q14 — a control that has never fired needs a proving path, not patience

Accountability does not require waiting until 2028; it requires demonstrable
capability and monitored execution. Three elements: (1) a staging run
against real-schema synthetic expiring data covering every block, recorded;
(2) a production **dry-run/report mode** each cycle logging matched-row
counts per block (zero is then an evidenced result, not silence); (3) fix
the sequential-halt design — blocks continue on error and every block
failure alerts. With those, describe the schedule as "implemented with
monitored execution"; without them, do not describe it as implemented.

### Q15 — depicted-person consent: artist's obligation, Inklee takes an attestation

The artist is the controller of the client relationship and holds the
consent obligation toward the person depicted. Inklee does not need to
collect the subject's consent itself — but as host of health-adjacent images
it should require the same one-line logged attestation on **direct upload**
as on URL import ("I have my client's consent to display this image"),
plus an artist-Terms clause making that consent the artist's continuing
obligation. Parity is cheap and closes the asymmetry. The depicted person's
own route is the Q16 notice-and-action channel. Agreed this folds into the
LO-5 DPIA rather than a separate round.

### Q16 — condition (2), concretely

Four elements make the notice-and-action condition satisfied rather than
assumed: (1) the report route is reachable from or near gallery surfaces,
and its categories include rights infringement **and** "image of me without
consent"; (2) a report produces a queued item in the moderation workflow
with a removal action that removes the **storage object**, not only the
render; (3) `dsa-moderation-procedure.md` is extended to name galleries
(the same scope extension the map round required for directory entries);
(4) where the reporter gave contact details, acknowledgement and a decision
are sent (Art. 16 mechanics; Art. 17 statement owed only to *recipients of
the service* — the artist, on removal). Build and verify those four; then
the grant's second condition is discharged.

### Q17 — abandoned uploads: 7 days, and answer your own open question

The C1.4 logic transfers with a shorter clock: an orphan in the **public**
bucket is an unreferenced temporary file of sensitive content — purge at
**7 days** via an orphan sweep (objects unreferenced by any saved gallery
state older than 7 days are deleted). No legitimate use needs 30. And close
your own flagged gap: read the account-closure purge; if it sweeps by
referenced path rather than prefix, the orphan sweep is also what saves you
there — verify and record which.

### Q18 — the relocation control: invariant monitor or pull the fast-follow forward

(a) The failure class (silent, permanent, self-certifying completion) plus
the fact the control has only ever run against a mock does change the
posture, but there are two adequate responses and you may choose: **either**
(i) before the first capability grant, exercise relocation against real
storage in staging including the zero-image and failed-read cases, **and**
add a nightly invariant audit — no object in the public bucket may belong to
a downgraded artist; violation alerts — in which case the conditional pass
stands and signed URLs stay at "before any gallery marketing push"; **or**
(ii) pull signed-expiring URLs forward to "before the capability is granted
to anyone." An invariant that is independently checked is worth more here
than the URL scheme, because it catches the *next* silent failure too. Pick
one, date it, name an owner — the fast-follow currently has none, which was
the actual finding. (b) The intended reading was **"up to 60 days to
comply."** Immediate relocation is approved (D5).

### Q19 — the attestation record: its own basis, its own clock

(a) The rights attestation is **not** billing consent and must not inherit
the accounting clock. Basis: Art. 6(1)(f) — establishment and defence of
legal claims regarding hosted content. Retention: **for as long as the image
is hosted, plus three years after its removal** (the Estonian general
limitation period for claims is the defensible anchor). On account deletion,
the attestation follows the same rule (survives as claims-defence evidence
for the tail, pseudonymised where feasible), not the 7-year financial purge.
Implement as a retention class on the row (or move the type out of the
billing purge's scope). Add the register entry it currently lacks. (b) Yes —
the source address is necessary and proportionate: an attestation that
cannot say *what* was attested has no evidentiary value. Keep it.

### Q20 — P2B applies now; DSA marketplace duties are excluded while micro/small

Answering, not deferring. Two different regimes, two different answers:

- **P2B Regulation (2019/1150): applies at any size** — no micro exemption
  for its core duties. The goods shop makes Inklee an online intermediation
  service for business users (artists). Concretely owed now: artist Terms in
  plain, accessible language; stated grounds and notice for
  suspension/termination/restriction of an artist's shop (with a statement
  of reasons on suspension); **15 days' minimum notice** for Terms changes
  (fold into the versioned-Terms process — it already fits); disclosure of
  main ranking parameters *where ranking exists* (the shop lists one
  artist's own products — no cross-trader ranking; the map/directory is the
  surface to check); and differentiated-treatment disclosure if Inklee ever
  sells its own goods (it does not). The Art. 11 internal complaint-handling
  system and Art. 12 mediation duties are **exempt for small enterprises** —
  record the exemption. Net: a short P2B section in the artist Terms,
  landing in the same C1.9 version.
- **DSA Section 4 (trader traceability, Arts. 29-32): excluded** for micro
  and small enterprises by Art. 29 DSA, as Section 3 was by Art. 19.
  **Recorded deferral with threshold:** these duties attach when Inklee
  exceeds micro/small status under Recommendation 2003/361 (and remain
  excluded for 12 months after crossing) or if a designation changes.
  Add that trigger to the same monitoring file as the VAT thresholds so one
  quarterly check covers both.

## 5.4 Part 3 acknowledgments

Noted, no action required, with two exceptions. **The 1,363-row hard-delete:**
folding the seeded-dataset lawful-basis question into the LO-5 DPIA is
agreed, but an unexplained bulk deletion with no audit record and no known
mechanism is itself a finding — determine the mechanism (who or what could
issue it) and record it now, not at DPIA time; if those rows included sole
traders, the deletion is *favourable* to them, but the unexplained write
access is the issue. **The eleven-endpoint credential:** no design work owed
to this review, but put it at the top of the documented Art. 32 backlog with
a date; "top of the backlog if one is ever needed" is how it becomes
permanent.

## 5.5 Part 4 — scope and sequencing of the final sign-off

The §4.4 scope is confirmed, with four additions:

1. **Deployment is a sign-off condition.** The consolidated approval will be
   recorded against artifact hashes, but its cover note must state that
   approval is of artifacts *as deployed*: the release candidate must be
   pushed, migrations applied, and the C2 screenshot taken from the deployed
   surface before the key is recorded. Approving a branch that has never run
   in production, silently, is how the ledger stops meaning things.
2. **The expedited push comes first.** The five live defects (Q9, Q10, Q11,
   XSS, plus the cron guard) do not wait for the batch — cherry-pick and
   ship, this week.
3. **C1.10 is not complete** until the refund-ledger carve-out lands (yes —
   fix it; that instruction is confirmed) **and** the §11 cross-check is
   actually performed and recorded. An explicitly ordered cross-check that
   silently did not happen must not survive a second round.
4. **The LO-5 DPIA enters the ordered go-live worklist now, with an owner
   and a date.** It is release-gating by prior decision, its scope has grown
   three times (booking images → gallery + guest checkout → intake form +
   seeded dataset), and it is absent from the plan. That is the single
   largest open risk in this package.

Reconcile the §4.3 record (the production ledger's 2026-07-25
withdrawal-copy approval vs. the two documents saying pending) in the same
pass — the hash change moots the key, but a ledger row nobody can explain
fails the standard this process is built on.

### Answer index

| Item | Answer in one line |
|---|---|
| D1-D6 | D2, D5 accepted; D3 cure (weekly or honest notice); D4 fix clock; D6 re-scope to Plus rate only; D1 → Q2 |
| Q1 | Deletable at 7-year horizon via purge path only; immutable against edits |
| Q2 | Block mixed bundles at creation (option three) |
| Q4 | Add-on lane needs the label + per-row markers before shop-on |
| Q5 | Point of sale is the minimum; product-page badge as scheduled fast-follow |
| Q6 | Reproduce/attach form and Terms in both receipts; reference insufficient |
| Q7 | Construction approved; forwarding-without-delay rule; review text in C1.9 |
| Q8 | Hardening required; service-role-write-only before shop-on |
| Q9 | Internal Art. 33(5) record + waitlist sweep + expedited push; no notification |
| Q10 | Assessment memo; fail-closed + auth-event logging (Art. 32) |
| Q11 | Full control set + C1.4 treatment (notice, RoP, 90-day purge); expedite |
| Q12 | Delete = end now + pro-rata refund of remainder; clause in C1.9 |
| Q13 | Build clause 2; window = 7 years; purge conditioned on account action |
| Q14 | Staging proof + production dry-run counts + per-block alerting |
| Q15 | Artist's obligation; parity attestation on direct upload; into LO-5 |
| Q16 | Four concrete elements; then condition (2) is discharged |
| Q17 | 7-day orphan sweep; verify closure-purge semantics |
| Q18 | Invariant monitor or signed URLs before first grant; reading = "up to 60 days" |
| Q19 | Art. 6(1)(f), hosted-life + 3 years; own retention class; keep source URL |
| Q20 | P2B terms now (in C1.9); DSA Section 4 excluded while micro/small, trigger recorded |
