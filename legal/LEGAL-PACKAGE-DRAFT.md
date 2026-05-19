# Inklee Legal Text Package Draft

> **Status: First draft. Not legal advice.**
> This package is a structured first draft produced by an AI drafting assistant. It is intended to give a qualified lawyer (preferably Estonian counsel familiar with EU SaaS, GDPR, and digital services) a working starting point. Every section that says **"Legal review needed"** must be confirmed, corrected, or rewritten by counsel before Inklee relies on it publicly. Anything marked `[LIKE THIS]` is a placeholder that must be filled in with verified information before publication.

---

## 0. Assumptions and Missing Information

This package is drafted against the briefing provided. The following assumptions are baked into the drafts. Where they are wrong, the affected sections must be rewritten.

### 0.1 Assumed facts (verify or correct)

Confirmed by founder on 2026-05-19; remaining items marked as **Legal review needed**.

1. **Confirmed.** Operating entity is **Inklee OÜ**, an Estonian private limited company, registry code **17497625**, registered at **Pärnu mnt. 105, 11312 Tallinn, Estonia**. The company is **represented by Michel Kräft** as member of the management board.
2. The operating entity is established in the **European Union** and treats GDPR as the baseline data-protection regime.
3. **Confirmed.** Inklee is offered **globally in English with an EU focus**. Because the operator is established in the EU, EU consumer-protection and data-protection law applies as the baseline. UK GDPR may apply where UK users are present; this is addressed by the Privacy Policy.
4. **`inklee.app` is the canonical product domain.** `inkl.ee` is a permanent (HTTP 308) redirect surface — it does not serve content of its own. (Confirmed in `DECISIONS.md`, 2026-05-18.)
5. **Confirmed.** Stripe is treated as **live** for the purposes of these documents. Where any environment is still in Stripe test mode, that must be clearly indicated in the artist UI so it is not confused with live charging.
6. **No paid Inklee subscription is sold yet.** Solo Plus and Studio pricing are future plans, not live products.
7. **No studio multi-tenancy exists yet.** Studio Terms are written as a future placeholder only.
8. There is **no separate Meta Pixel / advertising tracker live** at the time of drafting. The Cookie Policy reflects this.
9. The **artist** is treated as the **controller** of client booking-request data; **Inklee acts as processor** for that data and as **controller** for everything required to operate the platform (artist accounts, billing, security logs, analytics, support).
10. The platform may publish public artist pages and accept third-party content (booking request descriptions, images, references). EU **Digital Services Act (DSA)** obligations for online platforms / hosting services are therefore in scope. **Legal review needed.**
11. **Confirmed.** Inklee OÜ is **not currently registered for VAT**. Estonian VAT registration becomes mandatory once annual taxable turnover exceeds the threshold in §19 of the Estonian Value Added Tax Act (currently EUR 40,000). The imprint and any future invoicing flows must be updated when registration occurs.
12. **Confirmed.** The product is **live (not beta)** for legal-text purposes. References to "beta" should be removed from the live `/terms` page.
13. **Confirmed live subprocessors:** Supabase (EU/Frankfurt), Vercel (EU region), Resend, Stripe (live), Plausible, Sentry, Upstash, Cloudflare, Google (OAuth). The Subprocessor List in Section 15 reflects this.

### 0.2 Placeholders to fill before publication

Status after 2026-05-19 founder review. Items marked **resolved** have been filled in throughout the draft.

| Field                           | Resolved value                                                                                                                                     | Status                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Legal company name              | Inklee OÜ                                                                                                                                          | **Resolved**                                                              |
| Estonian registry code          | 17497625                                                                                                                                           | **Resolved**                                                              |
| VAT status                      | Not VAT-registered; threshold language used                                                                                                        | **Resolved**                                                              |
| Registered address              | Pärnu mnt. 105, 11312 Tallinn, Estonia                                                                                                             | **Resolved**                                                              |
| Management board representative | Michel Kräft, member of the management board                                                                                                       | **Resolved**                                                              |
| Legal contact email             | `support@inklee.app`                                                                                                                               | **Resolved** — consider adding `legal@inklee.app` alias later for routing |
| Support email                   | `support@inklee.app`                                                                                                                               | **Resolved**                                                              |
| Privacy contact email           | `support@inklee.app`                                                                                                                               | **Resolved** — consider adding `privacy@inklee.app` alias later           |
| Data Protection Officer         | Not appointed; Inklee considers itself below GDPR Art. 37 thresholds                                                                               | Open — confirm with counsel                                               |
| Governing law                   | Estonia                                                                                                                                            | **Resolved** (default locked)                                             |
| Court venue                     | Harju County Court, Tallinn                                                                                                                        | **Resolved** (default locked)                                             |
| Retention periods               | Defaults retained: 30 days for deleted accounts and rejected bookings; 24 months for audit logs; 90 days for monitoring; 30-day backup window      | Default — confirm at counsel review                                       |
| Subprocessors                   | Confirmed live: Supabase (EU/Frankfurt), Vercel (EU), Resend, Stripe (live), Plausible, Sentry, Upstash, Cloudflare, Google OAuth. See Section 15. | **Resolved**                                                              |
| "Last updated" date             | Set to `2026-05-19` for first published version once counsel signs off                                                                             | Open until counsel sign-off                                               |

### 0.3 What is intentionally not in scope of this draft

- Pricing pages, marketing copy, sales emails.
- Country-specific consumer-rights disclosures beyond an EU baseline (e.g. UK CMA, Swiss FADP, California CCPA, Brazilian LGPD). If Inklee actively targets users in those regions, **Legal review needed** to add the specific disclosures.
- Trademark, employment, and corporate documents.
- Anything tied to a payment processor other than Stripe in test mode.

---

## 1. Legal Architecture Summary

A short, plain-English overview to keep the package internally consistent.

### 1.1 Who does what

| Role                   | Who                                             | What they do                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inklee operator**    | Inklee OÜ                                       | Runs the Inklee web app and public artist pages, manages artist accounts, processes payments via Stripe when enabled, hosts content uploaded through the platform.            |
| **Artist**             | The freelance tattoo artist signed up to Inklee | Receives, reviews, and decides on booking requests. Sets their own deposit, cancellation, refund, aftercare, and tattoo-service policies. Provides the tattoo service itself. |
| **Client / requester** | The end user submitting a booking request       | Submits a request through a public artist page. Their relationship for the tattoo itself is with the artist, not Inklee.                                                      |

### 1.2 Controller / processor matrix

| Data                                                                                                                                       | Controller                                                                                                                                           | Processor                                        | Notes                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artist account data (name, email, login credentials, profile, settings)                                                                    | **Inklee**                                                                                                                                           | Supabase (auth)                                  | Inklee determines purposes (run the platform, secure accounts, etc.)                                                                                                                                                      |
| Client booking request data (name, contact, description, references, images, preferred date, status) submitted via an artist’s public page | **Artist**                                                                                                                                           | **Inklee** + downstream subprocessors            | Inklee processes this data on the artist’s instructions through the booking workflow. **Legal review needed** to confirm the strict-processor framing is sustainable, especially around security logs and abuse handling. |
| Magic-link tokens for clients                                                                                                              | **Inklee** (security control) and **Artist** (purpose)                                                                                               | Inklee (technical)                               | Documented as a shared/processor responsibility; ambiguity flagged.                                                                                                                                                       |
| Website analytics (Plausible) on `inklee.app`                                                                                              | **Inklee**                                                                                                                                           | Plausible                                        | Cookieless; aggregated.                                                                                                                                                                                                   |
| Error / security monitoring (Sentry)                                                                                                       | **Inklee**                                                                                                                                           | Sentry                                           | May incidentally include data from booking flow; flagged in DPA.                                                                                                                                                          |
| Email delivery (Resend)                                                                                                                    | **Inklee** (transactional account emails) and **Artist** (booking workflow emails)                                                                   | Resend                                           | Inklee acts as processor for artist-triggered emails.                                                                                                                                                                     |
| Payment / deposit data (if/when live)                                                                                                      | **Stripe** is controller of payment-card data; **Inklee** stores limited metadata as controller; **Artist** decides commercial terms with the client | Stripe (as independent controller for card data) | **Legal review needed** to map Stripe’s controller/processor positioning to Inklee’s tier model when live billing is enabled.                                                                                             |
| Support messages from artists                                                                                                              | **Inklee**                                                                                                                                           | Email provider                                   |                                                                                                                                                                                                                           |

