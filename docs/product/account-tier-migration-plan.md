# Account tier migration plan

**Status:** Phased plan, 2026-07-23 (roadmap slice BM-2.0). Not executed. Companion to `docs/product/account-and-entitlement-system.md`. No broad migration or production change was performed by the audit that produced this plan.

Guiding constraints (from the audit brief and the repository conventions): preserve all existing user data, do not break current production access, do not rename or remove database fields during the audit, do not introduce overlapping entitlement systems, do not rely on Stripe product names as internal identifiers, do not rely on frontend-only checks, do not overengineer the first production version, do not create a tier per edge case, keep naming in sentence case, no em-dashes.

The plan is additive and reversible at every phase. It preserves the existing architecture (the hybrid entitlement engine) and fills the gaps in an order that never leaves production in a half-gated state.

---

## Phase 0: decisions and terminology

**Goal.** Lock the vocabulary and the founder decisions that everything downstream depends on. No code.

**Systems affected.** Documentation only (`docs/product/*`, `docs/business-model.md`, `DECISIONS.md`).

**Work.**

- Confirm the ten-concept model and the resolution order (this document set).
- Resolve the founder decisions that block implementation: D6 (build billing now or comp during beta), D3 (studio is a scope, not an account type), D17 (billing web-only), D22 (fix the goods take before unparking), and the Q8 studio pricing question.
- Freeze the entitlement key vocabulary, including the proposed keys (`goods_addons`, `studio_profile`, `studio_hosting`, `featured_placement`, `reminder_customization`), and the rule that keys are stable across price and tier-name changes.

**Schema changes.** None.

**Compatibility risk.** None.

**Rollback.** Not applicable (documentation).

**Tests.** None.

**Founder decisions required.** D3, D6, D7, D8, D12, D17, D22, and Q8 (see the decision register in `docs/product/account-tier-audit-findings.md`).

**User impact.** None.

---

## Phase 1: shared entitlement vocabulary

**Goal.** Make the entitlement engine express everything the tier model needs (numeric limits, scope, the proposed keys) without changing any gate behavior. This is the recommended first implementation phase.

**Files and systems affected.** `packages/shared/src/entitlements.ts` (the pure engine), `apps/web/src/lib/entitlements.ts` (re-export shim), the entitlements test.

**Work.**

- Extend `ENTITLEMENT_FEATURES` with the frozen key set, keeping the existing six unchanged.
- Add a limits model: a `limitFor(o, key)` returning a number or null (unlimited), alongside the boolean `canAccess`, so caps (fields, trips, studios) are expressible. Default limits come from a tier-to-limits map, overridable per account, mirroring the existing tier-to-features and override design.
- Add a `scope` concept to the types so a future studio-scoped holder resolves through the same engine.
- Fix the PlanTier-widening footgun: an unknown tier still resolves to free, but log or type it so a future `studio` value is a deliberate addition, not a silent downgrade.

**Schema changes.** None (the engine is pure; storage extension is Phase 2).

**Compatibility risk.** Low. Purely additive to the engine; existing `canAccess("deposits")` behavior is unchanged. The engine is imported by client bundles, so keep it dependency-free.

**Rollback.** Revert the engine change; no data touched.

**Tests.** Extend `apps/web/src/lib/__tests__/entitlements.test.ts`: limits (default, override, unlimited), scope resolution, the widening guard, and that the existing six-feature behavior is byte-identical.

**Founder decisions required.** The frozen key set and default limit numbers (D5, and the free-cap numbers).

**User impact.** None.

---

## Phase 2: central entitlement resolver

**Goal.** Make the resolver the single source of truth, reconcile the two paywall systems, and fix the mobile predictor drift. No new gates enforced yet.

**Files and systems affected.** `apps/web/src/lib/entitlements-server.ts`, `apps/web/src/lib/features.ts`, `apps/web/src/app/api/mobile/me/route.ts`, `apps/mobile/src/components/booking/BookingActions.tsx`, `apps/web/src/lib/server/bookings.ts`.

**Work.**

- Bridge `profiles.settings.features` (goods, bio modules, checkout add-ons) into the entitlement engine so there is one answer to "what does Plus gate". Keep the columns for backward compatibility; read them through the engine. Retire the direct `features.ts` reads in a later phase once goods is fully migrated (Phase 10).
- Fix D19: expose one server-computed "will route to card" predictor that both web and mobile consume, so the three-factor deposit gate (capability, entitlement, Connect routing) can never drift again. Update `BookingActions.tsx` to consume it (or `me.canCollectDeposits`), removing the entitlement omission.
- Add the account-status active check to the gated-action path and `requireMobileUser` (finding 9), so a suspended account cannot act with an in-flight token.

