# Counsel handoff, round 3

**Date:** 2026-08-02
**Follows:** `docs/legal/counsel-handoff-2026-08-02.md` (your round-2 answers are Part 5 of it)
**Contains:** the two records you asked us to produce (Q9, Q10), an implementation status against
your answers, and two new items.

---

## 0. What you are being asked to do

1. **Review the Art. 33(5) internal record in §2.** You said no supervisory notification is
   required but the internal record is. This is it. Tell us if the reasoning is wrong or the
   record is inadequate.
2. **Review the assessment memo in §3.** Same for Q10.
3. **Note §4**, two new items that arose while implementing your answers. One may change a
   sequencing instruction you gave.

Nothing here reopens a settled input.

---

## 1. Status against your round-2 answers

Shipping today, in the expedited push you directed (§5.5(2)):

| Item | State |
|---|---|
| Q10 — MFA fail-closed | Built, mutation-verified both directions, in the push |
| Q9 — cleanup fail-closed, deletion read guard | Built, in the push |
| WEB-XSS-001 | Built, in the push |
| Q11 — public intake control set | Being built now, joins the push before it ships |

The push is a four-commit branch cut from the deployed branch, carrying **no migration** and
querying **no table above production's applied ceiling (0124)**. We verified that rather than
assuming it: the entire diff touches only `audit_log`, `booking_requests` and
`instagram_accounts`.

One deliberate deviation from a literal reading of your instruction. You listed five live defects
to cherry-pick. One of the five, the studio JSON-LD escape, was committed together with an
unrelated refund-ownership fix. We took **only the escape half**, because the refund half touches
a file that does not exist on the deployed branch, and shipping it would have put code into
production for tables production does not have. The refund fix stays in the main batch.

Everything else from your answers (Q1-Q8, Q12-Q20, D1-D6) is scheduled and not yet built. We are
not reporting progress we have not made.

---

## 2. Art. 33(5) internal record — MFA step-up gate fail-open

Prepared per your Q9 and Q10 answers. Your conclusion that no supervisory notification is required
is recorded and relied upon; we have not re-derived it.

**Nature of the event.** An authentication control failed open. Middleware that determines whether
a session must complete a second-factor challenge called the identity provider; if that call
failed, the request proceeded ungated. Two independent paths produced this: a caught exception
whose handler was a comment reading "MFA check failed, continue without gating", and a non-throwing
error return that left the redirect unreachable. The page the gate redirects to had a matching
failure that routed the session onward.

**Whether it was deliberate.** The fail-open was introduced as a documented choice on 2026-04-22,
approximately two hours after the feature shipped. It was not an oversight in authorship. It was
not revisited.

**Duration.** Present on the deployed branch for approximately 102 days, and deployed at the time
of writing. The exact date it first reached production is **not recoverable** from our repository;
hosting-provider deployment history would establish it and has not been queried.

**Categories of data potentially affected.** Artist account data behind nine gated route prefixes,
including bookings, client records, settings and payouts. Administrative routes were never exposed
through this path: their own guard fails closed independently, which we verified in code.

**Number of data subjects affected: assessed as zero.** The gate can only redirect a session whose
account holds a **verified** second factor. Production was queried on 2026-08-02:

- the second-factor table has held exactly one row in the platform's history, unverified, never
  challenged, on an internal tester account;
- there have been zero second-factor challenges, ever;
- no session has ever reached the elevated assurance level;
- there are no second-factor entries in the authentication-method records.

On that evidence no account has ever completed enrolment, so no step-up was ever owed and the
fail-open never changed the outcome of any request.

**Limits of that conclusion, recorded because they are the reason this record exists.** It rests on
four converging present-state observations, not on an immutable log. An account that enrolled,
verified and later unenrolled would leave no trace in any of them. **The authentication audit table
is empty**, so there is no durable event history to cross-check. Platform and hosting logs were not
examined. Even a complete access log could not distinguish a fail-open request from an ordinary
request by a user with no second factor, because both render an identical successful response.

**Remedial action.** The gate now resolves three states rather than two — step-up required, not
required, and could-not-determine — with the third failing closed after one bounded retry, and
emitting a monitoring event on every failure path. Verified by mutation in both directions: removing
the guard reds the bypass tests, and making it over-refuse reds the tests proving users without a
second factor still reach the product. Shipping in today's push.

**Follow-on control.** Authentication-event logging is being added, per your Q10 answer, on the Art.
32 basis. We note the circularity plainly: the absence of that logging is what makes the paragraph
above unprovable, and it is the reason this record cannot say "no" rather than "assessed as zero".

---

## 3. Assessment memo — Q10

**The question you were asked.** Whether a live period of this shape requires any assessment or
record, given evidence the precondition never existed but no proof it never existed.

**Your answer, as we understood it.** No notification; internal record required; fix by failing
closed; add authentication-event logging under Art. 32.

**Our disagreement, disclosed.** Two internal reviewers reached different conclusions and we did not
resolve it before putting it to you. One rated it the second most urgent live item, on the basis
that nine artist-facing prefixes depended on this check alone and one has no secondary protection.
The other queried production and concluded the precondition was never met. We recorded both. Your
answer is consistent with the second while requiring the remediation the first argued for, which we
read as deliberate rather than as picking a side.

**What we are doing.** Both. Fail-closed ships today; logging follows in the batch; this memo and
the §2 record are retained as the accountability artifacts.

**Residual risk we are accepting, and want on the record as accepted rather than solved.** Until
authentication-event logging has been live for a meaningful period, a future question of this shape
will be equally unanswerable. The logging fixes that prospectively and cannot fix it retrospectively.

---

## 4. New items

### 4.1 A sequencing consequence you may want to revisit

Your Q11 answer requires the public intake form to receive both the five missing abuse controls
**and** C1.4 treatment: privacy notice, records-of-processing entry, and a 90-day purge.

The abuse controls are code-only and ship today. **The 90-day purge may require schema**, and the
expedited branch is deployable precisely because it carries no migration and no query above
production's applied ceiling. We are therefore splitting your instruction: controls now, retention
treatment in the main batch.

If you intended the retention treatment to be inseparable from the controls — that the form must not
continue accepting personal data for another cycle without its purge in place — say so and we will
hold the whole item rather than ship half of it. Our provisional view, not acted on beyond the split
itself, is that the abuse controls reduce intake volume immediately and the purge governs data
already held, so shipping the controls first is strictly better than shipping neither. We may be
wrong about which half is urgent.

### 4.2 A provenance statement we now rely on

Your §5.0 answer resolved the question we raised: these are **compliance-review positions,
founder-verified, not an external law firm's opinion letter**, with LO-10 and the LO-5 DPIA named as
the standing exceptions warranting independent qualified review.

We have propagated that characterisation and will keep it attached to both rounds. Recording it here
so that anyone reading round 3 alone does not mistake the standing of the answers it implements.

---

## 5. Unchanged

The single remaining counsel gate is final implementation sign-off against finished artifacts, and
per your §5.5(1) that sign-off is now conditioned on the artifacts being **deployed** — release
candidate pushed, migrations applied, and the confirmation screenshot taken from the live surface —
before the approval key is recorded.

The activation gates (`consumer_sales_launch_approved`, `GOODS_COMMERCE_ENABLED`) remain closed.
Today's push contains no consumer-facing commerce change; it is defect remediation on already-live
paths only.
