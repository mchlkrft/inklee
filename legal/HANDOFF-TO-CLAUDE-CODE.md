# Handoff: Inklee Legal Work — for Claude Code

**Date:** 2026-05-19
**Owner:** Michel Kräft
**Read order:** this file → `legal/COMPLIANCE-CHECK.md` → `legal/LEGAL-PACKAGE-DRAFT.md`.

This is a handoff brief from the legal-drafting session to Claude Code. Treat the legal drafts as **first drafts pending counsel review** — do not publish any of them verbatim to production without explicit sign-off.

---

## 1. What was produced

Two new files were added under `legal/`:

- `legal/LEGAL-PACKAGE-DRAFT.md` — full first draft of the Inklee legal text package: imprint, ToS, Privacy Policy, DPA, Cookie Policy, AUP, public booking page notice, deposit and payment terms, subscription/studio placeholders, security summary, deletion policy, short-link terms, subprocessor list, legal review checklist, implementation notes, and a "Critical Questions Before Lawyer Review" list.
- `legal/COMPLIANCE-CHECK.md` — a compliance audit of the **draft** against the **live site** (`/imprint`, `/terms`, `/privacy`, homepage). Includes a status-update header that captures the founder's 2026-05-19 answers and a revised launch-blocker list.

The drafts are populated with real facts confirmed by the founder on 2026-05-19:

| Field                             | Value                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Operating entity                  | Inklee OÜ                                                                                            |
| Estonian registry code            | 17497625                                                                                             |
| Registered address                | Pärnu mnt. 105, 11312 Tallinn, Estonia                                                               |
| Management board representative   | Michel Kräft                                                                                         |
| VAT status                        | Not VAT-registered (Estonian VAT Act §19 threshold not reached)                                      |
| Contact email (all roles for now) | `support@inklee.app`                                                                                 |
| Governing law / forum             | Estonia / Harju County Court, Tallinn                                                                |
| Product status                    | Live (GA, not beta)                                                                                  |
| Stripe deposits                   | Live (treat as live; flag any environment still on test keys)                                        |
| Scope                             | No geographic limit, EU focus                                                                        |
| Subprocessors confirmed live      | Supabase (EU/FRA), Vercel (EU), Resend, Stripe, Plausible, Sentry, Upstash, Cloudflare, Google OAuth |

---

## 2. Launch-blocking findings (act on these first)

Order them in the existing Slice 10 work or pull them ahead. They are blocking before the **first real artist** signs up beyond demo accounts.

1. **Publish a DPA at `/dpa`.** Article 28 GDPR. Source copy: Section 5 of the draft. Required as a click-acceptance step at signup and as a downloadable page.
2. **Replace `/terms`** with the counsel-reviewed Section 3 of the draft. The current live `/terms` is missing eligibility, artist responsibility for age/health/safety, deposit clause, warranty disclaimer, liability cap, governing law, DPA reference, and change procedure. Also still says "beta period" — remove that wording.
3. **Update `/imprint`** with: the management board representative (Michel Kräft), the VAT-not-registered disclosure, and the DSA Art. 11/12 single-point-of-contact line. Source copy: Section 2 of the draft.
4. **Add the required deposit wording** wherever deposits are presented:
   > "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features."
   > Surfaces: artist deposit settings UI, public booking page (when a deposit is requested), homepage deposit feature card. Also: if any environment is still running on Stripe test keys, render a clear test-mode banner in the artist UI.

---

## 3. Next-sprint fixes

After the four launch blockers, ship these in the launch-week sprint.

5. **Replace `/privacy`** with the counsel-reviewed Section 4 of the draft. Adds: legal bases per processing activity, controller/processor split, full subprocessor list (Stripe, Sentry, Upstash, Cloudflare, Google OAuth now included), international transfers paragraph, minors policy, UK GDPR equivalence, magic-link token disclosure, breach commitment, AKI/ICO complaint right.
6. **Publish `/cookies`** (Section 6 of the draft) and link from the footer and Privacy Policy. List Supabase auth cookies by name and expiry.
7. **Publish `/acceptable-use`** (Section 7 of the draft) and reference from `/terms` and the signup checkbox.
8. **Publish `/subprocessors`** (Section 15 of the draft).
9. **Add a DSA notice-and-action route** (`/legal/report` or `/dsa`). Accept structured notices by email or form. Document the internal moderation procedure.
10. **Soften the homepage "GDPR compliant" badge** to "EU-hosted, GDPR-aligned" until a third-party assessment exists, or remove it.
11. **Update the signup flow** to surface the click-accept for Terms + DPA + AUP, capture an acceptance timestamp and version hash per user, and back-fill acceptance from any pre-existing accounts.
12. **Add the Section 8 client notice** under the booking form on every public artist page (`/[slug]`), including the deposit wording and the "the artist is the seller, not Inklee" framing.
13. **Versioning**: switch every legal page's "Last updated" to ISO date (`2026-05-19`), and store an accepted-version hash per user.
14. **Aliases (optional but recommended)**: add `legal@`, `privacy@`, `abuse@` routed to `support@inklee.app` for discoverability — surface them in the relevant footers.

