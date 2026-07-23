# Account tier audit findings

**Status:** Repository-grounded findings, 2026-07-23 (roadmap slice BM-2.0). Read-only audit; no code, schema, or production state was changed. Companion to `docs/product/account-and-entitlement-system.md`.

Every finding cites exact files, functions, tables, migrations, or routes. Confidence is stated. This document is an inventory and a risk register, not a plan; the plan is `docs/product/account-tier-migration-plan.md`.

Conventions: sentence case, no em-dashes.

---

## 1. The access-control axes that exist (and the ones that do not)

Six control axes exist and are routinely conflated. There is no seventh: no `role` column, no permission table, no membership, staff, or seat model. Every `role=` hit in source is an HTML or ARIA attribute; every `permission` hit is Stripe `StripePermissionError` handling.

| Axis | Decides | Store | Authority | Fail direction |
| --- | --- | --- | --- | --- |
| A. Admin role | `/admin` and admin actions | `ADMIN_EMAILS` env + AAL2 | `apps/web/src/lib/admin-guard.ts` | closed |
| B. Tier entitlement | feature access (`deposits` only, today) | `account_overrides` (0045) | `packages/shared/src/entitlements.ts`, enforced in `bookings.ts` | soft (degrade) |
| C. Per-artist feature flags | goods, bio modules, checkout add-ons | `profiles.settings.features` | `apps/web/src/lib/features.ts` | default-on (unused) |
| D. Env deployment gates | map, goods commerce, seed lane, email lifecycle | env vars | `map-features.ts`, `features.ts`, `server/app-config.ts` | closed |
| E. Account status | whole-account ban | Supabase auth `ban_duration`, mirrored to `profiles.account_status` | admin actions apply the ban | n/a |
| F. Capability kill switch | pause a live capability | `DISABLED_CAPABILITIES` env | `server/app-config.ts::isCapabilityDisabled` | open |

Confidence: high (grep-confirmed across `apps/web`, `apps/mobile`, `packages/shared`).

---

## 2. All discovered plan and tier fields

- `account_overrides` (migration 0045): `plan_tier` (`free|plus`), `plan_source` (`comp|paid|null`), `plan_expires_at`, `entitlement_overrides` jsonb, `fee_sponsored`, `fee_sponsor_expires_at`, `fee_sponsor_cap_cents`, `fee_sponsored_used_cents`, `admin_notes`. RLS enabled, zero policies (service-role only).
- `packages/shared/src/entitlements.ts`: `PlanTier = 'free' | 'plus'`; `ENTITLEMENT_FEATURES = [deposits, branding, custom_templates, extra_fields, extra_trips, analytics]`; `PLAN_FEATURES` (`free: []`, `plus: all six`).
- Drizzle mirror `apps/web/src/db/schema.ts:713` (`accountOverrides`).
- `booking_requests.deposit_fee_sponsorship_booked_cents` / `_released_cents` (migrations 0099, 0100): the per-booking sponsorship ledger.

There is no `plan_tier` on `profiles` (the roadmap BM-2.2 plan to put it there was superseded by the separate table). There is no `studio` tier value anywhere. Confidence: high.

---

## 3. All direct feature (entitlement) checks

`canAccess(` is called with `"deposits"` at every call site. Grep-confirmed the other five feature literals appear only in the definition and the admin panel labels.

| # | File:line | Feature | Layer | Enforced? |
| --- | --- | --- | --- | --- |
| 1 | `apps/web/src/lib/server/bookings.ts:851` | `deposits` | shared server core (`requestDepositCore`) | **yes, the only real gate** |
| 2 | `apps/web/src/app/api/mobile/me/route.ts:48` | `deposits` | API route | display only (`canCollectDeposits`) |
| 3 | `apps/web/src/app/(artist)/bookings/requests/[id]/page.tsx:83` | `deposits` | server component | display only |
| 4 | `apps/web/src/app/admin/accounts/[id]/account-entitlements.tsx:189` | `deposits` | admin client component | display only (warns Connect not routable) |

