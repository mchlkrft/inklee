-- 0105: account_overrides billing + limit-override + legacy_free_v1 grandfather
-- columns (BM-2.0 Stage 2). Additive and reversible.
--
-- STATUS: APPLIED + verified in prod 2026-07-23 (supabase db push; the 13 new
-- columns and the 5-value plan_source CHECK were confirmed by direct SQL). The
-- "authored, not applied" notes below are retained as historical context.
--
-- AUTHORED for review. Apply to prod (supabase db push) ONLY AFTER the Stage 2
-- decisions are ratified (Plus caps, the legacy_free_v1 package, the cutover
-- timestamp) and BEFORE the legacy_free_v1 backfill runs. The backfill (which
-- populates grandfathering) is separately gated on the dry-run impact report
-- (docs/product/account-tier-stage-2-plan.md section 6). This migration itself
-- is a safe no-op on its own: every new column defaults to null/{}/false and
-- resolves to today's behaviour, so it can be applied at any point.
--
-- ORDERING HAZARD: the code that SELECTs these columns
-- (apps/web/src/lib/entitlements-server.ts) MUST NOT be deployed to prod before
-- this migration is applied, or getAccountOverrides throws on the missing
-- columns and the deposit money path fails closed. This migration is committed
-- ahead of that reader change for exactly this reason.
--
-- account_overrides is SERVICE-ROLE-ONLY: 0045 enabled RLS with ZERO policies,
-- so anon/authenticated get no row access regardless of table-level grants.
-- Therefore NONE of these columns are client-writable, the 0074/0089
-- column-grant footgun does NOT apply, no GRANT statements are needed, and
-- seed.sql needs no mirror line. Stated on purpose.
--
-- Reviewer fix (BM-2.0 money-path + scope review): NO CHECK on
-- subscription_status. It stores Stripe's raw status vocabulary, which Stripe
-- extends over time (it added 'paused'). A CHECK would make a future unknown
-- status violate the constraint, the billing webhook upsert would throw, Stripe
-- would retry forever, and that artist's billing row would never converge. The
-- pure resolver maps any unknown status to Free, so raw storage is safe and a
-- DB CHECK is a hazard, not a backstop. plan_source (an internal, finite
-- vocabulary) keeps its CHECK.

-- 1. Billing state (WRITTEN later by the billing workstream's Stripe webhook;
--    this migration only adds the columns). The billing Customer (artist pays
--    Inklee) is ORTHOGONAL to profiles.stripe_account_id (the Connect account
--    that receives client deposit money). Do not conflate them.
alter table account_overrides
  add column if not exists stripe_customer_id      text,
  add column if not exists stripe_subscription_id  text,
  add column if not exists stripe_price_id         text,          -- reference only, never the internal id
  add column if not exists subscription_status     text,          -- raw Stripe status, null = no subscription (NO check, see header)
  add column if not exists current_period_end      timestamptz,
  add column if not exists cancel_at_period_end    boolean not null default false;

-- 2. Per-account numeric caps, matching entitlements.ts limitOverrides
--    (Partial<Record<EntitlementLimit, number | null>>; a json null value =
--    "unlimited for this account"). Holds BOTH admin manual caps and the
--    grandfather cutover caps.
alter table account_overrides
  add column if not exists limit_overrides jsonb not null default '{}'::jsonb;

-- 3. Grandfather / grant provenance. policy_id is the DURABLE cohort anchor:
--    it survives an upgrade to Plus (billing overwrites plan_source to 'paid'
--    but must never touch policy_id) so a later downgrade can restore the
--    grandfather package. NON-NULL policy_id == cohort membership.
alter table account_overrides
  add column if not exists policy_id        text,          -- e.g. 'legacy_free_v1'; null = no policy grant
  add column if not exists granted_at       timestamptz,
  add column if not exists cutover_ts       timestamptz,   -- the cohort cutover timestamp used to compute the package
  add column if not exists grant_expires_at timestamptz,   -- optional; null for legacy_free_v1 (no expiry)
  add column if not exists grant_reason     text,
  -- Declarative manifest of what the policy preserved, for audit + the "why"
  -- explanation + safe restore-on-downgrade. Shape mirrors the engine:
  --   { "features": { "custom_templates": true },
  --     "limits":   { "custom_fields": 12, "active_trips": 3, "studio_library": 7 } }
  add column if not exists grant_package    jsonb;

comment on column account_overrides.policy_id is
  'Durable grandfather cohort anchor (e.g. legacy_free_v1). NON-NULL = cohort member. NEVER overwritten by billing; survives an upgrade to Plus so a later downgrade can restore the grandfather package. Personal scope only; must never be copied to another artist_id or a studio-scoped holder on merge or claim.';
comment on column account_overrides.limit_overrides is
  'Per-account numeric caps beating the tier baseline. Matches entitlements.ts limitOverrides. A json null value = unlimited for this account.';
comment on column account_overrides.grant_package is
  'Declarative record of the entitlements + limitOverrides a policy_id grant preserved. Applied values live in entitlement_overrides + limit_overrides; this is the audit/restore manifest.';

-- 4. Extend plan_source to the five-value set (internal, finite vocabulary).
--    0045 left plan_source free-text; the value set now matters. Existing values
--    are comp|paid|null (a subset), so the ALTER cannot fail on existing rows.
alter table account_overrides
  drop constraint if exists account_overrides_plan_source_check;
alter table account_overrides
  add constraint account_overrides_plan_source_check
  check (plan_source is null or plan_source in
         ('comp','paid','store','grandfathered','beta'));

-- 5. Partial indexes: enumerate the grandfather cohort cheaply (admin/analytics)
--    and look up a subscription by its Stripe id from the billing reconciler.
create index if not exists account_overrides_policy_id_idx
  on account_overrides (policy_id) where policy_id is not null;
create index if not exists account_overrides_stripe_subscription_id_idx
  on account_overrides (stripe_subscription_id) where stripe_subscription_id is not null;