### 1.3 Main legal risk areas

1. **Sensitive data drift.** Booking requests can include body placement, photos, and free-text descriptions. None of this is intentionally collected as special-category data under Article 9 GDPR, but clients may volunteer health, religious, or identifying information. The platform should not solicit such data, but artists and clients can submit it. **Legal review needed.**
2. **Minors.** Tattoo legality varies by jurisdiction. Inklee does not verify ages. The Acceptable Use Policy and Public Booking Page Notice place this responsibility on the artist.
3. **Consumer law on subscriptions.** When Solo Plus / Studio go live, EU Consumer Rights Directive obligations (pre-contractual info, withdrawal rights for digital services, cancellation flows) will apply unless the customer qualifies as a business. The current draft treats this as future-only.
4. **DSA (Regulation (EU) 2022/2065) for hosting services.** Inklee hosts content provided by artists (profile, public page) and by clients (booking requests). Notice-and-action, statement-of-reasons, and contact-point obligations may apply, scaled to micro-enterprise status if applicable. **Legal review needed.**
5. **Controller / processor framing.** If artists are not, in practice, exercising controller-level decisions over client data (e.g. determining retention), regulators could re-characterise Inklee as a joint controller. **Legal review needed.**
6. **Liability cap enforceability.** EU consumer law restricts limitations of liability against consumers. The drafted cap applies to artist users; consumer-facing language is softer.
7. **International transfers.** Subprocessors include US-based vendors (Stripe, possibly Sentry, possibly Resend depending on region). EU-US Data Privacy Framework and Standard Contractual Clauses positioning must be verified.

---

## 2. Imprint / Legal Notice

> **Where this lives:** `https://inklee.app/imprint` (or `/legal/imprint`); linked from the footer of every page; also linked from the dashboard footer.

### Imprint

**Operator of this website and service**
Inklee OÜ
Pärnu mnt. 105
11312 Tallinn
Estonia

**Commercial register entry**
Registered with the Estonian Commercial Register
Registry code: 17497625

**VAT status**
Inklee OÜ is not currently registered for value added tax. Estonian VAT registration becomes mandatory once annual taxable turnover exceeds the threshold set out in §19 of the Estonian Value Added Tax Act (currently EUR 40,000). This notice will be updated when our VAT status changes.

**Represented by**
Michel Kräft, member of the management board

**Contact**
Email: support@inklee.app
Website: https://inklee.app

**EU Digital Services Act — single point of contact**
Pursuant to Articles 11 and 12 of Regulation (EU) 2022/2065 (Digital Services Act), authorities and recipients of the service may contact us at `support@inklee.app`. Communication is accepted in English and Estonian.

**Responsibility for content**
Inklee OÜ is responsible for the content published on `inklee.app` and on public artist pages hosted on the same domain, except for content submitted by artists and clients (such as artist profile content, booking request descriptions, and uploaded images), which is the responsibility of the person who submitted it. We act expeditiously to remove unlawful content once we are aware of it.

**External links**
Where this website or service links to third-party websites, we have no control over the content of those sites and accept no responsibility for it.

**EU online dispute resolution**
The European Commission provides a platform for online dispute resolution at `https://ec.europa.eu/consumers/odr`. We are not obliged to and do not currently participate in dispute resolution proceedings before a consumer arbitration board.

> **Legal review needed:** confirm Estonian-specific imprint requirements (e.g. Information Society Services Act §4), DSA single point of contact disclosure (Article 11 / 12) once status is determined, and whether VAT line is required.

---

## 3. Terms of Service

> **Where this lives:** `https://inklee.app/terms`; linked from the signup checkbox, footer, dashboard footer.

### Inklee Terms of Service

**Last updated:** `[DATE]`

These Terms govern your use of Inklee. By creating an account or using the service, you agree to them. Please read them carefully.

#### 1. Who we are

Inklee is operated by Inklee OÜ, registered in Estonia under code 17497625, with its registered address at Pärnu mnt. 105, 11312 Tallinn, Estonia ("**Inklee**", "**we**", "**us**"). You can reach us at support@inklee.app.

#### 2. What Inklee is

Inklee is a software tool that helps freelance and traveling tattoo artists receive and organise booking requests. Inklee provides the technical workflow. **Inklee does not provide tattoo services, does not act as a marketplace, and is not a party to any agreement between you and your clients.**

#### 3. Definitions

- "**Service**" means the Inklee web application at `inklee.app`, the public artist pages it hosts, and any related features.
- "**Artist**", "**you**" means the user who creates an account to receive booking requests.
- "**Client**" means the person who submits a booking request to an Artist through the Service.
- "**Booking Request Data**" means data submitted by a Client to an Artist through the Service.

#### 4. Eligibility

To use Inklee as an Artist, you must:

- be at least 18 years old (or the age of majority in your jurisdiction, whichever is higher);
- have the legal right to operate a tattoo business in your jurisdiction; and
- agree to these Terms and the linked Acceptable Use Policy and Privacy Policy.

#### 5. Account registration

You are responsible for keeping your login credentials confidential and for all activity under your account. Sign-in is provided by our authentication provider; you may also sign in using a third-party identity provider (e.g. Google) where supported.

#### 6. Your responsibility as an Artist

You alone are responsible for:

- the content of your public artist page, including text, images, and your Instagram handle;
- the tattoo services you offer and provide, including pricing, quality, safety, hygiene, and aftercare;
- your own booking, deposit, cancellation, rescheduling, no-show, and refund policies;
- communicating with your Clients;
- compliance with all laws applicable to your business, including consumer-protection, tax, health-and-safety, anti-discrimination, age-of-consent, and licensing rules;
- verifying any Client information you need (including age) where the law requires it; and
- the lawful processing of any Client data you collect through Inklee.

Inklee is a tool. We do not verify Artists, do not verify Clients, do not guarantee bookings, revenue, attendance, or that a Client will pay a deposit, and we do not decide whether a deposit is refundable.

#### 7. Public artist pages and Client requests

When you publish a public artist page, the Service lets Clients submit booking requests to you. Submissions are not contracts. You decide whether to accept, reject, or cancel any request. Inklee passes the request to you and, where you have configured the relevant features, sends notifications and provides a magic-link portal for the Client.

#### 8. Acceptable use

Your use of Inklee is also subject to our Acceptable Use Policy. You must not use Inklee to violate any law, infringe rights, harass anyone, distribute malware, scrape, reverse-engineer, attempt to access other Artists’ data, or impersonate another person or business.

#### 9. Content you upload

You retain ownership of the content you upload. You grant Inklee a worldwide, non-exclusive, royalty-free licence to host, store, transmit, display, and process that content **solely to operate the Service for you** (for example: showing your profile on your public page, displaying Client images in your dashboard, sending notifications). This licence ends when the content is deleted, except where retention is required by law or by ongoing technical operations such as backups.