`effectivePlanTier` display sites: `account-entitlements.tsx:120`, `admin-client.tsx:500`, `mobile/me/route.ts:47`. `daysUntilPlanExpiry`: `account-entitlements.tsx:125`, `admin-client.tsx:501`. `canSponsorFeeCents`: `bookings.ts:859` (the only functional sponsorship use). Confidence: high.

---

## 4. Placeholder entitlements with an admin UI but no enforcement

`branding`, `custom_templates`, `extra_fields`, `extra_trips`, `analytics` are toggleable in `apps/web/src/app/admin/accounts/[id]/account-entitlements.tsx:262` but `canAccess` is never called with them. Granting or revoking them is a no-op in product behavior. Verified inert against the specific surfaces they would gate:

- `branding`: the "Powered by inklee" footer is hardcoded and unconditional (`apps/web/src/app/[slug]/page.tsx`, around line 635-640). Neither free nor Plus artists can remove it.
- `custom_templates`: every artist has full email-template editing (`email_templates` RLS artist-owns-own, no tier check).
- `extra_fields`: unlimited custom fields; no cap in code (`custom_fields`, migration 0005).
- `extra_trips`: unlimited trips and studios; no cap (`trips`, `studios`, migration 0016).
- `analytics`: the mobile `GET /api/mobile/analytics` route returns metrics with no `canAccess(overrides, "analytics")` check; the native Insights screen is always available.

Severity: high relevance for the business-model build-out (a "looks wired, is not" trap). Confidence: high (grep plus direct reads).

---

## 5. The two disconnected paywall systems

1. `account_overrides` plus `entitlements.ts` (Slice 81, the newer engine).
2. `profiles.settings.features` plus `apps/web/src/lib/features.ts` (Slice 76): `bio_page_modules`, `goods_module`, `checkout_addons`, all default `true`, described in the file header as "the single gate points a future plan tier will flip", but nothing writes them off. `canUseBioModules` is referenced only in `features.ts` and its test (a dead placeholder). Goods rides this older system, not the entitlement engine.

`branding` (entitlement) conceptually overlaps `bio_page_modules` (feature flag) but they are not connected. Any tier work must decide which system owns paywalling and reconcile them, or an admin granting Plus will not affect goods, which reads a separate jsonb flag. Severity: medium (packaging correctness). Confidence: high.

---

## 6. UI-only restrictions (by design, not gaps, but noted)

- `apps/web/src/components/app-shell/nav-config.ts:86,109`: conditional nav for map and studio, backed by server route guards (`notFound()` / `redirect`) in every `/studio/*` and `/travel/requests/*` page and action. Not a gap.
- The web request detail page (`bookings/requests/[id]/page.tsx:83`) and the mobile settings pill (`apps/mobile/app/settings/index.tsx:185-194`) read the plan for copy only; enforcement is server-side in `bookings.ts`. Intentional duplicate read.

Confidence: high.

---

## 7. Server-side restrictions (the real boundary)

The server-side authorization story is strong and consistent. Every sampled mutation establishes the caller server-side and either rides RLS on a token/cookie-scoped client, explicitly scopes `.eq("artist_id", userId)`, or delegates to a shared core that re-checks `row.artist_id !== userId`. No IDOR was found in roughly twenty sampled routes and actions.

Primitives: cookie SSR client plus `auth.getUser()` (web), `requireMobileUser` (mobile bearer, RLS-scoped, never service-role), `requireAdmin` / `getAdminId` (admin, fail-closed AAL2), `serviceClient` (bypasses RLS, always preceded by an ownership check), `CRON_SECRET` bearer (cron), signed-body HMAC or `bearerMatches` (Control Tower internal), Stripe signature plus metadata cross-check (webhook), sha256 token hash (customer portal). Confidence: high on the sampled set; the mobile route enumeration was a sample of the sensitive routes, not all 87.

---

## 8. Database-enforced restrictions

DB-enforced (holds even against a hand-crafted PostgREST call with a valid artist JWT):

