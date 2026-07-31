# Plus commercial packages and the commercial-readiness gate

**Status:** founder-directed 2026-07-28 (launch HELD). **Owner:** founder.
**Scope:** the package definitions for every account posture, the provisional
Plus v1 boundaries, the grandfathering rules, and the commercial-readiness gate
that must pass before consumer sales open. Companion to
`docs/product/pricing-model.md` (what Plus costs) and
`docs/product/account-and-entitlement-system.md` (how entitlement resolution
works). The `DECISIONS.md` 2026-07-28 row is the ratified summary.

**Why this exists:** on 2026-07-28 the compliance gate stood 18/18 open while
the sold product did not deliver its promised package: `branding` (the Terms
§11 headline perk) was parked in production `DISABLED_CAPABILITIES`, and the
other three marketed capabilities were restriction-shaped, i.e. free for
everyone while paused. 18/18 compliance approvals are NOT sufficient when the
sold product does not deliver the promised feature package.

---

## 1. The six account postures

Every account resolves to exactly one base posture plus zero or more grants.
These are documented separately on purpose (founder rule): conflating them is
how "who gets what" questions become archaeology.

| Posture | What it is | Billing relationship |
|---|---|---|
| **New Free** | The default package for accounts created after Plus launches. Full core booking workflow; the boundaries in §2 apply. | None |
| **Plus** | The paid package (§2). | Stripe subscription, consumer contract |
| **`legacy_free_v1`** | Grandfathered existing free artists (§3). NOT Plus, NOT marketed as Plus. | None, and never coupled to Stripe |
| **Complimentary grant** | Admin-granted Plus-equivalent access with an explicit 6-month expiry (OQ-8, ratified 2026-07-25). Expiry sweep + notification are launch-adjacent build items. | None; expiry → founder-window offer |
| **Beta grant** | Time-boxed access to a specific pre-release capability for named testers. Scoped to the capability, not the tier. | None |
| **Administrative override** | A per-account `account_overrides` row changing one dimension (tier, cap, flag) with a reason. The escape hatch, never the mechanism of a cohort policy. | Varies |

The resolver must expose the provenance of every grant: for any account, "why
does this account have X" must be answerable from the resolution result alone
(base posture + which grant), never from scattered account-age or created-at
checks.

## 2. Minimum sellable Plus v1 (SUPERSEDED same day by the full-package directive)

> **SUPERSEDED 2026-07-28 (later the same day):** the founder confirmed the
> FULL Plus package and a full-package launch posture: no reduced v1, no
> coming-soon promises. The complete package definition now lives in
> **`docs/product/plus-product-spec.md`** (positioning, Inklee page + 4
> templates, shared appearance system, booking-form customization,
> large-project mode, Linkhub analytics, goods + fee differentiation, savings
> dashboard, refund-fee policy). The boundaries below remain useful as the
> per-capability enforcement bars (the branding/templates/analytics/caps
> sections still describe what "enforced" means), but the LAUNCH SCOPE is the
> spec's §15 package, not this minimum. The caps table below previously kept a
> conflict flag reading "still provisional, still awaiting the founder's caps
> ruling." **RESOLVED 2026-07-31 (founder Ruling 3):** the table has been
> reconciled to the ratified numbers (3/30 fields, 3/100 trips, 5/50 studios,
> 3/25 active goods products); no conflict remains. `CANONICAL_CAPS` in
> `packages/shared/src/entitlements.ts` is the single source; nothing in this
> document should restate different numbers.

### Branding

| | Free | Plus |
|---|---|---|
| "Made with Inklee" footer on public pages | visible | may be removed |

Enforcement bar: the entitlement must control the **authoritative rendered
output** (server-rendered public pages, booking forms, cached pages, mobile
previews), not an editor toggle. `branding` is un-parked in production only
after entitlement enforcement is verified end to end across those surfaces.

### Custom templates

| | Free | Plus |
|---|---|---|
| Default Inklee email templates | yes | yes |
| Normal transactional delivery | yes | yes |
| Custom subject lines / body content / reusable templates | no | yes |

Enforcement bar: the server rejects unauthorized custom-template **mutations**.
UI hiding alone is not enforcement. Essential booking communication is never
degraded for Free: the default templates always send.

### Analytics

