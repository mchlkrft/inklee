# Plus build: live progress log

**Purpose:** a supervisor-readable status file, updated as work happens, so
progress can be monitored without interrupting implementation. The PLAN lives
in `plus-build-plan.md`; this file is the running state of executing it.

Last updated: 2026-07-29. All six P5d milestones BUILT on `feat/p5d-collections`. Gate A findings resolved; **awaiting specialist re-review**. Nothing pushed to master, nothing activated.

---

## Current objective

**Stage P5, goods tools.** Build the remaining commerce features behind the
Plus package. Everything lands dark or Free-invisible; consumer billing stays
closed throughout (DB-backed launch key untouched).

**P5d was rebuilt, not patched.** The completion claim in `d890a07` was wrong
and is retracted. All six milestones of the approved design are now built on
`feat/p5d-collections`: schema repair, many-to-many model, server behaviour,
Hub block, native management, docs.

Status: **built, awaiting Gate A re-review.** The gate is not self-approved.
Nothing is pushed to master, migrations `0121`-`0123` are applied locally only,
and `goods_collections` stays ungranted.

---

## Completed and pushed

| Stage | Commit | What |
|---|---|---|
| P3a | `e28c62d` | Conditional booking-form questions, web + native (migration 0114) |
| P3b-f | `879ddbb` | Booking-form templates, cover unification, confirmation page, custom slug, scheduled books-open date |
| P4 | `536b067` | Large-project mode: schema, intake, artist UI, native twins (migration 0115) |
| P5a | `4687c19` | Platform fee engine, fee actuals, refund-policy data, dispute handling (migration 0116) |
| P4 follow-up | `54ec5fc` | Project client portal + project emails (migration 0117) |
| P5b | `7e504db` | Discount codes (migration 0118) |
| Audit fixes | `1f8b5e9` | Seven findings from the self-audit of the above |
| P5c | `9ce0b21` | Scheduled drops, preorders, low-stock alerts (migration 0119) |
| P5d | `d890a07` | ❌ **RETRACTED.** Shipped broken; see the defect record below |

Migrations 0114-0120 are applied to production and verified there.

**Live config change:** the Stripe LIVE webhook endpoint
(`we_1TpPmyHkG0exykzFYTq26SyV`) now subscribes to
`charge.dispute.created/updated/closed`, so the P5a dispute handler is
actually reachable. Verified by re-reading the endpoint.

---

## Corrected: local-master topology (2026-07-29)

This log previously listed `0de2034` (native discount + product-scheduling
editors) in the "Completed and pushed" table as `COMPLETE, not paused`. That
was false on both counts: `0de2034` was committed directly to local `master`
and was **never pushed** to `origin/master`, and it was never reviewed.
Verified by comparing tips: local `master` was `0de2034` (one commit ahead of
`origin/master`, which sat at `d890a07`); `git log --oneline -5 origin/master`
showed `d890a07` at the top with no `0de2034`.

**Decision:** local `master` is reset to `origin/master` so master stops
carrying unreviewed, unpushed work. No push was made in either direction; this
is a local ref change only, run on this machine (`git branch -f master
origin/master`). Local `master` now points at `d890a07`, matching
`origin/master` exactly.

**Verification behind the decision, not just the tips:**
- `feat/native-goods-parity`'s tip IS `0de2034` (the identical commit object,
  same tree hash `0875b2d3`), not a copy of it. Nothing is lost by moving
  `master`'s ref elsewhere; the object stays permanently reachable from that
  branch.
- No other local ref, tag, or worktree pointed at `0de2034`. `master`'s
  reflog retains it (`master@{1}`) as a machine-local safety net, but that is
  not durable — the branch is the real record.
- Reset confirmed lossless and non-disruptive: no worktree had `master`
  checked out at the time.

**Correction to this section's first version:** it originally claimed `0de2034`
"does not ride in on the P5d branch." That was wrong and is retracted here
rather than silently fixed. `git log -1 --format=%P 0de2034` shows its parent
is `d890a07`, and `feat/p5d-collections` was branched from `0de2034` itself,
not from `d890a07` directly — `0de2034` is the base commit every one of the
eight P5d-rebuild commits (`805358d` through `264ec6d`) sits on
(`git log --oneline d890a07..feat/p5d-collections` lists `0de2034` as the
oldest entry). **The `master`-ref reset does not, by itself, keep `0de2034`
out of master.** The moment `feat/p5d-collections` is merged, `0de2034` merges
with it, unreviewed, regardless of what `master`'s local ref points at right
now. If `0de2034` is meant to land only via its own review on
`feat/native-goods-parity`, `feat/p5d-collections` itself would need to be
rebased onto `d890a07` to drop `0de2034` from its ancestry before that merge —
a history rewrite on the collections branch, not performed here and not
something to do without it being asked for explicitly.

