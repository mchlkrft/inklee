-- 0108: management-board tax-posture approval model + threshold tracking
-- (BM-2.0). tax_policies is empty (created in 0106, never populated), so
-- reworking its approval columns is safe. Additive + service-role only.
--
-- WHY: legal responsibility for the tax posture sits with the company's
-- management board, so the board is the approving authority (not a single
-- accountant sign-off, which is an internal risk control, not a statutory
-- requirement). Professional review stays STRONGLY RECOMMENDED and is recorded
-- as evidence, but is not represented as legally mandatory.

-- 1. Replace the accountant-only approval with the management-board model.
alter table tax_policies drop column if exists approved_by_accountant;
alter table tax_policies drop column if exists accountant_ref;
alter table tax_policies
  add column if not exists management_board_approved boolean not null default false,
  add column if not exists approved_by text,
  add column if not exists approval_basis text,
  add column if not exists evidence_references jsonb not null default '[]'::jsonb,
  add column if not exists professional_reviewer text, -- optional; evidence, not mandatory
  add column if not exists professional_review_date timestamptz,
  add column if not exists next_mandatory_review_at timestamptz,
  add column if not exists posture_version text;
-- approved_at (0106) stays = the board approval timestamp.
-- treatment_rules (0106 jsonb) now holds TaxCustomerClass -> rule with DISTINCT
-- treatments (never a generic out_of_scope); no schema change needed.

comment on column tax_policies.management_board_approved is
  'The management board (legal responsibility for the posture) is the approving authority. Founder/dev/single-employee approval does not substitute. Professional review is optional evidence, not represented as legally mandatory.';

-- 2. Threshold tracking. One row per tracked threshold; current_minor is the
--    running total (maintained by ops / a future rollup over settlements),
--    status is the operational flag. Distinguishes the EE registration
--    threshold, the cross-border EU B2C electronic-services threshold, the
--    total Union turnover for the cross-border SME scheme, and any
--    country-specific SME threshold.
create table if not exists tax_thresholds (
  id             uuid primary key default gen_random_uuid(),
  threshold_type text not null, -- ee_registration_40k | eu_b2c_oss_10k | union_turnover_sme | country_specific_sme
  country        text,          -- ISO alpha-2 for country_specific_sme; null otherwise
  limit_minor    bigint not null,
  currency       text not null default 'eur',
  current_minor  bigint not null default 0,
  status         text not null default 'under', -- under | approaching | exceeded
  notes          text,
  updated_at     timestamptz not null default now()
);
create unique index if not exists tax_thresholds_type_country
  on tax_thresholds (threshold_type, coalesce(country, ''));
alter table tax_thresholds enable row level security; -- zero policies = service-role only