You are responsible for ensuring that the content you upload, and any Client data submitted through your page, can lawfully be processed by Inklee on your behalf.

#### 10. Free plan

The Service is currently offered free of charge under a "Free Starter" plan. We do not promise that the Free plan will remain free indefinitely, although we will give reasonable notice (at least 30 days) before introducing charges for features that are currently free, or before discontinuing the Free plan in a way that would prevent you from continuing to use the core functionality you rely on.

#### 11. Future paid plans

We may introduce paid plans (for example, Solo Plus or Studio) in the future. Paid plans will only become binding on you if you actively subscribe to them, and pricing and terms will be presented to you before purchase. The Subscription Terms section of this document is a placeholder; it does not currently apply to any active plan.

#### 12. Deposits and payments

Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features. Deposits are between you and your Clients. Inklee is not the merchant of record for tattoo services; we are not responsible for refunds, chargebacks, or the enforceability of your deposit policy. Where payment processing through a third-party provider (e.g. Stripe) is enabled, that provider’s terms also apply.

#### 13. Availability and changes

We aim to keep Inklee available and working, but we do not guarantee uninterrupted service. We may modify, add, or remove features. Where a change materially reduces the functionality you rely on, we will give you reasonable advance notice.

#### 14. Suspension and termination

You may delete your account at any time from your settings or by writing to support@inklee.app. We may suspend or terminate your account if you materially breach these Terms, our Acceptable Use Policy, or applicable law, or if continued service creates a legal, security, or reputational risk to Inklee or third parties. We will give you reasonable notice where possible.

On termination, your access ends. We will delete or anonymise account data in line with our Privacy Policy, except where retention is required by law.

#### 15. Disclaimers

The Service is provided "as is" and "as available". To the maximum extent permitted by law, Inklee makes no warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be error-free, that it will meet your specific business needs, that bookings will result, that Clients will turn up or pay deposits, or that any legal policies you publish through Inklee are enforceable.

#### 16. Limitation of liability

To the maximum extent permitted by law:

- Inklee is not liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, goodwill, data, or business;
- our total aggregate liability arising out of or relating to your use of the Service, whether in contract, tort, or otherwise, is limited to the greater of (a) the amounts you have paid Inklee in the twelve months before the event giving rise to the claim, or (b) one hundred euros (EUR 100);
- nothing in these Terms limits liability that cannot be limited under applicable law, including liability for death, personal injury caused by negligence, fraud, or wilful misconduct.

> **Legal review needed:** liability caps must be checked against Estonian Law of Obligations Act and EU consumer-protection law. The cap above is drafted for B2B / artist users and may not be enforceable against consumer end users.

#### 17. Indemnity

You agree to indemnify and hold Inklee harmless from claims, damages, and expenses (including reasonable legal fees) arising from (i) your use of the Service in violation of these Terms or the law, (ii) the tattoo services you provide or offer, (iii) content you or your Clients submit through your page, and (iv) any breach of your obligations as data controller for Client data.

#### 18. Governing law and jurisdiction

These Terms are governed by the laws of Estonia, without regard to conflict-of-law rules. Disputes will be submitted to the exclusive jurisdiction of the Harju County Court in Tallinn, Estonia, except that consumers benefit from the mandatory protections of the law of their habitual residence.

#### 19. Changes to these Terms

We may update these Terms. Material changes will be notified to you by email or in-app at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.

#### 20. Contact

support@inklee.app

> **Legal review needed:** B2B vs. consumer classification of Artists. Some Artists are sole traders who, depending on jurisdiction, may be treated as consumers in their contractual relationship with Inklee.

---

## 4. Privacy Policy

> **Where this lives:** `https://inklee.app/privacy`; linked from the signup form, footer, dashboard footer, public booking page, and cookie banner.

### Inklee Privacy Policy

**Last updated:** `[DATE]`

This policy explains what data we collect about you, why we collect it, and what your rights are. It applies to the Inklee website, the Inklee web app, public artist pages hosted by Inklee, and the booking-request workflow.

#### 1. Who is responsible

The data controller is Inklee OÜ, Pärnu mnt. 105, 11312 Tallinn, Estonia, registry code 17497625, represented by Michel Kräft.

Privacy contact: support@inklee.app
Data protection: a Data Protection Officer is not currently appointed because Inklee considers itself below the mandatory-DPO thresholds in Article 37 GDPR. Counsel review pending. Use the privacy contact above for any data-protection request.

This policy applies under the EU/EEA GDPR (Regulation (EU) 2016/679). Where users in the United Kingdom are concerned, the equivalent rights under the UK GDPR and the UK Data Protection Act 2018 apply, and the UK Information Commissioner’s Office is the competent supervisory authority. Inklee currently has an EU focus but does not geo-restrict access; we apply GDPR-level protections to all users.

#### 2. Different roles for different data

Inklee handles two main streams of personal data, with different responsibilities for each:

- **As controller**, we decide how to process: artist account data, billing data (if and when paid plans go live), website analytics, error and security logs, support communications, and any data we need to run and protect the platform.
- **As processor for the Artist**, we handle **Client Booking Request Data** on behalf of the Artist who receives the request. The Artist is the controller of that data. Our Data Processing Agreement (Section 5 of this package) governs that relationship.

If you submit a booking request through an Artist’s public page, the Artist is your primary controller for that submission. Inklee processes the data so that the Artist can review and respond, and to operate the technical service.

#### 3. What we collect and why

##### 3.1 Artist account data

| Data                                                                     | Purpose                                    | Legal basis (GDPR)                  |
| ------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------- |
| Name, email, password / OAuth identifier                                 | Account creation, login, security          | Contract (Art. 6(1)(b))             |
| Display name, Instagram handle, bio, location, timezone, logo            | Public artist page; service operation      | Contract (Art. 6(1)(b))             |
| Booking settings, email template content, calendar configuration         | Service operation                          | Contract (Art. 6(1)(b))             |
| Stripe Connect / billing identifiers (when payment features are enabled) | Payment processing for deposits            | Contract (Art. 6(1)(b))             |
| IP address, device, browser metadata, audit log of account actions       | Security, abuse prevention, accountability | Legitimate interests (Art. 6(1)(f)) |
| Support messages                                                         | Responding to support requests             | Legitimate interests / Contract     |

##### 3.2 Client booking request data (processed on behalf of the Artist)

| Data                                                                         | Purpose                                                             | Legal basis (GDPR)                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| Name and/or Instagram handle, email                                          | Identify the requester to the Artist                                | Controller (Artist) — contract / legitimate interests |
| Tattoo idea, placement (body area), size, references, links, uploaded images | Allow the Artist to assess the request                              | Controller (Artist) — contract / legitimate interests |
| Preferred date or slot selection                                             | Scheduling                                                          | Controller (Artist) — contract                        |
| Magic-link access token (hashed)                                             | Allow the Client to edit (before approval) and cancel their request | Controller (Artist) — contract                        |
| Status, audit log entries, communication history                             | Operating the booking workflow                                      | Controller (Artist) — contract / legitimate interests |

Body-placement information and uploaded images may, depending on what the Client chooses to share, reveal health information or other sensitive context. We do not solicit special-category data within the meaning of Article 9 GDPR. We ask Artists and Clients not to submit information that is not necessary for the tattoo request.

##### 3.3 Website data

| Data                                               | Purpose                                  | Legal basis (GDPR)                      |
| -------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| Aggregated, cookie-free analytics (e.g. Plausible) | Understand traffic, improve the site     | Legitimate interests (Art. 6(1)(f))     |
| Error and performance monitoring (e.g. Sentry)     | Detect and fix bugs, protect the service | Legitimate interests (Art. 6(1)(f))     |
| Strictly necessary cookies (session, auth, CSRF)   | Run the service securely                 | Necessary for the service you requested |

