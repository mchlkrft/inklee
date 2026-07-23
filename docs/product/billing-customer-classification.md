# Billing customer classification

**Status:** Engineering design and repository audit. DRAFT for founder review, 2026-07-23. This is not implementation and not legal advice. Every consumer-facing string is DRAFT that requires qualified counsel approval. Nothing here is legal or tax approval; it is an engineering proposal that flags what counsel and an accountant must decide.

**Constraints honoured:** no live billing enabled, no VAT registration performed, no production pricing changed, no legal copy finalized.

**Label key:** every claim is tagged `CONFIRMED LEGAL REQUIREMENT` (framed as "counsel must confirm"), `CURRENT IMPLEMENTATION`, `RECOMMENDED IMPLEMENTATION`, `FOUNDER DECISION`, `ACCOUNTANT DECISION`, `LEGAL-COUNSEL DECISION`, `UNRESOLVED QUESTION`. Conventions: sentence case, no em-dashes.

Companion docs: `docs/legal/eu-billing-posture.md`, `docs/legal/eu-consumer-withdrawal-flow.md`, `docs/legal/vat-and-oss-architecture.md`, `docs/product/billing-activation-checklist.md`.

---

## 1. Current state (audit)

`CURRENT IMPLEMENTATION` Inklee has no customer classification of any kind today.

- `profiles` (`apps/web/src/db/schema.ts:53-99`) has no legal name, trading name, billing country, billing address, business-use declaration, VAT number, VAT status, tax treatment, customer-type, or withdrawal field. Its `stripeAccountCountry` is the artist's Connect payout country, not their billing country as Inklee's customer; the two can differ and must never be conflated.
- `account_overrides` (migration 0045, authored-not-applied 0105) holds tier, comps, grandfather, fee sponsorship, and the Stripe billing linkage only. None of it is a customer classification. It is service-role only (RLS enabled, zero policies).
- One `auth.users` = one `profiles` = one artist. No customer classification to inherit. Clients (booking customers) have no account.
- No terms-acceptance capture at purchase. `apps/web/src/lib/legal/documents.ts` computes a stable `version` + SHA-256 `versionHash` per legal doc, but `requiresAccept` is defined and unconsumed; there is no acceptance store.
- No Stripe Customer, Subscription, or Stripe Tax anywhere.

**This workstream is greenfield.** Everything below is additive and, per P0/P13, inert until the activation gate (`billing-activation-checklist.md`) is opened by counsel-recorded approvals.

---

## 2. Why four independent axes (never one field)

`CONFIRMED LEGAL REQUIREMENT` (counsel must confirm the buckets). EU law asks four genuinely different questions about the same buyer, and the answers do not move together:

1. **Contract customer type** (business vs consumer): governs whether the Consumer Rights Directive applies at all, including the 14-day withdrawal right, pre-contract information, and durable confirmation. It is about the purpose of the purchase, not tax registration.
2. **VAT customer status**: whether the reverse charge applies and how place of supply resolves.
3. **Tax treatment**: the resolved, effective-dated treatment (EE domestic, OSS destination, EU reverse charge, non-EU, exempt, manual review), derived from seller posture plus the customer axes plus evidence, but stored so it is reproducible.
4. **Withdrawal status**: the consumer withdrawal state for a specific contract, time-sensitive.

**The decisive example.** A German freelance tattoo artist buys Plus, truthfully declares business use, but has no VAT number (below the German threshold, very common in the target segment). Axis A = business; axis B = business without VAT (no reverse charge, because there is no VIES-valid number); axis C = OSS destination or EE domestic per policy; axis D = depends on A plus the immediate-performance request. A single `is_business` boolean would force axis B to follow axis A and apply an unlawful reverse charge and produce an unremittable invoice. **The axes must be stored separately because the law resolves them separately.** This is the core of P1.

---

## 3. The four axes: values, state, source