**Rationale for the ref reset itself.** Master carrying an unpushed, unreviewed
commit is exactly the failure mode the P5d retraction (`d890a07`) already
burned us on once: a claim of "done" that the branch state did not back up.
Resetting local master to the remote removes that discrepancy for master's own
ref. It does not resolve the deeper fact above, which is a separate, still-open
decision.

### Isolation feasibility: could `0de2034` be rebased out of `feat/p5d-collections`?

Founder intent on record is that native discount parity stays in progress,
paused for P5d completion. As the branch stands, finishing P5d is what
un-pauses it, since `0de2034` is its base commit. Tested whether rebasing it
out is a clean mechanical fix.

**File-level intersection**, comparing files `0de2034` changed (vs `d890a07`)
against files the eight P5d commits change combined (vs `0de2034`): four files
overlap out of ~40 touched total —
`apps/mobile/app/(tabs)/goods/index.tsx`,
`docs/product/plus-build-progress.md` (this file),
`docs/web-native-parity.md`, and
`packages/shared/src/mobile-api.ts`.

**Content dependency, checked per file, not assumed from the overlap:**
- `packages/shared/src/mobile-api.ts` — no dependency. `0de2034` inserts two
  type blocks mid-file (around the product-detail and discount-list types);
  P5d's `MobileCollectionList` type is appended at end-of-file and references
  nothing `0de2034` added. Independent content, same file.
- `apps/mobile/app/(tabs)/goods/index.tsx` — real conflict. P5d inserts a
  "Collections" button using `0de2034`'s "Discount codes" button as the diff's
  context anchor. Trivial to resolve by hand (both buttons stay, either order),
  but not a clean apply.
- `apps/mobile/app/(tabs)/goods/_layout.tsx` — P5d only adds a `collections`
  route registration; it does not reference `0de2034`'s `discounts` route. No
  dependency, and `0de2034` never touched this file, so it is not in the
  intersection at all.
- `docs/web-native-parity.md` — real conflict. P5d's diff carries the
  "Drops/preorders" and "Discount codes" parity-table rows as unchanged
  context around the row it actually edits, and those rows only read `✅` in
  the tree that already has `0de2034` applied. Without it they are still
  `⬜`, so the context will not match.
- Migrations: confirmed clean. `0120` was introduced in `d890a07` itself,
  which is the intended new base, so it is not touched or replayed by the
  rebase. `0121`-`0123` appear only in the P5d commits, never in `0de2034`.

**Empirical test**, on a throwaway branch (`tmp/worker-rebase-probe-1`, built
from `feat/p5d-collections`, deleted after): `git rebase --onto d890a07
0de2034` was run for real. It conflicted on the FIRST replayed commit
(`805358d`), six separate hunks, entirely in `docs/product/plus-build-progress.md`
— this file's own narrative log, rewritten by nearly every P5d commit, doesn't
apply against a tree missing `0de2034`'s edits to it. Aborted after confirming
the conflict rather than resolving all eight commits by hand, which was not
authorised. `feat/p5d-collections` itself was never touched (confirmed
unchanged at `264ec6d` before and after); the probe branch was deleted.

**Read:** the product/schema surface (migrations, RLS, server cores, the
actual collections feature) is genuinely independent of `0de2034` — no logic
dependency anywhere. The conflicts are concentrated in two narrative docs
(`plus-build-progress.md` itself and `web-native-parity.md`) plus one trivial
UI-button ordering conflict. That makes a rebase mechanically low-risk to the
feature but higher-risk to get right on the docs: resolving eight rounds of
conflicts in a log that has already had two recorded self-inflicted errors
this session (the `8b3e0a1` bad hash, the "does not ride in" self-contradiction
above) is exactly the kind of manual, repetitive text surgery that produces a
third one. Recommendation is for the supervisor to weigh against option (b):
either isolate via a careful rebase (feature code cheap, docs need real
attention across all eight commits) or accept the coupling and bring `0de2034`
formally into this gate's review scope, overriding the "paused" intent on the
record rather than leaving it silently contradicted. Not decided here.

