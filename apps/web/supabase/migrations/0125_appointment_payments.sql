-- Appointment payments: schema (Plus build P9, slice A1).
--
-- Spec: docs/product/plus-payments-architecture.md, sections 3 (payment request
-- model), 4 (outstanding balance), 5 (mixed service and goods), 7 (allocation)
-- and 8 (double-charge prevention). Money-path rules in AGENTS.md apply to
-- every line of this file.
--
-- FOUR TABLES, and nothing else. No Stripe, no webhook, no server core, no UI:
-- those are slices A2 to A8. What lands here is the storage shape plus the
-- guarantees that are only expressible in the database, because a guarantee
-- left to application code is a guarantee the service role does not have.
--
-- The fourth table, `payment_collections`, was added after review. This file
-- originally said THREE and called `payment_allocations.payment_intent_id` "the
-- GROUP KEY: the rows sharing one value are one collection", which was not true
-- of anything the schema enforced: as the service role, two rows sharing one
-- `payment_intent_id` for two DIFFERENT artists and two DIFFERENT appointments
-- both inserted (executed 2026-07-29: `ins1=201 ins2=201 distinctArtists=2
-- distinctBookings=2`). A group key that does not bind its group is a comment,
-- not a constraint. See section 3.
--
-- The pure model that mirrors this schema is
-- packages/shared/src/appointment-payments.ts. Where the two encode the same
-- vocabulary (statuses, classifications, components, the payable set), each
-- file names the other. They are duplicated on purpose, following the 0115
-- convention: the shared module is what the product reads, and the enum or
-- check constraint is the backstop that stops a direct PostgREST call writing a
-- value the state machine has never heard of.
--
-- =========================================================================
-- WHICH CLIENT WRITES WHAT. This question is asked per table rather than
-- answered once, because copying a sibling table's policy shape without asking
-- it is the exact mistake that shipped `product_collections` (0120) and
-- `discount_codes` (0118) with RLS enabled, a SELECT-only policy, and a
-- user-scoped write client: a 100% broken feature that every pure-function test
-- still passed. `discount_codes` was on the revenue path and reached
-- production.
--
--   payment_requests       artist, USER-SCOPED client  -> S/I/U/D policies
--   payment_request_lines  artist, USER-SCOPED client  -> S/I/U/D policies
--   payment_allocations    SERVICE ROLE at settlement  -> SELECT policy only
--   payment_collections    SERVICE ROLE at settlement  -> SELECT policy only
--
-- The last two are SELECT-only for the same reason `projects` is, and that
-- reason is worth stating rather than inheriting: an allocation is the record
-- of money Stripe actually moved. An artist who could insert one could inflate
-- their own collected total, make an unpaid balance read as settled, and
-- manufacture dispute evidence. No write an artist performs may ever produce an
-- allocation row directly; A4 writes them from the webhook, after Stripe has
-- said the money moved. The absence of INSERT / UPDATE / DELETE there is a
-- decision, not an omission, and it is reinforced with an explicit REVOKE so a
-- future careless `for all` policy cannot quietly undo it.
--
-- =========================================================================
-- CONVERGENCE. `create table if not exists` checks the TABLE's existence, so
-- anything declared INLINE in its column and constraint list is skipped
-- entirely once the table exists: re-running the file then exits 0 having
-- restored nothing (AGENTS.md, found empirically on 0122 on 2026-07-29). Every
-- NAMED constraint below is therefore added through a guarded
-- `do $$ ... if not exists ... alter table ... add constraint ... end $$;`
-- block, which converges, and 0122 is the reference implementation.
--
-- THIS PARAGRAPH WAS FALSE WHEN IT WAS FIRST WRITTEN, and it is corrected in
-- place rather than deleted, because the exact way it was false is the point.
-- It claimed convergence while SIX constraints were still declared inline:
-- `primary key` and `references profiles(id)` on all three tables. Those are
-- inline in the column list, which is precisely the position AGENTS.md names as
-- non-convergent, and writing "every named constraint is guarded" three
-- paragraphs above them did not make them guarded. A file that ASSERTS the
-- property is worse than one that lacks it, because the assertion is what the
-- next engineer reads instead of the schema.
--
-- Proven by the route that would disprove it (2026-07-29, local stack, against
-- the pre-fix file): all six dropped by hand, 0125 re-run under ON_ERROR_STOP,
-- `exit=0`, zero ERROR lines, and `restored=0 missing=6`. After the fix, the
-- same probe reports `restored=6 missing=0`.
--
-- And the whole file, not just the six, because "the six are fixed" is a weaker
-- claim than the paragraph above makes: every constraint this file owns on its
-- four tables was dropped in one transaction (53, `drop constraint if exists …
-- cascade`, catalog verified at 0 remaining), then 0125 re-run, `exit=0`, zero
-- ERROR lines, catalog back to the same 53 with a byte-identical name list.
-- Separately, all 12 non-constraint indexes dropped and all 12 restored.
--
-- The boundary, stated so nobody has to guess it: column TYPES, NOT NULL and
-- DEFAULTS stay inline in the `create table`, and this file does NOT re-assert
-- them on a re-run. They are part of the column definition rather than separate
-- objects, and losing one is a deliberate schema edit rather than the kind of
-- drift a repair run is reaching for. Everything that carries a semantic
-- guarantee (PRIMARY KEYS, foreign keys, unique keys, checks, policies,
-- triggers, indexes) is guarded or drop-then-created and is restored when it is
-- ABSENT.
--
-- One residual, named rather than glossed: an existence guard and
-- `create index if not exists` both skip an object that is PRESENT BUT WRONG.
-- Only the drop-then-create objects (every policy and every trigger below)
-- repair that case. AGENTS.md makes the same distinction, and it is the reason
-- the policies here are not guarded like the constraints are.
--
-- The guarded blocks reuse the names Postgres generates for the inline versions
-- (`payment_requests_pkey`, `payment_requests_artist_id_fkey` and so on). That
-- is deliberate, and it is a catalog fact rather than a prediction: the RED
-- probe above listed exactly those six names on a database built by the INLINE
-- version, which is what the guards test for. So a database that already ran
-- the inline version sees each guard match and adds nothing, making this change
-- a no-op there rather than a duplicate constraint.