Each axis is a separate stored column with an explicit enum, an `unresolved` initial state, and a `manual_review` escape hatch. Finite internal vocabularies (contract type, source) get a DB CHECK; the externally-owned vocabularies (tax treatment, VIES status) stay app-validated so a future value cannot 500 a write (the migration 0105 `subscription_status` lesson). `FOUNDER DECISION` ratify the enum labels; `LEGAL-COUNSEL DECISION` confirm the buckets are complete.

- **Axis A contract customer type**: `unresolved | business | consumer | manual_review`. Set by `self_declaration` (checkout), `admin`, `risk_review`. Never `system_default` to anything but `unresolved`, and never derived from tier or role. VAT number is not required for `business`.
- **Axis B VAT customer status**: `unresolved | eu_vat_registered_business | business_without_vat | private_non_taxable | non_eu_business | manual_review`. The transition into `eu_vat_registered_business` is gated on a stored VIES `valid` result, so VIES downtime lands in `business_without_vat` or `manual_review`, never in the reverse-charge state (P2, enforced structurally).
- **Axis C tax treatment**: `unresolved | ee_domestic | oss_destination | eu_reverse_charge | non_eu | vat_exempt | manual_review`. Derived by the tax-policy engine (`vat-and-oss-architecture.md`) from axes A/B plus country plus the approved policy, but stored. No DB CHECK.
- **Axis D withdrawal status**: `not_applicable | eligible | expired | exercised | lost_where_legally_valid | manual_review`. Per contract, not per customer. The enum is defined here for a unified vocabulary; its storage and timestamps live on the withdrawal workstream's per-contract table (`eu-consumer-withdrawal-flow.md`), not on the per-artist profile. `lost_where_legally_valid` is never a blanket "you lose all rights immediately" (P3 forbids that); it defaults to never-reached until counsel defines it.

**Classification source** is stored per axis (`self_declaration | vies | admin | risk_review | system_default`), each with its own `*_source_at`, because axes are set by different sources at different times. Admin overrides additionally double-log to `admin_action_log` + `audit_log` (the existing pattern).

---

## 4. Storage design (with the compliance-review reconciliation)

`RECOMMENDED IMPLEMENTATION` A new table `account_billing_profile`, one row per artist (PK `artist_id`, FK to `profiles.id ON DELETE CASCADE`), **service-role only** (RLS enabled, zero policies, like 0045/0105). Do not overload `account_overrides` (that is the entitlement holder; coupling re-creates the auto-derivation P1 forbids, the lifecycles differ, and most accounts never get an overrides row). `FOUNDER DECISION` the table name (`account_billing_profile` recommended over `billing_customers`, since "customer" is overloaded by the booking-client model).

**Reconciliation of the review's F1 (own-row read would leak internal state).** A parallel spec proposed a shared `billing_customers` with buyer own-row SELECT. That is unsafe: an own-row read exposes internal classification outputs and anti-abuse provenance (`vat_customer_status`, `classification_source = risk_review`, `manual_review`). The resolved reconciliation: the whole profile stays **service-role only**, and the buyer's own non-sensitive billing data (their entered legal name, address, their invoices) is returned through a **curated server endpoint** (the pattern `/api/mobile/me` already uses for entitlements), never a raw own-row read. Internal outputs and provenance never leave the server.

The table stores: the four axes plus per-axis source and timestamp; declared billing identity (legal name, trading name, `billing_country` ISO alpha-2 which is never `profiles.stripe_account_country`, structured `billing_address`, the business-use declaration result plus its consent version, all collected at checkout); VAT evidence (`vat_number_submitted`, `vat_number_normalized`, `vies_status`, `vies_checked_at`, `vies_provider_ref`, raw `vies_response`); `location_evidence`; and a reference to the latest terms-acceptance consent row (not a re-stored copy of the version/hash, review F3). The Stripe Customer id lives on `account_overrides` (0105); join to it, do not duplicate a writable copy. Stripe Tax, when adopted, is calculation only, never the classification source of truth (P11); if Stripe disagrees with the stored axes, the stored axes win and the mismatch routes to `manual_review`.