#### 4. How long we keep data

| Data                    | Retention                                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artist account data     | While your account is active, plus `[RETENTION — default: 30 days]` after deletion.                                                                                                                                                                                                             |
| Client booking requests | Controlled by the Artist. Default platform behaviour: rejected requests are deleted (including uploaded images) after `[RETENTION — default: 30 days]` via a scheduled job; approved and cancelled bookings are retained while the Artist’s account is active or until the Artist deletes them. |
| Audit logs              | `[RETENTION — default: 24 months]`, longer if required for security or legal reasons.                                                                                                                                                                                                           |
| Email delivery logs     | As required by the email provider (Resend) for deliverability and abuse handling.                                                                                                                                                                                                               |
| Error / monitoring data | `[RETENTION — default: 90 days]`.                                                                                                                                                                                                                                                               |
| Backups                 | Rolling backup window of `[RETENTION — default: 30 days]`.                                                                                                                                                                                                                                      |

> **Legal review needed:** confirm whether tax / accounting law (Estonian Accounting Act, EU VAT rules) requires longer retention for invoices once paid plans go live.

#### 5. Who we share data with (subprocessors)

We use the providers listed in Section 15 of this package. We only share what is needed to operate the Service. Where these providers process Client Booking Request Data, they do so as sub-processors under the Data Processing Agreement.

#### 6. International transfers

Some subprocessors may be established outside the EU/EEA. Where this happens, transfers rely on (a) European Commission adequacy decisions where available (e.g. the EU-US Data Privacy Framework, where the provider is certified), (b) Standard Contractual Clauses, and (c) additional safeguards where appropriate. We will update Section 15 once final subprocessors and certifications are confirmed.

#### 7. Your rights

If you are in the EU/EEA or another GDPR-equivalent jurisdiction, you have the right to:

- access your data;
- correct inaccurate data;
- have your data deleted ("right to be forgotten"), subject to legal retention requirements;
- restrict or object to certain processing;
- receive your data in a portable format;
- withdraw consent where processing is based on consent; and
- complain to a supervisory authority. In Estonia: Andmekaitse Inspektsioon (`https://www.aki.ee`).

To exercise your rights, email support@inklee.app. If you are a Client whose data is held in connection with an Artist’s booking workflow, please contact the Artist directly; we will help the Artist respond.

#### 8. Security

We use industry-standard safeguards, described in Section 12. No system is 100% secure; we cannot guarantee absolute security.

#### 9. Children

Inklee is not directed at children. Artists are responsible for verifying age in line with their local law before tattooing a minor; we strongly discourage submission of booking requests on behalf of minors, and we do not knowingly collect data from children under 16. If you believe we hold data about a child, contact support@inklee.app.

> **Legal review needed:** confirm the appropriate age threshold (GDPR allows Member States to set 13–16) and add any country-specific tattoo-age restrictions where Inklee operates in volume.

#### 10. Cookies

See our Cookie Policy (Section 6 of this package).

#### 11. Changes

We may update this policy. Material changes will be notified by email or in-app at least 14 days before they take effect.

#### 12. Contact

support@inklee.app

---

## 5. Data Processing Agreement

> **Where this lives:** `https://inklee.app/dpa`; incorporated by reference into the Terms of Service for every Artist. A click-to-accept version is shown on signup and made available as a downloadable PDF in account settings.

### Data Processing Agreement between Inklee and Artist

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

On termination, Inklee will delete Client Booking Request Data within `[RETENTION — default: 30 days]`, except for data Inklee is required to retain by law. The Artist may request earlier deletion in writing.

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
- **Authentication.** Hashed passwords or OAuth; magic-link tokens generated as 32-byte cryptographically random values, hashed (SHA-256) before storage, expiring after `[RETENTION — default: 30 days]`, with single-use semantics for edits.
- **Encryption.** TLS 1.2+ in transit; encryption at rest for the database and object storage provided by the underlying platform.
- **Network and application security.** HTTPS-only; CSP, HSTS, Referrer-Policy, X-Frame-Options security headers; rate limiting at the edge (Upstash); honeypot fields on public forms; input validation server-side; image upload size and type restrictions.
- **Logging and monitoring.** Audit log of state-changing actions; error monitoring via Sentry; review of security-relevant events.
- **Backups.** Managed backups by the database provider with a rolling retention window of `[RETENTION — default: 30 days]`.
- **Personnel.** Confidentiality obligations; access on a need-to-know basis.
- **Incident response.** Documented breach-notification procedure with notification to Artists without undue delay and within 72 hours of awareness for breaches affecting Client data.
- **Subprocessor management.** See Section 15 of this package.

#### Annex 3 — Approved subprocessors

See Section 15 of this package and `https://inklee.app/subprocessors`.

> **Legal review needed:** verify TOMs against ENISA / EDPB guidance and Estonian DPA expectations; confirm whether on-site audit clause is acceptable for SaaS scale; consider attaching SCCs as Annex 4 once US-based subprocessor transfers are finalised.

---

## 6. Cookie Policy

> **Where this lives:** `https://inklee.app/cookies`; linked from the cookie disclosure banner and the footer.

### Cookie Policy

**Last updated:** `[DATE]`

This policy explains how Inklee uses cookies and similar storage technologies on `inklee.app` and on public artist pages hosted on the same domain.

#### 1. What cookies we use

| Category                       | Examples                               | Purpose                                          | Consent required                                                                  |
| ------------------------------ | -------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Strictly necessary             | Supabase session and CSRF cookies      | Keep you signed in, secure forms, route requests | No (necessary for the service you requested)                                      |
| Performance / error monitoring | Sentry session identifier (if enabled) | Detect and fix errors                            | No (treated as strictly necessary for service operation; subject to legal review) |
| Analytics                      | Plausible (cookieless)                 | Aggregated traffic analytics, no cookies set     | No                                                                                |
| Marketing                      | None at this time                      | —                                                | —                                                                                 |

#### 2. Plausible Analytics

We use Plausible Analytics, which is configured not to set cookies and not to track individuals across sites. Plausible processes data on EU infrastructure.

#### 3. Marketing / tracking pixels

Inklee does not currently use Meta Pixel, Google Ads, LinkedIn Insight Tag, or other third-party marketing tracking. If we add such tools, we will update this policy and ask for your consent before they load.

#### 4. Managing cookies

You can clear and block cookies through your browser. Note that disabling strictly necessary cookies will prevent you from signing in.

#### 5. Changes

We will update this policy if we change the set of cookies in use. Material changes will be reflected in a re-prompt of the cookie banner where required.

> **Legal review needed:** confirm whether Sentry usage requires consent under the ePrivacy Directive as implemented in each Member State, and confirm scope of any cookie banner needed.

---

## 7. Acceptable Use Policy

> **Where this lives:** `https://inklee.app/acceptable-use`; linked from the Terms of Service and the signup checkbox.

### Acceptable Use Policy

**Last updated:** `[DATE]`

This policy applies to everyone who uses Inklee, including Artists and Clients. By using Inklee, you agree not to do, attempt, or enable any of the following.

#### 1. Illegal or harmful content and conduct

- Submit, upload, or transmit content that is unlawful, infringing, defamatory, threatening, harassing, hateful, or that promotes violence, terrorism, or discrimination.
- Submit content that sexualises minors, or that solicits, offers, or depicts tattoo work that is illegal in the relevant jurisdiction.
- Use Inklee to facilitate fraud, money laundering, identity theft, or other illegal activity.

#### 2. Intellectual property and impersonation