- Artist A cannot read or write artist B's rows (RLS own-row policies on every core table).
- An artist cannot self-edit `is_tester`, `account_status`, `suspended_*`, or `stripe_*` (column privileges, migration 0074).
- An artist cannot read their own tier, admin notes, or sponsorship budget (`account_overrides` service-role-only, migration 0045).
- Instagram `access_token` and `app_scoped_user_id` are service-role only even from the owning artist (column privileges, migration 0062).
- Support ticket `internal` messages are hidden from the artist (policy, migration 0057).
- A blacklisted artist cannot detect the blacklist row (no policy, migration 0080); a claimant cannot see who reviewed their claim (column grant, migration 0079).
- Money and flash-forging RPCs are locked to service role (grants, migration 0060); guest-spot trip legs cannot be deleted or re-dated by a client-role call (triggers, migration 0080).
- The studio detaches from its owner on account deletion via FK `ON DELETE SET NULL` plus a trigger (migration 0078).

Confidence: high, from migration SQL. One unclosed loop: this is the migration-declared state; live `pg_policies` was not queried (read-only, no prod access), and the AGENTS.md 2026-04-20 repair history is a specific reason declared can differ from applied.

---

## 9. Missing enforcement

1. **Entitlement has zero DB representation.** The guarantee that free artists do not get card deposits is one `canAccess` call in `bookings.ts:851` plus the DB fact that no client role can write the deposit columns. There is no DB tripwire; a new writer of `booking_requests` deposit state, or a service-role path that forgets the check, silently bypasses the tier. Severity: high (structural). Confidence: high.
2. **Five entitlement features are unenforced** (section 4).
3. **`account_status` is not enforced at the action, RLS, or mobile-auth layer.** The real gate is the Supabase auth ban (`ban_duration`); the column is a mirror plus a public-page filter. A suspended artist holding an unexpired access token may retain API access until token expiry (the auth ban blocks refresh, not necessarily an in-flight JWT). Not verified against runtime. Severity: medium. Confidence: medium (grep-based; the JWT-window timing is unverified).

---

## 10. Contradictory enforcement

**S1 (headline): the mobile deposit UI ignores the plan entitlement.** `apps/mobile/src/components/booking/BookingActions.tsx:373-374` computes `canCollectInApp = useCapability("deposits") && payouts.routeCharges`, omitting `canAccess(overrides, "deposits")`. The web equivalent (`bookings/requests/[id]/page.tsx:81-83`) includes it. The authoritative server gate (`bookings.ts:850-851`) requires all three factors. A Connect-active but un-entitled (free) artist on mobile is told the client pays by card and shown a 3% fee split (`BookingActions.tsx:441-445,479-482`), while the server issues a manual deposit. This reproduces the exact "told card, got manual" failure the money-path rules forbid. Reachability today is low (every comped beta artist is Plus), but it becomes an active mislead the moment a real paid tier ships. Severity: high (correctness, becomes worse at monetization). Confidence: high (both call sites read directly).

**Secondary:** the web request page copy omits the capability check that mobile honors, so during a `deposits` platform-wide pause the web UI shows card copy while mobile correctly shows manual. Severity: low. Confidence: high.

---

## 11. Hardcoded Stripe references

None in application source. Grep for `price_`, `prod_`, `whsec_`, `sk_live_/sk_test_`, `pk_live_/pk_test_` matches only docs, runbooks, `.env.example`, and the Stripe skill files. The only literal that resembles a Stripe constant is the MCC `"7299"` in `apps/web/src/lib/stripe-connect.ts:274` (a merchant-category code, not an object id). `orders.stripe_checkout_session_id` (migration 0036) exists as forward-compat schema and is never written. Only three `STRIPE_` env vars exist. Confidence: high (this is a clean result and a strength; it means moving a feature between tiers or changing prices will not require touching code).

---

## 12. Legacy and dead access mechanisms