`RECOMMENDED IMPLEMENTATION` a pure `packages/shared/src/billing-classification.ts` (enums, state helpers, `explainClassification` mirroring `explainFeature`), and a service reader `apps/web/src/lib/billing-classification-server.ts` that throws on query error (never silently defaults a classification, because a swallowed error resolving to `consumer/ee_domestic` could mis-charge VAT). A grep tripwire keeps `plan_tier` out of the classification reader so no axis is ever derived from tier.

`RECOMMENDED IMPLEMENTATION` migration numbering: authored after 0105 (account_overrides) and 0106 (goods orders), in one coordinated pass against the then-current head, one owner per file (review F2, the recurring collision lesson). Do not apply until the posture is ratified and counsel has reviewed consumer terms.

---

## 5. How classification is established (flow)

All server-authoritative; nothing computed only client-side.

1. Before checkout everything is `unresolved`; no row need exist for a free artist. Absence means "not classified", which the activation gate treats as cannot-charge-live.
2. At checkout (P2 collection): the buyer supplies legal name, trading name, billing country, full billing address, the separate unchecked business-use declaration (DRAFT), and optionally a VAT number. The server writes the row, sets axis A from the declaration, and records the terms consent (via the single consent table, referenced by id).
3. VIES validation (the VAT workstream owns the client): store the full evidence; axis B moves to `eu_vat_registered_business` only on `valid`; downtime lands in `business_without_vat` or `manual_review`, never reverse charge.
4. Resolve axis C: the tax-policy engine writes the resolved treatment plus policy version; unresolved becomes `manual_review` and blocks live charge.
5. Quote: one server-authoritative quote reads the classification and computes net/VAT/total; the display and the Stripe amount both come from it (P4).
6. Snapshot: at charge, freeze the axes plus evidence plus rate plus policy version into the immutable tax snapshot (P11). Later edits never mutate a past snapshot.

**Auto-derivation ban, enforced by construction.** No code path reads `plan_tier`, `profiles`, studio membership, or `is_tester` to set any axis. The only writers are the checkout step, the VIES client, the tax-policy resolver, the admin panel, and the risk process.

---

## 6. Decisions required

- `FOUNDER DECISION` table name; ratify the enum sets; whether to store `acceptance_ip` / `acceptance_user_agent` at all and their retention (the repo deliberately minimizes raw IP storage, so this is a founder plus counsel call); confirm classification collection stays web-only (D17).
- `ACCOUNTANT DECISION` which tax treatment is correct for the below-threshold Estonian posture and the OSS trigger; whether an EU business without VAT is charged destination VAT or the below-threshold non-charging posture; the approved active tax policy the gate requires before live.
- `LEGAL-COUNSEL DECISION` what evidence establishes "business" (axis A) and the legal weight of the self-declaration checkbox; whether a truthful business declaration alone removes the statutory withdrawal right; that the four buckets are complete and correctly bounded; the axis-D enum lawfulness including `lost_where_legally_valid`; the VIES-downtime posture; the lawful basis and retention for the acceptance IP/UA and the raw VIES response.
- `UNRESOLVED QUESTION` where axis D physically lives (recommended: the per-contract withdrawal table); whether a per-change `billing_classification_history` table is needed beyond the per-transaction snapshot; join vs denormalize `stripe_customer_id`.

---

## 7. Risks

Highest: silent auto-derivation creep (a future path sets an axis from tier or payout country for convenience). Mitigated by the service-role-only reader, the `explainClassification` provenance, and the grep tripwire, but needs review discipline. Wrong-default tax charge if a missing or errored row defaulted to `consumer/ee_domestic` (mitigated by the throw-on-error reader and by `unresolved`/`manual_review` blocking the gate). Reverse charge on VIES downtime (mitigated structurally). Payout-country vs billing-country conflation (mitigated by a distinct `billing_country`). Axis-D per-customer corruption if stored per customer instead of per contract (mitigated by per-contract placement). GDPR exposure of the raw VIES response and acceptance IP/UA (retention is a founder plus counsel decision, not a default).
