-- 0080: Inklee 2.0 Phase 4 - guest spot requests, proposals, stays
--
-- The core of the product (docs/product/inklee-2-schema-proposal.md section
-- 2.4; build plan Phase 4). A guest spot request behaves like a booking
-- request between an artist and a studio: request dates, the studio accepts,
-- passes, or suggests other dates; acceptance creates exactly one stay and
-- materializes a trip + trip leg in the artist's existing travel data
-- (approved default 4), so the artist calendar, booking form labels, and
-- email plumbing all work through pipelines that already exist.
--
-- RLS posture (the 0079 lesson carried forward): both parties get SELECT via
-- single-column checks (denormalized ids per the house convention); ALL
-- writes run through server cores (service role after explicit party checks,
-- conditional status-gated updates), because RLS cannot gate FSM transitions
-- or rate limits. No client INSERT/UPDATE/DELETE policies anywhere here.

-- ---------------------------------------------------------------------------
create table if not exists guest_spot_requests (
  id                    uuid primary key default gen_random_uuid(),
  artist_user_id        uuid not null references profiles(id) on delete cascade,
  studio_profile_id     uuid not null references studio_profiles(id) on delete cascade,
  requested_start_date  date not null,
  requested_end_date    date not null,
  date_flexibility      text not null default 'exact'
                        check (date_flexibility in ('exact', 'flexible', 'range')),
  social_link           text not null,
  introduction          text not null,
  expected_clients      text,
  equipment_needs       text,
  client_booking_status text
                        check (client_booking_status is null
                               or client_booking_status in ('will_open', 'wont_open', 'unsure')),
  status                text not null default 'submitted'
                        check (status in (
                          'draft', 'submitted', 'under_review',
                          'information_requested', 'alternative_dates_proposed',
                          'artist_reviewing_proposal', 'accepted',
                          'awaiting_confirmation', 'confirmed', 'declined',
                          'withdrawn', 'cancelled', 'completed', 'no_show')),
  submitted_at          timestamptz default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint guest_spot_request_dates check (requested_end_date >= requested_start_date)
);
alter table guest_spot_requests enable row level security;

create policy "artist reads own guest spot requests" on guest_spot_requests
  for select using (artist_user_id = auth.uid());
create policy "studio owner reads studio guest spot requests" on guest_spot_requests
  for select using (is_studio_owner(studio_profile_id));

create index if not exists guest_spot_requests_artist_idx
  on guest_spot_requests (artist_user_id, created_at desc);
create index if not exists guest_spot_requests_studio_idx
  on guest_spot_requests (studio_profile_id, status, created_at desc);
-- One live request per artist per studio; asking again after a decision
-- stays possible because the uniqueness binds only the open states.
create unique index if not exists guest_spot_requests_one_open_idx
  on guest_spot_requests (artist_user_id, studio_profile_id)
  where status in ('submitted', 'under_review', 'information_requested',
                   'alternative_dates_proposed', 'artist_reviewing_proposal',
                   'accepted', 'awaiting_confirmation');

-- ---------------------------------------------------------------------------
-- Alternate-date proposals: separate rows, never overwriting the request.
create table if not exists guest_spot_proposals (
  id                    uuid primary key default gen_random_uuid(),
  guest_spot_request_id uuid not null references guest_spot_requests(id) on delete cascade,
  -- Denormalized for single-column RLS (house convention).
  artist_user_id        uuid not null references profiles(id) on delete cascade,
  studio_profile_id     uuid not null references studio_profiles(id) on delete cascade,
  proposed_by_user_id   uuid references profiles(id) on delete set null,
  start_date            date not null,
  end_date              date not null,
  message               text,
  status                text not null default 'proposed'
                        check (status in ('proposed', 'accepted', 'rejected', 'superseded', 'withdrawn')),
  created_at            timestamptz not null default now(),
  constraint guest_spot_proposal_dates check (end_date >= start_date)
);
alter table guest_spot_proposals enable row level security;

create policy "artist reads own guest spot proposals" on guest_spot_proposals
  for select using (artist_user_id = auth.uid());
create policy "studio owner reads studio guest spot proposals" on guest_spot_proposals
  for select using (is_studio_owner(studio_profile_id));

