# Inklee Plus product specification

**Status:** confirmed by founder decision 2026-07-28 (the full-package directive). This document is the product SoT for what Plus IS: positioning, package contents, fee model, and launch posture. Companions: `plus-commercial-packages.md` (account postures + commercial-readiness gate mechanics), `pricing-model.md` (price card + gate state), `account-tier-feature-matrix.md` (per-feature enforcement view), `DECISIONS.md` 2026-07-28 rows (ratified summary + supersessions).

Conventions: sentence case, no em-dashes. Where this document contradicts an older doc, this one wins and the older doc carries a supersession note.

---

## 1. Legal posture (settled, do not reopen)

The fundamental consumer, withdrawal, VAT, and subscription architecture has been reviewed and confirmed with counsel. It is NOT waiting for an initial legal opinion, and engineering does not need counsel approval before building each component. Confirmed implementation inputs:

- Inklee Plus is an ongoing digital service.
- Consumer withdrawal remains distinct from ordinary cancellation.
- Immediate performance requires separate explicit consent.
- The online withdrawal function remains required for eligible consumer contracts.
- Withdrawal preserves account and user data.
- Consumer withdrawal may trigger the approved proportional service calculation.
- Inklee retains versioned evidence of consent and contract information.
- The artist remains the seller or merchant for goods; Inklee provides software, payment, and commerce infrastructure and never becomes the seller of the artist's goods.

**The remaining counsel gate is final implementation sign-off**, after the product flow and draft documents exist: final Terms, checkout disclosures, business-use declaration, immediate-performance wording, withdrawal wording + online flow, proportional compensation wording, goods marketplace wording, cancellation and refund wording, and the actual implementation against the approved posture. Sequence: build against the confirmed posture, produce complete final drafts, submit the finished implementation, apply corrections, record approval against the final versioned artifacts, activate consumer billing only after approval. Draft legal copy is never described as approved merely because the posture is confirmed.

## 2. Positioning

Primary statement: **"Your tattoo business, your way."**

Artists are not routinely described as brands in public-facing copy. Preferred language: make Inklee yours, match your style, create a professional client experience, give clients a booking experience that feels like you, work more efficiently, keep more from every payment and sale. Internal terms like `brand_settings` are fine where technically useful; customer-facing terminology centers style, identity, presentation, and professional client service.

**Audience:** artists at every career stage who want to grow their business, professionalize client service, present consistently, reduce booking administration, improve client interaction, sell goods more effectively, and retain more revenue. Not positioned only for beginners, established artists, or travelling artists.

**Message hierarchy:** (1) creative control and professional presentation, (2) workflow and client-service efficiency, (3) financial savings as measurable proof of value. Fee savings are a strong conversion and retention mechanism but not the whole identity.

## 3. The Inklee page (Linkhub + public artist page)

`Inklee page` is the umbrella customer-facing name. The Linkhub (focused link and conversion page) and the detailed public artist page (richer profile) stay separate products or modes; their data models are NOT merged merely because they share appearance settings.

| | Free | Plus |
|---|---|---|
| Linkhub layout | one fixed layout, professionally designed (never deliberately poor) | four initial templates: **Clean, Portfolio, Bold, Editorial** |
| Links | unlimited standard links | unlimited |
| Colors | preset | fully custom |
| Typography | default | curated library choices |
| Background image | no | yes |
| Button styles | default | custom |
| Section layouts | fixed | custom |
| Inklee branding | visible | removable |
| SEO title + description | default | custom |
| Linkhub analytics | **none** | full (section 5) |

**Plus Linkhub blocks v1:** featured booking form, featured goods collection, upcoming guest spots, available flash, books-open status, image gallery, custom text sections. Social-feed synchronization and video embedding are OUT of v1 unless a stable implementation already exists in the repo. **Deferred:** background video, arbitrary large media uploads, highly granular spacing controls, custom font uploads.

## 4. Typography and image models

**Fonts:** a curated Inklee font library, no arbitrary uploads in v1. Requirements: legally licensed for the use, reliable loading, script coverage where relevant, acceptable performance, tested across public surfaces, no build-time dependency on remote font retrieval, combinations appropriate for tattoo artists without forcing a corporate aesthetic.

**Images:** Plus may use a newly uploaded optimized background image or existing eligible images already in the artist's Inklee media. Apply upload size limits, validation, automatic compression, responsive derivatives, safe public delivery, storage quotas, and crop/focal-point controls. Never publicly serve the original high-resolution upload where an optimized derivative suffices. No background video in v1.

