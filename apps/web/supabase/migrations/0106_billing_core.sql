-- 0106: Billing core schema (BM-2.0 Stage 1).
-- STATUS: APPLIED + verified in prod 2026-07-23 (supabase db push; all 13 tables
-- confirmed RLS-on with zero policies, the tts_no_mutation trigger present, all
-- empty). The "apply only after ratification" note below is historical context.
--
-- Apply only after the EU-billing posture is ratified (accountant tax policy,
-- counsel service classification + terms/withdrawal wording) and NEVER as a
-- precondition to charging live money. Every table below is additive, reversible,
-- and SERVICE-ROLE ONLY (RLS enabled with zero policies, the 0045 pattern): no
-- client grants, no seed.sql mirror, no 0074/0089 column-grant footgun.
--
-- Numbering: 0105 (account_overrides) is authored; this is the next sequential
-- number. The deferred goods `orders` migration renumbers to a later slot when it
-- is actually authored, per the AGENTS.md rule against authoring an earlier number
-- later (the "db push replays 0000" footgun).
--
-- Amendments baked in (founder 2026-07-23):
--  (1) service classification is a VERSIONED legal-policy row, not hardcoded.
--  (2) an accountant-approved tax posture is required; below-threshold does not
--      settle obligations. Founder/dev approval never substitutes for accountant.
--  (3) explicit VIES states; provider_unavailable never silently becomes valid or
--      business_without_vat; every attempt stored append-only.
--  (4) the business-use declaration is EVIDENCE with a confidence + review state,
--      not absolute truth.
--  (5) billing_subscriptions is a reconciled ACCESS-CONTROL MIRROR of Stripe, not
--      a competing financial ledger; Stripe owns payments and invoices.
--  (7) product package + entitlement package are stable; the Stripe Price is
--      replaceable and effective-dated; tax behavior is per-Price, not a permanent
--      business-wide choice. Price ids never appear in authorization checks.
--  (8) minimum coherent set now; withdrawal_cases + billing_risk_events are
--      authored-schema-only; NO custom promo_codes table (use Stripe promotions).
--  (9) the tax snapshot references Stripe objects + policy/plan/classification
--      versions; corrections are new rows, never a mutation.
--  (11) activation approvals carry an explicit group: technical | b2b | b2c.
--
-- Externally-owned vocabularies (Stripe statuses, VIES results) carry NO db CHECK
-- (the 0105 subscription_status lesson: a new upstream value must not 500 a write).
-- Finite internal vocabularies keep a CHECK.

-- ---------------------------------------------------------------------------
-- 1. Versioned legal-policy decisions (amendment 1). Counsel-owned. The service
--    classification (continuously-supplied digital service vs digital content)
--    lives here as a versioned, approved row, referenced by the withdrawal engine
--    and the tax snapshot, never hardcoded in application logic.
create table if not exists billing_legal_policies (
  id            uuid primary key default gen_random_uuid(),
  policy_kind   text not null,                 -- 'service_classification' | 'withdrawal_policy' | 'terms_binding'
  version_label text not null,                 -- e.g. 'service-classification-v1'
  value         jsonb not null,                -- the decision, structured (e.g. {"classification":"continuous_digital_service","withdrawal_extinguished_on_immediate_performance":false})
  effective_from timestamptz not null,
  effective_to  timestamptz,
  is_current    boolean not null default false,
  approved_by   text,                          -- counsel identity; null = NOT usable for live consumer billing
  approved_at   timestamptz,
  counsel_ref   text,
  notes         text,
  created_at    timestamptz not null default now()
);
create unique index if not exists blp_one_current_per_kind
  on billing_legal_policies (policy_kind) where is_current;
alter table billing_legal_policies enable row level security;   -- zero policies = service-role only