-- ---------------------------------------------------------------------------
-- Vocabularies as enums.
--
-- `create type` has no `if not exists`, so each one is guarded. Enums rather
-- than check constraints for these three because they are the closed
-- vocabularies the whole feature is written against, they appear in several
-- tables' worth of queries, and a typo in a status string is the kind of thing
-- that should fail at write time rather than filter to zero rows at read time.
do $$
begin
  -- The 13 lifecycle states from spec section 3, in order of the normal path
  -- followed by the exits. `ready` is prepared-but-not-sent; `sent` is the
  -- point the client-visible amount freezes (see the latch below).
  if not exists (select 1 from pg_type where typname = 'payment_request_status') then
    create type payment_request_status as enum (
      'draft',
      'ready',
      'sent',
      'viewed',
      'payment_processing',
      'partially_paid',
      'paid',
      'expired',
      'cancelled',
      'partially_refunded',
      'refunded',
      'disputed',
      'failed'
    );
  end if;

  -- Spec section 3. `manual_review` is real value that could not be
  -- auto-classified, NOT a zero: it is carried at its amount and flagged, so
  -- the fee and tax lanes downstream refuse to guess which lane it belongs to.
  if not exists (select 1 from pg_type where typname = 'payment_line_classification') then
    create type payment_line_classification as enum (
      'tattoo_service',
      'additional_service',
      'physical_goods',
      'discount',
      'tip',
      'tax',
      'shipping',
      'manual_review'
    );
  end if;

  -- Spec section 7. Every collected amount is apportioned across these and
  -- NEVER stored as one unclassified total: the breakdown is what makes
  -- accurate refunds, per-lane fees, tax reporting, goods fulfilment, receipts,
  -- reconciliation and dispute evidence possible, and no later migration
  -- recovers it from a single number.
  if not exists (select 1 from pg_type where typname = 'payment_allocation_component') then
    create type payment_allocation_component as enum (
      'deposit',
      'tattoo_service_balance',
      'full_price',
      'additional_service',
      'physical_goods',
      'tip',
      'tax',
      'shipping',
      'discount',
      'refund_adjustment'
    );
  end if;

  -- The state of the collection an allocation apportions. Spec section 4 says a
  -- payment counts against the balance only when it is successfully collected,
  -- not fully refunded, not disputed in a way that invalidates it, and not
  -- cancelled or failed. Refunds are NOT a status here: they are
  -- `refund_adjustment` rows, so "not fully refunded" falls out of the
  -- arithmetic instead of needing a separate flag that could disagree with it.
  --
  -- `dispute_won` is kept distinct from `succeeded` rather than collapsed back
  -- into it: both count toward the balance, and the difference is evidence that
  -- a dispute happened and was survived.
  if not exists (select 1 from pg_type where typname = 'payment_collection_status') then
    create type payment_collection_status as enum (
      'processing',
      'succeeded',
      'failed',
      'cancelled',
      'disputed',
      'dispute_won',
      'dispute_lost'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PARENT UNIQUE KEYS.
--
-- A composite foreign key needs a unique key on exactly the referenced columns.
-- These are all trivially unique already (each table's `id` is its primary key)
-- so they add no new guarantee about the parent; they exist so a CHILD can
-- reference (row, owner) as one unit. That is what makes a cross-owner row
-- unrepresentable for EVERY role, including the service role, which RLS never
-- constrains and which is what runs webhooks, admin paths and backfills.
--
-- `booking_requests` and `projects` are existing tables and get their first
-- such key here. Both take an ACCESS EXCLUSIVE lock while the index builds;
-- both are small (one row per booking request / project), so this is
-- milliseconds, but it is a lock and it is worth knowing before a deploy.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'booking_requests_id_artist_key'
  ) then
    alter table booking_requests
      add constraint booking_requests_id_artist_key unique (id, artist_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'projects_id_artist_key'
  ) then
    alter table projects
      add constraint projects_id_artist_key unique (id, artist_id);
  end if;

  -- Declared by 0122 for `product_collection_items`. Re-asserted here rather
  -- than assumed: this file's product link depends on it, AGENTS.md records
  -- that composite keys of exactly this shape have gone missing in this repo
  -- before, and an existence guard costs nothing when it is already there.
  if not exists (
    select 1 from pg_constraint where conname = 'products_id_artist_key'
  ) then
    alter table products
      add constraint products_id_artist_key unique (id, artist_id);
  end if;
end $$;

-- ===========================================================================
-- 1. payment_requests. The immutable revision (spec section 3).
--
-- Sending one freezes the client-visible amount and the line snapshot. If the
-- artist changes the price or the lines afterwards, the unpaid request is
-- cancelled and replaced, or a new revision is created; a request the client
-- has already reviewed is never silently modified, because the amount someone
-- agreed to and the amount charged must be the same object.
--
-- WHAT IMMUTABILITY MEANS AT THE DATABASE LEVEL, and why it is not just a
-- convention the cores follow:
--
--   `sent_at` is the FREEZE LATCH. Null means the revision is still being
--   composed and everything is editable. Non-null means the client has been
--   shown an amount, and from that instant the money columns
--   (artist_id, booking_id, project_id, currency, total_minor, revision,
--   supersedes_id, fee_schedule_version) and the whole line set are closed to
--   every role. Enforced by triggers below, not by policies, because the
--   service role does not read policies and A4's webhook runs as the service
--   role.
--
--   The latch cannot be released. `sent_at` may go null -> non-null exactly
--   once and can never be cleared, and a frozen row may not return to `draft`
--   or `ready`. Without that second rule the freeze would be trivially
--   bypassable in two statements: move the status back to `draft`, then edit
--   the total, since the trigger would no longer consider the row frozen.
--
--   The freeze point is also where `total_minor` is verified against the sum
--   of the lines. Spec section 3: there is no unstructured "additional amount"
--   field, because an unexplained delta on a payment screen is exactly what
--   erodes trust. Checking it once, at send, in a trigger, makes that
--   structural rather than aspirational.
--
-- NOTE ON THE COLUMN LIST: no `primary key` and no `references` appear in it.
-- Both are constraints, both are skipped by `create table if not exists` once
-- the table exists, and both are therefore declared in the guarded block below.
-- See the CONVERGENCE header.
create table if not exists payment_requests (
  id                   uuid not null default gen_random_uuid(),
  artist_id            uuid not null,
  -- The subject this request settles: exactly one of an appointment or a
  -- project (constraint below). Both are nullable columns because the pair is
  -- an either/or, and two nullable columns plus a check keeps the invalid
  -- half-set state out rather than inventing a polymorphic id with no FK.
  booking_id           uuid,
  project_id           uuid,
  status               payment_request_status not null default 'draft',
  -- Every stored amount carries its currency. Lowercase ISO-4217, matching
  -- `booking_requests.deposit_currency`, `orders.currency` and
  -- `discount_codes.currency`.
  currency             text not null default 'eur',
  -- The FROZEN client-visible total, in integer minor units. Never numeric and
  -- never a float: this is compared against Stripe's amount, and a rounding
  -- difference between the two is the kind of discrepancy nobody notices until
  -- a reconciliation run (the reasoning already recorded in 0116).
  total_minor          integer not null default 0,
  -- Revision number within a supersession chain. Starts at 1.
  revision             integer not null default 1,
  -- The request this one replaces. Self-referencing and composite, so a
  -- revision can only supersede one of the SAME artist in the SAME currency.
  supersedes_id        uuid,
  -- The fee schedule in force when this request was SENT
  -- (packages/shared/src/fee-schedule.ts). Fee ACTUALS are not recorded here:
  -- they are recorded at settlement, on `orders` and `booking_requests`
  -- (migration 0116), against what was really charged. This column is evidence
  -- of the schedule the client was quoted under, and A3 computes the fee
  -- server-side from the active schedule rather than from this stamp.
  --
  -- Residual, named rather than hidden: the artist's own client writes this
  -- column, so a direct PostgREST call could stamp a version that was not in
  -- force. It cannot make a fee cheaper (nothing prices off it), but it would
  -- show up as a reconciliation discrepancy in A8. Constraining it would mean
  -- restating the schedule's version list in SQL, which 0116 also declined to
  -- do for the same column name.
  fee_schedule_version text,
  -- The freeze latch. See the block comment above.
  sent_at              timestamptz,
  viewed_at            timestamptz,
  expires_at           timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

do $$
begin
  -- --- Identity and ownership, guarded rather than inline. -----------------
  --
  -- The PRIMARY KEY comes first: everything below is either a unique key it
  -- does not depend on or a foreign key targeting one of those, but a table
  -- without a primary key is not a state any later statement should meet.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_pkey'
  ) then
    alter table payment_requests add constraint payment_requests_pkey primary key (id);
  end if;

  -- The artist. Plain rather than composite because `profiles.id` IS the owner;
  -- there is no second column to agree with.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_artist_id_fkey'
  ) then
    alter table payment_requests
      add constraint payment_requests_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- --- Unique keys that exist to be FK targets. ---------------------------
  --
  -- `(id, artist_id, currency)` rather than `(id, artist_id)`: children that
  -- carry an amount then bind to the owner AND the currency in one reference,
  -- so a line or an allocation denominated in a currency the request is not
  -- denominated in is unrepresentable. Silently adding 100 usd into a eur
  -- balance is a money bug that no amount of application care prevents once
  -- the row exists.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_id_artist_currency_key'
  ) then
    alter table payment_requests
      add constraint payment_requests_id_artist_currency_key
      unique (id, artist_id, currency);
  end if;

  -- `(id, booking_id)` and `(id, project_id)` let an allocation bind to the
  -- request AND the subject at once, which is what makes spec section 8's
  -- "cross-appointment deposit application" unrepresentable rather than merely
  -- guarded by whoever wrote the webhook.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_id_booking_key'
  ) then
    alter table payment_requests
      add constraint payment_requests_id_booking_key unique (id, booking_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_id_project_key'
  ) then
    alter table payment_requests
      add constraint payment_requests_id_project_key unique (id, project_id);
  end if;

  -- --- Ownership, as composite foreign keys. ------------------------------
  --
  -- A request cannot settle another artist's appointment or project. The plain
  -- FK would only prove the row exists; pairing it with artist_id proves who
  -- owns it, for every role.
  --
  -- ON DELETE CASCADE, matching `orders.booking_id` (0036). Deleting the
  -- appointment deletes its payment requests. Noted rather than assumed: item
  -- C1 in docs/product/plus-remaining-work-plan.md is reconsidering exactly
  -- this posture for billing records that Terms promises to retain, and if that
  -- decision changes, these two clauses change with it. SET NULL is not
  -- available as an alternative here, because the exactly-one-subject invariant
  -- below would be violated the moment the subject went null.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_booking_fk'
  ) then
    alter table payment_requests
      add constraint payment_requests_booking_fk
      foreign key (booking_id, artist_id)
      references booking_requests(id, artist_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_project_fk'
  ) then
    alter table payment_requests
      add constraint payment_requests_project_fk
      foreign key (project_id, artist_id)
      references projects(id, artist_id) on delete cascade;
  end if;

  -- The supersession chain. NO ACTION (the default, stated by omission of any
  -- referential action and explained here) is deliberate over both
  -- alternatives: CASCADE would let one delete take out a whole revision
  -- chain of financial records, and SET NULL would perform an RI UPDATE on a
  -- frozen row, which the immutability trigger below correctly refuses,
  -- turning a delete into a confusing constraint error. NO ACTION is checked
  -- at end of statement, so the only case that actually reaches it, an account
  -- deletion cascading every row of the chain at once, passes cleanly, while a
  -- lone delete of a still-referenced revision is refused, which is right. Both
  -- executed: deleting the profile of an artist holding a two-revision chain
  -- plus lines plus an allocation succeeds and leaves zero rows, and deleting
  -- the superseded revision on its own returns 23503.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_supersedes_fk'
  ) then
    alter table payment_requests
      add constraint payment_requests_supersedes_fk
      foreign key (supersedes_id, artist_id, currency)
      references payment_requests(id, artist_id, currency);
  end if;

  -- --- Invariants. --------------------------------------------------------
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_subject_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_subject_check
      check (num_nonnulls(booking_id, project_id) = 1);
  end if;

  -- A sent request must be for a positive amount. Spec section 4: a zero
  -- balance produces no request at all rather than a 0.00 one.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_total_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_total_check
      check (total_minor >= 0 and (sent_at is null or total_minor > 0));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_revision_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_revision_check check (revision >= 1);
  end if;

  -- The latch and the status must agree. Without this a row could sit in a
  -- post-send status with a null `sent_at`, which would leave it permanently
  -- editable while presenting as sent.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_sent_latch_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_sent_latch_check
      check (status in ('draft', 'ready', 'cancelled') or sent_at is not null);
  end if;

  -- The schedule version is stamped at send, so a sent request always carries
  -- the schedule it was quoted under.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_fee_version_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_fee_version_check
      check (sent_at is null or fee_schedule_version is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_currency_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_currency_check
      check (currency = lower(currency) and char_length(currency) = 3);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_supersedes_self_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_supersedes_self_check
      check (supersedes_id is null or supersedes_id <> id);
  end if;
end $$;

-- The artist's list.
create index if not exists payment_requests_artist_idx
  on payment_requests (artist_id, status, created_at desc);
-- Every request for one appointment / project, newest first.
create index if not exists payment_requests_booking_idx
  on payment_requests (booking_id, created_at desc)
  where booking_id is not null;
create index if not exists payment_requests_project_idx
  on payment_requests (project_id, created_at desc)
  where project_id is not null;

-- AT MOST ONE PAYABLE REQUEST PER SUBJECT. Spec section 8 lists "duplicate
-- requests" and "concurrent attempts" among the failure modes to cover, and a
-- partial unique index covers both at the only layer that holds under
-- concurrency: two sends racing cannot both win, whatever the cores do.
--
-- The set is the states in which a CLIENT COULD PAY. `draft` and `ready` are
-- excluded so an artist can prepare a replacement while one is outstanding;
-- the collision then happens at send, which is exactly when the artist must
-- have decided whether the old one is cancelled. `expired`, `failed` and every
-- settled or dead state are excluded because no money can arrive against them.
--
-- The same set is `PAYABLE_PAYMENT_REQUEST_STATUSES` in
-- packages/shared/src/appointment-payments.ts. The two must agree; if one
-- changes, change the other in the same commit.
create unique index if not exists payment_requests_one_payable_per_booking_idx
  on payment_requests (booking_id)
  where booking_id is not null
    and status in ('sent', 'viewed', 'payment_processing', 'partially_paid');
create unique index if not exists payment_requests_one_payable_per_project_idx
  on payment_requests (project_id)
  where project_id is not null
    and status in ('sent', 'viewed', 'payment_processing', 'partially_paid');

alter table payment_requests enable row level security;

-- WRITTEN BY THE ARTIST ON THE USER-SCOPED CLIENT (A2's create / revise / send
-- / cancel cores), so all four verbs get real policies. `TO authenticated` is
-- explicit on every one: an untargeted policy also applies to `anon`, which
-- reads as though anonymous writes had been considered and permitted.
--
-- Drop-then-create rather than a bare create: Postgres has no
-- `create policy if not exists`, so a bare create aborts a re-run, and
-- drop-then-create additionally REPAIRS a present-but-wrong-shaped policy,
-- which an existence guard would skip straight over.
drop policy if exists "artist reads own payment requests" on payment_requests;
create policy "artist reads own payment requests" on payment_requests
  for select to authenticated using (artist_id = auth.uid());

-- INSERT may only create an UNSENT request. Without the second and third
-- conditions an artist could insert a row that is already `paid` with
-- `sent_at` set, which would be indistinguishable from a real settlement,
-- would reduce their own outstanding balance to zero, and would never have
-- passed through the freeze at all.
drop policy if exists "artist inserts own payment requests" on payment_requests;
create policy "artist inserts own payment requests" on payment_requests
  for insert to authenticated with check (
    artist_id = auth.uid()
    and sent_at is null
    and status in ('draft', 'ready')
    and (
      booking_id is null
      or exists (
        select 1 from booking_requests b
        where b.id = booking_id and b.artist_id = auth.uid()
      )
    )
    and (
      project_id is null
      or exists (
        select 1 from projects p
        where p.id = project_id and p.artist_id = auth.uid()
      )
    )
  );

-- UPDATE is where the money floor lives.
--
-- USING picks the rows an artist may target: everything except the states where
-- money has settled or is contested. WITH CHECK constrains the result, and its
-- status list is the whole point: an artist can never WRITE `paid`,
-- `partially_paid`, `partially_refunded`, `refunded`, `disputed`,
-- `payment_processing` or `failed`. Those are outcomes, written by A4 from the
-- webhook on the service role after Stripe has said what happened. Combined
-- with the SELECT-only allocations table, there is no path by which an artist's
-- own client can assert that money arrived.
--
-- `viewed` IS in the write set, and that is a stated trade rather than an
-- oversight. Keeping it lets an artist edit a viewed request (in practice:
-- extend its expiry, or cancel it) without being forced to change its status
-- to do so. The cost is that an artist can mark their own sent request as
-- viewed, which is a soft engagement signal on their own row with no money
-- consequence. Blocking that would break a legitimate edit to buy nothing.
--
-- WITH CHECK also re-asserts ownership. Without it an owner could update a row
-- and hand it to another artist.
--
-- The exact transition GRAPH is not enforced here. It lives as data in
-- `PAYMENT_REQUEST_TRANSITIONS` (packages/shared) and is applied by A2's cores.
-- Restating a 13-state graph in a policy would create two encodings that must
-- agree forever; what the database owns is the narrower and non-negotiable
-- part, which is that money states are not artist-writable and a frozen row
-- stays frozen.
drop policy if exists "artist updates own payment requests" on payment_requests;
create policy "artist updates own payment requests" on payment_requests
  for update to authenticated
  using (
    artist_id = auth.uid()
    and status in ('draft', 'ready', 'sent', 'viewed', 'expired', 'failed')
  )
  with check (
    artist_id = auth.uid()
    and status in ('draft', 'ready', 'sent', 'viewed', 'cancelled', 'expired')
  );

-- DELETE only before send. A sent request is a client-facing financial record:
-- the client may have a copy of the amount, and A5's refunds and A8's
-- reconciliation both read backwards through it. Discarding an unsent draft
-- loses nothing, so it stays freely deletable.
--
-- GOTCHA for A2, and it is finer than the usual statement of it. Whether an RLS
-- refusal is silent depends on WHICH HALF of the policy refused, not on the
-- verb. Executed against this schema rather than assumed:
--
--   USING excludes the row      -> 0 rows, error null. SILENT.
--     an artist DELETEing their own SENT request: OK rows=0
--     an artist UPDATEing a row that is not theirs: OK rows=0
--   WITH CHECK rejects the result -> 42501, raised. LOUD.
--     an artist INSERTing a request already marked paid: 42501
--     an artist UPDATEing their own request to paid:     42501
--
-- So this DELETE refusal is silent, and the core MUST check the returned row
-- count rather than reading "no error" as "it worked". The status floor on the
-- UPDATE policy is loud, because it lives in WITH CHECK. Do not generalise
-- either one into "only INSERT raises 42501", which is the shorter version of
-- this rule and is wrong.
drop policy if exists "artist deletes own payment requests" on payment_requests;
create policy "artist deletes own payment requests" on payment_requests
  for delete to authenticated using (
    artist_id = auth.uid()
    and sent_at is null
    and status in ('draft', 'ready')
  );

-- ===========================================================================
-- 2. payment_request_lines. The itemized snapshot (spec section 3).
--
-- The client sees this breakdown before paying. There is deliberately no
-- unstructured "additional amount" column anywhere in this schema.
--
-- Same note as the request: no `primary key` and no `references` in the column
-- list, because both would be skipped on a re-run. See the CONVERGENCE header.
create table if not exists payment_request_lines (
  id                uuid not null default gen_random_uuid(),
  request_id        uuid not null,
  -- Denormalized for single-column RLS (house convention, migration 0080).
  -- It cannot drift: the composite FK below binds it to the parent request's
  -- artist_id, so a line whose owner disagrees with its request is not a row
  -- Postgres will store, for any role.
  artist_id         uuid not null,
  -- What the client reads. Snapshots, not references: a line survives the
  -- product it came from being renamed, repriced or deleted, because what was
  -- agreed must stay readable exactly as it was shown.
  name              text not null,
  description       text,
  quantity          integer not null default 1,
  unit_amount_minor integer not null,
  line_total_minor  integer not null,
  -- Denormalized from the request and PINNED to it by the composite FK below,
  -- so every stored amount carries its currency without the reader needing a
  -- join, and a mixed-currency request is unrepresentable.
  currency          text not null default 'eur',
  classification    payment_line_classification not null,
  -- How this line is treated for tax. NOT the same vocabulary as `TaxTreatment`
  -- in packages/shared/src/billing.ts, and deliberately so: that one describes
  -- INKLEE selling a subscription to an artist (an Estonian electronically
  -- supplied service). This one describes the ARTIST selling to their client,
  -- where Inklee is infrastructure and the artist is the seller. Unifying them
  -- would merge two different legal relationships into one column.
  --
  -- Artist-side tax configuration does not exist yet, so the default is the
  -- honest `unspecified` rather than a guessed `inclusive`. The column exists
  -- now because whether an amount included tax is exactly the fact that cannot
  -- be recovered afterwards.
  tax_treatment     text not null default 'unspecified',
  -- Per-line refund state, which is what makes single-line refunds (spec
  -- section 9) possible. The AMOUNTS refunded live in `payment_allocations` as
  -- `refund_adjustment` rows; this is the line's summary of them.
  refund_status     text not null default 'none',
  -- Where the line came from.
  source            text not null default 'artist_manual',
  -- The optional linked Inklee goods product (spec section 5). Bound to the
  -- artist by the composite FK below, so a line can never link another artist's
  -- product.
  product_id        uuid,
  -- Display order. The spec requires an itemized breakdown; without an explicit
  -- order the breakdown renders in whatever order Postgres returns, which is
  -- not stable and would let the same frozen revision look different on two
  -- loads.
  position          integer not null default 0,
  created_at        timestamptz not null default now()
);

do $$
begin
  -- --- Identity and ownership, guarded rather than inline. -----------------
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_pkey'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_pkey primary key (id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_artist_id_fkey'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- FK target for `payment_allocations.line_id`, paired with request_id so an
  -- allocation cannot attribute a refund to a line belonging to a DIFFERENT
  -- request.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_id_request_key'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_id_request_key unique (id, request_id);
  end if;

  -- The parent link, carrying owner AND currency. Three columns rather than
  -- two: it makes a cross-owner line and a mixed-currency line unrepresentable
  -- in one constraint, for every role including the service role.
  --
  -- ON DELETE CASCADE: deleting a request takes its lines. Only an UNSENT
  -- request is deletable by an artist (see its DELETE policy), and the freeze
  -- trigger below tolerates this cascade explicitly.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_request_fk'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_request_fk
      foreign key (request_id, artist_id, currency)
      references payment_requests(id, artist_id, currency) on delete cascade;
  end if;

  -- THE ANSWER TO "must a line's linked product belong to the same artist?".
  -- Yes, and this is what makes it unrepresentable rather than merely checked:
  -- both halves carry artist_id, so the product and the line must agree with
  -- each other, and the line already agrees with its request. An RLS policy
  -- could only have covered `authenticated`; this covers the service role too,
  -- which is what runs the webhook that A4 will use to attach goods orders.
  --
  -- ON DELETE SET NULL (product_id) releases only the link when a product is
  -- hard-deleted, leaving the financial record intact. This mirrors
  -- `order_items.product_id` (0036), which has always behaved this way. NO
  -- ACTION was the alternative and was rejected: it would make a product that
  -- has ever appeared on a sent request undeletable, which changes existing
  -- goods behaviour and would surface to the artist as a bare 23503.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_product_fk'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_product_fk
      foreign key (product_id, artist_id)
      references products(id, artist_id) on delete set null (product_id);
  end if;

  -- --- Invariants. --------------------------------------------------------
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_quantity_check'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_quantity_check check (quantity > 0);
  end if;

  -- The line total is the unit amount times the quantity, exactly. All three
  -- are integer minor units, so this is exact arithmetic with no rounding to
  -- argue about, and it closes the gap where a displayed unit price and a
  -- charged total could disagree. A "3 for 2" style adjustment is a separate
  -- `discount` line, which is also what makes it visible to the client.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_total_check'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_total_check
      check (line_total_minor = unit_amount_minor * quantity);
  end if;

  -- Only a discount may be negative, and a discount may only be negative or
  -- zero. Without this a "tip" of -5000 would silently reduce a total while
  -- reading to the client as a tip.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_sign_check'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_sign_check
      check (
        case
          when classification = 'discount' then line_total_minor <= 0
          else line_total_minor >= 0
        end
      );
  end if;

  -- Vocabularies mirroring packages/shared/src/appointment-payments.ts. Check
  -- constraints rather than enums for these three: they are narrow, they are
  -- likely to gain values as artist-side tax configuration arrives, and a check
  -- constraint is cheaper to widen than an enum.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_tax_treatment_check'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_tax_treatment_check
      check (tax_treatment in
        ('unspecified', 'inclusive', 'exclusive', 'exempt', 'manual_review'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_refund_status_check'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_refund_status_check
      check (refund_status in ('none', 'partial', 'full'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_source_check'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_source_check
      check (source in ('artist_manual', 'linked_product', 'system'));
  end if;

  -- A `physical_goods` line is the only one that may carry a product link, and
  -- a linked product must be classified as goods. Otherwise a `tip` could link
  -- a product and end up in the goods fee lane, which spec section 6 forbids:
  -- the two fees are never charged on the same value.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_request_lines_product_class_check'
  ) then
    alter table payment_request_lines
      add constraint payment_request_lines_product_class_check
      check (product_id is null or classification = 'physical_goods');
  end if;
end $$;

-- Rendering a request: its lines in the artist's order.
create index if not exists payment_request_lines_request_idx
  on payment_request_lines (request_id, position);
-- The reverse lookup: which requests bill this product?
create index if not exists payment_request_lines_product_idx
  on payment_request_lines (product_id)
  where product_id is not null;

alter table payment_request_lines enable row level security;

-- WRITTEN BY THE ARTIST ON THE USER-SCOPED CLIENT, same as the request, so all
-- four verbs get policies.
drop policy if exists "artist reads own payment request lines" on payment_request_lines;
create policy "artist reads own payment request lines" on payment_request_lines
  for select to authenticated using (artist_id = auth.uid());

-- Writes additionally verify the PARENT: that it exists, that it is this
-- artist's, and that it is NOT FROZEN. `artist_id = auth.uid()` alone would let
-- an artist file a line into another artist's request simply by naming its id
-- (the FK only proves the row exists, never who owns it), and would let them
-- edit the lines of a request the client has already agreed to.
--
-- The freeze is checked in BOTH this policy and the trigger below, and that is
-- not redundancy for its own sake: the policy covers `authenticated` and
-- returns a silent zero-row result for UPDATE and DELETE, while the trigger
-- covers EVERY role including the service role and raises loudly.
drop policy if exists "artist inserts own payment request lines" on payment_request_lines;
create policy "artist inserts own payment request lines" on payment_request_lines
  for insert to authenticated with check (
    artist_id = auth.uid()
    and exists (
      select 1 from payment_requests r
      where r.id = request_id
        and r.artist_id = auth.uid()
        and r.sent_at is null
    )
    and (
      product_id is null
      or exists (
        select 1 from products p
        where p.id = product_id and p.artist_id = auth.uid()
      )
    )
  );

drop policy if exists "artist updates own payment request lines" on payment_request_lines;
create policy "artist updates own payment request lines" on payment_request_lines
  for update to authenticated
  using (
    artist_id = auth.uid()
    and exists (
      select 1 from payment_requests r
      where r.id = request_id
        and r.artist_id = auth.uid()
        and r.sent_at is null
    )
  )
  with check (
    artist_id = auth.uid()
    and exists (
      select 1 from payment_requests r
      where r.id = request_id
        and r.artist_id = auth.uid()
        and r.sent_at is null
    )
    and (
      product_id is null
      or exists (
        select 1 from products p
        where p.id = product_id and p.artist_id = auth.uid()
      )
    )
  );

drop policy if exists "artist deletes own payment request lines" on payment_request_lines;
create policy "artist deletes own payment request lines" on payment_request_lines
  for delete to authenticated using (
    artist_id = auth.uid()
    and exists (
      select 1 from payment_requests r
      where r.id = request_id
        and r.artist_id = auth.uid()
        and r.sent_at is null
    )
  );

-- ===========================================================================
-- 3. payment_collections. ONE PaymentIntent, one owner, one subject.
--
-- WHAT THIS FIXES, stated first because the table would otherwise look like
-- bookkeeping. Section 4 calls `payment_allocations.payment_intent_id` the
-- GROUP KEY and says "the rows sharing one value are one collection". Nothing
-- enforced it. Executed as the service role against the pre-fix schema
-- (2026-07-29): two allocations sharing `payment_intent_id='pi_span_…'`, one for
-- artist A's appointment and one for artist B's, BOTH inserted, 201 and 201.
-- `payment_allocations_unique` is (payment_intent_id, component, line_id) and
-- carries no owner column, so it had nothing to say about it either.
--
-- Why that matters and is not merely untidy: every downstream read of a
-- collection is `where payment_intent_id = ...`. The AGENTS.md refund rule
-- ("compute the total that should have been applied and move only the
-- difference") is a per-intent sum; A8's reconciliation compares a per-intent
-- sum against what Stripe reported; `collected_total_minor` is declared
-- self-describing "for one PaymentIntent". A group that can span two artists
-- makes every one of those a cross-artist figure, and the fee, refund and payout
-- lanes are all downstream of it.
--
-- THE SHAPE. A parent row keyed on the intent, carrying the four facts that must
-- be constant across the group, and composite foreign keys from
-- `payment_allocations` back to it. The alternative was a trigger comparing each
-- new row against the existing group, and it was rejected for the reason 0124
-- documents at length: a trigger's check and the write it guards are two
-- statements under READ COMMITTED, so two concurrent first-inserts for one
-- intent would each find no group and each pass. A foreign key against a unique
-- key is not a check that can go stale, it is arbitrated by the index, and it
-- binds the service role, which is the only role that writes here at all.
--
-- WHY IT DOES NOT BREAK A4's WEBHOOK. The parent is created by the trigger at
-- the bottom of this file, from the first allocation of each intent, so a writer
-- inserting allocations exactly as before needs no new statement and no new
-- ordering. What changes is only that the SECOND row of an intent must agree
-- with the first about artist, subject and currency, which is the guarantee.
-- Executed after the fix: a multi-component settlement (deposit + tip on one
-- intent) still inserts both rows, and the spanning pair is refused 23503.
create table if not exists payment_collections (
  -- The Stripe PaymentIntent id, and the primary key: one row per collection.
  payment_intent_id text not null,
  artist_id         uuid not null,
  -- The subject, exactly one, same shape as the request and the allocation.
  booking_id        uuid,
  project_id        uuid,
  currency          text not null default 'eur',
  created_at        timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_pkey'
  ) then
    alter table payment_collections
      add constraint payment_collections_pkey primary key (payment_intent_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_artist_id_fkey'
  ) then
    alter table payment_collections
      add constraint payment_collections_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- --- The FK targets the allocations bind to. -----------------------------
  --
  -- All three are trivially unique already (`payment_intent_id` is the primary
  -- key), exactly like the parent keys at the top of this file. They exist so a
  -- child can reference (collection, owner, currency) and (collection, subject)
  -- as single units, which is what makes disagreement unrepresentable rather
  -- than merely unlikely.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_intent_artist_currency_key'
  ) then
    alter table payment_collections
      add constraint payment_collections_intent_artist_currency_key
      unique (payment_intent_id, artist_id, currency);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_intent_booking_key'
  ) then
    alter table payment_collections
      add constraint payment_collections_intent_booking_key
      unique (payment_intent_id, booking_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_intent_project_key'
  ) then
    alter table payment_collections
      add constraint payment_collections_intent_project_key
      unique (payment_intent_id, project_id);
  end if;

  -- --- Ownership of the subject, for every role. ---------------------------
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_booking_fk'
  ) then
    alter table payment_collections
      add constraint payment_collections_booking_fk
      foreign key (booking_id, artist_id)
      references booking_requests(id, artist_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_project_fk'
  ) then
    alter table payment_collections
      add constraint payment_collections_project_fk
      foreign key (project_id, artist_id)
      references projects(id, artist_id) on delete cascade;
  end if;

  -- --- Invariants. --------------------------------------------------------
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_subject_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_subject_check
      check (num_nonnulls(booking_id, project_id) = 1);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_collections_currency_check'
  ) then
    alter table payment_collections
      add constraint payment_collections_currency_check
      check (currency = lower(currency) and char_length(currency) = 3);
  end if;
end $$;

create index if not exists payment_collections_artist_idx
  on payment_collections (artist_id, created_at desc);

alter table payment_collections enable row level security;

-- WRITTEN BY THE SERVICE ROLE AT SETTLEMENT, exactly like `payment_allocations`
-- and for the same reason: it is derived from what Stripe reported. The artist
-- reads it, and the same REVOKE follows for the same reason (a later `for all`
-- policy cannot undo a revoked privilege, and TRUNCATE ignores RLS entirely).
drop policy if exists "artist reads own payment collections" on payment_collections;
create policy "artist reads own payment collections" on payment_collections
  for select to authenticated using (artist_id = auth.uid());

revoke insert, update, delete, truncate on payment_collections from anon, authenticated;

-- ===========================================================================
-- 4. payment_allocations. Every collected amount, explicitly apportioned
-- (spec section 7).
--
-- One row per (payment, component, line). A 150.00 collection covering a
-- 100.00 tattoo balance, 30.00 of goods and a 20.00 tip is THREE rows, never
-- one row of 150.00. Storing a single number forecloses accurate refunds,
-- per-lane fee calculation, tax reporting, goods fulfilment, artist analytics,
-- client receipts, reconciliation and dispute evidence, and no later migration
-- recovers the breakdown.
--
-- `request_id` is NULLABLE, and that is what keeps the model free of special
-- cases. A deposit collected through the existing booking path (migrations
-- 0006, 0007, 0044) has no payment request at all, and it must still count
-- against the outstanding balance. Attaching an allocation to the SUBJECT
-- rather than to the request is what lets deposit-then-balance,
-- full-payment-only, deposit-equal-to-final-price and pay-after-the-session be
-- the same model with different starting states, exactly as spec section 4
-- requires.
--
-- Same note as the other two: no `primary key` and no `references` in the
-- column list. See the CONVERGENCE header.
create table if not exists payment_allocations (
  id                     uuid not null default gen_random_uuid(),
  -- Denormalized for single-column RLS (house convention), and pinned to the
  -- subject by the composite FKs below.
  artist_id              uuid not null,
  -- The subject, exactly one, same shape as the request.
  booking_id             uuid,
  project_id             uuid,
  -- The request this settles, when there is one. See the block comment above.
  request_id             uuid,
  -- The specific line this apportionment settles, when it is line-specific.
  -- Required for single-line and proportional refunds (spec section 9).
  line_id                uuid,
  -- The Stripe PaymentIntent. NOT NULL and it is the GROUP KEY: the rows
  -- sharing one value are one collection, and their components are what must
  -- sum to what Stripe collected. Manual and offline tracking is the Free
  -- baseline (spec section 1) and produces no allocations, so there is no
  -- null case to model.
  --
  -- "Are one collection" is enforced by the three composite foreign keys to
  -- `payment_collections` below, not by this comment. It used to be enforced by
  -- nothing: see section 3.
  payment_intent_id      text not null,
  component              payment_allocation_component not null,
  -- Signed integer minor units. `discount` and `refund_adjustment` are
  -- negative; everything else is positive.
  amount_minor           integer not null,
  -- What Stripe reported collected for this PaymentIntent, GROSS and never
  -- revised. Refunds do not change it; they add `refund_adjustment` rows. This
  -- is a denormalization the database cannot police across rows, and it is
  -- here on purpose: it makes a row self-describing for dispute evidence and
  -- lets a reconciliation query find a half-written allocation set without a
  -- Stripe round trip. A4 must write every row for one intent in ONE
  -- transaction, and the status below is only ever updated by group
  -- (`where payment_intent_id = ...`), which is what keeps them agreeing.
  collected_total_minor  integer not null,
  currency               text not null default 'eur',
  -- Whether this collection currently counts toward the outstanding balance.
  -- Mirrored by `PAYMENT_STATUSES_COUNTING_TOWARD_BALANCE` in packages/shared.
  status                 payment_collection_status not null default 'processing',
  settled_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

do $$
begin
  -- --- Identity and ownership, guarded rather than inline. -----------------
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_pkey'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_pkey primary key (id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_artist_id_fkey'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_artist_id_fkey
      foreign key (artist_id) references profiles(id) on delete cascade;
  end if;

  -- --- THE COLLECTION BINDING. One intent, one owner, one subject. ---------
  --
  -- Three foreign keys rather than one, because MATCH SIMPLE satisfies a
  -- composite FK unconditionally the moment any of its columns is null, and
  -- exactly one of `booking_id` / `project_id` is null on every row by
  -- construction. So the artist-and-currency key is what always applies, and
  -- whichever subject key is populated is the one that binds the subject.
  --
  -- NO ACTION on all three, matching `payment_allocations_request_fk` and for
  -- the same reason: an allocation is the record that money moved, and nothing
  -- should be able to delete its collection out from under it. The only case
  -- that reaches it is an account or subject deletion removing both in one
  -- statement, which NO ACTION allows because it is checked at end of statement
  -- (executed: the account-deletion cascade leaves zero rows in all four
  -- tables).
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_collection_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_collection_fk
      foreign key (payment_intent_id, artist_id, currency)
      references payment_collections(payment_intent_id, artist_id, currency);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_collection_booking_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_collection_booking_fk
      foreign key (payment_intent_id, booking_id)
      references payment_collections(payment_intent_id, booking_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_collection_project_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_collection_project_fk
      foreign key (payment_intent_id, project_id)
      references payment_collections(payment_intent_id, project_id);
  end if;

  -- ONE ROW PER (payment, component, line). This is the constraint that makes
  -- the AGENTS.md webhook rule structural rather than aspirational: a refund
  -- must converge to a target and never add a delta, because `charge.refunded`
  -- fires once per refund carrying the CUMULATIVE `amount_refunded` and Stripe
  -- redelivers events. With this in place, a second `refund_adjustment` row for
  -- the same line is not storable, so the only implementable handler is one
  -- that updates the existing row to the cumulative total.
  --
  -- Spec section 9 says the original transaction is preserved and adjustments
  -- are immutable records. The original component rows ARE preserved and never
  -- touched; the refund row converges. Where the two rules meet, the money-path
  -- rule wins, because it was learned from a production defect and because the
  -- per-refund history lives in Stripe, which is where redelivery-safe history
  -- belongs.
  --
  -- NULLS NOT DISTINCT (Postgres 15+) is required, not decorative: `line_id` is
  -- null for request-wide components, and under the default NULLS DISTINCT two
  -- `tip` rows for the same intent would both be storable, which is precisely
  -- the duplicate this is meant to prevent.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_unique'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_unique
      unique nulls not distinct (payment_intent_id, component, line_id);
  end if;

  -- Ownership of the subject, for every role.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_booking_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_booking_fk
      foreign key (booking_id, artist_id)
      references booking_requests(id, artist_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_project_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_project_fk
      foreign key (project_id, artist_id)
      references projects(id, artist_id) on delete cascade;
  end if;

  -- The request link, carrying owner and currency, so an allocation can never
  -- be denominated differently from the request it settles.
  --
  -- NO ACTION rather than CASCADE: an allocation is the record that money
  -- moved, and nothing should be able to delete a request out from under one.
  -- Only an unsent request is deletable by an artist and an unsent request can
  -- have no allocations, so the only case that reaches this is an account
  -- deletion removing both at once, which NO ACTION allows because it is
  -- checked at end of statement.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_request_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_request_fk
      foreign key (request_id, artist_id, currency)
      references payment_requests(id, artist_id, currency);
  end if;

  -- CROSS-APPOINTMENT DEPOSIT APPLICATION, made unrepresentable. Spec section 8
  -- lists it as a covered failure mode. When an allocation names both a request
  -- and a subject, the subject must be THAT request's subject. Note the
  -- asymmetric case is covered too: an allocation naming a booking-scoped
  -- request but a project subject fails, because no payment_requests row has
  -- that (id, project_id) pair.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_request_booking_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_request_booking_fk
      foreign key (request_id, booking_id)
      references payment_requests(id, booking_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_request_project_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_request_project_fk
      foreign key (request_id, project_id)
      references payment_requests(id, project_id);
  end if;

  -- The line link, paired with the request, so a refund cannot be attributed to
  -- a line from a different request.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_line_fk'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_line_fk
      foreign key (line_id, request_id)
      references payment_request_lines(id, request_id);
  end if;

  -- --- Invariants. --------------------------------------------------------
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_subject_check'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_subject_check
      check (num_nonnulls(booking_id, project_id) = 1);
  end if;

  -- A composite FK is MATCH SIMPLE: it is satisfied unconditionally the moment
  -- any of its columns is null. Without this, a row could name a line and no
  -- request, which would leave `payment_allocations_line_fk` unenforced and
  -- reopen exactly the cross-request attribution it exists to close.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_line_needs_request_check'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_line_needs_request_check
      check (line_id is null or request_id is not null);
  end if;

  -- Signs by component. `discount` reduces what was charged and
  -- `refund_adjustment` reduces what is still attributable; both are stored
  -- negative so the group sum is a plain addition and never a
  -- remember-to-subtract.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_sign_check'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_sign_check
      check (
        case
          when component in ('discount', 'refund_adjustment') then amount_minor <= 0
          else amount_minor >= 0
        end
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_collected_check'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_collected_check
      check (collected_total_minor >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_allocations_currency_check'
  ) then
    alter table payment_allocations
      add constraint payment_allocations_currency_check
      check (currency = lower(currency) and char_length(currency) = 3);
  end if;
end $$;

-- The outstanding-balance read: every allocation for one subject.
create index if not exists payment_allocations_booking_idx
  on payment_allocations (booking_id)
  where booking_id is not null;
create index if not exists payment_allocations_project_idx
  on payment_allocations (project_id)
  where project_id is not null;
create index if not exists payment_allocations_request_idx
  on payment_allocations (request_id)
  where request_id is not null;
-- Artist payment analytics (P6) and reconciliation sweeps (A8).
create index if not exists payment_allocations_artist_idx
  on payment_allocations (artist_id, settled_at desc);

alter table payment_allocations enable row level security;

-- WRITTEN BY THE SERVICE ROLE AT SETTLEMENT, from A4's Stripe webhook. The
-- artist READS these (their dashboard, their balances, their receipts) and must
-- never be able to write one.
--
-- So: SELECT only, and the absence of INSERT, UPDATE and DELETE is the design.
-- This is the same shape `projects` has, and the shape is correct here for its
-- own reason rather than by resemblance. `projects` is SELECT-only because its
-- writes carry rules RLS cannot express (a status transition); this table is
-- SELECT-only because the writer is not the artist at all. If the two ever
-- diverge, this table does not follow.
drop policy if exists "artist reads own payment allocations" on payment_allocations;
create policy "artist reads own payment allocations" on payment_allocations
  for select to authenticated using (artist_id = auth.uid());

-- A SECOND, INDEPENDENT LAYER. RLS with no permissive policy already denies
-- these verbs, but a single future `for all` policy added by someone reading
-- 0035's `products` table as the house pattern would silently undo it. A
-- revoked privilege is not overridable by a policy, so this failure becomes
-- impossible rather than unlikely, and if a later slice genuinely needs an
-- artist write here it fails loudly at the grant and forces the decision to be
-- made deliberately.
--
-- TRUNCATE is included, and it is the one that would otherwise make the
-- paragraph above false. Supabase's default privileges grant it to `anon` and
-- `authenticated` on every table in `public` (read from
-- `information_schema.role_table_grants`: `booking_requests`, `orders` and
-- `discount_codes` all carry it today), and TRUNCATE ignores RLS entirely.
--
-- This is NOT presented as fixing a live hole, and it deliberately does not
-- claim anything about those other tables: PostgREST exposes no truncate verb
-- over a table, so no route is known to reach it, and that is an absence of a
-- known path rather than a proof there is none. It is closed HERE because this
-- is the one table whose entire shape is "the artist can never write this", and
-- leaving a verb that ignores policies would contradict that in the catalog
-- whether or not anything calls it. Executed after the revoke: TRUNCATE as
-- `authenticated` returns 42501 permission denied.
--
-- SELECT is deliberately NOT revoked, and `service_role` is untouched.
revoke insert, update, delete, truncate on payment_allocations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- THE COLLECTION IS DERIVED FROM ITS FIRST ALLOCATION.
--
-- Section 3 explains WHY `payment_collections` exists. This is the whole of how
-- it gets populated, and it exists so the binding costs A4's webhook nothing:
-- a writer inserting allocation rows for one intent, in one transaction, exactly
-- as it would have before this table existed, gets the parent for free from its
-- first row. Requiring the caller to insert the parent first would have made the
-- guarantee depend on the caller remembering, which is the class of guarantee
-- this file exists to replace.
--
-- `on conflict do nothing`, so the FIRST row of an intent defines the collection
-- and every later row is validated against it by the three foreign keys above
-- rather than by this function. That split is deliberate: this trigger never
-- decides whether a row is allowed, it only makes the parent exist, and an
-- allocation that disagrees with an existing collection is refused by the index
-- behind the FK. Nothing here re-reads the group and compares, because a
-- check-then-write in a trigger is two statements under READ COMMITTED and 0124
-- documents where that ends.
--
-- CONCURRENCY, executed rather than argued (2026-07-29). Two sessions each
-- inserting a FIRST allocation for the SAME intent, for DIFFERENT artists and
-- different appointments, with the first held uncommitted: the second blocks on
-- the primary key, its `do nothing` then finds the winner's row, and its own FK
-- check fails. Measured: `loser=23503 rows=1 distinctArtists=1`. This function
-- is not what makes that safe and must not be read as if it were; the unique
-- index behind the primary key is.
--
-- INSERT ONLY, on purpose. An UPDATE that moved an existing allocation to a
-- different intent, artist or subject must FAIL rather than quietly acquire a
-- new parent, and with no trigger on UPDATE that is exactly what the foreign
-- keys do (23503). A4 converges refund rows by updating `amount_minor`, which
-- touches none of the bound columns.
--
-- SECURITY INVOKER, like the other functions in this file. It writes rather than
-- only reads, which is 0122's stated reason for DEFINER, but the elevation is
-- not needed here and would be a real widening: INSERT on `payment_allocations`
-- is REVOKED from `anon` and `authenticated` (above), and that privilege check
-- happens before any trigger fires, so the only roles that can reach this body
-- are ones that already bypass RLS. Executed: as `authenticated`, the allocation
-- insert returns 42501 and this function does not run.
create or replace function ensure_payment_collection()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into payment_collections
    (payment_intent_id, artist_id, booking_id, project_id, currency)
  values
    (new.payment_intent_id, new.artist_id, new.booking_id, new.project_id, new.currency)
  on conflict (payment_intent_id) do nothing;

  return new;
end;
$$;

drop trigger if exists payment_allocations_ensure_collection on payment_allocations;
create trigger payment_allocations_ensure_collection
  before insert on payment_allocations
  for each row execute function ensure_payment_collection();

-- ===========================================================================
-- IMMUTABILITY, enforced for every role.
--
-- WHY A TRIGGER AND NOT A POLICY. Policies constrain client roles only. A4's
-- webhook, A8's reconciliation, every backfill and every admin path run on the
-- service role, which bypasses RLS entirely. "The amount someone agreed to and
-- the amount charged must be the same object" is not a rule about the artist's
-- client, it is a rule about the row, so it has to hold where the row lives.
--
-- WHY THESE ARE SECURITY INVOKER, spelled out because the instinct runs the
-- other way. 0122's trigger is SECURITY DEFINER, correctly: it WRITES a table
-- whose RLS the invoking statement is not evaluating. These two only READ the
-- parent row and REJECT, so they need no elevated privilege, and elevating them
-- would actively make things worse: a definer-rights check would answer
-- "is request <uuid> frozen?" for ANY artist's request id, turning a rejection
-- into an existence oracle. Invoker rights mean an id the caller cannot see
-- reads as "not found", which is the answer it should get.
--
-- WHY 23514 AND NOT A CUSTOM SQLSTATE. PostgREST maps unrecognised SQLSTATEs to
-- HTTP 500, which would turn a deliberate business refusal into a server error.
-- 23514 (check_violation) maps to 400, and these ARE check violations. The
-- specific reason is carried as a stable snake_case token at the START of the
-- message so A2 can branch on it without matching prose.

create or replace function enforce_payment_request_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line_total bigint;
begin
  -- THE FREEZE EVENT: null -> non-null. This is the one moment the request
  -- becomes a client-facing commitment, and the only moment the total can be
  -- verified against the lines cheaply and for every role. Spec section 3:
  -- there is no unstructured "additional amount" field, so a sent total that
  -- is not exactly the sum of its visible lines is a delta the client cannot
  -- account for.
  if old.sent_at is null and new.sent_at is not null then
    select coalesce(sum(line_total_minor), 0) into v_line_total
    from payment_request_lines
    where request_id = new.id;

    if v_line_total <> new.total_minor then
      raise exception
        'payment_request_total_mismatch: a sent request total must equal the sum of its lines'
        using errcode = '23514',
              detail = format('request %s: total_minor=%s, sum(line_total_minor)=%s',
                              new.id, new.total_minor, v_line_total);
    end if;
    return new;
  end if;

  -- Not frozen yet: the revision is still being composed, so everything is
  -- editable. This is the ONLY branch that returns without checking anything,
  -- and it is reachable only while sent_at is null on BOTH sides.
  if old.sent_at is null then
    return new;
  end if;

  -- From here the row is frozen.
  --
  -- The latch cannot be released. Without this the freeze would be bypassable
  -- in two statements rather than one.
  if new.sent_at is distinct from old.sent_at then
    raise exception
      'payment_request_frozen: sent_at is the freeze latch and cannot be changed once set'
      using errcode = '23514',
            detail = format('request %s', old.id);
  end if;

  -- Nor can the row walk backwards into an editable status, which would have
  -- the same effect one statement later.
  if new.status in ('draft', 'ready') then
    raise exception
      'payment_request_frozen: a sent request cannot return to %', new.status
      using errcode = '23514',
            detail = format('request %s was sent at %s', old.id, old.sent_at);
  end if;

  -- The money columns. `is distinct from` rather than `<>` so a null on either
  -- side is compared correctly; `<>` would evaluate to null and skip the check.
  if new.artist_id            is distinct from old.artist_id
  or new.booking_id           is distinct from old.booking_id
  or new.project_id           is distinct from old.project_id
  or new.currency             is distinct from old.currency
  or new.total_minor          is distinct from old.total_minor
  or new.revision             is distinct from old.revision
  or new.supersedes_id        is distinct from old.supersedes_id
  or new.fee_schedule_version is distinct from old.fee_schedule_version then
    raise exception
      'payment_request_frozen: a sent request cannot change amount, currency, subject, revision or fee schedule'
      using errcode = '23514',
            detail = format('request %s was sent at %s; replace it with a new revision instead',
                            old.id, old.sent_at);
  end if;

  return new;
end;
$$;

drop trigger if exists payment_requests_immutability on payment_requests;
create trigger payment_requests_immutability
  before update on payment_requests
  for each row execute function enforce_payment_request_immutability();

-- ---------------------------------------------------------------------------
-- DELETE IS PART OF THE FREEZE, and leaving it out was a hole rather than a
-- scope boundary.
--
-- The function above is a BEFORE UPDATE trigger, so it constrained UPDATE and
-- nothing else, while this file claimed the freeze holds "for every role"
-- precisely because A4's webhook and the admin paths run as `service_role`.
-- Executed against the pre-fix schema (2026-07-29): as the service role,
-- DELETE of a frozen request returned 1 row and a re-INSERT of the SAME id with
-- `total_minor=999999` returned 201, leaving a row that reads as sent, carries
-- the same id every receipt and Stripe metadata reference, and states a
-- different amount. `del=1 reins=ok total=999999 => BREACH`. Delete-and-replace
-- is not a smaller edit than UPDATE, it is the same edit with the audit trail
-- removed.
--
-- Not artist-reachable: the DELETE policy above already requires
-- `sent_at is null`. This closes it for the roles policies do not constrain,
-- which is the whole reason the freeze lives in triggers.
--
-- THE CARVE-OUT, and why it is depth rather than a role test. Deleting an
-- artist's account must still take the whole chain: `artist_id` cascades from
-- `profiles`, and `booking_id` cascades from `booking_requests`. Both arrive as
-- referential-integrity actions, and an RI cascade runs this trigger NESTED.
-- Measured rather than assumed, on this image, with a probe table pair
-- (2026-07-29): a direct `delete` fires the row trigger at
-- `pg_trigger_depth() = 1`; the same row reached through one cascade hop fires
-- at 2, and through two hops also at 2. So `> 1` admits every cascade and no
-- direct delete.
--
-- What that carve-out costs, named rather than hidden: a future trigger
-- elsewhere that deletes a payment request would also pass. Nothing does today,
-- and the alternative (`current_user`) does not work at all here, because the
-- role that runs the cascade IS the service role doing the delete.
create or replace function enforce_payment_request_delete_frozen()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.sent_at is not null and pg_trigger_depth() <= 1 then
    raise exception
      'payment_request_frozen: a sent request cannot be deleted'
      using errcode = '23514',
            detail = format('request %s was sent at %s; cancel it or supersede it instead',
                            old.id, old.sent_at);
  end if;

  return old;
end;
$$;

drop trigger if exists payment_requests_delete_frozen on payment_requests;
create trigger payment_requests_delete_frozen
  before delete on payment_requests
  for each row execute function enforce_payment_request_delete_frozen();

-- ---------------------------------------------------------------------------
-- THE LINES OF A FROZEN REQUEST.
--
-- THIS FUNCTION HAD BOTH HALVES OF THE 0124 PATTERN MISSING, and the result was
-- not a narrow window. It read the parent's `sent_at` with no row lock and acted
-- on that read in the same breath, so an ordinary line write racing an ordinary
-- send saw the PRE-freeze parent, was admitted, and committed after the freeze
-- had already checked the total against the lines. Executed through the real
-- PostgREST path, two concurrent calls, no held transaction required
-- (2026-07-29): 19 of 20 iterations ended `status=sent total=10000
-- sum(lines)=8000`, a frozen client-facing commitment whose itemization no
-- longer adds up to the amount charged. Every SEQUENTIAL probe passed, which is
-- why it survived review.
--
-- The repair is 0124's, applied here:
--
--   LOCK FIRST, in its own statement, on the PARENT, with a mode that conflicts
--   with what `send_payment_request` holds. That function takes FOR UPDATE on
--   the request in its step 1 and holds it until commit; FOR SHARE conflicts
--   with FOR UPDATE, so a line write racing a send blocks here instead of
--   reading a parent that is about to freeze. Verified behaviourally rather
--   than from the compatibility table: with a session holding
--   `select ... for update` on the request, a line DELETE through PostgREST
--   appears in `pg_blocking_pids` against that session's backend.
--
--   RE-CHECK IN A LATER STATEMENT. Under READ COMMITTED a statement evaluates
--   against ONE snapshot taken when it begins, and BLOCKING ON A LOCK DOES NOT
--   RE-EVALUATE IT. Reading `sent_at` in the same statement that takes the lock
--   would resume on the pre-freeze snapshot and admit the write anyway, which
--   is the mistake 0124 records being made twice.
--
-- WHAT THIS DOES NOT COVER, so nobody reads it as more than it is. If the lock
-- matches ZERO rows, no lock is taken and only the re-read protects the write.
-- Under RLS `select ... for update/share` needs the UPDATE policy, not just
-- SELECT, and this file's UPDATE policy omits the settled states. That is
-- harmless HERE and the reason is specific rather than general: every status
-- outside the policy's USING set except `cancelled` has a non-null `sent_at`
-- (`payment_requests_sent_latch_check`), so the re-read refuses those anyway,
-- and a `cancelled` request with a null `sent_at` cannot be frozen concurrently
-- because `send_payment_request` requires `draft` or `ready`. The freeze
-- transition itself, draft/ready -> sent, is inside the USING set on both sides,
-- so the lock is taken in exactly the state where the race exists.
--
-- KNOWN, ACCEPTED: the lock is taken before it is known whether the write would
-- have been permitted, so a line write on a request that is mid-send now waits
-- for that send, and `authenticated`'s statement timeout applies to the wait.
-- Same trade 0124 took, for the same reason.
--
-- 0126 OWNS THE OTHER HALF. This closes the write side; the read side (the
-- freeze summing `payment_request_lines` without locking them) is in
-- `enforce_payment_request_immutability`, which 0126 redefines. See the handoff
-- note in that file's slice.
create or replace function enforce_payment_request_lines_frozen()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sent_at     timestamptz;
  v_old_request uuid;
  v_new_request uuid;
begin
  -- `old` and `new` are unassigned records outside their own operations, and
  -- touching one raises rather than returning null, so both parents are read
  -- into locals once and the rest of the body works from those.
  v_old_request := case when tg_op in ('UPDATE', 'DELETE') then old.request_id end;
  v_new_request := case when tg_op in ('INSERT', 'UPDATE') then new.request_id end;

  -- STEP 1, ITS OWN STATEMENT ON PURPOSE. Take a lock on the parent that
  -- CONFLICTS with the FOR UPDATE `send_payment_request` holds from its step 1,
  -- so this blocks until any in-flight send has committed or rolled back. Being
  -- a separate statement is what makes step 2 work: under READ COMMITTED each
  -- statement takes a FRESH snapshot, so the re-read below sees whatever
  -- committed while we were waiting here.
  --
  -- Both parents in one statement, because an UPDATE may move a line BETWEEN
  -- requests and both ends have to hold still. `order by id` gives every session
  -- the same lock order, so two such updates crossing cannot deadlock on each
  -- other; a null in the list simply matches nothing.
  perform 1
  from payment_requests
  where id in (v_old_request, v_new_request)
  order by id
  for share;

  -- STEP 2. Fresh snapshot. The OLD parent, for UPDATE and DELETE.
  if tg_op in ('UPDATE', 'DELETE') then
    select r.sent_at into v_sent_at
    from payment_requests r
    where r.id = v_old_request;

    -- NOT FOUND is tolerated here, and only here. It means the parent row is
    -- already gone, which is reachable exactly once: an ON DELETE CASCADE from
    -- a request that was itself allowed to be deleted (unsent, per its DELETE
    -- policy) or from an account deletion taking everything. Failing closed
    -- here would break both.
    if found and v_sent_at is not null then
      -- The one permitted exception, and it is narrow. A composite FK with
      -- ON DELETE SET NULL (product_id) performs an RI UPDATE when a linked
      -- product is hard-deleted, and that update legitimately touches a frozen
      -- line. It releases a link and changes nothing the client ever saw, so
      -- the financial record is intact. Everything else on a frozen line is
      -- refused. Note an artist can never reach this branch at all: the line
      -- UPDATE policy already requires an unfrozen parent, so only the service
      -- role and RI actions get here. Executed: as `authenticated`, an UPDATE
      -- and a DELETE against a frozen line both return 0 rows with no error and
      -- leave the line byte-identical, so the artist path is refused by the
      -- policy before this function runs.
      if tg_op = 'UPDATE'
         and old.product_id is not null
         and new.product_id is null
         and new.request_id        is not distinct from old.request_id
         and new.artist_id         is not distinct from old.artist_id
         and new.name              is not distinct from old.name
         and new.description       is not distinct from old.description
         and new.quantity          is not distinct from old.quantity
         and new.unit_amount_minor is not distinct from old.unit_amount_minor
         and new.line_total_minor  is not distinct from old.line_total_minor
         and new.currency          is not distinct from old.currency
         and new.classification    is not distinct from old.classification
         and new.tax_treatment     is not distinct from old.tax_treatment
         and new.refund_status     is not distinct from old.refund_status
         and new.source            is not distinct from old.source
         and new.position          is not distinct from old.position then
        return new;
      end if;

      raise exception
        'payment_request_lines_frozen: the lines of a sent request cannot be changed'
        using errcode = '23514',
              detail = format('request %s was sent at %s; replace it with a new revision instead',
                              old.request_id, v_sent_at);
    end if;
  end if;

  -- STILL STEP 2, still on a snapshot taken after the lock. The NEW parent, for
  -- INSERT and UPDATE. Checked separately so moving a line INTO a frozen request
  -- is refused as well as editing one already in it.
  if tg_op in ('INSERT', 'UPDATE') then
    select r.sent_at into v_sent_at
    from payment_requests r
    where r.id = v_new_request;

    -- FAIL CLOSED here, unlike the DELETE branch above. A missing parent on a
    -- write means either an id that does not exist (the composite FK would
    -- reject it moments later anyway, but this is the clearer error) or a
    -- parent this caller cannot see under RLS, and "cannot see it" must never
    -- read as "it is not frozen".
    if not found then
      raise exception
        'payment_request_lines_no_parent: the payment request does not exist or is not visible'
        using errcode = '23514',
              detail = format('request %s', new.request_id);
    end if;

    if v_sent_at is not null then
      raise exception
        'payment_request_lines_frozen: the lines of a sent request cannot be changed'
        using errcode = '23514',
              detail = format('request %s was sent at %s; replace it with a new revision instead',
                              new.request_id, v_sent_at);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists payment_request_lines_frozen on payment_request_lines;
create trigger payment_request_lines_frozen
  before insert or update or delete on payment_request_lines
  for each row execute function enforce_payment_request_lines_frozen();