- `profiles.settings.features` (section 5): the older paywall-readiness flags, unused as gates.
- `plan_source = 'paid'`: a valid admin choice with no purchase flow behind it.
- `orders.platform_fee_amount` (migration 0036): present in schema, never written by the webhook or `prepareCheckoutAction`; goods carry no per-order fee accounting.
- `travel_legs` (migration 0011) and `booking_requests.travel_leg_id`: superseded by the trip planner (migration 0016), harmless dead weight.
- `studios.verified_at` (migration 0023): no writer found; likely dead metadata.
- `studio_profiles.slug` (migration 0078): reserved, unrouted in v1.
- `MAP_PINS_V2` (migration 0101): deployed but validated-bad; must stay off (geodetic `&&` drops pins on wide viewports).
- `clientAtLeast()` (`apps/web/src/lib/server/client-version.ts:25`): the mobile version-negotiation tool, built and unit-tested but with zero production call sites; scaffolding, not a live gate.

Confidence: high on the flags and Stripe label; medium on `verified_at` and `slug` being fully dead (no writer found in the paths read).

---

## 13. Likely security gaps and blast radius

1. **Service-role key is the whole ballgame.** Admin, entitlement grants, all money operations, all map and moderation, and reading every secret are authorized purely by possessing the service-role key and running the right server code. There is no second DB-level factor, no least-privilege DB role split for money vs analytics. A leaked service key is total compromise. Inherent to the architecture, not a regression; consider distinct restricted DB roles if defense-in-depth is wanted. Severity: info (blast-radius fact). Confidence: high.
2. **Cron and seed timing-compare inconsistency.** Seven of eight cron routes plus the two seed routes use a non-constant-time `!==` for `CRON_SECRET`, while `cron/lifecycle` and the Control Tower routes use the timing-safe `bearerMatches` the codebase itself documents. Low exploitability, self-contradicted. Files: `cron/cleanup:11`, `cron/reminders:104`, `cron/gsc-sync:14`, `cron/coverage-worker:16`, `cron/instagram-refresh:9`, `cron/retention-purge:27`, `cron/growth-snapshot:27`, `api/admin/seed-country:17`, `api/admin/seed-coverage:31`. Severity: low. Confidence: high.
3. **Instagram token at rest is not app-encrypted** (migration 0019 defers it); protection is RLS plus column grants plus service-role. Severity: medium. Confidence: high.
4. **Column-grant plus seed.sql drift footgun** (migrations 0062, 0074, 0076, 0079, 0084, 0089, 0102): any new `profiles` (or `instagram_accounts`, `location_claims`) column written by a user-scoped client needs an explicit `GRANT` in the same migration and a matching update in `apps/web/supabase/seed.sql`, or onboarding breaks. A future entitlement migration that adds a client-writable column inherits this. Severity: medium (operational). Confidence: high.

---

## 14. Likely billing leakage and upgrade-flow inconsistencies

1. **The economic premise does not hold at launch.** Deposits are Plus-gated, but Plus is comped, so at launch every deposit-taking artist is free, the subscription does not offset the ~2 euro per month Custom-account cost, and Inklee carries the loss-making small-deposit and refund exposure with zero subscription revenue. This is the most material business-model contradiction (documented as C2). Severity: high (commercial). Confidence: high.
2. **Goods would settle at 0% take if unparked as coded.** `requestDeposit` sets `application_fee_amount` on the deposit only; `prepareCheckoutAction` updates the intent amount and metadata but never the `application_fee_amount` (`apps/web/src/app/request/[token]/actions.ts:506-509`). A 30 euro add-on would settle to the artist with Inklee keeping nothing. The transaction-fee margin the money-scope reset hinges on does not exist on goods yet. Must be fixed before commerce is unparked. Severity: high (if commerce ships). Confidence: high.
3. **No self-serve upgrade path** (section 12). `pricing_viewed`, `app_store_clicked`, `play_store_clicked` events are pre-wired in the event registry but unemitted (no `/pricing` page). Severity: medium (blocks conversion measurement). Confidence: high.
4. **No margin actuals.** The 3% platform fee is set on the PaymentIntent but never persisted; Stripe processing cost is recorded nowhere. Inklee net margin per deposit is not computed or stored, so "3% is the margin" cannot be validated. Severity: medium. Confidence: high.