**Schema changes.** None yet (the storage extension for limits and subscription state is Phase 6, when billing needs it; until then limits live in the tier-to-limits map and per-account overrides in the existing jsonb).

**Compatibility risk.** Medium. The mobile fix changes displayed copy for any Connect-active free artist; because all current Plus accounts are comps, reachability is low today, but the fix must ship before any paid tier. The account-status check must be verified not to lock out legitimately active accounts.

**Rollback.** Revert the resolver and client changes; the deposit gate itself is unchanged, so money behavior is safe throughout.

**Tests.** Unit tests for the combined predictor; a mobile-vs-web parity test asserting both surfaces predict card-vs-manual identically across the free-connected, plus-connected, and capability-paused cases; a suspended-account access test.

**Founder decisions required.** None new.

**User impact.** Mobile stops misleading a Connect-active free artist about card collection. No feature is added or removed.

---

## Phase 3: server-side enforcement

**Goal.** Wire the five inert entitlements to their authoritative server layers, so the Plus feature set is real before Plus is sold.

**Files and systems affected.** Branding: `apps/web/src/app/[slug]/page.tsx` (the footer). Custom templates: the email-template edit action and `email_templates` read. Caps: the custom-field, trip, and studio create actions and their mobile routes. Analytics: `apps/web/src/app/api/mobile/analytics/route.ts` and the web analytics surface. Each gated at the server core or route, with the UI mirroring the result.

**Work.**

- `branding`: gate the "Powered by inklee" footer removal toggle and render.
- `custom_templates`: gate full-edit; the default template always sends (never paywall deliverability).
- `extra_fields`, `extra_trips`: enforce `limitFor` on create; over-cap items become read-only, never deleted.
- `analytics`: gate the Plus analytics depth; the free dashboard stays.

**Schema changes.** None (limits and flags already exist through the engine).

**Compatibility risk.** Medium to high. These features are free today; gating them is a takeaway for existing free artists. This phase must not ship before the grandfathering decision (D14): existing over-cap free artists keep their items read-only, and the branding and template gates apply only to new changes, not by wiping existing customizations.

**Rollback.** Each gate is behind the engine; revert per feature. No data destroyed (over-cap items are read-only, not removed).

**Tests.** Per-feature: free artist is gated, entitled artist is not, over-cap items remain readable and editable-to-remove but not addable, emails always send, the free dashboard always renders.

**Founder decisions required.** D14 (downgrade and grandfathering), and the free-cap numbers.

**User impact.** Existing free artists who exceed a future cap keep their items (read-only). New free artists hit the caps. This is the first phase with real user-visible tiering, so it is sequenced after Phase 2 and gated on the grandfathering decision.

---

## Phase 4: database and RLS enforcement

**Goal.** Add the invariant backstops the DB is good at, without attempting a full RLS entitlement gate (which buys little, because the enforced write paths are already service-role).

**Files and systems affected.** New migration; `apps/web/supabase/seed.sql` mirror.

**Work.**

- Keep the existing backstops (no client write path to deposit columns, RPCs locked to service role, `account_overrides` service-role-only).
- Add unique-index caps only where a hard invariant is wanted (the `studio_signals` month-cap pattern is the template), not as an authz gate.
- If (and only if) a DB-enforced entitlement is later required, add a `security definer` `has_entitlement(feature)` boolean helper mirroring `is_studio_owner` (search_path pinned, granted to authenticated, returns only a boolean), and bind it via a `BEFORE INSERT` trigger on the relevant client-role write path. Not recommended for the current deposit path, because that write is already service-role and RLS would not fire.

**Schema changes.** Additive migration only. Respect the column-grant plus seed.sql discipline: any new client-writable column needs an explicit `GRANT` in the same migration and a matching seed.sql update. Per AGENTS.md, do not `migration repair --status applied`; run for real and verify with `pg_policies` and a role-switched rolled-back probe.

**Compatibility risk.** Medium. The migration-repair history is the specific reason to verify effects exist before trusting bookkeeping. A never-exercised entitlement policy is the exact failure mode of the 2026-05 RLS incident.