| | Free | Plus |
|---|---|---|
| Basic operational totals (current bookings, requests) | yes | yes |
| Trends, time comparisons, advanced breakdowns, deeper insights | no | yes |

The exact Free/Plus boundary must be **defined before enforcement** (open item
below). Hard rule: never paywall access to raw records that belong to the
artist (their bookings, their clients, their data exports).

### Entitlement limits (ratified numbers)

> **CORRECTED 2026-07-31 (founder Ruling 3).** This table previously showed a
> different, lower set of numbers (Custom fields 5/30, active trips 1/10,
> studio-library 5/50) with a note claiming that set was "the founder's newer
> provisional instruction" superseding the 2026-07-25 ratification (OQ-4) and
> the numbers already advertised in `PLUS_BENEFITS` and enforced in
> `CANONICAL_CAPS`. That claim had it backwards: nothing ever superseded the
> 2026-07-25 ratification, and Plus trips 10 would have been a REDUCTION of an
> already-advertised benefit of 100. The table below is now the ratified set,
> re-confirmed by the founder 2026-07-31 (Ruling 3). `CANONICAL_CAPS` in
> `packages/shared/src/entitlements.ts` is the single source of truth; nothing
> should restate different numbers again.

| Capability | Free | Plus |
|---|---:|---:|
| Custom fields | 3 | 30 |
| Active or upcoming trips | 3 | 100 |
| Historical trips | Unlimited | Unlimited |
| Studio-library items | 5 | 50 |
| Active goods products | 3 | 25 |

The studio-library limit applies to the artist's saved-studio library only. It
must NOT apply to: studio ownership, studio memberships, claimed studio
listings, map visibility, historical operational records, bookings, clients,
studio locations, or guest-artist relationships. **If the implementation cannot
distinguish these cleanly, the limit returns to the founder before any
enforcement** (explicit instruction). What one "library item" is in schema
terms is documented from the dry run before the cap is applied.

## 3. Grandfathering (`legacy_free_v1`)

Rules (founder 2026-07-28, all binding):

- Preserves existing data, approved legacy access, and current configurations.
- Separate from Plus and separate from Stripe, permanently.
- Restored after a later Plus cancellation (buy Plus → cancel → back to
  `legacy_free_v1`, not to New Free). Note this refines OQ-11's "reverts to
  Free" for the grandfathered cohort specifically.
- Does NOT automatically include future Plus features.
- Never implemented as scattered account-age checks; one resolver, provenance
  exposed.
- Grandfathered users may retain capabilities New Free users lack. That
  asymmetry is accepted explicitly: existing functionality is not clawed back
  to create an upgrade incentive, and grandfathered users are not marketed as
  Plus.

**Enforcement of the §2 limits waits for the dry-run report** covering:
eligible-cohort size, current custom-template use, current analytics access,
custom-field counts, active-trip counts, studio-library counts, accounts above
the proposed limits, accounts whose behavior would change, and active
client-facing flows at risk. The founder reviews the report before any limit
goes live.

## 4. The commercial-readiness gate

A distinct gate beside the existing technical / accountant / counsel gates.
Plus cannot launch until EVERY marketed Plus capability has:

1. An explicit entitlement definition
2. Authoritative server enforcement
3. Correct frontend behavior
4. Defined downgrade behavior
5. Defined grandfathering behavior
6. Web and mobile parity
7. Automated tests
8. A pricing-page claim that matches the implementation
9. A current approved legal document that matches the implementation
10. Operational enablement in production

Hard failure conditions:

- A marketed capability is parked in `DISABLED_CAPABILITIES` → **fail**.
- A Plus capability is permissive for all Free accounts (no actual tier
  differentiation) and is not explicitly scoped to a grandfathered cohort →
  **fail**.

Verification is scripted (`scripts/billing/commercial-readiness.cjs`, build
item) against a canonical capability registry, and the launch criteria in
`DECISIONS.md` (2026-07-28 row) bind the flip to it.

## 5. Consumer billing control (corrected 2026-07-28)

Two separated concerns:

1. **Sales surface visibility** — `PLUS_CONSUMER_LAUNCH_ENABLED`
   (`apps/web/src/lib/plus-launch-config.ts`), UI only, may be cached.