-- ---------------------------------------------------------------------------
-- 2. Effective-dated tax posture (amendment 2). Accountant-owned. Below-threshold
--    does NOT settle obligations; a live charge requires an approved, effective row.
--    The rule set is data, not code. Founder/dev approval cannot substitute.
create table if not exists tax_policies (
  id                    uuid primary key default gen_random_uuid(),
  version_label         text not null,         -- e.g. 'ee-unregistered-v1'
  seller_country        text not null default 'EE',
  seller_vat_registered boolean not null default false,
  seller_vat_number     text,
  oss_registered        boolean not null default false,
  calc_provider         text not null default 'stripe_tax',   -- stripe_tax | manual | none
  treatment_rules       jsonb not null,        -- class -> treatment mapping (data, not code)
  effective_from        timestamptz not null,
  effective_to          timestamptz,
  is_current            boolean not null default false,
  approved_by_accountant text,                 -- null = NOT usable live; founder/dev cannot set this
  approved_at           timestamptz,
  accountant_ref        text,
  notes                 text,
  created_at            timestamptz not null default now()
);
create unique index if not exists tax_policies_one_current on tax_policies (is_current) where is_current;
alter table tax_policies enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Pricing plans (amendment 7). The stable product + entitlement package is
--    decoupled from the REPLACEABLE, effective-dated Stripe Price. Tax behavior is
--    per-Price (a new Price may be created and the old archived), NOT a permanent
--    business-wide choice. The entitlement package key drives access; the Stripe
--    Price id NEVER appears in an authorization check.
create table if not exists pricing_plans (
  id                    uuid primary key default gen_random_uuid(),
  commercial_package    text not null,         -- e.g. 'inklee_plus_monthly' (stable)
  entitlement_package   text not null,         -- e.g. 'plus_v1' (stable; resolved by the entitlement engine)
  eligible_customer_type text not null,        -- 'business' | 'consumer' | 'any'
  stripe_price_id       text not null,         -- REPLACEABLE; a new Price is a new row, old row archived
  stripe_product_id     text,
  currency              text not null,
  billing_interval      text not null,         -- 'month' | 'year' (annual consumer stays disabled via config, amendment 10)
  tax_behavior          text not null,         -- 'inclusive' | 'exclusive' (fixed at Price creation, per Price)
  marketing_display_minor integer,             -- the shown price in minor units; display convention lives here
  mode                  text not null,         -- 'test' | 'live'
  effective_from        timestamptz not null,
  effective_to          timestamptz,
  active                boolean not null default true,
  notes                 text,
  created_at            timestamptz not null default now()
);
create index if not exists pricing_plans_lookup_idx
  on pricing_plans (commercial_package, eligible_customer_type, mode) where active;
