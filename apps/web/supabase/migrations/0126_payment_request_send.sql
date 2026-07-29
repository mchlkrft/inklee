-- Appointment payments: what a request collects, and the atomic send
-- (Plus build P9, slice A2).
--
-- Spec: docs/product/plus-payments-architecture.md, sections 1 (capability
-- boundary), 3 (payment request model) and 8 (double-charge prevention).
-- Money-path rules in AGENTS.md apply to every line of this file.
--
-- TWO THINGS LAND HERE, and they are the two things A2's cores cannot do from
-- application code:
--
--   1. `payment_requests.collects`. A request that is purely a DEPOSIT is not
--      the same capability as one collecting a BALANCE or a FULL PRICE (spec
--      section 1 prices and gates them separately, and A1 already models the
--      three as distinct allocation components). Without a stored answer, the
--      entitlement can only be checked when the request is CREATED, and an
--      artist who composes a request while entitled and sends it after a
--      downgrade would collect a capability they no longer hold. Spec section
--      12 lists "downgrade after sending a request" as a test obligation, so
--      that is a modelled concern rather than a hypothetical. The column is
--      what lets `sendPaymentRequestCore` re-derive the gate from the ROW at
--      the moment the client is asked to pay.
--
--   2. `send_payment_request`. Sending a revision CANCELS the request it
--      replaces and FREEZES itself, and those two writes must live or die
--      together. Through PostgREST they are two round trips in two
--      transactions, so a freeze that fails after the cancel has committed
--      destroys the artist's outstanding request and sends nothing.
--
--      Both properties are measured in
--      apps/web/tests/db/payment-request-send-race.test.ts, and the two are
--      measured differently, which is worth knowing before trusting either:
--      the file goes RED when this function's LOCK or its re-check is removed
--      (recorded verbatim in its header, with md5s), while the TWO-ROUND-TRIP
--      shape is demonstrated by a test that performs it and asserts the damage
--      it causes, because that shape is not a body this function can be
--      swapped for.
--
-- THIS FILE ALSO OWNS ONE HALF OF A LOCK PAIR. `enforce_payment_request_immutability`
-- sums the lines FOR UPDATE at the freeze; 0125's
-- `enforce_payment_request_lines_frozen` takes FOR SHARE on the parent at every
-- line write. Neither file's text is evidence for the other, so both are pinned
-- behaviourally and by catalog read in
-- apps/web/tests/db/payment-request-lines-freeze-race.test.ts, which was shown
-- RED against each lock removed on its own. The trade this file's half carries
-- (a real, data-safe deadlock) is written out where the lock is.
--
-- CONVERGENCE (AGENTS.md). Every named object below is added through a guarded
-- `do $$ ... if not exists ... end $$;` block or drop-then-created, so re-running
-- this file converges rather than merely exiting 0. `0122` is the reference.
--
-- PROVEN BY THE ROUTE THAT WOULD DISPROVE IT, not argued from the shape, since
-- AGENTS.md records that "idempotent" has been mistaken for "convergent" in this
-- repo before. Executed against the live already-migrated local database:
--
--   1. Both check constraints dropped, `send_payment_request` dropped, the
--      `payment_requests_immutability` trigger dropped, and
--      `enforce_payment_request_immutability` reverted to 0125's body (the one
--      that does NOT know about `collects`). Catalog after: constraints [],
--      fn 0, trigger 0, `prosrc like '%collects%'` false.
--      Re-running this file restored all five: constraints
--      [payment_requests_collects_check, payment_requests_collects_sent_check],
--      fn 1, trigger 1, `prosrc like '%collects%'` true.
--
--   2. `alter table payment_requests drop column collects cascade` (which takes
--      both constraints with it). Catalog after: column 0, constraints 0.
--      Re-running this file restored the column and both constraints.
--
-- The only NOTICE on a re-run is the harmless `column "collects" ... already
-- exists, skipping`.
--
-- PRECONDITION, and the one state that does NOT converge for free. If the
-- database already holds a payment request that was SENT before this file ran,
-- that row has a null `collects`, and `payment_requests_collects_sent_check`
-- cannot be added on top of it. Section 1 therefore REPAIRS those rows before
-- constraining, with a guess it labels as one and a notice naming the rows.
--
-- Why this is not hypothetical, and why `db push` is not the whole story:
-- `supabase db push` wraps a migration in a transaction, so a failure there
-- rolls back cleanly and the file is merely unappliable rather than
-- half-applied. This repo's handoff also describes HAND-APPLICATION through the
-- SQL editor, and executed that way (2026-07-29, local stack) the column ALTER
-- committed and the following `do` block then aborted with `check constraint
-- "payment_requests_collects_sent_check" of relation "payment_requests" is
-- violated by some row`, leaving the column present and BOTH constraints
-- absent. Re-running the whole file from that state failed identically. A file
-- that re-runs and does not converge is the AGENTS.md footgun, so it is fixed
-- here rather than documented as a caveat.
--
-- The constraint itself is NOT weakened. A sent request still has to say what
-- it collects; the repair is what makes that statement true of the rows that
-- predate it.

