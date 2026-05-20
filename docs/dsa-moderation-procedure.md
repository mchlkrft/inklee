# DSA Notice-and-Action Internal Procedure

**Status:** v1, 2026-05-20. Owned by founder. Not user-facing.
**Counterparts:** `/legal/report` form (`src/app/legal/report/`), Acceptable Use Policy (`content/legal/acceptable-use.md` §6 "Reporting abuse").
**Scope:** All notices alleging unlawful content or AUP violations on `inklee.app`, public artist pages on the same domain, and content uploaded via the booking workflow.

The form at `/legal/report` is the preferred intake. Reports may also arrive as free-form emails to `support@inklee.app` (DSA Art. 11/12 single point of contact, see imprint). Both channels feed the same procedure.

---

## 1. Intake (within 24h)

1. Log the report. v1: a private Notion/spreadsheet with columns:
   `reference, received_at, channel (form|email), category, reporter_name, reporter_email, url(s), description, status, decided_at, decision, reasoning, notified_at`.
2. Acknowledge receipt to the reporter (DSA Art. 16(5)).
   - Form submissions: the server action sends an automatic confirmation email with the reference number.
   - Email submissions: send a manual ack within 24h that mirrors the form's automatic confirmation copy.
3. Reject obvious spam / repeat-abusive submissions silently (DSA Art. 23 — measures against abuse).

## 2. Triage and assessment

For each report, decide:

- Is the URL on `inklee.app` or a public artist page we host?
- Is the content user-generated (artist profile content, booking-request data, uploaded images) or platform-generated (marketing copy, our own pages)?
- Does it fall under the Acceptable Use Policy or applicable law?

Triage outcomes:

- **No action needed** (the report is unfounded, the content is lawful and policy-compliant) → reply to the reporter explaining the conclusion. Close.
- **Action needed** → proceed to §3.

Severity escalations:

- **Child sexual abuse material (CSAM) or content under Arts. 3–7 of Directive 2011/93/EU:** escalate to law enforcement immediately, preserve evidence, and remove the content without delay. Submitters of CSAM-related reports may be anonymous per DSA Art. 16(2)(c).
- **Imminent risk to life or serious harm:** escalate to LE immediately and remove.

## 3. Action and statement of reasons (DSA Art. 17)

When taking a moderation action (remove content, suspend account, restrict feature access):

1. Apply the action.
2. Send a **statement of reasons** to the affected user containing:
   - What was done.
   - Why (specific AUP clause, ToS section, or legal basis cited).
   - The territorial / temporal scope of the action.
   - Whether automated means were used (currently: no).
   - The user's right of redress: reply to the action email; we will reconsider on receipt of new information.
3. Close the report; notify the reporter of the outcome (without disclosing personal data about the user).

## 4. Target SLAs (operational, not contractual)

- **Acknowledge:** within 24 hours.
- **Decide and act:** within 14 days for typical reports; shorter for serious illegal content; immediately for §2 escalations.
- **Notify reporter and affected user of the outcome:** within 3 days of the decision.

## 5. Records and retention

- Keep report records, decisions, and notifications for at least 24 months (aligns with the Privacy Policy audit-log retention).
- Statement-of-reasons records: keep for at least 5 years to support trend analysis (not currently published in a public transparency report — micro-enterprise exemption tentatively applies under DSA Art. 19; revisit when scale grows).

## 6. Trusted flaggers (DSA Art. 22)

Not implemented in v1. Activate when notice volume warrants it.

## 7. Updates to this procedure

Change this doc together with `/legal/report` form behaviour or with the AUP §6 reporting language; keep all three in sync.