**Rollback.** Additive migration; drop the added index or helper. No data loss.

**Tests.** A role-switched rolled-back probe per new policy or helper, asserting an artist JWT cannot bypass the invariant.

**Founder decisions required.** None new.

**User impact.** None (backstops only).

---

## Phase 5: frontend and navigation integration

**Goal.** Surface the wired entitlements in navigation, upgrade prompts, and the account UI, consistently across web and mobile, with the server always authoritative.

**Files and systems affected.** `apps/web/src/components/app-shell/nav-config.ts`, the dashboard, a new "your plan" surface, mobile settings.

**Work.**

- Add a read path for the artist's own effective entitlement state (today `account_overrides` is service-role-only and unreadable by the artist; expose a curated `/me`-style read, never the admin notes or budget).
- Add subtle, dismissible upgrade prompts at the natural triggers (cap reached, wanting card deposits), and a "manage your plan on inklee.app" surface on mobile with no in-app purchase call-to-action (D17).
- Emit the conversion funnel events (`pricing_viewed`, `cap_reached`, `plan_selected`) from Phase 3 of the unit-economics plan.

**Schema changes.** None.

**Compatibility risk.** Low.

**Rollback.** Revert UI; no data touched.

**Tests.** The self-plan read never exposes admin-only fields; the mobile surface shows no in-app purchase link on iOS.

**Founder decisions required.** Upgrade-prompt copy and placement.

**User impact.** Artists can see their plan and the upgrade triggers. Still no purchase (that is Phase 6).

---

## Phase 6: Stripe synchronization (subscription billing)

**Goal.** Make Plus purchasable. Add the Stripe subscription object graph and the webhook reconciler that writes the internal subscription state, keeping `canAccess` unaware of Stripe.

**Files and systems affected.** New Stripe Customer and recurring Price setup (test mode first), a Checkout or Payment Element flow (web only), a Billing Portal, `apps/web/src/app/api/stripe/webhook/route.ts` (new event branches), `account_overrides` (new columns), a new reconciler cron.

**Work.**

- Introduce a Stripe Customer per subscribing artist (orthogonal to the Connect account; the Customer pays Inklee, the Connect account receives deposits).
- Create recurring Prices for Plus (monthly and yearly) and later Studio. Store `stripe_price_id` as a reference, never as the internal identifier.
- Add to `account_overrides`: `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `subscription_status`, `current_period_end`, `cancel_at_period_end`. Extend `plan_source` to `comp | paid | store | grandfathered | beta`.
- Add webhook branches: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid|payment_failed`. Each is idempotent and converges to a target: write the resolved `subscription_status` and `plan_tier` from the event payload's current truth, never increment or toggle. Reuse the existing `event.id`-dedup and conditional-update patterns from the deposit webhook.
- Add a daily reconciler cron that lists Stripe subscriptions and re-derives `plan_tier` to self-heal missed or redelivered webhooks, and handles `plan_expires_at` versus `current_period_end` drift and the `past_due` grace policy (D13).

**Schema changes.** Additive columns on `account_overrides`, with the column-grant and seed.sql discipline (the table is service-role-only, so no client grant is needed, which simplifies this).

**Compatibility risk.** Medium. This is a new object graph, not an extension of the deposit flow; do not conflate the deposit Connect account with the billing Customer. Test-mode first, founder dogfood before any public exposure (BM-2.6).

**Rollback.** The subscription columns default to null and resolve to Free, so an incomplete rollout leaves every artist Free. Disable the Checkout entry point to stop new purchases; existing comps are unaffected.

**Tests.** Webhook idempotency and convergence per event; the reconciler self-heals a missing webhook; a canceled subscription keeps access until `current_period_end` then drops to Free; a `past_due` subscription keeps access through the grace window then drops.

**Founder decisions required.** D5, D6, the final Plus price and billing intervals, the founder-window offer, the `past_due` grace length (D13), and the OSS VAT and Stripe Tax setup (business-model section 6).

**User impact.** Plus becomes purchasable on the web. Comped artists are unaffected; their comps continue until expiry.

---

## Phase 7: mobile parity

**Goal.** Bring mobile to full parity for the wired entitlements while keeping billing web-only.

**Files and systems affected.** `apps/mobile/*` (settings, the plan surface, any newly gated feature UI), `packages/shared/src/mobile-api.ts` (additive wire fields).