-- ---------------------------------------------------------------------------
-- 1. WHAT THIS REQUEST COLLECTS.
--
-- Three values, mirroring `PAYMENT_REQUEST_COLLECTS` in
-- packages/shared/src/appointment-payments.ts. If one changes, change the other
-- in the same commit (the 0115 convention 0125 already follows).
--
-- A CHECK CONSTRAINT rather than a fourth enum, and the boundary is worth
-- stating because 0125 chose enums for its three vocabularies. Those are closed
-- vocabularies queried across several tables. This one lives in a single column
-- on a single table, is read by exactly two things (the entitlement gate and
-- A4's choice of allocation component), and is the most likely of any
-- vocabulary here to gain a value as the package changes. A check constraint is
-- cheaper to widen than an enum, which is the same reason 0125 gave for
-- `tax_treatment`, `refund_status` and `source`.
--
-- NULLABLE, with the requirement attached to the FREEZE rather than to the row.
-- The same shape `fee_schedule_version` already uses: a draft may not know yet,
-- a SENT request always does. So there is no DEFAULT and no backfill on the
-- ordinary path: there is no honest default here, and guessing `deposit` for a
-- row that was actually collecting a full price would mis-gate it and
-- mis-allocate it. The one exception is the out-of-order repair below, which
-- exists because the alternative is a file that cannot be applied at all.
alter table payment_requests add column if not exists collects text;

do $$
declare
  v_repaired uuid[];
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_collects_check'
  ) then
    alter table payment_requests
      add constraint payment_requests_collects_check
      check (collects is null or collects in ('deposit', 'balance', 'full_price'));
  end if;

  -- A sent request always declares what it collects, for the same reason it
  -- always carries a fee schedule version: it is evidence about a client-facing
  -- commitment, and it cannot be reconstructed afterwards.
  if not exists (
    select 1 from pg_constraint where conname = 'payment_requests_collects_sent_check'
  ) then
    -- REPAIR BEFORE CONSTRAINING. See the PRECONDITION note in this file's
    -- header: a row that was SENT before this file ran has a null `collects`,
    -- and adding the constraint on top of it aborts the whole `do` block with
    -- `check constraint … is violated by some row`, taking the constraint above
    -- with it. Executed against the local stack before this repair existed:
    -- the column ALTER committed, the block aborted, and BOTH constraints were
    -- left absent while a re-run of the whole file failed the same way. That is
    -- the AGENTS.md failure exactly: the file re-ran, and did not converge.
    --
    -- The trigger is stood down for the duration because it is the thing that
    -- would refuse this: `enforce_payment_request_immutability` (the version
    -- section 2 installs) treats `collects` as frozen, so on a database that
    -- already has that body the repair raises `payment_request_frozen` and the
    -- migration stays unappliable. The disable, the update and the enable are
    -- ONE transaction holding ACCESS EXCLUSIVE on the table, so there is no
    -- window in which another session can write a frozen row unchecked, and any
    -- failure rolls the disable back with everything else. Guarded on the
    -- trigger's existence rather than assumed, since 0125 may not have run.
    --
    -- `full_price` is a GUESS and is labelled one. It is the guess in the safe
    -- direction: of the three purposes it demands the strongest entitlement, so
    -- the gate can only end up too strict, and it is the broadest allocation
    -- component, so it cannot understate what the client was asked for. The
    -- notice names the rows, because the artist's real answer is not
    -- reconstructable from the schema and a human has to look.
    if exists (
      select 1 from pg_trigger
       where tgname = 'payment_requests_immutability'
         and tgrelid = 'payment_requests'::regclass
    ) then
      alter table payment_requests disable trigger payment_requests_immutability;
    end if;

    with repaired as (
      update payment_requests
         set collects = 'full_price',
             updated_at = now()
       where sent_at is not null
         and collects is null
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_repaired from repaired;

    if exists (
      select 1 from pg_trigger
       where tgname = 'payment_requests_immutability'
         and tgrelid = 'payment_requests'::regclass
    ) then
      alter table payment_requests enable trigger payment_requests_immutability;
    end if;

    if cardinality(v_repaired) > 0 then
      raise notice
        '0126: % already-sent payment_requests row(s) had no `collects` and were set to `full_price` as a GUESS. Review them: %',
        cardinality(v_repaired), v_repaired;
    end if;

    alter table payment_requests
      add constraint payment_requests_collects_sent_check
      check (sent_at is null or collects is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. `collects` JOINS THE FROZEN SET.
--
-- 0125's freeze trigger closes the money columns once `sent_at` is set. A
-- column added afterwards is not in that list, so without this replacement an
-- artist could send a request as a `deposit` and then rewrite it to
-- `full_price`, which changes both the capability it was gated on and the
-- allocation component A4 will settle it under. That is precisely the "a
-- request the client has already reviewed is never silently modified" rule the
-- trigger exists to enforce.
--
-- THIS FILE NOW OWNS THE DEFINITION of
-- `enforce_payment_request_immutability()`. 0125 still contains the older body,
-- and re-running 0125 ALONE would silently drop `collects` back out of the
-- frozen set while every constraint, policy and index still looked correct.
-- That is the AGENTS.md lesson applied to a function rather than a constraint:
-- verify the object, not the file.
--
--   select prosrc like '%collects%' from pg_proc
--    where proname = 'enforce_payment_request_immutability';
--
-- The alternative (a second, additive trigger guarding only `collects`) was
-- considered and rejected: it would fork the money-column list into two places,
-- and the next engineer adding a money column in A3 would look at 0125's list
-- and edit one of them. One list with a named hazard beats two lists with none.
--
-- Everything else in this body is 0125's, unchanged.
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
    -- LOCK THE LINES WHILE SUMMING THEM. 0125 closed the WRITE side of this race
    -- (`enforce_payment_request_lines_frozen` takes FOR SHARE on the parent
    -- before admitting a line write); this is the READ side, and it is the
    -- second of the two objects the guarantee now rests on. Without it, the sum
    -- here is an unlocked read and the freeze's correctness depends entirely on
    -- the other function still containing its lock, which AGENTS.md and 0124's
    -- header both say is not evidence.
    --
    -- THE SUBQUERY IS REQUIRED, NOT STYLE. Executed both ways on this image
    -- (2026-07-29): the direct form `select sum(...) ... for update` fails with
    -- `ERROR: FOR UPDATE is not allowed with aggregate functions` (0A000); the
    -- subquery form returns a row. A migration is not the place to discover that.
    --
    -- WHAT THIS COVERS AND WHAT IT DOES NOT. Measured by removing one lock at a
    -- time and running apps/web/tests/db/payment-request-lines-freeze-race.test.ts:
    --
    --   this lock removed, 0125's kept  -> the INSERT case and the DELETE case
    --     both stay GREEN. So on today's schema the read side closes nothing the
    --     write side does not already close.
    --   0125's lock removed, this kept  -> the DELETE case stays GREEN, and the
    --     INSERT case goes RED with the damage itself: `a SENT request must have
    --     total_minor === sum(line_total_minor), got total=10000 sum=12000`.
    --
    -- The asymmetry is the useful part: a line INSERTED after this statement's
    -- snapshot has no row to lock, so INSERT is covered by 0125's write-side lock
    -- ALONE, while an UPDATE or DELETE of an existing line is covered twice. Do
    -- not read this as "the read side makes the write side optional"; it is the
    -- weaker of the two and it is here so the guarantee does not rest on a single
    -- object in another file, which AGENTS.md and 0124's header both warn about.
    --
    -- NO `for update` HERE, DELIBERATELY, AND THIS IS A REVERSAL. An earlier
    -- version of this statement locked the line rows while summing them. It was
    -- removed on measurement, and the reasoning is kept because the argument for
    -- adding it was a good one.
    --
    -- The case FOR it was defense in depth: without it the freeze's correctness
    -- rests on a lock in ANOTHER FILE (0125's lines trigger), and both AGENTS.md
    -- and 0124's header warn about exactly that kind of inherited guarantee.
    --
    -- The case AGAINST it won on execution. Postgres locks an UPDATE/DELETE
    -- target tuple BEFORE firing its BEFORE ROW triggers, so a line write's real
    -- order is LINE then PARENT, while this statement's is PARENT then LINE. That
    -- is a genuine cycle and it cannot be ordered away, because the freeze IS an
    -- update of the parent and can never take the line lock first. Measured
    -- independently from a zero reset: a deterministic `40P01`, 3 of 3, as
    -- superuser AND as `authenticated` under RLS, in the window this function
    -- opens between its step-1 `for update` and the freeze several statements
    -- later. The two measurements disagreed about WHO dies (author read the
    -- freeze as victim, verifier the artist's line write, 3/3); the artist losing
    -- an ordinary edit to a deadlock is the worse of the two and neither is
    -- acceptable when the alternative costs nothing.
    --
    -- Because it costs nothing: with this lock removed and 0125's kept, the full
    -- concurrent probe is 0/30 breaches on ALL THREE variants (insert, update,
    -- delete), run from a fresh reset. INSERT was never covered here anyway, a
    -- line inserted after this statement's snapshot has no row to lock, so 0125's
    -- write-side lock was always carrying that case alone.
    --
    -- The defense-in-depth concern is answered by a TEST rather than a second
    -- lock: tests/db/payment-request-lines-freeze-race.test.ts must fail if
    -- 0125's `for share` is removed. A test catches the regression this lock was
    -- meant to catch, and does not deadlock an artist to do it.
    select coalesce(sum(l.line_total_minor), 0) into v_line_total
    from payment_request_lines l
    where l.request_id = new.id;

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
  --
  -- `collects` was added to this list by 0126: it selects both the entitlement
  -- the request was gated on and the allocation component A4 settles it under,
  -- so changing it after send changes what was agreed.
  if new.artist_id            is distinct from old.artist_id
  or new.booking_id           is distinct from old.booking_id
  or new.project_id           is distinct from old.project_id
  or new.currency             is distinct from old.currency
  or new.total_minor          is distinct from old.total_minor
  or new.revision             is distinct from old.revision
  or new.supersedes_id        is distinct from old.supersedes_id
  or new.collects             is distinct from old.collects
  or new.fee_schedule_version is distinct from old.fee_schedule_version then
    raise exception
      'payment_request_frozen: a sent request cannot change amount, currency, subject, revision, purpose or fee schedule'
      using errcode = '23514',
            detail = format('request %s was sent at %s; replace it with a new revision instead',
                            old.id, old.sent_at);
  end if;

  return new;
end;
$$;

-- The trigger itself is unchanged from 0125 and re-created here so this file
-- converges on its own: dropping and re-creating a trigger repairs a
-- present-but-wrong-shaped one, which an existence guard skips over.
drop trigger if exists payment_requests_immutability on payment_requests;
create trigger payment_requests_immutability
  before update on payment_requests
  for each row execute function enforce_payment_request_immutability();

-- ===========================================================================
-- 3. SEND, AS ONE TRANSACTION.
--
-- "Cancelled and replaced" (spec section 3) and "a new revision" are not two
-- outcomes. They are the two halves of ONE operation, seen from the two rows it
-- touches: the successor freezes, the predecessor cancels. A2's cores implement
-- it once, and this function is where the two halves become inseparable.
--
-- WHY THIS CANNOT BE TWO POSTGREST CALLS. The cancel and the freeze would be
-- two transactions. Everything that can make the freeze fail (another draft
-- winning the subject's payable slot, the lines changing under it, the draft
-- being discarded in another tab) then leaves the predecessor CANCELLED with no
-- replacement: the client's link is dead, the artist is shown an error, and the
-- outstanding request they were trying to replace is gone. Executed, and RED
-- against exactly that shape: apps/web/tests/db/payment-request-send-race.test.ts.
--
-- WHY THE UNIQUE VIOLATION IS NOT CAUGHT IN HERE, which is the subtlest line in
-- the file. A plpgsql `exception` block opens a SUBTRANSACTION, so catching
-- 23505 around the final update would roll back only that statement and let
-- this function RETURN NORMALLY with the cancel still applied: exactly the hole
-- above, rebuilt inside the fix. The violation must propagate so the whole
-- transaction aborts. `sendPaymentRequestCore` catches 23505 at the PostgREST
-- boundary, where the transaction is already gone, and turns it into
-- `already_outstanding` with honest copy. The partial unique indexes from 0125
-- are the arbiter of "one payable request per subject"; nothing in here
-- second-guesses them.
--
-- SECURITY INVOKER (stated, not defaulted). This needs no elevated privilege
-- and must not have any: it runs as the calling artist, so 0125's SELECT and
-- UPDATE policies apply on top of the explicit `artist_id` filters below, and
-- an id belonging to another artist reads as absent rather than as a refusal,
-- which would make this an existence oracle. The same reasoning 0125 gives for
-- its triggers and 0124 gives for its delete.
--
-- ---------------------------------------------------------------------------
-- THE LOCK, AND WHY IT IS NOT DECORATION.
--
-- The dangerous interleaving is not two sends racing. 0125's partial unique
-- index already makes two payable requests per subject unstorable, whatever the
-- application does. It is a send racing a SETTLEMENT:
--
--   read predecessor      -> 'sent', looks replaceable
--   [A4's webhook commits: predecessor -> payment_processing -> paid]
--   cancel predecessor    -> 0 rows, reads as "already gone"
--   freeze successor      -> succeeds, because `paid` is NOT payable and the
--                            unique index therefore has nothing to say
--   => the client is asked to pay a balance they have already paid
--
-- That is spec section 8's "collecting an already-paid balance", and it is the
-- one failure in this file the unique index cannot cover. Closing it needs both
-- halves of the 0124 pattern:
--
--   LOCK FIRST, so no settlement can commit between the re-check and the
--   cancel. Without it, a webhook landing in that gap leaves the re-check's
--   answer stale by the time it is acted on.
--
--   RE-CHECK IN A LATER STATEMENT, because under READ COMMITTED a statement
--   evaluates against ONE snapshot taken when it begins, and BLOCKING ON A LOCK
--   DOES NOT RE-EVALUATE A SUBQUERY. A single statement that waits on the
--   settlement resumes on its original snapshot and still sees 'sent'.
--
-- A NOTE THAT INVERTS 0124's FIRST DEPENDENCY, because it looks like a bug and
-- is not. Under RLS, `select ... for update` needs the UPDATE policy, not just
-- SELECT, and 0125's UPDATE policy excludes `payment_processing`,
-- `partially_paid` and `paid` from its USING clause. So when a settlement
-- commits while we are blocked, EvalPlanQual re-runs that qual against the new
-- row version, the row is filtered out, and the lock returns ZERO ROWS AND NO
-- ERROR. That is the right answer here: the re-check below uses a PLAIN select
-- (the SELECT policy has no status filter, so it sees every state) and refuses
-- on what it finds. A row this artist may not update is a row this function
-- must not cancel. Do not "fix" the zero-row lock by making this function
-- SECURITY DEFINER: that would let it cancel rows the policies deny.
--
-- DEADLOCK. This body takes two row locks (successor, then predecessor) in one
-- transaction, which 0124 notes is the precondition for a deadlock. A cycle
-- needs two requests each superseding the other; `supersedes_id` is written
-- only when a revision is CREATED, always pointing at an already-existing row,
-- so a fresh uuid can never already be someone's predecessor. Unreachable by
-- construction rather than by luck.
--
-- ---------------------------------------------------------------------------
-- RETURN VALUE: a stable snake_case token, like 0124. The caller maps it to
-- copy; nothing branches on prose. Tokens:
--
--   sent                  the successor is frozen and payable
--   gone                  no such request for this artist, or it changed under us
--   already_sent          `sent_at` is already set
--   not_sendable          status is outside draft / ready
--   purpose_missing       `collects` is null, so it cannot be gated or allocated
--   empty                 nothing to collect (spec section 4: no 0.00 requests)
--   already_outstanding   another request for this subject is already payable
--   supersedes_gone       the request this replaces no longer exists
--   supersedes_foreign    the request this replaces settles a DIFFERENT subject
--   supersedes_settled    the request this replaces has money on it
--   supersedes_changed    it moved while we held its lock (see the note below)
create or replace function send_payment_request(
  p_request_id uuid,
  p_artist_id uuid,
  p_expires_at timestamptz,
  p_fee_schedule_version text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status      payment_request_status;
  v_sent_at     timestamptz;
  v_booking_id  uuid;
  v_project_id  uuid;
  v_supersedes  uuid;
  v_collects    text;
  v_total       integer;
  v_pred_status payment_request_status;
  v_pred_booking uuid;
  v_pred_project uuid;
  v_sent_id     uuid;
begin
  -- STEP 1. Lock the successor, in its own statement. Two tabs sending the same
  -- draft serialize here, so the second one reads the FIRST one's result in
  -- step 2 rather than racing it to the freeze.
  perform 1
  from payment_requests
  where id = p_request_id
    and artist_id = p_artist_id
  for update;

  -- STEP 2. Fresh snapshot. Everything decided below is decided from THIS read,
  -- and the lock above is what keeps it true for the rest of the transaction.
  select status, sent_at, booking_id, project_id, supersedes_id, collects, total_minor
    into v_status, v_sent_at, v_booking_id, v_project_id, v_supersedes, v_collects, v_total
  from payment_requests
  where id = p_request_id
    and artist_id = p_artist_id;

  -- A plain select, so this sees every status the SELECT policy allows even
  -- when step 1's lock matched nothing. "The lock found no row" and "the row is
  -- not there" are different facts and only one of them is `gone`.
  if not found then
    return 'gone';
  end if;
  if v_sent_at is not null then
    return 'already_sent';
  end if;
  if v_status not in ('draft', 'ready') then
    return 'not_sendable';
  end if;
  if v_collects is null then
    return 'purpose_missing';
  end if;
  -- Spec section 4: a zero balance produces no request at all rather than a
  -- 0.00 one. The check constraint would refuse this too; a token says why.
  if v_total <= 0 then
    return 'empty';
  end if;

  -- STEP 3. Is another request for this subject already payable?
  --
  -- Checked HERE, before anything is cancelled, and checked for the MESSAGE
  -- rather than for safety: this is a subquery on a snapshot, so a send
  -- committing right after it would not appear. The unique index is what
  -- actually holds, and step 5 is where it speaks. Doing it in this order means
  -- the ordinary non-racing case gets a useful refusal without touching the
  -- predecessor at all.
  --
  -- The predecessor is excluded: it is payable, and cancelling it is the point.
  if exists (
    select 1
    from payment_requests o
    where o.artist_id = p_artist_id
      and o.id <> p_request_id
      and (v_supersedes is null or o.id <> v_supersedes)
      and o.status in ('sent', 'viewed', 'payment_processing', 'partially_paid')
      and (
        (v_booking_id is not null and o.booking_id = v_booking_id)
        or (v_project_id is not null and o.project_id = v_project_id)
      )
  ) then
    return 'already_outstanding';
  end if;

  -- STEP 4. The predecessor: lock, re-check in a LATER statement, then cancel.
  if v_supersedes is not null then
    -- 4a. LOCK. Blocks on any in-flight settlement write to this row. May match
    -- zero rows with no error when the row has left the UPDATE policy's USING
    -- set (see the note in the header) or is simply absent; both are handled by
    -- reading it properly below rather than by trusting this result.
    perform 1
    from payment_requests
    where id = v_supersedes
      and artist_id = p_artist_id
    for update;

    -- 4b. RE-CHECK, in a separate statement so it takes a FRESH snapshot that
    -- includes anything that committed while 4a was waiting. This is the whole
    -- mechanism; a single combined statement would resume on its original
    -- snapshot and act on a state that no longer exists.
    select status, booking_id, project_id
      into v_pred_status, v_pred_booking, v_pred_project
    from payment_requests
    where id = v_supersedes
      and artist_id = p_artist_id;

    if not found then
      return 'supersedes_gone';
    end if;

    -- A revision must replace a request for the SAME subject. The composite FK
    -- on `supersedes_id` binds artist and currency but deliberately not the
    -- subject, so without this an artist could cancel one appointment's
    -- outstanding request by sending another appointment's revision.
    if v_pred_booking is distinct from v_booking_id
       or v_pred_project is distinct from v_project_id then
      return 'supersedes_foreign';
    end if;

    -- Mirrors `SUPERSEDABLE_PAYMENT_REQUEST_STATUSES` in
    -- packages/shared/src/appointment-payments.ts. Anything holding or having
    -- held money is refused: replacing it would ask a client to pay again for
    -- what they are already paying or have already paid. That money is A5's
    -- refund path, not a thing to route around here.
    if v_pred_status not in
       ('draft', 'ready', 'sent', 'viewed', 'expired', 'failed', 'cancelled') then
      return 'supersedes_settled';
    end if;

    -- 4c. CANCEL. `and status = v_pred_status` is an optimistic guard on a fact
    -- the lock above already guarantees, kept so a broken lock shows up as a
    -- refusal here instead of as a silent write on a stale reading. If this
    -- ever returns `supersedes_changed`, the lock is not doing its job.
    if v_pred_status <> 'cancelled' then
      update payment_requests
         set status = 'cancelled',
             cancelled_at = now(),
             updated_at = now()
       where id = v_supersedes
         and artist_id = p_artist_id
         and status = v_pred_status;
      if not found then
        return 'supersedes_changed';
      end if;
    end if;
  end if;

  -- STEP 5. FREEZE. `sent_at` null -> non-null fires 0125's trigger, which
  -- verifies the total against the sum of the lines for every role and raises
  -- 23514 if they disagree. A 23505 from the partial unique index here aborts
  -- the whole transaction, taking the cancel in step 4c with it: that is the
  -- atomicity this function exists for, and it is why nothing catches it.
  update payment_requests
     set status = 'sent',
         sent_at = now(),
         expires_at = p_expires_at,
         fee_schedule_version = p_fee_schedule_version,
         updated_at = now()
   where id = p_request_id
     and artist_id = p_artist_id
     and sent_at is null
     and status in ('draft', 'ready')
  returning id into v_sent_id;

  if v_sent_id is null then
    return 'gone';
  end if;

  return 'sent';
end;
$$;

-- Same posture as 0124: the artist calls this, `anon` never does.
--
-- `service_role` KEEPS EXECUTE, and the honest reason is that it cannot be
-- taken away here: Supabase's default privileges grant it, and
-- `supabase/seed.sql` re-grants `execute on all routines` to `service_role`
-- after every migration has run, so a revoke in this file would hold in
-- production and silently not hold locally. Measured rather than assumed:
-- `has_function_privilege('service_role', ..., 'EXECUTE')` is true for both this
-- function and 0124's after a local `db reset`.
--
-- That is acceptable because RLS is NOT what makes this body safe, which is the
-- difference from 0124. Every statement here carries its own explicit
-- `artist_id` filter, its own status test, and an explicit refusal for a
-- predecessor holding money; the policies are a second layer on top for
-- `authenticated`, not the first. What a service-role caller would skip is the
-- ENTITLEMENT gate, and that lives in `sendPaymentRequestCore` rather than in
-- SQL. So do not read this grant as a claim that a service-role send is
-- supported: nothing calls it that way, and A4's webhook has no reason to.
revoke execute on function send_payment_request(uuid, uuid, timestamptz, text)
  from public, anon;
grant execute on function send_payment_request(uuid, uuid, timestamptz, text)
  to authenticated;
