# Account tier Stage 2 plan

**Status:** DRAFT for founder review, 2026-07-23. Prepared per founder direction. **No enforcement is implemented and no production migration is performed by this document.** Stage 2 code does not begin until (a) each entitlement contract below is approved, (b) the dry-run impact report (section 6) is run and reviewed, and (c) `legacy_free_v1` is implemented as a versioned entitlement source.

Companion to `docs/product/account-and-entitlement-system.md` and `docs/product/account-tier-migration-plan.md`. Conventions: sentence case, no em-dashes.

Stage 1 shipped (1a engine, 1b deposit predictor fix, 1c account-status enforcement, plus the bio placeholder cleanup) and is a closed unit. Stage 2 wires the five inert entitlements to authoritative server enforcement, with grandfathering, so the Plus feature set becomes purchasable-ready. Goods is a separate transaction-led path (section 8) handled after D22.

---

## 1. The rule for this phase

No admin toggle is rendered before the corresponding entitlement has real, authoritative server enforcement. Do not enforce an entitlement until its semantic boundary is explicit (the contract is approved). Prefer limits over complete removal. Never delete user data; degrade per feature, not with a single generic read-only rule that would break active bookings or client obligations.

---

## 2. The five entitlement contracts (draft)

Each contract must be approved before enforcement. "Current accounts affected" is filled by the dry-run report (section 6); the values below are the shape, not counts.

### 2.1 `branding`

| Field | Value |
| --- | --- |
| Exact capability | Remove or reduce the "Powered by inklee" footer on the public booking page and hub. |
| Free | Cover image and cover color (already free today) stay free. The Inklee footer is always shown. |
| Plus adds | Footer removal (and, if later scoped, advanced page customization, to be defined). |
| Boolean or limit | Boolean. |
| Scope | Personal. |
| Authoritative enforcement point | The public page render (`apps/web/src/app/[slug]/page.tsx`) and the hub render: show the footer unless `canAccess(overrides, "branding")`. |
| UI behavior | A settings toggle "remove Inklee branding", gated; the public page renders the footer unless entitled. |
| Upgrade behavior | Footer disappears on the next public-page render after upgrade. |
| Downgrade behavior | Footer reappears; the saved "remove footer" preference is retained so re-upgrade restores it. No data deleted. Not a client-obligation flow. |
| Grandfathering behavior | None. The footer is hardcoded and unconditional today, so footer removal was never available to any free artist. `legacy_free_v1` does not grant `branding`. This is a genuinely new Plus capability, not a takeaway. |
| Existing data behavior | None (a render toggle, no stored records). |
| Required tests | Free shows footer; entitled hides it; downgrade re-shows; preference retained across the cycle. |
| Analytics event | `branding_footer_toggled`, `upgrade_prompt_branding`. |
| Current accounts affected | None lose anything (nobody can remove the footer today). Enforcement is net-new functionality plus the gate. |
| Risk | Low. Net-new; no takeaway, no data, no client flow. Prerequisite: the footer-removal toggle must be built first (the audit found the footer hardcoded). |

### 2.2 `custom_templates`

| Field | Value |
| --- | --- |
| Exact capability | Editing the wording of the per-status booking email templates. |
| Free | The default template bodies (which always send). Proposed: read-only default templates. |
| Plus adds | Full custom wording on all template types. |
| Boolean or limit | Boolean. |
| Scope | Personal. |
| Authoritative enforcement point | The email-template save action (web action + `/api/mobile/settings/email-templates`): allow a custom body only when `canAccess(overrides, "custom_templates")` or the grandfather package grants it. The default template always sends regardless (deliverability is never paywalled). |
| UI behavior | Template editor is read-only for non-entitled, non-grandfathered artists; editable for Plus and grandfathered. |
| Upgrade behavior | Editor unlocks. |
| Downgrade behavior | **DECIDED 2026-07-23: read-only, not revert.** Editor locks to read-only; the saved custom body is retained and keeps sending (it is an active client-facing flow; reverting would change what clients receive). A1 resolved. |
| Grandfathering behavior | Full custom-template editing was genuinely available free before the cutover (unenforced), so `legacy_free_v1` preserves full editing. Only new (post-cutover) free artists are gated to default and read-only. |
| Existing data behavior | Custom template bodies retained, keep sending. Never deleted. |
| Required tests | New free is read-only; grandfathered free edits; Plus edits; downgrade keeps the existing body sending read-only; default always sends. |
| Analytics event | `email_template_edited`, `upgrade_prompt_templates`. |
| Current accounts affected | Dry-run counts free artists with a non-default `email_templates` row (they are grandfathered). |
| Risk | Medium. Real takeaway for new free artists; grandfathering plus read-only-not-revert keeps existing client flows intact. |