---

## 15. Areas where mobile and web behavior differ

1. The deposit predictor drift (section 10, S1). The primary mobile-vs-web divergence.
2. `plan` is typed `string` on the wire (`packages/shared/src/mobile-api.ts:52`), deliberately so a future `studio` value decodes safely on old builds, but rendering or gating on it still needs a native release (no OTA).
3. Studio has no mobile surface at all; the owner cockpit is web-only.
4. The web request page omits the `deposits` capability-pause check that mobile honors (section 10, secondary).

Confidence: high.

---

## 16. Areas where account scope is ambiguous

1. **Studio scope has no entitlement holder.** `account_overrides` is keyed by `artist_id`. A per-studio tier or entitlement has nowhere to attach. Severity: high for the Studio tier. Confidence: high.
2. **Studio ownership is a single boolean with no roles.** No owner-vs-manager-vs-front-desk gradation; the claimant role is discarded after approval. A delegated-management tier has no permissions layer. Confidence: high.
3. **Client and artist identities are unlinked.** A client who later becomes an artist has no reconciliation between their client bookings and their artist profile; email is not a cross-plane join key. Confidence: high.
4. **"Studio" names two products** (the 2.0 guest-spot host vs the unbuilt BM-4 multi-artist booking studio) that share a name and a 25 euro price anchor with near-zero feature overlap. "Guest Spots" names two features (the 1.x trip planner nav and the 2.0 formal request flow). Any tier UI must disambiguate. Severity: medium (naming hazard). Confidence: high.
5. **Three independent suspension concepts**: `account_status` (the person), `studio_profiles.publication_status` (the studio page), and `map_locations.moderation_status` (the map pin). A tier system must not conflate them. Confidence: high.

---

## 17. Decision register

Numbered decisions surfaced by the audit. For each: the recommended answer, alternatives, reasoning, risk, reversibility, whether founder approval is required, and whether it blocks implementation. Founder-facing commercial decisions are expanded in `docs/product/account-tier-business-model-map.md`.

