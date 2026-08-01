-- Fee tier stamp at settlement (G2, FEE-STP-001).
--
-- WHY. 0116 stamped `fee_schedule_version` on `booking_requests` and `orders`
-- so an old charge could be reproduced under the schedule it was actually
-- priced with; 0125 stamps it on `payment_requests` too, as evidence of what
-- the client was quoted. Under v1 that is enough: every tier prices the same
-- 300 bps, so (version, base) alone reproduces the charged fee. Under v2 the
-- SAME (version, base) pair reproduces three different fees depending on tier
-- (free: cannot transact; plus: 50 bps; legacy: 300 bps), so the version
-- alone stops being reproducible the moment v2 activates (P7). This adds the
-- missing half: which TIER the schedule was read at.
--
-- WHERE. `booking_requests` and `orders` already carry `fee_schedule_version`
-- (0116); this adds only `fee_tier` to each, matching that column's shape and
-- nullability. `payment_collections` carries neither yet, so both land here.
--
-- DELIBERATELY NOT ON `payment_requests`. 0125 (:308-313) already records that
-- the artist's OWN client writes `fee_schedule_version` on that table via
-- PostgREST (the row is client-writable pre-payment), so a residual write
-- there cannot move a real charge but would show up as a reconciliation
-- discrepancy in A8. Adding `fee_tier` to the same client-writable surface
-- would widen that same residual rather than fix anything; the
-- service-role-only `payment_collections` row is the trustworthy place for
-- the settled stamp, and it is service-role-only per 0125's own REVOKE
-- (artist reads via the SELECT policy; insert/update/delete are revoked from
-- anon and authenticated).
--
-- NO BACKFILL (0116/0131 precedent): an invented tier for a pre-migration row
-- is worse than an honest null. All three columns nullable, no default.
--
-- CONVERGENCE (AGENTS.md). Columns via `add column if not exists`, which
-- converges: a re-run adds a missing column and skips a present one. The
-- CHECK constraints are NAMED and added through a guarded
-- `do $$ ... if not exists ... end $$` block (0131 is the reference shape),
-- so a re-run restores a dropped constraint instead of silently skipping it.

alter table booking_requests
  add column if not exists fee_tier text;

alter table orders
  add column if not exists fee_tier text;

alter table payment_collections
  add column if not exists fee_tier text,
  add column if not exists fee_schedule_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'booking_requests_fee_tier_check'
  ) then
    alter table booking_requests
      add constraint booking_requests_fee_tier_check
      check (fee_tier is null or fee_tier in ('free', 'plus', 'legacy'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_fee_tier_check'
  ) then
    alter table orders
      add constraint orders_fee_tier_check
      check (fee_tier is null or fee_tier in ('free', 'plus', 'legacy'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_fee_tier_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_fee_tier_check
      check (fee_tier is null or fee_tier in ('free', 'plus', 'legacy'));
  end if;
end $$;
