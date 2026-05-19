---
title: Data Processing Agreement
version: "2026-05-19"
lastUpdated: "2026-05-19"
requiresAccept: true
---

This Data Processing Agreement ("**DPA**") forms part of the Inklee Terms of Service between Inklee OÜ ("**Processor**", "**Inklee**") and the Artist ("**Controller**", "**you**"). It governs Inklee’s processing of personal data on your behalf in connection with Client Booking Request Data.

#### 1. Subject matter and duration

The subject matter of the processing is the operation of Inklee’s booking-request workflow on behalf of the Artist. This DPA applies for as long as Inklee processes Client Booking Request Data for the Artist, and to any subsequent return or deletion of that data.

#### 2. Nature and purpose of processing

Receiving, storing, displaying, organising, and notifying with respect to Client Booking Request Data, and providing related features (status changes, magic-link portal, email notifications, calendar entries, optional payment integration), as described in Annex 1.

#### 3. Categories of data and data subjects

See Annex 1.

#### 4. Roles

The Artist is the controller of Client Booking Request Data. Inklee is the processor and acts only on the Artist’s documented instructions. By configuring and using the Service, the Artist instructs Inklee to process Client Booking Request Data as described in this DPA, in the Terms of Service, and in the Service’s settings.

#### 5. Inklee’s obligations as processor

Inklee will:

1. process Client Booking Request Data only on documented instructions from the Artist, unless required to do otherwise by EU or Member State law (in which case Inklee will, where legally permitted, notify the Artist);
2. ensure that personnel authorised to process the data are bound by confidentiality;
3. implement appropriate technical and organisational measures (see Annex 2);
4. respect the conditions on subprocessors in clause 6;
5. assist the Artist, taking into account the nature of the processing, in fulfilling its obligations to respond to data-subject requests;
6. assist the Artist with security, breach notification, data protection impact assessments, and prior consultations, taking into account the information available to Inklee;
7. notify the Artist without undue delay after becoming aware of a personal data breach affecting Client Booking Request Data;
8. at the choice of the Artist, delete or return all Client Booking Request Data at the end of the provision of services, and delete copies unless EU or Member State law requires storage;
9. make available to the Artist the information necessary to demonstrate compliance with this DPA and, where reasonable, allow for audits as described in clause 9.

#### 6. Subprocessors

The Artist provides Inklee with general authorisation to engage subprocessors. The current list of subprocessors is in Section 15 of this package and at `https://inklee.app/subprocessors`. Inklee will give the Artist reasonable prior notice (by email or in-app) of any intended changes concerning the addition or replacement of subprocessors, so the Artist has the opportunity to object on reasonable data-protection grounds. If the Artist objects and the parties cannot agree on a solution, the Artist may terminate the Service in accordance with the Terms of Service.

Inklee imposes on subprocessors data-protection obligations substantially equivalent to those in this DPA.

#### 7. International transfers

Where Inklee or any subprocessor transfers Client Booking Request Data outside the EU/EEA, the transfer relies on a valid mechanism under Chapter V of the GDPR, including, as applicable, an adequacy decision (such as the EU-US Data Privacy Framework where the relevant subprocessor is certified) or the Standard Contractual Clauses with appropriate supplementary measures.

#### 8. Data-subject requests, security incidents

Inklee will (a) forward to the Artist, without undue delay, any request received directly from a Client to exercise data-subject rights with respect to Client Booking Request Data, and (b) provide the Artist with the technical means to respond to such requests through the dashboard where reasonable.

In the event of a personal data breach affecting Client Booking Request Data, Inklee will notify the Artist without undue delay (and in any event within 72 hours of becoming aware) and provide the information reasonably required to enable the Artist to comply with its own notification obligations.

#### 9. Audits

Inklee will respond to reasonable written audit requests with documented information about its technical and organisational measures and subprocessors, including independent third-party reports where available. On-site audits are limited to one per calendar year, on at least 30 days’ written notice, during business hours, by an independent auditor reasonably acceptable to Inklee, subject to confidentiality, and at the Artist’s expense, except where required otherwise by Article 28 GDPR.

#### 10. Liability

Each party’s liability under this DPA is subject to the limitations in the Terms of Service. Nothing in this DPA excludes either party’s direct liability to data subjects or supervisory authorities under Article 82 GDPR.

#### 11. Termination and deletion

On termination, Inklee will delete Client Booking Request Data within 30 days, except for data Inklee is required to retain by law. The Artist may request earlier deletion in writing.

#### 12. Governing law

This DPA is governed by the laws of Estonia and incorporated into the Terms of Service.

---

#### Annex 1 — Processing details

- **Subject matter:** operation of Inklee’s booking-request workflow.
- **Duration:** until the Artist deletes their account or the Service is terminated, plus any retention period set out in the Terms or Privacy Policy.
- **Nature and purpose:** receive, store, organise, display, transmit, and notify with respect to Client Booking Request Data; provide magic-link client portal; send transactional emails on the Artist’s behalf; optionally trigger payment workflows via Stripe when enabled.
- **Types of personal data:** name and/or Instagram handle, email, tattoo idea description, body placement, size, references and links, uploaded images, preferred date or slot, magic-link token (hashed), status and audit metadata, communication history.
- **Categories of data subjects:** Clients submitting booking requests to the Artist.
- **Special categories:** none intentionally processed. Booking content may incidentally reveal information about health, religion, or other sensitive categories depending on what Clients choose to share. Both parties agree not to encourage submission of unnecessary sensitive data.

#### Annex 2 — Technical and organisational measures (TOMs)

Drafted on the basis of the current architecture (Vercel hosting, Supabase Postgres and Storage in the EU/Frankfurt region, Resend, Stripe, Plausible, Sentry, Upstash, Cloudflare).

- **Access control.** Role-based access; Supabase Row Level Security on every table; least-privilege admin access; multi-factor authentication required for Inklee personnel administrative access; production credentials managed via a secrets manager.
- **Authentication.** Hashed passwords or OAuth; magic-link tokens generated as 32-byte cryptographically random values, hashed (SHA-256) before storage, expiring after 30 days, with single-use semantics for edits.
- **Encryption.** TLS 1.2+ in transit; encryption at rest for the database and object storage provided by the underlying platform.
- **Network and application security.** HTTPS-only; CSP, HSTS, Referrer-Policy, X-Frame-Options security headers; rate limiting at the edge (Upstash); honeypot fields on public forms; input validation server-side; image upload size and type restrictions.
- **Logging and monitoring.** Audit log of state-changing actions; error monitoring via Sentry; review of security-relevant events.
- **Backups.** Managed backups by the database provider with a rolling retention window of 30 days.
- **Personnel.** Confidentiality obligations; access on a need-to-know basis.
- **Incident response.** Documented breach-notification procedure with notification to Artists without undue delay and within 72 hours of awareness for breaches affecting Client data.
- **Subprocessor management.** See Section 15 of this package.

#### Annex 3 — Approved subprocessors

See Section 15 of this package and `https://inklee.app/subprocessors`.
