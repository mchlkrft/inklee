# LO-5 — Data Protection Impact Assessment

**Article 35 GDPR assessment for image and studio-record processing**

| | |
|---|---|
| **Owner** | Michel Kraeft (founder, controller) — confirmed 2026-08-02 |
| **Target date** | Met — controller decision recorded 2026-08-03 |
| **Status** | **COMPLETED AND SIGNED.** Sections 1-5 prepared by engineering from evidenced facts; sections 6-8 adopted by the controller on 2026-08-03 following compliance review (founder-verified). |
| **Release-gating** | Yes, by prior decision. Blocks the goods and gallery activation gates. |
| **Prepared** | 2026-08-02 |

---

## 0. What is and is not done

**RESOLVED 2026-08-03.** This document existed as a draft because counsel escalated its absence
in three consecutive rounds. Sections 6-8 were deliberately left empty by engineering — a DPIA
whose risk acceptance was written by the engineer who built the system is not an assessment —
and were **adopted by the controller on 2026-08-03** on the compliance review's recommendations,
founder-verified. The assessment is complete and signed (§8). What remains is execution: the §7
mitigations wired as gate preconditions, tracked in the activation-gate ledger and the ordered
worklist.

Engineering drafted what rests on facts: what data is processed, where it lives, what controls
already exist, and where the gaps are. Every factual claim here is traceable to a commit, a file,
or an entry in `docs/audit/findings.yaml`.

---

## 1. Why this assessment is required

Two independent Art. 35(3) triggers apply, and either alone would be sufficient.

**Special-category data (Art. 9).** The platform hosts photographs of identifiable people's
tattooed skin. Counsel has characterised these as health-adjacent. A tattoo photograph can reveal
religion, ethnicity, sexual orientation, medical history, or reconstructive surgery, whether or not
the artist or the subject intends it to. Processing is at scale and systematic.

**Data subjects who are not users.** In the majority case the person depicted is not an Inklee
account holder, never interacted with the product, and does not know their image is hosted. They
cannot exercise rights they are unaware of. This is the structural feature that makes the
assessment necessary rather than prudent.

A third factor, not a formal trigger but material to §4: a large body of records about businesses
that did not opt in.

---

## 2. Scope, and how it has grown

The scope has expanded three times. Recording that plainly, because the growth is why the
assessment kept being deferred and because a DPIA that silently omits a later addition is worse
than a late one.

| Round | Added to scope |
|---|---|
| Original | Booking reference images |
| Second | Gallery images, guest checkout |
| Third | Public project-intake form, the seeded studio dataset, upload consent |

### Processing activities in scope

1. **Booking reference images.** Client-supplied photographs attached to a booking request. Private
   bucket. **Live today: 25 objects.**
2. **Gallery images.** Artist-uploaded portfolio images, including photographs of client work.
   Capability has never been granted to any artist; nothing has been uploaded through it.
3. **Project-intake images.** Up to 12 files per submission through a public, unauthenticated form.
   **Zero submissions in production, ever.**
4. **Guest checkout data.** Buyer identity and contact details without an account.
5. **Seeded studio dataset.** Approximately 71,000 studio records across 16 countries, compiled
   from public sources. **No claims, no consent, no relationship with the subjects.**

### Explicitly out of scope

Artist account data, billing and tax records, and payment processing. These are covered by the
existing retention and deletion work and by counsel's C1.10 and Q1/Q12/Q13 rulings.

---

## 3. Data flows

| Activity | Subject | Source | Location | Retention today |
|---|---|---|---|---|
| Booking reference images | The client, and anyone depicted | Uploaded by the client | Private `bookings` bucket, `projects/` prefix | 30-day purge after booking resolution |
| Gallery images | The person tattooed | Uploaded by the artist | Private `gallery` bucket, signed-URL access only (factual correction 2026-08-04: R4/migration 0151 moved these from the public `logos` bucket named at signature; the correction does not change any assessment in this DPIA); `gallery-archive` on downgrade | Relocated on entitlement lapse; deleted on an Art. 16/17 takedown (R1) or account deletion |
| Intake images | The enquirer, and anyone depicted | Public form | Private bucket | **None — the 90-day purge is designed and not built** |
| Guest checkout | The buyer | Checkout form | `orders`, `shop_carts` | Purges built and boundary-tested; never yet expired anything |
| Seeded studios | Studio operators | Public sources | `studios` and related | **None** |