**Work.**

- Consume the combined "will route to card" predictor (already fixed in Phase 2).
- Reflect the new gated features (branding, templates, caps, analytics) in mobile UI, hiding paid entry points, with the server enforcing.
- Keep the app purchase-free: a "manage your plan on inklee.app" surface with no in-app purchase call-to-action on iOS (D17). `plan` stays typed `string` on the wire so a future `studio` value decodes safely; rendering it still needs a release.

**Schema changes.** None (wire fields are additive; follow the `clientAtLeast` emission rule for any new money shape).

**Compatibility risk.** Medium. No OTA: any client-rendered gate needs a native build and store review. Old builds keep their compiled logic forever, so enforcement stays server-side and the capability plane remains the only fast remote lever.

**Rollback.** Ship a new build; server enforcement means old builds fail safe.

**Tests.** Mobile-vs-web parity for every wired gate; no in-app purchase link on iOS; old-build decode safety for a new tier value.

**Founder decisions required.** Whether in-app upgrade is ever wanted (if so, budget StoreKit and Play Billing plus receipt reconciliation into `account_overrides` with a `store` source).

**User impact.** Mobile shows the same tiering as web; still purchases only on the web.

---

## Phase 8: legacy-account migration

**Goal.** Reclassify existing comps and preserve early-adopter access, with no data loss.

**Files and systems affected.** A one-time script (not a schema migration), `account_overrides` rows.

**Work.**

- Reclassify existing beta comps from `comp` to `beta` (or `grandfathered` where a preserved price is promised), so conversion analysis can distinguish them from future paid grants (D11).
- Preserve grandfathered pricing by assigning the preserved Stripe Price id and `plan_source = 'grandfathered'`; entitlement keys are unchanged.
- Verify no existing artist loses access during the reclassification (the resolved `plan_tier` and expiry stay the same; only `plan_source` and the new subscription columns change).

**Schema changes.** None (data reclassification only).

**Compatibility risk.** Low, if the resolved tier is held constant. Run against a snapshot first; the reclassification must be a no-op for `effectivePlanTier`.

**Rollback.** The audit log records the prior `plan_source`; restore from it.

**Tests.** Assert `effectivePlanTier` and `canAccess` results are identical before and after for every affected row.

**Founder decisions required.** Which early cohorts are grandfathered and at what preserved price.

**User impact.** None (access is held constant; only the internal source label changes).

---

## Phase 9: monitoring and tests

**Goal.** Make conversion, churn, and margin measurable, and add the automated test suite required before migrating production accounts.

**Files and systems affected.** New `account_override_history` table, a `plan_changed` event, `booking_requests` (persist collected fee and Stripe cost), the growth cockpit, the e2e suite.

**Work.**

- Add the plan-change event and history table (D20) so comp-to-paid and self-serve conversions and churn are measurable.
- Persist `platform_fee_collected_cents` and `stripe_fee_cents` per deposit at settlement (D21) and add cockpit revenue and net-margin tiles.
- Add a comp-expiry and subscription-renewal signal (a metric and optionally a lifecycle email), closing the silent-lapse gap.
- Build the tier test matrix (below) before any production account is migrated.

**Schema changes.** Additive: the history table and the two per-deposit cost columns (with the settlement writer).

**Compatibility risk.** Low (additive instrumentation).

**Rollback.** Drop the additive columns and table; no behavior depends on them.

**Tests.** The full tier test matrix (section on testing below).

**Founder decisions required.** None new.

**User impact.** None (instrumentation).

---

## Phase 10: removal of deprecated checks

**Goal.** Retire the parallel paywall system and any dead scaffolding once everything reads through the entitlement engine.

**Files and systems affected.** `apps/web/src/lib/features.ts` and its `profiles.settings.features` reads, once goods is fully on the entitlement engine.

**Work.**

- Migrate goods (`goods_module`, `checkout_addons`) onto entitlement keys; retire the direct `features.ts` reads.
- Remove the dead `bio_page_modules` placeholder or repurpose it as a real entitlement, per the founder FREE decision for the bio hub.
- Retire `plan_source = 'paid'` as a manual label once billing writes it from purchases.

**Schema changes.** Optionally deprecate (do not drop during the audit) the `settings.features` jsonb keys after a soak period.

**Compatibility risk.** Low if sequenced last, after goods is verified on the engine.

