-- Large-project mode (Plus build P4).
--
-- A specialized intake for back pieces, sleeves, bodysuits and multi-session
-- cover-ups. A submitted intake creates a dedicated long-term PROJECT record
-- rather than a standard booking request (plus-product-spec.md section 7).
--
-- Two new tables and ONE nullable column on an existing one. That column is
-- the design: sessions are not a new entity in v1, they are ordinary booking
-- requests carrying a project_id, so deposits, the calendar, reminders and
-- every lifecycle email keep working through pipelines that already exist.
--
-- RLS posture follows the 0080 house convention: the owning artist gets SELECT
-- through a single-column check, and every WRITE runs through a server core
-- (service role after an explicit ownership check). RLS cannot gate a status
-- transition or a public intake's rate limit, so no client INSERT / UPDATE /
-- DELETE policies exist here.
--
-- Vocabularies are CHECK constraints mirroring packages/shared/src/projects.ts.
-- They are duplicated on purpose: the shared module is the one the product
-- reads, and the constraint is the backstop that stops a direct PostgREST call
-- writing a status the state machine has never heard of.

create table if not exists projects (
  id                    uuid primary key default gen_random_uuid(),
  artist_id             uuid not null references profiles(id) on delete cascade,
  -- Client identity by email, exactly like client notes and booking requests:
  -- a project client is not a platform account and must never need one.
  customer_email        text not null,
  customer_handle       text,
  title                 text not null,
  description           text not null,
  long_term_goal        text,
  -- Closed vocabularies stored as keys, never labels: labels are copy and
  -- change; a stored label would silently break every filter written against
  -- it.
  body_areas            text[] not null default '{}',
  coverage              text check (coverage is null or coverage in
                          ('none', 'some', 'heavy', 'cover_up')),
  available_areas       text,
  styles                text[] not null default '{}',
  scale                 text not null check (scale in
                          ('large_single', 'multi_session', 'sleeve',
                           'back_piece', 'bodysuit')),
  session_commitment    text check (session_commitment is null or
                          session_commitment in
                          ('unsure', 'few', 'many', 'open_ended')),
  travel_availability   text,
  -- Nullable by design. The spec allows a budget "where legally and
  -- commercially appropriate", and a required budget on a public intake turns
  -- an enquiry into a negotiation before the artist has said a word.
  budget_min_cents      integer check (budget_min_cents is null or budget_min_cents >= 0),
  budget_max_cents      integer check (budget_max_cents is null or budget_max_cents >= 0),
  consultation_method   text check (consultation_method is null or
                          consultation_method in
                          ('in_person', 'video', 'message', 'any')),
  status                text not null default 'submitted' check (status in
                          ('submitted', 'under_review', 'consultation',
                           'active', 'completed', 'declined', 'archived')),
  -- The artist's own working notes. Never shown to the client, which is why
  -- it lives here rather than in the intake payload.
  artist_note           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  decided_at            timestamptz,
  constraint projects_budget_range check (
    budget_min_cents is null
    or budget_max_cents is null
    or budget_max_cents >= budget_min_cents
  )
);

alter table projects enable row level security;

create policy "artist reads own projects" on projects
  for select using (artist_id = auth.uid());

-- The list query: an artist's projects, newest first, filtered by status.
create index if not exists projects_artist_idx
  on projects (artist_id, status, created_at desc);
-- The client view: every project belonging to one client of one artist.
create index if not exists projects_customer_idx
  on projects (artist_id, customer_email);

-- ---------------------------------------------------------------------------
-- Reference and body photographs.
--
-- Deliberately its own table rather than reusing booking_images: those rows
-- are keyed to a booking and are deleted with it, while project media has to
-- outlive any single session. Storage reuses the existing private `bookings`
-- bucket under a `projects/` prefix, so no new bucket, policy or cleanup job
-- is introduced for the same kind of object.
create table if not exists project_media (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  -- Denormalized for a single-column RLS check (house convention).
  artist_id         uuid not null references profiles(id) on delete cascade,
  storage_path      text not null,
  kind              text not null default 'reference' check (kind in
                      ('reference', 'body', 'existing_tattoo')),
  original_filename text,
  mime_type         text,
  width             integer,
  height            integer,
  file_size         integer,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

alter table project_media enable row level security;

create policy "artist reads own project media" on project_media
  for select using (artist_id = auth.uid());

create index if not exists project_media_project_idx
  on project_media (project_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- The link that makes sessions free.
--
-- Nullable and unconstrained beyond the FK: every existing booking keeps
-- working untouched, and a project that is deleted (which only happens with
-- its artist's account) releases its sessions rather than taking them along,
-- because a booking is a real appointment with a real client and outlives the
-- planning record it came from.
alter table booking_requests
  add column if not exists project_id uuid
    references projects(id) on delete set null;

create index if not exists booking_requests_project_idx
  on booking_requests (project_id, preferred_date)
  where project_id is not null;