---

## 4. Risks to the individual

Framed as harm to the person, not exposure to the business.

**R1 — A depicted person cannot reach us.** Someone whose tattoo appears in a hosted photograph has
no route to request deletion. They do not know Inklee exists. Rights that cannot be exercised are
not satisfied by being formally available.

**R2 — Health-adjacent data hosted without the subject's knowledge.** The artist consents on the
platform; the depicted person consents to the artist, if at all, and that consent is neither
recorded nor verifiable by us.

**R3 — Upload carries no consent gate.** The URL-import path requires a rights attestation. **Direct
file upload, which is the normal case, requires nothing.** Counsel's Q15 answer and an independent
cross-check finding arrived at this from different directions.

**R4 — Unguessable URLs are not access control.** Counsel named this directly. Gallery objects sit
at public URLs; signed expiring URLs are dated and not built.

**R5 — The seeded dataset has no assessed basis.** Legitimate interest is the plausible candidate.
No balancing test has been written. 71,000 subjects, none of whom opted in.

**R6 — Intake images have no retention rule.** The purge is designed but unbuilt. It cannot cause
harm today because nothing has been submitted; it becomes live the moment something is.

**R7 — Controllership is undetermined.** Whether Inklee and the artist are joint controllers for a
client photograph decides who must answer a deletion request. Counsel's Q15 answer places the
consent obligation on the artist; if joint controllership applies, "the artist should have asked"
does not discharge our own duty.

---

## 5. Controls that already exist

Real and evidenced, not aspirational.

- **Gallery objects relocate to a private bucket on entitlement lapse**, hooked into billing
  reconcile and comp expiry, with a state-driven nightly sweep that catches paths nobody hooked.
  Two defects in this control were found and fixed on 2026-08-02 (`GAL-REL-001`).
- **A rights attestation gates URL import**, refused server-side before the outbound fetch, with
  the consent record written before the fetch and failing closed.
- **The `gallery-archive` bucket has zero storage policies**, verified against the live catalog —
  unreachable by anon and authenticated clients.
- **Guest retention purges** with an event-anchored clock and a weekly cadence.
- **Account deletion** retains only what the Terms promise, with a pseudonymisation allowlist that
  deliberately excludes free-text and token columns.
- **The public intake form now carries five abuse controls** matching its sibling booking form.
- **The audit register** records every image-related finding with citations and honest
  verification status.

### Gaps this assessment must confront

1. No consent gate on direct upload (R3).
2. Signed expiring URLs not built (R4).
3. No route for a depicted person to reach us (R1).
4. The seeded dataset has never been assessed (R5).
5. The intake retention purge is designed and unbuilt (R6).
6. Controllership undetermined (R7).

---

## 6. Necessity and proportionality assessment

**Adopted by the controller, 2026-08-03.**

Two corrections to §4 are recorded first: **(a)** controllership for booking reference images
is not open — `account-deletion-handoff.md` §1 determines it (Inklee processor, Artist
controller, joint controllership where purposes are jointly determined); only the gallery case
required fresh determination, made in §7 R7. **(b)** The seeded dataset is not unassessed — the
Q20 round directed the Art. 6(1)(f) basis, Art. 14(5)(b) transparency page, and Art. 21
delisting route; what was missing was the written balancing test, adopted below.

Per activity:

1. **Booking reference images — pass.** Necessary (a booking request without reference images
   defeats the service purpose); minimised (private bucket, 30-day post-resolution purge); no
   less intrusive means available.
2. **Gallery images — conditional pass.** Necessary for the artist-portfolio purpose;
   proportionate only with the §7 mitigations (attestation, signed URLs, takedown route) in
   force. Retention correction adopted: relocated archive objects receive a deletion horizon of
   **24 months after entitlement lapse without resubscription** (previously none).
3. **Intake images — conditional pass.** Necessary for the enquiry purpose; proportionate only
   once the 90-day purge exists. Until built, proportionality rests solely on the verified
   zero-volume state.
4. **Guest checkout — pass**, incorporated by reference from the C1.4 assessment (notice, RoP
   entry, retention table, purge jobs).