- Upload material you do not own or have permission to use, or content that infringes copyright, trademark, design, or moral rights.
- Impersonate another person, business, artist, or studio, or misrepresent your affiliation with one.

#### 3. Platform integrity

- Reverse-engineer, decompile, or attempt to extract source code, except where allowed by law.
- Scrape or harvest data from Inklee, or use automation to interact with the Service except for normal browser/use of the Service.
- Probe, attack, or attempt to bypass security controls, or use Inklee in a way that could damage, overload, or impair the Service.
- Use the booking forms to send spam, phishing, or unsolicited commercial messages.
- Submit booking requests that you do not genuinely intend to follow up on, including for the purpose of harassing an Artist.

#### 4. Tattoo-specific responsibilities (Artists)

- You must operate a lawful tattoo business and comply with all applicable health-and-safety, age-of-consent, hygiene, licensing, and consumer-protection rules in every jurisdiction where you take bookings.
- You must not use Inklee to promote tattoo services that are unlawful in the relevant jurisdiction.
- You are responsible for confirming the age of your Clients before any tattoo work; Inklee does not verify ages.
- You are responsible for medical, allergy, and aftercare conversations with your Clients.

#### 5. Enforcement

If we believe you have breached this policy, we may suspend or terminate your access, remove offending content, and (where required) report to authorities. We aim to give notice where possible, but reserve the right to act without notice for serious or urgent breaches.

#### 6. Reporting abuse

Email support@inklee.app to report a violation. For copyright complaints, please include the work you claim has been infringed and the URL of the allegedly infringing content.

> **Legal review needed:** confirm DSA notice-and-action requirements and add a structured trusted-flagger / notice mechanism if Inklee falls within the DSA hosting-service definition.

---

## 8. Public Booking Page Client Notice

> **Where this lives:** at the bottom of every public artist page (`/[slug]`) and on the booking-submission confirmation page. Also included in the confirmation email sent to the Client.

### Notice for people submitting a booking request through Inklee

When you submit this form, the request is sent to the tattoo artist whose page you are on. Please read the short notes below before submitting.

#### 1. What this form does

- The form is provided by Inklee, a technical service used by the artist to receive booking requests.
- Submitting the form is **not** a confirmed booking. The artist decides whether to accept, decline, propose changes, or cancel.

#### 2. Who provides the tattoo service

- The tattoo service itself is provided by the artist, not by Inklee.
- The artist sets their own pricing, deposits, cancellation, rescheduling, refund, aftercare, age-verification, and health-and-safety policies. Inklee does not set or enforce those policies.
- Please contact the artist directly with any questions about the tattoo, the appointment, or any deposit they may ask for.

#### 3. What happens to your information

- The artist receives the information you submit and uses it to review your request.
- Inklee processes that information on the artist’s behalf so that the artist can read, respond to, and manage your request through the Service. This is described in our Privacy Policy.
- You will receive a confirmation email from Inklee. It contains a link you can use to update your request before the artist has approved it, and to cancel your request at any time.
- Please do not submit information that is not needed for the request — in particular sensitive personal information (e.g. detailed medical history) that the artist has not asked for.

#### 4. Deposits and payments

- Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.
- Any deposit you may be asked to pay is between you and the artist. Inklee is not the seller of the tattoo service and does not decide whether a deposit is refundable.

#### 5. Who to contact

- Questions about your appointment, tattoo, or deposit → contact the artist.
- Questions about the platform, privacy, or security → contact Inklee at support@inklee.app.

---

## 9. Deposit and Payment Terms

> **Where this lives:** displayed in artist deposit settings, in the public booking page footer where deposits are enabled, and linked from the Terms of Service.

### Deposit and Payment Terms

Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.

#### 1. Scope

These terms describe how Inklee’s deposit features work when they are enabled. They do not create any obligation to use deposit features.

#### 2. What Inklee does

- Provides a workflow in which an artist can request a deposit from a client as part of approving a booking request.
- Routes payments through a third-party payment provider (currently Stripe) when configured.
- Reflects the status of the deposit in the artist’s dashboard.

#### 3. What Inklee does not do

- Inklee does not act as a payment institution, e-money issuer, or merchant of record for the tattoo service.
- Inklee does not decide whether a deposit is refundable, in what circumstances it is forfeited, or how it is offset against the tattoo price.
- Inklee does not guarantee that requiring a deposit will prevent no-shows, late cancellations, or chargebacks.
- Inklee does not provide tax, accounting, or legal advice on deposits, refunds, or VAT treatment.

#### 4. Artist responsibilities

- Set, publish, and explain your deposit policy (amount, refundability, cancellation rules) to clients in advance.
- Comply with all consumer-protection, tax, invoicing, and payment-services rules applicable in your jurisdiction.
- Honour applicable consumer-withdrawal rights where they apply (e.g. EU Consumer Rights Directive distance contracts) and refund where required by law.
- Keep your Stripe account in good standing and comply with Stripe’s applicable agreements.

#### 5. Test mode vs. live mode

Stripe distinguishes between **test mode** and **live mode**. In test mode, no real money moves; transactions are simulated. Do not present test-mode flows to clients as real payments. Inklee’s deposit features may operate in test mode for some accounts or environments.

#### 6. Availability

Deposit features may not be available in all regions, for all currencies, or for all account configurations. We may add, change, or remove deposit features.

#### 7. Disputes and chargebacks

Disputes about a deposit are primarily between the artist and the client. Stripe’s rules govern chargebacks. Inklee may provide information to support either party where it is technically able to do so, but cannot decide the outcome.

> **Legal review needed:** payment-services law (PSD2 / PSD3), e-money licensing, and the merchant-of-record analysis for the planned deposit flow. The current draft assumes Inklee is not a payment institution.

---

## 10. Subscription Terms Placeholder

> **Status: NOT ACTIVE.**
> No paid Inklee plan is currently sold. This section is a future-ready placeholder. When Solo Plus or Studio are launched, this section must be reviewed and adapted to the final pricing, billing flow, taxes, and consumer-rights regime, and then incorporated into the Terms of Service.

### Future Subscription Terms (placeholder, not in force)

These Subscription Terms will apply when a Customer subscribes to a paid Inklee plan. Until activated, they have no effect.

#### 1. Plans and pricing

We may offer plans such as Solo Plus and Studio. Pricing, features, and billing intervals will be displayed before purchase. Founder pricing or early-access discounts, if offered, will be clearly identified, including their renewal price.

#### 2. Term and renewal

Subscriptions renew automatically at the end of each billing period (monthly or annually) at the then-current price until cancelled. We will send a reminder before the first paid renewal where required by law.

#### 3. Cancellation

You may cancel your subscription at any time from your account settings. Cancellation takes effect at the end of the current paid period. We do not pro-rate refunds for partial periods unless required by law.

#### 4. Taxes and invoicing

Prices are exclusive of VAT and other applicable taxes unless stated otherwise. We will issue invoices in accordance with applicable law. If you are a business Customer, you must provide accurate VAT details before purchase.

#### 5. Consumer withdrawal rights (EU)

If you qualify as a consumer in the EU/EEA, you may have a statutory right to withdraw from a digital-services contract within 14 days of entering into it. By starting to use the paid features during the withdrawal period, you may expressly request immediate performance and acknowledge that, where allowed by law, your right to withdraw is lost once performance is complete. The exact wording for this consent flow will be confirmed by counsel.

> **Legal review needed:** confirm EU Consumer Rights Directive (Directive 2011/83/EU as amended) wording for digital-services contracts, including pre-contractual information and the withdrawal model form.

#### 6. Price changes

We may change subscription prices. Changes will not apply to the current paid period and will be notified at least 30 days in advance.

#### 7. Refunds