### 2.3 `extra_fields`

| Field | Value |
| --- | --- |
| Exact capability | The number of custom booking-form fields. |
| Free | Proposed cap: 3 active custom fields (matches the DECISIONS.md MVP "max 3 custom fields"). |
| Plus adds | A higher cap (proposed 20) or unlimited. |
| Boolean or limit | Limit (`custom_fields`, already defined in the engine, `limitFor`). |
| Scope | Personal. |
| Authoritative enforcement point | The custom-field create action (web + `/api/mobile/booking-form/fields`): block creation when the active count is at or above `limitFor(overrides, "custom_fields")`. |
| UI behavior | "Add field" disabled with an upgrade prompt at the cap; existing fields remain fully editable and deletable. |
| Upgrade behavior | The cap lifts to the Plus number; creation unblocks. |
| Downgrade behavior | Existing custom fields **stay active on the public form** (they are a client-facing flow; hiding them would change the form and could orphan `form_data`). Creation of new fields is blocked while over the cap. No field is deleted or hidden. |
| Grandfathering behavior | `legacy_free_v1` receives a per-account `limitOverride` for `custom_fields` equal to `max(FreeCap, count at cutover)`, so existing fields stay usable and replaceable but the count cannot grow beyond the cutover count. This preserves the active flow without granting unlimited-forever. See ambiguity A2. |
| Existing data behavior | All existing fields retained and active. |
| Required tests | New free blocked at cap; grandfathered artist keeps its cutover count; existing fields stay on the public form after downgrade; Plus lifts the cap. |
| Analytics event | `custom_field_cap_reached`, `upgrade_prompt_fields`. |
| Current accounts affected | Dry-run counts artists with more than the proposed Free cap of active custom fields. |
| Risk | Medium. Client-facing (fields on the public form); mitigated by keep-active plus grandfather-by-count. |

### 2.4 `extra_trips`

| Field | Value |
| --- | --- |
| Exact capability | The number of trips (and, sharing the admin label "Extra trips / studios", the number of studio-library venue bookmarks). |
| Free | Proposed: 3 active trips and 5 studio-library entries. See the challenge in section 3 to the "one active trip" example. |
| Plus adds | A higher cap or unlimited on both. |
| Boolean or limit | Limit (`active_trips` and `studio_library`, defined in the engine). |
| Scope | Personal. |
| Authoritative enforcement point | The trip create action and the studio-library create action (web + `/api/mobile/travel/*`): block creation at the cap. |
| UI behavior | "Add trip" / "Add studio" disabled with an upgrade prompt at the cap; existing entries remain editable and deletable. |
| Upgrade behavior | Caps lift; creation unblocks. |
| Downgrade behavior | Existing trips and studios stay active (a trip on the public booking form is a client-facing flow). Creation blocked while over the cap. Nothing deleted or hidden. Guest-spot-materialized trip legs (2.0) must never be blocked or altered by this gate. |
| Grandfathering behavior | Per-account `limitOverride` for both keys = `max(FreeCap, count at cutover)`, same mechanism as `extra_fields`. |
| Existing data behavior | All existing trips, legs, and studios retained and active. |
| Required tests | New free blocked at cap; grandfathered keeps cutover count; existing trips stay on the public form after downgrade; guest-spot legs unaffected; Plus lifts caps. |
| Analytics event | `trip_cap_reached`, `studio_cap_reached`, `upgrade_prompt_trips`. |
| Current accounts affected | Dry-run counts artists over the proposed Free trip and studio caps. |
| Risk | Medium, plus a business-model tension (section 3): trips are the core free feature for the traveling-artist segment. |

### 2.5 `analytics`

| Field | Value |
| --- | --- |
| Exact capability | Depth of personal analytics. |
| Free | Basic activity totals (requests, approvals, cancellations). |
| Plus adds | Advanced analytics (conversion trends, source attribution, time series). |
| Boolean or limit | Boolean (a two-level split: basic vs advanced). |
| Scope | Personal. |
| Authoritative enforcement point | The analytics surfaces (`/api/mobile/analytics` and the web analytics page): compute and return the advanced block only when `canAccess(overrides, "analytics")`; always return the basic block. |
| UI behavior | Free sees the basic dashboard; Plus sees the advanced views. |
| Upgrade behavior | Advanced views unlock. |
| Downgrade behavior | Advanced views hidden; basic stays. No data deleted (analytics are derived, not stored user data). Not a client-facing flow. |
| Grandfathering behavior | **DECIDED 2026-07-23: none, gate for all.** Advanced analytics is a Plus feature for every free artist including `legacy_free_v1`; a soft "trends are now a Plus feature" message is shown. Analytics is a derived view (no user data, no client obligation), so nothing is lost by not grandfathering. A3 resolved. |
| Existing data behavior | None (derived). |
| Required tests | Free gets basic only; Plus gets advanced; downgrade hides advanced; basic always renders. |
| Analytics event | `advanced_analytics_viewed`, `upgrade_prompt_analytics`. |
| Current accounts affected | All free artists currently see whatever the unenforced route returns; splitting basic vs advanced is the work. |
| Risk | Low to medium. No data or client flow at stake; the only question is whether hiding trends from existing free artists reads as a takeaway (A3). |