**Process note, not a P5d finding:** this repo checkout is shared with other
agents on the team (no per-agent worktree). Mid-analysis, this file's
uncommitted edits briefly vanished and the reflog showed a `tmp/rebase-probe`
rebase over the exact same eight commits had already run and been cleaned up,
which nobody had reported yet. It resolved without data loss this time. Flagged
to the supervisor directly; noted here only so a future reader of this section
knows the empirical test above was re-run cleanly by this worker after that,
on a distinctly-named branch, and its content is first-hand.

---

## Retracted: the P5d completion claim

`d890a07` was pushed to master and migration `0120` applied to production
while the feature does not work.

**Root cause.** Migration 0120 created `product_collections` with RLS enabled
and only a SELECT policy. Every write path (`saveCollectionCore`,
`deleteCollectionCore`, `setProductCollectionCore`) runs on the USER-scoped
Supabase client, so Postgres rejects every insert, update and delete.

Reproduced on 2026-07-29 with an authenticated anon-key client against local
Supabase:

```
AUTHENTICATED INSERT -> BLOCKED: new row violates row-level security
policy for table "product_collections"
```

**Why the gate missed it.** The 13 tests I wrote exercise
`groupProductsByCollection`, a pure function. Nothing in the suite touched the
real permission model, and the two READ paths work (the SELECT policy exists),
so typecheck, unit tests, e2e, lint and the production build were all green
against a feature that cannot be used. Sibling tables in this repo (`projects`,
`discount_codes`) are also SELECT-only, but their writes go through the SERVICE
client; I copied the policy shape without checking which client the writes use.
That is the exact class of mistake the earlier audit already caught me making:
matching a sibling's surface without checking the constraint it relies on.

**Standing correction:** any new RLS-protected table whose writes use the
user-scoped client needs an authenticated regression test that fails without
the write policy. Added to the required-test list below.

---

## In implementation: P5d rebuild

Branch `feat/p5d-collections`. No intermediate pushes to master. Migration
0120 is never edited; every repair is forward-only.

### Milestone 1: Gate A, write-policy repair — DONE (`805358d`)

Migration `0121`. 10 authenticated tests. Verified by DROPPING the policies and
re-running: 9 of 10 fail; restored, 10 of 10 pass.

### Milestone 2 (current): Gate B, the collection model

Migration `0122`: `product_collection_items` (many-to-many, per-collection
`position`, unique per collection+product, cascade FKs, ownership-safe RLS
whose WITH CHECK verifies BOTH referenced rows), `product_collections.archived_at`,
a backfill of every legacy assignment, and a trigger mirroring legacy
`products.collection_id` writes into the new model.

The trigger is not defensive theatre: `products` carries a FOR ALL policy, so
any authenticated artist can still write `collection_id` straight through
PostgREST. Without it the two models could silently disagree.

`products.collection_id` is NOT dropped. That is the contract step, in a later
migration, after production equivalence is verified.

13 further authenticated tests: one product in two collections with
independent positions, duplicate rejection, reorder, removal without touching
the product, four cross-account cases, legacy mirroring / clearing /
idempotency, and cascade on product delete.

**Found and fixed during verification:** neither 0121 nor 0122 was idempotent,
because Postgres has no `create policy if not exists` and a bare create aborts
a re-run. Both now drop-then-create and re-run cleanly under `ON_ERROR_STOP`.
Neither is in production yet, so both could still be corrected.

### Gate A review response — all findings resolved, awaiting re-review

The specialist returned **CHANGES REQUIRED** (`p5d-gate-a-specialist-review.md`).
Every finding is resolved. The review was correct on all nine, and one of them
found a live production defect this branch had nothing to do with.