**Rollback.** Keep the old readers behind a flag for one release before removal.

**Tests.** Goods gating parity before and after the migration off `features.ts`.

**Founder decisions required.** D16 (retire or bridge the feature-flag system).

**User impact.** None (internal consolidation).

---

## Testing requirements

The minimum automated test matrix before migrating production accounts. Rows are account states, columns are surfaces.

Account states to cover: unauthenticated visitor, free artist, Plus artist (comp), Plus artist (paid), studio owner, studio admin (future), studio artist (future), guest artist, beta user, grandfathered user, complimentary user, past-due subscriber, canceled subscriber before period end, expired subscriber, suspended account, admin, superadmin (if ever added).

Surfaces to test per state: route access, UI visibility, API access (web and mobile), database access (RLS probe), background jobs, email automation, billing transitions, upgrades, downgrades, studio membership changes (future), cross-studio data isolation (future), mobile parity, offline or stale mobile entitlement state, and administrative overrides.

The load-bearing tests that must pass before any production migration:

1. A free artist with Connect routing gets a manual deposit and is told so, on both web and mobile (the S1 fix).
2. A comped Plus artist gets a card deposit; an expired comp drops to manual, no data lost.
3. Every wired Plus gate: free is gated, entitled is not, over-cap items are read-only not deleted, emails always send.
4. The subscription webhook is idempotent and converges to a target; a redelivered event changes nothing.
5. A canceled subscription keeps access until `current_period_end`, then Free; a `past_due` keeps access through the grace window.
6. A suspended account cannot act on web or mobile with an in-flight token.
7. Cross-artist and (future) cross-studio data isolation holds against a hand-crafted PostgREST call.
8. The self-plan read never exposes admin notes, budget, or another artist's state.

---

## Future-feature registration process

Every new feature must declare its access and business-model definition before release. Copy this template into the feature's spec or the pull request description.

```markdown
### Feature access and business-model definition

- Feature name:
- Entitlement key: (existing or proposed; must be stable across price changes)
- Account scope: (artist | studio | booking | platform)
- Required roles: (self | studio owner | studio manager | admin)
- Included tiers: (Free | Plus | Studio | add-on | internal)
- Limits: (boolean | numeric cap | none)
- Feature-flag requirements: (env gate | kill switch | none)
- Platform support: (web | android | ios | tablet)
- Enforcement points: (which server core or route is authoritative; which UI mirrors it)
- Upgrade behavior: (what triggers the upgrade; the degrade-vs-error fallback)
- Downgrade behavior: (what happens to existing data; read-only vs revert vs retain)
- Analytics event: (the event that measures adoption or conversion)
- Tests: (the gate tests added)
- Documentation update: (the matrix row added)

### Business-model definition

- Customer segment:
- Business-model role: (acquisition | activation | retention | conversion | expansion | transaction | network | trust-safety | internal | cost-driver)
- Paying entity:
- Revenue mechanism:
- Pricing metric:
- Commercial package:
- Natural upgrade trigger:
- Expected conversion impact:
- Expected retention impact:
- Expected network effect:
- Cost driver:
- Commercial rationale: (a concrete argument, not "this feels premium")
- Evidence supporting the packaging decision:
- Metric that will validate or invalidate the decision:
```

## Pull request checklist item

Add to the repository pull request template:

```markdown
- [ ] For any new user-facing feature: an access definition and a business-model
      definition are declared (see docs/product/account-tier-migration-plan.md),
      the feature has an explicit owner row in docs/product/account-tier-feature-matrix.md,
      and its authoritative enforcement layer is a server core or route, not UI-only.
```

A feature must not merge without both definitions. This prevents the recurrence of the current situation, where five entitlement features shipped with an admin UI but no enforcement and no owner in a matrix.

---

## What this plan deliberately does not do

- It does not build studio membership, seats, or roles. That is greenfield, gated on Q8, and out of scope until multi-artist studios are a decided product.
- It does not build in-app purchase (StoreKit or Play Billing). Billing stays web-only unless the founder decides otherwise.
- It does not add a DB-level entitlement gate on the deposit path, because that write is already service-role and RLS would not fire; the DB stays a backstop for invariants.
- It does not rename or drop any existing field. Every change is additive; deprecation of `settings.features` happens only after a soak, and only in the final phase.
- It performs no production migration. This document is the plan; execution is a separate, founder-approved sequence.
