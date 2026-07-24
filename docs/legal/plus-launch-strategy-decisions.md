# Inklee Plus — Launch strategy decisions

**For:** founder, management board, legal counsel, accountant.
**From:** strategy review (business case + compliance).
**Date:** 2026-07-24.
**Status:** Founder decisions recorded. Each decision below is chosen; the
"Triggers" lines are the concrete follow-ups that must land before live billing.

This sheet resolves the three open actions from the B2B sign-off business-case
review. It is authoritative where it differs from the earlier B2B-first framing:
decision D1 changes the launch posture from B2B-only to consumer-first, and the
downstream effects on `b2b-signoff-package.md`, `counsel-decision-pack.md`, and
`eu-billing-posture.md` are listed in section "What these change" at the end.

Companions: `docs/business-model.md` · `docs/legal/billing-decision-pack.md` ·
`docs/legal/eu-billing-posture.md` · `docs/legal/counsel-decision-pack.md` ·
`docs/legal/b2b-signoff-package.md`.

---

## D1 — Launch posture: consumer-first, no business-use declaration (chosen: option C)

**Decision.** At launch, treat every Plus buyer as a **consumer**. Drop the
business-use declaration from the v1 checkout. Collect a VAT-ID only as an
**optional** field for buyers who want a proper invoice; it is not a gate and not
a condition of purchase.

**Rationale.** Plus is a €3 indie upgrade sold to solo, often early-career,
Instagram-first artists (`business-model.md` §1) — a consumer-shaped sale.
Consumer treatment is always safe (a business is never under-protected by
receiving consumer rights), it removes the checkbox friction that fights the
"almost frictionless / not business software" positioning, and it stops excluding
any artist who won't self-declare as a business — which, because deposits are
Plus-gated, would otherwise also lock them out of in-app deposits.

**Consequences.**
- The **consumer gate is the launch path**, not a later phase. The Article 11a
  withdrawal function, the C1 digital-service classification (already answered),
  the durable-medium confirmation, and time-based proration are launch
  prerequisites, not polish.
- The `business_declaration_approved` key and its conflicting-signal /
  manual-review machinery are **not needed for v1** (deferred, not deleted — a
  future explicit B2B/studio tier can reintroduce it).
- VIES verification becomes **optional invoice enrichment**, not a
  classification gate.

**Triggers (before live billing).**
- Build/verify the withdrawal function, durable confirmation, and proration
  (b2c gate keys: `consumer_withdrawal_copy_approved`,
  `withdrawal_function_operational`, `durable_confirmation_operational`,
  `proration_policy_approved`, `consumer_refund_creditnote_tested`).
- Record `consumer_classification_approved` = digital service (per C1).
- Consumer (VAT-inclusive) price display approved
  (`consumer_pricing_display_approved`).

---

## D2 — VAT posture: stay unregistered, drop reverse-charge wording (chosen: option A)

**Decision.** Remain **not VAT-registered** in Estonia for launch. Do **not**
assert a reverse-charge treatment on invoices or in the Terms. Plus supplies are
issued as outside/without Estonian VAT on the basis of the small-undertaking
below-threshold status; no VAT line, no VAT number, no reverse-charge note.

**Rationale.** Lowest overhead while the buyer base is mostly domestic solo
artists; avoids periodic filings and keeps the launch light. Cross-border B2B
services do not count toward the €40,000 Estonian domestic threshold, so high
volume does not by itself force registration.

**Consequences / accepted trade-offs.**
- No input-VAT recovery on tooling spend (Vercel, Supabase, Stripe, etc.) while
  unregistered.
- Cross-border studio buyers cannot self-account via a stated reverse charge;
  the invoice reads as a non-VAT-registered supply. Acceptable at launch given
  the solo-artist focus; revisit if studio/cross-border B2B volume grows.
- The invoice/Terms reverse-charge language reviewed earlier must be **replaced**
  with correct non-registered wording (removes the reverse-charge vs
  `ee-unregistered-v1` inconsistency flagged in the sign-off review).

**Triggers (before live billing).**
- Management board approves the active tax posture
  (`tax_policies.management_board_approved`), accountant review recorded as
  evidence (not a separate accountant sign-off — billing-pack amendment 2).
- Accountant confirms the exact document note for a non-VAT-registered supply
  (e.g. "VAT not applied — supplier is a non-registered small undertaking,
  Estonia"), per customer class, and the OSS position for any future consumer
  cross-border sales.
- Update Terms (section 11) and `invoice_config` to the non-registered wording;
  the change re-rolls the Terms version hash and re-closes `terms_approved`.
- Define a future **registration trigger** with the accountant (revenue/volume
  point at which to revisit D2) so the "stay unregistered" choice is bounded, not
  permanent by default.

---

## D3 — Launch discipline: honor the existing Phase-1 gate (chosen: option A)

**Decision.** Do not flip live billing on until the existing Phase-1 validation
criteria are met: **≥2 real artists actively using the free product, 4 weeks of
reliable Plausible data, and no critical bugs in the last 14 days**
(`business-model.md` §9). Building the minimal billing layer early is justified
by the deposit-gating dependency; **charging** waits for validated adoption.

**Rationale.** Adoption is the moat; pricing shipped before adoption kills it
(the founder's own Phase-1 risk note). The deposit-gating decision warrants
having the layer built, not switched live, ahead of proof.

**Triggers.**
- Verify the three criteria before recording `stripe_prod_verified` / enabling
  live mode.
- If circumstances have changed (e.g. committed early adopters ready to pay),
  **re-baseline the gate explicitly in `business-model.md`** rather than letting
  it drift — a recorded decision, not an accident.

**Re-baselined 2026-07-24 (founder decision).** The gate is softened: **3 artists
are onboarded** (satisfies >= 2) and the **system is stable, no critical bugs**;
the **4-weeks-of-data** requirement is **waived** for launch (data matures
post-launch). Go-live is no longer time-gated on data maturity. Recorded in
`docs/business-model.md` §9. Still not sufficient on its own: the b2c gate keys +
a live Stripe Price + live mode remain the technical/legal path to a live charge.

---

## Combined effect

Consumer-first launch (D1) + unregistered/no-reverse-charge (D2) + Phase-1
discipline (D3): resolves the positioning mismatch (no business gate on an indie
product), removes the reverse-charge inconsistency, and keeps live charging
behind proven adoption. The engineering already built (Stripe-native billing,
gates, isolation) stands; the change is which gate is the launch gate (b2c, not
b2b) and which invoice wording is correct (non-registered, not reverse-charge).

## What these change in existing docs (for follow-up, not yet edited)

- `b2b-signoff-package.md`: key 2 (`business_declaration_approved`) deferred out
  of the v1 launch set; keys 1/3 invoice + Terms wording move from reverse-charge
  to non-VAT-registered; the launch gate becomes the b2c set.
- `counsel-decision-pack.md`: C3 (business declaration) deferred for v1; C4/C1
  consumer items promoted to launch-critical; C7 answer becomes "stay
  unregistered + defined future trigger"; C8 invoice-identity note updated to the
  non-registered wording.
- `eu-billing-posture.md` §8: the "declaration declined" open question is
  resolved — there is no declaration at v1; all buyers take the consumer path.