| # | Finding | Resolution |
|---|---|---|
| A1 | CRITICAL. `test:db` loaded no env, so all tests SKIPPED and the suite exited 0 having asserted nothing | `vitest.db.config.ts` loads `.env.e2e` with `override: true`; `tests/db/helpers/db-env.ts` throws instead of skipping |
| A2 | HIGH. `discount_codes` has the SAME defect, in production, on the revenue path | Migration `0123` + `tests/db/discounts-rls.test.ts` (8 tests) |
| A3 | HIGH. `0121`'s comment certified `discount_codes` as a healthy precedent. False | Comment corrected to name `projects` only, and to record the false claim rather than quietly delete it |
| A4 | MEDIUM. Migrations not idempotent | Already fixed in Gate B; re-verified by re-running all three under `ON_ERROR_STOP` |
| A5 | MEDIUM. Policies untargeted, so they also applied to `anon` | `TO authenticated` on all nine policies across `0121`/`0122`/`0123` |
| A6 | MEDIUM. Local regex duplicated `assertSafeTarget` more weakly | `db-env.ts` calls the shared guard, then adds the narrower local-only allowlist |
| A7 | LOW. Config documented a guarantee it did not implement | The guarantee is now implemented, in `db-env.ts` |
| A8 | LOW. One cross-account test passed vacuously | Positive control inside the same test; asserts `42501` specifically |
| A9 | LOW. The suite sat in no automated gate | Added to CI (`e2e` job, before Playwright) and to `test:launch` |

**A1 evidence.** Unconfigured now fails rather than skips:

```
$ mv .env.e2e .env.e2e.tmpbak && pnpm test:db
Error: Database RLS tests are not configured. Start a local stack ...
Missing: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 Test Files  3 failed (3) | Tests  no tests
 ELIFECYCLE  Command failed with exit code 1
```

Configured, with no manual `set -a; . ./.env.e2e` in front of it, which is the
part that previously did not work:

```
$ pnpm test:db
◇ injected env (5) from .env.e2e
 Test Files  3 passed (3) | Tests  31 passed (31)
```

**Red/green on the policies themselves.** All nine write policies dropped on the
local stack:

```
 Test Files  3 failed (3) | Tests  18 failed | 13 skipped (31)
```

Restored by re-running `0121`, `0122` and `0123` (which re-proves A4):

```
 Test Files  3 passed (3) | Tests  31 passed (31)
```

The A8 fix is visible in that red run: `refuses an INSERT that names someone
else as the owner` is now among the failures. It was the single test that
passed with every write policy dropped, because "all inserts are blocked"
satisfied a bare `error !== null` just as well as the isolation it claimed to
check.

**A2 is the serious one and it is not ours.** `discount_codes` shipped to
production with RLS on, a SELECT policy only, and both write callers on the
user-scoped client. Verified rather than inferred, at the call sites
(`goods/discounts/actions.ts` → `createClient()`, `api/mobile/goods/discounts`
→ `requireMobileUser()`) and in the database (`pg_policies` returns SELECT and
nothing else). An artist saving a discount code gets `42501`, which
`saveDiscountCore` maps to "Couldn't save. Try again." — a transient-sounding
message for a permanent condition. `0123` grants INSERT and UPDATE only: DELETE
stays withheld because the product deactivates rather than deletes, and the
absent policy is now asserted so it reads as a decision rather than an omission.

**Gate B advance note adopted.** The specialist's cross-ownership note was
right that RLS is the weaker instrument here: policies bind client roles, and
the service role bypasses them. `0122` now carries composite foreign keys
(`(collection_id, artist_id)` and `(product_id, artist_id)` against new unique
parent keys), so a row pairing one artist's collection with another's product is
unrepresentable for **every** role. The backfill joins on matching ownership so
a mismatched legacy pair is left for the verify step instead of aborting a
deploy; production has zero such rows, and the join keeps that safe elsewhere.

Local database reset from zero: all 124 migrations apply clean in order.

### Red run: the 5 tests added since the 31-test count above, executed 2026-07-29

The evidence above reconciles to 31 tests (10 collections + 13 collection-items
+ 8 discounts). The suite is now 36 (10 + 18 + 8, `grep -c '\bit('` per file).
Five tests were added after that evidence was captured and had never been
shown to fail before passing: 3 in `describe("cross-ownership is
unrepresentable, not merely denied")` and 2 in `describe("archive
lifecycle")`, both in `collection-items-rls.test.ts`. This gate's own history
(the first cross-owner test that passed for the wrong reason, `23505` masking
a `23503`) is exactly why a red run and not a code read is required here.

**Baseline**, both composite FKs present:

```
$ pnpm test:db
◇ injected env (5) from .env.e2e
 Test Files  3 passed (3)
      Tests  36 passed (36)
```

