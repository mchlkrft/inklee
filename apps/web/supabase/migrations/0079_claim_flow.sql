-- 0079: Inklee 2.0 Phase 3 - studio claim flow + claim conflict
--
-- Makes location_claims (0075) usable and lands the claim conflict workflow
-- (scope 4.10 extension, founder-approved 2026-07-18). Design decision the
-- schema addendum deferred to this slice: conflict is an EXPLICIT state on
-- the location ("mark as claim conflict" is the locked wording), set by the
-- claim core when a second pending claim arrives and cleared on resolution.
-- Ownership never changes while contested: approval is the only transition
-- that assigns an owner, it is admin-only, and approving one claim rejects
-- the siblings in the same action.
--
-- RLS note, deviating deliberately from the 0075 comment ("claimant
-- self-insert/select policies"): claimants get SELECT-own ONLY. Claim
-- INSERTs stay service-role-only through the rate-limited server action,
-- because a client INSERT policy would let direct PostgREST bypass the rate
-- limit entirely (the 0074-class lesson: policies cannot see rate limits).

-- 1. Conflict state on the location.
alter table map_locations
  drop constraint if exists map_locations_claim_status_check;
alter table map_locations
  add constraint map_locations_claim_status_check
  check (claim_status in ('unclaimed', 'claim_pending', 'claim_conflict', 'claimed'));

-- 2. Claimants read their own claims (status surfaces in the cockpit).
create policy "claimant reads own claims" on location_claims
  for select
  using (claimant_user_id = auth.uid());

-- Column privileges (the 0062 pattern, applied BEFORE shipping this time):
-- the SELECT-own policy must not expose who reviewed the claim. Revoke
-- table-level SELECT and re-grant everything except reviewed_by/reviewed_at.
-- ⚠️ Column grants do not auto-extend: a future migration adding a
-- claimant-readable column must extend this grant, and the local seed.sql
-- mirror carries a copy.
revoke select on location_claims from anon, authenticated;
grant select (
  id,
  map_location_id,
  claimant_user_id,
  claimant_role,
  social_link,
  address_confirmation,
  status,
  evidence_note,
  created_at
) on location_claims to authenticated;

-- 3. One live claim per claimant per location; re-claiming after a rejection
--    stays possible because the uniqueness only binds pending rows.
create unique index if not exists location_claims_one_pending_idx
  on location_claims (map_location_id, claimant_user_id)
  where status = 'pending';

create index if not exists location_claims_claimant_idx
  on location_claims (claimant_user_id, created_at desc);