Refunds are not generally available, except where required by law or expressly granted by us in writing.

#### 8. Business vs. consumer

Subscriptions are intended for use in connection with an artist’s independent business activity. Where you qualify as a consumer, mandatory consumer-protection rules of your habitual residence apply.

> **Legal review needed:** B2B / consumer classification, mandatory disclosures (e.g. order-button labelling under Article 8(2) Consumer Rights Directive), refund / withdrawal model, and tax-residency-based pricing.

---

## 11. Studio Terms Placeholder

> **Status: NOT ACTIVE.**
> Studio (multi-artist) functionality is not live. This section is a placeholder that must be revisited before any Studio account is opened.

### Future Studio Terms (placeholder, not in force)

#### 1. Studio account

A Studio account is intended to allow a tattoo studio to manage multiple artists in one workspace. The Studio account holder ("**Studio Admin**") is the contracting party with Inklee for the Studio plan.

#### 2. Artists within a Studio

Artists who join a Studio do so as users invited by the Studio Admin. Each artist remains responsible for their own tattoo services and client relationships. Studios may set policies and routing rules within their workspace, but Inklee does not become party to any agreement between the Studio and its artists.

#### 3. Permissions and routing

The Studio Admin controls user permissions, request routing, and shared settings, subject to the available features in the Service.

#### 4. No employment relationship

Inklee does not employ, contract with, or otherwise engage Studios or their artists. Nothing in the use of Inklee creates an employment, agency, partnership, or contractor relationship between Inklee and any user.

#### 5. Payouts and commissions

Inklee does not currently split deposits between Studios and artists, calculate commissions, or act as an accounting service. Any such arrangements are between the Studio and its artists.

#### 6. Studio responsibility

The Studio Admin is responsible for the lawful onboarding of artists, including verifying that each artist is authorised to operate a tattoo business and to use Inklee.

> **Legal review needed:** controller / processor framing within a Studio (Studio vs. each artist vs. Inklee), and labour-law surface around Studio control over artists.

---

## 12. Security and Data Handling Summary

> **Where this lives:** `https://inklee.app/security`; linked from the Privacy Policy and footer. Plain-language version aimed at artists, clients, and procurement teams.

### How Inklee handles your data

We take data protection seriously and design Inklee to handle client requests with care.

- **EU infrastructure.** Our core data is hosted in the EU (Supabase in Frankfurt, Vercel EU region).
- **HTTPS everywhere.** All traffic to and from Inklee is encrypted in transit.
- **Encryption at rest.** Our database and object storage encrypt data at rest, as provided by the underlying platforms.
- **Authentication.** Artist accounts use email/password or supported identity providers, with industry-standard hashing for credentials we control. Client access is via cryptographically random magic-link tokens, hashed before storage, and time-limited.
- **Row Level Security.** Our database enforces row-level security so that each artist can only see their own data.
- **Rate limiting and abuse prevention.** Public forms are rate-limited and protected by honeypot mechanisms to reduce spam and abuse.
- **Audit log.** Critical state changes (request decisions, edits, cancellations) are written to an append-only audit log.
- **Error monitoring.** We use error-monitoring tools to detect and fix problems quickly; we configure them to minimise the personal data they capture.
- **Backups.** We rely on managed backups from our database provider.
- **Access control.** Access by Inklee personnel is on a least-privilege basis. Administrative access requires multi-factor authentication.
- **No absolute guarantees.** No online service can promise zero risk. We work hard to reduce it.

If you believe you have found a security issue, please email support@inklee.app with details. Do not test on production data.

---

## 13. Account and Data Deletion Policy

> **Where this lives:** `https://inklee.app/data-requests`; linked from account settings, Privacy Policy, and Public Booking Page Client Notice.

### Account and Data Deletion Policy

#### 1. Artist account deletion

You can delete your Inklee account at any time from your settings, or by emailing support@inklee.app. When you delete your account:

- your public artist page is taken down;
- your account data is deleted or anonymised within `[RETENTION — default: 30 days]`;
- client booking-request data you control is deleted or returned to you in line with the DPA, except where retention is required by law;
- audit logs and security logs are retained for the period set out in the Privacy Policy and then deleted or anonymised;
- backups are overwritten on the normal rolling backup schedule (typically within `[RETENTION — default: 30 days]`).

If you have an outstanding invoice or legal obligation (for example, tax records), the relevant data may be retained for as long as required by law and then deleted.

#### 2. Client request deletion

If you are a client and you want a booking request deleted:

- the simplest route is to use the magic link in your confirmation email to cancel the request; or
- contact the artist directly to ask them to delete it (the artist is the controller of your request); or
- contact Inklee at support@inklee.app if you cannot reach the artist; we will forward your request to the artist and help where we can.

Once a request is deleted by the artist, the underlying data is removed from the active database and overwritten in backups on the normal rolling schedule.

#### 3. Data export

Artists can export their account data and a copy of their booking requests through the dashboard (subject to feature availability) or by emailing support@inklee.app. Clients can request an export of their own data via the same email.

#### 4. Retention exceptions

We may retain limited data after a deletion request where required by law (e.g. tax law), to resolve disputes, to enforce our agreements, or to prevent fraud or abuse. Retained data is access-restricted and deleted when the retention purpose ends.

> **Legal review needed:** confirm minimum statutory retention periods that apply once paid plans go live (Estonian Accounting Act, VAT records).

---

## 14. Short Link / Public Page Terms

> **Where this lives:** `https://inklee.app/short-links` (or merged into the Terms of Service when slug feature is finalised); referenced when an artist publishes a public booking page.

### Short Link and Public Page Terms

#### 1. What this is

`inkl.ee` is a short-link layer that permanently redirects (HTTP 308) to `inklee.app`. It is part of the same Inklee service. Artists do not get a separate `inkl.ee` product; they get an additional way to share their `inklee.app` link.

#### 2. Slugs

When you publish a public booking page, you choose a slug — for example, `inklee.app/yourname` and `inkl.ee/yourname`. Slugs:

- must follow our format rules (lowercase letters, digits, and single dashes; minimum and maximum length apply);
- may not be reserved system terms (such as `admin`, `api`, `app`, `settings`, `signup`, `login`, `logout`, `help`, `terms`, `privacy`, `impressum`, `about`, `blog`, `pricing`, `dashboard`, `request`, `auth`, `static`, `public`, `favicon`, `robots`, `sitemap`, `404`, `500`, and any others we publish or set aside);
- must not impersonate another person, artist, studio, or brand, or infringe trademarks;
- are granted on a first-come, first-served basis and are not guaranteed to remain available;
- may be reclaimed or reassigned by Inklee in the case of trademark complaints, impersonation, dormancy, or violation of these Terms or the Acceptable Use Policy. Where possible, we will give you notice and a chance to choose a new slug.

#### 3. Content on public pages

You are responsible for the content of your public page and your public booking form, including images, descriptions, and policies, and you must keep that content lawful and accurate.

#### 4. Suspension and removal

We may suspend or remove a public page or short link that violates these Terms, our Acceptable Use Policy, or applicable law. We may also do so in response to a valid legal request.

#### 5. No separate service

`inkl.ee` is not a standalone product, marketplace, or directory. There is no separate fee, separate account, or separate data store associated with it. It is a sharing layer that redirects to `inklee.app`.

---

## 15. Subprocessor List

> **Where this lives:** `https://inklee.app/subprocessors`; linked from the Privacy Policy and DPA. Must be kept up to date with effective dates.