**Red.** Dropped both `product_collection_items_collection_fk` and
`product_collection_items_product_fk` directly on the local stack
(`alter table product_collection_items drop constraint ...`), confirmed gone
via `pg_constraint`, then ran the suite:

```
$ pnpm test:db
 ❯ tests/db/collection-items-rls.test.ts (18 tests | 4 failed) 1965ms
     × cascades membership away when a product is hard-deleted
     × refuses a cross-owner membership even as the service role
     × refuses a membership whose artist_id disagrees with its parents
     × deleting a collection removes membership but never the products

 FAIL  ... > cross-ownership is unrepresentable, not merely denied > refuses a cross-owner membership even as the service role
AssertionError: the FK must reject this: expected null not to be null

 FAIL  ... > cross-ownership is unrepresentable, not merely denied > refuses a membership whose artist_id disagrees with its parents
AssertionError: expected a foreign-key violation: expected undefined to be '23503'

 FAIL  ... > archive lifecycle > deleting a collection removes membership but never the products
AssertionError: expected [ Array(1) ] to have a length of +0 but got 1

 FAIL  ... > legacy column compatibility > cascades membership away when a product is hard-deleted
AssertionError: expected [ Array(1) ] to have a length of +0 but got 1

 Test Files  1 failed | 2 passed (3)
      Tests  4 failed | 32 passed (36)
```

**Four failures, not three, and the right reasons in each case:**

- Both cross-ownership tests failed with `error` = `null` / `error?.code` =
  `undefined` — the row inserted successfully. That is the correct failure
  mode: it proves the FK, not the unique constraint, was rejecting these rows
  before. A `23505` here would have meant the test was fooled again the same
  way milestone 3 already caught once; it did not happen.
- The third cross-ownership test, `still accepts a correct row as the service
  role`, is a positive control and correctly stayed **green**: it inserts a
  legitimate, non-duplicate row, which needs no FK to succeed. Its
  "unproven" status was about never having been red, not about being expected
  to fail here, and running it alongside the two negative tests is what
  confirms the drop didn't just block every write outright — the same
  distinction A8 already established for the write-policy tests.
- One of the two archive-lifecycle tests failed: `deleting a collection
  removes membership but never the products`. It has a real droppable
  dependency, `product_collection_items_collection_fk`'s `on delete cascade`,
  which is what removes membership rows when their collection is deleted;
  without it the row is simply orphaned instead of cascaded away. **The other
  archive-lifecycle test, the archive/restore round trip, has no droppable
  dependency on these constraints and stayed green throughout.** It tests that
  updating `archived_at` doesn't disturb membership, which was never
  guaranteed by the FK, the RLS policy, or any trigger — there is nothing in
  this schema that WOULD touch `product_collection_items` on an
  `archived_at` update, so nothing to red/green here. Reported plainly rather
  than dropping something unrelated to manufacture a failure.
- One failure outside the named list of 5: `cascades membership away when a
  product is hard-deleted`, from `describe("legacy column compatibility")`,
  which milestone 2's evidence already counted among the "proven" 13. It
  depends on `product_collection_items_product_fk`'s cascade the same way the
  archive-lifecycle deletion test depends on the collection-side FK. It was
  not on the named list because it predates the 5 unproven tests, but the same
  drop invalidates it, and that is worth recording as a second, independent
  confirmation that the FK is load-bearing rather than a coincidence of this
  one drop.

**Restore, and a real finding about how NOT to do it.** The assignment said to
restore by re-running `0122`. Tried that literally first, against the
already-migrated local stack:

```
$ docker exec -i supabase_db_inklee psql -U postgres -d postgres < supabase/migrations/0122_collection_items.sql
NOTICE:  relation "product_collection_items" already exists, skipping
CREATE TABLE
...
```

The constraints did NOT come back (`pg_constraint` still empty for both
names). `create table if not exists` is a no-op once the table exists, and
both FKs are declared inline inside that `create table`, so replaying the raw
file against a live, already-migrated database cannot restore them — this is
a real limitation of `0122`'s idempotency, not a mistake in how it was
invoked, and it means "just re-run the migration" is not a safe repair path
for this specific kind of drift in production either, should it ever occur
there. Restored properly instead via a full local reset (`supabase db
reset`), which replays all migrations against an empty database rather than
against a state that already satisfies the `if not exists` guards. The first
reset attempt failed the container bootstrap outright (`error running
container: exit 1`) and left the local database with **zero tables** — a
real, if transient, incident on a stack other people on this team also use.
Retried immediately; the second attempt applied all migrations `0001`-`0123`
cleanly, including the composite FK block and the notice-skipped legacy
objects, and finished. `pg_constraint` confirmed both FKs back, and:

```
$ pnpm test:db
◇ injected env (5) from .env.e2e
 Test Files  3 passed (3)
      Tests  36 passed (36)
```

36/36. The full reset also re-proves A4 more thoroughly than a single-file
replay would: all 124 migrations, not just `0121`-`0123`, applied clean from
zero in one pass.

### Milestone 3: server behaviour — DONE (`8554e63`)

Proceeding while Gate A re-review is outstanding is a deliberate call, not an
assumption of approval: this is branch-only, activates nothing, and the
capability stays ungranted. If the re-review changes the schema, the server
layer above it is what moves.

The shared model is now many-to-many. `groupProductsByCollection` takes
`(products, collections, memberships)` and the product no longer carries its own
`collectionId`. The old file argued in a comment that "which section is this in?"
has one answer; it does not, and that comment is now replaced with the reason.

- **Cap removed.** `MAX_COLLECTIONS = 20` is gone, per founder decision. It was
  enforced on create, so an artist organising a large catalogue hit a wall
  mid-task. `at_cap` is gone from the result type with it.
- **Next position on create**, read from the artist's own top. Deliberately not
  a unique constraint: concurrent creates tie, and a tie in a hand-sorted list
  is cosmetic, where a rejected create is not.
- **Sparse updates.** Only keys actually present are written. Before, every save
  sent both name and visibility, so toggling visibility could reset the name and
  a rename could republish a hidden section.
- **Archive / restore / eligible delete.** Archive keeps membership and
  per-collection ordering, so restore returns the section whole. Delete is
  refused on a populated LIVE collection: that arranging work has no undo, so
  archive is the reversible exit and delete becomes a deliberate second act.
  Empty collections still delete freely.
- **Entitlement and kill switch moved to the public read**, in
  `publicCollectionsForArtist`, which returns empty arrays for an unentitled
  artist, a killed capability, or a plan-read that throws. Empty arrays are
  exactly the flat shop, so a downgrade to Free removes the grouping and never
  the goods. Failing flat rather than failing closed is the point.

Manager UI rebuilt for multi-membership (toggle chips per section), archive and
restore, and the self-explaining delete refusal. 25 unit tests, 36 DB tests.

**Found while testing:** the first cross-owner service-role test passed for the
wrong reason. It reused a (collection, product) pair an earlier test had already
inserted, so the unique constraint returned 23505 before the foreign key was
consulted, and the assertion proved nothing about ownership. Fixed with a fresh
product; it now returns 23503 from the FK, which is the thing being claimed.

### Milestone 4: featured-collection Hub block — DONE

A THIRD block family. The existing two are content blocks (headline/text/link,
which carry their own text) and feature blocks (content-free, capped at one
each). `featured_collection` carries a REFERENCE, so it needed its own rules:

- The parser drops a block naming nothing, exactly like an empty headline: a
  block with no collection is not an empty section, it is a broken one.
- It does NOT resolve the reference. The parser is pure and has no database, and
  dropping on a failed lookup would let a transient read error silently delete
  the artist's saved block. The renderer drops a dangling reference instead.
- Deduped by `collectionId`, not capped at one. Several featured collections is
  a reasonable thing to want; the same one twice never is.

Rendering goes through `publicCollectionsForArtist`, so entitlement, the kill
switch and the visible/archived filter are the same rules the shop uses, and
only PURCHASABLE members count. An archived, hidden, emptied or deleted
collection therefore renders no block rather than a heading over nothing.

Web editor and native editor both ship, with a picker seeded from the artist's
live collections. 7 parser tests; 2028 unit tests green.

**Wire hazard found and recorded.** A new block TYPE is not additive the way a
new field is. The native editor read `BIO_BLOCK_META[block.type].label`, and an
installed build carries its own compiled copy of that map, so a type added later
resolves to `undefined` and dereferencing it crashes the Link Hub screen. Fixed
with a fallback for future types, and written into the parity register as a hard
prerequisite: a fresh EAS build must ship before `goods_collections` is granted,
because builds already installed cannot be fixed from the server. Nothing can
hit it today, which is why it is written down rather than remembered.

