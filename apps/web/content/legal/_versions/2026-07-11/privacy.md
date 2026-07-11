---
title: Privacy Policy
version: "2026-07-11"
lastUpdated: "2026-07-11"
requiresAccept: false
---

This policy explains what data we collect about you, why we collect it, and what your rights are. It applies to the Inklee website, the Inklee web app, public artist pages hosted by Inklee, and the booking-request workflow.

#### 1. Who is responsible

The data controller is Inklee OÜ, Pärnu mnt. 105, 11312 Tallinn, Estonia, registry code 17497625, represented by Michel Kräft.

Privacy contact: support@inklee.app
Data protection: a Data Protection Officer is not currently appointed because Inklee considers itself below the mandatory-DPO thresholds in Article 37 GDPR. Use the privacy contact above for any data-protection request.

This policy applies under the EU/EEA GDPR (Regulation (EU) 2016/679). Where users in the United Kingdom are concerned, the equivalent rights under the UK GDPR and the UK Data Protection Act 2018 apply, and the UK Information Commissioner’s Office is the competent supervisory authority. Inklee currently has an EU focus but does not geo-restrict access; we apply GDPR-level protections to all users.

#### 2. Different roles for different data

Inklee handles two main streams of personal data, with different responsibilities for each:

- **As controller**, we decide how to process: artist account data, billing data (if and when paid plans go live), website analytics, error and security logs, support communications, and any data we need to run and protect the platform.
- **As processor for the Artist**, we handle **Client Booking Request Data** on behalf of the Artist who receives the request. The Artist is the controller of that data. Our Data Processing Agreement (Section 5 of this package) governs that relationship.

If you submit a booking request through an Artist’s public page, the Artist is your primary controller for that submission. Inklee processes the data so that the Artist can review and respond, and to operate the technical service.

#### 3. What we collect and why

##### 3.1 Artist account data

| Data                                                                                                                                                                                                                                                                                               | Purpose                                                                                                                                                                                            | Legal basis (GDPR)                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Name, email, password / OAuth identifier                                                                                                                                                                                                                                                           | Account creation, login, security                                                                                                                                                                  | Contract (Art. 6(1)(b))                                                                                 |
| Display name, Instagram handle, bio, location, timezone, logo                                                                                                                                                                                                                                      | Public artist page; service operation                                                                                                                                                              | Contract (Art. 6(1)(b))                                                                                 |
| Booking settings, email template content, calendar configuration                                                                                                                                                                                                                                   | Service operation                                                                                                                                                                                  | Contract (Art. 6(1)(b))                                                                                 |
| Stripe Connect identifiers, deposit metadata (Stripe payment-intent ID, refund ID, deposit amount and status, platform-fee amount)                                                                                                                                                                 | Operate the in-app deposit workflow; charge and refund the platform fee. Inklee never sees card numbers (card data is entered directly into Stripe’s hosted fields) and never holds deposit funds. | Contract (Art. 6(1)(b)) and legitimate interests (Art. 6(1)(f)) for fraud-prevention and reconciliation |
| IP address, device, browser metadata, audit log of account actions                                                                                                                                                                                                                                 | Security, abuse prevention, accountability                                                                                                                                                         | Legitimate interests (Art. 6(1)(f))                                                                     |
| Support messages                                                                                                                                                                                                                                                                                   | Responding to support requests                                                                                                                                                                     | Legitimate interests / Contract                                                                         |
| Product usage analytics (an event name such as "onboarding completed", your account ID, coarse labels such as the onboarding step, the day you used the web or mobile app, and the page, referring site, and campaign that first brought you to Inklee). No booking or client content is included. | Understand how artists adopt and use Inklee, improve onboarding and features                                                                                                                       | Legitimate interests (Art. 6(1)(f))                                                                     |

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

| Data                                                                                                                                                                                                                                                                          | Purpose                                                   | Legal basis (GDPR)                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| Aggregated, cookie-free website analytics: Inklee's own first-party measurement and Plausible. Both are cookie-free. Inklee's own analytics derives a daily anonymous visitor signal from your IP address that is never stored, with no identifier that persists across days. | Understand how visitors find and use the site, improve it | Legitimate interests (Art. 6(1)(f))     |
| Error and performance monitoring (e.g. Sentry)                                                                                                                                                                                                                                | Detect and fix bugs, protect the service                  | Legitimate interests (Art. 6(1)(f))     |
| Strictly necessary cookies (session, auth, CSRF)                                                                                                                                                                                                                              | Run the service securely                                  | Necessary for the service you requested |

##### 3.4 Instagram connection (optional, Artists only)

Artists can connect an Instagram professional account to Inklee to import their own posts as flash designs. The connection is optional and uses Meta's Instagram API with Instagram login. We request read-only access (the `instagram_business_basic` permission): Inklee can read your basic profile information and your media, and nothing else. Inklee never posts to Instagram, never reads or sends messages, and has no access to your followers or to other accounts.