2. **Server-authoritative billing authorization** — the b2c activation group in
   `billing_activation_approvals`, extended with the founder-recorded
   `consumer_sales_launch_approved` key. `createSubscriptionCheckout` asserts
   the full group before creating ANY Stripe object, so a direct route call, a
   stale client, a replayed request, or an accidentally-true constant cannot
   create a live consumer contract while the group is closed. Statutory paths
   (withdrawal, cancellation) and webhooks never assert the gate, so closing it
   cannot strand an existing subscriber's rights.

Launch = the founder records `consumer_sales_launch_approved` via
`scripts/billing/record-approval.cjs` (named approver + evidence), then flips
the UI constant. Rollback of the UI constant alone no longer leaves a live
money path exposed, and deleting the approval row re-closes billing
server-side.

## 6. Audit results (2026-07-28, 13-agent adversarial pass)

The enforcement audit and the grandfathering dry run ran the same day the gate
was directed. Facts that bind the open items:

- **Custom templates are ALREADY server-enforced** on both save paths (web
  action refuses pre-upsert; mobile 403s `not_entitled`), and the SEND path is
  deliberately never gated so saved templates keep working. The §2 requirement
  is met code-side; what remains is tests for the rejection paths and mobile
  handling of `not_entitled` (raw error today, no upsell).
- **Analytics enforcement was DEFINED BUT UNWIRED on 2026-07-28**:
  `canSeeAdvancedAnalytics` existed with ZERO production call sites; web
  `/analytics` and the mobile analytics route served the full metric set to
  free accounts. **CORRECTED 2026-07-31 (founder Ruling 5):** the boundary is
  now ratified (basic operational totals Free; Hub analytics + fee savings +
  goods sales trends Plus) and the gate is wired with real call sites —
  `canSeeAdvancedAnalytics` (`entitlement-gates.ts:147-149`) gates
  `getArtistHubAnalytics` (`artist-analytics-query.ts:20`), `getArtistFeeSavings`
  (`fee-savings-query.ts:12`), the web goods-sales page
  (`goods/sales/page.tsx:96`), and the mobile goods-sales route
  (`api/mobile/goods/sales/route.ts:75`). Un-pausing the capability now DOES
  change behavior. What remains is the activation step: `analytics` is still
  named in production `DISABLED_CAPABILITIES`, so free accounts keep seeing
  the full metric set until it is un-parked; that is a deliberate pause, not a
  wiring gap.
- **Caps are already enforced on ALL create paths** (web + mobile,
  count-before-insert, block-new/keep-existing), at the RATIFIED numbers: free
  3/3/5, plus 30/100/50 (plus active goods products, ratified 2026-07-28,
  free 3 / plus 25). At the time this audit was written, §2's table above
  showed a different, lower set of numbers and conflicted with these. **The
  founder did not adopt §2's numbers**; instead, Ruling 3 (2026-07-31)
  re-ratified the numbers already enforced here, and §2's table has been
  rewritten to match. No conflict remains, and no `legacy_free_v1` re-run was
  triggered by a Free-cap reduction, because none happened.
- **Branding enforcement verified server-side already**: footer server-rendered
  on all 5 public-page surfaces, fail-safe (a plan-read error keeps the
  footer), no client bypass; grandfathering correctly never grants it. What
  blocks un-parking is the §2 end-to-end verification pass (incl. cached pages
  and mobile previews), not missing enforcement code.
- **Marketing claims needing founder review**: "Take full appointment payments
  by card" has NO feature or code path anywhere (grep-empty; presumably a
  deposit-rails restatement); "fully customisable booking template" is backed
  only by the field-count cap. **RESOLVED direction 2026-07-31 (founder
  Ruling 2):** replace "fully customisable" with accurate wording and drop
  no-code-path claims; neither string is in the current `PLUS_BENEFITS` array
  (`packages/shared/src/plus-benefits.ts`), which already had both removed
  2026-07-28 pending genuine scope closure. Confirming no other surface
  (`/pricing`, plan pages) republishes them is the remaining copy-audit step.
