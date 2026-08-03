# LO-5 — Data Protection Impact Assessment

**Article 35 GDPR assessment for image and studio-record processing**

| | |
|---|---|
| **Owner** | Michel Kraeft (founder, controller) — confirmed 2026-08-02 |
| **Target date** | **NOT SET — see §0** |
| **Status** | Draft. Sections 1-5 prepared by engineering from evidenced facts. Sections 6-8 require the controller's judgement and are NOT drafted. |
| **Release-gating** | Yes, by prior decision. Blocks the goods and gallery activation gates. |
| **Prepared** | 2026-08-02 |

---

## 0. What is and is not done

This document exists because counsel escalated its absence in three consecutive rounds. An owner
is now recorded. **A target date is not**, and counsel's requirement was owner *and* date.

Engineering has drafted what rests on facts: what data is processed, where it lives, what controls
already exist, and where the gaps are. Every factual claim here is traceable to a commit, a file,
or an entry in `docs/audit/findings.yaml`.

**Sections 6, 7 and 8 are deliberately empty.** They record controller decisions about acceptable
risk, and a DPIA whose risk acceptance was written by the engineer who built the system is not an
assessment. They need the owner named above.

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
| Gallery images | The person tattooed | Uploaded or URL-imported by the artist | Public `logos` bucket; private `gallery-archive` on downgrade | Relocated on entitlement lapse; no deletion horizon |
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

**NOT DRAFTED — controller judgement required.**

Must answer, per activity: is the processing necessary for the stated purpose, is the data
minimised, is the retention period justified, and is there a less intrusive way to achieve the
same outcome. The seeded dataset needs a written legitimate-interest balancing test.

## 7. Risk acceptance and mitigation decisions

**NOT DRAFTED — controller judgement required.**

For each risk in §4: mitigate, accept, or avoid. Where accepted, the reason and the residual level
must be recorded. Engineering can implement any mitigation chosen here; it cannot choose which
risks are acceptable.

## 8. Outcome and sign-off

**NOT DRAFTED.**

Records whether residual risk is acceptable, whether Art. 36 prior consultation with the
supervisory authority is required, the controller's signature and date, and the review interval.

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