create index if not exists guest_spot_proposals_request_idx
  on guest_spot_proposals (guest_spot_request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Stays: exactly one per confirmed request (the predecessor's idempotency
-- fix), the entry both calendars render and the passport will count.
create table if not exists guest_spot_stays (
  id                    uuid primary key default gen_random_uuid(),
  guest_spot_request_id uuid unique references guest_spot_requests(id) on delete set null,
  artist_user_id        uuid not null references profiles(id) on delete cascade,
  studio_profile_id     uuid not null references studio_profiles(id) on delete cascade,
  starts_on             date not null,
  ends_on               date not null,
  status                text not null default 'confirmed'
                        check (status in ('confirmed', 'active', 'completed', 'cancelled', 'no_show')),
  confirmation_note     text,
  terms_snapshot        jsonb,
  trip_leg_id           uuid references trip_legs(id) on delete set null,
  confirmed_at          timestamptz not null default now(),
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint guest_spot_stay_dates check (ends_on >= starts_on)
);
alter table guest_spot_stays enable row level security;

create policy "artist reads own stays" on guest_spot_stays
  for select using (artist_user_id = auth.uid());
create policy "studio owner reads studio stays" on guest_spot_stays
  for select using (is_studio_owner(studio_profile_id));

create index if not exists guest_spot_stays_studio_idx
  on guest_spot_stays (studio_profile_id, starts_on);
create index if not exists guest_spot_stays_artist_idx
  on guest_spot_stays (artist_user_id, starts_on);

-- ---------------------------------------------------------------------------
-- Private pricing and policy notes from the studio to the requesting artist
-- (interaction plane: only the two parties ever read them).
create table if not exists guest_spot_private_notes (
  id                    uuid primary key default gen_random_uuid(),
  guest_spot_request_id uuid not null references guest_spot_requests(id) on delete cascade,
  artist_user_id        uuid not null references profiles(id) on delete cascade,
  studio_profile_id     uuid not null references studio_profiles(id) on delete cascade,
  author_user_id        uuid references profiles(id) on delete set null,
  body                  text not null,
  created_at            timestamptz not null default now()
);
alter table guest_spot_private_notes enable row level security;

create policy "artist reads own guest spot notes" on guest_spot_private_notes
  for select using (artist_user_id = auth.uid());
create policy "studio owner reads studio guest spot notes" on guest_spot_private_notes
  for select using (is_studio_owner(studio_profile_id));

create index if not exists guest_spot_private_notes_request_idx
  on guest_spot_private_notes (guest_spot_request_id, created_at);

-- ---------------------------------------------------------------------------
-- Quiet-hold blacklist (founder decision 2026-07-17): requests from listed
-- artists land in a collapsed inbox section with no notification, and the
-- artist can never observe the difference. Owner-only SELECT; deliberately
-- NO artist-side policy, so a blacklisted artist cannot detect the row.
-- Writes are service-role only (management UI ships in a later slice).
create table if not exists studio_blacklists (
  id                uuid primary key default gen_random_uuid(),
  studio_profile_id uuid not null references studio_profiles(id) on delete cascade,
  artist_user_id    uuid not null references profiles(id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (studio_profile_id, artist_user_id)
);
alter table studio_blacklists enable row level security;

create policy "studio owner reads own blacklist" on studio_blacklists
  for select using (is_studio_owner(studio_profile_id));

-- ---------------------------------------------------------------------------
-- The ONLY touch on an existing 1.x table in all of Phase 4: nullable,
-- defaulted linkage columns on trip_legs so a studio-confirmed leg is
-- distinguishable and edit-protected (server cores enforce; approved
-- default 4). Every existing consumer keeps working unchanged.
alter table trip_legs
  add column if not exists guest_spot_stay_id uuid
    references guest_spot_stays(id) on delete set null,
  add column if not exists origin text not null default 'self'
    check (origin in ('self', 'guest_spot'));

-- One materialized leg per stay: closes the double-accept race (two
-- concurrent acceptances both passing the trip_leg_id null check).
create unique index if not exists trip_legs_one_per_stay_idx
  on trip_legs (guest_spot_stay_id)
  where guest_spot_stay_id is not null;

-- DB-level backstop for the app-layer lock: the artist's 1.x RLS policies on
-- trips/trip_legs are FOR ALL, so without this a direct PostgREST call could
-- delete or re-date a studio-confirmed leg (or flip its origin) behind the
-- studio's back. Client roles get read-only on guest_spot legs; the service
-- role (cancelStayCore) and migrations pass through untouched.
create or replace function trip_legs_block_client_guest_spot_writes()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      if old.origin = 'guest_spot' then
        raise exception 'guest spot legs are managed through the guest spot flow';
      end if;
    else
      if old.origin = 'guest_spot'
         or new.origin is distinct from old.origin
         or new.guest_spot_stay_id is distinct from old.guest_spot_stay_id then
        raise exception 'guest spot legs are managed through the guest spot flow';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_legs_guest_spot_guard on trip_legs;
create trigger trip_legs_guest_spot_guard
  before update or delete on trip_legs
  for each row execute function trip_legs_block_client_guest_spot_writes();

-- Cascade deletes run the FK's RI trigger as the table owner, so the leg
-- guard above never sees the client role. Guard the trip itself too.
create or replace function trips_block_client_guest_spot_delete()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if exists (
      select 1 from trip_legs
      where trip_id = old.id and origin = 'guest_spot'
    ) then
      raise exception 'guest spot trips are managed through the guest spot flow';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trips_guest_spot_guard on trips;
create trigger trips_guest_spot_guard
  before delete on trips
  for each row execute function trips_block_client_guest_spot_delete();
