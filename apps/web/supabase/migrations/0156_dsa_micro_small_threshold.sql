-- 0156: seed the DSA Section 4 (trader-traceability) exclusion-loss trigger row
-- into tax_thresholds, so one quarterly check covers it alongside the VAT
-- thresholds. Counsel round-6 (2026-08-04, master-package §6.4) supplied the
-- figures and the citation; migration 0155 deliberately shipped WITHOUT this
-- row because a statutory figure is never invented in engineering (0155:11-17).
--
-- Counsel Q1: the trigger is the SMALL-enterprise ceiling under Recommendation
-- 2003/361 (the exclusion survives while Inklee is micro OR small, so the small
-- ceiling is the alert point): fewer than 50 staff AND annual turnover or
-- balance-sheet total <= EUR 10,000,000. Alert when EITHER limb is exceeded.
-- Early warning at 80% (EUR 8,000,000), consistent with the house threshold
-- style. Per Rec. 2003/361 Annex Art. 4(2), status changes only after the
-- ceiling is exceeded over two consecutive accounting periods, so an alert is a
-- review trigger, not an automatic loss of the exclusion.
-- Counsel Q2: this row's citation is DSA Article 29 / Section 4; the older
-- Article 19 / Section 3 line stays as a separate note (Section 3 platform
-- duties) and is not touched.
--
-- CONVERGENT SEED: insert ... on conflict on the (threshold_type,
-- coalesce(country,'')) unique index (0108:47-48), so a re-run restores the
-- intended figures rather than silently no-op'ing over a drifted row. NOT a
-- bare `insert` (would error on re-run) and NOT dependent on inline-create
-- guards. The money columns are in minor units (cents), matching the table.
--
-- LIMITATION, stated rather than hidden: the automated rollup
-- (tax-threshold-rollup.ts) writes current_minor ONLY for ee_registration_40k,
-- so this row's current_minor stays 0 and is maintained by the quarterly manual
-- check. The 50-staff second limb and the two-consecutive-periods rule have no
-- column on this money-only table and live in `notes` here + the DSA procedure.

insert into tax_thresholds (
  threshold_type, country, limit_minor, warning_minor, currency, status, notes
)
values (
  'dsa_micro_small_2003_361',
  null,
  1000000000,  -- EUR 10,000,000 small-enterprise ceiling (Rec. 2003/361)
  800000000,   -- EUR 8,000,000 early warning (80%, counsel round-6)
  'eur',
  'under',
  'DSA Section 4 (Article 29) trader-traceability exclusion trigger. Inklee is '
  'excluded from Arts. 30-32 while it is a micro OR small enterprise, so the '
  'alert point is the SMALL ceiling under Recommendation 2003/361: fewer than '
  '50 staff AND annual turnover or balance-sheet total <= EUR 10,000,000. Status '
  'is lost when EITHER limb is exceeded, so also monitor headcount (< 50), which '
  'this money-only table cannot hold. Per Rec. 2003/361 Annex Art. 4(2) status '
  'changes only after the ceiling is exceeded over TWO consecutive accounting '
  'periods, so an alert here is a review trigger, not automatic loss. '
  'current_minor is maintained by the quarterly manual check (the automated '
  'rollup writes only ee_registration_40k). Counsel round-6, 2026-08-04.'
)
on conflict (threshold_type, coalesce(country, '')) do update set
  limit_minor   = excluded.limit_minor,
  warning_minor = excluded.warning_minor,
  currency      = excluded.currency,
  notes         = excluded.notes,
  updated_at    = now();
