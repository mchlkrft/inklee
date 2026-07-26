# DSA Notice-and-Action Internal Procedure

**Status:** v2, 2026-07-26 (v1 2026-05-20). Owned by founder. Not user-facing.
**Counterparts:** `/legal/report` form (`src/app/legal/report/`), Acceptable Use Policy (`content/legal/acceptable-use.md` §6 "Reporting abuse"), in-product map reports (`map_reports`, `submitMapCorrection`), statements of reasons (`moderation_statements`, `lib/server/moderation-statements.ts`).
**Scope:** All notices alleging unlawful content or AUP violations on `inklee.app`, public artist pages on the same domain, content uploaded via the booking workflow, and **the tattoo directory: map location entries, studio profile pages, shop entries, and temporary studio signals** (added in v2).

**v2 changes (counsel answer to Q14, 2026-07-24; recorded in `docs/product/inklee-2-open-questions.md`):** scope extended to the directory; the two-channel mapping in §2a added; the micro-enterprise position in §6 firmed up from "tentatively applies" to a stated exclusion; the Art. 17 recipient distinction in §3a added.

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

## 2a. Two channels for the tattoo directory (v2)

The directory has its own low-friction in-product report path (`map_reports`, filed from a
map location page) alongside the formal `/legal/report` form. They are not
interchangeable. Route by **whether the report is capable of alleging illegal content**:

| Report category | Channel | Why |
|---|---|---|
| Harassment, unsafe behaviour | **Formal DSA notice** (`/legal/report`) | Capable of alleging illegal content: Art. 16 notice, acknowledgement, decision, and a statement of reasons where action is taken |
| Payment conflict | In-product signal, plus our own T&C enforcement | Contractual dispute between parties, not illegal content |
| Wrong address, closed, not a tattoo studio, duplicate | In-product signal only | Factual correction; no DSA machinery engaged |

If an in-product signal turns out to allege illegal content, escalate it into the formal
channel and run the full §1 to §4 procedure from the escalation date.

**One category on `/legal/report` is not a DSA notice.** `directory_listing`
("Remove or correct a studio listing on the tattoo map") is the **GDPR Article 21
objection and delisting route** required by the 2026-07-24 counsel answer (§7.7 of the
licensing note). It sits on that form because the in-product map report requires an Inklee
account and a listed studio owner almost never has one. Handle it as follows:

- Do **not** run notice-and-action on it. It is a factual correction or an erasure request.
- **Removal requests are granted.** The requester does not have to give a reason, and a
  removed studio is not re-seeded: set the location to `removed` rather than deleting it, so
  a later seeding run cannot reintroduce it.
- **Correction requests** go to the same admin review queue as an in-product correction.
- Acknowledge within the §4 SLA and confirm when the entry is down or fixed.
- No Art. 17 statement of reasons is owed for an unclaimed entry (§3a). If the studio had
  claimed its profile, it is a recipient and §3 applies.

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

## 3a. Who is owed a statement of reasons in the directory (v2)

Art. 17 statements of reasons are owed to **recipients of the service**. That distinction
does the practical work in a directory that lists businesses which never asked to be
listed:

- **Unclaimed seeded entry** — the studio is *not* a recipient of the service. Delisting,
  hiding, or correcting an unclaimed entry owes **no** Art. 17 statement. This is also the
  only workable answer, since there is frequently no contact route to the business.
- **Claimed studio profile** — the owner *is* a recipient. Any visibility restriction
  against a claimed profile (hide, remove, suspend, restrict a feature) owes a full Art. 17
  statement, delivered per §3.

Because of this, anonymous in-product signals are acceptable for unclaimed-entry
corrections, while the conduct categories route to the formal channel where the reporter is
identified and acknowledged.

Statements of reasons are written by `lib/server/moderation-statements.ts` into the
`moderation_statements` register, wired into the approve/hide/remove, seed-deletion, and
possibly-closed admin actions. Delivery to the affected party is not yet automated
(`delivered_at` stays null); for a claimed profile, send it manually per §3 until it is.

## 4. Target SLAs (operational, not contractual)

- **Acknowledge:** within 24 hours.
- **Decide and act:** within 14 days for typical reports; shorter for serious illegal content; immediately for §2 escalations.
- **Notify reporter and affected user of the outcome:** within 3 days of the decision.

## 5. Records and retention

- Keep report records, decisions, and notifications for at least 24 months (aligns with the Privacy Policy audit-log retention).
- Statement-of-reasons records: keep for at least 5 years to support trend analysis. Not published in a public transparency report (see §6).

## 6. Micro-enterprise position (DSA Art. 19) — confirmed v2

Inklee OÜ qualifies as a **micro enterprise**, so **Art. 19 excludes it from DSA Section 3**.
Confirmed by counsel 2026-07-24. In practice that means the following do **not** apply:

- **Art. 20** internal complaint-handling system — not required.
- **Art. 21** out-of-court dispute settlement — not required.
- **Art. 22** trusted flaggers — not required. (v1 said "not implemented; activate when
  notice volume warrants it." The correct statement is that it is not owed at this size.)
- **Art. 15(2)** transparency reporting — exempt.

**Section 2 applies regardless of size** and is what this procedure implements: **Art. 16**
(notice and action) and **Art. 17** (statement of reasons).

Revisit if Inklee stops qualifying as a micro enterprise.

## 7. Updates to this procedure

Change this doc together with `/legal/report` form behaviour or with the AUP §6 reporting language; keep all three in sync.