## 5. Linkhub analytics (Plus)

Free receives none. Plus receives: page views, link-level clicks, click-through rates, traffic sources, booking conversions, goods conversions, time comparisons, last 12 months of detailed reporting, lifetime aggregate totals. This becomes part of the wider Plus insights system, not a separate disconnected analytics product. Event retention is defined separately from aggregate retention.

## 6. Booking form

ONE primary booking form; no three general-purpose independent forms.

| | Free | Plus |
|---|---|---|
| Primary form | yes | yes |
| Color themes | preset Inklee themes | fully custom colors |
| Visual templates | standard layout | multiple |
| Artist logo | yes | yes |
| Cover image | no | yes |
| Inklee branding | visible | removable |
| Conditional questions | no | yes |
| Confirmation page | default | custom |
| Email templates | default transactional | form-specific custom |
| URL slug | standard | custom |
| Large-project mode | no | yes (section 7) |

NOT required in Plus v1: custom font uploads, password-protected forms, multiple general-purpose forms, scheduled form availability (unless an existing books-open workflow already needs it).

## 7. Large-project mode (Plus)

A Plus-only specialized intake mode for large and complex work: back pieces, full sleeves, leg sleeves, bodysuits, multi-session projects, large cover-ups, projects requiring assessment of existing tattoos and available body areas. It may change both visual presentation and intake structure. It does NOT duplicate the booking system; it reuses global settings (artist identity, availability rules, travel context, contact settings, core notification behavior, consent settings, client identity handling).

**Intake candidates:** project description, long-term goal, relevant body areas, existing tattoo coverage, available untattooed areas, front/side/rear body photographs, close-ups of existing tattoos, reference images, desired styles or themes, expected scale, session commitment, travel availability, budget range where legally and commercially appropriate, preferred consultation method, artist-defined custom questions. **No unnecessary medical information; any health-related intake must be separately justified and reviewed.**

**Result:** a submitted intake creates a dedicated **long-term project record**, not a standard booking request. Eventual lifecycle: submitted, under review, consultation requested, consultation scheduled, project accepted, planning, sessions proposed, active, paused, completed, declined, archived. The artist can later create or associate: a consultation, one or more booking requests, multiple appointments, reference media, project notes, payment or deposit records. The FIRST implementation defines the smallest coherent v1 record and lifecycle, then challenges whether it is sufficient; the full project-management scope must not delay the whole package unreasonably.

## 8. Shared appearance system

Global appearance defaults with optional surface-level overrides, usable by: Inklee Linkhub, public artist page, primary booking form, large-project intake, goods shop, guest-spot public surfaces. Global settings: color palette, typography selection, button treatment, image treatment, logo, general visual theme. Surfaces override selected properties only where a real use case exists. Appearance configuration is never duplicated independently per feature.

**Studio scope:** Studio subscriptions include the relevant Plus-style capabilities only inside the studio scope, with their OWN shared appearance system (studio Inklee page, studio booking forms, public studio profile, studio goods shop, relevant guest-artist surfaces). A Studio subscription does not grant personal Plus to members; a personal Plus artist in a Free studio keeps Plus only in their personal scope. Role permissions and studio entitlements are checked independently.

## 9. Goods

Basic goods selling is available to FREE artists; goods are NOT Plus-only. The artist remains the seller or merchant; Inklee never becomes the seller. Initial scope is physical goods only (merchandise, clothing, prints, artwork, stickers, accessories, aftercare products where permitted, other lawful physical artist goods). No digital downloads until their tax, IP, refund, and withdrawal treatment is separately defined.

| | Free | Plus |
|---|---|---|
| Active products | 3 | 25 |
| Archived products | do not count against the cap | same |
| Variants, inventory tracking | no | yes |
| Preorders, scheduled product drops | no | yes (**drops are a headline tattoo-scene feature**) |
| Discount codes, bundles, collections | no | yes |
| Shop customization | basic | advanced + branding removal |
| Sales analytics | no | detailed |
| Platform fee | **5%** | **1%** |

Product and order records are never deleted because an account downgrades.

## 10. Platform fees (supersedes OQ-7 flat-3% and the D22 goods model)

**Goods fee** applies to: product subtotal after discounts, excluding VAT and shipping. Free 5%, Plus 1%. Never calculated on VAT, shipping, refunded value, tips (unless separately approved), or pass-through taxes/statutory fees. **The fee schedule version is stored on every transaction.**

**Deposit fee** applies only to the deposit amount successfully collected through Inklee. Free 3%, Plus **0.5%**. Never calculated from the estimated total tattoo price, a manually reported final price, an amount not processed through Inklee, or cancelled/failed attempts.

