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

## 2. Minimum sellable Plus v1 (provisional, founder 2026-07-28)

Provisional until the legacy-usage dry run (§3) is reviewed; the caps table is
subject to that review by explicit founder instruction.

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

### Entitlement limits (provisional numbers)

| Capability | Free | Plus |
|---|---:|---:|
| Custom fields | 5 | 30 |
| Active or upcoming trips | 1 | 10 |
| Historical trips | Unlimited | Unlimited |
| Studio-library items | 5 | 50 |

> The 2026-07-25 ratification (OQ-4: 30 fields / 100 trips / 50 studios for
> PLUS) predates this table. Where they differ (Plus trips 10 vs 100), THIS
> table is the founder's newer provisional instruction, pending the dry run.

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

## 6. Open items

| Item | Owner | State |
|---|---|---|
| Analytics Free/Plus boundary definition | Founder + eng | Open; blocks analytics enforcement |
| Studio-library item definition + clean-exclusion feasibility | Eng (dry run) → founder | Open; blocks the library cap |
| Dry-run report review | Founder | Open; blocks all cap enforcement |
| Custom-template server enforcement | Eng | Open (§4.2) |
| Branding end-to-end verification | Eng | Open; blocks un-parking `branding` |
| `commercial-readiness.cjs` script | Eng | Open |
| Comp-expiry sweep (OQ-8) | Eng | Open, launch-adjacent |
