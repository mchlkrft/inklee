alter table profiles
  add column if not exists is_tester boolean not null default false;

comment on column profiles.is_tester is 'Flagged by admin — excluded from analytics KPIs and funnels.';