| Provider               | Purpose                                                               | Data categories                                                                                                        | Region / transfer notes                                                           | Status                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase               | Authentication, Postgres database, object storage, Row Level Security | Artist account data, client booking request data, magic-link token hashes, audit logs                                  | EU (Frankfurt)                                                                    | **Confirmed live.** Supabase Inc. DPA in force; sub-processor list at `https://supabase.com/legal/dpa`.                                                                          |
| Vercel                 | Application hosting, edge functions, CDN                              | All in-transit traffic; minimal operational logs                                                                       | EU functions region; operational and edge logs may transit to the US (DPF / SCCs) | **Confirmed live.** Vercel DPA in force; verify EU function region setting in production.                                                                                        |
| Resend                 | Transactional email delivery                                          | Recipient email, sender, subject and body of transactional emails (including booking notifications), delivery metadata | EU region preferred; some routing may be US-based (DPF / SCCs)                    | **Confirmed live.**                                                                                                                                                              |
| Stripe                 | Payment processing for deposits (Stripe Connect)                      | Payment card data (handled directly by Stripe as independent controller), customer email, payment metadata             | Global; transfers under DPF / SCCs                                                | **Confirmed live.** Stripe is the independent controller of card data; Inklee retains payment metadata as controller. PSD2 / merchant-of-record analysis pending counsel review. |
| Plausible Analytics    | Cookie-free website analytics                                         | Aggregated, non-identifying traffic metadata; IP address hashed and discarded                                          | EU                                                                                | **Confirmed live.**                                                                                                                                                              |
| Sentry                 | Error and performance monitoring                                      | Stack traces, request metadata, potentially incidental personal data depending on context                              | EU region preferred; SCCs as fallback                                             | **Confirmed live.** Configure data-scrubbing rules to minimise incidental personal data capture.                                                                                 |
| Upstash                | Rate limiting (Redis)                                                 | IP addresses and request metadata; no booking content                                                                  | EU region preferred; verify EU in production                                      | **Confirmed live.**                                                                                                                                                              |
| Cloudflare             | DNS, CDN, security, email routing (where used)                        | Connection metadata; routed email if Cloudflare Email Routing is enabled                                               | Global edge network; transfers under DPF / SCCs                                   | **Confirmed live.**                                                                                                                                                              |
| Google (OAuth)         | Optional sign-in for artists                                          | Identifier returned by Google OAuth (Google account ID, email, name, profile image)                                    | Global; transfers under DPF / SCCs                                                | **Confirmed live.**                                                                                                                                                              |
| GitHub (if applicable) | Source control; not a runtime subprocessor                            | None for user data at runtime                                                                                          | n/a                                                                               | Listed for transparency; not a runtime data flow.                                                                                                                                |
| Meta Pixel             | Marketing tracking                                                    | n/a                                                                                                                    | n/a                                                                               | **Not in use.** Not deployed at the time of drafting. If enabled in future, this list must be updated and a consent banner introduced.                                           |

> **Legal review needed:** confirm each provider’s current data-processing agreement, sub-processor list, and international-transfer mechanism (adequacy decision / SCCs). Update before publication.

---

## 16. Legal Review Checklist

A focused checklist to take into a qualified lawyer before public launch.

1. **Entity and imprint.** Confirm legal name, registry code, VAT number (if any), management board representation, address, and DSA single-point-of-contact disclosure if applicable. Confirm any Estonian-specific Information Society Services disclosures.
2. **Controller / processor structure.**
   - Is the Artist genuinely the controller for Client Booking Request Data? Are any features (analytics, security logs, fraud detection, abuse handling, magic-link UX) better characterised as joint controllership or as separate Inklee-controller processing?
   - Are the platform’s defaults (e.g. automatic deletion of rejected requests after 30 days) consistent with the Artist actually directing the processing?
3. **DPA sufficiency.** Confirm Article 28 compliance, subprocessor consent mechanism (general vs. specific), audit clause, breach-notification SLAs, and whether SCCs need to be attached.
4. **Consumer vs. business classification of Artists.** Are Estonian (and other EU) consumer-protection rules applicable to Artists, especially sole-trader Artists? Implications for liability cap, withdrawal rights for paid plans, and unfair-terms scrutiny.
5. **EU Consumer Rights Directive (when paid plans go live).** Pre-contractual information, order-button labelling ("Pay now" / "Subscribe and pay"), withdrawal right for digital services and how to handle waiver, refund mechanics, durable medium confirmation.
6. **Payment / deposit law.**
   - Confirm that the deposit flow does not make Inklee a payment institution, money remitter, or e-money issuer under PSD2 / forthcoming PSD3.
   - Stripe Connect platform agreement terms and merchant-of-record analysis.
   - Tax handling: VAT on deposits, MOSS / OSS implications, reverse charge for cross-border services.
7. **Sensitive / Article 9 data exposure.** Risk that body-placement, references, or free-text descriptions reveal health, religious, or other sensitive data. Mitigations: form copy, AUP rules, image scanning policy.
8. **Minors.** Country-specific tattoo age restrictions, GDPR age of consent, AUP enforcement strategy.
9. **Health and safety disclaimers.** Tattoo aftercare and medical-information content needs careful framing; ensure Inklee is not seen as providing medical advice.
10. **Digital Services Act (DSA) obligations.** Determine whether Inklee is a "hosting service" under Article 3(g) DSA: yes for public artist pages and Client uploads. Required: notice-and-action mechanism (Art. 16), statement of reasons (Art. 17), single point of contact for authorities (Art. 11) and recipients (Art. 12), terms of service drafting requirements (Art. 14), micro-/small-enterprise exemptions where applicable.
11. **Subprocessor list and international transfers.** Verify each subprocessor, region, DPA in force, and transfer mechanism (adequacy decision, SCCs, supplementary measures).
12. **Cookie consent scope.** Confirm whether Sentry / any third-party scripts require consent. If yes, replace the disclosure banner with a consent banner.
13. **VAT and invoicing.** Once paid plans launch, confirm invoice content, VAT identification numbers, and B2B/B2C tax handling.
14. **Governing law and jurisdiction.** Confirm enforceability of choice-of-law / forum against consumers in their habitual residence.
15. **Liability cap.** Confirm that the EUR 100 minimum cap is enforceable for B2B and adjust language for consumers, including unfair-terms review.
16. **Studio model.** When Studio launches, redo the controller / processor mapping (Studio vs. artists vs. Inklee) and the commercial terms.
17. **Trademark and brand.** Confirm `Inklee` and `inkl.ee` trademark status before relying on them in legal text.
18. **Accessibility.** EU Accessibility Act considerations for the Service.
19. **Marketing / pixels.** If marketing pixels are later enabled, plan the consent banner, prior-consent UX, and Privacy Policy / Cookie Policy updates.
20. **Insurance.** Consider professional liability / cyber insurance for the operating entity.

---

## 17. Implementation Notes for Claude Code

How each document maps onto routes, UI, and content in the app and website. Implement after legal review.

### 17.1 Routes

| Path                           | Document                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `/imprint`                     | Section 2 — Imprint / Legal Notice                                                            |
| `/terms`                       | Section 3 — Terms of Service                                                                  |
| `/privacy`                     | Section 4 — Privacy Policy                                                                    |
| `/dpa`                         | Section 5 — Data Processing Agreement (also available as downloadable PDF in artist settings) |
| `/cookies`                     | Section 6 — Cookie Policy                                                                     |
| `/acceptable-use`              | Section 7 — Acceptable Use Policy                                                             |
| `/security`                    | Section 12 — Security and Data Handling Summary                                               |
| `/data-requests`               | Section 13 — Account and Data Deletion Policy                                                 |
| `/short-links`                 | Section 14 — Short Link / Public Page Terms (or merge into ToS)                               |
| `/subprocessors`               | Section 15 — Subprocessor List                                                                |
| (future) `/subscription-terms` | Section 10 — Subscription Terms (when paid plans go live)                                     |
| (future) `/studio-terms`       | Section 11 — Studio Terms (when Studio goes live)                                             |