alter table pricing_plans enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Customer classification (amendments 3, 4). One row per artist. The four
--    axes are separate; none is derived from tier/role. The declaration is
--    EVIDENCE (a confidence + review state), not absolute truth. VIES has explicit
--    states; provider_unavailable is never silently valid nor business_without_vat.
create table if not exists account_billing_profiles (
  artist_id                 uuid primary key references profiles(id) on delete cascade,

  -- Axis A: contract customer type (consumer-law applicability). Evidence model.
  contract_customer_type    text not null default 'unresolved',   -- unresolved|business|consumer|manual_review
  classification_source     text,              -- self_declared|vat_verified|manually_verified|system_inferred|conflicting_evidence|unresolved
  classification_confidence text,              -- low|medium|high
  classification_review     text not null default 'not_required',  -- not_required|pending|reviewed|conflicting
  classification_reviewer   text,              -- admin identity when manually reviewed
  classification_decided_at timestamptz,
  classification_policy_version text,          -- the billing_legal_policies version in force at decision

  -- Axis B: VAT customer status (reverse-charge / place-of-supply).
  vat_customer_status       text not null default 'unresolved',   -- unresolved|eu_vat_registered_business|business_without_vat|private_non_taxable|non_eu_business|manual_review
  vat_status_source         text,

  -- Axis C: resolved tax treatment (NO check; policy-owned, app-validated).
  tax_treatment             text not null default 'unresolved',
  tax_treatment_source      text,
  tax_policy_version        text,

  -- Declared billing identity (the customer's data, never profiles.stripe_account_country).
  legal_name                text,
  trading_name              text,
  billing_country           text,              -- ISO-3166-1 alpha-2
  billing_address           jsonb,
  business_use_declared     boolean not null default false,
  business_use_declared_at  timestamptz,
  business_use_consent_version text,

  -- VAT number + current VIES state (amendment 3). The append-only attempt log is
  -- vies_validation_attempts; this holds the CURRENT resolved state only.
  vat_number_submitted      text,
  vat_number_normalized     text,
  vies_state                text not null default 'not_submitted',  -- not_submitted|validation_pending|valid|invalid|provider_unavailable|manual_review
  vies_checked_at           timestamptz,

  location_evidence         jsonb,

  admin_notes               text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
alter table account_billing_profiles enable row level security;
-- Finite internal vocabularies get a CHECK; tax_treatment + vies raw stay uncheck-ed.
alter table account_billing_profiles
  add constraint abp_contract_type_check
  check (contract_customer_type in ('unresolved','business','consumer','manual_review'));
alter table account_billing_profiles
  add constraint abp_classification_source_check
  check (classification_source is null or classification_source in
    ('self_declared','vat_verified','manually_verified','system_inferred','conflicting_evidence','unresolved'));
alter table account_billing_profiles
  add constraint abp_vat_status_check
  check (vat_customer_status in
    ('unresolved','eu_vat_registered_business','business_without_vat','private_non_taxable','non_eu_business','manual_review'));
alter table account_billing_profiles
  add constraint abp_vies_state_check
  check (vies_state in ('not_submitted','validation_pending','valid','invalid','provider_unavailable','manual_review'));
create index if not exists abp_review_idx
  on account_billing_profiles (classification_review) where classification_review in ('pending','conflicting');

-- ---------------------------------------------------------------------------
-- 4b. VIES validation attempts (amendment 3): every attempt stored append-only
--     with its timestamp and provider result. Only a stored 'valid' may support
--     reverse charge; provider_unavailable never auto-resolves.
create table if not exists vies_validation_attempts (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid not null references profiles(id) on delete cascade,
  vat_submitted text not null,
  vat_normalized text,
  result_state  text not null,                 -- valid|invalid|provider_unavailable|malformed (raw provider outcome)
  provider      text not null default 'vies',
  provider_ref  text,                          -- VIES consultation number / request id
  provider_response jsonb,                     -- raw payload for audit (may contain name/address)
  checked_at    timestamptz not null default now()
);
create index if not exists vies_attempts_artist_idx on vies_validation_attempts (artist_id, checked_at desc);
alter table vies_validation_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Billing subscriptions (amendment 5): a reconciled ACCESS-CONTROL MIRROR of
--    Stripe, NOT a competing financial ledger. It carries the internal state the
--    entitlement resolver needs, keyed to the Stripe subscription. Stripe remains
--    the payment + invoice + renewal system. (Access itself resolves through
--    account_overrides.plan_tier/plan_expires_at, which the webhook keeps current;
--    this row is the subscription-level reconciliation record.)
create table if not exists billing_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  artist_id             uuid not null references profiles(id) on delete cascade,
  stripe_customer_id    text not null,
  stripe_subscription_id text not null,
  stripe_price_id       text not null,
  pricing_plan_id       uuid references pricing_plans(id),
  status                text not null,         -- raw Stripe status, NO check (0105 lesson)
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  contract_customer_type text not null,        -- snapshot of the classification at purchase (business|consumer)
  mode                  text not null,         -- test | live
  last_reconciled_at    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- One internal row per Stripe subscription; the reconciler treats >1 active per
-- customer as an incident (the F-2 duplicate-subscription guard).
create unique index if not exists billing_subscriptions_stripe_uniq on billing_subscriptions (stripe_subscription_id);
create index if not exists billing_subscriptions_customer_idx on billing_subscriptions (stripe_customer_id);
create index if not exists billing_subscriptions_artist_idx on billing_subscriptions (artist_id);
alter table billing_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- 6. Consent evidence (append-only, the ONE home for every discrete consent).
--    Each control its own row; other tables reference by id, never re-store the
--    version/hash/timestamp (compliance-review F3).
create table if not exists billing_consent_records (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid not null references profiles(id) on delete cascade,
  consent_type  text not null,                 -- terms_acceptance|business_use_declaration|immediate_performance_request|withdrawal_ack
  consent_version text not null,               -- documents.ts version / DRAFT-copy version
  consent_hash  text,                          -- SHA-256 versionHash where applicable
  consented_at  timestamptz not null,
  ip            inet,                          -- where lawful (founder + counsel retention decision)
  user_agent    text,
  context       jsonb,                         -- e.g. the quote id / subscription id this consent attaches to
  created_at    timestamptz not null default now()
);
create index if not exists consent_artist_type_idx on billing_consent_records (artist_id, consent_type, consented_at desc);
alter table billing_consent_records enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Server-authoritative quotes (P4). The single source of the displayed price
--    AND the Stripe amount; VAT is never computed only client-side. Short-lived.
create table if not exists billing_quotes (
  id                uuid primary key default gen_random_uuid(),
  artist_id         uuid not null references profiles(id) on delete cascade,
  pricing_plan_id   uuid not null references pricing_plans(id),
  contract_customer_type text not null,
  tax_treatment     text not null,
  tax_policy_version text,
  currency          text not null,
  net_minor         integer not null,
  vat_minor         integer not null,
  gross_minor       integer not null,
  tax_rate          numeric(6,4),
  tax_behavior      text not null,             -- inclusive|exclusive (from the Price)
  stripe_tax_calculation_ref text,
  expires_at        timestamptz not null,
  consumed_at       timestamptz,               -- set when a Checkout Session is created from it
  mode              text not null,
  created_at        timestamptz not null default now()
);
create index if not exists billing_quotes_artist_idx on billing_quotes (artist_id, created_at desc);
alter table billing_quotes enable row level security;

-- ---------------------------------------------------------------------------
-- 8. Activation approvals (amendment 11): three groups. Live charging requires
--    the matching group's rows approved + bound to the active artifact version.
--    A frontend flag alone can never open the gate (the server core reads this).
create table if not exists billing_activation_approvals (
  approval_key    text primary key,
  approval_group  text not null,               -- 'technical' | 'b2b' | 'b2c'
  approved        boolean not null default false,
  approved_by     text,                        -- founder / accountant / counsel / eng identity
  approved_at     timestamptz,
  evidence_ref    text,                        -- signed doc, test-run id, counsel email ref
  bound_artifact  text,                        -- terms versionHash / tax-policy version / legal-policy version
  notes           text,
  updated_at      timestamptz not null default now()
);
alter table billing_activation_approvals enable row level security;
alter table billing_activation_approvals
  add constraint baa_group_check check (approval_group in ('technical','b2b','b2c'));

-- ---------------------------------------------------------------------------
-- 9. Immutable per-transaction tax snapshot (amendment 9). Records the BASIS
--    Inklee used; Stripe remains the payment + invoice system. References the
--    Stripe objects and the policy/plan/classification versions. Corrections are
--    NEW rows (kind='refund'|'credit_note'), never a mutation. Three-layer
--    immutability: service-role RLS, a raise-on-mutation trigger, a content hash.
create table if not exists transaction_tax_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null,         -- charge | refund | credit_note
  corrects_snapshot_id  uuid references transaction_tax_snapshots(id),
  artist_id             uuid not null references profiles(id) on delete cascade,
  billing_subscription_id uuid references billing_subscriptions(id),
  -- Stripe references (Stripe is the SoT for payment + invoice)
  stripe_customer_id    text,
  stripe_subscription_id text,
  stripe_invoice_id     text,
  stripe_payment_intent_id text,
  stripe_charge_id      text,
  stripe_tax_calculation_ref text,
  -- versions in force
  pricing_plan_id       uuid references pricing_plans(id),
  tax_policy_version    text not null,
  classification_version text,                 -- the classification/legal-policy version at settlement
  -- seller + customer state copied at settlement
  seller_country        text not null,
  seller_vat_registered boolean not null,
  customer_country      text,
  contract_customer_type text,
  vat_customer_status   text,
  vies_state            text,
  -- derived treatment (stored, not implicit)
  tax_treatment         text not null,
  tax_jurisdiction      text,
  tax_rate              numeric(6,4),
  tax_code              text,
  reverse_charge_applied boolean not null default false,
  oss_included          boolean not null default false,
  -- amounts
  currency              text not null,
  net_minor             integer not null,
  vat_minor             integer not null,
  gross_minor           integer not null,
  price_tax_behavior    text not null,         -- inclusive | exclusive
  content_hash          text not null,
  created_at            timestamptz not null default now()
);
create unique index if not exists tts_idempotent
  on transaction_tax_snapshots (kind, stripe_invoice_id, stripe_charge_id);
alter table transaction_tax_snapshots enable row level security;
create or replace function tts_block_mutation() returns trigger language plpgsql as $$
begin raise exception 'transaction_tax_snapshots is append-only; corrections are new rows'; end $$;
drop trigger if exists tts_no_mutation on transaction_tax_snapshots;
create trigger tts_no_mutation before update or delete on transaction_tax_snapshots
  for each row execute function tts_block_mutation();

-- ---------------------------------------------------------------------------
-- 10. Durable contract confirmations (P5, append-only). Evidence that the
--     confirmation was generated and delivered or attempted.
create table if not exists billing_contract_confirmations (
  id                uuid primary key default gen_random_uuid(),
  artist_id         uuid not null references profiles(id) on delete cascade,
  billing_subscription_id uuid references billing_subscriptions(id),
  stripe_invoice_id text,
  terms_version     text,
  delivery_channel  text not null default 'email',
  delivery_status   text not null default 'pending',   -- pending|sent|failed
  delivery_ref      text,
  payload_hash      text,                      -- hash of the generated confirmation content
  generated_at      timestamptz not null default now(),
  delivered_at      timestamptz
);
create index if not exists bcc_artist_idx on billing_contract_confirmations (artist_id, generated_at desc);
alter table billing_contract_confirmations enable row level security;

-- ---------------------------------------------------------------------------
-- 11. Authored-schema-only (amendment 8): the tables exist so the schema is
--     coherent, but their OPERATIONAL systems are built in their stage (Stage 4).
--     No code writes these until then.
create table if not exists withdrawal_cases (
  id                uuid primary key default gen_random_uuid(),
  artist_id         uuid not null references profiles(id) on delete cascade,
  billing_subscription_id uuid references billing_subscriptions(id),
  state             text not null default 'received',   -- received|acknowledged|refund_pending|completed|not_available
  withdrawal_available boolean,
  availability_reason text,
  received_at       timestamptz,               -- server-recorded exact receipt time
  acknowledged_at   timestamptz,
  service_start     timestamptz,
  withdrawal_period_start timestamptz,
  withdrawal_deadline timestamptz,
  immediate_performance_consent_id uuid references billing_consent_records(id),
  proration_policy_version text,
  refund_minor      integer,
  tax_correction_snapshot_id uuid references transaction_tax_snapshots(id),
  stripe_refund_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists withdrawal_cases_artist_idx on withdrawal_cases (artist_id);
alter table withdrawal_cases enable row level security;

create table if not exists billing_risk_events (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid references profiles(id) on delete cascade,
  event_type    text not null,                 -- repeated_withdrawal|chargeback|fingerprint_match|promo_abuse|...
  subject_ref   text,                          -- billing identity / payment fingerprint / subscription id
  evidence      jsonb,
  admin_reason  text,                          -- explicit reasoning for any future contracting restriction
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists risk_events_artist_idx on billing_risk_events (artist_id, created_at desc);
alter table billing_risk_events enable row level security;

-- NOTE: NO promo_codes table (amendment 8). Founder-window and future discounts
-- use Stripe promotion codes directly; an internal mapping is added only when a
-- defined product requirement exists.

-- ---------------------------------------------------------------------------
-- Apply + verify (respect AGENTS.md migration bookkeeping): supabase db push;
-- do NOT migration repair --status applied. Verify every table has RLS on and
-- zero policies (the sole protection) before any dependent code trusts them:
--   select relname, relrowsecurity from pg_class where relname in (
--     'billing_legal_policies','tax_policies','pricing_plans',
--     'account_billing_profiles','vies_validation_attempts','billing_subscriptions',
--     'billing_consent_records','billing_quotes','billing_activation_approvals',
--     'transaction_tax_snapshots','billing_contract_confirmations',
--     'withdrawal_cases','billing_risk_events');   -- all relrowsecurity = t
--   select tablename, count(*) from pg_policies
--     where tablename like 'billing_%' or tablename like 'account_billing%'
--        or tablename in ('tax_policies','pricing_plans','vies_validation_attempts',
--                         'transaction_tax_snapshots','withdrawal_cases')
--     group by tablename;   -- expect no rows (zero policies everywhere)
