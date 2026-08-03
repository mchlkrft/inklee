# DSA Notice-and-Action Internal Procedure

**Status:** v3, 2026-08-04 (v2 2026-07-26, v1 2026-05-20). Owned by founder. Not user-facing.
**Counterparts:** `/legal/report` form (`src/app/legal/report/`) and its shared category list (`lib/legal/report-categories.ts`), Acceptable Use Policy (`content/legal/acceptable-use.md` §6 "Reporting abuse"), in-product map reports (`map_reports`, `submitMapCorrection`), the durable report queue (`content_reports`, migration 0155), the gallery takedown (`lib/server/gallery-takedown.ts`), statements of reasons (`moderation_statements`, `lib/server/moderation-statements.ts`), and the DPIA R1 gate key `dpia_r1_notice_and_action_built` (`lib/server/billing/dpia-gate-preconditions.ts`), which stays unrecorded until this procedure and its build are complete.
**Scope:** All notices alleging unlawful content or AUP violations on `inklee.app`, public artist pages on the same domain, content uploaded via the booking workflow, **the tattoo directory: map location entries, studio profile pages, shop entries, and temporary studio signals** (added in v2), and **hosted portfolio/gallery images on an artist's public hub** (added in v3).

**v2 changes (counsel answer to Q14, 2026-07-24; recorded in `docs/product/inklee-2-open-questions.md`):** scope extended to the directory; the two-channel mapping in §2a added; the micro-enterprise position in §6 firmed up from "tentatively applies" to a stated exclusion; the Art. 17 recipient distinction in §3a added.

**v3 changes (counsel round-2 Q16, adopted as DPIA mitigation R1; #79, 2026-08-04):** scope extended to hosted gallery images; the "image of me without consent" route added in §2b; a durable `content_reports` queue now backs intake; a gallery takedown that deletes the storage object was built; the §3a recipient distinction extended to the gallery case; and the DSA Section 4 trader-traceability trigger noted in §6 (its figure and citation pending counsel round-6).

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

## 2b. Gallery images: the "image of me without consent" route (v3)

Hosted portfolio/gallery images on an artist's public hub (`/<slug>/hub`) are in
scope as of v3. A person depicted in such an image can ask for it to come down
through a dedicated `/legal/report` category, **"Image of me without consent"**,
reachable from the Hub footer ("Report content"). This route wears two hats at
once, and one action satisfies both:

- a **DSA Art. 16 notice** about content the platform hosts, and
- the **depicted person's GDPR erasure route** for their own image (see
  `docs/legal/lo-5-dpia.md`, DPIA mitigation R1).

Because the reporter is the depicted third party, contact details are required
(the form enforces this), so the §1 acknowledgement applies.

- **Intake and queue.** The report lands in the durable `content_reports` queue
  (migration 0155), not email alone, and the automatic Art. 16(5)
  acknowledgement fires exactly as for any category.
- **Decision is human.** Whether the image comes down is a moderation decision
  (§2/§3); there is no automated takedown.
- **Removal deletes the OBJECT, not just the render.** On a founded report the
  operator runs the gallery takedown (`lib/server/gallery-takedown.ts`), which
  strips the image from the artist's bio-page blocks AND deletes the underlying
  storage object from **both private gallery buckets**: `gallery` (the live
  bucket since migration 0151) and `gallery-archive` (a downgraded artist's
  copy, since 0144). It does not touch the public `logos` bucket, which holds
  goods images out of this scope. (NOTE: `docs/legal/lo-5-dpia.md` still names
  the old `logos` bucket for gallery objects; that reference predates 0151 and
  is stale, tracked for correction.) Deleting the object is load-bearing on its
  own: gallery objects are private and served only through short-lived signed
  URLs, so a deleted object can no longer be signed and the render drops it.
- **Statement of reasons.** The **artist** hosts the image and is the recipient
  of the service, so the full Art. 17 statement is owed to the artist,
  delivered per §3 (see §3a). The reporter is notified of the outcome under §4
  without disclosing the artist's personal data.

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
- **Hosted gallery image (v3)** — the artist who hosts the image *is* a recipient of the
  service, so a takedown of one of their gallery images owes a full Art. 17 statement to the
  **artist**, delivered per §3. The depicted person who reported it is notified of the
  outcome under §4 but is not owed an Art. 17 statement: they are the notifier, not the
  recipient whose hosted content was actioned. `recordGalleryModerationStatement`
  (`moderation-statements.ts`) writes it with `target_type='gallery_image'`,
  `action='removed'`, delivered to the artist.

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

**DSA Section 4 (trader traceability) trigger (v3).** Inklee's standalone goods
shop makes it a platform allowing consumers to conclude distance contracts with
traders, and the Section 4 duties (Arts. 30-32) are likewise excluded while
Inklee is micro **or small** (Art. 29, as Section 3 is by Art. 19 above). This
is to be MONITORED alongside the VAT thresholds so one quarterly check covers
both: a `dsa_micro_small_2003_361` row in `tax_thresholds` that alerts if Inklee
crosses the small-enterprise ceiling under Recommendation 2003/361. TWO things
are pending counsel before it is seeded (round-6 Q1/Q2, 2026-08-04): the exact
ceiling figure (the trigger is the SMALL ceiling, since the exemption survives
while either micro or small), and confirmation of the Section 3/Art. 19 vs
Section 4/Art. 29 citation for this specific trigger. The row is deliberately
NOT built with a figure until counsel confirms it, because a statutory figure is
never invented in engineering.

## 7. Updates to this procedure

Change this doc together with `/legal/report` form behaviour or with the AUP §6 reporting language; keep all three in sync.
