-- 0091: the seed density cap becomes a founder-configurable setting
--
-- Founder decision 2026-07-19: the fixed 5-per-bucket cap was a launch-era
-- curation posture; with the authenticity filter + dedup + claimed-profile
-- protection in front of every automated import, completeness now beats
-- curation. The cap is LIFTED by default (null = unlimited) but the
-- enforcement machinery stays: typing a number here re-arms it instantly
-- for both lanes (the check still lives in the one conversion core).
--
-- Singleton settings row, RLS zero policies (admin/service surface only).

create table if not exists map_settings (
  id                  boolean primary key default true check (id),
  seed_cap_per_bucket int check (
    seed_cap_per_bucket is null
    or seed_cap_per_bucket between 1 and 10000
  ),
  updated_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now()
);
alter table map_settings enable row level security;

insert into map_settings (id, seed_cap_per_bucket)
values (true, null)
on conflict (id) do nothing;