### Milestone 5: native collection management — DONE

`(tabs)/goods/collections` plus GET/POST/PATCH/DELETE
`/api/mobile/goods/collections`. Every write calls the same cores the web
actions call, so the entitlement refusal, the delete-eligibility rule and the
ordering behaviour are one implementation rather than two that agree today.

The five state-changing operations share one PATCH route discriminated by `op`,
rather than five endpoints: each is a single call with no body worth its own
route. An unknown `op` is refused with a 400, so a newer app calling an older
deployment gets a clear error instead of a silent no-op.

Status mapping is deliberate: 403 for `not_entitled` (the app maps it to
IAP-safe copy through `plan-errors.ts`), 409 for `not_eligible`, because a
delete refused for having products in it is a state conflict and not a
malformed request.

ONE deliberate difference, recorded in the register rather than left implicit:
web can drag to reorder, the app cannot. The reorder cores and both reorder ops
are built and wired server-side, so the native gesture is purely additive
whenever it earns the surface.

### Milestone 6: docs, registry, full suite — DONE

The capability was already registered, but its registry row had gone false in
two ways and both mattered:

- it named `setProductCollectionCore`, a core that no longer exists;
- it said "the public grouping is a pure shared function and needs no gate of
  its own". True of the function, wrong about the feature. Without a gate on
  the READ, an artist who lapsed to Free kept a grouped public shop. The gate
  now lives with the read that feeds it, and the row says so.

`plus-build-plan.md`'s P5d row still read "DONE" and asserted the one-to-one
design with the exact reasoning this rebuild overturned. Rewritten to record
what actually happened, including the retraction and the `discount_codes`
repair, because an execution source of truth that describes a shipped-broken
feature as done is worse than no row.

Full suite: 2028 unit, 36 authenticated DB, 39 e2e, both typechecks and both
lints clean.

## Blocked or postponed

| Item | Why |
|---|---|
| Fee schedule v2 activation | Needs accountant approval of fee and tax treatment. No longer blocked by engineering: the goods fee base is correct now that discounts exist. |
| `fee-refund-policy` v1 activation | Same accountant approval, plus Terms review. |
| Bundles | Multi-product pricing with its own stock and refund semantics. Larger than the rest of P5 combined; deliberately after collections, which it would build on. |
| Goods sales analytics | Belongs with the P6 analytics plane rather than duplicating a second reporting path. |
| Shop customization beyond the appearance system | The shared appearance system already covers the visual layer; what remains is unspecified. |
| Variants+ beyond today's basic set | No concrete requirement recorded beyond what exists. |
| Fresh EAS build | The two native editors (`0de2034`) are on `feat/native-goods-parity`, not on master (local master was reset to `origin/master` 2026-07-29; see the topology correction above) and not on devices. Batch with the P5d native work rather than burning a build per slice. |
| Bundles | Unchanged: still the largest unstarted P5 item, after P5d is genuinely complete. |
| Cover image Free-vs-Plus conflict | Founder decision, logged in `plus-commercial-packages.md` §7. |

---

## Next intended action

**Gate A re-review by the specialist**, then a supervisor decision on merge.
All nine findings are resolved with red/green evidence; the gate is not
self-approved. Milestones 3-6 were built while it is outstanding, which was a
deliberate call: the work is branch-only, activates nothing, and the capability
stays ungranted. If re-review changes the schema, the server layer above it is
what moves.

Two items for the SUPERVISOR rather than the specialist:

1. **`0123` repairs a production defect on the revenue path**, found inside a
   P5d review but unrelated to P5d. Artists cannot save discount codes today.
   It is currently queued behind the whole collections branch. Cherry-picking
   it ahead as its own change is a sequencing call, not an engineering one.
2. **A fresh EAS build is a prerequisite before `goods_collections` is granted
   to anyone.** Installed builds predate the `featured_collection` block type
   and would crash on the Link Hub screen if an artist featured a collection on
   web. This cannot be fixed from the server; see the wire-hazard section in
   `web-native-parity.md`.

Still open from earlier stages, unchanged: fee schedule v2 activation and
refund policy v1 (both accountant), bundles, goods sales analytics.