| # | Decision | Recommended | Alternatives | Reasoning | Reversible? | Founder approval? | Blocks impl? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Entitlement architecture | Keep the built hybrid (Option C): tier defaults plus per-account overrides | Static map (A), pure per-account (B) | Already implemented, correct, and the only shape that expresses comp, beta, grandfather, and support exceptions | high | no (validates existing) | no |
| D2 | Source of truth for entitlement | Internal `account_overrides` row; Stripe updates it via webhooks; `canAccess` never touches Stripe | Live Stripe checks at access time | Latency, availability, and coherence during a Stripe incident; the schema (`plan_source`, `plan_expires_at`) already anticipates it | high | no | no |
| D3 | Account type for studios | Keep one account type (artist); studio is an owned entity plus a scope | A separate studio account type | Preserves auth, onboarding, RLS, mobile bearer; matches the built `owner_user_id` model | medium | yes | no (defers Studio) |
| D4 | Primary paying customer | Solo artist for Plus; studio owner for Studio | Studio-only, or transaction-only | Matches the documented segments and the built deposit gate | high | yes | no |
| D5 | Primary revenue model | Hybrid: Plus subscription plus 3% deposit transaction fee, Studio later; goods as a transaction add-on | Subscription-led, transaction-led | Matches the money-scope reset; the fee is the launch margin, the subscription attaches every Custom account to a payer | high | yes | no |
| D6 | Build subscription billing now | Yes, so Plus becomes purchasable (BM-2.2 to 2.5); until then accept comps and the Custom cost during beta | Stay comp-only indefinitely | Resolves the C2 contradiction; without it the enforced gate has no revenue behind it | medium | yes | yes (for revenue) |
| D7 | Studio pricing metric | Flat per-studio (approx 25 euro per month), not per-seat initially | Per-seat, per-active-member | Simplicity; per-seat discourages inviting collaborators | high | yes | no |
| D8 | Studio tier identity and timing | Defer to Q8; comp studio owners during map bootstrap | Ship Studio pricing now | Multi-artist booking is unbuilt; Q8 open; do not block future multi-studio work | high | yes | no |
| D9 | Guest-artist access | Free ordinary artist account; no membership or seat | Limited membership, paid guest account | Guest spots grant only welcome-pack read plus a trip leg; charging suppresses network supply | high | recommend | no |
| D10 | Grandfathering | Preserve price via a preserved Stripe Price id and `plan_source = 'grandfathered'`; never rename entitlement keys | Force-migrate prices | Keeps entitlement keys stable across price changes | high | recommend | no |
| D11 | Complimentary and beta access | Distinguish `beta` from `comp` from `paid` in `plan_source`; track beta cohort | Keep comping beta to Plus | Comp and paid are currently indistinguishable in the data, breaking conversion analysis | high | recommend | no |
| D12 | Trial behavior | No separate trial; Free is the trial | Time-boxed trial | Matches the founder rule; avoids post-payment churn | high | yes | no |
| D13 | Payment-failure grace period | Full access through the Stripe smart-retry window (past_due), then Free | Immediate downgrade, indefinite grace | Standard, humane, computed from internal state | high | recommend | no |
| D14 | Downgrade behavior | Degrade gracefully; over-cap items read-only; never delete data; formatting reverts, content retained | Hard cut, data deletion | Founder rule: do not paywall a user's own data without retention and export | high | yes | no |
| D15 | Add-on strategy | Featured placement, goods take, and IG capacity are add-ons or transaction fees, not tiers | Fragment into more tiers | Keeps the tier set to three; avoids arbitrary fragmentation | high | recommend | no |
| D16 | Feature-flag vs entitlement boundary | Reconcile `features.ts` into the entitlement engine; retire it once goods is migrated | Keep both, bridge them | Two half-answers to "what does Plus gate" is a standing hazard | high | no | no |
| D17 | Cross-platform billing | Keep artist billing web-only via Stripe; app reads entitlement, no in-app purchase UI | Build StoreKit and Play Billing | Avoids the 15 to 30 percent store cut on a thin tier; the app already has zero IAP exposure | medium | yes | no (constrains BM-2.3) |
| D18 | Wire the five inert entitlements | Yes, each to its authoritative server layer, before selling Plus | Ship Plus with UI-only gates | Otherwise the "Plus features" remain free-for-all | high | no | yes (for Plus value) |
| D19 | Fix the mobile predictor drift | Yes, before any paid tier ships; prefer one shared server-computed "will route to card" boolean | Patch the client boolean only | Prevents the "told card, got manual" mislead recurring across surfaces | high | no | yes (before monetization) |
| D20 | Plan-change history and conversion events | Add a `plan_changed` event plus an `account_override_history` table now | Reconstruct from the audit log | Makes comp-to-paid and future self-serve conversions measurable from day one | high | recommend | no |
| D21 | Margin instrumentation | Persist `platform_fee_collected_cents` and `stripe_fee_cents` per deposit at settlement | Keep the computed proxy | Lets the "3% is the margin" thesis be validated against actuals | high | recommend | no |
| D22 | Goods take rate | Fix the 0% goods take (write `application_fee_amount` for goods) before unparking commerce | Unpark as-is | Otherwise commerce gives away goods payments at 0% margin | high | yes | yes (before goods) |

---

## 18. Confidence summary

- Access-control axes, entitlement engine, call sites, admin writes, mobile display-only, Stripe absence of billing, RLS and grant map: high (read directly from source and migrations).
- Suspension two-layer design and account_status divergence: high on structure, medium on the in-flight JWT window (unverified against runtime).
- Prod env values (which flags are on): asserted from memory and roadmap, not verified against Vercel; source proves only the read logic and fail-closed defaults.
- Live `pg_policies` matching the migration-declared state: the one unclosed loop, because the read-only audit had no prod access and the AGENTS.md repair history is a reason to verify before relying on declared state.