---

## 3. Proposed Free limits (with challenge)

The engine's Stage 1a placeholder numbers, now proposed for ratification, and where they are challenged.

| Limit | 1a placeholder | Proposed Free | Proposed Plus | Rationale and challenge |
| --- | --- | --- | --- | --- |
| `custom_fields` | 3 | 3 | 20 or unlimited | 3 covers a couple of extra questions and matches the DECISIONS.md MVP cap. No challenge. |
| `active_trips` | 3 | **3 (DECIDED 2026-07-23)** | unlimited | Founder confirmed 3 active trips (not the "one active trip" example): trips are the core free activation feature for the traveling and guest-spot artist segment, so the ability to travel stays free; Plus monetizes scale (many concurrent trips). Metered unit = ACTIVE trips (trips overlapping today or future) per §2.4. |
| `studio_library` | 5 | 5 | unlimited | Venue bookmarks; 5 is generous for a solo artist. No strong challenge; could be lower, but bookmarks are private and cheap. |

`branding`, `custom_templates`, `analytics` are boolean (not limits). Final numbers are a founder decision (section 9).

---

## 4. Grandfathering: the `legacy_free_v1` policy

Records the founder-ratified policy. This is the design; storage lands with the Stage 2 schema step, gated on the dry-run and approval.

### 4.1 Cohort

At the production cutover, define a fixed cohort `legacy_free_v1`: existing eligible free artist accounts created before the cutover timestamp. It is **not** represented as Inklee Plus and creates **no** fake Stripe subscription.

### 4.2 What it preserves

Access only to functionality genuinely available to those accounts before the cutover. It must not automatically include: future Plus features, Studio features, future commerce features, goods fee exemptions, new higher (Plus) limits introduced after the cutover, paid add-ons, promotional placement, or future automation products. Grandfathering is bounded to this documented policy version.

Concretely, per the contracts above:

- `custom_templates`: preserved (full editing was available free); on downgrade, existing body keeps sending read-only (A1 resolved).
- `extra_fields`, `extra_trips` (and `studio_library`): preserved as a per-account `limitOverride` equal to the cutover count (not unlimited-forever, not the Plus cap).
- `branding`: not preserved (never available free).
- `analytics`: NOT preserved (DECIDED 2026-07-23: gate for all free, A3 resolved).

### 4.3 Existing data

Never delete existing user data because of a downgrade or a new limit. For records above a new Free limit: keep them visible; keep them exportable where export exists; let transactional records (bookings, payments) complete their normal lifecycle; prevent creation of additional over-limit items; make excess configuration items read-only where appropriate; do not disable active client-facing flows without a migration or compatibility path. Apply downgrade behavior per feature (section 2), not a single generic rule.

### 4.4 Upgrade and downgrade

A grandfathered artist who upgrades to Plus retains their grandfathered status in the background. If they later downgrade, restore the `legacy_free_v1` package rather than treating them as a newly created Free account. This prevents punishing users for trying a paid plan.

### 4.5 Scope and transferability

Grandfathering belongs to the personal artist entitlement scope. It is non-transferable, independent from Stripe, independent from studio membership, preserved through normal email or profile changes, and not automatically copied during account merges, ownership transfers, or studio claims. Any exceptional transfer requires an explicit admin decision.

### 4.6 Implementation shape

No scattered `isLegacyUser` / `createdBeforeDate` / `isOldFreeAccount` checks. Grandfathering is represented through the entitlement-resolution system as an explicit grant source. Proposed storage (a grandfathering grant row, or fields on the entitlement holder, added in the Stage 2 schema step), recording at least:

- Policy identifier (for example `legacy_free_v1`).
- Entitlement scope (personal).
- Grant source (`grandfathered`, distinct from `comp`, `paid`, `beta`).
- Granted timestamp.
- Cutover or eligibility timestamp.
- Optional expiry.
- Administrative reason where applicable.
- The preserved package (the entitlements and per-key `limitOverride` values it grants).