If you connect Instagram, we store:

| Data                                                                                       | Purpose                                                                                                                                 | Legal basis (GDPR)      |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Instagram user ID and username                                                             | Identify the connected account and show its connection status                                                                           | Contract (Art. 6(1)(b)) |
| Instagram access token (read-only; expires by itself after about 60 days unless refreshed) | Fetch your recent posts from the Instagram API when you sync; the token itself is renewed automatically so the connection keeps working | Contract (Art. 6(1)(b)) |
| Post metadata (post ID, link, caption, media type, posting date)                           | Show your recent posts in the app so you can choose which ones to import                                                                | Contract (Art. 6(1)(b)) |
| Copies of post thumbnail images (stored with our EU hosting provider)                      | Preview images in the import screen and, for posts you import, the image of the created flash design                                    | Contract (Art. 6(1)(b)) |

The access token is stored server-side only. It is never exposed to your browser, to the mobile app, or to other users.

**Disconnecting and deleting Instagram data.** You can disconnect Instagram at any time in the app (Flash, then Instagram, then Disconnect). Disconnecting immediately deletes the stored access token, the synced post list, and the cached thumbnail images. Flash designs you already imported are kept, together with their copied image and the link to the original post; you can delete them individually from your flash library. The same immediate deletion runs automatically when you remove Inklee from your Instagram account (in your Instagram settings, under apps and websites) or when Meta forwards us a data deletion request for your account: Meta notifies our deletion endpoint and we delete the data listed above without any further action needed from you. Deleting your Inklee account also deletes all Instagram data we hold about you.

Your use of Instagram itself is governed by Meta's own terms and privacy policy; Meta acts as a separate controller for the Instagram platform.

#### 4. How long we keep data

| Data                                                                          | Retention                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Artist account data                                                           | While your account is active. When you delete your account, your profile and personal data are erased, except records we are required or permitted by law to keep (see "When you delete your account" below).                                                                                                                                                                              |
| Instagram connection data (access token, synced post list, cached thumbnails) | Until you disconnect Instagram in the app, remove Inklee inside Instagram, or delete your account; deleted immediately at that point.                                                                                                                                                                                                                                                      |
| Client booking requests                                                       | Controlled by the Artist. Rejected or cancelled requests, including uploaded images, are deleted after 30 days via a scheduled job. Where a booking has an associated payment, we keep a pseudonymised financial record (amounts and payment references, without client names or contact details) as described below. Approved bookings are retained while the Artist’s account is active. |
| Pseudonymised financial records                                               | 7 years from the end of the relevant financial year, to meet our accounting and tax obligations under Estonian law.                                                                                                                                                                                                                                                                        |
| Account-deletion and security records                                         | A pseudonymous record that an account was deleted, and related security logs: 24 months.                                                                                                                                                                                                                                                                                                   |
| Audit logs                                                                    | 24 months, longer where linked to a retained financial record.                                                                                                                                                                                                                                                                                                                             |
| Product usage analytics (artist accounts)                                     | 24 months; deleted immediately when you delete your account.                                                                                                                                                                                                                                                                                                                               |
| Website analytics (anonymous visitors)                                        | 24 months. Contains no account identifier and no identity that persists across days.                                                                                                                                                                                                                                                                                                       |
| Email delivery logs                                                           | As required by the email provider (Resend) for deliverability and abuse handling.                                                                                                                                                                                                                                                                                                          |
| Error / monitoring data                                                       | 90 days.                                                                                                                                                                                                                                                                                                                                                                                   |
| Backups                                                                       | Rolling backup window of 30 days.                                                                                                                                                                                                                                                                                                                                                          |

##### 4.1 When you delete your account

> **Deletion of your account.** When you delete your account, we erase your profile and the personal data we hold about you and about the clients whose details you entered, except where we are required or permitted by law to retain certain records. We retain a pseudonymised record of fee and transaction data (amounts, currency, payment references, and dates, without client names or contact details) for seven years from the end of the relevant financial year, to meet our accounting and tax obligations under Estonian law. Where a client has paid a deposit that has not been resolved, we keep the limited records needed to allow that deposit to be refunded and to protect the parties' legal claims.

> **Payments and identity data.** Payments and identity verification are handled by Stripe. Stripe holds the identity and KYC information of payment accounts as an independent controller and retains it under its own anti-money-laundering obligations, including after your account with us is deleted. Stripe may process this data outside the European Economic Area; such transfers are protected by the Standard Contractual Clauses and Stripe's EU–US Data Privacy Framework certification.

> **Security records.** We keep a pseudonymous record that an account was deleted, and related security logs, for up to twenty-four months to prevent abuse and to demonstrate that deletion took place.

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

#### 10. Cookies

See our Cookie Policy (Section 6 of this package).

#### 11. Changes

We may update this policy. Material changes will be notified by email or in-app at least 14 days before they take effect.

#### 12. Contact

support@inklee.app