- **Grandfathering dry run** (production, read-only): 19 profiles, 5 active
  non-tester artists, 4 already tagged `legacy_free_v1` (all
  `{custom_templates:true}`, empty limits), 0 further eligible. ZERO accounts
  have any custom template. Under §2's proposed caps (as they stood on
  2026-07-28, before Ruling 3 reconciled §2 to the ratified numbers) exactly
  ONE account exceeded anything: the founder's own tester (comp Plus). **Zero
  real free artists would change behavior.** Public booking forms cannot break
  at enforcement (create-time gating only; render path never slices).
- **Studio-library item defined**: one row in the `studios` table = the
  artist's personal trip-planner library. The founder's §2 exclusion list is
  cleanly excluded structurally (ownership/claims/map/bookings/clients live in
  disjoint tables the cap never touches; memberships and guest-artist
  relationships have no table yet). The 5/50 cap is implementable as specified.
- **Two residual money-path notes**: the Stripe Customer Portal's live config
  has subscription_update and pause disabled (verified), but hosted "Renew"
  can undo an at-period-end cancellation and a card update can revive
  `past_due` — post-purchase by design, uncoverable by a server guard, control
  = the portal configuration itself. And the billing webhook can flip an
  account to `plus` from Stripe state alone (an out-of-band Dashboard
  subscription on a customer with `artist_id` metadata) — Sentry-flagged,
  hardening option: validate the price id in reconcile.
- **Durable-confirmation gap (proposal, not applied)**: the confirmation
  artifact's `terms_version`/`payload_hash` columns exist but the insert omits
  them, so the consent row is the sole acceptance evidence. Should be closed
  before the first real purchase.

## 7. Open items

| Item | Owner | State |
|---|---|---|
| Caps table conflict: §2 provisional vs ratified/advertised 30/100/50 | **Founder** | RESOLVED 2026-07-31 (Ruling 3). Ratified 3/30 fields, 3/100 trips, 5/50 studios, 3/25 active products; §2's table rewritten to match. `CANONICAL_CAPS` (entitlements.ts) is the sole source. |
| **Cover image is listed Plus-only but has been a live Free feature for months** | **Founder** | RESOLVED 2026-07-31 (Ruling 1). Cover image is Free for all, not a grandfather-only carve-out for the pre-existing three. §6 and the registry's `form_custom` row updated accordingly. |
| Analytics Free/Plus boundary + WIRING the defined gate | Founder (boundary) + eng (wiring) | RESOLVED 2026-07-31 (Ruling 5): basic Free / advanced Plus. Gate wired (`canSeeAdvancedAnalytics`, 4 call sites, see §6 above). Remaining step is activation only: `analytics` stays in `DISABLED_CAPABILITIES` until un-parked. |
| "Full appointment payments" + "fully customisable template" claims | **Founder** | RESOLVED direction 2026-07-31 (Ruling 2): replace "fully customisable" with accurate wording, drop no-code-path claims. Both strings are already absent from `PLUS_BENEFITS`; confirming no other surface republishes them is the remaining copy-audit step. |
| Branding end-to-end verification pass | Eng | Stale; branding un-parked 2026-07-29 by founder confirmation |
| Dry-run report review | **Founder** | Delivered above; review closes it |
| Rejection-path tests (template save, mobile 403s, cap blocks) | Eng | DONE 2026-07-31; entitlement-gates.test.ts extended to 52 tests (all 10 gates x Free/Plus/paused/override) |
| Mobile `not_entitled` / `cap_reached` handling (upsell affordance) | Eng | DONE; `planBoundaryMessage` in 10 screens strips purchase steering per D17 (no in-app purchase direction) |
| Durable confirmation: stamp `terms_version` + `payload_hash` | Eng | DONE; `terms_version` from consent row + `confirmationPayloadHash` SHA-256 in withdrawal.ts |
| Parity-register rows for branding/templates/analytics gates | Eng | DONE; all 4 rows present in web-native-parity.md (branding L108, templates L109, caps L110, analytics L112) |
| `commercial-readiness.cjs` script | Eng | DONE 2026-07-31; `scripts/billing/commercial-readiness.cjs` |
| Comp-expiry sweep (OQ-8) | Eng | DONE 2026-07-31; daily sweep in cleanup cron, 14-day warning + expiry notification + email |
| Capability-registry drift (`capability-registry.md:46`) | Eng | DONE 2026-07-31; registry refreshed (5 rows updated, 2 added) |
