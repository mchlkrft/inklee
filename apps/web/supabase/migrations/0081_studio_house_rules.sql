-- 0081: Inklee 2.0 Phase 4 - studio house rules
--
-- Structured, reusable studio-level rules (build plan Phase 4 extension,
-- 2026-07-18): deposit policy, client handling, cleaning, supplies included,
-- setup and breakdown, opening hours, keys and access, promotion, walk-ins,
-- cancellation expectations. Optional on the studio profile, shown to
-- requesting artists (approval is where rules start mattering), reused by
-- the welcome pack and the Phase 6 group. Typed keys only in v1.
--
-- RLS posture: owner SELECT via is_studio_owner (house convention); artist-
-- facing display renders through server code gated on publication status.
-- All writes run through the server core (service role after ownership
-- checks). No client write policies.

create table if not exists studio_house_rules (
  id                uuid primary key default gen_random_uuid(),
  studio_profile_id uuid not null references studio_profiles(id) on delete cascade,
  rule_key          text not null
                    check (rule_key in (
                      'deposit_policy', 'client_handling', 'cleaning',
                      'supplies_included', 'setup_breakdown', 'opening_hours',
                      'key_access', 'promotion_rules', 'walk_in_policy',
                      'cancellation_expectations')),
  content           text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (studio_profile_id, rule_key)
);
alter table studio_house_rules enable row level security;

create policy "studio owner reads own house rules" on studio_house_rules
  for select using (is_studio_owner(studio_profile_id));

create index if not exists studio_house_rules_studio_idx
  on studio_house_rules (studio_profile_id);