Stripe processing fees remain separately identified in both cases; the combined deduction is never described as one Inklee fee.

> **Supersessions, explicit:** OQ-7 (ratified 2026-07-25, "flat 3% for all tiers, no Plus discount") is superseded by the 3% / 0.5% split. D22 ("5% platform fee + 3% card fee on card-paid goods") is superseded by the 5% / 1% subtotal-based model with Stripe fees separate.
>
> **Implied consequence flagged for confirmation:** a Free deposit rate of 3% only has meaning if Free artists can collect card deposits. Today `deposits` is a Plus-gated entitlement (`account-tier-feature-matrix.md`). This spec reads the confirmed fee table as making card deposit collection available on Free at 3%; if that reading is wrong, the fee table needs a Free rate of "n/a" instead. Flagged in the Return, not silently resolved.

## 11. Refund policy direction (fee side)

Product-policy model, subject only to final accountant and Terms implementation review. Implemented as **versioned data**, not scattered conditions:

| Case | Inklee platform fee |
|---|---|
| Full voluntary refund to the client | returned in full (proportional) |
| Partial voluntary refund | returned proportionally |
| Chargeback / payment dispute | retained where legally and contractually permitted |
| Fraudulent or prohibited transaction | retained where legally and contractually permitted |
| Artist cancellation | only non-recoverable Inklee costs retained where permitted |
| Inklee system error | returned |

Stripe processing costs stay separate because their recoverability depends on Stripe's pricing and transaction behavior.

## 12. Savings dashboard (Plus)

Shows: deposit platform fees paid, goods platform fees paid, fees saved because of Plus, Plus subscription cost, net Plus benefit, estimated break-even point, relevant comparison period. For Free artists, personalized savings prompts may appear only in the billing or revenue dashboard; no aggressive popups or interruptive prompts. Savings claims only where the calculation rests on actual eligible transaction data.

## 13. Founder offer

The existing approved founder-offer decision stands unchanged (first 100 subscribers, 24 EUR/year, yearly-only, 6-month window; DECISIONS.md 2026-07-25). Engineering may connect it to the new package, verify it against the final pricing model, identify contradictions, add tests, and fix implementation defects without changing commercial terms. Price, eligibility, cohort size, enrollment period, retention conditions, cancellation behavior, transferability, and billing interval are founder-only; any contradiction returns for approval.

## 14. Custom domains

Post-launch Plus extension, NOT in the v1 launch gate. An audit of routing, tenant resolution, SSL issuance, DNS + ownership verification, abuse handling, domain removal, support burden, search indexing, canonical URLs, and migration between Inklee URLs and custom domains produces a later-implementation recommendation. Inklee-hosted URLs remain part of the current product.

## 15. Full-package launch (supersedes the 2026-07-28 minimum-sellable-v1 provisional)

The public Plus launch waits until the COMPLETE approved package is production-ready. No reduced launch with "coming soon" promises. The launch package: custom Inklee page, four Linkhub templates, shared appearance system, custom booking-form design, large-project mode, conditional questions, custom email templates, advanced insights, Linkhub analytics, increased entitlement limits, deposit fee differentiation, goods selling, Plus goods tools, goods fee differentiation, fee-savings dashboard, grandfathering, correct downgrade handling, accurate pricing and contractual documents, required web and mobile support.

Built through internal milestones; consumer sales stay unavailable until the complete commercial-readiness gate passes. Implementation estimates are challenged and any feature whose scope could materially delay launch is surfaced; approved features are never silently removed to meet a date.

## 16. Commercial readiness

Plus is launch-ready only when the complete package is implemented, server-enforced, tested, operationally enabled, correctly grandfathered, accurately documented, reflected in final Terms, confirmed by the final counsel review, and protected by the billing activation gate (`consumer_sales_launch_approved`, recorded only after counsel sign-off). The confirmed legal architecture is not reopened during feature implementation; the final implementation-specific legal documents are still signed off before consumer activation.

The canonical Plus capability registry (companion artifact) records for every sellable capability: customer-facing name, internal entitlement key, product area, Free behavior, Plus behavior, legacy behavior, scope, server enforcement, database enforcement, frontend behavior, mobile support, downgrade behavior, fee impact, analytics events, pricing-page claim, Terms claim, operational capability state, test coverage, launch readiness. It exists to detect divergence between marketing, pricing, Terms, checkout, entitlements, production capability flags, server enforcement, and mobile behavior.