### 17.2 Public booking page

At the bottom of every `/[slug]` page, render a collapsed disclosure block with the content from **Section 8 — Public Booking Page Client Notice**. Also include:

- a "by submitting, you agree to our [Terms](./terms), [Privacy Policy](./privacy), and [Acceptable Use Policy](./acceptable-use)" line under the submit button (small, low-emphasis text);
- a link to `/data-requests` for the Client.

### 17.3 Signup checkbox

On `/signup`:

```
[ ] I agree to Inklee’s Terms of Service, Acceptable Use Policy, and the Data Processing Agreement.
    I have read the Privacy Policy.
```

Each item links to its respective route. The checkbox is required. Capture acceptance timestamp and version hash of the documents.

### 17.4 Footer

Site-wide footer includes: Terms, Privacy, Imprint, Cookies, Acceptable Use, Subprocessors, Security, Data Requests, Contact.

### 17.5 Cookie banner

Current state (no marketing trackers, only strictly-necessary cookies + cookie-free Plausible): a one-line **cookie disclosure** at first visit with a link to the Cookie Policy. No "Accept/Reject" buttons are required if all loaded cookies remain strictly necessary. If Sentry or other third-party scripts are reclassified as requiring consent, switch to a full consent banner.

### 17.6 Dashboard legal links

In the artist dashboard footer and in `/settings/legal`:

- view the Terms, Privacy, AUP, DPA, Cookie Policy, Subprocessors, Security, Data Requests pages;
- download a PDF of the DPA with the artist’s account identifier inserted;
- see the current version date and a changelog of material changes.

### 17.7 Email footers

Transactional emails sent on Inklee’s behalf include in the footer:

- the Inklee operator legal name and address;
- the Privacy Policy link;
- a one-line explanation of why the recipient is receiving the email ("you submitted a booking request to {artist_name} on Inklee").

### 17.8 Versioning

Store every published version of the legal documents in the repo under `legal/versions/{YYYY-MM-DD}/` and surface the version in the footer of each rendered page. Record artist acceptance against a specific version hash.

### 17.9 Deletion-job consistency

Ensure the Vercel Cron job that deletes rejected bookings after 30 days (planned in Slice 10) is consistent with the retention numbers in the Privacy Policy and DPA. If retention numbers change, update both the cron job and the published policy together.

### 17.10 Stripe and deposit copy

Stripe deposits are live. Wherever deposits are presented to artists or clients (artist deposit settings, public booking page deposit section, dashboard help text, marketing site), include the exact required wording: _"Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features."_

If any environment is still configured against Stripe test keys, the artist UI must clearly indicate that — e.g. a yellow banner "Deposits are in test mode in this environment. No real charges will be made." — so test charges are never confused with live ones.

---

## Critical Questions Before Lawyer Review

These are the questions that must be answered before this draft can be finalised. If a question is left unanswered, the corresponding section cannot reach a publishable state.

### A. Company and jurisdiction

1. What is the exact legal name and form of the operating entity?
2. What is the Estonian commercial register code?
3. What is the registered address?
4. Who is the management-board representative listed on the imprint?
5. Is the company VAT-registered? If yes, what is the VAT number?
6. What is the official legal contact email? (e.g. `legal@inklee.app`)
7. What is the official privacy contact email? (e.g. `privacy@inklee.app`)
8. What is the public support email? (e.g. `hello@inklee.app`)
9. Is a Data Protection Officer required and/or appointed? If yes, who is the contact?
10. Is the company subject to any specific Estonian licensing regime (e.g. payment-services, e-money) beyond a standard OÜ?

### B. Geography and audience

11. Which countries are explicitly in scope at launch? Is the answer truly "global, EN only", or is there a primary target market (e.g. EU, US, UK)?
12. Are users in Germany expected at launch? (If yes, the imprint section may need German-language updates and DSA/TMG conformity.)
13. Are users in the UK expected at launch? (If yes, separate UK GDPR / ICO references may be needed.)
14. Are users in California or Brazil expected in volume? (CCPA / LGPD addenda would be added later.)

### C. Roles and responsibilities

15. Confirm: do you intend Artists to be controllers of Client Booking Request Data, with Inklee as processor? Or do you want to operate a joint-controller model?
16. For abuse handling, fraud detection, and security logs, is it acceptable to characterise Inklee as the controller (separate from the Artist)?
17. Will Inklee make any independent decisions about retention (e.g. the 30-day rejected-booking deletion job)? If yes, this strengthens the joint-controller argument and the DPA wording must be adjusted.

### D. Data and retention

18. Confirm retention periods for: artist account data after deletion, audit logs, error/monitoring data, backups, email-delivery logs, and (once live) invoices and payment records.
19. Confirm the magic-link token expiry (default drafted: 30 days) and whether edit-token single-use semantics are final.
20. Are there any sensitive-data categories Inklee is willing to explicitly forbid in booking requests (e.g. health information, photos of minors, identification documents)? If yes, list them so they can go into the AUP and the booking-form copy.

### E. Subprocessors

21. Confirm the live list of subprocessors at launch (Supabase, Vercel, Resend, Stripe, Plausible, Sentry, Upstash, Cloudflare, Google OAuth, others).
22. For each, confirm the active region (EU vs. global) and whether SCCs / DPF apply.
23. Will the subprocessor list be published at `/subprocessors` with notification before changes, or only on request? (Recommended: published, with notice.)

### F. Payments and deposits

24. When deposits go live, what is Inklee’s role: collecting on behalf of the artist (Stripe Connect Express?), platform with direct charges, or other?
25. Are there any markets where deposits will be disabled at launch?
26. What is the planned refund policy for deposits across consumer markets where withdrawal rights apply?

### G. Subscriptions (future)

27. What are the final paid-plan prices, billing intervals, and currencies?
28. Is the EUR 24/year founder pricing for the first 100 Plus subscribers a one-off offer (price reverts at next renewal) or grandfathered for life?
29. How is consumer vs. business classification handled at checkout? Will Inklee collect VAT numbers and tax residency?
30. What is the cancellation grace period / refund policy?

### H. Studio (future)

31. When Studio launches, will the Studio Admin be the sole contracting party, or will each artist also sign Inklee’s Terms?
32. Will Inklee handle any payouts or commission accounting between Studios and artists?

### I. Liability and risk

33. What insurance does the operating entity hold (E&O, cyber, general liability)? This affects the realism of the liability cap.
34. Is the EUR 100 minimum liability cap acceptable, or should it scale with paid plan fees?

### J. DSA and content moderation

35. Will Inklee allow public, non-authenticated comments/reviews on artist pages? (Current assumption: no.) If yes, the DSA exposure changes.
36. Where should DSA notices and contact points be published (`/dsa`?), and who is the responsible person at Inklee for handling them?

### K. Marketing and tracking

37. Is there any plan to enable Meta Pixel, Google Ads, or other marketing trackers within 6 months of launch? If yes, the Cookie Policy and cookie banner must be designed for consent now rather than disclosure-only.

### L. Process

38. Who at Inklee owns updates to the legal documents (versioning, changelog, accept-on-next-login flows)?
39. Which Estonian / EU lawyer is engaged for review, and when?
40. Is there a budget / timeline for translating the legal pages into German, French, Spanish, or other EU languages within the first year? (Recommended: not at launch, English-only.)

---

> **Reminder.** This package is a structured first draft. It is not legal advice and should not be treated as final. Every section must be reviewed by qualified counsel before Inklee relies on it publicly.