The resolver must be able to explain why access was granted (which policy, which source, which package), so the admin account panel can show "Plus feature X available because grandfathered under legacy_free_v1".

---

## 5. Recommended Stage 2 sequence

1. Define and approve the five entitlement contracts (section 2).
2. Produce and review the dry-run impact report (section 6).
3. Implement `legacy_free_v1` as a versioned entitlement source (schema plus resolver, section 4.6).
4. Add authoritative server enforcement per contract.
5. Add database or RLS enforcement only where an invariant needs it (most gates are service-role writes; the DB stays a backstop).
6. Add limit and downgrade behavior per feature.
7. Add frontend visibility and upgrade messaging (no in-app purchase on iOS, D17).
8. Add admin controls only after the underlying behavior works.
9. Verify web, Android, iOS, and tablet parity.
10. Reconcile and retire only legacy flags that have real replacements.
11. Handle goods separately after the commerce decisions (section 8).

---

## 6. Dry-run impact report query plan (read-only)

Run against a read replica or with read-only credentials. **No writes. No production migration.** `:cutover` is the chosen cutover timestamp. `:free_fields_cap`, `:free_trips_cap`, `:free_studios_cap` are the proposed Free limits. Exclude testers and admins from customer counts (the growth cockpit's `isCountedArtist` rule).

The "effective free" predicate (an artist with no active Plus grant), reused below:

```sql
-- effective_free_artists: active, non-tester profiles with no active plus grant
create temporary view effective_free_artists as
select p.id, p.created_at
from profiles p
left join account_overrides o on o.artist_id = p.id
where p.account_status = 'active'
  and p.is_tester = false
  and (
    o.artist_id is null
    or o.plan_tier <> 'plus'
    or (o.plan_expires_at is not null and o.plan_expires_at <= now())
  );
-- (admin emails excluded in the app layer via ADMIN_EMAILS; note it in the report.)
```

Report queries:

```sql
-- 1. Number of existing free artist accounts
select count(*) as free_artists from effective_free_artists;

-- 2. Number eligible for legacy_free_v1 (free + created before cutover)
select count(*) as legacy_eligible
from effective_free_artists where created_at < :cutover;

-- 3a. custom_fields usage: distribution + over-cap count
select count(*) as artists_over_field_cap
from (
  select cf.artist_id, count(*) as n
  from custom_fields cf
  join effective_free_artists f on f.id = cf.artist_id
  where cf.deleted_at is null and cf.active = true
  group by cf.artist_id
) x where n > :free_fields_cap;

-- 3b. active_trips usage (trips overlapping today or future)
select count(*) as artists_over_trip_cap
from (
  select t.artist_id, count(distinct t.id) as n
  from trips t
  join trip_legs l on l.trip_id = t.id
  join effective_free_artists f on f.id = t.artist_id
  where l.ends_on >= current_date
  group by t.artist_id
) x where n > :free_trips_cap;

-- 3c. studio_library usage
select count(*) as artists_over_studio_cap
from (
  select s.artist_id, count(*) as n
  from studios s
  join effective_free_artists f on f.id = s.artist_id
  group by s.artist_id
) x where n > :free_studios_cap;

-- 3d. custom_templates usage: free artists with any non-default template body
select count(distinct et.artist_id) as artists_with_custom_templates
from email_templates et
join effective_free_artists f on f.id = et.artist_id;

-- 4. Records that would become read-only (should be 0 under grandfather-in-place;
--    this quantifies what the caps would touch WITHOUT grandfathering).
--    Sum of over-cap field/trip/studio counts from 3a-3c.

-- 5. Active client-facing flows affected: artists whose PUBLIC form carries
--    over-cap custom fields, or who send custom email templates.
select count(distinct artist_id) as client_facing_affected from (
  select artist_id from custom_fields cf
    join effective_free_artists f on f.id = cf.artist_id
    where cf.deleted_at is null and cf.active = true
  union
  select artist_id from email_templates et
    join effective_free_artists f on f.id = et.artist_id
) x;

-- 6. Conflicting subscription / override data (should be near zero today)
select artist_id, plan_tier, plan_source, plan_expires_at
from account_overrides
where plan_source = 'paid'                      -- vestigial: no purchase path exists
   or (plan_tier = 'plus' and plan_expires_at is not null and plan_expires_at <= now());

-- 7. Features that cannot yet be enforced safely: reported qualitatively
--    (branding footer is hardcoded; goods is a separate path) - see section 7.
```

Deliverable: a reviewed report from these queries before any Stage 2 enforcement ships. The founder reviews the counts, confirms the Free limits, and confirms the grandfathering package before the migration runs.

---

## 7. Cases where grandfathering is unsafe or ambiguous

- **A1 (RESOLVED 2026-07-23): `custom_templates` downgrade = keep read-only.** The existing custom body keeps sending; only editing is locked. Chosen because a custom template body is an active client-facing flow the founder rule says not to disable without a migration.
- **A2: limit grandfathering granularity.** For `extra_fields` / `extra_trips` / `studio_library`, does `legacy_free_v1` preserve unlimited-forever (pre-cutover reality was unenforced = unlimited), freeze at cutover count, or set `limitOverride = max(FreeCap, cutover count)`. Recommendation: the last one (existing items stay usable and replaceable, the count cannot grow past cutover, no Plus-generosity-forever). This treats the pre-cutover "unlimited" as an unenforced accident, not a promised product, while never breaking a live form.
- **A3 (RESOLVED 2026-07-23): `analytics` = gate for all free, no grandfathering.** Advanced analytics is a Plus feature for every free artist; a derived view with no data or client flow at stake, so nothing is preserved.
- **A4: the "unlimited was an accident" question.** Broadly: pre-cutover free had unlimited fields, trips, studios, and template editing only because the gates were unbuilt. Grandfathering should preserve what users actually built (their data and active flows) but should not enshrine the unenforced generosity as a permanent entitlement. A2 and the keep-active-but-cap-future rule operationalize this.
- **A5: transfer and merge.** Grandfathering is personal-scope and non-transferable. There is no account-merge flow today, so this is forward-looking, but the rule must be encoded now so a future merge or studio-claim path does not silently copy or drop it. A studio claim must not move personal grandfathering into the studio scope (D3 separation).
- **A6: comp versus grandfather ambiguity in the current data.** Today every non-free artist is a `comp` (beta). At cutover, reclassify deliberately (migration plan Phase 8): beta comps become `beta`, and the free cohort becomes `legacy_free_v1`. Do not let a beta comp be miscounted as a grandfathered free artist.

---

## 8. Goods is a separate business-model path

Do not assume goods is a Plus entitlement. The direction is transaction-led for goods. Keep these five concepts distinct and never conflate them in the entitlement admin UI:

1. Operational rollout flag (`GOODS_COMMERCE_ENABLED`) - a kill switch, not an entitlement.
2. Merchant eligibility / commerce capability - not automatically an entitlement.
3. Subscription entitlements - the tier layer.
4. Transaction fee schedule (the goods take) - not an entitlement.
5. Administrative suspension / compliance status.

Do not expose goods controls in the entitlement admin UI until they correspond to real, authoritative behavior. Reconcile goods only after D22 (fix the current 0 percent goods take, define the goods GMV percentage) and the commerce activation model are defined. Treat goods as its own scoped substage, separate from the five contracts above.

---

## 9. Business-model decisions still required before Stage 2 enforcement

**Resolved 2026-07-23:** `active_trips` Free = 3, metered as active trips (section 3); A1 `custom_templates` downgrade = read-only; A3 `analytics` = gate for all free, no grandfathering.

Still required before Stage 2 enforcement:

1. The Plus limit numbers (`custom_fields`, `active_trips`, `studio_library`: a specific higher number or unlimited). Free numbers are now set (3 / 3 active / 5).
2. Whether `branding` is only footer removal or also "advanced customization" (and what "advanced" means).
3. The cutover timestamp definition and eligibility rule (all active free created before cutover; testers and admins excluded).
4. The `legacy_free_v1` package contents confirmation (which entitlements and `limitOverride` values it grants), after the dry-run report is run and reviewed.
5. Goods: D22 (take rate) and the commerce activation model, before any goods reconciliation (section 8).
6. D6 (build billing) and the Plus price: not required to build Stage 2 enforcement, but the upgrade messaging (step 7) needs to know whether a purchase path exists or whether Plus stays comp-only during the enforcement rollout.

---

## 10. Technical follow-up (not part of account-tier commits)

The pre-commit hook runs `next build`, which fetches the Inter font from Google Fonts at build time (`apps/web/src/app/layout.tsx` via `next/font/google`). A transient network failure reaching `fonts.googleapis.com` fails the build and therefore the commit (observed once during slice 1c; passed on retry). Evaluate switching to a locally packaged font via `next/font/local` (or a repository-consistent approach) so builds are deterministic and offline-safe. Tracked separately in `DEFERRED.md`; do not bundle this change into account-tier commits unless it becomes necessary to make builds deterministic.