---

## 4. Routes / files affected

| Route                                         | Source section in `LEGAL-PACKAGE-DRAFT.md` | Status                             |
| --------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| `/imprint`                                    | Section 2                                  | Update with new fields             |
| `/terms`                                      | Section 3                                  | Replace                            |
| `/privacy`                                    | Section 4                                  | Replace                            |
| `/dpa`                                        | Section 5                                  | New route + click-accept at signup |
| `/cookies`                                    | Section 6                                  | New route                          |
| `/acceptable-use`                             | Section 7                                  | New route                          |
| `/[slug]` (public booking page)               | Section 8                                  | Add notice block above submit      |
| Artist deposit settings + public deposit copy | Section 9                                  | Insert required wording            |
| `/security`                                   | Section 12                                 | Optional but recommended           |
| `/data-requests`                              | Section 13                                 | New route                          |
| `/short-links` (or merge into ToS)            | Section 14                                 | New route                          |
| `/subprocessors`                              | Section 15                                 | New route                          |
| `/legal/report` or `/dsa`                     | DSA notice route                           | New route + form                   |

Section 17 of the draft contains the full implementation notes (signup checkbox copy, footer link order, email footer, versioning, cookie banner stance).

---

## 5. Open items that block full publication (need counsel or founder)

Do not publish the legal pages live until these are resolved or until Estonian/EU counsel has signed the texts off.

1. **Counsel sign-off** on ToS, Privacy, DPA, AUP, deposit framing, DSA scope, liability cap, governing law, consumer-classification of artists.
2. **DPO** — confirm none is required under GDPR Art. 37. Current assumption: not required.
3. **PSD2 / merchant-of-record analysis** for the Stripe Connect deposit flow.
4. **DSA exemptions** — confirm which Art. 19 micro/small-enterprise exemptions apply.
5. **Liability cap enforceability** against sole-trader artists in Estonia.
6. **DPIA** for booking-image processing, magic-link tokens, and the Stripe deposit flow.
7. **CCPA monitoring threshold** — define when US traffic triggers a CCPA / CPRA review.
8. **Estonian VAT threshold tracking** — register and update imprint + invoicing flows when EUR 40,000/year turnover is reached.
9. **Marketing claim substantiation** for the "GDPR compliant" badge.
10. **Trademark clearance** for "Inklee" and "inkl.ee" (still listed open in `DECISIONS.md`).

---

## 6. How to use the draft inside the Next.js app

Suggested implementation pattern:

- Create `src/app/(legal)/` route group.
- One MDX or Markdown file per legal page, stored under `content/legal/{terms,privacy,dpa,cookies,acceptable-use,subprocessors,imprint,security,data-requests,short-links}.mdx`, with frontmatter `version: 2026-05-19`, `lastUpdated: 2026-05-19`, `requiresAccept: true|false`.
- A shared `<LegalPageLayout>` component that renders the MDX body with the standard header, last-updated line, and version footer.
- A `useLegalAcceptance` server action that records `{ userId, documentId, versionHash, acceptedAt, ipHash }` to a new `legal_acceptances` table on signup and on material changes.
- Store published copies of each version under `content/legal/_versions/{YYYY-MM-DD}/` so version hashes are stable.
- Cron job (Vercel Cron) for the existing 30-day rejected-booking deletion remains aligned with Section 4 / Section 13 retention numbers — keep them in sync if the retention numbers change.

---

## 7. Things to leave alone for now

- **Subscription Terms (Section 10) and Studio Terms (Section 11)** — marked NOT ACTIVE; do not publish.
- **`inkl.ee` short-link terms (Section 14)** — can be merged into ToS or kept as a standalone page; either is fine.
- **DPO appointment, VAT registration, CCPA addendum** — not required today; revisit when triggers fire.
- **Liability cap clause** — counsel should confirm enforceability before publishing.

---

## 8. Quick reference — do / don't

**Do:**

- Treat `legal/LEGAL-PACKAGE-DRAFT.md` as the canonical source of truth for the texts.
- Treat `legal/COMPLIANCE-CHECK.md` as the gap tracker between the draft and the live site.
- Use the exact deposit wording verbatim wherever deposits are presented.
- Use ISO dates (`2026-05-19`) for every "Last updated" line.

**Don't:**

- Publish the legal texts to production without counsel sign-off.
- Onboard the first real artist before the DPA is published and clicked-accepted at signup.
- Add the words "free forever", "guaranteed bookings", "Inklee is a marketplace", or any of the other forbidden phrases listed in the original founder briefing.
- Add Meta Pixel / marketing trackers without first replacing the cookie disclosure with a consent banner.

---

That's the handoff. Pick up at section 2 (launch blockers) when ready.