5. **Seeded dataset — pass, on the balancing test adopted here.** *Purpose:* an artist-facing
   directory of tattoo studios. *Interests:* legitimate commercial and community interest in a
   navigable map of the scene; subjects are businesses trading publicly. *Data:* name and
   location facts only, from published sources, with per-row provenance and mandatory admin
   review; no private-life data. *Impact:* minimal — publication mirrors the subjects' own
   public trading presence. *Safeguards:* the transparency page ("why you are listed, how to be
   removed"), the Art. 21 delisting route, small-cell suppression on the map, and no bulk
   export. *Balance:* favourable. *Incident note:* the unexplained hard deletion of 1,363 rows
   on 2026-07-21 is recorded as a handled incident; its mechanism must still be determined and
   recorded in the register (round-2 §5.4 instruction, carried, not waived).

## 7. Risk acceptance and mitigation decisions

**Adopted by the controller, 2026-08-03.** Disposition of each §4 risk:

| Risk | Decision | Mitigation / residual |
|---|---|---|
| R1 | **Mitigate** | The Q16 notice-and-action route is the contact route: add an "image of me without consent" category, surface it on gallery pages and in the privacy policy. No new machinery. |
| R2 | **Mitigate + accept residual** | Artist attestation (R3), artist-Terms clause making client consent the artist's continuing obligation, and the R1 takedown route. **Accepted residual:** Inklee cannot verify artist-client consent; verification would require contacting the subject, which is more intrusive than the risk it addresses. Recorded as accepted. |
| R3 | **Mitigate** | Direct-upload attestation at parity with URL import (Q15). Precondition of the gallery gate. |
| R4 | **Mitigate** | Q18 option resolved for the DPIA: **signed expiring URLs before the capability is granted to anyone.** Precondition of the gallery gate. |
| R5 | **Mitigate** | Balancing test adopted (§6.5); transparency page + delisting route ship with the public map, per Q20 §7.7. |
| R6 | **Mitigate** | The 90-day intake purge is built **before** the goods and gallery gates open; the form is live and the gap arms on first submission. Precondition of both gates. |
| R7 | **Decide + moot operationally** | Determination: **joint controllership is assumed for gallery images.** Operational rule adopted: **Inklee acts on deletion requests for hosted images directly**, whatever the role characterisation — this discharges the duty under either analysis. |

**Gate wiring (required, not prose):** R3, R4, and R6 are recorded as named preconditions in
the activation-gate ledger for the gallery and goods gates — not as document conditions. This
project's own record shows prose conditions drift; gate keys do not.

## 8. Outcome and sign-off

**Outcome.** With the §7 mitigations adopted as gate preconditions and the two recorded
residual acceptances (R2's unverifiable artist-client consent; R6's interim zero-volume
reliance), residual risk is **not high** within the meaning of Art. 35(7)/36 GDPR.
**No prior consultation with the supervisory authority is required.**

**Sign-off.** Approved by **Michel Kraeft, founder and controller, Inklee OÜ — 2026-08-03**,
following compliance review (founder-verified; this document's standing is recorded in
`counsel-handoff-2026-08-02.md` §5.0). Independent qualified review of this DPIA remains the
standing recommendation and is not superseded by this sign-off.

**Review interval.** Twelve months (next review by **2027-08-03**), or immediately upon any
scope change — explicitly: **any new image surface, any new category of non-user data
subjects, or any change to gallery hosting reopens this assessment.** Given this document's
own history of threefold scope growth, the scope-change trigger is the operative one.

---

## 9. What engineering will do once §§6-8 exist

Every mitigation implied by §4 is buildable and several are already scoped:

- Direct-upload attestation, at parity with the URL-import gate (counsel's Q15; counsel directed it
  be built *together with* this DPIA, not after it).
- Signed expiring URLs for gallery objects (counsel's Q18: before the capability is granted to
  anyone, not before a marketing push).
- The 90-day intake retention purge.
- A contact route for a depicted person, if §7 requires one.

None of these is blocked on engineering effort. They are blocked on the decisions in §§6-8.

---

## 10. Provenance

Sections 1-5 were prepared by engineering on 2026-08-02 from the audit register, the counsel
handoffs of 2026-08-02, and direct queries against the production database for the figures given.
The 25 booking objects, the zero intake submissions, and the never-granted gallery capability were
each verified rather than assumed.

Where a number could not be verified it is marked as such. Where a control's verification rests on
reading rather than execution, the audit register says so and this document does not upgrade it.
