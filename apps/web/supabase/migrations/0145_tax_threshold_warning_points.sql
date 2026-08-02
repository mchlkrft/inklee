-- Tax-threshold early-warning points as DATA, plus a status CHECK (A2, G-track).
--
-- WHY. counsel-accountant-handoff-2026-08.md PART 4 A2: "35k/8k alerts ...
-- confirmed". Those figures (docs/product/pricing-model.md:196: 35,000 EUR is
-- an early warning at 87.5% of the 40,000 EE registration threshold; 8,000 EUR
-- is an early warning under the 10,000 EU B2C OSS threshold) existed only in
-- prose. `tax_thresholds` (0108) had `limit_minor` (the statutory limit) and
-- `status` but nothing encoding WHERE "approaching" starts, so nothing could
-- compute it. This adds the missing number.
--
-- VALUES. ee_registration_40k -> 3,500,000 (35k EUR, matches the accountant's
-- confirmed figure exactly). eu_b2c_oss_10k -> 800,000 (8k EUR). No warning
-- point exists for union_turnover_sme or any country_specific_sme row: the
-- accountant's confirmation named only the two domestic/cross-border figures,
-- and inventing a third would be exactly the kind of unapproved number the
-- "law is data, never invented in code" discipline (billing.ts) exists to
-- prevent. NULL there, not a guess; `resolveThresholdStatus`
-- (tax-threshold-rollup.ts) treats a null warning as "this threshold can only
-- ever report under/exceeded, never approaching" rather than defaulting to a
-- fraction.
--
-- Applied to EXISTING rows via UPDATE (not just future inserts), because this
-- table is already seeded in production by record-tax-approval.cjs and a
-- schema-only default of NULL would leave the two known figures missing until
-- someone remembered to re-run a script by hand.
--
-- CONVERGENCE (AGENTS.md). The column add is `add column if not exists`
-- (converges: adds if missing, skips if present — nothing else is declared
-- inline with it). The data UPDATEs are plain, unconditional, driven by a
-- WHERE clause that matches the CURRENT desired value, not existence — so a
-- re-run always drives both rows back to the approved figures even if they
-- were hand-edited in between, which is the strongest of the convergent
-- shapes AGENTS.md names (drop-then-create's data-layer equivalent). The new
-- CHECK constraints are NAMED and added through a guarded
-- `do $$ ... if not exists ... then ... end if; end $$` block (0136 is the
-- reference shape), so a re-run restores a dropped constraint instead of
-- silently no-op'ing over it.

alter table tax_thresholds
  add column if not exists warning_minor bigint;

update tax_thresholds
  set warning_minor = 3500000, updated_at = now()
  where threshold_type = 'ee_registration_40k'
    and warning_minor is distinct from 3500000;

update tax_thresholds
  set warning_minor = 800000, updated_at = now()
  where threshold_type = 'eu_b2c_oss_10k'
    and warning_minor is distinct from 800000;

do $$
begin
  -- A warning point, when set, must sit at or below the statutory limit —
  -- an "early" warning above the limit it warns about is a contradiction a
  -- typo could introduce silently.
  if not exists (
    select 1 from pg_constraint where conname = 'tax_thresholds_warning_lte_limit_check'
  ) then
    alter table tax_thresholds
      add constraint tax_thresholds_warning_lte_limit_check
      check (warning_minor is null or warning_minor <= limit_minor);
  end if;

  -- `status` had no CHECK since 0108 (any string was accepted). The rollup
  -- (tax-threshold-rollup.ts) is now the sole writer of non-default status
  -- values, so close the vocabulary to what it emits.
  if not exists (
    select 1 from pg_constraint where conname = 'tax_thresholds_status_check'
  ) then
    alter table tax_thresholds
      add constraint tax_thresholds_status_check
      check (status in ('under', 'approaching', 'exceeded'));
  end if;
end $$;
